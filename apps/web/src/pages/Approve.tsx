/**
 * The approval page: where an agent that holds no key sends its owner to pay.
 *
 * The agent had a merchant open an escrow order in the owner's name (`tessera
 * ask`) and sent this link. Everything shown here is read from that order on
 * the chain; the link adds only what was asked for, shown as verified when it
 * hashes to the order's request hash. The owner's wallet signs one transfer
 * into the order's vault plus `confirm_funded`, and the page sends it. The
 * agent then collects the delivery with the claim only it holds. Until the
 * hold ends, the owner can dispute from here.
 */
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { address, fetchEncodedAccount, isAddress, type Address, type KeyPairSigner } from '@solana/kit';
import { getCreateAssociatedTokenIdempotentInstructionAsync, getTransferCheckedInstruction } from '@solana-program/token';
import {
  agentPdaOf,
  bytesEqual,
  configPda,
  fetchMaybeAgent,
  fetchMaybeConfig,
  fetchMaybeOrder,
  findAta,
  getConfirmFundedInstructionAsync,
  getOpenDisputeInstruction,
  getReleaseInstruction,
  OrderState,
  OrderVerificationError,
  orderAddresses,
  pairPdaOf,
  readLinkRequest,
  requestMatches,
  settleAccounts,
  sha256,
  TESSERA_PROGRAM_ADDRESS,
  toHex,
  USDC_DECIMALS,
  verifyOrderForPayment,
  walletBrowseLinks,
  type Config,
  type Order,
} from '@tessera/sdk';
import { Footer } from './Landing';
import { useBalances } from './Market';
import { Notice, Row } from './Review';
import { Nav } from '../components/Nav';
import { EASE, Reveal, TierBadge } from '../components/ui';
import { loadBurner } from '../lib/burner';
import { AGENTS_URL, NETWORK, readRpc } from '../lib/client';
import { duration, explorerAddress, explorerTx, short, usd } from '../lib/format';
import { Link, usePath } from '../lib/router';
import { profileOf, type Profile } from '../lib/store';
import { connectWallet, declined, errText, sendAs, useWallets, type Signer, type StdWallet } from '../lib/wallet';

const CLOCK = address('SysvarC1ock11111111111111111111111111111111');
/** Seconds of the payment window left unused: the program refuses a payment that lands after it closes. */
const MARGIN_SECS = 20;
/** What a payment costs in devnet SOL: one signature's fee, with room to spare. */
const FEE_LAMPORTS = 10_000n;
const FINAL = [OrderState.Released, OrderState.Refunded, OrderState.Resolved, OrderState.Cancelled];

const STATE_NAME: Record<number, string> = {
  [OrderState.AwaitingPayment]: 'Waiting for your payment',
  [OrderState.Funded]: 'Paid, waiting for the delivery',
  [OrderState.Delivered]: 'Delivered, held in escrow',
  [OrderState.Released]: 'Paid to the merchant',
  [OrderState.Refunded]: 'Refunded to you',
  [OrderState.Disputed]: 'Disputed, waiting for the arbiter',
  [OrderState.Resolved]: 'Dispute resolved',
  [OrderState.Cancelled]: 'Cancelled, never paid',
};

const mmss = (secs: number) => `${Math.floor(Math.max(0, secs) / 60)}:${String(Math.floor(Math.max(0, secs) % 60)).padStart(2, '0')}`;

/** A failed payment, release or dispute in plain words. Program errors are matched by name, hex or decimal code. */
function explain(e: unknown): string {
  const t = errText(e);
  if (declined(e)) return 'You declined in your wallet. Nothing was sent.';
  if (e instanceof OrderVerificationError) return `Not paid: the order ${e.message.replace(/^refusing to pay: /, '')}.`;
  if (/PaymentWindowClosed|0x1783|\b6019\b/.test(t)) return 'The payment window for this order closed before the payment landed. Nothing was charged. Ask your agent for a new link.';
  if (/InvalidState|0x1772|\b6002\b/.test(t)) return 'The order is no longer in a state that allows this. It may already be paid, settled or cancelled.';
  if (/DisputeWindowClosed|0x177c|\b6012\b/.test(t)) return 'The hold has ended, so the order can no longer be disputed.';
  if (/insufficient funds|custom program error: 0x1\b/i.test(t)) return `This wallet does not hold enough devnet USDC for this order.`;
  if (/no record of a prior credit|AccountNotFound|could not find account|InvalidAccountData/i.test(t)) return 'This wallet has no devnet SOL for the network fee, or no USDC account yet.';
  // The program's own words, from the simulation logs the RPC sent back.
  const said = /Error Message: ([^|]*?)\.?\s*(?:\||$)/.exec(t)?.[1];
  return `It did not go through: ${said ?? (e as Error)?.message ?? String(e)}`;
}

type Loaded = { status: 'loading' } | { status: 'invalid' } | { status: 'missing' } | { status: 'error'; message: string } | { status: 'ok'; order: Order };
type Busy = null | 'pay' | 'release' | 'dispute';

export function Approve({ order: param }: { order: string }) {
  const query = usePath().split('?')[1] ?? '';
  const link = useMemo(() => readLinkRequest(query), [query]);
  const orderAddr = isAddress(param) ? address(param) : null;

  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  // The order as first read: what the owner approves. A payment is checked against it, not against a later read.
  const [first, setFirst] = useState<Order | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [vault, setVault] = useState<Address | null>(null);
  const [merchant, setMerchant] = useState<Profile | null | undefined>(undefined);
  const [match, setMatch] = useState<boolean | null>(null);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(Date.now() / 1000);
  const wallets = useWallets();
  const [burner, setBurner] = useState<KeyPairSigner | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [paidTx, setPaidTx] = useState<string | null>(null);
  const [faucet, setFaucet] = useState<string | null>(null);
  const { balances, reload: reloadBalances } = useBalances(signer?.address, config?.mint);

  const load = useCallback(
    async (quiet = false) => {
      if (!orderAddr) return setLoaded({ status: 'invalid' });
      if (!quiet) setLoaded({ status: 'loading' });
      try {
        const o = await fetchMaybeOrder(readRpc, orderAddr);
        if (!o.exists || o.programAddress !== TESSERA_PROGRAM_ADDRESS) return setLoaded({ status: 'missing' });
        setLoaded({ status: 'ok', order: o.data });
        setFirst((f) => f ?? o.data);
      } catch (e) {
        // A Tessera order decodes; anything else at this address does not.
        const msg = (e as Error).message;
        if (/decode|discriminator|Expected|size/i.test(msg)) setLoaded({ status: 'missing' });
        else if (!quiet) setLoaded({ status: 'error', message: msg });
      }
    },
    [orderAddr],
  );

  useEffect(() => {
    // Another order: nothing read for the last one may show for this one.
    setFirst(null);
    setMerchant(undefined);
    setVault(null);
    setPaidTx(null);
    setError(null);
    void load();
  }, [load]);

  const order = loaded.status === 'ok' ? loaded.order : null;
  const live = !!order && !FINAL.includes(order.state);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void load(true), 3000);
    return () => clearInterval(t);
  }, [live, load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  // The config (payment window, hold rules, mint) and the chain's clock, which the window is judged by.
  useEffect(() => {
    void (async () => {
      try {
        const [c, clock] = await Promise.all([fetchMaybeConfig(readRpc, await configPda()), fetchEncodedAccount(readRpc, CLOCK)]);
        if (c.exists) setConfig(c.data);
        if (clock.exists) setSkew(Number(new DataView(clock.data.buffer, clock.data.byteOffset).getBigInt64(32, true)) - Date.now() / 1000);
      } catch {
        // the rows that need them say they are still being read
      }
    })();
  }, []);

  useEffect(() => {
    void loadBurner().then(setBurner).catch(() => null);
  }, []);

  const merchantWallet = first?.merchant;
  useEffect(() => {
    if (!merchantWallet || !config) return;
    void (async () => {
      try {
        const a = await fetchMaybeAgent(readRpc, await agentPdaOf(merchantWallet));
        setMerchant(a.exists ? profileOf({ address: a.address, data: a.data }, config.params) : null);
      } catch {
        setMerchant(null);
      }
    })();
  }, [merchantWallet, config]);

  const orderId = first?.orderId;
  useEffect(() => {
    if (!orderId || !config) return;
    void orderAddresses(Uint8Array.from(orderId), config.mint).then((a) => setVault(a.vault));
  }, [orderId, config]);

  const requestHash = first?.requestHash;
  useEffect(() => {
    setMatch(null);
    if (!requestHash || link.status !== 'ok') return;
    void requestMatches(link.request, requestHash).then(setMatch);
  }, [requestHash, link]);

  const browse = useMemo(() => walletBrowseLinks(window.location.href), [param, query]);

  // ------------------------------------------------------------- derived
  const chainNow = now + skew;
  const payLeft = first && config ? Number(first.createdAt) + config.params.unpaidSecs - chainNow : null;
  const changed =
    !!order &&
    !!first &&
    (order.buyer !== first.buyer || order.merchant !== first.merchant || order.amount !== first.amount || order.mint !== first.mint || !bytesEqual(order.orderId, first.orderId) || !bytesEqual(order.requestHash, first.requestHash));
  const awaiting = order?.state === OrderState.AwaitingPayment;
  const request: 'verified' | 'mismatch' | 'absent' | 'unreadable' | 'checking' =
    link.status === 'absent' ? 'absent' : link.status === 'unreadable' ? 'unreadable' : match === null ? 'checking' : match ? 'verified' : 'mismatch';
  const isBuyer = !!signer && !!order && signer.address === order.buyer;
  const shortOfUsdc = !!balances && !!first && balances.usdc < first.amount;
  const shortOfSol = !!balances && balances.sol < FEE_LAMPORTS;
  const windowOpen = payLeft !== null && payLeft > MARGIN_SECS;
  const canPay = awaiting && isBuyer && !changed && windowOpen && !!config && !!balances && !shortOfUsdc && !shortOfSol && request !== 'mismatch' && request !== 'unreadable' && request !== 'checking' && busy === null;
  const holdLeft = order ? Number(order.releaseAt) - chainNow : 0;
  const deliverLeft = order ? Number(order.deliverBy) - chainNow : 0;
  const hasFaucet = !AGENTS_URL.endsWith('.invalid');

  // ------------------------------------------------------------- actions
  const connect = async (w: StdWallet) => {
    setError(null);
    setConnecting(w.name);
    try {
      setSigner(await connectWallet(w));
    } catch (e) {
      setError(declined(e) ? 'You cancelled the connection in your wallet.' : `Could not connect to ${w.name}: ${(e as Error).message}`);
    } finally {
      setConnecting(null);
    }
  };

  const pay = async () => {
    if (!canPay || !first || !signer || !config || !orderAddr) return;
    setBusy('pay');
    setError(null);
    try {
      // Read the order again just before signing: what is signed is what was shown.
      const verified = await verifyOrderForPayment(readRpc, {
        orderId: Uint8Array.from(first.orderId),
        buyer: signer.address,
        merchant: first.merchant,
        amount: first.amount,
        mint: config.mint,
        payTo: orderAddr,
        requestHash: Uint8Array.from(first.requestHash),
      });
      const signature = await sendAs(signer, async (as) => [
        getTransferCheckedInstruction({ source: await findAta(signer.address, config.mint), mint: config.mint, destination: verified.vault, authority: as, amount: first.amount, decimals: USDC_DECIMALS }),
        await getConfirmFundedInstructionAsync({ order: verified.order, mint: config.mint }),
      ]);
      setPaidTx(signature);
      void reloadBalances();
      await load(true);
    } catch (e) {
      setError(explain(e));
      await load(true).catch(() => null);
    } finally {
      setBusy(null);
    }
  };

  const act = async (what: 'release' | 'dispute') => {
    if (!order || !signer || !config || !orderAddr) return;
    setBusy(what);
    setError(null);
    try {
      await sendAs(signer, async (as) =>
        what === 'release'
          ? [
              // Every payee needs a token account to be paid into, as when the merchant server releases.
              ...(await Promise.all([order.buyer, order.merchant, config.treasury].map((owner) => getCreateAssociatedTokenIdempotentInstructionAsync({ payer: as, owner, mint: order.mint })))),
              getReleaseInstruction({ ...(await settleAccounts(orderAddr, order, config.treasury)), authority: as }),
            ]
          : [
              getOpenDisputeInstruction({
                order: orderAddr,
                buyerAgent: await agentPdaOf(order.buyer),
                merchantAgent: await agentPdaOf(order.merchant),
                pair: await pairPdaOf(order.buyer, order.merchant),
                buyer: as,
                disputeHash: await sha256('disputed by the owner from the approval page'),
              }),
            ],
      );
      await load(true);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(null);
    }
  };

  const drip = async () => {
    if (!signer) return;
    setFaucet('Sending test funds…');
    try {
      const res = await fetch(`${AGENTS_URL}/api/faucet`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: signer.address }), signal: AbortSignal.timeout(30_000) });
      const out = (await res.json().catch(() => ({}))) as { usdc?: string; sol?: string; error?: string };
      if (!res.ok) throw new Error(out.error ?? `the faucet answered ${res.status}`);
      setFaucet(`Sent ${out.usdc} test USDC and ${out.sol} SOL.`);
      setTimeout(() => void reloadBalances(), 1500);
    } catch (e) {
      setFaucet((e as Error).message);
    }
  };

  // ------------------------------------------------------------- pieces
  const what = (
    <Row label="What it buys" verified={request === 'verified'}>
      {request === 'verified' && link.status === 'ok' && (
        <>
          <span className="mono">{link.request.sku}</span>
          <pre className="mono mt-2 overflow-auto rounded-xl p-3 text-[0.76rem] leading-relaxed" style={{ background: '#14130f', color: '#e9e6d8', maxHeight: '12rem', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {JSON.stringify(link.request.input, null, 2)}
          </pre>
          <span className="mt-1 block text-[0.78rem]" style={{ color: '#878371' }}>Hashes to the request hash the order committed on-chain.</span>
        </>
      )}
      {request === 'checking' && <span style={{ color: '#878371' }}>Checking the link against the order…</span>}
      {request === 'absent' && (
        <span>
          The link does not say. The order commits only to a hash of the request{first ? <> (<span className="mono">{toHex(first.requestHash).slice(0, 16)}…</span>)</> : null}. Pay only if you trust the agent that sent it.
        </span>
      )}
      {request === 'mismatch' && <span style={{ color: '#7a1f1f' }}>The link describes something other than what this order pays for. Do not pay. Ask your agent for a new link.</span>}
      {request === 'unreadable' && <span style={{ color: '#7a1f1f' }}>The link's description is damaged, so it cannot be checked. Do not pay. Ask your agent for a new link.</span>}
    </Row>
  );

  const picker = (
    <div className="mt-4 grid gap-2">
      {wallets.map((w) => (
        <button key={w.name} className="btn btn-ghost justify-start py-3" onClick={() => void connect(w)} disabled={!!connecting}>
          {w.icon && <img src={w.icon} alt="" width={20} height={20} style={{ borderRadius: 5 }} />}
          {connecting === w.name ? `Connecting to ${w.name}…` : `Connect ${w.name}`}
        </button>
      ))}
      {burner && order && burner.address === order.buyer && (
        <button className="btn btn-ghost justify-start py-3" onClick={() => setSigner({ kind: 'burner', address: burner.address, signer: burner })}>
          Use this browser's devnet test wallet ({short(burner.address, 4)})
        </button>
      )}
      {wallets.length === 0 && (
        <div className="rounded-2xl p-4 text-[0.9rem] leading-relaxed" style={{ background: '#f4efe0' }}>
          No wallet in this browser. On a phone, open this page inside your wallet's own browser:
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn btn-ink" href={browse.phantom}>Open in Phantom</a>
            <a className="btn btn-ghost" href={browse.solflare}>Open in Solflare</a>
          </div>
          <div className="mt-3 text-[0.84rem]" style={{ color: '#4b483e' }}>On a computer, install a Solana wallet extension that supports Wallet Standard, then reload.</div>
        </div>
      )}
      {NETWORK === 'devnet' && (
        <p className="text-[0.82rem] leading-relaxed" style={{ color: '#878371' }}>
          This order is on {NETWORK}. Switch your wallet to devnet first. In Phantom: Settings → Developer Settings → Testnet Mode, then Solana Devnet.
        </p>
      )}
    </div>
  );

  const connected = signer && (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3.5 py-2.5" style={{ background: '#f4efe0' }}>
      <span className="text-[0.88rem]">
        {signer.kind === 'wallet' ? signer.wallet.name : 'Devnet test wallet'} · <span className="mono">{short(signer.address, 6)}</span>
        {balances && <span className="mono ml-2 text-[0.8rem]" style={{ color: '#4b483e' }}>{usd(balances.usdc)} USDC · {(Number(balances.sol) / 1e9).toFixed(4)} SOL</span>}
      </span>
      <button className="link text-[0.84rem]" style={{ cursor: 'pointer' }} onClick={() => { setSigner(null); setError(null); }}>
        Change wallet
      </button>
    </div>
  );

  const step = (done: boolean, label: ReactNode, detail?: ReactNode, failed = false) => (
    <li className="grid gap-3" style={{ gridTemplateColumns: '1.6rem 1fr' }}>
      <span className="mono grid h-6 w-6 place-items-center rounded-full text-[0.74rem]" style={{ background: failed ? '#d03b3b' : done ? '#126b4a' : '#ebe4d0', color: done || failed ? '#fff' : '#4b483e' }}>
        {failed ? '✕' : done ? '✓' : '○'}
      </span>
      <span>
        <span className="text-[0.96rem] font-medium">{label}</span>
        {detail && <span className="mt-0.5 block text-[0.84rem] leading-relaxed" style={{ color: '#4b483e' }}>{detail}</span>}
      </span>
    </li>
  );

  const progress = order && !awaiting && (
    <div className="mt-2">
      <ol className="grid gap-3" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {order.state === OrderState.Cancelled ? (
          step(false, 'Cancelled before it was paid', 'The quote expired or was withdrawn. Nothing was charged.', true)
        ) : (
          <>
            {step(true, 'Paid into escrow', paidTx ? <a className="link mono" href={explorerTx(paidTx)} target="_blank" rel="noreferrer">your transaction</a> : `${usd(order.amount)} in the order's vault, not with the merchant`)}
            {step(
              order.state !== OrderState.Funded,
              'The merchant delivers',
              order.state === OrderState.Funded ? (
                deliverLeft > 0 ? (
                  <>Your agent collects the delivery with the claim only it holds. The merchant has {mmss(deliverLeft)} left; if it does not deliver, you get everything back.</>
                ) : (
                  <>The delivery deadline has passed: the order can be refunded to you in full, and the merchant's server does that itself.</>
                )
              ) : /[^0]/.test(toHex(order.deliveryHash)) ? (
                <>
                  Committed hash <span className="mono">{toHex(order.deliveryHash).slice(0, 16)}…</span>. Your agent checks what it received against it.
                </>
              ) : (
                'No delivery was committed.'
              ),
            )}
            {step(
              FINAL.includes(order.state),
              order.state === OrderState.Refunded
                ? 'Refunded to you'
                : order.state === OrderState.Resolved
                  ? 'Dispute resolved'
                  : order.state === OrderState.Disputed
                    ? 'The arbiter rules'
                    : order.state === OrderState.Released && order.instant
                      ? 'Paid to the merchant at once'
                      : order.state === OrderState.Released && order.settledAt < order.releaseAt
                        ? 'Released early: you confirmed receipt'
                        : 'Paid to the merchant after the hold',
              FINAL.includes(order.state) ? (
                <span className="mono text-[0.8rem]">
                  merchant {usd(order.paidMerchant, 4)} · protocol fee {usd(order.paidFee, 4)} · back to you {usd(order.refunded, 4)}
                </span>
              ) : order.state === OrderState.Disputed ? (
                'You disputed it. The money stays in escrow until the arbiter rules.'
              ) : order.state === OrderState.Delivered ? (
                holdLeft > 0 ? `Held ${mmss(holdLeft)} more. Until then you can dispute, and the merchant cannot take the money.` : 'The hold is over. Anyone can release it now; the merchant server will within a few seconds.'
              ) : (
                `Held ${duration(order.holdSecs)} after delivery, so you can dispute.`
              ),
            )}
          </>
        )}
      </ol>
      {order.state === OrderState.Delivered && holdLeft > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {isBuyer ? (
            <>
              <button className="btn btn-ghost" disabled={busy !== null} onClick={() => void act('dispute')}>{busy === 'dispute' ? 'Waiting for the wallet…' : 'Dispute it'}</button>
              <button className="btn btn-ghost" disabled={busy !== null} onClick={() => void act('release')}>{busy === 'release' ? 'Waiting for the wallet…' : 'Release it now'}</button>
            </>
          ) : (
            <span className="text-[0.86rem]" style={{ color: '#878371' }}>Connect the wallet that paid to dispute or release it early.</span>
          )}
        </div>
      )}
      {FINAL.includes(order.state) && order.state !== OrderState.Cancelled && (
        <p className="mt-4 text-[0.9rem]">
          <Link to={`/review/${param}`} className="link">Rate the merchant with this receipt →</Link>
        </p>
      )}
    </div>
  );

  // ------------------------------------------------------------- page
  return (
    <div>
      <Nav />
      <main className="wrap pb-24 pt-12">
        <Reveal>
          <div className="eyebrow" style={{ color: '#878371' }}>Approve a purchase · {NETWORK}</div>
          <h1 className="display mt-3 text-[clamp(2.6rem,6vw,5rem)]">
            Your agent wants to buy. <em>You approve, your wallet pays.</em>
          </h1>
          <p className="mt-5 max-w-[44rem] text-[1.05rem] leading-relaxed" style={{ color: '#4b483e' }}>
            Your agent holds no key. It asked a merchant to open an escrow order in your name and sent you this page. Everything below is read from that order on-chain, not from the link. If you pay, the money waits in escrow: the merchant is paid only after it delivers and the hold ends, and until then you can dispute.
          </p>
        </Reveal>

        {loaded.status === 'loading' && <p className="mono mt-6 text-[0.84rem]" style={{ color: '#878371' }}>Reading the order from {NETWORK}…</p>}
        {loaded.status === 'invalid' && <Notice tone="bad">This link does not name a Solana address. Ask your agent for the link again.</Notice>}
        {loaded.status === 'missing' && <Notice tone="bad">No Tessera order at this address on {NETWORK}. The link may be wrong, or the order was closed after it settled.</Notice>}
        {loaded.status === 'error' && <Notice tone="bad">Could not read {NETWORK} just now: {loaded.message}</Notice>}

        {order && first && (
          <div className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
            <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="card p-6" aria-label="The order">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="display text-[2rem]">The order</h2>
                <a className="mono link text-[0.72rem]" href={explorerAddress(param)} target="_blank" rel="noreferrer" title="Opens Solana Explorer">
                  {short(param, 6)} on {NETWORK}
                </a>
              </div>
              <div className="mt-4">
                {what}
                <Row label="Merchant">
                  {merchant === undefined ? (
                    <span className="mono">{short(first.merchant, 6)}</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <a className="link font-medium" href={`#/agents/${first.merchant}`}>{merchant ? merchant.name : short(first.merchant, 6)}</a>
                      {merchant && <TierBadge tier={merchant.eval.tier} />}
                      {merchant && <span className="mono text-[0.78rem]" style={{ color: '#878371' }}>score {merchant.eval.score}</span>}
                    </span>
                  )}
                  <span className="mono mt-0.5 block text-[0.74rem]" style={{ color: '#878371' }}>
                    {merchant === null ? `${short(first.merchant, 6)} · no credit file on-chain yet` : `${short(first.merchant, 6)} · name and score from its credit file`}
                  </span>
                </Row>
                <Row label="Price">
                  <span className="display text-[1.8rem] leading-none">{usd(first.amount)}</span> <span className="mono text-[0.8rem]">USDC</span>
                  <span className="mt-1 block text-[0.8rem]" style={{ color: '#878371' }}>
                    Paid into the order's own vault{vault ? <> (<span className="mono">{short(vault, 4)}</span>)</> : null}, not to the merchant.
                  </span>
                </Row>
                <Row label="In the name of">
                  <a className="mono link" href={`#/agents/${first.buyer}`} title={first.buyer}>{short(first.buyer, 6)}</a>
                  <span className="mt-0.5 block text-[0.78rem]" style={{ color: '#878371' }}>Only this wallet can pay it, and refunds go back to it.</span>
                </Row>
                <Row label="Protection">
                  Held {duration(first.holdSecs)} after delivery, so you can dispute.
                  {config && <> If the merchant does not deliver within {duration(config.params.deliverSecs)} of payment, you get it all back.</>}
                </Row>
                <Row label="State">
                  {STATE_NAME[order.state] ?? 'Unknown'}
                  {awaiting && payLeft !== null && (
                    <span className="mono mt-0.5 block text-[0.8rem]" style={{ color: windowOpen ? '#4b483e' : '#7a1f1f' }}>
                      {windowOpen ? `${mmss(payLeft - MARGIN_SECS)} left to pay` : 'The payment window has closed. Nothing was charged.'}
                    </span>
                  )}
                </Row>
              </div>
              {changed && <Notice tone="bad">This order changed since you opened this page. Do not pay. Ask your agent for a new link.</Notice>}
            </motion.section>

            <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.08 }} className="card p-6" aria-label="Approve and pay">
              <h2 className="display text-[2rem]">{awaiting ? 'Approve and pay' : 'What happened'}</h2>

              {awaiting ? (
                <>
                  <p className="mt-2 text-[0.95rem] leading-relaxed" style={{ color: '#4b483e' }}>
                    Your wallet signs one transaction: {usd(first.amount)} USDC from you into this order's vault, and the program marks the order paid. The network fee is a fraction of a cent in devnet SOL.
                  </p>
                  {!signer && picker}
                  {connected}
                  {signer && !isBuyer && (
                    <Notice tone="bad">
                      This order is in the name of <span className="mono">{short(first.buyer, 6)}</span>, and this wallet is <span className="mono">{short(signer.address, 6)}</span>. Connect the wallet your agent named, or ask it for a new link for this one.
                    </Notice>
                  )}
                  {signer && isBuyer && (shortOfUsdc || shortOfSol) && (
                    <Notice tone="warn">
                      {shortOfUsdc ? `This wallet holds ${usd(balances!.usdc)} devnet USDC, less than the ${usd(first.amount)} price.` : 'This wallet has no devnet SOL for the network fee.'}{' '}
                      Get devnet USDC at <a className="link" href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com</a> (choose Solana Devnet) and SOL at <a className="link" href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>.
                      {hasFaucet && (
                        <span className="mt-2 flex flex-wrap items-center gap-3">
                          <button className="btn btn-ghost" onClick={() => void drip()}>Get test funds from the demo</button>
                          {faucet && <span className="mono text-[0.76rem]">{faucet}</span>}
                        </span>
                      )}
                    </Notice>
                  )}
                  {signer && (
                    <button className="btn btn-ink mt-4 w-full justify-center py-3.5" onClick={() => void pay()} disabled={!canPay}>
                      {busy === 'pay' ? 'Waiting for your wallet and the network…' : `Approve and pay ${usd(first.amount)}`}
                    </button>
                  )}
                  <p className="mt-4 text-[0.84rem] leading-relaxed" style={{ color: '#878371' }}>
                    Not yours, or not wanted? Close this page. {payLeft !== null && windowOpen ? `The quote expires in ${mmss(payLeft)}` : 'The quote expires'} and nothing is charged.
                  </p>
                </>
              ) : (
                <>
                  {order.state !== OrderState.Cancelled && !signer && order.state === OrderState.Delivered && holdLeft > 0 && (
                    <>
                      <p className="mt-2 text-[0.92rem]" style={{ color: '#4b483e' }}>Connect the wallet that paid to dispute or release it.</p>
                      {picker}
                    </>
                  )}
                  {connected}
                  {progress}
                </>
              )}

              {error && <div className="mono mt-4 rounded-xl p-3 text-[0.8rem]" role="alert" style={{ background: '#fdecea', color: '#7a1f1f', wordBreak: 'break-word' }}>{error}</div>}
            </motion.section>
          </div>
        )}

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <div className="card p-6">
            <div className="eyebrow" style={{ color: '#878371' }}>Why a link, not a key</div>
            <ul className="mt-3 grid gap-2 text-[0.92rem] leading-relaxed" style={{ color: '#4b483e', paddingLeft: '1.1rem', listStyle: 'disc' }}>
              <li>Your agent never holds a key or card number. It can ask; only your wallet can pay.</li>
              <li>The page reads the order from the chain and checks the link against it. A link that lies about the order is caught here.</li>
              <li>Each approval pays one order, for one price, into escrow. Until the hold ends you can dispute, which a wallet payment alone cannot do.</li>
            </ul>
          </div>
          <div className="card p-6">
            <div className="eyebrow" style={{ color: '#878371' }}>How your agent makes one</div>
            <pre className="mono mt-3 overflow-x-auto rounded-xl p-4 text-[0.78rem] leading-relaxed" style={{ background: '#14130f', color: '#e9e6d8', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {'npm run tessera -- ask <merchant agent url> <skill> --owner <your wallet> --input \'{…}\''}
            </pre>
            <p className="mt-2 text-[0.84rem]" style={{ color: '#878371' }}>It prints this link, then waits for your payment and collects the delivery. No keypair on the agent's machine.</p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
