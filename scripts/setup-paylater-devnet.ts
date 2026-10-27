/**
 * The pay-later pool on devnet. Safe to run again: every step checks the chain first.
 *
 *   1. checks the pay-later program is deployed and reads its upgrade authority;
 *   2. creates the pool with `paylater.DEVNET_LINE_PARAMS` if there is none
 *      (signed by that authority), or reports the rules the pool has;
 *   3. tops the pool's vault up to `--usdc` devnet USDC (default 8) from the deployer;
 *   4. writes the `payLater` block of deployments/devnet.json.
 *
 *   npm run setup:paylater
 *   npm run setup:paylater -- --usdc 20
 *
 * The deployer is DEPLOYER_KEYPAIR, or ~/.config/solana/id.json. Deploy the
 * program first (README, "Pay later: build, local run, devnet").
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchEncodedAccount, getAddressDecoder } from '@solana/kit';
import { fromUnits, paylater, programDataAddress, toUnits, USDC_DEVNET } from '@tessera/sdk';
import { clientForSigner, explorerAddress, explorerTx, loadKeypair, log, REPO_ROOT, sigOf, tokenHelpers } from './lib.js';

const { values: flags } = parseArgs({ options: { usdc: { type: 'string', default: '8' } } });
const target = toUnits(flags.usdc);
const show = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x));

const deployer = clientForSigner(await loadKeypair(process.env.DEPLOYER_KEYPAIR ?? '~/.config/solana/id.json'));
const rpc = deployer.rpc;
const PROGRAM = paylater.TESSERA_PAYLATER_PROGRAM_ADDRESS;

log.step('Program');
const program = await fetchEncodedAccount(rpc, PROGRAM);
if (!program.exists) {
  throw new Error(
    `Program ${PROGRAM} is not on devnet. Deploy it first:\n` +
      '  solana program deploy target/deploy/tessera_paylater.so --program-id target/deploy/tessera_paylater-keypair.json --max-len 420000 -u devnet',
  );
}
// ProgramData: a u32 tag (3), the u64 slot of the last deploy, then an
// optional upgrade authority (one byte, then 32 if present).
const programData = await fetchEncodedAccount(rpc, await programDataAddress(PROGRAM));
if (!programData.exists) throw new Error(`${PROGRAM} has no program data account: is it an upgradeable program?`);
const head = new DataView(programData.data.buffer, programData.data.byteOffset, 45);
const deploySlot = head.getBigUint64(4, true);
const upgradeAuthority = programData.data[12] === 1 ? getAddressDecoder().decode(programData.data.slice(13, 45)) : null;
const deployTime = await rpc.getBlockTime(deploySlot).send();
log.ok(`${PROGRAM} is deployed (last deployed in slot ${deploySlot}${deployTime ? `, ${new Date(Number(deployTime) * 1000).toISOString()}` : ''})`);
log.info(`upgrade authority ${upgradeAuthority ?? 'none (immutable)'}`);

log.step('Pool');
const pool = await paylater.poolPda();
const vault = await paylater.poolVault(USDC_DEVNET);
let existing = await paylater.fetchMaybePool(rpc, pool);
if (!existing.exists) {
  if (upgradeAuthority !== deployer.identity.address) {
    throw new Error(`the pool must be created by the program's upgrade authority ${upgradeAuthority}; the deployer is ${deployer.identity.address}`);
  }
  const sent = await deployer.sendTransaction([
    await paylater.getInitializeInstructionAsync({
      authority: deployer.identity,
      mint: USDC_DEVNET,
      programData: await programDataAddress(PROGRAM),
      params: paylater.DEVNET_LINE_PARAMS,
    }),
  ]);
  log.ok(`created ${pool} with the devnet rules: ${explorerTx(sigOf(sent))}`);
  existing = await paylater.fetchMaybePool(rpc, pool);
  if (!existing.exists) throw new Error(`${pool} is not readable after it was created`);
} else if (show(existing.data.params) === show(paylater.DEVNET_LINE_PARAMS)) {
  log.ok(`${pool} exists with the devnet rules`);
} else {
  // Rules are the pool authority's to change (`update_params`); a setup script
  // does not change them behind the back of loans already open.
  log.warn(`${pool} exists with other rules, left as they are: ${show(existing.data.params)}`);
}
const p = existing.data;
if (p.mint !== USDC_DEVNET) throw new Error(`${pool} lends ${p.mint}, not devnet USDC ${USDC_DEVNET}`);
log.info(`authority ${p.authority}; term ${p.params.termSecs} s, grace ${p.params.graceSecs} s, fee ${p.params.feeBps} bps`);
log.info(`lent ${fromUnits(p.lent)}, repaid ${fromUnits(p.repaid)}, outstanding ${fromUnits(p.outstanding)} USDC over ${p.loansOpened} loans`);

log.step('Liquidity');
const tok = tokenHelpers(deployer, USDC_DEVNET);
const have = await tok.balance(pool);
if (have >= target) {
  log.ok(`vault ${vault} holds ${fromUnits(have)} USDC (target ${fromUnits(target)})`);
} else {
  const need = target - have;
  const own = await tok.balance(deployer.identity.address);
  if (own < need) {
    throw new Error(
      `the vault needs ${fromUnits(need)} USDC to reach ${fromUnits(target)} and the deployer holds ${fromUnits(own)}: ` +
        'get devnet USDC from https://faucet.circle.com',
    );
  }
  const sent = await deployer.sendTransaction([
    await paylater.getDepositInstructionAsync({
      mint: USDC_DEVNET,
      funder: deployer.identity,
      funderToken: await tok.ata(deployer.identity.address),
      amount: need,
    }),
  ]);
  log.ok(`deposited ${fromUnits(need)} USDC; the vault holds ${fromUnits(await tok.balance(pool))}: ${explorerTx(sigOf(sent))}`);
}
log.info(`deployer keeps ${fromUnits(await tok.balance(deployer.identity.address))} USDC`);

// The rest of deployments/devnet.json is written by `npm run setup:devnet`;
// this keeps it and replaces only the pay-later block.
const file = resolve(REPO_ROOT, 'deployments/devnet.json');
const deployment = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : { cluster: 'devnet' };
const before = deployment.payLater as
  | { program?: string; deployedAt?: string; lastDeploy?: { slot?: string; build?: string; tx?: string } }
  | undefined;
const deployedAt =
  before?.program === PROGRAM && before.deployedAt
    ? before.deployedAt
    : deployTime
      ? new Date(Number(deployTime) * 1000).toISOString().slice(0, 10)
      : undefined;
// The last deploy as the chain records it. `build` (the commit) and `tx` are
// written by hand after an upgrade; they are kept while the slot is the same.
const sameDeploy = before?.program === PROGRAM && before.lastDeploy?.slot === String(deploySlot);
const lastDeploy = {
  slot: deploySlot,
  time: deployTime ? new Date(Number(deployTime) * 1000).toISOString() : undefined,
  ...(sameDeploy && before?.lastDeploy?.build ? { build: before.lastDeploy.build } : {}),
  ...(sameDeploy && before?.lastDeploy?.tx ? { tx: before.lastDeploy.tx } : {}),
};
deployment.payLater = JSON.parse(
  show({ program: PROGRAM, authority: upgradeAuthority, pool, vault, deployedAt, lastDeploy, params: (await paylater.fetchPool(rpc, pool)).data.params }),
);
writeFileSync(file, JSON.stringify(deployment, null, 2) + '\n');

log.step('Done');
log.info(`program  ${explorerAddress(PROGRAM)}`);
log.info(`pool     ${explorerAddress(pool)}`);
log.info(`vault    ${explorerAddress(vault)}`);
log.info('wrote the payLater block of deployments/devnet.json (public addresses only)');
