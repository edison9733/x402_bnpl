/**
 * One purchase, start to finish, by one buyer agent.
 *
 *   npm run buy -w @tessera/agents -- --buyer scout --merchant atlas --skill telemetry --mode x402
 *   npm run buy -w @tessera/agents -- --buyer scout --merchant atlas --pay-later     the pool pays; scout owes it the price plus the fee
 */
import { fromUnits } from '@tessera/sdk';
import { agentCardUrl, keyPath } from '../../../scripts/cast.js';
import { clientForSigner, explorerAddress, explorerTx, loadKeypair, localRpcProxy } from '../../../scripts/lib.js';
import { BuyerAgent, type PayMode } from './buyer.js';
import { SERVICES } from './services.js';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};

const buyerId = arg('buyer', 'scout');
const merchant = arg('merchant', 'atlas');
const skill = arg('skill', SERVICES[merchant]?.[0]?.sku ?? 'telemetry');
const mode = (process.argv.includes('--pay-later') ? 'pay-later' : arg('mode', 'x402')) as PayMode;
const input = JSON.parse(arg('input', '{}'));

const X402_RPC = process.env.X402_RPC_URL ?? (await localRpcProxy());

const buyer = new BuyerAgent(buyerId, clientForSigner(await loadKeypair(keyPath(buyerId))), {
  // The x402 client makes its own RPC calls; send them through the same budgeted pool.
  rpcUrl: X402_RPC,
  mode,
  sponsor: clientForSigner(await loadKeypair('.keys/server.json')),
  log: console.log,
});

// A refusal before anything is signed (not eligible for credit, a price above
// the ceiling, an order that does not check out) is an answer, not a crash.
const p = await buyer.buy(agentCardUrl(merchant), skill, input).catch((e: unknown) => {
  console.log(`\nNOT BOUGHT ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
console.log(`\norder      ${explorerAddress(p.order)}`);
const via = { x402: 'x402 facilitator (buyer paid no SOL)', direct: 'a direct transfer', 'pay-later': 'the pay-later pool (the buyer paid only the rent of its loan account, in SOL)' }[p.mode];
console.log(`amount     ${fromUnits(BigInt(p.terms.amount))} USDC, paid via ${via}`);
for (const r of p.receipts) console.log(`settle tx  ${explorerTx(r.transaction)}`);
if (p.loan) console.log(`loan       ${explorerAddress(p.loan.address)}\n           owe ${fromUnits(p.loan.owed)} USDC (${fromUnits(p.loan.amount)} + ${fromUnits(p.loan.fee)} pool fee) by ${new Date(p.loan.dueAt * 1000).toISOString()}; repay with: npm run tessera -- repay --all --keypair ${keyPath(buyerId)} --send`);
if (p.failed) console.log(`FAILED     ${p.failed}`);
else {
  console.log(`delivered  ${JSON.stringify(p.deliverable).slice(0, 160)}`);
  console.log(`hash check ${p.verified ? 'matches the hash committed on-chain' : 'DOES NOT MATCH'}`);
  console.log(`settlement ${p.instant ? 'instant' : `held until ${new Date(p.releaseAt * 1000).toISOString()} (${p.terms.holdSecs}s)`}`);
}
console.log(`timings ms ${JSON.stringify(p.timings)}`);
console.log(`\nwaiting for settlement, then leaving a review...`);
console.log(`final      ${await buyer.followUp(p)}`);
process.exit(0);
