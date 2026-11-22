/**
 * `Episode.metadata` is declared as an object. SQLite keeps the column as JSON text, and the
 * episodic layer handed that text back as it was: measured on 2026-11-22 against the published
 * core 0.6.1, `getById` and `getRecent` returned a string and `store()` returned no metadata at
 * all, while recall (through the coordinator) gave an object. PostgreSQL returns JSONB parsed,
 * so it was right there. Every read path now returns an object, and `store()` the one it got.
 */
import { describe, it, expect } from 'vitest';
import { MemoryCoordinator } from '@zensation/core';
import { createMemoryAdapter } from '../src/index.js';

describe('episode metadata on SQLite', () => {
  it('comes back as an object from store, getById, getRecent, getByTimeRange and findConsolidatedInto', async () => {
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    const episodic = c.getEpisodicMemory();

    const stored = await episodic.store('A quiet evening walk by the harbour.', 'privat', 0.9, { ort: 'Kiel' });
    expect(stored.metadata).toEqual({ ort: 'Kiel' });

    const byId = await episodic.getById(stored.id);
    expect(typeof byId?.metadata).toBe('object');
    expect(byId?.metadata?.ort).toBe('Kiel');

    const [recent] = await episodic.getRecent(5);
    expect(recent.metadata).toEqual({ ort: 'Kiel' });

    const [inRange] = await episodic.getByTimeRange(new Date(Date.now() - 60_000), new Date(Date.now() + 60_000));
    expect(inRange.metadata).toEqual({ ort: 'Kiel' });

    // consolidate() adds its mark to the metadata; the episode's own keys stay.
    expect((await c.consolidate()).promoted).toBe(1);
    const fact = (await c.getSemanticMemory().getRecent(1))[0];
    const [linked] = await episodic.findConsolidatedInto(fact.id);
    expect(linked.metadata).toEqual({ ort: 'Kiel', consolidatedInto: fact.id });
    await c.close();
  });

  it('is undefined, not null or text, for an episode stored without metadata', async () => {
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    const episodic = c.getEpisodicMemory();
    const stored = await episodic.store('The ferry was late again.', undefined, 0.2);
    expect(stored.metadata).toBeUndefined();
    expect((await episodic.getById(stored.id))?.metadata).toBeUndefined();
    expect((await episodic.getRecent(1))[0].metadata).toBeUndefined();
    await c.close();
  });
});
