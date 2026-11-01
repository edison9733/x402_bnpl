# Tessera: "The score" page + `tessera score` handoff

Brief for Claude Code. Read this whole file first, then `score/index.html` next to it. It continues `CLAUDE_CODE_BRIEF.md` (landing page + `merchants`, `tab`, `settle`); the Tessera facts and terminal rules there still apply. This file is self-contained enough to run on its own.

How Edison uses this file: copy the `tessera-handoff` folder into the repo (for example `docs/handoff/`), open Claude Code in the repo and say:

> Read docs/handoff/CLAUDE_CODE_BRIEF_SCORE.md and do everything in it, in order. Ask me the questions in the last section before you guess.

---

## 0. Ground rules

1. Explore the repo first. Find the current "The score" page (the route is `/#/formula` on the live site), the SDK's score function, the `demo:rewards` script and the score tests. Report what you found before changing anything.
2. Three jobs, in this order: **Job 1** replace the page with the new design, **Job 2** add `tessera score` to the CLI, **Job 3** make the `demo:rewards` script and the test output print in the same style as the page.
3. Every number on the page comes from the program's config and the SDK. Never hard-code a rule the SDK already knows. The page's promise is "the program, the SDK and this page compute the score with the same code", so the page must call the SDK's score function, not a copy.
4. Copy style for anything you write: British spelling, short sentences, no em dashes, no semicolons, no rhetorical questions, no emoji. Do not use: seamless, robust, leverage, empower, unlock, game-changer, revolutionise, cutting-edge, delve, landscape, harness, ensure, elevate, journey.

---

## 1. The rules the page states (keep exact)

- `score = 1000 × Evidence × Rating × Behaviour`
- `Evidence = 0.45 History + 0.30 Tenure + 0.25 Diversity`
- `tier` = the highest tier whose score gate and active-period gate are both met. Trusted also needs no standing penalty.
- `hold = max(hold[merchant tier], hold[buyer tier])`
- History `min(1, √(credit ÷ credit_full))`. Credit is settled volume counted at 10% / 40% / 80% / 100% by the counterparty's tier when the order opened, capped per counterparty.
- Tenure `min(1, min(age, 3 × active periods) ÷ tenure_full)`.
- Diversity `min(1, Σ counterparty points ÷ diversity_full)`. A counterparty adds its best tier weight once the pair has moved a tenth of the pair cap.
- Rating `clamp((stars − 1.5) ÷ 3, 0, 1)`, `stars = (prior × 3 + Σ w·r) ÷ (prior + Σ w)`. No reviews means half marks. A refunded order's review weighs nothing.
- Behaviour `1 − standing penalty`. Lost dispute +25%, missed delivery +10%, heals a little every period. Any penalty blocks Trusted.
- Tiers: New counts 10%, Building 40% (250+ points, 3 active days), Established 80% (500+, 14), Trusted 100% (750+, 30, no penalty).
- Holds, mainnet target: 3 d / 24 h / 60 min / instant. Devnet: 2 min / 45 s / 10 s / instant.
- The numbers table (devnet vs mainnet) and the 14 guaranteed tests are in `score/index.html` word for word. Read them from the repo's config and test suite, and compare. If a value differs, the repo wins and the page copy must change. Tell Edison which ones differed.

---

## 2. Job 1: the page

### 2.1 What to do

Replace the current "The score" page with `score/index.html`, ported into the repo's framework. Keep structure, copy, colours, fonts and animations. The file is self-contained: one `<style>` block, one `<script>` for the simulator, a Google Fonts link.

Page order (do not reorder):

1. Header with the site nav (Live network, Agents, Market, Review, The score, Pay later) and the `devnet · live` pill.
2. Hero: "Every rule, in the open." + a terminal that runs `tessera score <wallet>` and prints the breakdown line by line.
3. 01 · The formula: the four lines as a code block, weights highlighted.
4. 02 · Five factors: five cards, each with the formula, one or two sentences, a bar for the example wallet, one bold key line.
5. 03 · What a tier buys: four rows (tier, who gets here, counts as, hold) plus three one-line rules.
6. 04 · Try it: presets, steppers and chips on the left, score card and a live `tessera score --simulate` terminal on the right.
7. 05 · Reviews that pay: three one-liners and the recorded payout as `npm run demo:rewards` output.
8. 06 · The numbers: devnet vs mainnet table.
9. 07 · What is guaranteed: `npm test -- score` output, 14 checks, "14 passing".
10. 08 · What it cannot do and 09 · Where the ideas come from, side by side, then the footer.

### 2.2 The simulator (section 04)

- The HTML ships with a `compute()` function marked `TODO(Claude Code)`. **Replace it with the SDK's score function** called with the mainnet parameters, so the page and the program share one implementation. Keep the inputs and outputs the same shape.
- Inputs stay as steppers and chips, not sliders: total sales (steps 0, 200, 500, 1,000, 2,000, 5,000, 10,000, 20,000, 50,000), different buyers (0, 1, 2, 3, 5, 8, 12, 20, 40, 80), buyer tier (New 10%, Building 40%, Established 80%, Trusted 100%), days actively selling (0, 1, 3, 7, 16, 30, 60, 120), average review (1, 2, 3, 4, 4.5, 5), disputes lost (0 to 3).
- Presets and the scores they must produce with the SDK function: Brand new 0, Small honest shop 304, Busy and well reviewed 1000, Same but lost a dispute 750, Sells to itself 314. The shipped `compute()` is a reimplementation from the published rules and gives 315 for the last one. The SDK must give 314. If it does not, the preset inputs are wrong, not the SDK: adjust the inputs and tell Edison.
- Every click updates the score, the tier, the hold line, the meter, the "To reach …" line and every row of the terminal at once, with the 0.5 s width transitions already in the CSS.
- Keep the example wallet in the hero and the bars in section 02 in sync with the "Small honest shop" preset (0.28, 0.53, 0.24, 0.88, 1.00, evidence 0.35, score 304). If the SDK gives different factor values for that preset, update those static numbers too.

### 2.3 Placeholders

| Placeholder | What to do |
|---|---|
| `9xQw…K3pD` example wallet in the hero | Keep it as an example, or use a real devnet wallet whose breakdown you print from the SDK. |
| `href="#"` on nav items, "Full write-up in the repo", footer links | Real routes and URLs. |
| `recorded 2026-10-10 · local validator` payout block | Keep the recorded numbers exactly (0.169 USDC of 1.25 USDC, 13.52%). If the repo has the raw run output, generate this block from it so it cannot drift. |
| The 14 test lines | Generate from the real test titles if the suite can export them (see 4.3). Otherwise keep the copy and check it against the suite by hand. |

### 2.4 Design tokens and motion

Same tokens as the landing page brief: ground `#0B0E0D`, alt `#0E1210`, panel `#0F1412`, terminal `#070908` with bar `#0C100E`, border `#232C28`, hairline `#1A211E`, text `#E8EDE9`, muted `#A3ADA7`, dim `#86918B`, terminal text `#C9D2CC`, mint `#5EE6AB`, amber `#F5BE55`. Fonts: Bricolage Grotesque 700 display, Geist body, Geist Mono labels and terminals.

Motion is CSS only. Terminals type their command and reveal lines in steps, then loop. Factor bars grow on a loop. Tier rows light up in turn. `prefers-reduced-motion: reduce` shows the final state. Nothing may ever look empty.

### 2.5 Acceptance

- Works at 1440px and 390px. No page-level horizontal scroll. Only terminal bodies, the formula block and the numbers table may scroll sideways on a phone.
- Every control is a real `<button>` with `aria-pressed` where it is a choice. Visible focus ring.
- Preset scores match 2.2 using the SDK function.
- Text contrast at or above 4.5:1.

---

## 3. Job 2: `tessera score`

Goal: the real command prints what the hero terminal shows. Same words, columns and colours.

### 3.1 Behaviour

`tessera score <wallet> [--network devnet|mainnet] [--json] [--no-color]`

- Reads the wallet's accounts from the connected network and computes the breakdown with the SDK function (the same one the page uses).
- `tessera score --simulate [--sales N] [--buyers N] [--buyer-tier new|building|established|trusted] [--active N] [--stars N] [--disputes N] [--preset <name>]` runs the same function on made-up inputs at mainnet scale, so a developer can try the rules without a wallet. Presets take the five names from 2.2 in kebab-case (`small-honest-shop`).

### 3.2 Human output

```
9xQw…K3pD · 12 counterparties · 16 active periods · devnet
history      0.28   ████░░░░░░  √(800 ÷ 10000)
tenure       0.53   █████░░░░░  48 ÷ 90
diversity    0.24   ██░░░░░░░░  4.8 ÷ 20
rating       0.88   █████████░  4.14 stars
behaviour    1.00   ██████████  no penalty
evidence     0.35   0.45 × 0.28 + 0.30 × 0.53 + 0.25 × 0.24
score         304   1000 × 0.35 × 0.88 × 1.00
tier        Building   hold 24 h · devnet 45 s
✓ same result from the program, the SDK and this page
```

- Columns: label 12 characters, value 7 (right aligned to the decimal point in the real output is fine), bar 10 cells plus 2 spaces, then the explanation. Factor values are shown with 2 decimals. The score is an integer.
- Bars: 10 cells, filled = `round(value × 10)`. `█` and `░` on UTF-8 terminals, `#` and `-` otherwise.
- The explanation column prints the real inputs: for history `√(credit ÷ credit_full)`, tenure `min(age, 3 × active) ÷ tenure_full`, diversity `points ÷ diversity_full`, rating the weighted stars, behaviour `no penalty` or `25% standing penalty`. Use the connected network's parameters (devnet credit_full is $5.00, mainnet target $10,000).
- The tier line shows the hold for the connected network first and the other network after a middle dot, so on devnet it reads `hold 45 s · mainnet 24 h`.
- The last line prints only when the CLI has also read the program's stored score for that wallet and it matches. If it does not match, print `✗ program says <n>, SDK says <m>` in amber to stderr and exit 1. That line is the whole point of the page, so make it real.
- Colours: labels and explanations dim `#86918B`, values `#E8EDE9`, the score and the `✓` line mint `#5EE6AB`, bars in the tier colour (Trusted mint, Established `#8FE3BE`, Building `#A9C2B6`, New dim). Fallback to the 16-colour palette, no colour with `--no-color`, `NO_COLOR` or a non-TTY.

### 3.3 `--json`

```json
{
  "wallet": "9xQw…K3pD", "network": "devnet",
  "inputs": { "counterparties": 12, "active_periods": 16, "credit": 800, "credit_full": 10000, "points": 4.8, "diversity_full": 20, "stars": 4.14 },
  "factors": { "history": 0.28, "tenure": 0.53, "diversity": 0.24, "rating": 0.88, "behaviour": 1.00, "evidence": 0.35 },
  "score": 304, "tier": "Building", "hold": "24 h", "hold_seconds": 86400,
  "program_score": 304, "match": true
}
```

---

## 4. Job 3: scripts and tests that look the same

### 4.1 `npm run demo:rewards`

Print the recorded payout in this layout (reviewer 8 characters, stars 6 as `5/5`, quote 52, multiplier 6, payout 9, then the reason):

```
reviews of Glib · took an order from wren and never delivered · wren refunded in full
Scout   5/5   "Brilliant, instant."                                 0×    $0.000   praised it, then it failed
Nova    4/5   "Good enough."                                        0×    $0.000   praised it, then it failed
Orbit   2/5   "Summarised the wrong text. Careful with this one."   1.5×  $0.045   warned, then it failed
reviews of Quill · kept delivering
Scout   5/5   "Exactly the two sentences I needed."                 1×    $0.020   close to other buyers
Nova    5/5   "Reliable every time."                                1×    $0.020   close to other buyers
Orbit   4/5   "Fast and right."                                     1.2×  $0.024   agrees with other buyers
Wren    1/5   "Useless."                                            0.5×  $0.010   far from everyone else

paid from the treasury: 0.169 USDC of 1.25 USDC in fees · 13.52%
reproduce: npm run build:program && npm run demo:rewards
```

Colours: group lines dim, reviewer names primary, multipliers above 1× mint, below 1× amber, exactly 1× default, payouts primary, reasons mint when the review proved right and amber when it did not. The numbers are whatever the run produces. The layout is fixed.

### 4.2 Score tests

Add a reporter (or configure the existing runner) so `npm test -- score` prints one line per test in this shape, then a summary:

```
✓ A wallet nobody knows scores 0 and waits the longest hold  formula
✓ One counterparty can never grant more than the pair cap, however much it spends  formula + on-chain
…
14 passing · 9 formula · 7 on-chain
```

`✓` mint, the title default, the label dim. A failing test prints `✗` in amber with the assertion message under it. Tag each test `formula`, `on-chain` or `formula + on-chain` in its title or metadata so the label and the summary counts come from the suite, not from a hand-kept list.

### 4.3 Keep the page honest

Export the test titles and tags to a small JSON file during the test run (for example `site/public/score-tests.json`) and have the page render section 07 from it. Do the same for the payout block if the demo script can write its result to JSON. Then the page, the CLI and the tests cannot drift apart.

---

## 5. Questions to ask Edison before guessing

1. Where is the SDK's score function, and can the browser import it as is?
2. Does the program store a score the CLI can read back and compare, or must it be recomputed from the accounts?
3. Is `tessera` the real CLI name, and does a `score` command already exist in any form?
4. Which preset inputs does the live page use for the five presets? The shipped ones reproduce four of five scores and are a guess for the fifth.
5. Can the test suite be tagged `formula` and `on-chain` as described, or is there an existing convention to follow?
