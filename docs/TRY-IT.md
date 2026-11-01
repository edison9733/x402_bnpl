# Try Tessera yourself: be the buyer and the merchant

There are four ways to try it, from no setup at all to doing every step of a trade yourself.

| | What you do | You need |
|---|---|---|
| **A. Look around** | Play with the score, browse the live network | A browser |
| **B. Be both sides, from a terminal** | Make two wallets. Sell to yourself, pay, deliver, release, review, and get a refund | A computer with Node and the Solana CLI |
| **C. Buy on the website** | Buy from the demo merchant agents with the built-in devnet test wallet | A browser (the agents are hosted) |
| **D. Let an agent ask you to pay** | An agent with no key asks. You approve on a page and your own wallet pays | A Solana wallet on devnet, and Node for the CLI |

Everything runs on Solana **devnet** with test money. Nothing here costs real money.

---

## A. Look around (2 minutes)

Open https://agentic-commerce-two-theta.vercel.app

1. **The score**, in the menu of any inner page or in the footer of the home page:
   - Pick an example wallet, from **Brand new** to **Sells to itself**.
   - Then change sales, buyers, their tier, active days, stars and disputes with the − and + buttons
     and the chips. Watch the score, the tier and the hold change.
   - The terminal next to them prints what `tessera score --simulate` prints for that wallet.
2. **Live network**: every order on devnet, as it happens.
3. **Agents**: every wallet's credit file, with its score, reviews, and what each review was worth.
4. **Merchants**, on the home page: what an agent sees when it searches for a merchant in its terminal.

---

## B. Be the buyer and the merchant, from a terminal (about 20 minutes)

You make two wallets and play both sides of a real trade, one command at a time:
- The merchant asks for payment.
- The buyer pays into escrow.
- The merchant delivers.
- The buyer releases the money and both sides review each other.

Then you see a refund when a merchant never delivers.

Most outputs below come from a rehearsal on a local copy of the chain, using the devnet settings and
two brand-new wallets. Step 10 shows devnet itself, with a merchant made by these steps on 31 October.

> On Windows, use WSL (Ubuntu) and run everything inside it.

### Step 0. One-time: install the tools

1. Install **Node 22** (22.12 or newer), from https://nodejs.org.
2. Install the **Solana CLI**:
   ```bash
   sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
   ```
   Close and reopen the terminal, then check that it works with `solana --version`.
3. Get the code:
   ```bash
   git clone https://github.com/edison9733/x402_bnpl.git
   cd x402_bnpl
   npm ci
   ```

### Step 1. Make two wallets

```bash
mkdir -p ~/tessera
solana-keygen new --no-bip39-passphrase -o ~/tessera/buyer.json
solana-keygen new --no-bip39-passphrase -o ~/tessera/merchant.json

BUYER=$(solana address -k ~/tessera/buyer.json)
MERCHANT=$(solana address -k ~/tessera/merchant.json)
echo "buyer    $BUYER"
echo "merchant $MERCHANT"
```

Keep this terminal open: the later steps use `$BUYER` and `$MERCHANT`. In a new terminal, run the
last four lines again.

### Step 2. Get test money

1. **Test SOL for both wallets**, to pay network fees. The merchant also pays a small deposit to open an order.
   ```bash
   solana airdrop 1 $BUYER --url devnet
   solana airdrop 1 $MERCHANT --url devnet
   ```
   If it says you've hit the rate limit, use https://faucet.solana.com instead: paste each address and choose devnet.

2. **Test USDC for the buyer.**
   1. Go to https://faucet.circle.com.
   2. Choose **Solana Devnet**.
   3. Paste the `$BUYER` address and click **Send**.

   Check that it arrived:
   ```bash
   spl-token balance --owner $BUYER 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU --url devnet
   ```
   The merchant doesn't need any USDC. Its token account is created when it is first paid.

### Step 3. Start the Tessera API

In a **second terminal**, inside `x402_bnpl`:

```bash
npm run api
```

Leave it running. It builds transactions for you to sign. It never sees your keys: the CLI signs on
your computer.

Only the merchant agents are hosted (on Render). The API runs on your machine. If you host your own
API, skip this step and run `export TESSERA_API_URL=https://<your api domain>` in the first terminal.

All the commands below run in the **first terminal**.

### Step 4. As the buyer: check the merchant before paying

```bash
npm run tessera -- check $MERCHANT 0.50 --keypair ~/tessera/buyer.json
```

You see:

```
ESCROW  0.50 USDC  hold 120 s  (merchant_unknown)  [unknown_merchant]
Nobody has settled an order with this merchant. Pay only into an escrow it opens, held 120 s. If it cannot open one, do not pay.
merchant HwZD…TTFn  New 0  (no credit file)
buyer    75xu…7bEF  New 0  (no credit file)
```

The merchant is brand new, so the answer is: don't pay it directly. Pay into an escrow, and the money
is held for 2 minutes after delivery.

### Step 5. As the merchant: ask for payment

```bash
npm run tessera -- open merchant --buyer $BUYER --amount 0.50 \
  --request '{"item":"a haiku"}' --keypair ~/tessera/merchant.json --send
```

Among the lines it prints, these two matter:

```
order 8VHSNtD3WErxoG3wXdmpJD14VTYdoRj61tZzwGiFmKAZ  vault 5pJrATPR…
confirmed: 3ADY8BJS…
```

Copy the order address into a variable. Yours will be different:

```bash
ORDER=8VHSNtD3WErxoG3wXdmpJD14VTYdoRj61tZzwGiFmKAZ
```

### Step 6. As the buyer: pay into the escrow

```bash
npm run tessera -- open buyer --merchant $MERCHANT --amount 0.50 --order $ORDER \
  --keypair ~/tessera/buyer.json --send
```

The CLI checks that the money goes into this order's escrow vault, and nowhere else, before it signs.

Now look at the order:

```bash
npm run tessera -- escrow $ORDER
```

```
…  Funded  0.50 USDC  hold 120 s
buyer 75xu…7bEF  merchant HwZD…TTFn  vault holds 0.50 USDC
  next: merchant → deliver_order: deliver until …
  next: anyone → reclaim_after_timeout: refund the buyer if nothing was delivered from …
```

The money sits in the vault. Neither side can take it alone.

### Step 7. As the merchant: deliver

```bash
npm run tessera -- deliver $ORDER \
  --deliverable '{"haiku":"coins wait in escrow / the poem arrives on time / both sides sleep at night"}' \
  --keypair ~/tessera/merchant.json --send
```

A fingerprint (hash) of the deliverable is recorded on chain, so later nobody can claim something
else was delivered.

### Step 8. As the buyer: release the money

When you're happy with what you got:

```bash
npm run tessera -- release $ORDER --keypair ~/tessera/buyer.json --send
```

Among the lines it prints:

```
payouts: merchant 0.495 USDC, fee 0.005 USDC, buyer 0.00 USDC
```

If the buyer does nothing, anyone can release the money once the 2-minute hold ends. If the buyer
is unhappy, they can open a dispute during the hold instead.

### Step 9. Review each other

The buyer reviews the merchant:

```bash
npm run tessera -- report $ORDER --outcome satisfied --rating 5 \
  --comment "Fast and exactly what I asked for" --keypair ~/tessera/buyer.json --send
```

The merchant reviews the buyer:

```bash
npm run tessera -- report $ORDER --outcome satisfied --rating 5 \
  --comment "Paid promptly" --keypair ~/tessera/merchant.json --send
```

Each review weighs as much as the money that actually settled. A review with no purchase behind it
counts for nothing.

### Step 10. See what changed

```bash
npm run tessera -- score $MERCHANT
npm run tessera -- find --limit 20
```

This is a merchant made with these steps on devnet on 31 October. Yours prints the same lines with
your own address:

```
2SNy…a4F5 · 1 counterparty · 1 active period · devnet
history     0.10   █░░░░░░░░░  √(0.05 ÷ 5.00)
tenure      0.10   █░░░░░░░░░  3 ÷ 30
diversity   0.02   ░░░░░░░░░░  0.1 ÷ 5
rating      0.56   ██████░░░░  3.18 stars
behaviour   1.00   ██████████  no penalty
evidence    0.08   0.45 × 0.100 + 0.30 × 0.100 + 0.25 × 0.020
score       44     1000 × 0.080 × 0.560 × 1.0000
tier        New         hold 2 min · mainnet target 3 days
✓ the program stored 40 on 31 Oct 13:56 UTC and the SDK gives the same for that moment · 44 now

7 found · sorted best: Score: reviews weighted by the money behind them, settled sales, distinct buyers, tenure and penalties. Every review needed a real settled order.
 1. 93YALFSrr5dBp1FuZsFRPVeM3w6i3ovrg97PZ9SWVGJk  Vera  Trusted 1000 ★4.83 (39 reviews, 41 sales)
    ESCROW ~126 s to settled  credit-report 0.30 USDC
    "Delivered what was asked. Hash matches." ★5
    "Delivered what was asked. Hash matches." ★5
…
 6. 2SNySKwUmdG3b3iwC5gspQYkPEXiZWkvRf4tA1qqa4F5    New 44 ★3.18 (1 review, 1 sale, 1 missed)
    ESCROW ~127 s to settled
    "Fast and exactly what I asked for" ★5
 7. EbTnud5vWHwQP3dyQ7WyX8VSytyq8vXThTnJESoCF3NV  mallory  New 0 ★3.00 (3 reviews, 0 sales, 3 missed)
    ESCROW ~420 s to settled
Pick one, call check_payment with its merchant wallet and your amount (this list is up to 30 s old), then pay into the escrow order it quotes.
```

What this shows:
- One small sale moves the score a little. Trust is earned slowly, and faking it costs money. Each line
  prints the real input behind the factor: your buyer was New, so the $0.50 sale counts for 10% of it,
  $0.05 of the $5.00 at which History is full on devnet.
- Tenure counts at most three periods for each active period. With one active period it stops at
  0.10 (3 ÷ 30), three minutes after step 5. If you get here sooner, it is lower and so is the score.
- The stars show 3.18, not 5. Every wallet starts from 3 stars, and one 50-cent review only moves that a bit.
- The last line checks the score the program stored on the account against the SDK, for the moment it
  was stored. This merchant's 40 was stored at step 11, while its penalty stood. If nothing has changed
  since, the line reads `✓ same result from the program and the SDK`. If the two ever differed, the
  command would say so and exit 1.
- `find` is the call AI agents make to choose who to buy from. It shows the top 5 unless you pass
  `--limit`. Your merchant is listed below the four Trusted demo merchants, with its one review. The
  merchant above shows `1 missed` because it went on to step 11.

You can also see it on the website: open `https://agentic-commerce-two-theta.vercel.app/#/agents/<your merchant address>`.

Every `confirmed:` line came with an `explorer.solana.com` link. Open one to see the transaction on Solana.

### Step 11. The bad path: the merchant takes the order and never delivers

Open and pay a second order (steps 5 and 6), this time for `0.30`, and save its address as `ORDER2`.
Then **don't deliver**.

If the buyer tries to take the money back straight away, it is refused:

```bash
npm run tessera -- reclaim $ORDER2 --keypair ~/tessera/buyer.json --send
```

Among the lines it prints:

```
not_yet: The merchant still has time to deliver.
```

The merchant has 5 minutes to deliver. After that, run the same command again. Among the lines it prints:

```
payouts: merchant 0.00 USDC, fee 0.00 USDC, buyer 0.30 USDC
Sign and send. The buyer gets everything back.
```

The buyer gets everything back, and the merchant's file now shows the miss:

```bash
npm run tessera -- score $MERCHANT
```

```
behaviour   0.90   █████████░  10% standing penalty
score       40     1000 × 0.080 × 0.560 × 0.9000
```

The whole score is a tenth lower until the penalty heals, and a wallet with any penalty standing cannot be
Trusted. (`score` prints every line as in step 10. Only the behaviour and score lines change.)

### Things to try next

- **Sell to more buyers.** Make a third wallet and repeat steps 4 to 9, then compare `score`. More
  different buyers counts for more than more money from the same buyer.
- **Ask like an agent.** Run `npm run tessera -- find --sort fastest`, or
  `npm run tessera -- check $MERCHANT 0.50 --keypair ~/tessera/buyer.json` again. The hold and the
  reason change as the merchant builds a record.
- **Plug in Claude.** Run `npm run mcp`, then
  `claude mcp add --transport http tessera http://127.0.0.1:4040/mcp`, and ask Claude:
  "list the best merchants on Tessera and check one before paying 0.50 USDC".

### If something goes wrong

| You see | It means | Do this |
|---|---|---|
| `insufficient_funds` | The buyer has no test USDC | Use the Circle faucet again (step 2) |
| `the API at http://127.0.0.1:4030 is unreachable` | `find`, `check`, `escrow` and the commands that build a transaction call the API, and it is not running | Start `npm run api` in the second terminal (step 3) |
| `score failed` or `rate limiting` | `score` reads the chain itself, with no API. The devnet RPC did not answer | Wait a minute and run it again, or pass `--rpc <your devnet RPC>` |
| `airdrop request failed` | Devnet's rate limit | Use https://faucet.solana.com |
| `not_yet` | It's too early for that step | Read the time it gives, or run `escrow $ORDER` to see what's possible next |
| `self_dealing` | The buyer and the merchant are the same wallet | Use the two different key files |

---

## C. Buy on the website with the built-in test wallet

The merchant agents are hosted on Render, at <https://tessera-agents.onrender.com/agents>
([RAILWAY.md](RAILWAY.md)), and the site is built with `VITE_AGENTS_URL` pointing at them. The instance is
free, so after a quiet spell the first request takes up to a minute while it wakes. The Market page then
loads the merchants.

The site has no wallet login. It pays from a throwaway devnet key kept in your browser. Agents sign with
their own keys through the API, CLI or SDK.

1. Open the site and go to **Market**. Press the test-funds button. It sends the built-in wallet test
   USDC and SOL.
2. Pick a merchant and buy. The page does each step for you:
   - Pay into escrow.
   - Check the delivery.
   - Release.
   - Review.
3. Open **Agents** and find the built-in wallet: your purchase and review are on its credit file.

---

## D. Let an agent ask you to pay

Your agent holds no key and no card. It asks a merchant to open an escrow order in your name and sends
you a link. You check the order on the page and your own wallet pays. Until the hold ends you can
dispute from the same page.

You need a Solana wallet set to devnet (Phantom: Settings → Developer Settings → Testnet Mode, then
Solana Devnet) holding a little devnet SOL ([faucet.solana.com](https://faucet.solana.com)) and test
USDC ([faucet.circle.com](https://faucet.circle.com), choose Solana Devnet).

1. As the agent, ask the hosted Pixel merchant. You need no local servers. There is no `--keypair`:
   this machine never holds your key.

   ```bash
   npm run tessera -- ask https://tessera-agents.onrender.com/agents/pixel identicon --owner <your wallet> --input '{"seed":"my-agent"}' --wait
   ```

   It reads the order from the chain, prints an `approve` link on the public site, and waits.

   The hosted instance is free and sleeps after a quiet spell. It can take up to a minute to wake, and
   `ask` gives up on the merchant's card after 30 s. If the first try times out, open
   <https://tessera-agents.onrender.com/health>, wait for it to answer, and run `ask` again.
2. Open the link where your wallet is: in the browser with the extension, or on a phone the `phone`
   link, which opens the page inside Phantom. The page shows what the order buys (checked against the
   hash the order committed), the merchant's score and the price, all read from the chain. Press
   **Approve and pay**. You have 5 minutes before the quote expires. Nothing is charged if you don't.
3. The command sees the payment, collects the delivery and checks it against the hash on-chain. On the
   page you can watch the hold, and dispute or release early.

With your own keys, you can run the merchants yourself instead: `npm run agents` and `npm run web`, each
in its own terminal, then `ask http://localhost:4020/agents/pixel …`. The link then opens your local site.

Without `--wait`, `ask` prints the link and a `collect` command to run after you have paid, for an agent
that cannot wait on one command.

No devnet, or no wallet extension? `npm run build:program && npm run approve:local` runs the same flow on a
local validator: the real escrow program and merchant server, with throwaway keys and an owner wallet
holding test USDC. It prints the three commands to run (the website reading that validator, the line
that makes the website's test wallet the owner, and the agent's `ask`), and Ctrl-C deletes everything.
