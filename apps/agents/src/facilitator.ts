/**
 * x402 facilitators, with failover.
 *
 * A facilitator verifies a signed payment and submits it to the chain, paying
 * the network fee, so a buyer holding only USDC can pay. It cannot move the
 * money anywhere else: the buyer's signature fixes the recipient, amount and
 * mint. The worst it can do is refuse, which is why there is a second one.
 */
import { HTTPFacilitatorClient } from '@x402/core/server';
import type { PaymentPayload, PaymentRequirements, SettleResponse } from '@x402/core/types';
import { config } from './config.js';
import { PaymentRefused } from './paylater.js';

type Known = { url: string; client: HTTPFacilitatorClient; feePayer: string };

/**
 * What the facilitators said, and when. A facilitator can go down or change
 * the fee payer it advertises, so the list is asked for again every few
 * minutes, and within seconds while none was reachable.
 */
let known: { at: number; list: Known[] } | undefined;
let probing: Promise<Known[]> | undefined;
const FRESH_MS = 5 * 60_000;
const RETRY_EMPTY_MS = 15_000;
const PROBE_MS = 10_000;

/** A facilitator that never answers must not hold up quoting. */
function within<T>(ms: number, p: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer in ${ms / 1000} s`)), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/**
 * Coinbase's CDP facilitator, the most used one. It needs an API key, which
 * only the operator can create, so it is used when `CDP_API_KEY_ID` and
 * `CDP_API_KEY_SECRET` are set and skipped otherwise. This path has not been
 * exercised with a real key: see the README.
 */
async function cdp(): Promise<{ url: string; client: HTTPFacilitatorClient } | null> {
  const id = process.env.CDP_API_KEY_ID;
  const secret = process.env.CDP_API_KEY_SECRET;
  if (!id || !secret) return null;
  try {
    const { createFacilitatorConfig } = await import('@coinbase/x402');
    const cfg = createFacilitatorConfig(id, secret);
    return { url: cfg.url ?? 'https://api.cdp.coinbase.com', client: new HTTPFacilitatorClient(cfg) };
  } catch (e) {
    console.warn(`[x402] CDP keys are set but @coinbase/x402 could not be loaded (${(e as Error).message.slice(0, 80)}). Run: npm i @coinbase/x402 -w @tessera/agents`);
    return null;
  }
}

async function probe(): Promise<Known[]> {
  const first = await cdp();
  const candidates = [...(first ? [first] : []), ...config.facilitators.map((url) => ({ url, client: new HTTPFacilitatorClient({ url }) }))];
  // All at once, in order of preference: one slow facilitator does not hold up the others.
  const found = await Promise.all(
    candidates.map(async ({ url, client }): Promise<Known | null> => {
      try {
        const supported = await within(PROBE_MS, client.getSupported());
        const kind = supported.kinds.find(
          (k) => k.x402Version === 2 && k.scheme === 'exact' && k.network === config.network,
        );
        const feePayer = kind?.extra?.feePayer;
        if (typeof feePayer === 'string') return { url, client, feePayer };
        console.warn(`[x402] ${url} does not offer exact on ${config.network}`);
      } catch (e) {
        console.warn(`[x402] ${url} is unreachable: ${(e as Error).message}`);
      }
      return null;
    }),
  );
  return found.filter((k): k is Known => k !== null);
}

function refresh(): Promise<Known[]> {
  probing ??= probe()
    .then((list) => {
      known = { at: Date.now(), list };
      return list;
    })
    .finally(() => {
      probing = undefined;
    });
  return probing;
}

/** The reachable facilitators. A stale list answers at once while a fresh one is fetched; an empty one is not served stale. */
export async function facilitators(): Promise<Known[]> {
  if (!known) return refresh();
  const age = Date.now() - known.at;
  // With none reachable there is nothing to serve a stale list from: ask again.
  if (!known.list.length && age > RETRY_EMPTY_MS) return refresh();
  if (age > FRESH_MS) void refresh().catch(() => undefined);
  return known.list;
}

export type Settled = { response: SettleResponse; facilitator: string; verifyMs: number; settleMs: number };

/**
 * A settlement the facilitator reported as failed. Its transaction may still
 * land (a "settlement_pending" one often does), so it is not a refusal: the
 * client is told not to pay again, and gets the facilitator's answer as its
 * PAYMENT-RESPONSE.
 */
export class SettlementFailed extends Error {
  constructor(public readonly response: SettleResponse) {
    super(`settlement failed: ${response.errorReason ?? 'unknown'} ${response.errorMessage ?? ''}`.trim());
    this.name = 'SettlementFailed';
  }
}

/**
 * A payment the facilitator did not settle, whose blockhash has since expired
 * with the order's vault still short: it can never land, nothing was paid, and
 * the client may pay again (through another facilitator, say).
 */
export class PaymentExpired extends PaymentRefused {
  constructor(detail: string) {
    super(detail);
    this.name = 'PaymentExpired';
  }
}

/**
 * Verify, then settle. The payment names one facilitator as fee payer, so it
 * goes to that one; a quote for another facilitator is a fresh quote.
 *
 * Verifying sends nothing, so every failure up to and including it is a
 * PaymentRefused: the client may pay again or another way. From the settle
 * call on, the payment may have been sent, and a failure is not a refusal.
 */
export async function verifyAndSettle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<Settled> {
  const feePayer = requirements.extra?.feePayer;
  const all = await facilitators();
  if (!all.length) throw new PaymentRefused('no x402 facilitator is reachable, so the payment was not sent; try again later or pay another way');
  const f = all.find((k) => k.feePayer === feePayer) ?? (feePayer === undefined ? all[0] : undefined);
  if (!f) throw new PaymentRefused(`the facilitator this payment names as fee payer (${String(feePayer)}) is not reachable now, so the payment was not sent; ask for a new quote`);

  const t0 = Date.now();
  const verified = await f.client.verify(payload, requirements).catch((e: unknown) => {
    throw new PaymentRefused(`the facilitator could not verify the payment, so it was not sent: ${e instanceof Error ? e.message : String(e)}`);
  });
  if (!verified.isValid) {
    // The facilitator may have moved to another fee payer: ask it again for the next quote.
    if (/fee_payer/.test(verified.invalidReason ?? '')) void refresh().catch(() => undefined);
    throw new PaymentRefused(`payment rejected by facilitator: ${verified.invalidReason ?? 'unknown'} ${verified.invalidMessage ?? ''}`.trim());
  }
  const t1 = Date.now();
  // A failed settlement may come back as success: false, or (on an HTTP error
  // status) as the client's SettleError carrying the same fields.
  const response = await f.client.settle(payload, requirements).catch((e: unknown) => {
    const s = e as Partial<SettleResponse> & { statusCode?: unknown };
    if (typeof s?.statusCode === 'number' && typeof s.network === 'string') {
      throw new SettlementFailed({ success: false, errorReason: s.errorReason, errorMessage: s.errorMessage, payer: s.payer, transaction: s.transaction ?? '', network: s.network });
    }
    throw e;
  });
  if (!response.success) throw new SettlementFailed(response);
  return { response, facilitator: f.url, verifyMs: t1 - t0, settleMs: Date.now() - t1 };
}
