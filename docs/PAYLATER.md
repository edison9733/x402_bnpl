# Pay later for agents

A second Solana program, [`programs/tessera-paylater`](../programs/tessera-paylater), lets an agent buy
now and pay later. Its credit limit comes from the agent's Tessera score, and the purchase itself goes
through the Tessera escrow: the pool pays the buyer's escrow order, so a purchase on credit is
protected exactly like one the buyer paid for. The escrow program is not changed: pay-later only reads
its accounts and pays into its vaults, and its built binary is identical with or without this program
in the workspace.

**Status.** It is on devnet since 27 October 2026, and tested on a local validator next to the real
escrow program, end to end through the merchant server's x402 route. The source requires the order's
merchant's signature on `buy_now`; the build on devnet (`61196cc`) does not yet, until the next
upgrade (see [Limits](#limits)).

| | Devnet |
|---|---|
| Program | `LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D` (`Anchor.toml`, `declare_id!`, the generated SDK), deployed 27 October 2026 in slot 515513248 from commit `9d543b1`; upgraded the same day in slot 515711875 to the build of `61196cc` (transaction `ZsQ12niKDQnMijF1TE5czfHsjFcnNaZ2GB7U7TWb6pLAf3xCgyt2arCza7e9bTAAu7nBHcrzgYviUfn7GoScg5V`) |
| Upgrade and pool authority | `EoNCoL8tDGKpiyyycESkheuMPcQNpLJrAXqjQUCQCCY6` |
| Pool | `GNf8LpVeJ6ayrVMqABpU1nAHW9ZX7upC2aGqcumWF5Qq`, rules `DEVNET_LINE_PARAMS` (below) |
| Pool vault | `DK9angk2VJ43sUaUgJB9wpvDmjh4zroVj8zC2UYTXsgV`, 8 devnet USDC on 27 October, no loans yet |
| Escrow it lends into | `TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ`, config `DgwhgcXkhNwpouzppHdF7KNACA14U1JWPccFH5ZGeNE2` |

The same addresses, and the last deploy's slot, commit and transaction, are in
[`deployments/devnet.json`](../deployments/devnet.json). The first deploy was the build of `9d543b1`,
from before `buy_now` called the escrow's `confirm_funded` itself (step 2 below). The upgrade to
`61196cc` replaced it the same day: the first 401,520 bytes of the program dumped from devnet hash
the same as a local build of that commit (sha256 `69b91a7d…62d6`), and the rest is zero padding. The
pool account's layout is the same in both builds, so the pool kept its rules and its 8 USDC.

## How it works

1. **The merchant quotes.** As for any purchase, the merchant opens an escrow order in the buyer's
   name and quotes the order account as the x402 `payTo`. Where the pool exists on its network, the
   402 also says what the pool would do for this buyer: one more `accepts` entry, scheme
   `tessera-paylater`, after the standard `exact` ones (see [Over x402](#over-x402)). A standard
   x402 client never sees a difference.
2. **Buy now.** Instead of paying, the buyer signs `buy_now` for that order, and so does the order's
   merchant: `buy_now` requires both signatures, so the pool only ever pays an order its merchant
   agreed to be paid this way (over x402 the merchant's server adds its signature; see
   [Over x402](#over-x402)). The pool transfers the
   full price from its vault into the order's vault, which is the same plain token transfer an x402
   payment is, and in the same instruction calls the escrow's permissionless `confirm_funded`, which
   reads the vault and marks the order Funded. There is no moment in which the pool's money sits in an
   order still awaiting payment, so the buyer can never cancel the quote (`cancel_unpaid`, which hands
   the vault to the buyer) and keep the money; a transaction that tries fails whole. The program checks that the
   order is the real one (owned by the escrow program, at the address its id derives), that it was
   opened for this buyer by this merchant in this mint, that this merchant signed, that it is still awaiting payment inside its
   payment window, and that its vault does not already hold the price. The price and the request hash
   are read from the order, not from the caller. The buyer's tier and score are recomputed live from
   its Tessera credit file, the merchant must be at Building or above, and the price must fit inside
   the buyer's remaining limit. The buyer pays the rent of the loan account and, on its first
   purchase, of its credit line (0.00181864 and 0.00118364 SOL on devnet, so 0.00300228 SOL for a
   first purchase; 0.00249168 and 0.00162168 SOL on a local validator), and nothing else. The loan's
   rent comes back when the repaid loan is closed; the line stays.
3. **The escrow does the rest.** The merchant delivers, the hold runs, and the escrow pays the merchant
   the price minus its own fee (1%). The buyer can dispute; a merchant that never delivers is refunded
   against, as usual. The pool charges the merchant nothing.
4. **Pay later.** `repay` moves the price plus the pool's fee (2%, on devnet and in the preview) into
   the pool. No interest. Anyone may repay for the buyer. The pool books the fee when it is repaid, not
   when the loan opens, so the pool's vault holds what was deposited, minus what was withdrawn and
   lent, plus what was repaid and the fees earned. Only the price counts against the limit; the fee
   is owed on top. Repaying on time raises the limit in proportion to the size of the loan: a loan
   the size of the tier limit adds a whole step (2,500 bps, a quarter of the unboosted limit), a
   loan of a tenth of it a tenth of a step, up to a cap (10,000 bps, double). See [The limit](#the-limit).
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
fee payer and the order's merchant as a signer, signs it, and sends it as `payload.transaction`
(base64) in `PAYMENT-SIGNATURE` or the A2A payload:
`{ "x402Version": 2, "accepted": <that entry>, "payload": { "transaction": "<base64>" } }`. The fee
payer's and the merchant's signatures are left empty: the merchant adds them.
The merchant is its own facilitator: it checks the transaction is exactly that (legacy or version 0,
no lookup tables, its own wallet as fee payer, the buyer and the order's merchant as the only other
signers, the merchant read-only (or the fee payer itself, when a merchant pays its own fees), the
buyer's signature present and no other signature, no instruction other than compute-budget settings, at most one unit limit of at most
`BUY_NOW_COMPUTE_UNITS` (400,000) and one unit price of at most 1,000,000 micro-lamports, followed by
one `buy_now` of this program whose every account is the one this order derives: its vault, buyer,
merchant and mint, the loan its loan id derives, the pool, the line, the escrow program and config,
both credit files), and only then signs it, with its ops wallet as fee payer and with the merchant's
own key, for an order of that merchant only; it simulates it and sends it. Because the merchant's own
key signs, nothing may ride along in the transaction, which is why the check allows nothing but the
`buy_now` and the compute-budget settings. When it lands the order is already
Funded, and the merchant delivers. The buyer pays the rent of its loan account (and, on its first
purchase, its credit line); the merchant pays the network fee, at most the base fee plus 0.0004 SOL
of priority fee. A forged transaction is refused before anything is signed
(HTTP 400 with no "do not pay again" note, `INVALID_PAYLOAD` over A2A), and the buyer may pay another
way. [docs/A2A-EXTENSION.md](A2A-EXTENSION.md) has the exact shapes.

- `npm run buy -- --buyer scout --merchant atlas --pay-later` buys over A2A on credit, and
  `npm run buy:http -w @tessera/agents -- --pay-later` over plain HTTP; both log the loan and the due date.
- `tessera buy-later <merchant agent url> <skill> [--input JSON] --keypair PATH` runs the whole HTTP
  flow from the CLI. It caps the price at what the merchant's agent card advertises, reads the order
  from the chain and checks it is the one it asked for, and signs only one `buy_now` for it, which the
  merchant completes with its own signatures and sends.
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

The rules, in the SDK next to each other (`packages/sdk/src/paylater/limit.ts`). They differ only in
time:

| | Devnet pool (`DEVNET_LINE_PARAMS`) | Local preview (`PREVIEW_LINE_PARAMS`) |
|---|---|---|
| Where | the pool on devnet | `npm run paylater:local`, `npm run test:paylater`, `npm run test:paylater-402`, and the website on a network with no pool |
| Limit at a perfect score, New / Building / Established / Trusted | 0 / 2 / 5 / 10 devnet USDC | 0 / 2 / 5 / 10 test USDC |
| Step, boost cap | 2,500 bps, 10,000 bps | 2,500 bps, 10,000 bps |
| Term, grace period | 600 s, 60 s | 60 s, 5 s |
| Fee | 200 bps (2%) | 200 bps (2%) |
| Merchant at least | Building | Building |
| Smallest loan | 0.001 USDC | 0.001 USDC |

A loan the size of the tier limit, repaid on time, adds 25%, a smaller one its share of that, up to
double. The preview's term is short so a whole cycle can be watched; the devnet term is long enough
to record a purchase and its repayment, and short enough to show a default. The website and the
agents read the rules from the pool account, not from the SDK.

## Checks

`cargo test -p tessera-paylater` (**6 / 6**) checks `credit.rs` on its own: the limit, the fee and
the boost a repayment earns.

`npm run test:paylater` (**93 / 93**, run on 27 October 2026; **94 / 94** with `ESCROW_SO` set to the escrow bytes dumped from devnet, where the buyer-opened order of the third item below can be opened, and is checked too) starts a local validator with both
programs. Wallets earn their tiers through real escrow orders, then every purchase on credit goes
merchant `open_order` → buyer and merchant `buy_now` (the pool pays the vault and the escrow confirms the order, in one
instruction) → `deliver` → `release`:

- a New wallet, a wallet with no credit file, a New merchant, self-dealing and an amount below the pool's minimum are all refused;
- so are an order opened for another buyer, a merchant other than the one that opened the order (signing for it), the wrong mint, an account the escrow program does not own or a credit file passed as the order, an order the buyer already paid, one already confirmed funded, and a quote past its payment window;
- a `buy_now` without the order's merchant's signature, sent by the buyer alone with no preflight, lands and fails with `AccountNotSigner`, and nothing moves. Where the escrow lets a buyer open an order in a merchant's name without that merchant's signature (with `ESCROW_SO`, the devnet build), the buyer does, and its `buy_now` for that order fails the same way: the pool never pays an order its merchant did not accept, so there is no refund to take as cash and no missed delivery to pin on the merchant. On the current escrow the order itself is refused (`AccountNotSigner`);
- a buyer that sends `buy_now` and `cancel_unpaid` for the same quote in one transaction (sent with no preflight) has it land and fail whole: the pool keeps its money, the buyer gets none, and no loan or line is opened;
- a tiered buyer buys: the pool pays the full price into the order's vault and the buyer pays nothing, the order is Funded by the same instruction, so a `cancel_unpaid` by the buyer and a second `confirm_funded` are refused and the money stays in the vault; the loan records the order, the price and the request hash, the escrow pays the merchant the price minus its 1% fee, the loan snapshot matches the buyer's live score, and the limit matches the off-chain formula;
- spending past the limit, repaying twice, marking a default early or during the grace period, and a stranger taking a repaid loan's rent are all refused;
- a repayment is the price plus the 2% fee, the pool books the fee at repayment, an on-time repayment raises the boost by the step scaled by the loan's share of the tier limit, exactly as the SDK computes it, and the program applies it: a purchase above the old limit goes through and one unit more is refused;
- five loans of the pool's minimum, repaid on time, count as five on-time repayments but move the limit by less than 0.1%, and one loan the size of the tier limit adds a whole step (a quarter of the unboosted limit);
- a buyer runs a tab of three purchases (the first built by the SDK's `buyOrderOnCredit`, one instruction, which takes the order's merchant as a signer and refuses one that did not open the order; the second sent by `tessera buy-later --order` with the buyer's and the merchant's keys, after the same command stopped before signing anything with the buyer's key alone and with another merchant's key), the chain lists all three as owed with the fee on each, and one transaction settles them;
- a buyer who never repays is marked in default by a stranger, the line freezes, and a late repayment, also price plus fee, clears the debt but not the default;
- each loan keeps the grace period it opened with: cutting it to 0 in the rules does not let anyone mark an open loan early, and an unpaid loan cannot be closed;
- a merchant never delivers: a stranger has the escrow refund the buyer, the pool gets nothing back, the loan is still open and owed, and the buyer repays it out of the refund;
- the pool's balance equals deposits minus withdrawals minus what it lent, plus repayments, plus the fees earned at repayment;
- every `buy_now` logs the compute units it used (102,786 to 135,767 over the two runs above; it varies with the PDA bumps of each run's random wallets), and `BUY_NOW_COMPUTE_UNITS` (400,000) leaves at least 30% spare (66% here);
- only the authority can create the pool, change its rules or withdraw, the rules can never give New wallets credit, a vault account created by someone else before the pool does not block it, and an empty pool refuses purchases;
- the merchant server closes a settled order once its review window has passed and gets the order's rent back. The escrow on devnet is its 4 October build, whose `close_order` takes no vault account, so the server's `closeOrder` sends the current account list and, if that build answers Unauthorized, the list without the vault; with `ESCROW_SO` set to the devnet bytes the run shows it taking the second list.

`npm run test:paylater-402` (**63 / 63**) runs the merchant server on the same kind of validator and
buys through its HTTP 402 route: the 402 offers the order on credit after its exact entries with the
buyer's live limit; a tiered buyer hands over a signed `buy_now`, the merchant settles it and
delivers, and the `buy_now` that lands carries three signatures, the ops wallet's, the buyer's and
the order's merchant's (read-only); the same header again returns the same delivery and opens no second loan; the CLI form and
the buyer agent over A2A do the same; `repay --all` clears the tab; a New wallet is told it is not
eligible and its forged header is refused by the program in simulation; a `buy_now` for another
order, one with the buyer as fee payer, one with an extra transfer of the merchant's SOL, one with a
`cancel_unpaid` after the `buy_now`, a unit limit above `BUY_NOW_COMPUTE_UNITS`, a second unit limit,
a priority fee above the cap, one naming another account as the escrow program, one that does not
ask for the merchant's signature, one with a signer more, one asking the merchant to sign writable,
one with something already in the merchant's signature slot, one the buyer never signed
and one with no transaction are each refused before anything is signed; the merchant's `buy_now`
shows the escrow's `confirm_funded` running inside it by CPI, within the compute budget; and the
server's keeper marks a loan in default a few seconds after its grace period ends, after which the
buyer's next 402 says the line is frozen.

`npm run test:formula` includes `packages/sdk/test/paylater-check.test.ts` (7 tests, no chain): the
merchant's check offline, with three signers and with a merchant that pays its own fees (two), and
its refusals of a `buy_now` that does not ask for the merchant's signature, a signer more, a writable
merchant, a signature already in the merchant's or the fee payer's place, and a buyer who is the
merchant; and `buyOrderOnCredit` taking only the order's own merchant as a signer.

## Try it

On a local validator, by hand:

```bash
npm run build:program
npm run codegen              # only after a build that changed an IDL
npm run paylater:local       # validator, both programs, tiered wallets, a funded pool, and a shop with open quotes; prints keypair paths
npm run tessera -- credit <alice> --rpc http://127.0.0.1:18999
npm run tessera -- buy-later --order <quote> --keypair <alice.json> --merchant-keypair <shop.json> --rpc http://127.0.0.1:18999 --send
npm run tessera -- repay <loan> --keypair <alice.json> --rpc http://127.0.0.1:18999 --send
npm run tessera -- repay --all --keypair <alice.json> --rpc http://127.0.0.1:18999 --send   # settle every loan still owed, at once
npm run tessera -- mark-default <loan> --keypair <stranger.json> --rpc http://127.0.0.1:18999 --send
```

`paylater:local` prints the escrow orders its shop has quoted for each buyer. `buy-later --order`
reads the order, checks what the program will check, and has the pool pay it, which confirms the
order in the same instruction. It sends the `buy_now` itself, so it needs the shop's signature as
well as alice's: `--merchant-keypair` is the shop's key, which you hold in this world (without it
the command stops and points to the x402 form, where the merchant signs); the shop in the script then delivers and, once the hold has run, is paid by the
escrow. The shop is part of the script, not the merchant server, so the 402 path is not in this
world: `npm run test:paylater-402` runs it, with the real server, from start to finish.

Over x402 on devnet (the setup steps, `npm run setup:paylater` for the pool, are in the
[README](../README.md#pay-later-build-local-run-devnet); the `61196cc` build there takes the
merchant's signature without requiring it): `npm run agents`,
then `npm run buy -- --buyer nova --merchant quill --pay-later`, `npm run tessera -- credit <nova>`,
and `npm run tessera -- repay --all --keypair .keys/agents/nova.json --send`. Nova and Echo were the
buyers at Building on 27 October; a New buyer such as Scout is told it is not eligible.

## Limits

- **For a few hours on 27 October devnet ran the build from before the fix.** In the `9d543b1` build,
  `buy_now` paid the order's vault but left the order awaiting payment, and the escrow lets the
  order's buyer `cancel_unpaid` it, which hands the vault to the buyer. A buyer at Building or above
  could have sent `buy_now` and `cancel_unpaid` together and kept up to its limit in cash. No loan was
  opened under that build (the pool's `loansOpened` was 0 after the upgrade), and the upgrade to
  `61196cc` closed it.
- **A refund goes to the buyer, not to the pool, and the loan stays owed.** If the escrow refunds an
  order the pool paid for (the merchant never delivers, a late payment is cancelled, a dispute goes
  the buyer's way), the USDC lands in the buyer's token account and the loan is still owed. The buyer is expected to repay
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
  the cap is refused, so one purchase costs the merchant at most the base fee plus 0.0004 SOL. The
  merchant's own key signs too, so the same check is what keeps anything else (a transfer of the
  merchant's USDC, say) from riding on that signature.
- **No purchase on credit without the merchant.** `buy_now` needs the order's merchant's signature,
  so a buyer cannot send one alone: over x402 the merchant's server signs, and
  `tessera buy-later --order` and the SDK's `buyOrderOnCredit` take the merchant's key explicitly.
  A buyer built before this change, which leaves only the fee payer's signature to the merchant, is
  refused by an up-to-date merchant server before anything is signed.
- **Collusion.** A buyer and a merchant working together can take up to the buyer's limit once
  (the merchant refunds the order, or delivers and is paid), then the buyer's line freezes. A buyer
  alone cannot: the pool only pays an order whose merchant signed the `buy_now`, and that order is
  Funded in the same instruction, so only the merchant's refund, a delivery it missed or a dispute
  can send the money to the buyer. The limit is only worth
  having after real settled trade with independent counterparties (see the farming costs in
  [SECURITY.md](SECURITY.md)), so the preview limits are kept small next to what a tier costs to earn.
- **The escrow on devnet is its first build.** `solana program dump` of
  `TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ` matches, byte for byte, a build of the first commit
  (`c6dbcd7`, deployed 4 October), not of `programs/tessera` today, and its upgrade key is lost. That
  build lets anyone open an order in a merchant's name. With the `61196cc` build of this program,
  which is the one on devnet, a buyer alone can therefore open an order with a Building merchant,
  have the pool pay it, and collect the escrow's refund once the merchant misses a delivery it never
  agreed to: the loan stays owed, and the merchant takes the missed-delivery penalty. The escrow in
  this repository has the merchant sign `open_order`, which closes that for it, and `buy_now` here
  requires the merchant's signature itself, which closes it on any escrow build: `npm run
  test:paylater` with `ESCROW_SO` sends the attack against the devnet escrow's bytes and it fails
  with `AccountNotSigner` ([SECURITY.md](SECURITY.md#pay-later) P1). **Devnet runs the `61196cc`
  build, without that check, until the next upgrade.** Until then the hole is open there, bounded by
  the buyer's limit (2 USDC at Building at a perfect score, more at a higher tier or with an on-time
  boost) and the pool's 8 USDC, and the buyer's line freezes once the loan is marked in default.
- **A dispute on devnet cannot be resolved by this deployment.** The escrow config's authority
  (`5i7zzV9hQUCbpg8MXSNJB3QQkL6zscDd8VQKow46vg7E`) and its arbiter
  (`3GydKy3acrVxvwyF26oDMwvbxVjrQ5yBDEc1GzUoVKz2`) are version 1 keys that were lost, and in the
  build on devnet only the order's arbiter may resolve a dispute. A disputed order, one the pool paid
  for included, stays Disputed with its money in the vault, and the loan stays owed. The config's
  rules cannot be changed either.
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
