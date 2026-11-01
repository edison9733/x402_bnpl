import { Bars } from '../components/charts';
import { Counter, Mark } from '../components/ui';
import { SERIES } from '../lib/format';
import registry from '../../../../deployments/registry.json';
import snapshot from '../../../../deployments/snapshot-v1.json';
import { Big, Body, Deck, Frame, Kicker, Rise, Source, type Slide } from './Deck';
import { DevnetSlide } from './pitch';

const mint = '#5EE6AB';
const white = '#E8EDE9';

/**
 * What changed since version 1, for the Encode Club judges: what existed
 * up to 12 October 2026 (prior work), what is new in the window, the hard
 * part, and where it runs. Version 1's numbers are read from
 * deployments/snapshot-v1.json, the snapshot of tag v1-submission (taken
 * 4 October 2026, on the retired escrow). The lists follow the README
 * section "What existed before 12 October 2026 and what is new".
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
        <div style={{ padding: '22px 26px', borderRadius: 20, border: '1px solid #232C28', background: '#101513', height: '100%' }}>
          <div className="display" style={{ fontSize: 34 }}>{h}</div>
          <div style={{ fontSize: 20, marginTop: 8, lineHeight: 1.4, color: '#A3ADA7' }}>{b}</div>
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
        <Mark size={92} />
        <Big size={110} delay={0.3} color={white}>What changed since version 1</Big>
        <Body delay={0.7} size={30} max="64ch">Tessera 2.0 · Encode Club Solana Hackathon 2026 · Best Use of x402 on Solana</Body>
      </Frame>
    ),
  },
  {
    id: 'prior',
    seconds: 16,
    say: 'First, what is prior work. Every commit dated the twelfth of October or earlier is version 1: the escrow program and its first devnet deployment, the agents and the ways in, the website and the videos, and a pay-later preview that paid the merchant directly, on a local validator only.',
    surface: 'paper',
    render: () => (
      <Frame pad={88}>
        <Kicker color="#86918B">Prior work · what existed up to 12 October 2026</Kicker>
        <Big size={66} max="26ch">Every commit dated 12 October 2026 or earlier <em>is version 1.</em></Big>
        <Cards
          cols={2}
          items={[
            ['The escrow program', 'Score, reviews, disputes and the arbiter (programs/tessera), and its version 1 deployment, TessSeP5…, now retired. The source did not change in the window, except its address.'],
            ['Agents and the ways in', 'Merchant and buyer agents, the swarm, the crank, the x402 route and the facilitator path. The HTTP API, MCP server, skill and CLI.'],
            ['Website, decks, videos', 'The site, the version 1 decks and all three demo videos. Review rewards and the Agent Registry bridge.'],
            ['A pay-later preview', 'buy_now paid the merchant directly, outside the escrow, on a local validator only, with no place in the 402.'],
          ]}
        />
        <Source dark={false}>Tag v1-submission (11 Oct 2026). git log --date=short shows the dates. git diff c5e048c..v2 --stat is the whole in-window diff.</Source>
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
            <div className="mono" style={{ fontSize: 16, color: '#86918B', marginBottom: 20, letterSpacing: '0.08em' }}>SCORE OUT OF 1000 · TRUSTED STARTS AT 750</div>
            <div style={{ zoom: 1.5 }}>
              <Bars max={1000} format={(v) => String(v)} rows={board} />
            </div>
          </Rise>
        </div>
        <Source>deployments/snapshot-v1.json, taken {snapshot.takenAt.slice(0, 16).replace('T', ' ')} UTC, before the window. The traffic is this project's own agents with recycled test USDC.</Source>
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
        <Kicker color="#86918B">New in the window · commits from 22 October on</Kicker>
        <Big size={66} max="26ch">Pay later, over x402, <em>into the escrow.</em></Big>
        <Cards
          cols={3}
          items={[
            ['Pay later lends into the escrow', "buy_now reads the escrow's order and pays its vault. The buyer owes the price plus 2%. A refund leaves the loan owed."],
            ['Funded and confirmed at once', "buy_now calls the escrow's confirm_funded itself, so the pool's money never sits in an order the buyer could cancel."],
            ['A second option in the 402', "A tessera-paylater entry after the exact ones, with the buyer's live limit. The merchant checks the buy_now and the order, signs it too, sends it and delivers."],
            ['The buyer agent and the CLI', 'npm run buy -- --pay-later, over A2A or plain HTTP. tessera buy-later <merchant agent url> <skill>. tessera credit shows due dates.'],
            ['The keeper and the site', "The agents server marks late loans in default. The site reads the pool, a wallet's line and its loans."],
            ['Tests and docs', 'scripts/test-paylater-402.ts (new) and test-paylater.ts, on local validators. README sections on Solana, failed payments and prior work.'],
          ]}
        />
        <Source dark={false}>README, "What existed before 12 October 2026 and what is new". The escrow program's source was not changed in the window, except its address.</Source>
      </Frame>
    ),
  },
  {
    id: 'since',
    seconds: 14,
    say: 'Also new, from the thirty-first of October: an approval link, so an agent with no key can ask its owner to pay. A new home page and three CLI commands. Hosted demo agents, and one design for every page. And a score page with a simulator.',
    surface: 'paper',
    render: () => (
      <Frame pad={88}>
        <Kicker color="#86918B">Also new in the window · 31 October and 1 November</Kicker>
        <Big size={66} max="26ch">An owner can pay, <em>and the score shows its working.</em></Big>
        <Cards
          cols={3}
          items={[
            ['An approval link', "An agent with no key asks, and its owner's wallet pays on the Approve page. tessera ask and collect. dca1b0c, 31 Oct."],
            ['A new home page', 'From the Pay Later design, with tessera merchants, tab and settle. 6081764, 31 Oct.'],
            ['Hosted demo agents', 'The agents run on Render, and the live Market buys from them. cf5cd42, 31 Oct.'],
            ['One design', "Every inner page takes the home page's look. fc51a28, 31 Oct."],
            ['The score page', 'Five factors, the tiers and a simulator that runs the SDK. 1 Nov.'],
            ['tessera score and npm test', 'tessera score checks the SDK against the score on chain. npm test says where each test is proved. 1 Nov.'],
          ]}
        />
        <Source dark={false}>git log --date=short (UTC+8). The 1 November work is listed in docs/ENCODE-CHECKLIST.md.</Source>
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
          <span className="mono" style={{ fontSize: 22, color: '#A3ADA7' }}>two more on devnet's older escrow, an order opened in a merchant's name and one repriced after the buyer signed: the merchant signs buy_now, and buy_now carries the price</span>
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
    say: "Version 1's merchants are already in Solana's Agent Registry on devnet. Next, I want real x402 sellers using it.",
    surface: 'paper',
    render: () => (
      <Frame>
        <Kicker color="#86918B">Next</Kicker>
        <Big size={92} max="17ch">Real x402 sellers, <em>using it.</em></Big>
        <Body delay={0.6} size={30} max="48ch" color="#A3ADA7">
          Already done in version 1: its {Object.keys(registry.agents).length} merchants are registered in the Solana Agent Registry on devnet, pointing at the retired escrow, with {Object.keys(registry.feedback).length} reviews mirrored. The 2.0 agents are not yet.
        </Body>
        <Source dark={false}>github.com/edison9733/x402_bnpl · devnet only, no outside users yet.</Source>
      </Frame>
    ),
  },
];

export const UpdateDeck = () => <Deck slides={UPDATE} title="Tessera: what changed since version 1" />;
