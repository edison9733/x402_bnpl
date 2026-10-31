/**
 * The home page: Tessera Pay Later, ported from the design handoff in
 * docs/handoff/landing/index.html. The copy, colours, fonts and animations are
 * the design's (landing.css holds its stylesheet). The only JavaScript on the
 * page is the orders toggle in "Settle once" and the demo video's play button;
 * everything that moves is a CSS keyframe.
 *
 * The sample merchants and orders in the terminals are labelled as such on the
 * page: devnet has six merchants and no categories yet, and their agent cards
 * are only served when the agents server runs.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Logo, Mark } from '../components/ui';
import { CONTACT } from '../components/Waitlist';
import { Link, usePath } from '../lib/router';
import './landing.css';

const REPO = 'https://github.com/edison9733/x402_bnpl';
/** The docs start at the README on GitHub. */
const DOCS = `${REPO}#readme`;
/** The Tessera 2.0 demo of 31 October 2026, rendered on devnet (apps/web/public/videos). */
const VIDEO = { src: '/videos/tessera-2.0-demo.mp4', poster: '/videos/tessera-2.0-demo-poster.jpg', captions: '/videos/tessera-2.0-demo.vtt', length: '3:17' };

const DISPLAY = "'Bricolage Grotesque', 'Geist', ui-sans-serif, system-ui, sans-serif";
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const ArrowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
    <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
  </svg>
);
const DownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 5v14" />
    <path d="M19 12l-7 7-7-7" />
  </svg>
);
const Cross = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const Tick = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12l5 5L20 7" />
  </svg>
);
const Arrow = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </svg>
);
/** The check mark on a settled line of a terminal. */
const Check = () => (
  <svg className="t-chk" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12l5 5L20 7" />
  </svg>
);

function Header() {
  return (
    <header style={{ position: 'relative', zIndex: 2, borderBottom: '1px solid #1A211E' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '12px clamp(16px, 4vw, 32px)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '4px 28px' }}>
        <a href="#top" aria-label="Tessera, back to top" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, minHeight: 44, color: '#E8EDE9', textDecoration: 'none' }}>
          <Mark size={28} />
          <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Tessera</span>
        </a>
        <nav className="t-nav" aria-label="Main">
          <a href="#trust">Why trust</a>
          <a href="#merchants">Merchants</a>
          <a href="#pay-later">Pay Later</a>
          <a href="#settle">Settle once</a>
          <a href="#/market">Market</a>
          <a href={DOCS} target="_blank" rel="noreferrer">
            Docs
          </a>
        </nav>
        <a className="t-btn t-btn-ghost" href="#/market" style={{ minHeight: 44, padding: '0 18px', fontSize: 14 }}>
          Buy on devnet
        </a>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ hero

/** When each of the 48 tiles lands on the tab, in seconds; the design's order. */
const MOSAIC_DELAYS = [
  2.925, 2.475, 1.05, 1.125, 0.75, 3.45, 0.825, 1.2, 2.325, 2.7, 3, 3.15, 2.1, 0.6, 0, 1.65, 1.425, 0.9, 3.375, 1.8, 1.575, 3.525, 2.175, 2.85, 1.35, 0.075, 2.625, 1.275, 2.25, 0.525, 3.3, 1.95, 2.025, 0.375,
  0.15, 0.975, 2.4, 3.225, 2.775, 1.725, 0.45, 2.55, 0.3, 0.225, 3.075, 1.875, 0.675, 1.5,
];

function Hero() {
  return (
    <section aria-labelledby="t-hero-title" style={{ position: 'relative' }}>
      <div className="t-gridbg" aria-hidden />
      <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: 'clamp(48px, 7vw, 100px) clamp(16px, 4vw, 32px) clamp(64px, 7.5vw, 108px)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'clamp(44px, 6vw, 72px)' }}>
        <div style={{ flex: '1 1 540px', minWidth: 0 }}>
          <p className="t-kicker">Tessera Pay Later · x402 on Solana</p>
          <h1 id="t-hero-title" style={{ margin: '26px 0 0', fontFamily: DISPLAY, fontSize: 'clamp(34px, 9.5vw, 62px)', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.04em', color: '#E8EDE9' }}>
            <span className="t-nw">Buy now, pay later</span>{' '}
            <span className="t-nw" style={{ color: '#5EE6AB' }}>
              for AI agents.
            </span>
          </h1>
          <p style={{ margin: '26px 0 0', maxWidth: 540, fontSize: 'clamp(17px, 1.55vw, 20px)', lineHeight: 1.55, color: '#A3ADA7' }}>
            Tessera is the credit layer for agentic commerce. Your agents buy over x402 now, and the main agent pays for the whole tab at once.
          </p>
          <div style={{ marginTop: 36, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <a className="t-btn t-btn-primary" href="#demo">
              <PlayIcon />
              Watch the demo
            </a>
            <a className="t-btn t-btn-ghost" href="#/market">
              Buy on devnet
              <ArrowIcon />
            </a>
          </div>
        </div>
        <figure className="t-mcard" style={{ flex: '1 1 380px', maxWidth: 500, minWidth: 0, margin: 0, padding: 'clamp(18px, 2vw, 24px)', border: '1px solid #232C28', borderRadius: 24, background: '#101513' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
            <span className="t-eyeb">Example tab</span>
            <span className="t-stack" style={{ justifyItems: 'end' }}>
              <span className="t-pill t-pill-amber t-lab-tab">
                <span className="t-dotc t-blink" />
                <span className="t-count" />
                orders on the tab
              </span>
              <span className="t-pill t-pill-mint t-lab-ok">
                <span className="t-dotc" />
                Settled in 1 payment
              </span>
            </span>
          </div>
          <div className="t-mosaic" aria-hidden>
            {MOSAIC_DELAYS.map((delay, i) => (
              <span key={i} className="t-tile">
                <span className="t-on" style={{ animationDelay: `${delay}s` }} />
                <span className="t-ok" />
              </span>
            ))}
          </div>
          <figcaption style={{ marginTop: 18, fontSize: 14, lineHeight: 1.5, color: '#A3ADA7' }}>Each tile is one x402 order. The main agent settles them together, in one payment.</figcaption>
        </figure>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ demo

function Demo() {
  const video = useRef<HTMLVideoElement>(null);
  // Until the round button is pressed the poster shows and the native controls stay out of the way.
  const [started, setStarted] = useState(false);
  const play = () => {
    setStarted(true);
    void video.current?.play();
  };
  return (
    <section id="demo" aria-labelledby="t-demo-title" style={{ padding: 'clamp(72px, 9vw, 120px) 0', borderTop: '1px solid #1A211E', background: '#0E1210' }}>
      <div className="t-wrap">
        <div style={{ marginBottom: 36 }}>
          <p className="t-kicker">Demo</p>
          <h2 id="t-demo-title" className="t-display" style={{ margin: '18px 0 0', fontSize: 'clamp(32px, 4.2vw, 56px)', lineHeight: 1.04, letterSpacing: '-0.035em' }}>
            See Tessera in action.
          </h2>
        </div>
        <figure style={{ margin: 0 }}>
          <div style={{ position: 'relative', aspectRatio: '16 / 9', border: '1px solid #232C28', borderRadius: 'clamp(16px, 2vw, 28px)', overflow: 'hidden', background: '#0A0D0C' }}>
            <div className="t-gridbg t-gridbg-c" aria-hidden />
            <video ref={video} className="t-video" poster={VIDEO.poster} preload="metadata" playsInline controls={started} onPlay={() => setStarted(true)}>
              <source src={VIDEO.src} type="video/mp4" />
              <track kind="captions" src={VIDEO.captions} srcLang="en" label="English" />
            </video>
            {!started && (
              <>
                <div style={{ position: 'absolute', left: 'clamp(14px, 2vw, 24px)', top: 'clamp(14px, 2vw, 22px)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span className="t-pill t-pill-mint">x402</span>
                  <span className="t-pill t-pill-amber">Solana</span>
                </div>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24, textAlign: 'center' }}>
                  <button type="button" className="t-play" aria-label="Play the Tessera demo video" onClick={play}>
                    <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
                      <path d="M8 5v14l11-7z" fill="currentColor" />
                    </svg>
                  </button>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A3ADA7' }}>Tessera 2.0 demo · {VIDEO.length} · on devnet</span>
                </div>
              </>
            )}
          </div>
        </figure>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 01 · why trust

const X402_STEPS: { who: string; code: string; text: string; pay?: boolean; delay: number }[] = [
  { who: '1 · Agent to API', code: 'GET /data', text: 'The agent asks for a paid resource.', delay: 0 },
  { who: '2 · API to agent', code: '402 Payment Required', text: 'The API replies with the price.', delay: 2 },
  { who: '3 · Agent to API', code: 'Signed payment', text: 'The agent pays from its wallet and asks again. No chargeback once it settles.', pay: true, delay: 4 },
  { who: '4 · API to agent', code: '200 OK', text: 'The data arrives.', delay: 6 },
];

/** The example wallet climbing through the tiers, and the hold it waits at each. */
const TIERS: { name: string; color: string; hold: string; final?: boolean }[] = [
  { name: 'New', color: '#A3ADA7', hold: 'Hold 3 days' },
  { name: 'Building', color: '#C9D8D0', hold: 'Hold 24 h' },
  { name: 'Established', color: '#8FE3BE', hold: 'Hold 60 min' },
  { name: 'Trusted', color: '#5EE6AB', hold: 'Instant', final: true },
];

/** Hold bars to scale in hours: 72 h, 24 h, 1 h, and a dot for instant. */
const HOLDS: { name: string; gate: string; bar?: string; minWidth?: number; value: string }[] = [
  { name: 'New', gate: 'Each fresh wallet starts here', bar: '100%', value: '3 days' },
  { name: 'Building', gate: '250+ points, 3 active days', bar: '33.3%', value: '24 h' },
  { name: 'Established', gate: '500+ points, 14 active days', bar: '1.4%', minWidth: 6, value: '60 min' },
  { name: 'Trusted', gate: '750+ points, 30 active days', value: 'instant' },
];

const FACTS: [string, string][] = [
  ['When an order settles instantly', 'Both sides are Trusted, or the buyer has two or more undisputed orders with that merchant. The merchant must also be within its instant limit.'],
  ['Instant settlement has a cap', 'An exit scam on instant settlement is capped at the fees the merchant already paid, plus a small base.'],
  ['Buyers need no SOL', 'The x402 facilitator pays the network fee.'],
  ['Reviews come from the order', "Only the buyer and the merchant on an order can review each other. A refunded order's review weighs nothing."],
];

function Trust() {
  return (
    <section id="trust" aria-labelledby="t-trust-title" className="t-sec">
      <div className="t-wrap">
        <div style={{ maxWidth: 860 }}>
          <p className="t-kicker">01 · Why trust</p>
          <h2 id="t-trust-title" className="t-display t-h2">
            x402 has no chargeback. So agents mostly move small amounts.
          </h2>
          <p className="t-lead" style={{ maxWidth: 700 }}>
            AI agents now pay each other over x402, and most of these payments are micropayments. Once a payment settles, it cannot be pulled back. To x402, a fresh wallet and a wallet with a long, clean record look the same.
          </p>
        </div>

        <div className="t-card" style={{ marginTop: 56, padding: 'clamp(20px, 3vw, 36px)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px 24px', marginBottom: 28 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.3, color: '#E8EDE9' }}>How an x402 payment works today</h3>
            <span className="t-eyeb">Repeats for each call</span>
          </div>
          <div className="t-lane" aria-hidden style={{ marginBottom: 24 }}>
            <span className="t-end">Your agent</span>
            <span className="t-track">
              <span className="t-dot" />
            </span>
            <span className="t-end">x402 API</span>
          </div>
          <ol className="t-steps" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))' }}>
            {X402_STEPS.map((s) => (
              <li key={s.who} className={s.pay ? 't-step t-step-pay' : 't-step'} style={{ animationDelay: `${s.delay}s` }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', color: '#86918B' }}>{s.who}</span>
                <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 500, color: s.pay ? '#F5BE55' : '#E8EDE9' }}>{s.code}</span>
                <span style={{ fontSize: 15, lineHeight: 1.5, color: '#A3ADA7' }}>{s.text}</span>
              </li>
            ))}
          </ol>
          <p style={{ margin: '22px 0 0', fontSize: 15, lineHeight: 1.55, color: '#A3ADA7' }}>There is no hold and no refund window.</p>
        </div>

        <div style={{ marginTop: 'clamp(72px, 9vw, 112px)', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px 64px' }}>
          <div style={{ flex: '1 1 520px', maxWidth: 660, minWidth: 0 }}>
            <h3 className="t-display" style={{ margin: 0, fontSize: 'clamp(30px, 3.4vw, 46px)', lineHeight: 1.04, letterSpacing: '-0.03em' }}>
              Tessera adds a trust layer.
            </h3>
            <p style={{ margin: '20px 0 0', fontSize: 'clamp(17px, 1.5vw, 19px)', lineHeight: 1.6, color: '#A3ADA7' }}>
              Tessera is on-chain credit scoring infrastructure. It scores each wallet and places it in a tier. Each payment waits in a hold, and the buyer's and the merchant's tiers set how long.
            </p>
          </div>
          <p style={{ flex: '1 1 300px', maxWidth: 420, margin: 0, paddingTop: 18, borderTop: '1px solid #303B36', fontFamily: DISPLAY, fontSize: 'clamp(21px, 2vw, 26px)', fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.015em', color: '#E8EDE9' }}>
            A fresh wallet waits. Two Trusted wallets can settle instantly.
          </p>
        </div>

        <div className="t-card" style={{ marginTop: 40, padding: 'clamp(20px, 3vw, 40px)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px 40px' }}>
            <div style={{ minWidth: 0 }}>
              <p className="t-eyeb">Example wallet</p>
              <div className="t-stack" style={{ marginTop: 12 }}>
                {TIERS.map((t, i) => (
                  <div key={t.name} className={`t-tier t-k${i + 1}${t.final ? ' t-tier-final' : ''}`} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 16px' }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: 'clamp(34px, 4vw, 52px)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.03em', color: t.color }}>{t.name}</span>
                    <span style={{ fontFamily: MONO, fontSize: 15, color: t.final ? '#5EE6AB' : '#A3ADA7' }}>{t.hold}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <p className="t-eyeb">Score</p>
              <p style={{ margin: '12px 0 0', fontFamily: DISPLAY, fontSize: 'clamp(34px, 4vw, 52px)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em', color: '#E8EDE9' }}>
                <span className="t-score" />
                <span style={{ fontSize: '0.42em', fontWeight: 500, letterSpacing: 0, color: '#86918B' }}> / 1000</span>
              </p>
            </div>
          </div>
          <div className="t-meter" aria-hidden style={{ margin: '40px 9px 12px 0' }}>
            <span className="t-tick" style={{ left: '25%' }} />
            <span className="t-tick" style={{ left: '50%' }} />
            <span className="t-tick" style={{ left: '75%' }} />
            <span className="t-fill" />
          </div>
          <div aria-hidden style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginRight: 9, fontFamily: MONO, fontSize: 12, color: '#86918B' }}>
            <span>0</span>
            <span>250</span>
            <span>500</span>
            <span>750</span>
          </div>

          <div style={{ marginTop: 40, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px 24px' }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#E8EDE9' }}>How long a payment waits, by tier</p>
            <p style={{ margin: 0, fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#86918B' }}>Mainnet targets · hours to scale</p>
          </div>
          <div style={{ marginTop: 14 }}>
            {HOLDS.map((h, i) => (
              <div key={h.name} className={`t-hold t-k${i + 1}`}>
                <span className="t-hn">
                  {h.name}
                  <span className="t-hg">{h.gate}</span>
                </span>
                <span className="t-ht" aria-hidden>
                  {h.bar ? <span className="t-hb" style={{ width: h.bar, ...(h.minWidth ? { minWidth: h.minWidth } : {}) }} /> : <span className="t-hz" />}
                </span>
                <span className="t-hv">{h.value}</span>
              </div>
            ))}
          </div>
          <p style={{ margin: '22px 0 0', fontSize: 14, lineHeight: 1.6, color: '#86918B' }}>
            Bars are to scale in hours. On devnet the holds are 2 min, 45 s, 10 s and instant. The hold on an order is the longer of the buyer's and the merchant's holds.
          </p>
        </div>

        <div className="t-feat" style={{ marginTop: 24 }}>
          <div style={{ minWidth: 0 }}>
            <span className="t-lab" style={{ color: '#5EE6AB' }}>
              Why it is different
            </span>
            <h3 className="t-display t-h3" style={{ margin: '14px 0 0' }}>
              A score anyone can recompute.
            </h3>
            <p style={{ margin: '16px 0 0', fontSize: 16, lineHeight: 1.6, color: '#A3ADA7' }}>
              Each score is computed only from orders that settled on-chain. Anyone can recompute it from on-chain data. No one has to trust Tessera's word for a number.
            </p>
          </div>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="t-eq" aria-label="Evidence equals History plus Tenure plus Diversity">
              <span className="t-eqb t-e1">History</span>
              <span className="t-eqo">+</span>
              <span className="t-eqb t-e2">Tenure</span>
              <span className="t-eqo">+</span>
              <span className="t-eqb t-e3">Diversity</span>
              <span className="t-eqo">=</span>
              <span className="t-eqb t-e4">Evidence</span>
            </div>
            <div className="t-eq" aria-label="Score equals 1000 times Evidence times Rating times Behaviour">
              <span className="t-eqo">1000 ×</span>
              <span className="t-eqb t-e4">Evidence</span>
              <span className="t-eqo">×</span>
              <span className="t-eqb t-e5">Rating</span>
              <span className="t-eqo">×</span>
              <span className="t-eqb t-e6">Behaviour</span>
              <span className="t-eqo">=</span>
              <span className="t-eqb t-e7">
                <span className="t-eqn" />
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontFamily: MONO, fontSize: 12, lineHeight: 1.6, color: '#86918B' }}>
              Score = 1000 × Evidence × Rating × Behaviour. Evidence = History + Tenure + Diversity. The example wallet above lands on 910.
            </p>
          </div>
        </div>

        <div className="t-facts" style={{ marginTop: 12 }}>
          {FACTS.map(([title, body]) => (
            <div key={title} className="t-fact">
              <p className="t-fact-t">{title}</p>
              <p className="t-fact-p">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 02 · search for agents

type Tier = 'Trusted' | 'Established' | 'Building' | 'New';
/** How a tier shows in a terminal: its text class, its bar colour (mint is the default) and its mainnet target hold. */
const TIER_STYLE: Record<Tier, { cls: string; bar?: string; hold: string }> = {
  Trusted: { cls: 't-mint', hold: 'instant' },
  Established: { cls: 't-est', bar: '#8FE3BE', hold: '60 min' },
  Building: { cls: 't-bld', bar: '#A9C2B6', hold: '24 h' },
  New: { cls: 't-dim', bar: '#86918B', hold: '3 days' },
};

type Merchant = { name: string; sells: string; score: number; tier: Tier };
/** Example merchants, grouped by category, as the design shows them. Labelled "sample data" on the page. */
const MERCHANT_GROUPS: { category: string; merchants: Merchant[] }[] = [
  {
    category: 'data',
    merchants: [
      { name: 'search.api', sells: 'web search results', score: 912, tier: 'Trusted' },
      { name: 'prices.api', sells: 'token prices', score: 868, tier: 'Trusted' },
      { name: 'news.api', sells: 'news headlines', score: 571, tier: 'Established' },
      { name: 'weather.api', sells: 'forecasts', score: 276, tier: 'Building' },
      { name: 'scrape.api', sells: 'page extraction', score: 140, tier: 'New' },
    ],
  },
  {
    category: 'inference',
    merchants: [
      { name: 'llm.api', sells: 'chat completions', score: 790, tier: 'Trusted' },
      { name: 'embed.api', sells: 'text embeddings', score: 603, tier: 'Established' },
    ],
  },
  {
    category: 'media',
    merchants: [
      { name: 'image.api', sells: 'image rendering', score: 644, tier: 'Established' },
      { name: 'voice.api', sells: 'text to speech', score: 62, tier: 'New' },
    ],
  },
  { category: 'language', merchants: [{ name: 'translate.api', sells: 'text translation', score: 512, tier: 'Established' }] },
  {
    category: 'geo',
    merchants: [
      { name: 'maps.api', sells: 'routing', score: 338, tier: 'Building' },
      { name: 'geocode.api', sells: 'address lookup', score: 455, tier: 'Building' },
    ],
  },
];
const MERCHANT_COUNT = MERCHANT_GROUPS.reduce((n, g) => n + g.merchants.length, 0);

/** A column of a terminal line, fixed in characters so nothing shifts when a value is short. */
function Col({ w, cls, children }: { w?: number; cls?: string; children?: ReactNode }) {
  return (
    <span className={cls ? `t-c ${cls}` : 't-c'} style={w ? { width: `${w}ch` } : undefined}>
      {children}
    </span>
  );
}

function MerchantLine({ m }: { m: Merchant }) {
  const t = TIER_STYLE[m.tier];
  return (
    <span className="t-ln">
      <Col w={16} cls="t-wht">{m.name}</Col>
      <Col w={21} cls="t-sells">{m.sells}</Col>
      <Col w={6} cls="t-wht">{m.score}</Col>
      <span className="t-sb">
        <span style={{ width: `${Math.round(m.score / 10)}%`, ...(t.bar ? { background: t.bar } : {}) }} />
      </span>
      <Col w={13} cls={t.cls}>{m.tier}</Col>
      <Col>{t.hold}</Col>
    </span>
  );
}

function TermBar({ note }: { note?: string }) {
  return (
    <div className="t-term-bar">
      <span className="t-term-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <span>tessera · agent shell</span>
      {note && <span style={{ marginLeft: 'auto' }}>{note}</span>}
    </div>
  );
}

const Prompt = ({ cursor = 't-cur' }: { cursor?: string }) => (
  <span className="t-ln">
    <span className="t-ps">$ </span>
    <span className={cursor} />
  </span>
);

function Merchants() {
  // The list scrolls through two copies of itself, so it never shows an end.
  const groups = [...MERCHANT_GROUPS, ...MERCHANT_GROUPS];
  return (
    <section id="merchants" aria-labelledby="t-mer-title" className="t-sec t-alt">
      <div className="t-wrap">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px 48px' }}>
          <div style={{ flex: '1 1 560px', maxWidth: 760, minWidth: 0 }}>
            <p className="t-kicker">02 · Search for agents</p>
            <h2 id="t-mer-title" className="t-display t-h2">
              Every merchant comes with a score.
            </h2>
            <p className="t-lead" style={{ maxWidth: 680 }}>
              Your agent can search for a merchant and see its score, tier and hold before it buys. This is what it looks like in your terminal.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 420 }}>
            <span className="t-pill t-pill-mint">{MERCHANT_COUNT} merchants</span>
            {MERCHANT_GROUPS.map((g) => (
              <span key={g.category} className="t-pill t-pill-grey">
                {g.category} · {g.merchants.length}
              </span>
            ))}
          </div>
        </div>

        <figure className="t-term" style={{ margin: '44px 0 0' }}>
          <TermBar note="sample data" />
          <div className="t-term-body" aria-hidden>
            <span className="t-ln">
              <span className="t-ps">$ </span>
              <span className="t-typed t-typeM">tessera merchants --sort score</span>
              <span className="t-cur t-curM" />
            </span>
            <div className="t-out t-oM">
              <span className="t-ln t-dim">
                {MERCHANT_COUNT} merchants · {MERCHANT_GROUPS.length} categories · scores from settled orders only
              </span>
              <span className="t-ln t-dim">
                <Col w={16}>MERCHANT</Col>
                <Col w={21} cls="t-sells">SELLS</Col>
                <Col w={6}>SCORE</Col>
                <Col w={12} />
                <Col w={13}>TIER</Col>
                <Col>HOLD</Col>
              </span>
            </div>
            <div className="t-oL">
              <div className="t-mqv">
                {groups.map((g, k) => (
                  <Fragment key={`${g.category}-${k}`}>
                    <span className="t-ln t-mint">
                      # {g.category} · {g.merchants.length}
                    </span>
                    {g.merchants.map((m) => (
                      <MerchantLine key={m.name} m={m} />
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
            <div className="t-oN">
              <Prompt />
            </div>
          </div>
          <figcaption style={{ padding: '14px 18px 16px', borderTop: '1px solid #1A211E', fontFamily: "'Geist', ui-sans-serif, system-ui, sans-serif", fontSize: 14, lineHeight: 1.5, color: '#86918B' }}>
            Example merchants and scores. Hold times are mainnet targets. Scores are computed only from orders that settled on-chain.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 03 · pay later

const SHOPPER_STEPS: [string, string][] = [
  ['A credit check', 'The lender checks that you will pay.'],
  ['Take it today', 'You get the item straight away.'],
  ['Pay later', 'You pay for it afterwards.'],
];
const AGENT_STEPS: [string, string][] = [
  ['An on-chain score', 'Tessera scores each wallet from settled orders.'],
  ['Buy over x402 now', 'The order lands on the tab. The agent gets what it ordered straight away.'],
  ['The main agent pays once', 'It settles the whole tab in one payment.'],
];

const PROBLEMS: { icon: ReactNode; call: string; later: string }[] = [
  {
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    call: 'Waits for every payment',
    later: 'Answers straight away',
  },
  {
    icon: (
      <>
        <path d="M12 3l9 5-9 5-9-5 9-5z" />
        <path d="M3 13l9 5 9-5" />
        <path d="M3 17l9 5 9-5" />
      </>
    ),
    call: '1,000 calls, 1,000 payments',
    later: '1,000 calls, 1 payment',
  },
  {
    icon: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
        <path d="M15 15h3" />
      </>
    ),
    call: 'One funded wallet per agent',
    later: 'One wallet pays for all',
  },
  {
    icon: (
      <>
        <path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6l8-3z" />
        <path d="M9.5 9.5l5 5" />
        <path d="M14.5 9.5l-5 5" />
      </>
    ),
    call: 'No chargeback, no record',
    later: 'A score on both sides',
  },
];

/**
 * Example orders on the tab, laid out as `tessera tab` prints them: the escrow
 * order each loan paid for, shortened, since the chain names no endpoint.
 * Labelled "sample data" on the page.
 */
const TAB_ORDERS: { merchant: string; order: string; amount: string }[] = [
  { merchant: 'search.api', order: '3kQe…b7Hn', amount: '$0.010' },
  { merchant: 'prices.api', order: '9wTa…pL2c', amount: '$0.002' },
  { merchant: 'news.api', order: 'Hf2m…qR8d', amount: '$0.005' },
  { merchant: 'llm.api', order: 'Vb7n…x3Lp', amount: '$0.040' },
  { merchant: 'image.api', order: '2cYr…mN9k', amount: '$0.080' },
  { merchant: 'translate.api', order: 'Qp4s…zT6w', amount: '$0.003' },
];
/** A tab is the wallet that owes it, shown short, as the CLI does. */
const TAB_ID = '7xKp…9fQe';
const TAB_TOTAL = '$0.140';

function Steps({ label, title, color, steps, lastMint = false }: { label: string; title: string; color: string; steps: [string, string][]; lastMint?: boolean }) {
  return (
    <div className="t-srow">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
        <span className="t-lab" style={{ color }}>
          {label}
        </span>
        <span style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: '#E8EDE9' }}>{title}</span>
      </div>
      <div className="t-sgrid">
        {steps.map(([t, body], i) => (
          <div key={t} className={`t-node t-s${i + 1}`}>
            <span className="t-mono" style={{ fontSize: 12, color: '#86918B' }}>
              {i + 1}
            </span>
            <span style={{ fontSize: 17, fontWeight: 600, color: lastMint && i === steps.length - 1 ? '#5EE6AB' : '#E8EDE9' }}>{t}</span>
            <span style={{ fontSize: 14, lineHeight: 1.5, color: '#A3ADA7' }}>{body}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayLater() {
  return (
    <section id="pay-later" aria-labelledby="t-pl-title" className="t-sec">
      <div className="t-wrap">
        <div style={{ maxWidth: 860 }}>
          <p className="t-kicker">03 · Tessera Pay Later</p>
          <h2 id="t-pl-title" className="t-display t-h2">
            People buy now and pay later. Now agents can too.
          </h2>
          <p className="t-lead" style={{ maxWidth: 700 }}>
            With buy now, pay later, you take the item today and pay for it afterwards. It works because someone checked that you will pay. Tessera Pay Later brings the same deal to AI agents on x402.
          </p>
        </div>

        <div className="t-card" style={{ marginTop: 56, padding: 'clamp(20px, 3vw, 36px)', display: 'grid', gap: 16 }}>
          <Steps label="People" title="Shoppers" color="#86918B" steps={SHOPPER_STEPS} />
          <Steps label="Agents" title="On Tessera" color="#5EE6AB" steps={AGENT_STEPS} lastMint />
          <p style={{ margin: '6px 0 0', fontSize: 15, lineHeight: 1.55, color: '#A3ADA7' }}>Paying later only works when you can tell who will pay. On Tessera, the on-chain score is that check.</p>
        </div>

        <div className="t-card" style={{ marginTop: 24, padding: 'clamp(20px, 3vw, 36px)' }}>
          <h3 className="t-display t-h3">Pay per call has four problems.</h3>
          <p style={{ margin: '10px 0 28px', fontSize: 16, lineHeight: 1.6, color: '#A3ADA7' }}>Tessera Pay Later fixes each one.</p>
          <div className="t-cmp-head" aria-hidden>
            <span />
            <span>
              <span className="t-pill t-pill-amber">
                <span className="t-dotc" />
                Pay per call
              </span>
            </span>
            <span />
            <span>
              <span className="t-pill t-pill-mint">
                <span className="t-dotc" />
                Tessera Pay Later
              </span>
            </span>
          </div>
          {PROBLEMS.map((p, i) => (
            <div key={p.call} className={`t-cmp-row t-p${i + 1}`}>
              <span className="t-pri" aria-hidden>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {p.icon}
                </svg>
              </span>
              <span className="t-cmp-a">
                <span className="t-cmp-x" aria-hidden>
                  <Cross />
                </span>
                <span className="t-sr">Pay per call: </span>
                {p.call}
              </span>
              <span className="t-cmp-arrow" aria-hidden>
                <Arrow />
              </span>
              <span className="t-cmp-b">
                <span className="t-cmp-ok" aria-hidden>
                  <Tick />
                </span>
                <span className="t-sr">Tessera Pay Later: </span>
                {p.later}
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'clamp(56px, 7vw, 88px)', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px 48px' }}>
          <div style={{ flex: '1 1 480px', maxWidth: 700, minWidth: 0 }}>
            <h3 className="t-display t-h3">A tab, in your terminal.</h3>
            <p style={{ margin: '12px 0 0', fontSize: 16, lineHeight: 1.6, color: '#A3ADA7' }}>Six orders land on the tab. One settle call pays them all.</p>
          </div>
          <span className="t-pill t-pill-amber">
            <span className="t-dotc t-blink" />
            Pay later
          </span>
        </div>
        <figure className="t-term" style={{ margin: '24px 0 0' }}>
          <TermBar note="sample data" />
          <div className="t-term-body" aria-hidden>
            <span className="t-ln">
              <span className="t-ps">$ </span>
              <span className="t-typed t-typeA">tessera tab</span>
              <span className="t-cur t-curA" />
            </span>
            <div className="t-out t-oA">
              <span className="t-ln t-dim">tab {TAB_ID} · open · pay later · devnet USDC</span>
              <span className="t-ln t-dim">
                <Col w={7}>#</Col>
                <Col w={16}>MERCHANT</Col>
                <Col w={12}>ORDER</Col>
                <Col w={9}>AMOUNT</Col>
                <Col>STATUS</Col>
              </span>
              {TAB_ORDERS.map((o, i) => (
                <span key={o.merchant} className="t-ln">
                  <Col w={7} cls="t-dim">#{i + 1}</Col>
                  <Col w={16} cls="t-wht">{o.merchant}</Col>
                  <Col w={12} cls="t-dim">{o.order}</Col>
                  <Col w={9} cls="t-wht">{o.amount}</Col>
                  <Col cls="t-amb">on tab</Col>
                </span>
              ))}
            </div>
            <div className="t-out t-oB">
              <span className="t-ln">
                <span className="t-hr" />
              </span>
              <span className="t-ln">
                <Col w={7} cls="t-dim">TOTAL</Col>
                <Col w={28}>{TAB_ORDERS.length} orders</Col>
                <Col w={9} cls="t-wht">{TAB_TOTAL}</Col>
                <Col cls="t-amb">unpaid</Col>
              </span>
            </div>
            <div className="t-out t-oC">
              <span className="t-ln">
                <span className="t-ps">$ </span>
                <span className="t-typed t-typeB">tessera settle</span>
                <span className="t-cur t-curB" />
              </span>
            </div>
            <div className="t-out t-oD">
              <span className="t-ln t-dim">
                tab {TAB_ID} · {TAB_ORDERS.length} orders · unpaid
              </span>
              <span className="t-ln">settling {TAB_ORDERS.length} orders in 1 payment</span>
              <span className="t-ln">
                <span className="t-pb">
                  <span style={{ width: '100%', animation: 'none' }} />
                </span>
                <span className="t-wht" style={{ marginLeft: '1ch' }}>
                  100%
                </span>
              </span>
              <span className="t-ln t-mint">
                <Check />
                settled · 1 signature · main agent
              </span>
              <span className="t-ln t-dim">{TAB_ORDERS.length} orders closed · 1 payment on-chain</span>
              <Prompt />
            </div>
          </div>
          <figcaption style={{ padding: '14px 18px 16px', borderTop: '1px solid #1A211E', fontFamily: "'Geist', ui-sans-serif, system-ui, sans-serif", fontSize: 14, lineHeight: 1.5, color: '#86918B' }}>
            Example orders. The main agent pays the whole tab later, in one payment.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 04 · settle once

const CALLS = [10, 100, 1000];
/** The signed calls scrolling past in the "x402 today" card: eight, shown twice. */
const SIGNED = ['search.api /query', 'prices.api /sol-usd', 'news.api /latest', 'llm.api /chat', 'image.api /render', 'translate.api /text', 'maps.api /route', 'search.api /query'];

function Settle() {
  const [calls, setCalls] = useState(100);
  const n = calls.toLocaleString('en-GB');
  return (
    <section id="settle" aria-labelledby="t-settle-title" className="t-sec t-alt">
      <div className="t-wrap">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '32px 48px' }}>
          <div style={{ flex: '1 1 560px', maxWidth: 760, minWidth: 0 }}>
            <p className="t-kicker">04 · Settle once</p>
            <h2 id="t-settle-title" className="t-display t-h2">
              Many orders on one tab. One payment settles it.
            </h2>
            <p className="t-lead" style={{ maxWidth: 640 }}>
              Pay per call means one on-chain payment for each request. With Tessera Pay Later, the main agent settles the whole tab in a single payment.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="t-eyeb">Orders on the tab</span>
            <div className="t-seg" role="group" aria-label="Orders on the tab">
              {CALLS.map((c) => (
                <button key={c} type="button" aria-pressed={calls === c} onClick={() => setCalls(c)}>
                  {c.toLocaleString('en-GB')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 44, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', gap: 24 }}>
          <div className="t-card" style={{ padding: 'clamp(20px, 3vw, 32px)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span className="t-eyeb">x402 today</span>
              <span className="t-pill t-pill-amber">Pay per call</span>
            </div>
            <p style={{ margin: '26px 0 0', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 14px' }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 'clamp(52px, 6vw, 84px)', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.04em', color: '#F5BE55' }}>{n}</span>
              <span style={{ fontSize: 20, fontWeight: 500, color: '#E8EDE9' }}>payments</span>
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.55, color: '#A3ADA7' }}>{n} signatures. One for each call.</p>
            <div className="t-mq" aria-hidden style={{ marginTop: 24 }}>
              <div className="t-mq-in">
                {[...SIGNED, ...SIGNED].map((s, i) => (
                  <div key={i} className="t-mq-row">
                    <span className="t-dotc" style={{ color: '#F5BE55' }} />
                    <span>{s}</span>
                    <span>signed</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ border: '1px solid rgba(94,230,171,0.35)', borderRadius: 24, background: '#0F1513', padding: 'clamp(20px, 3vw, 32px)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span className="t-eyeb" style={{ color: '#5EE6AB' }}>
                Tessera Pay Later
              </span>
              <span className="t-pill t-pill-mint">Settle once</span>
            </div>
            <p style={{ margin: '26px 0 0', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 14px' }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 'clamp(52px, 6vw, 84px)', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.04em', color: '#5EE6AB' }}>1</span>
              <span style={{ fontSize: 20, fontWeight: 500, color: '#E8EDE9' }}>payment</span>
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.55, color: '#A3ADA7' }}>1 signature, from the main agent.</p>
            <div className="t-term" aria-hidden style={{ marginTop: 24 }}>
              <TermBar />
              <div className="t-term-body">
                <span className="t-ln">
                  <span className="t-ps">$ </span>
                  <span className="t-typed t-typeC">tessera settle</span>
                  <span className="t-cur t-curC" />
                </span>
                <div className="t-out t-oE">
                  <span className="t-ln t-dim">
                    tab {TAB_ID} · {n} orders · unpaid
                  </span>
                  <span className="t-ln">settling {n} orders in 1 payment</span>
                </div>
                <div className="t-out t-oF">
                  <span className="t-ln">
                    <span className="t-pb">
                      <span />
                    </span>
                    <span className="t-wht" style={{ marginLeft: '1ch' }}>
                      <span className="t-pct" />
                    </span>
                  </span>
                </div>
                <div className="t-out t-oG">
                  <span className="t-ln t-mint">
                    <Check />
                    settled · 1 signature · main agent
                  </span>
                  <span className="t-ln t-dim">{n} orders closed · 1 payment on-chain</span>
                  <Prompt />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ close and footer

/** The 24 tiles of the closing grid: [delay in seconds, amber]. */
const CLOSE_TILES: [number, boolean][] = [
  [0, false], [2.4, false], [1.2, false], [3.6, true], [0.6, false], [4.2, false], [1.8, false], [3, false], [4.6, false], [0.4, true], [2.2, false], [3.4, false],
  [1.4, false], [3.8, false], [0.8, false], [2.8, false], [4.4, true], [1, false], [2, false], [4, false], [0.2, false], [3.2, true], [1.6, false], [2.6, false],
];

function Close() {
  return (
    <section aria-labelledby="t-cta-title" style={{ position: 'relative', padding: 'clamp(88px, 11vw, 150px) 0', borderTop: '1px solid #1A211E' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 clamp(16px, 4vw, 32px)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '48px 64px' }}>
        <div style={{ flex: '1 1 520px', maxWidth: 640, minWidth: 0 }}>
          <h2 id="t-cta-title" className="t-display" style={{ margin: 0, fontSize: 'clamp(40px, 5.6vw, 76px)', lineHeight: 1, letterSpacing: '-0.04em' }}>
            Every payment matters.
          </h2>
          <p style={{ margin: '24px 0 0', maxWidth: 520, fontSize: 'clamp(17px, 1.5vw, 19px)', lineHeight: 1.6, color: '#A3ADA7' }}>
            Tessera is the credit layer for agentic commerce. Agents buy now, and the main agent pays once.
          </p>
          <div style={{ marginTop: 34, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <a className="t-btn t-btn-primary" href="#demo">
              <PlayIcon />
              Watch the demo
            </a>
            <a className="t-btn t-btn-ghost" href={DOCS} target="_blank" rel="noreferrer">
              Read the docs
            </a>
          </div>
        </div>
        <div className="t-twg" aria-hidden style={{ flex: '0 1 360px', minWidth: 0, maxWidth: 360, width: '100%' }}>
          {CLOSE_TILES.map(([delay, amber], i) => (
            <span key={i} className={amber ? 't-tw t-tw-a' : 't-tw'} style={{ animationDelay: `${delay}s` }} />
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer style={{ borderTop: '1px solid #1A211E' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px clamp(16px, 4vw, 32px) 40px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '20px 40px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 16px' }}>
          <a href="#top" aria-label="Tessera, back to top" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 44, color: '#E8EDE9', textDecoration: 'none' }}>
            <Mark size={22} />
            <span style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Tessera</span>
          </a>
          <span style={{ fontSize: 14, color: '#86918B' }}>The credit layer for agentic commerce.</span>
        </div>
        <nav className="t-nav" aria-label="Footer">
          <a href="#trust">Why trust</a>
          <a href="#merchants">Merchants</a>
          <a href="#pay-later">Pay Later</a>
          <a href={DOCS} target="_blank" rel="noreferrer">
            Docs
          </a>
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <span style={{ fontSize: 13, color: '#86918B' }}>© 2026 Tessera · Built on Solana and x402</span>
      </div>
      {/* The site's live pages, which read devnet in the browser. A row of their own, so the design's row stays as it is. */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 clamp(16px, 4vw, 32px) 28px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 24px' }}>
        <span className="t-lab" style={{ color: '#86918B' }}>
          Live on devnet
        </span>
        <nav className="t-nav" aria-label="Live pages">
          <Link to="/network">Live network</Link>
          <Link to="/agents">Agents</Link>
          <Link to="/market">Market</Link>
          <Link to="/formula">The score</Link>
        </nav>
      </div>
    </footer>
  );
}

/** The footer of the other pages (agents, market, formula, review), unchanged. */
export function Footer({ dark = true }: { dark?: boolean }) {
  return (
    <footer className={dark ? 'night' : ''} style={{ borderTop: `1px solid ${dark ? '#272b21' : '#ded7c2'}` }}>
      <div className="wrap flex flex-wrap items-center justify-between gap-6 py-10 text-[0.86rem]" style={{ color: dark ? '#8b8a7c' : '#878371' }}>
        <span className="inline-flex items-center gap-2.5">
          <Mark size={18} />
          Tessera. Devnet demo, unaudited. Not financial infrastructure yet.
        </span>
        <span className="mono flex flex-wrap gap-5 text-[0.76rem]">
          <Link to="/network" className="link">network</Link>
          <Link to="/agents" className="link">agents</Link>
          <Link to="/market" className="link">market</Link>
          <Link to="/formula" className="link">the score</Link>
          <a className="link" href={`mailto:${CONTACT}?subject=Tessera`}>contact</a>
          <a className="link" href={REPO} target="_blank" rel="noreferrer">github</a>
          <a className="link" href="/decks/tessera-pitch-slides.html" target="_blank" rel="noreferrer">slides</a>
          <a className="link" href={VIDEO.src} target="_blank" rel="noreferrer">demo video</a>
        </span>
      </div>
    </footer>
  );
}

export function Landing() {
  const path = usePath();
  const first = useRef(true);
  // "#/pay-later" from the shared nav, and a "#trust"-style anchor on a fresh load, open the page at that
  // section with a jump. Once the page is up, an anchor click is the browser's own smooth scroll.
  useEffect(() => {
    const id = path === '/pay-later' ? 'pay-later' : path.startsWith('/') ? '' : path;
    if (id && (first.current || path === '/pay-later')) document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    first.current = false;
  }, [path]);
  return (
    <div id="top" className="t-root" data-motion="on" style={{ background: '#0B0E0D', color: '#E8EDE9', fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", fontSize: 16, lineHeight: 1.6, overflowX: 'clip' }}>
      <Header />
      <Hero />
      <Demo />
      <Trust />
      <Merchants />
      <PayLater />
      <Settle />
      <Close />
      <LandingFooter />
    </div>
  );
}
