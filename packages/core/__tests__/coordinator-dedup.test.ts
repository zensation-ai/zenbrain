import { describe, it, expect } from 'vitest';
import { MemoryCoordinator, FakeEmbeddingProvider, InMemoryCache } from '../src/index';
import { InMemoryStorage } from '../src/testing';

describe('MemoryCoordinator deduplication', () => {
  it('should not crash when recall results contain undefined content', async () => {
    const coordinator = new MemoryCoordinator({
      storage: new InMemoryStorage(),
      embedding: new FakeEmbeddingProvider(),
      cache: new InMemoryCache(),
    });

    await coordinator.store('Alice lives in Berlin');
    await coordinator.store('Bob works as an engineer');

    const results = await coordinator.recall('Where does Alice live?');
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);

    for (const r of results) {
      expect(r.content).toBeDefined();
      expect(typeof r.content).toBe('string');
    }

    await coordinator.close();
  });

  it('should deduplicate identical content across layers', async () => {
    const coordinator = new MemoryCoordinator({
      storage: new InMemoryStorage(),
      embedding: new FakeEmbeddingProvider(),
      cache: new InMemoryCache(),
    });

    await coordinator.store('The capital of France is Paris', { type: 'fact' });
    await coordinator.store('The capital of France is Paris', { type: 'fact' });

    const results = await coordinator.recall('capital of France');
    const contents = results.map(r => r.content);
    const unique = new Set(contents);
    expect(unique.size).toBe(contents.length);

    await coordinator.close();
  });

  // Up to 0.5.1 the similarity check dropped every word of two characters or
  // fewer, so "Locker code is 47" and "Locker code is 81" both became
  // {locker, code}, scored 1.0, and recall returned only one of the two facts.
  it('keeps memories that differ only in a short word or number', async () => {
    const coordinator = new MemoryCoordinator({ storage: new InMemoryStorage() });
    const facts = ['Locker code is 47', 'Locker code is 81', 'Server A is up', 'Server B is up'];
    for (const f of facts) await coordinator.store(f, { type: 'fact' });

    const results = await coordinator.recall('anything', { layers: ['working'], limit: 10 });
    expect(results.map(r => r.content).sort()).toEqual([...facts].sort());

    await coordinator.close();
  });

  it('still treats the same words in another case or with punctuation as one memory', async () => {
    const coordinator = new MemoryCoordinator({ storage: new InMemoryStorage() });
    await coordinator.store('The capital of France is Paris.', { type: 'fact' });
    await coordinator.store('the capital of france is paris', { type: 'fact' });

    const results = await coordinator.recall('anything', { layers: ['working'], limit: 10 });
    expect(results).toHaveLength(1);

    await coordinator.close();
  });
});
