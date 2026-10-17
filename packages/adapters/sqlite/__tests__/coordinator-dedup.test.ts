/**
 * Recall deduplication and working memory through the coordinator, on a real SQLite database.
 *
 * Moved from packages/core in 0.6.0. There the first two tests ran on `InMemoryStorage`, which
 * cannot round-trip content: measured on 2026-10-17, both recalls returned zero results, so
 * "no result has undefined content" and "every content is unique" held for an empty list and
 * the tests were green without testing anything. Each test here asserts that it has hits.
 */
import { describe, it, expect } from 'vitest';
import { MemoryCoordinator, FakeEmbeddingProvider } from '@zensation/core';
import { createMemoryAdapter } from '../src/index.js';

describe('MemoryCoordinator deduplication on SQLite', () => {
  it('returns only results with content', async () => {
    const coordinator = new MemoryCoordinator({ storage: createMemoryAdapter(), embedding: new FakeEmbeddingProvider() });
    await coordinator.store('Alice lives in Berlin');
    await coordinator.store('Bob works as an engineer');

    const results = await coordinator.recall('Where does Alice live?');

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.content === 'Alice lives in Berlin')).toBe(true);
    for (const r of results) expect(typeof r.content).toBe('string');
    await coordinator.close();
  });

  it('returns identical content once and names the copy it left out', async () => {
    const coordinator = new MemoryCoordinator({ storage: createMemoryAdapter(), embedding: new FakeEmbeddingProvider() });
    const first = await coordinator.store('The capital of France is Paris', { type: 'fact' });
    const second = await coordinator.store('The capital of France is Paris', { type: 'fact' });

    const results = await coordinator.recall('capital of France');

    const paris = results.filter((r) => r.content === 'The capital of France is Paris');
    expect(paris).toHaveLength(1);
    expect([paris[0].id, ...(paris[0].duplicates ?? []).map((d) => d.id)].sort()).toEqual([first, second].sort());
    await coordinator.close();
  });

  // Up to 0.5.1 the similarity check dropped every word of two characters or
  // fewer, so "Locker code is 47" and "Locker code is 81" both became
  // {locker, code}, scored 1.0, and recall returned only one of the two facts.
  it('keeps memories that differ only in a short word or number', async () => {
    const coordinator = new MemoryCoordinator({ storage: createMemoryAdapter() });
    const facts = ['Locker code is 47', 'Locker code is 81', 'Server A is up', 'Server B is up'];
    for (const f of facts) await coordinator.store(f, { type: 'fact' });

    const results = await coordinator.recall('Locker code Server', { layers: ['semantic'], limit: 10 });
    expect(results.map((r) => r.content).sort()).toEqual([...facts].sort());
    await coordinator.close();
  });

  it('still treats the same words in another case or with punctuation as one memory', async () => {
    const coordinator = new MemoryCoordinator({ storage: createMemoryAdapter() });
    await coordinator.store('The capital of France is Paris.', { type: 'fact' });
    await coordinator.store('the capital of france is paris', { type: 'fact' });

    const results = await coordinator.recall('capital France Paris', { layers: ['semantic'], limit: 10 });
    expect(results).toHaveLength(1);
    expect(results[0].duplicates).toHaveLength(1);
    await coordinator.close();
  });
});

// The MCP server runs the coordinator without an embedding provider, stores every
// memory into working memory at relevance 1.0 and never decays between stores.
describe('MemoryCoordinator working memory on SQLite', () => {
  it('keeps the most recent stores once working memory is full', async () => {
    const coordinator = new MemoryCoordinator({ storage: createMemoryAdapter() });
    for (let i = 1; i <= 9; i++) {
      await coordinator.store(`note number ${i}`, { type: 'fact' });
    }

    const health = await coordinator.getHealth();
    expect(health.working).toEqual({ used: 7, max: 7 });
    expect(health.semantic.count).toBe(9);

    const recalled = await coordinator.recall('note', { layers: ['working'], limit: 10 });
    const contents = recalled.map((r) => r.content);
    // A recall takes at most five working-memory results; all of them are among the newest seven.
    expect(contents).toHaveLength(5);
    expect(contents).toContain('note number 9');
    expect(contents).not.toContain('note number 1');
    expect(contents).not.toContain('note number 2');
    await coordinator.close();
  });
});
