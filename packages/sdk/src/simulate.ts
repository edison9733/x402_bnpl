/**
 * A wallet described the way a person would, turned into the account the
 * program would hold, and scored with the program's own arithmetic. The
 * score page's simulator and `tessera score --simulate` both run this, so
 * the page, the CLI and the program share one implementation.
 */
import { MAINNET_TARGET_PARAMS } from './constants.js';
import type { Params } from './generated/types/params.js';
import { averageStars, evaluate, instantLimit, TIER_WEIGHT, type Evaluation, type ScoreAgent } from './score.js';

export type Wallet = {
  /** Total sales, in token base units (USDC has six decimals). */
  sales: bigint;
  /** Distinct buyers the sales were spread across. */
  buyers: number;
  /** The tier those buyers were in when they bought. */
  buyerTier: 0 | 1 | 2 | 3;
  /** Periods (days on mainnet, minutes on devnet) in which the wallet actually traded. */
  activePeriods: number;
  /**
   * Average stars its buyers gave. 0 means no reviews, and then the sales earn
   * no evidence at all: the program grants a merchant credit, Diversity and an
   * active period only when the buyer reviews the order.
   */
  stars: number;
  /** Disputes lost recently. */
  disputesLost: number;
};

export type Outcome = {
  /** The account as the program would hold it. */
  agent: ScoreAgent;
  /** The chain time the account is scored at. */
  now: bigint;
  e: Evaluation;
  /** Sales that count as evidence, after the buyer's tier and the per-buyer cap. None until buyers review. */
  counted: bigint;
  /** Stars after blending with the 3-star prior. */
  shownStars: number;
  instantLimit: bigint;
};

const USDC = 1_000_000n;

/**
 * Sales are spread evenly across buyers; each buyer counts for its tier's
 * share and only up to the per-buyer cap, exactly as the program grants
 * credit and review weight. As in the program, a sale earns the merchant
 * evidence (credit, Diversity and an active period) only once its buyer has
 * reviewed it, so with no reviews, no sales or no buyers there is none.
 */
export function simulate(w: Wallet, p: Params = MAINNET_TARGET_PARAMS): Outcome {
  const period = BigInt(p.periodSecs);
  const now = 1_000_000n * period;
  const pct = TIER_WEIGHT[w.buyerTier];
  const buyers = BigInt(w.buyers);
  const perBuyer = buyers > 0n ? w.sales / buyers : 0n;
  const reviewed = w.stars > 0;
  const earns = reviewed && w.sales > 0n && buyers > 0n;
  // Each buyer counts up to the cap; spread evenly, that is the smaller of all sales and buyers x cap.
  const capped = buyers * p.pairCap;
  const counted = earns ? ((w.sales < capped ? w.sales : capped) * pct) / 100n : 0n;
  // A buyer adds Diversity once it has bought a tenth of the cap.
  const points = earns && perBuyer >= p.pairCap / 10n ? w.buyers * Number(pct) : 0;
  // A period only counts as active when a reviewed sale settles in it: idle days earn nothing.
  const active = earns ? w.activePeriods : 0;
  const tenths = BigInt(Math.round(w.stars * 10));
  const agent: ScoreAgent = {
    registeredAt: now - period * BigInt(active * 3),
    credit: counted,
    counterpartyPoints: points,
    activePeriods: active,
    feesPaid: w.sales / 100n,
    penaltyBps: Math.min(10_000, w.disputesLost * p.penaltyDisputeBps),
    penaltyPeriod: now / period,
    ratingSum: reviewed ? (counted * tenths) / 10n : 0n,
    ratingWeight: reviewed ? counted : 0n,
  };
  return { agent, now, e: evaluate(agent, p, now), counted, shownStars: averageStars(agent, p), instantLimit: instantLimit(agent, p) };
}

/** The values the page's steppers and chips move through, at mainnet scale. Sales are whole dollars. */
export const STEPS = {
  sales: [0, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000],
  buyers: [0, 1, 2, 3, 5, 8, 12, 20, 40, 80],
  active: [0, 1, 3, 7, 16, 30, 60, 120],
  stars: [1, 2, 3, 4, 4.5, 5],
  disputes: [0, 1, 2, 3],
} as const;

export type Preset = { id: string; name: string; w: Wallet };

/** Five wallets to start from, at mainnet scale. Their scores are what `simulate` gives: see packages/sdk/test/score.test.ts. */
export const PRESETS: readonly Preset[] = [
  { id: 'brand-new', name: 'Brand new', w: { sales: 0n, buyers: 0, buyerTier: 1, activePeriods: 0, stars: 0, disputesLost: 0 } },
  { id: 'small-honest-shop', name: 'Small honest shop', w: { sales: 2_000n * USDC, buyers: 12, buyerTier: 1, activePeriods: 16, stars: 4.5, disputesLost: 0 } },
  { id: 'busy-and-well-reviewed', name: 'Busy and well reviewed', w: { sales: 20_000n * USDC, buyers: 40, buyerTier: 3, activePeriods: 60, stars: 5, disputesLost: 0 } },
  { id: 'same-lost-a-dispute', name: 'Same, lost a dispute', w: { sales: 20_000n * USDC, buyers: 40, buyerTier: 3, activePeriods: 60, stars: 5, disputesLost: 1 } },
  { id: 'sells-to-itself', name: 'Sells to itself', w: { sales: 20_000n * USDC, buyers: 5, buyerTier: 0, activePeriods: 60, stars: 5, disputesLost: 0 } },
];

export const presetById = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id);
