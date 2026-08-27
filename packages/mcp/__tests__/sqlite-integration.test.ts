/**
 * The MCP surface over the storage a user actually gets.
 *
 * `server.test.ts` proves the protocol contract against an in-memory double that
 * cannot round-trip content. This file proves the part that only a real adapter
 * can: that `zenbrain_recall` hands the client back the text that was stored.
 *
 * Needs Node >= 22, because `better-sqlite3` 13 does. CI runs 22, 24 and 26. If
 * the native module cannot load, the suite says so loudly rather than reporting
 * a quiet pass — a check that never runs is worse than one that fails.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MemoryCoordinator, FakeEmbeddingProvider, InMemoryCache } from '@zensation/core';
import { createZenBrainServer } from '../src/server.js';

// The version gate has to come BEFORE the import. `better-sqlite3` 13 is a native
// module: on an unsupported Node it does not throw, it takes the worker down with
// it — so a try/catch around the import is not a guard, and the whole file would
// die together with the suites next to it.
const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
const SUPPORTED = NODE_MAJOR >= 22;

let sqlite: typeof import('@zensation/adapter-sqlite') | undefined;
let loadError: unknown;

if (SUPPORTED) {
  try {
    sqlite = await import('@zensation/adapter-sqlite');
  } catch (err) {
    loadError = err;
  }
} else {
  process.stderr.write(
    `\n[sqlite-integration] SKIPPED — Node ${process.version} is below the ` +
      `engines floor of >= 22 that better-sqlite3 13 requires. ` +
      `This suite is expected to RUN in CI (22, 24, 26); a green local run here ` +
      `proves nothing about it.\n\n`,
  );
}

const open: typeof describe.skip = sqlite ? describe : describe.skip;

let coordinator: MemoryCoordinator | undefined;
let client: Client | undefined;

async function connect() {
  coordinator = new MemoryCoordinator({
    storage: new sqlite!.SqliteAdapter({ filename: ':memory:' }),
    embedding: new FakeEmbeddingProvider(),
    cache: new InMemoryCache(),
  });
  const server = createZenBrainServer(coordinator);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'sqlite-test-client', version: '1.0.0' });
  await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
  return client;
}

afterEach(async () => {
  await client?.close();
  await coordinator?.close();
  client = undefined;
  coordinator = undefined;
});

open('the MCP surface over a real SQLite store', () => {
  it('loaded the adapter at all', () => {
    expect(loadError, String(loadError)).toBeUndefined();
  });

  it('recalls the text that was stored', async () => {
    const c = await connect();
    await c.callTool({
      name: 'zenbrain_store',
      arguments: { content: 'Anna moved to Hamburg in March.', type: 'fact' },
    });

    const res = await c.callTool({
      name: 'zenbrain_recall',
      arguments: { query: 'Anna Hamburg', limit: 5 },
    });
    expect(res.isError).toBeFalsy();

    const out = res.structuredContent as {
      count: number;
      skipped: number;
      results: { content: string; layer: string; score: number }[];
    };
    expect(out.count).toBeGreaterThan(0);
    expect(out.skipped).toBe(0);
    expect(out.results.some((r) => r.content.includes('Hamburg'))).toBe(true);
    for (const r of out.results) {
      expect(typeof r.content).toBe('string');
      expect(typeof r.layer).toBe('string');
      expect(typeof r.score).toBe('number');
    }
  });

  it('honours the layer filter on real data', async () => {
    const c = await connect();
    await c.callTool({
      name: 'zenbrain_store',
      arguments: { content: 'Redis listens on port 6379.', type: 'fact' },
    });

    const res = await c.callTool({
      name: 'zenbrain_recall',
      arguments: { query: 'Redis port', layers: ['semantic'], limit: 5 },
    });
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as { results: { layer: string }[] };
    expect(out.results.length).toBeGreaterThan(0);
    for (const r of out.results) expect(r.layer).toBe('semantic');
  });

  it('reports the stored fact in the health check', async () => {
    const c = await connect();
    await c.callTool({
      name: 'zenbrain_store',
      arguments: { content: 'The build runs on Node 22.', type: 'fact' },
    });

    const res = await c.callTool({ name: 'zenbrain_health', arguments: {} });
    expect(res.isError).toBeFalsy();
    const health = JSON.parse((res.content as { text: string }[])[0].text) as {
      semantic: { count: number };
    };
    expect(health.semantic.count).toBeGreaterThan(0);
  });
});
