import { Bars } from '../components/charts';
import { Counter, Logo } from '../components/ui';
import { SERIES } from '../lib/format';
import registry from '../../../../deployments/registry.json';
import snapshot from '../../../../deployments/snapshot.json';
import { Big, Body, Deck, Frame, Kicker, Rise, Source, type Slide } from './Deck';
import { DevnetSlide } from './pitch';

const mint = '#b9f8da';
const white = '#f1eee2';

/**
 * What changed since version 1, for the Encode Club judges: what existed
 * before 12 October 2026 (prior work), what is new in the window, the hard
 * part, and where it runs. Version 1's numbers are read from
 * deployments/snapshot.json; the lists follow the README section "What
 * existed before 12 October 2026 and what is new".
 */
const score = (name: string) => snapshot.agentsByScore.find((a) => a.name === name)?.score ?? 0;
const lowest = (names: string[]) => Math.min(...names.map(score));
const board = [
  { label: 'Honest merchants (lowest of 4)', value: lowest(['atlas', 'quill', 'vera', 'pixel']), color: SERIES[0] },
  { label: 'Honest buyers (lowest of 6)', value: lowest(['scout', 'nova', 'orbit', 'lumen', 'drift', 'echo']), color: SERIES[0] },
  { label: 'Wash-trading ring: its merchant', value: score('washer'), color: SERIES[1] },
  { label: 'Wash-trading ring: its sock puppets', value: lowest(['sock-1', 'sock-2', 'sock-3']), color: SERIES[1] },
  { label: 'Buyer who disputed real deliveries', value: score('charlie'), color: SERIES[1] },
  { label: 'Merchant who never delivered', value: score('mallory'), color: SERIES[1] },
];

const Cards = ({ items, cols, delay = 0.4 }: { items: [string, string][]; cols: number; delay?: number }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 20, marginTop: 40 }}>
    {items.map(([h, b], k) => (
      <Rise key={h} delay={delay + k * 0.12}>
        <div style={{ padding: '22px 26px', borderRadius: 20, border: '1px solid #ded7c2', background: '#fff', height: '100%' }}>
          <div className="display" style={{ fontSize: 34 }}>{h}</div>
          <div style={{ fontSize: 20, marginTop: 8, lineHeight: 1.4, color: '#4b483e' }}>{b}</div>
        </div>
      </Rise>
    ))}
  </div>
);

export const UPDATE: Slide[] = [
  {
    id: 'title',
    seconds: 5,
    say: 'Tessera. What changed since version 1.',
    render: () => (
      <Frame center>
        <Logo size={96} invert />
        <Big size={110} delay={0.3} color={white}>What changed since version 1</Big>
        <Body delay={0.7} size={30} max="64ch">Tessera 2.0 · Encode Club Solana Hackathon 2026 · Best Use of x402 on Solana</Body>
      </Frame>
    ),
  },
  {
    id: 'prior',
    seconds: 16,
    say: 'First, what is prior work. Every commit dated the twelfth of October or earlier is version 1: the escrow program on devnet, the agents and the ways in, the website and the videos, and a pay-later preview that paid the merchant directly, on a local validator only.',
    surface: 'paper',
    render: () => (
      <Frame pad={88}>
        <Kicker color="#878371">Prior work · what existed before 12 October 2026</Kicker>
        <Big size={66} max="26ch">Every commit dated 12 October 2026 or earlier <em>is version 1.</em></Big>
        <Cards
          cols={2}
          items={[
            ['The escrow program, on devnet', 'Score, reviews, disputes and the arbiter (programs/tessera). Not changed in the window.'],
            ['Agents and the ways in', 'Merchant and buyer agents, the swarm, the crank, the x402 route and the facilitator path; the HTTP API, MCP server, skill and CLI.'],
            ['Website, decks, videos', 'The site, the version 1 decks and all three demo videos; review rewards and the Agent Registry bridge.'],
            ['A pay-later preview', 'buy_now paid the merchant directly, outside the escrow, on a local validator only, with no place in the 402.'],
          ]}
        />
        <Source dark={false}>Tag v1-submission (11 Oct 2026). git log --date=short shows the dates; git diff c5e048c..v2 --stat is the whole in-window diff.</Source>
      </Frame>
    ),
  },
  {
    id: 'numbers',
    seconds: 13,
    say: 'Version 1 on devnet, before the window: more than two hundred orders settled through the escrow, and three attacks ran against it. A wash-trading ring, a buyer who disputes real deliveries, and a merchant who never delivers. None of them reached Trusted.',
    render: () => (
      <Frame pad={88}>
        <Kicker>Version 1 on devnet · prior work</Kicker>
        <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: 64, marginTop: 26, alignItems: 'center', flex: 1 }}>
          <div style={{ display: 'grid', gap: 34 }}>
            <Rise delay={0.2}>
              <div className="display" style={{ fontSize: 120, color: mint, lineHeight: 1 }}><Counter value={snapshot.ordersSettled} /></div>
              <div style={{ fontSize: 24, marginTop: 8 }}>orders settled through escrow</div>
            </Rise>
            <Rise delay={0.4}>
              <div className="display" style={{ fontSize: 120, color: white, lineHeight: 1 }}><Counter value={snapshot.reviewsOnChain} /></div>
              <div style={{ fontSize: 24, marginTop: 8 }}>reviews on-chain, each tied to a settled order</div>
            </Rise>
          </div>
          <Rise delay={0.6}>
            <div className="mono" style={{ fontSize: 16, color: '#8b8a7c', marginBottom: 20, letterSpacing: '0.08em' }}>SCORE OUT OF 1000 · TRUSTED STARTS AT 750</div>
            <div style={{ zoom: 1.5 }}>
              <Bars max={1000} format={(v) => String(v)} rows={board} />
            </div>
          </Rise>
        </div>
        <Source>deployments/snapshot.json, taken {snapshot.takenAt.slice(0, 16).replace('T', ' ')} UTC, before the window. The traffic is this project's own agents with recycled test USDC.</Source>
      </Frame>
    ),
  },
  {
    id: 'new',
    seconds: 22,
    say: "What is new. Pay later now lends into the escrow: the pool pays the buyer's escrow order, never the merchant, and confirms it in the same instruction. The merchant's 402 offers it as a second option, tessera-paylater, and settles it itself. The buyer agent and the CLI use it, the server keeps the pool, the site shows it, and new tests run the whole flow.",
    surface: 'paper',
    render: () => (
      <Frame pad={88}>
        <Kicker color="#878371">New in the window · commits from 22 October on</Kicker>
        <Big size={66} max="26ch">Pay later, over x402, <em>into the escrow.</em></Big>
        <Cards
          cols={3}
          items={[
            ['Pay later lends into the escrow', "buy_now reads the escrow's order and pays its vault. The buyer owes the price plus 2%; a refund leaves the loan owed."],
            ['Funded and confirmed at once', "buy_now calls the escrow's confirm_funded itself, so the pool's money never sits in an order the buyer could cancel."],
            ['A second option in the 402', "A tessera-paylater entry after the exact ones, with the buyer's live limit. The merchant checks the buy_now and the order, signs it too, sends it and delivers."],
            ['The buyer agent and the CLI', 'npm run buy -- --pay-later, over A2A or plain HTTP; tessera buy-later <merchant agent url> <skill>; tessera credit shows due dates.'],
            ['The keeper and the site', "The agents server marks late loans in default. The site reads the pool, a wallet's line and its loans."],
            ['Tests and docs', 'scripts/test-paylater-402.ts (new) and test-paylater.ts, on local validators; README sections on Solana, failed payments and prior work.'],
          ]}
        />
        <Source dark={false}>README, "What existed before 12 October 2026 and what is new". The escrow program was not changed in the window.</Source>
      </Frame>
    ),
  },
  {
    id: 'hard',
    seconds: 15,
    say: "The hard part: a loan must not turn into cash. Our first buy_now paid the order's vault and stopped there. The order was still awaiting payment, and the escrow lets its buyer cancel such an order and take back what is in the vault. So buy_now now has the escrow confirm the payment in the same instruction. Two more routes exist on devnet's older escrow: a buyer opening an order in a merchant's name, and a merchant repricing an order after the buyer signed. So buy_now now also needs the merchant's signature, and carries the agreed price.",
    render: () => (
      <Frame>
        <Kicker>The hard part</Kicker>
        <Big size={84} max="20ch" color={white}>A loan must not <em>turn into cash.</em></Big>
        <Body delay={0.6} size={30} max="52ch">
          The first buy_now paid the order's vault and stopped. The order was still awaiting payment, and the escrow lets its buyer cancel such an order and take back what is in the vault: credit, turned into cash.
        </Body>
        <Rise delay={1.0} style={{ marginTop: 44 }}>
          <span className="mono" style={{ fontSize: 28, color: mint }}>the fix: pay the vault → confirm_funded, in one instruction</span>
        </Rise>
        <Rise delay={1.3} style={{ marginTop: 18 }}>
          <span className="mono" style={{ fontSize: 22, color: '#c9c6b6' }}>two more on devnet's older escrow, an order opened in a merchant's name and one repriced after the buyer signed: the merchant signs buy_now, and buy_now carries the price</span>
        </Rise>
        <Source>Found by internal reviews on 27 and 28 Oct 2026. programs/tessera-paylater/src/lib.rs, buy_now.</Source>
      </Frame>
    ),
  },
  {
    id: 'devnet',
    seconds: 9,
    say: 'It runs on Solana devnet: the escrow from this repository at a new address with an upgrade key we hold, the new pay-later program, and a pool funded with devnet USDC.',
    render: () => <DevnetSlide pad={88} />,
  },
  {
    id: 'next',
    seconds: 8,
    say: "It already plugs into Solana's Agent Registry on devnet. Next, I want real x402 sellers using it.",
    surface: 'paper',
    render: () => (
      <Frame>
        <Kicker color="#878371">Next</Kicker>
        <Big size={92} max="17ch">Real x402 sellers, <em>using it.</em></Big>
        <Body delay={0.6} size={30} max="48ch" color="#4b483e">
          Already done: {Object.keys(registry.agents).length} merchant agents registered in the Solana Agent Registry on devnet, with {Object.keys(registry.feedback).length} reviews mirrored there as payment-backed feedback.
        </Body>
        <Source dark={false}>github.com/edison9733/x402_bnpl · devnet only, no outside users yet.</Source>
      </Frame>
    ),
  },
];

export const UpdateDeck = () => <Deck slides={UPDATE} title="Tessera: what changed since version 1" />;
