/**
 * The merchant's check of a pay-later payment (`checkBuyNowTransaction`) and
 * the buyer's builders, offline: `buy_now` needs the signatures of the buyer
 * and of the order's merchant, so the transaction a buyer hands over must ask
 * for exactly the fee payer, the buyer and the merchant, each once, and carry
 * only the buyer's signature; and it carries the price and request hash the
 * buyer agreed to, which must be the merchant's quote. The merchant's check
 * that the order at a quoted address is the one it opened
 * (`quotedOrderRefusal`) is here too. The chain side of the same rules is in
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
  getCompiledTransactionMessageDecoder,
  getCompiledTransactionMessageEncoder,
  getTransactionDecoder,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signBytes,
  signTransaction,
  type Address,
  type Blockhash,
  type Instruction,
} from '@solana/kit';
import { findAta } from '../src/pda.js';
import { getOrderEncoder, OrderState, TESSERA_PROGRAM_ADDRESS, type Order } from '../src/generated/index.js';
import * as paylater from '../src/paylater/index.js';
import { quotedOrderRefusal } from '../src/verify.js';

const LATEST = { blockhash: '11111111111111111111111111111111' as Blockhash, lastValidBlockHeight: 100n };

/** The price and request every order here is opened at. */
const PRICE = 200_000n;
const REQUEST = new Uint8Array(32).fill(9);
const TERMS: paylater.BuyNowTerms = { amount: PRICE, requestHash: REQUEST };

/** An RPC that knows one escrow order, awaiting payment, and a blockhash: all the builders read. */
function rpcWith(order: { buyer: Address; merchant: Address; mint: Address; amount?: bigint }) {
  const zero = new Uint8Array(32);
  const data = getOrderEncoder().encode({
    orderId: zero, buyer: order.buyer, merchant: order.merchant, payer: order.merchant, mint: order.mint, arbiter: order.merchant,
    amount: order.amount ?? PRICE, feeBps: 100, state: OrderState.AwaitingPayment, buyerTier: 1, merchantTier: 1, buyerScore: 300, merchantScore: 300,
    pairTrusted: false, holdSecs: 60, instant: false, seasoned: false, complained: false, requestHash: REQUEST, deliveryHash: zero, disputeHash: zero,
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
  const expected: paylater.ExpectedBuyNow = {
    order, vault: await findAta(order, mint), buyer: buyer.address, merchant: merchant.address, mint, feePayer: feePayer.address, amount: PRICE, requestHash: REQUEST,
  };
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
  const buyNow = (merchantSigner = createNoopSigner(merchant.address), terms: paylater.BuyNowTerms = TERMS) =>
    paylater.getBuyNowInstructionAsync({ mint, buyer, merchant: merchantSigner, order, orderVault: expected.vault, loanId: new Uint8Array(32).fill(1), ...terms });
  return { buyer, merchant, ops, other, feePayer, mint, order, rpc, expected, forge, buyNow };
}

const refused = async (p: Promise<unknown>, pattern: RegExp) => {
  await assert.rejects(p, (e: Error) => e instanceof paylater.BuyNowTransactionError && pattern.test(e.message));
};

test("the buyer's transaction asks for the fee payer, the buyer and the order's merchant, and carries only the buyer's signature", async () => {
  const w = await world();
  const built = await paylater.buyNowForMerchant(w.rpc, w.buyer, w.order, w.ops.address, TERMS);
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
  const built = await paylater.buyNowForMerchant(w.rpc, w.buyer, w.order, w.merchant.address, TERMS);
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

test('the buy_now carries the price and request hash the buyer agreed to, and only the quoted ones pass', async () => {
  const w = await world();
  const built = await paylater.buyNowForMerchant(w.rpc, w.buyer, w.order, w.ops.address, TERMS);
  const msg = getCompiledTransactionMessageDecoder().decode(getTransactionDecoder().decode(getBase64Encoder().encode(built.transaction)).messageBytes);
  if (msg.version === 1) throw new Error('a version-1 message');
  const data = msg.instructions.at(-1)!.data!;
  assert.equal(data.length, 8 + 32 + 8 + 32);
  assert.equal(new DataView(data.buffer, data.byteOffset).getBigUint64(40, true), PRICE);
  assert.deepEqual(Array.from(data.slice(48)), Array.from(REQUEST));
  // A merchant whose quote was another price or request does not sign it, nor one carrying another price.
  await refused(paylater.checkBuyNowTransaction(built.transaction, { ...w.expected, amount: PRICE + 1n }), /a price of 200000 units, not the 200001 quoted/);
  await refused(paylater.checkBuyNowTransaction(built.transaction, { ...w.expected, requestHash: new Uint8Array(32) }), /another request hash/);
  for (const terms of [{ amount: 1_000n, requestHash: REQUEST }, { amount: 740_000n, requestHash: REQUEST }, { amount: PRICE, requestHash: new Uint8Array(32) }]) {
    await refused(paylater.checkBuyNowTransaction(await w.forge([await w.buyNow(undefined, terms)]), w.expected), /a price of .* not the 200000 quoted|another request hash/);
  }
  // A buy_now of the old shape (the loan id alone) is refused for its length.
  const ix = await w.buyNow();
  await refused(paylater.checkBuyNowTransaction(await w.forge([{ ...ix, data: ix.data.slice(0, 40) }]), w.expected), /data of the wrong length/);
});

test('the buyer does not sign for an order that no longer carries the terms it verified', async () => {
  const w = await world();
  // The order at the address now asks 0.74 USDC: a buyer that verified 0.20 refuses to build the buy_now.
  const swapped = rpcWith({ buyer: w.buyer.address, merchant: w.merchant.address, mint: w.mint, amount: 740_000n });
  await assert.rejects(paylater.buyNowForMerchant(swapped, w.buyer, w.order, w.ops.address, TERMS), /price is 740000 units, not the 200000 agreed/);
  await assert.rejects(paylater.buyNowForMerchant(w.rpc, w.buyer, w.order, w.ops.address, { amount: PRICE, requestHash: new Uint8Array(32) }), /request hash/);
  await assert.rejects(paylater.buyOrderOnCredit(swapped, w.buyer, w.order, w.merchant, TERMS), /price is 740000 units/);
});

test('a key listed twice among the signers is refused, so a signer slot cannot stand for the merchant', async () => {
  const w = await world();
  // A buy_now where the merchant is a plain account, and the buyer listed a
  // second time as a signer, so the count of signers still matches.
  const ix = await w.buyNow();
  const plain = { ...ix, accounts: ix.accounts.map((a) => (a.address === w.merchant.address ? { address: a.address, role: AccountRole.READONLY } : a)) };
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(await w.forge([plain])));
  const msg = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  if (msg.version === 1) throw new Error('a version-1 message');
  const at = msg.staticAccounts.indexOf(w.buyer.address);
  const forged = {
    ...msg,
    header: { ...msg.header, numSignerAccounts: msg.header.numSignerAccounts + 1 },
    staticAccounts: [...msg.staticAccounts.slice(0, at + 1), w.buyer.address, ...msg.staticAccounts.slice(at + 1)],
    instructions: msg.instructions.map((c) => ({
      ...c,
      programAddressIndex: c.programAddressIndex > at ? c.programAddressIndex + 1 : c.programAddressIndex,
      accountIndices: c.accountIndices?.map((i) => (i > at ? i + 1 : i)),
    })),
  };
  const messageBytes = new Uint8Array(getCompiledTransactionMessageEncoder().encode(forged as never));
  const sig = await signBytes(w.buyer.keyPair.privateKey, messageBytes);
  const signers = forged.staticAccounts.slice(0, forged.header.numSignerAccounts);
  const wire = new Uint8Array(1 + 64 * signers.length + messageBytes.length);
  wire[0] = signers.length;
  signers.forEach((s, i) => s === w.buyer.address && wire.set(sig, 1 + 64 * i));
  wire.set(messageBytes, 1 + 64 * signers.length);
  await refused(paylater.checkBuyNowTransaction(Buffer.from(wire).toString('base64'), w.expected), /lists an account more than once/);
});

test("the merchant's check that the order at its quoted address is the one it opened", async () => {
  const [buyer, merchant, ops, other] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner(), generateKeyPairSigner(), generateKeyPairSigner()]);
  const opened = {
    buyer: buyer.address, merchant: merchant.address, mint: other.address, amount: PRICE, requestHash: REQUEST, holdSecs: 45, payer: ops.address, createdAt: 1_000n,
  } as Pick<Order, 'buyer' | 'merchant' | 'mint' | 'amount' | 'requestHash' | 'holdSecs' | 'payer' | 'createdAt'>;
  const quoted = { ...opened };
  assert.equal(quotedOrderRefusal(opened, quoted), undefined);
  // The buyer cancelled the quote and reopened the same id in the merchant's name at 0.001 USDC, paying the rent itself.
  const cheap = { ...opened, amount: 1_000n, payer: buyer.address, createdAt: 1_010n };
  assert.match(quotedOrderRefusal(cheap, quoted) ?? '', /price is 1000 units, not the 200000 quoted/);
  assert.match(quotedOrderRefusal(cheap, quoted, 'terms') ?? '', /price is 1000 units/);
  // The same price and request, but a hold of the buyer's choosing, its own rent, a later opening: not the order quoted...
  assert.match(quotedOrderRefusal({ ...opened, holdSecs: 86_400 }, quoted) ?? '', /hold is 86400 s, not the 45 s quoted/);
  assert.match(quotedOrderRefusal({ ...opened, payer: buyer.address }, quoted) ?? '', /rent was paid by/);
  assert.match(quotedOrderRefusal({ ...opened, createdAt: 1_010n }, quoted) ?? '', /opened at 1010, not at 1000/);
  // ...though its terms are the quote's, so once it is funded it may be delivered.
  assert.equal(quotedOrderRefusal({ ...opened, holdSecs: 86_400, payer: buyer.address, createdAt: 1_010n }, quoted, 'terms'), undefined);
  assert.match(quotedOrderRefusal({ ...opened, requestHash: new Uint8Array(32) }, quoted, 'terms') ?? '', /request hash/);
  assert.match(quotedOrderRefusal({ ...opened, buyer: other.address }, quoted, 'terms') ?? '', /buyer is/);
  // A quote kept from before the opening time was recorded is not compared on it.
  const { createdAt: _, ...older } = quoted;
  assert.equal(quotedOrderRefusal({ ...opened, createdAt: 5n }, older), undefined);
});
