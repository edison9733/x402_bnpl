/**
 * The Tessera score, mirrored from `programs/tessera/src/score.rs`.
 *
 * Every input is public account state and every step is integer maths, so
 * this returns exactly what the program stores. That is the point: nobody has
 * to trust a server (or this website) for a wallet's score.
 *
 *   score    = 1000 x Evidence x Rating x Behaviour
 *   Evidence = 0.45 History + 0.30 Tenure + 0.25 Diversity
 */
import type { Params } from './generated/types/params.js';

/** Share of a settled order that counts, by the counterparty's tier (percent). */
export const TIER_WEIGHT = [10n, 40n, 80n, 100n] as const;

export const W_HISTORY = 450n;
export const W_TENURE = 300n;
export const W_DIVERSITY = 250n;
export const AGE_PER_ACTIVE = 3n;
export const PRIOR_MILLI_STARS = 3_000n;
export const RATING_FLOOR_MILLI = 1_500n;
export const RATING_SPAN_MILLI = 3_000n;
const BPS = 10_000n;

/** The fields of an Agent account the score depends on. */
export type ScoreAgent = {
  registeredAt: bigint;
  credit: bigint;
  counterpartyPoints: number;
  activePeriods: number;
  feesPaid: bigint;
  penaltyBps: number;
  penaltyPeriod: bigint;
  ratingSum: bigint;
  ratingWeight: bigint;
};

export type Evaluation = {
  /** Thousandths, 0..1000. */
  history: number;
  tenure: number;
  diversity: number;
  evidence: number;
  rating: number;
  /** Basis points, 0..10000. */
  behaviour: number;
  score: number;
  tier: 0 | 1 | 2 | 3;
};

const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);
const satSub = (a: bigint, b: bigint) => (a > b ? a - b : 0n);

/** Floor of the square root, by Newton's method from an upper bound. */
export function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  const bits = BigInt(n.toString(2).length);
  let x = 1n << ((bits + 1n) / 2n);
  for (;;) {
    const y = (x + n / x) / 2n;
    if (y >= x) return x;
    x = y;
  }
}

export function periodOf(now: bigint, p: Params): bigint {
  return max(now, 0n) / max(BigInt(p.periodSecs), 1n);
}

/** The penalty still standing at `now`: it decays every period. */
export function currentPenalty(a: ScoreAgent, p: Params, now: bigint): bigint {
  const elapsed = satSub(periodOf(now, p), a.penaltyPeriod);
  return satSub(BigInt(a.penaltyBps), elapsed * BigInt(p.penaltyDecayBps));
}

export function evaluate(a: ScoreAgent, p: Params, nowSeconds: bigint | number): Evaluation {
  const now = BigInt(nowSeconds);

  const history =
    p.creditFull === 0n ? 1000n : min(isqrt((a.credit * 1_000_000n) / p.creditFull), 1000n);

  const agePeriods = max(now - a.registeredAt, 0n) / max(BigInt(p.periodSecs), 1n);
  const effective = min(agePeriods, BigInt(a.activePeriods) * AGE_PER_ACTIVE);
  const tenure =
    p.tenureFull === 0 ? 1000n : min((effective * 1000n) / BigInt(p.tenureFull), 1000n);

  const diversity =
    p.diversityFull === 0
      ? 1000n
      : min((BigInt(a.counterpartyPoints) * 1000n) / BigInt(p.diversityFull), 1000n);

  const evidence = (W_HISTORY * history + W_TENURE * tenure + W_DIVERSITY * diversity) / 1000n;

  const denom = p.reviewPrior + a.ratingWeight;
  const avgMilli =
    denom === 0n
      ? PRIOR_MILLI_STARS
      : (p.reviewPrior * PRIOR_MILLI_STARS + a.ratingSum * 1000n) / denom;
  const rating = min((satSub(avgMilli, RATING_FLOOR_MILLI) * 1000n) / RATING_SPAN_MILLI, 1000n);

  const behaviour = satSub(BPS, currentPenalty(a, p, now));

  const score = (evidence * rating * behaviour) / (1000n * BPS);

  // A tier needs the score and the time. Trusted also needs a clean record:
  // while any penalty is still standing, a wallet cannot settle instantly.
  let tier = 0;
  for (let i = 0; i < 3; i += 1) {
    const clean = i < 2 || behaviour === BPS;
    if (score >= BigInt(p.tierScore[i]!) && a.activePeriods >= p.tierPeriods[i]! && clean) tier = i + 1;
    else break;
  }

  return {
    history: Number(history),
    tenure: Number(tenure),
    diversity: Number(diversity),
    evidence: Number(evidence),
    rating: Number(rating),
    behaviour: Number(behaviour),
    score: Number(score),
    tier: tier as 0 | 1 | 2 | 3,
  };
}

/** Volume-weighted average rating in stars, shrunk toward the 3-star prior. */
export function averageStars(a: Pick<ScoreAgent, 'ratingSum' | 'ratingWeight'>, p: Params): number {
  const denom = p.reviewPrior + a.ratingWeight;
  if (denom === 0n) return 3;
  return Number((p.reviewPrior * PRIOR_MILLI_STARS + a.ratingSum * 1000n) / denom) / 1000;
}

/** Hold the program applies to an order between these two tiers. */
export function holdFor(
  p: Params,
  merchantTier: number,
  buyerTier: number,
  pairTrusted = false,
): number {
  const buyerEffective = pairTrusted ? 3 : buyerTier;
  return Math.max(p.holdSecs[merchantTier]!, p.holdSecs[buyerEffective]!);
}

/** Instant-settled volume a merchant may carry that buyers have not accepted yet. */
export function instantLimit(a: Pick<ScoreAgent, 'feesPaid'>, p: Params): bigint {
  return p.instantBase + (a.feesPaid * BigInt(p.instantFeePct)) / 100n;
}

export type FarmingCost = {
  /** Sybil wallets the attacker has to run. */
  wallets: number;
  /** Volume that must be pushed through escrow. */
  volume: bigint;
  /** Protocol fees burned doing it. */
  fees: bigint;
  /** Capital x time locked in holds, in token-unit-seconds. */
  lockedUnitSeconds: bigint;
  /** Active periods the attack has to last at minimum. */
  minPeriods: number;
  /** Instant settlement the attacker can then take before buyers complain. */
  instantLimit: bigint;
};

/**
 * What it costs a ring of brand-new wallets to push one merchant's History to
 * `targetHistory` (thousandths). Every wallet in the ring is New, so each
 * counts for 10% and is capped at the pair cap; every order between them
 * waits out the New hold. This is the cheapest version of the attack: buying
 * better-rated counterparties costs more, not less.
 */
export function farmingCost(p: Params, feeBps: number, targetHistory = 1000): FarmingCost {
  const q = TIER_WEIGHT[0];
  const target = BigInt(targetHistory);
  // credit needed: history = isqrt(credit * 1e6 / creditFull)
  const credit = (target * target * p.creditFull + 999_999n) / 1_000_000n;
  const perWallet = (p.pairCap * q) / 100n;
  const wallets = Number((credit + perWallet - 1n) / perWallet);
  const volume = BigInt(wallets) * p.pairCap;
  const fees = (volume * BigInt(feeBps)) / BPS;
  return {
    wallets,
    volume,
    fees,
    lockedUnitSeconds: volume * BigInt(p.holdSecs[0]!),
    minPeriods: p.tierPeriods[2]!,
    instantLimit: p.instantBase + (fees * BigInt(p.instantFeePct)) / 100n,
  };
}

// ---------------------------------------------------------------- breakdown

export type Factor = {
  /** 0..1 in thousandths, as `evaluate` gives it. */
  milli: number;
  /** The real inputs behind the value: `√(800 ÷ 10000)`, `48 ÷ 90`, `4.14 stars`, `no penalty`. */
  explain: string;
};

/** A score, factor by factor, with every input it came from: what `tessera score` prints and the score page shows. */
export type Breakdown = {
  e: Evaluation;
  history: Factor;
  tenure: Factor;
  diversity: Factor;
  rating: Factor;
  behaviour: Factor;
  /** `0.45 × 0.282 + 0.30 × 0.533 + 0.25 × 0.240`: each factor in the thousandths the program holds. */
  evidence: string;
  /**
   * `1000 × 0.346 × 0.880 × 1.0000`: evidence and rating in thousandths,
   * behaviour in ten-thousandths, so the product floors to the score exactly
   * as `programs/tessera/src/score.rs` does.
   */
  score: string;
  /** Standing penalty in basis points, after decay. */
  penaltyBps: number;
  /** Volume-weighted stars, shrunk toward the prior. */
  stars: number;
  /** Periods counted toward Tenure: the smaller of age and three per active period. */
  effectivePeriods: number;
  /** The hold of the wallet's own tier, in seconds. */
  holdSecs: number;
};

/** Thousandths as `0.28`. */
export const milli2 = (n: number): string => (n / 1000).toFixed(2);
/** Basis points as `1.00`. */
export const bps2 = (n: number): string => (n / 10_000).toFixed(2);
/** Thousandths in full, as `0.282`. */
export const milli3 = (n: number): string => (n / 1000).toFixed(3);
/** Basis points in full, as `1.0000`. */
export const bps4 = (n: number): string => (n / 10_000).toFixed(4);

/**
 * Credit and the credit ceiling in the words the page uses: whole dollars
 * when the ceiling is at least $1,000 (mainnet), otherwise cents (devnet).
 */
export function creditText(units: bigint, p: Pick<Params, 'creditFull'>): string {
  if (p.creditFull >= 1_000n * 1_000_000n) return String(units / 1_000_000n);
  const whole = units / 1_000_000n;
  const cents = ((units % 1_000_000n) / 10_000n).toString().padStart(2, '0');
  return `${whole}.${cents}`;
}

export function breakdown(a: ScoreAgent, p: Params, nowSeconds: bigint | number): Breakdown {
  const now = BigInt(nowSeconds);
  const e = evaluate(a, p, now);
  const agePeriods = max(now - a.registeredAt, 0n) / max(BigInt(p.periodSecs), 1n);
  const effective = Number(min(agePeriods, BigInt(a.activePeriods) * AGE_PER_ACTIVE));
  const penalty = Number(currentPenalty(a, p, now));
  const stars = averageStars(a, p);
  const points = (n: number) => (n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(1));
  const pct = (bps: number) => (bps % 100 === 0 ? String(bps / 100) : (bps / 100).toFixed(2).replace(/0$/, ''));
  return {
    e,
    history: { milli: e.history, explain: `√(${creditText(a.credit, p)} ÷ ${creditText(p.creditFull, p)})` },
    tenure: { milli: e.tenure, explain: `${effective} ÷ ${p.tenureFull}` },
    diversity: { milli: e.diversity, explain: `${points(a.counterpartyPoints)} ÷ ${points(p.diversityFull)}` },
    rating: { milli: e.rating, explain: `${stars.toFixed(2)} stars` },
    behaviour: { milli: e.behaviour / 10, explain: penalty ? `${pct(penalty)}% standing penalty` : 'no penalty' },
    evidence: `0.45 × ${milli3(e.history)} + 0.30 × ${milli3(e.tenure)} + 0.25 × ${milli3(e.diversity)}`,
    score: `1000 × ${milli3(e.evidence)} × ${milli3(e.rating)} × ${bps4(e.behaviour)}`,
    penaltyBps: penalty,
    stars,
    effectivePeriods: effective,
    holdSecs: p.holdSecs[e.tier]!,
  };
}
