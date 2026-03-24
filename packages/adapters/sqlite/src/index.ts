/**
 * @zensation/adapter-sqlite
 *
 * SQLite storage adapter for ZenBrain.
 * Zero-config, file-based. Perfect for development, testing, and single-user deployments.
 *
 * Uses better-sqlite3 for synchronous, fast SQLite access.
 * Translates PostgreSQL-style $1/$2 placeholders to SQLite ? placeholders.
 *
 * NOTE: This adapter does NOT support pgvector embedding operations.
 * For embedding-based search, use the PostgreSQL adapter.
 * SQLite layers will fall back to non-vector retrieval (recency, keyword match).
 */
import Database from 'better-sqlite3';
import type { StorageAdapter, QueryResult } from '@zensation/core';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface SqliteAdapterConfig {
  /**
   * Path to the SQLite database file.
   * Use ':memory:' for in-memory database (testing).
   * Default: './zenbrain.db'
   */
  filename?: string;

  /** Enable WAL mode for better concurrent read performance. Default: true. */
  walMode?: boolean;

  /** Optional logger. */
  logger?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

/**
 * Translate PostgreSQL-style parameterized queries to SQLite.
 * - $1, $2, $3 → ?, ?, ?
 * - Remove ::vector casts (not supported in SQLite)
 * - Remove pgvector operators (<=>)
 * - Replace gen_random_uuid() with a generated UUID
 * - Replace NOW() with datetime('now')
 * - Remove HNSW/GIN index hints
 */
function translateQuery(sql: string): string {
  let translated = sql;

  // Replace $N parameters with ?
  translated = translated.replace(/\$\d+/g, '?');

  // Remove PostgreSQL type casts (::vector, ::text, etc.)
  translated = translated.replace(/::\w+/g, '');

  // Replace gen_random_uuid() with a placeholder (handled in query execution)
  // We'll use a SQLite-compatible approach
  translated = translated.replace(/gen_random_uuid\(\)/gi, "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))");

  // Replace NOW() with datetime('now')
  translated = translated.replace(/\bNOW\(\)/gi, "datetime('now')");

  // Replace TIMESTAMPTZ with TEXT (SQLite stores dates as text)
  translated = translated.replace(/\bTIMESTAMPTZ\b/gi, 'TEXT');

  // Remove vector-specific operations (embedding <=> $1)
  // These queries won't work in SQLite — caller should handle fallback
  translated = translated.replace(/\bembedding\s*<=>\s*\?/g, '0');
  translated = translated.replace(/1\s*-\s*\(0\)/g, '0 as score --');

  // Replace ON CONFLICT (label) DO UPDATE with SQLite equivalent
  // SQLite uses the same syntax, so this should work as-is

  // Remove RETURNING * (SQLite < 3.35 doesn't support it)
  // For SQLite 3.35+, RETURNING is supported, but we'll handle it safely
  // We'll keep RETURNING for modern SQLite versions

  return translated;
}

export class SqliteAdapter implements StorageAdapter {
  private db: Database.Database;
  private readonly log: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

  constructor(config: SqliteAdapterConfig = {}) {
    const filename = config.filename ?? './zenbrain.db';
    this.log = config.logger ?? { info() {}, warn() {}, error() {} };

    // Ensure parent directory exists
    if (filename !== ':memory:') {
      const dir = dirname(filename);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(filename);

    // Enable WAL mode for better performance
    if (config.walMode !== false) {
      this.db.pragma('journal_mode = WAL');
    }

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Initialize schema
    this.initSchema();

    this.log.info(`SQLite adapter initialized: ${filename}`);
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const translated = translateQuery(sql);
    const normalized = translated.trim().toUpperCase();

    try {
      // Filter out null/undefined params that SQLite doesn't handle well
      const safeParams = (params ?? []).map(p => p === undefined ? null : p);

      if (normalized.startsWith('SELECT') || normalized.startsWith('WITH')) {
        const stmt = this.db.prepare(translated);
        const rows = stmt.all(...safeParams) as T[];
        return { rows, rowCount: rows.length };
      }

      if (normalized.startsWith('INSERT') && translated.toUpperCase().includes('RETURNING')) {
        const stmt = this.db.prepare(translated);
        const rows = stmt.all(...safeParams) as T[];
        return { rows, rowCount: rows.length };
      }

      if (normalized.startsWith('INSERT') || normalized.startsWith('UPDATE') || normalized.startsWith('DELETE')) {
        const stmt = this.db.prepare(translated);
        const result = stmt.run(...safeParams);
        return { rows: [] as T[], rowCount: result.changes };
      }

      // DDL or other statements
      this.db.exec(translated);
      return { rows: [] as T[] };
    } catch (err) {
      // Re-throw with context
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`SQLite query error: ${msg}\nQuery: ${translated.substring(0, 200)}`);
    }
  }

  async transaction<T>(fn: (adapter: StorageAdapter) => Promise<T>): Promise<T> {
    const txn = this.db.transaction(() => {});
    // We need async support, so we manage BEGIN/COMMIT manually
    this.db.exec('BEGIN');
    try {
      const result = await fn(this);
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async close(): Promise<void> {
    this.db.close();
    this.log.info('SQLite adapter closed');
  }

  /** Get the underlying better-sqlite3 Database instance. */
  getDatabase(): Database.Database {
    return this.db;
  }

  /**
   * Initialize the database schema.
   * Creates all memory tables if they don't exist.
   * Safe to call multiple times (uses IF NOT EXISTS).
   */
  private initSchema(): void {
    this.db.exec(`
      -- Layer 3: Episodic Memory
      CREATE TABLE IF NOT EXISTS episodic_memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        context TEXT,
        embedding TEXT, -- JSON array (no pgvector in SQLite)
        emotional_weight REAL,
        metadata TEXT, -- JSON
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Layer 4: Semantic Long-Term Memory
      CREATE TABLE IF NOT EXISTS learned_facts (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.7,
        source TEXT NOT NULL DEFAULT 'conversation',
        embedding TEXT,
        access_count INTEGER NOT NULL DEFAULT 0,
        fsrs_difficulty REAL,
        fsrs_stability REAL,
        fsrs_next_review TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_accessed TEXT
      );

      -- Layer 5: Procedural Memory
      CREATE TABLE IF NOT EXISTS procedural_memories (
        id TEXT PRIMARY KEY,
        trigger_text TEXT NOT NULL,
        steps TEXT NOT NULL DEFAULT '[]',
        tools TEXT NOT NULL DEFAULT '[]',
        outcome TEXT NOT NULL,
        embedding TEXT,
        success_rate REAL NOT NULL DEFAULT 1.0,
        execution_count INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Layer 6: Core Memory Blocks
      CREATE TABLE IF NOT EXISTS core_memory_blocks (
        id TEXT PRIMARY KEY,
        label TEXT UNIQUE NOT NULL,
        content TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Layer 7: Cross-Context Links
      CREATE TABLE IF NOT EXISTS cross_context_links (
        id TEXT PRIMARY KEY,
        entity_a TEXT NOT NULL,
        entity_b TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(entity_a, entity_b)
      );

      -- Knowledge Entities
      CREATE TABLE IF NOT EXISTS knowledge_entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'concept',
        embedding TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_episodic_created ON episodic_memories (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_episodic_context ON episodic_memories (context);
      CREATE INDEX IF NOT EXISTS idx_facts_created ON learned_facts (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_facts_confidence ON learned_facts (confidence DESC);
      CREATE INDEX IF NOT EXISTS idx_facts_review ON learned_facts (fsrs_next_review ASC);
      CREATE INDEX IF NOT EXISTS idx_procedures_success ON procedural_memories (success_rate DESC);
      CREATE INDEX IF NOT EXISTS idx_entities_type ON knowledge_entities (type);
    `);
  }
}

/**
 * Create an in-memory SQLite adapter.
 * Perfect for testing — no files created, no cleanup needed.
 */
export function createMemoryAdapter(logger?: SqliteAdapterConfig['logger']): SqliteAdapter {
  return new SqliteAdapter({ filename: ':memory:', logger });
}

/**
 * Create a file-based SQLite adapter.
 * Auto-creates the directory and file if they don't exist.
 */
export function createFileAdapter(path = './zenbrain.db', logger?: SqliteAdapterConfig['logger']): SqliteAdapter {
  return new SqliteAdapter({ filename: path, logger });
}

export type { StorageAdapter, QueryResult } from '@zensation/core';
