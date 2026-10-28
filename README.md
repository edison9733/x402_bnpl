# Tessera

**The credit layer for agent commerce.** x402 payments land in escrow on Solana, and an on-chain
credit score decides how long the money waits. Strangers wait. Agents with a record settle at once.

> *Every payment matters.*

## See it

- **Live site (devnet):** <https://agentic-commerce-two-theta.vercel.app>. There is no wallet login: the Market page pays with a built-in devnet test wallet.
- **Click-through decks:** [the pitch](https://agentic-commerce-two-theta.vercel.app/decks/tessera-pitch-slides.html) and [the technical demo](https://agentic-commerce-two-theta.vercel.app/decks/tessera-demo-slides.html). Click or press → for the next slide.
- **In-site decks:** [/#/deck/pitch](https://agentic-commerce-two-theta.vercel.app/#/deck/pitch) and [/#/deck/demo](https://agentic-commerce-two-theta.vercel.app/#/deck/demo).
- **Demo videos:** [the terminal demo with voice-over and pay later (2:59)](https://agentic-commerce-two-theta.vercel.app/videos/tessera-demo-paylater.mp4): why Tessera exists (anonymous agents, three attacks, escrow), finding and checking merchants, buyer and merchant trading side by side, a refund when a merchant never delivers, and from 2:12 pay later (a new wallet refused, a buyer repaying on time, a default freezing a line). The [earlier cut without pay later (2:03)](https://agentic-commerce-two-theta.vercel.app/videos/tessera-demo-voiceover.mp4) and [the website walkthrough (1:41)](https://agentic-commerce-two-theta.vercel.app/videos/tessera-demo.mp4) are still up. All were recorded on a local Solana validator running the real programs.
- **Run the site yourself:** `npm install`, then `npm run web`. It reads devnet directly and needs no keys.
- **Try a whole trade:** [docs/TRY-IT.md](docs/TRY-IT.md) walks through one step by step, as buyer and merchant with two wallets of your own, including a refund when a merchant never delivers.

| | |
|---|---|
| Program (devnet) | [`tESs6b4JFTWoNnELMa4KSxPuJDSRaLAtCSUr8BGY6ry`](https://explorer.solana.com/address/tESs6b4JFTWoNnELMa4KSxPuJDSRaLAtCSUr8BGY6ry?cluster=devnet) |
| Config account (devnet) | [`CvyxNt9ktt4uUMq83jZHbbqzJdNR9Tvd6YBq1ER7FPmS`](https://explorer.solana.com/address/CvyxNt9ktt4uUMq83jZHbbqzJdNR9Tvd6YBq1ER7FPmS?cluster=devnet) |
| Settles in | devnet USDC (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`), 1% protocol fee |
| Pay-later program (devnet) | [`LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D`](https://explorer.solana.com/address/LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D?cluster=devnet), pool [`GNf8LpVeJ6ayrVMqABpU1nAHW9ZX7upC2aGqcumWF5Qq`](https://explorer.solana.com/address/GNf8LpVeJ6ayrVMqABpU1nAHW9ZX7upC2aGqcumWF5Qq?cluster=devnet) (deployed 27 October 2026; see [Pay later](#pay-later)) |
| Agent Registry | The four honest merchant agents of version 1 (atlas, quill, vera, pixel, with the wallets in [`deployments/registry.json`](deployments/registry.json)) are registered in the [Solana Agent Registry](https://solana.com/agent-registry) (ERC-8004) on devnet. The agents created for 2.0 on 27 October are not in that file. See [docs/ERC-8004.md](docs/ERC-8004.md). |
| Status | Devnet only. Unaudited by a third party. The traffic on devnet is this project's own agents. See [what is real](#what-is-real-and-what-is-not). |

Built for the Colosseum Crypto World's Fair hackathon (Solana track), October 2026. Entered in the
Encode Club Solana Hackathon 2026, track "Best Use of x402 on Solana": what was built before that
window and what is new in it is listed under
[What existed before 12 October 2026 and what is new](#what-existed-before-12-october-2026-and-what-is-new).

---

## The problem, and the fix, three times

**Pain 1: nobody knows who is on the other end.** An AI agent is just a wallet. One person can create
as many as they like, with no identity check, and these anonymous agents now pay each other. An x402
payment is a signed token transfer: once a facilitator settles it, it is final, with no chargeback and
nobody to call. Card networks answer "did I get what I paid for?" months later; Visa's Compelling
Evidence 3.0 uses purchase history 120 to 365 days old
([Checkout.com](https://www.checkout.com/blog/visa-compelling-evidence-3-0)). Agents do not have 120 days.

**Fix 1: a credit layer.** We cannot see who owns an agent, but we can see how it behaves. Tessera is
the bridge from an anonymous wallet to an agent you can judge: every order leaves a public record, and
the program turns it into a credit file (a score from 0 to 1000 and one of four tiers) built from the
wallet's behaviour, the amounts that really settled and with how many counterparties, and the ratings
it received. No identity needed, and anyone can recompute it from the chain.

**Pain 2: a score is only useful if it is hard to fake.** Building Tessera we kept meeting three attacks:

- **Sybil attacks.** Wallets are free, so one person can pose as hundreds of agents.
- **Friendly fraud.** A buyer gets exactly what it paid for, then claims it never arrived.
- **Reputation farming.** The one that worries us most: trade with your own wallets until you look
  like a busy, well-rated agent, then cash in by taking strangers' money and delivering nothing.

**Fix 2: escrow.** So every payment waits in a Solana program until the wallet has earned trust.
A stranger's payment is held long enough to dispute; an agent with a real record is paid at once. That
prices each attack: a new wallet counts for 10% and each counterparty adds at most the pair cap
(sybils); the merchant commits a delivery hash on-chain before the money moves, and a buyer that loses
a dispute takes a 25% score penalty and loses Trusted (friendly fraud); every farmed order pays a fee
it can never fully earn back, and Trusted needs 30 active days (farming costs hundreds to a few thousand
dollars and one to three months for a ring). Priced, not impossible: see
[docs/SECURITY.md](docs/SECURITY.md#what-sybil-resistant-means-here-and-what-it-does-not).

**Pain 3: top up, count tokens, top up again.** An agent can only spend what is already in its wallet,
so its owner keeps topping it up and guessing how many tokens the next job needs.

**Fix 3: pay later (on devnet since 27 October 2026).** Fund the agent roughly, once. When a purchase costs
more than its wallet holds, the agent can buy now and pay later: a pool pays its escrow order for it,
so it keeps the escrow's protection, and the limit comes from the same score. See
[Pay later](#pay-later) below.

## What Tessera does

1. **Escrow with no new payment scheme.** x402's `exact` scheme on Solana only permits a plain token
   transfer, but it derives the destination token account from `payTo`. So a merchant quotes the *order
   account* as `payTo`, and a standard x402 payment lands in that order's vault. The program never takes
   anyone's word that it was paid: `confirm_funded` is permissionless and reads the vault balance.
2. **A score that sets the hold.** Every wallet has a credit file. An order snapshots both parties' tiers,
   and the money is held for the longer of the two tiers' holds.

   | Tier | Needs (mainnet target) | Needs (devnet) | Hold (mainnet target) | Hold (devnet) |
   |---|---|---|---|---|
   | New | nothing | nothing | 3 days | 2 min |
   | Building | score ≥ 250, 3 active days | score ≥ 250, 2 active periods | 1 day | 45 s |
   | Established | score ≥ 500, 14 active days | score ≥ 500, 8 active periods | 1 hour | 10 s |
   | Trusted | score ≥ 750, 30 active days, no standing penalty | score ≥ 750, 20 active periods, no standing penalty | instant, inside a limit | instant |

   On devnet one period is 60 seconds. The numbers are in [`packages/sdk/src/constants.ts`](packages/sdk/src/constants.ts).
3. **Two-sided reviews, stored on-chain in full**, weighted by the volume that actually settled.
4. **Agents that use it.** Merchant agents speak A2A with the
   [a2a-x402 extension](https://github.com/google-agentic-commerce/a2a-x402) and plain HTTP 402. Buyer
   agents check the escrow on-chain before paying, pay through a facilitator (so they need no SOL), check
   the delivery against the hash the merchant committed, and rate the merchant.
5. **It sits between two things Solana already has.** x402 moves the money. The
   [Solana Agent Registry](https://solana.com/agent-registry) (ERC-8004 on Solana) says who an agent is.
   Tessera decides whether the money waits. On devnet, the version 1 merchant agents are registered in
   that registry, each registry identity points at its Tessera credit file on the retired escrow, and
   28 Tessera reviews (7 per merchant) are mirrored there as feedback that carries proof of payment.
   See [docs/ERC-8004.md](docs/ERC-8004.md).

## Four ways in for agents

There is one core and three thin layers over it, so an agent can use Tessera in whatever it speaks.
All four return the same decisions and statuses. Every transaction comes back unsigned, for the
agent's own wallet to sign. Details: [docs/AGENT-API.md](docs/AGENT-API.md).

| Door | Run | Use |
|---|---|---|
| HTTP API (the core) | `npm run api` → `:4030/v1` | `GET /v1/merchants?need=…` returns the best merchants, ranked. `POST /v1/check` returns `instant`, `escrow` or `block`, with a reason. |
| MCP (Streamable HTTP) | `npm run mcp` → `:4040/mcp` | `claude mcp add --transport http tessera http://127.0.0.1:4040/mcp` |
| Skill | [`skills/tessera/SKILL.md`](skills/tessera/SKILL.md) | "Before any paid tool call, call `check_payment`." |
| CLI | `npm run tessera -- help` | `npm run tessera -- find text summary --sort fastest`, or a read-only check: `npm run tessera -- check <merchant> 0.20 --buyer <your devnet address>` |

The MCP server and the CLI both call the HTTP API, so `npm run api` must be running.

Tools, by phase:
- **Before paying:** `find_merchants`, `get_score`, `check_payment`.
- **During:** `open_escrow`, `deliver_order`, `get_escrow`.
- **After:** `release_escrow`, `reclaim_after_timeout`, `report_outcome`, `submit_transaction`.

**Reviews as search, for agents.** `find_merchants` answers "who is best for this, what does it cost,
and how many seconds until it is settled" in one call. The rank uses only on-chain data. Every review
behind it needed a real settled order, so a top spot costs real sales to fake. It is written for
agents, not people: compact JSON, enums, and a plain-text summary at `/llms.txt` on both the API and
the website.

## Reviews that pay

A share of every fee goes back to whoever reviews. Three rules:
- **The pay never depends on the stars.** Every review that counted earns a quarter of the fee rate on the money behind it.
- **Accuracy scales it.** An honest warning about a wallet that then fails is paid 1.5×. Praising one that then fails is paid nothing.
- **Farming loses money.** Both sides of an order get back at most 75% of its fee, so trading with yourself to collect rewards always costs more than it pays.

The payout is an off-chain rebate that the operator pays from the treasury. `npm run rewards` previews
it and pays nothing; `npm run rewards -- --pay` pays. Every payout file can be recomputed with
`--verify`. It has run end to end on a local validator with the real program (`npm run demo:rewards`),
but not yet on devnet. Rules and a recorded run: [docs/REWARDS.md](docs/REWARDS.md).

**How to leave a review.** No purchase, no review: the receipt is the settled order account on Solana,
and the review is a transaction signed by the wallet that made the trade. The program accepts it only
from that order's buyer or merchant, once each, after the order settles and before the review window
closes (10 minutes on devnet).

- **Website:** open `#/review/<order>`. It shows the verified receipt from the chain, then you sign with a
  browser wallet (the buyer rates the merchant, the merchant rates the buyer).
- **Terminal:** `npm run tessera -- report <order> --outcome satisfied --rating 5 --comment "…" --keypair PATH --send`.

A merchant's review of a released order counts only once the buyer has reviewed it, and a review of a
refunded order weighs 0.

## Pay later

The same score that shortens the hold can set a credit line. A second program,
[`programs/tessera-paylater`](programs/tessera-paylater), lets an agent buy now and pay later:
- **Buy now.** The merchant quotes as always, by opening an escrow order. A pool pays the price into
  the order's vault in the buyer's place, and the escrow takes it from there: the merchant delivers
  and is paid by the escrow, minus the escrow's 1% fee, and the buyer keeps the refund and dispute
  protection of any other order.
- **Pay later.** The buyer repays the price plus the pool's 2% fee by the due date, with no interest.
  Each on-time repayment raises its limit, in proportion to the size of the loan.
- **Or run a tab.** Buy several things, then settle every loan still owed in one transaction
  (`tessera repay --all`, which closes each loan it repays and gives the buyer its rent back).
- **Or default.** Anyone can mark an unpaid loan in default once its grace period ends, and the line
  freezes at zero. The demo agents server does it as a keeper.
- **Over x402.** Where the pool exists, a merchant's 402 offers the order on credit as a second
  `accepts` entry (scheme `tessera-paylater`) after the standard ones, with the buyer's live limit.
  The buyer answers with a signed `buy_now`; the merchant checks it, signs it twice, as fee payer
  and as the order's merchant, and sends it (`npm run buy -- --pay-later`,
  `tessera buy-later <merchant url> <skill>`). `buy_now` needs the merchant's signature as well as the
  buyer's, and carries the price and request hash the buyer agreed to, which the order must match;
  the merchant's server signs only for the order it opened at the quoted address. So the pool only
  pays an order its merchant agreed to, at the price its buyer agreed to (on devnet too since the
  upgrade of 28 October 2026, see below).

The limit is `tier limit × score ÷ 1000 × on-time boost`, read live from the buyer's Tessera credit
file. A New wallet gets nothing. The escrow program is unchanged; pay-later only reads its accounts
and pays into its vaults with the same plain token transfer an x402 payment is.
**It is on devnet since 27 October 2026:** program `LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D`,
pool `GNf8LpVeJ6ayrVMqABpU1nAHW9ZX7upC2aGqcumWF5Qq`, funded with 8 devnet USDC and holding 8.014 on
28 October, after three loans repaid with their fees (all addresses under
[How Solana powers this](#how-solana-powers-this)). The rules differ by place, and only in time: the
devnet pool has a 600 s term and a 60 s grace period (`DEVNET_LINE_PARAMS`), the local preview
(`npm run paylater:local`, the test suites) 60 s and 5 s (`PREVIEW_LINE_PARAMS`); both have limits of
0 / 2 / 5 / 10 USDC by tier and a 2% fee. The program on devnet was upgraded on 27 October 2026
(slot 515711875) to the build of commit `61196cc`, in which `buy_now` confirms the order itself (the
deployed bytes matched a local build of that commit), and on 28 October 2026 (UTC+8, slot 515766612,
[transaction](https://explorer.solana.com/tx/3vcqaD4McyE5FDa1tHDxEMd8sgdNGTWdk2bm3BGFHQmHx36jmjoYU7ZBdKuVXc4K5KeBYHBjYUG36wVp2AVS7s2E?cluster=devnet))
to the build of `1bd11be`. Later on 28 October (14:17 UTC+8, slot 515961295,
[transaction](https://explorer.solana.com/tx/3YJDEfVq961AwaqKYFwoDRxEfDwJDmLUvXFNHVBjWyGzL9J1U5UrFomjNTLUoxmSG1QN1X1vXunTJBdSwwmp1XgG?cluster=devnet))
it was upgraded to the build of `eca65b0`, the same source rebuilt to name the escrow at its new
address (`tessera::ID`), and the first 403,176 bytes of the program on devnet hash the same as a
local build of that commit (the rest of its account is zeros). So on devnet
`buy_now` requires the order's merchant's signature and carries the price and request hash the buyer
agreed to (cases 7 and 8 of [Failed payments](#failed-payments)). A purchase on credit and its
repayment ran on the `1bd11be` build with the retired escrow, and again on the `eca65b0` build with
the new one ([What is new](#what-existed-before-12-october-2026-and-what-is-new)). The program and the merchant
server must be upgraded together, server first: [docs/PAYLATER.md](docs/PAYLATER.md#upgrading-devnet).
Rules, checks and limits: [docs/PAYLATER.md](docs/PAYLATER.md).

## The score

```
score    = 1000 × Evidence × Rating × Behaviour
Evidence = 0.45 History + 0.30 Tenure + 0.25 Diversity
```

- **History**: settled volume, counted at 10% / 40% / 80% / 100% by the counterparty's tier, capped per pair.
- **Tenure**: time since registration, but only up to three periods per period actually active.
- **Diversity**: distinct counterparties, each at the best tier weight it has held.
- **Rating**: volume-weighted stars from counterparties, shrunk toward 3 stars.
- **Behaviour**: falls 25% for a lost dispute and 10% for a missed delivery, and heals over time.

It is integer arithmetic over public accounts. There are two implementations: the program's
([`score.rs`](programs/tessera/src/score.rs)) and the SDK's ([`score.ts`](packages/sdk/src/score.ts)),
which the website uses. They run the same integer arithmetic, and `npm run test:local` checks that they
agree. Full write-up: [docs/SCORING.md](docs/SCORING.md).

## How Solana powers this

Every decision Tessera makes is made from accounts on Solana, and everything that moves money is a
Solana transaction. There is no database behind it: the programs, the agents, the API and the website
all read the same accounts, and anyone can recompute what they show.

**The escrow program** ([`programs/tessera`](programs/tessera)). Every quote is an order account, a
PDA of `["order", order_id]`, and its vault is that account's associated token account for USDC. An
order is a state machine: `AwaitingPayment → Funded → Delivered → Released`, or `Refunded`,
`Disputed → Resolved`, or `Cancelled` ([`state.rs`](programs/tessera/src/state.rs) line 178). Every
payout is a token transfer signed by the order PDA, so neither side can move the money alone.

**The credit file and the score.** Each wallet has an Agent account, a PDA of `["agent", wallet]`,
holding the counters the score is built from: settled volume by counterparty tier, active periods,
distinct counterparties, ratings, penalties. The score is integer arithmetic over that one account
([`score.rs`](programs/tessera/src/score.rs)). The program runs it when an order opens and sets the
hold from it; the website and the SDK run the same arithmetic in the browser
([`score.ts`](packages/sdk/src/score.ts)). Nothing about a wallet's standing lives off-chain.

**The `payTo` trick.** x402's `exact` scheme on Solana is a plain SPL token transfer, and the
facilitator derives the destination token account from `payTo`. The merchant quotes the order account
as `payTo` ([`apps/agents/src/merchant.ts`](apps/agents/src/merchant.ts), `quote()`), so a standard
x402 payment, settled by a public facilitator, lands in the order's vault with no custom scheme. The
program never takes anyone's word that it was paid: `confirm_funded`
([`lib.rs`](programs/tessera/src/lib.rs) lines 218–238) is permissionless, reads the vault's balance,
and refuses a payment that arrives after the quote's payment window.

**Pay later lends into the escrow.** The pay-later program
([`programs/tessera-paylater`](programs/tessera-paylater)) keeps one pool (`["pool"]`) with its own
USDC vault, a credit line per buyer (`["line", buyer]`) and a loan per purchase
(`["loan", buyer, loan_id]`). `buy_now` ([`lib.rs`](programs/tessera-paylater/src/lib.rs) lines
123–219) is signed by the buyer and by the order's merchant (line 511), is handed the escrow's order
account and the price and request hash the buyer agreed to, checks it is a real order (owned by the
escrow program, at the address its id derives, lines 319–325) opened by that merchant for that buyer
at exactly that price and request (lines 133–134), reads both parties' Agent
accounts and the escrow's config and recomputes their live scores with the escrow's own formula, and
then transfers the price from the pool's vault into the order's vault. That is the same transfer an
x402 payment is, and in the same instruction `buy_now` calls the escrow's permissionless
`confirm_funded` by cross-program invocation (lines 162–170), which reads the vault and marks the order
Funded: the buyer never gets a moment to cancel the quote and take the pool's money. The escrow program did not
change for it. The buyer repays the price plus the pool's 2% fee into the pool; a loan
past its grace period is marked in default by anyone and the line freezes.

**What is read and what is written.**

| | Read, with no signature | Written, as signed transactions |
|---|---|---|
| Escrow program | Config, Agent credit files, orders, vault balances (`getAccountInfo`, `getProgramAccounts`) | `open_order` (merchant), the x402 transfer into the vault (buyer, settled by the facilitator), `confirm_funded` (anyone), `deliver` (merchant), `release`, `refund`, `cancel_unpaid`, `open_dispute`, `resolve_dispute` (a party, the arbiter, or anyone after a deadline), `submit_review` (a party) |
| Pay-later program | Pool, credit lines, loans | `buy_now` (the buyer and the order's merchant sign, the merchant's server pays the network fee), `repay` (anyone, for the buyer), `mark_default` (anyone), `close_loan` (anyone, once repaid; the rent goes to the buyer), `deposit` (anyone), `initialize`, `update_params`, `withdraw` (the pool's authority) |

The website only reads, with no wallet. The API builds unsigned transactions and never sends one it
built. The agents sign with their own keys. A buyer paying through a facilitator needs no SOL. A
buyer on credit pays no network fee (the merchant is the fee payer of its `buy_now`), but it pays the
rent of the loan account `buy_now` opens (230 bytes: 0.00181864 SOL on devnet, 0.00249168 SOL on a
local validator), back when the repaid loan is closed (`tessera repay` closes it in the same
transaction), and on its first purchase the rent of its credit line (105 bytes: 0.00118364 SOL on
devnet, 0.00162168 SOL locally). A first purchase on credit therefore needs exactly 0.00300228 SOL on
devnet, or at least 0.00365252 SOL: the runtime refuses to leave a wallet with some SOL but less than
its own rent-exempt minimum (0.00065024 SOL on devnet), and the 402 says `eligible: false` for a
balance in between. These are `solana rent` on each network on 27 October 2026;
`paylater.buyNowRent` reads the amount from the network it runs on.

**Devnet addresses.**

| | |
|---|---|
| Network | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` (devnet) |
| Escrow program | [`tESs6b4JFTWoNnELMa4KSxPuJDSRaLAtCSUr8BGY6ry`](https://explorer.solana.com/address/tESs6b4JFTWoNnELMa4KSxPuJDSRaLAtCSUr8BGY6ry?cluster=devnet), deployed 28 October 2026 (14:18 UTC+8, slot 515961506, [transaction](https://explorer.solana.com/tx/34QUoV5GAC7yNY9k1Wz7UFeD7fjygddE5q7M9eJdkPwwDtZb745aiWEQd8zuSQSTWmvaPes4p73NdWs5VZBMxwQW?cluster=devnet)) from commit `eca65b0`: the source in this repository, with the audit fixes of 7 and 10 October, so the table above describes what runs on devnet. The first 478,688 bytes of the program on devnet hash the same as a local `anchor build` of that commit (the rest is zeros). Max length 500,000 bytes. |
| Escrow upgrade authority | [`EoNCoL8tDGKpiyyycESkheuMPcQNpLJrAXqjQUCQCCY6`](https://explorer.solana.com/address/EoNCoL8tDGKpiyyycESkheuMPcQNpLJrAXqjQUCQCCY6?cluster=devnet), the deployer, so the escrow can be upgraded |
| Escrow config | [`CvyxNt9ktt4uUMq83jZHbbqzJdNR9Tvd6YBq1ER7FPmS`](https://explorer.solana.com/address/CvyxNt9ktt4uUMq83jZHbbqzJdNR9Tvd6YBq1ER7FPmS?cluster=devnet), created with `npm run setup:devnet -- --light`: fee 100 bps, rules `DEVNET_PARAMS` |
| USDC mint (devnet, Circle) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Escrow config authority, arbiter and treasury | `EoNCoL8tDGKpiyyycESkheuMPcQNpLJrAXqjQUCQCCY6` (the deployer), `72noGuXbToPzDMC29LRFTit8WxMFiiSPFRygoG597f7a` and `3st9cGR4duuiUR1TjCmFmyWWFQp4KMpBAfXkKTnLRAxd`. We hold all three keys, so the config can be changed and the arbiter resolves disputes on devnet. |
| Retired escrow (version 1) | [`TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ`](https://explorer.solana.com/address/TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ?cluster=devnet), config [`DgwhgcXkhNwpouzppHdF7KNACA14U1JWPccFH5ZGeNE2`](https://explorer.solana.com/address/DgwhgcXkhNwpouzppHdF7KNACA14U1JWPccFH5ZGeNE2?cluster=devnet), treasury `2n9iDG52o2oqqdUEbaGEbjYEtyA4Lk4SZb4bsyJ4XPoi`. Last deployed 4 October 2026 (slot 507449356), a build of the first commit (`c6dbcd7`), before the audit fixes of 7 and 10 October. Its upgrade authority and config authority `5i7zzV9hQUCbpg8MXSNJB3QQkL6zscDd8VQKow46vg7E` and its arbiter `3GydKy3acrVxvwyF26oDMwvbxVjrQ5yBDEc1GzUoVKz2` are version 1 keys and were lost, so it can never be upgraded (B13 and B16 stay open on it) and a dispute on it can never be resolved. Retired on 28 October 2026: its accounts, and the runs of 27 and 28 October on it, stay on devnet as history. |
| Pay-later program | [`LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D`](https://explorer.solana.com/address/LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D?cluster=devnet), deployed 27 October 2026 (slot 515513248) from commit `9d543b1`, upgraded the same day to the build of `61196cc` (slot 515711875, [transaction](https://explorer.solana.com/tx/ZsQ12niKDQnMijF1TE5czfHsjFcnNaZ2GB7U7TWb6pLAf3xCgyt2arCza7e9bTAAu7nBHcrzgYviUfn7GoScg5V?cluster=devnet)), on 28 October 2026 (UTC+8) to the build of `1bd11be` (slot 515766612, [transaction](https://explorer.solana.com/tx/3vcqaD4McyE5FDa1tHDxEMd8sgdNGTWdk2bm3BGFHQmHx36jmjoYU7ZBdKuVXc4K5KeBYHBjYUG36wVp2AVS7s2E?cluster=devnet)), and later that day (14:17 UTC+8) to the build of `eca65b0`, which names the new escrow (slot 515961295, [transaction](https://explorer.solana.com/tx/3YJDEfVq961AwaqKYFwoDRxEfDwJDmLUvXFNHVBjWyGzL9J1U5UrFomjNTLUoxmSG1QN1X1vXunTJBdSwwmp1XgG?cluster=devnet)). Max length 420,000 bytes. |
| Pay-later upgrade and pool authority | [`EoNCoL8tDGKpiyyycESkheuMPcQNpLJrAXqjQUCQCCY6`](https://explorer.solana.com/address/EoNCoL8tDGKpiyyycESkheuMPcQNpLJrAXqjQUCQCCY6?cluster=devnet) |
| Pay-later pool | [`GNf8LpVeJ6ayrVMqABpU1nAHW9ZX7upC2aGqcumWF5Qq`](https://explorer.solana.com/address/GNf8LpVeJ6ayrVMqABpU1nAHW9ZX7upC2aGqcumWF5Qq?cluster=devnet). Rules (`DEVNET_LINE_PARAMS`): limits 0 / 2 / 5 / 10 USDC for New / Building / Established / Trusted, step 2,500 bps, boost cap 10,000 bps, term 600 s, grace 60 s, fee 200 bps, merchants at Building or above, loans of at least 0.001 USDC. The pool has no link to the escrow, so it and the credit lines carried over to the new escrow unchanged. |
| Pool vault | [`DK9angk2VJ43sUaUgJB9wpvDmjh4zroVj8zC2UYTXsgV`](https://explorer.solana.com/address/DK9angk2VJ43sUaUgJB9wpvDmjh4zroVj8zC2UYTXsgV?cluster=devnet): 8 devnet USDC on 27 October 2026; 8.009 on 28 October, after two loans repaid with their fees; 8.014 later that day, after the first loan on the new escrow was repaid with its 0.005 fee |
| Merchant server (ops wallet) | [`DJ8sWBFJT5oFW2MTyX1Zok5JWt6QPS3Uang3hHXwcM4R`](https://explorer.solana.com/address/DJ8sWBFJT5oFW2MTyX1Zok5JWt6QPS3Uang3hHXwcM4R?cluster=devnet): fronts the rent of every quote and pays the network fee of each pay-later `buy_now`, for every merchant the server runs; its crank closes unpaid quotes after their payment window, so that rent comes back, and keeps settled orders as on-chain history unless it runs with `CLOSE_SETTLED_ORDERS=1` ([docs/PAYLATER.md](docs/PAYLATER.md#limits) lists what is closed when) |

The demo agents, created on 27 October 2026 because the version 1 agents' keys were lost. On
27 October they traded on the retired escrow. A credit file is an account of the escrow program, so
on the new escrow they started again from nothing, and on 28 October (06:22 to 07:10 UTC) they
earned their tiers again in two swarms: an 8-period one, which stopped at period 4, and a
10-period one (`--fraud-at 4 --noshow-at 5`). Building needs a score of 250 and two active periods,
Established 500 and eight. Tiers as read from the chain:

| Agent | Role | Wallet | Tier (score), new escrow, 28 October 07:09 UTC | Tier (score), retired escrow, 27 October |
|---|---|---|---|---|
| atlas | merchant | [`DzmuSTiwQLnZ4KMtWC3gZ5s68ySstf7UW37Jo4Wm8c2r`](https://explorer.solana.com/address/DzmuSTiwQLnZ4KMtWC3gZ5s68ySstf7UW37Jo4Wm8c2r?cluster=devnet) | Established (511) | Building (343) |
| quill | merchant | [`2hQkyW5yGT4koHL7smK2rye5HzZe489qMdPXmr21aekd`](https://explorer.solana.com/address/2hQkyW5yGT4koHL7smK2rye5HzZe489qMdPXmr21aekd?cluster=devnet) | Established (558) | Building (329) |
| vera | merchant | [`93YALFSrr5dBp1FuZsFRPVeM3w6i3ovrg97PZ9SWVGJk`](https://explorer.solana.com/address/93YALFSrr5dBp1FuZsFRPVeM3w6i3ovrg97PZ9SWVGJk?cluster=devnet) | Established (634) | Building (389) |
| pixel | merchant | [`E6fyFwRFY3fxZRPyLw1n3tsyriCeDcw1C19JCQA4JeJ`](https://explorer.solana.com/address/E6fyFwRFY3fxZRPyLw1n3tsyriCeDcw1C19JCQA4JeJ?cluster=devnet) | Building (487) | Building (317) |
| scout | buyer | [`69FgPAiBm7Cyy42aNYUGB2T9Sw2zEzuj863tmkPHsbuz`](https://explorer.solana.com/address/69FgPAiBm7Cyy42aNYUGB2T9Sw2zEzuj863tmkPHsbuz?cluster=devnet) | Established (539) | New (242) |
| nova | buyer | [`Acy1bCFCSBt8Bhv3vHBExWAoEnp2F6Wi96Mi5CqWt7PW`](https://explorer.solana.com/address/Acy1bCFCSBt8Bhv3vHBExWAoEnp2F6Wi96Mi5CqWt7PW?cluster=devnet) | Building (486) | Building (301) |
| orbit | buyer | [`Dcn1N989PYtdVZYiQobMk2i4qDoS2xsFZRtyNSPJdmrU`](https://explorer.solana.com/address/Dcn1N989PYtdVZYiQobMk2i4qDoS2xsFZRtyNSPJdmrU?cluster=devnet) | Building (483) | New (244) |
| lumen | buyer | [`BXtsho1SuZ8ASfDj9f5esrs8AF9HEBmwMe7gY2sF8KfW`](https://explorer.solana.com/address/BXtsho1SuZ8ASfDj9f5esrs8AF9HEBmwMe7gY2sF8KfW?cluster=devnet) | Building (495) | New (230) |
| drift | buyer | [`B8qmQCeymzNoBVfRg4fMKkFYPa38BeDby9ZGLdn3m6im`](https://explorer.solana.com/address/B8qmQCeymzNoBVfRg4fMKkFYPa38BeDby9ZGLdn3m6im?cluster=devnet) | Established (546) | New (225) |
| echo | buyer | [`2UXartbXrSJxJp69yy2MAcoitsYjorBdgPDokcYfKiLW`](https://explorer.solana.com/address/2UXartbXrSJxJp69yy2MAcoitsYjorBdgPDokcYfKiLW?cluster=devnet) | Building (451) | Building (311) |
| mallory | merchant, no-show | [`EbTnud5vWHwQP3dyQ7WyX8VSytyq8vXThTnJESoCF3NV`](https://explorer.solana.com/address/EbTnud5vWHwQP3dyQ7WyX8VSytyq8vXThTnJESoCF3NV?cluster=devnet) | New (0) | no credit file yet |
| charlie | buyer, friendly-fraud | [`HTirwtNmNAmJq3id3EX3VtELmEAkAQTkyd8wrXaUqmTG`](https://explorer.solana.com/address/HTirwtNmNAmJq3id3EX3VtELmEAkAQTkyd8wrXaUqmTG?cluster=devnet) | New (39) | New (128) |
| washer | merchant, ring-merchant | [`2656oKaw3UBLf18So6w3Kz8Hu713KUX45zgtyyPTEMaw`](https://explorer.solana.com/address/2656oKaw3UBLf18So6w3Kz8Hu713KUX45zgtyyPTEMaw?cluster=devnet) | New (181) | New (118) |
| sock-1 | buyer, ring-buyer | [`EjB382b4sxdrdGEmMJQNoAxgFmn6XxZU5AhmC1XraNKH`](https://explorer.solana.com/address/EjB382b4sxdrdGEmMJQNoAxgFmn6XxZU5AhmC1XraNKH?cluster=devnet) | New (169) | New (93) |
| sock-2 | buyer, ring-buyer | [`C5tNBPJUEuU6WWc9s8DD3Yas87X9fGA4qKPpWfjuotZN`](https://explorer.solana.com/address/C5tNBPJUEuU6WWc9s8DD3Yas87X9fGA4qKPpWfjuotZN?cluster=devnet) | New | New (37) |
| sock-3 | buyer, ring-buyer | [`88Woxx1bva3wMABNYH7EEMKnAKt6ifVofDb6eBHUKTou`](https://explorer.solana.com/address/88Woxx1bva3wMABNYH7EEMKnAKt6ifVofDb6eBHUKTou?cluster=devnet) | New | New (37) |

The same addresses are in [`deployments/devnet.json`](deployments/devnet.json), written by
`npm run setup:devnet` and `npm run setup:paylater`, with the retired escrow under `retired`.

## Failed payments

A payment can fail before it moves, while it moves, or after. Each case below is handled by code, and
in none of them is money left stuck: it never moves, goes back to the buyer, or goes where the
arbiter rules. Line numbers are at the commit this README is in.

1. **The 402 asks more than the buyer allows.** Before paying, the buyer agent reads the price the
   merchant's agent card advertises and takes `--max` if lower; a 402 above that is refused and
   nothing is signed ([`apps/agents/src/http402.ts`](apps/agents/src/http402.ts) lines 44 and 58–60;
   over A2A [`apps/agents/src/buyer.ts`](apps/agents/src/buyer.ts) line 139). It then reads the order
   named as `payTo` from the chain and refuses unless it is its own order, for that amount, in that
   mint, still awaiting payment (`verifyOrderForPayment`, `http402.ts` lines 66–82).
2. **The facilitator rejects the payment, or settlement fails.** The merchant delivers nothing
   until the order's vault is funded. `verifyAndSettle` in
   [`apps/agents/src/facilitator.ts`](apps/agents/src/facilitator.ts) tells the two apart. Up to and
   including verify nothing has been sent: no facilitator reachable, the facilitator the payment
   names as fee payer gone, a verify call that fails, or a verify that rejects the payment is a
   `PaymentRefused`, answered over HTTP with 400 and no note, and the buyer may pay again or another
   way. From the settle call on the payment may have been sent, so a settlement the facilitator
   reports as failed (`SettlementFailed`) is not taken as final: `settleExact`
   ([`apps/agents/src/merchant.ts`](apps/agents/src/merchant.ts) lines 238–271) watches the order's
   vault until it is funded (the payment landed after all, and the purchase goes on) or the
   payment's blockhash expires with the vault still short (it can never land, so nothing was paid: a
   `PaymentExpired`, answered with 400 and "pay again"). If neither shows within 150 s the failure
   stands: 502, the note "Do not pay again. If the escrow was funded, the merchant refunds it before
   the delivery deadline", and the facilitator's own answer as `PAYMENT-RESPONSE`
   ([`apps/agents/src/server.ts`](apps/agents/src/server.ts) lines 328–334). Over A2A an expired
   payment sets the task back to asking for payment (`EXPIRED_PAYMENT`) and the buyer agent pays
   through the next facilitator; otherwise the task fails with `INVALID_PAYLOAD` when the payment
   was refused before it was sent, and with `SETTLEMENT_FAILED` when settlement failed
   ([`apps/agents/src/a2a.ts`](apps/agents/src/a2a.ts) lines 264–278). The facilitator's word is never the proof: after settling, the merchant reads the
   vault (`merchant.ts` lines 697–711) and the program confirms from
   the balance. A payment that did land after a failed answer sits in the order's vault, and the
   merchant's crank finishes or refunds the order (`server.ts` lines 548–566). On devnet on
   28 October, before that watch was added (commit `d6950f3`), 25 purchases in the two swarms on the
   new escrow went through the facilitators, and 3 came back "settlement failed: settlement_pending"
   from x402.org (Solana error #8100002). Nothing was delivered for them, but the transfers had
   landed. Two are traced on chain: echo paid 0.15 USDC into order
   [`9ANY7DHq…`](https://explorer.solana.com/address/9ANY7DHqezbbKEWbNfCk5V3EYaRzq57tqEy7TLJNAzkG?cluster=devnet)
   ([transfer](https://explorer.solana.com/tx/Ra8uPYt1t6bXqzEKMGsmdSxFZn2xf3iwhKESRM6L9Sa6ujmxnT3H1C7fmWJMAbZtYERpvpZg6p2znmUtyZMWiJW?cluster=devnet))
   and 0.20 USDC into [`51z9MPHh…`](https://explorer.solana.com/address/51z9MPHhWoe9aryFyvKC98psPq3HscVB5JPuQNhbpaDC?cluster=devnet)
   ([transfer](https://explorer.solana.com/tx/24QLwE4WeE9TZfq9E2BHBpuqsfFTTaMBu85FELV51mHH8F3NtqU6udvGraysujtg2KiwdHoMhzxZLhb3v3iV7J2Z?cluster=devnet)),
   and when each payment window ended the crank's `cancel_unpaid` sent the money back to echo
   ([`49ebNp5c…`](https://explorer.solana.com/tx/49ebNp5c7hLZ2dewrAMLCbaU2FAAJc9X6JuyUbnbDxkNAvTt1rtcidQ3Kq2ssxzbd9W8m1XaLg9cAiAhH6qemKEe?cluster=devnet),
   [`UhifGoSK…`](https://explorer.solana.com/tx/UhifGoSKiDEuGHdZQDiD1Fw22jKjjbCywKTehbL49CsRNo2hU7QupHqpzoWiK3BUTYXjdDYNjcZ6ZBXxXnczEgj?cluster=devnet))
   and closed the order (case 3): the buyer lost nothing, but got nothing either. That is why the
   merchant now watches the vault. After `d6950f3`, x402.org answered "settlement_pending" three
   more times; each transfer was in the vault when the merchant looked, and all three purchases
   were delivered (see the snapshot under "What is checked").
3. **A quote nobody pays.** The payment window is `unpaidSecs`, 300 s on devnet
   ([`constants.ts`](packages/sdk/src/constants.ts) line 51). `confirm_funded` refuses a payment after
   it ([`programs/tessera/src/lib.rs`](programs/tessera/src/lib.rs) lines 228–231), and the merchant
   refuses one too (`merchant.ts` lines 669–671 and 707–709). `cancel_unpaid` (`lib.rs` line 377)
   closes the quote and sends anything in the vault back to the buyer (lines 394–400): either party at
   any time, or the merchant's payer once the window has passed. The agents' crank cancels every unpaid
   quote past its window (`server.ts` lines 692–700), then closes the tombstone for its rent. With
   `CLOSE_SETTLED_ORDERS=1` it also closes each settled order it paid for once its review window is
   over (lines 711–714); by default those stay as on-chain history.
4. **Funded, and the merchant never delivers.** The delivery deadline is `deliverSecs`, 300 s on
   devnet (`constants.ts` line 50). After it, anyone may call `refund` (`lib.rs` lines 298–319: while
   the order is `Funded`, the merchant at any time, anyone once the deadline has passed); the buyer
   gets the whole amount and the fee is 0. The crank does it at the deadline (`server.ts` lines
   548–566), the CLI does it with `tessera reclaim <order>` ([docs/TRY-IT.md](docs/TRY-IT.md), step 11),
   and the merchant's score takes a 10% missed-delivery penalty. On devnet on 28 October, on the new
   escrow, mallory took three orders and never delivered, and the crank refunded each at its delivery
   deadline ("[crank] refunded 2ubRL32m: mallory never delivered"): order
   [`2ubRL32m…`](https://explorer.solana.com/address/2ubRL32mF9A1F64o5jGm1yjjjK1gpkgtUkfY4DrAswUW?cluster=devnet)
   (0.30 USDC from nova), refund transaction
   [`uoVsBaDb…`](https://explorer.solana.com/tx/uoVsBaDb3u5TKf78AE2HGzsuwCmPA7tBBe8kD3fcJZ43ME5ef7zEQoUEJvDxRs2eLC2gXN4Vo1chadtt4nyvNNd?cluster=devnet),
   and the orders
   [`7LFgZHZR…`](https://explorer.solana.com/address/7LFgZHZRDV8FBSGpkpBCxj42mCGWXy9UnSYjeZLdff4z?cluster=devnet)
   (scout's) and
   [`BNTe6SSu…`](https://explorer.solana.com/address/BNTe6SSuPqHiUm17vSUQrVGutBrTBa2rv2dzqkuZwmZg?cluster=devnet)
   (orbit's). Mallory ended the swarm New, with a score of 0.
5. **A pay-later header that fails verification.** Nothing is signed until every check passes.
   The `accepted` entry must be one that was quoted (`merchant.ts` lines 637–641), and the order at
   the quoted address must be the one this merchant opened (lines 665–668, case 9). `settlePayLater`
   ([`apps/agents/src/paylater.ts`](apps/agents/src/paylater.ts) lines 200–230) requires a
   `payload.transaction` (line 203), an order of the merchant whose key it was handed (line 205), and
   hands the transaction to `checkBuyNowTransaction`
   ([`packages/sdk/src/paylater/index.ts`](packages/sdk/src/paylater/index.ts) lines 292–406), which
   refuses a transaction that is not legacy or version 0, uses lookup tables, lists any account twice,
   has a fee payer other than the merchant's wallet, signers other than exactly the merchant's wallet,
   the buyer and the order's merchant (one wallet when the merchant pays its own fees; the buyer is
   neither), the merchant asked to sign writable, no buyer signature or any signature but the
   buyer's, a compute unit limit above `BUY_NOW_COMPUTE_UNITS` (400,000) or a priority fee above
   `MAX_CU_PRICE` (10,000 micro-lamports per unit), so at most 4,000 lamports of priority fee, more
   than one of either, any instruction other than those compute-budget settings followed by one
   `buy_now` of the pay-later program, a `buy_now` carrying another price or request hash than the
   quote's (case 8), or a `buy_now` any of whose accounts is not the one this order derives. Only
   then does the merchant sign, with its ops wallet and its own key (`paylater.ts` lines 225–226), and
   it simulates before sending (lines 229–230), so the program's own refusals (`NotTheBuyer`, `OrderAlreadyFunded`,
   `PaymentWindowClosed`, `CreditLimitExceeded`, `PoolEmpty` and the rest,
   [`programs/tessera-paylater/src/lib.rs`](programs/tessera-paylater/src/lib.rs) lines 127–155)
   stop it before anything is sent. A refusal is a `PaymentRefused`: HTTP 400 without the "do not pay
   again" note (`server.ts` lines 328–334), `INVALID_PAYLOAD` over A2A, and the buyer may pay another
   way. A `buy_now` that passed the simulation and then failed on-chain (the buyer cancelled its
   order in between) changed nothing but the fee, so it is a `PaymentRefused` too (lines 245–249),
   and after three in an hour that wallet is offered no credit for the hour. The 402 already says
   `eligible: false` with a reason when the program would refuse (`paylater.ts` lines 113–146), and
   the buyer agent does not try then (`buyer.ts` line 137, `http402.ts` line 56).
6. **A pay-later loan not repaid.** Each loan carries `due_at` and `default_after` (a 600 s term and a
   60 s grace period in the devnet pool, 60 s and 5 s under the local preview rules). `mark_default`
   ([`programs/tessera-paylater/src/lib.rs`](programs/tessera-paylater/src/lib.rs) lines 278–293) may
   be called by anyone once `default_after` has passed: the loan is `Defaulted`, the buyer's limit is 0
   from then on ([`limit.ts`](packages/sdk/src/paylater/limit.ts) line 26), the debt stays and can
   still be repaid late. The agents server is the keeper: `markOverdue` (`apps/agents/src/paylater.ts`
   lines 267–288) reads the open loans and marks every one past its grace period, at most 20 per pass,
   run by `keep()` (`server.ts` lines 740–750) every `KEEPER_MS` (default 30 s,
   [`config.ts`](apps/agents/src/config.ts) line 91). The buyer's next 402 says its line is frozen.
   If the escrow refunds an order the pool paid for, the refund goes to the buyer and the loan stays
   owed (`lib.rs` lines 117–122); a buyer that keeps it defaults like any other.
7. **A purchase on credit the merchant never agreed to.** The retired escrow (`TessSeP5…`, the
   4 October build) does not need the merchant's signature for `open_order`, so there a buyer can
   open an order in any merchant's name and pay its rent itself. Had the pool funded such an order,
   the merchant would never deliver it, anyone could have the escrow refund the pool's money to the
   buyer after the delivery window, as cash, and the merchant would take a missed-delivery penalty
   for an order it never saw. On the escrow on devnet since 28 October, the source in this
   repository, `open_order` needs the merchant's signature (B13), so the order itself is refused.
   `buy_now` requires the signature of the order's merchant
   ([`programs/tessera-paylater/src/lib.rs`](programs/tessera-paylater/src/lib.rs) line 511), so the
   pool pays only an order its merchant signed for, on any escrow build: a buyer's `buy_now` without
   it fails with `AccountNotSigner` and nothing moves. Over x402 the merchant's server adds that
   signature only after every check of case 5. `npm run test:paylater` sent the attack on the
   retired escrow's bytes (`ESCROW_SO`) and it failed (see [What is checked](#what-is-checked)). The
   pay-later program on devnet has this check since its upgrade of 28 October 2026 to the build of
   `1bd11be`, and keeps it in the build of `eca65b0`. The purchases on credit run on each, on the
   retired escrow and on the new one, were signed by the merchant server as fee payer, the buyer and
   the order's merchant.
8. **A merchant reprices the order behind the buyer's signature.** On the retired escrow either
   party may close an unpaid order at any time, and anyone may open another at the same address at
   once. A merchant handed a buyer's signed `buy_now` could cancel its quote, reopen the same id for
   that buyer at a higher price, and send the buyer's transaction before its blockhash expires. The
   buyer's checks (the advertised price, `--max`, the on-chain order) all ran before it signed. On
   the escrow on devnet since 28 October, `cancel_unpaid` leaves the order as a `Cancelled`
   tombstone until `close_order` (B16), so the reopen itself fails.
   `buy_now(loan_id, amount, request_hash)` carries the price and request hash the buyer verified,
   and refuses an order that does not carry exactly those (`lib.rs` lines 133–134, `PriceMismatch`,
   `RequestMismatch`); the buyer's clients pass what they checked (`http402.ts` line 92, `buyer.ts`
   line 263, the CLI). `npm run test:paylater` with `ESCROW_SO` repriced an order on the retired
   escrow's bytes after the buyer signed, and the buyer's `buy_now` failed, nothing moving. The
   pay-later program on devnet has this check since the same upgrade; the `buy_now` of the purchase
   run on each build
   ([`1K7VsBKV…`](https://explorer.solana.com/tx/1K7VsBKVWYHXmMmEdytiUck99inmuuRQuYfDUBAyGuhpzQ7b4vou7CkAT9L73hTBxo7CfURvpVGvLsfAf44b2xG?cluster=devnet)
   on the retired escrow,
   [`2mZxEzfu…`](https://explorer.solana.com/tx/2mZxEzfu5ReApNejhCz7GMEwkkBJc7rafjiG3LUiKPNGx1J3oFhxEty3xdLtFfdrJ8Aevauzoy4NX3xVGZJMnzW8?cluster=devnet)
   on the new one) carries the amount 250000 (0.25 USDC) and the request hash after the loan id.
9. **A buyer swaps the order at the quoted address.** The retired escrow lets the buyer cancel the
   merchant's quote and open an order at its address in the merchant's name, without the merchant's
   signature, at the minimum price or with a hold of its choosing. On the escrow on devnet since
   28 October a cancelled order stays as a tombstone (B16) and `open_order` needs the merchant's
   signature (B13), so no order can be opened in its place; the merchant server checks all the
   same. It compares the
   order at the quoted address with its record of the quote (buyer, merchant, mint, price, request
   hash, hold, rent payer, time opened: `quotedOrderRefusal` in
   [`packages/sdk/src/verify.ts`](packages/sdk/src/verify.ts)) before it signs for or settles any
   payment (`merchant.ts` lines 665–668), compares the price and request again before it confirms or
   delivers a funded order and refunds one that is not its quote (lines 701–702 and 738–739), and
   drops a quote whose address now holds another order. `npm run test:paylater-402` with `ESCROW_SO`
   swapped two quotes on the retired escrow's bytes, one at a lower price and one at the quoted price
   with a day-long hold, and the server refused both before signing.
10. **A `PAYMENT-SIGNATURE` header that is not a payment.** A header that does not decode as a
    base64 x402 payment payload, or is x402 version 1, was never sent anywhere: `paymentFrom`
    (`server.ts` lines 285–297) refuses it as a `PaymentRefused`, answered with 400 and no "do not
    pay again" note. Before commit `65a4760` it was answered with 502 and that note. On 28 October
    the merchant server running against the new escrow on devnet answered
    `curl -i http://localhost:4020/agents/atlas/x402/telemetry -H 'PAYMENT-SIGNATURE: not-a-payment'`
    with `HTTP/1.1 400 Bad Request` and
    `{"error":"the PAYMENT-SIGNATURE header is not a base64-encoded x402 payment payload"}`.
11. **A buyer disputes a delivery it received.** A buyer may dispute a `Delivered` order before its
    release time (`open_dispute`, `lib.rs` lines 323–340); the money stays in the vault until the
    arbiter recorded on the order splits it (`resolve_dispute`, lines 348–364). Whoever gets less
    than half lost, and a buyer that loses takes a 25% score penalty; if the arbiter never answers,
    anyone may split the vault evenly once the complaint period has passed. The agents server's
    arbiter (`arbitrate`, `server.ts` lines 617–635) checks that what the merchant holds is what it
    committed on-chain and a valid answer to the order. On devnet on 28 October, on the new escrow,
    charlie received valid deliveries from atlas and disputed them, and the arbiter resolved both
    for the merchant: order
    [`4ucYtGWm…`](https://explorer.solana.com/address/4ucYtGWmUCSmWMQUkskJUS2d64Q6foGzcPKTCMbj8hvY?cluster=devnet)
    (0.20 USDC;
    [dispute](https://explorer.solana.com/tx/EEw7JCmrgev7SVep7bKLZWhYv1EmFKWfxgeHWbB5cT523qVHinidKkM25s49eg4rRuBZxdvvZ35u9cMwmTCsTah?cluster=devnet),
    [resolution](https://explorer.solana.com/tx/3DeAoBaQGHWe8djQ7Urr2rjyDXaU7DyEP8XQeinwZPt91F74umXbMLBt8AXS8V1Zb6omjPWvCrUXfCnw2o4tPfYo?cluster=devnet);
    the server logged "delivery matches the on-chain hash and is valid; merchant atlas wins (buyer
    had prior undisputed purchases here)") and order
    [`Gqq61SPG…`](https://explorer.solana.com/address/Gqq61SPGPZD3DizE4GNvWAvgC9pprLztzdL9tborHwoh?cluster=devnet)
    ([dispute](https://explorer.solana.com/tx/2dLQirdDRtbWb2PTbF7M2JDrS5vXz6RhEZRdj2G6NcXdsyShYBsSdNhbnoCUwoasZp84QeWvNBeyUAeVseecXq11?cluster=devnet),
    [resolution](https://explorer.solana.com/tx/2NWncCem6Nv8ee6q2aLX2UoSyKCu9qSxwZgsoG8jUCp4kdddfTH4SJUKRT1UiWh8FFhzk5s4EBqMPuwuPey5skjk?cluster=devnet),
    "merchant atlas wins"). Charlie stayed New (39). On the retired escrow a dispute can never be
    resolved, because its arbiter's key is lost.

## What existed before 12 October 2026 and what is new

The Encode Club hackathon judges only work done in its window. The tag `v1-submission` (11 October
2026) marks version 1, and every commit dated 12 October or earlier is prior work: `git log --date=short`
shows the dates, and `git diff c5e048c..v2 --stat` (`c5e048c` is the last commit of 12 October) is the
whole in-window diff.

**Before (prior work):** the escrow program's source, its score, reviews, disputes and arbiter
([`programs/tessera`](programs/tessera)), and its version 1 deployment on devnet (`TessSeP5…`, now
retired); the merchant and buyer agents, the swarm, the crank, the
x402 route and the facilitator path ([`apps/agents`](apps/agents)); the HTTP API, MCP server, skill
and CLI ([`apps/api`](apps/api), [`apps/mcp`](apps/mcp), [`skills/tessera`](skills/tessera),
[`apps/cli`](apps/cli)); the website, the decks and all three demo videos ([`apps/web`](apps/web));
review rewards and the Agent Registry bridge ([`scripts`](scripts)); and the pay-later program as a
preview in which `buy_now` took the price as an argument and paid the merchant's token account
directly, outside the escrow, with the CLI commands `credit`, `buy-later --order`, `repay`,
`repay --all` and `mark-default`, `scripts/paylater-local.ts`, `scripts/test-paylater.ts` and
`docs/PAYLATER.md`, on a local validator only and with no place in the 402.

**New in the window** (commits from 22 October on):

- **Pay later lends into the escrow.** `buy_now` now reads the escrow's order, pays the order's vault
  and leaves the rest to the escrow; the fee is owed by the buyer at repayment; a refund by the escrow
  leaves the loan owed. `programs/tessera-paylater/src/lib.rs`, `state.rs`, `errors.rs`; the generated
  client under `packages/sdk/src/paylater/generated`; `packages/sdk/src/paylater/index.ts`.
- **The x402 pay-later option.** A merchant's 402 carries a `tessera-paylater` entry after its
  `exact` ones, with the buyer's live limit and whether the pool would fund it; the buyer answers with
  a signed `buy_now`; the merchant checks it, signs as fee payer (and, since the change below, as
  the order's merchant), sends it and delivers.
  `apps/agents/src/paylater.ts` (new), `merchant.ts`, `server.ts`, `a2a.ts`, `chain.ts`, `config.ts`;
  in the SDK `PayLaterOffer`, `buyNowForMerchant`, `checkBuyNowTransaction`, `buyOrderOnCredit`,
  `fetchOpenLoans`; `docs/A2A-EXTENSION.md`.
- **The buyer agent and CLI flow.** `npm run buy -- --pay-later` and `npm run buy:http -- --pay-later`
  (`apps/agents/src/buyer.ts`, `buy.ts`, `http402.ts`); `tessera buy-later <merchant agent url> <skill>`
  and `--input` (`apps/cli/src/paylater.ts`, `cli.ts`); `tessera credit` shows due dates.
- **The keeper.** `markOverdue` in `apps/agents/src/paylater.ts`, run by `keep()` in `server.ts`.
- **The website.** `apps/web/src/lib/paylater.ts` (new) reads the pool, a wallet's line and its
  loans; the Agents and Market pages show them where the pool exists (`Agents.tsx`, `Market.tsx`).
- **Tests and docs.** `scripts/test-paylater-402.ts` (new, 77 checks), `scripts/test-paylater.ts`
  rewritten for the escrow flow (101 checks), `scripts/paylater-local.ts`, `scripts/lib.ts`
  (`TESSERA_KEYS_DIR`), `packages/sdk/test/paylater-check.test.ts` (new); `docs/PAYLATER.md`,
  `docs/ENCODE-CHECKLIST.md`, this README.
- **The merchant signs every purchase on credit (27 October, after the `61196cc` upgrade).** `buy_now` requires
  the order's merchant's signature, so the pool cannot be made to fund an order its merchant never
  agreed to, which the retired escrow allows anyone to open (case 7 of
  [Failed payments](#failed-payments), [SECURITY.md](docs/SECURITY.md#pay-later) P1). The merchant
  server signs with the merchant's key after its checks, `checkBuyNowTransaction` requires exactly
  the fee payer, the buyer and the merchant as signers, and `buyOrderOnCredit` and
  `tessera buy-later --order` take the merchant's key. On devnet since the upgrade of 28 October.
- **The price is in what both parties sign, and the server signs only its own order (28 October).**
  `buy_now(loan_id, amount, request_hash)` carries the price and request hash the buyer verified, and
  the program refuses an order that does not carry exactly those, so a merchant can no longer reprice
  an order behind a buyer's signed `buy_now` on the retired escrow (case 8 of
  [Failed payments](#failed-payments), [SECURITY.md](docs/SECURITY.md#pay-later) P2). The merchant
  server compares the order at its quoted address with its quote before it signs or delivers (case 9,
  P3). `tessera repay` and `repay --all` close each loan they repay, so the buyer gets the loan's rent
  back; with `CLOSE_SETTLED_ORDERS=1` the crank closes the settled orders whose rent the ops wallet
  fronted once their review window is over (off by default, to keep them as history); the demo faucet keeps 0.1 SOL in the ops wallet and quotes stop below 0.03 SOL; a
  failed-on-chain `buy_now` is answered as refused, with a lower priority-fee cap (P4); the crank
  stops re-reading disputes it cannot judge; the 402 accounts for a wallet's own rent-exempt minimum.
  The program's part is on devnet since the upgrade of 28 October, made after the merchant server
  was restarted on the new commit ([docs/PAYLATER.md](docs/PAYLATER.md#upgrading-devnet)).
- **Pay later on devnet (27 October).** The pay-later program deployed to devnet
  (`LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D`, slot 515513248, built from `9d543b1`), and its pool
  created with the devnet rules and funded with 8 devnet USDC. `scripts/setup-paylater-devnet.ts`
  (`npm run setup:paylater`, new) does both again, idempotently, and `paylater.DEVNET_LINE_PARAMS` holds
  the rules. The same day the program was upgraded to the build of `61196cc`, in which `buy_now`
  confirms the order itself (slot 515711875, transaction
  [`ZsQ12niK…`](https://explorer.solana.com/tx/ZsQ12niKDQnMijF1TE5czfHsjFcnNaZ2GB7U7TWb6pLAf3xCgyt2arCza7e9bTAAu7nBHcrzgYviUfn7GoScg5V?cluster=devnet)).
  The pool kept its rules and its 8 USDC through the upgrade.
- **First purchase on credit on devnet (27 October, on the retired escrow).** Nova (Building, score 341) bought Atlas's
  0.20 USDC telemetry report through the 402's `tessera-paylater` option, with
  `npm run buy -- --buyer nova --merchant atlas --pay-later`: order [`j8Bfe9k5…`](https://explorer.solana.com/address/j8Bfe9k5QejA48pQQH3ca2LzHgQqpNGAtkbqhaRLQYh?cluster=devnet),
  settle transaction [`ttLNpyhU…`](https://explorer.solana.com/tx/ttLNpyhUrgMoTkobtBB3QveynRHrBcnwDxyzYSsc5YYsUrfWncVAD2LLmAxRLHLAFJTg4Dr6jEzm2CJPTjMkoHw?cluster=devnet) (the merchant server as fee payer; `BuyNow` moves the
  pool's 0.20 USDC into the order's vault and calls the escrow's `ConfirmFunded` inside the same
  instruction, 123,734 compute units), loan [`hEppTpuw…`](https://explorer.solana.com/address/hEppTpuwxfcS9Fyp7koittoPADBS5HhcsSMgXc9uH4G?cluster=devnet), delivered, held 45 s and
  released. Nova then repaid 0.204 USDC with `npm run tessera -- repay --all --keypair .keys/agents/nova.json --send`
  (transaction [`2tyLtJe2…`](https://explorer.solana.com/tx/2tyLtJe2nabhmjeUtCh4hzQymwQxGzFGbz1KM6KqQNxQHTiLyanUeSS2igjM58WdEmHdJkubZyWMUtJTqyAU2r6?cluster=devnet), on time). Its limit went from 0.682 to 0.74825 USDC: the score
  rose to 365 and the boost by 2.5%, the 25% step scaled by 0.20 / 2.00. The pool afterwards: lent
  0.20, repaid 0.20, 8.004 USDC in the vault.
- **Upgrade and a purchase on credit on devnet (28 October, UTC+8, on the retired escrow).** With the merchant server
  restarted on the new commit first, the pay-later program was upgraded to the build of `1bd11be`
  (slot 515766612, transaction [`3vcqaD4M…`](https://explorer.solana.com/tx/3vcqaD4McyE5FDa1tHDxEMd8sgdNGTWdk2bm3BGFHQmHx36jmjoYU7ZBdKuVXc4K5KeBYHBjYUG36wVp2AVS7s2E?cluster=devnet)),
  in the order [docs/PAYLATER.md](docs/PAYLATER.md#upgrading-devnet) gives. Nova (Building, score
  365, limit 0.74825 USDC) then bought Quill's 0.25 USDC summary on credit over A2A, with
  `npm run buy -- --buyer nova --merchant quill --pay-later`: order [`8VAF9ZWQ…`](https://explorer.solana.com/address/8VAF9ZWQrdGVtcuvifh5GG4yPExp2iXE3S8fh3DmHn3b?cluster=devnet),
  settle transaction [`1K7VsBKV…`](https://explorer.solana.com/tx/1K7VsBKVWYHXmMmEdytiUck99inmuuRQuYfDUBAyGuhpzQ7b4vou7CkAT9L73hTBxo7CfURvpVGvLsfAf44b2xG?cluster=devnet) (signed by the merchant server as fee payer, Nova,
  and Quill as the order's merchant; its `buy_now` carries the amount 250000 and the request hash
  after the loan id, and `BuyNow` calls the escrow's `ConfirmFunded` inside it), loan [`9sS9yBDG…`](https://explorer.solana.com/address/9sS9yBDGggQr3WUeCidPsLa5pwviiEGEi4Nf3z4T2Zoc?cluster=devnet),
  delivered with the hash committed on chain, held 45 s and released to Quill. Nova repaid 0.255 USDC
  on time (transaction [`3oL3qukd…`](https://explorer.solana.com/tx/3oL3qukdUPiM6Tvgd8D8RM8XsUgTHjqMQiuGjZLUHiJEMYKnMr5sk8XKQkwXA6CoMSPoC2XUBAwFoyXguBYNEiJu?cluster=devnet): `Repay`, then `CloseLoan`, the
  loan's rent back to Nova). Afterwards its score was 388 and its limit 0.819611 USDC: 2 loans, both
  on time, boost +5.62%.
- **New demo agents (27 October).** The version 1 agents' keys were lost, so a new merchant server
  key and sixteen new agent wallets were created and funded (`npm run setup:devnet -- --light`, the
  smaller amounts added to `scripts/setup-devnet.ts`), and traded on the escrow then on devnet (now
  retired) until four merchants and two buyers reached Building. On 28 October they earned their
  tiers again on the new escrow. Their addresses are in `deployments/devnet.json` and under
  [How Solana powers this](#how-solana-powers-this).
- **The escrow at a new address on devnet (28 October, UTC+8).** The version 1 escrow (`TessSeP5…`)
  can never be upgraded: its upgrade key, config authority and arbiter are lost, so B13 and B16 stay
  open on it and a dispute on it can never be resolved. The same source was deployed at a new
  address,
  [`tESs6b4J…`](https://explorer.solana.com/address/tESs6b4JFTWoNnELMa4KSxPuJDSRaLAtCSUr8BGY6ry?cluster=devnet),
  with the deployer `EoNCoL8…` as upgrade authority (14:18 UTC+8, slot 515961506, transaction
  [`34QUoV5G…`](https://explorer.solana.com/tx/34QUoV5GAC7yNY9k1Wz7UFeD7fjygddE5q7M9eJdkPwwDtZb745aiWEQd8zuSQSTWmvaPes4p73NdWs5VZBMxwQW?cluster=devnet)).
  Commit `eca65b0` changes only `declare_id!` (`programs/tessera/src/lib.rs` line 16) and
  `Anchor.toml`; the SDK clients and IDL are regenerated, and the website reads the address from the
  SDK. `npm run setup:devnet -- --light` created the config
  [`CvyxNt9k…`](https://explorer.solana.com/address/CvyxNt9ktt4uUMq83jZHbbqzJdNR9Tvd6YBq1ER7FPmS?cluster=devnet),
  whose arbiter and treasury keys we hold. Fifty seconds before the deployment, the pay-later
  program was upgraded to its unchanged source rebuilt to name the new escrow (slot 515961295,
  transaction
  [`3YJDEfVq…`](https://explorer.solana.com/tx/3YJDEfVq961AwaqKYFwoDRxEfDwJDmLUvXFNHVBjWyGzL9J1U5UrFomjNTLUoxmSG1QN1X1vXunTJBdSwwmp1XgG?cluster=devnet));
  its pool has no link to the escrow, so the pool and the credit lines carried over. Both programs
  were dumped from devnet and compared with local builds of `eca65b0`: the first 478,688 bytes of
  the escrow and the first 403,176 bytes of pay later hash the same, and the rest of each is zeros.
  The demo agents then earned their tiers again in two swarms
  ([How Solana powers this](#how-solana-powers-this)), with three no-show refunds and two disputes
  resolved by the arbiter on the way (cases 4 and 11 of [Failed payments](#failed-payments)). These
  runs confirmed it, all on 28 October on the new escrow:
  - Pay later, with `npm run buy -- --buyer nova --merchant quill --pay-later`: Nova at Building,
    Quill at Established, the pair trusted, a 10 s hold; "on credit; limit 1.026626 USDC, owing
    0.00; fee 0.005, due in 600s". Order
    [`Fi68yAxK…`](https://explorer.solana.com/address/Fi68yAxKs6ZF3bumeMvJmXDBSzsKuszo94gTwVfwm7S8?cluster=devnet),
    settle transaction
    [`2mZxEzfu…`](https://explorer.solana.com/tx/2mZxEzfu5ReApNejhCz7GMEwkkBJc7rafjiG3LUiKPNGx1J3oFhxEty3xdLtFfdrJ8Aevauzoy4NX3xVGZJMnzW8?cluster=devnet)
    (signed by the merchant server as fee payer, Nova and Quill; `BuyNow` calls the new escrow's
    `ConfirmFunded` inside it), loan
    [`35R7bZzw…`](https://explorer.solana.com/address/35R7bZzwWKyYHoGoSZYwy37m8mpJavdWvNL5RqArxU1U?cluster=devnet),
    owing 0.255 USDC (0.25 plus the pool's 0.005 fee). Delivered, the hash checked against the one
    committed on chain, and released; 23.2 s in all.
  - Repayment, with `npm run tessera -- repay --all --keypair .keys/agents/nova.json --send`:
    0.255 USDC in one transaction,
    [`4LUwpKcB…`](https://explorer.solana.com/tx/4LUwpKcBk6mGvKf1hN6bJ4yZq8Aub292AuPHtyN4RpnMkjcQV9KTqzWGjDXy9U65C6AJtge2ebZPV6PYijf4jQnY?cluster=devnet).
    Nova afterwards: Established, score 527, limit 2.865299 USDC, 3 loans, all on time, boost +8.74%.
  - A refusal: `npm run buy -- --buyer charlie --merchant atlas --pay-later` answered "not eligible
    for pay later: the buyer has no credit yet (New, score 40)", and nothing was bought.
  - x402 `exact` over plain HTTP, through a facilitator, with
    `npm run buy:http -- --buyer scout --merchant atlas`: a 402 for 0.20 USDC, the escrow checked
    on-chain, the request with `PAYMENT-SIGNATURE` answered 200, settle transaction
    [`25wZATKr…`](https://explorer.solana.com/tx/25wZATKrmSYxL1hmAEjYoeHtcLFRWzVtGyTDJ112AiHLTLgza4hHPmQcYby2trq7KdqvhyyWABmnJPMsk89JNhu4?cluster=devnet),
    order Delivered.
  - A header that is not a payment, answered 400 (case 10 of [Failed payments](#failed-payments)).
- **x402 failures (28 October).** A payment that was never sent (a header that is not an x402
  version 2 payment, no reachable facilitator, the named facilitator gone, a refusal at verify) is a
  `PaymentRefused`: 400, with no "do not pay again" note (`65a4760`). After a settlement the
  facilitator reports as failed, the merchant watches the order's vault until the payment lands or
  its blockhash expires (`d6950f3`); if neither shows, the 502 carries the facilitator's answer as
  `PAYMENT-RESPONSE` (`65a4760`). Case 2 and case 10 of [Failed payments](#failed-payments).
  `apps/agents/src/facilitator.ts`, `server.ts`, `merchant.ts`, `a2a.ts`, `buyer.ts`;
  `scripts/test-paylater-402.ts` section 8.

The escrow program's source (`programs/tessera`) was not changed in the window except for its
address: its deployment at `tESs6b4J…` on 28 October is new, and the source it runs is prior work.
The version 1 deployment is older still: it was deployed on 4 October (slot 507449356), a build of
the first commit, before the audit fixes of 7 and 10 October, and its upgrade key was lost with the
version 1 keys; it is retired. The pay-later program was deployed to devnet in the window, on
27 October, and upgraded on 27 October and twice on 28 October.

## What is checked

| Command | Result | What it proves |
|---|---|---|
| `npm run test:local` | **395 / 395** | Runs the real program on a local validator. After every instruction, every account is compared field by field with a reference model. Every attack in [docs/SECURITY.md](docs/SECURITY.md) is sent as a real transaction and must fail. |
| `npm run test:paylater` | **101 / 101** (103 / 103 on the retired escrow's bytes) | The pay-later program next to the real escrow program on a local validator: every purchase on credit goes through a real escrow order the merchant signed for (a `buy_now` without the merchant's signature fails, and on the retired escrow's bytes, which let a buyer open an order in a merchant's name, so does the buyer's `buy_now` for that order; the pool pays the vault and the escrow confirms it in the same instruction, so a buyer's `buy_now` plus `cancel_unpaid` fails whole and a later cancel is refused; the escrow pays the merchant), the `buy_now` carries the agreed price and request hash (another one is refused, and on the retired escrow's bytes a merchant that reprices the order after the buyer signed gets a failed `buy_now`), the boost follows the size of what was repaid, limits from live Tessera scores matched against the off-chain formula, on-time repayment of price plus fee, a tab of three settled and closed with `tessera repay --all` (one bought with `tessera buy-later --order`, which needs the merchant's key as well as the buyer's), default and freeze, an escrow refund with the loan still owed, pool accounting, the crank closing settled orders for their rent, and the refusal paths as real transactions. |
| `npm run test:paylater-402` | **77 / 77** (72 / 72 on the retired escrow's bytes, before section 8 was added) | Pay later over x402, with the real merchant server on a local validator: the 402 offers the order on credit after its exact entries with the buyer's live limit, a tiered buyer hands over a signed `buy_now` and the merchant settles and delivers (plain HTTP, the CLI and the buyer agent over A2A), `repay --all` clears the tab and closes the loans, a New wallet is told it is not eligible, forged headers (a `cancel_unpaid` after the `buy_now`, a unit limit above the cap, another price or request hash than the quote's, another account as the escrow program, a `buy_now` that does not ask for the merchant's signature, a signer more, and more) are refused before the merchant signs, on the retired escrow's bytes an order the buyer swapped in at the quoted address is refused too, the demo faucet keeps the ops wallet above its floor, the merchant's `buy_now` carries the ops wallet's, the buyer's and the merchant's signatures and runs `confirm_funded` by CPI within its compute budget, and the keeper marks an unpaid loan in default. Section 8, with the stock x402 client and a stub facilitator: an `exact` payment the facilitator refuses at verify gets 400 and no "do not pay again" note; one it reports as not settled is watched until it lands or its blockhash expires, and one that never lands gets 400 saying nothing was paid, while one that lands anyway is delivered; a header that is not a payment, or is x402 version 1, gets 400. |
| `npm run test:formula` | **55 / 55** | The guarantees stated in the docs and on the site, as tests, including the review-reward rules and the merchant's check of a pay-later transaction. |
| `npm run demo:rewards` | **pass** | The review-reward rebate on a local validator with the real program: real purchases and reviews, a merchant that then misses a delivery, and a real payout from the treasury. It checks each reward and label, the on-chain balances, the 75%-of-fees bound, and that `--verify` recomputes the payout. |
| `npm run test:doors` | **pass** (94 checks) | All four doors against the real program on a local validator: every API tool and refusal path with transactions signed and sent, `find_merchants` against real and copycat agent cards, the MCP tools and their enums, SKILL.md, and the CLI signing locally and refusing a tampered transaction from a fake API. |
| `npm run test:agents` | **pass** | The merchant and buyer agents against the real program on a local validator: a co-signed quote, a direct payment, delivery with its evidence kept for the arbiter, release, and both reviews in the order the program weighs them. |
| `npm run registry -- --verify` | **28 / 28** | Version 1 merchants. Every Tessera review mirrored into the Solana Agent Registry on devnet is read back from the registry and matched against the Tessera review account it points at. |

The counts in parentheses were run with `ESCROW_SO` set to the retired escrow's bytes, dumped from
devnet, before commit `eca65b0`. They reproduce the retired build only, which let a buyer open an
order in a merchant's name and reopen a cancelled order's address at once. That build declares the
old address, so `ESCROW_SO` runs against it no longer apply at this commit; the escrow on devnet
now is the source the other counts run.

The snapshot below reads the escrow on devnet now (`tESs6b4J…`), taken on 28 October 2026 after the
swarms that earned the 2.0 agents their tiers there. Its "purchases timed" and "whole purchase" rows
cover every delivered purchase in [`deployments/measurements.jsonl`](deployments/measurements.jsonl),
including version 1's on the retired escrow (4 October). Since 28 October 07:24 UTC the swarm
records every attempt, failures with their reason, and the reliability rows count only those, for
honest buyers buying from honest merchants (the cast's attackers fail on purpose). Read them
this way:

- **21 of the 23 failures were quotes refused before any payment**: the merchant server's ops
  wallet, which fronts each quote's rent, ran down to its SOL floor in a 10-period swarm and opened
  no new quotes until it was topped up. That is this demo's operator running out of devnet SOL, not
  a payment failing; it is refused in plain words and nothing is signed.
- **2 were x402.org answering "settlement_pending"**, on the server before commit `d6950f3`. Both
  transfers had landed; the merchant gave up on them, and the crank's `cancel_unpaid` returned the
  money to the buyer when the payment window ended (failed payments, case 2). Of the 39 attempts
  in that swarm that reached a payment, 37 were delivered.
- **After `d6950f3`** (a 6-period swarm, 07:44–07:59 UTC, every honest purchase through a
  facilitator): 36 of 36 delivered, median 46.0 s, 95th percentile 70.4 s. x402.org answered
  "settlement_pending" three times; each transfer was in the vault when the merchant looked, and
  each purchase was delivered.

The whole-purchase times are long because each purchase is five sequential transactions on the
public devnet RPC, which this demo shares and rate-limits.

<!-- snapshot:start -->
Snapshot of the demo network at 2026-10-28T08:03:32.000Z (`deployments/snapshot.json`):

| | |
|---|---|
| Orders settled through escrow | 177 of 200 opened, 41.10 USDC, 0.4110 USDC in fees |
| Settled instantly / after a hold | 47 / 130 |
| Refunded / disputes resolved by the arbiter | 3 / 2 |
| Credit files | 16: 5 New, 1 Building, 0 Established, 10 Trusted |
| Reviews stored on-chain | 337 |
| Purchases timed | 407, of which 127 paid through an x402 facilitator |
| Facilitator verify / settle, median | 1158 ms / 1428 ms |
| Whole purchase as the buyer sees it, median | 35.2 s via facilitator, 24.6 s direct |
| Every attempt recorded since 2026-10-28 07:24 UTC, on the escrow deployed 2026-10-28: honest buyers from honest merchants | 73 of 96 delivered; via facilitator 53/66, direct 20/30, on credit 0/0 |
| Whole purchase, median / p95, on that escrow | via facilitator 43.9 s / 61.5 s, direct 29.7 s / 44.1 s |
| Why the others failed | 2 × SETTLEMENT_FAILED: settlement failed: settlement_pending Solana error #8100002; 21 × A2A error: the merchant's ops wallet is low on SOL (…); it opens no new quotes until it is |

The whole-purchase time is five sequential transactions on a rate-limited public RPC shared with
the rest of the demo. It measures this prototype on that endpoint, not Solana.

| Agent | Role | Tier | Score | Orders | Stars | Note |
|---|---|---|---|---|---|---|
| vera | merchant | Trusted | 1000 | 41 | 4.83 |  |
| quill | merchant | Trusted | 995 | 39 | 4.82 |  |
| atlas | merchant | Trusted | 941 | 49 | 4.78 |  |
| pixel | merchant | Trusted | 891 | 37 | 4.71 |  |
| scout | buyer | Trusted | 856 | 28 | 4.72 |  |
| nova | buyer | Trusted | 855 | 28 | 4.73 |  |
| orbit | buyer | Trusted | 852 | 25 | 4.74 |  |
| lumen | buyer | Trusted | 842 | 24 | 4.7 |  |
| drift | buyer | Trusted | 837 | 25 | 4.71 |  |
| echo | buyer | Trusted | 824 | 22 | 4.68 |  |
| charlie | buyer | Building | 296 | 14 | 3.91 | 2 dispute(s) lost, 33% penalty |
| washer | merchant | New | 181 | 11 | 3.48 |  |
| sock-1 | buyer | New | 169 | 7 | 3.33 |  |
| sock-2 | buyer | New | 61 | 2 | 3.11 |  |
| sock-3 | buyer | New | 61 | 2 | 3.11 |  |
| mallory | merchant | New | 0 | 0 | 3 | 3 missed deliveries, 14% penalty |
<!-- snapshot:end -->

## Run it

Needs Node 20.19 or newer, or 22.12 or newer (22 recommended; `.nvmrc` says 22), Rust, Solana CLI 3.1 and Anchor 1.1.2. Everything targets **devnet**.

```bash
npm install
npm run build:program        # anchor build
npm run codegen              # typed client from the IDL
npm run test:formula         # 55 formula, reward and pay-later check tests, no chain needed
npm run test:local           # 395 checks on a local validator (about 4 minutes)
npm run test:paylater        # 101 pay-later checks on a local validator
npm run test:paylater-402    # 77 checks: pay later through the merchant server's x402 route, the CLI and the buyer agent
npm run paylater:local       # a local pay-later world to try the CLI by hand (docs/PAYLATER.md)
```

To run the demo network against the deployed program you need the role keypairs in `.keys/`. They are
not in the repo. `npm run setup:devnet` creates new ones and funds them from your Solana CLI wallet. It
needs devnet SOL and devnet USDC from <https://faucet.circle.com>. With a different deployer you also
have to deploy the program under your own id.

```bash
npm run setup:devnet         # config, keys, funding, profiles (idempotent); add -- --light for smaller amounts
npm run setup:paylater       # the pay-later pool and its USDC (idempotent; see below)
npm run agents               # merchant agents: A2A + x402 + crank + arbiter, on :4020
npm run swarm                # buyer agents trade for 45 periods; three attacks join later
npm run web                  # the site, on :5173
npm run registry -- --mirror 7   # register merchants in the Solana Agent Registry, mirror 7 reviews each
```

The agents server quotes two public x402 facilitators (x402.org and PayAI). Coinbase's CDP facilitator
needs an API key: set `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET` and it is tried first. That path loads
and falls back cleanly, but it has not been run with a real key.

One purchase by one agent:

```bash
npm run buy -w @tessera/agents -- --buyer scout --merchant atlas --mode x402
```

The site reads the chain directly, so `npm run web` alone shows the live network. Only the Market page
needs `npm run agents`.

[`.env.example`](.env.example) lists the names of every environment variable used. Values are never
committed.

### Pay later: build, local run, devnet

`npm run build:program` builds both programs (`programs/tessera` and `programs/tessera-paylater`).
After any build that changes an IDL, `npm run codegen` regenerates `packages/sdk/src/generated` and
`packages/sdk/src/paylater/generated` with Codama.

```bash
npm run build:program
npm run codegen
npm run test:paylater        # 101 checks: both programs on a local validator
npm run test:paylater-402    # 77 checks: the merchant server's 402, the CLI, the buyer agent, the keeper
npm run paylater:local       # a local world: tiered wallets, a funded pool, a shop with open quotes
npm run tessera -- credit <alice> --rpc http://127.0.0.1:18999
npm run tessera -- buy-later --order <quote> --keypair <alice.json> --merchant-keypair <shop.json> --rpc http://127.0.0.1:18999 --send
npm run tessera -- repay --all --keypair <alice.json> --rpc http://127.0.0.1:18999 --send
```

On devnet the program was deployed on 27 October 2026 and the pool created then. This is how, for
an upgrade or a deployment of your own (the upgrade writes the new `.so` into a temporary buffer
first, so the authority needs its rent, about 2.05 SOL on devnet for this commit's 403,176-byte build,
for a few minutes; it comes back when the upgrade is done). The program and the merchant server
change together: restart `npm run agents` on the same commit first, then upgrade
([docs/PAYLATER.md](docs/PAYLATER.md#upgrading-devnet) gives the order and why).

```bash
# An upgrade of the program on devnet: name it by its address. A keypair file is only for a first
# deployment of your own; target/deploy/tessera_paylater-keypair.json is generated per checkout, and
# one that is not LXNPY…'s would deploy a new program and leave devnet as it was.
solana program deploy target/deploy/tessera_paylater.so \
  --program-id LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D --max-len 420000 --max-sign-attempts 60 -u devnet
npm run setup:paylater               # create the pool with DEVNET_LINE_PARAMS, top its vault up to 8 USDC
npm run setup:paylater -- --usdc 20  # or to another amount
```

Check that the CLI prints `Program Id: LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D`.

`setup:paylater` signs with `DEPLOYER_KEYPAIR` (default `~/.config/solana/id.json`), which must be the
program's upgrade authority to create the pool; anyone can deposit. It leaves the rules of an
existing pool as they are, and writes the `payLater` block of `deployments/devnet.json`. A different
deployer has to deploy under its own program id. With the pool in place every merchant 402 offers pay
later, the keeper runs, and a buyer at Building or above can use it (on the new escrow every honest
demo buyer was on 28 October; a New wallet such as charlie is refused):

```bash
npm run agents                                             # 402s offer pay later; keeper every KEEPER_MS (30 s)
npm run buy -- --buyer nova --merchant quill --pay-later   # buys on credit over A2A, prints the loan and due date
npm run tessera -- credit <nova's address>                 # limit, owed, each loan's due time
npm run tessera -- repay --all --keypair .keys/agents/nova.json --send
```

`buy-later --order` sends the `buy_now` itself, so it takes the order's merchant's key as well
(`--merchant-keypair`): in the local world you hold the shop's. Over x402 the merchant's server adds
its own signature. The devnet program is the build of `eca65b0` since 28 October 2026 (the source of
`1bd11be`, naming the new escrow): it requires that signature, and refuses an order whose price or
request hash is not the one the `buy_now` carries (`PriceMismatch`, `RequestMismatch`).

### Hosting the API and the agents (Railway)

[docs/RAILWAY.md](docs/RAILWAY.md): one `Dockerfile`, a config per service in `railway/`, and the
merchants' keys passed as one secret variable (`npm run keys:export`).

### Putting the site on Vercel

The site is static files: `npm run build -w @tessera/web` writes `apps/web/dist`. In Vercel, import the
GitHub repo and choose the **web** app ("Import single project"): Root Directory `apps/web`, framework
Vite, default build and output settings. Each push to `main` redeploys.

Do not add a `vercel.json` at the repo root. Vercel applies it to the `apps/web` project too, and its
paths would be wrong there. `apps/web/vercel.json` is fine: it only sets security headers (a strict
Content-Security-Policy, framing and referrer rules).

Optional environment variables, set in the Vercel project:

- `VITE_RPC_URLS`: comma-separated devnet RPC URLs, tried in order (defaults to two public ones). This is public, because it is compiled into the site, so never put a URL with an API key here.
- `VITE_AGENTS_URL`: the public `https://` address of `npm run agents`, for the Market page and the demo
  deck's checkout. The agents server is not on Vercel. Without it, the Market page says it is unreachable.

These are read at build time, so redeploy after changing them.

## Repository layout

```
programs/tessera/     Anchor program: escrow state machine, score, reviews, disputes
programs/tessera-paylater/  Pay later: credit lines from the Tessera score; the pool pays the escrow's orders
packages/sdk/         Typed client (Codama), PDA helpers, payment verification,
                      the score mirror, the reference model, attack simulations
apps/agents/          Merchant agents (A2A + x402), buyer agent, swarm, crank, arbiter
apps/api/             The HTTP API: credit checks and unsigned escrow transactions (the core door)
apps/mcp/             The same tools over MCP (Streamable HTTP)
apps/cli/             The tessera command; signs locally with --keypair
skills/tessera/       SKILL.md for skill-aware agents
apps/web/             React + Motion site: live network, credit files, market, decks
apps/web/slides/      Source of the click-through slide decks (npm run slides)
scripts/              Devnet bootstrap and the local-validator test suite
docs/                 Scoring, security model, architecture, A2A extension, agent API, rewards,
                      ERC-8004 and the Agent Registry, Railway hosting, try-it guide
deployments/          Public addresses, measured timings, Agent Registry assets and files
```

## What is real and what is not

**Real:** the programs on devnet, every account and transaction the site shows, the score (recomputed
in your browser from those accounts), the x402 payments through public facilitators, and the test
results.

**Not real yet:**

- **The traffic is ours.** The devnet network is this project's own agents trading with recycled test
  USDC, to show what the program does with each behaviour. There are no outside users and no revenue.
- **Time is compressed on devnet.** One period is 60 seconds instead of a day, and holds are seconds
  instead of days, so a wallet's journey can be watched in under an hour. The formula is the same.
- **Single keys.** The arbiter and the program's upgrade authority are one key each. Both need a
  multisig before any real money.
- **Unaudited** by a third party, and the A2A endpoint is hand-rolled from the specification rather
  than certified. Two internal reviews found and fixed holes: ten on 7 October, and a wider pass on
  10 October that included a critical order-swap in the escrow
  ([7 October](docs/SECURITY.md#audit-of-7-october-2026), [10 October](docs/SECURITY.md#audit-of-10-october-2026)).
  The fixes from both reviews are in the source and pass the suites, and since 28 October 2026 they
  are on devnet too: the escrow there
  ([`tESs6b4J…`](https://explorer.solana.com/address/tESs6b4JFTWoNnELMa4KSxPuJDSRaLAtCSUr8BGY6ry?cluster=devnet))
  is a build of this source, so `open_order` needs the merchant's signature (B13) and
  `cancel_unpaid` leaves a `Cancelled` tombstone (B16). The version 1 escrow (`TessSeP5…`) was
  deployed on 4 October (slot 507449356), before both, and cannot be upgraded, because its upgrade
  key was lost with the version 1 keys. It is retired, and its accounts stay on devnet as history.
- **Pay later is new and small.** It is on devnet with a pool funded with 8 USDC (8.014 on
  28 October). A default freezes the pay-later line but does not lower the Tessera score, and an
  escrow refund goes to the buyer while the loan stays owed. On the retired escrow a buyer can open
  an order in a merchant's name, and a party can close an unpaid order and open another at its
  address at once; on the escrow on devnet now neither is possible. `buy_now` requires the
  merchant's signature and carries the price the buyer agreed to, on devnet too since the upgrade of
  28 October 2026, so the pool will not fund such an order or pay a repriced one on any escrow build. On the
  retired escrow a buyer can still open and fund an order in a merchant's name with its own money
  and have it refunded after the deadline, with a missed-delivery penalty on the merchant's credit
  file there. See [docs/PAYLATER.md](docs/PAYLATER.md#limits).
- **It prices faking; it does not detect it.** On-chain data cannot tell a bot from a customer who
  spends the same money. See the limits in [docs/SECURITY.md](docs/SECURITY.md).

## Where the ideas come from

- [x402](https://x402.org) and [A2A](https://a2a-protocol.org) carry the payment and the conversation,
  unchanged.
- [ERC-8004, Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004) proposes identity, reputation
  and validation registries for agents, and says "payments are orthogonal to this protocol". The
  [Solana Agent Registry](https://solana.com/agent-registry) is that standard on Solana. Tessera is the
  payment side, and is bridged to the registry on devnet: [docs/ERC-8004.md](docs/ERC-8004.md).
- [Visa Compelling Evidence 3.0](https://www.checkout.com/blog/visa-compelling-evidence-3-0): earlier
  undisputed purchases are evidence that a later one is legitimate. The pair account is that evidence,
  kept by the program.
- An earlier prototype by the same author (`x402-fraud`, 22 to 23 September 2026, unpublished) showed
  that an escrow account can be an x402 `payTo`. Tessera is a new program and codebase built on that idea.

## Licence

MIT. See [LICENSE](LICENSE).
