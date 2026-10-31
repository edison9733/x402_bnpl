/**
 * Buying with the owner's approval, for an agent that holds no key. `ask` has
 * a merchant open an escrow order in the owner's name, checks that order
 * on-chain, and prints a link to the website's approval page, where the
 * owner's own wallet pays it. `collect` waits for that payment, collects the
 * delivery with the claim only the asker was given, and checks it against the
 * hash the merchant committed on-chain. Nothing here signs anything.
 *
 *   tessera ask <merchant agent url> <skill> --owner WALLET [--input JSON] [--site URL] [--wait]
 *   tessera collect <merchant agent url> <order> --claim CLAIM
 *
 * The order is opened through the merchant server's checkout API
 * (`/api/orders`, the one the website's market uses), because that is where
 * a quote comes with a claim: the order address is public, and the claim is
 * what proves the delivery is the asker's to collect.
 */
import { address, createSolanaRpc, type Address } from '@solana/kit';
import {
  approvalLink,
  configPda,
  fetchMaybeConfig,
  fetchMaybeOrder,
  fromHex,
  fromUnits,
  hashJson,
  bytesEqual,
  OrderState,
  OrderVerificationError,
  toHex,
  verifyOrderForPayment,
  walletBrowseLinks,
} from '@tessera/sdk';
import { readClock, TESSERA_EXTENSION_URI } from './paylater.js';

export const ASK_COMMANDS = new Set(['ask', 'collect']);

export const ASK_HELP = `Ask your owner to pay (no key on this machine; reads the chain itself)
  ask <merchant agent url> <skill> --owner WALLET [--input JSON] [--site URL] [--wait]
                                                 the merchant opens an escrow order in the owner's name; prints a
                                                 link the owner opens to approve and pay it from their own wallet,
                                                 and the claim that collects the delivery (--wait: collect it too)
  collect <merchant agent url> <order> --claim CLAIM
                                                 wait for the owner's payment, collect the delivery and check it
                                                 against the hash the merchant committed on-chain`;

/** The public website, which serves the approval page. */
const PUBLIC_SITE = 'https://agentic-commerce-two-theta.vercel.app';
const LOCAL_SITE = 'http://localhost:5173';

type Opts = {
  rpcUrl: string;
  owner?: string;
  claim?: string;
  site?: string;
  input?: unknown;
  minHoldSecs?: number;
  wait: boolean;
  json: boolean;
  /** The CLI's URL check: https, or http to this machine. */
  endpoint: (url: string, what: string) => string;
  die: (m: string) => never;
};

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const usdc = (u: bigint) => `${fromUnits(u)} USDC`;
const mmss = (secs: number) => `${Math.floor(Math.max(0, secs) / 60)}:${String(Math.floor(Math.max(0, secs) % 60)).padStart(2, '0')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isLocal = (url: string) => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);

export async function askCommands(cmd: string, a1: string | undefined, a2: string | undefined, o: Opts): Promise<void> {
  const rpc = createSolanaRpc(o.rpcUrl);
  const addr = (v: string | undefined, what: string): Address => {
    if (!v) o.die(`${what} is required (see: tessera help)`);
    try {
      return address(v);
    } catch {
      return o.die(`${what} is not a Solana address: ${v}`);
    }
  };

  // A merchant agent's URL is <server>/agents/<id>; its card's own URL is accepted too.
  if (!a1) o.die(`${cmd} needs a <merchant agent url> (see: tessera help)`);
  const base = o.endpoint(a1, '<merchant agent url>').replace(/\/\.well-known\/agent-card\.json$/, '').replace(/\/$/, '');
  const parts = /^(.*)\/agents\/([^/?#]+)$/.exec(base);
  if (!parts) o.die(`${base} is not a Tessera merchant agent URL (<server>/agents/<id>)`);
  const [, server, merchantId] = parts as unknown as [string, string, string];

  const call = async (url: string, body?: unknown, timeoutMs = 30_000) => {
    let res: Response;
    try {
      res = await fetch(url, {
        ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      return o.die(`${new URL(url).host} is unreachable (${(e as Error).message})`);
    }
    return { res, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };

  // Everything on the command line is checked before anything is fetched.
  const collecting = cmd === 'collect' ? { order: addr(a2, '<order>'), claim: o.claim ?? o.die('collect needs --claim (printed by tessera ask)') } : undefined;
  const skill = collecting ? '' : (a2 ?? o.die('ask <merchant agent url> needs a <skill> (see: tessera help)'));
  const ownerArg = collecting ? undefined : addr(o.owner, '--owner');
  const input = o.input ?? {};
  if (typeof input !== 'object' || input === null || Array.isArray(input)) o.die('--input must be a JSON object');

  const cfg = await fetchMaybeConfig(rpc, await configPda());
  if (!cfg.exists) o.die(`no Tessera config on ${o.rpcUrl}`);
  const params = cfg.data.params;
  const chainNow = async () => Number((await readClock(rpc)) ?? o.die('the RPC has no clock'));

  if (collecting) return collect(collecting.order, collecting.claim);

  // ------------------------------------------------------------------ ask
  const owner = ownerArg ?? o.die('--owner is required (see: tessera help)');

  // 0. The most the owner is asked to pay: what the merchant's card advertises for the skill.
  const { body: card } = await call(`${base}/.well-known/agent-card.json`);
  const ext = ((card.capabilities as { extensions?: { uri: string; params?: Record<string, unknown> }[] } | undefined)?.extensions ?? []).find((e) => e.uri === TESSERA_EXTENSION_URI);
  const advertised = BigInt(String(((ext?.params?.prices ?? {}) as Record<string, string>)[skill] ?? '0'));
  if (!ext || advertised === 0n) o.die(`${base} does not advertise a price for ${skill} on its agent card`);
  const merchantWallet = addr(String(ext.params?.wallet ?? ''), 'the merchant wallet on the agent card');

  // 1. The quote: an order opened in the owner's name, and the claim that collects its delivery.
  const quote = await call(`${server}/api/orders`, { merchant: merchantId, sku: skill, input, buyer: owner, ...(o.minHoldSecs ? { minHoldSecs: o.minHoldSecs } : {}) }, 60_000);
  if (!quote.res.ok) o.die(`the merchant would not open an order (${quote.res.status}): ${String(quote.body.error ?? 'failed')}`);
  const terms = quote.body.terms as { orderId: string; order: string; amount: string; holdSecs: number } | undefined;
  const claim = quote.body.claim;
  if (!terms || typeof claim !== 'string') o.die('the merchant answered without an order or a claim');
  const amount = BigInt(terms.amount);
  if (amount > advertised) o.die(`refusing: the order asks ${usdc(amount)}, more than the ${usdc(advertised)} the card advertises`);

  // 2. The order, from the chain: in the owner's name, from this merchant, for this request, at the address quoted.
  let verified: Awaited<ReturnType<typeof verifyOrderForPayment>> | undefined;
  for (let i = 0; !verified; i += 1) {
    try {
      verified = await verifyOrderForPayment(rpc, {
        orderId: fromHex(terms.orderId),
        buyer: owner,
        merchant: merchantWallet,
        amount,
        mint: cfg.data.mint,
        payTo: addr(terms.order, 'the order in the quote'),
        requestHash: await hashJson({ sku: skill, input }),
      });
    } catch (e) {
      if (e instanceof OrderVerificationError && /does not exist/.test(e.message) && i < 8) await sleep(600);
      else o.die(e instanceof OrderVerificationError ? e.message : `cannot read the chain at ${new URL(o.rpcUrl).host}: ${(e as Error).message}`);
    }
  }

  const site = o.endpoint(o.site ?? process.env.TESSERA_SITE_URL ?? (isLocal(server) ? LOCAL_SITE : PUBLIC_SITE), o.site ? '--site' : 'the approval site');
  const link = approvalLink(site, verified.order, { sku: skill, input });
  const phone = walletBrowseLinks(link);
  const payBy = Number(verified.data.createdAt) + params.unpaidSecs;
  const left = payBy - (await chainNow());
  const next = `tessera collect ${base} ${verified.order} --claim ${claim}`;

  if (o.json) {
    // With --wait, a second object follows once the delivery is collected.
    console.log(
      JSON.stringify({ order: verified.order, owner, merchant: merchantWallet, amount: amount.toString(), holdSecs: verified.data.holdSecs, payBy, approveUrl: link, phantom: phone.phantom, solflare: phone.solflare, claim, collect: next }, null, 2),
    );
  } else {
    console.log(`order    ${short(verified.order)} verified on-chain: ${usdc(amount)} to ${merchantId} (${short(merchantWallet)}), in the name of ${short(owner)}, for your request`);
    console.log(`         held ${verified.data.holdSecs} s after delivery; the owner has ${mmss(left)} to pay`);
    console.log(`approve  ${link}`);
    console.log(`phone    ${phone.phantom}`);
    console.log(`claim    ${claim}  (collects the delivery; keep it to yourself)`);
    if (!o.wait) console.log(`next     ${next}`);
  }
  if (o.wait) return collect(verified.order, claim);

  // -------------------------------------------------------------- collect
  async function collect(order: Address, claim: string): Promise<void> {
    // Wait for the owner's payment: the order leaves AwaitingPayment once its vault is funded and confirmed.
    let said = false;
    for (;;) {
      const found = await fetchMaybeOrder(rpc, order);
      if (!found.exists) o.die(`no escrow order at ${order}`);
      const d = found.data;
      if (d.state === OrderState.Cancelled) o.die(`order ${short(order)} was cancelled before it was paid; nothing was charged`);
      if (d.state !== OrderState.AwaitingPayment) break;
      const left = Number(d.createdAt) + params.unpaidSecs - (await chainNow());
      if (left < -10) o.die(`the owner did not pay within the payment window; the quote expires and nothing was charged. Ask again for a new link`);
      if (!said && !o.json) console.log(`waiting  for the owner to approve and pay (${mmss(left)} left)…`);
      said = true;
      await sleep(2000);
    }
    if (!o.json) console.log(`paid     the order is funded; collecting the delivery`);

    const f = await call(`${server}/api/orders/${order}/fulfil`, { claim }, 120_000);
    const why = String(f.body.error ?? 'failed');
    if (f.res.status === 403) o.die(`the merchant refused this claim (${why}): only the claim printed by tessera ask collects this order's delivery`);
    if (f.res.status === 404) o.die(`the merchant has no quote for order ${short(order)} (${why}); check the merchant agent URL`);
    if (!f.res.ok) o.die(`the merchant did not deliver (${f.res.status}): ${why}. The money is safe in escrow: an order not delivered by its deadline is refunded to the owner`);
    const after = await fetchMaybeOrder(rpc, order);
    if (!after.exists) o.die(`no escrow order at ${order}`);
    const matches = bytesEqual(await hashJson(f.body.deliverable), after.data.deliveryHash);
    const releaseAt = Number(after.data.releaseAt);
    if (o.json) {
      return void console.log(
        JSON.stringify({ order, state: OrderState[after.data.state], deliverable: f.body.deliverable, deliveryHash: toHex(after.data.deliveryHash), matches, instant: after.data.instant, releaseAt }, null, 2),
      );
    }
    console.log(`result   ${JSON.stringify(f.body.deliverable).slice(0, 600)}`);
    console.log(matches ? 'check    sha256 of what was received equals the hash the merchant committed on-chain' : 'check    what was received does NOT match the hash on-chain: the owner should dispute it on the approval page');
    console.log(
      after.data.instant
        ? 'escrow   settled at once: this merchant and owner qualify for instant settlement'
        : `escrow   held until ${new Date(releaseAt * 1000).toISOString()}; until then the owner can dispute on the approval page`,
    );
    if (!matches) process.exitCode = 1;
  }
}
