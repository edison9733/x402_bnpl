# Security model

What can go wrong, what stops it, and the test that proves it. Then what is still open.

Tests: `npm run test:local` runs the real program on a local validator and sends each on-chain attack
below as a real transaction that must be rejected (395 checks). `npm run test:formula` checks the
economic claims, the reward rules, the approval link and the merchant's check of a pay-later transaction
(66 tests). `npm test` also runs the 48 CLI tests.
`npm run test:paylater` and `npm run test:paylater-402` do the same for the pay-later program
([Pay later](#pay-later)). "Model" means the claim is checked by simulation through the reference
model, which the local suite proves equal to the program.

Status: **Enforced** means enforced and tested. **Mitigated** means mitigated, with the residual risk
stated. **Open** means not defended yet.

## Audit of 7 October 2026

A pass over every instruction, the merchant server, the buyer agent and the website checkout, looking
for ways a buyer or a merchant could take money, take a delivery, or bend a score. What it found and
what was done:

| # | Finding | Severity | Fix | Test |
|---|---|---|---|---|
| B13 | Anyone could open an order in a merchant's name without its signature, fund it, and let it expire. Each missed delivery cost the merchant a 10% penalty and its Trusted tier, at almost no cost to the attacker. | Critical | `open_order` requires the merchant's signature. On devnet since 28 October 2026, on the escrow at `tESs6b4J…`; the retired `TessSeP5…` keeps it open. | local: "a stranger opens an order in a merchant's name" → `AccountNotSigner` |
| C16 | A merchant could name any Trusted wallet as the buyer and fund the order itself. It earned credit and Diversity at that wallet's full tier weight for 1% in fees, without the wallet ever taking part. | High | A released order becomes evidence for the merchant only when the buyer reviews it. | local: step 12; formula |
| C17 | The same forged orders let a merchant review-bomb any buyer with fully weighted one-star reviews. | High | A merchant's review of a released order weighs 0 until the buyer has reviewed it. | local: step 12; formula |
| D6 | The website's delivery endpoint took only the order address, which is public. Someone watching the chain could collect a delivery another wallet paid for; the real buyer got nothing and would then lose the dispute, because the delivery matched its hash. | High | The quote hands its requester a secret claim; the endpoint requires it. | server |
| D8 | The demo arbiter's evidence lived in memory. After a restart every dispute went to the buyer. | High | Deliveries are written to disk before the hash goes on-chain. With no record, the arbiter splits evenly and penalises nobody. | server |
| D1 | The per-wallet quote cap was bypassed by inventing wallet addresses. Each quote fronts rent, so a script could drain the server's SOL. | Medium | A per-client rate limit on everything that opens an order or uses the faucet, and a cap on each merchant's open quotes. | server |
| D7 | Over plain HTTP 402, anyone could pay for an order quoted to another wallet and receive what that wallet asked for. | Medium | The payment must be signed by the order's buyer. | server |
| C18 | A buyer that lost a dispute could answer it with a fully weighted one-star review of the merchant. | Medium | The side that lost a dispute gets no weight on it. | local: step 5; formula |
| B14 | A dispute the arbiter never resolved locked the money forever. | Medium | After the complaint period, anyone may split the vault evenly. Nobody is penalised. | local: step 14 |
| B15 | A party could close its own token account to stall a release or a refund. | Low | Anyone can recreate it; the agents' settle transactions now always do. | none |

## Audit of 10 October 2026

A second pass, this time over every component: the program, the SDK, the API, the agents, the CLI and MCP
server, the rewards script, the website and the image. 110 findings; the ones that mattered, and what was
done:

| # | Finding | Severity | Fix | Test |
|---|---|---|---|---|
| B16 | **Order swap.** While a buyer's signed payment was in flight, the merchant cancelled the order and reopened the same order id for its own second wallet. The payment then funded the new order and the merchant took it. | Critical | `cancel_unpaid` leaves the order in a `Cancelled` state until `close_order`, after the unpaid window. The id cannot be reopened, the vault is closed, and `close_order` refuses a cancelled order whose vault was recreated by a late payment until anyone cancels again and refunds it. The buyer's SDK also refuses an order id that has already been used. On devnet since 28 October 2026, on the escrow at `tESs6b4J…`; the retired `TessSeP5…` keeps it open. | local: reopen fails with "already in use"; pay into a cancelled order fails |
| B17 | A payment could be confirmed after the payment window had closed. | Medium | `confirm_funded` fails with `PaymentWindowClosed` after `created_at + unpaid_secs`. | local |
| B18 | A buyer could ask for a hold of any length and the merchant's server co-signed it. | Medium | `min_hold_secs` is capped at 30 days (`HoldTooLong`); the buyer's SDK and the server both check. | local |
| B19 | The arbiter could be the buyer or the merchant of the order. | High | Rejected at `open_order` (`ArbiterIsParty`). | local |
| C19 | **Forged pair history.** Counterparty history grew on every release, so a merchant could build it without the buyer taking part. | High | Pair history grows only from orders the buyer reviewed. | local; formula |
| C20 | A merchant that had lost Trusted could still be paid instantly, because the tier was read when the order was opened. | High | `deliver` re-scores the merchant and settles instantly only if it is still Trusted and inside its limit. | local: step 16 |
| C21 | A refunded instant order kept counting against the merchant's instant limit, and a complaint could be cleared by closing the order. | Medium | A refund frees the amount; a complaint locks it for good. | local; formula |
| C22 | An even split of an odd amount gave a review the wrong weight. | Low | The half gate is exact on both sides. | local |
| D16 | The API relayed any signed transaction, for any program. | Medium | `/v1/tx/submit` relays only Tessera, token, associated-token, compute-budget and system instructions, and at least one Tessera instruction. | doors |
| D17 | One slow agent card could stall `find_merchants` for every caller (the timeout reset on every byte). | High | One wall-clock deadline per card, a size cap, no redirects, and an overall budget with partial results. | doors |
| D18 | The merchant server forgot quotes on restart and delivered nothing for orders funded after it, so the merchant took the missed-delivery penalty. | High | Quotes and delivery results are written to disk atomically; funded orders are completed or refunded before the deadline; delivery fails closed if its evidence cannot be saved. | agents smoke test |
| D19 | The review-reward rebate could pay the same reviews twice if a later batch failed. | Critical | Each batch is recorded as pending, then paid, before the next one is sent; an exclusive lock; a missing ledger refuses to pay; payouts carry memos so a lost ledger can be rebuilt from the chain. | rewards tests; `demo:rewards` |

**Both audits' program fixes are in the source and pass the local suite, and are on devnet since 28 October 2026.**
The escrow devnet ran until then (`TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ`) was last deployed on
4 October 2026 (slot 507449356), before both audits, and its upgrade authority, its config authority
and its arbiter are version 1 keys that were lost, so it can never be upgraded. On it `open_order`
does not need the merchant's signature (B13 is open there), `cancel_unpaid` closes an unpaid order
outright so its id can be reopened (B16), and a dispute can never be resolved. On 28 October 2026 the
same source was deployed at a new address, `tESs6b4JFTWoNnELMa4KSxPuJDSRaLAtCSUr8BGY6ry` (slot
515961506, [transaction](https://explorer.solana.com/tx/34QUoV5GAC7yNY9k1Wz7UFeD7fjygddE5q7M9eJdkPwwDtZb745aiWEQd8zuSQSTWmvaPes4p73NdWs5VZBMxwQW?cluster=devnet)),
with the deployer's wallet as upgrade authority and a config
(`CvyxNt9ktt4uUMq83jZHbbqzJdNR9Tvd6YBq1ER7FPmS`) whose arbiter and treasury keys we hold. The first
478,688 bytes of the program dumped from devnet hash the same as a local build of `eca65b0`, and the
rest is zeros. The old escrow is retired: its accounts, and the runs on it, stay on devnet as
history. The tables below describe the source, which is the escrow on devnet now.

## Pay later

The pay-later program ([PAYLATER.md](PAYLATER.md)) lends into the escrow: its `buy_now` pays an
escrow order's vault from a pool. A review of it against the escrow build that devnet ran until 28
October 2026 (the 4 October build of `c6dbcd7` at `TessSeP5…`, now retired, whose `open_order` does
not need the merchant's signature) found:

| # | Finding | Severity | Fix | Test |
|---|---|---|---|---|
| P1 | **A loan turned into cash with no merchant involved.** On the retired devnet escrow anyone can open an order in a merchant's name (B13 is open there). A buyer at Building could open one naming any Building merchant, paying the rent itself, have `buy_now` pay the pool's money into it (the program checked that the order named the merchant, not that the merchant agreed), wait out the delivery window and have anyone call `refund`: the escrow sent the pool's USDC to the buyer as cash, the loan stayed owed (up to the buyer's limit, then a default), and the merchant took a missed-delivery penalty for an order it never accepted. | High | `buy_now` requires the order's merchant's signature (`BuyNow.merchant` is a `Signer`), so the pool funds only an order its merchant signed for, on any escrow build. Over x402 the merchant's server adds that signature, with the merchant's own key and only for its own orders, after `checkBuyNowTransaction` has passed, which now requires exactly the fee payer, the buyer and the merchant as signers and only the buyer's signature in what it is handed. **On devnet since 28 October 2026**, when the pay-later program there was upgraded to the build of `1bd11be` (slot 515766612), and in the build of `eca65b0` (slot 515961295) that lends into the new escrow since the same day. | paylater: "without m1's signature" → `AccountNotSigner`; with `ESCROW_SO` (the retired devnet escrow's bytes, before `eca65b0`) the buyer opens the order in m1's name and its `buy_now` for it → `AccountNotSigner`, nothing moves; paylater-402: the `buy_now` that lands carries three signatures, and one that does not ask for the merchant's is refused before signing; formula: `paylater-check.test.ts`; devnet, 28 Oct, on the retired escrow: the `buy_now` of the purchase that confirmed the upgrade to `1bd11be` landed with three signatures, the merchant server's as fee payer, Nova's and Quill's as the order's merchant ([settle tx](https://explorer.solana.com/tx/1K7VsBKVWYHXmMmEdytiUck99inmuuRQuYfDUBAyGuhpzQ7b4vou7CkAT9L73hTBxo7CfURvpVGvLsfAf44b2xG?cluster=devnet)); on the new escrow, the one that confirmed `eca65b0` landed with the same three, Quill's read-only ([settle tx](https://explorer.solana.com/tx/2mZxEzfu5ReApNejhCz7GMEwkkBJc7rafjiG3LUiKPNGx1J3oFhxEty3xdLtFfdrJ8Aevauzoy4NX3xVGZJMnzW8?cluster=devnet)) |
| P2 | **A merchant reprices the order behind the buyer's signed `buy_now`.** `buy_now` took only a loan id and read the price and request hash from whatever order sat at the named address when it ran, so neither signature committed to a price. On the retired devnet escrow either party may close an unpaid order at any time (`cancel_unpaid` closes it outright there) and anyone may open another at the same address at once (B16 is open there). A merchant handed a buyer's signed `buy_now` over x402 could cancel its quote, reopen the same id for the same buyer at a higher price and send the transaction within its blockhash lifetime: the pool paid the new price, up to the buyer's whole available credit, and the buyer owed it. Every buyer-side check (the advertised price, `--max`, `verifyOrderForPayment`) ran before signing. A dispute there cannot be resolved, so the money would stay locked and the loan owed. | High | `buy_now(loan_id, amount, request_hash)` carries the price and request hash the buyer agreed to, and refuses an order that does not carry exactly those (`PriceMismatch`, `RequestMismatch`). The buyer's clients pass the quoted price and request hash they verified, `buyNowForMerchant` and `buyOrderOnCredit` refuse to build one for an order that no longer carries them, and the merchant's `checkBuyNowTransaction` requires them to equal its quote. Pool, line and loan layouts are unchanged. **On devnet since 28 October 2026** (the build of `1bd11be`, slot 515766612, then that of `eca65b0`, slot 515961295). | paylater: another price or request → `PriceMismatch` / `RequestMismatch` on both escrow builds; with `ESCROW_SO` (the retired devnet escrow's bytes, before `eca65b0`) the merchant cancels and reopens the order at 2 USDC after the buyer signed for 0.002, and the buyer's `buy_now` lands and fails with `PriceMismatch`, nothing moves (on the current escrow the reopen itself fails); paylater-402: a `buy_now` carrying a lower price or another request hash is refused before signing; formula: `paylater-check.test.ts`; devnet, 28 Oct, on the retired escrow: the `buy_now` of the purchase that confirmed the upgrade to `1bd11be` carries the amount 250000 (0.25 USDC) and the request hash after the loan id, 80 bytes of data in all ([settle tx](https://explorer.solana.com/tx/1K7VsBKVWYHXmMmEdytiUck99inmuuRQuYfDUBAyGuhpzQ7b4vou7CkAT9L73hTBxo7CfURvpVGvLsfAf44b2xG?cluster=devnet)); on the new escrow, the one that confirmed `eca65b0` carries the same, 250000 in 80 bytes ([settle tx](https://explorer.solana.com/tx/2mZxEzfu5ReApNejhCz7GMEwkkBJc7rafjiG3LUiKPNGx1J3oFhxEty3xdLtFfdrJ8Aevauzoy4NX3xVGZJMnzW8?cluster=devnet)) |
| P3 | **The merchant signs for an order it never opened.** The merchant server checked only that the order at its quoted address was awaiting payment, unpaid and inside its window. On the retired devnet escrow the buyer could cancel the quote and reopen the same id in the merchant's name (without its signature), at the escrow's minimum price or with a hold of its choosing, and pay with a `buy_now` for that: the merchant's key signed, the pool paid the small amount, and the merchant delivered a 0.20 USDC service for 0.001 USDC, or waited as long as the buyer liked to be paid. The exact flow underpaid the same way. | Medium | Before it signs for or settles any payment, the server compares the order at the quoted address with its record of the quote (`quotedOrderRefusal`): buyer, merchant, mint, price, request hash, hold, the wallet that paid the rent and when it was opened. It compares the whole record again before it confirms or delivers an order a buyer funded itself, does not confirm one that is not its quote, and refunds at once a funded one that is not (its own refund costs nothing). A quote whose address holds another order is dropped; a buyer that funded such an order itself gets its money back with `cancel_unpaid` or, once the order is confirmed, with the refund anyone may call after the delivery deadline, and the merchant takes no part in it. Runs on every escrow build. | paylater-402 with `ESCROW_SO` (the retired devnet escrow's bytes, before `eca65b0`): the buyer reopens atlas's quote at 0.001 USDC, and the server refuses its `buy_now` before signing; reopened at the quoted price with a day-long hold, refused too; formula: `paylater-check.test.ts` |
| P4 | **A buyer makes the merchant pay fees for `buy_now`s that fail.** The buyer picks the priority fee (up to 1,000,000 micro-lamports per unit, 0.0004 SOL) and can cancel its order between the merchant's simulation and the landing, so the signed transaction fails on-chain and the merchant pays the fee; the server then answered 502 "do not pay again" though nothing was paid. A forged message listing a signer key twice also passed the signer check and failed later with the same misleading answer. | Low | `MAX_CU_PRICE` is 10,000 micro-lamports per unit (at most 4,000 lamports of priority fee); a `buy_now` that landed and failed is a `PaymentRefused` ("nothing was paid"), and after three in an hour the server offers that wallet no credit for the hour. `checkBuyNowTransaction` refuses a transaction that lists any account twice. | formula: a key listed twice is refused; paylater-402: a priority fee above the cap is refused |

The merchant's signature (P1) and the price binding (P2) change the program, and the program and the
merchant server must be upgraded together; [PAYLATER.md](PAYLATER.md#upgrading-devnet) gives the order.
Devnet was upgraded in that order on 28 October 2026 (UTC+8): the merchant server was restarted
first, then the program was upgraded to the build of `1bd11be` in slot 515766612
([transaction](https://explorer.solana.com/tx/3vcqaD4McyE5FDa1tHDxEMd8sgdNGTWdk2bm3BGFHQmHx36jmjoYU7ZBdKuVXc4K5KeBYHBjYUG36wVp2AVS7s2E?cluster=devnet)).
Nova then bought Quill's 0.25 USDC summary on credit
([settle tx](https://explorer.solana.com/tx/1K7VsBKVWYHXmMmEdytiUck99inmuuRQuYfDUBAyGuhpzQ7b4vou7CkAT9L73hTBxo7CfURvpVGvLsfAf44b2xG?cluster=devnet))
and repaid it on time
([repay tx](https://explorer.solana.com/tx/3oL3qukdUPiM6Tvgd8D8RM8XsUgTHjqMQiuGjZLUHiJEMYKnMr5sk8XKQkwXA6CoMSPoC2XUBAwFoyXguBYNEiJu?cluster=devnet)).
That ran on the escrow devnet used then, the 4 October build at `TessSeP5…`, which can never be
upgraded, so its open findings stay open on it: anyone can open an order there in a merchant's name,
fund it with its own money and, after the deadline, have it refunded for a merchant penalty (B13).
It is retired. Later the same day the escrow source was deployed at `tESs6b4J…` (see the
[audit of 10 October](#audit-of-10-october-2026)), and the pay-later program was upgraded to the
build of `eca65b0`, which differs from `1bd11be` only in the escrow address it compiles in (slot
515961295, [transaction](https://explorer.solana.com/tx/3YJDEfVq961AwaqKYFwoDRxEfDwJDmLUvXFNHVBjWyGzL9J1U5UrFomjNTLUoxmSG1QN1X1vXunTJBdSwwmp1XgG?cluster=devnet)).
Nova bought Quill's summary on credit again, on the new escrow
([settle tx](https://explorer.solana.com/tx/2mZxEzfu5ReApNejhCz7GMEwkkBJc7rafjiG3LUiKPNGx1J3oFhxEty3xdLtFfdrJ8Aevauzoy4NX3xVGZJMnzW8?cluster=devnet)),
and repaid it on time
([repay tx](https://explorer.solana.com/tx/4LUwpKcBk6mGvKf1hN6bJ4yZq8Aub292AuPHtyN4RpnMkjcQV9KTqzWGjDXy9U65C6AJtge2ebZPV6PYijf4jQnY?cluster=devnet)).
On devnet now the pool's money cannot be drawn into an order its merchant did not sign for or a
repriced one, and on the escrow it lends into neither order can be opened (B13, B16).

## Principles

1. **Verify, don't trust.** A merchant's server is a convenience, never an oracle. A buyer reads the
   order from the chain before paying. The program trusts nothing a caller says about money: funding is
   proven by the vault's balance.
2. **Trust is earned from counterparties, not minted by wallets.** Evidence counts by who the
   counterparty was, is capped per counterparty, and needs time that cannot be bought in a burst.
3. **Instant settlement is collateralised by sunk cost.** A merchant can take without a hold only what
   it has already paid in fees, plus a small base.
4. **Every protection starts at the risky moment.** The hold starts at delivery, not at payment, and a
   dispute freezes it.
5. **Governance cannot reach in-flight escrow.** Fee, arbiter and hold are snapshotted per order.
6. **Nothing is locked forever.** Unpaid quotes give their rent back: the merchant server's crank
   cancels and closes them. Settled orders can give theirs back once their review window is over
   (`close_order`, which anyone may call; the crank does it with `CLOSE_SETTLED_ORDERS=1`, off by
   default so they stay as history; [PAYLATER.md](PAYLATER.md#limits) lists what is closed when).
   Credit files, pair accounts and reviews stay.

## A. Payment integrity

| # | Attack | Status | Defence | Test |
|---|---|---|---|---|
| A1 | The merchant server quotes an escrow whose buyer is someone else (it refunds itself later). | Enforced | `verifyOrderForPayment` reads the order on-chain and checks buyer, merchant, amount, mint, state and request hash. | local: "quote is for an order opened for a different buyer" |
| A2 | The quote's `payTo` is the merchant's wallet, or any address that is not this order's escrow. | Enforced | The buyer derives the order address from the order id and requires `payTo` to equal it. | local: "quote names an escrow that is not this order" |
| A3 | The quote is for a larger amount than advertised. | Enforced | Amount must equal the on-chain order and not exceed the price on the agent card; the x402 client's spend cap is pinned to that exact amount. On credit the signed `buy_now` carries that amount, and the program refuses an order that asks another (P2; on devnet since the upgrade of 28 October 2026). | local: "quote is for a different amount"; paylater: `PriceMismatch` |
| A4 | A facilitator redirects or alters the payment. | Enforced | Not possible: the buyer's signature fixes recipient, amount and mint. The worst a facilitator can do is refuse. | by construction |
| A5 | A facilitator is down or censors. | Mitigated | Every quote offers one option per reachable facilitator; a wallet can also fund the vault directly. | devnet: both quoted on every order |
| A6 | Someone claims an order was paid when it was not. | Enforced | `confirm_funded` only reads the vault balance. | local: "confirming an order nobody paid" → `VaultUnderfunded` |
| A7 | Overpayment is kept by the merchant. | Enforced | The merchant is owed at most the price; any excess returns to the buyer on every outcome. | local: "an overpayment comes back with the refund" |
| A8 | Paying into an order that was already cancelled, or into a cancelled order's id that the merchant reopened for itself (B16). | Enforced | The vault is closed on cancel and the order stays as a `Cancelled` tombstone until `close_order`, so the id cannot be reopened. | local: tombstone checks |
| A9 | Someone watching the chain calls the website's delivery endpoint for an order another wallet paid for (D6). | Enforced | The endpoint requires the claim handed to whoever requested the quote. | server |
| A10 | Someone pays over HTTP 402 for an order quoted to another wallet, to receive what it asked for (D7). | Enforced | The x402 payment must be signed by the order's buyer. | server |

## B. Escrow logic

| # | Attack | Status | Defence | Test |
|---|---|---|---|---|
| B1 | The merchant takes the money before the hold ends. | Enforced | `release` by anyone but the buyer requires `now ≥ release_at`. | local: `HoldNotElapsed` |
| B2 | The merchant shortens a hold the buyer asked for. | Enforced | `min_hold_secs` can only lengthen the hold; it is stored on the order and checked by the buyer before paying. | local: "the merchant cannot shorten a hold the buyer asked for" |
| B3 | A stranger marks an order delivered, refunds it, disputes it, or cancels it. | Enforced | Each instruction checks the signer against the order's parties. | local: `NotAParty`, `Unauthorized` |
| B4 | The merchant never delivers and keeps the buyer waiting. | Enforced | After the delivery deadline anyone may refund the buyer; the merchant takes a 10% penalty. Before the deadline only the merchant may refund, without a penalty, so a merchant that cannot deliver can back out cleanly. | local: "merchant never delivered" |
| B5 | The merchant delivers after the deadline to dodge the penalty. | Enforced | `deliver` fails with `DeliveryWindowClosed`. | local |
| B6 | The buyer disputes after the hold has ended, to claw back a settled payment. | Enforced | `open_dispute` requires `now < release_at`. | local: `DisputeWindowClosed` |
| B7 | The merchant releases an order that is in dispute. | Enforced | State check. | local: `InvalidState` |
| B8 | A stranger resolves a dispute, or the config authority appoints a friendly arbiter mid-dispute. | Enforced | Only the arbiter recorded on the order when it was opened may resolve it. | local: `Unauthorized` |
| B9 | The first caller after deployment takes over the config. | Enforced | `initialize` requires the program's upgrade authority, checked against ProgramData. | local |
| B10 | The same wallet is buyer and merchant, to review itself. | Enforced | Rejected (two mutable aliases of one credit file). | local |
| B11 | Abandoned quotes lock the rent payer's SOL. | Enforced | Either party may cancel any time; the rent payer after the payment window. Settled orders close after the review window. | local |
| B12 | Substituting a token account, mint, vault or credit file the attacker controls. | Enforced | Order, agents and pair by seeds; vault as the order's associated token account; payout accounts by owner and mint. | by construction |
| B13 | A stranger opens orders in an honest merchant's name, funds them and lets them expire, so every missed delivery penalises the merchant. | Enforced | `open_order` requires the merchant's signature. | local: `AccountNotSigner` |
| B14 | The arbiter never answers, and the money stays locked. | Enforced | Once the complaint period has passed since the hold would have ended, anyone may split the vault evenly. An even split penalises nobody. | local: before the deadline `Unauthorized`, any other split `InvalidParams` |
| B15 | A party closes its own token account to stall a release or a refund. | Mitigated | Anyone may recreate an associated token account; the agents' settle transactions do so first. The program still requires the account. | none |

## C. Reputation, sybils and farming

| # | Attack | Status | Defence | Test |
|---|---|---|---|---|
| C1 | **Wash trading** with one sock puppet to pump History. | Enforced | One counterparty can grant at most the pair cap times its tier weight. | local: "$15 of wash trades… can never earn more than the $1 pair cap"; formula |
| C2 | **A ring** of the attacker's own wallets. | Mitigated | New wallets count for 10%, each pair is capped, and Trusted needs 30 active periods. Rings of 3 and 6 never reach Trusted in a simulated year; larger ones do, at a cost of hundreds to a few thousand dollars in fees and one to three months, and can then take back about those fees plus the base. See [SCORING.md](SCORING.md#what-faking-it-costs). | model |
| C3 | **Burst farming** just before a scam. | Enforced | Tenure counts active periods; tiers are gated on them. Full evidence in one day does not reach Building. | formula |
| C4 | **Aged wallets**: create wallets, wait, then use them. | Enforced | Age counts only up to three periods per active period. | formula |
| C5 | **Exit scam** on instant settlement: earn Trusted, take orders, deliver nothing. | Enforced | Instant volume buyers have not accepted is capped at fees paid plus a base; a complaint locks that amount for good (C21). A ring of 8 or more wallets does recover its fees plus the base per wallet, so it nets about $25 a wallet after a month or more. | local: "a complaint locks the instant limit"; formula |
| C6 | **Friendly fraud**: the buyer got the goods and disputes anyway. | Enforced | The merchant committed a delivery hash on-chain before the dispute; the pair's history is on record for the arbiter. Losing costs the buyer 25%, removes Trusted, and ends pair trust for good. | local: "arbiter: buyer was wrong"; devnet; on the new escrow, 28 Oct: charlie disputed two valid deliveries from atlas, and the arbiter resolved both for atlas ([resolve tx](https://explorer.solana.com/tx/3DeAoBaQGHWe8djQ7Urr2rjyDXaU7DyEP8XQeinwZPt91F74umXbMLBt8AXS8V1Zb6omjPWvCrUXfCnw2o4tPfYo?cluster=devnet), [resolve tx](https://explorer.solana.com/tx/2NWncCem6Nv8ee6q2aLX2UoSyKCu9qSxwZgsoG8jUCp4kdddfTH4SJUKRT1UiWh8FFhzk5s4EBqMPuwuPey5skjk?cluster=devnet)) |
| C7 | **Fake praise** from wallets that bought nothing. | Enforced | Only a party to a settled order can review it, once; weight is the volume that settled. | local: `NotAParty`, `already in use` |
| C8 | **Buy-and-refund** to mint reviews for free. | Enforced | A review of a refunded order weighs 0. | local; formula |
| C9 | **Review bombing** a competitor with bots. | Enforced | Priced like fake praise: a 1-star counts only after a real, settled purchase, weighted by that volume and the reviewer's tier, capped per pair. A merchant's review counts only once the buyer has reviewed the same order (C17). | formula |
| C10 | **One whale customer** makes a merchant look established. | Enforced | The pair cap again: $50,000 from one Trusted buyer earns exactly the $500 cap. | formula |
| C11 | **Dust**: thousands of tiny orders to fake Diversity. | Enforced | A counterparty counts only once the pair has moved a tenth of the pair cap. | local (model equality) |
| C12 | **Whitewashing**: abandon a penalised wallet for a fresh one. | Mitigated | A fresh wallet starts at 0 with the longest hold and no instant limit. Linking wallets to one operator needs attestations (open). | none |
| C13 | **Retaliation and reciprocity** in two-sided reviews. | Open | Reviews are public as they land. Commit–reveal would fix it; not built. | none |
| C14 | **A lazy victim** never rates an instant order it was cheated on. | Mitigated | The amount frees after the review window. Buyer agents built with the SDK rate automatically when a delivery fails its hash check. | none |
| C15 | A site or API shows a fake score. | Enforced | The score is recomputable from public accounts; the website does so in the browser and shows both numbers. | site |
| C16 | **Borrowed reputation**: a merchant names a Trusted wallet as the buyer and funds the order itself. The buyer never signs `open_order`, and anyone can fund a vault. | Enforced | The buyer's credit is granted at release; the merchant's credit, Diversity and active period only when the buyer reviews the order. Money moves without the buyer; reputation does not. | local: step 12; formula |
| C17 | **Review bombing through forged orders**: the same merchant rates that buyer one star. | Enforced | A merchant's review of a released order weighs 0 until the buyer has reviewed it. | local: step 12; formula |
| C18 | **Retaliation by the loser of a dispute**: it rates the other side one star, with the full weight of the order. | Enforced | The side that received less than half of the price in a dispute gets no weight on its review. | local: step 5; formula |

## D. Agents and servers

| # | Attack | Status | Defence |
|---|---|---|---|
| D1 | Rent-drain: flooding a merchant with quotes it pays rent for. | Mitigated | At most 3 unpaid orders per buyer wallet and 40 per merchant, and 20 order-opening requests per client per minute. The server cancels unpaid quotes after the payment window, including ones from before a restart, and the order rent returns. Residual: each invented buyer address still leaves a credit file and a pair account whose rent does not come back; one client may have credit files made for at most 10 new wallets an hour (`MAX_NEW_WALLETS_PER_HOUR`), and the server opens no quote while its ops wallet holds less than 0.03 SOL (`QUOTE_SOL_FLOOR_LAMPORTS`), so a drain stops short of the fees that settle what is open. Behind a tunnel or proxy set `TRUST_PROXY` so the limit sees real clients. |
| D2 | Prompt injection through a service's output tells a buyer agent to pay someone. | Mitigated | The payment path is code, not prompt: it pays only an on-chain-verified escrow, for the advertised price, once. A budget per day and per merchant is not built. |
| D3 | A stolen merchant-server key. | Mitigated | It fronts rent and cranks permissionless steps. It cannot move escrow or act as a party. |
| D4 | A restart loses orders in flight. | Enforced | Quotes and delivery results are kept on disk and reloaded; on start the server also rebuilds its work list from the chain and refunds anything it was paid for but can no longer deliver. A Railway volume at `/app/.data` is required; without it the server refuses new orders. The hosted demo (Render free tier) runs with `TESSERA_ALLOW_EPHEMERAL_STATE=1` and no disk. After a sleep or restart its open quotes and dispute evidence are gone. Money on chain is not: late orders are refunded or cancelled, and a dispute with no record is split evenly. |
| D5 | A lying RPC fakes the reads verification depends on. | Open | Use a trusted RPC or cross-check two. |
| D6 | A watcher collects a delivery from the website's endpoint that another wallet paid for. The real buyer gets nothing and then loses the dispute, because the delivery matched its hash. | Enforced | Only the requester of the quote holds its claim, and the endpoint requires it. |
| D7 | Someone pays over plain HTTP 402 for an order quoted to another wallet. | Enforced | The signer of the x402 payment must be the order's buyer. |
| D8 | The arbiter's evidence is lost in a restart, so every later dispute goes to the buyer. | Enforced | Each delivery is written to `.data/deliveries.jsonl` before its hash goes on-chain and is read back on start. With no record the arbiter splits evenly. The hosted demo (Render free tier) runs with `TESSERA_ALLOW_EPHEMERAL_STATE=1` and no disk, so a dispute over a delivery made before a sleep or restart finds no record and is split evenly. |
| D10 | A compromised or lying Tessera API hands an agent a transaction that pays someone else. | Mitigated | The API is non-custodial: it holds no keys and cannot move money by itself, but an agent signs what it is given. The CLI takes the order from the user, checks it on-chain itself, and refuses anything but the Tessera, SPL Token, associated-token and compute-budget programs, any extra signer or lookup table, and any token transfer except the order's amount into the escrow vault it derives itself (tested against a fake API in `npm run test:doors`). SKILL.md tells agents to check `signers`, `transfers` and `simulation`. Other clients must do the same. |
| D11 | Flooding the API with requests that simulate transactions. | Mitigated | Per-client limits per minute: 120 reads, 30 builds, 20 submits, keyed by IPv4 address or IPv6 /64 in a bounded table. The hosted MCP server is limited per client and passes each client's key to the API with a shared secret (`TESSERA_RELAY_SECRET`), so its users do not share one allowance. On Railway one proxy hop is trusted automatically; elsewhere set `TRUST_PROXY`. |
| D12 | A merchant buys a top spot in `find_merchants`. | Mitigated | The rank uses only on-chain data, the same as the score, so faking it costs what faking the score costs (C1 to C3: settled volume, fees and time; large rings stay open, C2). Self-declared card text only decides whether a merchant matches a need and its price, never its rank. |
| D13 | A merchant's card or a review carries instructions for the reading agent (prompt injection). | Mitigated | Card and review text is cut short and stripped of control, bidirectional, invisible and Unicode tag characters, and every `find_merchants` reply says that `name`, `service` and review text are data, not instructions; SKILL.md and the MCP server's instructions say the same. An agent that obeys text it reads can still be misled. |
| D14 | A merchant points its `uri` at an internal address so the API fetches it (SSRF). | Enforced | Cards are fetched with http(s) only, no redirects, one 1.5 s wall-clock deadline and a 64 KB cap, and never from a private, loopback, link-local, carrier-grade or reserved address, including IPv6 forms that embed an IPv4 address, checked on the address the socket connects to. Private cards are allowed only with `TESSERA_ALLOW_PRIVATE_CARDS=1`, never because of `HOST`. Tested in `npm run test:doors`. |
| D15 | A copycat's card claims another merchant's services or wallet. | Enforced | A card whose Tessera extension names a different wallet is ignored; the row keeps the copycat's own on-chain record. Tested in `npm run test:doors`. |
| D9 | Draining the demo faucet with invented wallets. | Mitigated | Once per wallet, 3 per client per hour, 20 per hour in total, and never below 0.1 SOL left in the ops wallet (`FAUCET_SOL_FLOOR_LAMPORTS`), which also fronts quote rent and pays settlement fees: below that the faucet answers 503 and says why. Devnet only; a real deployment has no faucet. |

## R. Review rewards

The rebate run in [REWARDS.md](REWARDS.md). It is off-chain; the program is unchanged.

| # | Attack | Status | Defence |
|---|---|---|---|
| R1 | Trade with your own wallets to farm review rewards. | Enforced | A reward is at most 37.5% of its order's fee per side, so 75% for both: farming always loses at least a quarter of every fee, and New wallets count for 10%. Tested for every tier and size in `rewards.test.ts`; `npm run demo:rewards` checks a real payout stays under 75% of the fees. |
| R2 | A merchant pays buyers for 5-star reviews. | Enforced | The base pay ignores the stars, and a 4-5 star review of a wallet that then loses a dispute or misses a delivery is paid nothing; an honest warning is paid 1.5x. Shown on chain in `npm run demo:rewards`. |
| R3 | Reviewers herd to the consensus instead of rating what they got. | Mitigated | Agreeing pays only 1.2x against 1x, the consensus is weighted by money, and what actually happened next overrides it. |
| R4 | The operator pays itself, or pays differently from the rules. | Mitigated | Each payout file holds every input; `npm run rewards -- --verify` recomputes it, and the transfers are on chain. The operator can still refuse to pay; an on-chain claim is the next step. |
| R5 | A review is first seen after its subject already failed, and gets paid for "predicting" it. | Enforced | Failures are counted from the moment the rebate run first saw the review; a review first seen more than `lateSightSecs` after it was written is judged on consensus only. |

## What "sybil-resistant" means here, and what it does not

Tessera does not claim to be sybil-proof. Cheng and Friedman showed in 2005 ("Sybilproof reputation
mechanisms", ACM SIGCOMM P2PECON workshop) that no reputation function that treats every node the same
way can be. Tessera's score is such a function: it has no trusted seed and no notion of "my" view of
the graph. An attacker with enough wallets, money and time can reach any tier.

What the design does instead:

1. **It puts a price on the attack.** A fake record costs protocol fees that never come back and time
   that cannot be compressed. The numbers are in [SCORING.md](SCORING.md#what-faking-it-costs).
2. **It bounds the prize.** A faked Trusted merchant can take without a hold only what it already paid
   in fees, plus a small base (C5). Everything else still sits in escrow, where a buyer can dispute it.
3. **It keeps the damage local.** A penalty lands on the wallet that earned it, and a pair that had a
   dispute never gets pair trust back.

The ERC-8004 authors make the same admission about their Reputation Registry ("Sybil attacks are
possible, inflating the reputation of fake agents"). How Tessera plugs into that registry on Solana is
in [ERC-8004.md](ERC-8004.md).

## E. The Agent Registry bridge

| # | Attack | Status | Defence |
|---|---|---|---|
| E1 | Someone posts registry feedback that claims to be a Tessera review. | Enforced | A mirrored entry names a Tessera review account. A reader checks that the account exists, is owned by the program, and matches the reviewer, the subject and the rating. The program only creates it for a party to a settled order. `npm run registry -- --verify` does this check for every mirrored entry. |
| E2 | A merchant points its registry identity at someone else's credit file. | Enforced | The link is two-way. The registry asset's agent wallet must be the wallet whose credit file it names; setting that wallet needs its signature. |
| E3 | The registry, its indexer or the script is wrong or offline. | Enforced | Nothing in the score or the escrow reads the registry. The bridge is one-way and optional. |

## Still open before any real money

- The **upgrade authority** is one key. Whoever holds it can replace the program and drain every vault.
  It needs a multisig with a timelock, and after an audit, possibly no authority at all.
- The **arbiter** is one key and, in the demo, a bot that checks a hash. It needs a real process:
  a multisig or juror set and a response deadline. The fallback if it goes silent exists (B14), but
  an even split is a blunt answer.
- **Live parameters reach open orders.** The fee, arbiter and hold are snapshotted per order, but the
  delivery, review and complaint windows, the instant base and the hold past the instant limit are
  read from the config when used, so a config change can move them for orders already open.
- **Order ids can be reused** once a settled or cancelled order account is closed. Reviews are keyed by
  the order's address, so a reused id cannot be reviewed again, and the buyer's SDK refuses an id that
  already has a review. Merchants pick random ids, so this only bites a merchant that reuses its own.
- **Rate limits and the card cache are per process.** Several API or agents instances multiply them.
- **Quote caps are per client address.** One host with many IPv4 addresses, or a whole IPv6 range, can use up
  a merchant's open-quote cap and block quoting for others. The operator also pays non-refundable rent for the
  credit files of buyer wallets an attacker names (about 0.0035 SOL each); on devnet that costs nothing, on
  mainnet it needs a funded-buyer requirement or a deposit.
- **A review of 1 or 2 stars still counts towards pair history.** Two complaints from one buyer can make a
  pair trusted and waive that buyer's hold.
- **Review accounts are keyed by order and reviewer.** Reusing an order id after it is closed can stop the
  earlier buyer reviewing the new order; the buyer's SDK refuses such an id, other clients may not.
- **Unsolicited orders still touch a buyer's file.** A merchant can still open and fund an order in
  any buyer's name. The buyer gains credit and an active period from it, and its order count rises,
  but nobody gains anything from the buyer (C16, C17).
- **No audit.** The test suite is thorough for a hackathon and is not a substitute.
- **Commit–reveal reviews** (C13), **operator attestations** against whitewashing and large rings
  (C2, C12), and **agent spend budgets** (D2).
- The devnet **parameters** are compressed and have not been tuned against real traffic.
