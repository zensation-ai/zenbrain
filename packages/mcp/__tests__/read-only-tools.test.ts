/**
 * The two tools annotated `readOnlyHint: true` — `zenbrain_recall` and
 * `zenbrain_health` — must leave the store's directory exactly as they found it,
 * and so must starting the server.
 *
 * Measured on 0.3.1 (2026-11-20/21): neither tool changes a row, but starting the
 * server in an empty directory created `zenbrain.db`, `zenbrain.db-wal` and
 * `zenbrain.db-shm`, and the first read after opening (or after a write) wrote
 * SQLite's read mark into `zenbrain.db-shm`. A checker that compares the files
 * before and after a read-only call saw that as a change. The server now creates
 * the store with the first memory it stores, and opens it with a rollback
 * journal, so a read touches no file at all — on a store this version created.
 * A store in WAL mode (every store 0.3.1 or earlier created or opened) stays in
 * WAL mode, with the side files that come with it; the last tests pin that.
 *
 * The tests spawn the built entry point the way an MCP client starts it and
 * compare name, size and sha256 of every file, from before the start on.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SqliteAdapter } from '@zensation/adapter-sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const builtEntry = join(here, '..', 'dist', 'index.js');
/** A valid UUID that no store holds: forget then reaches its SQL instead of returning early. */
const NO_SUCH_ID = '00000000-0000-4000-8000-000000000000';
const LONG_TERM = ['episodic', 'semantic', 'procedural', 'core'] as const;

/** Every file and directory below `dir`, with size and sha256 for files. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, rel: string): void => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name);
      const key = rel ? `${rel}/${name}` : name;
      if (statSync(path).isDirectory()) {
        out[`${key}/`] = 'dir';
        walk(path, key);
      } else {
        const bytes = readFileSync(path);
        out[key] = `${bytes.length}:${createHash('sha256').update(bytes).digest('hex')}`;
      }
    }
  };
  walk(dir, '');
  return out;
}

/** Bytes 18 and 19 of the SQLite header: `1/1` rollback journal, `2/2` WAL. */
function journalMode(file: string): string {
  const fd = openSync(file, 'r');
  const b = Buffer.alloc(2);
  readSync(fd, b, 0, 2, 18);
  closeSync(fd);
  return `${b[0]}/${b[1]}`;
}

function childEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ZENBRAIN_DB') env[k] = v;
  }
  return { ...env, ...extra };
}

async function startServer(cwd: string, extraEnv: Record<string, string> = {}): Promise<Client> {
  const transport = new StdioClientTransport({ command: process.execPath, args: [builtEntry], cwd, env: childEnv(extraEnv), stderr: 'ignore' });
  const client = new Client({ name: 'read-only-test', version: '0' });
  await client.connect(transport);
  await client.listTools();
  return client;
}

/** Calls a tool and fails the test if it reports an error. */
async function ok<T = Record<string, unknown>>(client: Client, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await client.callTool({ name, arguments: args });
  expect(r.isError, `${name} returned an error: ${JSON.stringify(r.content)}`).toBeFalsy();
  return r.structuredContent as T;
}

type Health = { episodic: { count: number }; semantic: { count: number }; procedural: { count: number }; core: { blocks: number } };
const longTerm = (h: Health) => h.episodic.count + h.semantic.count + h.procedural.count + h.core.blocks;

async function readOnlyCalls(client: Client): Promise<Health> {
  const a = await ok<{ count: number; results: unknown[] }>(client, 'zenbrain_recall', { query: 'Kiel' });
  expect(a.results).toHaveLength(a.count);
  await ok(client, 'zenbrain_recall', { query: 'tea', layers: ['working', 'episodic', 'semantic', 'procedural', 'core'] });
  return ok<Health>(client, 'zenbrain_health');
}

async function storeThree(client: Client): Promise<void> {
  await ok(client, 'zenbrain_store', { content: 'The capital of Schleswig-Holstein is Kiel.', type: 'fact', confidence: 0.8 });
  await ok(client, 'zenbrain_store', { content: 'Yesterday I walked along the Kiel fjord in heavy rain.', type: 'episode' });
  await ok(client, 'zenbrain_store', { content: 'How to brew tea:\n1. boil water\n2. add leaves', type: 'procedure' });
}

async function recallCount(client: Client, query: string): Promise<number> {
  return (await ok<{ count: number }>(client, 'zenbrain_recall', { query, minScore: 0.01 })).count;
}

// Resolved, because the server reports resolved paths (on macOS the temp directory is behind /var -> /private/var).
const tmp = (prefix: string) => realpathSync(mkdtempSync(join(tmpdir(), prefix)));
const canLock = process.platform !== 'win32' && process.getuid?.() !== 0;

describe('read-only tools and the start leave the store directory unchanged', () => {
  beforeAll(() => {
    if (!existsSync(builtEntry)) throw new Error(`build first: ${builtEntry} is missing`);
  });

  it('in an empty directory, from before the start on, also for forget and consolidate on nothing', async () => {
    const dir = tmp('zenbrain-ro-');
    const client = await startServer(dir);
    try {
      expect(snapshot(dir)).toEqual({});
      expect(longTerm(await readOnlyCalls(client))).toBe(0);
      for (const layer of LONG_TERM) {
        const f = await ok<{ forgotten: boolean; alsoForgotten: unknown[] }>(client, 'zenbrain_forget', { id: NO_SUCH_ID, layer });
        expect(f).toMatchObject({ forgotten: false, alsoForgotten: [] });
      }
      expect(await ok(client, 'zenbrain_consolidate')).toEqual({ promoted: 0, decayed: 0, pruned: 0 });
      expect(snapshot(dir)).toEqual({});
    } finally {
      await client.close();
    }
    expect(snapshot(dir)).toEqual({});
  }, 30_000);

  it('at ~/.zenbrain/memory.db, where not even the directory appears', async () => {
    const home = tmp('zenbrain-ro-home-');
    // os.homedir() reads HOME on POSIX and USERPROFILE on Windows.
    const client = await startServer(tmp('zenbrain-ro-cwd-'), { HOME: home, USERPROFILE: home, ZENBRAIN_DB: '~/.zenbrain/memory.db' });
    try {
      await readOnlyCalls(client);
      expect(snapshot(home)).toEqual({});
    } finally {
      await client.close();
    }
  }, 30_000);

  it('on a store this version created, at every point of a later run', async () => {
    const dir = tmp('zenbrain-ro-');
    const first = await startServer(dir);
    try {
      await storeThree(first);
      expect(Object.keys(snapshot(dir))).toEqual(['zenbrain.db']);
      const before = snapshot(dir);
      await readOnlyCalls(first);
      expect(snapshot(dir)).toEqual(before);
    } finally {
      await first.close();
    }
    const atRest = snapshot(dir);
    const again = await startServer(dir);
    try {
      expect(snapshot(dir)).toEqual(atRest);
      expect(longTerm(await readOnlyCalls(again))).toBe(3);
      expect(await recallCount(again, 'Kiel')).toBeGreaterThan(0);
      expect(snapshot(dir)).toEqual(atRest);
    } finally {
      await again.close();
    }
    expect(snapshot(dir)).toEqual(atRest);
    expect(journalMode(join(dir, 'zenbrain.db'))).toBe('1/1');
  }, 30_000);

  it('finds an existing store when ZENBRAIN_DB ends in a space or a CRLF', async () => {
    const dir = tmp('zenbrain-ro-trim-');
    const file = join(dir, 'memory.db');
    const writer = await startServer(dir, { ZENBRAIN_DB: file });
    await ok(writer, 'zenbrain_store', { content: 'The harbour office opens at nine.' });
    await writer.close();
    const atRest = snapshot(dir);
    for (const suffix of [' ', '\r\n', ' \r\n']) {
      const client = await startServer(dir, { ZENBRAIN_DB: `${file}${suffix}` });
      try {
        expect(await recallCount(client, 'harbour office')).toBe(1);
      } finally {
        await client.close();
      }
    }
    expect(snapshot(dir)).toEqual(atRest);
  }, 30_000);

  it('creates the store with the first memory, where a second server finds it', async () => {
    const dir = tmp('zenbrain-ro-two-');
    const a = await startServer(dir);
    const b = await startServer(dir);
    try {
      expect(await recallCount(a, 'harbour')).toBe(0);
      await ok(b, 'zenbrain_store', { content: 'We met at the harbour.' });
      expect(Object.keys(snapshot(dir))).toEqual(['zenbrain.db']);
      // `a` was started before the file existed and reads it from now on.
      expect(await recallCount(a, 'harbour')).toBe(1);
      await ok(a, 'zenbrain_store', { content: 'The harbour office opens at nine.' });
      expect(await recallCount(b, 'harbour office')).toBeGreaterThan(0);
    } finally {
      await a.close();
      await b.close();
    }
    expect(Object.keys(snapshot(dir))).toEqual(['zenbrain.db']);
  }, 30_000);

  it('two servers that create the store at the same moment both keep their memories', async () => {
    for (let round = 0; round < 3; round++) {
      const dir = tmp('zenbrain-ro-race-');
      const a = await startServer(dir);
      const b = await startServer(dir);
      try {
        await Promise.all([
          ok(a, 'zenbrain_store', { content: 'First server writes about Kiel.' }),
          ok(b, 'zenbrain_store', { content: 'Second server writes about Kiel.' }),
        ]);
        const h = await ok<Health>(a, 'zenbrain_health');
        expect(h.semantic.count).toBe(2);
      } finally {
        await a.close();
        await b.close();
      }
      expect(Object.keys(snapshot(dir))).toEqual(['zenbrain.db']);
    }
  }, 60_000);
});

describe('a store that cannot be created or opened is reported, not shown as empty', () => {
  it.skipIf(!canLock)('the start fails with exit 1 and the path, in an unwritable working directory or ZENBRAIN_DB', () => {
    const locked = join(tmp('zenbrain-ro-locked-'), 'locked');
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    try {
      for (const [cwd, env, path] of [
        [locked, {}, join(locked, 'zenbrain.db')],
        [tmp('zenbrain-ro-cwd-'), { ZENBRAIN_DB: join(locked, 'sub', 'memory.db') }, join(locked, 'sub', 'memory.db')],
      ] as const) {
        const r = spawnSync(process.execPath, [builtEntry], { cwd, env: childEnv(env), input: '', encoding: 'utf-8', timeout: 15_000 });
        expect(r.status).toBe(1);
        expect(r.stderr).toContain(`could not open its store at ${path}`);
        expect(r.stderr).toMatch(/cannot create files in .*locked/);
      }
      expect(readdirSync(locked)).toEqual([]);
    } finally {
      chmodSync(locked, 0o700);
    }
  });

  it.skipIf(process.platform === 'win32')('a store path that links to a file still to be created: the first store creates the link target, as in 0.3.1', async () => {
    const dir = tmp('zenbrain-ro-link-');
    mkdirSync(join(dir, 'sync'));
    symlinkSync(join(dir, 'sync', 'memory.db'), join(dir, 'memory.db'));
    const client = await startServer(dir, { ZENBRAIN_DB: join(dir, 'memory.db') });
    try {
      expect(readdirSync(join(dir, 'sync'))).toEqual([]);
      await ok(client, 'zenbrain_store', { content: 'Stored through a link.' });
      expect(readdirSync(join(dir, 'sync'))).toEqual(['memory.db']);
      expect(await recallCount(client, 'stored through a link')).toBe(1);
    } finally {
      await client.close();
    }
  }, 30_000);

  it('the start fails when part of the path is a file, and says so', () => {
    const dir = tmp('zenbrain-ro-file-');
    writeFileSync(join(dir, 'plain'), 'not a directory');
    const r = spawnSync(process.execPath, [builtEntry], { cwd: dir, env: childEnv({ ZENBRAIN_DB: join(dir, 'plain', 'memory.db') }), input: '', encoding: 'utf-8', timeout: 15_000 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`${join(dir, 'plain')} is a file, not a directory`);
  });

  it('a store file that appears but cannot be opened makes each of the five tools return an error, without waiting', async () => {
    const dir = tmp('zenbrain-ro-broken-');
    const client = await startServer(dir);
    try {
      expect(await recallCount(client, 'anything')).toBe(0);
      writeFileSync(join(dir, 'zenbrain.db'), 'this is not a database '.repeat(20));
      const calls: Array<[string, Record<string, unknown>]> = [
        ['zenbrain_recall', { query: 'anything' }], ['zenbrain_health', {}], ['zenbrain_store', { content: 'not stored' }],
        ['zenbrain_forget', { id: NO_SUCH_ID, layer: 'semantic' }], ['zenbrain_consolidate', {}], ['zenbrain_recall', { query: 'anything' }],
      ];
      for (const [name, args] of calls) {
        const t0 = Date.now();
        const r = await client.callTool({ name, arguments: args });
        expect(r.isError).toBe(true);
        expect(JSON.stringify(r.content)).toContain(`could not open its store at ${join(dir, 'zenbrain.db')}`);
        expect(Date.now() - t0).toBeLessThan(2_000);
      }
    } finally {
      await client.close();
    }
  }, 30_000);
});

describe('a store in WAL mode stays in WAL mode, with its side files while a server runs', () => {
  it('a WAL store from 0.3.1: reads keep the store file and its memories, a read after a write changes -shm, all side files go at exit', async () => {
    const dir = tmp('zenbrain-ro-wal-');
    const file = join(dir, 'zenbrain.db');
    const old = new SqliteAdapter({ filename: file }); // WAL, as 0.3.1 opened it
    await old.query("INSERT INTO learned_facts (id, content, source, confidence) VALUES ('f1', 'Kiel lies on the Baltic Sea.', 'user', 0.8)");
    await old.close();
    const atRest = snapshot(dir);
    expect(Object.keys(atRest)).toEqual(['zenbrain.db']);
    expect(journalMode(file)).toBe('2/2');

    const client = await startServer(dir);
    try {
      // The start opens the existing store, and SQLite reads a WAL store only with both side files.
      expect(Object.keys(snapshot(dir))).toEqual(['zenbrain.db', 'zenbrain.db-shm', 'zenbrain.db-wal']);
      await readOnlyCalls(client);
      expect(await recallCount(client, 'Baltic')).toBe(1);
      expect(snapshot(dir)['zenbrain.db']).toBe(atRest['zenbrain.db']);

      // Another connection writes; the next read moves SQLite's read mark in -shm.
      const other = new SqliteAdapter({ filename: file });
      await other.query("INSERT INTO learned_facts (id, content, source, confidence) VALUES ('f2', 'Flensburg lies on the Baltic Sea too.', 'user', 0.8)");
      const shmBefore = snapshot(dir)['zenbrain.db-shm'];
      expect(await recallCount(client, 'Flensburg')).toBe(1);
      expect(snapshot(dir)['zenbrain.db-shm']).not.toBe(shmBefore);
      await other.close();
    } finally {
      await client.close();
    }
    expect(Object.keys(snapshot(dir))).toEqual(['zenbrain.db']);
    expect(journalMode(file)).toBe('2/2');
  }, 30_000);

  it('a store this version created becomes a WAL store for good once 0.3.1 opens it', async () => {
    const dir = tmp('zenbrain-ro-mixed-');
    const file = join(dir, 'zenbrain.db');
    const created = await startServer(dir);
    await ok(created, 'zenbrain_store', { content: 'Written by 0.3.2 before 0.3.1 opened the store.' });
    await created.close();
    expect(journalMode(file)).toBe('1/1');

    const old = new SqliteAdapter({ filename: file }); // what 0.3.1 does at its start: journal_mode = WAL
    await old.close();
    expect(journalMode(file)).toBe('2/2');

    const again = await startServer(dir);
    try {
      expect(await recallCount(again, 'written before opened')).toBe(1);
      await ok(again, 'zenbrain_store', { content: 'Written by 0.3.2 after that.' });
    } finally {
      await again.close();
    }
    expect(journalMode(file)).toBe('2/2'); // 0.3.2 does not switch it back
  }, 30_000);
});
