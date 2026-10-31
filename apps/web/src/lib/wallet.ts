/**
 * Browser wallets through Wallet Standard (Phantom, Solflare, Backpack and any
 * other that registers), and the throwaway test wallet kept in this browser.
 * The page builds every transaction; a wallet only signs it, and the page
 * sends it.
 */
import { useEffect, useState } from 'react';
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getTransactionDecoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
  type KeyPairSigner,
  type TransactionSigner,
} from '@solana/kit';
import { getWallets } from '@wallet-standard/app';
import { sendSigned, sendWith } from './burner';
import { readRpc } from './client';

export type StdWallet = ReturnType<ReturnType<typeof getWallets>['get']>[number];
type StdAccount = StdWallet['accounts'][number];
type ConnectFeature = { connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly StdAccount[] }> };
type SignTxFeature = {
  supportedTransactionVersions?: readonly (number | 'legacy')[];
  signTransaction: (...inputs: { account: StdAccount; transaction: Uint8Array; chain?: string }[]) => Promise<readonly { signedTransaction: Uint8Array }[]>;
};

const CHAIN = 'solana:devnet';

/** A wallet this site can use: it connects, signs a Solana transaction, and speaks a Solana chain. */
const usable = (w: StdWallet) => 'standard:connect' in w.features && 'solana:signTransaction' in w.features && w.chains.some((c) => c.startsWith('solana:'));

export function useWallets(): StdWallet[] {
  const [list, setList] = useState<StdWallet[]>([]);
  useEffect(() => {
    const api = getWallets();
    const update = () => setList(api.get().filter(usable));
    update();
    const offRegister = api.on('register', update);
    const offUnregister = api.on('unregister', update);
    return () => {
      offRegister();
      offUnregister();
    };
  }, []);
  return list;
}

export type Signer = { kind: 'wallet'; address: Address; wallet: StdWallet; account: StdAccount } | { kind: 'burner'; address: Address; signer: KeyPairSigner };

/** Every string inside an error, so a program error name or code can be matched. */
export function errText(e: unknown): string {
  const parts: string[] = [];
  const seen = new Set<object>();
  const walk = (v: unknown, depth: number): void => {
    if (v == null || depth > 8) return;
    if (typeof v !== 'object') return void parts.push(String(v));
    if (seen.has(v as object)) return;
    seen.add(v as object);
    if (v instanceof Error) {
      parts.push(v.name, v.message);
      walk(v.cause, depth + 1);
    }
    for (const val of Object.values(v as Record<string, unknown>)) walk(val, depth + 1);
  };
  walk(e, 0);
  return parts.join(' | ');
}

/** The user said no in the wallet. */
export const declined = (e: unknown) => /reject|denied|declin|cancel|\b4001\b/i.test(errText(e));

/** Ask the wallet for its account. */
export async function connectWallet(w: StdWallet): Promise<Signer> {
  const { accounts } = await (w.features['standard:connect'] as ConnectFeature).connect();
  const account = accounts[0] ?? w.accounts[0];
  if (!account) throw new Error('The wallet shared no account.');
  return { kind: 'wallet', address: address(account.address), wallet: w, account };
}

/**
 * Build instructions for `signer`, have it sign them as fee payer, send, and
 * wait for confirmation. `build` gets the signer to name in the instructions:
 * the test wallet's own key, or a stand-in for a wallet that signs elsewhere.
 */
export async function sendAs(signer: Signer, build: (as: TransactionSigner) => Promise<Instruction[]>): Promise<string> {
  if (signer.kind === 'burner') return sendWith(signer.signer, await build(signer.signer));
  // The page builds the transaction; only the wallet holds the key.
  const noop = createNoopSigner(signer.address);
  const instructions = await build(noop);
  const feature = signer.wallet.features['solana:signTransaction'] as SignTxFeature;
  const version = !feature.supportedTransactionVersions || feature.supportedTransactionVersions.includes(0) ? 0 : 'legacy';
  const { value: latest } = await readRpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const message = pipe(
    createTransactionMessage({ version }),
    (m) => setTransactionMessageFeePayerSigner(noop, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latest, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const bytes = new Uint8Array(getTransactionEncoder().encode(compileTransaction(message)));
  const [out] = await feature.signTransaction({ account: signer.account, transaction: bytes, chain: CHAIN });
  if (!out) throw new Error('The wallet returned no signed transaction.');
  const signed = getTransactionDecoder().decode(out.signedTransaction);
  return sendSigned(getBase64EncodedWireTransaction(signed), getSignatureFromTransaction(signed));
}
