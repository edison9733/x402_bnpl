# Tessera: landing page + CLI handoff

Brief for Claude Code. Read this whole file first, then `landing/index.html` next to it.

How Edison uses this file: copy the `tessera-handoff` folder into the repo (for example `docs/handoff/`), open Claude Code in the repo and say:

> Read docs/handoff/CLAUDE_CODE_BRIEF.md and do everything in it, in order. Ask me the questions in the last section before you guess.

---

## 0. Ground rules

1. Explore the repo first. Report the stack (framework, language, package manager, where the current landing page lives, whether a CLI already exists). Follow the repo's conventions. Do not change unrelated code.
2. Two jobs, in this order: **Job 1** replace the landing page, **Job 2** build the `tessera` CLI so the real terminal looks like the terminals on the landing page.
3. Keep every Tessera fact in section 1 exact. Do not invent numbers, fees, timings or features. Where something is unknown, use a clearly marked placeholder and list it in your final report.
4. Writing style for any copy you touch: British spelling, short sentences, one idea per sentence. No em dashes, no semicolons, no rhetorical questions. Do not use these words: seamless, robust, leverage, empower, unlock, game-changer, revolutionise, cutting-edge, delve, landscape, harness, ensure, elevate, journey.
5. No emoji anywhere (website or CLI).

---

## 1. Tessera facts (keep exact)

- Tessera is **the credit layer for agentic commerce**: on-chain credit scoring infrastructure for x402 payments on Solana.
- **Tessera Pay Later** is buy now, pay later for AI agents. Agents buy over x402 now. The **main agent** pays for the whole tab at once, in one payment with one signature.
- Today, x402 payments have no chargeback once they settle, so agents mostly move small amounts. To x402, a fresh wallet and a wallet with a long, clean record look the same.
- Tessera scores each wallet and places it in a tier. Tier names are capitalised: **New, Building, Established, Trusted**.
- Tier gates: Building 250+ points and 3 active days. Established 500+ and 14. Trusted 750+ and 30.
- Hold times are **mainnet targets**: New 3 days, Building 24 h, Established 60 min, Trusted instant. On **devnet**: 2 min, 45 s, 10 s, instant. Always label which one.
- The hold on an order is the longer of the buyer's and the merchant's holds.
- Instant settlement needs both parties Trusted, or the buyer has two or more undisputed orders with that merchant, and the merchant within its instant limit.
- Score = 1000 × Evidence × Rating × Behaviour. Evidence = History + Tenure + Diversity. Never say "four factors".
- Each score is computed only from orders that settled on-chain. Anyone can recompute a score from on-chain data.
- Only the buyer and merchant on an order can review each other. A refunded order's review weighs nothing.
- The buyer needs no SOL because the x402 facilitator pays the network fee. Do not say who pays the facilitator back.
- An exit scam on instant settlement is capped at the fees the merchant already paid, plus a small base.
- Say "search for agents", not "SEO for agents". Say "designed to scale" until there is a mainnet run and an audit.

---

## 2. Job 1: the landing page

### 2.1 What to do

Replace the current landing page with `landing/index.html`, ported into the repo's framework (plain HTML, Astro, Next.js, whatever the repo uses). Keep the structure, the copy, the colours, the fonts and the CSS animations as they are. The file is self-contained: one `<style>` block, one small `<script>` for the 10 / 100 / 1,000 toggle, and a Google Fonts link.

Page order (do not reorder):

1. Header: logo, nav (Why trust, Merchants, Pay Later, Settle once, Docs), "Watch the demo".
2. Hero: "Buy now, pay later for AI agents." + the mosaic card (each tile is one x402 order; tiles go amber as orders land on the tab, then all turn mint when the main agent pays).
3. Demo: the video slot.
4. 01 · Why trust: how an x402 payment works today, "Tessera adds a trust layer", the example wallet (score meter, tier, hold chart to scale in hours), the "A score anyone can recompute" card with the animated formula, four fact cards.
5. 02 · Search for agents: the merchants terminal (`tessera merchants --sort score`, auto-scrolling list grouped by category).
6. 03 · Tessera Pay Later: shoppers vs agents steps, "Pay per call has four problems", the tab terminal (`tessera tab` then `tessera settle`).
7. 04 · Settle once: 10 / 100 / 1,000 toggle, "x402 today" card vs the settle terminal.
8. Closing: "Every payment matters." + footer.

### 2.2 Placeholders to replace

| Placeholder | What to do |
|---|---|
| `[Your demo video]` + the play button in `#demo` | Put the real demo video there. Use a `<video>` with a poster. The round play button starts it. Ask Edison for the file or URL. |
| `href="#"` on Docs, GitHub, Read the docs | Real URLs. Ask Edison. |
| `sample data` label on the terminals, and the 12 example merchants | Keep the label until the list is loaded from real data. If a public endpoint exists, load the real merchant list and drop the label. |
| CLI command names in the terminals | Must match the real CLI from Job 2 exactly. |
| `© 2026 Tessera` | Keep, or change to what Edison wants. |

### 2.3 Design tokens

| Token | Value | Used for |
|---|---|---|
| Ground | `#0B0E0D` | page background |
| Ground, alt | `#0E1210` | alternating sections |
| Panel | `#0F1412`, `#101513` | cards |
| Terminal background | `#070908` | terminal body |
| Terminal bar | `#0C100E` | terminal title bar |
| Border | `#232C28`, hairline `#1A211E` | card borders, dividers |
| Text | `#E8EDE9` | headings, primary |
| Text, muted | `#A3ADA7` | body |
| Text, dim | `#86918B` | labels, captions, terminal headers |
| Terminal text | `#C9D2CC` | default terminal lines |
| Mint | `#5EE6AB` | accent, Trusted, prompt `$`, success |
| Mint, Established | `#8FE3BE` | Established tier |
| Mint, Building | `#A9C2B6` | Building tier |
| Amber | `#F5BE55` | pay per call, "on tab", "unpaid", problems |
| Inactive bar | `#4A5852` | chart bars when not active |

Fonts (Google Fonts): **Bricolage Grotesque** 700 for display, **Geist** 400–700 for body, **Geist Mono** 400–600 for labels and terminals. Keep the system fallbacks that are in the file. Self-hosting through `@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` is fine.

Radii: cards 24px, inner cards 16–18px, pills 999px, terminal 16px. Max content width 1200px, side padding `clamp(16px, 4vw, 32px)`.

### 2.4 Motion rules

- All motion is CSS keyframes. Keep them. Do not add a JS animation library.
- Terminals on the page "type" their commands and reveal output line by line (`clip-path` steps), then loop. The merchants list auto-scrolls.
- `prefers-reduced-motion: reduce` turns everything off and shows the final state. Keep that.
- Nothing may ever look empty. If you change a timeline, check that every card has visible content at every point in its loop.

### 2.5 Acceptance for Job 1

- Works at 1440px and at 390px. No horizontal page scroll. Only the terminal bodies may scroll sideways on a phone.
- All links and anchors work. Nav anchors: `#trust`, `#merchants`, `#pay-later`, `#settle`, `#demo`.
- Real `<button>` and `<a>` elements stay as they are (keyboard reachable, visible focus ring).
- Text contrast stays at or above 4.5:1. Do not lighten the dark greys.
- Title, meta description and an Open Graph image are set.

---

## 3. Job 2: the `tessera` CLI

Goal: when a user runs the real commands in their own terminal, the output looks like the terminals on the landing page. Same words, same columns, same colours. The page is the design; the CLI is the product.

### 3.1 Where and how

- If a CLI package exists in the repo, add the commands there. If not, create one in the repo's main language (TypeScript on Node if the repo is TypeScript) with a `tessera` bin.
- Data comes from the real Tessera state (the on-chain program, its indexer or API, whatever the repo has). Never ship the sample data as the default. Ask Edison where merchants, scores, tabs and settlement come from if it is not obvious from the code.
- Three commands: `tessera merchants`, `tessera tab`, `tessera settle`.

### 3.2 Terminal UX rules (all commands)

- Output is plain text with ANSI colours. Use truecolor when the terminal supports it, fall back to the 16-colour palette otherwise, and print no colour when `--no-color` is passed, `NO_COLOR` is set, or stdout is not a TTY.
- Colour map (truecolor → 16-colour fallback):
  - Mint `#5EE6AB` → bright green: prompt, Trusted, success lines, the check mark.
  - Established `#8FE3BE` → green. Building `#A9C2B6` → white. New and dim text `#86918B` → bright black (grey).
  - Amber `#F5BE55` → yellow: `on tab`, `unpaid`, anything pending.
  - Primary text `#E8EDE9` → default foreground. Default lines `#C9D2CC` → default foreground.
- Do not paint a background. Do not draw the title bar from the website. Do not type the command for the user. The typing and line-by-line reveal are website animation only.
- Columns are fixed width in characters, left aligned, exactly as below. Never let a column shift when a value is short.
- Score bar: 10 cells. Filled cells = `round(score / 100)`. Use `█` for filled and `░` for empty on UTF-8 terminals, `#` and `-` otherwise. Colour the filled cells with the tier colour.
- Amounts: `$` + 3 decimals by default (`$0.010`). If an amount needs more decimals, show them for the whole column so it stays aligned. Ask Edison which token and symbol to show.
- Every command has `--json` for agents and scripts. JSON goes to stdout with no colour and no decoration. Human output goes to stdout. Errors go to stderr with exit code 1. Usage errors exit 2.
- Hold strings by tier: `instant`, `60 min`, `24 h`, `3 days` on mainnet. `instant`, `10 s`, `45 s`, `2 min` on devnet. Print the value for the network the CLI is connected to, and show the network in the summary line.
- Check mark `✓` on UTF-8 terminals, `ok` otherwise. No emoji.

### 3.3 `tessera merchants`

Flags: `--sort score|name` (default `score`, descending for score), `--category <name>`, `--limit <n>`, `--network devnet|mainnet` (default from config), `--json`, `--no-color`.

Human output, exactly this layout (sample data from the landing page; real data replaces it):

```
12 merchants · 5 categories · scores from settled orders only · devnet
MERCHANT        SELLS                SCORE             TIER         HOLD
# data · 5
search.api      web search results   912   █████████░  Trusted      instant
prices.api      token prices         868   █████████░  Trusted      instant
news.api        news headlines       571   ██████░░░░  Established  10 s
weather.api     forecasts            276   ███░░░░░░░  Building     45 s
scrape.api      page extraction      140   █░░░░░░░░░  New          2 min
# inference · 2
llm.api         chat completions     790   ████████░░  Trusted      instant
embed.api       text embeddings      603   ██████░░░░  Established  10 s
```

Note: the landing page shows mainnet target holds (instant, 60 min, 24 h, 3 days). The sample above is on devnet, so it shows devnet holds. The CLI always prints the holds of the network it is connected to.

Column widths: MERCHANT 16, SELLS 21, SCORE 6, bar 10 + 2 spaces, TIER 13, HOLD rest. Category header lines (`# data · 5`) are mint. The summary line and the column header are dim. Merchant names are primary text. Tier words use the tier colour. Groups are ordered by the highest score in the group when sorting by score, and alphabetically when sorting by name.

`--json` shape (adapt field names to the real model, keep the meaning):

```json
{
  "network": "devnet",
  "count": 12,
  "categories": { "data": 5, "inference": 2, "media": 2, "language": 1, "geo": 2 },
  "merchants": [
    { "name": "search.api", "category": "data", "sells": "web search results",
      "score": 912, "tier": "Trusted", "hold": "instant", "hold_seconds": 0 }
  ]
}
```

### 3.4 `tessera tab`

Shows the main agent's open tab. Flags: `--tab <id>` (default: the open tab), `--json`, `--no-color`.

```
tab 8f3c · open · pay later · devnet
ORDER  MERCHANT        ENDPOINT    AMOUNT   STATUS
#1     search.api      /query      $0.010   on tab
#2     prices.api      /sol-usd    $0.002   on tab
#3     news.api        /latest     $0.005   on tab
#4     llm.api         /chat       $0.040   on tab
#5     image.api       /render     $0.080   on tab
#6     translate.api   /text       $0.003   on tab
────────────────────────────────────────────────────
TOTAL  6 orders                    $0.140   unpaid
```

Column widths: ORDER 7, MERCHANT 16, ENDPOINT 12, AMOUNT 9, STATUS rest. The first line and the column header are dim. `on tab` and `unpaid` are amber. The rule is 52 `─` characters (or `-` without UTF-8). After settlement the same command shows `tab 8f3c · closed · $0.140 paid` and each order as `paid` in mint.

States to handle: no open tab (`no open tab · run a purchase first`, exit 0), an empty open tab (`tab 8f3c · open · 0 orders`), a tab that is settling.

`--json`: `{ "tab": "8f3c", "status": "open", "mode": "pay_later", "network": "devnet", "orders": [ { "n": 1, "merchant": "search.api", "endpoint": "/query", "amount": "0.010", "status": "on_tab" } ], "total": "0.140", "paid": false }`.

### 3.5 `tessera settle`

Settles the open tab in one payment from the main agent. Flags: `--tab <id>`, `--dry-run` (show what would be paid, pay nothing), `--yes` (skip the confirmation when the terminal is interactive), `--json`, `--no-color`.

```
tab 8f3c · 6 orders · unpaid
settling 6 orders in 1 payment
████████████████████ 100%
✓ settled · 1 signature · main agent
6 orders closed · 1 payment on-chain
```

- The progress bar is 20 cells and updates in place on a TTY (build, sign, send, confirm). Without a TTY print one line per step instead.
- After success print the transaction signature on its own line, dim, with an explorer link for the current network.
- On failure print `✗ not settled · <reason>` in amber to stderr and leave the tab open. Reasons must be plain words: not enough balance, a hold that has not passed, a rejected signature, a network error.
- `--json`: `{ "tab": "8f3c", "orders": 6, "payments": 1, "signature": "<sig>", "status": "settled", "network": "devnet" }`.

### 3.6 Tests and the final check

- Snapshot tests for the three human outputs with colour off, using fixed sample data, so the layout cannot drift.
- Schema tests for the three `--json` outputs.
- When done, run the three commands against devnet in a real terminal, screenshot them, and compare with the terminals on the landing page. Fix any difference in words, columns or colours. Then update the landing page terminals if the real commands or flags differ from what the page shows.

---

## 4. Questions to ask Edison before guessing

1. Where do merchants, scores, tiers and holds come from (program account, indexer, API)? Is there a merchant category field, or should the CLI derive categories?
2. What is the real tab id format, and which token and symbol should amounts show?
3. Does a CLI already exist, and what is its name and language? Are `merchants`, `tab` and `settle` the right command names?
4. The demo video file or URL, and the Docs and GitHub URLs.
5. Which network is the default right now, devnet or mainnet?
