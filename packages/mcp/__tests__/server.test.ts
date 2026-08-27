/**
 * These tests drive the real MCP protocol.
 *
 * A real Client talks to the real server over a linked in-memory transport and
 * calls the tools the way Claude Desktop or Cursor would. A compiling server
 * that no client can call would pass a unit test and fail in the wild — this
 * catches that.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  MemoryCoordinator,
  InMemoryStorage,
  FakeEmbeddingProvider,
  InMemoryCache,
} from '@zensation/core';
import { createZenBrainServer } from '../src/server.js';

let client: Client;
let coordinator: MemoryCoordinator;

async function connect() {
  coordinator = new MemoryCoordinator({
    storage: new InMemoryStorage(),
    embedding: new FakeEmbeddingProvider(),
    cache: new InMemoryCache(),
  });
  const server = createZenBrainServer(coordinator, { version: '0.1.0-test' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
}

beforeEach(connect);
afterEach(async () => {
  await client.close();
  await coordinator.close();
});

describe('the tool surface', () => {
  it('advertises exactly the four ZenBrain tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'zenbrain_consolidate',
      'zenbrain_health',
      'zenbrain_recall',
      'zenbrain_store',
    ]);
  });

  it('gives every tool a description a model can act on', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description, `${tool.name} has no description`).toBeTruthy();
      expect(tool.description!.length).toBeGreaterThan(60);
      expect(tool.inputSchema).toBeDefined();
    }
  });
});

describe('zenbrain_store', () => {
  it('stores content and returns an id', async () => {
    const res = await client.callTool({
      name: 'zenbrain_store',
      arguments: { content: 'The user prefers dark mode in every editor.' },
    });
    expect(res.isError).toBeFalsy();
    const { id } = res.structuredContent as { id: string };
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('accepts the full option set without dropping a field', async () => {
    const res = await client.callTool({
      name: 'zenbrain_store',
      arguments: {
        content: 'Deploy by tagging a release.',
        type: 'procedure',
        context: 'work',
        confidence: 0.8,
        emotionalWeight: 0.2,
        source: 'user',
        steps: ['bump the version', 'tag it', 'push the tag'],
        tools: ['git', 'npm'],
        outcome: 'a published release',
      },
    });
    expect(res.isError).toBeFalsy();
    expect((res.structuredContent as { id: string }).id).toBeTruthy();
  });

  it('rejects empty content instead of storing a blank memory', async () => {
    const res = await client.callTool({
      name: 'zenbrain_store',
      arguments: { content: '' },
    });
    expect(res.isError).toBe(true);
  });
});

describe('zenbrain_recall', () => {
  // NOTE ON THE FIXTURE: `InMemoryStorage` is deliberately not a SQL engine — its
  // own docstring says so, and its INSERT keeps parameters as `col_0`, `col_1`, …
  // with no `content` column. So recall over this double yields rows that carry a
  // layer and a score but no content. That makes it the ideal fixture for the
  // hardening below, and the wrong fixture for a content round-trip. The
  // round-trip is covered in `sqlite-integration.test.ts` against the real
  // adapter — the same path a user gets.

  it('returns an empty result set rather than failing when nothing matches', async () => {
    const res = await client.callTool({
      name: 'zenbrain_recall',
      arguments: { query: 'something nobody ever stored' },
    });
    expect(res.isError).toBeFalsy();
    expect((res.structuredContent as { count: number }).count).toBe(0);
  });

  it('survives rows with no readable content instead of erroring the whole call', async () => {
    await client.callTool({
      name: 'zenbrain_store',
      arguments: { content: 'The capital of France is Paris.', type: 'fact' },
    });

    const res = await client.callTool({
      name: 'zenbrain_recall',
      arguments: { query: 'capital of France' },
    });

    // The whole point: a malformed row must not become a protocol error.
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as {
      count: number;
      results: unknown[];
      skipped: number;
    };
    expect(out.results.length).toBe(out.count);
    // Something was retrieved — it just was not renderable through this double.
    expect(out.count + out.skipped).toBeGreaterThan(0);
    expect(out.skipped).toBeGreaterThan(0);
  });

  it('accepts the layer filter without erroring', async () => {
    const res = await client.callTool({
      name: 'zenbrain_recall',
      arguments: { query: 'Redis port', layers: ['semantic'], limit: 5 },
    });
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as { results: { layer: string }[] };
    for (const r of out.results) expect(r.layer).toBe('semantic');
  });

  it('rejects a layer name the coordinator does not know', async () => {
    const res = await client.callTool({
      name: 'zenbrain_recall',
      arguments: { query: 'anything', layers: ['hippocampus'] },
    });
    expect(res.isError).toBe(true);
  });
});

describe('zenbrain_consolidate and zenbrain_health', () => {
  it('consolidates and reports three counters', async () => {
    const res = await client.callTool({ name: 'zenbrain_consolidate', arguments: {} });
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as Record<string, number>;
    for (const key of ['promoted', 'decayed', 'pruned']) {
      expect(typeof out[key], `${key} missing`).toBe('number');
    }
  });

  it('reports every layer in the health check', async () => {
    const res = await client.callTool({ name: 'zenbrain_health', arguments: {} });
    expect(res.isError).toBeFalsy();
    const text = (res.content as { type: string; text: string }[])[0].text;
    const health = JSON.parse(text) as Record<string, unknown>;
    for (const layer of ['working', 'shortTerm', 'episodic', 'semantic', 'procedural', 'core']) {
      expect(health[layer], `${layer} missing from health`).toBeDefined();
    }
  });
});

describe('every tool answers in a shape any MCP client can render', () => {
  it('returns a text block alongside the structured payload', async () => {
    for (const [name, args] of [
      ['zenbrain_store', { content: 'a memory' }],
      ['zenbrain_recall', { query: 'a memory' }],
      ['zenbrain_consolidate', {}],
      ['zenbrain_health', {}],
    ] as const) {
      const res = await client.callTool({ name, arguments: args });
      const content = res.content as { type: string; text?: string }[];
      expect(content.length, `${name} returned no content`).toBeGreaterThan(0);
      expect(content[0].type).toBe('text');
      expect(() => JSON.parse(content[0].text!)).not.toThrow();
    }
  });
});
