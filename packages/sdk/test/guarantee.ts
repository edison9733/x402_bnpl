/**
 * A guarantee is a test whose title the score page prints, tagged with where
 * it is proved. `formula` runs the arithmetic here. `on-chain` is also
 * checked against the real program on a local validator by `npm run
 * test:local` (scripts/test-local.ts), where the attack is refused or earns
 * nothing. `formula + on-chain` does both. The tag rides in the test's own
 * name, so `npm test -- score` reads it from the suite and the page cannot
 * drift from what is actually tested. `npm test` itself sends nothing to any
 * chain: an on-chain guarantee names the checks in test-local.ts it rests on,
 * and fails here if one of them is renamed or removed.
 */
import { readFileSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Where = 'formula' | 'on-chain' | 'formula + on-chain';
export const WHERE: readonly Where[] = ['formula', 'on-chain', 'formula + on-chain'];

const TEST_LOCAL = resolve(dirname(fileURLToPath(import.meta.url)), '../../../scripts/test-local.ts');
let testLocal: string | undefined;

/** The tag at the end of a test name, and the name without it. */
export function untag(name: string): { title: string; where: Where | null } {
  const m = /^(.*) \[(formula|on-chain|formula \+ on-chain)\]$/.exec(name);
  return m ? { title: m[1]!, where: m[2] as Where } : { title: name, where: null };
}

/**
 * `onChain` lists the labels of the `expectFail` or `log.step` lines in
 * scripts/test-local.ts that prove the guarantee against the real program.
 */
export function guarantee(title: string, where: Where, onChain: string[], fn: (t: TestContext) => void | Promise<void>): void {
  test(`${title} [${where}]`, async (t) => {
    if (where.includes('on-chain')) {
      assert.ok(onChain.length > 0, 'an on-chain guarantee names the checks in scripts/test-local.ts it rests on');
      testLocal ??= readFileSync(TEST_LOCAL, 'utf8');
      for (const label of onChain) assert.ok(testLocal.includes(label), `scripts/test-local.ts no longer has the check "${label}"`);
    } else assert.equal(onChain.length, 0, 'a formula-only guarantee names no on-chain checks');
    await fn(t);
  });
}
