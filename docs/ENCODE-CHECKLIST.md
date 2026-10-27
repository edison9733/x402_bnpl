# Tessera 2.0: checklist for the Encode Club Solana Hackathon 2026

Track: **Best Use of x402 on Solana**. Every rule below is quoted from the
[hackathon page](https://www.encodeclub.com/programmes/solana-hackathon-2026), read on 22 October 2026.
Code facts point to files in this repository. Written 22 October 2026; 17 days to the deadline.
Ticked items carry the date they were done. Last update: 27 October 2026. **Pay later is on devnet
(27 Oct); the upgrade with the CPI fix is pending.**

## 0. Dates

| When | What | Source |
|---|---|---|
| 18 or 19 Oct (passed) | Project creation closed | Schedule: "Checkpoint 1 closes Sunday 18 October." FAQ: "Project creation closes on 19 October." The page disagrees with itself by one day. |
| 1 Nov (or 2 Nov) | Mid-submission; registration closes | Schedule: "Submit what you have so far by Sunday 1 November… Registration also closes at this point." The FAQ says "registration closes on 2 November." Treat **1 Nov** as the real date. |
| **8 Nov, 23:59 UTC-12** | Final submission, hard cut-off | "Missing the final submission deadline does mean you are not judged — it is a hard cut-off." That moment is Monday 9 Nov, 11:59 UTC (19:59 Beijing). Submit on **Sunday 8 Nov in your own daytime**. |
| 16 Nov | Winners announced | Schedule |

**Unverified risk.** The page says "Programme has started but you can still apply!", but the FAQ also says
project creation closed on 19 October. People "can still join an existing team" after that. Only signing in
shows whether a *new* project can still be created.

## 1. Prepare (admin), 22 October

- [ ] Open the page and click **Sign in to Apply**. Sign in with GitHub. (FAQ: "You will need a GitHub account and somewhere to deploy.")
- [ ] Try to create the project "Tessera". If the platform refuses, ask in the hackathon Discord at once: <https://discord.gg/BsPbaShcxv>. Say you want the x402 track and ask whether a late project can be created.
- [ ] Decide solo or team. Rule: "You can enter alone or in a team of up to five."
- [x] (2026-10-27) Write the **prior-work statement** now. Rule: "Say clearly in your submission what existed beforehand."
  Facts for it: every commit on every branch is dated **12 October 2026 or earlier** (`git log --all`),
  except the lockfile fix of 22 October. The tag `v1-submission` (11 October) marks version 1. So all of
  this is "before": the escrow program on devnet, the agents, API, MCP server, CLI, website, both demo
  videos, and the pay-later preview on the `pay-once` branch. Written as the README section
  "What existed before 12 October 2026 and what is new"; copy it into the submission form.

## 2. Submission requirements

| Requirement (quoted) | Status on 22 Oct | To do |
|---|---|---|
| "A working demo; deployment on Solana devnet is sufficient." | The escrow program is on devnet (`getAccountInfo` returns `executable: true` for `TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ`). On 22 Oct the pay-later program was not (the `pay-once` address `7uM4V7H5xH6PGPEvqzw2CJ7s3EY3Qs95RUcV9kPJELDU` returned `null`). On 27 Oct it was deployed under `LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D` (slot 515513248, from `9d543b1`), and the pool `GNf8LpVeJ6ayrVMqABpU1nAHW9ZX7upC2aGqcumWF5Qq` created with 8 devnet USDC. | Upgrade the devnet program to the build with the `confirm_funded` CPI (commit `61196cc` or later): until then the clients on `v2` cannot buy on credit there. Then one real purchase on credit and its repayment on devnet. |
| "A code repository with a README and setup instructions." | [README.md](../README.md) has `npm install` / `npm run web`; [TRY-IT.md](TRY-IT.md) walks through a trade. A clean `npm install` works (checked 21 Oct). Pay-later setup steps added 27 Oct, with `npm run setup:paylater` for the pool. | Keep it working; test the pay-later steps from a fresh clone after the upgrade. |
| "A 2–4-minute demo video." | 2:03 (fits), 1:41 (too short), 2:58 pay-later (fits). All three were recorded on a local validator and before the hackathon. | Record a **new** 2–4 minute video of the 2.0 flow, on devnet. |
| "A clear explanation of how Solana powers the project." | README section "How Solana powers this", added 27 Oct. | Done. |

## 3. Judging criteria

Quoted: "Meaningful integration of both x402 and Solana. Reliability of the payment-to-access flow. A compelling
use case beyond a basic integration demo. Clear documentation and sensible handling of failed payments."
FAQ: judged on "what has actually been built and works, technical depth, and how well the project uses Solana."

**Failed payments: the code exists, and since 27 Oct so does the write-up.**

| Failure | Where it is handled today |
|---|---|
| The buyer refuses a 402 that asks more than its ceiling | [`apps/agents/src/http402.ts`](../apps/agents/src/http402.ts) lines 57–59 |
| The facilitator rejects the payment, or settlement fails | [`apps/agents/src/facilitator.ts`](../apps/agents/src/facilitator.ts) lines 110–122 throw; the route answers with an error and no delivery, and the note "Do not pay again" ([`apps/agents/src/server.ts`](../apps/agents/src/server.ts) lines 311–315) |
| A quote is never paid | `cancel_unpaid`, [`programs/tessera/src/lib.rs`](../programs/tessera/src/lib.rs) line 377 |
| Paid, and the merchant never delivers | `refund`, `lib.rs` line 298; the crank refunds at the deadline (`server.ts` lines 508–526) |
| A pay-later header that fails verification (new) | `checkBuyNowTransaction`, [`packages/sdk/src/paylater/index.ts`](../packages/sdk/src/paylater/index.ts) lines 234–324; `settlePayLater`, [`apps/agents/src/paylater.ts`](../apps/agents/src/paylater.ts) lines 160–182 |
| A pay-later loan not repaid (new) | `mark_default`, [`programs/tessera-paylater/src/lib.rs`](../programs/tessera-paylater/src/lib.rs) lines 265–280; the keeper, `apps/agents/src/paylater.ts` lines 211–230 |

- [x] (2026-10-27) README section "Failed payments" listing these cases (all six, with file:line).
- [ ] One segment of the video showing at least one of them live.

## 4. Build, in priority order

Only work done from now to 8 November is judged.

- [x] (2026-10-27) **Day 1: fix the toolchain.** On the build Mac the Solana CLI fails to start (missing `libusb`) and
  Anchor 1.1.2 is not installed. Without both there is no devnet deploy. `brew install libusb`, install
  Anchor 1.1.2 with `avm`, then `solana --version` and `anchor --version` must both print.
  Both print now (`solana-cli 3.1.10`, `anchor-cli 1.1.2`); `NO_DNA=1 anchor build` builds both programs.
- [x] (2026-10-27) **By 24 Oct: pick the 2.0 feature and freeze the scope.** The option with the most code already
  written and the biggest visible change is **pay later, settled in one transaction**. The program, SDK
  and CLI exist on `pay-once` (`programs/tessera-paylater`, `packages/sdk/src/paylater`,
  `apps/cli/src/paylater.ts`, `scripts/test-paylater.ts`), but only on a local validator, CLI-only, and
  not connected to the HTTP 402 route. In-window work: deploy to devnet, create and fund the pool with
  devnet USDC, let a merchant's 402 offer a pay-later option, let the buyer agent `buy_now`, then
  `repay --all`, and show it on the site. The track text names "agents purchasing services" and asks for
  "a compelling use case beyond a basic integration demo".
  Chosen and built on `v2` (commits `9d543b1`, `473b798`): the pool pays the buyer's escrow order, the
  402 offers it, the buyer agent and CLI use it, the server keeps it, the site shows it. Deployed,
  with the pool and its devnet USDC, on 27 Oct.
- [x] (2026-10-27) **Pay-later deployed to devnet.** Program `LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D`
  (upgrade authority `EoNCoL8tDGKpiyyycESkheuMPcQNpLJrAXqjQUCQCCY6`), pool
  `GNf8LpVeJ6ayrVMqABpU1nAHW9ZX7upC2aGqcumWF5Qq`, vault `DK9angk2VJ43sUaUgJB9wpvDmjh4zroVj8zC2UYTXsgV`
  with 8 devnet USDC, rules `DEVNET_LINE_PARAMS` (600 s term, 60 s grace). New demo agents and a new
  merchant server key created the same day (the version 1 keys were lost); addresses in
  [deployments/devnet.json](../deployments/devnet.json). `npm run setup:paylater` repeats the pool
  step. **Upgrade with the CPI fix pending:** the program on devnet is the `9d543b1` build; it needs
  about 2.04 SOL of buffer rent for a few minutes.
- [x] (2026-10-27) **Keep the x402 flow visible end to end.** The track wants "a payment request, payment verification
  or settlement on Solana, and delivery of the requested resource." The route at `server.ts` lines 282–317
  does this today. The new feature must not bypass it. It does not: pay later is one more `accepts`
  entry in the same 402, settled by the same route (`merchant.ts` `work()`), confirmed by the same
  `confirm_funded` (which `buy_now` calls itself), delivered the same way. `npm run test:paylater-402` (58 checks) runs it end to end.
- [ ] **Reliability.** Run the full flow on devnet many times before recording. Version 1 has 230 measured
  purchases ([deployments/snapshot.json](../deployments/snapshot.json), a version 1 record of the version 1
  agents, whose keys are lost but whose history is still on chain); produce a fresh measurement for 2.0
  with the new agents so the README can quote a number built during the window. Blocked on the upgrade.
- [x] (2026-10-27) **Docs.** Add to the README: "How Solana powers this", "Failed payments", "What existed before
  12 October and what is new", and setup steps for the new feature. All four added. Still open: test the
  setup steps from a fresh clone, after the devnet upgrade.
- [ ] **Video, 2–4 minutes, recorded on devnet.** Show a 402 response, the payment verified or settled on
  Solana (open the transaction in the devnet explorer), the delivery, one failed-payment case, and the 2.0
  feature. Stay under 4:00.
- [ ] **Mid-submission by 1 Nov.** Submit what runs, even if rough. Rule: missing it "shows in the final score."
- [ ] **Final submission by 8 Nov.** Repository link, video, prior-work statement, Solana explanation.

## 5. Day plan

| Dates | Goal |
|---|---|
| 22–23 Oct | Section 1 done; toolchain fixed; scope frozen (toolchain and scope done 27 Oct; the sign-in and project creation in section 1 are still unticked) |
| 24–31 Oct | Feature built and deployed to devnet; tests passing (built and tested 27 Oct: `test:paylater` 87/87, `test:paylater-402` 58/58; deployed to devnet 27 Oct, upgrade with the CPI fix pending) |
| 1 Nov | Mid-submission on the platform |
| 2–5 Nov | Failure demo, docs, site, reliability runs |
| 6–7 Nov | Record and cut the video; final README read-through |
| 8 Nov (daytime) | Final submission; confirm it shows as submitted |

Prize, so expectations are right: "Accelerator places for winning teams. This is a non-cash prize."
