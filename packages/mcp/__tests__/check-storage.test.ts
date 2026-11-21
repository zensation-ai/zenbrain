/**
 * `checkStorage` runs, and is awaited, before every tool. A synchronous throw and
 * a rejected promise both turn into the tool's error result, and the tool does
 * not run. Up to the review of the 0.3.2 draft the option was called without
 * `await`, so a rejected promise went unhandled and the tool ran anyway.
 */
import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MemoryCoordinator } from '@zensation/core';
import { SqliteAdapter } from '@zensation/adapter-sqlite';
import { createZenBrainServer } from '../src/server.js';

const TOOLS: Array<[string, Record<string, unknown>]> = [
  ['zenbrain_store', { content: 'should not be stored' }],
  ['zenbrain_recall', { query: 'anything' }],
  ['zenbrain_forget', { id: '00000000-0000-4000-8000-000000000000', layer: 'semantic' }],
  ['zenbrain_consolidate', {}],
  ['zenbrain_health', {}],
];

async function withCheck(check: () => void | Promise<void>) {
  const storage = new SqliteAdapter({ filename: ':memory:', walMode: false });
  const coordinator = new MemoryCoordinator({ storage });
  const server = createZenBrainServer(coordinator, { checkStorage: check });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'check-storage-test', version: '0' });
  await client.connect(a);
  return { client, coordinator };
}

describe('checkStorage', () => {
  for (const [kind, check] of [
    ['a synchronous throw', () => { throw new Error('store unavailable'); }],
    ['a rejected promise', async () => { throw new Error('store unavailable'); }],
  ] as const) {
    it(`turns ${kind} into an error from every tool, and the tool does not run`, async () => {
      const { client, coordinator } = await withCheck(check);
      try {
        for (const [name, args] of TOOLS) {
          const r = await client.callTool({ name, arguments: args });
          expect(r.isError, name).toBe(true);
          expect(JSON.stringify(r.content), name).toContain('store unavailable');
        }
        expect((await coordinator.getHealth()).semantic.count).toBe(0);
      } finally {
        await client.close();
        await coordinator.close();
      }
    });
  }
});
