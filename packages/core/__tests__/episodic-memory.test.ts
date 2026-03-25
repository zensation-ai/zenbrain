import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EpisodicMemory } from '../src/layers/episodic';
import type { StorageAdapter } from '../src/interfaces/storage';

function createMockStorage(): StorageAdapter & { query: ReturnType<typeof vi.fn> } {
  const mock: StorageAdapter & { query: ReturnType<typeof vi.fn> } = {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    transaction: vi.fn(async (fn) => fn(createMockStorage())),
  };
  return mock;
}

describe('EpisodicMemory', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let episodic: EpisodicMemory;

  beforeEach(() => {
    storage = createMockStorage();
    episodic = new EpisodicMemory({ storage });
  });

  it('creates an instance with default config', () => {
    expect(episodic).toBeInstanceOf(EpisodicMemory);
  });

  it('creates an instance with custom table name', () => {
    const custom = new EpisodicMemory({ storage, tableName: 'my_episodes' });
    expect(custom).toBeInstanceOf(EpisodicMemory);
  });

  it('stores an episode and calls storage.query with INSERT', async () => {
    storage.query.mockResolvedValueOnce({
      rows: [{ id: 'ep-1', content: 'Had a meeting', context: 'work', timestamp: new Date(), emotionalWeight: 0.5 }],
      rowCount: 1,
    });

    const result = await episodic.store('Had a meeting', 'work', 0.5);
    expect(result.id).toBe('ep-1');
    expect(storage.query).toHaveBeenCalledTimes(1);
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO');
    expect(sql).toContain('episodic_memories');
  });

  it('passes null embedding when no embedding provider', async () => {
    storage.query.mockResolvedValueOnce({
      rows: [{ id: 'ep-2', content: 'test', timestamp: new Date() }],
      rowCount: 1,
    });

    await episodic.store('test');
    const params = storage.query.mock.calls[0][1] as unknown[];
    // Third param is embedding, should be null
    expect(params[2]).toBeNull();
  });

  it('retrieves recent episodes with correct SQL', async () => {
    storage.query.mockResolvedValueOnce({
      rows: [
        { id: 'ep-1', content: 'Episode 1', timestamp: new Date() },
        { id: 'ep-2', content: 'Episode 2', timestamp: new Date() },
      ],
    });

    const result = await episodic.getRecent(10);
    expect(result).toHaveLength(2);
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('SELECT');
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(sql).toContain('LIMIT');
  });

  it('filters recent episodes by context when provided', async () => {
    storage.query.mockResolvedValueOnce({ rows: [] });

    await episodic.getRecent(5, 'personal');
    const sql = storage.query.mock.calls[0][0] as string;
    const params = storage.query.mock.calls[0][1] as unknown[];
    expect(sql).toContain('WHERE context = $2');
    expect(params).toContain('personal');
  });

  it('search falls back to getRecent when no embedding provider', async () => {
    storage.query.mockResolvedValueOnce({
      rows: [{ id: 'ep-1', content: 'test', timestamp: new Date() }],
    });

    const results = await episodic.search('test query', 5);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
  });

  it('search uses pgvector when embedding provider is available', async () => {
    const embeddingProvider = {
      embed: vi.fn(async () => [0.1, 0.2, 0.3]),
      embedBatch: vi.fn(async () => []),
      dimensions: () => 3,
    };
    const episodicWithEmb = new EpisodicMemory({ storage, embedding: embeddingProvider });

    storage.query.mockResolvedValueOnce({
      rows: [{ id: 'ep-1', content: 'match', timestamp: new Date(), score: 0.95 }],
    });

    const results = await episodicWithEmb.search('test query', 5);
    expect(embeddingProvider.embed).toHaveBeenCalledWith('test query');
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('<=>');
    expect(results).toHaveLength(1);
  });

  it('retrieves episodes by time range', async () => {
    const start = new Date('2026-01-01');
    const end = new Date('2026-01-31');
    storage.query.mockResolvedValueOnce({ rows: [] });

    await episodic.getByTimeRange(start, end);
    const sql = storage.query.mock.calls[0][0] as string;
    const params = storage.query.mock.calls[0][1] as unknown[];
    expect(sql).toContain('created_at >= $1');
    expect(sql).toContain('created_at <= $2');
    expect(params[0]).toBe(start);
    expect(params[1]).toBe(end);
  });

  it('counts episodes', async () => {
    storage.query.mockResolvedValueOnce({ rows: [{ count: '42' }] });

    const count = await episodic.count();
    expect(count).toBe(42);
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('COUNT(*)');
  });

  it('returns 0 count for empty table', async () => {
    storage.query.mockResolvedValueOnce({ rows: [{}] });
    const count = await episodic.count();
    expect(count).toBe(0);
  });

  it('deletes an episode and returns true when found', async () => {
    storage.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const deleted = await episodic.delete('ep-1');
    expect(deleted).toBe(true);
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('DELETE FROM');
    expect(storage.query.mock.calls[0][1]).toEqual(['ep-1']);
  });

  it('returns false when deleting non-existent episode', async () => {
    storage.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const deleted = await episodic.delete('non-existent');
    expect(deleted).toBe(false);
  });

  it('handles embedding provider failure gracefully on store', async () => {
    const failingProvider = {
      embed: vi.fn(async () => { throw new Error('Embedding service down'); }),
      embedBatch: vi.fn(async () => []),
      dimensions: () => 3,
    };
    const episodicWithFailing = new EpisodicMemory({ storage, embedding: failingProvider });

    storage.query.mockResolvedValueOnce({
      rows: [{ id: 'ep-1', content: 'test', timestamp: new Date() }],
      rowCount: 1,
    });

    // Should not throw, just skip embedding
    const result = await episodicWithFailing.store('test content');
    expect(result.id).toBe('ep-1');
    const params = storage.query.mock.calls[0][1] as unknown[];
    expect(params[2]).toBeNull(); // embedding should be null on failure
  });
});
