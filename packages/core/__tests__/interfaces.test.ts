import { describe, it, expect } from 'vitest';
import { InMemoryStorage, FakeEmbeddingProvider, InMemoryCache } from '../src/testing';
import { cosineSimilarity, formatForPgVector, noopLogger } from '../src/types';

describe('InMemoryStorage', () => {
  it('should handle basic INSERT and SELECT', async () => {
    const storage = new InMemoryStorage();
    await storage.query('INSERT INTO test_table (id, name) VALUES ($1, $2)', ['id1', 'Alice']);
    const result = await storage.query('SELECT * FROM test_table');
    expect(result.rows).toHaveLength(1);
  });

  it('should support transactions', async () => {
    const storage = new InMemoryStorage();
    const result = await storage.transaction(async (tx) => {
      await tx.query('INSERT INTO tx_table (id) VALUES ($1)', ['1']);
      return 'done';
    });
    expect(result).toBe('done');
  });

  it('should clear all data', async () => {
    const storage = new InMemoryStorage();
    await storage.query('INSERT INTO t (id) VALUES ($1)', ['1']);
    storage.clear();
    const result = await storage.query('SELECT * FROM t');
    expect(result.rows).toHaveLength(0);
  });
});

describe('FakeEmbeddingProvider', () => {
  it('should return vectors of correct dimensions', async () => {
    const provider = new FakeEmbeddingProvider(16);
    const vec = await provider.embed('hello world');
    expect(vec).toHaveLength(16);
    expect(provider.dimensions()).toBe(16);
  });

  it('should return deterministic embeddings', async () => {
    const provider = new FakeEmbeddingProvider();
    const a = await provider.embed('test');
    const b = await provider.embed('test');
    expect(a).toEqual(b);
  });

  it('should return different embeddings for different texts', async () => {
    const provider = new FakeEmbeddingProvider();
    const a = await provider.embed('hello');
    const b = await provider.embed('world');
    expect(a).not.toEqual(b);
  });

  it('should support batch embedding', async () => {
    const provider = new FakeEmbeddingProvider();
    const results = await provider.embedBatch(['a', 'b', 'c']);
    expect(results).toHaveLength(3);
    results.forEach(vec => expect(vec).toHaveLength(8));
  });
});

describe('InMemoryCache', () => {
  it('should get and set values', async () => {
    const cache = new InMemoryCache();
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
  });

  it('should return null for missing keys', async () => {
    const cache = new InMemoryCache();
    const result = await cache.get('missing');
    expect(result).toBeNull();
  });

  it('should delete keys', async () => {
    const cache = new InMemoryCache();
    await cache.set('key', 'value');
    await cache.del('key');
    const result = await cache.get('key');
    expect(result).toBeNull();
  });
});

describe('Utility functions', () => {
  it('cosineSimilarity should return 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1.0);
  });

  it('cosineSimilarity should return 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it('cosineSimilarity should handle empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('formatForPgVector should format correctly', () => {
    expect(formatForPgVector([1.0, 2.5, 3.0])).toBe('[1,2.5,3]');
  });

  it('noopLogger should not throw', () => {
    expect(() => {
      noopLogger.debug('test');
      noopLogger.info('test');
      noopLogger.warn('test');
      noopLogger.error('test');
    }).not.toThrow();
  });
});
