/**
 * `zenbrain_recall` on a store another program holds locked, end to end: the built server
 * started over stdio, its own store file, and a second connection that holds `BEGIN EXCLUSIVE`.
 *
 * Measured on 0.3.2 (2026-11-21): recall waited about 5 seconds per layer and then answered
 * `count: 0` without `isError`, 20.8 seconds after the call, while `zenbrain_health` returned
 * "database is locked" as an error. A locked store looked like an empty one. With core 0.7.0,
 * recall throws when a layer cannot read the store, and the tool returns that as its error.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SqliteAdapter } from '@zensation/adapter-sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const builtEntry = join(here, '..', 'dist', 'index.js');

function childEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ZENBRAIN_DB') env[k] = v;
  }
  return { ...env, ...extra };
}

describe('zenbrain_recall on a locked store', () => {
  beforeAll(() => {
    if (!existsSync(builtEntry)) throw new Error(`build first: ${builtEntry} is missing`);
  });

  it('returns an error naming the lock, not an empty result, and finds the memory once the lock is gone', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'zenbrain-recall-locked-')));
    const filename = join(dir, 'memory.db');
    const transport = new StdioClientTransport({
      command: process.execPath, args: [builtEntry], cwd: dir, env: childEnv({ ZENBRAIN_DB: filename }), stderr: 'ignore',
    });
    const client = new Client({ name: 'recall-locked-test', version: '0' });
    await client.connect(transport);
    const recall = () => client.callTool({ name: 'zenbrain_recall', arguments: { query: 'ferry Laboe', minScore: 0.01 } }, undefined, { timeout: 90_000 });
    try {
      const stored = await client.callTool({ name: 'zenbrain_store', arguments: { content: 'The ferry to Laboe leaves at noon.', type: 'fact' } });
      expect(stored.isError).toBeFalsy();
      expect((await recall()).structuredContent).toMatchObject({ count: 1 });

      // A second connection, as another program would hold it. The server's store has a
      // rollback journal (0.3.2 creates it with walMode false), so readers wait for the lock.
      const holder = new SqliteAdapter({ filename, walMode: false });
      const db = holder.getDatabase();
      db.exec('BEGIN EXCLUSIVE');
      let locked: Awaited<ReturnType<typeof recall>>;
      try {
        locked = await recall();
      } finally {
        db.exec('ROLLBACK');
        await holder.close();
      }
      // On 0.3.2: no isError and count 0.
      expect(locked.structuredContent).toBeUndefined();
      expect(locked.isError).toBe(true);
      expect(JSON.stringify(locked.content)).toMatch(/database is locked/);

      expect((await recall()).structuredContent).toMatchObject({ count: 1 });
    } finally {
      await client.close();
    }
  }, 120_000);
});
