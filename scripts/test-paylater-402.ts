/**
 * Pay later over x402, end to end, with the real merchant server on a local
 * validator running both programs:
 *
 *   - a merchant's 402 offers the order on credit (scheme tessera-paylater)
 *     after the exact entry of its facilitator (a stub here, answering
 *     /supported), with the buyer's live limit and whether the pool would
 *     fund it;
 *   - a buyer with a tier hands over a signed buy_now, the merchant signs it
 *     as fee payer (its ops wallet) and as the order's merchant (its own key,
 *     which buy_now requires), the pool pays the escrow, the merchant
 *     delivers, and the buyer repays the tab with `tessera repay --all`;
 *   - the same purchase through the CLI (`tessera buy-later <url> <skill>`),
 *     through the buyer agent over A2A (`--pay-later`) and through the
 *     plain-HTTP buyer script (`npm run buy:http -- --pay-later`);
 *   - a New wallet is told it is not eligible, so is a buyer at a New
 *     merchant, and a forged header (no credit, another order, another fee
 *     payer, an extra instruction, a cancel_unpaid after the buy_now, a
 *     compute unit limit above BUY_NOW_COMPUTE_UNITS, a second unit limit, a
 *     priority fee above the cap, a buy_now naming another escrow program, no
 *     buyer signature, a buy_now that does not ask for the merchant's
 *     signature, a signer more, the merchant asked to sign writable, a
 *     signature already in the merchant's place, an entry that was not
 *     quoted) is refused before the merchant signs anything;
 *   - the buy_now the merchant sends carries three signatures (ops wallet,
 *     buyer, the order's merchant), confirms the order itself (no separate
 *     confirm_funded), and the compute units it used leave at least 30% of
 *     BUY_NOW_COMPUTE_UNITS spare;
 *   - the server's keeper marks a loan in default once its grace period has
 *     passed, and the buyer's line is frozen.
 *
 *   npm run build:program && npm run test:paylater-402
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  AccountRole,
  appendTransactionMessageInstructions,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  lamports,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
  type Signature,
} from '@solana/kit';
import { getSetComputeUnitPriceInstruction } from '@solana-program/compute-budget';
import { getCreateAccountInstruction, getTransferSolInstruction } from '@solana-program/system';
import { getInitializeMint2Instruction, getMintSize, getMintToInstruction, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import {
  agentPdaOf,
  configPda,
  fetchAgent,
  fetchConfig,
  fetchOrder,
  fromUnits,
  getCancelUnpaidInstructionAsync,
  getConfirmFundedInstructionAsync,
  getDeliverInstructionAsync,
  getEnsureAgentInstructionAsync,
  getInitializeInstructionAsync,
  getOpenOrderInstructionAsync,
  getReleaseInstruction,
  getSubmitReviewInstructionAsync,
  newOrderId,
  orderAddresses,
  OrderState,
  pairPdaOf,
  paylater,
  programDataAddress,
  score,
  settleAccounts,
  sha256,
  SOLANA_DEVNET,
  TESSERA_PROGRAM_ADDRESS,
  type Params,
} from '@tessera/sdk';
import { ADVERSARIES, keyPath, MERCHANTS } from './cast.js';
import { chainTime, clientForSigner, errText, generateKeypairBytes, log, REPO_ROOT, sleep, tokenHelpers, waitForChainTime, type Cluster, type ScriptClient } from './lib.js';

// Its own ports, so it never attaches to another suite's validator or server.
const RPC_PORT = Number(process.env.PAYLATER_402_RPC_PORT ?? 19699);
const AGENTS_PORT = Number(process.env.PAYLATER_402_AGENTS_PORT ?? 19421);
const LOCAL: Cluster = { rpcUrl: `http://127.0.0.1:${RPC_PORT}` };
const AGENTS = `http://127.0.0.1:${AGENTS_PORT}`;
const USDC = 1_000_000n;
const PAYLATER = paylater.TESSERA_PAYLATER_PROGRAM_ADDRESS;

// The escrow's compressed local params: 2-second periods. The payment and
// delivery windows are two minutes: the merchant refuses a payment within 30 s
// of the end of its window, and an HTTP round trip must fit before that.
const PARAMS: Params = {
  periodSecs: 2,
  holdSecs: [4, 3, 2, 0],
  tierScore: [100, 300, 500],
  tierPeriods: [1, 2, 3],
  creditFull: USDC,
  pairCap: USDC,
  tenureFull: 4,
  diversityFull: 20,
  reviewPrior: USDC / 100n,
  minOrder: 1_000n,
  deliverSecs: 120,
  unpaidSecs: 120,
  reviewSecs: 20,
  complaintSecs: 32,
  instantBase: USDC / 2n,
  instantFeePct: 100,
  pairHistoryMin: 2,
  pairAgeSecs: 2,
  penaltyDisputeBps: 2500,
  penaltyExpiredBps: 1000,
  penaltyDecayBps: 100,
};

// 30 seconds to repay, 4 of grace: a default can be watched.
const LINE: paylater.LineParams = {
  tierLimit: [0n, 2n * USDC, 5n * USDC, 10n * USDC],
  stepBps: 2_500,
  maxBoostBps: 10_000,
  termSecs: 30,
  graceSecs: 4,
  feeBps: 200,
  minMerchantTier: 1,
  minLoan: 1_000n,
};

let checks = 0;
let failures = 0;
const show = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? `${x}n` : x));
function ok(label: string, cond: boolean, detail?: unknown): void {
  checks += 1;
  if (cond) log.ok(label);
  else {
    failures += 1;
    console.log(`   FAIL ${label}${detail === undefined ? '' : `: ${show(detail).slice(0, 700)}`}`);
  }
}
function eq(label: string, actual: unknown, expected: unknown): void {
  ok(label, show(actual) === show(expected), { actual, expected });
}

const so = (name: string) => {
  const p = resolve(REPO_ROOT, `target/deploy/${name}.so`);
  if (!existsSync(p)) throw new Error(`${p} is missing: run \`npm run build:program\` first`);
  return p;
};
const tsx = createRequire(import.meta.url).resolve('tsx/cli');
const keyBytes = new Map<string, Uint8Array>();
const role = async () => {
  const { signer, bytes } = await generateKeypairBytes();
  keyBytes.set(signer.address, bytes);
  return clientForSigner(signer, LOCAL);
};
const deployer = await role();
const ledger = mkdtempSync(join(tmpdir(), 'tessera-paylater-402-ledger-'));
const keydir = mkdtempSync(join(tmpdir(), 'tessera-paylater-402-keys-'));
const datadir = mkdtempSync(join(tmpdir(), 'tessera-paylater-402-data-'));
const children: ChildProcess[] = [];
const stubs: ReturnType<typeof createServer>[] = [];
const validator = spawn(
  'solana-test-validator',
  [
    '--reset', '--quiet', '--ledger', ledger, '--rpc-port', String(RPC_PORT), '--faucet-port', String(RPC_PORT + 1001),
    '--upgradeable-program', TESSERA_PROGRAM_ADDRESS, so('tessera'), deployer.identity.address,
    '--upgradeable-program', PAYLATER, so('tessera_paylater'), deployer.identity.address,
  ],
  { stdio: 'ignore' },
);
children.push(validator);
let serverLog = '';

async function waitFor(url: string, tries = 240): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(url, url === LOCAL.rpcUrl ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' } : {});
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error(`${url} did not come up`);
}

type PayLaterRequirement = { scheme: string; network: string; asset: string; amount: string; payTo: string; maxTimeoutSeconds: number; extra: Record<string, unknown> };
type Required402 = { x402Version: number; accepts: PayLaterRequirement[]; extensions: { tessera: Record<string, unknown> & { order: string; vault: string; payLater?: paylater.PayLaterOffer } } };
type Answer = { status: number; headers: Headers; body: Record<string, any> };
async function get(path: string, headers: Record<string, string> = {}): Promise<Answer> {
  const res = await fetch(`${AGENTS}${path}`, { headers });
  return { status: res.status, headers: res.headers, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}
const header = (payload: unknown) => ({ 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify(payload), 'utf8').toString('base64') });
const decodeReceipt = (h: string | null) => (h ? (JSON.parse(Buffer.from(h, 'base64').toString('utf8')) as { success: boolean; transaction: string; payer?: string }) : null);

try {
  await waitFor(LOCAL.rpcUrl);
  const [server, arbiter, treasury, buyer, helper, m2, fresh] = await Promise.all([role(), role(), role(), role(), role(), role(), role()]);
  // The server runs every merchant of the cast; only atlas trades here, the rest just need keys.
  const cast = new Map<string, ScriptClient>();
  for (const m of [...MERCHANTS, ...ADVERSARIES.filter((a) => a.role === 'merchant')]) cast.set(m.id, await role());
  const atlas = cast.get('atlas')!;
  const everyone = [deployer, server, arbiter, treasury, buyer, helper, m2, fresh, ...cast.values()];
  for (const c of everyone) await deployer.rpc.requestAirdrop(c.identity.address, lamports(20_000_000_000n)).send();
  for (let i = 0; i < 60; i += 1) {
    if ((await deployer.rpc.getBalance(everyone.at(-1)!.identity.address).send()).value > 0n) break;
    await sleep(250);
  }
  const rpc = server.rpc;

  log.step('Setup: a test mint, the escrow program, credit files');
  const mintSigner = (await generateKeypairBytes()).signer;
  const space = BigInt(getMintSize());
  await server.sendTransaction([
    getCreateAccountInstruction({ payer: server.identity, newAccount: mintSigner, lamports: await rpc.getMinimumBalanceForRentExemption(space).send(), space, programAddress: TOKEN_PROGRAM_ADDRESS }),
    getInitializeMint2Instruction({ mint: mintSigner.address, decimals: 6, mintAuthority: server.identity.address, freezeAuthority: null }),
  ]);
  const mint = mintSigner.address;
  const tok = tokenHelpers(server, mint);
  for (const c of [server, treasury, atlas, m2, buyer, helper, fresh]) await server.sendTransaction([await tok.ensureAtaIx(c.identity.address)]);
  for (const c of [server, atlas, m2, buyer, helper, fresh]) {
    await server.sendTransaction([getMintToInstruction({ mint, token: await tok.ata(c.identity.address), mintAuthority: server.identity, amount: 100n * USDC })]);
  }
  await deployer.sendTransaction([
    await getInitializeInstructionAsync({ authority: deployer.identity, mint, arbiter: arbiter.identity.address, treasury: treasury.identity.address, programData: await programDataAddress(), feeBps: 100, params: PARAMS }),
  ]);
  for (const c of [atlas, m2, buyer, helper, fresh]) await server.sendTransaction([await getEnsureAgentInstructionAsync({ wallet: c.identity.address, payer: server.identity })]);
  log.ok(`mint ${mint}, escrow initialised`);

  // ---------------------------------------- escrow history earns the tiers
  const requestHash = await sha256('GET /report?wallet=demo');
  async function escrowOrder(b: ScriptClient, m: ScriptClient, amount: bigint): Promise<void> {
    const id = newOrderId();
    const { order, vault } = await orderAddresses(id, mint);
    await server.sendTransaction([
      await getOpenOrderInstructionAsync({ mint, buyer: b.identity.address, merchant: m.identity, payer: server.identity, orderId: id, amount, requestHash, minHoldSecs: 0 }),
    ]);
    await b.sendTransaction([await tok.transferIx(b, vault, amount), await getConfirmFundedInstructionAsync({ order, mint })]);
    await m.sendTransaction([await getDeliverInstructionAsync({ order, merchant: m.identity, deliveryHash: requestHash })]);
    const settle = await settleAccounts(order, { buyer: b.identity.address, merchant: m.identity.address, mint, payer: server.identity.address }, treasury.identity.address);
    for (let i = 0; ; i += 1) {
      try {
        await b.sendTransaction([getReleaseInstruction({ ...settle, authority: b.identity })]);
        break;
      } catch (e) {
        if (i > 20) throw e;
        await sleep(500);
      }
    }
    const pair = await pairPdaOf(b.identity.address, m.identity.address);
    for (const [reviewer, subject] of [[b, m], [m, b]] as const) {
      await reviewer.sendTransaction([
        await getSubmitReviewInstructionAsync({ order, subject: subject.identity.address, pair, reviewer: reviewer.identity, payer: reviewer.identity, rating: 5, text: 'Good trade.' }),
      ]);
    }
  }
  const cfgParams = (await fetchConfig(rpc, await configPda())).data.params;
  const live = async (c: ScriptClient) => score.evaluate((await fetchAgent(rpc, await agentPdaOf(c.identity.address))).data, cfgParams, await chainTime(server));

  log.step('Earning Tessera tiers through real escrow orders (a few periods)');
  const traders: [ScriptClient, ScriptClient][] = [[buyer, atlas], [helper, atlas], [buyer, m2], [helper, m2], [atlas, m2], [m2, atlas]];
  for (let round = 0; round < 12; round += 1) {
    for (const [b, m] of traders) await escrowOrder(b, m, USDC / 2n);
    const tiers = await Promise.all([buyer, helper, atlas].map(async (c) => (await live(c)).tier));
    log.info(`round ${round + 1}: tiers buyer ${tiers[0]}, helper ${tiers[1]}, atlas ${tiers[2]}`);
    if (tiers.every((t) => t >= 2)) break;
  }
  ok('the buyer, the helper and atlas have earned at least Established', (await live(buyer)).tier >= 2 && (await live(helper)).tier >= 2 && (await live(atlas)).tier >= 2);
  eq('the fresh wallet is still New', (await live(fresh)).tier, 0);

  log.step('The pool');
  const pool = await paylater.poolPda();
  await deployer.sendTransaction([await paylater.getInitializeInstructionAsync({ authority: deployer.identity, mint, programData: await programDataAddress(PAYLATER), params: LINE })]);
  await server.sendTransaction([await paylater.getDepositInstructionAsync({ mint, funder: server.identity, funderToken: await tok.ata(server.identity.address), amount: 50n * USDC })]);
  eq('the pool holds 50 USDC', await tok.balance(pool), 50n * USDC);

  // ------------------------------------------------------- the merchant server
  log.step('The merchant server, with key files of its own');
  // Its `.keys/` is in a temporary directory, so the repo's own key files, if any, are neither used nor touched.
  const keyFile = (path: string, c: ScriptClient) => {
    const full = join(keydir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, JSON.stringify(Array.from(keyBytes.get(c.identity.address)!)), { mode: 0o600 });
  };
  keyFile('.keys/server.json', server);
  keyFile('.keys/arbiter.json', arbiter);
  for (const [id, c] of cast) keyFile(keyPath(id), c);
  // A stub x402 facilitator that only answers /supported, so every 402 carries
  // an exact entry (with this fee payer) before the pay-later one. Nobody pays
  // through it here, so /verify and /settle are not served.
  const facilitatorFeePayer = (await generateKeypairBytes()).signer.address;
  const facilitator = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/supported') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return void res.end(JSON.stringify({ kinds: [{ x402Version: 2, scheme: 'exact', network: SOLANA_DEVNET, extra: { feePayer: facilitatorFeePayer } }], extensions: [], signers: {} }));
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => facilitator.listen(0, '127.0.0.1', r));
  stubs.push(facilitator);
  const facilitatorUrl = `http://127.0.0.1:${(facilitator.address() as { port: number }).port}`;
  const serverEnv = {
    ...process.env,
    TESSERA_KEYS_DIR: keydir,
    SOLANA_RPC_URL: LOCAL.rpcUrl,
    SOLANA_RPC_FALLBACKS: '',
    RPC_BUDGET_PER_10S: '100000',
    AGENT_HOST: AGENTS,
  };
  const agents = spawn(process.execPath, [tsx, resolve(REPO_ROOT, 'apps/agents/src/server.ts')], {
    env: {
      ...serverEnv,
      PORT: String(AGENTS_PORT),
      HOST: '127.0.0.1',
      FACILITATOR_URLS: facilitatorUrl,
      TESSERA_DATA_DIR: datadir,
      CRANK_MS: '2000',
      KEEPER_MS: '3000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  children.push(agents);
  agents.stdout!.on('data', (d: Buffer) => (serverLog += d.toString()));
  agents.stderr!.on('data', (d: Buffer) => (serverLog += d.toString()));
  await waitFor(`${AGENTS}/health`);
  ok('the server says the pool is on this network and that it marks overdue loans', /pay later: pool .* marks overdue loans/.test(serverLog), serverLog.slice(-400));
  ok('and that it found the (stub) facilitator', new RegExp(`facilitators: ${facilitatorUrl}`).test(serverLog), serverLog.slice(-600));
  const ops = server.identity.address;
  const B = buyer.identity.address;
  const price = 200_000n; // atlas, telemetry: 0.20 USDC

  // ---------------------------------------------------------- 1. the quote
  log.step('1. The 402 offers the order on credit, after the exact entry');
  const lineNow = await paylater.fetchMaybeCreditLine(rpc, await paylater.linePdaOf(B));
  const l0 = lineNow.exists ? lineNow.data : paylater.NO_LINE;
  const tQuote0 = await chainTime(server);
  const q1 = await get(`/agents/atlas/x402/telemetry?buyer=${B}`);
  const tQuote1 = await chainTime(server);
  const r1 = q1.body as Required402;
  ok('GET without a payment is 402', q1.status === 402, q1.body);
  if (q1.status !== 402) throw new Error(`no quote: ${show(q1.body)}`);
  const credit1 = r1.accepts.at(-1);
  eq('accepts is the facilitator\'s exact entry first, then tessera-paylater', [r1.accepts.length, r1.accepts[0]?.scheme, r1.accepts[0]?.extra?.feePayer, credit1?.scheme], [2, 'exact', facilitatorFeePayer, paylater.X402_SCHEME]);
  eq('same asset, same price, payTo the order', [credit1?.asset, credit1?.amount, credit1?.payTo], [mint, price.toString(), r1.extensions.tessera.order]);
  const offer1 = credit1?.extra as paylater.PayLaterOffer;
  eq('extra names the program, the pool and the merchant\'s ops wallet as fee payer', [offer1.program, offer1.pool, offer1.feePayer], [PAYLATER, pool, ops]);
  // The live score moves with the clock, so the limit is the formula at one
  // of the chain times the quote could have been read at.
  const agentB = (await fetchAgent(rpc, await agentPdaOf(B))).data;
  const limitsThen = new Set<string>();
  for (let t = tQuote0; t <= tQuote1 + 1n; t += 1n) {
    const e = score.evaluate(agentB, cfgParams, t);
    limitsThen.add(paylater.limit(l0, LINE, e.tier, e.score).toString());
  }
  ok('buyerLimit is the SDK formula on the live credit file and line at the time of the quote, outstanding 0, eligible', BigInt(offer1.buyerLimit) > 0n && limitsThen.has(offer1.buyerLimit) && offer1.buyerOutstanding === '0' && offer1.eligible === true, { offer1, limitsThen: [...limitsThen] });
  eq('fee and term are the pool\'s rules', [offer1.fee, offer1.termSecs], [paylater.feeOf(price, LINE).toString(), LINE.termSecs]);
  eq('the same facts sit under extensions.tessera.payLater', r1.extensions.tessera.payLater, offer1);
  ok('the PAYMENT-REQUIRED header carries the same 402', Buffer.from(q1.headers.get('PAYMENT-REQUIRED') ?? '', 'base64').toString('utf8') === JSON.stringify(q1.body));

  // ------------------------------------------------------- 2. buy on credit
  log.step('2. A tiered buyer pays with a signed buy_now; the merchant settles and delivers');
  const order1 = r1.extensions.tessera.order as Address;
  const buyerUsdc = await tok.balance(B);
  const poolBefore = await tok.balance(pool);
  const built1 = await paylater.buyNowForMerchant(buyer.rpc, buyer.identity, order1, ops);
  const payload1 = { x402Version: 2, accepted: credit1, payload: { transaction: built1.transaction } };
  const paid1 = await get(`/agents/atlas/x402/telemetry`, header(payload1));
  eq('GET with the PAYMENT-SIGNATURE header is 200', paid1.status, 200, );
  ok('the result is atlas\'s telemetry', typeof paid1.body.result?.slot === 'number' && paid1.body.result.slot > 0, paid1.body);
  eq('the escrow in the answer is this order', paid1.body.escrow?.order, order1);
  const receipt1 = decodeReceipt(paid1.headers.get('PAYMENT-RESPONSE'));
  ok('PAYMENT-RESPONSE is a receipt with the buy_now signature and the buyer as payer', receipt1?.success === true && typeof receipt1.transaction === 'string' && receipt1.transaction.length > 40 && receipt1.payer === B, receipt1);
  const o1 = (await fetchOrder(rpc, order1)).data;
  ok('the order was confirmed funded and delivered', [OrderState.Delivered, OrderState.Released].includes(o1.state), OrderState[o1.state]);
  ok('the buy_now itself confirmed the order: funded in the slot the loan opened, no separate confirm_funded', o1.fundedAt > 0n && o1.fundedAt === (await paylater.fetchLoan(rpc, built1.loan)).data.createdAt, o1);
  const loan1 = await paylater.fetchMaybeLoan(rpc, built1.loan);
  ok('the loan is open for the price, on this order', loan1.exists && loan1.data.state === paylater.LoanState.Open && loan1.data.amount === price && loan1.data.order === order1, loan1);
  eq('the pool paid the price, the buyer paid nothing', [poolBefore - (await tok.balance(pool)), await tok.balance(B)], [price, buyerUsdc]);
  // The merchant's transaction: a unit limit of BUY_NOW_COMPUTE_UNITS and the buy_now, which opened this buyer's line and its first loan.
  const sent1 = await rpc.getTransaction(receipt1!.transaction as Signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0, encoding: 'json' }).send();
  const units1 = Number(sent1?.meta?.computeUnitsConsumed ?? 0n);
  log.info(`the merchant's buy_now transaction used ${units1} compute units (BUY_NOW_COMPUTE_UNITS is ${paylater.BUY_NOW_COMPUTE_UNITS})`);
  ok('it leaves at least 30% of BUY_NOW_COMPUTE_UNITS spare', units1 > 0 && units1 <= paylater.BUY_NOW_COMPUTE_UNITS * 0.7, units1);
  // buy_now requires the order's merchant's signature, so the pool only funds
  // orders their merchant agreed to: the server signed with atlas's key as
  // well as with its ops wallet.
  const msg1 = sent1?.transaction.message;
  const signers1 = msg1 ? msg1.accountKeys.slice(0, msg1.header.numRequiredSignatures) : [];
  ok('it carries three signatures: the ops wallet as fee payer, the buyer, and atlas, the order\'s merchant, read-only', signers1.length === 3 && signers1[0] === ops && signers1.includes(B) && signers1.includes(atlas.identity.address) && sent1?.transaction.signatures.length === 3 && msg1!.accountKeys.indexOf(atlas.identity.address) >= 3 - msg1!.header.numReadonlySignedAccounts, { signers1, header: msg1?.header });
  const logs1 = sent1?.meta?.logMessages ?? [];
  ok('its logs show the escrow\'s confirm_funded running inside buy_now, by CPI', logs1.includes(`Program ${TESSERA_PROGRAM_ADDRESS} invoke [2]`) && logs1.includes('Program log: Instruction: ConfirmFunded'), logs1);
  const again = await get(`/agents/atlas/x402/telemetry`, header(payload1));
  ok('the same header again gets the same delivery back, and opens no second loan', again.status === 200 && again.body.escrow?.order === order1 && (await paylater.fetchLoansOf(rpc, B)).length === 1, again.body);

  // ------------------------------------------------------- 3. the CLI form
  log.step('3. tessera buy-later <merchant url> <skill> runs the same flow');
  const run = (script: string, args: string[], env: Record<string, string | undefined> = process.env) =>
    new Promise<{ status: number | null; stdout: string; stderr: string }>((done) => {
      const p = spawn(process.execPath, [tsx, resolve(REPO_ROOT, script), ...args], { env });
      let stdout = '';
      let stderr = '';
      p.stdout.on('data', (d) => (stdout += d));
      p.stderr.on('data', (d) => (stderr += d));
      p.on('close', (status) => done({ status, stdout, stderr }));
    });
  const cli = (args: string[]) => run('apps/cli/src/cli.ts', [...args, '--rpc', LOCAL.rpcUrl]);
  const buyerKey = join(keydir, 'buyer.json');
  writeFileSync(buyerKey, JSON.stringify(Array.from(keyBytes.get(B)!)), { mode: 0o600 });
  const freshKey = join(keydir, 'fresh.json');
  writeFileSync(freshKey, JSON.stringify(Array.from(keyBytes.get(fresh.identity.address)!)), { mode: 0o600 });
  const bought = await cli(['buy-later', `${AGENTS}/agents/atlas`, 'telemetry', '--keypair', buyerKey]);
  ok('the CLI asked, checked the order on-chain, paid later and printed the loan', bought.status === 0 && /verified on-chain/.test(bought.stdout) && /settled/.test(bought.stdout) && /owe 0\.204 USDC/.test(bought.stdout), bought.stdout + bought.stderr);
  const cliLoan = /loan\s+(\S+)/.exec(bought.stdout)?.[1];
  const loans2 = paylater.owed(await paylater.fetchLoansOf(rpc, B));
  ok('two loans are now owed, the CLI\'s among them', loans2.length === 2 && loans2.some((l) => l.address === cliLoan), { cliLoan, loans2: loans2.map((l) => l.address) });
  const credit = await cli(['credit', B]);
  ok('tessera credit shows the limit, the tab and when each loan is due', credit.status === 0 && /limit .* owes 0\.408 USDC \(0\.40 USDC of it counts/.test(credit.stdout) && /tab: 2 loans still owed/.test(credit.stdout) && (credit.stdout.match(/due in \d+ s \(20\d\d-/g) ?? []).length === 2, credit.stdout + credit.stderr);

  // ------------------------------------------------- 4. the buyer agent, A2A
  log.step('4. The buyer agent over A2A with --pay-later');
  const { BuyerAgent } = await import('../apps/agents/src/buyer.js');
  const lines: string[] = [];
  const agent = new BuyerAgent('helper', clientForSigner(helper.identity, LOCAL), { rpcUrl: LOCAL.rpcUrl, mode: 'pay-later', log: (l) => lines.push(l) });
  const purchase = await agent.buy(`${AGENTS}/agents/atlas/.well-known/agent-card.json`, 'telemetry', {});
  ok('the helper bought on credit over A2A and verified the delivery against the hash', !purchase.failed && purchase.verified && purchase.mode === 'pay-later', purchase);
  ok('it logged the loan and the due date, and the purchase carries the loan', !!purchase.loan && purchase.loan.owed === price + paylater.feeOf(price, LINE) && lines.some((l) => /loan .*: owe 0\.204 USDC .* by 20\d\d-/.test(l)), { loan: purchase.loan, lines });
  ok('the receipt is the buy_now the merchant sent', purchase.receipts[0]?.success === true && purchase.receipts[0]?.payer === helper.identity.address, purchase.receipts);

  // ------------------------------------------- 4b. the plain-HTTP buyer script
  log.step('4b. npm run buy:http -- --pay-later: the plain-HTTP buyer script, as a cast buyer');
  // The script takes a cast buyer id and reads its key from .keys/agents/: the helper plays nova.
  keyFile(keyPath('nova'), helper);
  const http = await run('apps/agents/src/http402.ts', ['--buyer', 'nova', '--merchant', 'atlas', '--skill', 'telemetry', '--pay-later'], serverEnv);
  ok('the script asked, verified the escrow on-chain, paid later and printed the loan and what it owes', http.status === 0 && /escrow verified on-chain/.test(http.stdout) && /GET with PAYMENT-SIGNATURE -> 200/.test(http.stdout) && /owe 0\.204 USDC \(0\.20 \+ 0\.004 pool fee\)/.test(http.stdout), http.stdout + http.stderr);
  eq('the helper now owes two loans, the script\'s among them', paylater.owed(await paylater.fetchLoansOf(rpc, helper.identity.address)).length, 2);

  // ------------------------------------------------------- 5. repay --all
  log.step('5. repay --all clears the tab');
  const repaid = await cli(['repay', '--all', '--keypair', buyerKey, '--send']);
  ok('one transaction repaid both loans', repaid.status === 0 && /2 loans, 0\.408 USDC owed/.test(repaid.stdout) && /in one transaction/.test(repaid.stdout) && /confirmed:/.test(repaid.stdout), repaid.stdout + repaid.stderr);
  const lineAfter = await paylater.fetchMaybeCreditLine(rpc, await paylater.linePdaOf(B));
  eq('nothing outstanding, two on-time repayments', lineAfter.exists && [lineAfter.data.outstanding, lineAfter.data.repaidOnTime, lineAfter.data.openLoans], [0n, 2, 0]);
  const creditAfter = await cli(['credit', B]);
  ok('tessera credit shows the tab paid', creditAfter.status === 0 && /owes 0\.00 USDC/.test(creditAfter.stdout) && !/tab:/.test(creditAfter.stdout), creditAfter.stdout);

  // ------------------------------------------- 6. a New wallet, and forgeries
  log.step('6. A New wallet is told no, and a forged header is refused before anything is signed');
  const F = fresh.identity.address;
  const qF = await get(`/agents/atlas/x402/telemetry?buyer=${F}`);
  const rF = qF.body as Required402;
  const creditF = rF.accepts.find((a) => a.scheme === paylater.X402_SCHEME);
  const offerF = creditF?.extra as paylater.PayLaterOffer | undefined;
  ok('the 402 still offers the scheme, with eligible false and why', qF.status === 402 && offerF?.eligible === false && offerF.buyerLimit === '0' && /no credit yet/.test(offerF.reason ?? ''), offerF);
  const orderF = rF.extensions.tessera.order as Address;
  const forgedF = await paylater.buyNowForMerchant(fresh.rpc, fresh.identity, orderF, ops);
  const triedF = await get(`/agents/atlas/x402/telemetry`, header({ x402Version: 2, accepted: creditF, payload: { transaction: forgedF.transaction } }));
  ok('a well-formed buy_now from a New wallet is refused by the program in simulation: 400, no "do not pay again" note', triedF.status === 400 && /CreditLimitExceeded/.test(triedF.body.error ?? '') && triedF.body.note === undefined, triedF.body);
  ok('nothing moved: the order is still awaiting payment, its vault empty, and the wallet has no loan', (await fetchOrder(rpc, orderF)).data.state === OrderState.AwaitingPayment && (await tok.balance(orderF)) === 0n && (await paylater.fetchLoansOf(rpc, F)).length === 0);
  const cliF = await cli(['buy-later', `${AGENTS}/agents/atlas`, 'telemetry', '--keypair', freshKey]);
  ok('the CLI stops at the 402 for a New wallet', cliF.status === 1 && /not eligible for pay later: the buyer has no credit yet/.test(cliF.stderr), cliF.stdout + cliF.stderr);
  // A merchant with no history: the pool only funds merchants at Building or above.
  const qM = await get(`/agents/mallory/x402/anything?buyer=${B}`);
  const offerM = (qM.body as Required402).accepts.find((a) => a.scheme === paylater.X402_SCHEME)?.extra as paylater.PayLaterOffer | undefined;
  ok('a tiered buyer at a New merchant is told the merchant does not qualify', qM.status === 402 && offerM?.eligible === false && /merchants at Building or above/.test(offerM.reason ?? ''), offerM);

  // Two fresh quotes for the tiered buyer, to forge against.
  const rA = (await get(`/agents/atlas/x402/telemetry?buyer=${B}`)).body as Required402;
  const rB = (await get(`/agents/atlas/x402/telemetry?buyer=${B}`)).body as Required402;
  const creditA = rA.accepts.find((a) => a.scheme === paylater.X402_SCHEME)!;
  const orderA = rA.extensions.tessera.order as Address;
  const orderB = rB.extensions.tessera.order as Address;
  const forged = async (label: string, transaction: string, pattern: RegExp, accepted: PayLaterRequirement = creditA) => {
    const r = await get(`/agents/atlas/x402/telemetry`, header({ x402Version: 2, accepted, payload: { transaction } }));
    ok(label, r.status === 400 && pattern.test(r.body.error ?? '') && r.body.note === undefined, r.body);
  };
  // buy_now for order B, presented as the payment for order A
  await forged('a buy_now for another order of the same buyer', (await paylater.buyNowForMerchant(buyer.rpc, buyer.identity, orderB, ops)).transaction, /funds order .* not /);
  const { value: latest } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  // The merchant's signature is the server's to add: a forger can only leave its place empty.
  const atlasNoop = createNoopSigner(atlas.identity.address);
  const buyNowA = await paylater.getBuyNowInstructionAsync({ mint, buyer: buyer.identity, merchant: atlasNoop, order: orderA, loanId: newOrderId() });
  /** The buyer's own signature on these instructions, with the merchant's wallet as fee payer: what a forger would hand over. */
  const forgeWith = async (ixs: Instruction[]) =>
    getBase64EncodedWireTransaction(
      await partiallySignTransactionMessageWithSigners(
        pipe(
          createTransactionMessage({ version: 0 }),
          (m) => setTransactionMessageFeePayerSigner(createNoopSigner(ops), m),
          (m) => setTransactionMessageLifetimeUsingBlockhash(latest, m),
          (m) => appendTransactionMessageInstructions(ixs, m),
        ),
      ),
    );
  // the buyer as fee payer: the merchant must not sign for that
  const mine = await partiallySignTransactionMessageWithSigners(
    pipe(createTransactionMessage({ version: 0 }), (m) => setTransactionMessageFeePayerSigner(buyer.identity, m), (m) => setTransactionMessageLifetimeUsingBlockhash(latest, m), (m) => appendTransactionMessageInstructions([buyNowA], m)),
  );
  await forged('a transaction whose fee payer is not the merchant\'s wallet', getBase64EncodedWireTransaction(mine), /fee payer is/);
  // an extra instruction that moves the merchant's SOL
  const steal = await partiallySignTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(createNoopSigner(ops), m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latest, m),
      (m) => appendTransactionMessageInstructions([buyNowA, getTransferSolInstruction({ source: createNoopSigner(ops), destination: B, amount: lamports(1_000_000_000n) })], m),
    ),
  );
  await forged('a buy_now plus a transfer of the merchant\'s SOL', getBase64EncodedWireTransaction(steal), /an instruction for 1111/);
  // a unit limit at the runtime maximum: with a priority fee it would cost the merchant 3.5 times the cap
  const hot = await partiallySignTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(createNoopSigner(ops), m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latest, m),
      (m) => appendTransactionMessageInstructions([paylater.computeUnitLimitInstruction(1_400_000), buyNowA], m),
    ),
  );
  await forged('a compute unit limit above BUY_NOW_COMPUTE_UNITS', getBase64EncodedWireTransaction(hot), /compute unit limit of 1400000 \(at most 400000\)/);
  // two unit limits, each under the cap
  const twice = await forgeWith([paylater.computeUnitLimitInstruction(200_000), paylater.computeUnitLimitInstruction(200_000), buyNowA]);
  await forged('a second compute unit limit', twice, /more than one compute unit limit/);
  // a priority fee one micro-lamport over the cap
  const pricey = await forgeWith([getSetComputeUnitPriceInstruction({ microLamports: paylater.MAX_CU_PRICE + 1n }), buyNowA]);
  await forged('a priority fee above MAX_CU_PRICE', pricey, /priority fee of 1000001 micro-lamports/);
  // the buyer's own cancel of the quote after the buy_now: the cash-out the review found
  const cancelA = await getCancelUnpaidInstructionAsync({ order: orderA, mint, payer: ops, authority: buyer.identity, buyerToken: await tok.ata(B) });
  await forged('a buy_now followed by a cancel_unpaid of the same order', await forgeWith([buyNowA, cancelA]), new RegExp(`an instruction for ${TESSERA_PROGRAM_ADDRESS}`));
  // a buy_now naming an account of the buyer's choosing in place of the escrow program
  const elsewhere = { ...buyNowA, accounts: buyNowA.accounts.map((a, i) => (i === 9 ? { ...a, address: fresh.identity.address } : a)) };
  await forged('a buy_now naming another account as the escrow program', await forgeWith([elsewhere]), /buy_now account 10 is /);
  // buy_now with atlas a plain account, the way a buyer sending alone would build it: the server does not supply a signature nobody asked for
  const alone = { ...buyNowA, accounts: buyNowA.accounts.map((a) => (a.address === atlas.identity.address ? { address: a.address, role: AccountRole.READONLY } : a)) };
  await forged('a buy_now that does not ask for the order\'s merchant\'s signature', await forgeWith([alone]), /signers must be the merchant's wallet, the buyer and the order's merchant/);
  // another wallet signing as well (here, a transfer of its SOL): nobody else signs next to the merchant
  await forged('a signer more than the ops wallet, the buyer and the merchant', await forgeWith([buyNowA, getTransferSolInstruction({ source: createNoopSigner(fresh.identity.address), destination: B, amount: lamports(1n) })]), /signers must be/);
  // atlas asked to sign writable: it only has to sign
  const writable = { ...buyNowA, accounts: buyNowA.accounts.map((a) => (a.address === atlas.identity.address ? { ...a, role: AccountRole.WRITABLE_SIGNER } : a)) };
  await forged('the order\'s merchant asked to sign as a writable account', await forgeWith([writable]), /must sign read-only/);
  // something in the merchant's signature slot: only the buyer's signature may come from the buyer
  const prefilled = getTransactionDecoder().decode(getBase64Encoder().encode(await forgeWith([buyNowA])));
  const filler = new Uint8Array(64).fill(7) as unknown as (typeof prefilled.signatures)[Address];
  await forged('a signature already in the merchant\'s place', getBase64EncodedWireTransaction({ ...prefilled, signatures: { ...prefilled.signatures, [atlas.identity.address]: filler } }), /already carries a signature for/);
  // an accepted entry the merchant never quoted: nothing of it is sent, so 400 and no note
  await forged('an accepted entry that was not quoted (another price)', (await paylater.buyNowForMerchant(buyer.rpc, buyer.identity, orderA, ops)).transaction, /any option that was quoted/, { ...creditA, amount: '1' });
  // a buy_now the buyer never signed
  const buyNowNoop = await paylater.getBuyNowInstructionAsync({ mint, buyer: createNoopSigner(B), merchant: atlasNoop, order: orderA, loanId: newOrderId() });
  const unsigned = await partiallySignTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(createNoopSigner(ops), m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latest, m),
      (m) => appendTransactionMessageInstructions([buyNowNoop], m),
    ),
  );
  await forged('a buy_now the buyer has not signed', getBase64EncodedWireTransaction(unsigned), /has not signed/);
  const empty = await get(`/agents/atlas/x402/telemetry`, header({ x402Version: 2, accepted: creditA, payload: {} }));
  ok('a payload with no transaction in it', empty.status === 400 && /payload\.transaction/.test(empty.body.error ?? '') && empty.body.note === undefined, empty.body);
  const garbage = await get(`/agents/atlas/x402/telemetry`, header({ x402Version: 2, accepted: creditA, payload: { transaction: 'not a transaction' } }));
  ok('a transaction that does not decode', garbage.status === 400 && /cannot be decoded/.test(garbage.body.error ?? '') && garbage.body.note === undefined, garbage.body);
  ok('none of them opened a loan or paid the orders', (await paylater.fetchLoansOf(rpc, B)).length === 2 && (await tok.balance(orderA)) === 0n && (await tok.balance(orderB)) === 0n);

  // -------------------------------------------------------- 7. the keeper
  log.step('7. A loan left unpaid past its grace period is marked in default by the server');
  const built2 = await paylater.buyNowForMerchant(buyer.rpc, buyer.identity, orderA, ops);
  const paid2 = await get(`/agents/atlas/x402/telemetry`, header({ x402Version: 2, accepted: creditA, payload: { transaction: built2.transaction } }));
  eq('the buyer bought order A on credit', paid2.status, 200);
  const l2 = (await paylater.fetchLoan(rpc, built2.loan)).data;
  await waitForChainTime(server, l2.defaultAfter + 1n);
  let marked = false;
  for (let i = 0; i < 40 && !marked; i += 1) {
    marked = (await paylater.fetchLoan(rpc, built2.loan)).data.state === paylater.LoanState.Defaulted;
    if (!marked) await sleep(500);
  }
  ok('the keeper marked it in default within a few seconds of the grace period ending', marked && /\[keeper\] marked loan/.test(serverLog), serverLog.split('\n').filter((l) => /keeper/.test(l)));
  const lineFrozen = await paylater.fetchMaybeCreditLine(rpc, await paylater.linePdaOf(B));
  eq('the default is on the buyer\'s line', lineFrozen.exists && [lineFrozen.data.defaults, lineFrozen.data.outstanding], [1, price]);
  const rFrozen = (await get(`/agents/atlas/x402/telemetry?buyer=${B}`)).body as Required402;
  const offerFrozen = rFrozen.accepts.find((a) => a.scheme === paylater.X402_SCHEME)?.extra as paylater.PayLaterOffer | undefined;
  ok('the next 402 says the buyer is not eligible: the line is frozen', offerFrozen?.eligible === false && offerFrozen.buyerLimit === '0' && /frozen/.test(offerFrozen.reason ?? ''), offerFrozen);
  const late = await cli(['repay', '--all', '--keypair', buyerKey, '--send']);
  ok('a late repayment still clears the debt', late.status === 0 && /confirmed:/.test(late.stdout) && (await paylater.fetchLoan(rpc, built2.loan)).data.state === paylater.LoanState.RepaidLate, late.stdout + late.stderr);
} catch (e) {
  failures += 1;
  console.log(`\n   FAIL stopped on an unexpected error:\n${errText(e).slice(0, 1500)}`);
  console.log(`\nserver log (tail):\n${serverLog.slice(-3000)}`);
} finally {
  for (const c of children) {
    try {
      process.kill(-c.pid!, 'SIGKILL');
    } catch {
      c.kill('SIGKILL');
    }
  }
  for (const s of stubs) s.close();
  await sleep(300);
  rmSync(ledger, { recursive: true, force: true });
  rmSync(keydir, { recursive: true, force: true });
  rmSync(datadir, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${checks - failures}/${checks} checks`);
process.exit(failures === 0 ? 0 : 1);
