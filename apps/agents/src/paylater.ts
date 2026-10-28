/**
 * Pay later over x402, the merchant's side. A merchant whose network has the
 * pay-later pool adds a `tessera-paylater` entry to its 402: same order, same
 * price, and the pool pays. The buyer answers with a `buy_now` it has signed
 * and the merchant's ops wallet as fee payer; the merchant checks it, signs
 * it twice (with the ops wallet, as fee payer, and with the merchant's own
 * key, which `buy_now` requires so the pool only funds orders their merchant
 * agreed to) and sends it. When it lands the pool has paid the order's vault
 * and the escrow has confirmed the order (the program calls `confirm_funded`
 * itself), so from there the order is delivered like any other.
 *
 * The merchant is its own facilitator here. Two of its keys sign, so it signs
 * nothing but one `buy_now` for its own order at its own quoted price and
 * request (checked in the SDK, `paylater.checkBuyNowTransaction`; the program
 * then requires the order to carry that price and request): no other
 * instruction can ride along on those signatures, and what it risks is the
 * network fee. It simulates first. A buyer can still make a signed buy_now
 * fail after the simulation (by cancelling its order in a race), which costs
 * the merchant that fee; a wallet whose purchases keep failing that way is
 * not offered credit for an hour.
 */
import {
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  isSolanaError,
  signTransaction,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  type Address,
} from '@solana/kit';
import type { PaymentPayload, PaymentRequirements, SettleResponse } from '@x402/core/types';
import { fromHex, fromUnits, paylater, score, TIER_NAMES, type Config } from '@tessera/sdk';
import { read, readAgent, send, sendSigned, TransactionFailed, vaultBalance, type Actor } from './chain.js';
import { config } from './config.js';
import type { EscrowTerms } from './merchant.js';
import { chainNow } from '../../../scripts/lib.js';

/** A payment that was refused before anything was sent: the client may quote again and pay another way. */
export class PaymentRefused extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'PaymentRefused';
  }
}

const sol = (lamports: bigint, dp = 4) => (Number(lamports) / 1e9).toFixed(dp);

/**
 * buy_now transactions that this server signed and that then failed on-chain,
 * by buyer, over the last hour. Each cost the ops wallet its fee and the buyer
 * nothing it would miss, so past `MAX_FAILED_LANDINGS` the buyer is not
 * offered credit again until the hour is up.
 */
const failedLandings = new Map<string, number[]>();
const MAX_FAILED_LANDINGS = 3;
function recentFailures(buyer: string): number {
  const kept = (failedLandings.get(buyer) ?? []).filter((t) => t > Date.now() - 3_600_000);
  if (kept.length) failedLandings.set(buyer, kept);
  else failedLandings.delete(buyer);
  return kept.length;
}
const tooManyFailures = 'this wallet\'s last purchases on credit failed on-chain after the merchant signed them; pay with exact, or try credit again in an hour';

export type PoolInfo = { pool: Address; params: paylater.LineParams; mint: Address; vault: Address; liquidity: bigint };

/** The pool on this network. Read at most every 20 s, by everyone who quotes; a network with no pool is remembered as such too. */
let poolCache: { at: number; value: Promise<PoolInfo | null> } | undefined;
const POOL_TTL_MS = 20_000;

export function poolInfo(actor: Actor): Promise<PoolInfo | null> {
  if (!poolCache || Date.now() - poolCache.at > POOL_TTL_MS) {
    const value = (async (): Promise<PoolInfo | null> => {
      const pool = await paylater.poolPda();
      const found = await read(() => paylater.fetchMaybePool(actor.rpc, pool));
      if (!found.exists) return null;
      const vault = await paylater.poolVault(found.data.mint);
      return { pool, params: found.data.params, mint: found.data.mint, vault, liquidity: await vaultBalance(actor, vault) };
    })();
    const mine = { at: Date.now(), value };
    poolCache = mine;
    // a failed read is not kept
    value.catch(() => {
      if (poolCache === mine) poolCache = undefined;
    });
  }
  return poolCache.value;
}

/** A wallet's pay-later numbers, as the program computes them: live tier and score, and its line. */
export async function creditOf(actor: Actor, wallet: Address, p: paylater.LineParams, cfg: Config, now: bigint) {
  const [agent, line] = await Promise.all([readAgent(actor, wallet), read(async () => paylater.fetchMaybeCreditLine(actor.rpc, await paylater.linePdaOf(wallet)))]);
  const e = agent ? score.evaluate(agent, cfg.params, now) : undefined;
  const l = line.exists ? line.data : paylater.NO_LINE;
  const tier = e?.tier ?? 0;
  const sc = e?.score ?? 0;
  return { tier, score: sc, limit: paylater.limit(l, p, tier, sc), outstanding: l.outstanding, defaults: l.defaults, hasLine: line.exists };
}

/**
 * The pay-later entry of a 402 for one quoted order, or null when this network
 * has no pool. `eligible` says whether the program would fund it right now;
 * the buyer can still try, and the program has the last word.
 */
export async function payLaterOption(
  m: { ops: Actor; wallet: Address },
  q: { buyer: Address; order: Address; amount: bigint; mint: Address },
  cfg: Config,
): Promise<{ requirement: PaymentRequirements; offer: paylater.PayLaterOffer } | null> {
  const pool = await poolInfo(m.ops);
  if (!pool || pool.mint !== q.mint) return null;
  const now = await chainNow(m.ops);
  const [buyer, merchant] = await Promise.all([creditOf(m.ops, q.buyer, pool.params, cfg, now), creditOf(m.ops, m.wallet, pool.params, cfg, now)]);
  const available = buyer.limit > buyer.outstanding ? buyer.limit - buyer.outstanding : 0n;
  let reason =
    buyer.defaults > 0
      ? 'the buyer\'s line is frozen by a default'
      : recentFailures(q.buyer) >= MAX_FAILED_LANDINGS
        ? tooManyFailures
        : buyer.limit === 0n
        ? `the buyer has no credit yet (${TIER_NAMES[buyer.tier]}, score ${buyer.score})`
        : q.amount > available
          ? `the price is above the buyer's remaining credit (${fromUnits(available)} USDC)`
          : q.amount < pool.params.minLoan
            ? `the price is below the smallest purchase the pool finances (${fromUnits(pool.params.minLoan)} USDC)`
            : merchant.tier < pool.params.minMerchantTier
              ? `the pool only funds merchants at ${TIER_NAMES[pool.params.minMerchantTier]} or above`
              : q.amount > pool.liquidity
                ? 'the pool cannot cover the price right now'
                : undefined;
  if (!reason) {
    // The buyer pays the rent of its loan account and, the first time, its
    // line: a wallet holding only USDC cannot buy on credit until it has that
    // much SOL. And the runtime refuses to leave a wallet with some SOL but
    // less than its own rent-exempt minimum, so it needs exactly the rent, or
    // the rent plus that minimum.
    const [held, rent, keep] = await Promise.all([
      read(async () => (await m.ops.rpc.getBalance(q.buyer).send()).value),
      paylater.buyNowRent(m.ops.rpc, buyer.hasLine),
      read(() => m.ops.rpc.getMinimumBalanceForRentExemption(0n).send()),
    ]);
    const what = `rent for its loan account${buyer.hasLine ? '' : ' and its credit line'}`;
    if (held < rent) {
      reason = `the buyer holds ${sol(held)} SOL, less than the ${sol(rent, 8)} SOL of ${what}`;
    } else if (held > rent && held - rent < keep) {
      reason = `the buyer holds ${sol(held, 8)} SOL: after the ${sol(rent, 8)} SOL of ${what} it would keep less than a wallet's rent-exempt minimum (${sol(keep, 8)} SOL), which the runtime refuses; hold exactly the rent, or at least ${sol(rent + keep, 8)} SOL`;
    }
  }
  const offer: paylater.PayLaterOffer = {
    program: paylater.TESSERA_PAYLATER_PROGRAM_ADDRESS,
    pool: pool.pool,
    feePayer: m.ops.identity.address,
    buyerLimit: buyer.limit.toString(),
    buyerOutstanding: buyer.outstanding.toString(),
    fee: paylater.feeOf(q.amount, pool.params).toString(),
    termSecs: pool.params.termSecs,
    eligible: reason === undefined,
    ...(reason ? { reason } : {}),
  };
  const requirement: PaymentRequirements = {
    scheme: paylater.X402_SCHEME,
    network: config.network as PaymentRequirements['network'],
    asset: q.mint,
    amount: q.amount.toString(),
    payTo: q.order,
    maxTimeoutSeconds: 120,
    extra: { ...offer },
  };
  return { requirement, offer };
}

/**
 * What the program said when it refused, out of the simulation logs: the
 * Anchor error code when there is one, otherwise the runtime's own error and
 * the last log lines, so a buyer short of SOL for rent, or a merchant whose
 * ops wallet is empty, is told so rather than "the simulation failed".
 */
const programError = (err: unknown, logs: readonly string[] | null | undefined): string => {
  for (const l of logs ?? []) {
    const m = /Error Code: (\w+)/.exec(l);
    if (m) return m[1]!;
  }
  const text = typeof err === 'string' ? err : JSON.stringify(err, (_, v) => (typeof v === 'bigint' ? Number(v) : v));
  const tail = (logs ?? []).slice(-3).join(' | ');
  const hint = /insufficient ?lamports|insufficient ?funds ?for ?rent/i.test(`${text} ${tail}`) ? '; the buyer pays the rent of its loan account in SOL, and the merchant the network fee' : '';
  return `the simulation failed (${text})${tail ? `: ${tail}` : ''}${hint}`;
};

export type Settled = { response: SettleResponse; loan: Address; signature: string; verifyMs: number; settleMs: number };

/**
 * Settle a `tessera-paylater` payment: check the buyer's transaction against
 * this order and its quoted price and request, sign it as fee payer (`ops`)
 * and as the order's merchant (`merchant`, the key of the merchant agent that
 * quoted it), simulate, send and wait for it to land. Nothing is signed
 * unless every check passes, and only for an order of the merchant whose key
 * is passed in. Nothing is sent unless the simulation passes too, and a first
 * broadcast the RPC's preflight refuses was not forwarded either; a buy_now
 * that landed and failed changed nothing but the fee. Each of those is a
 * `PaymentRefused`, and the buyer may try another way.
 */
export async function settlePayLater(ops: Actor, merchant: Actor, payment: PaymentPayload, terms: EscrowTerms): Promise<Settled> {
  const t0 = Date.now();
  const transaction = (payment.payload as { transaction?: unknown }).transaction;
  if (typeof transaction !== 'string') throw new PaymentRefused('payment does not match: a tessera-paylater payment carries payload.transaction, the buyer\'s signed buy_now');
  // The merchant's key signs only its own orders.
  if (terms.merchant !== merchant.identity.address) throw new PaymentRefused('payment does not match: this order is not this merchant\'s');
  if (recentFailures(terms.buyer) >= MAX_FAILED_LANDINGS) throw new PaymentRefused(tooManyFailures);
  let checked: Awaited<ReturnType<typeof paylater.checkBuyNowTransaction>>;
  try {
    checked = await paylater.checkBuyNowTransaction(transaction, {
      order: terms.order,
      vault: terms.vault,
      buyer: terms.buyer,
      merchant: terms.merchant,
      mint: terms.mint,
      feePayer: ops.identity.address,
      amount: BigInt(terms.amount),
      requestHash: fromHex(terms.requestHash),
    });
  } catch (e) {
    if (e instanceof paylater.BuyNowTransactionError) throw new PaymentRefused(`payment does not match: ${e.message}`);
    throw e;
  }
  // Every check has passed: the ops wallet signs as fee payer, the merchant as
  // the order's merchant (once, when the merchant is its own fee payer).
  const keys = merchant.identity.address === ops.identity.address ? [ops.identity.keyPair] : [ops.identity.keyPair, merchant.identity.keyPair];
  const signed = await signTransaction(keys, checked.tx);
  const wire = getBase64EncodedWireTransaction(signed);
  const signature = getSignatureFromTransaction(signed);
  const sim = await read(() => ops.rpc.simulateTransaction(wire, { encoding: 'base64', commitment: 'confirmed' }).send());
  if (sim.value.err) throw new PaymentRefused(`the pay-later program refused the purchase: ${programError(sim.value.err, sim.value.logs)}`);
  const t1 = Date.now();
  const landed = async () => (await read(() => paylater.fetchMaybeLoan(ops.rpc, checked.loan))).exists;
  try {
    await sendSigned(ops, wire, signature, landed);
  } catch (e) {
    // The RPC's preflight ran the transaction again and refused it (the
    // buyer's line changed between the simulation and the send): nothing was
    // forwarded to the network. `sendSigned` has already checked it did not land.
    if (isSolanaError(e, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE)) {
      throw new PaymentRefused(`the pay-later program refused the purchase: ${programError(e.cause ?? e.message, (e.context as { logs?: string[] }).logs)}`);
    }
    // It landed and failed (the order changed between the simulation and the
    // send). Atomic: nothing was paid and no loan opened, so the buyer may pay
    // another way; the merchant paid the fee, and counts it against the buyer.
    if (e instanceof TransactionFailed) {
      failedLandings.set(terms.buyer, [...(failedLandings.get(terms.buyer) ?? []), Date.now()]);
      console.warn(`[paylater] ${terms.buyer.slice(0, 8)}: a signed buy_now failed on-chain (${recentFailures(terms.buyer)} in the last hour)`);
      throw new PaymentRefused(`the purchase on credit failed on-chain and nothing was paid: ${e.message}`);
    }
    throw e;
  }
  return {
    response: { success: true, transaction: signature, network: config.network as SettleResponse['network'], payer: terms.buyer },
    loan: checked.loan,
    signature,
    verifyMs: t1 - t0,
    settleMs: Date.now() - t1,
  };
}

/**
 * The keeper: loans of the pool past their due date and grace period are
 * marked in default. `mark_default` is permissionless, so any wallet with SOL
 * could run this; the demo server does. At most `max` per pass, and loans
 * that keep failing are left to `skip`.
 */
export async function markOverdue(ops: Actor, skip: (loan: string) => boolean, onFail: (loan: string, e: unknown) => void, max = 20): Promise<number> {
  const pool = await poolInfo(ops);
  if (!pool) return 0;
  const now = await chainNow(ops);
  const open = await read(() => paylater.fetchOpenLoans(ops.rpc));
  let marked = 0;
  for (const { address: loan, data } of open) {
    if (marked >= max) break;
    if (now <= data.defaultAfter || skip(loan)) continue;
    try {
      await send(ops, [await paylater.getMarkDefaultInstructionAsync({ loan, line: await paylater.linePdaOf(data.buyer) })], async () => {
        const l = await paylater.fetchMaybeLoan(ops.rpc, loan);
        return l.exists && l.data.state !== paylater.LoanState.Open;
      });
      console.log(`[keeper] marked loan ${loan.slice(0, 8)} of ${data.buyer.slice(0, 8)} in default: ${fromUnits(paylater.owedOf(data))} USDC owed, ${now - data.dueAt} s past due`);
      marked += 1;
    } catch (e) {
      onFail(loan, e);
    }
  }
  return marked;
}
