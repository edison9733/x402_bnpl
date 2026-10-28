# Pay later for agents

A second Solana program, [`programs/tessera-paylater`](../programs/tessera-paylater), lets an agent buy
now and pay later. Its credit limit comes from the agent's Tessera score, and the purchase itself goes
through the Tessera escrow: the pool pays the buyer's escrow order, so a purchase on credit is
protected exactly like one the buyer paid for. The escrow program is not changed: pay-later only reads
its accounts and pays into its vaults, and its built binary is identical with or without this program
in the workspace.

**Status.** It is on devnet since 27 October 2026, and tested on a local validator next to the real
escrow program, end to end through the merchant server's x402 route. `buy_now` requires the order's
merchant's signature and carries the price and request hash the buyer agreed to, on devnet too since
the upgrade of 28 October 2026 to the build of `1bd11be`. Later that day the escrow moved: the
version 1 escrow on devnet (`TessSeP5…`) can never be upgraded, so the escrow source in this
repository was deployed at a new address, `tESs6b4J…`, and this program was upgraded to the build
of `eca65b0`, which lends into it (see [Upgrading devnet](#upgrading-devnet) for both upgrades, and
[Limits](#limits) for what the retired escrow allows).

The first purchase on credit on devnet, 27 October 2026: Nova bought Atlas's 0.20 USDC telemetry
report over x402 (settle transaction [`ttLNpyhU…`](https://explorer.solana.com/tx/ttLNpyhUrgMoTkobtBB3QveynRHrBcnwDxyzYSsc5YYsUrfWncVAD2LLmAxRLHLAFJTg4Dr6jEzm2CJPTjMkoHw?cluster=devnet), where `BuyNow` pays the order's vault
and calls the escrow's `ConfirmFunded` in the same instruction) and repaid 0.204 USDC on time
([`2tyLtJe2…`](https://explorer.solana.com/tx/2tyLtJe2nabhmjeUtCh4hzQymwQxGzFGbz1KM6KqQNxQHTiLyanUeSS2igjM58WdEmHdJkubZyWMUtJTqyAU2r6?cluster=devnet)). Order [`j8Bfe9k5…`](https://explorer.solana.com/address/j8Bfe9k5QejA48pQQH3ca2LzHgQqpNGAtkbqhaRLQYh?cluster=devnet), loan [`hEppTpuw…`](https://explorer.solana.com/address/hEppTpuwxfcS9Fyp7koittoPADBS5HhcsSMgXc9uH4G?cluster=devnet).
That ran on the `61196cc` build, on the escrow now retired (`TessSeP5…`).

The purchase on credit that confirmed the upgrade to `1bd11be`, 28 October 2026, also on the
retired escrow: Nova (Building, score 365, limit 0.74825 USDC) bought Quill's 0.25 USDC summary
over A2A, with the x402
`tessera-paylater` payment (settle transaction [`1K7VsBKV…`](https://explorer.solana.com/tx/1K7VsBKVWYHXmMmEdytiUck99inmuuRQuYfDUBAyGuhpzQ7b4vou7CkAT9L73hTBxo7CfURvpVGvLsfAf44b2xG?cluster=devnet), signed by the merchant server as fee
payer, by Nova and by Quill as the order's merchant; its `buy_now` data is 80 bytes, the
discriminator, the loan id, the price 250000 and the request hash). After the 45 s hold the escrow
released it to Quill, and the delivered hash matched the one committed on chain. Nova repaid 0.255
USDC on time and the loan was closed in the same transaction, its rent going back to Nova ([`3oL3qukd…`](https://explorer.solana.com/tx/3oL3qukdUPiM6Tvgd8D8RM8XsUgTHjqMQiuGjZLUHiJEMYKnMr5sk8XKQkwXA6CoMSPoC2XUBAwFoyXguBYNEiJu?cluster=devnet)), after which
it is at score 388 and a limit of 0.819611 USDC, two loans repaid on time. Order [`8VAF9ZWQ…`](https://explorer.solana.com/address/8VAF9ZWQrdGVtcuvifh5GG4yPExp2iXE3S8fh3DmHn3b?cluster=devnet), loan [`9sS9yBDG…`](https://explorer.solana.com/address/9sS9yBDGggQr3WUeCidPsLa5pwviiEGEi4Nf3z4T2Zoc?cluster=devnet).

The purchase on credit that confirmed the upgrade to `eca65b0`, on the new escrow, 28 October 2026:
Nova (Building, limit 1.026626 USDC) bought Quill's 0.25 USDC summary again, the same way
(settle transaction [`2mZxEzfu…`](https://explorer.solana.com/tx/2mZxEzfu5ReApNejhCz7GMEwkkBJc7rafjiG3LUiKPNGx1J3oFhxEty3xdLtFfdrJ8Aevauzoy4NX3xVGZJMnzW8?cluster=devnet), again signed by the merchant server as fee
payer, by Nova and by Quill as the order's merchant, with 80 bytes of `buy_now` data carrying the
price 250000, and with the `ConfirmFunded` of the escrow at `tESs6b4J…` inside `BuyNow`). After the 10 s
hold the escrow released it to Quill, and the delivered hash matched. Nova repaid 0.255 USDC on time
and the loan was closed in the same transaction ([`4LUwpKcB…`](https://explorer.solana.com/tx/4LUwpKcBk6mGvKf1hN6bJ4yZq8Aub292AuPHtyN4RpnMkjcQV9KTqzWGjDXy9U65C6AJtge2ebZPV6PYijf4jQnY?cluster=devnet)), after which it is Established at
score 527 with a limit of 2.865299 USDC, three loans repaid on time. Order [`Fi68yAxK…`](https://explorer.solana.com/address/Fi68yAxKs6ZF3bumeMvJmXDBSzsKuszo94gTwVfwm7S8?cluster=devnet), loan [`35R7bZzw…`](https://explorer.solana.com/address/35R7bZzwWKyYHoGoSZYwy37m8mpJavdWvNL5RqArxU1U?cluster=devnet).

| | Devnet |
|---|---|
| Program | `LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D` (`Anchor.toml`, `declare_id!`, the generated SDK), deployed 27 October 2026 in slot 515513248 from commit `9d543b1`; upgraded the same day in slot 515711875 to the build of `61196cc` (transaction `ZsQ12niKDQnMijF1TE5czfHsjFcnNaZ2GB7U7TWb6pLAf3xCgyt2arCza7e9bTAAu7nBHcrzgYviUfn7GoScg5V`); upgraded 28 October 2026 (UTC+8; block time 2026-10-27 17:22:02 UTC) in slot 515766612 to the build of `1bd11be` (transaction [`3vcqaD4McyE5FDa1tHDxEMd8sgdNGTWdk2bm3BGFHQmHx36jmjoYU7ZBdKuVXc4K5KeBYHBjYUG36wVp2AVS7s2E`](https://explorer.solana.com/tx/3vcqaD4McyE5FDa1tHDxEMd8sgdNGTWdk2bm3BGFHQmHx36jmjoYU7ZBdKuVXc4K5KeBYHBjYUG36wVp2AVS7s2E?cluster=devnet)); upgraded again 28 October 2026 (UTC+8; block time 2026-10-28 06:17:53 UTC) in slot 515961295 to the build of `eca65b0`, which names the new escrow (transaction [`3YJDEfVq961AwaqKYFwoDRxEfDwJDmLUvXFNHVBjWyGzL9J1U5UrFomjNTLUoxmSG1QN1X1vXunTJBdSwwmp1XgG`](https://explorer.solana.com/tx/3YJDEfVq961AwaqKYFwoDRxEfDwJDmLUvXFNHVBjWyGzL9J1U5UrFomjNTLUoxmSG1QN1X1vXunTJBdSwwmp1XgG?cluster=devnet)), the build on devnet now |
| Upgrade and pool authority | `EoNCoL8tDGKpiyyycESkheuMPcQNpLJrAXqjQUCQCCY6` |
| Pool | `GNf8LpVeJ6ayrVMqABpU1nAHW9ZX7upC2aGqcumWF5Qq`, rules `DEVNET_LINE_PARAMS` (below) |
| Pool vault | `DK9angk2VJ43sUaUgJB9wpvDmjh4zroVj8zC2UYTXsgV`, 8 devnet USDC on 27 October; after the first loan and its repayment, 8.004; after the second, on 28 October, 8.009; after the third, on the new escrow the same day, 8.014 |
| Escrow it lends into | `tESs6b4JFTWoNnELMa4KSxPuJDSRaLAtCSUr8BGY6ry`, config `CvyxNt9ktt4uUMq83jZHbbqzJdNR9Tvd6YBq1ER7FPmS`, since 28 October 2026; until then `TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ`, config `DgwhgcXkhNwpouzppHdF7KNACA14U1JWPccFH5ZGeNE2`, now retired |

The same addresses, and the last deploy's slot, commit and transaction, are in
[`deployments/devnet.json`](../deployments/devnet.json). The first deploy was the build of `9d543b1`,
from before `buy_now` called the escrow's `confirm_funded` itself (step 2 below). The upgrade to
`61196cc` replaced it the same day: the first 401,520 bytes of the program dumped from devnet hash
the same as a local build of that commit (sha256 `69b91a7d…62d6`), and the rest is zero padding. The
pool account's layout is the same in both builds, so the pool kept its rules and its 8 USDC. The
first upgrade of 28 October, to `1bd11be`, added the merchant's signature and the agreed price and request
hash to `buy_now` (step 2 below): the .so is 403,176 bytes, the first 403,176 bytes of the program
dumped from devnet hash the same as the local `anchor build` (sha256 `b0cd5742…81e3`), and the rest
of the 420,000-byte program account is zeros. The maximum length is still 420,000 bytes and the
upgrade authority is unchanged. The program's own source has not changed since `1bd11be`. It names
the escrow through the `tessera` crate (`tessera::ID`), and `eca65b0` gives that crate the new
escrow's address, so the second upgrade of 28 October, to `eca65b0`, changed only the address compiled in:
the first 403,176 bytes of the program dumped from devnet hash the same as the local build (sha256
`5539bc51…2074`), and the rest is zeros. The pool has no link to the escrow, so the pool and the
credit lines, with their records, carried over.

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
   payment window, and that its vault does not already hold the price. `buy_now(loan_id, amount,
   request_hash)` carries the price and the request hash the buyer agreed to, and the program
   requires the order to carry exactly those (`PriceMismatch`, `RequestMismatch`): both signatures
   commit to the terms, not just to the order's address. That mattered on the escrow devnet ran
   until 28 October (the 4 October build, now retired), where a party can close an unpaid order and
   open another at the same address within seconds: a merchant holding a buyer's signed `buy_now`
   could otherwise reprice the order before sending it, up to the buyer's whole available credit.
   The buyer's tier and score are recomputed live from its Tessera credit file, the merchant must be at Building or above, and the price must fit inside
   the buyer's remaining limit. The buyer pays the rent of the loan account and, on its first
   purchase, of its credit line (0.00181864 and 0.00118364 SOL on devnet, so 0.00300228 SOL for a
   first purchase; 0.00249168 and 0.00162168 SOL on a local validator), and nothing else. The runtime
   will not leave a wallet with some SOL but less than its own rent-exempt minimum (0.00065024 SOL on
   devnet), so a wallet needs exactly the rent or at least the rent plus that minimum (0.00365252 SOL
   for a first purchase on devnet); the 402 says `eligible: false` in between. The loan's rent comes
   back when the repaid loan is closed, which `tessera repay` and `tessera repay --all` do in the same
   transaction as the repayment; the line stays.
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
   every loan it still owes in one transaction (`tessera repay --all`, which also closes each loan it
   repays, so the buyer gets the loan accounts' rent back). Each loan keeps its own due date, so the
   earliest one sets when the tab must be paid.
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
low, the pool cannot cover it, the buyer's SOL does not fit the rent (see step 2 above), or three of
its signed `buy_now`s failed on-chain in the last hour). The same facts sit under `extensions.tessera.payLater`. The pool
is read at most every 20 s, by every merchant the server runs.

To pay that way the buyer builds one `buy_now` for the quoted order, carrying the price and the
request hash it verified on-chain, with the merchant's wallet as fee payer and the order's merchant
as a signer, signs it, and sends it as `payload.transaction`
(base64) in `PAYMENT-SIGNATURE` or the A2A payload:
`{ "x402Version": 2, "accepted": <that entry>, "payload": { "transaction": "<base64>" } }`. The fee
payer's and the merchant's signatures are left empty: the merchant adds them.
The merchant is its own facilitator: it checks the transaction is exactly that (legacy or version 0,
no lookup tables, its own wallet as fee payer, the buyer and the order's merchant as the only other
signers, the merchant read-only (or the fee payer itself, when a merchant pays its own fees), the
buyer's signature present and no other signature, no account listed twice, no instruction other than compute-budget settings, at most one unit limit of at most
`BUY_NOW_COMPUTE_UNITS` (400,000) and one unit price of at most 10,000 micro-lamports (`MAX_CU_PRICE`), followed by
one `buy_now` of this program carrying exactly the price and request hash this merchant quoted, whose
every account is the one this order derives: its vault, buyer,
merchant and mint, the loan its loan id derives, the pool, the line, the escrow program and config,
both credit files). Before that, the merchant reads the order now at the quoted address and compares
it with its own record of the quote (buyer, merchant, mint, price, request hash, hold, the wallet
that paid its rent, and when it was opened; `quotedOrderRefusal` in the SDK): on the 4 October
escrow build (the retired one on devnet) the buyer can cancel the quote and open another order at
the same address in the merchant's name, without its signature, at any price and hold, and the
merchant signs for none of those. Only
then does it sign, with its ops wallet as fee payer and with the merchant's
own key, for an order of that merchant only; it simulates it and sends it. Because the merchant's own
key signs, nothing may ride along in the transaction, which is why the check allows nothing but the
`buy_now` and the compute-budget settings. When it lands the order is already
Funded, and the merchant delivers it if its price and request are still the quoted ones (they are:
the `buy_now` carried them). The buyer pays the rent of its loan account (and, on its first
purchase, its credit line); the merchant pays the network fee, at most the base fee plus 4,000 lamports
of priority fee. A forged transaction is refused before anything is signed
(HTTP 400 with no "do not pay again" note, `INVALID_PAYLOAD` over A2A), and the buyer may pay another
way. [docs/A2A-EXTENSION.md](A2A-EXTENSION.md) has the exact shapes.

- `npm run buy -- --buyer nova --merchant atlas --pay-later` buys over A2A on credit (Nova has
  credit on devnet; a New wallet such as Charlie is told it is not eligible), and
  `npm run buy:http -w @tessera/agents -- --pay-later` over plain HTTP; both log the loan and the due date.
- `tessera buy-later <merchant agent url> <skill> [--input JSON] --keypair PATH` runs the whole HTTP
  flow from the CLI. It caps the price at what the merchant's agent card advertises, reads the order
  from the chain and checks it is the one it asked for, and signs only one `buy_now` for it, carrying
  that price and request hash, which the merchant completes with its own signatures and sends. The
  program refuses an order that does not carry them, so the cap holds against a hostile merchant
  too, on devnet as well since the upgrade of 28 October 2026 (see [Limits](#limits)).
- `tessera credit <wallet>` shows the limit, what is owed, and each loan's due date; `tessera repay --all` settles the tab and closes the loans it repaid.

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

`npm run test:paylater` (**101 / 101**, run on 28 October 2026 at `eca65b0`; before that commit, **103 / 103** with `ESCROW_SO` set to the bytes of the retired devnet escrow, where the buyer-opened order of the third item below and the repriced order of the fourth can be opened, and are checked too; that build declares the old address, so those runs no longer apply) starts a local validator with both
programs. Wallets earn their tiers through real escrow orders, then every purchase on credit goes
merchant `open_order` → buyer and merchant `buy_now` (the pool pays the vault and the escrow confirms the order, in one
instruction) → `deliver` → `release`:

- a New wallet, a wallet with no credit file, a New merchant, self-dealing and an amount below the pool's minimum are all refused;
- so are an order opened for another buyer, a merchant other than the one that opened the order (signing for it), the wrong mint, an account the escrow program does not own or a credit file passed as the order, an order the buyer already paid, one already confirmed funded, and a quote past its payment window;
- a `buy_now` without the order's merchant's signature, sent by the buyer alone with no preflight, lands and fails with `AccountNotSigner`, and nothing moves. Where the escrow lets a buyer open an order in a merchant's name without that merchant's signature (with `ESCROW_SO`, the retired devnet build), the buyer does, and its `buy_now` for that order fails the same way: the pool never pays an order its merchant did not accept, so there is no refund to take as cash and no missed delivery to pin on the merchant. On the current escrow the order itself is refused (`AccountNotSigner`);
- a `buy_now` carrying a lower or a higher price than the order's, or another request hash, is refused (`PriceMismatch`, `RequestMismatch`). The buyer signs a `buy_now` for the merchant's quote at 0.002 USDC; the merchant then cancels the quote and opens the same id again for the same buyer at 2 USDC. Where the escrow allows that at once (with `ESCROW_SO`, the retired devnet build: the order lands at the same address, with the same vault), the buyer's `buy_now`, sent against the repriced order, lands and fails with `PriceMismatch`, and the pool pays nothing; on the current escrow the cancelled order stays as a tombstone, the reopen fails, and so does the `buy_now`;
- a buyer that sends `buy_now` and `cancel_unpaid` for the same quote in one transaction (sent with no preflight) has it land and fail whole: the pool keeps its money, the buyer gets none, and no loan or line is opened;
- a tiered buyer buys: the pool pays the full price into the order's vault and the buyer pays nothing, the order is Funded by the same instruction, so a `cancel_unpaid` by the buyer and a second `confirm_funded` are refused and the money stays in the vault; the loan records the order, the price and the request hash, the escrow pays the merchant the price minus its 1% fee, the loan snapshot matches the buyer's live score, and the limit matches the off-chain formula;
- spending past the limit, repaying twice, marking a default early or during the grace period, and a stranger taking a repaid loan's rent are all refused;
- a repayment is the price plus the 2% fee, the pool books the fee at repayment, an on-time repayment raises the boost by the step scaled by the loan's share of the tier limit, exactly as the SDK computes it, and the program applies it: a purchase above the old limit goes through and one unit more is refused;
- five loans of the pool's minimum, repaid on time, count as five on-time repayments but move the limit by less than 0.1%, and one loan the size of the tier limit adds a whole step (a quarter of the unboosted limit);
- a buyer runs a tab of three purchases (the first built by the SDK's `buyOrderOnCredit`, one instruction, which takes the order's merchant as a signer and refuses one that did not open the order; the second sent by `tessera buy-later --order` with the buyer's and the merchant's keys, after the same command stopped before signing anything with the buyer's key alone and with another merchant's key), the chain lists all three as owed with the fee on each, and `tessera repay --all` settles them in one transaction and closes all three loans: their accounts are gone and their rent is back with the buyer, less one network fee;
- a buyer who never repays is marked in default by a stranger, the line freezes, and a late repayment, also price plus fee, clears the debt but not the default;
- each loan keeps the grace period it opened with: cutting it to 0 in the rules does not let anyone mark an open loan early, and an unpaid loan cannot be closed;
- a merchant never delivers: a stranger has the escrow refund the buyer, the pool gets nothing back, the loan is still open and owed, and the buyer repays it out of the refund;
- the pool's balance equals deposits minus withdrawals minus what it lent, plus repayments, plus the fees earned at repayment;
- every `buy_now` logs the compute units it used (101,508 to 128,684 over two runs before `eca65b0`, with and without `ESCROW_SO`; it varies with the PDA bumps of each run's random wallets), and `BUY_NOW_COMPUTE_UNITS` (400,000) leaves at least 30% spare (67% here);
- only the authority can create the pool, change its rules or withdraw, the rules can never give New wallets credit, a vault account created by someone else before the pool does not block it, and an empty pool refuses purchases;
- the merchant server's crank (`closeSettledOrders`, which `npm run agents` runs when `CLOSE_SETTLED_ORDERS=1`) finds the settled orders the server paid the rent for whose review window has passed, leaves one settled a moment ago, closes the twelve oldest and gets their rent back, less one network fee each. The retired devnet escrow is the 4 October build, whose `close_order` takes no vault account, so `closeOrder` sends the current account list and, if that build answers Unauthorized, the list without the vault; with `ESCROW_SO` set to its bytes the run showed it taking the second list. The escrow on devnet since 28 October takes the current list.

`npm run test:paylater-402` (**77 / 77** at `d6950f3`, which added the pending-settlement checks of section 8; before `eca65b0`, **72 / 72** with `ESCROW_SO` set to the retired devnet build, where the swapped orders below can be opened) runs the merchant server on the same kind of validator and
buys through its HTTP 402 route: the 402 offers the order on credit after its exact entries with the
buyer's live limit; a tiered buyer hands over a signed `buy_now`, the merchant settles it and
delivers, and the `buy_now` that lands carries three signatures, the ops wallet's, the buyer's and
the order's merchant's (read-only); the same header again returns the same delivery and opens no second loan; the CLI form and
the buyer agent over A2A do the same; `repay --all` clears the tab and closes both loans, the rent
back with the buyer; a New wallet is told it is not
eligible and its forged header is refused by the program in simulation; a `buy_now` for another
order, one with the buyer as fee payer, one with an extra transfer of the merchant's SOL, one with a
`cancel_unpaid` after the `buy_now`, a unit limit above `BUY_NOW_COMPUTE_UNITS`, a second unit limit,
a priority fee above the cap, one carrying a lower price or another request hash than the quote,
one naming another account as the escrow program, one that does not
ask for the merchant's signature, one with a signer more, one asking the merchant to sign writable,
one with something already in the merchant's signature slot, one the buyer never signed
and one with no transaction are each refused before anything is signed; with `ESCROW_SO` (before `eca65b0`), the buyer
cancels two of atlas's quotes and reopens them in atlas's name, one at 0.001 USDC and one at the
quoted price and request with a day-long hold, and the server refuses to sign a `buy_now` for either
(the order at the quoted address is not the one it opened), while on the current escrow the reopen
itself is refused; the demo faucet refuses a drip that would take the ops wallet below its floor
(503, saying why, nothing sent); the merchant's `buy_now`
shows the escrow's `confirm_funded` running inside it by CPI, within the compute budget; the
server's keeper marks a loan in default a few seconds after its grace period ends, after which the
buyer's next 402 says the line is frozen; and (since `65a4760`) an exact payment the facilitator
refuses at verify, a header that is not a payment and one of x402 version 1 each get a 400 with no
"do not pay again" note, since nothing was sent.

`npm run test:formula` includes `packages/sdk/test/paylater-check.test.ts` (11 tests, no chain): the
merchant's check offline, with three signers and with a merchant that pays its own fees (two), and
its refusals of a `buy_now` that does not ask for the merchant's signature, a signer more, a writable
merchant, a signature already in the merchant's or the fee payer's place, a buyer who is the
merchant, a key listed twice among the signers (which would otherwise pass the count), and a
`buy_now` carrying another price or request hash than the quote, or the old 40-byte data;
`buyOrderOnCredit` taking only the order's own merchant as a signer; the buyer's builders refusing
an order that no longer carries the terms it verified; and `quotedOrderRefusal`, the merchant's check
that the order at its quoted address is the one it opened.

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
[README](../README.md#pay-later-build-local-run-devnet); the program there requires the merchant's
signature since the upgrade of 28 October 2026): `npm run agents`,
then `npm run buy -- --buyer nova --merchant quill --pay-later`, `npm run tessera -- credit <nova>`,
and `npm run tessera -- repay --all --keypair .keys/agents/nova.json --send`. Nova and Echo were the
buyers at Building on 27 October; a New buyer such as Charlie is told it is not eligible. That
`npm run buy` command made the purchases on credit that confirmed both upgrades of 28 October (see
the top of this page).

## Limits

- **For a few hours on 27 October devnet ran the build from before the fix.** In the `9d543b1` build,
  `buy_now` paid the order's vault but left the order awaiting payment, and the escrow lets the
  order's buyer `cancel_unpaid` it, which hands the vault to the buyer. A buyer at Building or above
  could have sent `buy_now` and `cancel_unpaid` together and kept up to its limit in cash. No loan was
  opened under that build (the pool's `loansOpened` was 0 after the upgrade), and the upgrade to
  `61196cc` closed it. The builds on devnet since 28 October (`1bd11be`, then `eca65b0`) still
  confirm the order inside `buy_now`: both confirming purchases' logs show the escrow's
  `ConfirmFunded` inside `BuyNow`.
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
  the cap is refused, so one purchase costs the merchant at most the base fee plus 4,000 lamports. The
  merchant's own key signs too, so the same check is what keeps anything else (a transfer of the
  merchant's USDC, say) from riding on that signature. A buyer can still make a `buy_now` the
  merchant signed fail after it passed the simulation, by cancelling its order (or moving its SOL)
  in a race; nothing moves, but the merchant has paid the fee. The server answers that with a
  `PaymentRefused` ("nothing was paid"), and after three such failures in an hour it stops offering
  that wallet credit until the hour is up (`eligible: false`).
- **No purchase on credit without the merchant.** `buy_now` needs the order's merchant's signature,
  so a buyer cannot send one alone: over x402 the merchant's server signs, and
  `tessera buy-later --order` and the SDK's `buyOrderOnCredit` take the merchant's key explicitly.
  Clients and servers must come from the same commit: a buyer built before this change (two
  signers, a `buy_now` carrying only the loan id) is refused by an up-to-date merchant server before
  anything is signed, and a buyer built after it (three signers, a `buy_now` carrying the price and
  request hash) is refused by a merchant server built before it. See [Upgrading devnet](#upgrading-devnet).
- **Until 28 October devnet did not bind the price.** In the `61196cc` build that devnet ran until
  then, `buy_now` took only the loan id and read the price from whatever order sat at the named
  address when it ran. On the escrow devnet ran then (the 4 October build, now retired) either party
  may close an unpaid order at any time and anyone may open another at the same address at once, so
  a merchant holding a buyer's signed `buy_now` (over x402 it is handed one) could cancel its quote,
  reopen the same id for the same buyer at a higher price and send the buyer's transaction before
  its blockhash expired: the pool would pay the new price, up to the buyer's available credit, and
  the buyer would owe it. A dispute there cannot be resolved (see below).
  `buy_now(loan_id, amount, request_hash)` refuses that order (`PriceMismatch`);
  `npm run test:paylater` with `ESCROW_SO` ran the swap against the retired escrow's bytes (before
  `eca65b0`) and the buyer's `buy_now` failed. The escrow in this repository, on devnet since 28
  October, keeps a cancelled order's address as a tombstone for `unpaid_secs`, longer than a
  blockhash lasts, so there the swap is not possible anyway. **Closed on devnet since the upgrade of
  28 October 2026** ([SECURITY.md](SECURITY.md#pay-later) P2): both confirming purchases' `buy_now`s
  carry the price, 250000 (0.25 USDC), and the request hash in their 80 bytes of data.
- **Collusion.** A buyer and a merchant working together can take up to the buyer's limit once
  (the merchant refunds the order, or delivers and is paid), then the buyer's line freezes. A buyer
  alone cannot: the pool only pays an order whose merchant signed the `buy_now`, and that order is
  Funded in the same instruction, so only the merchant's refund, a delivery it missed or a dispute
  can send the money to the buyer (on devnet since 28 October; for before that, see the escrow
  bullet below). Nor can a merchant alone charge more than the buyer agreed to: the `buy_now` carries
  the price (on devnet since 28 October too, see the bullet above). The limit is only worth
  having after real settled trade with independent counterparties (see the farming costs in
  [SECURITY.md](SECURITY.md)), so the preview limits are kept small next to what a tier costs to earn.
- **Until 28 October the escrow on devnet was its first build.** `solana program dump` of
  `TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ` matches, byte for byte, a build of the first commit
  (`c6dbcd7`, deployed 4 October), not of `programs/tessera` today, and its upgrade key is lost. That
  build lets anyone open an order in a merchant's name. With the `61196cc` build of this program,
  which devnet ran until 28 October, a buyer alone could therefore open an order with a Building
  merchant, have the pool pay it, and collect the escrow's refund once the merchant missed a delivery
  it never agreed to: the loan would stay owed, and the merchant would take the missed-delivery
  penalty. The escrow in this repository has the merchant sign `open_order`, which closes that for
  it, and `buy_now` here requires the merchant's signature itself, which closes it on any escrow
  build: `npm run test:paylater` with `ESCROW_SO` sent the attack against the retired escrow's bytes
  (before `eca65b0`) and it failed with `AccountNotSigner` ([SECURITY.md](SECURITY.md#pay-later) P1).
  **Devnet has that check since the upgrade of 28 October 2026** (`BuyNow.merchant` is a signer, and
  both confirming purchases carry Quill's signature as the order's merchant). Until then the hole was
  open there, bounded by the buyer's limit (2 USDC at Building at a perfect score, more at a higher
  tier or with an on-time boost) and the pool's 8 USDC, and the buyer's line would freeze once the
  loan was marked in default. That escrow can never be upgraded, so its open findings stay open on
  it: anyone can open an order in a merchant's name without its signature, `cancel_unpaid` closes an
  unpaid order outright so the id can be reopened, and a dispute the arbiter never answers is never
  split. It is retired: its accounts stay on devnet as history, and since 28 October 2026 the escrow
  on devnet is `tESs6b4JFTWoNnELMa4KSxPuJDSRaLAtCSUr8BGY6ry`, the source in this repository, where
  `open_order` needs the merchant's signature and `cancel_unpaid` leaves a Cancelled tombstone
  ([SECURITY.md](SECURITY.md), B13 and B16). This program lends only into it: it requires the order,
  the escrow config and both credit files to be owned by `tessera::ID`, the new address. What the
  retired escrow's findings allow with a buyer's own money there (open and fund an order in a
  merchant's name, then have it refunded after the deadline for a merchant penalty) is unchanged;
  the pool's money cannot reach it at all.
- **A dispute on the retired escrow cannot be resolved.** Its config's authority
  (`5i7zzV9hQUCbpg8MXSNJB3QQkL6zscDd8VQKow46vg7E`) and its arbiter
  (`3GydKy3acrVxvwyF26oDMwvbxVjrQ5yBDEc1GzUoVKz2`) are version 1 keys that were lost, and in its
  build only the order's arbiter may resolve a dispute. A disputed order there, one the pool paid for
  included, stays Disputed with its money in the vault, and the loan stays owed. That config's rules
  cannot be changed either. On the escrow on devnet since 28 October the config's authority, the
  deployer's wallet, and its arbiter (`72noGuXbToPzDMC29LRFTit8WxMFiiSPFRygoG597f7a`) are keys we
  hold, and disputes are resolved: that day Charlie disputed two valid deliveries from Atlas, and
  the arbiter resolved both for Atlas ([`3DeAoBaQ…`](https://explorer.solana.com/tx/3DeAoBaQGHWe8djQ7Urr2rjyDXaU7DyEP8XQeinwZPt91F74umXbMLBt8AXS8V1Zb6omjPWvCrUXfCnw2o4tPfYo?cluster=devnet), [`2NWncCem…`](https://explorer.solana.com/tx/2NWncCem6Nv8ee6q2aLX2UoSyKCu9qSxwZgsoG8jUCp4kdddfTH4SJUKRT1UiWh8FFhzk5s4EBqMPuwuPey5skjk?cluster=devnet)).
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
- **Rent the ops wallet fronts, and when it comes back.** The merchant server's ops wallet pays the
  rent of every order it quotes (the order and its vault), of the credit file of a buyer that has
  none, of each buyer and merchant pair's account, and of the merchant's reviews. What its crank
  closes, and when:
  - an unpaid quote, 15 s after its payment window (`unpaid_secs`, 300 s on devnet) has passed: on
    the current source, on devnet since 28 October, `cancel_unpaid` closes the vault and leaves a
    Cancelled order, which the crank closes once the payment window has passed again (on the
    retired 4 October build it closed the order and its vault at once). The rent of both comes back;
  - only when the server runs with `CLOSE_SETTLED_ORDERS=1` (off by default): a settled order
    (Released, Refunded or Resolved) whose rent the ops wallet paid, once its review window
    (`review_secs`, 600 s on devnet) has passed since it settled, or its complaint window
    (`complaint_secs`, 1,800 s on devnet) for an instant order the buyer complained about: at most 25
    a pass, every 90 s, oldest first, with the account list the escrow build takes
    (`closeSettledOrders` in `apps/agents/src/chain.ts`). Purchases on credit are among them. The
    order is gone from the chain after that (the credit files keep the counts), and so is what the
    website's feed and network view, and the order links in the README, show of it. That is why it is
    off by default: each settled order keeps its rent (0.00266192 SOL on devnet for a 396-byte
    account, read on 28 October from the first pay-later order, `j8Bfe9k5`, on the retired escrow;
    `Fi68yAxK`, on the new one, is the same size and rent) as history;
  - never: a Disputed order until it is resolved (on the retired escrow it stays Disputed
    for good), the reviews (no instruction closes them), the buyers' credit files and the pair
    accounts.

  The loan account is the buyer's rent, and `tessera repay` closes it. The server caps what visitors
  can make the ops wallet spend: it opens no quote while it holds less than 0.03 SOL
  (`QUOTE_SOL_FLOOR_LAMPORTS`), so what is left settles what is open; one client may have credit
  files made for at most 10 new wallets an hour (`MAX_NEW_WALLETS_PER_HOUR`); and the demo faucet
  drips only while the ops wallet keeps at least 0.1 SOL after the drip (`FAUCET_SOL_FLOOR_LAMPORTS`)
  and says so when it will not.
- **Unaudited**, like the rest of the project.

## Upgrading devnet

The program and the merchant server change together. Do both from the same commit, in this order:

1. Restart the merchant server (`npm run agents`, and any hosted copy) on the new commit, and use
   buyer clients (`npm run buy`, `tessera buy-later`) from it too. Until step 2 they run against the
   build still on devnet. For the first upgrade of 28 October that was the `61196cc` build, which took the
   order's merchant as a plain account, so the extra signature did nothing, and Anchor read only the
   loan id from the instruction data and ignored the price and request hash after it. What the
   server checks applies from this step (the order at its quoted address compared with its quote, a
   repeated account refused, the cut-off after failed landings, the faucet and quote floors); what
   the program checks (the merchant's signature, the agreed price and request) applies from step 2.
2. Upgrade the program from the same commit (the command is in the README), passing the program's
   address, `--program-id LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D`, not a keypair file: a
   keypair file another checkout generated would deploy a new program instead.
3. Buy once on credit on devnet and repay it, to confirm.

A merchant server older than the program cannot settle any purchase on credit once the program is
upgraded (it signs only as fee payer, so `buy_now` fails without the merchant's signature, and its
check refuses the new transactions), and a buyer client older than the server is refused by it
before anything is signed.

The first upgrade of 28 October 2026, to `1bd11be` (slot 515766612, transaction
[`3vcqaD4M…`](https://explorer.solana.com/tx/3vcqaD4McyE5FDa1tHDxEMd8sgdNGTWdk2bm3BGFHQmHx36jmjoYU7ZBdKuVXc4K5KeBYHBjYUG36wVp2AVS7s2E?cluster=devnet)), followed this order: the merchant server was
restarted on the new commit first, then the program was upgraded with `--program-id
LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D` (the CLI printed that Program Id), and Nova's purchase
of Quill's summary on credit and its repayment on time confirmed it (see the top of this page).

The second, the same day, to `eca65b0` (slot 515961295, transaction
[`3YJDEfVq…`](https://explorer.solana.com/tx/3YJDEfVq961AwaqKYFwoDRxEfDwJDmLUvXFNHVBjWyGzL9J1U5UrFomjNTLUoxmSG1QN1X1vXunTJBdSwwmp1XgG?cluster=devnet)), came with the escrow's move. The version 1 escrow,
`TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ`, runs the 4 October build, and its upgrade authority,
config authority and arbiter are version 1 keys that were lost, so it can never take the audit
fixes, and a dispute on it can never be resolved. `eca65b0` gives the same escrow source a new
address, `tESs6b4JFTWoNnELMa4KSxPuJDSRaLAtCSUr8BGY6ry`. This program names the escrow through
`tessera::ID`, so its build changed with it, in that address only. Pay later was upgraded first;
then the escrow was deployed (slot 515961506, transaction
[`34QUoV5G…`](https://explorer.solana.com/tx/34QUoV5GAC7yNY9k1Wz7UFeD7fjygddE5q7M9eJdkPwwDtZb745aiWEQd8zuSQSTWmvaPes4p73NdWs5VZBMxwQW?cluster=devnet)) with the deployer's wallet as its upgrade
authority, and its config (`CvyxNt9ktt4uUMq83jZHbbqzJdNR9Tvd6YBq1ER7FPmS`) was initialised with an
arbiter and a treasury whose keys we hold. The agents earned their tiers again on the new escrow,
and Nova's purchase of Quill's summary on credit and its repayment on time confirmed it (see the top
of this page). A merchant server from before `eca65b0` opens its quotes on the retired escrow, and
this program refuses to pay those: they are not owned by `tessera::ID`.
