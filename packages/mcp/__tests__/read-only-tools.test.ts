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
 * journal, so a read touches no file at all.
 *
 * The tests spawn the built entry point the way an MCP client starts it and
 * compare name, size and sha256 of every file, from before the start on.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SqliteAdapter } from '@zensation/adapter-sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const builtEntry = join(here, '..', 'dist', 'index.js');

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

async function startServer(cwd: string, extraEnv: Record<string, string> = {}): Promise<Client> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ZENBRAIN_DB') env[k] = v;
  }
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [builtEntry],
    cwd,
    env: { ...env, ...extraEnv },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'read-only-test', version: '0' });
  await client.connect(transport);
  await client.listTools();
  return client;
}

async function readOnlyCalls(client: Client): Promise<void> {
  await client.callTool({ name: 'zenbrain_recall', arguments: { query: 'Kiel' } });
  await client.callTool({
    name: 'zenbrain_recall',
    arguments: { query: 'tea', layers: ['working', 'episodic', 'semantic', 'procedural', 'core'] },
  });
  await client.callTool({ name: 'zenbrain_health', arguments: {} });
}

async function storeThree(client: Client): Promise<void> {
  await client.callTool({
    name: 'zenbrain_store',
    arguments: { content: 'The capital of Schleswig-Holstein is Kiel.', type: 'fact', confidence: 0.8 },
  });
  await client.callTool({
    name: 'zenbrain_store',
    arguments: { content: 'Yesterday I walked along the Kiel fjord in heavy rain.', type: 'episode' },
  });
  await client.callTool({
    name: 'zenbrain_store',
    arguments: { content: 'How to brew tea:\n1. boil water\n2. add leaves', type: 'procedure' },
  });
}

async function recallCount(client: Client, query: string): Promise<number> {
  const r = await client.callTool({ name: 'zenbrain_recall', arguments: { query, minScore: 0.01 } });
  return (r.structuredContent as { count: number }).count;
}

const tmp = (prefix: string) => mkdtempSync(join(tmpdir(), prefix));

describe('read-only tools and the start leave the store directory unchanged', () => {
  beforeAll(() => {
    if (!existsSync(builtEntry)) throw new Error(`build first: ${builtEntry} is missing`);
  });

  it('in an empty directory, from before the start on', async () => {
    const dir = tmp('zenbrain-ro-');
    const client = await startServer(dir);
    try {
      expect(snapshot(dir)).toEqual({});
      await readOnlyCalls(client);
      // Nothing to delete or consolidate yet: these must not create the store either.
      await client.callTool({ name: 'zenbrain_forget', arguments: { id: 'none', layer: 'semantic' } });
      await client.callTool({ name: 'zenbrain_consolidate', arguments: {} });
      expect(snapshot(dir)).toEqual({});
    } finally {
      await client.close();
    }
    expect(snapshot(dir)).toEqual({});
  }, 30_000);

  it('at ~/.zenbrain/memory.db, where not even the directory appears', async () => {
    const home = tmp('zenbrain-ro-home-');
    const client = await startServer(tmp('zenbrain-ro-cwd-'), { HOME: home, ZENBRAIN_DB: '~/.zenbrain/memory.db' });
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
      await readOnlyCalls(again);
      expect(await recallCount(again, 'Kiel')).toBeGreaterThan(0);
      expect(snapshot(dir)).toEqual(atRest);
    } finally {
      await again.close();
    }
    expect(snapshot(dir)).toEqual(atRest);
    expect(journalMode(join(dir, 'zenbrain.db'))).toBe('1/1');
  }, 30_000);

  it('on a WAL store from 0.3.1 or earlier: the file stays byte for byte and in WAL mode', async () => {
    // SQLite cannot read a WAL file without `-wal` and `-shm` beside it, and switching
    // the file out of WAL would itself be a write. So while the server runs those two
    // files exist; the store file itself is not changed, and both are gone at exit.
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
      await readOnlyCalls(client);
      expect(await recallCount(client, 'Baltic')).toBe(1);
      expect(snapshot(dir)['zenbrain.db']).toBe(atRest['zenbrain.db']);
    } finally {
      await client.close();
    }
    expect(snapshot(dir)).toEqual(atRest);

    const writer = await startServer(dir);
    try {
      await writer.callTool({ name: 'zenbrain_store', arguments: { content: 'Written after the reads.' } });
      expect(await recallCount(writer, 'Baltic')).toBe(1);
      expect(await recallCount(writer, 'written after the reads')).toBe(1);
    } finally {
      await writer.close();
    }
    expect(journalMode(file)).toBe('2/2');
  }, 30_000);

  it('creates the store with the first memory, where a second server finds it', async () => {
    const dir = tmp('zenbrain-ro-two-');
    const a = await startServer(dir);
    const b = await startServer(dir);
    try {
      expect(await recallCount(a, 'harbour')).toBe(0);
      await b.callTool({ name: 'zenbrain_store', arguments: { content: 'We met at the harbour.' } });
      expect(Object.keys(snapshot(dir))).toEqual(['zenbrain.db']);
      // `a` was started before the file existed and reads it from now on.
      expect(await recallCount(a, 'harbour')).toBe(1);
      await a.callTool({ name: 'zenbrain_store', arguments: { content: 'The harbour office opens at nine.' } });
      expect(await recallCount(b, 'harbour office')).toBeGreaterThan(0);
    } finally {
      await a.close();
      await b.close();
    }
    expect(Object.keys(snapshot(dir))).toEqual(['zenbrain.db']);
  }, 30_000);
});
