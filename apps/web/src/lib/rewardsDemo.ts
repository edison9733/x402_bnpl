/**
 * The review-reward rebate, as recorded by `npm run demo:rewards`: real
 * purchases, reviews, a merchant that then failed, and the payout, on a local
 * validator running the real program. Nothing here is made up.
 */
import { rewards } from '@tessera/sdk';
import demo from '../../../../deployments/rewards-demo.json';

export type RewardRow = { reviewer: string; subject: string; rating: number; weight: string; base: string; label: string; bps: number; reward: string; why: string };

export const rows = demo.rows as RewardRow[];
export const story = demo.story as { buyer: string; merchant: string; rating: number; comment: string }[];
export const fees = demo.fees;
export const estimate = demo.estimate as { buyer: string; merchant: string; amount: string; rating: number; reward: { atOneTimes: { usdc: string }; upTo: { usdc: string } } };
export const afterwards = demo.afterwards;
export const recordedAt = demo.recordedAt.slice(0, 10);
export const reproduce = demo.reproduce;
export const comment = (reviewer: string, subject: string) => story.find((s) => s.buyer === reviewer && s.merchant === subject)?.comment ?? '';
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What each verdict pays, as a multiplier, and the short reason the score page and the CLI print. */
export const times = (bps: number) => {
  const n = bps / 10_000;
  return `${Number.isInteger(n) ? n : n.toFixed(n * 10 === Math.round(n * 10) ? 1 : 2)}×`;
};
export const LABELS: Record<string, { x: string; short: string; tone: 'good' | 'bad' | 'plain' }> = Object.fromEntries(
  Object.entries(rewards.ACCURACY_SHORT).map(([label, v]) => [label, { x: times(rewards.ACCURACY_BPS[label as keyof typeof rewards.ACCURACY_BPS]), short: v.reason, tone: v.tone }]),
);
