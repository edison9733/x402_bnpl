/**
 * The tab commands: `merchants`, `tab` and `settle`. Like the pay-later
 * commands they read the chain themselves and send nothing through the API.
 * There is no tab account on chain: a wallet's tab is the loans it still
 * owes, oldest first, and settling it is `repay` plus `close_loan` for each
 * of them, up to eight loans per transaction. The merchant list is the API's
 * own `findMerchants`, run in this process. Every line of text comes from
 * render.ts, so this file only reads, asks and sends.
 *
 *   tessera merchants [--sort score|name] [--category NAME] [--limit N]
 *   tessera tab [wallet] [--tab WALLET] [--keypair PATH]
 *   tessera settle --keypair PATH [--dry-run] [--yes]
 */
import { createInterface } from 'node:readline';
import { address, createSolanaRpc, isSolanaError, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR, type Address, type KeyPairSigner } from '@solana/kit';
import { fetchMaybeToken } from '@solana-program/token';
import { agentPdaOf, configPda, fetchMaybeAgent, fetchMaybeConfig, findAta, paylater, TIER_NAMES } from '@tessera/sdk';
import { programRefusal, readClock, REPAYS_PER_TX, repayAndClose, signInstructions, waitConfirmed } from './paylater.js';
import {
  cleanText,
  decimalsFor,
  merchantsJson,
  money,
  paint,
  progress,
  renderMerchants,
  renderSettleDone,
  renderSettleFail,
  renderSettleStart,
  renderTab,
  settleJson,
  shortAddr,
  sortMerchants,
  styleFrom,
  tabJson,
  tabTotal,
  type MerchantRow,
  type MerchantSort,
  type SettleInput,
  type SettleStatus,
  type TabInput,
  type TabRow,
} from './render.js';

export const TAB_COMMANDS = new Set(['merchants', 'tab', 'settle']);

export const TAB_HELP = `Tab (pay later, settled in one payment, reads the chain itself)
  merchants [--sort score|name] [--category NAME] [--limit N]
                                                 every merchant with its score, tier and hold, grouped by category
  tab [wallet] [--tab WALLET] [--keypair PATH]   the orders a wallet still owes
  settle --keypair PATH [--dry-run] [--yes]      pay your whole tab in one payment
Flags: --network devnet|mainnet (default devnet), --json, --no-color`;

export type TabOpts = {
  rpcUrl: string;
  /** --rpc as it was typed, when it was: the API's reader is pointed at it too. */
  rpcFlag?: string;
  kp?: KeyPairSigner;
  json: boolean;
  noColor: boolean;
  network?: string;
  sort?: string;
  category?: string;
  limit?: string;
  /** --tab or --wallet: the wallet whose tab to show. */
  tab?: string;
  wallet?: string;
  dryRun: boolean;
  yes: boolean;
  die: (m: string) => never;
  /** A mistake on the command line: exits 2. */
  usage: (m: string) => never;
};

/** Amounts are in the mint the Tessera config names: USDC, six decimals. */
const TOKEN = 'USDC';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
/** The fields of a find row the merchant list reads (apps/api/src/find.ts). */
type FindRow = { merchant: string; name: string | null; tier: string; score: number; sales: number; card: string | null; cardError?: string; service: { name: string; tags: string[] } | null };
/** The RPC the CLI reads when none is named. It rate-limits after a few quick reads. */
export const PUBLIC_DEVNET_RPC = 'https://api.devnet.solana.com';
/** The API's own second devnet endpoint (apps/api/src/chain.ts), kept behind the default so one rate-limited public RPC does not end a read. */
export const DEVNET_FALLBACK_RPC = 'https://solana-devnet.api.onfinality.io/public';

/** HTTP 429 from an RPC, as Kit reports it or as a message carries it (the API's reader wraps it in its own). */
export const rateLimited = (e: unknown): boolean =>
  (isSolanaError(e, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR) && (e.context as { statusCode?: number }).statusCode === 429) ||
  /HTTP error \(429\)/.test(e instanceof Error ? e.message : String(e));

/** What to do about a rate limit that lasts, in plain words. */
export const rateLimitMessage = (host: string): string =>
  host === new URL(PUBLIC_DEVNET_RPC).host
    ? 'the public devnet RPC is rate limiting: wait a minute or pass --rpc <your devnet RPC>'
    : `the RPC at ${host} is rate limiting: wait a minute and try again`;
/** Every skill carries these three tags; the category is the first tag that is not one of them. */
const NOT_A_CATEGORY = new Set(['x402', 'solana', 'escrow']);
const categoryOf = (service: FindRow['service']): string => service?.tags.find((t) => !NOT_A_CATEGORY.has(t)) || 'other';
const orders = (n: number) => `${n} order${n === 1 ? '' : 's'}`;

/** The label of the network the RPC serves. Mainnet is refused: nothing is deployed there yet. */
function networkOf(o: TabOpts): string {
  const want = o.network ?? 'devnet';
  if (want === 'mainnet') o.die('Tessera is not deployed on mainnet yet');
  if (want !== 'devnet') o.usage(`--network must be devnet or mainnet, not ${want}`);
  return LOCAL_HOSTS.has(new URL(o.rpcUrl).hostname) ? 'localnet' : want;
}

/** One question on stderr, so stdout stays what the command prints. */
function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    }),
  );
}

/** The exit code: 0 ok (a wallet with no tab included), 1 refused or failed, 2 a usage error. */
export async function tabCommands(cmd: string, a1: string | undefined, o: TabOpts): Promise<number> {
  const style = styleFrom(process.env, Boolean(process.stdout.isTTY), { noColor: o.noColor, json: o.json });
  const network = networkOf(o);
  const host = new URL(o.rpcUrl).host;
  const rpc = createSolanaRpc(o.rpcUrl);
  /** The program's config, read once the command line has been checked. */
  const config = async () => {
    const cfg = await fetchMaybeConfig(rpc, await configPda());
    return cfg.exists ? cfg.data : o.die(`no Tessera config on ${host}`);
  };
  /** JSON or the human text, never both: with --json nothing else reaches stdout. */
  const out = (json: unknown, text: string) => console.log(o.json ? JSON.stringify(json, null, 2) : text);
  const addr = (v: string, what: string): Address => {
    try {
      return address(v);
    } catch {
      return o.usage(`${what} is not a Solana address: ${v}`);
    }
  };

  /** A wallet's tab: the loans it still owes, oldest first, each with its merchant's on-chain name. */
  async function readTab(wallet: Address): Promise<TabInput> {
    const { mint } = await config();
    const now = (await readClock(rpc)) ?? o.die('the RPC has no clock');
    const [loans, line] = await Promise.all([paylater.fetchLoansOf(rpc, wallet), paylater.fetchMaybeCreditLine(rpc, await paylater.linePdaOf(wallet))]);
    const owed = paylater.owed(loans).sort((a, b) => Number(a.data.createdAt - b.data.createdAt));
    const names = new Map<Address, string>();
    await Promise.all(
      [...new Set(owed.map((l) => l.data.merchant))].map(async (m) => {
        const agent = await fetchMaybeAgent(rpc, await agentPdaOf(m));
        names.set(m, agent.exists ? cleanText(agent.data.name) : '');
      }),
    );
    const rows: TabRow[] = owed.map((l, k) => ({
      n: k + 1,
      merchant: names.get(l.data.merchant) ?? '',
      merchantWallet: l.data.merchant,
      order: l.data.order,
      loan: l.address,
      amount: paylater.owedOf(l.data),
      dueAt: Number(l.data.dueAt),
      status: l.data.state === paylater.LoanState.Defaulted ? 'in_default' : l.data.dueAt >= now ? 'on_tab' : 'late',
    }));
    const record = line.exists ? { loans: line.data.loans, repaidOnTime: line.data.repaidOnTime, repaidLate: line.data.repaidLate, defaults: line.data.defaults } : null;
    return { wallet, network, token: TOKEN, mint, rows, record };
  }

  if (cmd === 'merchants') {
    const sort = o.sort ?? 'score';
    if (sort !== 'score' && sort !== 'name') o.usage(`--sort must be score or name for merchants, not ${sort}`);
    const limit = o.limit === undefined ? undefined : Number(o.limit);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) o.usage(`--limit must be a whole number of at least 1, not ${o.limit}`);
    const holds = (await config()).params.holdSecs;
    // The API's reader builds its RPC from TESSERA_RPC_URLS when it is loaded, so it is pointed at this
    // RPC first: --rpc, or $TESSERA_RPC_URLS, or the devnet default with the API's own fallback behind it.
    // On a command line a card on a private address is the user's own server, so the server-side rule
    // against private addresses does not apply. The hosted demo agents sleep when idle and the first
    // request can take about 20 s, so a card gets 10 s here (the API server keeps its own 1.5 s).
    process.env.TESSERA_RPC_URLS = o.rpcFlag ?? (process.env.TESSERA_RPC_URLS || `${o.rpcUrl},${DEVNET_FALLBACK_RPC}`);
    process.env.TESSERA_ALLOW_PRIVATE_CARDS ??= '1';
    process.env.TESSERA_CARD_TIMEOUT_MS ??= '10000';
    const { cardLate, findMerchants } = await import('@tessera/api/find');
    // Every merchant, not the top 20 a find returns to an agent.
    const found = await findMerchants({ sort: 'best', all: true }).catch((e: Error) => o.die(rateLimited(e) ? rateLimitMessage(host) : `cannot read the chain at ${host}: ${e.message}`));
    const status = String(found.body.status);
    if (status !== 'ok' && status !== 'no_match') o.die(`${status}: ${String(found.body.message ?? '')}`);
    const ranked = status === 'ok' ? (found.body.ranked as FindRow[]) : [];
    let rows: MerchantRow[] = ranked.map((r) => {
      const tier = Math.max(0, TIER_NAMES.indexOf(r.tier as (typeof TIER_NAMES)[number]));
      return {
        name: cleanText(r.name ?? ''),
        wallet: r.merchant,
        category: categoryOf(r.service),
        sells: cleanText(r.service?.name ?? ''),
        score: r.score,
        tier,
        // The hold of the merchant's own tier on this network, not the find row's hold for an assumed New buyer.
        holdSecs: holds[tier] ?? 0,
        sales: r.sales,
        card: r.card,
      };
    });
    rows = sortMerchants(rows, sort as MerchantSort);
    const category = o.category?.toLowerCase();
    if (category !== undefined) rows = rows.filter((r) => r.category.toLowerCase() === category);
    if (limit !== undefined) rows = rows.slice(0, limit);
    const input = { network, sort: sort as MerchantSort, rows };
    out(merchantsJson(input), renderMerchants(input, style));
    // A card that did not answer leaves its merchant under "other" with nothing in SELLS: say why, on stderr.
    const slow = ranked.filter((r) => cardLate(r.cardError)).length;
    if (slow) console.error(`${slow} merchant card${slow === 1 ? '' : 's'} did not answer in time: the hosted agents may be waking. Try again in a minute.`);
    return 0;
  }

  if (cmd === 'tab') {
    const given = a1 ?? o.tab ?? o.wallet ?? o.kp?.address;
    if (!given) o.usage('tab needs a wallet: tessera tab <wallet>, --tab <wallet> or --keypair PATH');
    const input = await readTab(addr(given, '<wallet>'));
    out(tabJson(input), renderTab(input, style));
    return 0;
  }

  // settle: the signer's own tab, in one payment of up to REPAYS_PER_TX loans per transaction.
  const kp = o.kp ?? o.usage('settle needs --keypair PATH');
  const named = o.tab ?? o.wallet;
  if (named !== undefined && named !== kp.address) o.usage(`settle pays your own tab: the keypair is ${shortAddr(kp.address, style)}, the tab is ${shortAddr(named, style)}`);
  // It pays only after a yes. On a terminal it asks. Anywhere else (a pipe, an agent, CI) --yes must say it.
  if (!o.yes && !o.dryRun && !process.stdin.isTTY) o.usage('settle cannot ask first, as stdin is not a terminal: pass --yes to pay, or --dry-run to see the tab');
  const tab = await readTab(kp.address);
  const mint = tab.mint as Address;
  const total = tabTotal(tab.rows);
  const dp = decimalsFor(tab.rows.map((r) => r.amount));
  const payments = Math.ceil(tab.rows.length / REPAYS_PER_TX);
  const result = (status: SettleStatus, signatures: string[] = [], reason?: string): SettleInput => ({
    wallet: kp.address,
    orders: tab.rows.length,
    payments,
    signatures,
    status,
    network,
    total,
    token: TOKEN,
    ...(reason ? { reason } : {}),
  });
  if (!tab.rows.length) {
    out(settleJson(result('none')), 'no open tab · nothing to settle');
    return 0;
  }
  if (o.dryRun) {
    out(settleJson(result('dry_run')), `${renderTab(tab, style)}\n${paint('dry run · nothing paid', 'dim', style)}`);
    return 0;
  }
  const [tabLine, settlingLine] = renderSettleStart({ wallet: kp.address, orders: tab.rows.length, payments }, style);
  if (!o.json) console.log(tabLine);

  const tty = Boolean(process.stdout.isTTY) && !o.json;
  const steps = 4 * payments;
  let done = 0;
  /** The failure line goes to stderr; with --json stdout gets the same as JSON. Nothing on chain changes. */
  const fail = (reason: string, landed: string[] = []): number => {
    // An in-place bar that was not finished: leave its line before writing under it.
    if (tty && done > 0 && done < steps) process.stdout.write('\n');
    console.error(renderSettleFail(reason, style));
    if (o.json) console.log(JSON.stringify(settleJson(result('failed', landed, reason)), null, 2));
    return 1;
  };
  if (process.stdin.isTTY && !o.yes) {
    const answer = await ask(`settle ${orders(tab.rows.length)}, ${money(total, dp)}, from ${shortAddr(kp.address, style)}? [y/N] `);
    if (answer !== 'y' && answer !== 'yes') return fail('cancelled');
  }
  const token = await fetchMaybeToken(rpc, await findAta(kp.address, mint));
  const balance = token.exists ? token.data.amount : 0n;
  if (balance < total) return fail(`not enough balance (${money(total, dp)} needed, ${money(balance, dp)} in the wallet)`);
  if (!o.json) console.log(settlingLine);

  /** Four steps per transaction, drawn in place on a terminal and one line each elsewhere. */
  const step = (what: string, i: number) => {
    done += 1;
    if (o.json) return;
    if (tty) process.stdout.write(`\r${progress(done, steps, style)}${done === steps ? '\n' : ''}`);
    else console.log(`${progress(done, steps, style)} ${what} ${i + 1}/${payments}`);
  };
  /** Why a transaction did not land, in plain words. */
  const reasonOf = (e: unknown): string => {
    const refused = programRefusal(e);
    if (refused) return `refused by the program: ${refused}`;
    const text = e instanceof Error ? e.message : String(e);
    if (/signature verification|invalid signature|signature.*rejected|rejected.*signature/i.test(text)) return 'a rejected signature';
    if (e instanceof TypeError || /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|HTTP error|timed? ?out|aborted|network/i.test(text)) return `a network error (${host})`;
    return `refused by the program: ${text}`;
  };
  const signatures: string[] = [];
  const after = (reason: string) => (signatures.length ? `${reason}, after ${signatures.length} of ${payments} payments landed` : reason);
  for (let i = 0; i < payments; i += 1) {
    const loans = tab.rows.slice(i * REPAYS_PER_TX, (i + 1) * REPAYS_PER_TX).map((r) => r.loan as Address);
    const ixs = (await Promise.all(loans.map((loan) => repayAndClose(mint, loan, kp.address, kp)))).flat();
    step('build', i);
    let signed: Awaited<ReturnType<typeof signInstructions>>;
    try {
      signed = await signInstructions(rpc, kp, ixs);
    } catch (e) {
      return fail(after(reasonOf(e)), signatures);
    }
    step('sign', i);
    try {
      await rpc.sendTransaction(signed.wire, { encoding: 'base64', preflightCommitment: 'confirmed' }).send();
    } catch (e) {
      return fail(after(reasonOf(e)), signatures);
    }
    step('send', i);
    let status: Awaited<ReturnType<typeof waitConfirmed>>;
    try {
      status = await waitConfirmed(rpc, signed.sig);
    } catch (e) {
      return fail(after(reasonOf(e)), signatures);
    }
    if (status === 'failed') return fail(after(`the transaction ${shortAddr(signed.sig, style)} failed on-chain`), signatures);
    if (status === 'timeout') return fail(after('the transaction was not confirmed within 60 s'), signatures);
    step('confirm', i);
    signatures.push(signed.sig);
  }
  out(settleJson(result('settled', signatures)), renderSettleDone({ orders: tab.rows.length, payments, signatures, network }, style));
  return 0;
}
