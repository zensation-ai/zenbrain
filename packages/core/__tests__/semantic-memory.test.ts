import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticMemory } from '../src/layers/semantic';
import type { StorageAdapter } from '../src/interfaces/storage';

function createMockStorage(): StorageAdapter & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    transaction: vi.fn(async (fn) => fn(createMockStorage())),
  };
}

function createFactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fact-1',
    content: 'TypeScript is a typed superset of JavaScript',
    confidence: 0.9,
    source: 'documentation',
    created_at: '2026-01-01T00:00:00Z',
    last_accessed: '2026-01-15T00:00:00Z',
    access_count: 5,
    fsrs_difficulty: 5.0,
    fsrs_stability: 10.0,
    fsrs_next_review: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

describe('SemanticMemory', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let semantic: SemanticMemory;

  beforeEach(() => {
    storage = createMockStorage();
    semantic = new SemanticMemory({ storage });
  });

  it('creates an instance with default config', () => {
    expect(semantic).toBeInstanceOf(SemanticMemory);
  });

  it('creates an instance with custom table name', () => {
    const custom = new SemanticMemory({ storage, tableName: 'my_facts' });
    expect(custom).toBeInstanceOf(SemanticMemory);
  });

  it('stores a fact with FSRS init and returns MemoryFact', async () => {
    storage.query.mockResolvedValueOnce({
      rows: [createFactRow()],
      rowCount: 1,
    });

    const fact = await semantic.storeFact('TypeScript is typed', 'docs', 0.9);
    expect(fact.id).toBe('fact-1');
    expect(fact.content).toContain('TypeScript');
    expect(fact.confidence).toBe(0.9);
    expect(fact.source).toBe('documentation');
    expect(fact.accessCount).toBe(5);

    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO');
    expect(sql).toContain('learned_facts');
    expect(sql).toContain('fsrs_difficulty');
  });

  it('passes null embedding when no provider', async () => {
    storage.query.mockResolvedValueOnce({ rows: [createFactRow()], rowCount: 1 });

    await semantic.storeFact('test', 'src');
    const params = storage.query.mock.calls[0][1] as unknown[];
    // 4th param is embedding
    expect(params[3]).toBeNull();
  });

  it('search falls back to getRecent when no embedding provider', async () => {
    storage.query.mockResolvedValueOnce({ rows: [createFactRow()] });

    const results = await semantic.search('TypeScript', 5);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
  });

  it('search uses pgvector cosine distance with embedding provider', async () => {
    const embeddingProvider = {
      embed: vi.fn(async () => [0.1, 0.2, 0.3]),
      embedBatch: vi.fn(async () => []),
      dimensions: () => 3,
    };
    const semanticWithEmb = new SemanticMemory({ storage, embedding: embeddingProvider });

    storage.query.mockResolvedValueOnce({
      rows: [{ ...createFactRow(), score: 0.92 }],
    });

    const results = await semanticWithEmb.search('types', 5);
    expect(embeddingProvider.embed).toHaveBeenCalledWith('types');
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('<=>');
    expect(results[0].score).toBe(0.92);
  });

  it('gets recent facts ordered by created_at DESC', async () => {
    storage.query.mockResolvedValueOnce({
      rows: [createFactRow({ id: 'f1' }), createFactRow({ id: 'f2' })],
    });

    const facts = await semantic.getRecent(10);
    expect(facts).toHaveLength(2);
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY created_at DESC');
  });

  it('recordRecall updates FSRS state for successful recall (grade >= 3)', async () => {
    // First call: SELECT to get current state
    storage.query.mockResolvedValueOnce({ rows: [createFactRow()] });
    // Second call: UPDATE
    storage.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await semantic.recordRecall('fact-1', 4);
    expect(storage.query).toHaveBeenCalledTimes(2);
    const updateSql = storage.query.mock.calls[1][0] as string;
    expect(updateSql).toContain('UPDATE');
    expect(updateSql).toContain('fsrs_difficulty');
    expect(updateSql).toContain('fsrs_stability');
  });

  it('recordRecall uses updateAfterForgot for low grade (< 3)', async () => {
    storage.query.mockResolvedValueOnce({ rows: [createFactRow()] });
    storage.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await semantic.recordRecall('fact-1', 1);
    expect(storage.query).toHaveBeenCalledTimes(2);
  });

  it('recordRecall does nothing for non-existent fact', async () => {
    storage.query.mockResolvedValueOnce({ rows: [] });

    await semantic.recordRecall('non-existent', 4);
    // Only the SELECT call, no UPDATE
    expect(storage.query).toHaveBeenCalledTimes(1);
  });

  it('gets facts due for review', async () => {
    storage.query.mockResolvedValueOnce({
      rows: [createFactRow({ fsrs_next_review: '2025-01-01T00:00:00Z' })],
    });

    const due = await semantic.getDueForReview(10);
    expect(due).toHaveLength(1);
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('fsrs_next_review');
    expect(sql).toContain('<= NOW()');
  });

  it('deletes a fact and returns true when found', async () => {
    storage.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const deleted = await semantic.delete('fact-1');
    expect(deleted).toBe(true);
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('DELETE FROM');
  });

  it('returns false when deleting non-existent fact', async () => {
    storage.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const deleted = await semantic.delete('non-existent');
    expect(deleted).toBe(false);
  });

  it('counts total facts', async () => {
    storage.query.mockResolvedValueOnce({ rows: [{ count: '100' }] });

    const count = await semantic.count();
    expect(count).toBe(100);
  });

  it('returns 0 count for empty result', async () => {
    storage.query.mockResolvedValueOnce({ rows: [{}] });

    const count = await semantic.count();
    expect(count).toBe(0);
  });
});
