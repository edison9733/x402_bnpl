/**
 * The merchant's check of a pay-later payment (`checkBuyNowTransaction`) and
 * the buyer's builders, offline: `buy_now` needs the signatures of the buyer
 * and of the order's merchant, so the transaction a buyer hands over must ask
 * for exactly the fee payer, the buyer and the merchant, and carry only the
 * buyer's signature. The chain side of the same rule is in
 * scripts/test-paylater.ts and scripts/test-paylater-402.ts.
 *
 *   npm run test:formula
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AccountRole,
  appendTransactionMessageInstructions,
  assertIsFullySignedTransaction,
  createNoopSigner,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransaction,
  type Address,
  type Blockhash,
  type Instruction,
} from '@solana/kit';
import { findAta } from '../src/pda.js';
import { getOrderEncoder, OrderState, TESSERA_PROGRAM_ADDRESS } from '../src/generated/index.js';
import * as paylater from '../src/paylater/index.js';

const LATEST = { blockhash: '11111111111111111111111111111111' as Blockhash, lastValidBlockHeight: 100n };

/** An RPC that knows one escrow order, awaiting payment, and a blockhash: all the builders read. */
function rpcWith(order: { buyer: Address; merchant: Address; mint: Address }) {
  const zero = new Uint8Array(32);
  const data = getOrderEncoder().encode({
    orderId: zero, buyer: order.buyer, merchant: order.merchant, payer: order.merchant, mint: order.mint, arbiter: order.merchant,
    amount: 200_000n, feeBps: 100, state: OrderState.AwaitingPayment, buyerTier: 1, merchantTier: 1, buyerScore: 300, merchantScore: 300,
    pairTrusted: false, holdSecs: 60, instant: false, seasoned: false, complained: false, requestHash: zero, deliveryHash: zero, disputeHash: zero,
    createdAt: 1n, fundedAt: 0n, deliverBy: 0n, deliveredAt: 0n, releaseAt: 0n, settledAt: 0n, paidMerchant: 0n, paidFee: 0n, refunded: 0n,
    buyerReviewed: false, merchantReviewed: false, bump: 255,
  });
  const account = { data: [Buffer.from(data).toString('base64'), 'base64'], executable: false, lamports: 1_000_000n, owner: TESSERA_PROGRAM_ADDRESS, space: BigInt(data.length) };
  return {
    getAccountInfo: () => ({ send: async () => ({ context: { slot: 1n }, value: account }) }),
    getLatestBlockhash: () => ({ send: async () => ({ context: { slot: 1n }, value: LATEST }) }),
  } as unknown as Parameters<typeof paylater.buyNowForMerchant>[0];
}

async function world(opts: { merchantPays?: boolean } = {}) {
  const [buyer, merchant, ops, other] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner(), generateKeyPairSigner(), generateKeyPairSigner()]);
  const feePayer = opts.merchantPays ? merchant : ops;
  const mint = other.address;
  const order = (await generateKeyPairSigner()).address;
  const rpc = rpcWith({ buyer: buyer.address, merchant: merchant.address, mint });
  const expected: paylater.ExpectedBuyNow = { order, vault: await findAta(order, mint), buyer: buyer.address, merchant: merchant.address, mint, feePayer: feePayer.address };
  /** The buyer's partial signature on these instructions, with the merchant's wallet as fee payer. */
  const forge = async (ixs: Instruction[]) =>
    getBase64EncodedWireTransaction(
      await partiallySignTransactionMessageWithSigners(
        pipe(
          createTransactionMessage({ version: 0 }),
          (m) => setTransactionMessageFeePayerSigner(createNoopSigner(feePayer.address), m),
          (m) => setTransactionMessageLifetimeUsingBlockhash(LATEST, m),
          (m) => appendTransactionMessageInstructions(ixs, m),
        ),
      ),
    );
  const buyNow = (merchantSigner = createNoopSigner(merchant.address)) =>
    paylater.getBuyNowInstructionAsync({ mint, buyer, merchant: merchantSigner, order, orderVault: expected.vault, loanId: new Uint8Array(32).fill(1) });
  return { buyer, merchant, ops, other, feePayer, mint, order, rpc, expected, forge, buyNow };
}

const refused = async (p: Promise<unknown>, pattern: RegExp) => {
  await assert.rejects(p, (e: Error) => e instanceof paylater.BuyNowTransactionError && pattern.test(e.message));
};

test("the buyer's transaction asks for the fee payer, the buyer and the order's merchant, and carries only the buyer's signature", async () => {
  const w = await world();
  const built = await paylater.buyNowForMerchant(w.rpc, w.buyer, w.order, w.ops.address);
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(built.transaction));
  assert.deepEqual(Object.keys(tx.signatures).sort(), [w.ops.address, w.buyer.address, w.merchant.address].sort());
  assert.ok(tx.signatures[w.buyer.address]);
  assert.equal(tx.signatures[w.ops.address], null);
  assert.equal(tx.signatures[w.merchant.address], null);
  const checked = await paylater.checkBuyNowTransaction(built.transaction, w.expected);
  assert.equal(checked.loan, built.loan);
  // The merchant's server signs with its ops wallet and the merchant's key, and then it is complete.
  assertIsFullySignedTransaction(await signTransaction([w.ops.keyPair, w.merchant.keyPair], checked.tx));
});

test('a merchant that pays its own fees signs once: two signers', async () => {
  const w = await world({ merchantPays: true });
  const built = await paylater.buyNowForMerchant(w.rpc, w.buyer, w.order, w.merchant.address);
  const checked = await paylater.checkBuyNowTransaction(built.transaction, w.expected);
  assert.deepEqual(Object.keys(checked.tx.signatures).sort(), [w.buyer.address, w.merchant.address].sort());
  assertIsFullySignedTransaction(await signTransaction([w.merchant.keyPair], checked.tx));
});

test("a buy_now that does not ask for the merchant's signature is refused", async () => {
  const w = await world();
  const ix = await w.buyNow();
  const alone = { ...ix, accounts: ix.accounts.map((a) => (a.address === w.merchant.address ? { address: a.address, role: AccountRole.READONLY } : a)) };
  await refused(paylater.checkBuyNowTransaction(await w.forge([alone]), w.expected), /signers must be the merchant's wallet, the buyer and the order's merchant/);
});

test('a signer more, or the merchant asked to sign writable, is refused', async () => {
  const w = await world();
  const ix = await w.buyNow();
  const extra = { ...ix, accounts: [...ix.accounts, { address: w.other.address, role: AccountRole.READONLY_SIGNER, signer: createNoopSigner(w.other.address) }] };
  await refused(paylater.checkBuyNowTransaction(await w.forge([extra]), w.expected), /signers must be/);
  const writable = { ...ix, accounts: ix.accounts.map((a) => (a.address === w.merchant.address ? { ...a, role: AccountRole.WRITABLE_SIGNER } : a)) };
  await refused(paylater.checkBuyNowTransaction(await w.forge([writable]), w.expected), /must sign read-only/);
});

test("a signature already in the merchant's or the fee payer's place is refused", async () => {
  const w = await world();
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(await w.forge([await w.buyNow()])));
  for (const who of [w.merchant.address, w.ops.address]) {
    const filled = { ...tx, signatures: { ...tx.signatures, [who]: new Uint8Array(64).fill(7) as unknown as (typeof tx.signatures)[Address] } };
    await refused(paylater.checkBuyNowTransaction(getBase64EncodedWireTransaction(filled), w.expected), /already carries a signature for/);
  }
});

test("the buyer cannot be the merchant or the merchant's wallet", async () => {
  const w = await world();
  const wire = await w.forge([await w.buyNow()]);
  await refused(paylater.checkBuyNowTransaction(wire, { ...w.expected, merchant: w.buyer.address }), /buyer cannot be/);
  await refused(paylater.checkBuyNowTransaction(wire, { ...w.expected, feePayer: w.buyer.address }), /fee payer is|buyer cannot be/);
});

test("buyOrderOnCredit takes the order's merchant as a signer, and only that merchant", async () => {
  const w = await world();
  await assert.rejects(paylater.buyOrderOnCredit(w.rpc, w.buyer, w.order, w.other), /was opened by the merchant/);
  const { instructions } = await paylater.buyOrderOnCredit(w.rpc, w.buyer, w.order, w.merchant);
  const meta = instructions[0]!.accounts.find((a) => a.address === w.merchant.address);
  assert.equal(meta?.role, AccountRole.READONLY_SIGNER);
});
