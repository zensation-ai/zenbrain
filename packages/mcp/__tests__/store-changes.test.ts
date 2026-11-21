/**
 * What `zenbrain_store` changes in what is already stored, as its description says.
 *
 * `destructiveHint: false` claims a store only adds. Up to 0.3.1 the description
 * said both "storing the same core memory again updates it" and "Long-term memory
 * is never changed by a store". Measured on 0.3.1 and pinned here: the same core
 * memory stored again keeps its row and its content and gets a new `updated_at`,
 * nothing else; and once seven working-memory slots are held, a store drops the
 * oldest slot, which lives only in the server process. Long-term rows are only
 * ever added.
 */
import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MemoryCoordinator } from '@zensation/core';
import { SqliteAdapter } from '@zensation/adapter-sqlite';
import { createZenBrainServer } from '../src/server.js';

async function connect() {
  const storage = new SqliteAdapter({ filename: ':memory:', walMode: false });
  const coordinator = new MemoryCoordinator({ storage });
  const server = createZenBrainServer(coordinator);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'store-changes-test', version: '0' });
  await client.connect(clientSide);
  const db = storage.getDatabase();
  const rows = (table: string) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all() as Record<string, unknown>[];
  const close = async () => {
    await client.close();
    await coordinator.close();
  };
  return { client, rows, close };
}

describe('zenbrain_store only adds to what is stored', () => {
  it('the same core memory stored again keeps its row and content and only gets a new updated_at', async () => {
    const { client, rows, close } = await connect();
    try {
      const args = { content: 'The project is called ZenBrain.', type: 'core' as const };
      const first = await client.callTool({ name: 'zenbrain_store', arguments: args });
      const before = rows('core_memory_blocks');
      await new Promise((r) => setTimeout(r, 15));
      const second = await client.callTool({ name: 'zenbrain_store', arguments: args });
      const after = rows('core_memory_blocks');

      expect((second.structuredContent as { id: string }).id).toBe((first.structuredContent as { id: string }).id);
      expect(after).toHaveLength(1);
      expect(before).toHaveLength(1);
      const { updated_at: was, ...restBefore } = before[0];
      const { updated_at: now, ...restAfter } = after[0];
      expect(restAfter).toEqual(restBefore);
      expect(now).not.toBe(was);
    } finally {
      await close();
    }
  });

  it('eight stores add eight long-term rows and leave seven working-memory copies', async () => {
    const { client, rows, close } = await connect();
    try {
      const ids: string[] = [];
      for (let i = 1; i <= 8; i++) {
        const earlier = rows('learned_facts');
        const r = await client.callTool({ name: 'zenbrain_store', arguments: { content: `Plain note number ${i} for the count.`, type: 'fact' } });
        ids.push((r.structuredContent as { id: string }).id);
        // One row more; every row stored earlier is unchanged, column for column.
        const now = rows('learned_facts');
        expect(now).toHaveLength(earlier.length + 1);
        expect(now.filter((row) => earlier.some((e) => e.id === row.id))).toEqual(earlier);
      }
      const health = await client.callTool({ name: 'zenbrain_health', arguments: {} });
      expect((health.structuredContent as { working: { used: number } }).working.used).toBe(7);
      expect(rows('learned_facts')).toHaveLength(8);
    } finally {
      await close();
    }
  });
});
