import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrossContextMemory } from '../src/layers/cross-context';
import type { StorageAdapter } from '../src/interfaces/storage';

function createMockStorage(): StorageAdapter & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    transaction: vi.fn(async (fn) => fn(createMockStorage())),
  };
}

describe('CrossContextMemory', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let crossCtx: CrossContextMemory;
  const contexts = ['personal', 'work'];

  beforeEach(() => {
    storage = createMockStorage();
    crossCtx = new CrossContextMemory({ storage, contexts });
  });

  it('creates an instance with default config', () => {
    expect(crossCtx).toBeInstanceOf(CrossContextMemory);
  });

  it('creates an instance with custom similarity threshold', () => {
    const custom = new CrossContextMemory({ storage, contexts, similarityThreshold: 0.9 });
    expect(custom).toBeInstanceOf(CrossContextMemory);
  });

  it('detects merge candidates across contexts', async () => {
    // First context query returns entities
    storage.query.mockResolvedValueOnce({
      rows: [{ id: 'e1', name: 'TypeScript' }],
    });
    // Second context query returns similar entity
    storage.query.mockResolvedValueOnce({
      rows: [{ id: 'e2', name: 'TypeScript' }],
    });

    const candidates = await crossCtx.detectMergeCandidates();
    // Same name across different contexts should produce a candidate
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    if (candidates.length > 0) {
      expect(candidates[0].similarity).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('returns empty candidates when no entities exist', async () => {
    storage.query.mockResolvedValue({ rows: [] });

    const candidates = await crossCtx.detectMergeCandidates();
    expect(candidates).toHaveLength(0);
  });

  it('skips same-context comparisons', async () => {
    // Only one context with entities
    const singleCtx = new CrossContextMemory({
      storage,
      contexts: ['personal'],
    });

    storage.query.mockResolvedValueOnce({
      rows: [
        { id: 'e1', name: 'React' },
        { id: 'e2', name: 'React Native' },
      ],
    });

    const candidates = await singleCtx.detectMergeCandidates();
    // Same context entities should not be compared
    expect(candidates).toHaveLength(0);
  });

  it('respects limit parameter', async () => {
    // Create many similar entities across contexts
    storage.query.mockResolvedValueOnce({
      rows: Array.from({ length: 10 }, (_, i) => ({ id: `a-${i}`, name: `Entity ${i}` })),
    });
    storage.query.mockResolvedValueOnce({
      rows: Array.from({ length: 10 }, (_, i) => ({ id: `b-${i}`, name: `Entity ${i}` })),
    });

    const candidates = await crossCtx.detectMergeCandidates('knowledge_entities', 3);
    expect(candidates.length).toBeLessThanOrEqual(3);
  });

  it('sorts candidates by similarity descending', async () => {
    storage.query.mockResolvedValueOnce({
      rows: [
        { id: 'e1', name: 'React' },
        { id: 'e2', name: 'TypeScript' },
      ],
    });
    storage.query.mockResolvedValueOnce({
      rows: [
        { id: 'e3', name: 'React' },
        { id: 'e4', name: 'Typescript' }, // lowercase t
      ],
    });

    const candidates = await crossCtx.detectMergeCandidates();
    if (candidates.length >= 2) {
      expect(candidates[0].similarity).toBeGreaterThanOrEqual(candidates[1].similarity);
    }
  });

  it('creates a cross-context link', async () => {
    storage.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await crossCtx.createLink('entity-a', 'entity-b');
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO');
    expect(sql).toContain('cross_context_links');
    expect(sql).toContain('ON CONFLICT DO NOTHING');

    const params = storage.query.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe('entity-a');
    expect(params[1]).toBe('entity-b');
  });

  it('creates a link with custom table name', async () => {
    storage.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await crossCtx.createLink('a', 'b', 'custom_links');
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('custom_links');
  });

  it('queries each context for entities during detection', async () => {
    const threeContexts = new CrossContextMemory({
      storage,
      contexts: ['personal', 'work', 'learning'],
    });

    storage.query.mockResolvedValue({ rows: [] });

    await threeContexts.detectMergeCandidates();
    // Should query once per context
    expect(storage.query).toHaveBeenCalledTimes(3);
  });

  it('filters candidates below similarity threshold', async () => {
    const strictCtx = new CrossContextMemory({
      storage,
      contexts,
      similarityThreshold: 0.99, // Very strict
    });

    storage.query.mockResolvedValueOnce({
      rows: [{ id: 'e1', name: 'React' }],
    });
    storage.query.mockResolvedValueOnce({
      rows: [{ id: 'e2', name: 'React Native' }], // Similar but not 0.99
    });

    const candidates = await strictCtx.detectMergeCandidates();
    // "React" vs "React Native" similarity is below 0.99
    expect(candidates).toHaveLength(0);
  });
});
