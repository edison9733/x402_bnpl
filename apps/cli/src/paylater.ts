/**
 * Pay-later commands. Unlike the escrow commands these do not go through the
 * API: they read the chain themselves and build the one pay-later instruction
 * locally, so there is no reply to check before signing. `buy-later` with a
 * merchant agent's URL runs the whole x402 purchase: it asks for the quote,
 * checks the escrow it names on-chain, hands the merchant a signed buy_now
 * (the merchant adds its own signature, which buy_now requires, and sends
 * it), and prints what came back and the loan. `buy-later --order` sends the
 * buy_now itself, so it needs the order's merchant's key as well as the
 * buyer's: it is for a local world that holds both (`npm run paylater:local`).
 *
 *   tessera credit <wallet>
 *   tessera buy-later <merchant agent url> <skill> [--input JSON] --keypair PATH
 *   tessera buy-later --order <order> --keypair PATH --merchant-keypair PATH [--send]
 *   tessera repay <loan> --keypair PATH [--send]
 *   tessera repay --all --keypair PATH [--send]      every loan still owed, in one transaction
 *
 * A repayment closes the loan it clears in the same transaction
 * (`close_loan`, right after `repay`), so the buyer gets the loan account's
 * rent back; its credit line keeps the record.
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
  fromHex,
  fromUnits,
  hashJson,
  OrderVerificationError,
  paylater,
  score,
  verifyOrderForPayment,
} from '@tessera/sdk';

export const PAYLATER_COMMANDS = new Set(['credit', 'buy-later', 'repay', 'mark-default']);

export const PAYLATER_HELP = `Pay later (reads the chain itself; no API)
  credit <wallet>                                a wallet's pay-later limit, what it owes and when each loan is due
  buy-later <merchant agent url> <skill> [--input JSON] --keypair PATH
                                                 buy over x402 on credit: the merchant quotes an escrow order, you
                                                 sign one buy_now for it, the merchant signs it too and sends it,
                                                 and the pool pays
  buy-later --order <order> --keypair PATH --merchant-keypair PATH [--send]
                                                 the same for an escrow order you already hold a quote for, sent by
                                                 you: buy_now needs the order's merchant's signature too, so this
                                                 is for a local world where you hold its key (paylater:local)
  repay <loan> --keypair PATH [--send]           pay a loan back in full (anyone may repay for the buyer); the loan
                                                 is closed in the same transaction and its rent goes back to the buyer
  repay --all --keypair PATH [--send]            pay every loan you still owe, in one transaction, closing each one
  mark-default <loan> --keypair PATH [--send]    anyone, once a loan is past its due date and grace period`;

const TIERS = ['New', 'Building', 'Established', 'Trusted'] as const;
const CLOCK = address('SysvarC1ock11111111111111111111111111111111');
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const usdc = (u: bigint) => `${fromUnits(u)} USDC`;
const when = (secs: bigint) => new Date(Number(secs) * 1000).toISOString();
const STATE = ['open', 'repaid on time', 'repaid late', 'in default'] as const;
/** The a2a extension whose params carry a merchant's wallet and prices (apps/agents/src/config.ts). */
const TESSERA_EXTENSION_URI = 'https://github.com/edison9733/agentic_commerce/blob/main/docs/A2A-EXTENSION.md';

type Opts = {
  rpcUrl: string;
  kp?: KeyPairSigner;
  /** --merchant-keypair for `buy-later --order`: the order's merchant, whose signature buy_now requires. */
  merchantKp?: KeyPairSigner;
  send: boolean;
  json: boolean;
  all: boolean;
  order?: string;
  /** --input for the HTTP form of buy-later: the request the skill is asked with. */
  input?: unknown;
  /** The CLI's URL check: https, or http to this machine. */
  endpoint: (url: string, what: string) => string;
  die: (m: string) => never;
};

/**
 * Loans repaid per transaction. Each adds one loan account and two
 * instructions (`repay`, then `close_loan`, which returns the loan's rent to
 * the buyer), so a tab of this size fits a v0 transaction comfortably.
 */
const REPAYS_PER_TX = 8;

/** Repay a loan and close it: `close_loan` runs once `repay` has marked it repaid, so both go in one transaction. */
async function repayAndClose(mint: Address, loan: Address, buyer: Address, payer: KeyPairSigner): Promise<Instruction[]> {
  const [line, payerToken] = await Promise.all([paylater.linePdaOf(buyer), findAta(payer.address, mint)]);
  return [await paylater.getRepayInstructionAsync({ mint, loan, line, payer, payerToken }), paylater.getCloseLoanInstruction({ loan, buyer })];
}

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
    const standing = d.state === paylater.LoanState.Defaulted ? 'in default, a late repayment clears the debt' : d.dueAt >= now ? `due in ${d.dueAt - now} s` : `${now - d.dueAt} s late`;
    return `  ${short(a)}  ${usdc(paylater.owedOf(d))}  order ${short(d.order)}  ${standing} (${when(d.dueAt)})`;
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
    console.log(l ? `record: ${l.loans} loan${l.loans === 1 ? '' : 's'}, ${l.repaidOnTime} on time, ${l.repaidLate} late, ${l.defaults} default${l.defaults === 1 ? '' : 's'}; limit boost +${(Math.min(l.boostBps, p.maxBoostBps) / 100).toFixed(2)}%` : 'record: never borrowed');
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
    const each = await Promise.all(tab.map(({ address: loan }) => repayAndClose(pool.data.mint, loan, kp.address, kp)));
    const batches = Math.ceil(each.length / REPAYS_PER_TX);
    console.log(`REPAY ALL  ${usdc(total)} in ${batches === 1 ? 'one transaction' : `${batches} transactions`}; each loan is closed and its rent comes back to you`);
    for (let i = 0; i < each.length; i += REPAYS_PER_TX) await sendOrPrint(kp, each.slice(i, i + REPAYS_PER_TX).flat());
    return;
  }

  if (cmd === 'buy-later' && !o.order && a1 && /^https?:\/\//i.test(a1)) {
    return buyLaterOverHttp(a1, a2, kp);
  }

  if (cmd === 'buy-later') {
    // The order is the merchant's quote: the payTo of its 402, opened in your name.
    const orderAddr = addr(o.order ?? a1, '--order');
    // buy_now is signed by the buyer and by the order's merchant, so the pool
    // only funds orders their merchant agreed to. Without the merchant's key
    // here, the merchant must sign: that is the x402 form.
    const merchantKp =
      o.merchantKp ??
      o.die("buy_now needs the order's merchant's signature as well as yours: pass --merchant-keypair PATH where you hold that key too, or buy over x402 with: tessera buy-later <merchant agent url> <skill> --keypair PATH, and the merchant signs");
    const found = await fetchMaybeOrder(rpc, orderAddr);
    if (!found.exists) o.die(`no escrow order at ${orderAddr}`);
    const d = found.data;
    if (merchantKp.address !== d.merchant) o.die(`--merchant-keypair is ${short(merchantKp.address)}, but order ${short(orderAddr)} is ${short(d.merchant)}'s`);
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
    // The price and request just shown and checked ride in the buy_now.
    const { loan, instructions } = await paylater.buyOrderOnCredit(rpc, kp, orderAddr, merchantKp, { amount, requestHash: d.requestHash });
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
  console.log(`loan ${short(loanAddr)}  ${STATE[d.state]}  owes ${usdc(owes)} (${usdc(d.amount)} + ${usdc(d.fee)} fee)  ${left >= 0n ? `due in ${left} s: on time` : `${-left} s late`}; closed once repaid, its rent back to ${short(d.buyer)}`);
  return sendOrPrint(kp, await repayAndClose(pool.data.mint, loanAddr, d.buyer, kp));

  /**
   * The whole purchase over x402, on credit. The merchant's URL is the base
   * its agent card and `/x402/<skill>` hang off (the card's own URL is
   * accepted too). Nothing the merchant sends is trusted: the price is capped
   * by what its card advertises, the order is read from the chain and checked
   * against what was asked, and the only thing signed is one buy_now for it,
   * carrying that price and request hash, which the program requires the
   * order to match when it runs.
   * The merchant adds its signatures (fee payer, and the order's merchant,
   * which buy_now requires) and sends it.
   */
  async function buyLaterOverHttp(merchantUrl: string, skill: string | undefined, kp: KeyPairSigner): Promise<void> {
    if (!skill) o.die('buy-later <merchant agent url> needs a <skill> (see: tessera help)');
    const base = o.endpoint(merchantUrl, '<merchant agent url>').replace(/\/\.well-known\/agent-card\.json$/, '').replace(/\/$/, '');
    const input = o.input ?? {};
    if (typeof input !== 'object' || input === null || Array.isArray(input)) o.die('--input must be a JSON object');
    const get = async (url: string, headers: Record<string, string> = {}) => {
      let res: Response;
      try {
        res = await fetch(url, { headers, signal: AbortSignal.timeout(90_000) });
      } catch (e) {
        return o.die(`${new URL(url).host} is unreachable (${(e as Error).message})`);
      }
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { res, body };
    };

    // 0. The most this buyer pays: what the merchant's card advertises for the skill.
    const { body: card } = await get(`${base}/.well-known/agent-card.json`);
    const ext = ((card.capabilities as { extensions?: { uri: string; params?: Record<string, unknown> }[] } | undefined)?.extensions ?? []).find((e) => e.uri === TESSERA_EXTENSION_URI);
    const prices = (ext?.params?.prices ?? {}) as Record<string, string>;
    const advertised = BigInt(String(prices[skill] ?? '0'));
    if (!ext || advertised === 0n) o.die(`${base} does not advertise a price for ${skill} on its agent card`);
    const merchantWallet = addr(String(ext.params?.wallet ?? ''), 'the merchant wallet on the agent card');

    // 1. Ask. The 402 names the escrow order and, when the pool is here, the credit option.
    const askUrl = `${base}/x402/${encodeURIComponent(skill)}?buyer=${kp.address}&input=${encodeURIComponent(JSON.stringify(input))}`;
    const first = await get(askUrl);
    if (first.res.status !== 402) o.die(`expected 402 from ${base}, got ${first.res.status}: ${String(first.body.error ?? '')}`);
    const required = first.body as { accepts?: { scheme: string; asset: string; amount: string; payTo: string; extra: Record<string, unknown> }[]; extensions?: { tessera?: { orderId: string; holdSecs: number } } };
    const option = (required.accepts ?? []).find((a) => a.scheme === paylater.X402_SCHEME);
    if (!option) o.die(`${base} does not offer pay later for ${skill}`);
    const offer = option.extra as unknown as paylater.PayLaterOffer;
    const amount = BigInt(option.amount);
    const terms = required.extensions?.tessera;
    if (!terms) o.die('the 402 carries no escrow terms');
    console.log(`402      ${usdc(amount)} into escrow order ${short(option.payTo)}, hold ${terms.holdSecs} s`);
    console.log(`credit   limit ${usdc(BigInt(offer.buyerLimit))} · owing ${usdc(BigInt(offer.buyerOutstanding))} · fee ${usdc(BigInt(offer.fee))} · due ${offer.termSecs} s after the purchase`);
    if (!offer.eligible) o.die(`not eligible for pay later: ${offer.reason ?? 'the merchant did not say why'}`);
    if (amount > advertised) o.die(`refusing: the 402 asks ${usdc(amount)}, more than the ${usdc(advertised)} the card advertises`);
    if (offer.program !== paylater.TESSERA_PAYLATER_PROGRAM_ADDRESS) o.die(`the merchant names another pay-later program (${offer.program})`);
    const feePayer = addr(offer.feePayer, 'the fee payer in the 402');

    // 2. The order, from the chain: opened for this wallet by this merchant, for this request, at the address quoted.
    const expected = {
      orderId: fromHex(terms.orderId),
      buyer: kp.address,
      merchant: merchantWallet,
      amount,
      mint: addr(option.asset, 'the asset in the 402'),
      payTo: addr(option.payTo, 'payTo in the 402'),
      requestHash: await hashJson({ sku: skill, input }),
    };
    let verified: Awaited<ReturnType<typeof verifyOrderForPayment>> | undefined;
    for (let i = 0; !verified; i += 1) {
      try {
        verified = await verifyOrderForPayment(rpc, expected);
      } catch (e) {
        if (e instanceof OrderVerificationError && /does not exist/.test(e.message) && i < 8) await new Promise((r) => setTimeout(r, 600));
        else o.die(e instanceof OrderVerificationError ? e.message : `cannot read the chain at ${new URL(o.rpcUrl).host}: ${(e as Error).message}`);
      }
    }
    const now = await chainNow();
    const vault = await fetchMaybeToken(rpc, verified.vault);
    const why = paylater.orderRefusal(verified.data, vault.exists ? vault.data.amount : 0n, kp.address, now, scoreParams);
    if (why) o.die(`order ${short(verified.order)}: ${why}`);
    const mine = await standing(kp.address, now);
    if (amount > mine.available) o.die(`${usdc(amount)} is above your available credit (${usdc(mine.available)}) by this machine's reading of the chain`);
    console.log(`order    ${short(verified.order)} verified on-chain: opened for you by ${short(merchantWallet)}, ${usdc(amount)}, your request`);

    // 3. Sign one buy_now for it, with the merchant's wallet as fee payer, and hand it over:
    //    the merchant signs it as fee payer and as the order's merchant, and sends it.
    const built = await paylater.buyNowForMerchant(rpc, kp, verified.order, feePayer, { amount, requestHash: expected.requestHash });
    const payload = { x402Version: 2, accepted: option, payload: { transaction: built.transaction } };
    console.log(`BUY LATER  signed buy_now for ${short(verified.order)}; the merchant adds its signature, pays the network fee and sends it`);
    const second = await get(askUrl, { 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify(payload), 'utf8').toString('base64') });
    if (!second.res.ok) o.die(`the merchant refused (${second.res.status}): ${String(second.body.error ?? 'failed')}${second.body.note ? ` ${String(second.body.note)}` : ''}`);
    const receipt = second.res.headers.get('PAYMENT-RESPONSE');
    const settled = receipt ? (JSON.parse(Buffer.from(receipt, 'base64').toString('utf8')) as { transaction?: string }) : undefined;
    if (o.json) {
      const l = await paylater.fetchMaybeLoan(rpc, built.loan);
      return void console.log(JSON.stringify({ ...second.body, loan: built.loan, loanAccount: l.exists ? l.data : null, settleTx: settled?.transaction }, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
    }
    if (settled?.transaction) console.log(`settled  ${settled.transaction}`);
    console.log(`result   ${JSON.stringify(second.body.result).slice(0, 300)}`);
    console.log(`escrow   ${JSON.stringify(second.body.escrow)}`);
    const l = await paylater.fetchMaybeLoan(rpc, built.loan);
    if (l.exists) {
      console.log(`loan     ${built.loan}`);
      console.log(`         owe ${usdc(paylater.owedOf(l.data))} (${usdc(l.data.amount)} + ${usdc(l.data.fee)} pool fee) by ${when(l.data.dueAt)}; pay with: tessera repay --all --keypair PATH --send`);
    } else console.log(`loan     ${built.loan} (not readable yet)`);
  }
}
