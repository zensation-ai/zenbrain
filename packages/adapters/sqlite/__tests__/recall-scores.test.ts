/**
 * One score model across layers (0.6.0), through the coordinator on a real SQLite database.
 *
 * Measured on 0.5.1 (SQLite, and over MCP): "Which city is the capital?" returned
 * `procedural 1.000 "How to bake bread"` first — a procedure that matched nothing, scored at
 * its success rate — then a core block at 0.500, and the actual hit `semantic 0.309` last.
 * Working memory without an embedding provider ignored the query ("trains" returned "boats"
 * at 1). The vector path returned cosine similarities down to −1.
 */
import { describe, it, expect } from 'vitest';
import { MemoryCoordinator, FakeEmbeddingProvider, type RecallLayer } from '@zensation/core';
import { createMemoryAdapter } from '../src/index.js';

const ALL: RecallLayer[] = ['working', 'episodic', 'semantic', 'procedural', 'core'];

describe('recall scores on SQLite', () => {
  it('ranks the real hit above a procedure that matches nothing, which scores 0', async () => {
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    await c.store('How to bake bread: knead, rest, bake.', { type: 'procedure' });
    await c.store('Kiel is the capital of Schleswig-Holstein.', { type: 'fact' });

    const results = await c.recall('Which city is the capital?', { layers: ['semantic', 'procedural'] });

    expect(results.map((r) => r.layer)).toEqual(['semantic', 'procedural']);
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[1].score).toBe(0);
    expect(results[1].confidence).toBe(1); // the success rate, where it belongs
    await c.close();
  });

  it('minScore above 0 drops the fallbacks; the default 0 keeps them behind the hits', async () => {
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    await c.store('How to bake bread: knead, rest, bake.', { type: 'procedure' });
    await c.store('Kiel is the capital of Schleswig-Holstein.', { type: 'fact' });
    await c.store('The user owns a red bicycle.', { type: 'fact' });

    const all = await c.recall('capital', { layers: ['semantic', 'procedural'] });
    const hits = await c.recall('capital', { layers: ['semantic', 'procedural'], minScore: 0.01 });

    // The fact layer has a hit, so it returns only hits; the procedure layer has none and
    // returns its fallback at 0.
    expect(all.map((r) => [r.layer, r.score > 0])).toEqual([['semantic', true], ['procedural', false]]);
    expect(hits.map((r) => r.content)).toEqual(['Kiel is the capital of Schleswig-Holstein.']);
    await expect(c.recall('capital', { minScore: 2 })).rejects.toThrow(RangeError);
    await c.close();
  });

  it('working memory without an embedding provider ranks by the query', async () => {
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    await c.store('The user collects model boats.', { type: 'fact' });
    await c.store('The user takes trains to work.', { type: 'fact' });
    await c.store('The user likes green tea.', { type: 'fact' });

    const results = await c.recall('trains', { layers: ['working'] });

    // 0.5.2 returned all three at 1.00, green tea first. Like the other layers, a layer with a
    // hit returns only hits; with none it returns the most relevant slots at 0.
    expect(results.map((r) => r.content)).toEqual(['The user takes trains to work.']);
    expect(results[0].score).toBeGreaterThan(0);
    const none = await c.recall('zebra', { layers: ['working'] });
    expect(none).toHaveLength(3);
    expect(none.every((r) => r.score === 0)).toBe(true);
    await c.close();
  });

  it('keeps every score in [0, 1], with and without an embedding provider', async () => {
    for (const embedding of [undefined, new FakeEmbeddingProvider()]) {
      const c = new MemoryCoordinator({ storage: createMemoryAdapter(), embedding });
      await c.store('How to rotate the staging key: open the vault, rotate, redeploy.', { type: 'procedure' });
      await c.store('The deploy failed on Friday and everyone was furious.', { type: 'episode', emotionalWeight: 0.9 });
      await c.store('The user lives in Hamburg.', { type: 'fact' });
      await c.store('The user prefers answers in German.', { type: 'core' });

      for (const query of ['Hamburg', 'zebra quantum', 'staging key', 'deploy']) {
        const results = await c.recall(query, { layers: ALL, limit: 50 });
        expect(results.length).toBeGreaterThan(0);
        for (const r of results) {
          expect(r.score, `${embedding ? 'vector' : 'lexical'} ${query} ${r.layer}`).toBeGreaterThanOrEqual(0);
          expect(r.score).toBeLessThanOrEqual(1);
        }
      }
      await c.close();
    }
  });
});
