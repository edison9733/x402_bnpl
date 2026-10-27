# Pay later for agents

A second Solana program, [`programs/tessera-paylater`](../programs/tessera-paylater), lets an agent buy
now and pay later. Its credit limit comes from the agent's Tessera score, and the purchase itself goes
through the Tessera escrow: the pool pays the buyer's escrow order, so a purchase on credit is
protected exactly like one the buyer paid for. The escrow program is not changed: pay-later only reads
its accounts and pays into its vaults, and its built binary is identical with or without this program
in the workspace.

**Status.** It runs and is tested on a local validator next to the real escrow program, end to end
through the merchant server's x402 route. It is not deployed to devnet yet (the deploy needs devnet
SOL). Its program id, from the keypair the build generates, is
`LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D` (`Anchor.toml`, `declare_id!`, the generated SDK).

## How it works

1. **The merchant quotes.** As for any purchase, the merchant opens an escrow order in the buyer's
   name and quotes the order account as the x402 `payTo`. Where the pool exists on its network, the
   402 also says what the pool would do for this buyer: one more `accepts` entry, scheme
   `tessera-paylater`, after the standard `exact` ones (see [Over x402](#over-x402)). A standard
   x402 client never sees a difference.
2. **Buy now.** Instead of paying, the buyer signs `buy_now` for that order. The pool transfers the
   full price from its vault into the order's vault, which is the same plain token transfer an x402
   payment is, and in the same instruction calls the escrow's permissionless `confirm_funded`, which
   reads the vault and marks the order Funded. There is no moment in which the pool's money sits in an
   order still awaiting payment, so the buyer can never cancel the quote (`cancel_unpaid`, which hands
   the vault to the buyer) and keep the money; a transaction that tries fails whole. The program checks that the
   order is the real one (owned by the escrow program, at the address its id derives), that it was
   opened for this buyer by this merchant in this mint, that it is still awaiting payment inside its
   payment window, and that its vault does not already hold the price. The price and the request hash
   are read from the order, not from the caller. The buyer's tier and score are recomputed live from
   its Tessera credit file, the merchant must be at Building or above, and the price must fit inside
   the buyer's remaining limit. The buyer pays the loan account's rent and nothing else.
3. **The escrow does the rest.** The merchant delivers, the hold runs, and the escrow pays the merchant
   the price minus its own fee (1%). The buyer can dispute; a merchant that never delivers is refunded
   against, as usual. The pool charges the merchant nothing.
4. **Pay later.** `repay` moves the price plus the pool's fee (2% under the preview rules) into the
   pool. No interest. Anyone may repay for the buyer. The pool books the fee when it is repaid, not
   when the loan opens, so the pool's vault holds what was deposited, minus what was withdrawn and
   lent, plus what was repaid and the fees earned. Only the price counts against the limit; the fee
   is owed on top. Repaying on time raises the limit, in proportion to the size of the loan.
5. **Or run a tab.** An agent can buy several things, each inside its remaining limit, and settle
   every loan it still owes in one transaction (`tessera repay --all`). Each loan keeps its own due
   date, so the earliest one sets when the tab must be paid.
6. **Or default.** Once the due date and a grace period have passed, anyone may call `mark_default`.
   The line freezes at 0 for good. The debt stays on the record and can still be repaid, as late.
   The agents server runs this as a keeper: every `KEEPER_MS` (30 s by default) it reads the pool's
   open loans and marks every one past its grace period, with its ops key, at most 20 per pass.
7. **If the escrow refunds instead.** When the merchant never delivers, refunds, or a dispute goes
   the buyer's way, the escrow sends the money to the buyer's token account, not
   back to the pool, and the loan is still owed: the buyer repays out of the refund. A buyer that
   keeps the refund defaults like any other.

Each loan records the order it funded (`loan.order`), the price (`amount`), the fee, its due date and
the moment it can be marked in default.

## Over x402

A merchant agent whose network has the pool offers it in every quote. Its 402 (`apps/agents`, the
`/agents/:id/x402/:skill` route and the A2A `x402.payment.required`) keeps its `exact` entries first
and adds one with scheme `tessera-paylater`: same order as `payTo`, same price and asset, and in
`extra` the program, the pool, the merchant's ops wallet as `feePayer`, the buyer's live `buyerLimit`
and `buyerOutstanding`, the `fee` on this price, the `termSecs`, and `eligible` (false, with a
`reason`, when the program would refuse: the line is frozen by a default, the buyer has no credit
yet, the price is above its remaining limit or below the pool's minimum, the merchant's tier is too
low, or the pool cannot cover it). The same facts sit under `extensions.tessera.payLater`. The pool
is read at most every 20 s, by every merchant the server runs.

To pay that way the buyer builds one `buy_now` for the quoted order with the merchant's wallet as
fee payer, signs it, and sends it as `payload.transaction` (base64) in `PAYMENT-SIGNATURE` or the
A2A payload: `{ "x402Version": 2, "accepted": <that entry>, "payload": { "transaction": "<base64>" } }`.
The merchant is its own facilitator: it checks the transaction is exactly that (legacy or version 0,
no lookup tables, its own wallet as fee payer, the buyer as the only other signer with its signature
present, no instruction other than compute-budget settings, at most one unit limit of at most
`BUY_NOW_COMPUTE_UNITS` (400,000) and one unit price of at most 1,000,000 micro-lamports, followed by
one `buy_now` of this program whose every account is the one this order derives: its vault, buyer,
merchant and mint, the loan its loan id derives, the pool, the line, the escrow program and config,
both credit files), simulates it, signs as fee payer and sends it. When it lands the order is already
Funded, and the merchant delivers. The buyer pays the rent of its loan account (and, on its first
purchase, its credit line); the merchant pays the network fee, at most the base fee plus 0.0004 SOL
of priority fee. A forged transaction is refused before anything is signed
(HTTP 400 with no "do not pay again" note, `INVALID_PAYLOAD` over A2A), and the buyer may pay another
way. [docs/A2A-EXTENSION.md](A2A-EXTENSION.md) has the exact shapes.

- `npm run buy -- --buyer scout --merchant atlas --pay-later` buys over A2A on credit, and
  `npm run buy:http -w @tessera/agents -- --pay-later` over plain HTTP; both log the loan and the due date.
- `tessera buy-later <merchant agent url> <skill> [--input JSON] --keypair PATH` runs the whole HTTP
  flow from the CLI. It caps the price at what the merchant's agent card advertises, reads the order
  from the chain and checks it is the one it asked for, and signs only one `buy_now` for it.
- `tessera credit <wallet>` shows the limit, what is owed, and each loan's due date; `tessera repay --all` settles the tab.

## The limit

```
limit = tier_limit[tier] × score ÷ 1000 × (1 + boost)
boost = min(sum over loans repaid on time of step × min(amount, tier_limit[tier at open]) ÷ tier_limit[tier at open], max boost)
```

- The boost grows with what was repaid, not how often: a loan the size of the limit of the tier it
  opened at adds a whole step, a loan of a hundredth of it a hundredth of a step. Counting repayments
  would let a run of the smallest loans the pool finances double a limit for a few cents in fees.

- `tier` and `score` are the buyer's **live** Tessera tier and score, recomputed by the program from
  the buyer's credit file with the escrow's own formula ([`score.rs`](../programs/tessera/src/score.rs)).
  A stale cached score is never used.
- A **New** wallet gets nothing: the program refuses rules where `tier_limit[New]` is not 0.
- Any default sets the limit to 0.
- What the buyer still owes in principal counts against the limit.
- The program ([`credit.rs`](../programs/tessera-paylater/src/credit.rs)) and the SDK
  ([`limit.ts`](../packages/sdk/src/paylater/limit.ts)) compute the same number. The test checks they agree.

Preview rules (`PREVIEW_LINE_PARAMS`), in test USDC:

| | New | Building | Established | Trusted |
|---|---|---|---|---|
| Limit at a perfect score | 0 | 2 | 5 | 10 |

A loan the size of the tier limit, repaid on time, adds 25%, a smaller one its share of that, up to double. The loan term is 60 seconds and the grace period 5 seconds, so a whole cycle can be watched.
The pool only funds orders from merchants at **Building** or above, and nothing below 0.001 USDC.

## Checks

`npm run test:paylater` (**84 / 84**, run on 27 October 2026; also 84 / 84 with `ESCROW_SO` set to the escrow bytes dumped from devnet) starts a local validator with both
programs. Wallets earn their tiers through real escrow orders, then every purchase on credit goes
merchant `open_order` → buyer `buy_now` (the pool pays the vault and the escrow confirms the order, in one
instruction) → `deliver` → `release`:

- a New wallet, a wallet with no credit file, a New merchant, self-dealing and an amount below the pool's minimum are all refused;
- so are an order opened for another buyer, a merchant other than the one that opened the order, the wrong mint, an account the escrow program does not own or a credit file passed as the order, an order the buyer already paid, one already confirmed funded, and a quote past its payment window;
- a buyer that sends `buy_now` and `cancel_unpaid` for the same quote in one transaction (sent with no preflight) has it land and fail whole: the pool keeps its money, the buyer gets none, and no loan or line is opened;
- a tiered buyer buys: the pool pays the full price into the order's vault and the buyer pays nothing, the order is Funded by the same instruction, so a `cancel_unpaid` by the buyer and a second `confirm_funded` are refused and the money stays in the vault; the loan records the order, the price and the request hash, the escrow pays the merchant the price minus its 1% fee, the loan snapshot matches the buyer's live score, and the limit matches the off-chain formula;
- spending past the limit, repaying twice, marking a default early or during the grace period, and a stranger taking a repaid loan's rent are all refused;
- a repayment is the price plus the 2% fee, the pool books the fee at repayment, an on-time repayment raises the boost by the step scaled by the loan's share of the tier limit, exactly as the SDK computes it, and the program applies it: a purchase above the old limit goes through and one unit more is refused;
- five loans of the pool's minimum, repaid on time, count as five on-time repayments but move the limit by less than 0.1%, and one loan the size of the tier limit adds a whole step (a quarter of the unboosted limit);
- a buyer runs a tab of three purchases (the first built by the SDK's `buyOrderOnCredit`, one instruction), the chain lists all three as owed with the fee on each, and one transaction settles them;
- a buyer who never repays is marked in default by a stranger, the line freezes, and a late repayment, also price plus fee, clears the debt but not the default;
- each loan keeps the grace period it opened with: cutting it to 0 in the rules does not let anyone mark an open loan early, and an unpaid loan cannot be closed;
- a merchant never delivers: a stranger has the escrow refund the buyer, the pool gets nothing back, the loan is still open and owed, and the buyer repays it out of the refund;
- the pool's balance equals deposits minus withdrawals minus what it lent, plus repayments, plus the fees earned at repayment;
- every `buy_now` logs the compute units it used (about 100,000 to 125,000), and `BUY_NOW_COMPUTE_UNITS` (400,000) leaves at least 30% spare;
- only the authority can create the pool, change its rules or withdraw, the rules can never give New wallets credit, a vault account created by someone else before the pool does not block it, and an empty pool refuses purchases.

`npm run test:paylater-402` (**58 / 58**) runs the merchant server on the same kind of validator and
buys through its HTTP 402 route: the 402 offers the order on credit after its exact entries with the
buyer's live limit; a tiered buyer hands over a signed `buy_now`, the merchant settles it and
delivers, the same header again returns the same delivery and opens no second loan; the CLI form and
the buyer agent over A2A do the same; `repay --all` clears the tab; a New wallet is told it is not
eligible and its forged header is refused by the program in simulation; a `buy_now` for another
order, one with the buyer as fee payer, one with an extra transfer of the merchant's SOL, one with a
`cancel_unpaid` after the `buy_now`, a unit limit above `BUY_NOW_COMPUTE_UNITS`, a second unit limit,
a priority fee above the cap, one naming another account as the escrow program, one the buyer never signed
and one with no transaction are each refused before anything is signed; the merchant's `buy_now`
shows the escrow's `confirm_funded` running inside it by CPI, within the compute budget; and the
server's keeper marks a loan in default a few seconds after its grace period ends, after which the
buyer's next 402 says the line is frozen.

## Try it

On a local validator, by hand:

```bash
npm run build:program
npm run codegen              # only after a build that changed an IDL
npm run paylater:local       # validator, both programs, tiered wallets, a funded pool, and a shop with open quotes; prints keypair paths
npm run tessera -- credit <alice> --rpc http://127.0.0.1:18999
npm run tessera -- buy-later --order <quote> --keypair <alice.json> --rpc http://127.0.0.1:18999 --send
npm run tessera -- repay <loan> --keypair <alice.json> --rpc http://127.0.0.1:18999 --send
npm run tessera -- repay --all --keypair <alice.json> --rpc http://127.0.0.1:18999 --send   # settle every loan still owed, at once
npm run tessera -- mark-default <loan> --keypair <stranger.json> --rpc http://127.0.0.1:18999 --send
```

`paylater:local` prints the escrow orders its shop has quoted for each buyer. `buy-later --order`
reads the order, checks what the program will check, and has the pool pay it, which confirms the
order in the same instruction; the shop in the script then delivers and, once the hold has run, is paid by the
escrow. The shop is part of the script, not the merchant server, so the 402 path is not in this
world: `npm run test:paylater-402` runs it, with the real server, from start to finish.

Over x402, once the program and the pool are on devnet (see the setup steps in the
[README](../README.md#pay-later-build-local-run-devnet)): `npm run agents`, then
`npm run buy -- --buyer scout --merchant atlas --pay-later`, `npm run tessera -- credit <scout>`, and
`npm run tessera -- repay --all --keypair .keys/scout.json --send`.

## Limits

- **Not on devnet yet.** The program is built and tested on a local validator only. The deploy, the
  pool's `initialize` and its first `deposit` have not been run on devnet, and there is no CLI
  command for the last two: `scripts/paylater-local.ts` sends them on the local validator, and a
  devnet script is to do. Until then the website shows the preview rules, labelled as such.
- **A refund goes to the buyer, not to the pool.** If the escrow refunds an order the pool paid for
  (the merchant never delivers, a late payment is cancelled, a dispute goes the buyer's way), the
  USDC lands in the buyer's token account and the loan is still owed. The buyer is expected to repay
  out of the refund; if it does not, the loan defaults like any other. Routing refunds to the pool
  would need the escrow to know about loans, which this version deliberately avoids.
- **A default does not lower the Tessera score.** The escrow program does not know about pay-later.
  A defaulter's line freezes, but its escrow tier stays. Feeding defaults back into the score needs a
  change to the escrow program, which this version deliberately does not make.
- **`eligible` is advice, not a promise.** The 402's `eligible` and `buyerLimit` are what the merchant
  read a moment ago; the program decides when the transaction runs, and a buyer whose line changed in
  between is refused in simulation, before anything is signed.
- **The merchant pays the network fee and must hold SOL.** On credit the merchant is the fee payer
  of the buyer's `buy_now`, so a merchant with no SOL cannot take a purchase on credit. The check in
  `checkBuyNowTransaction` is what keeps that from being abused: a transaction with any other
  instruction, signer or account, a unit limit above `BUY_NOW_COMPUTE_UNITS` or a priority fee above
  the cap is refused, so one purchase costs the merchant at most the base fee plus 0.0004 SOL.
- **Collusion.** A buyer and a merchant working together can take up to the buyer's limit once
  (the merchant refunds the order, or delivers and is paid), then the buyer's line freezes. A buyer
  alone cannot: the order the pool paid is Funded in the same instruction, so only the merchant's
  refund, a delivery it missed or a dispute can send the money to the buyer. The limit is only worth
  having after real settled trade with independent counterparties (see the farming costs in
  [SECURITY.md](SECURITY.md)), so the preview limits are kept small next to what a tier costs to earn.
- **The escrow on devnet is its first build.** `solana program dump` of
  `TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ` matches, byte for byte, a build of the first commit
  (`c6dbcd7`, deployed 4 October), not of `programs/tessera` today, and its upgrade key is lost. That
  build lets anyone open an order in a merchant's name. On devnet a buyer alone can therefore open an
  order with a Building merchant, have the pool pay it, and collect the escrow's refund once the
  merchant misses a delivery it never agreed to: the loan stays owed, and the merchant takes the
  missed-delivery penalty. The escrow in this repository has the merchant sign `open_order`, which
  closes that; on devnet, `buy_now` would have to require the merchant's signature itself.
- **The boost is earned at the tier a loan opened at.** A loan's share of a step is measured against
  the limit of the tier the buyer held when it opened, under the rules in force when it is repaid, so
  a step earned at Building counts in full at Trusted. Every loan still pays the pool fee and needs
  a merchant at Building or above.
- **One lender, one pool.** The pool is a single account (`["pool"]`); its authority funds it and
  alone can withdraw. There are no outside lenders, shares or interest for depositors.
- **The keeper is the demo server.** Anyone can call `mark_default`, but in this repository only the
  agents server does, and only while it runs. A loan past its grace period on a network where nothing
  runs the keeper stays open until someone calls it.
- **No instalments.** A loan is repaid in one payment. A tab of several loans can be settled together, but each loan is all or nothing.
- **Unaudited**, like the rest of the project.
