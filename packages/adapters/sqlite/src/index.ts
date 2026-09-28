/**
 * @zensation/adapter-sqlite
 *
 * SQLite storage adapter for ZenBrain.
 * Zero-config, file-based. Perfect for development, testing, and single-user deployments.
 *
 * Uses better-sqlite3 for synchronous, fast SQLite access.
 * Translates PostgreSQL-style $1/$2 placeholders to SQLite ?1/?2 placeholders.
 *
 * Embedding search: pgvector's `<=>` operator is rewritten to a cosine-distance
 * UDF (zb_cosine_dist) over the JSON-array embeddings this adapter stores, so
 * semantic/episodic/procedural similarity search works on SQLite. It is a full
 * scan per query (no ANN index) — fine for development, testing and single-user
 * data volumes; use the PostgreSQL adapter for large production workloads.
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
 * The one timestamp format this adapter writes: ISO 8601, UTC, milliseconds,
 * `Z` — the shape `Date.prototype.toISOString()` produces, which is how
 * `query()` already binds the layers' `Date` parameters.
 *
 * NOW() and the column defaults used to write SQLite's `datetime('now')`
 * (`2026-09-28 21:25:17`, no zone), so one table, sometimes one row, carried
 * two formats (`created_at` beside `fsrs_next_review`). Measured on 2026-09-28
 * against the published packages and a real database file: text comparison
 * puts `' '` before `'T'`, so a fact did not come back from `getDueForReview`
 * on its due date, and an episode stored today was missing from
 * `getByTimeRange(today 00:00Z, …)`; and `new Date('2026-09-28 21:25:17')` is
 * read as local time, so in Berlin every `createdAt` came back two hours early.
 * With one format, text order is time order and every value parses as UTC.
 */
const SQL_NOW_UTC = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** The canonical form as a GLOB pattern, to find values written before it. */
const ISO_UTC_GLOB =
  '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z';

/** Every timestamp column the schema below defines, by table. */
const TIMESTAMP_COLUMNS: Record<string, readonly string[]> = {
  episodic_memories: ['created_at'],
  learned_facts: ['created_at', 'last_accessed', 'fsrs_next_review'],
  procedural_memories: ['created_at'],
  core_memory_blocks: ['updated_at'],
  cross_context_links: ['created_at'],
  knowledge_entities: ['created_at'],
};

/**
 * The schema version this adapter brings a database to, kept in
 * `PRAGMA user_version` (0 on a file written before versions were recorded).
 *
 * 1 — every timestamp in the one format above.
 */
export const SCHEMA_VERSION = 1;

/**
 * Translate PostgreSQL-style parameterized queries to SQLite.
 * - $1, $2, $3 → ?1, ?2, ?3 (numbered, so a repeated $1 binds the same value —
 *   the layers' vector queries use $1 twice with a single parameter)
 * - Remove ::vector casts (not supported in SQLite)
 * - Rewrite the pgvector distance operator (embedding <=> $1) to the
 *   zb_cosine_dist() UDF registered on the connection, so similarity search
 *   works on SQLite instead of producing invalid SQL
 * - Replace gen_random_uuid() with a generated UUID
 * - Replace NOW() with the current time in the one timestamp format above
 * - Remove HNSW/GIN index hints
 */
function translateQuery(sql: string): string {
  let translated = sql;

  // Replace $N parameters with numbered ?N placeholders. Numbered (not anonymous)
  // is load-bearing: the vector queries reference $1 in both SELECT and ORDER BY
  // while passing the embedding only once.
  translated = translated.replace(/\$(\d+)/g, '?$1');

  // Remove PostgreSQL type casts (::vector, ::text, etc.)
  translated = translated.replace(/::\w+/g, '');

  // Replace gen_random_uuid() with a placeholder (handled in query execution)
  // We'll use a SQLite-compatible approach
  translated = translated.replace(/gen_random_uuid\(\)/gi, "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))");

  // Replace NOW() with the current time, ISO 8601 UTC (see SQL_NOW_UTC)
  translated = translated.replace(/\bNOW\(\)/gi, SQL_NOW_UTC);

  // Replace TIMESTAMPTZ with TEXT (SQLite stores dates as text)
  translated = translated.replace(/\bTIMESTAMPTZ\b/gi, 'TEXT');

  // pgvector cosine-distance operator → cosine UDF over the stored JSON-array
  // embedding. Ascending distance keeps the layers' ORDER BY semantics.
  translated = translated.replace(/(\w+)\s*<=>\s*(\?\d+)/g, 'zb_cosine_dist($1, $2)');

  // Replace ON CONFLICT (label) DO UPDATE with SQLite equivalent
  // SQLite uses the same syntax, so this should work as-is

  // Remove RETURNING * (SQLite < 3.35 doesn't support it)
  // For SQLite 3.35+, RETURNING is supported, but we'll handle it safely
  // We'll keep RETURNING for modern SQLite versions

  return translated;
}

/**
 * Parse an embedding stored as a pgvector-style string ("[0.1,0.2,...]") into
 * a number array. Returns null for anything that isn't a numeric JSON array.
 */
function parseVector(value: unknown): number[] | null {
  if (typeof value !== 'string' || value.length < 2) return null;
  try {
    const arr: unknown = JSON.parse(value);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr.every((x): x is number => typeof x === 'number') ? arr : null;
  } catch {
    return null;
  }
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

    // Cosine distance over pgvector-style string embeddings ("[0.1,...]").
    // translateQuery rewrites `embedding <=> $1` to this UDF, giving SQLite real
    // similarity search. Mismatched/unparsable vectors get max distance (1) so
    // they sort last instead of crashing the query.
    this.db.function('zb_cosine_dist', { deterministic: true }, (a: unknown, b: unknown): number => {
      const va = parseVector(a);
      const vb = parseVector(b);
      if (!va || !vb || va.length !== vb.length) return 1;
      let dot = 0;
      let na = 0;
      let nb = 0;
      for (let i = 0; i < va.length; i++) {
        dot += va[i] * vb[i];
        na += va[i] * va[i];
        nb += vb[i] * vb[i];
      }
      const denom = Math.sqrt(na) * Math.sqrt(nb);
      return denom > 0 ? 1 - dot / denom : 1;
    });

    // Enable WAL mode for better performance
    if (config.walMode !== false) {
      this.db.pragma('journal_mode = WAL');
    }

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Initialize schema, then bring a file written by an earlier version up to it
    this.initSchema();
    this.migrate();

    this.log.info(`SQLite adapter initialized: ${filename}`);
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const translated = translateQuery(sql);
    const normalized = translated.trim().toUpperCase();

    try {
      // Coerce params SQLite can't bind: undefined → null, Date → ISO string,
      // boolean → 1/0. The core layers pass FSRS review times (fsrs_next_review)
      // as Date objects and a core block's `pinned` flag as a boolean;
      // better-sqlite3 binds only numbers, strings, bigints, buffers and null.
      // Until the boolean case was added, every write to core memory failed on
      // SQLite (measured 2026-09-28 against the published @zensation/mcp 0.1.6:
      // `type: 'core'` and `confidence` above 0.9 both errored and stored nothing).
      const safeParams = (params ?? []).map(p =>
        p === undefined
          ? null
          : p instanceof Date
            ? p.toISOString()
            : typeof p === 'boolean'
              ? (p ? 1 : 0)
              : p
      );

      // better-sqlite3 treats numbered placeholders (?1, ?2) as *named* parameters,
      // so they must be bound via an object keyed "1".."N" — spreading positional
      // values against them throws "Too many parameter values were provided".
      const bindArgs: unknown[] = /\?\d+/.test(translated)
        ? safeParams.length > 0
          ? [Object.fromEntries(safeParams.map((v, i) => [String(i + 1), v]))]
          : []
        : safeParams;

      if (normalized.startsWith('SELECT') || normalized.startsWith('WITH')) {
        const stmt = this.db.prepare(translated);
        const rows = stmt.all(...bindArgs) as T[];
        return { rows, rowCount: rows.length };
      }

      if (normalized.startsWith('INSERT') && translated.toUpperCase().includes('RETURNING')) {
        const stmt = this.db.prepare(translated);
        const rows = stmt.all(...bindArgs) as T[];
        return { rows, rowCount: rows.length };
      }

      if (normalized.startsWith('INSERT') || normalized.startsWith('UPDATE') || normalized.startsWith('DELETE')) {
        const stmt = this.db.prepare(translated);
        const result = stmt.run(...bindArgs);
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
   * Bring a database written by an earlier version to SCHEMA_VERSION.
   *
   * Runs once per file; `PRAGMA user_version` records that it ran. Version 1
   * rewrites every timestamp into the one format, in one transaction. Only
   * text that SQLite can read as a time is rewritten: a value it cannot read
   * stays as it is instead of becoming NULL — a migration must not destroy
   * what it does not understand.
   *
   * Column defaults of tables created before version 1 keep `datetime('now')`;
   * SQLite cannot change a default without rebuilding the table. The layers
   * never rely on a default — every insert sets its timestamp through NOW() —
   * so only code that writes these tables directly and leaves the timestamp
   * out still gets the old format there.
   */
  private migrate(): void {
    const version = this.db.pragma('user_version', { simple: true }) as number;
    if (version >= SCHEMA_VERSION) return;

    let rewritten = 0;
    this.db.transaction(() => {
      for (const [table, columns] of Object.entries(TIMESTAMP_COLUMNS)) {
        for (const column of columns) {
          rewritten += this.db
            .prepare(
              `UPDATE ${table} SET ${column} = strftime('%Y-%m-%dT%H:%M:%fZ', ${column})
               WHERE typeof(${column}) = 'text'
                 AND ${column} NOT GLOB '${ISO_UTC_GLOB}'
                 AND strftime('%Y-%m-%dT%H:%M:%fZ', ${column}) IS NOT NULL`,
            )
            .run().changes;
        }
      }
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
    })();

    if (rewritten > 0) {
      this.log.info(`SQLite adapter: ${rewritten} timestamp(s) rewritten to ISO 8601 UTC`);
    }
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
        created_at TEXT NOT NULL DEFAULT (${SQL_NOW_UTC})
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
        created_at TEXT NOT NULL DEFAULT (${SQL_NOW_UTC}),
        last_accessed TEXT
      );

      -- Layer 5: Procedural Memory
      CREATE TABLE IF NOT EXISTS procedural_memories (
        id TEXT PRIMARY KEY,
        -- Must match the canonical schema (adapters/postgres/sql/001_init.sql),
        -- which ProceduralMemory queries by this name. SQLite accepts trigger as
        -- an unquoted column name despite TRIGGER being a keyword; calling it
        -- trigger_text here silently broke every procedural insert.
        trigger TEXT NOT NULL,
        steps TEXT NOT NULL DEFAULT '[]',
        tools TEXT NOT NULL DEFAULT '[]',
        outcome TEXT NOT NULL,
        embedding TEXT,
        success_rate REAL NOT NULL DEFAULT 1.0,
        execution_count INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (${SQL_NOW_UTC})
      );

      -- Layer 6: Core Memory Blocks
      CREATE TABLE IF NOT EXISTS core_memory_blocks (
        id TEXT PRIMARY KEY,
        label TEXT UNIQUE NOT NULL,
        content TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (${SQL_NOW_UTC})
      );

      -- Layer 7: Cross-Context Links
      CREATE TABLE IF NOT EXISTS cross_context_links (
        id TEXT PRIMARY KEY,
        entity_a TEXT NOT NULL,
        entity_b TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (${SQL_NOW_UTC}),
        UNIQUE(entity_a, entity_b)
      );

      -- Knowledge Entities
      CREATE TABLE IF NOT EXISTS knowledge_entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'concept',
        embedding TEXT,
        created_at TEXT NOT NULL DEFAULT (${SQL_NOW_UTC})
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
