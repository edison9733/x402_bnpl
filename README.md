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
| Program (devnet) | [`TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ`](https://explorer.solana.com/address/TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ?cluster=devnet) |
| Config account (devnet) | [`DgwhgcXkhNwpouzppHdF7KNACA14U1JWPccFH5ZGeNE2`](https://explorer.solana.com/address/DgwhgcXkhNwpouzppHdF7KNACA14U1JWPccFH5ZGeNE2?cluster=devnet) |
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
   Tessera decides whether the money waits. On devnet, the merchant agents are registered in that
   registry, each registry identity points at its Tessera credit file, and 28 Tessera reviews (7 per
   merchant) are mirrored there as feedback that carries proof of payment. See
   [docs/ERC-8004.md](docs/ERC-8004.md).

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
  (`tessera repay --all`).
- **Or default.** Anyone can mark an unpaid loan in default once its grace period ends, and the line
  freezes at zero. The demo agents server does it as a keeper.
- **Over x402.** Where the pool exists, a merchant's 402 offers the order on credit as a second
  `accepts` entry (scheme `tessera-paylater`) after the standard ones, with the buyer's live limit.
  The buyer answers with a signed `buy_now`; the merchant checks it, signs as fee payer and sends it
  (`npm run buy -- --pay-later`, `tessera buy-later <merchant url> <skill>`).

The limit is `tier limit × score ÷ 1000 × on-time boost`, read live from the buyer's Tessera credit
file. A New wallet gets nothing. The escrow program is unchanged; pay-later only reads its accounts
and pays into its vaults with the same plain token transfer an x402 payment is.
**It is on devnet since 27 October 2026:** program `LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D`,
pool `GNf8LpVeJ6ayrVMqABpU1nAHW9ZX7upC2aGqcumWF5Qq` with 8 devnet USDC (all addresses under
[How Solana powers this](#how-solana-powers-this)). The rules differ by place, and only in time: the
devnet pool has a 600 s term and a 60 s grace period (`DEVNET_LINE_PARAMS`), the local preview
(`npm run paylater:local`, the test suites) 60 s and 5 s (`PREVIEW_LINE_PARAMS`); both have limits of
0 / 2 / 5 / 10 USDC by tier and a 2% fee. The program on devnet is the build of commit `9d543b1`,
from before `buy_now` confirmed the order itself; the upgrade to this commit's program is pending,
and until it lands the clients in this commit cannot buy on credit there (their `buy_now` names the
escrow program as an account that build does not take, so the merchant's simulation refuses it).
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
111–206) is handed the escrow's order account, checks it is a real order (owned by the escrow program,
at the address its id derives, lines 306–312), reads the price from it, reads both parties' Agent
accounts and the escrow's config and recomputes their live scores with the escrow's own formula, and
then transfers the price from the pool's vault into the order's vault. That is the same transfer an
x402 payment is, and in the same instruction `buy_now` calls the escrow's permissionless
`confirm_funded` by cross-program invocation (lines 149–157), which reads the vault and marks the order
Funded: the buyer never gets a moment to cancel the quote and take the pool's money (the program on
devnet is still the build from before this call; its upgrade is pending). The escrow program did not
change for it. The buyer repays the price plus the pool's 2% fee into the pool; a loan
past its grace period is marked in default by anyone and the line freezes.

**What is read and what is written.**

| | Read, with no signature | Written, as signed transactions |
|---|---|---|
| Escrow program | Config, Agent credit files, orders, vault balances (`getAccountInfo`, `getProgramAccounts`) | `open_order` (merchant), the x402 transfer into the vault (buyer, settled by the facilitator), `confirm_funded` (anyone), `deliver` (merchant), `release`, `refund`, `cancel_unpaid`, `open_dispute`, `resolve_dispute` (a party, the arbiter, or anyone after a deadline), `submit_review` (a party) |
| Pay-later program | Pool, credit lines, loans | `buy_now` (buyer signs, the merchant pays the network fee), `repay` (anyone, for the buyer), `mark_default` (anyone), `close_loan` (anyone, once repaid; the rent goes to the buyer), `deposit` (anyone), `initialize`, `update_params`, `withdraw` (the pool's authority) |

The website only reads, with no wallet. The API builds unsigned transactions and never sends one it
built. The agents sign with their own keys. A buyer paying through a facilitator needs no SOL. A
buyer on credit pays no network fee (the merchant is the fee payer of its `buy_now`), but it pays the
rent of the loan account `buy_now` opens (230 bytes: 0.00181864 SOL on devnet, 0.00249168 SOL on a
local validator), back when the repaid loan is closed, and on its first purchase the rent of its
credit line (105 bytes: 0.00118364 SOL on devnet, 0.00162168 SOL locally). A first purchase on credit
therefore needs 0.00300228 SOL on devnet. These are `solana rent` on each network on 27 October 2026;
`paylater.buyNowRent` reads the amount from the network it runs on.

**Devnet addresses.**

| | |
|---|---|
| Network | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` (devnet) |
| Escrow program | [`TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ`](https://explorer.solana.com/address/TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ?cluster=devnet), last deployed 4 October 2026 (slot 507449356), before the audit fixes of 7 and 10 October: the table above describes the source, and on devnet `open_order` does not need the merchant's signature and only the arbiter resolves a dispute (see [what is real](#what-is-real-and-what-is-not)) |
| Escrow config | [`DgwhgcXkhNwpouzppHdF7KNACA14U1JWPccFH5ZGeNE2`](https://explorer.solana.com/address/DgwhgcXkhNwpouzppHdF7KNACA14U1JWPccFH5ZGeNE2?cluster=devnet) |
| USDC mint (devnet, Circle) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Escrow config authority and arbiter | `5i7zzV9hQUCbpg8MXSNJB3QQkL6zscDd8VQKow46vg7E` and `3GydKy3acrVxvwyF26oDMwvbxVjrQ5yBDEc1GzUoVKz2`. Both are version 1 keys and were lost, as was the escrow's upgrade key (the same `5i7z…`): the config cannot be changed, and a dispute on devnet cannot be resolved by this deployment: the build there lets only the order's arbiter resolve one, so a disputed order stays Disputed. |
| Pay-later program | [`LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D`](https://explorer.solana.com/address/LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D?cluster=devnet), deployed 27 October 2026 (slot 515513248) from commit `9d543b1`; the upgrade to this commit's program is pending. Max length 420,000 bytes. |
| Pay-later upgrade and pool authority | [`EoNCoL8tDGKpiyyycESkheuMPcQNpLJrAXqjQUCQCCY6`](https://explorer.solana.com/address/EoNCoL8tDGKpiyyycESkheuMPcQNpLJrAXqjQUCQCCY6?cluster=devnet) |
| Pay-later pool | [`GNf8LpVeJ6ayrVMqABpU1nAHW9ZX7upC2aGqcumWF5Qq`](https://explorer.solana.com/address/GNf8LpVeJ6ayrVMqABpU1nAHW9ZX7upC2aGqcumWF5Qq?cluster=devnet). Rules (`DEVNET_LINE_PARAMS`): limits 0 / 2 / 5 / 10 USDC for New / Building / Established / Trusted, step 2,500 bps, boost cap 10,000 bps, term 600 s, grace 60 s, fee 200 bps, merchants at Building or above, loans of at least 0.001 USDC. |
| Pool vault | [`DK9angk2VJ43sUaUgJB9wpvDmjh4zroVj8zC2UYTXsgV`](https://explorer.solana.com/address/DK9angk2VJ43sUaUgJB9wpvDmjh4zroVj8zC2UYTXsgV?cluster=devnet): 8 devnet USDC on 27 October 2026, nothing lent yet |
| Merchant server (ops wallet) | [`DJ8sWBFJT5oFW2MTyX1Zok5JWt6QPS3Uang3hHXwcM4R`](https://explorer.solana.com/address/DJ8sWBFJT5oFW2MTyX1Zok5JWt6QPS3Uang3hHXwcM4R?cluster=devnet): fronts the rent of every quote and pays the network fee of each pay-later `buy_now`, for every merchant the server runs |

The demo agents, created on 27 October 2026 because the version 1 agents' keys were lost. Their
orders run on the same escrow program and config. Tiers as read from the chain on 27 October, after
a short swarm (Building needs a score of 250 and two active periods):

| Agent | Role | Wallet | Tier (score) on 27 October |
|---|---|---|---|
| atlas | merchant | [`DzmuSTiwQLnZ4KMtWC3gZ5s68ySstf7UW37Jo4Wm8c2r`](https://explorer.solana.com/address/DzmuSTiwQLnZ4KMtWC3gZ5s68ySstf7UW37Jo4Wm8c2r?cluster=devnet) | Building (343) |
| quill | merchant | [`2hQkyW5yGT4koHL7smK2rye5HzZe489qMdPXmr21aekd`](https://explorer.solana.com/address/2hQkyW5yGT4koHL7smK2rye5HzZe489qMdPXmr21aekd?cluster=devnet) | Building (329) |
| vera | merchant | [`93YALFSrr5dBp1FuZsFRPVeM3w6i3ovrg97PZ9SWVGJk`](https://explorer.solana.com/address/93YALFSrr5dBp1FuZsFRPVeM3w6i3ovrg97PZ9SWVGJk?cluster=devnet) | Building (389) |
| pixel | merchant | [`E6fyFwRFY3fxZRPyLw1n3tsyriCeDcw1C19JCQA4JeJ`](https://explorer.solana.com/address/E6fyFwRFY3fxZRPyLw1n3tsyriCeDcw1C19JCQA4JeJ?cluster=devnet) | Building (317) |
| scout | buyer | [`69FgPAiBm7Cyy42aNYUGB2T9Sw2zEzuj863tmkPHsbuz`](https://explorer.solana.com/address/69FgPAiBm7Cyy42aNYUGB2T9Sw2zEzuj863tmkPHsbuz?cluster=devnet) | New (242) |
| nova | buyer | [`Acy1bCFCSBt8Bhv3vHBExWAoEnp2F6Wi96Mi5CqWt7PW`](https://explorer.solana.com/address/Acy1bCFCSBt8Bhv3vHBExWAoEnp2F6Wi96Mi5CqWt7PW?cluster=devnet) | Building (301) |
| orbit | buyer | [`Dcn1N989PYtdVZYiQobMk2i4qDoS2xsFZRtyNSPJdmrU`](https://explorer.solana.com/address/Dcn1N989PYtdVZYiQobMk2i4qDoS2xsFZRtyNSPJdmrU?cluster=devnet) | New (244) |
| lumen | buyer | [`BXtsho1SuZ8ASfDj9f5esrs8AF9HEBmwMe7gY2sF8KfW`](https://explorer.solana.com/address/BXtsho1SuZ8ASfDj9f5esrs8AF9HEBmwMe7gY2sF8KfW?cluster=devnet) | New (230) |
| drift | buyer | [`B8qmQCeymzNoBVfRg4fMKkFYPa38BeDby9ZGLdn3m6im`](https://explorer.solana.com/address/B8qmQCeymzNoBVfRg4fMKkFYPa38BeDby9ZGLdn3m6im?cluster=devnet) | New (225) |
| echo | buyer | [`2UXartbXrSJxJp69yy2MAcoitsYjorBdgPDokcYfKiLW`](https://explorer.solana.com/address/2UXartbXrSJxJp69yy2MAcoitsYjorBdgPDokcYfKiLW?cluster=devnet) | Building (311) |
| mallory | merchant, no-show | [`EbTnud5vWHwQP3dyQ7WyX8VSytyq8vXThTnJESoCF3NV`](https://explorer.solana.com/address/EbTnud5vWHwQP3dyQ7WyX8VSytyq8vXThTnJESoCF3NV?cluster=devnet) | no credit file yet |
| charlie | buyer, friendly-fraud | [`HTirwtNmNAmJq3id3EX3VtELmEAkAQTkyd8wrXaUqmTG`](https://explorer.solana.com/address/HTirwtNmNAmJq3id3EX3VtELmEAkAQTkyd8wrXaUqmTG?cluster=devnet) | New (128) |
| washer | merchant, ring-merchant | [`2656oKaw3UBLf18So6w3Kz8Hu713KUX45zgtyyPTEMaw`](https://explorer.solana.com/address/2656oKaw3UBLf18So6w3Kz8Hu713KUX45zgtyyPTEMaw?cluster=devnet) | New (118) |
| sock-1 | buyer, ring-buyer | [`EjB382b4sxdrdGEmMJQNoAxgFmn6XxZU5AhmC1XraNKH`](https://explorer.solana.com/address/EjB382b4sxdrdGEmMJQNoAxgFmn6XxZU5AhmC1XraNKH?cluster=devnet) | New (93) |
| sock-2 | buyer, ring-buyer | [`C5tNBPJUEuU6WWc9s8DD3Yas87X9fGA4qKPpWfjuotZN`](https://explorer.solana.com/address/C5tNBPJUEuU6WWc9s8DD3Yas87X9fGA4qKPpWfjuotZN?cluster=devnet) | New (37) |
| sock-3 | buyer, ring-buyer | [`88Woxx1bva3wMABNYH7EEMKnAKt6ifVofDb6eBHUKTou`](https://explorer.solana.com/address/88Woxx1bva3wMABNYH7EEMKnAKt6ifVofDb6eBHUKTou?cluster=devnet) | New (37) |

The same addresses are in [`deployments/devnet.json`](deployments/devnet.json), written by
`npm run setup:devnet` and `npm run setup:paylater`.

## Failed payments

A payment can fail before it moves, while it moves, or after. Each case below is handled by code, and
in none of them is money left stuck: it either never moves or goes back to the buyer. Line numbers
are at the commit this README is in.

1. **The 402 asks more than the buyer allows.** Before paying, the buyer agent reads the price the
   merchant's agent card advertises and takes `--max` if lower; a 402 above that is refused and
   nothing is signed ([`apps/agents/src/http402.ts`](apps/agents/src/http402.ts) lines 43 and 57–59;
   over A2A [`apps/agents/src/buyer.ts`](apps/agents/src/buyer.ts) line 139). It then reads the order
   named as `payTo` from the chain and refuses unless it is its own order, for that amount, in that
   mint, still awaiting payment (`verifyOrderForPayment`, `http402.ts` lines 64–80).
2. **The facilitator rejects the payment, or settlement fails.**
   [`apps/agents/src/facilitator.ts`](apps/agents/src/facilitator.ts) throws at lines 110 (no
   facilitator reachable), 117 (verify failed) and 122 (settle failed); the merchant delivers nothing.
   Over HTTP the answer is 502 with the note "Do not pay again. If the escrow was funded, the merchant
   refunds it before the delivery deadline" ([`apps/agents/src/server.ts`](apps/agents/src/server.ts)
   lines 311–315). Over A2A the task fails with `INVALID_PAYLOAD` when the facilitator's verify
   rejected the payment, and with `SETTLEMENT_FAILED` when settlement failed or no facilitator was
   reachable ([`apps/agents/src/a2a.ts`](apps/agents/src/a2a.ts) lines 264–270). The facilitator's word is never the proof: after settling, the merchant reads the
   vault ([`merchant.ts`](apps/agents/src/merchant.ts) lines 548–559) and the program confirms from
   the balance. A payment that did land after a failed answer sits in the order's vault, and the
   merchant's crank finishes or refunds the order (`server.ts` lines 508–526).
3. **A quote nobody pays.** The payment window is `unpaidSecs`, 300 s on devnet
   ([`constants.ts`](packages/sdk/src/constants.ts) line 51). `confirm_funded` refuses a payment after
   it ([`programs/tessera/src/lib.rs`](programs/tessera/src/lib.rs) lines 228–231), and the merchant
   refuses one too (`merchant.ts` lines 521–523 and 553–555). `cancel_unpaid` (`lib.rs` line 377)
   closes the quote and sends anything in the vault back to the buyer (lines 394–400): either party at
   any time, or the merchant's payer once the window has passed. The agents' crank cancels every unpaid
   quote past its window (`server.ts` lines 645–652), then closes the tombstone for its rent.
4. **Funded, and the merchant never delivers.** The delivery deadline is `deliverSecs`, 300 s on
   devnet (`constants.ts` line 50). After it, anyone may call `refund` (`lib.rs` lines 298–319: while
   the order is `Funded`, the merchant at any time, anyone once the deadline has passed); the buyer
   gets the whole amount and the fee is 0. The crank does it at the deadline (`server.ts` lines
   508–526), the CLI does it with `tessera reclaim <order>` ([docs/TRY-IT.md](docs/TRY-IT.md), step 11),
   and the merchant's score takes a 10% missed-delivery penalty.
5. **A pay-later header that fails verification.** Nothing is signed until every check passes.
   The `accepted` entry must be one that was quoted (`merchant.ts` lines 497–501). `settlePayLater`
   ([`apps/agents/src/paylater.ts`](apps/agents/src/paylater.ts) lines 160–182) requires a
   `payload.transaction` (line 163) and hands it to `checkBuyNowTransaction`
   ([`packages/sdk/src/paylater/index.ts`](packages/sdk/src/paylater/index.ts) lines 234–324), which
   refuses a transaction that is not legacy or version 0, uses lookup tables, has a fee payer other
   than the merchant's wallet, signers other than the merchant and the buyer, no buyer signature, a
   compute unit limit above `BUY_NOW_COMPUTE_UNITS` (400,000) or a priority fee above `MAX_CU_PRICE`
   (1,000,000 micro-lamports per unit), so at most 0.0004 SOL of priority fee, more than one of
   either, any instruction other than those compute-budget settings followed by one `buy_now` of the
   pay-later program, or a `buy_now` any of whose accounts is not the one this order derives. The
   merchant then simulates it (`paylater.ts` lines 181–182), so the program's own refusals (`NotTheBuyer`, `OrderAlreadyFunded`,
   `PaymentWindowClosed`, `CreditLimitExceeded`, `PoolEmpty` and the rest,
   [`programs/tessera-paylater/src/lib.rs`](programs/tessera-paylater/src/lib.rs) lines 115–142)
   stop it before anything is sent. A refusal is a `PaymentRefused`: HTTP 400 without the "do not pay
   again" note (`server.ts` lines 311–315), `INVALID_PAYLOAD` over A2A, and the buyer may pay another
   way. The 402 already says `eligible: false` with a reason when the program would refuse
   (`paylater.ts` lines 89–110), and the buyer agent does not try then (`buyer.ts` line 137,
   `http402.ts` line 55).
6. **A pay-later loan not repaid.** Each loan carries `due_at` and `default_after` (a 600 s term and a
   60 s grace period in the devnet pool, 60 s and 5 s under the local preview rules). `mark_default`
   ([`programs/tessera-paylater/src/lib.rs`](programs/tessera-paylater/src/lib.rs) lines 265–280) may
   be called by anyone once `default_after` has passed: the loan is `Defaulted`, the buyer's limit is 0
   from then on ([`limit.ts`](packages/sdk/src/paylater/limit.ts) line 26), the debt stays and can
   still be repaid late. The agents server is the keeper: `markOverdue` (`apps/agents/src/paylater.ts`
   lines 211–230) reads the open loans and marks every one past its grace period, at most 20 per pass,
   run by `keep()` (`server.ts` lines 689–699) every `KEEPER_MS` (default 30 s,
   [`config.ts`](apps/agents/src/config.ts) line 65). The buyer's next 402 says its line is frozen.
   If the escrow refunds an order the pool paid for, the refund goes to the buyer and the loan stays
   owed (`lib.rs` lines 105–110); a buyer that keeps it defaults like any other.

## What existed before 12 October 2026 and what is new

The Encode Club hackathon judges only work done in its window. The tag `v1-submission` (11 October
2026) marks version 1, and every commit dated 12 October or earlier is prior work: `git log --date=short`
shows the dates, and `git diff c5e048c..v2 --stat` (`c5e048c` is the last commit of 12 October) is the
whole in-window diff.

**Before (prior work):** the escrow program on devnet, its score, reviews, disputes and arbiter
([`programs/tessera`](programs/tessera)); the merchant and buyer agents, the swarm, the crank, the
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
  a signed `buy_now`; the merchant checks it, signs as fee payer, sends it and delivers.
  `apps/agents/src/paylater.ts` (new), `merchant.ts`, `server.ts`, `a2a.ts`, `chain.ts`, `config.ts`;
  in the SDK `PayLaterOffer`, `buyNowForMerchant`, `checkBuyNowTransaction`, `buyOrderOnCredit`,
  `fetchOpenLoans`; `docs/A2A-EXTENSION.md`.
- **The buyer agent and CLI flow.** `npm run buy -- --pay-later` and `npm run buy:http -- --pay-later`
  (`apps/agents/src/buyer.ts`, `buy.ts`, `http402.ts`); `tessera buy-later <merchant agent url> <skill>`
  and `--input` (`apps/cli/src/paylater.ts`, `cli.ts`); `tessera credit` shows due dates.
- **The keeper.** `markOverdue` in `apps/agents/src/paylater.ts`, run by `keep()` in `server.ts`.
- **The website.** `apps/web/src/lib/paylater.ts` (new) reads the pool, a wallet's line and its
  loans; the Agents and Market pages show them where the pool exists (`Agents.tsx`, `Market.tsx`).
- **Tests and docs.** `scripts/test-paylater-402.ts` (new, 58 checks), `scripts/test-paylater.ts`
  rewritten for the escrow flow (87 checks), `scripts/paylater-local.ts`, `scripts/lib.ts`
  (`TESSERA_KEYS_DIR`); `docs/PAYLATER.md`, `docs/ENCODE-CHECKLIST.md`, this README.
- **Pay later on devnet (27 October).** The pay-later program deployed to devnet
  (`LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D`, slot 515513248, built from `9d543b1`), and its pool
  created with the devnet rules and funded with 8 devnet USDC. `scripts/setup-paylater-devnet.ts`
  (`npm run setup:paylater`, new) does both again, idempotently, and `paylater.DEVNET_LINE_PARAMS` holds
  the rules. The upgrade to this commit's program, in which `buy_now` confirms the order itself, is
  pending.
- **New demo agents (27 October).** The version 1 agents' keys were lost, so a new merchant server
  key and sixteen new agent wallets were created and funded (`npm run setup:devnet -- --light`, the
  smaller amounts added to `scripts/setup-devnet.ts`), and traded on devnet until four merchants and
  two buyers reached Building. Their addresses are in `deployments/devnet.json` and under
  [How Solana powers this](#how-solana-powers-this).

The escrow program (`programs/tessera`) was not changed in the window. The program on devnet is older
still: it was deployed on 4 October (slot 507449356), a build of the first commit, before the audit
fixes of 7 and 10 October, and its upgrade key was lost with the version 1 keys. The pay-later
program was deployed to devnet in the window, on 27 October.

## What is checked

| Command | Result | What it proves |
|---|---|---|
| `npm run test:local` | **395 / 395** | Runs the real program on a local validator. After every instruction, every account is compared field by field with a reference model. Every attack in [docs/SECURITY.md](docs/SECURITY.md) is sent as a real transaction and must fail. |
| `npm run test:paylater` | **84 / 84** | The pay-later program next to the real escrow program on a local validator: every purchase on credit goes through a real escrow order (the pool pays the vault and the escrow confirms it in the same instruction, so a buyer's `buy_now` plus `cancel_unpaid` fails whole and a later cancel is refused; the escrow pays the merchant), the boost follows the size of what was repaid, limits from live Tessera scores matched against the off-chain formula, on-time repayment of price plus fee, a tab of three settled in one transaction, default and freeze, an escrow refund with the loan still owed, pool accounting, and the refusal paths as real transactions. |
| `npm run test:paylater-402` | **58 / 58** | Pay later over x402, with the real merchant server on a local validator: the 402 offers the order on credit after its exact entries with the buyer's live limit, a tiered buyer hands over a signed `buy_now` and the merchant settles and delivers (plain HTTP, the CLI and the buyer agent over A2A), `repay --all` clears the tab, a New wallet is told it is not eligible, forged headers (a `cancel_unpaid` after the `buy_now`, a unit limit above the cap, another account as the escrow program, and more) are refused before the merchant signs, the merchant's `buy_now` runs `confirm_funded` by CPI within its compute budget, and the keeper marks an unpaid loan in default. |
| `npm run test:formula` | **44 / 44** | The guarantees stated in the docs and on the site, as tests, including the review-reward rules. |
| `npm run demo:rewards` | **pass** | The review-reward rebate on a local validator with the real program: real purchases and reviews, a merchant that then misses a delivery, and a real payout from the treasury. It checks each reward and label, the on-chain balances, the 75%-of-fees bound, and that `--verify` recomputes the payout. |
| `npm run test:doors` | **pass** (94 checks) | All four doors against the real program on a local validator: every API tool and refusal path with transactions signed and sent, `find_merchants` against real and copycat agent cards, the MCP tools and their enums, SKILL.md, and the CLI signing locally and refusing a tampered transaction from a fake API. |
| `npm run test:agents` | **pass** | The merchant and buyer agents against the real program on a local validator: a co-signed quote, a direct payment, delivery with its evidence kept for the arbiter, release, and both reviews in the order the program weighs them. |
| `npm run registry -- --verify` | **28 / 28** | Version 1 merchants. Every Tessera review mirrored into the Solana Agent Registry on devnet is read back from the registry and matched against the Tessera review account it points at. |

The snapshot below and its timings are version 1 records: the version 1 agents, measured on devnet
over a public RPC on 4 October 2026 (UTC). Their keys were lost, but their history is still on chain
(each one's credit file is the escrow Agent account of its wallet). The 2.0 agents are listed under
[How Solana powers this](#how-solana-powers-this) and have no measurement of their own yet. Raw data
is in [`deployments/measurements.jsonl`](deployments/measurements.jsonl).

<!-- snapshot:start -->
Snapshot of the demo network at 2026-10-04T19:11:10.000Z (`deployments/snapshot.json`):

| | |
|---|---|
| Orders settled through escrow | 234 of 251 opened, 56.95 USDC, 0.5695 USDC in fees |
| Settled instantly / after a hold | 44 / 190 |
| Refunded / disputes resolved by the arbiter | 3 / 2 |
| Credit files | 17: 2 New, 4 Building, 1 Established, 10 Trusted |
| Reviews stored on-chain | 435 |
| Purchases timed | 230, of which 51 paid through an x402 facilitator |
| Facilitator verify / settle, median | 934 ms / 1222 ms |
| Whole purchase as the buyer sees it, median | 27.7 s via facilitator, 23.2 s direct |

The whole-purchase time is five sequential transactions on a rate-limited public RPC shared with
the rest of the demo. It measures this prototype on that endpoint, not Solana.

| Agent | Role | Tier | Score | Orders | Stars | Note |
|---|---|---|---|---|---|---|
| quill | merchant | Trusted | 1000 | 42 | 4.83 |  |
| vera | merchant | Trusted | 1000 | 43 | 4.85 |  |
| atlas | merchant | Trusted | 992 | 54 | 4.82 |  |
| pixel | merchant | Trusted | 914 | 41 | 4.72 |  |
| orbit | buyer | Trusted | 872 | 27 | 4.75 |  |
| lumen | buyer | Trusted | 867 | 28 | 4.74 |  |
| scout | buyer | Trusted | 866 | 29 | 4.75 |  |
| nova | buyer | Trusted | 861 | 29 | 4.75 |  |
| drift | buyer | Trusted | 859 | 27 | 4.74 |  |
| echo | buyer | Trusted | 842 | 25 | 4.73 |  |
| washer | merchant | Established | 562 | 54 | 4.41 |  |
| sock-3 | buyer | Building | 473 | 18 | 4.23 |  |
| sock-2 | buyer | Building | 473 | 18 | 4.23 |  |
| sock-1 | buyer | Building | 473 | 18 | 4.23 |  |
| charlie | buyer | Building | 278 | 14 | 4.33 | 2 dispute(s) lost, 46% penalty |
| Fukg… | buyer | New | 102 | 1 | 3.46 |  |
| mallory | merchant | New | 0 | 0 | 3 | 3 missed deliveries, 28% penalty |
<!-- snapshot:end -->

## Run it

Needs Node 20.18 or newer (22 recommended), Rust, Solana CLI 3.1 and Anchor 1.1.2. Everything targets **devnet**.

```bash
npm install
npm run build:program        # anchor build
npm run codegen              # typed client from the IDL
npm run test:formula         # 44 formula and reward tests, no chain needed
npm run test:local           # 395 checks on a local validator (about 4 minutes)
npm run test:paylater        # 87 pay-later checks on a local validator
npm run test:paylater-402    # 58 checks: pay later through the merchant server's x402 route, the CLI and the buyer agent
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
npm run test:paylater        # 87 checks: both programs on a local validator
npm run test:paylater-402    # 58 checks: the merchant server's 402, the CLI, the buyer agent, the keeper
npm run paylater:local       # a local world: tiered wallets, a funded pool, a shop with open quotes
npm run tessera -- credit <alice> --rpc http://127.0.0.1:18999
npm run tessera -- buy-later --order <quote> --keypair <alice.json> --rpc http://127.0.0.1:18999 --send
npm run tessera -- repay --all --keypair <alice.json> --rpc http://127.0.0.1:18999 --send
```

On devnet the program was deployed on 27 October 2026 and the pool created then. This is how, for
an upgrade or a deployment of your own (the upgrade writes the new `.so` into a temporary buffer
first, so the authority needs its rent, 2.04 SOL on devnet for this commit's 401,520-byte build, for a
few minutes; it comes back when the upgrade is done):

```bash
solana program deploy target/deploy/tessera_paylater.so \
  --program-id target/deploy/tessera_paylater-keypair.json --max-len 420000 --max-sign-attempts 60 -u devnet
npm run setup:paylater               # create the pool with DEVNET_LINE_PARAMS, top its vault up to 8 USDC
npm run setup:paylater -- --usdc 20  # or to another amount
```

`setup:paylater` signs with `DEPLOYER_KEYPAIR` (default `~/.config/solana/id.json`), which must be the
program's upgrade authority to create the pool; anyone can deposit. It leaves the rules of an
existing pool as they are, and writes the `payLater` block of `deployments/devnet.json`. A different
deployer has to deploy under its own program id. With the pool in place every merchant 402 offers pay
later, the keeper runs, and a buyer at Building or above can use it (nova and echo were on
27 October; a New wallet such as scout is refused):

```bash
npm run agents                                             # 402s offer pay later; keeper every KEEPER_MS (30 s)
npm run buy -- --buyer nova --merchant quill --pay-later   # buys on credit over A2A, prints the loan and due date
npm run tessera -- credit <nova's address>                 # limit, owed, each loan's due time
npm run tessera -- repay --all --keypair .keys/agents/nova.json --send
```

Until the devnet program is upgraded to this commit's build, these purchases on credit are refused in
the merchant's simulation (see [Pay later](#pay-later)).

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
  The fixes from both reviews are in the source and pass the suites, but they are **not on devnet**:
  the escrow there was deployed on 4 October (slot 507449356), before both, and cannot be upgraded,
  because its upgrade key was lost with the version 1 keys.
- **Pay later is new and small.** It is on devnet with an 8 USDC pool and no loans yet, and the
  upgrade that has `buy_now` confirm the order itself is pending. A default freezes the pay-later
  line but does not lower the Tessera score, an escrow refund goes to the buyer while the loan stays
  owed, and on the devnet escrow a buyer can open an order in a merchant's name. See
  [docs/PAYLATER.md](docs/PAYLATER.md#limits).
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
