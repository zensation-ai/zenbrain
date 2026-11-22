/**
 * What `recall()` does when a layer cannot be searched.
 *
 * Measured on 2026-11-22 against the published core 0.6.1 and adapter-sqlite 0.2.8: with a
 * rollback journal (`walMode: false`) and a second connection holding `BEGIN EXCLUSIVE`, recall
 * returned an empty list without an error after 20.9 seconds (about 5 seconds of busy timeout per
 * layer), while `getHealth()` reported "database is locked". Every layer caught its error and
 * only logged a warning, so a store that could not be read looked like a store in which nothing
 * matched. Since 0.7.0 a storage error makes recall throw an AggregateError with the error of each
 * layer; a failing embedding provider is tolerated as before.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { MemoryCoordinator, type EmbeddingProvider } from '@zensation/core';
import { SqliteAdapter, createMemoryAdapter } from '../src/index.js';

async function lockedStore() {
  const filename = join(mkdtempSync(join(tmpdir(), 'zenbrain-recall-lock-')), 'memory.db');
  // A short busy timeout keeps the test fast; the default is 5 seconds per query.
  const storage = new SqliteAdapter({ filename, walMode: false, busyTimeoutMs: 100 });
  const c = new MemoryCoordinator({ storage });
  await c.store('The ferry to Laboe leaves at noon.', { type: 'fact' });
  await c.store('The ferry crossing in the storm was terrifying and awful.', { type: 'episode', emotionalWeight: 0.9 });
  await c.store('How to book the ferry: open the app, pick Laboe, pay.', { type: 'procedure' });
  await c.store('The user lives in Kiel.', { type: 'core' });
  return { filename, c };
}

describe('recall when the storage fails', () => {
  it('throws an AggregateError with the error of each layer while another connection holds the store locked', async () => {
    const { filename, c } = await lockedStore();
    expect((await c.recall('ferry Laboe')).filter((r) => r.score > 0).length).toBeGreaterThan(0);

    const holder = new Database(filename);
    holder.exec('BEGIN EXCLUSIVE');
    let outcome: { results: unknown[] } | { error: unknown };
    try {
      outcome = await c.recall('ferry Laboe').then((results) => ({ results }), (error: unknown) => ({ error }));
    } finally {
      holder.exec('ROLLBACK');
      holder.close();
    }
    // Before 0.7.0: { results: [] }.
    expect(outcome).not.toHaveProperty('results');
    const error = (outcome as { error: unknown }).error;
    expect(error).toBeInstanceOf(AggregateError);
    const { errors, message } = error as AggregateError;
    expect(errors).toHaveLength(4);
    for (const e of errors) expect((e as Error).message).toMatch(/database is locked/);
    expect(message).toMatch(/episodic, semantic, procedural, core/);
    expect(message).toMatch(/database is locked/);

    // Working memory lives in the process and answers while the store is locked.
    const blocker = new Database(filename);
    blocker.exec('BEGIN EXCLUSIVE');
    try {
      const working = await c.recall('ferry Laboe', { layers: ['working'] });
      expect(working.some((r) => r.content.includes('Laboe'))).toBe(true);
    } finally {
      blocker.exec('ROLLBACK');
      blocker.close();
    }

    // Once the lock is gone, recall finds the memories again.
    expect((await c.recall('ferry Laboe')).filter((r) => r.score > 0).length).toBeGreaterThan(0);
    await c.close();
  }, 60_000);

  it('throws for the one layer whose table is missing instead of leaving that layer out', async () => {
    const storage = createMemoryAdapter();
    const c = new MemoryCoordinator({ storage });
    await c.store('The ferry to Laboe leaves at noon.', { type: 'fact' });
    storage.getDatabase().exec('DROP TABLE procedural_memories');

    const outcome = await c.recall('ferry Laboe').then((results) => ({ results }), (error: unknown) => ({ error }));
    // Before 0.7.0: the fact came back and procedural memory silently dropped out.
    expect(outcome).not.toHaveProperty('results');
    const error = (outcome as { error: unknown }).error as AggregateError;
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toHaveLength(1);
    expect(error.message).toMatch(/procedural/);
    expect(error.message).toMatch(/no such table: procedural_memories/);

    // Leaving the layer out is the way to search the others.
    const others = await c.recall('ferry Laboe', { layers: ['episodic', 'semantic', 'core'] });
    expect(others.some((r) => r.content.includes('Laboe'))).toBe(true);
    await c.close();
  });

  it('tolerates a failing embedding provider as before: the layers that need it contribute nothing', async () => {
    const failing: EmbeddingProvider = {
      embed: async () => { throw new Error('embedding service down'); },
      embedBatch: async () => { throw new Error('embedding service down'); },
      dimensions: () => 8,
    };
    const c = new MemoryCoordinator({ storage: createMemoryAdapter(), embedding: failing });
    await c.store('The ferry to Laboe leaves at noon.', { type: 'fact' });
    await c.store('The user lives in Kiel.', { type: 'core' });

    const results = await c.recall('ferry Laboe');
    expect(results.map((r) => r.layer)).toEqual(['core']);
    await c.close();
  });
});
