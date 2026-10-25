/**
 * Pay-later commands. Unlike the escrow commands these do not go through the
 * API: they read the chain themselves and build the one pay-later instruction
 * locally, so there is no reply to check before signing.
 *
 *   tessera credit <wallet>
 *   tessera buy-later --order <order> --keypair PATH [--send]
 *   tessera repay <loan> --keypair PATH [--send]
 *   tessera repay --all --keypair PATH [--send]      every loan still owed, in one transaction
 *   tessera mark-default <loan> --keypair PATH [--send]
 */
import {
  address,
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  fetchEncodedAccount,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from '@solana/kit';
import { fetchMaybeToken } from '@solana-program/token';
import {
  agentPdaOf,
  configPda,
  fetchMaybeAgent,
  fetchMaybeConfig,
  fetchMaybeOrder,
  findAta,
  fromUnits,
  paylater,
  score,
} from '@tessera/sdk';

export const PAYLATER_COMMANDS = new Set(['credit', 'buy-later', 'repay', 'mark-default']);

export const PAYLATER_HELP = `Pay later (reads the chain itself; no API)
  credit <wallet>                                a wallet's pay-later limit and record
  buy-later --order <order> --keypair PATH [--send]
                                                 the pool pays the quoted escrow order for you; you repay
                                                 the price plus the pool's fee by the due date
  repay <loan> --keypair PATH [--send]           pay a loan back in full (anyone may repay for the buyer)
  repay --all --keypair PATH [--send]            pay every loan you still owe, in one transaction
  mark-default <loan> --keypair PATH [--send]    anyone, once a loan is past its due date and grace period`;

const TIERS = ['New', 'Building', 'Established', 'Trusted'] as const;
const CLOCK = address('SysvarC1ock11111111111111111111111111111111');
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const usdc = (u: bigint) => `${fromUnits(u)} USDC`;
const STATE = ['open', 'repaid on time', 'repaid late', 'in default'] as const;

type Opts = { rpcUrl: string; kp?: KeyPairSigner; send: boolean; json: boolean; all: boolean; order?: string; die: (m: string) => never };

/** Repay instructions per transaction: each adds one loan account, so a tab of this size fits a v0 transaction comfortably. */
const REPAYS_PER_TX = 8;

export async function payLater(cmd: string, a1: string | undefined, a2: string | undefined, o: Opts): Promise<void> {
  const rpc = createSolanaRpc(o.rpcUrl);
  const addr = (v: string | undefined, what: string): Address => {
    if (!v) o.die(`${what} is required (see: tessera help)`);
    try {
      return address(v);
    } catch {
      return o.die(`${what} is not a Solana address: ${v}`);
    }
  };

  const chainNow = async () => {
    const c = await fetchEncodedAccount(rpc, CLOCK);
    if (!c.exists) o.die('the RPC has no clock');
    return new DataView(c.data.buffer, c.data.byteOffset).getBigInt64(32, true);
  };
  const pool = await paylater.fetchMaybePool(rpc, await paylater.poolPda());
  if (!pool.exists) o.die(`no pay-later pool on ${o.rpcUrl}`);
  const cfg = await fetchMaybeConfig(rpc, await configPda());
  if (!cfg.exists) o.die(`no Tessera config on ${o.rpcUrl}`);
  const p = pool.data.params;
  const scoreParams = cfg.data.params;

  /** Live tier, score and pay-later numbers for a wallet, as the program computes them. */
  async function standing(wallet: Address, now: bigint) {
    const agent = await fetchMaybeAgent(rpc, await agentPdaOf(wallet));
    const e = agent.exists ? score.evaluate(agent.data, scoreParams, now) : undefined;
    const line = await paylater.fetchMaybeCreditLine(rpc, await paylater.linePdaOf(wallet));
    const l = line.exists ? line.data : paylater.NO_LINE;
    const tier = e?.tier ?? 0;
    const sc = e?.score ?? 0;
    return {
      known: agent.exists,
      tier,
      score: sc,
      line: line.exists ? line.data : undefined,
      limit: paylater.limit(l, p, tier, sc),
      available: paylater.available(l, p, tier, sc),
    };
  }

  /** One line per loan still owed, with how its due date stands. */
  function describeOwed(a: Address, d: paylater.Loan, now: bigint): string {
    const when = d.state === paylater.LoanState.Defaulted ? 'in default, a late repayment clears the debt' : d.dueAt >= now ? `due in ${d.dueAt - now} s` : `${now - d.dueAt} s late`;
    return `  ${short(a)}  ${usdc(paylater.owedOf(d))}  order ${short(d.order)}  ${when}`;
  }
  const owedTotal = (tab: { data: paylater.Loan }[]) => tab.reduce((sum, l) => sum + paylater.owedOf(l.data), 0n);

  async function sendOrPrint(kp: KeyPairSigner, ixs: Instruction[]): Promise<void> {
    const { value: latest } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
    const signed = await signTransactionMessageWithSigners(
      pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(kp, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(latest, m),
        (m) => appendTransactionMessageInstructions(ixs, m),
      ),
    );
    const wire = getBase64EncodedWireTransaction(signed);
    if (!o.send) return void console.log(`signed transaction (send with --send or any RPC):\n${wire}`);
    const sig = getSignatureFromTransaction(signed);
    try {
      await rpc.sendTransaction(wire, { encoding: 'base64', preflightCommitment: 'confirmed' }).send();
    } catch (e) {
      const logs = (e as { context?: { logs?: string[] } }).context?.logs ?? [];
      const why = logs.map((l) => /Error Message: (.*?)\.?$/.exec(l)?.[1]).find(Boolean);
      o.die(`refused by the program: ${why ?? (e as Error).message}`);
    }
    for (let i = 0; i < 120; i += 1) {
      const { value } = await rpc.getSignatureStatuses([sig]).send();
      if (value[0]?.err) o.die(`transaction ${sig} failed`);
      if (value[0]?.confirmationStatus === 'confirmed' || value[0]?.confirmationStatus === 'finalized') {
        return void console.log(`confirmed: ${sig}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    o.die(`transaction ${sig} was not confirmed within 60 s`);
  }

  if (cmd === 'credit') {
    const wallet = addr(a1, '<wallet>');
    const now = await chainNow();
    const [s, loans] = await Promise.all([standing(wallet, now), paylater.fetchLoansOf(rpc, wallet)]);
    const tab = paylater.owed(loans);
    if (o.json) return void console.log(JSON.stringify({ ...s, owed: tab }, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
    console.log(`credit   ${short(wallet)}  ${TIERS[s.tier]} ${s.score}${s.known ? '' : '  (no credit file)'}`);
    console.log(`limit ${usdc(s.limit)} · owes ${usdc(owedTotal(tab))} (${usdc(s.line?.outstanding ?? 0n)} of it counts against the limit) · available ${usdc(s.available)}`);
    const l = s.line;
    console.log(l ? `record: ${l.loans} loan${l.loans === 1 ? '' : 's'}, ${l.repaidOnTime} on time, ${l.repaidLate} late, ${l.defaults} default${l.defaults === 1 ? '' : 's'}` : 'record: never borrowed');
    if (tab.length) {
      console.log(`tab: ${tab.length} loan${tab.length === 1 ? '' : 's'} still owed; pay them all at once with: tessera repay --all --keypair PATH --send`);
      for (const { address: a, data: d } of tab) console.log(describeOwed(a, d, now));
    }
    if (l?.defaults) console.log('frozen: a loan went unpaid past its grace period');
    else if (s.tier === 0) console.log('no credit yet: settle orders through Tessera escrow to earn a tier');
    console.log(`terms: the pool pays your escrow order; you repay the price plus ${p.feeBps / 100}% within ${p.termSecs} s, no interest`);
    return;
  }

  const kp = o.kp ?? o.die(`${cmd} needs --keypair`);

  if (cmd === 'repay' && o.all) {
    // The tab: buy as many things as the limit allows, then settle every loan in one transaction.
    const now = await chainNow();
    const tab = paylater.owed(await paylater.fetchLoansOf(rpc, kp.address));
    if (tab.length === 0) o.die(`${short(kp.address)} owes nothing`);
    const total = owedTotal(tab);
    console.log(`tab for ${short(kp.address)}: ${tab.length} loan${tab.length === 1 ? '' : 's'}, ${usdc(total)} owed`);
    for (const { address: a, data: d } of tab) console.log(describeOwed(a, d, now));
    const [line, payerToken] = await Promise.all([paylater.linePdaOf(kp.address), findAta(kp.address, pool.data.mint)]);
    const ixs = await Promise.all(tab.map(({ address: loan }) => paylater.getRepayInstructionAsync({ mint: pool.data.mint, loan, line, payer: kp, payerToken })));
    const batches = Math.ceil(ixs.length / REPAYS_PER_TX);
    console.log(`REPAY ALL  ${usdc(total)} in ${batches === 1 ? 'one transaction' : `${batches} transactions`}`);
    for (let i = 0; i < ixs.length; i += REPAYS_PER_TX) await sendOrPrint(kp, ixs.slice(i, i + REPAYS_PER_TX));
    return;
  }

  if (cmd === 'buy-later') {
    // The order is the merchant's quote: the payTo of its 402, opened in your name.
    const orderAddr = addr(o.order ?? a1, '--order');
    const found = await fetchMaybeOrder(rpc, orderAddr);
    if (!found.exists) o.die(`no escrow order at ${orderAddr}`);
    const d = found.data;
    const vault = await fetchMaybeToken(rpc, await findAta(orderAddr, d.mint));
    const now = await chainNow();
    const why = paylater.orderRefusal(d, vault.exists ? vault.data.amount : 0n, kp.address, now, scoreParams);
    if (why) o.die(`order ${short(orderAddr)}: ${why}`);
    const amount = d.amount;
    const [b, m] = await Promise.all([standing(kp.address, now), standing(d.merchant, now)]);
    console.log(`order    ${short(orderAddr)}  ${usdc(amount)}  awaiting payment`);
    console.log(`buyer    ${short(kp.address)}  ${TIERS[b.tier]} ${b.score}  available ${usdc(b.available)}`);
    console.log(`merchant ${short(d.merchant)}  ${TIERS[m.tier]} ${m.score}`);
    if (amount < p.minLoan) o.die(`${usdc(amount)} is below the smallest purchase the pool finances (${usdc(p.minLoan)})`);
    if (amount > b.available) o.die(`${usdc(amount)} is above your available credit (${usdc(b.available)})`);
    if (m.tier < p.minMerchantTier) o.die(`the pool only funds orders from merchants at ${TIERS[p.minMerchantTier]} or above`);
    const fee = paylater.feeOf(amount, p);
    const { loan, instructions } = await paylater.buyOrderOnCredit(rpc, kp, orderAddr);
    console.log(`BUY NOW  ${usdc(amount)}: the pool pays the escrow vault and the order is confirmed funded; the escrow pays the merchant on delivery`);
    console.log(`you repay ${usdc(amount + fee)} (${usdc(amount)} + ${usdc(fee)} pool fee) within ${p.termSecs} s, no interest`);
    console.log(`loan ${loan}`);
    return sendOrPrint(kp, instructions);
  }

  const loanAddr = addr(a1, '<loan>');
  const loan = await paylater.fetchMaybeLoan(rpc, loanAddr);
  if (!loan.exists) o.die(`no loan at ${loanAddr}`);
  const d = loan.data;
  if (d.state !== paylater.LoanState.Open && d.state !== paylater.LoanState.Defaulted) o.die(`this loan is already ${STATE[d.state]}`);
  const now = await chainNow();
  const left = d.dueAt - now;
  const owes = paylater.owedOf(d);
  if (cmd === 'mark-default') {
    if (d.state !== paylater.LoanState.Open) o.die(`this loan is already ${STATE[d.state]}`);
    const wait = d.defaultAfter - now;
    console.log(`loan ${short(loanAddr)}  buyer ${short(d.buyer)}  owes ${usdc(owes)}  ${wait < 0n ? `${-left} s past due, grace over` : `grace ends in ${wait + 1n} s`}`);
    return sendOrPrint(kp, [await paylater.getMarkDefaultInstructionAsync({ loan: loanAddr, line: await paylater.linePdaOf(d.buyer) })]);
  }
  console.log(`loan ${short(loanAddr)}  ${STATE[d.state]}  owes ${usdc(owes)} (${usdc(d.amount)} + ${usdc(d.fee)} fee)  ${left >= 0n ? `due in ${left} s: on time` : `${-left} s late`}`);
  const ix = await paylater.getRepayInstructionAsync({
    mint: pool.data.mint,
    loan: loanAddr,
    line: await paylater.linePdaOf(d.buyer),
    payer: kp,
    payerToken: await findAta(kp.address, pool.data.mint),
  });
  return sendOrPrint(kp, [ix]);
}
