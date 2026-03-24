/**
 * Generic storage adapter interface.
 *
 * Implement this to plug in any database backend (PostgreSQL, SQLite, in-memory, etc.).
 * The SQL-based API is intentionally low-level — adapters translate to their native query language.
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number;
}

export interface StorageAdapter {
  /**
   * Execute a parameterized query.
   * Parameters use $1, $2, ... placeholders (PostgreSQL style).
   * Adapters for other databases (SQLite, etc.) translate placeholders internally.
   */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;

  /**
   * Execute multiple queries in a transaction.
   * If the callback throws, the transaction is rolled back.
   */
  transaction<T>(fn: (adapter: StorageAdapter) => Promise<T>): Promise<T>;

  /**
   * Close the storage connection. Called during graceful shutdown.
   */
  close?(): Promise<void>;
}
