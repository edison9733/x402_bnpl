/**
 * The approval link: how an agent that holds no key asks its owner to pay.
 *
 * The agent has a merchant open an escrow order in the owner's name, then
 * hands the owner a link to the website's approval page. The page reads the
 * order itself from the chain: who it is for, who sells, the price, the hold.
 * The link adds only what the order was for (the skill and its input), and the
 * page shows that as verified only when it hashes to the request hash the
 * order committed on-chain. Nothing in the link is trusted.
 */
import { canonicalJson, hashJson, bytesEqual, type ReadonlyUint8ArrayLike } from './util.js';

/** What an order was asked for: the same `{ sku, input }` its request hash is the hash of. */
export type ApprovalRequest = { sku: string; input: unknown };

/**
 * The longest request a link carries, as base64url characters. A longer one
 * is left out: the page still shows the order and its request hash, and says
 * the link does not describe it.
 */
export const MAX_LINK_REQUEST = 2400;

const toBase64Url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('not base64url');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * The approval page for `order` on the site at `site` (its origin, or the
 * path it is served from). The request rides along when it is small enough.
 */
export function approvalLink(site: string, order: string, request?: ApprovalRequest): string {
  const base = `${site.replace(/\/+$/, '')}/#/approve/${encodeURIComponent(order)}`;
  if (!request) return base;
  const encoded = toBase64Url(new TextEncoder().encode(canonicalJson(request.input ?? {})));
  if (encoded.length > MAX_LINK_REQUEST) return base;
  return `${base}?${new URLSearchParams({ sku: request.sku, in: encoded }).toString()}`;
}

export type LinkRequest = { status: 'absent' } | { status: 'unreadable' } | { status: 'ok'; request: ApprovalRequest };

/** What the query of an approval link says the order is for. */
export function readLinkRequest(query: string): LinkRequest {
  const q = new URLSearchParams(query);
  const sku = q.get('sku');
  const encoded = q.get('in');
  if (sku === null && encoded === null) return { status: 'absent' };
  if (!sku || encoded === null) return { status: 'unreadable' };
  try {
    return { status: 'ok', request: { sku, input: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(encoded))) } };
  } catch {
    return { status: 'unreadable' };
  }
}

/** Whether `request` is what an order with this request hash was opened for. */
export async function requestMatches(request: ApprovalRequest, requestHash: ReadonlyUint8ArrayLike): Promise<boolean> {
  return bytesEqual(await hashJson({ sku: request.sku, input: request.input }), requestHash);
}

/**
 * Wallet links that open a page in the wallet's own browser on a phone, where
 * its signing is available. A link a phone's ordinary browser opens has no
 * wallet to sign with.
 */
export function walletBrowseLinks(url: string): { phantom: string; solflare: string } {
  const page = encodeURIComponent(url);
  const ref = encodeURIComponent(new URL(url).origin);
  return {
    phantom: `https://phantom.com/ul/browse/${page}?ref=${ref}`,
    solflare: `https://solflare.com/ul/v1/browse/${page}?ref=${ref}`,
  };
}
