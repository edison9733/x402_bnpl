/**
 * The score page, as designed in docs/handoff/score/index.html. Every number
 * on it comes from the SDK: the hero's wallet and the simulator run
 * `simulate.simulate` and `score.breakdown`, the same functions `tessera
 * score --simulate` runs; the parameter table reads the config; the payout block is the
 * recorded run in deployments/rewards-demo.json; the test lines are what
 * `npm test -- score` last wrote to deployments/score-tests.json.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { DEVNET_PARAMS, MAINNET_TARGET_PARAMS, score, simulate, type Params } from '@tessera/sdk';
import { Nav } from '../components/Nav';
import { duration, usd } from '../lib/format';
import { cap, comment, fees, LABELS, recordedAt, reproduce, rows } from '../lib/rewardsDemo';
import { useChain } from '../lib/store';
import { Footer } from './Landing';
import scoreTests from '../../../../deployments/score-tests.json';
import './formula.css';

const REPO = 'https://github.com/edison9733/x402_bnpl';
const P = MAINNET_TARGET_PARAMS;
const TIERS = ['New', 'Building', 'Established', 'Trusted'] as const;
const { STEPS, PRESETS } = simulate;
const SMALL = simulate.presetById('small-honest-shop')!;
const USDC = 1_000_000n;

const f2 = score.milli2;
const pct = (milli: number) => `${Math.round(Math.max(0, Math.min(1000, milli)) / 10)}%`;
const money = (units: bigint) => `$${(units / USDC).toLocaleString('en-GB')}`;
const hold = (p: Params, tier: number) => duration(p.holdSecs[tier]!);

/** The breakdown of a described wallet at mainnet scale: what `tessera score --simulate` prints. */
function run(w: simulate.Wallet) {
  const o = simulate.simulate(w, P);
  return { o, b: score.breakdown(o.agent, P, o.now) };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The first line `tessera score --simulate` prints. */
const simHeader = (w: simulate.Wallet) => `simulated · ${plural(w.buyers, 'counterparty', 'counterparties')} · ${plural(w.activePeriods, 'active period')} · mainnet scale`;

/** A wallet as `tessera score --simulate` flags, in the order its help lists them. */
const simFlags = (w: simulate.Wallet): [string, string][] => [
  ['--sales', String(w.sales / USDC)],
  ['--buyers', String(w.buyers)],
  ['--buyer-tier', TIERS[w.buyerTier].toLowerCase()],
  ['--active', String(w.activePeriods)],
  ['--stars', String(w.stars)],
  ['--disputes', String(w.disputesLost)],
];

/** The command that prints this wallet: its preset, or the nearest preset and the flags that differ from it. */
function simCommand(w: simulate.Wallet): string {
  const mine = simFlags(w);
  const differ = (p: simulate.Preset) => {
    const theirs = simFlags(p.w);
    return mine.filter(([, v], i) => v !== theirs[i]![1]);
  };
  const base = PRESETS.reduce((best, p) => (differ(p).length < differ(best).length ? p : best), SMALL);
  return ['tessera score --simulate --preset', base.id, ...differ(base).flat()].join(' ');
}

/** Lines `BreakdownLines` prints: five factors, evidence, score, tier. */
const BREAKDOWN_LINES = 8;

// ---------------------------------------------------------------- terminal pieces

function TermBar({ title, right }: { title: string; right: string }) {
  return (
    <div className="s-term-bar">
      <span className="s-term-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <span>{title}</span>
      {/* On a phone the label may wrap, but only between its parts. */}
      <span>{right.split(' · ').map((part) => part.replaceAll(' ', '\u00a0')).join(' · ')}</span>
    </div>
  );
}

/** One factor line: label, value, a bar, the real inputs. The bar's width is the value itself. */
function FactorLine({ label, f }: { label: string; f: score.Factor }) {
  return (
    <span className="s-ln">
      <span className="s-c s-dim" style={{ width: '12ch' }}>{label}</span>
      <span className="s-c s-wht" style={{ width: '7ch' }}>{f2(f.milli)}</span>
      <span className="s-sb"><span style={{ width: pct(f.milli) }} /></span>
      <span className="s-c s-dim">{f.explain}</span>
    </span>
  );
}

/** The breakdown as the CLI prints it: five factors, evidence, the score, the tier line. */
function BreakdownLines({ b, holdFirst, holdThen }: { b: score.Breakdown; holdFirst: string; holdThen: string }) {
  return (
    <>
      <FactorLine label="history" f={b.history} />
      <FactorLine label="tenure" f={b.tenure} />
      <FactorLine label="diversity" f={b.diversity} />
      <FactorLine label="rating" f={b.rating} />
      <FactorLine label="behaviour" f={b.behaviour} />
      <span className="s-ln">
        <span className="s-c s-dim" style={{ width: '12ch' }}>evidence</span>
        <span className="s-c s-wht" style={{ width: '7ch' }}>{f2(b.e.evidence)}</span>
        <span className="s-c s-dim">{b.evidence}</span>
      </span>
      <span className="s-ln">
        <span className="s-c s-dim" style={{ width: '12ch' }}>score</span>
        <span className="s-c s-ps" style={{ width: '7ch' }}>{b.e.score}</span>
        <span className="s-c s-dim">{b.score}</span>
      </span>
      <span className="s-ln">
        <span className="s-c s-dim" style={{ width: '12ch' }}>tier</span>
        <span className="s-c s-wht" style={{ width: '12ch' }}>{TIERS[b.e.tier]}</span>
        <span className="s-c s-dim">{holdFirst} · {holdThen}</span>
      </span>
    </>
  );
}

// ---------------------------------------------------------------- sections

function Hero() {
  const { b } = useMemo(() => run(SMALL.w), []);
  const cmd = simCommand(SMALL.w);
  return (
    <section aria-labelledby="s-hero-title" style={{ position: 'relative' }}>
      <div className="s-gridbg" aria-hidden />
      <div className="s-wrap" style={{ position: 'relative', paddingTop: 'clamp(40px, 6vw, 80px)', paddingBottom: 'clamp(64px, 8vw, 112px)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'clamp(40px, 6vw, 72px)' }}>
        <div style={{ flex: '1 1 460px', minWidth: 0 }}>
          <p className="s-kicker">The score</p>
          <h1 id="s-hero-title" className="s-disp" style={{ margin: '26px 0 0', fontSize: 'clamp(40px, 5.6vw, 74px)', lineHeight: 1, letterSpacing: '-0.04em' }}>
            Every rule, <span className="s-hi">in the open.</span>
          </h1>
          <p className="s-lead" style={{ maxWidth: 520 }}>The program, the SDK and this page compute the score with the same arithmetic. Anyone can check it.</p>
          <div style={{ marginTop: 32, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span className="s-pill s-pill-grey">integer arithmetic</span>
            <span className="s-pill s-pill-grey">public accounts</span>
            <span className="s-pill s-pill-grey">recompute it yourself</span>
          </div>
        </div>
        <div style={{ flex: '1 1 520px', minWidth: 0 }}>
          <figure className="s-term" style={{ margin: 0 }}>
            <TermBar title="tessera · agent shell" right="simulated wallet" />
            <div className="s-term-body" aria-hidden>
              <span className="s-ln">
                <span className="s-ps">$ </span>
                <span className="s-typed s-typeH" style={{ '--chars': cmd.length } as CSSProperties}>{cmd}</span>
                <span className="s-cur s-curH" />
              </span>
              <div className="s-out s-oH" style={{ '--lines': 1 + BREAKDOWN_LINES } as CSSProperties}>
                <span className="s-ln s-dim">{simHeader(SMALL.w)}</span>
                <BreakdownLines b={b} holdFirst={`hold ${hold(P, b.e.tier)}`} holdThen={`devnet ${hold(DEVNET_PARAMS, b.e.tier)}`} />
              </div>
            </div>
          </figure>
          <p style={{ margin: '16px 0 0', fontSize: 14, lineHeight: 1.6, color: '#86918B' }}>
            On a real wallet, <span className="s-mono s-wht">{'tessera score <wallet>'}</span> also reads the score the program stored. When the two agree, it ends with <span className="s-ps">✓ same result from the program and the SDK</span>. If the score has moved since the program stored it, the tick line says which moment was compared.
          </p>
        </div>
      </div>
    </section>
  );
}

function FormulaSection() {
  return (
    <section className="s-sec s-alt" aria-labelledby="s-formula-title">
      <div className="s-wrap">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px 48px' }}>
          <div style={{ flex: '1 1 480px', maxWidth: 700, minWidth: 0 }}>
            <p className="s-kicker">01 · The formula</p>
            <h2 id="s-formula-title" className="s-disp s-h2">Four lines decide when you get paid.</h2>
          </div>
          <span className="s-pill s-pill-grey">weights: {f2(Number(score.W_HISTORY))} · {f2(Number(score.W_TENURE))} · {f2(Number(score.W_DIVERSITY))}</span>
        </div>
        <div className="s-code" style={{ marginTop: 40 }}>
          <div><i>score</i>    = <b>1000</b> × Evidence × Rating × Behaviour</div>
          <div><i>Evidence</i> = <b>{f2(Number(score.W_HISTORY))}</b> History + <b>{f2(Number(score.W_TENURE))}</b> Tenure + <b>{f2(Number(score.W_DIVERSITY))}</b> Diversity</div>
          <div><i>tier</i>     = the highest tier whose score gate <b>and</b> active-period gate are both met</div>
          <div>           <span className="s-dim">Trusted also needs no standing penalty</span></div>
          <div><i>hold</i>     = <b>max</b>(hold[merchant tier], hold[buyer tier])</div>
        </div>
      </div>
    </section>
  );
}

function Factor({ kind, name, formula, f, children, keyLine, delay }: { kind: 'Evidence' | 'Quality'; name: string; formula: string; f: score.Factor; children: ReactNode; keyLine: string; delay?: string }) {
  return (
    <div className="s-fac">
      <span className="s-lab" style={{ color: kind === 'Evidence' ? '#86918B' : '#F5BE55' }}>{kind}</span>
      <h3 className="s-disp" style={{ margin: 0, fontSize: 26, letterSpacing: '-0.02em' }}>{name}</h3>
      <p className="s-fac-f" style={{ margin: 0 }}>{formula}</p>
      <div className="s-fbar" role="img" aria-label={`${name} ${f2(f.milli)}`} style={delay ? { animationDelay: delay } : undefined}><span style={{ width: pct(f.milli) }} /></div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: '#A3ADA7' }}>{children}</p>
      <p className="s-fkey">{keyLine}</p>
    </div>
  );
}

function Factors() {
  const { b } = useMemo(() => run(SMALL.w), []);
  const w = score.TIER_WEIGHT;
  return (
    <section className="s-sec" aria-labelledby="s-factors-title">
      <div className="s-wrap">
        <p className="s-kicker">02 · Five factors</p>
        <h2 id="s-factors-title" className="s-disp s-h2">Three say how much is known. Two say if it is good.</h2>
        <p className="s-lead">Bars show the simulated wallet above.</p>
        <div className="s-facts" style={{ marginTop: 44 }}>
          <Factor kind="Evidence" name="History" formula="min(1, √(credit ÷ credit_full))" f={b.history} keyLine="The first dollars matter most. Size alone cannot buy the top." delay="0s">
            Settled volume, counted by who paid. <span className="s-wht">New {w[0]}%, Building {w[1]}%, Established {w[2]}%, Trusted {w[3]}%.</span> Capped per counterparty.
          </Factor>
          <Factor kind="Evidence" name="Tenure" formula="min(1, min(age, 3 × active periods) ÷ tenure_full)" f={b.tenure} keyLine="Idle age earns nothing.">
            Periods since registration, <span className="s-wht">at most three per period</span> with a settled order.
          </Factor>
          <Factor kind="Evidence" name="Diversity" formula="min(1, Σ counterparty points ÷ diversity_full)" f={b.diversity} keyLine="Ten sock puppets are worth one Trusted customer.">
            Each counterparty adds its best tier weight, once the pair has moved <span className="s-wht">a tenth of the pair cap</span>.
          </Factor>
          <Factor kind="Quality" name="Rating" formula="clamp((stars − 1.5) ÷ 3, 0, 1)" f={b.rating} keyLine="A refunded order's review weighs nothing.">
            Stars weighted by settled volume and the reviewer's tier, shrunk toward a <span className="s-wht">3-star prior</span>. No reviews means half marks.
          </Factor>
          <Factor kind="Quality" name="Behaviour" formula="1 − standing penalty" f={b.behaviour} keyLine="Any penalty blocks Trusted.">
            A lost dispute adds <span className="s-wht">{P.penaltyDisputeBps / 100}%</span>. A missed delivery adds <span className="s-wht">{P.penaltyExpiredBps / 100}%</span>. It heals a little every period.
          </Factor>
        </div>
      </div>
    </section>
  );
}

function Tiers({ devnet }: { devnet: Params }) {
  const who = [
    <>Any wallet. Everyone starts here.</>,
    <>A few clean orders over a few periods. <span className="s-wht">{P.tierScore[0]}+ points, {P.tierPeriods[0]} active days.</span></>,
    <>A real record across several counterparties. <span className="s-wht">{P.tierScore[1]}+ points, {P.tierPeriods[1]} active days.</span></>,
    <>A long, clean, well-rated record. <span className="s-wht">{P.tierScore[2]}+ points, {P.tierPeriods[2]} active days, no penalty.</span> May settle instantly inside its limit.</>,
  ];
  return (
    <section className="s-sec s-alt" aria-labelledby="s-tiers-title">
      <div className="s-wrap">
        <p className="s-kicker">03 · What a tier buys</p>
        <h2 id="s-tiers-title" className="s-disp s-h2">Climb a tier. Wait less. Count for more.</h2>
        <div className="s-card" style={{ marginTop: 44, padding: 'clamp(20px, 3vw, 36px)' }}>
          <div className="s-tier-h" aria-hidden>
            <span className="s-lab" style={{ color: '#86918B' }}>Tier</span>
            <span className="s-lab s-tx" style={{ color: '#86918B' }}>Who gets here</span>
            <span className="s-lab" style={{ color: '#86918B' }}>Counts as</span>
            <span className="s-lab" style={{ color: '#86918B' }}>Hold</span>
          </div>
          {TIERS.map((name, t) => (
            <div key={name} className={`s-tier s-t${t + 1}`}>
              <span style={{ fontSize: 17, fontWeight: 600, color: t === 3 ? '#5EE6AB' : '#E8EDE9' }}>
                <span className="s-dots" aria-hidden>
                  {[0, 1, 2, 3].map((i) => <span key={i} className={i <= t ? 's-on' : undefined} />)}
                </span>
                {name}
              </span>
              <span className="s-tx" style={{ fontSize: 15, lineHeight: 1.5, color: '#A3ADA7' }}>{who[t]}</span>
              <span className="s-mono" style={{ fontSize: 14, color: '#E8EDE9' }}>{score.TIER_WEIGHT[t]}%</span>
              <span className="s-mono" style={{ fontSize: 14, color: t === 3 ? '#5EE6AB' : '#E8EDE9' }}>
                {hold(P, t)}{t < 3 && <span className="s-dim"> · devnet {hold(devnet, t)}</span>}
              </span>
            </div>
          ))}
          <p style={{ margin: '20px 0 0', fontSize: 14, lineHeight: 1.6, color: '#86918B' }}>Mainnet holds are targets. The hold on an order is the longer of the buyer's and the merchant's holds.</p>
        </div>
        <ul className="s-list" style={{ marginTop: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '16px 32px' }}>
          <li><span><b>{P.pairHistoryMin === 2 ? 'Two' : P.pairHistoryMin} reviewed, undisputed orders</b> with a merchant, the first old enough and no penalty, and the buyer is Trusted for that merchant. One dispute ends it.</span></li>
          <li><span><b>The instant limit</b> is the fees a Trusted merchant has paid plus a small base. A 1 or 2 star rating on an instant order locks that amount.</span></li>
          <li><span><b>A buyer can ask for a longer hold</b>, never a shorter one, and checks it on-chain before paying.</span></li>
        </ul>
      </div>
    </section>
  );
}

function Chip({ on, onClick, children, small, label }: { on: boolean; onClick: () => void; children: ReactNode; small?: string; label?: string }) {
  return (
    <button type="button" className="s-chip" aria-pressed={on} aria-label={label} onClick={onClick}>
      {children}
      {small && <small>{small}</small>}
    </button>
  );
}

function Stepper({ value, steps, set, less, more }: { value: number; steps: readonly number[]; set: (n: number) => void; less: string; more: string }) {
  const i = Math.max(0, steps.indexOf(value));
  const at = (j: number) => steps[Math.max(0, Math.min(steps.length - 1, j))]!;
  return (
    <>
      <button type="button" className="s-stp" aria-label={less} onClick={() => set(at((i < 0 ? 0 : i) - 1))}>−</button>
      <button type="button" className="s-stp" aria-label={more} onClick={() => set(at((i < 0 ? 0 : i) + 1))}>+</button>
    </>
  );
}

function Control({ label, value, children, hint }: { label: string; value: ReactNode; children?: ReactNode; hint: ReactNode }) {
  return (
    <div className="s-ctl">
      <div className="s-ctl-h"><span>{label}</span><span className="s-ctl-v">{value}</span></div>
      {children}
      <span className="s-ctl-x">{hint}</span>
    </div>
  );
}

/** Section 04: steppers and chips on the left, the score and the live `tessera score --simulate` on the right. */
function Simulator({ devnet }: { devnet: Params }) {
  const [w, setW] = useState<simulate.Wallet>(SMALL.w);
  const set = (patch: Partial<simulate.Wallet>) => setW((cur) => ({ ...cur, ...patch }));
  const { o, b } = useMemo(() => run(w), [w]);
  const e = b.e;
  const weight = Number(score.TIER_WEIGHT[w.buyerTier]);
  const sales = Number(w.sales / USDC);
  const same = (x: simulate.Wallet) => x.sales === w.sales && x.buyers === w.buyers && x.buyerTier === w.buyerTier && x.activePeriods === w.activePeriods && x.stars === w.stars && x.disputesLost === w.disputesLost;

  let nextLine = 'Trusted is the top tier. Keep the record clean to stay here.';
  if (e.tier < 3) {
    const parts: string[] = [];
    const points = P.tierScore[e.tier]! - e.score;
    // The periods the program counts: none until a sale is reviewed.
    const days = P.tierPeriods[e.tier]! - o.agent.activePeriods;
    if (points > 0) parts.push(`${points} more points`);
    if (days > 0) parts.push(`${days} more active day${days === 1 ? '' : 's'}`);
    if (e.tier === 2 && b.penaltyBps > 0) parts.push('no standing penalty');
    nextLine = `To reach ${TIERS[e.tier + 1]}: ${parts.length ? parts.join(' and ') : 'met'}.`;
  }

  return (
    <section className="s-sec" aria-labelledby="s-try-title">
      <div className="s-wrap">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px 48px' }}>
          <div style={{ flex: '1 1 480px', maxWidth: 700, minWidth: 0 }}>
            <p className="s-kicker">04 · Try it</p>
            <h2 id="s-try-title" className="s-disp s-h2">Change anything. Watch the score move.</h2>
            <p className="s-lead">Same rules as the program, at mainnet scale.</p>
          </div>
          <div className="s-row" role="group" aria-label="Preset wallets">
            {PRESETS.map((p) => {
              const s = run(p.w).b.e.score;
              return <Chip key={p.id} on={same(p.w)} small={String(s)} label={`${p.name}, score ${s}`} onClick={() => setW(p.w)}>{p.name}</Chip>;
            })}
          </div>
        </div>

        <div className="s-sim" style={{ marginTop: 40 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="s-live" aria-hidden>
              <span className="s-disp" style={{ fontSize: 30, lineHeight: 1, letterSpacing: '-0.03em', color: '#E8EDE9' }}>
                {e.score}<span style={{ fontSize: 13, fontWeight: 500, letterSpacing: 0, color: '#86918B' }}> / 1000</span>
              </span>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#5EE6AB' }}>{TIERS[e.tier]}</span>
              <span className="s-mono" style={{ fontSize: 13, color: '#A3ADA7' }}>hold {hold(P, e.tier)}</span>
            </div>
            <Control
              label="Total sales"
              value={money(w.sales)}
              hint={<>Counted: <span className="s-wht">{money(o.counted)}</span>. Each buyer counts for {weight}% of what it paid, up to {money((P.pairCap * BigInt(weight)) / 100n)} per buyer.</>}
            >
              <div className="s-row">
                <Stepper value={sales} steps={STEPS.sales} set={(n) => set({ sales: BigInt(n) * USDC })} less="Less sales" more="More sales" />
              </div>
            </Control>
            <Control label="Different buyers" value={w.buyers} hint="A buyer counts once it has spent a tenth of the per-buyer cap.">
              <div className="s-row">
                <Stepper value={w.buyers} steps={STEPS.buyers} set={(n) => set({ buyers: n })} less="Fewer buyers" more="More buyers" />
              </div>
            </Control>
            <Control label="Those buyers are" value={`${weight}%`} hint={`Fresh wallets count for ${score.TIER_WEIGHT[0]}%, so fake buyers barely help.`}>
              <div className="s-row" role="group" aria-label="Buyer tier">
                {TIERS.map((name, t) => (
                  <Chip key={name} on={w.buyerTier === t} onClick={() => set({ buyerTier: t as simulate.Wallet['buyerTier'] })}>{name} {score.TIER_WEIGHT[t]}%</Chip>
                ))}
              </div>
            </Control>
            <Control label="Days actively selling" value={`${w.activePeriods} day${w.activePeriods === 1 ? '' : 's'}`} hint="Only days with a reviewed sale count. Idle age earns nothing.">
              <div className="s-row">
                <Stepper value={w.activePeriods} steps={STEPS.active} set={(n) => set({ activePeriods: n })} less="Fewer active days" more="More active days" />
              </div>
            </Control>
            <Control
              label="Average review"
              value={w.stars > 0 ? plural(w.stars, 'star') : 'none'}
              hint={w.stars > 0 ? `Reviews start from a 3-star prior worth ${usd(P.reviewPrior, 0)}, so a few reviews cannot swing it.` : 'No reviews yet, so the sales earn no evidence. A sale counts once its buyer reviews it.'}
            >
              <div className="s-row" role="group" aria-label="Average review">
                {STEPS.stars.map((n) => <Chip key={n} on={w.stars === n} onClick={() => set({ stars: n })} label={plural(n, 'star')}>{n}</Chip>)}
              </div>
            </Control>
            <Control label="Disputes lost recently" value={w.disputesLost} hint={`Each takes ${P.penaltyDisputeBps / 100}% off the score and blocks Trusted until it heals.`}>
              <div className="s-row" role="group" aria-label="Disputes lost">
                {STEPS.disputes.map((n) => <Chip key={n} on={w.disputesLost === n} onClick={() => set({ disputesLost: n })} label={`${plural(n, 'dispute')} lost`}>{n}</Chip>)}
              </div>
            </Control>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <div className="s-card" style={{ padding: 'clamp(20px, 3vw, 32px)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px 32px' }}>
                <div>
                  <span className="s-lab" style={{ color: '#86918B' }}>Score</span>
                  <p className="s-disp" style={{ margin: '10px 0 0', fontSize: 'clamp(56px, 7vw, 96px)', lineHeight: 1, letterSpacing: '-0.04em', color: '#E8EDE9' }}>
                    {e.score}<span style={{ fontSize: '0.3em', fontWeight: 500, letterSpacing: 0, color: '#86918B' }}> / 1000</span>
                  </p>
                </div>
                <div style={{ textAlign: 'right', marginLeft: 'auto' }}>
                  <span className="s-lab" style={{ color: '#86918B' }}>Tier</span>
                  <p className="s-disp" style={{ margin: '10px 0 0', fontSize: 'clamp(28px, 3vw, 40px)', letterSpacing: '-0.02em', color: '#5EE6AB' }}>{TIERS[e.tier]}</p>
                  <p className="s-mono" style={{ margin: '6px 0 0', fontSize: 14, color: '#A3ADA7' }}>hold {hold(P, e.tier)} <span className="s-dim">· devnet {hold(devnet, e.tier)}</span></p>
                </div>
              </div>
              <div className="s-meter" aria-hidden style={{ margin: '28px 9px 10px 0' }}>
                {P.tierScore.map((t) => <i key={t} style={{ left: `${t / 10}%` }} />)}
                <b style={{ width: `${e.score / 10}%` }} />
              </div>
              <div aria-hidden className="s-mono" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginRight: 9, fontSize: 12, color: '#86918B' }}>
                <span>0</span>{P.tierScore.map((t) => <span key={t}>{t}</span>)}
              </div>
              <p style={{ margin: '20px 0 0', fontSize: 15, lineHeight: 1.55, color: '#A3ADA7' }} aria-live="polite">{nextLine}</p>
            </div>
            <div className="s-term" aria-live="polite">
              <TermBar title="tessera · agent shell" right="live" />
              <div className="s-term-body">
                <span className="s-ln"><span className="s-ps">$ </span><span className="s-wht">{simCommand(w)}</span></span>
                <span className="s-ln s-dim">{simHeader(w)}</span>
                <BreakdownLines b={b} holdFirst={`hold ${hold(P, e.tier)}`} holdThen={`devnet ${hold(devnet, e.tier)}`} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Section 05: the recorded payout, grouped by whose reviews they were, in the layout `npm run demo:rewards` prints. */
function Rewards() {
  const notes: Record<string, string> = { glib: 'took an order from wren and never delivered · wren refunded in full', quill: 'kept delivering', nova: 'kept paying' };
  const failed = new Set(rows.filter((r) => /then_failed|early_warning/.test(r.label)).map((r) => r.subject));
  // Whose reviews were judged against a failure first, then the rest in the order they were first reviewed.
  const subjects = [...new Set(rows.map((r) => r.subject))].sort((a, b) => Number(failed.has(b)) - Number(failed.has(a)));
  const paid = Number(fees.paidToReviewers);
  const dollars = (n: number) => `$${n.toFixed(3)}`;
  // A heading per subject, a row per review, then the blank line, the total, the reproduce line and the prompt.
  const lines = subjects.length + rows.length + 4;
  return (
    <section className="s-sec s-alt" aria-labelledby="s-rev-title">
      <div className="s-wrap">
        <p className="s-kicker">05 · Reviews that pay</p>
        <h2 id="s-rev-title" className="s-disp s-h2">Honest reviews get paid. Fake ones lose money.</h2>
        <p className="s-lead">A share of every fee goes back to reviewers.</p>
        <ul className="s-list" style={{ marginTop: 40, gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '16px 32px' }}>
          <li><span><b>Same pay for 1 star or 5.</b> A quarter of the fee rate on the money behind the review.</span></li>
          <li><span><b>Judged on what happened next.</b> An honest warning pays 1.5×. Praise for a wallet that then failed pays nothing.</span></li>
          <li><span><b>Faking it loses money.</b> Both sides of an order get back at most 75% of the fee paid. New wallets count for {score.TIER_WEIGHT[0]}%.</span></li>
        </ul>
        <figure className="s-term" style={{ margin: '40px 0 0' }}>
          <TermBar title="tessera · agent shell" right={`recorded ${recordedAt} · local validator`} />
          <div className="s-term-body" aria-hidden>
            <span className="s-ln"><span className="s-ps">$ </span><span className="s-typed s-typeP">npm run demo:rewards</span><span className="s-cur s-curP" /></span>
            <div className="s-out s-oP" style={{ '--lines': lines } as CSSProperties}>
              {subjects.map((subject) => (
                <span key={subject} style={{ display: 'contents' }}>
                  <span className="s-ln s-dim">reviews of {cap(subject)} · {notes[subject] ?? 'kept its record clean'}</span>
                  {rows.filter((r) => r.subject === subject).map((r) => {
                    const l = LABELS[r.label]!;
                    const xTone = r.bps > 10_000 ? 's-ps' : r.bps < 10_000 ? 's-am' : '';
                    const tone = l.tone === 'good' ? 's-ps' : l.tone === 'bad' ? 's-am' : 's-dim';
                    const quote = comment(r.reviewer, r.subject);
                    return (
                      <span key={`${r.reviewer}-${r.subject}`} className="s-ln">
                        <span className="s-c s-wht" style={{ width: '8ch' }}>{cap(r.reviewer)}</span>
                        <span className="s-c" style={{ width: '6ch' }}>{r.rating}/5</span>
                        <span className="s-c s-dim" style={{ width: '52ch' }}>{quote ? `"${quote}"` : ''}</span>
                        <span className={`s-c ${xTone}`} style={{ width: '6ch' }}>{l.x}</span>
                        <span className="s-c s-wht" style={{ width: '9ch' }}>{dollars(Number(r.reward))}</span>
                        <span className={`s-c ${tone}`}>{l.short}</span>
                      </span>
                    );
                  })}
                </span>
              ))}
              <span className="s-ln" />
              <span className="s-ln"><span className="s-ps">paid from the treasury: {fees.paidToReviewers} USDC</span> <span className="s-dim">of {fees.collected} USDC in fees · {fees.shareOfFees.toFixed(2)}%</span></span>
              <span className="s-ln s-dim">reproduce: {reproduce}</span>
              <span className="s-ln"><span className="s-ps">$ </span><span className="s-cur" /></span>
            </div>
          </div>
        </figure>
        <p style={{ margin: '16px 0 0', fontSize: 14, color: '#86918B' }}>Paid {dollars(paid)} on a local validator running the real program. The rules are in docs/REWARDS.md.</p>
      </div>
    </section>
  );
}

function Numbers({ devnet, live }: { devnet: Params; live: boolean }) {
  const d = devnet;
  const m = P;
  const table: [string, string, string][] = [
    ['One period', duration(d.periodSecs), duration(m.periodSecs)],
    ['Hold: New / Building / Established / Trusted', d.holdSecs.map(duration).join(' / '), m.holdSecs.map(duration).join(' / ')],
    ['Score needed: Building / Established / Trusted', d.tierScore.join(' / '), m.tierScore.join(' / ')],
    ['Active periods needed', d.tierPeriods.join(' / '), m.tierPeriods.join(' / ')],
    ['Credit at which History is full', usd(d.creditFull), money(m.creditFull)],
    ['Most volume one counterparty can count for', usd(d.pairCap), money(m.pairCap)],
    ['Periods at which Tenure is full', String(d.tenureFull), String(m.tenureFull)],
    ['Counterparty points at which Diversity is full', String(d.diversityFull / 100), String(m.diversityFull / 100)],
    ['Weight of the 3-star prior', usd(d.reviewPrior), money(m.reviewPrior)],
    ['Instant limit', `${usd(d.instantBase)} + fees paid`, `${money(m.instantBase)} + fees paid`],
    ['Pair history that waives the buyer hold', `${d.pairHistoryMin} orders, first ≥ ${duration(d.pairAgeSecs)} old`, `${m.pairHistoryMin} orders, first ≥ ${duration(m.pairAgeSecs)} old`],
    ['Penalty: lost dispute / missed delivery', `${d.penaltyDisputeBps / 100}% / ${d.penaltyExpiredBps / 100}%`, `${m.penaltyDisputeBps / 100}% / ${m.penaltyExpiredBps / 100}%`],
    ['Penalty healed per period', `${d.penaltyDecayBps / 100}%`, `${m.penaltyDecayBps / 100}%`],
    ['Review window / complaint lock', `${duration(d.reviewSecs)} / ${duration(d.complaintSecs)}`, `${duration(m.reviewSecs)} / ${duration(m.complaintSecs)}`],
  ];
  const devnetLabel = `Devnet${live ? ' · read from chain' : ''}`;
  return (
    <section className="s-sec" aria-labelledby="s-num-title">
      <div className="s-wrap">
        <p className="s-kicker">06 · The numbers</p>
        <h2 id="s-num-title" className="s-disp s-h2">Devnet runs the same rules, compressed.</h2>
        <p className="s-lead">A wallet can go from New to Trusted in under an hour with a few test dollars. The mainnet column is a target, not a deployment.</p>
        <div className="s-card" style={{ marginTop: 44, padding: 'clamp(16px, 2.5vw, 28px)', overflowX: 'auto' }}>
          <table className="s-num">
            <thead>
              <tr><th scope="col">Parameter</th><th scope="col">{devnetLabel}</th><th scope="col" className="s-m">Mainnet target</th></tr>
            </thead>
            <tbody>
              {table.map(([k, a, b]) => (
                <tr key={k}><th scope="row">{k}</th><td data-label={devnetLabel}>{a}</td><td className="s-m" data-label="Mainnet target">{b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/** Section 07: every test in the score suite, tagged where it is a guarantee, as `npm test -- score` last printed them. */
function Guarantees() {
  const tests = scoreTests.tests;
  const skipOf = (t: (typeof tests)[number]) => (t as { skip?: string }).skip;
  const passing = tests.filter((t) => t.passed && !skipOf(t)).length;
  const failing = tests.filter((t) => !t.passed && !skipOf(t)).length;
  const skipped = tests.filter((t) => skipOf(t) === 'skipped').length;
  const todo = tests.filter((t) => skipOf(t) === 'todo').length;
  const formula = tests.filter((t) => t.where?.includes('formula')).length;
  const onChain = tests.filter((t) => t.where?.includes('on-chain')).length;
  return (
    <section className="s-sec s-alt" aria-labelledby="s-tests-title">
      <div className="s-wrap">
        <p className="s-kicker">07 · What is guaranteed</p>
        <h2 id="s-tests-title" className="s-disp s-h2">Each line is a test in the repo.</h2>
        <p className="s-lead">Formula tests run the arithmetic. On-chain checks also run against the real program on a local validator (<span className="s-mono">npm run test:local</span>): the attack is refused or earns nothing.</p>
        <figure className="s-term" style={{ margin: '40px 0 0' }}>
          <TermBar title="tessera · agent shell" right={`${tests.length} tests · ${scoreTests.recordedAt.slice(0, 10)}`} />
          <div className="s-term-body" aria-hidden>
            <span className="s-ln"><span className="s-ps">$ </span><span className="s-typed s-typeT">{scoreTests.command}</span><span className="s-cur s-curT" /></span>
            <div className="s-out s-oT" style={{ '--lines': tests.length } as CSSProperties}>
              {tests.map((t) => {
                const skip = skipOf(t);
                const tag = t.where && <span className="s-dim">{'\u00a0 '}{t.where}</span>;
                return (
                  <span key={t.title} className="s-ln">
                    {skip
                      ? <><span className="s-dim">-</span> {t.title}{tag}<span className="s-dim">{'\u00a0 '}{skip}</span></>
                      : <><span className={t.passed ? 's-ps' : 's-am'}>{t.passed ? '✓' : '✗'}</span> {t.title}{tag}</>}
                  </span>
                );
              })}
            </div>
            <div className="s-out s-oT2">
              <span className="s-ln">
                <span className="s-ps">{passing} passing</span>
                {failing > 0 && <><span className="s-dim"> · </span><span className="s-am">{failing} failing</span></>}
                {skipped > 0 && <span className="s-dim"> · {skipped} skipped</span>}
                {todo > 0 && <span className="s-dim"> · {todo} todo</span>}
                <span className="s-dim"> · {formula} formula · {onChain} on-chain</span>
              </span>
              <span className="s-ln"><span className="s-ps">$ </span><span className="s-cur" /></span>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}

function Limits() {
  return (
    <section className="s-sec" aria-labelledby="s-limits-title">
      <div className="s-wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: '48px 64px' }}>
        <div>
          <p className="s-kicker" style={{ color: '#F5BE55' }}>08 · What it cannot do</p>
          <h2 id="s-limits-title" className="s-disp" style={{ margin: '20px 0 0', fontSize: 'clamp(30px, 3.4vw, 44px)' }}>It prices faking. It does not detect it.</h2>
          <ul className="s-list" style={{ marginTop: 28 }}>
            <li><span><b>Tell a bot from a customer</b> who spends the same money.</span></li>
            <li><span><b>Stop one person running many wallets.</b> Each earns its own record, and caps what a record can take.</span></li>
            <li><span><b>Protect an instant order after the fact</b>, beyond the merchant's limit and the buyer's rating. Instant means no hold to dispute in.</span></li>
            <li><span><b>Judge a dispute.</b> An arbiter does. On devnet it is a single key.</span></li>
          </ul>
        </div>
        <div>
          <p className="s-kicker">09 · Where the ideas come from</p>
          <h2 className="s-disp" style={{ margin: '20px 0 0', fontSize: 'clamp(30px, 3.4vw, 44px)' }}>Known rails. One change.</h2>
          <ul className="s-list" style={{ marginTop: 28 }}>
            <li><span><b>ERC-8004, Trustless Agents.</b> Identity, reputation and validation registries for agents. Tessera is not an implementation of it. The agent account, the review accounts and the delivery hash play those roles on Solana.</span></li>
            <li><span><b>Visa Compelling Evidence 3.0.</b> Earlier undisputed purchases as evidence a later one is legitimate. The pair account is that evidence, kept by the program.</span></li>
            <li><span><b>x402 and A2A</b> carry the payment and the conversation unchanged. The only thing Tessera changes is where <span className="s-mono s-hi">payTo</span> points.</span></li>
          </ul>
          <a className="s-btn" href={`${REPO}/blob/main/docs/SCORING.md`} target="_blank" rel="noreferrer" style={{ marginTop: 32 }}>Full write-up in the repo</a>
        </div>
      </div>
    </section>
  );
}

export function Formula() {
  const { config } = useChain();
  const devnet = config?.params ?? DEVNET_PARAMS;
  return (
    <div className="s-root" data-motion="on" style={{ background: '#0B0E0D', color: '#E8EDE9', fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", fontSize: 16, lineHeight: 1.6, overflowX: 'clip' }}>
      <Nav />
      <main>
        <Hero />
        <FormulaSection />
        <Factors />
        <Tiers devnet={devnet} />
        <Simulator devnet={devnet} />
        <Rewards />
        <Numbers devnet={devnet} live={Boolean(config)} />
        <Guarantees />
        <Limits />
      </main>
      <Footer />
    </div>
  );
}
