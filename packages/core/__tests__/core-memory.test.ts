import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoreMemory } from '../src/layers/core';
import type { StorageAdapter } from '../src/interfaces/storage';

function createMockStorage(): StorageAdapter & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    transaction: vi.fn(async (fn) => fn(createMockStorage())),
  };
}

function createBlockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'block-1',
    label: 'personality',
    content: 'I am a helpful AI assistant',
    pinned: true,
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('CoreMemory', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let core: CoreMemory;

  beforeEach(() => {
    storage = createMockStorage();
    core = new CoreMemory({ storage });
  });

  it('creates an instance with default config', () => {
    expect(core).toBeInstanceOf(CoreMemory);
  });

  it('creates an instance with custom table name', () => {
    const custom = new CoreMemory({ storage, tableName: 'my_core_blocks' });
    expect(custom).toBeInstanceOf(CoreMemory);
  });

  it('gets all blocks ordered by label', async () => {
    storage.query.mockResolvedValueOnce({
      rows: [
        createBlockRow({ label: 'bio' }),
        createBlockRow({ label: 'personality' }),
      ],
    });

    const blocks = await core.getBlocks();
    expect(blocks).toHaveLength(2);
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('SELECT');
    expect(sql).toContain('ORDER BY label');
  });

  it('returns empty array when no blocks exist', async () => {
    storage.query.mockResolvedValueOnce({ rows: [] });
    const blocks = await core.getBlocks();
    expect(blocks).toHaveLength(0);
  });

  it('gets a single block by label', async () => {
    storage.query.mockResolvedValueOnce({
      rows: [createBlockRow()],
    });

    const block = await core.getBlock('personality');
    expect(block).not.toBeNull();
    expect(block!.label).toBe('personality');
    const params = storage.query.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe('personality');
  });

  it('returns null for non-existent block', async () => {
    storage.query.mockResolvedValueOnce({ rows: [] });

    const block = await core.getBlock('non-existent');
    expect(block).toBeNull();
  });

  it('upserts a block with INSERT ON CONFLICT', async () => {
    storage.query.mockResolvedValueOnce({
      rows: [createBlockRow({ content: 'Updated content' })],
      rowCount: 1,
    });

    const block = await core.upsertBlock('personality', 'Updated content', true);
    expect(block.content).toBe('Updated content');

    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO');
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('DO UPDATE');

    const params = storage.query.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe('personality');
    expect(params[1]).toBe('Updated content');
    expect(params[2]).toBe(true);
  });

  it('upserts with default pinned=true', async () => {
    storage.query.mockResolvedValueOnce({ rows: [createBlockRow()], rowCount: 1 });

    await core.upsertBlock('test', 'content');
    const params = storage.query.mock.calls[0][1] as unknown[];
    expect(params[2]).toBe(true); // default pinned
  });

  it('deletes a block and returns true when found', async () => {
    storage.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const deleted = await core.deleteBlock('personality');
    expect(deleted).toBe(true);
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('DELETE FROM');
    const params = storage.query.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe('personality');
  });

  it('returns false when deleting non-existent block', async () => {
    storage.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const deleted = await core.deleteBlock('non-existent');
    expect(deleted).toBe(false);
  });

  it('assembles context from all blocks', async () => {
    storage.query.mockResolvedValueOnce({
      rows: [
        createBlockRow({ label: 'bio', content: 'I am Alex' }),
        createBlockRow({ label: 'personality', content: 'Helpful and curious' }),
      ],
    });

    const context = await core.assembleContext();
    expect(context).toContain('[bio]: I am Alex');
    expect(context).toContain('[personality]: Helpful and curious');
  });

  it('returns empty string when no blocks for context', async () => {
    storage.query.mockResolvedValueOnce({ rows: [] });

    const context = await core.assembleContext();
    expect(context).toBe('');
  });

  it('uses correct default table name in queries', async () => {
    storage.query.mockResolvedValueOnce({ rows: [] });
    await core.getBlocks();
    const sql = storage.query.mock.calls[0][0] as string;
    expect(sql).toContain('core_memory_blocks');
  });
});
