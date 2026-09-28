/**
 * Core memory on SQLite, through the coordinator a user gets.
 *
 * Until booleans were bound as 1/0, `store(…, { type: 'core' })` and every
 * store with confidence above 0.9 failed here with "SQLite3 can only bind
 * numbers, strings, bigints, buffers, and null", and nothing was written —
 * measured on 2026-09-28 against the published @zensation/mcp 0.1.6.
 */
import { describe, it, expect } from 'vitest';
import { MemoryCoordinator } from '@zensation/core';
import { createMemoryAdapter } from '../src/index.js';

describe('core memory on SQLite', () => {
  it('stores a block by type and by high confidence, and reads it back pinned', async () => {
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    await c.store('The user prefers short answers.', { type: 'core' });
    await c.store('The project deploys from the main branch.', { confidence: 0.95 });

    const blocks = await c.getCoreMemory().getBlocks();
    expect(blocks.map((b) => b.content).sort()).toEqual([
      'The project deploys from the main branch.',
      'The user prefers short answers.',
    ]);
    // A real boolean, not the 1 SQLite stores: the type says boolean.
    for (const b of blocks) expect(b.pinned).toBe(true);
    await c.close();
  });

  it('keeps an explicit unpinned block unpinned', async () => {
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    const block = await c.getCoreMemory().upsertBlock('scratch', 'temporary note', false);
    expect(block.pinned).toBe(false);
    expect((await c.getCoreMemory().getBlock('scratch'))?.pinned).toBe(false);
    await c.close();
  });
});
