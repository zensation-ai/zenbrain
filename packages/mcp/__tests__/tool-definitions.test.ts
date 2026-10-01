/**
 * What a client reads from tools/list and initialize (v0.4.9 round: F2, N14, N16).
 *
 * - zenbrain_recall offered `includeContext` and `taskType`, but no store path
 *   writes an encoding context and no recall path reads one back, so neither
 *   parameter could change a result. Its description also said "Read-only.",
 *   which the readOnlyHint annotation already says.
 * - initialize carried no `instructions`.
 * - zenbrain_store said steps are "Required when type is 'procedure'"; the
 *   coordinator derives them from the content when they are missing.
 * - server.json described ZENBRAIN_DB without the `~/` rule the README states.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MemoryCoordinator, FakeEmbeddingProvider, InMemoryCache } from '@zensation/core';
import { InMemoryStorage } from './helpers/in-memory-storage.js';
import { createZenBrainServer } from '../src/server.js';

let client: Client;
let coordinator: MemoryCoordinator;

beforeEach(async () => {
  coordinator = new MemoryCoordinator({
    storage: new InMemoryStorage(),
    embedding: new FakeEmbeddingProvider(),
    cache: new InMemoryCache(),
  });
  const server = createZenBrainServer(coordinator);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'definitions-test', version: '1.0.0' });
  await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
});

afterEach(async () => {
  await client.close();
  await coordinator.close();
});

async function tool(name: string) {
  const { tools } = await client.listTools();
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not listed`);
  return t;
}

describe('tool definitions', () => {
  it('zenbrain_recall offers only parameters that change the result', async () => {
    const t = await tool('zenbrain_recall');
    expect(Object.keys(t.inputSchema.properties ?? {}).sort()).toEqual(
      ['layers', 'limit', 'minConfidence', 'query'],
    );
  });

  it('zenbrain_recall leaves "read-only" to the annotation', async () => {
    const t = await tool('zenbrain_recall');
    expect(t.description).not.toMatch(/read-only/i);
    expect(t.annotations?.readOnlyHint).toBe(true);
  });

  it('every zenbrain_recall parameter says what it does', async () => {
    const props = (await tool('zenbrain_recall')).inputSchema.properties as Record<string, { description?: string }>;
    for (const [name, p] of Object.entries(props)) {
      expect(p.description, name).toMatch(/\S.{30,}/);
    }
  });

  it('zenbrain_store does not claim steps are required', async () => {
    const props = (await tool('zenbrain_store')).inputSchema.properties as Record<string, { description?: string }>;
    expect(props.steps.description).not.toMatch(/required/i);
    expect(props.steps.description).toMatch(/content/);
  });

  it('initialize carries instructions that name every tool', () => {
    const instructions = client.getInstructions() ?? '';
    for (const name of ['zenbrain_store', 'zenbrain_recall', 'zenbrain_consolidate', 'zenbrain_health']) {
      expect(instructions, name).toContain(name);
    }
  });
});

describe('server.json', () => {
  it('describes ZENBRAIN_DB with the same ~/ rule as the README', () => {
    const manifest = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8'));
    const env = manifest.packages[0].environmentVariables.find((e: { name: string }) => e.name === 'ZENBRAIN_DB');
    expect(env.description).toMatch(/~\//);
    expect(env.description).toMatch(/absolute/);
  });
});
