import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SqliteAdapter, createMemoryAdapter, createFileAdapter } from '../src/index.js';

// ── Constructor & Schema Init ──────────────────────────────────────────────────

describe('SqliteAdapter constructor', () => {
  it('creates database and initializes schema tables', () => {
    const adapter = createMemoryAdapter();
    const db = adapter.getDatabase();

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all() as { name: string }[];

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('episodic_memories');
    expect(tableNames).toContain('learned_facts');
    expect(tableNames).toContain('procedural_memories');
    expect(tableNames).toContain('core_memory_blocks');
    expect(tableNames).toContain('cross_context_links');
    expect(tableNames).toContain('knowledge_entities');
  });

  it('creates indexes during initialization', () => {
    const adapter = createMemoryAdapter();
    const db = adapter.getDatabase();

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'",
    ).all() as { name: string }[];

    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_episodic_created');
    expect(indexNames).toContain('idx_facts_created');
    expect(indexNames).toContain('idx_facts_confidence');
    expect(indexNames).toContain('idx_facts_review');
    expect(indexNames).toContain('idx_procedures_success');
    expect(indexNames).toContain('idx_entities_type');
  });

  it('enables WAL mode by default', () => {
    const adapter = createMemoryAdapter();
    const db = adapter.getDatabase();
    const mode = db.pragma('journal_mode', { simple: true });
    // In-memory databases may report 'memory' rather than 'wal'
    expect(['wal', 'memory']).toContain(mode);
  });

  it('enables foreign keys', () => {
    const adapter = createMemoryAdapter();
    const db = adapter.getDatabase();
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);
  });
});

// ── query() SELECT ─────────────────────────────────────────────────────────────

describe('SqliteAdapter.query() SELECT', () => {
  it('returns rows from SELECT', async () => {
    const adapter = createMemoryAdapter();
    // Insert test data directly
    adapter.getDatabase().exec(
      "INSERT INTO learned_facts (id, content, confidence, source) VALUES ('f1', 'test fact', 0.9, 'test')",
    );

    const result = await adapter.query<{ id: string; content: string }>(
      'SELECT id, content FROM learned_facts WHERE id = $1',
      ['f1'],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe('f1');
    expect(result.rows[0].content).toBe('test fact');
    expect(result.rowCount).toBe(1);
  });

  it('returns empty array when no rows match', async () => {
    const adapter = createMemoryAdapter();
    const result = await adapter.query('SELECT * FROM learned_facts WHERE id = $1', ['nonexistent']);

    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });
});

// ── query() INSERT ─────────────────────────────────────────────────────────────

describe('SqliteAdapter.query() INSERT', () => {
  it('inserts records and returns rowCount', async () => {
    const adapter = createMemoryAdapter();
    const result = await adapter.query(
      "INSERT INTO learned_facts (id, content, confidence, source) VALUES ($1, $2, $3, $4)",
      ['f1', 'hello world', 0.8, 'conversation'],
    );

    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual([]);

    // Verify insertion
    const check = await adapter.query('SELECT content FROM learned_facts WHERE id = $1', ['f1']);
    expect(check.rows[0]).toEqual({ content: 'hello world' });
  });

  it('INSERT ... RETURNING returns inserted rows', async () => {
    const adapter = createMemoryAdapter();
    const result = await adapter.query<{ id: string; content: string }>(
      "INSERT INTO learned_facts (id, content, confidence, source) VALUES ($1, $2, $3, $4) RETURNING id, content",
      ['f2', 'returning test', 0.7, 'test'],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe('f2');
    expect(result.rows[0].content).toBe('returning test');
  });
});

// ── query() UPDATE / DELETE ────────────────────────────────────────────────────

describe('SqliteAdapter.query() UPDATE/DELETE', () => {
  it('UPDATE returns changes count', async () => {
    const adapter = createMemoryAdapter();
    await adapter.query(
      "INSERT INTO learned_facts (id, content, confidence, source) VALUES ($1, $2, $3, $4)",
      ['f1', 'old', 0.5, 'test'],
    );

    const result = await adapter.query(
      'UPDATE learned_facts SET content = $1 WHERE id = $2',
      ['new', 'f1'],
    );

    expect(result.rowCount).toBe(1);
  });

  it('DELETE returns changes count', async () => {
    const adapter = createMemoryAdapter();
    await adapter.query(
      "INSERT INTO learned_facts (id, content, confidence, source) VALUES ($1, $2, $3, $4)",
      ['f1', 'deleteme', 0.5, 'test'],
    );

    const result = await adapter.query('DELETE FROM learned_facts WHERE id = $1', ['f1']);
    expect(result.rowCount).toBe(1);
  });
});

// ── Query Translation ──────────────────────────────────────────────────────────

describe('SqliteAdapter query translation', () => {
  it('translates $1/$2 parameters to ? placeholders', async () => {
    const adapter = createMemoryAdapter();
    // If translation works, this should not throw
    await adapter.query(
      "INSERT INTO learned_facts (id, content, confidence, source) VALUES ($1, $2, $3, $4)",
      ['t1', 'param test', 0.6, 'test'],
    );

    const result = await adapter.query(
      'SELECT * FROM learned_facts WHERE id = $1 AND confidence > $2',
      ['t1', 0.5],
    );
    expect(result.rows).toHaveLength(1);
  });

  it('translates NOW() to datetime("now")', async () => {
    const adapter = createMemoryAdapter();
    // Use NOW() in a query — should be translated to datetime('now')
    await adapter.query(
      "INSERT INTO core_memory_blocks (id, label, content, updated_at) VALUES ($1, $2, $3, NOW())",
      ['b1', 'test_label', 'test content'],
    );

    const result = await adapter.query<{ updated_at: string }>(
      'SELECT updated_at FROM core_memory_blocks WHERE id = $1',
      ['b1'],
    );
    expect(result.rows).toHaveLength(1);
    // Should be a valid datetime string
    expect(result.rows[0].updated_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('translates gen_random_uuid() to a UUID-like value', async () => {
    const adapter = createMemoryAdapter();
    const result = await adapter.query<{ uuid: string }>(
      'SELECT gen_random_uuid() as uuid',
    );

    expect(result.rows).toHaveLength(1);
    // Should look like a UUID (hex chars and dashes)
    expect(result.rows[0].uuid).toMatch(/^[0-9a-f-]+$/);
    // Should have the right length (36 chars)
    expect(result.rows[0].uuid.length).toBe(36);
  });

  it('handles undefined params as null', async () => {
    const adapter = createMemoryAdapter();
    await adapter.query(
      "INSERT INTO episodic_memories (id, content, context) VALUES ($1, $2, $3)",
      ['e1', 'test', undefined],
    );

    const result = await adapter.query<{ context: string | null }>(
      'SELECT context FROM episodic_memories WHERE id = $1',
      ['e1'],
    );
    expect(result.rows[0].context).toBeNull();
  });
});

// ── transaction() ──────────────────────────────────────────────────────────────

describe('SqliteAdapter.transaction()', () => {
  it('commits on success', async () => {
    const adapter = createMemoryAdapter();

    await adapter.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO learned_facts (id, content, confidence, source) VALUES ($1, $2, $3, $4)",
        ['tx1', 'committed', 0.9, 'test'],
      );
    });

    const result = await adapter.query('SELECT * FROM learned_facts WHERE id = $1', ['tx1']);
    expect(result.rows).toHaveLength(1);
  });

  it('rolls back on error', async () => {
    const adapter = createMemoryAdapter();

    await expect(
      adapter.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO learned_facts (id, content, confidence, source) VALUES ($1, $2, $3, $4)",
          ['tx2', 'rolledback', 0.9, 'test'],
        );
        throw new Error('tx fail');
      }),
    ).rejects.toThrow('tx fail');

    // Row should not exist after rollback
    const result = await adapter.query('SELECT * FROM learned_facts WHERE id = $1', ['tx2']);
    expect(result.rows).toHaveLength(0);
  });

  it('preserves data from before the transaction on rollback', async () => {
    const adapter = createMemoryAdapter();

    // Insert before transaction
    await adapter.query(
      "INSERT INTO learned_facts (id, content, confidence, source) VALUES ($1, $2, $3, $4)",
      ['pre', 'existing', 0.8, 'test'],
    );

    await adapter.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO learned_facts (id, content, confidence, source) VALUES ($1, $2, $3, $4)",
        ['during', 'new', 0.5, 'test'],
      );
      throw new Error('rollback');
    }).catch(() => {});

    // Pre-existing data still there
    const pre = await adapter.query('SELECT * FROM learned_facts WHERE id = $1', ['pre']);
    expect(pre.rows).toHaveLength(1);

    // Transaction data gone
    const during = await adapter.query('SELECT * FROM learned_facts WHERE id = $1', ['during']);
    expect(during.rows).toHaveLength(0);
  });
});

// ── close() ────────────────────────────────────────────────────────────────────

describe('SqliteAdapter.close()', () => {
  it('closes the database', async () => {
    const adapter = createMemoryAdapter();
    await adapter.close();

    // After close, further queries should throw
    await expect(adapter.query('SELECT 1')).rejects.toThrow();
  });
});

// ── createMemoryAdapter() ──────────────────────────────────────────────────────

describe('createMemoryAdapter()', () => {
  it('returns a working adapter', async () => {
    const adapter = createMemoryAdapter();
    const result = await adapter.query<{ n: number }>('SELECT 1 as n');
    expect(result.rows[0].n).toBe(1);
    await adapter.close();
  });

  it('accepts optional logger', () => {
    const logger = { info: () => {}, warn: () => {}, error: () => {} };
    const adapter = createMemoryAdapter(logger);
    expect(adapter).toBeInstanceOf(SqliteAdapter);
    adapter.getDatabase().close();
  });
});

// ── createFileAdapter() ────────────────────────────────────────────────────────

describe('createFileAdapter()', () => {
  const tmpPath = join(tmpdir(), `zenbrain-test-${Date.now()}`, 'nested', 'test.db');

  afterEach(() => {
    // Clean up temp files
    const topDir = join(tmpdir(), tmpPath.split('/').find(p => p.startsWith('zenbrain-test-'))!);
    try { rmSync(topDir, { recursive: true, force: true }); } catch {}
  });

  it('creates directory if it does not exist and returns working adapter', async () => {
    const adapter = createFileAdapter(tmpPath);

    // Directory was created
    expect(existsSync(tmpPath)).toBe(true);

    // Adapter works
    const result = await adapter.query<{ n: number }>('SELECT 42 as n');
    expect(result.rows[0].n).toBe(42);

    await adapter.close();
  });
});

// ── Error Handling ─────────────────────────────────────────────────────────────

describe('SqliteAdapter error handling', () => {
  it('includes context message in query errors', async () => {
    const adapter = createMemoryAdapter();
    await expect(
      adapter.query('SELECT * FROM nonexistent_table'),
    ).rejects.toThrow(/SQLite query error:.*nonexistent_table/);
  });

  it('includes truncated query in error message', async () => {
    const adapter = createMemoryAdapter();
    await expect(
      adapter.query('SELECT * FROM no_such_table WHERE something = 1'),
    ).rejects.toThrow(/Query:/);
  });
});

// ── DDL / exec path ────────────────────────────────────────────────────────────

describe('SqliteAdapter DDL statements', () => {
  it('handles CREATE TABLE statements', async () => {
    const adapter = createMemoryAdapter();
    const result = await adapter.query(
      'CREATE TABLE IF NOT EXISTS custom_table (id TEXT PRIMARY KEY, value TEXT)',
    );
    expect(result.rows).toEqual([]);

    // Verify table exists
    await adapter.query("INSERT INTO custom_table (id, value) VALUES ($1, $2)", ['c1', 'hello']);
    const check = await adapter.query('SELECT * FROM custom_table');
    expect(check.rows).toHaveLength(1);
  });
});
