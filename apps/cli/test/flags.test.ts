/**
 * The command line itself, run as a user runs it. A mistake there exits 2
 * with one line and no stack trace, before anything is read from the chain
 * or the API. A failure exits 1. Also the find list's counts and words, and
 * a rate-limited RPC said in plain words. Nothing here reaches a network:
 * the RPC and the API point at a closed local port, or at a stub in this
 * process.
 *
 *   npm run test:cli
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR, SolanaError } from '@solana/kit';
import { scrub } from '../src/paylater.js';
import { rateLimited, rateLimitMessage } from '../src/tab.js';

const TSX = createRequire(import.meta.url).resolve('tsx/cli');
const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
/** Nothing listens here: a read that slips in before the checks fails at once, on this machine. */
const CLOSED = 'http://127.0.0.1:9';
const NOVA = 'Acy1bCFCSBt8Bhv3vHBExWAoEnp2F6Wi96Mi5CqWt7PW';

type Run = { status: number | null; stdout: string; stderr: string };

function tessera(args: string[], env: Record<string, string> = {}): Promise<Run> {
  return new Promise((done) => {
    const p = spawn(process.execPath, [TSX, CLI, ...args], {
      env: { ...process.env, TESSERA_RPC_URLS: CLOSED, TESSERA_API_URL: CLOSED, NO_COLOR: '1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d: Buffer) => (stdout += d));
    p.stderr.on('data', (d: Buffer) => (stderr += d));
    p.on('close', (status) => done({ status, stdout, stderr }));
  });
}

/** Runs each command line, a few at a time. */
async function each(lines: string[][], env: Record<string, string> = {}): Promise<Run[]> {
  const runs: Run[] = [];
  for (let i = 0; i < lines.length; i += 6) runs.push(...(await Promise.all(lines.slice(i, i + 6).map((args) => tessera(args, env)))));
  return runs;
}

/** A server on this machine for one test, closed when the test ends. */
async function stub(handle: (req: IncomingMessage, res: ServerResponse) => void): Promise<{ url: string; close: () => void }> {
  const server = createServer(handle);
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

const oneLine = (r: Run) => r.stderr.trimEnd().split('\n').length === 1 && !/node:internal|\n\s+at |ERR_PARSE_ARGS/.test(r.stderr);

test('a mistake on the command line exits 2 with one line and no stack trace, before any read', async () => {
  const cases: [string[], RegExp][] = [
    [['--version'], /^tessera: unknown option --version \(see: tessera help\)$/],
    [['score', '--star', '4'], /^tessera: unknown option --star /],
    [['score', '--simulate', '--stars', '-1'], /^tessera: --stars needs a value \(for one that starts with a dash, write --stars=VALUE\)$/],
    [['score', '--stars'], /^tessera: --stars needs a value \(see: tessera help\)$/],
    [['merchants', '--category'], /^tessera: --category needs a value \(see: tessera help\)$/],
    [['score', '--json=yes'], /^tessera: --json takes no value$/],
    [['nope'], /^tessera: unknown command "nope"/],
    [['check'], /^tessera: <merchant> is required/],
    [['check', NOVA], /^tessera: <amount> is required/],
    [['escrow'], /^tessera: <order> is required/],
    [['find', '--limit', 'abc'], /^tessera: --limit must be an integer$/],
    [['check', NOVA, '0.2', '--min-hold', 'abc'], /^tessera: --min-hold must be an integer$/],
    [['credit'], /^tessera: <wallet> is required/],
    [['credit', 'notanaddress'], /^tessera: <wallet> is not a Solana address: notanaddress$/],
    [['tab', 'notanaddress'], /^tessera: <wallet> is not a Solana address: notanaddress$/],
    [['merchants', '--sort', 'price'], /^tessera: --sort must be score or name/],
    [['score', '--simulate', '--rpc', 'notaurl'], /^tessera: --rpc is not a URL: notaurl$/],
    [['find', 'text', '--api', 'http://example.com'], /^tessera: --api must be https:\/\//],
  ];
  const runs = await each(cases.map(([args]) => args));
  cases.forEach(([args, said], k) => {
    const r = runs[k]!;
    const where = `tessera ${args.join(' ')}\n${r.stderr}${r.stdout}`;
    assert.equal(r.status, 2, where);
    assert.equal(r.stdout, '', where);
    assert.match(r.stderr.trimEnd(), said, where);
    assert.ok(oneLine(r), where);
  });
});

test('a failure exits 1: an RPC that does not answer, an API URL from the environment', async () => {
  const [credit, find] = await each([['credit', NOVA], ['find', 'text']], { TESSERA_API_URL: 'http://example.com' });
  assert.equal(credit!.status, 1, credit!.stderr);
  assert.match(credit!.stderr, /^tessera: credit failed: .* \(RPC 127\.0\.0\.1:9\)\n$/);
  assert.equal(find!.status, 1, find!.stderr);
  assert.match(find!.stderr, /^tessera: TESSERA_API_URL must be https:\/\//);
});

test('a bad TESSERA_API_URL stops only the commands that call the API', async () => {
  const [help, simulate] = await each([['help'], ['score', '--simulate']], { TESSERA_API_URL: 'http://example.com' });
  assert.equal(help!.status, 0, help!.stderr);
  assert.match(help!.stdout, /^tessera: credit checks/);
  assert.equal(simulate!.status, 0, simulate!.stderr);
  assert.match(simulate!.stdout, /^simulated · /);
});

test('find says how many it shows of how many, and counts one review, one sale, one dispute', async () => {
  // The need's first word sets how many merchants match; --limit sets how many come back, as the API does.
  const api = await stub((req, res) => {
    const q = new URL(req.url ?? '/', 'http://x').searchParams;
    const count = { five: 5, seven: 7, many: 25 }[String(q.get('need'))] ?? 0;
    const shown = Math.min(count, Number(q.get('limit') ?? 5));
    const ranked = Array.from({ length: shown }, (_, k) => ({
      rank: k + 1,
      merchant: `${k + 1}`.repeat(44).slice(0, 44),
      name: `shop ${k + 1}`,
      tier: 'Trusted',
      score: 990 - k,
      stars: 4.5,
      reviews: k === 0 ? 1 : 2,
      sales: k === 0 ? 1 : 3,
      disputesLost: k === 0 ? 1 : 0,
      missedDeliveries: 0,
      decision: 'instant',
      expectedSecs: 12,
      service: null,
      topReviews: [],
    }));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', need: q.get('need'), sort: 'best', count, ranked, basis: 'Score.', next: 'Pick one.' }));
  });
  try {
    const [seven, five, many, top] = await each([
      ['find', 'seven', '--api', api.url],
      ['find', 'five', '--api', api.url],
      ['find', 'many', '--api', api.url],
      ['find', 'many', '--limit', '20', '--api', api.url],
    ]);
    for (const r of [seven, five, many, top]) assert.equal(r!.status, 0, r!.stderr);
    const out = seven!.stdout.split('\n');
    assert.ok(out.some((l) => l.endsWith('Trusted 990 ★4.50 (1 review, 1 sale, 1 dispute lost)')), seven!.stdout);
    assert.ok(out.some((l) => l.endsWith('Trusted 989 ★4.50 (2 reviews, 3 sales)')), seven!.stdout);
    assert.ok(out.includes('showing 5 of 7 · --limit 20 for all'), seven!.stdout);
    assert.doesNotMatch(five!.stdout, /showing/);
    assert.ok(many!.stdout.split('\n').includes('showing 5 of 25 · --limit 20 for the top 20'), many!.stdout);
    assert.ok(top!.stdout.split('\n').includes('showing the top 20 of 25'), top!.stdout);
  } finally {
    api.close();
  }
});

test('an RPC that answers HTTP 429 is said in plain words, exit 1', async () => {
  const rpc = await stub((_req, res) => {
    res.writeHead(429, { 'content-type': 'text/plain' });
    res.end('Too Many Requests');
  });
  try {
    const host = new URL(rpc.url).host;
    const runs = await each([
      ['credit', NOVA, '--rpc', rpc.url],
      ['tab', NOVA, '--rpc', rpc.url],
      ['score', NOVA, '--rpc', rpc.url],
    ]);
    for (const r of runs) {
      assert.equal(r.status, 1, r.stderr);
      assert.equal(r.stderr, `tessera: the RPC at ${host} is rate limiting: wait a minute and try again\n`);
    }
  } finally {
    rpc.close();
  }
});

test('a rate limit is told apart from other failures, and public devnet gets its own advice', () => {
  const limited = new SolanaError(SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR, { headers: new Headers(), message: 'Too Many Requests', statusCode: 429 });
  const down = new SolanaError(SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR, { headers: new Headers(), message: 'Bad Gateway', statusCode: 502 });
  assert.equal(rateLimited(limited), true);
  assert.equal(rateLimited(new Error('no RPC endpoint answered: HTTP error (429): ')), true);
  assert.equal(rateLimited(down), false);
  assert.equal(rateLimited(new TypeError('fetch failed')), false);
  assert.equal(rateLimitMessage('api.devnet.solana.com'), 'the public devnet RPC is rate limiting: wait a minute or pass --rpc <your devnet RPC>');
  assert.equal(rateLimitMessage('rpc.example.com'), 'the RPC at rpc.example.com is rate limiting: wait a minute and try again');
});

test('scrub takes control and bidirectional characters out of what a merchant sends, all through', () => {
  assert.equal(scrub('claim\u001b[3Aend'), 'claim [3Aend');
  assert.equal(scrub('a\u202eb\u009bc'), 'a b c');
  assert.deepEqual(scrub({ error: 'no\u0007', list: ['x\u200by'], n: 3, ok: true, none: null }), { error: 'no ', list: ['x y'], n: 3, ok: true, none: null });
  assert.equal(scrub('plain text, kept as it is'), 'plain text, kept as it is');
});
