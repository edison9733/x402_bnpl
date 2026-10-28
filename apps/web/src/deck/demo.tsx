import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { fetchMaybeToken } from '@solana-program/token';
import { findAta, USDC_DEVNET } from '@tessera/sdk';
import { EASE, Logo } from '../components/ui';
import { loadBurner } from '../lib/burner';
import { AGENTS_URL, readRpc } from '../lib/client';
import { recordedAt, reproduce, session } from '../lib/findDemo';
import { useProfiles } from '../lib/store';
import { Big, Body, Deck, Frame, Kicker, Rise, Source, type Slide } from './Deck';

const mint = '#b9f8da';
const white = '#f1eee2';

/** A caption bar over live footage, so the site itself stays the subject. */
const Caption = ({ children, side = false }: { children: React.ReactNode; side?: boolean }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.8, ease: EASE, delay: 0.6 }}
    style={{
      position: 'absolute',
      // beside a centred dialog rather than over its buttons
      ...(side ? { left: 40, top: 300, width: 380 } : { left: 48, right: 48, bottom: 40 }),
      padding: '18px 26px',
      borderRadius: 18,
      background: 'rgba(10,11,9,0.9)',
      border: '1px solid #272b21',
      color: white,
      fontSize: side ? 23 : 27,
      lineHeight: 1.35,
      backdropFilter: 'blur(8px)',
    }}
  >
    {children}
  </motion.div>
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The live site inside a slide. It is the real app on the same origin, so a
 * slide can scroll it and press its buttons: the demo is performed, not faked.
 */
function Live({ route, run, zoom = 1 }: { route: string; run?: (doc: Document, win: Window) => Promise<void>; zoom?: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let cancelled = false;
    const frame = ref.current!;
    const go = async () => {
      await sleep(1800);
      if (cancelled || !run || !frame.contentDocument || !frame.contentWindow) return;
      try {
        await run(frame.contentDocument, frame.contentWindow);
      } catch {
        // a missing element just means the tour skips that beat
      }
    };
    frame.addEventListener('load', () => void go(), { once: true });
    return () => {
      cancelled = true;
    };
  }, [run]);
  const base = `${window.location.origin}${window.location.pathname}`;
  return <iframe ref={ref} title={route} src={`${base}#${route}`} style={{ position: 'absolute', left: 0, top: 0, width: `${100 / zoom}%`, height: `${100 / zoom}%`, border: 0, transform: `scale(${zoom})`, transformOrigin: '0 0', background: '#fbf8ef' }} />;
}

const press = (doc: Document, text: string, nth = 0): boolean => {
  const b = [...doc.querySelectorAll('button')].filter((x) => x.textContent?.trim().startsWith(text))[nth] as HTMLButtonElement | undefined;
  if (!b || b.disabled) return false;
  b.click();
  return true;
};

const waitFor = async (doc: Document, test: () => boolean, ms: number) => {
  const until = Date.now() + ms;
  while (Date.now() < until && !test()) await sleep(400);
  void doc;
};

/**
 * Buy an identicon with the built-in test wallet, then confirm receipt. A real
 * devnet purchase.
 */
async function buyTour(doc: Document) {
  await waitFor(doc, () => /\$\d+\.\d\d USDC/.test(doc.body.innerText), 10_000);
  // innerText applies CSS text-transform, and this label is set in capitals.
  if (!/Paying with the built-in devnet test wallet/i.test(doc.body.innerText)) return;
  if (/\$0\.[01]\d USDC/.test(doc.body.innerText)) {
    // The deck asked the faucet when it opened; let that drip land before asking
    // again, since the faucet allows only a few requests an hour per address.
    await waitFor(doc, () => !/\$0\.[01]\d USDC/.test(doc.body.innerText), 10_000);
    if (/\$0\.[01]\d USDC/.test(doc.body.innerText)) {
      press(doc, 'Get test funds');
      await waitFor(doc, () => !/\$0\.[01]\d USDC/.test(doc.body.innerText), 20_000);
    }
  }
  press(doc, 'Buy', 3);
  await sleep(1500);
  press(doc, 'Pay');
  await waitFor(doc, () => /In escrow|Settled|Released early/i.test(doc.body.innerText), 45_000);
  await sleep(3500);
  press(doc, 'Release now');
}

async function profileTour(doc: Document, win: Window) {
  await sleep(2500);
  win.scrollTo({ top: 620, behavior: 'smooth' });
  await sleep(4500);
  win.scrollTo({ top: 1100, behavior: 'smooth' });
}

function ProfileScene() {
  const { profiles } = useProfiles();
  const [who, setWho] = useState<string | null>(null);
  useEffect(() => {
    if (who) return;
    const best = profiles.find((p) => p.role === 'merchant' && p.eval.tier === 3) ?? profiles.find((p) => p.role === 'merchant');
    if (best) setWho(best.wallet);
  }, [profiles, who]);
  return who ? <Live route={`/agents/${who}`} run={profileTour} /> : null;
}

type Line = readonly [tag: '' | '$' | 'ok' | 'no' | 'dim', text: string];

/** Lines of real output, typed in one after another. */
function Terminal({ lines, step, size = 19, start = 0.5 }: { lines: readonly Line[]; step: number; size?: number; start?: number }) {
  const colour = (tag: Line[0]) => (tag === 'ok' ? mint : tag === 'no' ? '#ec835a' : tag === '$' ? white : tag === 'dim' ? '#6f6e62' : '#c9c6b6');
  return (
    <div style={{ marginTop: 24, borderRadius: 22, background: '#050605', border: '1px solid #272b21', padding: '24px 30px', flex: 1 }}>
      {lines.map(([tag, line], k) => (
        <motion.div key={k} className="mono" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: start + k * step }} style={{ fontSize: size, lineHeight: 1.7, color: colour(tag), whiteSpace: 'pre', overflow: 'hidden', marginTop: tag === '$' && k > 0 ? 10 : 0 }}>
          {tag === '$' ? '$ ' : '  '}
          {line}
        </motion.div>
      ))}
    </div>
  );
}

/** A real 402 from atlas on devnet, 28 October 2026 (curl -i, JSON shortened to its fields). */
const LIVE_402: readonly Line[] = [
  ['$', 'curl -i "localhost:4020/agents/atlas/x402/telemetry?buyer=Acy1…t7PW"'],
  ['no', 'HTTP/1.1 402 Payment Required'],
  ['dim', 'PAYMENT-REQUIRED: eyJ4NDAyVmVyc2lvbiI6MiwicmVzb3VyY2Ui…   (the body below, base64)'],
  ['', 'accepts[0]  exact             0.20 USDC  payTo DAwJTW9m…  feePayer: x402.org facilitator'],
  ['', 'accepts[1]  exact             0.20 USDC  payTo DAwJTW9m…  feePayer: payai.network facilitator'],
  ['ok', 'accepts[2]  tessera-paylater  0.20 USDC  payTo DAwJTW9m…  buyerLimit 9.297270 · fee 0.004 · 600 s · eligible'],
  ['', 'extensions.tessera  order DAwJTW9m… on tESs6b4J… · vault CWAamPv6… · hold 0 s (both Trusted)'],
  ['', '                    requestHash 7d4b23dd… · openTx 5WuVmnZV…'],
];

/** The settle transaction of the run on the slide before, read back from devnet (solana confirm -v, shortened). */
const CHAIN_LOG: readonly Line[] = [
  ['$', 'solana confirm -v 2mZxEzfu…MnzW8 --url devnet'],
  ['', 'Signature 0  DJ8sWBFJ…  the merchant server, fee payer'],
  ['', 'Signature 1  Acy1bCFC…  Nova, the buyer'],
  ['', "Signature 2  2hQkyW5y…  Quill, the order's merchant"],
  ['', 'Program LXNPYNYc… invoke [1]                  the pay-later program'],
  ['ok', '  Program log: Instruction: BuyNow'],
  ['', "  Program Tokenkeg… invoke [2]                pool vault 8.009 → 7.759, order vault 0 → 0.25 USDC"],
  ['', '  Program tESs6b4J… invoke [2]                the escrow'],
  ['ok', '    Program log: Instruction: ConfirmFunded'],
  ['', '  Program tESs6b4J… success'],
  ['', 'Program LXNPYNYc… consumed 112718 compute units, success'],
  ['ok', 'Status: Ok · Finalized'],
];

/** New in 2.0: the pay-later flow, and the two lines of `buy_now` that keep it inside the escrow. */
function PayLaterFlowScene() {
  const steps: [string, string][] = [
    ['1 · 402', "exact first, then the pay-later option with the buyer's limit"],
    ['2 · pay later', 'the buyer signs buy_now; the merchant checks, signs and sends it'],
    ['3 · deliver', 'the merchant delivers and commits its hash'],
    ['4 · hold', "as long as the two parties' tiers say"],
    ['5 · release', 'the escrow pays the merchant, minus its 1%'],
    ['6 · repay --all', 'price + 2% to the pool, every loan in one transaction'],
  ];
  const grey = '#5d5c52';
  return (
    <Frame pad={72}>
      <Kicker>New in 2.0 · pay later over x402 · programs/tessera-paylater</Kicker>
      <Big size={60} color={white}>One instruction pays the escrow <em>and confirms it.</em></Big>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginTop: 34 }}>
        {steps.map(([h, b], k) => (
          <Rise key={h} delay={0.4 + k * 0.14}>
            <div style={{ padding: '16px 18px', borderRadius: 16, border: `1px solid ${k === 1 ? mint : '#272b21'}`, background: k === 1 ? '#121a14' : '#10120e', height: '100%' }}>
              <div className="display" style={{ fontSize: 27, color: white }}>{h}</div>
              <div style={{ fontSize: 16, marginTop: 6, lineHeight: 1.35, color: '#c9c6b6' }}>{b}</div>
            </div>
          </Rise>
        ))}
      </div>
      <Rise delay={1.4} style={{ marginTop: 26 }}>
        <pre className="mono" style={{ fontSize: 17.5, lineHeight: 1.6, margin: 0, padding: '24px 30px', borderRadius: 22, background: '#10120e', border: '1px solid #272b21', color: '#c9c6b6' }}>
{`pub fn buy_now(ctx: Context<BuyNow>, loan_id: [u8; 32], amount: u64, request_hash: [u8; 32]) -> Result<()> {
    let order = read_order(&a.order)?;    `}<span style={{ color: grey }}>{"// the escrow's own order: owner, address and type checked"}</span>{`
    require_keys_eq!(order.buyer, a.buyer.key(), PayLaterError::NotTheBuyer);
    require!(order.amount == amount, PayLaterError::PriceMismatch);   `}<span style={{ color: grey }}>{'// the price the buyer signed for'}</span>{`
    require!(amount <= limit.saturating_sub(line.outstanding), PayLaterError::CreditLimitExceeded);
    `}<span style={{ color: mint }}>{'pay_from_pool(&a.pool, ..., a.order_vault.to_account_info(), amount)?;'}</span>{`   `}<span style={{ color: grey }}>{"// pool → the order's vault"}</span>{`
    `}<span style={{ color: mint }}>{'tessera::cpi::confirm_funded(...)?;'}</span>{`                                  `}<span style={{ color: grey }}>{'// the escrow marks it Funded'}</span>{`
    ...
}`}
        </pre>
      </Rise>
      <Source>The escrow program is unchanged: buy_now calls its permissionless confirm_funded by CPI, so the buyer can never cancel_unpaid the order for the pool's money.</Source>
    </Frame>
  );
}

/** A real run on devnet, on the new escrow (tESs6b4J…) and the pay-later build that names it, 28 October 2026 (UTC+8), copied from the terminal (long lines shortened with …). */
const PAYLATER_TERMINAL = [
  ['$', 'npm run buy -- --buyer nova --merchant quill --pay-later'],
  ['', '[nova] Quill/summary: 0.25 USDC into escrow Fi68yAxK, hold 10s (merchant Established, me Building, pair trusted)'],
  ['', '[nova] Quill/summary: on credit; limit 1.026626 USDC, owing 0.00; fee 0.005, due in 600s'],
  ['ok', 'settle tx  explorer.solana.com/tx/2mZxEzfu…MnzW8   # signed by the server, Nova and Quill; ConfirmFunded inside'],
  ['', 'loan       35R7bZzw…  owe 0.255 USDC (0.25 + 0.005 pool fee) by 07:22:32 UTC'],
  ['', 'hash check matches the hash committed on-chain'],
  ['ok', 'final      Released'],
  ['$', 'npm run tessera -- repay --all --keypair .keys/agents/nova.json --send'],
  ['', 'REPAY ALL  0.255 USDC in one transaction; each loan is closed and its rent comes back to you'],
  ['ok', 'confirmed: 4LUwpKcB…f4jQnY'],
  ['$', 'npm run tessera -- credit Acy1…t7PW'],
  ['', 'Established 527 · limit 2.865299 USDC · owes 0.00 USDC · record: 3 loans, 3 on time · limit boost +8.74%'],
  ['$', 'npm run buy -- --buyer charlie --merchant atlas --pay-later'],
  ['no', 'NOT BOUGHT not eligible for pay later: the buyer has no credit yet (New, score 40)'],
] as const;

function Live402Scene() {
  return (
    <Frame pad={84}>
      <Kicker>x402 · a real 402 from a merchant on devnet, 28 Oct 2026</Kicker>
      <Big size={54} color={white}>Three ways to pay one order. <em>All of them into escrow.</em></Big>
      <Terminal lines={LIVE_402} step={0.9} size={18} start={0.8} />
      <Source>payTo is the escrow order's own account, so even a plain exact transfer lands in its vault. The pay-later option carries this buyer's live limit, read from the chain when the 402 was made.</Source>
    </Frame>
  );
}

function ChainScene() {
  return (
    <Frame pad={84}>
      <Kicker>On chain · the purchase above, read back from devnet</Kicker>
      <Terminal lines={CHAIN_LOG} step={0.75} size={19} />
      <Source>explorer.solana.com/tx/2mZxEzfu5ReApNejhCz7GMEwkkBJc7rafjiG3LUiKPNGx1J3oFhxEty3xdLtFfdrJ8Aevauzoy4NX3xVGZJMnzW8?cluster=devnet</Source>
    </Frame>
  );
}

function PayLaterCommandsScene() {
  return (
    <Frame pad={84}>
      <Kicker>Pay later over x402 · a real run on devnet, on the new escrow tESs6b4J…, 28 Oct 2026</Kicker>
      <Terminal lines={PAYLATER_TERMINAL} step={1.1} size={18.5} />
      <div className="mono" style={{ fontSize: 14, color: '#5d5c52', marginTop: 12 }}>
        The limit follows the score: 1.026626 USDC in Nova's 402, as a Building buyer; 2.865299 after this repayment, at Established 527 with three loans repaid on time (boost +8.74%). Charlie, which disputes what it receives, is New. Times in UTC (28 Oct in UTC+8). Lines shortened with ….
      </div>
    </Frame>
  );
}

function FailedScene() {
  const cases: [string, string, boolean][] = [
    ['The 402 asks too much', "Above the buyer's ceiling, it signs nothing. It also reads the order from the chain and pays only its own, for that amount.", false],
    ['Paid, never delivered', "After the deadline anyone may refund: the buyer gets it all, and the merchant's score loses 10%. On devnet: mallory, three orders, three refunds.", false],
    ['A delivery is disputed', 'The arbiter checks what arrived against the hash committed on chain. On devnet: charlie disputed two valid deliveries; both were resolved for the merchant.', false],
    ['The facilitator fails', 'Refused at verify: HTTP 400, nothing sent. Left pending: the merchant watches the vault until it lands (delivered) or can no longer land (400, pay again).', true],
    ['A forged pay-later header', 'Checked before the merchant signs, and simulated before anything is sent: HTTP 400, nothing sent, and the buyer may pay another way.', true],
    ['A loan not repaid', "After the grace period anyone marks it in default; the server's keeper does, every 30 s. The line freezes, and the next 402 says so.", true],
  ];
  return (
    <Frame pad={84}>
      <Kicker>Failed payments · README, "Failed payments" · the refunds and disputes are on devnet</Kicker>
      <Big size={60} color={white}>No money left stuck: <em>it never moves, or it goes back.</em></Big>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 30 }}>
        {cases.map(([h, b, isNew], k) => (
          <Rise key={h} delay={0.4 + k * 0.14}>
            <div style={{ padding: '16px 22px', borderRadius: 18, border: `1px solid ${isNew ? mint : '#272b21'}`, background: isNew ? '#121a14' : '#10120e', height: '100%' }}>
              <div className="display" style={{ fontSize: 30, color: white }}>
                {h}
                {isNew && <span className="mono" style={{ fontSize: 14, color: mint, marginLeft: 10 }}>new</span>}
              </div>
              <div style={{ fontSize: 19, marginTop: 6, lineHeight: 1.35, color: '#c9c6b6' }}>{b}</div>
            </div>
          </Rise>
        ))}
      </div>
      <Rise delay={1.4} style={{ marginTop: 20 }}>
        <span className="mono" style={{ fontSize: 17 }}>
          Before a buyer even tries, the 402 says <span style={{ color: mint }}>eligible: false</span> with the reason. If the escrow refunds an order the pool paid for, the refund goes to the buyer and the loan stays owed.
        </span>
      </Rise>
      <Source>Each case with the file and line that handles it: README, "Failed payments".</Source>
    </Frame>
  );
}

export const DEMO: Slide[] = [
  {
    id: 'title',
    seconds: 4,
    say: 'Tessera: agents pay each other over x402 into an escrow on Solana, and with 2.0 they can buy now, pay later.',
    render: () => (
      <Frame center>
        <Logo size={84} invert />
        <Big size={110} delay={0.3} color={white}>How Tessera works</Big>
        <Body delay={0.8} size={32} max="40ch">Two Solana programs, two open protocols, and a website that reads the chain directly.</Body>
        <Rise delay={1.2} style={{ marginTop: 40 }}>
          <span className="mono" style={{ fontSize: 22, color: mint }}>2.0 · pay later over x402, into the escrow · live on devnet</span>
        </Rise>
      </Frame>
    ),
  },
  {
    id: 'trick',
    seconds: 14,
    say: 'The x402 exact scheme on Solana allows only a plain token transfer. So the merchant quotes the escrow order’s account as pay-to: the money lands in its vault, and the program trusts that balance, not anyone’s word.',
    render: () => (
      <Frame pad={84}>
        <Kicker>The one design decision everything rests on</Kicker>
        <Big size={70} max="22ch" color={white}>The program trusts a balance, <em>not a message.</em></Big>
        <Rise delay={0.6} style={{ marginTop: 40 }}>
          <pre className="mono" style={{ fontSize: 24, lineHeight: 1.65, margin: 0, padding: '30px 36px', borderRadius: 22, background: '#10120e', border: '1px solid #272b21', color: '#c9c6b6' }}>
<span style={{ color: '#5d5c52' }}>{'/// Permissionless on purpose: the only input it trusts is the vault balance.'}</span>{`
pub fn confirm_funded(ctx: Context<ConfirmFunded>) -> Result<()> {
    let vault_balance = ctx.accounts.vault.amount;
    let order = &mut ctx.accounts.order;
    require!(order.state == OrderState::AwaitingPayment, TesseraError::InvalidState);
    `}<span style={{ color: mint }}>{'require!(vault_balance >= order.amount, TesseraError::VaultUnderfunded);'}</span>{`
    order.state = OrderState::Funded;
    ...
}`}
          </pre>
        </Rise>
        <Body delay={1.0} size={27} max="60ch">
          A facilitator can refuse a payment but cannot redirect one: the buyer's signature fixes recipient, amount and mint. A dishonest merchant server cannot either: the buyer re-derives the escrow address and reads the order from the chain before signing, and on credit the buy_now it signs carries the price too.
        </Body>
        <Source>programs/tessera/src/lib.rs. A July 2026 study found rule violations in all 15 x402 facilitators it tested (arXiv 2607.19545), which is why nothing here trusts one.</Source>
      </Frame>
    ),
  },
  {
    id: 'live402',
    seconds: 13,
    say: 'Here is a real 402 from a merchant on devnet. One order, three ways to pay it: exact, through either of two facilitators, or tessera-paylater, with this buyer’s credit limit and fee. Every option pays into the escrow.',
    render: () => <Live402Scene />,
  },
  {
    id: 'paylater',
    seconds: 15,
    say: "New in 2.0, pay later. The buyer signs one buy_now at the quoted price, and the merchant checks it, signs it too and sends it. In that one instruction the pool pays the order's vault and the escrow confirms it. The buyer repays the pool later.",
    render: () => <PayLaterFlowScene />,
  },
  {
    id: 'paylater-commands',
    seconds: 18,
    say: 'A real run on devnet. Nova buys a summary on credit, in one transaction signed by Nova and by Quill, the merchant. The summary arrives, its hash matches, and the money is released. Nova repays, and its limit goes up. Charlie, a new wallet, is refused and signs nothing.',
    render: () => <PayLaterCommandsScene />,
  },
  {
    id: 'chain',
    seconds: 11,
    say: 'And that transaction, read back from devnet: three signers, the pay-later program’s buy now, the pool’s transfer, and inside it, the escrow’s confirm funded.',
    render: () => <ChainScene />,
  },
  {
    id: 'failed',
    seconds: 18,
    say: 'When a payment fails, no money is stuck. A refused payment was never sent. A settlement left pending is watched until it lands or cannot. On devnet, a merchant that never delivered was refunded, and disputed deliveries were judged against their hash. An unpaid loan freezes the buyer’s line.',
    render: () => <FailedScene />,
  },
  {
    id: 'checkout',
    seconds: 48,
    surface: 'paper',
    say: 'A person can buy from the same agents on the website, with a built-in devnet test wallet. The merchant opens the escrow, and the browser checks it on-chain before paying into its vault. The merchant delivers and commits a hash, and the browser checks what arrived against it. This buyer is new, so the money is held until it confirms receipt.',
    render: () => (
      <>
        <Live route="/market" run={buyTour} />
        <Caption side>A real purchase on devnet, performed by this slide: escrow opened, verified in the browser, paid, delivered, hash checked.</Caption>
      </>
    ),
  },
  {
    id: 'profile',
    seconds: 9,
    surface: 'paper',
    say: 'Every wallet has a credit file anyone can read: the score, what it is made of, and every review with the weight it carried.',
    render: () => (
      <>
        <ProfileScene />
        <Caption>A merchant's credit file. Score, evidence, instant limit and every review with its weight are fields of public accounts.</Caption>
      </>
    ),
  },
  {
    id: 'stack',
    seconds: 11,
    say: 'Anchor, Solana Kit, x402 and A2A, with an API, an MCP server and a CLI for agents. Devnet only, and unaudited.',
    render: () => (
      <Frame pad={84}>
        <Kicker>Stack, and what is not done</Kicker>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 44, marginTop: 34 }}>
          <div>
            {[
              ['Programs', 'Anchor 1.1.2 · escrow (479 KB) + pay-later · devnet'],
              ['Clients', '@solana/kit 8 · Codama-generated'],
              ['Payments', 'x402 v2 exact, two facilitators · tessera-paylater, settled by the merchant'],
              ['Agents', 'A2A JSON-RPC · a2a-x402 extension v0.2'],
              ['Identity', 'Solana Agent Registry (ERC-8004) · reviews mirrored'],
              ['For agents', 'HTTP API · MCP · skill · CLI · find_merchants ranks sellers'],
              ['Website', 'React · Motion · reads the chain directly'],
            ].map(([k, v], i) => (
              <Rise key={k} delay={0.3 + i * 0.12}>
                <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', padding: '13px 0', borderTop: '1px solid #272b21', fontSize: 25 }}>
                  <span style={{ color: white }}>{k}</span>
                  <span className="mono" style={{ fontSize: 20 }}>{v}</span>
                </div>
              </Rise>
            ))}
          </div>
          <div>
            {[
              'Devnet only, with test USDC; the demo traffic is our own agents',
              'Time is compressed: a period is a minute, a loan term 600 s',
              "Single keys: the upgrade authorities, the arbiter and the pool's authority",
              'The version 1 escrow, TessSeP5…, lost its keys and is retired; its accounts stay on devnet as history',
              'An escrow refund goes to the buyer; the loan stays owed',
              'Unaudited; the A2A endpoint is hand-rolled, not yet run against the official test kit',
            ].map((t, i) => (
              <Rise key={t} delay={0.5 + i * 0.12}>
                <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr', padding: '12px 0', borderTop: '1px solid #272b21', fontSize: 22, lineHeight: 1.35 }}>
                  <span style={{ color: '#ec835a' }}>○</span>
                  <span>{t}</span>
                </div>
              </Rise>
            ))}
          </div>
        </div>
        <Rise delay={1.4} style={{ marginTop: 40, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Logo size={36} invert />
          <span className="mono" style={{ fontSize: 22 }}>github.com/edison9733/x402_bnpl</span>
        </Rise>
      </Frame>
    ),
  },
];

/**
 * Fund the built-in test wallet from the demo faucet as soon as the deck
 * opens, so the purchase slide can spend its time on the purchase.
 */
function usePrefund() {
  useEffect(() => {
    void (async () => {
      try {
        const burner = await loadBurner();
        let funded = false;
        try {
          const token = await fetchMaybeToken(readRpc, await findAta(burner.address, USDC_DEVNET));
          funded = token.exists && token.data.amount >= 150_000n;
        } catch {
          // A rate-limited read says nothing about the balance; ask anyway; the faucet drips once per wallet.
        }
        if (funded) return;
        await fetch(`${AGENTS_URL}/api/faucet`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: burner.address }) });
      } catch {
        // the purchase slide asks for funds itself if this did not work
      }
    })();
  }, []);
}

export function DemoDeck() {
  usePrefund();
  return <Deck slides={DEMO} title="Tessera technical demo" />;
}
