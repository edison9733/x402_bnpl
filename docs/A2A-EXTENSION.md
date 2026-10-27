# Tessera escrow: an A2A extension

**URI:** `https://github.com/edison9733/agentic_commerce/blob/main/docs/A2A-EXTENSION.md`

This extension tells a client agent two things about a merchant agent that takes
[x402 payments over A2A](https://github.com/google-agentic-commerce/a2a-x402): that the payment goes
into a Tessera escrow rather than to the merchant, and where to find the on-chain credit profile behind
the agent. It adds metadata; it does not change the x402 extension's flow or message shapes.

## Declaration

```json
{
  "capabilities": {
    "extensions": [
      { "uri": "https://github.com/google-agentic-commerce/a2a-x402/blob/main/spec/v0.2", "required": true },
      {
        "uri": "https://github.com/edison9733/agentic_commerce/blob/main/docs/A2A-EXTENSION.md",
        "required": false,
        "params": {
          "program": "TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ",
          "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
          "wallet": "<the merchant's wallet>",
          "prices": { "<skill id>": "<amount in token units>" },
          "decimals": 6,
          "x402Resource": "<base>/x402/{skill}",
          "standing": { "score": 0, "tier": "New" }
        }
      }
    ]
  }
}
```

`standing` is a convenience. A client **must not** rely on it: it should read the merchant's Agent
account (`["agent", wallet]` under `program`) and recompute the score itself.

## Flow

The a2a-x402 standalone flow, with three additions.

1. **Request.** The client's data part names the wallet that will pay, because the escrow is opened for
   that wallet: `{ "skill": "<id>", "input": { ... }, "buyer": "<wallet>", "minHoldSecs": 60 }`.
   `minHoldSecs` is optional and can only lengthen the hold.
2. **Payment required.** `x402.payment.required.accepts[].payTo` is the **order account**. The escrow
   terms are repeated in `x402.payment.required.extensions.tessera` and in the metadata key
   `tessera.escrow`:

   ```json
   { "program": "...", "orderId": "<32 bytes, hex>", "order": "...", "vault": "...",
     "buyer": "...", "merchant": "...", "amount": "200000", "mint": "...",
     "holdSecs": 120, "buyerTier": "New", "merchantTier": "New", "pairTrusted": false,
     "requestHash": "<sha256 of the canonical JSON of { sku, input }>" }
   ```

   There is one `accepts` entry per facilitator the merchant can settle through; each names that
   facilitator's fee payer in `extra.feePayer`. Where the network has the pay-later pool, one more
   entry follows them, with scheme `tessera-paylater`: the same order, price and asset, and in
   `extra` (repeated as `extensions.tessera.payLater`) what the pool would do for this buyer:

   ```json
   { "program": "LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D", "pool": "...", "feePayer": "<the merchant's ops wallet>",
     "buyerLimit": "1500000", "buyerOutstanding": "0", "fee": "4000", "termSecs": 60,
     "eligible": true }
   ```

   `eligible` is false, with a `reason`, when the program would refuse: the price is over the buyer's
   remaining limit (the SDK's limit formula on its live credit file and line), the pool cannot cover
   it, the line is frozen, or a party does not qualify. The exact entries stay first, so a standard
   x402 client is not affected.
3. **Before paying, the client verifies on-chain** that the order account derived from `orderId` equals
   `payTo`, and that the order's buyer, merchant, amount, mint, request hash and state are what it asked
   for. `verifyOrderForPayment` in `@tessera/sdk` does this.
4. **Payment submitted.** Either the standard `x402.payment.payload`, or, when the client funded the
   vault itself, `tessera.payment.direct: { "signature": "<tx>" }`. Both are followed by the merchant
   asking the program to confirm funding from the vault balance.

   For the `tessera-paylater` option, `x402.payment.payload` (or the `PAYMENT-SIGNATURE` header over
   plain HTTP) is `{ "x402Version": 2, "accepted": <that entry>, "payload": { "transaction": "<base64>" } }`
   where the transaction is a legacy or version-0 transaction with the merchant's `feePayer` as fee
   payer, already signed by the buyer, holding exactly one `buy_now` of the pay-later program for
   this order, after at most one compute unit limit (at most 400,000 units) and one unit price (at
   most 1,000,000 micro-lamports). The merchant is its own facilitator: it decodes it, checks the
   program, the instruction, that every account of the `buy_now` is the one this order derives (the
   order, its buyer, vault, merchant and mint among them), that the buyer signed, simulates, signs as
   fee payer and sends; the receipt is the signature. The `buy_now` has the escrow confirm the order
   itself, so the order is funded when it lands and there is no separate `confirm_funded`. A transaction that fails any check is refused before anything is signed (HTTP 400,
   `INVALID_PAYLOAD` over A2A). `paylater.buyNowForMerchant` in `@tessera/sdk` builds the
   transaction; `paylater.checkBuyNowTransaction` is the merchant's check.
5. **Completed.** The artifact is the deliverable. `tessera.delivery` in the status message carries
   `{ order, deliveryHash, state, instant, releaseAt, deliverTx }`. The client should check that the
   sha256 of the canonical JSON of the artifact equals the `delivery_hash` stored on the order, and
   dispute during the hold if it does not.

Canonical JSON here means `JSON.stringify` with object keys sorted at every level (`canonicalJson` in the SDK).

## Status

Implemented by `apps/agents` in this repository against the a2a-x402 v0.2 specification text. It has
not been run against the official A2A test kit.
