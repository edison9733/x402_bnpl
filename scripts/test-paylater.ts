/**
 * Runs the pay-later program next to the real escrow program on a local
 * validator. Wallets earn their Tessera tiers through real escrow orders, then
 * buy now and pay later against the limit those tiers give them. Every
 * purchase on credit goes through the escrow: the merchant opens the order (its
 * 402 quote), the pool pays the price into the order's vault in the buyer's
 * place and has the escrow confirm the order in the same instruction, the
 * merchant delivers and is paid by the escrow. The buyer owes the pool the
 * price plus its fee.
 *
 *   1. a wallet with no history gets no credit, and only a real quote for this
 *      buyer, signed for by its merchant, can be funded: a buy_now without
 *      the merchant's signature is refused, and where the escrow lets a
 *      buyer open an order in a merchant's name without that merchant's
 *      signature (the build on devnet), the pool will not fund it, so the
 *      buyer cannot have the pool pay an order the merchant never accepted
 *      and take the refund as cash;
 *   2. a wallet with a tier buys, the pool pays the escrow and the order is
 *      Funded in the same instruction: a buyer that sends buy_now and
 *      cancel_unpaid together has the whole transaction fail on-chain, and
 *      one that cancels after the buy_now landed is refused, so the pool's
 *      money never reaches the buyer. The merchant is paid by the escrow, the
 *      buyer repays on time and its limit grows in proportion to what it
 *      repaid: a run of the smallest loans barely moves it, one loan the size
 *      of the tier limit adds a whole step;
 *   3. a buyer that never repays is marked in default by a stranger and its
 *      line is frozen;
 *   4. the merchant never delivers: the escrow refunds the buyer, and the loan
 *      is still owed and is repaid;
 *   5. pool accounting, and the main refusal paths as real transactions.
 *
 * One purchase of the tab in 2c goes through the CLI (`tessera buy-later
 * --order`), which sends the buy_now itself and so needs the merchant's key
 * as well as the buyer's.
 *
 * Every limit the program applies is recomputed off-chain from the same
 * public accounts (packages/sdk/src/paylater/limit.ts) and must match. The
 * compute units each buy_now used are logged, and must leave at least 30%
 * of BUY_NOW_COMPUTE_UNITS spare.
 *
 *   npm run build:program && npm run test:paylater
 *
 * ESCROW_SO=<path> runs it against another build of the escrow program, such
 * as the one deployed on devnet (`solana program dump`, trailing zeros cut).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AccountRole, createNoopSigner, lamports, type Address, type Instruction, type Signature, type TransactionSigner } from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
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
  getRefundInstruction,
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
  TESSERA_PROGRAM_ADDRESS,
  type Params,
} from '@tessera/sdk';
import {
  chainTime,
  clientForSigner,
  errText,
  generateKeypairBytes,
  log,
  REPO_ROOT,
  sleep,
  tokenHelpers,
  waitForChainTime,
  type Cluster,
  type ScriptClient,
} from './lib.js';
import { closeOrder, closeOrderAccountList } from '../apps/agents/src/chain.js';

// Its own port, so it never attaches to `npm run paylater:local` or another suite's validator.
const RPC_PORT = Number(process.env.PAYLATER_TEST_RPC_PORT ?? 19599);
const LOCAL: Cluster = { rpcUrl: `http://127.0.0.1:${RPC_PORT}` };
const USDC = 1_000_000n;
const PAYLATER = paylater.TESSERA_PAYLATER_PROGRAM_ADDRESS;
const ESCROW_FEE_BPS = 100n;

// The escrow's compressed local params (as in test-local.ts): 2-second periods.
// The smallest order is below the pool's smallest loan, so that refusal can be hit.
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
  minOrder: 500n,
  deliverSecs: 6,
  unpaidSecs: 6,
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

// Pay-later rules for this run: 30 seconds to repay (a purchase on credit is
// five escrow transactions, and a tab of three must still be on time), then
// 4 seconds of grace.
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

// ----------------------------------------------------------------- assertions

let checks = 0;
let failures = 0;
const show = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? `${x}n` : x));

function eq(label: string, actual: unknown, expected: unknown): void {
  checks += 1;
  if (show(actual) !== show(expected)) {
    failures += 1;
    console.log(`   FAIL ${label}: got ${show(actual)}, expected ${show(expected)}`);
  } else log.ok(label);
}

async function expectFail(label: string, expected: string, fn: () => Promise<unknown>): Promise<void> {
  checks += 1;
  try {
    await fn();
  } catch (e) {
    const text = errText(e);
    if (text.includes(expected)) log.ok(`${label}: rejected with ${expected}`);
    else {
      failures += 1;
      console.log(`   FAIL ${label}: expected ${expected}, got: ${text.slice(-900)}`);
    }
    return;
  }
  failures += 1;
  console.log(`   FAIL ${label}: the call succeeded but should have been rejected`);
}

// ------------------------------------------------------------------ validator

async function startValidator(upgradeAuthority: Address): Promise<{ proc: ChildProcess; ledger: string }> {
  const so = (name: string) => {
    const p = name === 'tessera' && process.env.ESCROW_SO ? resolve(process.env.ESCROW_SO) : resolve(REPO_ROOT, `target/deploy/${name}.so`);
    if (!existsSync(p)) throw new Error(`target/deploy/${name}.so is missing: run \`npm run build:program\` first`);
    return p;
  };
  const ledger = mkdtempSync(join(tmpdir(), 'tessera-paylater-ledger-'));
  const proc = spawn(
    'solana-test-validator',
    [
      '--reset',
      '--quiet',
      '--ledger', ledger,
      '--rpc-port', String(RPC_PORT),
      '--faucet-port', String(RPC_PORT + 1001),
      '--upgradeable-program', TESSERA_PROGRAM_ADDRESS, so('tessera'), upgradeAuthority,
      '--upgradeable-program', PAYLATER, so('tessera_paylater'), upgradeAuthority,
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(LOCAL.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
      });
      if (((await res.json()) as { result?: string }).result === 'ok') return { proc, ledger };
    } catch {
      // not listening yet
    }
    await sleep(500);
  }
  proc.kill('SIGKILL');
  throw new Error('local validator did not become healthy');
}

// ----------------------------------------------------------------------- main

/** Every role's key bytes, for the key files the CLI reads. */
const keyBytes = new Map<string, Uint8Array>();
const role = async () => {
  const { signer, bytes } = await generateKeypairBytes();
  keyBytes.set(signer.address, bytes);
  return clientForSigner(signer, LOCAL);
};
const keydir = mkdtempSync(join(tmpdir(), 'tessera-paylater-keys-'));
/** A role's key in a file of its own, as `--keypair` takes it. */
const keyFile = (c: ScriptClient): string => {
  const file = join(keydir, `${c.identity.address}.json`);
  writeFileSync(file, JSON.stringify(Array.from(keyBytes.get(c.identity.address)!)), { mode: 0o600 });
  return file;
};
const tsx = createRequire(import.meta.url).resolve('tsx/cli');
/** The CLI, against this validator. */
const cli = (args: string[]) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((done) => {
    const p = spawn(process.execPath, [tsx, resolve(REPO_ROOT, 'apps/cli/src/cli.ts'), ...args, '--rpc', LOCAL.rpcUrl]);
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('close', (status) => done({ status, stdout, stderr }));
  });
const deployer = await role();
const { proc, ledger } = await startValidator(deployer.identity.address);

try {
  const server = await role();
  const arbiter = await role();
  const treasury = await role();
  const stranger = await role();
  const m1 = await role();
  const m2 = await role();
  const alice = await role(); // repays on time
  const bob = await role(); // never repays
  const fresh = await role(); // no history at all
  const everyone = [deployer, server, arbiter, treasury, stranger, m1, m2, alice, bob, fresh];
  const rpc = server.rpc;

  log.step('Setup: funded wallets, a test mint, the escrow program');
  for (const c of everyone) await rpc.requestAirdrop(c.identity.address, lamports(20_000_000_000n)).send();
  for (let i = 0; i < 60; i += 1) {
    if ((await rpc.getBalance(everyone.at(-1)!.identity.address).send()).value > 0n) break;
    await sleep(250);
  }
  const newMint = async (): Promise<Address> => {
    const mintSigner = (await generateKeypairBytes()).signer;
    const space = BigInt(getMintSize());
    await server.sendTransaction([
      getCreateAccountInstruction({
        payer: server.identity,
        newAccount: mintSigner,
        lamports: await rpc.getMinimumBalanceForRentExemption(space).send(),
        space,
        programAddress: TOKEN_PROGRAM_ADDRESS,
      }),
      getInitializeMint2Instruction({ mint: mintSigner.address, decimals: 6, mintAuthority: server.identity.address, freezeAuthority: null }),
    ]);
    return mintSigner.address;
  };
  const mint = await newMint();
  const tok = tokenHelpers(server, mint);
  for (const c of [server, treasury, m1, m2, alice, bob, fresh, stranger]) {
    await server.sendTransaction([await tok.ensureAtaIx(c.identity.address)]);
  }
  for (const c of [server, alice, bob, fresh, m1, m2]) {
    await server.sendTransaction([
      getMintToInstruction({ mint, token: await tok.ata(c.identity.address), mintAuthority: server.identity, amount: 100n * USDC }),
    ]);
  }
  await deployer.sendTransaction([
    await getInitializeInstructionAsync({
      authority: deployer.identity,
      mint,
      arbiter: arbiter.identity.address,
      treasury: treasury.identity.address,
      programData: await programDataAddress(),
      feeBps: Number(ESCROW_FEE_BPS),
      params: PARAMS,
    }),
  ]);
  for (const c of [m1, m2, alice, bob, fresh, stranger]) {
    await server.sendTransaction([await getEnsureAgentInstructionAsync({ wallet: c.identity.address, payer: server.identity })]);
  }
  log.ok(`mint ${mint}, escrow initialised, 6 credit files`);

  // ---------------------------------------- escrow history earns the tiers
  const requestHash = await sha256('GET /report?wallet=demo');

  /** The merchant opens an escrow order for the buyer, as its 402 quote does. The server fronts the rent, as the merchant agent does. */
  async function quote(buyer: ScriptClient, merchant: ScriptClient, amount: bigint): Promise<{ order: Address; vault: Address }> {
    const id = newOrderId();
    const { order, vault } = await orderAddresses(id, mint);
    await server.sendTransaction([
      await getOpenOrderInstructionAsync({
        mint, buyer: buyer.identity.address, merchant: merchant.identity, payer: server.identity, orderId: id, amount, requestHash, minHoldSecs: 0,
      }),
    ]);
    return { order, vault };
  }
  const confirm = async (order: Address, by: ScriptClient = stranger) =>
    by.sendTransaction([await getConfirmFundedInstructionAsync({ order, mint })]);
  const deliver = async (order: Address, merchant: ScriptClient) =>
    merchant.sendTransaction([await getDeliverInstructionAsync({ order, merchant: merchant.identity, deliveryHash: requestHash })]);
  const settleInput = async (order: Address, buyer: ScriptClient, merchant: ScriptClient, authority: ScriptClient) => ({
    ...(await settleAccounts(
      order,
      { buyer: buyer.identity.address, merchant: merchant.identity.address, mint, payer: server.identity.address },
      treasury.identity.address,
    )),
    authority: authority.identity,
  });
  /** The buyer releases as soon as the program lets it (right after delivery, or once the hold has run). */
  async function release(order: Address, buyer: ScriptClient, merchant: ScriptClient): Promise<void> {
    for (let i = 0; ; i += 1) {
      try {
        await buyer.sendTransaction([getReleaseInstruction(await settleInput(order, buyer, merchant, buyer))]);
        return;
      } catch (e) {
        if (i > 20) throw e;
        await sleep(500);
      }
    }
  }
  /** Escrow orders that settled, oldest first, for the rent check at the end. */
  const settledOrders: Address[] = [];
  async function escrowOrder(buyer: ScriptClient, merchant: ScriptClient, amount: bigint): Promise<void> {
    const { order, vault } = await quote(buyer, merchant, amount);
    settledOrders.push(order);
    await buyer.sendTransaction([await tok.transferIx(buyer, vault, amount)]);
    await confirm(order);
    await deliver(order, merchant);
    await release(order, buyer, merchant);
    const pair = await pairPdaOf(buyer.identity.address, merchant.identity.address);
    for (const [reviewer, subject] of [[buyer, merchant], [merchant, buyer]] as const) {
      await reviewer.sendTransaction([
        await getSubmitReviewInstructionAsync({
          order, subject: subject.identity.address, pair, reviewer: reviewer.identity, payer: reviewer.identity, rating: 5, text: 'Good trade.',
        }),
      ]);
    }
  }

  const configAddr = await configPda();
  const cfgParams = (await fetchConfig(rpc, configAddr)).data.params;
  const live = async (c: ScriptClient, at?: bigint) => {
    const a = (await fetchAgent(rpc, await agentPdaOf(c.identity.address))).data;
    return score.evaluate(a, cfgParams, at ?? (await chainTime(server)));
  };
  /**
   * The highest limit a wallet can have over the next few seconds. Between
   * events the live score only rises with time (tenure grows, penalties
   * decay), so one unit past this is refused whenever the transaction lands.
   */
  const limitSoon = async (c: ScriptClient, line: paylater.LimitLine): Promise<bigint> => {
    const a = (await fetchAgent(rpc, await agentPdaOf(c.identity.address))).data;
    const at = await chainTime(server);
    let best = 0n;
    for (let k = 0n; k <= 8n; k += 1n) {
      const e = score.evaluate(a, cfgParams, at + k);
      const l = paylater.limit(line, LINE, e.tier, e.score);
      if (l > best) best = l;
    }
    return best;
  };

  log.step('Earning Tessera tiers through real escrow orders (a few periods)');
  const traders: [ScriptClient, ScriptClient][] = [[alice, m1], [bob, m2], [alice, m2], [bob, m1], [m1, m2], [m2, m1]];
  for (let round = 0; round < 12; round += 1) {
    for (const [b, m] of traders) await escrowOrder(b, m, USDC / 2n);
    const tiers = await Promise.all([alice, bob, m1, m2].map(async (c) => (await live(c)).tier));
    log.info(`round ${round + 1}: tiers alice ${tiers[0]}, bob ${tiers[1]}, m1 ${tiers[2]}, m2 ${tiers[3]}`);
    if (tiers.every((t) => t >= 2)) break;
  }
  const aTier = (await live(alice)).tier;
  const bTier = (await live(bob)).tier;
  const m1Tier = (await live(m1)).tier;
  eq('alice, bob and m1 have earned at least Established through escrow', [aTier >= 2, bTier >= 2, m1Tier >= 2], [true, true, true]);
  eq('the fresh wallet is still New', (await live(fresh)).tier, 0);

  // ------------------------------------------------------------ the pool
  log.step('The lending pool');
  const pool = await paylater.poolPda();
  const plProgramData = await programDataAddress(PAYLATER);
  const initPool = async (by: ScriptClient, params: paylater.LineParams) =>
    by.sendTransaction([
      await paylater.getInitializeInstructionAsync({ authority: by.identity, mint, programData: plProgramData, params }),
    ]);
  await expectFail('a wallet that is not the upgrade authority creates the pool', 'Unauthorized', () => initPool(stranger, LINE));
  await expectFail('the pool gives brand-new wallets credit', 'InvalidParams', () =>
    initPool(deployer, { ...LINE, tierLimit: [USDC, 2n * USDC, 5n * USDC, 10n * USDC] }),
  );
  await expectFail('the pool charges more than 10% of each purchase', 'InvalidParams', () => initPool(deployer, { ...LINE, feeBps: 1_001 }));
  // Anyone can create ATA(mint, pool) before the pool exists; that must not block it.
  await stranger.sendTransaction([await tok.ensureAtaIx(pool, stranger)]);
  eq('an attacker created the pool vault before the pool', (await rpc.getAccountInfo(await tok.ata(pool), { encoding: 'base64' }).send()).value !== null, true);
  await initPool(deployer, LINE);
  eq('pool params stored on-chain, the vault created first is accepted', (await paylater.fetchPool(rpc, pool)).data.params, LINE);
  const updateIx = async (by: ScriptClient, params: paylater.LineParams) =>
    paylater.getUpdateParamsInstructionAsync({ authority: by.identity, params });
  await expectFail('a stranger rewrites the pool rules', 'Unauthorized', async () =>
    stranger.sendTransaction([await updateIx(stranger, { ...LINE, feeBps: 0 })]),
  );
  await expectFail('the authority changes the rules to give New wallets credit', 'InvalidParams', async () =>
    deployer.sendTransaction([await updateIx(deployer, { ...LINE, tierLimit: [1n, 2n * USDC, 5n * USDC, 10n * USDC] })]),
  );
  await server.sendTransaction([
    await paylater.getDepositInstructionAsync({ mint, funder: server.identity, funderToken: await tok.ata(server.identity.address), amount: 50n * USDC }),
  ]);
  eq('the pool holds 50 USDC of liquidity', await tok.balance(pool), 50n * USDC);

  // ------------------------------------ pay-later purchases go through the escrow
  /**
   * A buy_now, signed by the buyer and by `merchant`: the merchant's key pair
   * where the merchant agrees, as its server does over x402. The buyer's
   * transaction carries both signatures.
   */
  const buyIx = async (buyer: ScriptClient, merchant: TransactionSigner, order: Address, loanId = newOrderId()) => ({
    loanId,
    ix: await paylater.getBuyNowInstructionAsync({ mint, buyer: buyer.identity, merchant, order, loanId }),
  });
  /**
   * The same instruction with the merchant's account a plain read-only one:
   * the buy_now a buyer can send on its own, holding only the merchant's address.
   */
  const withoutMerchantSignature = (ix: Instruction, merchant: Address): Instruction => ({
    ...ix,
    accounts: ix.accounts!.map((a) => (a.address === merchant ? { address: a.address, role: AccountRole.READONLY } : a)),
  });
  /** A whole purchase on credit: the merchant's quote, the pool's payment into its vault (which confirms the order), delivery, release. */
  async function buy(buyer: ScriptClient, merchant: ScriptClient, amount: bigint): Promise<Address> {
    const { order } = await quote(buyer, merchant, amount);
    const { loanId, ix } = await buyIx(buyer, merchant.identity, order);
    await sendBuyNow(buyer, [ix]);
    await deliver(order, merchant);
    await release(order, buyer, merchant);
    return paylater.loanPdaOf(buyer.identity.address, loanId);
  }
  const repayIx = async (loan: Address, payer: ScriptClient) =>
    paylater.getRepayInstructionAsync({
      mint, loan, line: await paylater.linePdaOf((await paylater.fetchLoan(rpc, loan)).data.buyer),
      payer: payer.identity, payerToken: await tok.ata(payer.identity.address),
    });
  const lineOf = async (c: ScriptClient) => (await paylater.fetchMaybeCreditLine(rpc, await paylater.linePdaOf(c.identity.address)));
  /** A landed transaction's meta: its error, its logs, and the compute units it used. */
  const metaOf = async (signature: string) => {
    for (let i = 0; ; i += 1) {
      const t = await rpc.getTransaction(signature as Signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0, encoding: 'json' }).send();
      if (t?.meta) return { err: t.meta.err, logs: t.meta.logMessages ?? [], units: Number(t.meta.computeUnitsConsumed ?? 0n) };
      if (i > 20) throw new Error(`no meta for ${signature}`);
      await sleep(300);
    }
  };
  /** Compute units used by each buy_now that landed, measured on the whole transaction. */
  const buyNowUnits: number[] = [];
  const sendBuyNow = async (by: ScriptClient, ixs: Instruction[]) => {
    const { context } = await by.sendTransaction(ixs);
    buyNowUnits.push((await metaOf(context.signature)).units);
  };
  /**
   * Send with no preflight, so the transaction lands and the chain itself
   * fails it: its error and logs, or undefined if it succeeded.
   */
  const failsOnChain = async (by: ScriptClient, ixs: Instruction[]) => {
    try {
      await by.sendTransaction(ixs, { skipPreflight: true });
      return undefined;
    } catch (e) {
      const signature = /transaction (\w+) failed/.exec(errText(e))?.[1];
      if (!signature) throw e;
      return metaOf(signature);
    }
  };

  // --------------------------------------------- 1. no history, no credit
  log.step('1. A wallet with no history gets no credit, and only a real quote for this buyer, with its merchant\'s signature, can be funded');
  const qFresh = await quote(fresh, m1, 1_000n);
  await expectFail('a New wallet buys on credit', 'CreditLimitExceeded', async () =>
    fresh.sendTransaction([(await buyIx(fresh, m1.identity, qFresh.order)).ix]),
  );
  const nobody = await role();
  await rpc.requestAirdrop(nobody.identity.address, lamports(2_000_000_000n)).send();
  await sleep(1500);
  await expectFail('a wallet with no credit file at all buys on credit', 'ConstraintOwner', async () =>
    nobody.sendTransaction([(await buyIx(nobody, m1.identity, qFresh.order)).ix]),
  );
  const qNewMerchant = await quote(alice, fresh, 1_000n);
  await expectFail('a tiered buyer pays a New merchant on credit', 'MerchantTierTooLow', async () =>
    alice.sendTransaction([(await buyIx(alice, fresh.identity, qNewMerchant.order)).ix]),
  );
  const qAlice = await quote(alice, m1, 1_000n);
  await expectFail('a buyer pays itself on credit', 'SelfDealing', async () =>
    alice.sendTransaction([(await buyIx(alice, alice.identity, qAlice.order)).ix]),
  );
  await expectFail('the merchant named, and signing, is not the one that opened the order', 'NotTheMerchant', async () =>
    alice.sendTransaction([(await buyIx(alice, m2.identity, qAlice.order)).ix]),
  );
  // The order's merchant signs buy_now too. A buyer holding only its address
  // can build the instruction without that signature; sent with no preflight,
  // the chain itself refuses it and the pool pays nothing.
  const poolAtStart = await tok.balance(pool);
  const m1Noop = createNoopSigner(m1.identity.address);
  const alone = await buyIx(alice, m1Noop, qAlice.order);
  const aloneRun = await failsOnChain(alice, [withoutMerchantSignature(alone.ix, m1.identity.address)]);
  eq('alice sends buy_now for m1\'s quote without m1\'s signature: it lands and fails (AccountNotSigner), the pool pays nothing, no loan', [
    aloneRun !== undefined,
    aloneRun?.logs.some((l) => /Error Code: AccountNotSigner/.test(l)),
    await tok.balance(pool),
    await tok.balance(qAlice.order),
    (await fetchOrder(rpc, qAlice.order)).data.state,
    (await rpc.getAccountInfo(await paylater.loanPdaOf(alice.identity.address, alone.loanId)).send()).value,
  ], [true, true, poolAtStart, 0n, OrderState.AwaitingPayment, null]);
  // The attack that signature closes. The escrow on devnet (ESCROW_SO) is an
  // older build whose open_order does not ask for the merchant's signature,
  // so a buyer can open an order in any merchant's name and pay its rent
  // itself. Had the pool funded such an order, the merchant, which never
  // accepted it, would not deliver; after the delivery window anyone could
  // have the escrow refund the pool's money to the buyer, as cash, with the
  // loan still owed and a missed delivery on the merchant's record. The
  // current escrow refuses that order itself; on the devnet build the pool
  // must refuse to fund it, and does, because the merchant does not sign.
  const idX = newOrderId();
  const { order: qX } = await orderAddresses(idX, mint);
  const openX = withoutMerchantSignature(
    await getOpenOrderInstructionAsync({ mint, buyer: alice.identity.address, merchant: m1Noop, payer: alice.identity, orderId: idX, amount: 1_000n, requestHash, minHoldSecs: 0 }),
    m1.identity.address,
  );
  const openedX = await alice.sendTransaction([openX]).then(
    () => true,
    (e) => {
      if (/AccountNotSigner/.test(errText(e))) return false;
      throw e;
    },
  );
  if (openedX) {
    log.info('this escrow build lets a buyer open an order in a merchant\'s name without the merchant\'s signature (the build on devnet)');
    const oX = (await fetchOrder(rpc, qX)).data;
    eq('alice opened an order in m1\'s name that m1 never signed, paying its rent herself', [oX.merchant, oX.buyer, oX.payer, oX.state], [m1.identity.address, alice.identity.address, alice.identity.address, OrderState.AwaitingPayment]);
    const tryX = await buyIx(alice, m1Noop, qX);
    const tryXRun = await failsOnChain(alice, [withoutMerchantSignature(tryX.ix, m1.identity.address)]);
    eq('her buy_now for it lands and fails (AccountNotSigner): the pool pays nothing into an order m1 never accepted, so no refund can turn it into cash', [
      tryXRun !== undefined,
      tryXRun?.logs.some((l) => /Error Code: AccountNotSigner/.test(l)),
      await tok.balance(pool),
      await tok.balance(qX),
      (await fetchOrder(rpc, qX)).data.state,
      (await rpc.getAccountInfo(await paylater.loanPdaOf(alice.identity.address, tryX.loanId)).send()).value,
    ], [true, true, poolAtStart, 0n, OrderState.AwaitingPayment, null]);
  } else {
    log.info('this escrow build refuses an order in a merchant\'s name that the merchant did not sign (the current source)');
    eq('the escrow itself refused alice\'s order in m1\'s name that m1 never signed (AccountNotSigner): nothing for the pool to fund', (await rpc.getAccountInfo(qX, { encoding: 'base64' }).send()).value, null);
  }
  const qBob = await quote(bob, m1, 1_000n);
  await expectFail('alice funds an order the merchant opened for bob', 'NotTheBuyer', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity, qBob.order)).ix]),
  );
  const qSmall = await quote(alice, m1, 999n);
  await expectFail('a purchase below the pool\'s minimum', 'AmountTooSmall', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity, qSmall.order)).ix]),
  );
  const otherMint = await newMint();
  await expectFail('the wrong mint, with the real vaults', 'MintMismatch', async () =>
    alice.sendTransaction([
      await paylater.getBuyNowInstructionAsync({
        mint: otherMint, vault: await tok.ata(pool), orderVault: qAlice.vault, buyer: alice.identity, merchant: m1.identity, order: qAlice.order, loanId: newOrderId(),
      }),
    ]),
  );
  // A plain wallet with a token account, so the only thing wrong is who owns the account.
  await expectFail('an account the escrow program does not own passed as the order', 'ConstraintOwner', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity, stranger.identity.address)).ix]),
  );
  // An escrow account that is not an order (alice's credit file), given a token account so the only thing wrong is what it is.
  const aliceAgent = await agentPdaOf(alice.identity.address);
  await stranger.sendTransaction([await tok.ensureAtaIx(aliceAgent, stranger)]);
  await expectFail('an escrow account that is not an order', 'NotAnOrder', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity, aliceAgent)).ix]),
  );
  // A quote alice has already paid herself.
  const qPaid = await quote(alice, m1, 1_000n);
  await alice.sendTransaction([await tok.transferIx(alice, qPaid.vault, 1_000n)]);
  await expectFail('the order\'s vault already holds the price', 'OrderAlreadyFunded', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity, qPaid.order)).ix]),
  );
  await confirm(qPaid.order);
  await expectFail('the order is already funded and confirmed', 'OrderNotAwaitingPayment', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity, qPaid.order)).ix]),
  );
  await m1.sendTransaction([getRefundInstruction(await settleInput(qPaid.order, alice, m1, m1))]);
  // A quote whose payment window has closed: confirm_funded would refuse the money, so the pool does too.
  const qLate = await quote(alice, m1, 1_000n);
  const late = (await fetchOrder(rpc, qLate.order)).data;
  await waitForChainTime(server, late.createdAt + BigInt(PARAMS.unpaidSecs) + 1n);
  await expectFail('a quote past its payment window', 'PaymentWindowClosed', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity, qLate.order)).ix]),
  );

  // ------------------------------------- 2. buy now, repay on time, grow
  log.step('2. Alice buys now through the escrow, pays later, on time');
  const aliceLimit0 = paylater.limit(paylater.NO_LINE, LINE, aTier, (await live(alice)).score);
  log.info(`alice: tier ${aTier}, limit about ${fromUnits(aliceLimit0)} USDC`);
  const price = aliceLimit0 / 2n;
  const fee = paylater.feeOf(price, LINE);
  const escrowFee = (price * ESCROW_FEE_BPS) / 10_000n;
  const m1Before = await tok.balance(m1.identity.address);
  const poolBefore = await tok.balance(pool);
  const aliceBeforeBuy = await tok.balance(alice.identity.address);
  // The attack the review found: the buyer may cancel its own unpaid quote at
  // any time and the escrow hands it whatever is in the vault. Had buy_now
  // only paid the vault, the buyer could have the pool pay and cancel in one
  // transaction and walk off with the pool's money. buy_now leaves the order
  // Funded, so the cancel fails and takes the whole transaction with it, even
  // with the merchant's signature on it (over x402 the merchant would refuse
  // to sign it at all). Sent with no preflight, so this is the chain failing
  // it, not a simulation.
  const qCash = await quote(alice, m1, price);
  const { loanId: loanIdCash, ix: buyCash } = await buyIx(alice, m1.identity, qCash.order);
  const cancelCash = await getCancelUnpaidInstructionAsync({
    order: qCash.order, mint, payer: server.identity.address, authority: alice.identity, buyerToken: await tok.ata(alice.identity.address),
  });
  const cashOut = await failsOnChain(alice, [buyCash, cancelCash]);
  eq('alice sends [buy_now, cancel_unpaid] herself: it lands and fails, at the cancel, on the order buy_now just funded', [
    cashOut !== undefined,
    JSON.stringify(cashOut?.err ?? null, (_, v) => (typeof v === 'bigint' ? Number(v) : v)).startsWith('{"InstructionError":[2,'),
    cashOut?.logs.some((l) => l === `Program ${PAYLATER} success`),
    cashOut?.logs.some((l) => /Error Code: InvalidState/.test(l)),
  ], [true, true, true, true]);
  eq('the pool kept its money, alice got none, the order is still unpaid, and no loan or line was opened', [
    await tok.balance(pool),
    await tok.balance(alice.identity.address),
    (await fetchOrder(rpc, qCash.order)).data.state,
    await tok.balance(qCash.order),
    (await rpc.getAccountInfo(await paylater.loanPdaOf(alice.identity.address, loanIdCash)).send()).value,
    (await lineOf(alice)).exists,
  ], [poolBefore, aliceBeforeBuy, OrderState.AwaitingPayment, 0n, null, false]);
  const qA = await quote(alice, m1, price);
  const { loanId: loanIdA, ix: buyA } = await buyIx(alice, m1.identity, qA.order);
  await sendBuyNow(alice, [buyA]);
  log.info(`buy_now, opening alice's line and her first loan: ${buyNowUnits.at(-1)} compute units`);
  const loanA = await paylater.loanPdaOf(alice.identity.address, loanIdA);
  eq('the pool paid the full price into the order\'s vault', [await tok.balance(qA.order), poolBefore - (await tok.balance(pool))], [price, price]);
  eq('alice paid nothing herself', await tok.balance(alice.identity.address), aliceBeforeBuy);
  const oFunded = (await fetchOrder(rpc, qA.order)).data;
  eq('buy_now had the escrow confirm the order in the same instruction: Funded, with a delivery deadline', [oFunded.state, oFunded.deliverBy > oFunded.createdAt], [OrderState.Funded, true]);
  // The buyer may cancel an unpaid quote at any time and the vault goes to it.
  // That must not be a way to turn the pool's payment into cash: the order
  // left AwaitingPayment inside buy_now, so the escrow refuses.
  await expectFail('alice cancels the order to pocket the pool\'s payment', 'InvalidState', async () =>
    alice.sendTransaction([
      await getCancelUnpaidInstructionAsync({ order: qA.order, mint, payer: server.identity.address, authority: alice.identity, buyerToken: await tok.ata(alice.identity.address) }),
    ]),
  );
  await expectFail('a second confirm_funded on the funded order', 'InvalidState', () => confirm(qA.order, m1));
  eq('the pool\'s money is still in the vault', await tok.balance(qA.order), price);
  const la = (await paylater.fetchLoan(rpc, loanA)).data;
  eq('the loan records the order, its price and its request hash', [la.order, la.amount, la.requestHash], [qA.order, price, requestHash]);
  eq('the buyer owes the price plus the 2% pool fee', [la.fee, paylater.owedOf(la)], [fee, price + fee]);
  const atOpen = await live(alice, la.createdAt);
  eq('the program used alice\'s live Tessera score', [la.buyerTier, la.buyerScore], [atOpen.tier, atOpen.score]);
  eq('the limit matches the off-chain formula', la.limitAtOpen, paylater.limit(paylater.NO_LINE, LINE, atOpen.tier, atOpen.score));
  eq('the loan is due in 30 seconds', la.dueAt - la.createdAt, BigInt(LINE.termSecs));
  await deliver(qA.order, m1);
  await release(qA.order, alice, m1);
  const oA = (await fetchOrder(rpc, qA.order)).data;
  eq('the escrow paid the merchant the price minus its own 1% fee', [(await tok.balance(m1.identity.address)) - m1Before, oA.state, oA.paidMerchant], [price - escrowFee, OrderState.Released, price - escrowFee]);
  const line1 = (await lineOf(alice));
  if (!line1.exists) throw new Error('alice has no line');
  eq('alice owes the full price against her limit', line1.data.outstanding, price);
  // Her score rose when the order settled, so the limit is read again, not taken from the loan.
  const qOver = await quote(alice, m1, (await limitSoon(alice, line1.data)) - price + 1n);
  await expectFail('alice spends one unit past her remaining credit', 'CreditLimitExceeded', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity, qOver.order)).ix]),
  );
  await expectFail('a stranger marks a loan in default before it is due', 'NotOverdue', async () =>
    stranger.sendTransaction([await paylater.getMarkDefaultInstructionAsync({ loan: loanA, line: await paylater.linePdaOf(alice.identity.address) })]),
  );
  const aliceBefore = await tok.balance(alice.identity.address);
  await alice.sendTransaction([await repayIx(loanA, alice)]);
  eq('alice repaid the price plus the pool fee, no interest', aliceBefore - (await tok.balance(alice.identity.address)), price + fee);
  const la2 = (await paylater.fetchLoan(rpc, loanA)).data;
  eq('the loan is marked repaid on time', la2.state, paylater.LoanState.RepaidOnTime);
  eq('the pool earned its fee at repayment', (await paylater.fetchPool(rpc, pool)).data.feesEarned, fee);
  await expectFail('the same loan is repaid twice', 'InvalidState', async () => alice.sendTransaction([await repayIx(loanA, alice)]));
  const line2 = (await lineOf(alice));
  if (!line2.exists) throw new Error('alice has no line');
  eq('alice owes nothing and has one on-time repayment', [line2.data.outstanding, line2.data.repaidOnTime], [0n, 1]);
  // The boost is the step scaled by the loan's share of the tier limit: half
  // the limit at a perfect score, so here half a step at most, less at her score.
  const boostA = paylater.boostOf(price, la.buyerTier, LINE);
  eq('the boost is the step scaled by the loan\'s share of the tier limit, as the SDK computes it', [line2.data.boostBps, boostA > 0 && boostA <= LINE.stepBps / 2], [boostA, true]);
  const nowS = await live(alice);
  const grown = paylater.limit(line2.data, LINE, nowS.tier, nowS.score);
  const flat = paylater.limit(paylater.NO_LINE, LINE, nowS.tier, nowS.score);
  eq('repaying on time raised her limit by that boost', grown, (flat * (10_000n + BigInt(boostA))) / 10_000n);
  // The program must apply that boost too: buy more than the unboosted limit allows.
  const boosted = flat + (grown - flat) / 2n;
  const loanA2 = await buy(alice, m1, boosted);
  const la3 = (await paylater.fetchLoan(rpc, loanA2)).data;
  const at3 = await live(alice, la3.createdAt);
  eq('the program applied the boost: a purchase above the unboosted limit went through', [boosted > flat, la3.amount], [true, boosted]);
  eq('and its limit matches the off-chain formula with the boost', la3.limitAtOpen, paylater.limit(line2.data, LINE, at3.tier, at3.score));
  const qOver2 = await quote(alice, m1, (await limitSoon(alice, line2.data)) - boosted + 1n);
  await expectFail('one unit past the boosted limit', 'CreditLimitExceeded', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity, qOver2.order)).ix]),
  );
  await alice.sendTransaction([await repayIx(loanA2, alice)]);
  eq('alice repaid that one on time too', (await paylater.fetchLoan(rpc, loanA2)).data.state, paylater.LoanState.RepaidOnTime);

  // ------------------------- 2b. the boost follows the size of what was repaid
  log.step('2b. A run of the smallest loans barely moves the limit; one the size of the tier limit adds a whole step');
  const lent: bigint[] = []; // what 2b lends, for the pool's books in 5.
  /** The tier alice will open her next loan at: the one she holds for the next several seconds. */
  const steadyTier = async (): Promise<number> => {
    for (;;) {
      const a = (await fetchAgent(rpc, await agentPdaOf(alice.identity.address))).data;
      const at = await chainTime(server);
      const tiers = new Set<number>();
      for (let k = 0n; k <= 8n; k += 1n) tiers.add(score.evaluate(a, cfgParams, at + k).tier);
      if (tiers.size === 1) return [...tiers][0]!;
      await sleep(1000);
    }
  };
  // Counting repayments, as the boost once did, five of the smallest loans the
  // pool finances would have added five whole steps for five 0.00002 USDC fees.
  const beforeRun = await lineOf(alice);
  if (!beforeRun.exists) throw new Error('alice has no line');
  const run: Address[] = [];
  for (let i = 0; i < 5; i += 1) run.push(await buy(alice, m1, LINE.minLoan));
  await alice.sendTransaction(await Promise.all(run.map((loan) => repayIx(loan, alice))));
  lent.push(...run.map(() => LINE.minLoan));
  const afterRun = await lineOf(alice);
  if (!afterRun.exists) throw new Error('alice has no line');
  const runTiers = await Promise.all(run.map(async (loan) => (await paylater.fetchLoan(rpc, loan)).data.buyerTier));
  const runBoost = afterRun.data.boostBps - beforeRun.data.boostBps;
  eq('five 0.001 USDC loans repaid on time count as five on-time repayments, and add to the boost what the SDK says they do', [afterRun.data.repaidOnTime - beforeRun.data.repaidOnTime, runBoost], [5, runTiers.reduce((sum, t) => sum + paylater.boostOf(LINE.minLoan, t, LINE), 0)]);
  const atRun = await live(alice);
  const limitBeforeRun = paylater.limit(beforeRun.data, LINE, atRun.tier, atRun.score);
  const limitAfterRun = paylater.limit(afterRun.data, LINE, atRun.tier, atRun.score);
  const counted = Math.min(beforeRun.data.boostBps + 5 * LINE.stepBps, LINE.maxBoostBps) - Math.min(beforeRun.data.boostBps, LINE.maxBoostBps);
  log.info(`boost ${beforeRun.data.boostBps} -> ${afterRun.data.boostBps} bps, limit ${fromUnits(limitBeforeRun)} -> ${fromUnits(limitAfterRun)} USDC; counting repayments would have added ${counted} bps`);
  eq('and barely move the limit (by less than 0.1%), where counting repayments would have added at least a whole step', [runBoost <= 5, limitAfterRun - limitBeforeRun <= limitBeforeRun / 1_000n, counted >= LINE.stepBps], [true, true, true]);

  // A loan the size of the limit of the tier it opens at earns a whole step.
  // Her limit is that tier limit scaled by her score and the boost; should it
  // not yet cover one, she borrows what she can and repays it on time first.
  for (let i = 0; ; i += 1) {
    const t = await steadyTier();
    const l = await lineOf(alice);
    if (!l.exists) throw new Error('alice has no line');
    const e = await live(alice);
    const room = paylater.limit(l.data, LINE, e.tier, e.score) - l.data.outstanding;
    if (e.tier === t && room >= LINE.tierLimit[t]!) break;
    if (i >= 6) throw new Error(`alice's limit never reached her tier limit: ${fromUnits(room)} USDC available`);
    const pump = await buy(alice, m1, room);
    await alice.sendTransaction([await repayIx(pump, alice)]);
    lent.push(room);
  }
  const tFull = await steadyTier();
  const full = LINE.tierLimit[tFull]!;
  const beforeFull = await lineOf(alice);
  if (!beforeFull.exists) throw new Error('alice has no line');
  const loanFull = await buy(alice, m1, full);
  const lf = (await paylater.fetchLoan(rpc, loanFull)).data;
  await alice.sendTransaction([await repayIx(loanFull, alice)]);
  lent.push(full);
  const afterFull = await lineOf(alice);
  if (!afterFull.exists) throw new Error('alice has no line');
  eq(`a ${fromUnits(full)} USDC loan, the limit of the tier it opened at, repaid on time adds a whole step to the boost`, [
    lf.buyerTier,
    (await paylater.fetchLoan(rpc, loanFull)).data.state,
    afterFull.data.boostBps - beforeFull.data.boostBps,
    paylater.boostOf(full, tFull, LINE),
  ], [tFull, paylater.LoanState.RepaidOnTime, LINE.stepBps, LINE.stepBps]);
  // Below the cap, a whole step is a quarter of her unboosted limit.
  const atFull = await live(alice);
  const flatFull = paylater.limit(paylater.NO_LINE, LINE, atFull.tier, atFull.score);
  const rise = paylater.limit(afterFull.data, LINE, atFull.tier, atFull.score) - paylater.limit(beforeFull.data, LINE, atFull.tier, atFull.score);
  log.info(`boost ${beforeFull.data.boostBps} -> ${afterFull.data.boostBps} bps, limit +${fromUnits(rise)} USDC on an unboosted ${fromUnits(flatFull)} USDC`);
  eq('and, the boost being under its cap, her limit rose by a whole step of her unboosted limit', [
    afterFull.data.boostBps <= LINE.maxBoostBps,
    rise - (flatFull * BigInt(LINE.stepBps)) / 10_000n <= 1n && (flatFull * BigInt(LINE.stepBps)) / 10_000n - rise <= 1n,
  ], [true, true]);

  // ------------------------------------ 2c. a tab: buy several, pay once
  log.step('2c. Alice buys three things and settles the tab in one transaction');
  const lineTab = await lineOf(alice);
  if (!lineTab.exists) throw new Error('alice has no line');
  const atTab = await live(alice);
  const each = paylater.limit(lineTab.data, LINE, atTab.tier, atTab.score) / 4n;
  const tab: Address[] = [];
  // The first one the way `tessera buy-later --order` does it: the SDK's
  // buyOrderOnCredit, one buy_now, signed by the buyer and the order's merchant.
  {
    const { order } = await quote(alice, m1, each);
    let wrongMerchant = '';
    await paylater.buyOrderOnCredit(rpc, alice.identity, order, m2.identity).catch((e: Error) => (wrongMerchant = e.message));
    eq('buyOrderOnCredit refuses a merchant signer that did not open the order', /was opened by the merchant/.test(wrongMerchant), true);
    const { loanId, loan, instructions } = await paylater.buyOrderOnCredit(rpc, alice.identity, order, m1.identity);
    await sendBuyNow(alice, instructions);
    eq('the SDK\'s one instruction had the pool pay the vault and the order confirmed', [instructions.length, (await fetchOrder(rpc, order)).data.state, loan], [1, OrderState.Funded, await paylater.loanPdaOf(alice.identity.address, loanId)]);
    await deliver(order, m1);
    await release(order, alice, m1);
    tab.push(loan);
  }
  // The second through the CLI: `tessera buy-later --order` sends the buy_now
  // itself, so it signs with the buyer's key and the merchant's.
  {
    const { order } = await quote(alice, m1, each);
    const [aliceKey, m1Key, m2Key] = [keyFile(alice), keyFile(m1), keyFile(m2)];
    const without = await cli(['buy-later', '--order', order, '--keypair', aliceKey, '--send']);
    eq('tessera buy-later --order with only the buyer\'s key stops before signing anything, and says the merchant must sign', [without.status, /needs the order's merchant's signature/.test(without.stderr)], [1, true]);
    const wrong = await cli(['buy-later', '--order', order, '--keypair', aliceKey, '--merchant-keypair', m2Key, '--send']);
    eq('with another merchant\'s key it stops too', [wrong.status, /--merchant-keypair is .*, but order .* is .*'s/.test(wrong.stderr)], [1, true]);
    const bought = await cli(['buy-later', '--order', order, '--keypair', aliceKey, '--merchant-keypair', m1Key, '--send']);
    const signature = /confirmed: (\w+)/.exec(bought.stdout)?.[1];
    const loan = /^loan (\w+)$/m.exec(bought.stdout)?.[1] as Address | undefined;
    if (signature) buyNowUnits.push((await metaOf(signature)).units);
    eq('with the order\'s merchant\'s key as well it sends one buy_now, signed by both: the order is Funded and the loan open', [
      bought.status,
      signature !== undefined,
      (await fetchOrder(rpc, order)).data.state,
      loan !== undefined && (await paylater.fetchMaybeLoan(rpc, loan)).exists,
    ], [0, true, OrderState.Funded, true]);
    if (!loan) throw new Error(`the CLI bought nothing: ${bought.stdout}${bought.stderr}`);
    await deliver(order, m1);
    await release(order, alice, m1);
    tab.push(loan);
  }
  tab.push(await buy(alice, m1, each));
  const owedTab = (await lineOf(alice));
  eq('alice owes the whole tab against her limit', owedTab.exists && owedTab.data.outstanding, each * 3n);
  const listed = paylater.owed(await paylater.fetchLoansOf(rpc, alice.identity.address));
  eq('the chain lists her three open loans', listed.map((l) => l.address).sort(), [...tab].sort());
  eq('with the price plus the fee owed on each', listed.map((l) => paylater.owedOf(l.data)), [each + paylater.feeOf(each, LINE), each + paylater.feeOf(each, LINE), each + paylater.feeOf(each, LINE)]);
  await alice.sendTransaction(await Promise.all(tab.map((loan) => repayIx(loan, alice))));
  const settled = await lineOf(alice);
  eq('one transaction settled the tab: nothing owed, three more on-time repayments', settled.exists && [settled.data.outstanding, settled.data.repaidOnTime - lineTab.data.repaidOnTime], [0n, 3]);
  await expectFail('a stranger closes alice\'s loan to take the rent', 'Unauthorized', async () =>
    stranger.sendTransaction([paylater.getCloseLoanInstruction({ loan: loanA, buyer: stranger.identity.address })]),
  );
  await stranger.sendTransaction([paylater.getCloseLoanInstruction({ loan: loanA, buyer: alice.identity.address })]);
  eq('the repaid loan was closed, its rent back to alice', (await rpc.getAccountInfo(loanA).send()).value, null);

  // ----------------------------------------------- 3. default and freeze
  log.step('3. Bob buys and never repays');
  const bobLimit = paylater.limit(paylater.NO_LINE, LINE, bTier, (await live(bob)).score);
  const loanB = await buy(bob, m1, bobLimit / 2n);
  const lb = (await paylater.fetchLoan(rpc, loanB)).data;
  const bobLine = await paylater.linePdaOf(bob.identity.address);
  const markIx = async () => paylater.getMarkDefaultInstructionAsync({ loan: loanB, line: bobLine });
  eq('the loan carries its own default deadline', lb.defaultAfter, lb.dueAt + BigInt(LINE.graceSecs));
  // A later rules change must not shorten the grace period of a loan already open.
  await deployer.sendTransaction([await updateIx(deployer, { ...LINE, graceSecs: 0 })]);
  await waitForChainTime(server, lb.dueAt + 1n);
  await expectFail('marked in default during the grace period, after the rules cut grace to 0', 'NotOverdue', async () =>
    stranger.sendTransaction([await markIx()]),
  );
  await deployer.sendTransaction([await updateIx(deployer, LINE)]);
  await waitForChainTime(server, lb.defaultAfter + 1n);
  await stranger.sendTransaction([await markIx()]);
  eq('a stranger marked bob\'s loan in default', (await paylater.fetchLoan(rpc, loanB)).data.state, paylater.LoanState.Defaulted);
  const bl = (await paylater.fetchCreditLine(rpc, bobLine)).data;
  eq('the default is on bob\'s public record', [bl.defaults, bl.outstanding], [1, lb.amount]);
  eq('bob\'s limit is frozen at 0', paylater.limit(bl, LINE, bTier, (await live(bob)).score), 0n);
  const qBobAgain = await quote(bob, m1, 1_000n);
  await expectFail('bob buys again after defaulting', 'CreditLimitExceeded', async () =>
    bob.sendTransaction([(await buyIx(bob, m1.identity, qBobAgain.order)).ix]),
  );
  await expectFail('the default is marked twice', 'InvalidState', async () => stranger.sendTransaction([await markIx()]));
  await expectFail('bob closes his unpaid loan to make it disappear', 'InvalidState', async () =>
    bob.sendTransaction([paylater.getCloseLoanInstruction({ loan: loanB, buyer: bob.identity.address })]),
  );
  const bobBefore = await tok.balance(bob.identity.address);
  await bob.sendTransaction([await repayIx(loanB, bob)]);
  eq('a late repayment is the price plus the fee too', bobBefore - (await tok.balance(bob.identity.address)), lb.amount + lb.fee);
  const bl2 = (await paylater.fetchCreditLine(rpc, bobLine)).data;
  eq('bob can still pay the debt late: it clears, the default stays', [bl2.outstanding, bl2.repaidLate, bl2.defaults], [0n, 1, 1]);
  eq('and his line stays frozen', paylater.limit(bl2, LINE, bTier, (await live(bob)).score), 0n);

  // ------------------------------ 4. the merchant never delivers: a refund
  log.step('4. The merchant never delivers: the escrow refunds alice, who still owes the pool');
  const aliceNow = await live(alice);
  const lineR = await lineOf(alice);
  if (!lineR.exists) throw new Error('alice has no line');
  const priceR = paylater.limit(lineR.data, LINE, aliceNow.tier, aliceNow.score) / 2n;
  const qR = await quote(alice, m1, priceR);
  const { loanId: loanIdR, ix: buyR } = await buyIx(alice, m1.identity, qR.order);
  await sendBuyNow(alice, [buyR]);
  const loanR = await paylater.loanPdaOf(alice.identity.address, loanIdR);
  const funded = (await fetchOrder(rpc, qR.order)).data;
  eq('the order is Funded, so only the escrow\'s refund path can return the money', funded.state, OrderState.Funded);
  const aliceBeforeRefund = await tok.balance(alice.identity.address);
  const poolBeforeRefund = await tok.balance(pool);
  await waitForChainTime(server, funded.deliverBy + 1n);
  await stranger.sendTransaction([getRefundInstruction(await settleInput(qR.order, alice, m1, stranger))]);
  const refunded = (await fetchOrder(rpc, qR.order)).data;
  eq('the escrow refunded the price to alice, not to the pool', [refunded.state, (await tok.balance(alice.identity.address)) - aliceBeforeRefund, await tok.balance(pool)], [OrderState.Refunded, priceR, poolBeforeRefund]);
  const lr = (await paylater.fetchLoan(rpc, loanR)).data;
  const lineR2 = await lineOf(alice);
  eq('the loan is still open and owed', [lr.state, lineR2.exists && lineR2.data.outstanding], [paylater.LoanState.Open, priceR]);
  await alice.sendTransaction([await repayIx(loanR, alice)]);
  const lr2 = (await paylater.fetchLoan(rpc, loanR)).data;
  const lineR3 = await lineOf(alice);
  eq('alice repaid it out of the refund', [lr2.state, lineR3.exists && lineR3.data.outstanding], [paylater.LoanState.RepaidOnTime, 0n]);

  // ------------------------------------------------- 5. pool accounting
  log.step('5. Pool accounting and withdrawals');
  await expectFail('a stranger withdraws the pool', 'Unauthorized', async () =>
    stranger.sendTransaction([
      await paylater.getWithdrawInstructionAsync({ mint, authority: stranger.identity, to: await tok.ata(stranger.identity.address), amount: 1n }),
    ]),
  );
  const p = (await paylater.fetchPool(rpc, pool)).data;
  const vaultBalance = await tok.balance(pool);
  eq('vault = deposits - withdrawals - lent + repaid + fees earned', vaultBalance, p.deposited - p.withdrawn - p.lent + p.repaid + p.feesEarned);
  eq('every loan was repaid in full: lent equals repaid, nothing is outstanding', [p.lent, p.outstanding], [p.repaid, 0n]);
  const loans = [price, boosted, each, each, each, ...lent, lb.amount, priceR];
  const fees = loans.reduce((sum, a) => sum + paylater.feeOf(a, LINE), 0n);
  eq('the pool earned the 2% fee on every loan, each at repayment', [p.lent, p.feesEarned], [loans.reduce((sum, a) => sum + a, 0n), fees]);
  // Every buy_now that landed, the first of them opening a line as well as a loan.
  const most = Math.max(...buyNowUnits);
  log.info(`buy_now used ${Math.min(...buyNowUnits)}-${most} compute units over ${buyNowUnits.length} purchases; BUY_NOW_COMPUTE_UNITS is ${paylater.BUY_NOW_COMPUTE_UNITS}`);
  eq('BUY_NOW_COMPUTE_UNITS leaves at least 30% spare over the most any buy_now used', most > 0 && most <= paylater.BUY_NOW_COMPUTE_UNITS * 0.7, true);
  log.info(`pool: lent ${fromUnits(p.lent)}, repaid ${fromUnits(p.repaid)}, fees ${fromUnits(p.feesEarned)}, defaulted ${fromUnits(p.defaulted)} USDC`);
  await deployer.sendTransaction([await tok.ensureAtaIx(deployer.identity.address, deployer)]);
  await deployer.sendTransaction([
    await paylater.getWithdrawInstructionAsync({ mint, authority: deployer.identity, to: await tok.ata(deployer.identity.address), amount: vaultBalance }),
  ]);
  eq('the authority withdrew the liquidity and the fees', await tok.balance(deployer.identity.address), vaultBalance);
  const qEmpty = await quote(alice, m1, 1_000n);
  await expectFail('a purchase when the pool is empty', 'PoolEmpty', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity, qEmpty.order)).ix]),
  );

  // ------------------------------------- 6. the server takes its rent back
  // The merchant server fronts each quote's rent and closes the order for it
  // once the review window has passed. The escrow on devnet is an older build
  // whose close_order takes one account fewer, so this also runs with
  // ESCROW_SO pointed at it.
  log.step('6. The merchant server closes a settled order and gets its rent back');
  const oldest = settledOrders[0]!;
  const settledOrder = (await fetchOrder(rpc, oldest)).data;
  await waitForChainTime(server, settledOrder.settledAt + BigInt(PARAMS.reviewSecs) + 1n);
  const orderRent = (await rpc.getBalance(oldest).send()).value;
  const serverBefore = (await rpc.getBalance(server.identity.address).send()).value;
  await closeOrder(server, oldest, settledOrder);
  const gone = await rpc.getAccountInfo(oldest, { encoding: 'base64' }).send();
  const serverAfter = (await rpc.getBalance(server.identity.address).send()).value;
  log.info(`close_order took the ${closeOrderAccountList()} account list on this escrow build`);
  eq('the order account is closed', gone.value, null);
  eq('the server got the rent back, less one network fee', serverAfter - serverBefore, orderRent - 5_000n);
  await closeOrder(server, settledOrders[1]!, (await fetchOrder(rpc, settledOrders[1]!)).data);
  eq('a second close uses the account list the first one found', (await rpc.getAccountInfo(settledOrders[1]!, { encoding: 'base64' }).send()).value, null);
} catch (e) {
  failures += 1;
  console.log(`\n   FAIL the run stopped on an unexpected error:\n${errText(e).slice(0, 1500)}`);
} finally {
  proc.kill('SIGKILL');
  await sleep(300);
  rmSync(ledger, { recursive: true, force: true });
  rmSync(keydir, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${checks - failures}/${checks} checks`);
process.exit(failures === 0 ? 0 : 1);
