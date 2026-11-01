/**
 * `npm test [-- <name>]`: the formula, reward, pay-later and CLI tests that
 * need no chain, printed one line per test the way the score page shows
 * them: a tick, the title, and where the guarantee is proved (formula,
 * on-chain, or both), then `N passing · x formula · y on-chain`. A name
 * picks the test files whose name contains it: `npm test -- score`.
 *
 * As with node --test, a skipped or todo test prints as such and never counts
 * as passing, and a todo that fails does not fail the run. Tests nested in
 * describe or t.test print indented under the one they belong to. A file that
 * fails outside its tests (a crash at import, say) prints node's own output
 * for it, which says why.
 *
 * Whenever the score suite runs, its titles and tags are written to
 * deployments/score-tests.json, which the score page renders, so the page,
 * the CLI and the tests cannot drift apart. When the suite file itself fails
 * to run, the file keeps its last run, so a crash cannot empty the page.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { run } from 'node:test';
import { renderTestLine, renderTestSummary, styleFrom, type TestLine } from '../apps/cli/src/render.js';
import { untag } from '../packages/sdk/test/guarantee.js';
import { REPO_ROOT } from './lib.js';

const DIRS = ['packages/sdk/test', 'apps/cli/test'];
const SCORE_SUITE = resolve(REPO_ROOT, 'packages/sdk/test/score.test.ts');
const EXPORT = resolve(REPO_ROOT, 'deployments/score-tests.json');
const rel = (f: string) => f.replace(`${REPO_ROOT}/`, '');

const filter = process.argv[2];
const files = DIRS.flatMap((d) => readdirSync(resolve(REPO_ROOT, d)).filter((f) => f.endsWith('.test.ts')).map((f) => resolve(REPO_ROOT, d, f))).filter((f) => !filter || basename(f).includes(filter));
if (!files.length) {
  console.error(`tessera: no test file named like "${filter}" under ${DIRS.join(' or ')}`);
  process.exit(2);
}

/** What node reports when a test finishes (test:pass or test:fail). */
type Finished = {
  name: string;
  nesting: number;
  skip?: boolean | string;
  todo?: boolean | string;
  details?: { type?: 'test' | 'suite'; error?: Error & { cause?: unknown } };
};
/** A test and the tests nested in it. */
type Node = { line: TestLine; kids: Node[] };

/** The assertion's own message. Node wraps it, and for a parent test or a whole file the cause is only a string. */
function reason(err: Error & { cause?: unknown }): string {
  const c = err.cause;
  return c && typeof c === 'object' && typeof (c as Error).message === 'string' ? (c as Error).message : err.message || String(c);
}

/** Node's own totals at the end of a run: not a reason for anything. */
const TOTALS = /^(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) [\d.]+$/;

const style = styleFrom(process.env, Boolean(process.stdout.isTTY));
const tests: TestLine[] = [];
/** Each file's lines, and whether node reported the file itself, which means its own tests did not all report. */
const byFile = new Map<string, { lines: TestLine[]; fileFailed: boolean }>();

// One file at a time, so every line is known to belong to the file being run.
for (const file of files) {
  const lines: TestLine[] = [];
  const said: string[] = [];
  let fileFailed = false;
  // Node reports a test when it finishes, so nested tests arrive before the one they are in: they wait for it.
  const waiting: Node[][] = [];
  const show = (n: Node): void => {
    lines.push(n.line);
    console.log(renderTestLine(n.line, style));
    n.kids.forEach(show);
  };
  for await (const ev of run({ files: [file] })) {
    if (ev.type === 'test:stderr') said.push(ev.data.message);
    else if (ev.type === 'test:diagnostic' && !TOTALS.test(ev.data.message)) said.push(`${ev.data.message}\n`);
    if (ev.type !== 'test:pass' && ev.type !== 'test:fail') continue;
    const d = ev.data as Finished;
    const err = d.details?.error;
    let line: TestLine;
    if (d.nesting === 0 && d.name === file) {
      // The file itself, named by its path: it failed outside its tests, or it reported none.
      fileFailed = true;
      line =
        ev.type === 'test:fail'
          ? { title: `${rel(file)} failed outside its tests`, where: null, passed: false, error: said.join('').trimEnd() || (err ? reason(err) : 'node gave no reason') }
          : { title: `${rel(file)} reported no tests`, where: null, passed: false, skip: 'skipped' };
    } else {
      const { title, where } = untag(d.name);
      const skip = d.todo ? 'todo' : d.skip ? 'skipped' : undefined;
      line = {
        title,
        where,
        passed: ev.type === 'test:pass' && !skip,
        ...(skip ? { skip } : {}),
        ...(d.nesting ? { depth: d.nesting } : {}),
        ...(d.details?.type === 'suite' ? { suite: true } : {}),
        ...(err && !skip ? { error: reason(err) } : {}),
      };
    }
    const node: Node = { line, kids: waiting[d.nesting + 1] ?? [] };
    waiting[d.nesting + 1] = [];
    if (d.nesting === 0) show(node);
    else (waiting[d.nesting] ??= []).push(node);
  }
  // Nested tests whose parent never reported, when a file stopped part way.
  for (const level of waiting) for (const n of level ?? []) show(n);
  tests.push(...lines);
  byFile.set(file, { lines, fileFailed });
}
console.log(renderTestSummary(tests, style));

const scored = byFile.get(SCORE_SUITE);
if (scored?.fileFailed) console.log(`\nnot written: ${rel(EXPORT)} keeps its last run, because ${rel(SCORE_SUITE)} did not run through`);
else if (scored) {
  const exported = scored.lines.filter((t) => !t.suite).map(({ title, where, passed, skip }) => ({ title, where, passed, ...(skip ? { skip } : {}) }));
  writeFileSync(EXPORT, `${JSON.stringify({ recordedAt: new Date().toISOString(), command: 'npm test -- score', tests: exported }, null, 2)}\n`);
  console.log(`\nwritten: ${rel(EXPORT)}`);
}
// A todo that fails, or a skipped test, does not fail the run. A failed describe block does.
process.exit(tests.some((t) => !t.passed && !t.skip) ? 1 : 0);
