/**
 * The approval link, offline: what an agent hands its owner, and what the
 * approval page reads back from it. The page shows a request as verified only
 * when it hashes to the order's request hash, so the round trip must give back
 * exactly what the merchant hashed, and anything else must read as unreadable
 * or not match.
 *
 *   npm run test:formula
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approvalLink, hashJson, MAX_LINK_REQUEST, readLinkRequest, requestMatches, walletBrowseLinks } from '../src/index.js';

const ORDER = '7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2';
const queryOf = (link: string) => link.split('?')[1] ?? '';

test('a link carries the request, and it reads back as what was hashed', async () => {
  const request = { sku: 'summarize', input: { text: 'Grüße, 世界 — "quoted" & a/b+c?', max: 3, nested: { b: 1, a: [1, 'x'] } } };
  const link = approvalLink('https://example.org/', ORDER, request);
  assert.ok(link.startsWith(`https://example.org/#/approve/${ORDER}?`));
  const read = readLinkRequest(queryOf(link));
  assert.equal(read.status, 'ok');
  if (read.status !== 'ok') return;
  assert.deepEqual(read.request, request);
  assert.equal(await requestMatches(read.request, await hashJson({ sku: request.sku, input: request.input })), true);
});

test('key order does not change the hash the page compares', async () => {
  const hash = await hashJson({ sku: 'svg', input: { a: 1, b: 2 } });
  const read = readLinkRequest(queryOf(approvalLink('https://x.dev', ORDER, { sku: 'svg', input: { b: 2, a: 1 } })));
  assert.equal(read.status, 'ok');
  if (read.status === 'ok') assert.equal(await requestMatches(read.request, hash), true);
});

test('a request for something else does not match', async () => {
  const hash = await hashJson({ sku: 'summarize', input: { text: 'one' } });
  assert.equal(await requestMatches({ sku: 'summarize', input: { text: 'two' } }, hash), false);
  assert.equal(await requestMatches({ sku: 'translate', input: { text: 'one' } }, hash), false);
});

test('a link without a request, or with a broken one, says so', () => {
  assert.equal(approvalLink('https://x.dev', ORDER), `https://x.dev/#/approve/${ORDER}`);
  assert.deepEqual(readLinkRequest(''), { status: 'absent' });
  assert.deepEqual(readLinkRequest('sku=svg'), { status: 'unreadable' });
  assert.deepEqual(readLinkRequest('in=e30'), { status: 'unreadable' });
  assert.deepEqual(readLinkRequest('sku=svg&in=***'), { status: 'unreadable' });
  // valid base64url, but not JSON
  assert.deepEqual(readLinkRequest('sku=svg&in=bm90IGpzb24'), { status: 'unreadable' });
  // valid base64url, but not UTF-8
  assert.deepEqual(readLinkRequest('sku=svg&in=_-8'), { status: 'unreadable' });
});

test('a request too long for a link is left out, not cut', () => {
  const link = approvalLink('https://x.dev', ORDER, { sku: 'summarize', input: { text: 'x'.repeat(MAX_LINK_REQUEST) } });
  assert.equal(link, `https://x.dev/#/approve/${ORDER}`);
});

test('wallet links open the page itself in the wallet', () => {
  const page = approvalLink('https://x.dev', ORDER, { sku: 'svg', input: {} });
  const { phantom, solflare } = walletBrowseLinks(page);
  assert.equal(phantom, `https://phantom.com/ul/browse/${encodeURIComponent(page)}?ref=${encodeURIComponent('https://x.dev')}`);
  assert.equal(solflare, `https://solflare.com/ul/v1/browse/${encodeURIComponent(page)}?ref=${encodeURIComponent('https://x.dev')}`);
});
