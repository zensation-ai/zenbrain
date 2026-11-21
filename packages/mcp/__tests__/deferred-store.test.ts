/**
 * The store file is created when the first memory is stored, not when the
 * server starts (see src/store.ts). These tests pin the pieces of that: which
 * statements open the file, what the start checks without creating anything,
 * when a file another server is creating counts as ready, and what happens when
 * a file is there but cannot be opened.
 */
import { describe, it, expect } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { QueryResult, StorageAdapter } from '@zensation/core';
import { DeferredStore, OPEN_RETRY_MS, nearestExisting, physicalTarget, statementKind, storeCreationProblem, storeFileReady } from '../src/store.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'zenbrain-ds-'));

function fakeAdapter(name: string, calls: string[]): StorageAdapter {
  const adapter: StorageAdapter = {
    async query<T>(sql: string): Promise<QueryResult<T>> {
      calls.push(`${name}: ${sql}`);
      return { rows: [] as T[], rowCount: 0 };
    },
    async transaction<T>(fn: (a: StorageAdapter) => Promise<T>): Promise<T> {
      calls.push(`${name}: BEGIN`);
      try {
        const r = await fn(adapter);
        calls.push(`${name}: COMMIT`);
        return r;
      } catch (err) {
        calls.push(`${name}: ROLLBACK`);
        throw err;
      }
    },
    async close() {
      calls.push(`${name}: close`);
    },
  };
  return adapter;
}

/** A file with a complete SQLite header and the given `user_version`. */
function sqliteHeader(path: string, userVersion: number): void {
  const b = Buffer.alloc(4096);
  b.write('SQLite format 3\u0000', 0, 'latin1');
  b.writeUInt32BE(userVersion, 60);
  writeFileSync(path, b);
}

describe('statementKind', () => {
  it('reads, changes and adds', () => {
    expect(statementKind('SELECT 1')).toBe('read');
    expect(statementKind('\n      select * from x')).toBe('read');
    expect(statementKind('WITH a AS (SELECT 1) SELECT * FROM a')).toBe('read');
    expect(statementKind('WITH a AS (SELECT 1) INSERT INTO t SELECT * FROM a')).toBe('add');
    expect(statementKind('with a as (select 1) update t set x = 1')).toBe('add');
    expect(statementKind('WITH a AS (SELECT 1) DELETE FROM t')).toBe('add');
    expect(statementKind('PRAGMA user_version')).toBe('read');
    expect(statementKind('PRAGMA user_version = 3')).toBe('add');
    expect(statementKind('PRAGMA user_version(5)')).toBe('add');
    expect(statementKind('UPDATE learned_facts SET x = 1')).toBe('change');
    expect(statementKind('  delete from episodic_memories')).toBe('change');
    expect(statementKind('INSERT INTO learned_facts VALUES (1)')).toBe('add');
    expect(statementKind('CREATE TABLE t (x)')).toBe('add');
  });
});

describe('what the start checks, creating nothing', () => {
  it('finds the first directory on the path that exists', () => {
    const base = tmp();
    expect(nearestExisting(join(base, 'a', 'b', 'memory.db'))).toEqual({ path: base, kind: 'directory' });
    expect(nearestExisting('memory.db', base)).toEqual({ path: base, kind: 'directory' });
    expect(storeCreationProblem(join(base, 'a', 'b', 'memory.db'))).toBeNull();
  });

  it('names a part of the path that is a file', () => {
    const base = tmp();
    writeFileSync(join(base, 'plain'), '');
    expect(storeCreationProblem(join(base, 'plain', 'sub', 'memory.db'))).toBe(`${join(base, 'plain')} is a file, not a directory`);
  });

  // Symbolic links need developer mode or administrator rights on Windows.
  it.skipIf(process.platform === 'win32')('names a directory link to nothing on the path', () => {
    const base = tmp();
    symlinkSync(join(base, 'gone'), join(base, 'dir-link'));
    expect(storeCreationProblem(join(base, 'dir-link', 'memory.db'))).toMatch(/is a link to nothing/);
  });

  // Symbolic links need developer mode or administrator rights on Windows; these tests skip there.
  // SQLite resolves a relative link target against the link's real directory, `..` included.
  it.skipIf(process.platform === 'win32')('resolves a relative link target against the real directory of the link', () => {
    const base = tmp();
    mkdirSync(join(base, 'real', 'sub'), { recursive: true });
    mkdirSync(join(base, 'real', 'data'));
    symlinkSync(join(base, 'real', 'sub'), join(base, 'lnk'));
    symlinkSync(join('..', 'data', 'memory.db'), join(base, 'real', 'sub', 'store.db'));
    // Physically ../data is real/data, which exists; read lexically it would be base/data, which does not.
    expect(storeCreationProblem(join(base, 'lnk', 'store.db'))).toBeNull();
  });

  // SQLite follows a link and creates the file it points to, if that file's directory exists (0.3.1 did so too).
  it.skipIf(process.platform === 'win32')('accepts a store path that links to a file still to be created, where its directory exists', () => {
    const base = tmp();
    mkdirSync(join(base, 'sync'));
    symlinkSync(join(base, 'sync', 'memory.db'), join(base, 'store-link.db'));
    expect(storeCreationProblem(join(base, 'store-link.db'))).toBeNull();
    symlinkSync(join(base, 'nowhere', 'memory.db'), join(base, 'bad-link.db'));
    expect(storeCreationProblem(join(base, 'bad-link.db'))).toMatch(/whose directory does not exist/);
    symlinkSync(join(base, 'loop.db'), join(base, 'loop.db'));
    expect(storeCreationProblem(join(base, 'loop.db'))).toMatch(/more than 32 links in a row/);
  });

  it('names a name longer than 255 bytes (Linux) or 255 UTF-16 units (macOS, Windows)', () => {
    const base = tmp();
    expect(storeCreationProblem(join(base, `${'x'.repeat(300)}.db`))).toMatch(/longer than 255 (bytes|UTF-16 units)/);
    // 203 UTF-16 units, 403 bytes: too long only where bytes count.
    const umlauts = join(base, `${'ä'.repeat(200)}.db`);
    if (process.platform === 'linux') expect(storeCreationProblem(umlauts)).toMatch(/longer than 255 bytes/);
    if (process.platform === 'darwin' || process.platform === 'win32') {
      expect(storeCreationProblem(umlauts)).toBeNull();
      expect(storeCreationProblem(join(base, 'ä'.repeat(256)))).toMatch(/longer than 255 UTF-16 units/);
      // An emoji is one character but two UTF-16 units: APFS takes 127, not 128.
      expect(storeCreationProblem(join(base, '😀'.repeat(127)))).toBeNull();
      expect(storeCreationProblem(join(base, '😀'.repeat(128)))).toMatch(/longer than 255 UTF-16 units/);
    }
  });

  // Node passes \\?\C:\… and keeps a trailing dot or space; SQLite drops it: two different files.
  it.runIf(process.platform === 'win32')('on Windows, names a part of the path that ends in a dot or a space', () => {
    const base = tmp();
    for (const p of [join(base, 'memory.db.'), join(base, 'memory.db '), join(base, 'sub.', 'memory.db')]) {
      expect(storeCreationProblem(p), p).toMatch(/ends in a dot or a space/);
    }
  });

  it.runIf(process.platform === 'win32')('on Windows, names a name Windows refuses', () => {
    const base = tmp();
    for (const name of ['CON', 'nul.db', 'COM1.db', 'a<b.db', 'a|b.db']) {
      expect(storeCreationProblem(join(base, name)), name).toMatch(/Windows does not allow the name/);
    }
    expect(storeCreationProblem(join(base, 'memory.db'))).toBeNull();
  });

  // chmod does not take a directory's write permission away on Windows, and root may write anyway.
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('names a directory this user cannot write to', () => {
    const locked = join(tmp(), 'locked');
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    try {
      expect(storeCreationProblem(join(locked, 'sub', 'memory.db'))).toMatch(/cannot create files in .*locked/);
    } finally {
      chmodSync(locked, 0o700);
    }
  });
});

describe('storeFileReady: a file another server is still creating is not read', () => {
  it('waits for a full header with user_version set', () => {
    const base = tmp();
    const f = join(base, 'memory.db');
    expect(storeFileReady(f)).toBe(false);
    writeFileSync(f, '');
    expect(storeFileReady(f)).toBe(false);
    sqliteHeader(f, 0);
    expect(storeFileReady(f)).toBe(false);
    sqliteHeader(f, 1);
    expect(storeFileReady(f)).toBe(true);
  });

  // Symbolic links need developer mode or administrator rights on Windows.
  it.skipIf(process.platform === 'win32')('looks for -wal next to the file a link points to, where SQLite keeps it', () => {
    const base = tmp();
    mkdirSync(join(base, 'target'));
    const target = join(base, 'target', 'memory.db');
    sqliteHeader(target, 0); // a WAL store another server is creating: header still says 0
    writeFileSync(`${target}-wal`, '');
    symlinkSync(target, join(base, 'store.db'));
    expect(storeFileReady(join(base, 'store.db'))).toBe(true);
  });

  // Symbolic links need developer mode or administrator rights on Windows.
  it.skipIf(process.platform === 'win32')('a path with `..` after a linked directory is read the way the system reads it, without throwing', () => {
    const base = tmp();
    mkdirSync(join(base, 'real', 'sub'), { recursive: true });
    mkdirSync(join(base, 'real', 'data'));
    symlinkSync(join(base, 'real', 'sub'), join(base, 'lnk'));
    sqliteHeader(join(base, 'real', 'data', 'memory.db'), 1);
    // The system reads lnk/.. as real; as text it would be base, where data/ does not exist.
    const path = `${join(base, 'lnk')}/../data/memory.db`;
    expect(() => storeFileReady(path)).not.toThrow();
    expect(storeFileReady(path)).toBe(true);
    expect(physicalTarget(path)).toBe(physicalTarget(join(base, 'real', 'data', 'memory.db')));
  });

  it('physicalTarget never throws', () => {
    expect(physicalTarget(join(tmp(), 'no', 'such', 'file.db'))).toBeUndefined();
  });

  it('reads a WAL store in use at once, and lets a file that is not SQLite fail on opening', () => {
    const base = tmp();
    const f = join(base, 'memory.db');
    sqliteHeader(f, 0);
    writeFileSync(`${f}-wal`, '');
    expect(storeFileReady(f)).toBe(true);
    const g = join(base, 'other.db');
    writeFileSync(g, 'x'.repeat(200));
    expect(storeFileReady(g)).toBe(true);
  });
});

describe('DeferredStore', () => {
  const make = (filename: string, calls: string[], openFile?: () => StorageAdapter, now?: () => number) =>
    new DeferredStore({ filename, openFile: openFile ?? (() => fakeAdapter('file', calls)), openEmpty: () => fakeAdapter('empty', calls), now });

  it('answers reads, PRAGMA reads and changes from the empty store until the first row is added', async () => {
    const calls: string[] = [];
    const store = make(join(tmp(), 'memory.db'), calls);
    await store.query('SELECT 1');
    await store.query('PRAGMA user_version');
    await store.query('DELETE FROM learned_facts');
    expect(store.fileOpen).toBe(false);
    await store.query('INSERT INTO learned_facts VALUES (1)');
    await store.query('SELECT 2');
    expect(store.fileOpen).toBe(true);
    expect(calls).toEqual(['empty: SELECT 1', 'empty: PRAGMA user_version', 'empty: DELETE FROM learned_facts', 'file: INSERT INTO learned_facts VALUES (1)', 'file: SELECT 2']);
    await store.close();
    expect(calls.slice(-2)).toEqual(['file: close', 'empty: close']);
  });

  it('reads a file another server created once it is ready, not before', async () => {
    const filename = join(tmp(), 'memory.db');
    const calls: string[] = [];
    const store = make(filename, calls);
    await store.query('SELECT 1');
    sqliteHeader(filename, 0); // being created: tables not all there yet
    await store.query('SELECT 2');
    sqliteHeader(filename, 1); // done
    await store.query('SELECT 3');
    expect(calls).toEqual(['empty: SELECT 1', 'empty: SELECT 2', 'file: SELECT 3']);
  });

  it('opens a file with content at start, and leaves an empty one for the first store', () => {
    const base = tmp();
    sqliteHeader(join(base, 'full.db'), 1);
    writeFileSync(join(base, 'zero.db'), '');
    const calls: string[] = [];
    expect(make(join(base, 'full.db'), calls).fileOpen).toBe(true);
    expect(make(join(base, 'zero.db'), calls).fileOpen).toBe(false);
  });

  it('a transaction that only reads creates no file; one that writes runs again on the file', async () => {
    const calls: string[] = [];
    const store = make(join(tmp(), 'memory.db'), calls);
    const read = await store.transaction(async (a) => (await a.query('SELECT 1')).rowCount);
    expect(read).toBe(0);
    expect(store.fileOpen).toBe(false);
    let runs = 0;
    await store.transaction(async (a) => {
      runs++;
      await a.query('SELECT 2');
      await a.query('INSERT INTO t VALUES (1)');
    });
    expect(runs).toBe(2);
    expect(store.fileOpen).toBe(true);
    expect(calls).toEqual([
      'empty: BEGIN', 'empty: SELECT 1', 'empty: COMMIT',
      'empty: BEGIN', 'empty: SELECT 2', 'empty: ROLLBACK',
      'file: BEGIN', 'file: SELECT 2', 'file: INSERT INTO t VALUES (1)', 'file: COMMIT',
    ]);
  });

  it('two transactions that both turn out to write open the file once', async () => {
    const calls: string[] = [];
    let opened = 0;
    const store = make(join(tmp(), 'memory.db'), calls, () => {
      opened++;
      return fakeAdapter('file', calls);
    });
    const write = (n: number) => store.transaction(async (a) => {
      await a.query(`INSERT INTO t VALUES (${n})`);
    });
    await Promise.all([write(1), write(2)]);
    expect(opened).toBe(1);
    expect(calls.filter((c) => c.startsWith('file: INSERT'))).toHaveLength(2);
  });

  it('a transaction whose fn catches the refused write still runs again on the file, and the file opens once', async () => {
    const calls: string[] = [];
    let opened = 0;
    const store = make(join(tmp(), 'memory.db'), calls, () => {
      opened++;
      return fakeAdapter('file', calls);
    });
    let runs = 0;
    const r = await store.transaction(async (a) => {
      runs++;
      try {
        await a.query('INSERT INTO t VALUES (1)');
      } catch {
        return 'swallowed';
      }
      return 'written';
    });
    expect(r).toBe('written');
    expect(runs).toBe(2);
    expect(opened).toBe(1);
    expect(calls).toContain('file: INSERT INTO t VALUES (1)');
    await store.query('INSERT INTO t VALUES (2)');
    expect(opened).toBe(1);
  });

  it('a file that cannot be opened is an error, rejected not thrown, and not retried on every statement', async () => {
    const filename = join(tmp(), 'memory.db');
    sqliteHeader(filename, 1);
    let clock = 1_000;
    let attempts = 0;
    const calls: string[] = [];
    const broken = () => {
      attempts++;
      throw new Error('cannot open');
    };
    // At start an existing file is opened in the constructor, and its failure ends the start.
    expect(() => make(filename, calls, broken, () => clock)).toThrow('cannot open');

    // A file that appears while the server runs:
    const later = join(tmp(), 'memory.db');
    const store = make(later, calls, broken, () => clock);
    attempts = 0;
    sqliteHeader(later, 1);
    const pending = store.query('SELECT 1');
    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).rejects.toThrow('cannot open');
    await expect(store.query('SELECT 2')).rejects.toThrow('cannot open');
    expect(() => store.ensureReadable()).toThrow('cannot open');
    expect(attempts).toBe(1);
    clock += OPEN_RETRY_MS;
    await expect(store.query('SELECT 3')).rejects.toThrow('cannot open');
    expect(attempts).toBe(2);
  });
});
