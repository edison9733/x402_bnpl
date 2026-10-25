/**
 * Runs the pay-later program next to the real escrow program on a local
 * validator. Wallets earn their Tessera tiers through real escrow orders, then
 * buy now and pay later against the limit those tiers give them. Every
 * purchase on credit goes through the escrow: the merchant opens the order (its
 * 402 quote), the pool pays the price into the order's vault in the buyer's
 * place, the escrow confirms the payment, the merchant delivers and is paid by
 * the escrow. The buyer owes the pool the price plus its fee.
 *
 *   1. a wallet with no history gets no credit, and only a real quote for this
 *      buyer can be funded;
 *   2. a wallet with a tier buys, the pool pays the escrow, the merchant is paid
 *      by the escrow, the buyer repays on time and its limit grows;
 *   3. a buyer that never repays is marked in default by a stranger and its
 *      line is frozen;
 *   4. the merchant never delivers: the escrow refunds the buyer, and the loan
 *      is still owed;
 *   5. pool accounting, and the main refusal paths as real transactions.
 *
 * Every limit the program applies is recomputed off-chain from the same
 * public accounts (packages/sdk/src/paylater/limit.ts) and must match.
 *
 *   npm run build:program && npm run test:paylater
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { lamports, type Address } from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import { getInitializeMint2Instruction, getMintSize, getMintToInstruction, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import {
  agentPdaOf,
  configPda,
  fetchAgent,
  fetchConfig,
  fetchOrder,
  fromUnits,
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
    const p = resolve(REPO_ROOT, `target/deploy/${name}.so`);
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

const role = async () => clientForSigner((await generateKeypairBytes()).signer, LOCAL);
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
  async function escrowOrder(buyer: ScriptClient, merchant: ScriptClient, amount: bigint): Promise<void> {
    const { order, vault } = await quote(buyer, merchant, amount);
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
  const buyIx = async (buyer: ScriptClient, merchant: Address, order: Address, loanId = newOrderId()) => ({
    loanId,
    ix: await paylater.getBuyNowInstructionAsync({ mint, buyer: buyer.identity, merchant, order, loanId }),
  });
  /** A whole purchase on credit: the merchant's quote, the pool's payment into its vault, confirmation, delivery, release. */
  async function buy(buyer: ScriptClient, merchant: ScriptClient, amount: bigint): Promise<Address> {
    const { order } = await quote(buyer, merchant, amount);
    const { loanId, ix } = await buyIx(buyer, merchant.identity.address, order);
    await buyer.sendTransaction([ix]);
    await confirm(order, merchant);
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

  // --------------------------------------------- 1. no history, no credit
  log.step('1. A wallet with no history gets no credit, and only a real quote for this buyer can be funded');
  const qFresh = await quote(fresh, m1, 1_000n);
  await expectFail('a New wallet buys on credit', 'CreditLimitExceeded', async () =>
    fresh.sendTransaction([(await buyIx(fresh, m1.identity.address, qFresh.order)).ix]),
  );
  const nobody = await role();
  await rpc.requestAirdrop(nobody.identity.address, lamports(2_000_000_000n)).send();
  await sleep(1500);
  await expectFail('a wallet with no credit file at all buys on credit', 'ConstraintOwner', async () =>
    nobody.sendTransaction([(await buyIx(nobody, m1.identity.address, qFresh.order)).ix]),
  );
  const qNewMerchant = await quote(alice, fresh, 1_000n);
  await expectFail('a tiered buyer pays a New merchant on credit', 'MerchantTierTooLow', async () =>
    alice.sendTransaction([(await buyIx(alice, fresh.identity.address, qNewMerchant.order)).ix]),
  );
  const qAlice = await quote(alice, m1, 1_000n);
  await expectFail('a buyer pays itself on credit', 'SelfDealing', async () =>
    alice.sendTransaction([(await buyIx(alice, alice.identity.address, qAlice.order)).ix]),
  );
  await expectFail('the merchant named is not the one that opened the order', 'NotTheMerchant', async () =>
    alice.sendTransaction([(await buyIx(alice, m2.identity.address, qAlice.order)).ix]),
  );
  const qBob = await quote(bob, m1, 1_000n);
  await expectFail('alice funds an order the merchant opened for bob', 'NotTheBuyer', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity.address, qBob.order)).ix]),
  );
  const qSmall = await quote(alice, m1, 999n);
  await expectFail('a purchase below the pool\'s minimum', 'AmountTooSmall', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity.address, qSmall.order)).ix]),
  );
  const otherMint = await newMint();
  await expectFail('the wrong mint, with the real vaults', 'MintMismatch', async () =>
    alice.sendTransaction([
      await paylater.getBuyNowInstructionAsync({
        mint: otherMint, vault: await tok.ata(pool), orderVault: qAlice.vault, buyer: alice.identity, merchant: m1.identity.address, order: qAlice.order, loanId: newOrderId(),
      }),
    ]),
  );
  // A plain wallet with a token account, so the only thing wrong is who owns the account.
  await expectFail('an account the escrow program does not own passed as the order', 'ConstraintOwner', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity.address, stranger.identity.address)).ix]),
  );
  // An escrow account that is not an order (alice's credit file), given a token account so the only thing wrong is what it is.
  const aliceAgent = await agentPdaOf(alice.identity.address);
  await stranger.sendTransaction([await tok.ensureAtaIx(aliceAgent, stranger)]);
  await expectFail('an escrow account that is not an order', 'NotAnOrder', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity.address, aliceAgent)).ix]),
  );
  // A quote alice has already paid herself.
  const qPaid = await quote(alice, m1, 1_000n);
  await alice.sendTransaction([await tok.transferIx(alice, qPaid.vault, 1_000n)]);
  await expectFail('the order\'s vault already holds the price', 'OrderAlreadyFunded', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity.address, qPaid.order)).ix]),
  );
  await confirm(qPaid.order);
  await expectFail('the order is already funded and confirmed', 'OrderNotAwaitingPayment', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity.address, qPaid.order)).ix]),
  );
  await m1.sendTransaction([getRefundInstruction(await settleInput(qPaid.order, alice, m1, m1))]);
  // A quote whose payment window has closed: confirm_funded would refuse the money, so the pool does too.
  const qLate = await quote(alice, m1, 1_000n);
  const late = (await fetchOrder(rpc, qLate.order)).data;
  await waitForChainTime(server, late.createdAt + BigInt(PARAMS.unpaidSecs) + 1n);
  await expectFail('a quote past its payment window', 'PaymentWindowClosed', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity.address, qLate.order)).ix]),
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
  const qA = await quote(alice, m1, price);
  const { loanId: loanIdA, ix: buyA } = await buyIx(alice, m1.identity.address, qA.order);
  await alice.sendTransaction([buyA]);
  const loanA = await paylater.loanPdaOf(alice.identity.address, loanIdA);
  eq('the pool paid the full price into the order\'s vault', [await tok.balance(qA.order), poolBefore - (await tok.balance(pool))], [price, price]);
  eq('alice paid nothing herself', await tok.balance(alice.identity.address), aliceBeforeBuy);
  const la = (await paylater.fetchLoan(rpc, loanA)).data;
  eq('the loan records the order, its price and its request hash', [la.order, la.amount, la.requestHash], [qA.order, price, requestHash]);
  eq('the buyer owes the price plus the 2% pool fee', [la.fee, paylater.owedOf(la)], [fee, price + fee]);
  const atOpen = await live(alice, la.createdAt);
  eq('the program used alice\'s live Tessera score', [la.buyerTier, la.buyerScore], [atOpen.tier, atOpen.score]);
  eq('the limit matches the off-chain formula', la.limitAtOpen, paylater.limit(paylater.NO_LINE, LINE, atOpen.tier, atOpen.score));
  eq('the loan is due in 30 seconds', la.dueAt - la.createdAt, BigInt(LINE.termSecs));
  await confirm(qA.order, m1);
  eq('the escrow accepted the pool\'s payment as funding', (await fetchOrder(rpc, qA.order)).data.state, OrderState.Funded);
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
    alice.sendTransaction([(await buyIx(alice, m1.identity.address, qOver.order)).ix]),
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
  const nowS = await live(alice);
  const grown = paylater.limit(line2.data, LINE, nowS.tier, nowS.score);
  const flat = paylater.limit(paylater.NO_LINE, LINE, nowS.tier, nowS.score);
  eq('repaying on time raised her limit by 25%', grown, (flat * 12_500n) / 10_000n);
  // The program must apply that boost too: buy more than the unboosted limit allows.
  const boosted = flat + (grown - flat) / 2n;
  const loanA2 = await buy(alice, m1, boosted);
  const la3 = (await paylater.fetchLoan(rpc, loanA2)).data;
  const at3 = await live(alice, la3.createdAt);
  eq('the program applied the boost: a purchase above the unboosted limit went through', [boosted > flat, la3.amount], [true, boosted]);
  eq('and its limit matches the off-chain formula with the boost', la3.limitAtOpen, paylater.limit(line2.data, LINE, at3.tier, at3.score));
  const qOver2 = await quote(alice, m1, (await limitSoon(alice, line2.data)) - boosted + 1n);
  await expectFail('one unit past the boosted limit', 'CreditLimitExceeded', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity.address, qOver2.order)).ix]),
  );
  await alice.sendTransaction([await repayIx(loanA2, alice)]);
  eq('alice repaid that one on time too', (await paylater.fetchLoan(rpc, loanA2)).data.state, paylater.LoanState.RepaidOnTime);

  // ------------------------------------ 2b. a tab: buy several, pay once
  log.step('2b. Alice buys three things and settles the tab in one transaction');
  const lineTab = await lineOf(alice);
  if (!lineTab.exists) throw new Error('alice has no line');
  const atTab = await live(alice);
  const each = paylater.limit(lineTab.data, LINE, atTab.tier, atTab.score) / 4n;
  const tab: Address[] = [];
  // The first one the way the CLI does it: buy_now and confirm_funded in one transaction.
  {
    const { order } = await quote(alice, m1, each);
    const { loanId, loan, instructions } = await paylater.buyOrderOnCredit(rpc, alice.identity, order);
    await alice.sendTransaction(instructions);
    eq('one transaction had the pool pay the vault and confirmed the order', [(await fetchOrder(rpc, order)).data.state, loan], [OrderState.Funded, await paylater.loanPdaOf(alice.identity.address, loanId)]);
    await deliver(order, m1);
    await release(order, alice, m1);
    tab.push(loan);
  }
  for (let i = 0; i < 2; i += 1) tab.push(await buy(alice, m1, each));
  const owedTab = (await lineOf(alice));
  eq('alice owes the whole tab against her limit', owedTab.exists && owedTab.data.outstanding, each * 3n);
  const listed = paylater.owed(await paylater.fetchLoansOf(rpc, alice.identity.address));
  eq('the chain lists her three open loans', listed.map((l) => l.address).sort(), [...tab].sort());
  eq('with the price plus the fee owed on each', listed.map((l) => paylater.owedOf(l.data)), [each + paylater.feeOf(each, LINE), each + paylater.feeOf(each, LINE), each + paylater.feeOf(each, LINE)]);
  await alice.sendTransaction(await Promise.all(tab.map((loan) => repayIx(loan, alice))));
  const settled = await lineOf(alice);
  eq('one transaction settled the tab: nothing owed, three more on-time repayments', settled.exists && [settled.data.outstanding, settled.data.repaidOnTime], [0n, 5]);
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
    bob.sendTransaction([(await buyIx(bob, m1.identity.address, qBobAgain.order)).ix]),
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
  const { loanId: loanIdR, ix: buyR } = await buyIx(alice, m1.identity.address, qR.order);
  await alice.sendTransaction([buyR]);
  const loanR = await paylater.loanPdaOf(alice.identity.address, loanIdR);
  await confirm(qR.order, m1);
  const funded = (await fetchOrder(rpc, qR.order)).data;
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
  const fees = [price, boosted, each, each, each, lb.amount, priceR].reduce((sum, a) => sum + paylater.feeOf(a, LINE), 0n);
  eq('the pool earned the 2% fee on every loan, each at repayment', [p.lent, p.feesEarned], [price + boosted + 3n * each + lb.amount + priceR, fees]);
  log.info(`pool: lent ${fromUnits(p.lent)}, repaid ${fromUnits(p.repaid)}, fees ${fromUnits(p.feesEarned)}, defaulted ${fromUnits(p.defaulted)} USDC`);
  await deployer.sendTransaction([await tok.ensureAtaIx(deployer.identity.address, deployer)]);
  await deployer.sendTransaction([
    await paylater.getWithdrawInstructionAsync({ mint, authority: deployer.identity, to: await tok.ata(deployer.identity.address), amount: vaultBalance }),
  ]);
  eq('the authority withdrew the liquidity and the fees', await tok.balance(deployer.identity.address), vaultBalance);
  const qEmpty = await quote(alice, m1, 1_000n);
  await expectFail('a purchase when the pool is empty', 'PoolEmpty', async () =>
    alice.sendTransaction([(await buyIx(alice, m1.identity.address, qEmpty.order)).ix]),
  );
} catch (e) {
  failures += 1;
  console.log(`\n   FAIL the run stopped on an unexpected error:\n${errText(e).slice(0, 1500)}`);
} finally {
  proc.kill('SIGKILL');
  await sleep(300);
  rmSync(ledger, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${checks - failures}/${checks} checks`);
process.exit(failures === 0 ? 0 : 1);
