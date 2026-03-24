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
  private readonly schema?: string;
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
    this.schema = config.schema;
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
      const client = await this.pool.connect();
      try {
        // Set search_path for schema isolation
        if (this.schema) {
          await client.query(`SET search_path TO ${this.schema}, public`);
        }

        const result = await client.query(sql, params);

        if (attempt > 0) {
          this.log.info(`Query succeeded after ${attempt} retries`);
        }

        return {
          rows: result.rows as T[],
          rowCount: result.rowCount ?? undefined,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (this.isRetryable(lastError) && attempt < this.maxRetries) {
          const delay = Math.min(100 * Math.pow(2, attempt) + Math.random() * 50, 2000);
          this.log.warn(`Retryable error (attempt ${attempt + 1}/${this.maxRetries}): ${lastError.message}`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        throw lastError;
      } finally {
        client.release();
      }
    }

    throw lastError ?? new Error('Query failed after retries');
  }

  /**
   * Execute multiple queries in a transaction.
   * Automatically rolls back on error.
   */
  async transaction<T>(fn: (adapter: StorageAdapter) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      if (this.schema) {
        await client.query(`SET search_path TO ${this.schema}, public`);
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
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
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

  private isRetryable(err: Error): boolean {
    const code = (err as { code?: string }).code;
    return RETRYABLE_ERRORS.some(c => code === c || err.message.includes(c));
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
