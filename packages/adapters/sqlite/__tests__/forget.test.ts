/**
 * Forgetting by id, through the coordinator a user gets, on a real SQLite database.
 *
 * Until 0.5.0 nothing that stored a memory could take it back: the layers had
 * `delete`, but `MemoryCoordinator` had no verb for it and `RecallResult` carried
 * no id to address a hit with (Agent Memory Atlas and Glama, 30.09.2026).
 */
import { describe, it, expect } from 'vitest';
import { MemoryCoordinator, type RecallLayer } from '@zensation/core';
import { createMemoryAdapter } from '../src/index.js';

const LONG_TERM: { layer: RecallLayer; content: string; type: 'fact' | 'episode' | 'procedure' | 'core' }[] = [
  { layer: 'semantic', content: 'The user lives in Hamburg.', type: 'fact' },
  { layer: 'episodic', content: 'Yesterday the deploy failed and everyone was furious.', type: 'episode' },
  { layer: 'procedural', content: 'How to rotate the staging key: open the vault, rotate, redeploy.', type: 'procedure' },
  { layer: 'core', content: 'The user prefers answers in German.', type: 'core' },
];

async function hit(c: MemoryCoordinator, layer: RecallLayer, content: string) {
  const results = await c.recall(content, { layers: [layer], limit: 50 });
  return results.find((r) => r.content.includes(content));
}

describe('forget by id', () => {
  it('gives every recall result an id and deletes it from its layer', async () => {
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    for (const m of LONG_TERM) await c.store(m.content, { type: m.type });

    for (const m of LONG_TERM) {
      const found = await hit(c, m.layer, m.content);
      expect(found, `${m.layer} before forget`).toBeDefined();
      expect(found!.id).toMatch(/^[0-9a-f-]{36}$/i);

      expect(await c.forget(found!.id, m.layer)).toBe(true);
      expect(await hit(c, m.layer, m.content), `${m.layer} after forget`).toBeUndefined();
    }
    await c.close();
  });

  it('leaves the other memories alone', async () => {
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    await c.store('The user lives in Hamburg.', { type: 'fact' });
    await c.store('The user works at a shipyard.', { type: 'fact' });

    const hamburg = await hit(c, 'semantic', 'The user lives in Hamburg.');
    await c.forget(hamburg!.id, 'semantic');

    expect(await hit(c, 'semantic', 'The user works at a shipyard.')).toBeDefined();
    expect(await c.getSemanticMemory().count()).toBe(1);
    await c.close();
  });

  it('reports an unknown or malformed id as not found instead of throwing', async () => {
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    await c.store('The user lives in Hamburg.', { type: 'fact' });

    for (const layer of ['episodic', 'semantic', 'procedural', 'core', 'working'] as RecallLayer[]) {
      expect(await c.forget('00000000-0000-4000-8000-000000000000', layer)).toBe(false);
      expect(await c.forget('not-an-id', layer)).toBe(false);
    }
    expect(await c.getSemanticMemory().count()).toBe(1);
    await c.close();
  });

  it('removes the working-memory copy only when that result is forgotten too', async () => {
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    await c.store('The user lives in Hamburg.', { type: 'fact' });

    const fact = await hit(c, 'semantic', 'The user lives in Hamburg.');
    await c.forget(fact!.id, 'semantic');
    const copy = await hit(c, 'working', 'The user lives in Hamburg.');
    expect(copy).toBeDefined();

    expect(await c.forget(copy!.id, 'working')).toBe(true);
    expect(await hit(c, 'working', 'The user lives in Hamburg.')).toBeUndefined();
    await c.close();
  });
});
