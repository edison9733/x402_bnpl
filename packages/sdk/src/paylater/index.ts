/**
 * Client for the pay-later program: generated instructions and decoders, plus
 * one stable name per address and the credit-limit formula.
 */
import {
  getBase58Decoder,
  getBase64Encoder,
  type Address,
  type GetAccountInfoApi,
  type GetProgramAccountsApi,
  type Rpc,
  type TransactionSigner,
} from '@solana/kit';
import type { ProgramAccountsRpc } from '../chain.js';
import { fetchOrder, OrderState, type Order, type Params } from '../generated/index.js';
import { getConfirmFundedInstructionAsync } from '../generated/instructions/confirmFunded.js';
import { findAta } from '../pda.js';
import { newOrderId } from '../util.js';
import { getLoanDecoder, LOAN_DISCRIMINATOR, LoanState, type Loan } from './generated/index.js';
import { getBuyNowInstructionAsync } from './generated/instructions/buyNow.js';
import { findLinePda } from './generated/pdas/line.js';
import { findLoanPda } from './generated/pdas/loan.js';
import { findPoolPda } from './generated/pdas/pool.js';
import { TESSERA_PAYLATER_PROGRAM_ADDRESS } from './generated/programs/tesseraPaylater.js';

export * from './generated/index.js';
export * from './limit.js';

/** Where `buyer` sits in a Loan account: after the discriminator and the 32-byte loan id. */
const LOAN_BUYER_OFFSET = 8n + 32n;

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
 * The instructions that buy an escrow order on credit: `buy_now`, which has
 * the pool pay the price into the order's vault, then the escrow's
 * `confirm_funded`, so the order is Funded in the same transaction. The order
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
  const [buyNow, confirm, loan] = await Promise.all([
    getBuyNowInstructionAsync({ mint: data.mint, buyer, merchant: data.merchant, order, loanId }),
    getConfirmFundedInstructionAsync({ order, mint: data.mint }),
    loanPdaOf(buyer.address, loanId),
  ]);
  return { order: data, loanId, loan, instructions: [buyNow, confirm] };
}

/** Every loan a wallet has taken, settled or not, newest first. */
export async function fetchLoansOf(rpc: Rpc<GetProgramAccountsApi>, buyer: Address): Promise<{ address: Address; data: Loan }[]> {
  // Kit brands the filter bytes; the structural slice in chain.ts takes plain strings.
  const rows = (await (rpc as unknown as ProgramAccountsRpc)
    .getProgramAccounts(TESSERA_PAYLATER_PROGRAM_ADDRESS, {
      encoding: 'base64',
      filters: [
        { memcmp: { offset: 0n, bytes: getBase58Decoder().decode(LOAN_DISCRIMINATOR), encoding: 'base58' } },
        { memcmp: { offset: LOAN_BUYER_OFFSET, bytes: buyer, encoding: 'base58' } },
      ],
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
