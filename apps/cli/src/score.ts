/**
 * `tessera score`: a wallet's score, factor by factor, with the real inputs
 * behind each one. It reads the wallet's account and the config from the
 * chain itself and runs the SDK's `score.breakdown`, the same function the
 * score page runs, then compares the SDK's result with the score the program
 * stored on the account, for the moment the program stored it. `--simulate`
 * runs the same function on made-up inputs at mainnet scale, so the rules can
 * be tried without a wallet.
 *
 *   tessera score <wallet> [--network devnet] [--json] [--no-color]
 *   tessera score --simulate [--preset NAME] [--sales USDC] [--buyers N] [--buyer-tier T] [--active DAYS] [--stars N] [--disputes N]
 */
import { address, createSolanaRpc, type Address } from '@solana/kit';
import { agentPdaOf, configPda, DEVNET_PARAMS, fetchMaybeAgent, fetchMaybeConfig, MAINNET_TARGET_PARAMS, score, simulate, TIER_NAMES } from '@tessera/sdk';
import { readClock } from './paylater.js';
import { renderScore, renderScoreMismatch, scoreJson, styleFrom, type ScoreInput } from './render.js';

export const SCORE_COMMANDS = new Set(['score']);

export const SCORE_HELP = `  score <wallet>                                 a wallet's score, factor by factor, checked against the program
  score --simulate [--preset NAME] [--sales USDC] [--buyers N] [--buyer-tier new|building|established|trusted]
                   [--active DAYS] [--stars N] [--disputes N]
                                                 the same rules on made-up inputs, at mainnet scale
                                                 --sales     USDC, total sold at mainnet scale
                                                 --active    days with a reviewed sale
                                                 --stars     1 to 5, 0 for no reviews
                                                 --disputes  disputes lost
                                                 presets: ${simulate.PRESETS.map((p) => p.id).join(', ')}`;

export type ScoreOpts = {
  rpcUrl: string;
  json: boolean;
  noColor: boolean;
  network?: string;
  simulate: boolean;
  preset?: string;
  sales?: string;
  buyers?: string;
  buyerTier?: string;
  active?: string;
  stars?: string;
  disputes?: string;
  die: (m: string) => never;
  usage: (m: string) => never;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const USDC = 1_000_000n;

/** The label of the network the RPC serves. Mainnet is refused: nothing is deployed there yet. */
function networkOf(o: ScoreOpts): string {
  const want = o.network ?? 'devnet';
  if (want === 'mainnet') o.die('Tessera is not deployed on mainnet yet');
  if (want !== 'devnet') o.usage(`--network must be devnet or mainnet, not ${want}`);
  return LOCAL_HOSTS.has(new URL(o.rpcUrl).hostname) ? 'localnet' : want;
}

function num(v: string | undefined, what: string, o: ScoreOpts, integer = true): number | undefined {
  if (v === undefined) return undefined;
  // Number('') is 0, so an empty value would pass for a zero.
  if (v.trim() === '') o.usage(`${what} needs a value`);
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) o.usage(`${what} must be a ${integer ? 'whole number' : 'number'} of 0 or more, not ${v}`);
  return n;
}

function tierOf(v: string | undefined, o: ScoreOpts): 0 | 1 | 2 | 3 | undefined {
  if (v === undefined) return undefined;
  const i = /^[0-3]$/.test(v) ? Number(v) : TIER_NAMES.findIndex((n) => n.toLowerCase() === v.toLowerCase());
  if (i < 0) o.usage(`--buyer-tier must be one of ${TIER_NAMES.map((n) => n.toLowerCase()).join(', ')}, not ${v}`);
  return i as 0 | 1 | 2 | 3;
}

/** The wallet `--simulate` scores: a preset, then every flag given on top of it. */
export function simulatedWallet(o: ScoreOpts): simulate.Wallet {
  const preset = o.preset === undefined ? simulate.presetById('small-honest-shop')! : simulate.presetById(o.preset);
  if (!preset) o.usage(`--preset must be one of ${simulate.PRESETS.map((p) => p.id).join(', ')}, not ${o.preset}`);
  const sales = num(o.sales, '--sales', o, false);
  const stars = num(o.stars, '--stars', o, false);
  if (stars !== undefined && stars !== 0 && (stars < 1 || stars > 5)) o.usage(`--stars must be from 1 to 5, or 0 for no reviews, not ${o.stars}`);
  // Reviews are whole stars, so an average is kept to tenths: 4.55 would quietly become 4.6.
  if (stars !== undefined && Math.abs(stars * 10 - Math.round(stars * 10)) > 1e-9) o.usage(`--stars takes one decimal at most, not ${o.stars}`);
  return {
    sales: sales === undefined ? preset.w.sales : BigInt(Math.round(sales * 100)) * (USDC / 100n),
    buyers: num(o.buyers, '--buyers', o) ?? preset.w.buyers,
    buyerTier: tierOf(o.buyerTier, o) ?? preset.w.buyerTier,
    activePeriods: num(o.active, '--active', o) ?? preset.w.activePeriods,
    stars: stars ?? preset.w.stars,
    disputesLost: num(o.disputes, '--disputes', o) ?? preset.w.disputesLost,
  };
}

/** The exit code: 0 ok, 1 when the program's stored score and the SDK disagree, or on failure, 2 a usage error. */
export async function scoreCommand(a1: string | undefined, o: ScoreOpts): Promise<number> {
  const style = styleFrom(process.env, Boolean(process.stdout.isTTY), { noColor: o.noColor, json: o.json });
  const out = (json: unknown, text: string) => console.log(o.json ? JSON.stringify(json, null, 2) : text);

  if (o.simulate) {
    if (a1) o.usage(`--simulate takes no wallet: run tessera score ${a1}, or tessera score --simulate`);
    const w = simulatedWallet(o);
    const p = MAINNET_TARGET_PARAMS;
    const s = simulate.simulate(w, p);
    const b = score.breakdown(s.agent, p, s.now);
    const input: ScoreInput = {
      wallet: '',
      simulated: true,
      network: 'mainnet scale',
      counterparties: w.buyers,
      activePeriods: w.activePeriods,
      b,
      other: { network: 'devnet', holdSecs: DEVNET_PARAMS.holdSecs[b.e.tier]! },
      program: null,
      noFile: false,
    };
    out(scoreJson(input, p, s.agent.credit, s.agent.counterpartyPoints), renderScore(input, style));
    return 0;
  }

  if (!a1) o.usage('score needs a wallet, or --simulate');
  let wallet: Address;
  try {
    wallet = address(a1);
  } catch {
    return o.usage(`not a Solana address: ${a1}`);
  }
  const network = networkOf(o);
  const host = new URL(o.rpcUrl).host;
  const rpc = createSolanaRpc(o.rpcUrl);
  const cfg = await fetchMaybeConfig(rpc, await configPda());
  if (!cfg.exists) o.die(`no Tessera config on ${host}`);
  const p = cfg.data.params;
  const now = (await readClock(rpc)) ?? BigInt(Math.floor(Date.now() / 1000));
  const acct = await fetchMaybeAgent(rpc, await agentPdaOf(wallet));
  const a: score.ScoreAgent = acct.exists
    ? acct.data
    : { registeredAt: now, credit: 0n, counterpartyPoints: 0, activePeriods: 0, feesPaid: 0n, penaltyBps: 0, penaltyPeriod: 0n, ratingSum: 0n, ratingWeight: 0n };
  const b = score.breakdown(a, p, now);
  // The program stored its score at `scoreUpdatedAt`: the SDK must give the same number for that moment.
  // The breakdown above is for now, so the two differ once time has moved tenure or a penalty on.
  const program = acct.exists ? { score: acct.data.score, sdk: score.evaluate(acct.data, p, acct.data.scoreUpdatedAt).score, at: Number(acct.data.scoreUpdatedAt) } : null;
  const input: ScoreInput = {
    wallet,
    simulated: false,
    network,
    counterparties: acct.exists ? acct.data.counterparties : 0,
    activePeriods: a.activePeriods,
    b,
    other: { network: 'mainnet target', holdSecs: MAINNET_TARGET_PARAMS.holdSecs[b.e.tier]! },
    program,
    noFile: !acct.exists,
  };
  out(scoreJson(input, p, a.credit, a.counterpartyPoints), renderScore(input, style));
  if (program && program.score !== program.sdk) {
    console.error(renderScoreMismatch(program.score, program.sdk, styleFrom(process.env, Boolean(process.stderr.isTTY), { noColor: o.noColor })));
    return 1;
  }
  return 0;
}
