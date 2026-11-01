/**
 * The three human outputs of the tab commands, held still: the merchants
 * table is the brief's own sample (docs/handoff/CLAUDE_CODE_BRIEF.md 3.3),
 * the tab table the spec's D9 sample, the settle lines the brief's 3.5.
 * Colour off, with and without UTF-8.
 *
 *   npm run test:cli
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bar,
  cut,
  col,
  decimalsFor,
  holdLabel,
  money,
  paint,
  progress,
  renderMerchants,
  renderSettleDone,
  renderSettleFail,
  renderSettleStart,
  renderTab,
  shortAddr,
  sortMerchants,
  styleFrom,
  type MerchantRow,
  type Style,
  type TabInput,
} from '../src/render.js';

const UTF8: Style = { color: 'none', utf8: true };
const ASCII: Style = { color: 'none', utf8: false };
const BASIC: Style = { color: 'basic', utf8: true };
const DEVNET_HOLDS = [120, 45, 10, 0];
const NOVA = 'Acy1bCFCSBt8Bhv3vHBExWAoEnp2F6Wi96Mi5CqWt7PW';
const SIG = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmMSKcqsk9a4ysQ8';
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

const m = (name: string, category: string, sells: string, score: number, tier: number): MerchantRow => ({
  name,
  wallet: `${name.replace('.', '')}${'1'.repeat(44 - name.length + 1)}`,
  category,
  sells,
  score,
  tier,
  holdSecs: DEVNET_HOLDS[tier]!,
  sales: 1,
  card: null,
});

/** The landing page's twelve merchants, in the page's order. */
const SAMPLE: MerchantRow[] = [
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
];

/** Brief 3.3, copied as printed. */
const BRIEF_3_3 = `12 merchants · 5 categories · scores from settled orders only · devnet
MERCHANT        SELLS                SCORE             TIER         HOLD
# data · 5
search.api      web search results   912   █████████░  Trusted      instant
prices.api      token prices         868   █████████░  Trusted      instant
news.api        news headlines       571   ██████░░░░  Established  10 s
weather.api     forecasts            276   ███░░░░░░░  Building     45 s
scrape.api      page extraction      140   █░░░░░░░░░  New          2 min
# inference · 2
llm.api         chat completions     790   ████████░░  Trusted      instant
embed.api       text embeddings      603   ██████░░░░  Established  10 s`;

/** The groups the brief's sample stops before, from the same page, with devnet holds. */
const REST_OF_PAGE = `# media · 2
image.api       image rendering      644   ██████░░░░  Established  10 s
voice.api       text to speech       62    █░░░░░░░░░  New          2 min
# language · 1
translate.api   text translation     512   █████░░░░░  Established  10 s
# geo · 2
geocode.api     address lookup       455   █████░░░░░  Building     45 s
maps.api        routing              338   ███░░░░░░░  Building     45 s`;

const merchantsInput = (rows: MerchantRow[], sort: 'score' | 'name' = 'score') => ({ network: 'devnet', sort, rows: sortMerchants(rows, sort) });

test('merchants: the brief 3.3 sample, line for line, then the rest of the page', () => {
  const out = renderMerchants(merchantsInput(SAMPLE), UTF8);
  assert.equal(out, `${BRIEF_3_3}\n${REST_OF_PAGE}`);
  assert.ok(out.startsWith(BRIEF_3_3));
});

test('merchants: every column starts where the brief puts it, whatever the value', () => {
  const lines = renderMerchants(merchantsInput(SAMPLE), UTF8).split('\n');
  for (const line of lines.filter((l) => /\.api/.test(l))) {
    const c = Array.from(line);
    assert.equal(c[15], ' ', line);
    assert.notEqual(c[16], ' ', line);
    assert.equal(c[36], ' ', line);
    assert.notEqual(c[37], ' ', line);
    assert.ok(['█', '░'].includes(c[43]!), line);
    assert.equal(c[54], ' ', line);
    assert.notEqual(c[55], ' ', line);
    assert.equal(c[67], ' ', line);
    assert.notEqual(c[68], ' ', line);
  }
});

test('merchants: without UTF-8 the bar is # and -, and nothing else moves', () => {
  const lines = renderMerchants(merchantsInput(SAMPLE), ASCII).split('\n');
  assert.equal(lines[3], 'search.api      web search results   912   #########-  Trusted      instant');
  assert.equal(lines[7], 'scrape.api      page extraction      140   #---------  New          2 min');
});

test('merchants: colour codes wrap the text only, so the plain layout is unchanged', () => {
  const painted = renderMerchants(merchantsInput(SAMPLE), BASIC);
  assert.equal(strip(painted), `${BRIEF_3_3}\n${REST_OF_PAGE}`);
  assert.ok(painted.includes('\x1b[92mTrusted\x1b[39m'));
  assert.ok(painted.includes('\x1b[92m# data · 5\x1b[39m'));
  assert.ok(painted.includes('\x1b[90m12 merchants'));
});

test('merchants: sorting by name orders groups and names A to Z', () => {
  const lines = renderMerchants(merchantsInput(SAMPLE, 'name'), UTF8).split('\n');
  assert.deepEqual(
    lines.filter((l) => l.startsWith('# ')),
    ['# data · 5', '# geo · 2', '# inference · 2', '# language · 1', '# media · 2'],
  );
  assert.deepEqual(lines.slice(3, 8).map((l) => l.slice(0, 16).trim()), ['news.api', 'prices.api', 'scrape.api', 'search.api', 'weather.api']);
});

test('merchants: a value that fills its column is cut so a space still separates the columns', () => {
  const rows = [m('vera', 'data', 'Tessera credit report', 1000, 3), m('atlas', 'data', 'Solana network telemetry', 941, 3)];
  const lines = renderMerchants(merchantsInput(rows), UTF8).split('\n');
  assert.equal(lines[3], 'vera            Tessera credit repo… 1000  ██████████  Trusted      instant');
  assert.equal(lines[4], 'atlas           Solana network tele… 941   █████████░  Trusted      instant');
  // Fifteen characters and an ellipsis for a name of sixteen or more.
  const long = renderMerchants(merchantsInput([m('sixteen-chars.ai', 'data', 'x', 1, 0)]), UTF8).split('\n')[3]!;
  assert.ok(long.startsWith('sixteen-chars.… x'), long);
});

test('merchants: no rows is one summary line', () => {
  assert.equal(renderMerchants({ network: 'devnet', sort: 'score', rows: [] }, UTF8), '0 merchants · 0 categories · scores from settled orders only · devnet');
  const one = renderMerchants(merchantsInput(SAMPLE.slice(0, 1)), UTF8).split('\n');
  assert.equal(one[0], '1 merchant · 1 category · scores from settled orders only · devnet');
});

test('merchants: long names and services are cut to the column, unnamed wallets show short', () => {
  const rows = [
    { ...m('a'.repeat(30), 'data', 'b'.repeat(30), 500, 2), wallet: NOVA },
    { ...m('', 'data', '', 100, 0), wallet: NOVA },
  ];
  const lines = renderMerchants(merchantsInput(rows), UTF8).split('\n');
  assert.equal(lines[3], `${'a'.repeat(14)}… ${'b'.repeat(19)}… 500   █████░░░░░  Established  10 s`);
  assert.equal(lines[4], 'Acy1…t7PW                            100   █░░░░░░░░░  New          2 min');
  const ascii = renderMerchants(merchantsInput(rows), ASCII).split('\n');
  assert.equal(ascii[3], `${'a'.repeat(12)}... ${'b'.repeat(17)}... 500   #####-----  Established  10 s`);
  assert.equal(ascii[4], 'Acy1..t7PW                           100   #---------  New          2 min');
});

test('holds print as the brief words them, on devnet and at the mainnet targets', () => {
  assert.deepEqual([120, 45, 10, 0].map(holdLabel), ['2 min', '45 s', '10 s', 'instant']);
  assert.deepEqual([3 * 86_400, 86_400, 3_600, 0].map(holdLabel), ['3 days', '24 h', '60 min', 'instant']);
  assert.equal(holdLabel(90_000), '1 day');
  assert.equal(holdLabel(1_800), '30 min');
});

test('the score bar fills one cell per hundred points', () => {
  assert.equal(bar(912, 3, UTF8), '█████████░');
  assert.equal(bar(62, 0, ASCII), '#---------');
  assert.equal(bar(1000, 3, UTF8), '██████████');
  assert.equal(bar(0, 0, UTF8), '░░░░░░░░░░');
  assert.equal(bar(949, 3, UTF8), '█████████░');
  assert.equal(bar(950, 3, UTF8), '██████████');
});

test('amounts: three decimals, or as many as the column needs to be exact', () => {
  assert.equal(money(204_000n), '$0.204');
  assert.equal(money(10_000n), '$0.010');
  assert.equal(money(1_250_000n), '$1.250');
  assert.equal(decimalsFor([204_000n, 255_000n]), 3);
  assert.equal(decimalsFor([204_500n, 255_000n]), 4);
  assert.equal(decimalsFor([1n]), 6);
  assert.equal(decimalsFor([]), 3);
  assert.equal(money(204_500n, 4), '$0.2045');
  assert.equal(money(1n, 6), '$0.000001');
});

test('cut keeps the width, col pads to it', () => {
  assert.equal(cut('a'.repeat(20), 16, UTF8), `${'a'.repeat(15)}…`);
  assert.equal(cut('a'.repeat(20), 16, ASCII), `${'a'.repeat(13)}...`);
  assert.equal(cut('short', 16, UTF8), 'short');
  assert.equal(col('ab', 5), 'ab   ');
  assert.equal(col('abcdef', 5), 'abcdef');
  assert.equal(shortAddr(NOVA, UTF8), 'Acy1…t7PW');
  assert.equal(shortAddr(NOVA, ASCII), 'Acy1..t7PW');
});

const ORDER_1 = `j8Bf${'o'.repeat(36)}LQYh`;
const ORDER_2 = `8VAF${'o'.repeat(36)}Hn3b`;
const TAB: TabInput = {
  wallet: NOVA,
  network: 'devnet',
  token: 'USDC',
  mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  rows: [
    { n: 1, merchant: 'Atlas', merchantWallet: 'DzmuSTiwQLnZ4KMtWC3gZ5s68ySstf7UW37Jo4Wm8c2r', order: ORDER_1, loan: `L1${'o'.repeat(42)}`, amount: 204_000n, dueAt: 1_761_700_000, status: 'on_tab' },
    { n: 2, merchant: 'Quill', merchantWallet: '2hQkyW5yGT4koHL7smK2rye5HzZe489qMdPXmr21aekd', order: ORDER_2, loan: `L2${'o'.repeat(42)}`, amount: 255_000n, dueAt: 1_761_700_600, status: 'on_tab' },
  ],
  record: { loans: 5, repaidOnTime: 3, repaidLate: 0, defaults: 0 },
};

/** Spec D9, with the ORDER column at the 12 characters its text gives it. */
const SPEC_D9 = `tab Acy1…t7PW · open · pay later · devnet USDC
#      MERCHANT        ORDER       AMOUNT   STATUS
#1     Atlas           j8Bf…LQYh   $0.204   on tab
#2     Quill           8VAF…Hn3b   $0.255   on tab
────────────────────────────────────────────────────
TOTAL  2 orders                    $0.459   unpaid`;

test('tab: the spec D9 sample', () => {
  assert.equal(renderTab(TAB, UTF8), SPEC_D9);
  const lines = SPEC_D9.split('\n');
  for (const line of lines.slice(1, 4)) {
    const c = Array.from(line);
    assert.equal(c[6], ' ');
    assert.notEqual(c[7], ' ');
    assert.notEqual(c[23], ' ');
    assert.notEqual(c[35], ' ');
    assert.notEqual(c[44], ' ');
  }
  assert.equal(Array.from(lines[4]!).length, 52);
});

test('tab: without UTF-8 the rule, the ellipses and nothing else change', () => {
  assert.equal(
    renderTab(TAB, ASCII),
    `tab Acy1..t7PW · open · pay later · devnet USDC
#      MERCHANT        ORDER       AMOUNT   STATUS
#1     Atlas           j8Bf..LQYh  $0.204   on tab
#2     Quill           8VAF..Hn3b  $0.255   on tab
----------------------------------------------------
TOTAL  2 orders                    $0.459   unpaid`,
  );
});

test('tab: late and defaulted loans, and a column that needs more decimals', () => {
  const rows = TAB.rows.map((r, k) => ({ ...r, amount: k === 0 ? 204_500n : r.amount, status: k === 0 ? ('late' as const) : ('in_default' as const) }));
  const out = renderTab({ ...TAB, rows }, UTF8).split('\n');
  assert.equal(out[2], '#1     Atlas           j8Bf…LQYh   $0.2045  late');
  assert.equal(out[3], '#2     Quill           8VAF…Hn3b   $0.2550  in default');
  assert.equal(out[5], 'TOTAL  2 orders                    $0.4595  unpaid');
});

test('tab: AMOUNT grows for an amount of six decimals or $1,000 and more, so STATUS keeps its space', () => {
  const rows = [
    { ...TAB.rows[0]!, amount: 125_925n },
    { ...TAB.rows[1]!, amount: 10_204_000n, status: 'in_default' as const },
  ];
  const out = renderTab({ ...TAB, rows }, UTF8).split('\n');
  assert.equal(out[1], '#      MERCHANT        ORDER       AMOUNT     STATUS');
  assert.equal(out[2], '#1     Atlas           j8Bf…LQYh   $0.125925  on tab');
  assert.equal(out[3], '#2     Quill           8VAF…Hn3b   $10.204000 in default');
  assert.equal(out[4], '─'.repeat(54));
  assert.equal(out[5], 'TOTAL  2 orders                    $10.329925 unpaid');
  const big = renderTab({ ...TAB, rows: [{ ...TAB.rows[0]!, amount: 1_234_500_000n }] }, ASCII).split('\n');
  assert.equal(big[2], '#1     Atlas           j8Bf..LQYh  $1234.500 on tab');
  assert.equal(big[3], '-'.repeat(53));
  assert.equal(big[4], 'TOTAL  1 order                     $1234.500 unpaid');
});

test('tab: the amber and dim parts are painted, the columns are not moved', () => {
  const painted = renderTab(TAB, BASIC);
  assert.equal(strip(painted), SPEC_D9);
  assert.ok(painted.includes('\x1b[33mon tab\x1b[39m'));
  assert.ok(painted.includes('\x1b[33munpaid\x1b[39m'));
  assert.ok(painted.startsWith('\x1b[90mtab Acy1…t7PW'));
});

test('tab: an unnamed merchant shows its short wallet, a long name is cut', () => {
  const rows = [
    { ...TAB.rows[0]!, merchant: '' },
    { ...TAB.rows[1]!, merchant: 'Q'.repeat(20) },
  ];
  const out = renderTab({ ...TAB, rows }, UTF8).split('\n');
  assert.equal(out[2], '#1     Dzmu…8c2r       j8Bf…LQYh   $0.204   on tab');
  assert.equal(out[3], `#2     ${'Q'.repeat(14)}… 8VAF…Hn3b   $0.255   on tab`);
});

test('tab: no open tab, with and without a record', () => {
  assert.equal(renderTab({ ...TAB, rows: [], record: null }, UTF8), 'no open tab · run a purchase first');
  assert.equal(renderTab({ ...TAB, rows: [], record: { loans: 3, repaidOnTime: 3, repaidLate: 0, defaults: 0 } }, UTF8), 'no open tab · run a purchase first\nrecord: 3 loans, 3 on time, 0 late, 0 defaults');
  assert.equal(renderTab({ ...TAB, rows: [], record: { loans: 1, repaidOnTime: 0, repaidLate: 0, defaults: 1 } }, UTF8).split('\n')[1], 'record: 1 loan, 0 on time, 0 late, 1 default');
});

test('settle: the lines before and after, as the brief prints them', () => {
  assert.equal(renderSettleStart({ wallet: NOVA, orders: 6, payments: 1 }, UTF8).join('\n'), 'tab Acy1…t7PW · 6 orders · unpaid\nsettling 6 orders in 1 payment');
  assert.equal(
    renderSettleDone({ orders: 6, payments: 1, signatures: [SIG], network: 'devnet' }, UTF8),
    `✓ settled · 1 signature · main agent
6 orders closed · 1 payment on-chain
${SIG}  https://explorer.solana.com/tx/${SIG}?cluster=devnet`,
  );
});

test('settle: more than one payment, ASCII marks, the failure line', () => {
  assert.equal(renderSettleStart({ wallet: NOVA, orders: 9, payments: 2 }, ASCII).join('\n'), 'tab Acy1..t7PW · 9 orders · unpaid\nsettling 9 orders in 2 payments');
  const done = renderSettleDone({ orders: 9, payments: 2, signatures: [SIG, SIG], network: 'localnet' }, ASCII).split('\n');
  assert.equal(done[0], 'ok settled · 2 signatures · main agent');
  assert.equal(done[1], '9 orders closed · 2 payments on-chain');
  assert.equal(done.length, 4);
  assert.equal(done[3], `${SIG}  https://explorer.solana.com/tx/${SIG}?cluster=custom`);
  assert.equal(renderSettleFail('a network error (api.devnet.solana.com)', UTF8), '✗ not settled · a network error (api.devnet.solana.com)');
  assert.equal(renderSettleFail('cancelled', ASCII), 'x not settled · cancelled');
  assert.equal(renderSettleFail('cancelled', BASIC), '\x1b[33m✗ not settled · cancelled\x1b[39m');
  assert.equal(renderSettleDone({ orders: 6, payments: 1, signatures: [SIG], network: 'devnet' }, BASIC).split('\n')[0], '\x1b[92m✓ settled · 1 signature · main agent\x1b[39m');
});

test('the progress bar has twenty cells', () => {
  assert.equal(progress(4, 4, UTF8), '████████████████████ 100%');
  assert.equal(progress(1, 4, ASCII), '#####--------------- 25%');
  assert.equal(progress(0, 8, UTF8), '░░░░░░░░░░░░░░░░░░░░ 0%');
  assert.equal(progress(3, 8, UTF8), '████████░░░░░░░░░░░░ 38%');
});

test('style: colour only on a terminal that was not told otherwise, UTF-8 from the locale', () => {
  assert.deepEqual(styleFrom({}, true), { color: 'basic', utf8: true });
  assert.deepEqual(styleFrom({ COLORTERM: 'truecolor', LANG: 'en_US.UTF-8' }, true), { color: 'truecolor', utf8: true });
  assert.equal(styleFrom({ COLORTERM: '24bit' }, true).color, 'truecolor');
  assert.equal(styleFrom({ NO_COLOR: '' }, true).color, 'none');
  assert.equal(styleFrom({ NO_COLOR: '1' }, true).color, 'none');
  assert.equal(styleFrom({}, false).color, 'none');
  assert.equal(styleFrom({ COLORTERM: 'truecolor' }, true, { json: true }).color, 'none');
  assert.equal(styleFrom({ COLORTERM: 'truecolor' }, true, { noColor: true }).color, 'none');
  assert.equal(styleFrom({ LANG: 'C' }, true).utf8, false);
  assert.equal(styleFrom({ LANG: 'en_GB.utf8' }, true).utf8, true);
  assert.equal(styleFrom({ LC_ALL: 'C', LANG: 'en_US.UTF-8' }, true).utf8, false);
  assert.equal(styleFrom({ LC_CTYPE: 'zh_CN.UTF-8', LANG: 'C' }, true).utf8, true);
});

test('paint: the brief colour map, in 16 colours and truecolor, and no code for primary text', () => {
  assert.equal(paint('Trusted', 'mint', BASIC), '\x1b[92mTrusted\x1b[39m');
  assert.equal(paint('Established', 'established', BASIC), '\x1b[32mEstablished\x1b[39m');
  assert.equal(paint('Building', 'building', BASIC), '\x1b[37mBuilding\x1b[39m');
  assert.equal(paint('New', 'dim', BASIC), '\x1b[90mNew\x1b[39m');
  assert.equal(paint('on tab', 'amber', BASIC), '\x1b[33mon tab\x1b[39m');
  assert.equal(paint('search.api', 'primary', BASIC), 'search.api');
  const TRUE: Style = { color: 'truecolor', utf8: true };
  assert.equal(paint('Trusted', 'mint', TRUE), '\x1b[38;2;94;230;171mTrusted\x1b[39m');
  assert.equal(paint('on tab', 'amber', TRUE), '\x1b[38;2;245;190;85mon tab\x1b[39m');
  assert.equal(paint('x', 'mint', UTF8), 'x');
  assert.equal(paint('', 'mint', BASIC), '');
});

// ---------------------------------------------------------------- score and rewards (docs/handoff/CLAUDE_CODE_BRIEF_SCORE.md)

import { MAINNET_TARGET_PARAMS, DEVNET_PARAMS, rewards, score, simulate } from '@tessera/sdk';
import { renderRewards, renderScore, renderScoreMismatch, renderTestLine, renderTestSummary, times, utcMinute, type RewardsInput, type ScoreInput, type TestLine } from '../src/render.js';
import { SCORE_HELP, scoreCommand, simulatedWallet, type ScoreOpts } from '../src/score.js';
import demo from '../../../deployments/rewards-demo.json';

const SMALL = simulate.presetById('small-honest-shop')!;
/** When the program stored the score: 28 Oct 2026 14:02:11 UTC. */
const AT = 1_793_196_131;
const scoreInput = (wallet = '9xQwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK3pD', program: ScoreInput['program'] = { score: 304, sdk: 304, at: AT }): ScoreInput => {
  const o = simulate.simulate(SMALL.w, MAINNET_TARGET_PARAMS);
  const b = score.breakdown(o.agent, MAINNET_TARGET_PARAMS, o.now);
  return { wallet, simulated: false, network: 'devnet', counterparties: 12, activePeriods: 16, b, other: { network: 'mainnet target', holdSecs: MAINNET_TARGET_PARAMS.holdSecs[b.e.tier]! }, program, noFile: false };
};

/**
 * Brief 3.2, the hero terminal: the example wallet is the small honest shop
 * at mainnet scale. Two changes from the brief: the evidence and score lines
 * print the factors in the program's own units, so they multiply out to the
 * score, and the other network's hold is the mainnet target.
 */
const BRIEF_3_2 = `9xQw…K3pD · 12 counterparties · 16 active periods · devnet
history     0.28   ███░░░░░░░  √(800 ÷ 10000)
tenure      0.53   █████░░░░░  48 ÷ 90
diversity   0.24   ██░░░░░░░░  4.8 ÷ 20
rating      0.88   █████████░  4.14 stars
behaviour   1.00   ██████████  no penalty
evidence    0.35   0.45 × 0.282 + 0.30 × 0.533 + 0.25 × 0.240
score       304    1000 × 0.346 × 0.880 × 1.0000
tier        Building    hold 24 h · mainnet target 24 h
✓ same result from the program and the SDK`;

test('score: the brief 3.2 breakdown, line for line, with the tick only when the program agrees', () => {
  assert.equal(renderScore(scoreInput(), UTF8), BRIEF_3_2);
  const lines = renderScore(scoreInput(undefined, { score: 300, sdk: 304, at: AT }), UTF8).split('\n');
  assert.equal(lines.length, 9, 'no tick when the stored score differs');
  assert.equal(renderScore(scoreInput(undefined, null), UTF8).split('\n').length, 9, 'no tick without a credit file');
  assert.equal(renderScoreMismatch(300, 304, UTF8), '✗ program says 300, SDK says 304');
  assert.equal(renderScoreMismatch(300, 304, ASCII), 'x program says 300, SDK says 304');
});

test('score: when the score has moved since the program stored it, the tick says what was compared', () => {
  // The program stored 289, the SDK gives 289 for that moment, and 304 now: time moved tenure or a penalty on.
  const moved = scoreInput(undefined, { score: 289, sdk: 289, at: AT });
  const lines = renderScore(moved, UTF8).split('\n');
  assert.equal(lines.length, 10);
  assert.equal(lines[7], 'score       304    1000 × 0.346 × 0.880 × 1.0000');
  assert.equal(lines[9], '✓ the program stored 289 on 28 Oct 14:02 UTC and the SDK gives the same for that moment · 304 now');
  assert.equal(renderScore(moved, ASCII).split('\n')[9], 'ok the program stored 289 on 28 Oct 14:02 UTC and the SDK gives the same for that moment - 304 now');
  assert.ok(!renderScore(moved, UTF8).includes('same result'), 'the short line only when the stored score is the score shown');
  assert.equal(utcMinute(AT), '28 Oct 14:02 UTC');
  assert.equal(utcMinute(0), '1 Jan 00:00 UTC');
});

test('score: every column starts where the brief puts it, the bar is round(value × 10) cells, no colour is in the layout', () => {
  const out = renderScore(scoreInput(), BASIC);
  assert.equal(strip(out), BRIEF_3_2);
  for (const line of strip(out).split('\n').slice(1, 6)) {
    const c = Array.from(line);
    assert.equal(c[11], ' ', line);
    assert.notEqual(c[12], ' ', line);
    assert.equal(c[18], ' ', line);
    assert.ok(['█', '░'].includes(c[19]!), line);
    assert.ok(['█', '░'].includes(c[28]!), line);
    assert.equal(c[29], ' ', line);
    assert.equal(c[30], ' ', line);
    assert.notEqual(c[31], ' ', line);
    const value = Number(line.slice(12, 19));
    assert.equal(c.slice(19, 29).filter((x) => x === '█').length, Math.round(value * 10), line);
  }
  assert.ok(out.includes('\x1b[92m304\x1b[39m'), 'the score is mint');
  assert.ok(out.includes('\x1b[37m███\x1b[39m'), 'a Building wallet draws its bars in the Building colour');
  assert.ok(out.includes('\x1b[92m✓ same result from the program and the SDK\x1b[39m'));
});

test('score: without UTF-8 the bar is # and -, the tick is ok, the address uses two dots, and the maths is plain', () => {
  const out = renderScore(scoreInput(), ASCII);
  const lines = out.split('\n');
  assert.equal(lines[0], '9xQw..K3pD - 12 counterparties - 16 active periods - devnet');
  assert.equal(lines[1], 'history     0.28   ###-------  sqrt(800 / 10000)');
  assert.equal(lines[2], 'tenure      0.53   #####-----  48 / 90');
  assert.equal(lines[6], 'evidence    0.35   0.45 x 0.282 + 0.30 x 0.533 + 0.25 x 0.240');
  assert.equal(lines[7], 'score       304    1000 x 0.346 x 0.880 x 1.0000');
  assert.equal(lines[8], 'tier        Building    hold 24 h - mainnet target 24 h');
  assert.equal(lines[9], 'ok same result from the program and the SDK');
  assert.match(out, /^[\x20-\x7e\n]*$/, 'nothing but ASCII');
});

test('score: a simulation says so, prints the devnet hold after the mainnet one, and a wallet without a file says why', () => {
  const o = simulate.simulate(SMALL.w, MAINNET_TARGET_PARAMS);
  const b = score.breakdown(o.agent, MAINNET_TARGET_PARAMS, o.now);
  const sim: ScoreInput = { wallet: '', simulated: true, network: 'mainnet scale', counterparties: 12, activePeriods: 16, b, other: { network: 'devnet', holdSecs: DEVNET_PARAMS.holdSecs[b.e.tier]! }, program: null, noFile: false };
  const lines = renderScore(sim, UTF8).split('\n');
  assert.equal(lines[0], 'simulated · 12 counterparties · 16 active periods · mainnet scale');
  assert.equal(lines[8], 'tier        Building    hold 24 h · devnet 45 s');
  assert.equal(lines.length, 9);
  const empty = renderScore({ ...scoreInput(undefined, null), noFile: true, counterparties: 0, activePeriods: 0 }, UTF8).split('\n');
  assert.equal(empty[1], 'no credit file yet: no order has settled through Tessera with this wallet');
});

test('score: the five presets print the scores the page states', () => {
  const scores = simulate.PRESETS.map((p) => {
    const o = simulate.simulate(p.w, MAINNET_TARGET_PARAMS);
    return score.breakdown(o.agent, MAINNET_TARGET_PARAMS, o.now).e.score;
  });
  assert.deepEqual(scores, [0, 304, 1000, 750, 314]);
});

const simOpts = (o: Partial<ScoreOpts>): ScoreOpts => ({
  rpcUrl: 'http://127.0.0.1:8899',
  json: false,
  noColor: true,
  simulate: true,
  die: (m) => {
    throw new Error(`die: ${m}`);
  },
  usage: (m) => {
    throw new Error(`usage: ${m}`);
  },
  ...o,
});
const usage = (message: string) => (e: unknown) => e instanceof Error && e.message === `usage: ${message}`;

test('score --simulate: the help gives units and ranges, and a value that would be read wrong is refused', async () => {
  assert.match(SCORE_HELP, /--sales {5}USDC, total sold at mainnet scale/);
  assert.match(SCORE_HELP, /--active {4}days with a reviewed sale/);
  assert.match(SCORE_HELP, /--stars {5}1 to 5, 0 for no reviews/);
  assert.throws(() => simulatedWallet(simOpts({ stars: '' })), usage('--stars needs a value'));
  assert.throws(() => simulatedWallet(simOpts({ sales: ' ' })), usage('--sales needs a value'));
  assert.throws(() => simulatedWallet(simOpts({ sales: 'abc' })), usage('--sales must be a number of 0 or more, not abc'));
  assert.throws(() => simulatedWallet(simOpts({ buyers: '2.5' })), usage('--buyers must be a whole number of 0 or more, not 2.5'));
  assert.throws(() => simulatedWallet(simOpts({ stars: '0.04' })), usage('--stars must be from 1 to 5, or 0 for no reviews, not 0.04'));
  assert.throws(() => simulatedWallet(simOpts({ stars: '5.5' })), usage('--stars must be from 1 to 5, or 0 for no reviews, not 5.5'));
  assert.throws(() => simulatedWallet(simOpts({ stars: '4.55' })), usage('--stars takes one decimal at most, not 4.55'));
  assert.deepEqual(['0', '1', '1.1', '4.5', '5'].map((stars) => simulatedWallet(simOpts({ stars })).stars), [0, 1, 1.1, 4.5, 5]);
  assert.equal(simulatedWallet(simOpts({ sales: '2000.5' })).sales, 2_000_500_000n, 'USDC, at mainnet scale');
  await assert.rejects(scoreCommand('HTirwtNmNAmJq3id3EX3VtELmEAkAQTkyd8wrXaUqmTG', simOpts({})), usage('--simulate takes no wallet: run tessera score HTirwtNmNAmJq3id3EX3VtELmEAkAQTkyd8wrXaUqmTG, or tessera score --simulate'));
});

/** Brief 4.1: the recorded payout in deployments/rewards-demo.json, as the page shows it. */
const BRIEF_4_1 = `reviews of Glib · took an order from wren and never delivered · wren refunded in full
Scout   5/5   "Brilliant, instant."                               0×    $0.000   praised it, then it failed
Nova    4/5   "Good enough."                                      0×    $0.000   praised it, then it failed
Orbit   2/5   "Summarised the wrong text. Careful with this one." 1.5×  $0.045   warned, then it failed
reviews of Quill · kept delivering
Scout   5/5   "Exactly the two sentences I needed."               1×    $0.020   close to other buyers
Nova    5/5   "Reliable every time."                              1×    $0.020   close to other buyers
Orbit   4/5   "Fast and right."                                   1.2×  $0.024   agrees with other buyers
Wren    1/5   "Useless."                                          0.5×  $0.010   far from everyone else
reviews of Nova · kept paying
Quill   5/5   "Paid promptly."                                    1×    $0.050   nothing to compare yet

paid from the treasury: 0.169 USDC of 1.25 USDC in fees · 13.52%
reproduce: npm run build:program && npm run demo:rewards`;

function recordedRewards(): RewardsInput {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const units = (s: string) => BigInt(Math.round(Number(s) * 1e6));
  const notes: Record<string, string> = { glib: 'took an order from wren and never delivered · wren refunded in full', quill: 'kept delivering', nova: 'kept paying' };
  const failed = new Set(demo.rows.filter((r) => /then_failed|early_warning/.test(r.label)).map((r) => r.subject));
  // Whose reviews were judged against a failure first, then the rest in the order they were first reviewed.
  const subjects = [...new Set(demo.rows.map((r) => r.subject))].sort((a, b) => Number(failed.has(b)) - Number(failed.has(a)));
  return {
    groups: subjects.map((subject) => ({
      subject: cap(subject),
      note: notes[subject]!,
      rows: demo.rows
        .filter((r) => r.subject === subject)
        .map((r) => ({ reviewer: cap(r.reviewer), rating: r.rating, quote: demo.story.find((s) => s.buyer === r.reviewer && s.merchant === subject)?.comment ?? '', bps: r.bps, reward: units(r.reward), ...rewards.ACCURACY_SHORT[r.label as keyof typeof rewards.ACCURACY_SHORT] })),
    })),
    paid: units(demo.fees.paidToReviewers),
    fees: units(demo.fees.collected),
    reproduce: demo.reproduce,
  };
}

test('rewards: the recorded payout prints as brief 4.1, from the same file the page reads', () => {
  assert.equal(renderRewards(recordedRewards(), UTF8), BRIEF_4_1);
  const painted = renderRewards(recordedRewards(), BASIC);
  assert.equal(strip(painted), BRIEF_4_1);
  assert.ok(painted.includes('\x1b[92m1.5×\x1b[39m'), 'above 1x is mint');
  assert.ok(painted.includes('\x1b[33m0.5×\x1b[39m'), 'below 1x is amber');
  assert.ok(painted.includes('\x1b[33mpraised it, then it failed\x1b[39m'), 'a review that proved wrong is amber');
  assert.ok(painted.includes('\x1b[92mwarned, then it failed\x1b[39m'), 'a review that proved right is mint');
  assert.ok(painted.includes('1×    '), 'exactly 1x carries no colour');
  assert.equal(renderRewards(recordedRewards(), ASCII).split('\n')[3]!.slice(66, 72), '1.5x  ');
  assert.equal(times(12_000, UTF8), '1.2×');
  assert.equal(times(0, ASCII), '0x');
});

test('tests: one line per test with its tag, a failure under its line, and the summary counts', () => {
  const lines = [
    { title: 'A wallet nobody knows scores 0 and waits the longest hold', where: 'formula' as const, passed: true },
    { title: 'One counterparty can never grant more than the pair cap', where: 'formula + on-chain' as const, passed: true },
    { title: 'The wrong buyer, amount or escrow is refused before payment', where: 'on-chain' as const, passed: false, error: 'expected payTo to be refused' },
    { title: 'isqrt is exact', where: null, passed: true },
  ];
  assert.equal(renderTestLine(lines[0]!, UTF8), '✓ A wallet nobody knows scores 0 and waits the longest hold  formula');
  assert.equal(renderTestLine(lines[2]!, UTF8), '✗ The wrong buyer, amount or escrow is refused before payment  on-chain\n    expected payTo to be refused');
  assert.equal(renderTestLine(lines[3]!, ASCII), 'ok isqrt is exact');
  assert.equal(renderTestSummary(lines, UTF8), '3 passing · 1 failing · 2 formula · 2 on-chain');
  assert.equal(strip(renderTestSummary(lines, BASIC)), '3 passing · 1 failing · 2 formula · 2 on-chain');
  assert.ok(renderTestSummary(lines, BASIC).startsWith('\x1b[92m3 passing\x1b[39m'));
});

test('tests: a skipped or todo test is not passing, a describe block is not a test, a nested test is indented', () => {
  const lines: TestLine[] = [
    { title: 'a skipped guarantee', where: 'formula', passed: false, skip: 'skipped' },
    { title: 'a todo that fails', where: 'on-chain', passed: false, skip: 'todo' },
    { title: 'a describe block', where: null, passed: false, suite: true },
    { title: 'inside it', where: null, passed: true, depth: 1 },
    { title: 'inside it, failing', where: null, passed: false, depth: 1, error: 'one is not two' },
  ];
  assert.equal(renderTestLine(lines[0]!, UTF8), '- a skipped guarantee  formula  skipped');
  assert.equal(renderTestLine(lines[1]!, ASCII), '- a todo that fails  on-chain  todo');
  assert.equal(renderTestLine(lines[3]!, UTF8), '  ✓ inside it');
  assert.equal(renderTestLine(lines[4]!, UTF8), '  ✗ inside it, failing\n      one is not two');
  assert.equal(renderTestSummary(lines, UTF8), '1 passing · 1 failing · 1 skipped · 1 todo · 1 formula · 1 on-chain');
  assert.equal(renderTestSummary(lines.slice(0, 2), UTF8), '0 passing · 1 skipped · 1 todo · 1 formula · 1 on-chain');
});
