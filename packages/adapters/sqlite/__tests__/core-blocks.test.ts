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

  it('keeps two different memories apart, in any script', async () => {
    // Measured on 2026-09-28: labels were the first 50 characters with
    // everything outside [a-zA-Z0-9_ -] removed. Two Chinese sentences both
    // became "" and the second replaced the first; two English sentences
    // sharing their first 50 characters did the same.
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    const inhalte = [
      '用户喜欢简短的回答。',
      '项目从主分支部署。',
      'The user prefers short answers in German and English, always.',
      'The user prefers short answers in German and English, never with emojis.',
    ];
    for (const t of inhalte) await c.store(t, { type: 'core' });

    const blocks = await c.getCoreMemory().getBlocks();
    expect(blocks.map((b) => b.content).sort()).toEqual([...inhalte].sort());
    await c.close();
  });

  it('keeps the words of a label readable, umlauts included', async () => {
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    await c.store('Über die Präferenzen: kurz antworten.', { type: 'core' });
    const [block] = await c.getCoreMemory().getBlocks();
    expect(block.label.startsWith('Über die Präferenzen kurz antworten')).toBe(true);
    await c.close();
  });

  it('updates one block when the same memory is stored twice', async () => {
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    await c.store('The user prefers short answers.', { type: 'core' });
    await c.store('The user prefers short answers.', { type: 'core' });
    expect(await c.getCoreMemory().getBlocks()).toHaveLength(1);
    await c.close();
  });

  it('does not twin a block an earlier version labelled the old way', async () => {
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    // The old label: first 50 characters, [a-zA-Z0-9_ -] only.
    await c.getCoreMemory().upsertBlock('The user prefers short answers', 'The user prefers short answers.');
    await c.store('The user prefers short answers.', { type: 'core' });
    const blocks = await c.getCoreMemory().getBlocks();
    expect(blocks.map((b) => b.label)).toEqual(['The user prefers short answers']);
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
