/**
 * What a buyer checks before it signs a payment.
 *
 * A merchant agent opens the order and quotes its address as the x402
 * `payTo`. The buyer must not take that on trust: a dishonest or compromised
 * merchant server could quote an order that names someone else as the buyer
 * (and refund itself), a different amount, or no escrow at all. So the buyer
 * re-derives the address from the order id, reads the account from the chain,
 * and refuses unless every field is what it asked for.
 */
import { fetchEncodedAccount, type Address } from '@solana/kit';
import { MAX_HOLD_SECS } from './constants.js';
import { fetchMaybeOrder, type Order } from './generated/accounts/order.js';
import { OrderState } from './generated/types/orderState.js';
import { TESSERA_PROGRAM_ADDRESS } from './generated/programs/tessera.js';
import { orderAddresses, reviewPdaOf } from './pda.js';
import { bytesEqual, type ReadonlyUint8ArrayLike } from './util.js';

export type ExpectedOrder = {
  orderId: Uint8Array;
  buyer: Address;
  merchant: Address;
  amount: bigint;
  mint: Address;
  /** The address the 402 response quoted as `payTo`. */
  payTo: Address;
  requestHash?: Uint8Array;
  /** Refuse an order that would hold the money for less than this. */
  minHoldSecs?: number;
  /** Refuse an order that would hold the money for longer than this. */
  maxHoldSecs?: number;
};

export class OrderVerificationError extends Error {
  constructor(public readonly field: string, detail: string) {
    super(`refusing to pay: ${field} ${detail}`);
    this.name = 'OrderVerificationError';
  }
}

export type VerifiedOrder = { order: Address; vault: Address; data: Order };

type Rpc = Parameters<typeof fetchMaybeOrder>[0];

export async function verifyOrderForPayment(
  rpc: Rpc,
  expected: ExpectedOrder,
  programAddress: Address = TESSERA_PROGRAM_ADDRESS,
): Promise<VerifiedOrder> {
  const { order, vault } = await orderAddresses(expected.orderId, expected.mint, { programAddress });
  if (expected.payTo !== order) {
    throw new OrderVerificationError('payTo', `is ${expected.payTo}, but this order's escrow is ${order}`);
  }

  const account = await fetchMaybeOrder(rpc, order);
  if (!account.exists) throw new OrderVerificationError('order', 'does not exist on-chain');
  if (account.programAddress !== programAddress) {
    throw new OrderVerificationError('order', 'is not owned by the Tessera program');
  }
  const d = account.data;

  if (!bytesEqual(d.orderId, expected.orderId)) throw new OrderVerificationError('orderId', 'does not match');
  if (d.buyer !== expected.buyer) throw new OrderVerificationError('buyer', `is ${d.buyer}, not this wallet`);
  if (d.merchant !== expected.merchant) {
    throw new OrderVerificationError('merchant', `is ${d.merchant}, expected ${expected.merchant}`);
  }
  if (d.amount !== expected.amount) {
    throw new OrderVerificationError('amount', `is ${d.amount}, expected ${expected.amount}`);
  }
  if (d.mint !== expected.mint) throw new OrderVerificationError('mint', `is ${d.mint}`);
  if (d.state !== OrderState.AwaitingPayment) {
    throw new OrderVerificationError('state', `is ${OrderState[d.state]}, not AwaitingPayment`);
  }
  if (expected.requestHash && !bytesEqual(d.requestHash, expected.requestHash)) {
    throw new OrderVerificationError('requestHash', 'does not match what was asked for');
  }
  if (expected.minHoldSecs !== undefined && d.holdSecs < expected.minHoldSecs) {
    throw new OrderVerificationError('hold', `is ${d.holdSecs}s, this buyer requires ${expected.minHoldSecs}s`);
  }
  const maxHold = expected.maxHoldSecs ?? MAX_HOLD_SECS;
  if (d.holdSecs > maxHold) {
    throw new OrderVerificationError('hold', `is ${d.holdSecs}s, longer than the ${maxHold}s this buyer accepts`);
  }
  // Reviews are keyed by the order's address. An id the merchant already used
  // with this buyer, and closed, would leave this buyer unable to review the
  // new order -- and so unable to complain about an instant one.
  const review = await fetchEncodedAccount(rpc, await reviewPdaOf(order, expected.buyer, { programAddress }));
  if (review.exists) {
    throw new OrderVerificationError('orderId', 'was used before, and this wallet already reviewed that order');
  }
  return { order, vault, data: d };
}

/**
 * What a merchant recorded about an order when it opened it as a quote: the
 * terms a payment pays for, and what only its own `open_order` set (the hold,
 * the wallet that fronted the rent, the chain time it was opened at).
 */
export type QuotedOrder = {
  buyer: Address;
  merchant: Address;
  mint: Address;
  amount: bigint;
  requestHash: ReadonlyUint8ArrayLike;
  holdSecs?: number;
  payer?: Address;
  createdAt?: bigint;
};

/**
 * Why the order now at a quoted address is not the order the merchant quoted
 * there, or undefined when it is. The merchant's side of
 * `verifyOrderForPayment`: an order's address comes from its id alone, and
 * on the escrow build on devnet either party may close an unpaid order at
 * any time and anyone may open another at the same address, naming any
 * merchant without its signature. So before a merchant signs for a payment,
 * settles one or delivers, it compares the order with its own record.
 *
 * `terms` compares what a payment pays for (buyer, merchant, mint, price,
 * request hash): enough to deliver an order that is already funded. `opened`
 * also compares the hold, the rent payer and the time it was opened, which
 * tell the merchant's own order from one reopened at its address with the
 * same price: the check before anything is signed. A field the record does
 * not hold (a quote kept from an older run) is not compared.
 */
export function quotedOrderRefusal(
  o: Pick<Order, 'buyer' | 'merchant' | 'mint' | 'amount' | 'requestHash' | 'holdSecs' | 'payer' | 'createdAt'>,
  q: QuotedOrder,
  compare: 'terms' | 'opened' = 'opened',
): string | undefined {
  if (o.buyer !== q.buyer) return `its buyer is ${o.buyer}, not ${q.buyer}`;
  if (o.merchant !== q.merchant) return `its merchant is ${o.merchant}, not ${q.merchant}`;
  if (o.mint !== q.mint) return `its mint is ${o.mint}, not ${q.mint}`;
  if (o.amount !== q.amount) return `its price is ${o.amount} units, not the ${q.amount} quoted`;
  if (!bytesEqual(o.requestHash, q.requestHash)) return 'its request hash is not the one quoted';
  if (compare === 'terms') return undefined;
  if (q.holdSecs !== undefined && o.holdSecs !== q.holdSecs) return `its hold is ${o.holdSecs} s, not the ${q.holdSecs} s quoted`;
  if (q.payer !== undefined && o.payer !== q.payer) return `its rent was paid by ${o.payer}, not by the merchant's wallet`;
  if (q.createdAt !== undefined && o.createdAt !== q.createdAt) return `it was opened at ${o.createdAt}, not at ${q.createdAt} when it was quoted`;
  return undefined;
}
