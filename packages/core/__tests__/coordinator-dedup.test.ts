import { describe, it, expect } from 'vitest';
import { MemoryCoordinator, InMemoryStorage, FakeEmbeddingProvider, InMemoryCache } from '../src/index';

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
});
