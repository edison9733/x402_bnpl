/**
 * Pay later over x402, the merchant's side. A merchant whose network has the
 * pay-later pool adds a `tessera-paylater` entry to its 402: same order, same
 * price, and the pool pays. The buyer answers with a `buy_now` it has signed
 * and the merchant's ops wallet as fee payer; the merchant checks it, signs
 * and sends it, and when it lands the pool has paid the order's vault and the
 * escrow has confirmed the order (the program calls `confirm_funded` itself),
 * so from there the order is delivered like any other.
 *
 * The merchant is its own facilitator here. What it risks is the network fee,
 * so it signs nothing but one `buy_now` for its own order (checked in the
 * SDK, `paylater.checkBuyNowTransaction`), and simulates first.
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
import { fromUnits, paylater, score, TIER_NAMES, type Config } from '@tessera/sdk';
import { read, readAgent, send, sendSigned, vaultBalance, type Actor } from './chain.js';
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

const sol = (lamports: bigint) => (Number(lamports) / 1e9).toFixed(4);

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
    // line: a wallet holding only USDC cannot buy on credit until it has that much SOL.
    const [held, rent] = await Promise.all([read(async () => (await m.ops.rpc.getBalance(q.buyer).send()).value), paylater.buyNowRent(m.ops.rpc, buyer.hasLine)]);
    if (held < rent) {
      reason = `the buyer holds ${sol(held)} SOL, less than the ${sol(rent)} SOL of rent for its loan account${buyer.hasLine ? '' : ' and its credit line'}`;
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
  const hint = /insufficient lamports|insufficient funds for rent/i.test(`${text} ${tail}`) ? '; the buyer pays the rent of its loan account in SOL, and the merchant the network fee' : '';
  return `the simulation failed (${text})${tail ? `: ${tail}` : ''}${hint}`;
};

export type Settled = { response: SettleResponse; loan: Address; signature: string; verifyMs: number; settleMs: number };

/**
 * Settle a `tessera-paylater` payment: check the buyer's transaction against
 * this order, sign it as fee payer, simulate, send and wait for it to land.
 * Nothing is sent unless every check and the simulation pass, and a first
 * broadcast the RPC's preflight refuses was not forwarded either, so each of
 * those is a `PaymentRefused` and the buyer may try another way.
 */
export async function settlePayLater(ops: Actor, payment: PaymentPayload, terms: EscrowTerms): Promise<Settled> {
  const t0 = Date.now();
  const transaction = (payment.payload as { transaction?: unknown }).transaction;
  if (typeof transaction !== 'string') throw new PaymentRefused('payment does not match: a tessera-paylater payment carries payload.transaction, the buyer\'s signed buy_now');
  let checked: Awaited<ReturnType<typeof paylater.checkBuyNowTransaction>>;
  try {
    checked = await paylater.checkBuyNowTransaction(transaction, {
      order: terms.order,
      vault: terms.vault,
      buyer: terms.buyer,
      merchant: terms.merchant,
      mint: terms.mint,
      feePayer: ops.identity.address,
    });
  } catch (e) {
    if (e instanceof paylater.BuyNowTransactionError) throw new PaymentRefused(`payment does not match: ${e.message}`);
    throw e;
  }
  const signed = await signTransaction([ops.identity.keyPair], checked.tx);
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
