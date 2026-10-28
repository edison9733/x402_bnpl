/**
 * The pay-later credit limit, line for line with
 * `programs/tessera-paylater/src/credit.rs`.
 *
 *   limit = tierLimit[tier] x score / 1000 x (1 + boost)
 *   boost = min(boostBps, maxBoost)
 *
 * where each on-time repayment adds `boostOf(amount, tier at open)` to the
 * line's `boostBps`: `stepBps` scaled by the loan's size next to the tier
 * limit, so a loan the size of the limit adds a whole step and a tiny one
 * adds next to nothing.
 */
import type { CreditLine } from './generated/accounts/creditLine.js';
import type { LineParams } from './generated/types/lineParams.js';

const BPS = 10_000n;
const U64_MAX = 0xffff_ffff_ffff_ffffn;
const min = (a: bigint, b: bigint) => (a < b ? a : b);

export type LimitLine = Pick<CreditLine, 'defaults' | 'boostBps' | 'outstanding'>;

/** A wallet that has never borrowed has no line yet: this is its blank one. */
export const NO_LINE: LimitLine = { defaults: 0, boostBps: 0, outstanding: 0n };

export function limit(line: LimitLine, p: LineParams, tier: number, score: number): bigint {
  if (line.defaults > 0) return 0n;
  const base = (p.tierLimit[Math.min(tier, 3)]! * BigInt(Math.min(score, 1000))) / 1000n;
  const boost = min(BigInt(line.boostBps), BigInt(p.maxBoostBps));
  return min((base * (BPS + boost)) / BPS, U64_MAX);
}

export function available(line: LimitLine, p: LineParams, tier: number, score: number): bigint {
  const l = limit(line, p, tier, score);
  return l > line.outstanding ? l - line.outstanding : 0n;
}

/**
 * What one on-time repayment of `amount` adds to the line's `boostBps`, in
 * bps: `stepBps` scaled by the loan's size next to the limit of the tier the
 * buyer had when the loan opened, at most one whole step.
 */
export function boostOf(amount: bigint, tier: number, p: LineParams): number {
  const tierLimit = p.tierLimit[Math.min(tier, 3)]!;
  if (tierLimit === 0n) return 0;
  return Number((min(amount, tierLimit) * BigInt(p.stepBps)) / tierLimit);
}

/** The pool's charge on a purchase, owed by the buyer on top of the price. */
export const feeOf = (amount: bigint, p: LineParams): bigint => (amount * BigInt(p.feeBps)) / BPS;

/**
 * The rules `npm run paylater:local` runs under, in test USDC, with a term
 * short enough for a whole cycle to be watched. The website shows limits
 * under these, labelled as a preview, only on a network where it finds no
 * pool.
 */
export const PREVIEW_LINE_PARAMS: LineParams = {
  tierLimit: [0n, 2_000_000n, 5_000_000n, 10_000_000n],
  stepBps: 2_500,
  maxBoostBps: 10_000,
  termSecs: 60,
  graceSecs: 5,
  feeBps: 200,
  minMerchantTier: 1,
  minLoan: 1_000n,
};

/**
 * The rules of the devnet pool (`GNf8LpVeJ6ayrVMqABpU1nAHW9ZX7upC2aGqcumWF5Qq`,
 * created 27 October 2026 by `npm run setup:paylater`), in devnet USDC: the
 * preview's limits, step, boost cap, fee, merchant tier and minimum, with a
 * 600 s term and a 60 s grace period, long enough to record a purchase and
 * its repayment and short enough to show a default. The site and the agents
 * read the rules from the pool account, not from here.
 */
export const DEVNET_LINE_PARAMS: LineParams = {
  tierLimit: [0n, 2_000_000n, 5_000_000n, 10_000_000n],
  stepBps: 2_500,
  maxBoostBps: 10_000,
  termSecs: 600,
  graceSecs: 60,
  feeBps: 200,
  minMerchantTier: 1,
  minLoan: 1_000n,
};
