/**
 * The pay-later pool on the network the site reads, and one wallet's line
 * and loans, read straight from the pay-later program like everything else
 * here. On a network without the pool (devnet, until it is deployed) the
 * pages fall back to the preview rules.
 */
import { useEffect, useState } from 'react';
import { address, type Address } from '@solana/kit';
import { paylater } from '@tessera/sdk';
import { readRpc } from './client';

export type PayLaterState = {
  /** `none`: no pool on this network. `live`: the numbers are from the chain. */
  status: 'loading' | 'none' | 'live';
  poolAddress: Address | null;
  pool: paylater.Pool | null;
  line: paylater.CreditLine | null;
  loans: { address: Address; data: paylater.Loan }[];
};

const EMPTY: PayLaterState = { status: 'loading', poolAddress: null, pool: null, line: null, loans: [] };

export function usePayLater(wallet?: string): PayLaterState {
  const [state, setState] = useState<PayLaterState>(EMPTY);
  useEffect(() => {
    let live = true;
    setState(EMPTY);
    const load = async () => {
      try {
        const poolAddress = await paylater.poolPda();
        const pool = await paylater.fetchMaybePool(readRpc, poolAddress);
        if (!pool.exists) return void (live && setState({ ...EMPTY, status: 'none' }));
        let line: paylater.CreditLine | null = null;
        let loans: PayLaterState['loans'] = [];
        if (wallet) {
          const w = address(wallet);
          const [l, ls] = await Promise.all([paylater.fetchMaybeCreditLine(readRpc, await paylater.linePdaOf(w)), paylater.fetchLoansOf(readRpc as never, w)]);
          line = l.exists ? l.data : null;
          loans = ls;
        }
        if (live) setState({ status: 'live', poolAddress, pool: pool.data, line, loans });
      } catch {
        // a busy endpoint: keep what is shown, or say there is nothing to show
        if (live) setState((s) => (s.status === 'loading' ? { ...s, status: 'none' } : s));
      }
    };
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 15_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [wallet]);
  return state;
}
