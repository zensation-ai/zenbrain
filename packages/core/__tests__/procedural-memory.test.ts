import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProceduralMemory } from '../src/layers/procedural';
import type { StorageAdapter } from '../src/interfaces/storage';

function createMockStorage(): StorageAdapter & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    transaction: vi.fn(async (fn) => fn(createMockStorage())),
  };
}

function createProcedureRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proc-1',
    trigger: 'deploy application',
    steps: JSON.stringify(['build', 'test', 'deploy']),
    tools: JSON.stringify(['npm', 'docker']),
    outcome: 'Application deployed successfully',
    success_rate: 0.9,
    execution_count: 10,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('ProceduralMemory', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let procedural: ProceduralMemory;

  beforeEach(() => {
    storage = createMockStorage();
    procedural = new ProceduralMemory({ storage });
  });

  it('creates an instance with default config', () => {
    expect(procedural).toBeInstanceOf(ProceduralMemory);
  });

  it('creates an instance with custom table name', () => {
    const custom = new ProceduralMemory({ storage, tableName: 'my_procedures' });
    expect(custom).toBeInstanceOf(ProceduralMemory);
  });

  it('records a new procedure with correct SQL', async () => {
    storage.query.mockResolvedValueOnce({
      rows: [createProcedureRow()],
      rowCount: 1,
    });

    const result = await procedural.record(
      'deploy application',
      ['build', 'test', 'deploy'],
      ['npm', 'docker'],
      'Application deployed successfully',
    );

    expect(result.id).toBe('proc-1');
    expect(result.trigger).toBe('deploy application');
    expect(result.steps).toEqual(['build', 'test', 'deploy']);
    expect(result.tools).toEqual(['npm', 'docker']);
    expect(result.successRate).toBe(0.9);

    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO');
    expect(sql).toContain('procedural_memories');
  });

  it('passes null embedding when no provider', async () => {
    storage.query.mockResolvedValueOnce({ rows: [createProcedureRow()], rowCount: 1 });

    await procedural.record('test', ['step'], ['tool'], 'outcome');
    const params = storage.query.mock.calls[0][1] as unknown[];
    // 5th param is embedding
    expect(params[4]).toBeNull();
  });

  it('recall falls back to success_rate ordering without embedding', async () => {
    storage.query.mockResolvedValueOnce({
      rows: [createProcedureRow()],
    });

    const results = await procedural.recall('deploy', 3);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.9); // success_rate used as score
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY success_rate DESC');
  });

  it('recall uses pgvector with embedding provider', async () => {
    const embeddingProvider = {
      embed: vi.fn(async () => [0.1, 0.2, 0.3]),
      embedBatch: vi.fn(async () => []),
      dimensions: () => 3,
    };
    const proceduralWithEmb = new ProceduralMemory({ storage, embedding: embeddingProvider });

    storage.query.mockResolvedValueOnce({
      rows: [{ ...createProcedureRow(), score: 0.88 }],
    });

    const results = await proceduralWithEmb.recall('deploy', 3);
    expect(embeddingProvider.embed).toHaveBeenCalledWith('deploy');
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('<=>');
    expect(results[0].score).toBe(0.88);
  });

  it('records positive feedback (incremental average)', async () => {
    storage.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await procedural.feedback('proc-1', true);
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('UPDATE');
    expect(sql).toContain('success_rate');
    expect(sql).toContain('execution_count');
    const params = storage.query.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe('proc-1');
    expect(params[1]).toBe(1.0); // success = 1.0
  });

  it('records negative feedback', async () => {
    storage.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await procedural.feedback('proc-1', false);
    const params = storage.query.mock.calls[0][1] as unknown[];
    expect(params[1]).toBe(0.0); // failure = 0.0
  });

  it('lists procedures ordered by success rate', async () => {
    storage.query.mockResolvedValueOnce({
      rows: [
        createProcedureRow({ id: 'p1', success_rate: 0.95 }),
        createProcedureRow({ id: 'p2', success_rate: 0.80 }),
      ],
    });

    const procedures = await procedural.list(20);
    expect(procedures).toHaveLength(2);
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY success_rate DESC');
  });

  it('deletes a procedure and returns true when found', async () => {
    storage.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const deleted = await procedural.delete('proc-1');
    expect(deleted).toBe(true);
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('DELETE FROM');
  });

  it('returns false when deleting non-existent procedure', async () => {
    storage.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const deleted = await procedural.delete('non-existent');
    expect(deleted).toBe(false);
  });

  it('handles embedding provider failure gracefully on record', async () => {
    const failingProvider = {
      embed: vi.fn(async () => { throw new Error('service down'); }),
      embedBatch: vi.fn(async () => []),
      dimensions: () => 3,
    };
    const proceduralWithFailing = new ProceduralMemory({ storage, embedding: failingProvider });

    storage.query.mockResolvedValueOnce({ rows: [createProcedureRow()], rowCount: 1 });

    const result = await proceduralWithFailing.record('test', ['s'], ['t'], 'o');
    expect(result.id).toBe('proc-1');
    const params = storage.query.mock.calls[0][1] as unknown[];
    expect(params[4]).toBeNull(); // embedding null on failure
  });
});
