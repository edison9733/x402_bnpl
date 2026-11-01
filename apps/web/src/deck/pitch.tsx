import { motion } from 'motion/react';
import { MAINNET_TARGET_PARAMS as P } from '@tessera/sdk';
import { Counter, EASE, Mark } from '../components/ui';
import { duration, TIER_DARK, tierName } from '../lib/format';
import * as payout from '../lib/rewardsDemo';
import snapshot from '../../../../deployments/snapshot.json';
import { Big, Body, Deck, Frame, Kicker, Rise, Source, type Slide } from './Deck';

const mint = '#5EE6AB';
const white = '#E8EDE9';

function RewardsSlide() {
  const glib = payout.rows.filter((r) => r.subject === 'glib');
  return (
    <Frame pad={84}>
      <Kicker>Reviews that pay</Kicker>
      <Big size={78} max="22ch" color={white}>
        Paid to review. <em>Paid more for being right.</em>
      </Big>
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 52, marginTop: 36, alignItems: 'start' }}>
        <Rise delay={0.4}>
          <div className="mono" style={{ fontSize: 19, color: '#A3ADA7', marginBottom: 12 }}>Three buyers reviewed Glib. Then Glib took an order and never delivered.</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {glib.map((r, k) => {
              const good = r.label === 'early_warning';
              return (
                <Rise key={r.reviewer} delay={0.7 + k * 0.16}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', alignItems: 'center', gap: 16, padding: '14px 22px', borderRadius: 16, border: `1px solid ${good ? mint : '#232C28'}`, background: good ? '#13201A' : '#101513' }}>
                    <div>
                      <span className="display" style={{ fontSize: 32, color: white }}>{payout.cap(r.reviewer)}</span>
                      <span style={{ fontSize: 24, color: '#F5BE55', marginLeft: 12 }}>{'★'.repeat(r.rating)}</span>
                      <span style={{ fontSize: 24, color: '#3A4741' }}>{'★'.repeat(5 - r.rating)}</span>
                      <div className="mono" style={{ fontSize: 16, color: good ? mint : '#F5BE55', marginTop: 2 }}>{payout.LABELS[r.label]!.x} · {payout.LABELS[r.label]!.short}</div>
                    </div>
                    <div className="display" style={{ textAlign: 'right', fontSize: 40, color: good ? mint : '#86918B' }}>${r.reward}</div>
                  </div>
                </Rise>
              );
            })}
          </div>
          <Rise delay={1.3}>
            <div className="mono" style={{ fontSize: 17, marginTop: 14, color: '#A3ADA7' }}>
              Paid on chain: <span style={{ color: mint }}>{payout.fees.paidToReviewers} USDC of {payout.fees.collected} USDC in fees</span>, to {payout.rows.filter((r) => Number(r.reward) > 0).length} reviews
            </div>
          </Rise>
        </Rise>
        <div style={{ display: 'grid', gap: 16 }}>
          {[
            ['Same pay for 1★ or 5★', 'A quarter of the fee rate on the money behind the review. Stars never change it.'],
            ['Judged on what happened next', 'An honest warning is paid 1.5×. Praising a wallet that then failed is paid nothing.'],
            ['Faking it loses money', 'At most 75% of an order’s fee comes back, so farming with your own wallets never pays.'],
          ].map(([h, b], k) => (
            <Rise key={h} delay={0.9 + k * 0.15}>
              <div style={{ padding: '18px 24px', borderRadius: 18, border: '1px solid #232C28', background: '#101513' }}>
                <div className="display" style={{ fontSize: 32, color: white }}>{h}</div>
                <div style={{ fontSize: 21, marginTop: 6, lineHeight: 1.35, color: '#A3ADA7' }}>{b}</div>
              </div>
            </Rise>
          ))}
        </div>
      </div>
      <Source>Recorded {payout.recordedAt}: real purchases, reviews, a missed delivery and the rebate payout, on a local validator running the real program. Reproduce: {payout.reproduce}</Source>
    </Frame>
  );
}

function PayLaterSlide() {
  const rows: [string, string, string][] = [
    ['The merchant quotes', 'opens an escrow order. Its 402 names it as payTo', '0.20'],
    ['The pool pays the order', 'buy_now: into the escrow vault, never to the merchant', '0.20'],
    ['The escrow pays the merchant', 'after delivery and the hold, minus its 1% fee', '0.198'],
    ['The buyer repays the pool', 'the price plus 2%, by the due date', '0.204'],
  ];
  return (
    <Frame pad={84}>
      <Kicker>Pain 3 · top up before every job, count the tokens · Fix 3, new in 2.0: pay later</Kicker>
      <Big size={78} max="22ch" color={white}>
        Buy now, pay later. <em>Still through escrow.</em>
      </Big>
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 52, marginTop: 36, alignItems: 'start' }}>
        <Rise delay={0.4}>
          <div style={{ display: 'grid', gap: 10 }}>
            {rows.map(([name, line, amount], k) => (
              <Rise key={name} delay={0.6 + k * 0.16}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '14px 22px', borderRadius: 16, border: `1px solid ${k === 1 ? mint : '#232C28'}`, background: k === 1 ? '#13201A' : '#101513' }}>
                  <div style={{ flex: 1 }}>
                    <span className="display" style={{ fontSize: 32, color: white }}>{name}</span>
                    <div className="mono" style={{ fontSize: 16, color: k === 1 ? mint : '#86918B' }}>{line}</div>
                  </div>
                  <span className="display" style={{ fontSize: 40, color: k === 1 ? mint : white }}>{amount}</span>
                </div>
              </Rise>
            ))}
          </div>
          <Rise delay={1.3}>
            <div className="mono" style={{ fontSize: 17, marginTop: 14, color: '#A3ADA7' }}>
              A 0.20 USDC purchase on credit. <span style={{ color: mint }}>Credit never skips buyer protection</span>: refund and dispute work as for any order.
            </div>
          </Rise>
        </Rise>
        <div style={{ display: 'grid', gap: 16 }}>
          {[
            ['Credit from the record', 'Only a wallet with a Tessera record gets a limit: tier limit × score ÷ 1000. A New wallet gets nothing.'],
            ['Pay later', 'The price plus 2% by the due date, no interest. Paying on time raises the limit, up to double.'],
            ['Or default, in public', 'Anyone can mark a late loan. The line freezes at zero for good.'],
          ].map(([h, b], k) => (
            <Rise key={h} delay={0.9 + k * 0.15}>
              <div style={{ padding: '18px 24px', borderRadius: 18, border: '1px solid #232C28', background: '#101513' }}>
                <div className="display" style={{ fontSize: 32, color: white }}>{h}</div>
                <div style={{ fontSize: 21, marginTop: 6, lineHeight: 1.35, color: '#A3ADA7' }}>{b}</div>
              </div>
            </Rise>
          ))}
        </div>
      </div>
      <Source>New in 2.0. buy_now pays the order's vault and has the escrow confirm it in the same instruction. The escrow program is unchanged. Tested by npm run test:paylater.</Source>
    </Frame>
  );
}

/** The 402 with its second option. The shape is the merchant server's (apps/agents/src/paylater.ts). */
function X402Slide() {
  const grey = '#6B7771';
  return (
    <Frame pad={84}>
      <Kicker>x402 · a second way to pay, in the same 402</Kicker>
      <Big size={80} max="30ch" color={white}>
        The 402 also offers <em style={{ whiteSpace: 'nowrap' }}>tessera-paylater.</em>
      </Big>
      <Rise delay={0.6} style={{ marginTop: 36 }}>
        <pre className="mono" style={{ fontSize: 22, lineHeight: 1.6, margin: 0, padding: '28px 36px', borderRadius: 22, background: '#101513', border: '1px solid #232C28', color: '#C9D2CC' }}>
{`HTTP/1.1 402 Payment Required
"accepts": [
  { "scheme": "exact",            "payTo": "<order>", "amount": "200000" },   `}<span style={{ color: grey }}>{'// any x402 client'}</span>{`
  { "scheme": `}<span style={{ color: mint }}>"tessera-paylater"</span>{`, "payTo": "<order>", "amount": "200000",
    "extra": { "feePayer": "<merchant>", "buyerLimit": "602000",
               "fee": "4000", "termSecs": 600, "eligible": true } }
]`}
        </pre>
      </Rise>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22, marginTop: 30 }}>
        {[
          ['1 · The buyer signs', 'One buy_now for that order, with the merchant as fee payer.'],
          ['2 · The merchant settles it', "It checks the transaction and the order, signs as fee payer and as the order's merchant, simulates it and sends it."],
          ['3 · Then it delivers', 'The pool has paid the vault and the escrow has confirmed it, in one instruction.'],
        ].map(([h, b], k) => (
          <Rise key={h} delay={1.0 + k * 0.15}>
            <div style={{ padding: '18px 24px', borderRadius: 18, border: `1px solid ${k === 2 ? mint : '#232C28'}`, background: k === 2 ? '#13201A' : '#101513', height: '100%' }}>
              <div className="display" style={{ fontSize: 30, color: white }}>{h}</div>
              <div style={{ fontSize: 20, marginTop: 6, lineHeight: 1.35, color: '#A3ADA7' }}>{b}</div>
            </div>
          </Rise>
        ))}
      </div>
      <Source>Standard x402 clients are unaffected: the exact entries come first. buyerLimit: 2 USDC × 301 ÷ 1000, a Building buyer on the devnet pool. Tested by npm run test:paylater-402.</Source>
    </Frame>
  );
}

export const DEVNET: [string, string, string, boolean][] = [
  ['Escrow program', 'tESs6b4JFTWoNnELMa4KSxPuJDSRaLAtCSUr8BGY6ry', 'deployed 28 Oct, with the review fixes', true],
  ['Pay-later program', 'LXNPYNYcjv1G3HEJzurFrnj11NGnriy5xxqKSeTQU7D', 'new in 2.0 · upgraded 28 Oct', true],
  ['Pool', 'GNf8LpVeJ6ayrVMqABpU1nAHW9ZX7upC2aGqcumWF5Qq', 'funded with 8 devnet USDC', true],
  ['Pool vault', 'DK9angk2VJ43sUaUgJB9wpvDmjh4zroVj8zC2UYTXsgV', "the pool's USDC", false],
  ['USDC (devnet)', '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', "Circle's devnet mint", false],
];

export function DevnetSlide({ pad = 96 }: { pad?: number }) {
  return (
    <Frame pad={pad}>
      <Kicker>Live on Solana devnet</Kicker>
      <Big size={80} max="22ch" color={white}>
        Two programs and a pool, <em>on devnet.</em>
      </Big>
      <div style={{ marginTop: 40 }}>
        {DEVNET.map(([k, a, note, accent], i) => (
          <Rise key={k} delay={0.4 + i * 0.12}>
            <div style={{ display: 'grid', gridTemplateColumns: '250px 640px 1fr', alignItems: 'baseline', padding: '14px 0', borderTop: '1px solid #232C28', borderBottom: i === DEVNET.length - 1 ? '1px solid #232C28' : undefined, fontSize: 24 }}>
              <span style={{ color: white }}>{k}</span>
              <span className="mono" style={{ fontSize: 20, color: accent ? mint : '#A3ADA7' }}>{a}</span>
              <span style={{ fontSize: 20, color: '#86918B' }}>{note}</span>
            </div>
          </Rise>
        ))}
      </div>
      <Rise delay={1.1} style={{ marginTop: 30 }}>
        <span className="mono" style={{ fontSize: 20 }}>
          Pool rules: limits <span style={{ color: white }}>0 / 2 / 5 / 10 USDC</span> by tier · fee <span style={{ color: white }}>2%</span> · term <span style={{ color: white }}>600 s</span> + 60 s grace · merchants at Building or above
        </span>
      </Rise>
      <Source>Read on chain on 28 Oct 2026 (getAccountInfo). explorer.solana.com/address/&lt;address&gt;?cluster=devnet. The version 1 escrow, TessSeP5…1CQ, lost its keys and is retired. Its accounts stay as history.</Source>
    </Frame>
  );
}

function LimitsSlide() {
  const items: [string, string][] = [
    ['Devnet test money.', "Circle's devnet USDC, and the traffic is this project's own agents."],
    ['One pool authority key.', 'One lender, one pool: that key alone sets the rules and withdraws.'],
    ['Unaudited.', 'Both programs have had internal reviews only.'],
    ['A refund goes to the buyer, and the loan stays owed.', 'The buyer repays out of the refund, or defaults.'],
    ['A default freezes the line, not the score.', 'The escrow program does not know about loans.'],
    ['One arbiter key.', 'A dispute on devnet is decided by one key, which we hold.'],
  ];
  return (
    <Frame>
      <Kicker>Honest limits</Kicker>
      <Big size={84} max="20ch" color={white}>
        What it is not, <em>yet.</em>
      </Big>
      <div style={{ marginTop: 40, maxWidth: 1300 }}>
        {items.map(([h, b], i) => (
          <Rise key={h} delay={0.4 + i * 0.14}>
            <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', padding: '16px 0', borderTop: '1px solid #232C28', borderBottom: i === items.length - 1 ? '1px solid #232C28' : undefined, fontSize: 27, lineHeight: 1.35 }}>
              <span style={{ color: '#F5BE55' }}>○</span>
              <span>
                <span style={{ color: white }}>{h}</span> {b}
              </span>
            </div>
          </Rise>
        ))}
      </div>
      <Source>docs/PAYLATER.md, "Limits", and README, "What is real and what is not".</Source>
    </Frame>
  );
}

function TierSlide() {
  const loop = [6.5, 3.6, 1.8, 0.7];
  return (
    <Frame pad={96}>
      <Kicker>Fix 2 · escrow that knows who it is dealing with</Kicker>
      <Big size={84} max="19ch" color={white}>
        Escrow that knows <em>who it is dealing with.</em>
      </Big>
      <Body delay={0.3} size={30} max="60ch">Every wallet has an on-chain score, built from settled orders, ratings and behaviour.</Body>
      <div style={{ display: 'grid', gap: 12, marginTop: 28 }}>
        {[0, 1, 2, 3].map((t) => (
          <Rise key={t} delay={0.4 + t * 0.12}>
            <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr 270px', alignItems: 'center', gap: 28, padding: '20px 26px', border: `1px solid ${t === 3 ? mint : '#232C28'}`, borderRadius: 18, background: t === 3 ? '#13201A' : '#101513' }}>
              <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 14, fontSize: 22, color: t === 3 ? mint : white }}>
                <span style={{ display: 'inline-flex', gap: 5 }} aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} style={{ width: 11, height: 11, borderRadius: 11, background: i <= t ? TIER_DARK[t] : 'transparent', boxShadow: `inset 0 0 0 1.5px ${i <= t ? TIER_DARK[t] : '#3A4741'}` }} />
                  ))}
                </span>
                {tierName(t)}
              </span>
              <div style={{ position: 'relative', height: 22 }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: 10, height: 2, background: '#232C28' }} />
                <motion.div style={{ position: 'absolute', top: 2, width: 18, height: 18, borderRadius: 18, background: TIER_DARK[t] }} animate={{ left: ['0%', 'calc(100% - 18px)'] }} transition={{ duration: loop[t], ease: t === 3 ? EASE : 'linear', repeat: Infinity, repeatDelay: 0.6 }} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="display" style={{ fontSize: 44, color: white }}>{duration(P.holdSecs[t]!)}</span>
                <span className="mono" style={{ fontSize: 14, color: '#86918B' }}> hold</span>
              </div>
            </div>
          </Rise>
        ))}
      </div>
      <Source>Mainnet target holds. On devnet the same four tiers hold for 2 min, 45 s, 10 s and 0.</Source>
    </Frame>
  );
}

export const PITCH: Slide[] = [
  {
    id: 'title',
    seconds: 10,
    say: "GM everyone. I'm Edison Liu, a computer engineering student at the ZJU-UIUC Institute. I'm building Tessera, the credit layer for agentic commerce. This is version 2.0, for the Best Use of x402 on Solana track.",
    render: () => (
      <Frame center>
        <motion.div initial={{ scale: 0.6, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ duration: 1.2, ease: EASE }}>
          <Mark size={112} />
        </motion.div>
        <Big size={150} delay={0.4} color={white}>Tessera</Big>
        <Body delay={0.9} size={38} max="30ch">The credit layer for agentic commerce.</Body>
        <Rise delay={1.2} style={{ marginTop: 52 }}>
          <span className="mono" style={{ fontSize: 22, color: mint }}>2.0 · Encode Club Solana Hackathon 2026 · Best Use of x402 on Solana</span>
        </Rise>
        <Rise delay={1.4} style={{ marginTop: 18 }}>
          <span className="mono" style={{ fontSize: 22, color: '#86918B' }}>Edison Liu · Computer Engineering, ZJU-UIUC Institute</span>
        </Rise>
      </Frame>
    ),
  },
  {
    id: 'hook',
    seconds: 13,
    say: "AI agents now pay each other with x402, the payment protocol from Coinbase: about two hundred million payments by August, and on the fifth of October, the average was seven cents.",
    render: () => (
      <Frame>
        <Kicker>x402, the payment protocol from Coinbase</Kicker>
        <Big size={96} max="16ch" color={white}>AI agents now <em>pay each other.</em></Big>
        <div style={{ display: 'flex', gap: 96, marginTop: 84 }}>
          <Rise delay={0.6}>
            <div className="display" style={{ fontSize: 150, color: mint, lineHeight: 1 }}>≈<Counter value={200} />M</div>
            <div style={{ fontSize: 26, marginTop: 14 }}>x402 payments by Aug 2026</div>
          </Rise>
          <Rise delay={0.9}>
            <div className="display" style={{ fontSize: 150, color: white, lineHeight: 1 }}>7¢</div>
            <div style={{ fontSize: 26, marginTop: 14 }}>average payment on 5 Oct 2026</div>
          </Rise>
        </div>
        <Source>Solana Foundation, 5 Aug 2026: “roughly 200 million transactions … Most transactions are under 50 cents.” x402scan.com, 24 h to 5 Oct 2026: 118,341 payments, $8.01K.</Source>
      </Frame>
    ),
  },
  {
    id: 'anon',
    seconds: 17,
    say: "But who is on the other end? One person can launch unlimited agents, with no identity check, and you can't tell who owns them. And an x402 payment is final: no chargeback. So Tessera is the bridge. We can't see who owns an agent, but we can see how it behaves: what it settled, how much, and how it was rated.",
    render: () => (
      <Frame>
        <Kicker>Pain 1 · who is on the other end?</Kicker>
        <Big size={92} max="24ch" color={white}>One person, unlimited agents. <em>No ID.</em></Big>
        <Body delay={0.7} size={34} max="40ch">And an x402 payment is final once it settles. No chargeback.</Body>
        <div style={{ display: 'flex', gap: 22, marginTop: 56 }}>
          {['Behaviour', 'Amounts settled', 'Ratings'].map((t, k) => (
            <Rise key={t} delay={1.2 + k * 0.15}>
              <span className="mono" style={{ fontSize: 26, padding: '14px 26px', borderRadius: 999, border: `1.5px solid ${mint}`, color: mint }}>{t}</span>
            </Rise>
          ))}
        </div>
        <Body delay={1.8} size={30} max="50ch"><span style={{ color: mint }}>Fix 1: a credit layer that labels each anonymous agent by how it behaves.</span></Body>
        <Source>Creating a Solana wallet needs no identity and costs nothing beyond fees. An x402 exact payment is a signed token transfer with no chargeback.</Source>
      </Frame>
    ),
  },
  {
    id: 'attacks',
    seconds: 21,
    say: "Then we hit three attacks. Sybil: one person posing as many agents. Friendly fraud: getting the goods, then claiming they never came. And reputation farming: trading with your own wallets until you look trusted, then taking strangers' money. So every payment goes into escrow, and waits until the wallet has earned trust. Faking a record now costs real fees, and months you can't skip.",
    render: () => (
      <Frame>
        <Kicker>Pain 2 · three attacks we had to price</Kicker>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 26, marginTop: 10 }}>
          {[
            ['Sybil', 'One person, many wallets.'],
            ['Friendly fraud', 'Got the goods, claims they never came.'],
            ['Reputation farming', 'Trade with yourself until you look trusted, then cash in on strangers.'],
          ].map(([t, b], k) => (
            <Rise key={t} delay={0.3 + k * 0.2}>
              <div style={{ padding: '30px 30px 34px', borderRadius: 22, background: '#101513', border: `1px solid ${k === 2 ? 'rgba(245,190,85,.45)' : '#232C28'}`, height: '100%' }}>
                <div className="display" style={{ fontSize: 46, color: white, lineHeight: 1.05 }}>{t}</div>
                <div style={{ fontSize: 26, marginTop: 16, lineHeight: 1.4 }}>{b}</div>
              </div>
            </Rise>
          ))}
        </div>
        <Big size={70} delay={1.2} max="32ch" color={white}>Fix 2: escrow, <em>until the wallet has earned trust.</em></Big>
        <Body delay={1.6} size={30} max="52ch">Faking a record now costs real fees, and months you can't skip.</Body>
        <Source>Mainnet targets: a new wallet counts 10%, each counterparty is capped, Trusted needs 30 active days. A farming ring costs hundreds to a few thousand dollars and one to three months. Priced, not impossible (docs/SECURITY.md).</Source>
      </Frame>
    ),
  },
  {
    id: 'tiers',
    seconds: 13,
    say: "And the escrow knows who it is dealing with. At our mainnet target, a fresh wallet's money waits three days. Two Trusted agents settle instantly.",
    render: () => <TierSlide />,
  },
  {
    id: 'how',
    seconds: 8,
    say: "Nothing new to adopt. One field changes: payTo points to an escrow account instead of the merchant.",
    render: () => (
      <Frame>
        <Kicker>Nothing new to adopt</Kicker>
        <Big size={88} max="18ch" color={white}>One field changes: <em>where payTo points.</em></Big>
        <Rise delay={0.6} style={{ marginTop: 36 }}>
          <pre className="mono" style={{ fontSize: 27, lineHeight: 1.7, margin: 0, padding: '34px 40px', borderRadius: 22, background: '#101513', border: '1px solid #232C28', color: '#C9D2CC' }}>
{`HTTP/1.1 402 Payment Required
{
  "scheme":  "exact",
  "network": "solana:EtWTRABZ…",     // devnet
  "amount":  "200000",
  "payTo":   `}<span style={{ color: mint }}>"JE6F5J7i…WdUW"</span>{`     `}<span style={{ color: '#6B7771' }}>{'// an escrow account, not the merchant'}</span>{`
}`}
          </pre>
        </Rise>
        <div style={{ display: 'flex', gap: 44, marginTop: 28, fontSize: 25 }}>
          {['A2A to ask', 'x402 to pay', 'a facilitator settles', 'a Solana program holds'].map((t, k) => (
            <Rise key={t} delay={0.9 + k * 0.12}>
              <span style={{ color: white }}>{t}</span>
            </Rise>
          ))}
        </div>
        <Source>A real order from this project on devnet, on the version 1 escrow. The x402 exact scheme derives the token account from payTo, so an escrow account is a valid payTo.</Source>
      </Frame>
    ),
  },
  {
    id: 'rewards',
    seconds: 8,
    say: "Only a real buyer or seller can review, with the receipt on-chain. Reviewers get paid, and paid more when their warning proves right.",
    render: () => <RewardsSlide />,
  },
  {
    id: 'pay-later',
    seconds: 24,
    say: "Last pain: today you top up an agent's wallet before every job and count the tokens it needs. Tessera 2.0 fixes that. An agent with a Tessera record can buy now and pay later. A pool pays, but not to the merchant: it pays into the same escrow order the agent would have paid itself. So the merchant still delivers and waits out the hold, and the buyer keeps its refund and its dispute. Credit never skips buyer protection. The limit comes from the score: a new wallet gets nothing, paying on time raises it, and a default freezes it in public.",
    render: () => <PayLaterSlide />,
  },
  {
    id: 'x402',
    seconds: 18,
    say: "How does an agent ask for credit? Through x402 itself. The merchant's 402 keeps the standard exact option first, and adds a second one, tessera-paylater: the same order, the same price, and the buyer's live limit. The buyer signs one buy_now, which carries the price it agreed to. The merchant checks it, signs it too, pays the network fee, sends it, and delivers: it settles this option itself. A standard x402 client takes the first option and never sees a difference.",
    render: () => <X402Slide />,
  },
  {
    id: 'devnet',
    seconds: 9,
    say: 'All of it is live on Solana devnet: the escrow program, deployed on 28 October at a new address with the fixes from our internal reviews, and the new pay-later program next to it, with a pool funded with devnet USDC. Anyone can read these accounts.',
    render: () => <DevnetSlide />,
  },
  {
    id: 'limits',
    seconds: 14,
    say: 'And what it is not, yet. It is devnet, with test money and our own agents. The pool has one authority key. Nothing is audited. And if the escrow refunds an order the pool paid for, the refund goes to the buyer and the loan stays owed: the buyer repays out of the refund, or defaults. And a dispute on devnet is decided by one arbiter key, which we hold.',
    render: () => <LimitsSlide />,
  },
  {
    id: 'close',
    seconds: 22,
    say: "Why me? Every x402 payment already leaves a public record on the chain. My idea is to use that data to lower the risk of being scammed in agentic commerce. Without it, a payment is just a payment, and the data goes to waste. Micropayments were the easy part. Every payment matters. This is Tessera.",
    render: () => (
      <Frame center>
        <Big size={70} max="20ch" color="#86918B">Micropayments were the easy part.</Big>
        <Big size={150} delay={0.8} max="12ch" color={white}>Every payment <em style={{ color: mint }}>matters.</em></Big>
        <Rise delay={1.6} style={{ marginTop: 56, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Mark size={40} />
          <span className="mono" style={{ fontSize: 22 }}>agentic-commerce-two-theta.vercel.app</span>
        </Rise>
        <Rise delay={1.9} style={{ marginTop: 22 }}>
          <span className="mono" style={{ fontSize: 18, color: '#86918B' }}>Live on Solana devnet · github.com/edison9733/x402_bnpl</span>
        </Rise>
      </Frame>
    ),
  },
];

export const PitchDeck = () => <Deck slides={PITCH} title="Tessera pitch" />;
