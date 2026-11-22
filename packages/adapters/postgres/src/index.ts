/**
 * @zensation/adapter-postgres
 *
 * PostgreSQL + pgvector storage adapter for ZenBrain.
 * Implements the StorageAdapter interface from @zensation/core.
 *
 * Features:
 * - Connection pooling via `pg` Pool
 * - Optional schema isolation (SET search_path)
 * - Automatic retry for transient connection errors
 * - pgvector support for embedding storage
 */
import { Pool, PoolConfig, PoolClient } from 'pg';
import type { StorageAdapter, QueryResult } from '@zensation/core';

/** Transient error codes that trigger automatic retry. */
const RETRYABLE_ERRORS = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', '57P01', '57P03', '53300'];

/**
 * pg-pool's two connection timeouts, which it raises as plain Errors without a code:
 * no pooled client became free in time, or a new connection did not complete in time.
 */
const RETRYABLE_MESSAGES = ['timeout exceeded when trying to connect', 'Connection terminated due to connection timeout'];

/** Error codes that mean the server ended the connection or the socket broke. */
const CONNECTION_LOST = ['57P01', '57P02', '57P03', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT'];

/** A client borrowed from the pool, given back exactly once (see `PostgresAdapter.borrow`). */
interface Borrowed {
  client: PoolClient;
  /** The error the client emitted while it was borrowed, if any: its connection is gone. */
  readonly lost: Error | undefined;
  /** Gives the client back; with an error (or after `lost`) the pool destroys it. */
  release(err?: Error): void;
}

/**
 * Render a schema name for `SET search_path`.
 *
 * A plain identifier stays unquoted, so PostgreSQL folds it to lower case exactly as
 * before. Any other name is double-quoted with embedded quotes doubled, so it is always
 * read as one identifier and can never end the statement.
 */
function formatSchemaIdentifier(schema: string): string {
  if (schema.includes('\0')) {
    throw new Error('Invalid schema name: contains a NUL character');
  }
  if (/^[A-Za-z_][A-Za-z0-9_$]*$/.test(schema)) {
    return schema;
  }
  return `"${schema.replace(/"/g, '""')}"`;
}

export interface PostgresAdapterConfig {
  /**
   * PostgreSQL connection URL (e.g., postgres://user:pass@host:5432/db).
   * Takes precedence over individual connection fields.
   */
  connectionString?: string;

  /** Individual connection fields (used when connectionString is not provided). */
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;

  /** Maximum number of connections in the pool. Default: 8. */
  maxConnections?: number;

  /** Minimum number of idle connections. Default: 2. */
  minConnections?: number;

  /** Idle timeout in milliseconds. Default: 60000. */
  idleTimeoutMs?: number;

  /** Connection timeout in milliseconds. Default: 5000. */
  connectionTimeoutMs?: number;

  /**
   * Schema name for search_path isolation.
   * When set, every query runs with `SET search_path TO {schema}, public`.
   * A plain identifier is used as is; any other name is quoted as one identifier.
   * This enables multi-tenant or multi-context memory isolation.
   */
  schema?: string;

  /** SSL configuration. Set to false to disable, or provide rejectUnauthorized. */
  ssl?: boolean | { rejectUnauthorized: boolean };

  /** Maximum number of retries for transient errors. Default: 3. */
  maxRetries?: number;

  /** Optional logger. */
  logger?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

export class PostgresAdapter implements StorageAdapter {
  private pool: Pool;
  private readonly searchPathSql?: string;
  private readonly maxRetries: number;
  private readonly log: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

  constructor(config: PostgresAdapterConfig) {
    const poolConfig: PoolConfig = {};

    if (config.connectionString) {
      poolConfig.connectionString = config.connectionString;
    } else {
      poolConfig.host = config.host ?? 'localhost';
      poolConfig.port = config.port ?? 5432;
      poolConfig.user = config.user ?? 'postgres';
      poolConfig.password = config.password ?? '';
      poolConfig.database = config.database ?? 'zenbrain';
    }

    poolConfig.max = config.maxConnections ?? 8;
    poolConfig.min = config.minConnections ?? 2;
    poolConfig.idleTimeoutMillis = config.idleTimeoutMs ?? 60_000;
    poolConfig.connectionTimeoutMillis = config.connectionTimeoutMs ?? 5_000;
    poolConfig.keepAlive = true;

    if (config.ssl !== undefined) {
      poolConfig.ssl = typeof config.ssl === 'boolean'
        ? (config.ssl ? { rejectUnauthorized: true } : false)
        : config.ssl;
    }

    this.pool = new Pool(poolConfig);
    this.searchPathSql = config.schema
      ? `SET search_path TO ${formatSchemaIdentifier(config.schema)}, public`
      : undefined;
    this.maxRetries = config.maxRetries ?? 3;
    this.log = config.logger ?? { info() {}, warn() {}, error() {} };

    // Handle pool errors to prevent unhandled rejections
    this.pool.on('error', (err) => {
      this.log.error('Unexpected pool error', err);
    });
  }

  /**
   * Execute a parameterized SQL query.
   *
   * When `schema` is configured, each query runs inside a dedicated client
   * with `SET search_path TO {schema}, public` for isolation.
   */
  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Connecting is inside the try: a refused or reset connection is exactly the
      // transient error this loop exists for.
      let borrowed: Borrowed | undefined;
      try {
        borrowed = await this.borrow();
        // Set search_path for schema isolation
        if (this.searchPathSql) {
          await borrowed.client.query(this.searchPathSql);
        }

        const result = await borrowed.client.query(sql, params);

        if (attempt > 0) {
          this.log.info(`Query succeeded after ${attempt} retries`);
        }

        return {
          rows: result.rows as T[],
          rowCount: result.rowCount ?? undefined,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const retryable = this.isRetryable(lastError);
        // Given back before any waiting. A client that hit a transient error may hold a dead
        // connection; releasing it with the error makes pg destroy it instead of handing it to
        // the next query. Until 0.2.10 it was given back only after the wait, and a connection
        // that died meanwhile ended the process (see `borrow`).
        borrowed?.release(retryable ? lastError : undefined);

        if (retryable && attempt < this.maxRetries) {
          const delay = Math.min(100 * Math.pow(2, attempt) + Math.random() * 50, 2000);
          this.log.warn(`Retryable error (attempt ${attempt + 1}/${this.maxRetries}): ${lastError.message}`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        throw lastError;
      } finally {
        borrowed?.release();
      }
    }

    throw lastError ?? new Error('Query failed after retries');
  }

  /**
   * Execute multiple queries in a transaction.
   * Automatically rolls back on error.
   */
  async transaction<T>(fn: (adapter: StorageAdapter) => Promise<T>): Promise<T> {
    const borrowed = await this.borrow();
    const { client } = borrowed;
    try {
      if (this.searchPathSql) {
        await client.query(this.searchPathSql);
      }
      await client.query('BEGIN');

      // Create a transaction-scoped adapter that uses the same client
      const txAdapter: StorageAdapter = {
        query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<R>> => {
          const result = await client.query(sql, params);
          return { rows: result.rows as R[], rowCount: result.rowCount ?? undefined };
        },
        transaction: async <R>(innerFn: (a: StorageAdapter) => Promise<R>): Promise<R> => {
          // Savepoint for nested transactions
          await client.query('SAVEPOINT nested');
          try {
            const result = await innerFn(txAdapter);
            await client.query('RELEASE SAVEPOINT nested');
            return result;
          } catch (err) {
            await client.query('ROLLBACK TO SAVEPOINT nested');
            throw err;
          }
        },
      };

      const result = await fn(txAdapter);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const lost = borrowed.lost ?? (this.isConnectionLost(error) ? error : undefined);
      if (lost) {
        // The server ended the transaction with the connection; a ROLLBACK on the dead client
        // would only fail again. The client goes back with the error, so the pool destroys it.
        borrowed.release(lost);
      } else {
        await client.query('ROLLBACK').catch(() => {});
      }
      throw err;
    } finally {
      borrowed.release();
    }
  }

  /** Gracefully close the connection pool. */
  async close(): Promise<void> {
    await this.pool.end();
    this.log.info('PostgreSQL adapter pool closed');
  }

  /** Get the underlying pg Pool (for advanced use cases). */
  getPool(): Pool {
    return this.pool;
  }

  /**
   * A client from the pool, with an `error` listener for as long as it is borrowed.
   *
   * pg-pool listens for errors only on idle clients. When the connection of a borrowed client
   * dies (a server restart, `pg_terminate_backend`), the running query fails with 57P01 and the
   * client then emits "Connection terminated unexpectedly"; with no listener that is an
   * unhandled `error` event, which ends the process. Measured on 2026-11-22 against 0.2.9: a
   * server restart during `pg_sleep` ended the process in 4 of 4 `query()` runs. The listener
   * notes the error, and `release` hands the client back with it, so the pool destroys it.
   */
  private async borrow(): Promise<Borrowed> {
    const client = await this.pool.connect();
    let lost: Error | undefined;
    let released = false;
    const onError = (err: Error): void => {
      lost ??= err;
      this.log.warn(`Connection lost while in use: ${err.message}`);
    };
    client.on('error', onError);
    return {
      client,
      get lost() {
        return lost;
      },
      release(err?: Error): void {
        if (released) return;
        released = true;
        // pg-pool attaches its own listener again in release(), synchronously.
        client.removeListener('error', onError);
        client.release(err ?? lost);
      },
    };
  }

  /** Whether an error means that the connection is gone. */
  private isConnectionLost(err: Error): boolean {
    const code = (err as { code?: string }).code;
    return (code !== undefined && CONNECTION_LOST.includes(code)) || err.message.includes('Connection terminated');
  }

  private isRetryable(err: Error): boolean {
    const code = (err as { code?: string }).code;
    return RETRYABLE_ERRORS.some(c => code === c || err.message.includes(c))
      || RETRYABLE_MESSAGES.some(m => err.message.includes(m));
  }
}

/**
 * Create a PostgresAdapter from a DATABASE_URL environment variable.
 * Convenience factory for the most common setup.
 */
export function createPostgresAdapter(opts?: {
  schema?: string;
  logger?: PostgresAdapterConfig['logger'];
}): PostgresAdapter {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  return new PostgresAdapter({
    connectionString: url,
    schema: opts?.schema,
    logger: opts?.logger,
  });
}

export type { StorageAdapter, QueryResult } from '@zensation/core';
