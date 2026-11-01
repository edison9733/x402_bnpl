import { AnimatePresence, motion } from 'motion/react';
import { ago, duration, explorerAddress, usd } from '../lib/format';
import type { FeedEvent, Profile } from '../lib/store';
import { EASE, StateChip } from './ui';

/** What just happened on-chain, newest first. Every row links to its order account. */
export function Feed({ events, byWallet, limit = 14 }: { events: FeedEvent[]; byWallet: Map<string, Profile>; limit?: number }) {
  const name = (w: string) => byWallet.get(w)?.name ?? `${w.slice(0, 4)}…`;
  return (
    <ol className="grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      <AnimatePresence initial={false}>
        {events.slice(0, limit).map((e) => (
          <motion.li
            key={e.id}
            layout
            initial={{ opacity: 0, height: 0, x: -8 }}
            animate={{ opacity: 1, height: 'auto', x: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            <a
              href={explorerAddress(e.order)}
              target="_blank"
              rel="noreferrer"
              className="grid grid-cols-[5.4rem_minmax(0,1fr)_auto] items-center gap-3 py-2 text-[0.8rem] sm:grid-cols-[5.4rem_minmax(0,1fr)_auto_auto]"
              style={{ borderBottom: '1px solid #1A211E' }}
              title="Open this order account in Solana Explorer"
            >
              <StateChip kind={e.kind} />
              <span className="mono truncate" style={{ color: '#E8EDE9' }}>
                {name(e.buyer)} <span style={{ color: '#86918B' }}>→</span> {name(e.merchant)}
                {e.kind === 'delivered' && <span style={{ color: '#86918B' }}> · held {duration(e.holdSecs)}</span>}
              </span>
              <span className="mono text-right" style={{ color: '#86918B' }}>
                {usd(e.amount)}
              </span>
              <span className="mono hidden sm:inline" style={{ color: '#86918B', fontSize: '0.7rem' }}>
                {ago(e.at)}
              </span>
            </a>
          </motion.li>
        ))}
      </AnimatePresence>
      {events.length === 0 && <li className="mono py-6 text-[0.8rem]" style={{ color: '#86918B' }}>Waiting for the first order…</li>}
    </ol>
  );
}
