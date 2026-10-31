/**
 * A local world to try an agent asking its owner to pay, by hand and with no
 * devnet: a validator running the real escrow program, the real merchant
 * server (`npm run agents`) pointed at it with throwaway keys, and an owner
 * wallet holding test USDC. It prints the owner's key for the website's test
 * wallet and the commands to run, and stays up until Ctrl-C.
 *
 *   npm run build:program && npm run approve:local
 *
 * Then, in other terminals, the website reading this validator, and the agent:
 *
 *   VITE_RPC_URLS=http://127.0.0.1:18990 npx vite apps/web --port 5174 --strictPort
 *   npm run tessera -- ask http://localhost:4021/agents/pixel identicon --owner <owner> --input '{"seed":"my-agent"}' --rpc http://127.0.0.1:18990 --site http://localhost:5174 --wait
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { lamports, type Address } from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import { getInitializeMint2Instruction, getMintSize, getMintToInstruction, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { getInitializeInstructionAsync, paylater, programDataAddress, TESSERA_PROGRAM_ADDRESS, toHex, type Params } from '@tessera/sdk';
import { ADVERSARIES, keyPath, MERCHANTS } from './cast.js';
import { clientForSigner, generateKeypairBytes, log, REPO_ROOT, sleep, tokenHelpers, type Cluster } from './lib.js';

const RPC_PORT = Number(process.env.APPROVE_RPC_PORT ?? 18990);
const AGENTS_PORT = Number(process.env.APPROVE_AGENTS_PORT ?? 4021);
const SITE = process.env.APPROVE_SITE ?? 'http://localhost:5174';
const LOCAL: Cluster = { rpcUrl: `http://127.0.0.1:${RPC_PORT}`, fallbackUrls: [`http://127.0.0.1:${RPC_PORT}`] };
const AGENTS = `http://localhost:${AGENTS_PORT}`;
const USDC = 1_000_000n;

// Devnet's rules, with time to do each step by hand: ten minutes to pay and
// to deliver, and a minute's hold for a New buyer so a dispute can be tried.
const PARAMS: Params = {
  periodSecs: 60,
  holdSecs: [60, 45, 10, 0],
  tierScore: [250, 500, 750],
  tierPeriods: [2, 8, 20],
  creditFull: 5n * USDC,
  pairCap: USDC,
  tenureFull: 30,
  diversityFull: 500,
  reviewPrior: USDC / 2n,
  minOrder: 1_000n,
  deliverSecs: 600,
  unpaidSecs: 600,
  reviewSecs: 600,
  complaintSecs: 1800,
  instantBase: USDC / 4n,
  instantFeePct: 100,
  pairHistoryMin: 2,
  pairAgeSecs: 300,
  penaltyDisputeBps: 2500,
  penaltyExpiredBps: 1000,
  penaltyDecayBps: 25,
};

const so = (name: string) => {
  const p = resolve(REPO_ROOT, `target/deploy/${name}.so`);
  if (!existsSync(p)) throw new Error(`target/deploy/${name}.so is missing: run \`npm run build:program\` first`);
  return p;
};

async function startValidator(upgradeAuthority: Address, ledger: string): Promise<ChildProcess> {
  const proc = spawn(
    'solana-test-validator',
    [
      '--reset',
      '--quiet',
      '--ledger', ledger,
      '--rpc-port', String(RPC_PORT),
      '--faucet-port', String(RPC_PORT + 1001),
      // Ports of its own, so it runs beside another local validator (paylater:local takes the defaults).
      '--gossip-port', String(RPC_PORT + 2000),
      '--dynamic-port-range', `${RPC_PORT + 2001}-${RPC_PORT + 2100}`,
      '--upgradeable-program', TESSERA_PROGRAM_ADDRESS, so('tessera'), upgradeAuthority,
      '--upgradeable-program', paylater.TESSERA_PAYLATER_PROGRAM_ADDRESS, so('tessera_paylater'), upgradeAuthority,
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(LOCAL.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }) });
      if (((await res.json()) as { result?: string }).result === 'ok') return proc;
    } catch {
      // not listening yet
    }
    await sleep(500);
  }
  proc.kill('SIGKILL');
  throw new Error('local validator did not become healthy');
}

// ----------------------------------------------------------------------- main

const ledger = mkdtempSync(join(tmpdir(), 'tessera-approve-ledger-'));
const keysRoot = mkdtempSync(join(tmpdir(), 'tessera-approve-keys-'));
const dataDir = mkdtempSync(join(tmpdir(), 'tessera-approve-data-'));
const children: ChildProcess[] = [];
const cleanUp = () => {
  for (const c of children) c.kill('SIGTERM');
  for (const d of [ledger, keysRoot, dataDir]) rmSync(d, { recursive: true, force: true });
};
process.on('SIGINT', () => {
  cleanUp();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanUp();
  process.exit(0);
});

/** A new wallet, its key written where the merchant server looks for it when `file` is given. */
async function wallet(file?: string) {
  const { signer, bytes } = await generateKeypairBytes();
  if (file) {
    mkdirSync(join(keysRoot, file, '..'), { recursive: true });
    writeFileSync(join(keysRoot, file), JSON.stringify(Array.from(bytes)), { mode: 0o600 });
  }
  return { client: clientForSigner(signer, LOCAL), seed: bytes.slice(0, 32) };
}

try {
  const deployer = await wallet();
  children.push(await startValidator(deployer.client.identity.address, ledger));
  log.step(`Local validator on ${LOCAL.rpcUrl}`);

  const ops = await wallet('.keys/server.json');
  const arbiter = await wallet('.keys/arbiter.json');
  const treasury = await wallet();
  const merchants = await Promise.all([...MERCHANTS, ...ADVERSARIES.filter((a) => a.role === 'merchant')].map((m) => wallet(keyPath(m.id))));
  const owner = await wallet();
  const everyone = [deployer, ops, arbiter, treasury, ...merchants, owner];
  const rpc = ops.client.rpc;
  for (const w of everyone) await rpc.requestAirdrop(w.client.identity.address, lamports(10_000_000_000n)).send();
  for (let i = 0; i < 60; i += 1) {
    if ((await rpc.getBalance(owner.client.identity.address).send()).value > 0n) break;
    await sleep(250);
  }

  // A test mint standing in for USDC, and the escrow's config naming it.
  const mintSigner = (await generateKeypairBytes()).signer;
  const space = BigInt(getMintSize());
  await ops.client.sendTransaction([
    getCreateAccountInstruction({ payer: ops.client.identity, newAccount: mintSigner, lamports: await rpc.getMinimumBalanceForRentExemption(space).send(), space, programAddress: TOKEN_PROGRAM_ADDRESS }),
    getInitializeMint2Instruction({ mint: mintSigner.address, decimals: 6, mintAuthority: ops.client.identity.address, freezeAuthority: null }),
  ]);
  const tok = tokenHelpers(ops.client, mintSigner.address);
  await ops.client.sendTransaction([await tok.ensureAtaIx(owner.client.identity.address)]);
  await ops.client.sendTransaction([getMintToInstruction({ mint: mintSigner.address, token: await tok.ata(owner.client.identity.address), mintAuthority: ops.client.identity, amount: 10n * USDC })]);
  await deployer.client.sendTransaction([
    await getInitializeInstructionAsync({
      authority: deployer.client.identity,
      mint: mintSigner.address,
      arbiter: arbiter.client.identity.address,
      treasury: treasury.client.identity.address,
      programData: await programDataAddress(),
      feeBps: 100,
      params: PARAMS,
    }),
  ]);
  log.ok('escrow config, test mint, and an owner wallet holding 10 test USDC');

  // The real merchant server, on this validator, with the keys just made.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SOLANA_RPC_URL: LOCAL.rpcUrl,
    SOLANA_RPC_FALLBACKS: LOCAL.rpcUrl,
    // No facilitator here: payments go straight into escrow. A refused port fails at once.
    FACILITATOR_URLS: 'http://127.0.0.1:9',
    PORT: String(AGENTS_PORT),
    AGENT_HOST: AGENTS,
    TESSERA_KEYS_DIR: keysRoot,
    TESSERA_DATA_DIR: dataDir,
    WEB_ORIGINS: SITE,
    // A local validator has no rate limit to stay under.
    RPC_BUDGET_PER_10S: '1000',
  };
  delete env.TESSERA_KEYS;
  children.push(spawn(resolve(REPO_ROOT, 'node_modules/.bin/tsx'), ['src/server.ts'], { cwd: resolve(REPO_ROOT, 'apps/agents'), env, stdio: 'inherit' }));
  for (let i = 0; ; i += 1) {
    const ok = await fetch(`${AGENTS}/health`)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) break;
    if (i > 120) throw new Error('the merchant server did not start');
    await sleep(500);
  }
  log.ok(`merchant server on ${AGENTS}`);

  const who = owner.client.identity.address;
  console.log(`
The owner: ${who}
  In the website's test wallet (browser console on ${SITE}), so the page can pay as the owner:
    localStorage.setItem('tessera.devnet.burner', '${toHex(owner.seed)}')

The website, reading this validator:
  VITE_RPC_URLS=${LOCAL.rpcUrl} VITE_AGENTS_URL=${AGENTS} npx vite apps/web --port ${new URL(SITE).port} --strictPort

The agent, with no key:
  npm run tessera -- ask ${AGENTS}/agents/pixel identicon --owner ${who} --input '{"seed":"my-agent"}' --rpc ${LOCAL.rpcUrl} --site ${SITE} --wait

Ctrl-C stops the validator and the server and deletes their files.`);
  await new Promise(() => undefined);
} catch (e) {
  cleanUp();
  throw e;
}
