/**
 * The guarantees docs/SCORING.md and docs/SECURITY.md state, as tests.
 * These run on the same arithmetic the program uses (see scripts/test-local.ts
 * for the proof that model and program agree).
 *
 *   npm run test:formula
 */
import { test } from 'node:test';
import { address } from '@solana/kit';
import assert from 'node:assert/strict';
import { DEVNET_PARAMS, MAINNET_TARGET_PARAMS, PROTOCOL_FEE_BPS } from '../src/constants.js';
import { establishedAgent, exitScamBound, simulateHonestMerchant, simulateRing } from '../src/attacks.js';
import * as model from '../src/model.js';
import { breakdown, evaluate, farmingCost, holdFor, instantLimit, isqrt } from '../src/score.js';
import { PRESETS, simulate, STEPS } from '../src/simulate.js';
import { newOrderId } from '../src/util.js';
import { OrderVerificationError, verifyOrderForPayment } from '../src/verify.js';
import { guarantee } from './guarantee.js';

const P = MAINNET_TARGET_PARAMS;
const USDC = 1_000_000n;
const DAY = 86_400n;
const T0 = 1_000_000n * DAY;

test('isqrt is the exact floor of the square root', () => {
  for (const n of [0n, 1n, 2n, 3n, 4n, 15n, 16n, 17n, 999_999n, 1_000_000n, 2n ** 64n - 1n, 10n ** 30n]) {
    const r = isqrt(n);
    assert.ok(r * r <= n && (r + 1n) * (r + 1n) > n, String(n));
  }
});

guarantee('a wallet nobody knows scores 0, is New, and waits the longest hold', 'formula', [], () => {
  const a = model.newAgent(T0);
  const e = evaluate(a, P, T0 + 400n * DAY);
  assert.deepEqual([e.score, e.tier], [0, 0]);
  assert.equal(holdFor(P, 0, 0), P.holdSecs[0]);
});

guarantee('age alone earns nothing: a wallet left idle for a year has no tenure', 'formula', [], () => {
  const a = model.newAgent(T0);
  assert.equal(evaluate(a, P, T0 + 365n * DAY).tenure, 0);
});

guarantee('time cannot be bought in a burst: full evidence in one day is still not Trusted', 'formula', [], () => {
  const a = model.newAgent(T0);
  a.credit = P.creditFull;
  a.counterpartyPoints = P.diversityFull;
  a.ratingWeight = 1_000_000n * USDC;
  a.ratingSum = a.ratingWeight * 5n;
  a.activePeriods = 1;
  const e = evaluate(a, P, T0 + DAY);
  assert.equal(e.history, 1000);
  assert.equal(e.diversity, 1000);
  assert.ok(e.tier < 3, `tier ${e.tier}`);
  assert.equal(e.tier, 0, 'one active period does not even reach Building');
});

guarantee('quality multiplies: one-star reviews sink any amount of history', 'formula', [], () => {
  const a = establishedAgent(P, 3, T0);
  assert.equal(evaluate(a, P, T0).tier, 3);
  a.ratingSum = a.ratingWeight * 1n;
  assert.equal(evaluate(a, P, T0).score, 0);
});

test('no reviews yet means half marks, not full marks', () => {
  const a = establishedAgent(P, 3, T0);
  a.ratingSum = 0n;
  a.ratingWeight = 0n;
  const e = evaluate(a, P, T0);
  assert.equal(e.rating, 500);
  assert.ok(e.tier < 3);
});

guarantee('losing a dispute costs a quarter of the score and heals over 100 periods', 'formula', [], () => {
  const a = establishedAgent(P, 3, T0);
  const clean = evaluate(a, P, T0).score;
  a.penaltyBps = P.penaltyDisputeBps;
  a.penaltyPeriod = T0 / DAY;
  assert.equal(evaluate(a, P, T0).score, Math.floor((clean * 7500) / 10_000));
  assert.ok(evaluate(a, P, T0).tier < 3, 'a Trusted wallet that loses a dispute loses instant settlement');
  assert.equal(evaluate(a, P, T0 + 50n * DAY).behaviour, 10_000 - 1250);
  assert.equal(evaluate(a, P, T0 + 100n * DAY).behaviour, 10_000);
});

guarantee('one counterparty can never grant more than the pair cap', 'formula + on-chain', ['11. Wash trading through one sock puppet is capped at the pair cap'], () => {
  const m = model.newAgent(T0);
  const b = establishedAgent(P, 3, T0);
  const pair = model.newPair();
  for (let i = 1; i <= 50; i += 1) {
    const now = T0 + BigInt(i) * DAY;
    const o = model.openOrder(b, m, pair, P, PROTOCOL_FEE_BPS, 1_000n * USDC, now);
    model.deliver(o, m, P, now);
    model.settle(o, b, m, pair, P, { kind: 'release' }, now);
    model.review(o, b, m, pair, true, 5, P, now);
  }
  assert.equal(m.credit, P.pairCap, '$50,000 from one Trusted buyer earns exactly the $500 cap');
  assert.ok(evaluate(m, P, T0 + 50n * DAY).tier < 2, 'one big customer does not make a merchant Established');
});

guarantee('splitting a purchase into many small ones earns nothing extra', 'formula', [], () => {
  const run = (orders: number, size: bigint) => {
    const m = model.newAgent(T0);
    const b = establishedAgent(P, 2, T0);
    const pair = model.newPair();
    for (let i = 0; i < orders; i += 1) {
      const o = model.openOrder(b, m, pair, P, PROTOCOL_FEE_BPS, size, T0 + DAY);
      model.deliver(o, m, P, T0 + DAY);
      model.settle(o, b, m, pair, P, { kind: 'release' }, T0 + DAY);
      model.review(o, b, m, pair, true, 5, P, T0 + DAY);
    }
    return m.credit;
  };
  assert.equal(run(1, 100n * USDC), run(100, 1n * USDC));
});

guarantee('a refund or a lost dispute earns no credit', 'formula + on-chain', ['4. Refunds', '5. Disputes'], () => {
  const m = model.newAgent(T0);
  const b = establishedAgent(P, 3, T0);
  const pair = model.newPair();
  const o1 = model.openOrder(b, m, pair, P, PROTOCOL_FEE_BPS, 100n * USDC, T0 + DAY);
  model.settle(o1, b, m, pair, P, { kind: 'refund', expired: false }, T0 + DAY);
  const o2 = model.openOrder(b, m, pair, P, PROTOCOL_FEE_BPS, 100n * USDC, T0 + DAY);
  model.deliver(o2, m, P, T0 + DAY);
  model.dispute(b, m, pair);
  model.settle(o2, b, m, pair, P, { kind: 'resolve', merchantBps: 10_000 }, T0 + DAY);
  assert.equal(m.credit, 0n);
  assert.equal(model.review(o1, b, m, pair, true, 5, P, T0 + DAY), 0n, 'a review of a refund weighs nothing');
});

test('friendly fraud: a buyer who loses a dispute drops a tier and loses pair trust for good', () => {
  const m = establishedAgent(P, 3, T0);
  const b = establishedAgent(P, 3, T0);
  const pair = model.newPair();
  for (let i = 1; i <= 3; i += 1) {
    const now = T0 + BigInt(i) * 40n * DAY;
    const o = model.openOrder(b, m, pair, P, PROTOCOL_FEE_BPS, 20n * USDC, now);
    model.deliver(o, m, P, now);
    model.settle(o, b, m, pair, P, { kind: 'release' }, now);
    model.review(o, b, m, pair, true, 5, P, now);
  }
  const now = T0 + 130n * DAY;
  const o = model.openOrder(b, m, pair, P, PROTOCOL_FEE_BPS, 20n * USDC, now);
  assert.equal(o.pairTrusted, true, 'three undisputed purchases over 120 days: the pair is trusted');
  model.deliver(o, m, P, now);
  model.dispute(b, m, pair);
  model.settle(o, b, m, pair, P, { kind: 'resolve', merchantBps: 10_000 }, now);
  assert.equal(b.asBuyer.disputesLost, 1);
  assert.ok(b.tier < 3, 'the buyer is no longer Trusted');
  const next = model.openOrder(b, m, pair, P, PROTOCOL_FEE_BPS, 20n * USDC, now + DAY);
  assert.equal(next.pairTrusted, false);
  assert.ok(next.holdSecs > 0, 'and every later order with this merchant is held');
});

guarantee('a merchant cannot borrow the tier of a buyer who never took part', 'formula + on-chain', ['12. A merchant names a Trusted buyer who never agreed, and pays itself'], () => {
  // The buyer does not sign open_order, and anyone can fund a vault. So a
  // merchant can name a Trusted stranger as its buyer and pay itself.
  const victim = establishedAgent(P, 3, T0);
  const m = model.newAgent(T0);
  const pair = model.newPair();
  const o = model.openOrder(victim, m, pair, P, PROTOCOL_FEE_BPS, P.pairCap, T0 + DAY);
  model.deliver(o, m, P, T0 + DAY);
  model.settle(o, victim, m, pair, P, { kind: 'release' }, T0 + 4n * DAY);
  assert.equal(m.credit, 0n, 'no credit until the buyer itself reviews the order');
  assert.equal(m.counterpartyPoints, 0, 'and no Diversity');
  const before = evaluate(victim, P, T0 + 4n * DAY).score;
  assert.equal(model.review(o, m, victim, pair, false, 1, P, T0 + 4n * DAY), 0n, 'its one-star review weighs nothing');
  assert.equal(evaluate(victim, P, T0 + 4n * DAY).score, before, 'and the victim\'s score does not move');
  model.review(o, victim, m, pair, true, 5, P, T0 + 4n * DAY);
  assert.equal(m.credit, P.pairCap, 'once the buyer reviews, the order counts in full');
});

test('a merchant cannot forge pair history to waive a buyer\'s hold', () => {
  // Orders the merchant opens in a buyer's name and funds itself settle
  // without the buyer, so they are not history between the two.
  const m = establishedAgent(P, 3, T0);
  const b = model.newAgent(T0);
  const pair = model.newPair();
  for (let i = 1; i <= 3; i += 1) {
    const now = T0 + BigInt(i) * 40n * DAY;
    const o = model.openOrder(b, m, pair, P, PROTOCOL_FEE_BPS, P.minOrder, now);
    model.deliver(o, m, P, now);
    model.settle(o, b, m, pair, P, { kind: 'release' }, now + BigInt(o.holdSecs));
  }
  const o = model.openOrder(b, m, pair, P, PROTOCOL_FEE_BPS, 20n * USDC, T0 + 130n * DAY);
  assert.equal(o.pairTrusted, false, 'forged orders are not pair history');
  assert.equal(o.holdSecs, P.holdSecs[0], 'the New buyer keeps the longest hold');
});

test('a merchant that lost Trusted after the order opened does not settle it instantly', () => {
  const m = establishedAgent(P, 3, T0);
  const b = establishedAgent(P, 3, T0);
  m.feesPaid = 1_000n * USDC;
  const now = T0 + DAY;
  const o = model.openOrder(b, m, model.newPair(), P, PROTOCOL_FEE_BPS, 20n * USDC, now);
  assert.equal(o.holdSecs, 0, 'opened Trusted + Trusted');
  // A lost dispute elsewhere before delivery.
  const other = model.openOrder(b, m, model.newPair(), P, PROTOCOL_FEE_BPS, 20n * USDC, now);
  model.settle(other, b, m, model.newPair(), P, { kind: 'resolve', merchantBps: 0 }, now);
  assert.ok(m.tier < 3);
  model.deliver(o, m, P, now);
  assert.equal(o.instant, false);
  assert.equal(o.releaseAt, now + BigInt(Math.max(P.holdSecs[2]!, P.holdSecs[m.tier]!)), 'it waits like an Established order');
});

test('a complaint locks the instant amount for good, and a refund frees it at once', () => {
  const m = establishedAgent(P, 3, T0);
  const b = establishedAgent(P, 3, T0);
  m.feesPaid = 1_000n * USDC;
  const now = T0 + DAY;
  const scam = model.openOrder(b, m, model.newPair(), P, PROTOCOL_FEE_BPS, 20n * USDC, now);
  model.deliver(scam, m, P, now);
  model.settle(scam, b, m, model.newPair(), P, { kind: 'release' }, now);
  model.review(scam, b, m, model.newPair(), true, 1, P, now);
  model.closeOrder(scam, m);
  assert.equal(m.instantExposure, 20n * USDC, 'closing a complained-about order frees nothing');

  const refunded = model.openOrder(b, m, model.newPair(), P, PROTOCOL_FEE_BPS, 10n * USDC, now);
  model.deliver(refunded, m, P, now);
  assert.equal(m.instantExposure, 30n * USDC);
  model.settle(refunded, b, m, model.newPair(), P, { kind: 'refund', expired: false }, now);
  assert.equal(m.instantExposure, 20n * USDC, 'a refund gives the buyer everything back, so it stops counting');
  model.review(refunded, b, m, model.newPair(), true, 1, P, now);
  model.closeOrder(refunded, m);
  assert.equal(m.instantExposure, 20n * USDC, 'and is not freed twice');
});

test('an even split of an odd amount leaves both sides heard', () => {
  const m = establishedAgent(P, 3, T0);
  const b = establishedAgent(P, 3, T0);
  const pair = model.newPair();
  const o = model.openOrder(b, m, pair, P, PROTOCOL_FEE_BPS, 20n * USDC + 1n, T0 + DAY);
  model.deliver(o, m, P, T0 + DAY);
  model.dispute(b, m, pair);
  model.settle(o, b, m, pair, P, { kind: 'resolve', merchantBps: 5_000 }, T0 + DAY);
  assert.ok(model.review(o, b, m, pair, true, 3, P, T0 + DAY) > 0n);
  assert.ok(model.review(o, m, b, pair, false, 3, P, T0 + DAY) > 0n);
});

guarantee('the side that lost a dispute gets no weighted say on it', 'formula + on-chain', ['5. Disputes'], () => {
  const m = establishedAgent(P, 3, T0);
  const b = establishedAgent(P, 3, T0);
  const pair = model.newPair();
  const o = model.openOrder(b, m, pair, P, PROTOCOL_FEE_BPS, 20n * USDC, T0 + DAY);
  model.deliver(o, m, P, T0 + DAY);
  model.dispute(b, m, pair);
  model.settle(o, b, m, pair, P, { kind: 'resolve', merchantBps: 10_000 }, T0 + DAY);
  assert.equal(model.review(o, b, m, pair, true, 1, P, T0 + DAY), 0n, 'the buyer who lost cannot retaliate');
  assert.ok(model.review(o, m, b, pair, false, 1, P, T0 + DAY) > 0n, 'the merchant that won is heard');
});

guarantee('exit scam: instant settlement can net at most the base allowance', 'formula + on-chain', ['10. A complaint locks the instant limit: an exit scam cannot repeat', 'the merchant takes more than its instant limit'], () => {
  for (const fees of [0n, 10n * USDC, 1_000n * USDC, 250_000n * USDC]) {
    const { take, sunk, net } = exitScamBound(P, fees);
    assert.equal(take - sunk, net);
    assert.equal(net, P.instantBase);
  }
  const a = establishedAgent(P, 3, T0);
  a.feesPaid = 300n * USDC;
  assert.equal(instantLimit(a, P), P.instantBase + 300n * USDC);
});

guarantee('a ring of fresh wallets: what faking Trusted costs (mainnet targets)', 'formula', [], () => {
  const rows: string[] = [];
  for (const wallets of [3, 6, 12, 21, 40]) {
    const r = simulateRing({ params: P, feeBps: PROTOCOL_FEE_BPS, wallets, orderSize: 100n * USDC, periods: 120 });
    const last = r.snapshots.at(-1)!;
    rows.push(
      `${String(wallets).padStart(3)} wallets | best score ${String(last.score).padStart(4)} tier ${last.tier} | ` +
        `Trusted at day ${r.trustedAt ?? 'never'} | volume $${r.volume / USDC} | fees burned $${r.fees / USDC} | ` +
        `max instant take $${r.maxInstantTake / USDC}`,
    );
    // Whatever the ring takes instantly, it burned at least that much less the base allowance.
    const trusted = r.maxInstantTake === 0n ? 0n : r.maxInstantTake;
    assert.ok(trusted <= r.fees + BigInt(wallets) * P.instantBase);
    if (r.trustedAt !== null) assert.ok(r.trustedAt >= P.tierPeriods[2]!, 'never before the time gate');
  }
  console.log('\n' + rows.join('\n') + '\n');
  const small = simulateRing({ params: P, feeBps: PROTOCOL_FEE_BPS, wallets: 3, orderSize: 100n * USDC, periods: 365 });
  assert.equal(small.trustedAt, null, 'three wallets trading with each other for a year never reach Trusted');
});

test('an honest merchant with real customers gets there, and faster with better customers', () => {
  const run = (buyerTier: 0 | 1 | 2 | 3) =>
    simulateHonestMerchant({ params: P, feeBps: PROTOCOL_FEE_BPS, buyers: 25, buyerTier, orderSize: 40n * USDC, rating: 5, periods: 120 });
  const day = (rows: ReturnType<typeof run>, tier: number) => rows.find((r) => r.tier >= tier)?.period ?? null;
  const withTrusted = run(3);
  const withNew = run(0);
  console.log(
    `\n25 Trusted customers: Building day ${day(withTrusted, 1)}, Established day ${day(withTrusted, 2)}, Trusted day ${day(withTrusted, 3)}` +
      `\n25 New customers:     Building day ${day(withNew, 1)}, Established day ${day(withNew, 2)}, Trusted day ${day(withNew, 3)}\n`,
  );
  assert.equal(day(withTrusted, 3), P.tierPeriods[2], 'with Trusted customers the only wait is the time gate');
  assert.equal(day(withNew, 3), null, 'customers nobody knows cannot vouch a merchant into Trusted');
});

test('farming History with brand-new sock puppets (closed form)', () => {
  const c = farmingCost(P, PROTOCOL_FEE_BPS, 1000);
  assert.equal(c.wallets, 200);
  assert.equal(c.volume, 100_000n * USDC);
  assert.equal(c.fees, 1_000n * USDC);
  assert.equal(c.instantLimit - c.fees, P.instantBase);
});

test('devnet runs the same rules, compressed', () => {
  assert.deepEqual(DEVNET_PARAMS.tierScore, P.tierScore);
  assert.equal(DEVNET_PARAMS.penaltyDisputeBps, P.penaltyDisputeBps);
  assert.ok(DEVNET_PARAMS.periodSecs < P.periodSecs);
});

guarantee("the buyer's check refuses a quote for the wrong buyer, amount or escrow before paying", 'on-chain', ['quote names an escrow that is not this order', 'quote is for an order opened for a different buyer', 'quote is for a different amount'], async () => {
  // The buyer's verifyOrderForPayment reads the order account. The escrow check needs no chain: a payTo
  // that is not the order's own escrow is refused before anything is read. test:local runs all three.
  const expected = { orderId: newOrderId(), buyer: address('Acy1bCFCSBt8Bhv3vHBExWAoEnp2F6Wi96Mi5CqWt7PW'), merchant: address('2hQkyW5yGT4koHL7smK2rye5HzZe489qMdPXmr21aekd'), amount: 250_000n, mint: address('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'), payTo: address('2hQkyW5yGT4koHL7smK2rye5HzZe489qMdPXmr21aekd') };
  const untouched = new Proxy({}, { get: () => assert.fail('the chain was read before the escrow address was checked') });
  await assert.rejects(verifyOrderForPayment(untouched as never, expected), (e: unknown) => e instanceof OrderVerificationError && e.field === 'payTo');
});

guarantee('the merchant cannot take the money before the hold ends, or shorten a hold the buyer asked for', 'on-chain', ['the merchant takes the money before the hold ends', 'the merchant cannot shorten a hold the buyer asked for'], () => {
  // The hold is the longer of the two sides', so a Trusted merchant still waits for a New buyer.
  assert.equal(holdFor(P, 3, 0), P.holdSecs[0]);
  assert.equal(holdFor(P, 0, 3), P.holdSecs[0]);
  assert.equal(holdFor(P, 3, 3), 0);
});

test('the printed equations multiply out to the printed numbers, floored as the program does, in every state the simulator reaches', () => {
  const digits = (x: string) => BigInt(x.replace('.', ''));
  const check = (b: ReturnType<typeof breakdown>) => {
    const ev = /^0\.45 × (\d\.\d{3}) \+ 0\.30 × (\d\.\d{3}) \+ 0\.25 × (\d\.\d{3})$/.exec(b.evidence);
    const sc = /^1000 × (\d\.\d{3}) × (\d\.\d{3}) × (\d\.\d{4})$/.exec(b.score);
    assert.ok(ev && sc, `${b.evidence} | ${b.score}`);
    assert.equal((450n * digits(ev[1]!) + 300n * digits(ev[2]!) + 250n * digits(ev[3]!)) / 1000n, BigInt(b.e.evidence), b.evidence);
    assert.equal(digits(sc[1]!), BigInt(b.e.evidence), b.score);
    assert.equal((1000n * digits(sc[1]!) * digits(sc[2]!) * digits(sc[3]!)) / 10_000_000_000n, BigInt(b.e.score), b.score);
  };
  const small = simulate(PRESETS[1]!.w, P);
  const b = breakdown(small.agent, P, small.now);
  assert.deepEqual([b.evidence, b.score], ['0.45 × 0.282 + 0.30 × 0.533 + 0.25 × 0.240', '1000 × 0.346 × 0.880 × 1.0000']);
  let states = 0;
  for (const sales of STEPS.sales)
    for (const buyers of STEPS.buyers)
      for (const buyerTier of [0, 1, 2, 3] as const)
        for (const activePeriods of STEPS.active)
          for (const stars of [0, ...STEPS.stars])
            for (const disputesLost of STEPS.disputes) {
              const o = simulate({ sales: BigInt(sales) * USDC, buyers, buyerTier, activePeriods, stars, disputesLost }, P);
              check(breakdown(o.agent, P, o.now));
              states += 1;
            }
  assert.equal(states, 80_640);
  // A penalty part way through its decay leaves behaviour in basis points that two decimals would round.
  const a = establishedAgent(P, 3, T0);
  a.penaltyBps = P.penaltyDisputeBps;
  a.penaltyPeriod = T0 / DAY;
  const decayed = breakdown(a, P, T0 + DAY);
  assert.match(decayed.score, / × 0\.7525$/);
  check(decayed);
});

test('the simulator grants a merchant evidence only for sales its buyers reviewed, as the program does', () => {
  // Brand new, then $50,000 of sales to 80 Building buyers over 120 days, and no reviews.
  const w = { ...PRESETS[0]!.w, sales: 50_000n * USDC, buyers: 80, activePeriods: 120 };
  const program = (reviewed: boolean) => {
    const m = model.newAgent(T0);
    for (let i = 0; i < w.buyers; i += 1) {
      const b = establishedAgent(P, w.buyerTier, T0);
      const pair = model.newPair();
      const now = T0 + BigInt(i + 1) * DAY;
      const o = model.openOrder(b, m, pair, P, PROTOCOL_FEE_BPS, w.sales / BigInt(w.buyers), now);
      model.deliver(o, m, P, now);
      model.settle(o, b, m, pair, P, { kind: 'release' }, now + BigInt(o.holdSecs));
      if (reviewed) model.review(o, b, m, pair, true, 5, P, now + BigInt(o.holdSecs));
    }
    return m;
  };
  const silent = simulate(w, P);
  const m = program(false);
  assert.deepEqual([silent.agent.credit, silent.agent.counterpartyPoints, silent.agent.activePeriods], [m.credit, m.counterpartyPoints, m.activePeriods]);
  assert.deepEqual([silent.e.score, silent.e.tier, silent.counted], [0, 0, 0n], 'no reviews: no credit, no Diversity, no active days');
  const reviewed = simulate({ ...w, stars: 5 }, P);
  const r = program(true);
  assert.deepEqual([reviewed.agent.credit, reviewed.agent.counterpartyPoints], [r.credit, r.counterpartyPoints]);
  assert.ok(reviewed.e.score > 0);
  assert.equal(simulate({ ...w, sales: 0n, stars: 5 }, P).agent.activePeriods, 0, 'days without a sale are idle days');
  assert.equal(simulate({ ...w, buyers: 0, stars: 5 }, P).agent.activePeriods, 0, 'and so are days without a buyer');
});

guarantee('the five preset wallets score what the page says: 0, 304, 1000, 750 and 314', 'formula', [], () => {
  assert.deepEqual(PRESETS.map((x) => simulate(x.w, P).e.score), [0, 304, 1000, 750, 314]);
  const small = simulate(PRESETS[1]!.w, P).e;
  assert.deepEqual([small.history, small.tenure, small.diversity, small.rating, small.behaviour, small.evidence, small.tier], [282, 533, 240, 880, 10_000, 346, 1]);
  assert.equal(simulate(PRESETS[3]!.w, P).e.tier, 2, 'a lost dispute removes Trusted');
});
