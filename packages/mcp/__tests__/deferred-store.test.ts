/**
 * The store file is created when the first memory is stored, not when the
 * server starts (see src/store.ts). These tests pin the pieces of that:
 * which statements open the file, where creating it would start, and that a
 * file another server created is read from then on.
 */
import { describe, it, expect } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { QueryResult, StorageAdapter } from '@zensation/core';
import { DeferredStore, nearestExistingDirectory, statementKind, storeCreationProblem } from '../src/store.js';

function fakeAdapter(name: string, calls: string[]): StorageAdapter {
  return {
    async query<T>(sql: string): Promise<QueryResult<T>> {
      calls.push(`${name}: ${sql}`);
      return { rows: [] as T[], rowCount: 0 };
    },
    async transaction<T>(fn: (a: StorageAdapter) => Promise<T>): Promise<T> {
      calls.push(`${name}: transaction`);
      return fn(this);
    },
    async close() {
      calls.push(`${name}: close`);
    },
  };
}

describe('statementKind', () => {
  it('reads, changes and adds', () => {
    expect(statementKind('SELECT 1')).toBe('read');
    expect(statementKind('\n      select * from x')).toBe('read');
    expect(statementKind('WITH a AS (SELECT 1) SELECT * FROM a')).toBe('read');
    expect(statementKind('UPDATE learned_facts SET x = 1')).toBe('change');
    expect(statementKind('  delete from episodic_memories')).toBe('change');
    expect(statementKind('INSERT INTO learned_facts VALUES (1)')).toBe('add');
    expect(statementKind('PRAGMA user_version')).toBe('add');
  });
});

describe('nearestExistingDirectory and storeCreationProblem', () => {
  it('finds the first directory on the path that exists, without creating any', () => {
    const base = mkdtempSync(join(tmpdir(), 'zenbrain-ds-'));
    expect(nearestExistingDirectory(join(base, 'a', 'b', 'memory.db'))).toBe(base);
    expect(nearestExistingDirectory('memory.db', base)).toBe(base);
    expect(storeCreationProblem(join(base, 'a', 'b', 'memory.db'))).toBeNull();
  });

  it('reports a path that runs through a regular file', () => {
    const base = mkdtempSync(join(tmpdir(), 'zenbrain-ds-'));
    writeFileSync(join(base, 'plain'), '');
    expect(nearestExistingDirectory(join(base, 'plain', 'memory.db'))).toBeUndefined();
    expect(storeCreationProblem(join(base, 'plain', 'memory.db'))).toMatch(/no directory/);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('reports a directory this user cannot write to', () => {
    const base = mkdtempSync(join(tmpdir(), 'zenbrain-ds-'));
    const locked = join(base, 'locked');
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    try {
      expect(storeCreationProblem(join(locked, 'sub', 'memory.db'))).toMatch(/cannot create files in/);
    } finally {
      chmodSync(locked, 0o700);
    }
  });
});

describe('DeferredStore', () => {
  it('answers reads and changes from the empty store until the first row is added', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zenbrain-ds-'));
    const calls: string[] = [];
    const store = new DeferredStore({
      filename: join(dir, 'memory.db'),
      openFile: () => fakeAdapter('file', calls),
      openEmpty: () => fakeAdapter('empty', calls),
    });
    await store.query('SELECT 1');
    await store.query('DELETE FROM learned_facts');
    expect(store.fileOpen).toBe(false);
    await store.query('INSERT INTO learned_facts VALUES (1)');
    await store.query('SELECT 2');
    expect(store.fileOpen).toBe(true);
    expect(calls).toEqual(['empty: SELECT 1', 'empty: DELETE FROM learned_facts', 'file: INSERT INTO learned_facts VALUES (1)', 'file: SELECT 2']);
    await store.close();
    expect(calls.slice(-2)).toEqual(['file: close', 'empty: close']);
  });

  it('reads a file that appeared after the start', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zenbrain-ds-'));
    const filename = join(dir, 'memory.db');
    const calls: string[] = [];
    const store = new DeferredStore({
      filename,
      openFile: () => fakeAdapter('file', calls),
      openEmpty: () => fakeAdapter('empty', calls),
    });
    await store.query('SELECT 1');
    writeFileSync(filename, ''); // a second server created it
    await store.query('SELECT 2');
    expect(calls).toEqual(['empty: SELECT 1', 'file: SELECT 2']);
  });

  it('opens a file that exists at start right away, and a transaction opens it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zenbrain-ds-'));
    const existing = join(dir, 'existing.db');
    writeFileSync(existing, '');
    const calls: string[] = [];
    const store = new DeferredStore({ filename: existing, openFile: () => fakeAdapter('file', calls), openEmpty: () => fakeAdapter('empty', calls) });
    expect(store.fileOpen).toBe(true);

    const fresh = new DeferredStore({ filename: join(dir, 'fresh.db'), openFile: () => fakeAdapter('file', calls), openEmpty: () => fakeAdapter('empty', calls) });
    await fresh.transaction(async () => 1);
    expect(fresh.fileOpen).toBe(true);
  });
});
