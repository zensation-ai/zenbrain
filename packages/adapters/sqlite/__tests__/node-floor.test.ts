/**
 * The adapter's Node floor is `^22.14.0 || >=23.6.0`: better-sqlite3 13 is built against
 * Node-API 10, which Node has from 22.14.0 and 23.6.0 on. Measured in the CI job `node-floor` on
 * 2026-11-21: on Node 22.0.0, 22.12.0 and 22.13.0 the first `new Database()` ended in a
 * segmentation fault, also after `npm rebuild` on that version. Until 0.2.9 `engines` said
 * `>=22`, and the adapter imported better-sqlite3 when it was imported itself, so the crash came
 * without a word.
 *
 * Now the adapter loads better-sqlite3 in its constructor, after a check of the Node version,
 * and below the floor the constructor throws a message instead. Here the check runs against a
 * version string set in a child process, so it is tested on any runtime; the crash itself and
 * the refusal on a real Node 22.13.0 are what the CI job `node-floor` runs.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const built = fileURLToPath(new URL('../dist/index.js', import.meta.url));

interface Probe {
  loadedOnImport: boolean;
  loadedAfter: boolean;
  sqlite?: string;
  error?: string;
}

/** Imports the built adapter in a fresh Node, as `version` if given, and constructs it once. */
function probe(version?: string): Probe {
  const script = [
    version ? `Object.defineProperty(process, 'version', { value: ${JSON.stringify(version)} });` : '',
    `const { createRequire } = await import('node:module');`,
    `const loaded = () => Object.keys(createRequire(import.meta.url).cache).some((k) => k.includes('better-sqlite3'));`,
    `const { SqliteAdapter } = await import(${JSON.stringify(pathToFileURL(built).href)});`,
    `const out = { loadedOnImport: loaded() };`,
    `try { const a = new SqliteAdapter({ filename: ':memory:' }); out.sqlite = (await a.query('SELECT sqlite_version() AS v')).rows[0].v; await a.close(); }`,
    `catch (e) { out.error = e.message; }`,
    `out.loadedAfter = loaded();`,
    `console.log(JSON.stringify(out));`,
  ].join('\n');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf-8', timeout: 30_000 });
  if (r.status !== 0) throw new Error(`probe exited ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout.trim()) as Probe;
}

describe('the Node floor of the SQLite adapter', () => {
  beforeAll(() => {
    if (!existsSync(built)) throw new Error(`build first: ${built} is missing`);
  });

  it('below the floor (22.14, and 23.6 on Node 23) the import loads no native code, and the constructor refuses with a message', () => {
    // Node-API 10 came with 22.14.0 and 23.6.0 (Node-API version matrix, nodejs.org/api/n-api.html).
    for (const version of ['v22.13.0', 'v22.12.0', 'v22.0.0', 'v20.20.2', 'v23.0.0', 'v23.5.0']) {
      const r = probe(version);
      expect(r.loadedOnImport, version).toBe(false);
      expect(r.error, version).toMatch(/needs Node 22\.14 or newer/);
      expect(r.error, version).toContain(version);
      expect(r.loadedAfter, version).toBe(false);
    }
  });

  it('on a supported Node the constructor loads better-sqlite3 and the adapter works', () => {
    for (const version of [undefined, 'v22.14.0', 'v23.6.0', 'v24.3.1']) {
      const r = probe(version);
      expect(r.loadedOnImport, String(version)).toBe(false);
      expect(r.error, String(version)).toBeUndefined();
      expect(r.sqlite, String(version)).toMatch(/^3\.\d+\.\d+$/);
      expect(r.loadedAfter, String(version)).toBe(true);
    }
  });

  it('declares the same floor in engines', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { engines: { node: string } };
    expect(pkg.engines.node).toBe('^22.14.0 || >=23.6.0');
  });
});
