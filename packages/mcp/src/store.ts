/**
 * A store file that is created by the first write, not by the server's start.
 *
 * Measured on 0.3.1 (2026-11-20): started in an empty directory, the server
 * created `zenbrain.db`, `zenbrain.db-wal` and `zenbrain.db-shm` before any tool
 * was called, and the first `zenbrain_recall` or `zenbrain_health` — both
 * annotated `readOnlyHint: true` — then wrote SQLite's read mark into the `-shm`
 * file. A client that compares the directory before and after a read-only call
 * saw files appear and bytes change, although no tool had written a memory.
 *
 * So the server does not open a store file that does not exist yet. Until the
 * first statement that adds a row, the others are answered from an empty
 * in-memory store, which is what a store that was never written to holds. Before each read the
 * file is looked for again, because a second server on the same path (a second
 * Claude Code window, say) may have created it in the meantime; from then on
 * this server reads that file. A store file that already exists is opened at
 * start, as before.
 *
 * This module imports no native code: it is loaded before the Node version check
 * has had its say, and the adapters are handed in as factories.
 */
import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { dirname, parse, resolve as resolvePath } from 'node:path';
import type { QueryResult, StorageAdapter } from '@zensation/core';

/**
 * What a statement can do to a store that has no rows yet.
 *
 * - `read`: SELECT or WITH, the two kinds the SQLite adapter answers with rows.
 * - `change`: UPDATE or DELETE. On an empty store they match no row, so before
 *   the file exists they are answered from the empty store and create nothing:
 *   `zenbrain_forget` and `zenbrain_consolidate` on a memory that was never
 *   written leave the directory as it was.
 * - `add`: everything else (INSERT above all). It opens the file. Misjudging a
 *   statement as `add` only creates the file early; it never loses data.
 */
export function statementKind(sql: string): 'read' | 'change' | 'add' {
  const head = sql.trimStart().slice(0, 6).toUpperCase();
  if (head.startsWith('SELECT') || head.startsWith('WITH')) return 'read';
  if (head.startsWith('UPDATE') || head.startsWith('DELETE')) return 'change';
  return 'add';
}

/**
 * The directory in which creating `filename` would first create something: the
 * nearest directory on its path that already exists. `undefined` when no part
 * of the path exists as a directory (the path then runs through a regular file).
 */
export function nearestExistingDirectory(filename: string, cwd: string = process.cwd()): string | undefined {
  let dir = dirname(resolvePath(cwd, filename));
  const { root } = parse(dir);
  for (;;) {
    if (existsSync(dir)) return statSync(dir).isDirectory() ? dir : undefined;
    if (dir === root) return undefined;
    dir = dirname(dir);
  }
}

/**
 * Why the store could not be created there later, or `null` if it can.
 *
 * Checked at start without creating anything, so that a server started where
 * nothing can be written — the working directory `/` that some clients choose —
 * still says so at once instead of failing on its first `zenbrain_store`.
 */
export function storeCreationProblem(filename: string, cwd: string = process.cwd()): string | null {
  const dir = nearestExistingDirectory(filename, cwd);
  if (dir === undefined) return `no directory on the path ${resolvePath(cwd, filename)} exists`;
  try {
    accessSync(dir, constants.W_OK);
    return null;
  } catch (err) {
    return `cannot create files in ${dir}: ${String(err)}`;
  }
}

export interface DeferredStoreOptions {
  /** Path of the store file, as the adapter will be given it. */
  filename: string;
  /** Opens (and, if needed, creates) the store file. */
  openFile: () => StorageAdapter;
  /** An empty store that writes no file, for reads before the file exists. */
  openEmpty: () => StorageAdapter;
}

/** A StorageAdapter that opens the store file when the first row is added. */
export class DeferredStore implements StorageAdapter {
  private file: StorageAdapter | undefined;
  private empty: StorageAdapter | undefined;

  constructor(private readonly options: DeferredStoreOptions) {
    if (existsSync(options.filename)) this.file = options.openFile();
  }

  /** Whether the store file has been opened (it exists from then on). */
  get fileOpen(): boolean {
    return this.file !== undefined;
  }

  private target(adds: boolean): StorageAdapter {
    if (this.file) return this.file;
    if (adds || existsSync(this.options.filename)) {
      this.file = this.options.openFile();
      return this.file;
    }
    this.empty ??= this.options.openEmpty();
    return this.empty;
  }

  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    return this.target(statementKind(sql) === 'add').query<T>(sql, params);
  }

  transaction<T>(fn: (adapter: StorageAdapter) => Promise<T>): Promise<T> {
    return this.target(true).transaction(fn);
  }

  async close(): Promise<void> {
    try {
      await this.file?.close?.();
    } finally {
      await this.empty?.close?.();
    }
  }
}
