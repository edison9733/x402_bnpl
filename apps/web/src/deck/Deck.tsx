import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EASE } from '../components/ui';
import { useChain } from '../lib/store';

/**
 * A slide deck that is also a web page. Each slide is a React component on a
 * fixed 1600x900 stage that scales to the window, so a recording at any 16:9
 * size looks the same, and a slide can embed the live site.
 *
 *   → / space   next          n   speaker notes
 *   ←           previous      a   autoplay (each slide for its `seconds`)
 *
 * `?auto=1` starts autoplay, `?clean=1` hides the chrome, `?i=4` starts on
 * slide 5, `?t=7,13,12` overrides the seconds per slide (the recorder sizes
 * them to the narration), and `?wait=1` holds the first slide until the
 * chain has been read. With autoplay the deck sets `window.__deck.done` when
 * it ends, which is what the recorder waits for.
 */
export type Slide = {
  id: string;
  /** What to say over this slide. The same text is the video script. */
  say: string;
  /** How long autoplay stays here. Sized to the narration. */
  seconds: number;
  surface?: 'night' | 'paper';
  render: (ctx: { active: boolean }) => ReactNode;
};

const W = 1600;
const H = 900;

declare global {
  interface Window {
    __deck?: { index: number; total: number; done: boolean; startedAt?: number };
  }
}

export function Deck({ slides, title }: { slides: Slide[]; title: string }) {
  const query = useMemo(() => new URLSearchParams(window.location.hash.split('?')[1] ?? ''), []);
  const [i, setI] = useState(() => {
    const n = Number(query.get('i') ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.min(slides.length - 1, Math.floor(n))) : 0;
  });
  const [auto, setAuto] = useState(query.get('auto') === '1');
  const [notes, setNotes] = useState(false);
  const clean = query.get('clean') === '1';
  const [scale, setScale] = useState(1);
  // Start reading the chain on slide one, so a later slide that shows live data has it.
  const { status } = useChain();
  const timings = useMemo(() => (query.get('t') ?? '').split(',').map(Number).filter((n) => n > 0), [query]);
  const secondsOf = useCallback((k: number) => timings[k] ?? slides[k]!.seconds, [timings, slides]);
  const [ready, setReady] = useState(query.get('wait') !== '1');
  useEffect(() => {
    if (ready) return;
    if (status === 'live') return void setReady(true);
    const t = setTimeout(() => setReady(true), 25_000);
    return () => clearTimeout(t);
  }, [ready, status]);
  const [startedAt, setStartedAt] = useState<number | undefined>(undefined);

  // `#/deck/pitch?i=4` jumps to slide 5, also when the deck is already open.
  useEffect(() => {
    const on = () => {
      // Only a hash that names a slide moves the deck; any other change leaves it where it is.
      const raw = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('i');
      const n = Number(raw);
      if (raw !== null && Number.isFinite(n)) setI(Math.max(0, Math.min(slides.length - 1, n)));
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [slides.length]);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const next = useCallback(() => setI((v) => Math.min(slides.length - 1, v + 1)), [slides.length]);
  const prev = useCallback(() => setI((v) => Math.max(0, v - 1)), []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) next();
      else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) prev();
      else if (e.key === 'Home') setI(0);
      else if (e.key === 'End') setI(slides.length - 1);
      else if (e.key === 'n') setNotes((v) => !v);
      else if (e.key === 'a') setAuto((v) => !v);
    };
    window.addEventListener('keydown', on);
    // a swipe on a phone: left for the next slide, right to go back
    let x0: number | null = null;
    const down = (e: TouchEvent) => { x0 = e.touches[0]?.clientX ?? null; };
    const up = (e: TouchEvent) => {
      const x = e.changedTouches[0]?.clientX;
      if (x0 === null || x === undefined) return;
      const dx = x - x0;
      x0 = null;
      if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
    };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('keydown', on);
      window.removeEventListener('touchstart', down);
      window.removeEventListener('touchend', up);
    };
  }, [next, prev, slides.length]);

  useEffect(() => {
    if (auto && ready && startedAt === undefined) setStartedAt(Date.now());
  }, [auto, ready, startedAt]);

  // When the slide on screen was first shown. The timer below counts from it, so a
  // re-render (a chain read landing, say) does not restart the slide's time.
  const shownAt = useRef<{ i: number; at: number } | null>(null);
  useEffect(() => {
    window.__deck = { index: i, total: slides.length, done: false, startedAt };
    if (!auto || !ready || startedAt === undefined) return;
    if (shownAt.current?.i !== i) shownAt.current = { i, at: Date.now() };
    const left = Math.max(0, secondsOf(i) * 1000 - (Date.now() - shownAt.current.at));
    const t = setTimeout(() => {
      if (i < slides.length - 1) next();
      else window.__deck = { index: i, total: slides.length, done: true, startedAt };
    }, left);
    return () => clearTimeout(t);
  }, [auto, ready, startedAt, i, next, slides, secondsOf]);

  const s = slides[i]!;
  const night = (s.surface ?? 'night') === 'night';
  const total = Math.round(slides.reduce((n, _x, k) => n + secondsOf(k), 0));

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }} onClick={() => !clean && next()}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center', overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={s.id}
            className={night ? 'night gridded' : ''}
            initial={{ opacity: 0, scale: 1.015 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.55, ease: EASE }}
            style={{ position: 'absolute', inset: 0, background: night ? undefined : '#0B0E0D', color: night ? '#A3ADA7' : '#E8EDE9' }}
          >
            {s.render({ active: true })}
          </motion.div>
        </AnimatePresence>
        {!clean && (
          <div className="mono" style={{ position: 'absolute', left: 16, bottom: 10, padding: '4px 12px', borderRadius: 8, background: 'rgba(11,14,13,0.92)', fontSize: 13, color: '#86918B' }}>
            {title} · {i + 1} / {slides.length} · {auto ? 'autoplay' : '→ next · n notes · a autoplay'} · {Math.floor(total / 60)}:{String(total % 60).padStart(2, '0')} total
          </div>
        )}
        <div style={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: `${((i + 1) / slides.length) * 100}%`, background: night ? '#4fd19a' : '#5EE6AB', transition: 'width 0.5s' }} />
        {notes && (
          <div style={{ position: 'absolute', left: 60, right: 60, bottom: 54, padding: '18px 24px', borderRadius: 16, background: 'rgba(11,14,13,0.92)', color: '#E8EDE9', fontSize: 24, lineHeight: 1.45, border: '1px solid #232C28' }}>
            {s.say}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- building blocks every slide shares

export const Frame = ({ children, center = false, pad = 96 }: { children: ReactNode; center?: boolean; pad?: number }) => (
  <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column', justifyContent: center ? 'center' : 'flex-start', alignItems: center ? 'center' : 'stretch', textAlign: center ? 'center' : 'left' }}>
    {children}
  </div>
);

export const Kicker = ({ children, color }: { children: ReactNode; color?: string }) => (
  <motion.div className="eyebrow" style={{ fontSize: 17, color: color ?? '#86918B' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
    {children}
  </motion.div>
);

export const Big = ({ children, size = 112, delay = 0.1, color, max }: { children: ReactNode; size?: number; delay?: number; color?: string; max?: string }) => (
  <motion.h1 className="display" style={{ fontSize: size, margin: '18px 0 0', color, maxWidth: max }} initial={{ opacity: 0, y: 34 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: EASE, delay }}>
    {children}
  </motion.h1>
);

export const Body = ({ children, delay = 0.5, size = 34, max = '34ch', color }: { children: ReactNode; delay?: number; size?: number; max?: string; color?: string }) => (
  <motion.p style={{ fontSize: size, lineHeight: 1.35, margin: '36px 0 0', maxWidth: max, color }} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay }}>
    {children}
  </motion.p>
);

/** Where a number came from. Every external figure on a slide carries one. */
export const Source = ({ children, dark = true }: { children: ReactNode; dark?: boolean }) => (
  <motion.div className="mono" style={{ position: 'absolute', left: 96, bottom: 58, fontSize: 15, color: dark ? '#86918B' : '#86918B' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 0.8 }}>
    {children}
  </motion.div>
);

export const Rise = ({ children, delay = 0, y = 26, style }: { children: ReactNode; delay?: number; y?: number; style?: React.CSSProperties }) => (
  <motion.div style={style} initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay }}>
    {children}
  </motion.div>
);
