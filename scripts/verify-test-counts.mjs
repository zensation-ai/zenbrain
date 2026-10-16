#!/usr/bin/env node
/**
 * Checks every sentence in the documentation that states how many tests there are against the
 * number of tests Vitest actually collects.
 *
 * Test counts go stale quietly: one added test after the count was written, and the README is wrong
 * on npm for a whole release (0.5.1 shipped "822 tests" in a header line while the body said 853,
 * and both were already one short). This script makes a stale count fail CI, the way
 * verify-package-contents.sh does for the `files` field.
 *
 *   node scripts/verify-test-counts.mjs
 *
 * Counting uses `vitest list` per package, which collects tests without running them. Tests that
 * are skipped in this environment are not listed. The PostgreSQL suite skips without a database,
 * so it is listed with a placeholder ZENBRAIN_TEST_PG_URL (listing opens no connection); it runs
 * for real in the CI job "postgres", on Node 22 only, which is what the sentences say.
 *
 * Each claim below must match exactly once. If a sentence is reworded and no longer matches, the
 * check fails rather than passing silently — then update the pattern here together with the text.
 */
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const TMP = mkdtempSync(join(tmpdir(), 'zenbrain-test-counts-'));

function list(dir, files = [], env = {}) {
  const out = join(TMP, `${dir.replace(/\W+/g, '_')}-${files.length}.json`);
  // `--json=<file>`: a bare `--json <x>` would take <x> as the output path and overwrite it.
  const r = spawnSync(process.execPath, [VITEST, 'list', ...files, `--json=${out}`], {
    cwd: join(ROOT, dir), encoding: 'utf-8', env: { ...process.env, ...env },
  });
  if (r.status !== 0) {
    console.error(`vitest list failed in ${dir}:\n${r.stdout}${r.stderr}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(out, 'utf-8')).length;
}

const count = {
  algorithms: list('packages/algorithms'),
  core: list('packages/core'),
  sqlite: list('packages/adapters/sqlite'),
  postgres: list('packages/adapters/postgres'),
  mcp: list('packages/mcp'),
  aiSdk: list('packages/ai-sdk'),
  pg: list('packages/adapters/postgres', ['__tests__/real-postgres.test.ts'], { ZENBRAIN_TEST_PG_URL: 'postgres://list-only' }),
  backend: list('backend'),
};
rmSync(TMP, { recursive: true, force: true });

const perNode = count.algorithms + count.core + count.sqlite + count.postgres + count.mcp + count.aiSdk;
const total = perNode + count.pg;
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const n = (s) => (s in WORDS ? WORDS[s] : Number(s));

// [file, pattern, (groups) => list of [what, stated, expected]]
const CLAIMS = [
  ['README.md', /in algorithms and core\. (\d+) tests\./,
    (g) => [['total', g[1], total]]],
  ['README.md', /(\d+) tests green in CI: (\d+) on each of Node 22, 24 and 26, and (\d+) more against PostgreSQL/,
    (g) => [['total', g[1], total], ['per Node version', g[2], perNode], ['PostgreSQL', g[3], count.pg]]],
  ['README.md', /\*\*(\d+) tests\*\* \((\d+) algorithms · (\d+) core · (\d+) adapter-sqlite · (\d+) adapter-postgres, (\w+) of them against a real PostgreSQL · (\d+) mcp · (\d+) ai-sdk\)/,
    (g) => [['total', g[1], total], ['algorithms', g[2], count.algorithms], ['core', g[3], count.core],
      ['adapter-sqlite', g[4], count.sqlite], ['adapter-postgres', g[5], count.postgres + count.pg],
      ['PostgreSQL', g[6], count.pg], ['mcp', g[7], count.mcp], ['ai-sdk', g[8], count.aiSdk]]],
  ['README.md', /Four experiment suites \((\d+) tests\)/,
    (g) => [['backend experiments', g[1], count.backend]]],
  ['docs/FAQ.md', /repository's (\d+) tests pass in CI: (\d+) on each of Node 22, 24 and 26, and (\w+) more against a real PostgreSQL/,
    (g) => [['total', g[1], total], ['per Node version', g[2], perNode], ['PostgreSQL', g[3], count.pg]]],
  ['packages/algorithms/README.md', /tree-shakeable subpath exports, (\d+) tests/,
    (g) => [['algorithms', g[1], count.algorithms]]],
];

console.log(`vitest collects: ${perNode} per Node version (algorithms ${count.algorithms} · core ${count.core} · adapter-sqlite ${count.sqlite} · adapter-postgres ${count.postgres} · mcp ${count.mcp} · ai-sdk ${count.aiSdk}), ${count.pg} against PostgreSQL, ${total} in all; backend experiments ${count.backend}`);

let bad = 0;
for (const [file, re, check] of CLAIMS) {
  const text = readFileSync(join(ROOT, file), 'utf-8');
  const all = [...text.matchAll(new RegExp(re.source, 'g'))];
  if (all.length !== 1) {
    console.log(`  ${file}: the sentence /${re.source}/ occurs ${all.length} times, expected once`);
    bad++;
    continue;
  }
  const line = text.slice(0, all[0].index).split('\n').length;
  for (const [what, stated, expected] of check(all[0])) {
    if (n(stated) !== expected) {
      console.log(`  ${file}:${line}: says ${stated} (${what}), vitest collects ${expected}`);
      bad++;
    }
  }
}

if (bad) {
  console.log(`\nFAIL: ${bad} test count(s) in the documentation do not match.`);
  process.exit(1);
}
console.log(`OK: ${CLAIMS.length} sentences state the counts vitest collects.`);
