/**
 * In-memory implementations for testing.
 * These are NOT production adapters — use @zensation/adapter-postgres or @zensation/adapter-sqlite.
 */
import type { StorageAdapter, QueryResult } from './interfaces/storage';
import type { EmbeddingProvider } from './interfaces/embedding';
import type { CacheProvider } from './interfaces/cache';

/**
 * In-memory storage adapter for testing.
 * Stores rows in a Map keyed by table name.
 * Supports basic INSERT/SELECT/UPDATE/DELETE via regex parsing.
 */
export class InMemoryStorage implements StorageAdapter {
  private tables = new Map<string, Record<string, unknown>[]>();

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    // Very basic SQL parsing for testing — NOT a real SQL engine
    const normalized = sql.trim().toUpperCase();

    if (normalized.startsWith('INSERT')) {
      return this.handleInsert(sql, params) as QueryResult<T>;
    }
    if (normalized.startsWith('SELECT')) {
      return this.handleSelect(sql, params) as QueryResult<T>;
    }
    if (normalized.startsWith('UPDATE')) {
      return { rows: [], rowCount: 1 } as QueryResult<T>;
    }
    if (normalized.startsWith('DELETE')) {
      return { rows: [], rowCount: 1 } as QueryResult<T>;
    }

    return { rows: [] } as QueryResult<T>;
  }

  async transaction<T>(fn: (adapter: StorageAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }

  private handleInsert(sql: string, params?: unknown[]): QueryResult {
    // Extract table name
    const match = sql.match(/INTO\s+(\w+)/i);
    const table = match?.[1] ?? 'unknown';

    const row: Record<string, unknown> = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };

    // Map params to a generic row
    if (params) {
      params.forEach((p, i) => {
        row[`col_${i}`] = p;
      });
    }

    if (!this.tables.has(table)) {
      this.tables.set(table, []);
    }
    this.tables.get(table)!.push(row);

    return { rows: [row], rowCount: 1 };
  }

  private handleSelect(sql: string, params?: unknown[]): QueryResult {
    const match = sql.match(/FROM\s+(\w+)/i);
    const table = match?.[1] ?? 'unknown';
    const rows = this.tables.get(table) ?? [];

    // Basic LIMIT support
    const limitMatch = sql.match(/LIMIT\s+\$(\d+)/i);
    if (limitMatch && params) {
      const limitIdx = parseInt(limitMatch[1], 10) - 1;
      const limit = params[limitIdx] as number;
      return { rows: rows.slice(0, limit) };
    }

    return { rows: [...rows] };
  }

  /** Get all rows in a table (for test assertions). */
  getTable(name: string): Record<string, unknown>[] {
    return this.tables.get(name) ?? [];
  }

  /** Clear all data. */
  clear(): void {
    this.tables.clear();
  }
}

/**
 * Fake embedding provider for testing.
 * Returns deterministic vectors based on text hash.
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  private readonly dims: number;

  constructor(dimensions = 8) {
    this.dims = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    // Simple deterministic hash → vector
    const vec = new Array(this.dims).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % this.dims] += text.charCodeAt(i) / 1000;
    }
    // Normalize
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return mag > 0 ? vec.map(v => v / mag) : vec;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  dimensions(): number {
    return this.dims;
  }
}

/**
 * In-memory cache for testing.
 */
export class InMemoryCache implements CacheProvider {
  private store = new Map<string, { value: unknown; expires?: number }>();

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expires && Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}
