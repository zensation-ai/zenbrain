/**
 * The two tools annotated `readOnlyHint: true` — `zenbrain_recall` and
 * `zenbrain_health` — must leave the store's directory exactly as they found it.
 *
 * Measured on 0.3.1 (2026-11-20): neither tool changes a row, but the store was
 * opened in WAL mode, and the first read after opening (or after a write) wrote
 * SQLite's read mark into `zenbrain.db-shm`. A checker that compares the files
 * before and after a read-only call sees that as a change. The server now opens
 * the store with a rollback journal, so a read touches no file at all.
 *
 * The test spawns the built entry point in an empty directory, the way an MCP
 * client starts it, and compares name, size and sha256 of every file there.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = dirname(fileURLToPath(import.meta.url));
const builtEntry = join(here, '..', 'dist', 'index.js');

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) {
    const bytes = readFileSync(join(dir, name));
    out[name] = `${bytes.length}:${createHash('sha256').update(bytes).digest('hex')}`;
  }
  return out;
}

async function startServer(cwd: string): Promise<Client> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ZENBRAIN_DB') env[k] = v;
  }
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [builtEntry],
    cwd,
    env,
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

describe('read-only tools leave the store directory unchanged', () => {
  beforeAll(() => {
    if (!existsSync(builtEntry)) throw new Error(`build first: ${builtEntry} is missing`);
  });

  it('on a fresh store in an empty directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zenbrain-ro-'));
    const client = await startServer(dir);
    try {
      const before = snapshot(dir);
      expect(Object.keys(before)).toEqual(['zenbrain.db']);
      await readOnlyCalls(client);
      expect(snapshot(dir)).toEqual(before);
    } finally {
      await client.close();
    }
  }, 30_000);

  it('after memories were stored', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zenbrain-ro-'));
    const client = await startServer(dir);
    try {
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
      const before = snapshot(dir);
      await readOnlyCalls(client);
      expect(snapshot(dir)).toEqual(before);
    } finally {
      await client.close();
    }
  }, 30_000);
});
