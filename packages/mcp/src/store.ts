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
 * in-memory store, which is what a store that was never written to holds.
 * Before each read the file is looked for again, because a second server on the
 * same path (a second Claude Code window, say) may have created it in the
 * meantime; from then on this server reads that file. A store file that already
 * exists is opened at start, as before.
 *
 * This module imports no native code: it is loaded before the Node version check
 * has had its say, and the adapters are handed in as factories.
 */
import { accessSync, closeSync, constants, existsSync, lstatSync, openSync, readlinkSync, readSync, statSync } from 'node:fs';
import { dirname, parse, resolve as resolvePath } from 'node:path';
import type { QueryResult, StorageAdapter } from '@zensation/core';

/**
 * What a statement can do to a store that has no rows yet.
 *
 * - `read`: SELECT, a WITH that only selects, and a PRAGMA that only reads (`PRAGMA x`;
 *   `PRAGMA x = v` and `PRAGMA x(v)` set a value and count as `add`).
 * - `change`: UPDATE or DELETE. On an empty store they match no row, so before
 *   the file exists they are answered from the empty store and create nothing:
 *   `zenbrain_forget` and `zenbrain_consolidate` on a memory that was never
 *   written leave the directory as it was.
 * - `add`: everything else: INSERT, a WITH that inserts, updates or deletes, a
 *   PRAGMA that sets a value, DDL. It opens the file. Misjudging a statement as
 *   `add` only creates the file early; it never loses data.
 */
export function statementKind(sql: string): 'read' | 'change' | 'add' {
  const text = sql.trimStart();
  const head = text.slice(0, 6).toUpperCase();
  if (head.startsWith('SELECT')) return 'read';
  if (head.startsWith('WITH')) return /\b(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(text) ? 'add' : 'read';
  if (head.startsWith('PRAGMA')) return /[=(]/.test(text) ? 'add' : 'read';
  if (head.startsWith('UPDATE') || head.startsWith('DELETE')) return 'change';
  return 'add';
}

/**
 * The first part of the path to `filename` that already exists: a directory to
 * create the rest in, or something that blocks the path. `undefined` only if not
 * even the root exists.
 */
export function nearestExisting(
  filename: string,
  cwd: string = process.cwd(),
): { path: string; kind: 'directory' | 'file' | 'dangling-link' } | undefined {
  let path = dirname(resolvePath(cwd, filename));
  const { root } = parse(path);
  for (;;) {
    let isLink = false;
    try {
      isLink = lstatSync(path).isSymbolicLink();
    } catch {
      // nothing at this path, not even a link
    }
    if (existsSync(path)) return { path, kind: statSync(path).isDirectory() ? 'directory' : 'file' };
    if (isLink) return { path, kind: 'dangling-link' };
    if (path === root) return undefined;
    path = dirname(path);
  }
}

/**
 * Longest name one path component may have: 255 bytes on the file systems of
 * Linux and macOS, 255 UTF-16 code units on NTFS.
 */
const NAME_MAX = 255;
const nameLength = (name: string): number => (process.platform === 'win32' ? name.length : Buffer.byteLength(name));
/**
 * Names Windows refuses for a file in any directory. (A trailing dot or space is
 * not refused but dropped by Windows, so it is not checked.)
 */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/**
 * Why the store could not be created there later, or `null` if, as far as can be
 * told without creating anything, it can.
 *
 * Checked at start so that a server started where nothing can be written — the
 * working directory `/` that some clients choose — still says so at once instead
 * of failing on its first `zenbrain_store`. It finds: no writable directory on
 * the path, a part of the path that is a file or a link to nothing, a name
 * longer than 255 bytes, and on Windows a name Windows refuses. The store path
 * itself may be a link to a file that does not exist yet: SQLite follows the link
 * and creates the file it points to, as 0.3.1 did, so then the link's target is
 * checked instead. Anything else (a full disk, a quota, a file system that
 * refuses the name for its own reasons) surfaces at the first store. On Windows
 * the write check passes for every directory (Node does not read ACLs there).
 */
export function storeCreationProblem(filename: string, cwd: string = process.cwd(), links = 0): string | null {
  const full = resolvePath(cwd, filename);
  try {
    if (lstatSync(full).isSymbolicLink() && !existsSync(full)) {
      if (links >= 8) return `${full} is one of too many links in a row`;
      const target = resolvePath(dirname(full), readlinkSync(full));
      if (!existsSync(dirname(target))) return `${full} is a link to ${target}, whose directory does not exist`;
      return storeCreationProblem(target, cwd, links + 1);
    }
  } catch {
    // no such path: the usual case
  }
  const found = nearestExisting(filename, cwd);
  if (found === undefined) return `no part of the path ${full} exists`;
  if (found.kind === 'file') return `${found.path} is a file, not a directory`;
  if (found.kind === 'dangling-link') return `${found.path} is a link to nothing`;

  const missing = full.slice(found.path.length).split(/[\\/]+/).filter(Boolean);
  for (const name of missing) {
    if (nameLength(name) > NAME_MAX) {
      return `the name ${name.slice(0, 40)}… is longer than ${NAME_MAX} ${process.platform === 'win32' ? 'characters' : 'bytes'}`;
    }
    if (process.platform === 'win32' && (/[<>:"|?*\x00-\x1f]/.test(name) || WINDOWS_RESERVED.test(name))) {
      return `Windows does not allow the name ${name}`;
    }
  }
  try {
    accessSync(found.path, constants.W_OK);
    return null;
  } catch (err) {
    return `cannot create files in ${found.path}: ${String(err)}`;
  }
}

/**
 * Whether a store file that appeared while this server runs is ready to be read.
 *
 * The SQLite adapter creates a file, then its tables one by one, and last sets
 * `PRAGMA user_version` to its schema version. Opening the file before that
 * would make this server complete the schema itself — a write in the middle of
 * a read-only call. So a file without a full header, or whose `user_version` is
 * still 0, is treated as not there yet, and reads keep coming from the empty
 * store. A WAL store that another server has open (its `-wal` file exists) is
 * read at once, because its header may lag behind what is in the `-wal` file.
 */
export function storeFileReady(filename: string): boolean {
  if (!existsSync(filename)) return false;
  if (existsSync(`${filename}-wal`)) return true;
  const header = Buffer.alloc(100);
  let read = 0;
  try {
    const fd = openSync(filename, 'r');
    try {
      read = readSync(fd, header, 0, 100, 0);
    } finally {
      closeSync(fd);
    }
  } catch {
    // unreadable: let opening it report why
    return true;
  }
  if (read < 100) return false;
  if (header.toString('latin1', 0, 16) !== 'SQLite format 3\u0000') return true; // not SQLite: opening reports it
  return header.readUInt32BE(60) >= 1;
}

/**
 * `null` if `filename` is missing, empty or starts like a SQLite database; otherwise
 * why it is not one. Checked before the adapter opens a file, because a failed
 * open of a file that is not a database leaves a connection behind until garbage
 * collection; this way no connection is made for it at all.
 */
export function notSqliteReason(filename: string): string | null {
  const head = Buffer.alloc(16);
  let read = 0;
  try {
    const fd = openSync(filename, 'r');
    try {
      read = readSync(fd, head, 0, 16, 0);
    } finally {
      closeSync(fd);
    }
  } catch {
    return null; // missing or unreadable: opening reports it
  }
  if (read === 0) return null;
  return read === 16 && head.toString('latin1') === 'SQLite format 3\u0000' ? null : 'file is not a database';
}

/** How long a store file that failed to open is left alone before the next attempt. */
export const OPEN_RETRY_MS = 10_000;

export interface DeferredStoreOptions {
  /** Path of the store file, as the adapter will be given it. */
  filename: string;
  /** Opens (and, if needed, creates) the store file. */
  openFile: () => StorageAdapter;
  /** An empty store that writes no file, for reads before the file exists. */
  openEmpty: () => StorageAdapter;
  /** Clock, injectable for tests. */
  now?: () => number;
}

/** Thrown inside a deferred transaction when it turns out to write. */
class NeedsFile extends Error {}

/** A StorageAdapter that opens the store file when the first row is added. */
export class DeferredStore implements StorageAdapter {
  private file: StorageAdapter | undefined;
  private empty: StorageAdapter | undefined;
  private failure: Error | undefined;
  private retryAt = 0;
  private readonly now: () => number;

  constructor(private readonly options: DeferredStoreOptions) {
    this.now = options.now ?? Date.now;
    // A file with content is opened now, as 0.3.1 did: a store written before the
    // schema got a version (by 0.1.6 or earlier) is brought up to date here. An
    // empty file, left by a creation that never finished, waits for the first store.
    if (existsSync(options.filename) && statSync(options.filename).size > 0) this.file = options.openFile();
  }

  /** Whether the store file has been opened (it exists from then on). */
  get fileOpen(): boolean {
    return this.file !== undefined;
  }

  private open(): StorageAdapter {
    if (this.file) return this.file;
    if (this.failure !== undefined && this.now() < this.retryAt) throw this.failure;
    try {
      this.file = this.options.openFile();
      this.failure = undefined;
      return this.file;
    } catch (err) {
      this.failure = err instanceof Error ? err : new Error(String(err));
      this.retryAt = this.now() + OPEN_RETRY_MS;
      throw this.failure;
    }
  }

  private target(adds: boolean): StorageAdapter {
    if (this.file) return this.file;
    if (adds || storeFileReady(this.options.filename)) return this.open();
    if (this.failure !== undefined && this.now() < this.retryAt) throw this.failure;
    this.empty ??= this.options.openEmpty();
    return this.empty;
  }

  /**
   * Throws if a store file exists but cannot be opened. Called before each tool
   * runs: the recall paths of the coordinator catch storage errors and would
   * otherwise answer "nothing stored" for a store that is there.
   */
  ensureReadable(): void {
    this.target(false);
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    return this.target(statementKind(sql) === 'add').query<T>(sql, params);
  }

  /**
   * Before the file exists, `fn` first runs in a transaction on the empty store.
   * If it only reads, that is the result and no file appears. Its first statement
   * that adds a row is not run there: it throws, and whatever `fn` then does, the
   * first run counts as void, its transaction is ended, the file is opened and
   * `fn` runs again from the start, in a transaction on the file. So `fn` may run
   * twice. The first run has only read an empty store, but anything `fn` does
   * outside the store (a log line, a counter, a call elsewhere) happens twice.
   */
  async transaction<T>(fn: (adapter: StorageAdapter) => Promise<T>): Promise<T> {
    const current = this.target(false);
    if (current === this.file) return current.transaction(fn);
    const empty = current;
    let needsFile = false;
    const probe: StorageAdapter = {
      query: async <R>(sql: string, params?: unknown[]): Promise<QueryResult<R>> => {
        if (statementKind(sql) === 'add') {
          needsFile = true; // set before throwing: `fn` may catch the error, the mark stays
          throw new NeedsFile();
        }
        return empty.query<R>(sql, params);
      },
      transaction: (inner) => inner(probe),
    };
    let result: T | undefined;
    try {
      result = await empty.transaction(() => fn(probe));
    } catch (err) {
      if (!needsFile) throw err;
    }
    if (!needsFile) return result as T;
    return this.open().transaction(fn);
  }

  async close(): Promise<void> {
    try {
      await this.file?.close?.();
    } finally {
      await this.empty?.close?.();
    }
  }
}

