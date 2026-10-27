# Tessera 2.0: checklist for the Encode Club Solana Hackathon 2026

Track: **Best Use of x402 on Solana**. Every rule below is quoted from the
[hackathon page](https://www.encodeclub.com/programmes/solana-hackathon-2026), read on 22 October 2026.
Code facts point to files in this repository. Written 22 October 2026; 17 days to the deadline.
Ticked items carry the date they were done. Last update: 28 October 2026. **Pay later is on devnet
(27 Oct), upgraded the same day to the build with the CPI fix (`61196cc`, slot 515711875), and on 28 Oct
to the build where `buy_now` requires the merchant's signature and carries the agreed price (`1bd11be`,
slot 515766612).**

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
| "A working demo; deployment on Solana devnet is sufficient." | The escrow program is on devnet (`getAccountInfo` returns `executable: true` for `TessSeP5QV5Bxpvm73iEefdsTjgtTEokKSx7jqFn1CQ`). On 22 Oct the pay-later program was not (the `pay-once` address `7uM4V7H5xH6PGPEvqzw2CJ7s3EY3Qs95RUcV9kPJELDU` returned `null`). On 27 Oct it was deployed under `LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D` (slot 515513248, from `9d543b1`), and the pool `GNf8LpVeJ6ayrVMqABpU1nAHW9ZX7upC2aGqcumWF5Qq` created with 8 devnet USDC. The same day it was upgraded to the build with the `confirm_funded` CPI (`61196cc`, slot 515711875). On 28 Oct it was upgraded to the build of `1bd11be` (slot 515766612, [upgrade tx](https://explorer.solana.com/tx/3vcqaD4McyE5FDa1tHDxEMd8sgdNGTWdk2bm3BGFHQmHx36jmjoYU7ZBdKuVXc4K5KeBYHBjYUG36wVp2AVS7s2E?cluster=devnet)), where `buy_now` requires the order's merchant's signature and carries the price and request hash the buyer agreed to. | Done 27 Oct: Nova bought on credit ([settle tx](https://explorer.solana.com/tx/ttLNpyhUrgMoTkobtBB3QveynRHrBcnwDxyzYSsc5YYsUrfWncVAD2LLmAxRLHLAFJTg4Dr6jEzm2CJPTjMkoHw?cluster=devnet)) and repaid on time ([repay tx](https://explorer.solana.com/tx/2tyLtJe2nabhmjeUtCh4hzQymwQxGzFGbz1KM6KqQNxQHTiLyanUeSS2igjM58WdEmHdJkubZyWMUtJTqyAU2r6?cluster=devnet)). Again 28 Oct on the upgraded program: Nova bought Quill's 0.25 USDC summary on credit ([settle tx](https://explorer.solana.com/tx/1K7VsBKVWYHXmMmEdytiUck99inmuuRQuYfDUBAyGuhpzQ7b4vou7CkAT9L73hTBxo7CfURvpVGvLsfAf44b2xG?cluster=devnet), signed by the merchant server, Nova and Quill) and repaid on time ([repay tx](https://explorer.solana.com/tx/3oL3qukdUPiM6Tvgd8D8RM8XsUgTHjqMQiuGjZLUHiJEMYKnMr5sk8XKQkwXA6CoMSPoC2XUBAwFoyXguBYNEiJu?cluster=devnet)). |
| "A code repository with a README and setup instructions." | [README.md](../README.md) has `npm install` / `npm run web`; [TRY-IT.md](TRY-IT.md) walks through a trade. A clean `npm install` works (checked 21 Oct). Pay-later setup steps added 27 Oct, with `npm run setup:paylater` for the pool. | Keep it working; test the pay-later steps from a fresh clone. |
| "A 2–4-minute demo video." | Version 1's videos (2:03, 1:41, 2:58 pay-later) were recorded on a local validator and before the hackathon. New drafts rendered 28 Oct from the decks with `scripts/render-deck.mjs`, narrated by the macOS voice: `tessera-demo.mp4` 3:51 and `tessera-pitch.mp4` 3:54, plus `tessera-pitch-silent.mp4` timed to the same narration, to talk over. The demo performs a real purchase on the website on devnet and shows the transcript of the 28 Oct devnet run on credit. | Decide on the voice (yours over the silent cut, or the draft as it is); upload; the remaining gaps are under section 4. |
| "A clear explanation of how Solana powers the project." | README section "How Solana powers this", added 27 Oct. | Done. |

## 3. Judging criteria

Quoted: "Meaningful integration of both x402 and Solana. Reliability of the payment-to-access flow. A compelling
use case beyond a basic integration demo. Clear documentation and sensible handling of failed payments."
FAQ: judged on "what has actually been built and works, technical depth, and how well the project uses Solana."

**Failed payments: the code exists, and since 27 Oct so does the write-up.**

| Failure | Where it is handled today |
|---|---|
| The buyer refuses a 402 that asks more than its ceiling | [`apps/agents/src/http402.ts`](../apps/agents/src/http402.ts) lines 58–60 |
| The facilitator rejects the payment, or settlement fails | [`apps/agents/src/facilitator.ts`](../apps/agents/src/facilitator.ts) lines 110–122 throw; the route answers with an error and no delivery, and the note "Do not pay again" ([`apps/agents/src/server.ts`](../apps/agents/src/server.ts) lines 313–317) |
| A quote is never paid | `cancel_unpaid`, [`programs/tessera/src/lib.rs`](../programs/tessera/src/lib.rs) line 377 |
| Paid, and the merchant never delivers | `refund`, `lib.rs` line 298; the crank refunds at the deadline (`server.ts` lines 531–549) |
| A pay-later header that fails verification (new) | `checkBuyNowTransaction`, [`packages/sdk/src/paylater/index.ts`](../packages/sdk/src/paylater/index.ts) lines 292–406; `settlePayLater`, [`apps/agents/src/paylater.ts`](../apps/agents/src/paylater.ts) lines 200–230 |
| A pay-later loan not repaid (new) | `mark_default`, [`programs/tessera-paylater/src/lib.rs`](../programs/tessera-paylater/src/lib.rs) lines 278–293; the keeper, `apps/agents/src/paylater.ts` lines 267–288 |
| A purchase on credit its merchant never agreed to (new) | `buy_now` requires the order's merchant's signature, [`programs/tessera-paylater/src/lib.rs`](../programs/tessera-paylater/src/lib.rs) line 511; the merchant's server adds it after its checks, `apps/agents/src/paylater.ts` lines 205 and 225–226. On devnet since the 28 Oct upgrade (`1bd11be`): the [28 Oct settle tx](https://explorer.solana.com/tx/1K7VsBKVWYHXmMmEdytiUck99inmuuRQuYfDUBAyGuhpzQ7b4vou7CkAT9L73hTBxo7CfURvpVGvLsfAf44b2xG?cluster=devnet) carries Quill's signature as the order's merchant |
| A merchant reprices the order behind the buyer's signed `buy_now` (new) | `buy_now(loan_id, amount, request_hash)` refuses an order whose price or request hash is not the one the buyer signed for, `lib.rs` lines 133–134; the merchant's check requires the quoted ones, `index.ts` (`checkBuyNowTransaction`). On devnet since the 28 Oct upgrade (`1bd11be`): the 28 Oct `buy_now` carried the amount 250000 (0.25 USDC) and the 32-byte request hash |
| A buyer swaps the order at the quoted address (new) | `quotedOrderRefusal`, [`packages/sdk/src/verify.ts`](../packages/sdk/src/verify.ts); the merchant compares before signing (`apps/agents/src/merchant.ts` lines 618–621) and before confirming or delivering (lines 652–653, 688–689) |

- [x] (2026-10-27) README section "Failed payments" listing these cases (all nine, with file:line).
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
  step. Upgraded on 27 Oct to the build with the CPI fix (`61196cc`, slot 515711875); the deployed bytes
  hash the same as a local build of that commit. Upgraded again on 28 Oct to the build of `1bd11be`
  (slot 515766612, [tx](https://explorer.solana.com/tx/3vcqaD4McyE5FDa1tHDxEMd8sgdNGTWdk2bm3BGFHQmHx36jmjoYU7ZBdKuVXc4K5KeBYHBjYUG36wVp2AVS7s2E?cluster=devnet)),
  in the order of [PAYLATER.md "Upgrading devnet"](PAYLATER.md#upgrading-devnet): merchant server restarted
  on the new commit first, then the program. The first 403,176 bytes of the program dumped from devnet
  hash the same as the local build (sha256
  `b0cd57426386b9b8d31dcaf484b0b1ed280aff4fdff744ca3c39689e000381e3`); the rest of the 420,000-byte
  account is zeros.
- [x] (2026-10-27) **Keep the x402 flow visible end to end.** The track wants "a payment request, payment verification
  or settlement on Solana, and delivery of the requested resource." The route at `server.ts` lines 284–319
  does this today. The new feature must not bypass it. It does not: pay later is one more `accepts`
  entry in the same 402, settled by the same route (`merchant.ts` `work()`), confirmed by the same
  `confirm_funded` (which `buy_now` calls itself), delivered the same way. The buyer signs the
  `buy_now`; the merchant's server checks it and adds its two signatures, as fee payer and as the
  order's merchant, which `buy_now` requires so the pool only pays orders their merchant agreed to.
  `npm run test:paylater-402` (68 checks) runs it end to end.
- [ ] **Reliability.** Run the full flow on devnet many times before recording. Version 1 has 230 measured
  purchases ([deployments/snapshot.json](../deployments/snapshot.json), a version 1 record of the version 1
  agents, whose keys are lost but whose history is still on chain); produce a fresh measurement for 2.0
  with the new agents so the README can quote a number built during the window. Unblocked: the upgrade landed 27 Oct.
- [x] (2026-10-27) **Docs.** Add to the README: "How Solana powers this", "Failed payments", "What existed before
  12 October and what is new", and setup steps for the new feature. All four added. Still open: test the
  setup steps from a fresh clone.
- [ ] **Video, 2–4 minutes, recorded on devnet.** Show a 402 response, the payment verified or settled on
  Solana (open the transaction in the devnet explorer), the delivery, one failed-payment case, and the 2.0
  feature. Stay under 4:00.
  Draft rendered 28 Oct (`tessera-demo.mp4`, 3:51): the transcript of an earlier agent-to-agent x402
  purchase on devnet through the facilitator; the 2.0 flow and the transcript of a real devnet run on
  credit; the failed-payment cases as a slide (Scout's refusal as a transcript line); and a real
  purchase on the website on devnet with the delivery and hash check. Not in it yet: a transaction
  opened in the devnet explorer on camera, and a failed-payment case performed live.
- [ ] **Mid-submission by 1 Nov.** Submit what runs, even if rough. Rule: missing it "shows in the final score."
- [ ] **Final submission by 8 Nov.** Repository link, video, prior-work statement, Solana explanation.

## 5. Day plan

| Dates | Goal |
|---|---|
| 22–23 Oct | Section 1 done; toolchain fixed; scope frozen (toolchain and scope done 27 Oct; the sign-in and project creation in section 1 are still unticked) |
| 24–31 Oct | Feature built and deployed to devnet; tests passing (built and tested 27 Oct: `test:paylater` 87/87, `test:paylater-402` 58/58; deployed to devnet and upgraded with the CPI fix 27 Oct; then `buy_now` made to require the merchant's signature, `test:paylater` 93/93 and 94/94 on the devnet escrow's bytes, `test:paylater-402` 63/63, not yet on devnet; 28 Oct, `buy_now` made to carry the agreed price and request hash, the server to check the order at its quoted address, repaid loans and settled orders closed for their rent: `test:paylater` 101/101 and 103/103 on the devnet escrow's bytes, `test:paylater-402` 68/68 and 72/72, `test:formula` 55/55, not yet on devnet; later on 28 Oct, the pay-later program upgraded on devnet to `1bd11be` (slot 515766612), so the merchant's signature and the bound price and request hash are on devnet now; Nova then bought Quill's 0.25 USDC summary on credit and repaid it on time on the upgraded program ([settle tx](https://explorer.solana.com/tx/1K7VsBKVWYHXmMmEdytiUck99inmuuRQuYfDUBAyGuhpzQ7b4vou7CkAT9L73hTBxo7CfURvpVGvLsfAf44b2xG?cluster=devnet), [repay tx](https://explorer.solana.com/tx/3oL3qukdUPiM6Tvgd8D8RM8XsUgTHjqMQiuGjZLUHiJEMYKnMr5sk8XKQkwXA6CoMSPoC2XUBAwFoyXguBYNEiJu?cluster=devnet))) |
| 1 Nov | Mid-submission on the platform |
| 2–5 Nov | Failure demo, docs, site, reliability runs |
| 6–7 Nov | Record and cut the video; final README read-through |
| 8 Nov (daytime) | Final submission; confirm it shows as submitted |

Prize, so expectations are right: "Accelerator places for winning teams. This is a non-cash prize."
