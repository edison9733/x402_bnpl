# Pay later for agents (preview)

A second Solana program, [`programs/tessera-paylater`](../programs/tessera-paylater), lets an agent buy
now and pay later. Its credit limit comes from the agent's Tessera score, and the purchase itself goes
through the Tessera escrow: the pool pays the buyer's escrow order, so a purchase on credit is
protected exactly like one the buyer paid for. The escrow program is not changed: pay-later only reads
its accounts and pays into its vaults, and its built binary is identical with or without this program
in the workspace.

**Status: preview.** It runs and is tested on a local validator next to the real escrow program. It
is not deployed to devnet. Its program id, from the keypair the build generates, is
`LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D` (`Anchor.toml`, `declare_id!`, the generated SDK).

## How it works

1. **The merchant quotes.** As for any purchase, the merchant opens an escrow order in the buyer's
   name and quotes the order account as the x402 `payTo`. Nothing about the quote says "on credit".
2. **Buy now.** Instead of paying, the buyer agent signs `buy_now` with that order. The pool transfers
   the full price into the order's vault, which is the same plain token transfer an x402 payment is,
   so the escrow's `confirm_funded` accepts it unchanged (the CLI sends both in one transaction).
   The program checks that the order is the real one (owned by the escrow program, at the address
   its id derives), that it was opened for this buyer by this merchant in this mint, that it is still
   awaiting payment inside its payment window, and that its vault does not already hold the price.
   The price and the request hash are read from the order, not from the caller.
3. **The escrow does the rest.** The merchant delivers, the hold runs, and the escrow pays the merchant
   the price minus its own fee (1%). The buyer can dispute; a merchant that never delivers is refunded
   against, as usual. The pool charges the merchant nothing.
4. **Pay later.** `repay` moves the price plus the pool's fee (2% in the preview rules) into the pool.
   No interest. Anyone may repay for the buyer. Repaying on time raises the limit. The pool books the
   fee when it is repaid, not when the loan opens.
5. **Or run a tab.** An agent can buy several things, each inside its remaining limit, and settle
   every loan it still owes in one transaction (`tessera repay --all`). Each loan keeps its own due
   date, so the earliest one sets when the tab must be paid.
6. **Or default.** Once the due date and a grace period have passed, anyone may call `mark_default`.
   The line freezes at 0 for good. The debt stays on the record and can still be repaid, as late.

Each loan records the order it funded (`loan.order`), the price (`amount`) and the fee. The price is
what counts against the buyer's limit; the fee is owed on top.

## The limit

```
limit = tier_limit[tier] × score ÷ 1000 × (1 + boost)
boost = min(on-time repayments × step, max boost)
```

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

Each on-time repayment adds 25%, up to double. The loan term is 60 seconds and the grace period 5 seconds, so a whole cycle can be watched.
The pool only funds orders from merchants at **Building** or above.

## Checks

`npm run test:paylater` (**72 / 72**) starts a local validator with both programs. Wallets earn their
tiers through real escrow orders, then every purchase on credit goes merchant `open_order` → buyer
`buy_now` → `confirm_funded` → `deliver` → `release`:

- a New wallet, a wallet with no credit file, a New merchant, self-dealing and an amount below the pool's minimum are all refused;
- so are an order opened for another buyer, a merchant other than the one that opened the order, the wrong mint, an account the escrow program does not own or a credit file passed as the order, an order the buyer already paid, one already confirmed funded, and a quote past its payment window;
- a tiered buyer buys: the pool pays the full price into the order's vault and the buyer pays nothing, the loan records the order, the price and the request hash, the escrow confirms the payment and pays the merchant the price minus its 1% fee, the loan snapshot matches the buyer's live score, and the limit matches the off-chain formula;
- spending past the limit, repaying twice, marking a default early or during the grace period, and a stranger taking a repaid loan's rent are all refused;
- a repayment is the price plus the 2% fee, the pool books the fee at repayment, an on-time repayment raises the limit by exactly 25%, and the program applies it: a purchase above the old limit goes through and one unit more is refused;
- a buyer runs a tab of three purchases (the first with `buy_now` and `confirm_funded` in one transaction), the chain lists all three as owed with the fee on each, and one transaction settles them;
- a buyer who never repays is marked in default by a stranger, the line freezes, and a late repayment, also price plus fee, clears the debt but not the default;
- each loan keeps the grace period it opened with: cutting it to 0 in the rules does not let anyone mark an open loan early, and an unpaid loan cannot be closed;
- a merchant never delivers: a stranger has the escrow refund the buyer, the pool gets nothing back, the loan is still open and owed, and the buyer repays it out of the refund;
- the pool's balance equals deposits minus withdrawals minus what it lent, plus repayments, plus the fees earned at repayment;
- only the authority can create the pool, change its rules or withdraw, the rules can never give New wallets credit, a vault account created by someone else before the pool does not block it, and an empty pool refuses purchases.

## Try it

```bash
npm run build:program
npm run paylater:local       # validator, both programs, tiered wallets, a funded pool, and a shop with open quotes; prints keypair paths
npm run tessera -- credit <alice> --rpc http://127.0.0.1:18999
npm run tessera -- buy-later --order <quote> --keypair <alice.json> --rpc http://127.0.0.1:18999 --send
npm run tessera -- repay <loan> --keypair <alice.json> --rpc http://127.0.0.1:18999 --send
npm run tessera -- repay --all --keypair <alice.json> --rpc http://127.0.0.1:18999 --send   # settle every loan still owed, at once
npm run tessera -- mark-default <loan> --keypair <stranger.json> --rpc http://127.0.0.1:18999 --send
```

`paylater:local` prints the escrow orders its shop has quoted for each buyer. `buy-later` reads the
order, checks what the program will check, has the pool pay it and confirms the order in the same
transaction; the shop in the script then delivers and, once the hold has run, is paid by the escrow.

## Limits

- **A refund goes to the buyer, not to the pool.** If the escrow refunds an order the pool paid for
  (the merchant never delivers, a late payment is cancelled, a dispute goes the buyer's way), the
  USDC lands in the buyer's token account and the loan is still owed. The buyer is expected to repay
  out of the refund; if it does not, the loan defaults like any other. Routing refunds to the pool
  would need the escrow to know about loans, which this preview deliberately avoids.
- **A default does not lower the Tessera score.** The escrow program does not know about pay-later.
  A defaulter's line freezes, but its escrow tier stays. Feeding defaults back into the score needs a
  change to the escrow program, which this preview deliberately does not make.
- **Collusion.** A buyer and a merchant working together can take up to the buyer's limit once,
  then the buyer's line freezes. Going through the escrow does not change that: the merchant still
  has to deliver something and wait out the hold. The limit is only worth having after real settled
  trade with independent counterparties (see the farming costs in [SECURITY.md](SECURITY.md)), so the
  preview limits are kept small next to what a tier costs to earn.
- **The boost counts repayments, not their size.** Small loans repaid at once raise the limit as
  much as large ones, up to the cap (double). Each still pays the pool fee and needs a merchant at
  Building or above.
- **One lender.** The pool's authority funds it and alone can withdraw. There are no outside lenders,
  shares or interest for depositors.
- **No instalments.** A loan is repaid in one payment. A tab of several loans can be settled together, but each loan is all or nothing.
- **Unaudited**, like the rest of the project.
