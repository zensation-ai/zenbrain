import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock pg ────────────────────────────────────────────────────────────────────
const mockRelease = vi.fn();
const mockClientQuery = vi.fn();
const mockConnect = vi.fn();
const mockEnd = vi.fn();
const mockOn = vi.fn();

vi.mock('pg', () => {
  const Pool = vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    end: mockEnd,
    on: mockOn,
  }));
  return { Pool };
});

import { PostgresAdapter, createPostgresAdapter } from '../src/index.js';
import { Pool } from 'pg';

// Helper: create a mock client
function makeMockClient(queryFn = mockClientQuery) {
  return { query: queryFn, release: mockRelease };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConnect.mockResolvedValue(makeMockClient());
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Constructor ────────────────────────────────────────────────────────────────

describe('PostgresAdapter constructor', () => {
  it('creates Pool with connectionString when provided', () => {
    new PostgresAdapter({ connectionString: 'postgres://u:p@host:5432/db' });
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ connectionString: 'postgres://u:p@host:5432/db' }),
    );
  });

  it('creates Pool with individual fields when no connectionString', () => {
    new PostgresAdapter({ host: 'myhost', port: 1234, user: 'me', password: 'pw', database: 'mydb' });
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'myhost', port: 1234, user: 'me', password: 'pw', database: 'mydb' }),
    );
  });

  it('uses defaults for individual fields', () => {
    new PostgresAdapter({});
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost', port: 5432, user: 'postgres', password: '', database: 'zenbrain' }),
    );
  });

  it('applies pool size and timeout defaults', () => {
    new PostgresAdapter({});
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({
        max: 8,
        min: 2,
        idleTimeoutMillis: 60_000,
        connectionTimeoutMillis: 5_000,
        keepAlive: true,
      }),
    );
  });

  it('overrides pool size and timeout', () => {
    new PostgresAdapter({ maxConnections: 20, minConnections: 5, idleTimeoutMs: 30_000, connectionTimeoutMs: 10_000 });
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ max: 20, min: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 }),
    );
  });

  it('configures SSL when ssl=true', () => {
    new PostgresAdapter({ ssl: true });
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: { rejectUnauthorized: true } }),
    );
  });

  it('configures SSL when ssl=false', () => {
    new PostgresAdapter({ ssl: false });
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: false }),
    );
  });

  it('passes through SSL object', () => {
    new PostgresAdapter({ ssl: { rejectUnauthorized: false } });
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: { rejectUnauthorized: false } }),
    );
  });

  it('registers pool error handler', () => {
    new PostgresAdapter({});
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
  });
});

// ── query() ────────────────────────────────────────────────────────────────────

describe('PostgresAdapter.query()', () => {
  it('returns rows and rowCount from client.query()', async () => {
    const rows = [{ id: 1, name: 'test' }];
    mockClientQuery.mockResolvedValue({ rows, rowCount: 1 });

    const adapter = new PostgresAdapter({});
    const result = await adapter.query('SELECT * FROM users WHERE id = $1', [1]);

    expect(result.rows).toEqual(rows);
    expect(result.rowCount).toBe(1);
  });

  it('passes SQL and params to client.query()', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const adapter = new PostgresAdapter({});
    await adapter.query('INSERT INTO t (a, b) VALUES ($1, $2)', ['hello', 42]);

    expect(mockClientQuery).toHaveBeenCalledWith('INSERT INTO t (a, b) VALUES ($1, $2)', ['hello', 42]);
  });

  it('sets schema search_path when configured', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const adapter = new PostgresAdapter({ schema: 'personal' });
    await adapter.query('SELECT 1');

    expect(mockClientQuery).toHaveBeenCalledWith('SET search_path TO personal, public');
    expect(mockClientQuery).toHaveBeenCalledWith('SELECT 1', undefined);
  });

  it('does not set search_path when no schema configured', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const adapter = new PostgresAdapter({});
    await adapter.query('SELECT 1');

    expect(mockClientQuery).not.toHaveBeenCalledWith(expect.stringContaining('search_path'));
  });

  it('handles null rowCount', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: null });

    const adapter = new PostgresAdapter({});
    const result = await adapter.query('DELETE FROM t');

    expect(result.rowCount).toBeUndefined();
  });

  it('releases client after successful query', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const adapter = new PostgresAdapter({});
    await adapter.query('SELECT 1');

    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it('releases client even when query throws', async () => {
    mockClientQuery.mockRejectedValue(new Error('syntax error'));

    const adapter = new PostgresAdapter({ maxRetries: 0 });
    await expect(adapter.query('BAD SQL')).rejects.toThrow('syntax error');

    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it('retries on transient ECONNRESET error', async () => {
    const transientError = new Error('connection reset');
    (transientError as any).code = 'ECONNRESET';

    mockClientQuery
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce({ rows: [{ ok: true }], rowCount: 1 });

    const adapter = new PostgresAdapter({ maxRetries: 2 });
    const result = await adapter.query('SELECT 1');

    expect(result.rows).toEqual([{ ok: true }]);
    // connect called twice (once per attempt)
    expect(mockConnect).toHaveBeenCalledTimes(2);
    // client released each time
    expect(mockRelease).toHaveBeenCalledTimes(2);
  });

  it('retries on ETIMEDOUT', async () => {
    const err = new Error('timed out');
    (err as any).code = 'ETIMEDOUT';

    mockClientQuery
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const adapter = new PostgresAdapter({ maxRetries: 1 });
    const result = await adapter.query('SELECT 1');

    expect(result.rows).toEqual([]);
  });

  it('retries on ECONNREFUSED', async () => {
    const err = new Error('connection refused');
    (err as any).code = 'ECONNREFUSED';

    mockClientQuery
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const adapter = new PostgresAdapter({ maxRetries: 1 });
    await expect(adapter.query('SELECT 1')).resolves.toBeDefined();
  });

  it('retries on error message containing retryable code', async () => {
    const err = new Error('got EPIPE while writing');

    mockClientQuery
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const adapter = new PostgresAdapter({ maxRetries: 1 });
    await expect(adapter.query('SELECT 1')).resolves.toBeDefined();
  });

  it('throws after max retries exceeded', async () => {
    const transientError = new Error('connection reset');
    (transientError as any).code = 'ECONNRESET';

    mockClientQuery.mockRejectedValue(transientError);

    const adapter = new PostgresAdapter({ maxRetries: 2 });
    await expect(adapter.query('SELECT 1')).rejects.toThrow('connection reset');

    // 1 initial + 2 retries = 3 attempts
    expect(mockConnect).toHaveBeenCalledTimes(3);
    expect(mockRelease).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-transient errors', async () => {
    mockClientQuery.mockRejectedValue(new Error('relation "foo" does not exist'));

    const adapter = new PostgresAdapter({ maxRetries: 3 });
    await expect(adapter.query('SELECT * FROM foo')).rejects.toThrow('does not exist');

    // Only 1 attempt, no retries
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('logs retry attempts when logger is provided', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const err = new Error('reset');
    (err as any).code = 'ECONNRESET';

    mockClientQuery
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const adapter = new PostgresAdapter({ maxRetries: 1, logger });
    await adapter.query('SELECT 1');

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Retryable error'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('succeeded after'));
  });
});

// ── transaction() ──────────────────────────────────────────────────────────────

describe('PostgresAdapter.transaction()', () => {
  it('calls BEGIN and COMMIT on success', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const adapter = new PostgresAdapter({});
    const result = await adapter.transaction(async (tx) => {
      await tx.query('INSERT INTO t VALUES ($1)', [1]);
      return 'done';
    });

    expect(result).toBe('done');
    const calls = mockClientQuery.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain('BEGIN');
    expect(calls).toContain('COMMIT');
    expect(calls).not.toContain('ROLLBACK');
  });

  it('calls ROLLBACK on error', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const adapter = new PostgresAdapter({});
    await expect(
      adapter.transaction(async () => {
        throw new Error('tx fail');
      }),
    ).rejects.toThrow('tx fail');

    const calls = mockClientQuery.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain('BEGIN');
    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
  });

  it('sets search_path in transaction when schema configured', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const adapter = new PostgresAdapter({ schema: 'work' });
    await adapter.transaction(async (tx) => {
      await tx.query('SELECT 1');
    });

    const calls = mockClientQuery.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls[0]).toBe('SET search_path TO work, public');
  });

  it('provides a working txAdapter that queries through same client', async () => {
    mockClientQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

    const adapter = new PostgresAdapter({});
    await adapter.transaction(async (tx) => {
      const r = await tx.query('SELECT * FROM t');
      expect(r.rows).toEqual([{ id: 1 }]);
    });

    // All queries go through the same mockClientQuery (same client)
    expect(mockClientQuery).toHaveBeenCalled();
  });

  it('releases client after transaction completes', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const adapter = new PostgresAdapter({});
    await adapter.transaction(async () => 'ok');

    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it('releases client after transaction fails', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const adapter = new PostgresAdapter({});
    await adapter.transaction(async () => { throw new Error('fail'); }).catch(() => {});

    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it('supports nested transactions via SAVEPOINT', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const adapter = new PostgresAdapter({});
    await adapter.transaction(async (tx) => {
      await tx.transaction(async (inner) => {
        await inner.query('INSERT INTO t VALUES (1)');
      });
    });

    const calls = mockClientQuery.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain('SAVEPOINT nested');
    expect(calls).toContain('RELEASE SAVEPOINT nested');
  });

  it('rolls back nested transaction on error', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const adapter = new PostgresAdapter({});
    await adapter.transaction(async (tx) => {
      await tx.transaction(async () => {
        throw new Error('inner fail');
      }).catch(() => {}); // catch so outer tx can still commit
    });

    const calls = mockClientQuery.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain('SAVEPOINT nested');
    expect(calls).toContain('ROLLBACK TO SAVEPOINT nested');
  });
});

// ── close() ────────────────────────────────────────────────────────────────────

describe('PostgresAdapter.close()', () => {
  it('calls pool.end()', async () => {
    mockEnd.mockResolvedValue(undefined);

    const adapter = new PostgresAdapter({});
    await adapter.close();

    expect(mockEnd).toHaveBeenCalledOnce();
  });

  it('logs closure when logger provided', async () => {
    mockEnd.mockResolvedValue(undefined);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const adapter = new PostgresAdapter({ logger });
    await adapter.close();

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('closed'));
  });
});

// ── getPool() ──────────────────────────────────────────────────────────────────

describe('PostgresAdapter.getPool()', () => {
  it('returns the underlying pool', () => {
    const adapter = new PostgresAdapter({});
    const pool = adapter.getPool();
    expect(pool).toBeDefined();
    expect(pool.connect).toBeDefined();
  });
});

// ── createPostgresAdapter() ────────────────────────────────────────────────────

describe('createPostgresAdapter()', () => {
  const originalEnv = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DATABASE_URL = originalEnv;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it('creates adapter from DATABASE_URL env var', () => {
    process.env.DATABASE_URL = 'postgres://test:pw@myhost:6543/mydb';
    const adapter = createPostgresAdapter();
    expect(adapter).toBeInstanceOf(PostgresAdapter);
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ connectionString: 'postgres://test:pw@myhost:6543/mydb' }),
    );
  });

  it('passes schema option through', () => {
    process.env.DATABASE_URL = 'postgres://test:pw@host/db';
    const adapter = createPostgresAdapter({ schema: 'learning' });
    expect(adapter).toBeInstanceOf(PostgresAdapter);
  });

  it('passes logger option through', () => {
    process.env.DATABASE_URL = 'postgres://test:pw@host/db';
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const adapter = createPostgresAdapter({ logger });
    expect(adapter).toBeInstanceOf(PostgresAdapter);
  });

  it('throws when DATABASE_URL is not set', () => {
    delete process.env.DATABASE_URL;
    expect(() => createPostgresAdapter()).toThrow('DATABASE_URL environment variable is required');
  });
});
