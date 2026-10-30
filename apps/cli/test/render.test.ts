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
