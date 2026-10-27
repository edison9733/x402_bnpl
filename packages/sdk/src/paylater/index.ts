/**
 * Client for the pay-later program: generated instructions and decoders, plus
 * one stable name per address and the credit-limit formula.
 */
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  createNoopSigner,
  createTransactionMessage,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getPublicKeyFromAddress,
  getTransactionDecoder,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  verifySignature,
  type Address,
  type GetAccountInfoApi,
  type GetLatestBlockhashApi,
  type GetMinimumBalanceForRentExemptionApi,
  type GetProgramAccountsApi,
  type Instruction,
  type Rpc,
  type Transaction,
  type TransactionSigner,
} from '@solana/kit';
import type { ProgramAccountsRpc } from '../chain.js';
import { fetchOrder, OrderState, type Order, type Params } from '../generated/index.js';
import { findAta } from '../pda.js';
import { newOrderId } from '../util.js';
import { getCreditLineSize, getLoanDecoder, getLoanSize, LOAN_DISCRIMINATOR, LoanState, type Loan } from './generated/index.js';
import { getBuyNowInstructionAsync, parseBuyNowInstruction } from './generated/instructions/buyNow.js';
import { findLinePda } from './generated/pdas/line.js';
import { findLoanPda } from './generated/pdas/loan.js';
import { findPoolPda } from './generated/pdas/pool.js';
import { identifyTesseraPaylaterInstruction, TESSERA_PAYLATER_PROGRAM_ADDRESS, TesseraPaylaterInstruction } from './generated/programs/tesseraPaylater.js';

export * from './generated/index.js';
export * from './limit.js';

/** The x402 scheme name under which a merchant offers to be paid by the pool. */
export const X402_SCHEME = 'tessera-paylater';

/**
 * What a merchant says about paying later, in the `extra` of the
 * `tessera-paylater` entry of its 402 and under `extensions.tessera.payLater`.
 * Amounts are token units as decimal strings, like the rest of x402.
 */
export type PayLaterOffer = {
  /** The pay-later program. */
  program: string;
  /** Its pool account. */
  pool: string;
  /** The wallet that signs the buyer's `buy_now` as fee payer and sends it: the merchant's ops wallet (in the demo server, the one ops key every merchant it runs shares). */
  feePayer: string;
  /** The buyer's credit limit right now, from its live score and its line. */
  buyerLimit: string;
  /** Principal the buyer still owes the pool. */
  buyerOutstanding: string;
  /** The pool's fee on this price, owed on top of it. */
  fee: string;
  /** Seconds from the purchase to the due date. */
  termSecs: number;
  /** False when the program would refuse: the price is over the remaining limit, the pool cannot cover it, or the parties do not qualify. */
  eligible: boolean;
  /** Why it is not eligible, when it is not. */
  reason?: string;
};

/** Where `buyer` sits in a Loan account: after the discriminator and the 32-byte loan id. */
const LOAN_BUYER_OFFSET = 8n + 32n;
/** Where `state` sits: after the loan id, buyer, merchant, order, amount, fee and request hash. */
const LOAN_STATE_OFFSET = 8n + 32n * 4n + 8n + 8n + 32n;

const COMPUTE_BUDGET_PROGRAM = address('ComputeBudget111111111111111111111111111111');

/** `SetComputeUnitLimit`: instruction 2, then the limit as a little-endian u32. */
export function computeUnitLimitInstruction(units: number): Instruction {
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, data };
}

/**
 * Enough for `buy_now`, which reads two credit files, transfers through the
 * pool and has the escrow confirm the order. A merchant refuses a unit limit
 * above this, so it also bounds the priority fee it can be made to pay.
 */
export const BUY_NOW_COMPUTE_UNITS = 400_000;

/**
 * The SOL a buyer needs for `buy_now` to create its loan account and, on its
 * first purchase, its credit line: the buyer is the rent payer for both, so
 * nobody can borrow in its name. The loan's rent comes back with `close_loan`
 * once it is repaid; the line stays. The merchant pays only the network fee.
 */
export async function buyNowRent(rpc: Rpc<GetMinimumBalanceForRentExemptionApi>, hasLine: boolean): Promise<bigint> {
  const loan = await rpc.getMinimumBalanceForRentExemption(BigInt(getLoanSize())).send();
  if (hasLine) return loan;
  return loan + (await rpc.getMinimumBalanceForRentExemption(BigInt(getCreditLineSize())).send());
}

/** What clears a loan: the price the pool paid into escrow plus the pool's fee. */
export const owedOf = (loan: Pick<Loan, 'amount' | 'fee'>): bigint => loan.amount + loan.fee;

/**
 * Why `buy_now` would refuse to fund this order for this buyer, in the order
 * the program checks, or undefined if it would not. `vaultBalance` is what
 * the order's vault already holds. The credit limit and the merchant's tier
 * are checked separately (`available`, `LineParams.minMerchantTier`).
 */
export function orderRefusal(
  order: Pick<Order, 'buyer' | 'state' | 'amount' | 'createdAt'>,
  vaultBalance: bigint,
  buyer: Address,
  now: bigint,
  escrow: Pick<Params, 'unpaidSecs'>,
): string | undefined {
  if (order.buyer !== buyer) return 'the order was not opened for this buyer';
  if (order.state !== OrderState.AwaitingPayment) return 'the order is not awaiting payment';
  if (vaultBalance >= order.amount) return 'the order is already paid';
  if (now > order.createdAt + BigInt(escrow.unpaidSecs)) return "the order's payment window has closed; ask the merchant for a new quote";
  return undefined;
}

/**
 * The instructions that buy an escrow order on credit: one `buy_now`, which
 * has the pool pay the price into the order's vault and the escrow confirm
 * the order in the same instruction (the program calls the escrow's
 * `confirm_funded` itself), so the order is Funded when it lands. The order
 * is one the merchant already opened for `buyer`; its merchant and mint are
 * read from it.
 */
export async function buyOrderOnCredit(
  rpc: Rpc<GetAccountInfoApi>,
  buyer: TransactionSigner,
  order: Address,
  loanId: Uint8Array = newOrderId(),
) {
  const { data } = await fetchOrder(rpc, order);
  const [buyNow, loan] = await Promise.all([
    getBuyNowInstructionAsync({ mint: data.mint, buyer, merchant: data.merchant, order, loanId }),
    loanPdaOf(buyer.address, loanId),
  ]);
  return { order: data, loanId, loan, instructions: [buyNow] };
}

/**
 * The transaction a buyer hands a merchant to settle an x402 quote on credit:
 * one `buy_now` for the order, with the merchant's wallet as fee payer and
 * the buyer's signature already on it, as base64. The merchant checks it
 * against its quote, signs as fee payer and sends it; when it lands the pool
 * has paid the order and the escrow has confirmed it. The order is one the
 * merchant opened for `buyer`.
 */
export async function buyNowForMerchant(
  rpc: Rpc<GetAccountInfoApi & GetLatestBlockhashApi>,
  buyer: TransactionSigner,
  order: Address,
  feePayer: Address,
  loanId: Uint8Array = newOrderId(),
): Promise<{ transaction: string; loan: Address; loanId: Uint8Array; order: Order }> {
  const { data } = await fetchOrder(rpc, order);
  const [buyNow, loan, { value: latest }] = await Promise.all([
    getBuyNowInstructionAsync({ mint: data.mint, buyer, merchant: data.merchant, order, loanId }),
    loanPdaOf(buyer.address, loanId),
    rpc.getLatestBlockhash({ commitment: 'confirmed' }).send(),
  ]);
  const signed = await partiallySignTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(createNoopSigner(feePayer), m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latest, m),
      (m) => appendTransactionMessageInstructions([computeUnitLimitInstruction(BUY_NOW_COMPUTE_UNITS), buyNow], m),
    ),
  );
  return { transaction: getBase64EncodedWireTransaction(signed), loan, loanId, order: data };
}

/** The order a merchant quoted, as its `buy_now` must name it, and the wallet that signs as fee payer. */
export type ExpectedBuyNow = {
  order: Address;
  /** The order's vault, ATA(mint, order). */
  vault: Address;
  buyer: Address;
  merchant: Address;
  mint: Address;
  feePayer: Address;
};

/** The transaction a buyer handed over is not the one `buy_now` the merchant will sign for. */
export class BuyNowTransactionError extends Error {
  constructor(detail: string) {
    super(`refusing to sign the credit purchase: ${detail}`);
    this.name = 'BuyNowTransactionError';
  }
}

/**
 * The highest priority fee a merchant signs for, in micro-lamports per compute
 * unit. With the unit limit capped at `BUY_NOW_COMPUTE_UNITS` the most a
 * transaction can cost it in priority fee is 400,000 x 1,000,000 micro-lamports
 * = 0.0004 SOL, on top of the base fee. Without a unit-limit instruction the
 * runtime's default of 200,000 units per instruction applies, which is lower.
 */
export const MAX_CU_PRICE = 1_000_000n;

/** `buy_now`'s data: the 8-byte discriminator and the 32-byte loan id. */
const BUY_NOW_DATA_SIZE = 8 + 32;
/** The accounts `buy_now` takes, in the program's order (`BuyNow` in lib.rs). */
const BUY_NOW_ACCOUNTS = 15;

/**
 * What a merchant checks before it signs, as fee payer, the transaction a
 * buyer hands it under the `tessera-paylater` scheme: a legacy or version-0
 * transaction with no lookup tables, whose only signers are the fee payer and
 * the buyer, which the buyer has already signed, and whose instructions are
 * compute-budget settings (at most one unit limit, of at most
 * `BUY_NOW_COMPUTE_UNITS`, and at most one unit price, of at most
 * `MAX_CU_PRICE`) followed by exactly one `buy_now` of this program for the
 * expected order, every one of its accounts the one this order derives (its buyer,
 * merchant, mint and vault, the loan its loan id derives, the pool, the
 * buyer's line, the escrow program and its config, both credit files).
 * Everything else about the purchase (the limit, the window, the tiers) is
 * the program's to decide when the transaction runs. Returns the decoded
 * transaction and the loan it would open, or throws a `BuyNowTransactionError`.
 */
export async function checkBuyNowTransaction(
  transaction: string,
  e: ExpectedBuyNow,
  opts: { maxCuPrice?: bigint; maxCuLimit?: number } = {},
): Promise<{ tx: Transaction; loan: Address; loanId: Uint8Array }> {
  // Annotated in full, so a call narrows what follows it the way a throw does.
  const refuse: (why: string) => never = (why) => {
    throw new BuyNowTransactionError(why);
  };
  let tx: Transaction;
  let msg: ReturnType<ReturnType<typeof getCompiledTransactionMessageDecoder>['decode']>;
  try {
    tx = getTransactionDecoder().decode(getBase64Encoder().encode(transaction));
    msg = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  } catch {
    return refuse('the transaction cannot be decoded');
  }
  if (msg.version !== 0 && msg.version !== 'legacy') refuse('only legacy and version-0 transactions are accepted');
  if ('addressTableLookups' in msg && (msg.addressTableLookups?.length ?? 0) > 0) refuse('the transaction uses address lookup tables');
  const keys = msg.staticAccounts;
  if (keys[0] !== e.feePayer) refuse(`the fee payer is ${keys[0]}, not the merchant's wallet`);
  const signers = keys.slice(0, msg.header.numSignerAccounts);
  if (signers.length !== 2 || !signers.includes(e.buyer)) refuse('the signers must be the merchant\'s wallet and the buyer, nobody else');
  const signature = tx.signatures[e.buyer];
  if (!signature || !(await verifySignature(await getPublicKeyFromAddress(e.buyer), signature, tx.messageBytes))) refuse('the buyer has not signed it');

  const maxCuPrice = opts.maxCuPrice ?? MAX_CU_PRICE;
  const maxCuLimit = opts.maxCuLimit ?? BUY_NOW_COMPUTE_UNITS;
  let unitLimit = false;
  let unitPrice = false;
  let found: { loan: Address; loanId: Uint8Array } | undefined;
  for (const c of msg.instructions) {
    const program = keys[c.programAddressIndex];
    const data = c.data ?? new Uint8Array();
    if (program === COMPUTE_BUDGET_PROGRAM) {
      // SetComputeUnitLimit: [2, u32]. SetComputeUnitPrice: [3, u64 micro-lamports].
      // Both are read: the fee the merchant pays is their product. Each at
      // most once, before the buy_now, and naming no accounts.
      if (found) refuse('a compute-budget instruction after the buy_now');
      if ((c.accountIndices?.length ?? 0) > 0) refuse('a compute-budget instruction that names accounts');
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      if (data.length === 5 && data[0] === 2) {
        if (unitLimit) refuse('more than one compute unit limit');
        unitLimit = true;
        const units = view.getUint32(1, true);
        if (units > maxCuLimit) refuse(`a compute unit limit of ${units} (at most ${maxCuLimit})`);
        continue;
      }
      if (data.length === 9 && data[0] === 3) {
        if (unitPrice) refuse('more than one compute unit price');
        unitPrice = true;
        const price = view.getBigUint64(1, true);
        if (price > maxCuPrice) refuse(`a priority fee of ${price} micro-lamports per unit (at most ${maxCuPrice})`);
        continue;
      }
      return refuse('a compute-budget instruction other than a unit limit or price');
    }
    if (program !== TESSERA_PAYLATER_PROGRAM_ADDRESS) return refuse(`an instruction for ${program ?? 'an unknown program'}`);
    if (found) refuse('more than one pay-later instruction');
    let kind: TesseraPaylaterInstruction;
    try {
      kind = identifyTesseraPaylaterInstruction({ data });
    } catch {
      return refuse('a pay-later instruction it cannot identify');
    }
    if (kind !== TesseraPaylaterInstruction.BuyNow) refuse(`a pay-later ${TesseraPaylaterInstruction[kind]}, not buy_now`);
    if (data.length !== BUY_NOW_DATA_SIZE) refuse('buy_now with data of the wrong length');
    const indices = c.accountIndices ?? [];
    if (indices.length !== BUY_NOW_ACCOUNTS) refuse('buy_now with the wrong number of accounts');
    const accounts = indices.map((i) => ({ address: keys[i] ?? refuse('an instruction names an account the transaction does not carry'), role: AccountRole.READONLY }));
    const { accounts: a, data: d } = parseBuyNowInstruction({ programAddress: TESSERA_PAYLATER_PROGRAM_ADDRESS, accounts, data });
    if (a.order.address !== e.order) refuse(`buy_now funds order ${a.order.address}, not ${e.order}`);
    if (a.orderVault.address !== e.vault) refuse('buy_now does not pay this order\'s vault');
    if (a.buyer.address !== e.buyer) refuse('buy_now is not for this order\'s buyer');
    if (a.merchant.address !== e.merchant) refuse('buy_now does not name this order\'s merchant');
    if (a.mint.address !== e.mint) refuse('buy_now is in the wrong mint');
    const loanId = Uint8Array.from(d.loanId);
    const loan = await loanPdaOf(e.buyer, loanId);
    if (a.loan.address !== loan) refuse('the loan account is not the one the loan id derives');
    // And every other account is the one this order derives: the pool, its
    // vault, the buyer's line, the escrow program and config, both credit
    // files, the token and system programs, in the program's order.
    const want = await getBuyNowInstructionAsync({ mint: e.mint, buyer: createNoopSigner(e.buyer), merchant: e.merchant, order: e.order, orderVault: e.vault, loanId });
    want.accounts.forEach((w, i) => {
      if (accounts[i]!.address !== w.address) refuse(`buy_now account ${i + 1} is ${accounts[i]!.address}, not ${w.address}`);
    });
    found = { loan, loanId };
  }
  if (!found) return refuse('there is no buy_now in it');
  return { tx, ...found };
}

type Memcmp = { memcmp: { offset: bigint; bytes: string; encoding: 'base58' } };

async function fetchLoans(rpc: Rpc<GetProgramAccountsApi>, filters: Memcmp[]): Promise<{ address: Address; data: Loan }[]> {
  // Kit brands the filter bytes; the structural slice in chain.ts takes plain strings.
  const rows = (await (rpc as unknown as ProgramAccountsRpc)
    .getProgramAccounts(TESSERA_PAYLATER_PROGRAM_ADDRESS, {
      encoding: 'base64',
      filters: [{ memcmp: { offset: 0n, bytes: getBase58Decoder().decode(LOAN_DISCRIMINATOR), encoding: 'base58' } }, ...filters],
    })
    .send()) as { pubkey: Address; account: { data: [string, string] } }[];
  const decoder = getLoanDecoder();
  const out: { address: Address; data: Loan }[] = [];
  for (const row of rows) {
    try {
      out.push({ address: row.pubkey, data: decoder.decode(getBase64Encoder().encode(row.account.data[0])) });
    } catch {
      // An account this client cannot decode is skipped rather than trusted.
    }
  }
  return out.sort((a, b) => Number(b.data.createdAt - a.data.createdAt));
}

/** Every loan a wallet has taken, settled or not, newest first. */
export function fetchLoansOf(rpc: Rpc<GetProgramAccountsApi>, buyer: Address): Promise<{ address: Address; data: Loan }[]> {
  return fetchLoans(rpc, [{ memcmp: { offset: LOAN_BUYER_OFFSET, bytes: buyer, encoding: 'base58' } }]);
}

/** Every loan still open, whoever owes it: what a keeper looks through for overdue ones. */
export function fetchOpenLoans(rpc: Rpc<GetProgramAccountsApi>): Promise<{ address: Address; data: Loan }[]> {
  return fetchLoans(rpc, [{ memcmp: { offset: LOAN_STATE_OFFSET, bytes: getBase58Decoder().decode(Uint8Array.of(LoanState.Open)), encoding: 'base58' } }]);
}

/** The loans a wallet still owes: open ones, and defaulted ones whose debt was never cleared. */
export const owed = (loans: { address: Address; data: Loan }[]) =>
  loans.filter((l) => l.data.state === LoanState.Open || l.data.state === LoanState.Defaulted);

export async function poolPda(): Promise<Address> {
  return (await findPoolPda())[0];
}

export async function poolVault(mint: Address): Promise<Address> {
  return findAta(await poolPda(), mint);
}

export async function linePdaOf(buyer: Address): Promise<Address> {
  return (await findLinePda({ buyer }))[0];
}

export async function loanPdaOf(buyer: Address, loanId: Uint8Array): Promise<Address> {
  return (await findLoanPda({ buyer, loanId }))[0];
}
