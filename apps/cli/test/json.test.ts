/**
 * The shape of the three `--json` outputs: the keys agents and scripts rely
 * on, their types, and amounts as decimal strings.
 *
 *   npm run test:cli
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merchantsJson, settleJson, sortMerchants, tabJson, type MerchantRow, type TabInput } from '../src/render.js';

const NOVA = 'Acy1bCFCSBt8Bhv3vHBExWAoEnp2F6Wi96Mi5CqWt7PW';
const SIG = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmMSKcqsk9a4ysQ8';
const DECIMAL = /^\d+\.\d{3,6}$/;
const DEVNET_HOLDS = [120, 45, 10, 0];

const m = (name: string, category: string, sells: string, score: number, tier: number): MerchantRow => ({
  name,
  wallet: NOVA,
  category,
  sells,
  score,
  tier,
  holdSecs: DEVNET_HOLDS[tier]!,
  sales: 12,
  card: 'http://localhost:4020/agents/x/.well-known/agent-card.json',
});
const ROWS = sortMerchants(
  [
    m('search.api', 'data', 'web search results', 912, 3),
    m('prices.api', 'data', 'token prices', 868, 3),
    m('news.api', 'data', 'news headlines', 571, 2),
    m('weather.api', 'data', 'forecasts', 276, 1),
    m('scrape.api', 'data', 'page extraction', 140, 0),
    m('llm.api', 'inference', 'chat completions', 790, 3),
    m('embed.api', 'inference', 'text embeddings', 603, 2),
    m('image.api', 'media', 'image rendering', 644, 2),
    m('voice.api', 'media', 'text to speech', 62, 0),
    m('translate.api', 'language', 'text translation', 512, 2),
    m('maps.api', 'geo', 'routing', 338, 1),
    m('geocode.api', 'geo', 'address lookup', 455, 1),
  ],
  'score',
);

/** JSON.stringify must take it whole: no bigint, no undefined where a value is promised. */
const roundTrip = (v: unknown) => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;

test('merchants --json: the brief 3.3 shape, in the printed order', () => {
  const j = roundTrip(merchantsJson({ network: 'devnet', sort: 'score', rows: ROWS }));
  assert.deepEqual(Object.keys(j), ['network', 'count', 'categories', 'merchants']);
  assert.equal(j.network, 'devnet');
  assert.equal(j.count, 12);
  assert.deepEqual(j.categories, { data: 5, inference: 2, media: 2, language: 1, geo: 2 });
  assert.deepEqual(Object.keys(j.categories as object), ['data', 'inference', 'media', 'language', 'geo']);
  const list = j.merchants as Record<string, unknown>[];
  assert.equal(list.length, 12);
  assert.deepEqual(list[0], {
    name: 'search.api',
    wallet: NOVA,
    category: 'data',
    sells: 'web search results',
    score: 912,
    tier: 'Trusted',
    hold: 'instant',
    hold_seconds: 0,
    sales: 12,
    card: 'http://localhost:4020/agents/x/.well-known/agent-card.json',
  });
  assert.deepEqual(
    list.map((r) => r.name),
    ['search.api', 'prices.api', 'news.api', 'weather.api', 'scrape.api', 'llm.api', 'embed.api', 'image.api', 'voice.api', 'translate.api', 'geocode.api', 'maps.api'],
  );
  for (const r of list) {
    assert.deepEqual(Object.keys(r), ['name', 'wallet', 'category', 'sells', 'score', 'tier', 'hold', 'hold_seconds', 'sales', 'card']);
    assert.ok(Number.isInteger(r.score) && Number.isInteger(r.hold_seconds) && Number.isInteger(r.sales));
    assert.ok(['New', 'Building', 'Established', 'Trusted'].includes(r.tier as string));
    assert.equal(typeof r.hold, 'string');
  }
  const withoutCards = roundTrip(merchantsJson({ network: 'devnet', sort: 'score', rows: ROWS.map((r) => ({ ...r, name: '', sells: '', card: null, category: 'other' })) }));
  assert.deepEqual(withoutCards.categories, { other: 12 });
  const first = (withoutCards.merchants as Record<string, unknown>[])[0]!;
  assert.equal(first.name, 'Acy1…t7PW');
  assert.equal(first.sells, '');
  assert.equal(first.card, null);
});

const TAB: TabInput = {
  wallet: NOVA,
  network: 'devnet',
  token: 'USDC',
  mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  rows: [
    { n: 1, merchant: 'Atlas', merchantWallet: 'DzmuSTiwQLnZ4KMtWC3gZ5s68ySstf7UW37Jo4Wm8c2r', order: `j8Bf${'o'.repeat(36)}LQYh`, loan: `L1${'o'.repeat(42)}`, amount: 204_000n, dueAt: 1_761_700_000, status: 'on_tab' },
    { n: 2, merchant: 'Quill', merchantWallet: '2hQkyW5yGT4koHL7smK2rye5HzZe489qMdPXmr21aekd', order: `8VAF${'o'.repeat(36)}Hn3b`, loan: `L2${'o'.repeat(42)}`, amount: 255_000n, dueAt: 1_761_700_600, status: 'late' },
  ],
  record: { loans: 5, repaidOnTime: 3, repaidLate: 0, defaults: 0 },
};

test('tab --json: the spec D9 shape', () => {
  const j = roundTrip(tabJson(TAB));
  assert.deepEqual(Object.keys(j), ['tab', 'wallet', 'status', 'mode', 'network', 'token', 'mint', 'orders', 'total', 'paid', 'record']);
  assert.equal(j.tab, 'Acy1…t7PW');
  assert.equal(j.wallet, NOVA);
  assert.equal(j.status, 'open');
  assert.equal(j.mode, 'pay_later');
  assert.equal(j.network, 'devnet');
  assert.equal(j.token, 'USDC');
  assert.equal(j.mint, TAB.mint);
  assert.equal(j.total, '0.459');
  assert.equal(j.paid, false);
  assert.deepEqual(j.record, { loans: 5, repaidOnTime: 3, repaidLate: 0, defaults: 0 });
  const orders = j.orders as Record<string, unknown>[];
  assert.equal(orders.length, 2);
  assert.deepEqual(orders[0], {
    n: 1,
    merchant: 'Atlas',
    merchantWallet: 'DzmuSTiwQLnZ4KMtWC3gZ5s68ySstf7UW37Jo4Wm8c2r',
    order: TAB.rows[0]!.order,
    loan: TAB.rows[0]!.loan,
    amount: '0.204',
    dueAt: 1_761_700_000,
    status: 'on_tab',
  });
  assert.equal(orders[1]!.status, 'late');
  for (const o of orders) {
    assert.match(o.amount as string, DECIMAL);
    assert.ok(Number.isInteger(o.n) && Number.isInteger(o.dueAt));
    assert.ok(['on_tab', 'late', 'in_default'].includes(o.status as string));
  }
  assert.match(j.total as string, DECIMAL);
});

test('tab --json: amounts take the decimals the whole tab needs, and an unnamed merchant is its short wallet', () => {
  const j = roundTrip(tabJson({ ...TAB, rows: [{ ...TAB.rows[0]!, amount: 204_500n, merchant: '' }, TAB.rows[1]!] }));
  const orders = j.orders as Record<string, unknown>[];
  assert.equal(orders[0]!.amount, '0.2045');
  assert.equal(orders[1]!.amount, '0.2550');
  assert.equal(j.total, '0.4595');
  assert.equal(orders[0]!.merchant, 'Dzmu…8c2r');
});

test('tab --json: no open tab', () => {
  const j = roundTrip(tabJson({ ...TAB, rows: [], record: null }));
  assert.equal(j.status, 'none');
  assert.deepEqual(j.orders, []);
  assert.equal(j.total, '0.000');
  assert.equal(j.paid, true);
  assert.equal(j.record, null);
  assert.equal(j.tab, 'Acy1…t7PW');
  assert.equal(j.wallet, NOVA);
});

test('settle --json: the spec D10 shape, settled, dry run and failed', () => {
  const base = { wallet: NOVA, orders: 6, payments: 1, network: 'devnet', total: 140_000n, token: 'USDC' };
  const settled = roundTrip(settleJson({ ...base, signatures: [SIG], status: 'settled' }));
  assert.deepEqual(settled, {
    tab: 'Acy1…t7PW',
    wallet: NOVA,
    orders: 6,
    payments: 1,
    signature: SIG,
    signatures: [SIG],
    status: 'settled',
    network: 'devnet',
    total: '0.140',
    token: 'USDC',
  });
  const two = roundTrip(settleJson({ ...base, orders: 9, payments: 2, signatures: [SIG, SIG], status: 'settled' }));
  assert.equal(two.signature, SIG);
  assert.deepEqual(two.signatures, [SIG, SIG]);
  assert.equal(two.payments, 2);
  const dry = roundTrip(settleJson({ ...base, signatures: [], status: 'dry_run' }));
  assert.equal(dry.status, 'dry_run');
  assert.equal(dry.signature, null);
  assert.deepEqual(dry.signatures, []);
  assert.match(dry.total as string, DECIMAL);
  const failed = roundTrip(settleJson({ ...base, signatures: [], status: 'failed', reason: 'not enough balance ($0.140 needed, $0.100 in the wallet)' }));
  assert.equal(failed.status, 'failed');
  assert.equal(failed.reason, 'not enough balance ($0.140 needed, $0.100 in the wallet)');
  const none = roundTrip(settleJson({ ...base, orders: 0, payments: 0, total: 0n, signatures: [], status: 'none' }));
  assert.equal(none.status, 'none');
  assert.equal(none.total, '0.000');
});
