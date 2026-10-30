/**
 * The text of the tab commands (merchants, tab, settle), as pure functions:
 * plain data in, lines out, no I/O and no chain. The layouts are the
 * terminals on the landing page (docs/handoff/CLAUDE_CODE_BRIEF.md, 3.3 to
 * 3.5), held still by apps/cli/test/render.test.ts. Colour is ANSI on the
 * foreground only, never a background, and every glyph has an ASCII stand-in
 * for a terminal that is not UTF-8.
 */

export type Color = 'none' | 'basic' | 'truecolor';
export type Style = { color: Color; utf8: boolean };
/** What a piece of text is, which decides its colour (brief 3.2). A tier maps to a role through `tierRole`. */
export type Role = 'mint' | 'established' | 'building' | 'dim' | 'amber' | 'primary' | 'default';

/** The landing page's palette and the 16-colour code each falls back to. Primary and default text carry no code at all. */
const PALETTE: Record<Role, { rgb: [number, number, number]; basic: number } | null> = {
  mint: { rgb: [0x5e, 0xe6, 0xab], basic: 92 },
  established: { rgb: [0x8f, 0xe3, 0xbe], basic: 32 },
  building: { rgb: [0xa9, 0xc2, 0xb6], basic: 37 },
  dim: { rgb: [0x86, 0x91, 0x8b], basic: 90 },
  amber: { rgb: [0xf5, 0xbe, 0x55], basic: 33 },
  primary: null,
  default: null,
};

/** The same names as the SDK's TIER_NAMES, kept here so this file needs nothing else. */
export const TIERS = ['New', 'Building', 'Established', 'Trusted'] as const;
const TIER_ROLES: Role[] = ['dim', 'building', 'established', 'mint'];
export const tierRole = (tier: number): Role => TIER_ROLES[tier] ?? 'dim';

/** JSON is UTF-8 by definition and never coloured, so its short addresses always use the ellipsis. */
export const JSON_STYLE: Style = { color: 'none', utf8: true };

/**
 * How to draw for this terminal: no colour when asked (--no-color, NO_COLOR),
 * when stdout is not a terminal, or in JSON mode; truecolor when the terminal
 * says so. UTF-8 when the locale in force says so, or when no locale is set.
 */
export function styleFrom(env: Record<string, string | undefined>, isTTY: boolean, flags: { noColor?: boolean; json?: boolean } = {}): Style {
  const off = Boolean(flags.noColor || flags.json || !isTTY || env.NO_COLOR !== undefined);
  const color: Color = off ? 'none' : /truecolor|24bit/i.test(env.COLORTERM ?? '') ? 'truecolor' : 'basic';
  // The locale in force: LC_ALL overrides LC_CTYPE, which overrides LANG.
  const locale = [env.LC_ALL, env.LC_CTYPE, env.LANG].find((v) => v);
  return { color, utf8: locale === undefined || /utf-?8/i.test(locale) };
}

export function paint(text: string, role: Role, style: Style): string {
  const p = PALETTE[role];
  if (!p || style.color === 'none' || text === '') return text;
  const code = style.color === 'truecolor' ? `38;2;${p.rgb.join(';')}` : String(p.basic);
  return `\x1b[${code}m${text}\x1b[39m`;
}

const chars = (s: string): string[] => Array.from(s);
/** Characters, not bytes, so an ellipsis or a block counts once. */
export const width = (s: string): number => chars(s).length;

/** `text` in at most `w` characters: cut to w-1 and an ellipsis, or to w-3 and three dots without UTF-8, so the width holds. */
export function cut(text: string, w: number, style: Style): string {
  const c = chars(text);
  if (c.length <= w) return text;
  return style.utf8 ? `${c.slice(0, w - 1).join('')}…` : `${c.slice(0, Math.max(0, w - 3)).join('')}...`;
}

/** `text` for a column `w` wide: at most w-1 characters, so a space always separates it from the next column. */
export const fit = (text: string, w: number, style: Style): string => cut(text, w - 1, style);

/** `text` padded with spaces to `w` characters. Longer text is left as it is: cut it first. */
export const col = (text: string, w: number): string => text + ' '.repeat(Math.max(0, w - width(text)));

/** A painted column: only the text carries colour codes, so the padding keeps the next column in place. */
const cell = (text: string, w: number, role: Role, style: Style): string => paint(text, role, style) + ' '.repeat(Math.max(0, w - width(text)));

/** `Acy1…t7PW`, or `Acy1..t7PW` without UTF-8. */
export function shortAddr(a: string, style: Style): string {
  return a.length <= 9 ? a : `${a.slice(0, 4)}${style.utf8 ? '…' : '..'}${a.slice(-4)}`;
}

/** A name someone else wrote, with control and bidirectional characters out, so it cannot move the cursor or reorder the row. */
export const cleanText = (v: string): string =>
  v
    .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// ---------------------------------------------------------------- amounts

/** USDC has six decimals: every amount here is in millionths. */
const DECIMALS = 6;
const UNIT = 10n ** BigInt(DECIMALS);

/** Token units as a decimal string with exactly `dp` places. `dp` is at most six, so nothing is rounded away. */
export function amount(units: bigint, dp = 3): string {
  const places = Math.min(Math.max(dp, 0), DECIMALS);
  const whole = units / UNIT;
  const frac = (units % UNIT).toString().padStart(DECIMALS, '0').slice(0, places);
  return places ? `${whole}.${frac}` : whole.toString();
}

export const money = (units: bigint, dp = 3): string => `$${amount(units, dp)}`;

/** The fewest decimals, three or more, that print every amount exactly. */
export function decimalsFor(amounts: bigint[]): number {
  let dp = 3;
  for (const a of amounts) {
    const frac = (a % UNIT).toString().padStart(DECIMALS, '0').replace(/0+$/, '');
    dp = Math.max(dp, frac.length);
  }
  return Math.min(dp, DECIMALS);
}

// ---------------------------------------------------------------- holds and bars

/** A hold in the words the landing page uses: instant, 10 s, 2 min, 60 min, 24 h, 3 days. */
export function holdLabel(secs: number): string {
  if (secs <= 0) return 'instant';
  if (secs < 60) return `${secs} s`;
  if (secs <= 3_600) return `${Math.round(secs / 60)} min`;
  if (secs <= 86_400) return `${Math.round(secs / 3_600)} h`;
  const days = Math.round(secs / 86_400);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** Ten cells, one per hundred points, the filled ones in the tier's colour. */
export function bar(score: number, tier: number, style: Style): string {
  const filled = Math.min(10, Math.max(0, Math.round(score / 100)));
  const [on, off] = style.utf8 ? ['█', '░'] : ['#', '-'];
  return paint(on.repeat(filled), tierRole(tier), style) + paint(off.repeat(10 - filled), 'dim', style);
}

/** The settle progress bar: twenty cells over `total` steps. */
export function progress(done: number, total: number, style: Style): string {
  const share = total > 0 ? Math.min(1, Math.max(0, done / total)) : 1;
  const filled = Math.round(share * 20);
  const [on, off] = style.utf8 ? ['█', '░'] : ['#', '-'];
  return `${paint(on.repeat(filled), 'mint', style)}${paint(off.repeat(20 - filled), 'dim', style)} ${Math.round(share * 100)}%`;
}

// ---------------------------------------------------------------- merchants

export type MerchantSort = 'score' | 'name';
export type MerchantRow = {
  /** The merchant's name, or empty for a wallet without one (the short wallet is shown instead). */
  name: string;
  wallet: string;
  category: string;
  /** The name of the service it sells, or empty when its card could not be read. */
  sells: string;
  score: number;
  /** Tier index: 0 New to 3 Trusted. */
  tier: number;
  /** The hold of its own tier on the connected network. */
  holdSecs: number;
  sales: number;
  card: string | null;
};
export type MerchantsInput = { network: string; sort: MerchantSort; rows: MerchantRow[] };
export type MerchantGroup = { category: string; rows: MerchantRow[] };

const byName = (a: string, b: string): number => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

/** What stands for a merchant in a sort: its name, or for an unnamed wallet the address it is shown by. */
const label = (r: MerchantRow): string => r.name || r.wallet;

/** Merchants in the order they are printed: score descending (names break ties), or name A to Z. */
export function sortMerchants(rows: MerchantRow[], sort: MerchantSort): MerchantRow[] {
  return [...rows].sort((a, b) => (sort === 'name' ? byName(label(a), label(b)) : b.score - a.score || byName(label(a), label(b))));
}

/** Rows by category, kept in their order within a group. Groups go by their best score, or A to Z when sorting by name. */
export function groupMerchants(rows: MerchantRow[], sort: MerchantSort): MerchantGroup[] {
  const groups = new Map<string, MerchantRow[]>();
  for (const r of rows) groups.set(r.category, [...(groups.get(r.category) ?? []), r]);
  const best = (g: MerchantGroup) => Math.max(...g.rows.map((r) => r.score));
  return [...groups]
    .map(([category, members]) => ({ category, rows: members }))
    .sort((a, b) => (sort === 'name' ? byName(a.category, b.category) : best(b) - best(a) || byName(a.category, b.category)));
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The merchants table: brief 3.3, column widths 16, 21, 6, a bar of 10 and 2, 13, and the hold. */
export function renderMerchants(input: MerchantsInput, style: Style): string {
  const groups = groupMerchants(input.rows, input.sort);
  const summary = `${plural(input.rows.length, 'merchant')} · ${plural(groups.length, 'category', 'categories')} · scores from settled orders only · ${input.network}`;
  const lines = [paint(summary, 'dim', style)];
  if (!input.rows.length) return lines.join('\n');
  lines.push(paint(`${col('MERCHANT', 16)}${col('SELLS', 21)}${col('SCORE', 18)}${col('TIER', 13)}HOLD`, 'dim', style));
  for (const g of groups) {
    lines.push(paint(`# ${g.category} · ${g.rows.length}`, 'mint', style));
    for (const r of g.rows) {
      lines.push(
        cell(fit(r.name || shortAddr(r.wallet, style), 16, style), 16, 'primary', style) +
          col(fit(r.sells, 21, style), 21) +
          col(String(r.score), 6) +
          bar(r.score, r.tier, style) +
          '  ' +
          cell(TIERS[r.tier] ?? TIERS[0], 13, tierRole(r.tier), style) +
          holdLabel(r.holdSecs),
      );
    }
  }
  return lines.join('\n');
}

export function merchantsJson(input: MerchantsInput) {
  const groups = groupMerchants(input.rows, input.sort);
  return {
    network: input.network,
    count: input.rows.length,
    categories: Object.fromEntries(groups.map((g) => [g.category, g.rows.length])),
    merchants: groups.flatMap((g) =>
      g.rows.map((r) => ({
        name: r.name || shortAddr(r.wallet, JSON_STYLE),
        wallet: r.wallet,
        category: r.category,
        sells: r.sells,
        score: r.score,
        tier: TIERS[r.tier] ?? TIERS[0],
        hold: holdLabel(r.holdSecs),
        hold_seconds: r.holdSecs,
        sales: r.sales,
        card: r.card,
      })),
    ),
  };
}

// ---------------------------------------------------------------- tab

export type TabStatus = 'on_tab' | 'late' | 'in_default';
export type TabRow = {
  n: number;
  /** The merchant's on-chain name, cleaned, or empty (the short wallet is shown instead). */
  merchant: string;
  merchantWallet: string;
  /** The escrow order the loan paid for. */
  order: string;
  loan: string;
  /** What clears the loan: its price plus the pool's fee. */
  amount: bigint;
  /** Unix seconds. */
  dueAt: number;
  status: TabStatus;
};
export type TabRecord = { loans: number; repaidOnTime: number; repaidLate: number; defaults: number };
export type TabInput = {
  wallet: string;
  network: string;
  token: string;
  mint: string;
  /** The loans still owed, oldest first, numbered from 1. */
  rows: TabRow[];
  /** The wallet's credit line, when it has one. */
  record?: TabRecord | null;
};

const STATUS_TEXT: Record<TabStatus, string> = { on_tab: 'on tab', late: 'late', in_default: 'in default' };
export const tabTotal = (rows: TabRow[]): bigint => rows.reduce((sum, r) => sum + r.amount, 0n);

const recordLine = (r: TabRecord): string => `record: ${plural(r.loans, 'loan')}, ${r.repaidOnTime} on time, ${r.repaidLate} late, ${plural(r.defaults, 'default')}`;

/** The tab table: spec D9, column widths 7, 16, 12, 9 and the status, a rule of 52, then the total. */
export function renderTab(input: TabInput, style: Style): string {
  const { rows } = input;
  if (!rows.length) {
    const lines = ['no open tab · run a purchase first'];
    if (input.record) lines.push(paint(recordLine(input.record), 'dim', style));
    return lines.join('\n');
  }
  const dp = decimalsFor(rows.map((r) => r.amount));
  const lines = [
    paint(`tab ${shortAddr(input.wallet, style)} · open · pay later · ${input.network} ${input.token}`, 'dim', style),
    paint(`${col('#', 7)}${col('MERCHANT', 16)}${col('ORDER', 12)}${col('AMOUNT', 9)}STATUS`, 'dim', style),
  ];
  for (const r of rows) {
    lines.push(
      cell(`#${r.n}`, 7, 'dim', style) +
        cell(fit(r.merchant || shortAddr(r.merchantWallet, style), 16, style), 16, 'primary', style) +
        cell(shortAddr(r.order, style), 12, 'dim', style) +
        col(money(r.amount, dp), 9) +
        paint(STATUS_TEXT[r.status], 'amber', style),
    );
  }
  lines.push(paint((style.utf8 ? '─' : '-').repeat(52), 'dim', style));
  lines.push(`${col('TOTAL', 7)}${col(plural(rows.length, 'order'), 28)}${col(money(tabTotal(rows), dp), 9)}${paint('unpaid', 'amber', style)}`);
  return lines.join('\n');
}

export function tabJson(input: TabInput) {
  const dp = decimalsFor(input.rows.map((r) => r.amount));
  return {
    tab: shortAddr(input.wallet, JSON_STYLE),
    wallet: input.wallet,
    status: input.rows.length ? 'open' : 'none',
    mode: 'pay_later',
    network: input.network,
    token: input.token,
    mint: input.mint,
    orders: input.rows.map((r) => ({
      n: r.n,
      merchant: r.merchant || shortAddr(r.merchantWallet, JSON_STYLE),
      merchantWallet: r.merchantWallet,
      order: r.order,
      loan: r.loan,
      amount: amount(r.amount, dp),
      dueAt: r.dueAt,
      status: r.status,
    })),
    total: amount(tabTotal(input.rows), dp),
    paid: input.rows.length === 0,
    record: input.record ?? null,
  };
}

// ---------------------------------------------------------------- settle

export type SettleStart = { wallet: string; orders: number; payments: number };
export type SettleDone = { orders: number; payments: number; signatures: string[]; network: string };
export type SettleStatus = 'settled' | 'dry_run' | 'none' | 'failed';
export type SettleInput = {
  wallet: string;
  orders: number;
  payments: number;
  signatures: string[];
  status: SettleStatus;
  network: string;
  total: bigint;
  token: string;
  /** Why it failed, when it did. */
  reason?: string;
};

/** The explorer page of a transaction on the connected network. */
export function explorerTx(sig: string, network: string): string {
  const cluster = network === 'mainnet' ? '' : network === 'devnet' ? '?cluster=devnet' : '?cluster=custom';
  return `https://explorer.solana.com/tx/${sig}${cluster}`;
}

/** The two lines before anything is sent: the tab, then what is about to happen. */
export function renderSettleStart(i: SettleStart, style: Style): [string, string] {
  return [paint(`tab ${shortAddr(i.wallet, style)} · ${plural(i.orders, 'order')} · unpaid`, 'dim', style), `settling ${plural(i.orders, 'order')} in ${plural(i.payments, 'payment')}`];
}

/** Brief 3.5: the success line in mint, what closed, then one dim line per transaction with its explorer link. */
export function renderSettleDone(i: SettleDone, style: Style): string {
  const lines = [
    paint(`${style.utf8 ? '✓' : 'ok'} settled · ${plural(i.payments, 'signature')} · main agent`, 'mint', style),
    `${plural(i.orders, 'order')} closed · ${plural(i.payments, 'payment')} on-chain`,
    ...i.signatures.map((s) => paint(`${s}  ${explorerTx(s, i.network)}`, 'dim', style)),
  ];
  return lines.join('\n');
}

/** `✗ not settled · <reason>` in amber (`x` without UTF-8). */
export const renderSettleFail = (reason: string, style: Style): string => paint(`${style.utf8 ? '✗' : 'x'} not settled · ${reason}`, 'amber', style);

export function settleJson(i: SettleInput) {
  return {
    tab: shortAddr(i.wallet, JSON_STYLE),
    wallet: i.wallet,
    orders: i.orders,
    payments: i.payments,
    signature: i.signatures[0] ?? null,
    signatures: i.signatures,
    status: i.status,
    network: i.network,
    total: amount(i.total, decimalsFor([i.total])),
    token: i.token,
    ...(i.reason ? { reason: i.reason } : {}),
  };
}
