/**
 * One timestamp format, and what the old mix of two broke.
 *
 * Until this change NOW() and the column defaults wrote SQLite's
 * `datetime('now')` (`2026-09-28 21:25:17`, no zone) while `Date` parameters
 * arrived as ISO strings with `Z` — sometimes both in one row. Measured on
 * 2026-09-28 against the published packages (@zensation/core 0.3.3,
 * @zensation/adapter-sqlite 0.2.3) and a real database file, each with a
 * control that shows the query can find the row at all:
 *
 *   a fact due since one hour      getDueForReview -> 0   (due since 25 h -> 1)
 *   an episode stored just now     getByTimeRange(today 00:00Z, …) -> 0
 *                                                          (from yesterday -> 1)
 *   created_at 21:25:17 UTC        createdAt 19:25:17Z in Europe/Berlin
 *
 * All three tests below run against a file on disk, through the layers the
 * coordinator uses — not against the adapter alone — because the defect lived
 * in how the two talk to each other.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MemoryCoordinator } from '@zensation/core';
import { SqliteAdapter, SCHEMA_VERSION } from '../src/index.js';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let verzeichnisse: string[] = [];
function neueDatei(): string {
  const v = mkdtempSync(join(tmpdir(), 'zenbrain-ts-'));
  verzeichnisse.push(v);
  return join(v, 'memory.db');
}
afterEach(() => {
  for (const v of verzeichnisse) rmSync(v, { recursive: true, force: true });
  verzeichnisse = [];
});

/** Start of the current UTC day: always in the past, always on today's date. */
function heuteNullUhr(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

describe('timestamps written through the layers', () => {
  it('all come out in one format: ISO 8601, UTC, milliseconds, Z', async () => {
    const datei = neueDatei();
    const c = new MemoryCoordinator({ storage: new SqliteAdapter({ filename: datei }) });
    await c.store('The staging database listens on port 6543.', { type: 'fact' });
    await c.store('We finally shipped the release today.', { type: 'episode', emotionalWeight: 0.3 });
    await c.store('Deploy: build, test, tag, push.', { type: 'procedure', steps: ['build', 'test'] });
    await c.store('The user prefers short answers.', { type: 'core' });
    await c.close();

    const db = new Database(datei, { readonly: true });
    const werte = [
      ...db.prepare('SELECT created_at, last_accessed, fsrs_next_review FROM learned_facts').all(),
      ...db.prepare('SELECT created_at FROM episodic_memories').all(),
      ...db.prepare('SELECT created_at FROM procedural_memories').all(),
      ...db.prepare('SELECT updated_at FROM core_memory_blocks').all(),
    ].flatMap((zeile) => Object.values(zeile as Record<string, string>));
    db.close();

    expect(werte.length).toBe(6);
    for (const w of werte) expect(w, `not canonical: ${w}`).toMatch(ISO_UTC);
  });

  it('return a fact on its due date, not a day later', async () => {
    const datei = neueDatei();
    const c = new MemoryCoordinator({ storage: new SqliteAdapter({ filename: datei }) });
    await c.store('Review me.', { type: 'fact' });
    const setze = (wann: Date) => {
      const db = new Database(datei);
      db.prepare('UPDATE learned_facts SET fsrs_next_review = ?').run(wann.toISOString());
      db.close();
    };

    // Due at the start of today (UTC): in the past, and on the same date as
    // NOW() — the case where ' ' < 'T' decided the old text comparison.
    setze(heuteNullUhr());
    expect(await c.getSemanticMemory().getDueForReview(10)).toHaveLength(1);

    // The control: not yet due, so the query can also say no.
    setze(new Date(Date.now() + 3_600_000));
    expect(await c.getSemanticMemory().getDueForReview(10)).toHaveLength(0);
    await c.close();
  });

  it('find an episode stored today in a range that starts today', async () => {
    const c = new MemoryCoordinator({ storage: new SqliteAdapter({ filename: neueDatei() }) });
    await c.store('Stored just now.', { type: 'episode', emotionalWeight: 0.2 });
    const bis = new Date(Date.now() + 3_600_000);
    const ab = heuteNullUhr();

    expect(await c.getEpisodicMemory().getByTimeRange(ab, bis)).toHaveLength(1);
    // The control: a range that ended yesterday holds nothing.
    const gestern = new Date(ab.getTime() - 86_400_000);
    expect(await c.getEpisodicMemory().getByTimeRange(gestern, ab)).toHaveLength(0);
    await c.close();
  });

  it('read back as the instant that was stored, whatever the local time zone', async () => {
    const datei = neueDatei();
    const c = new MemoryCoordinator({ storage: new SqliteAdapter({ filename: datei }) });
    await c.store('When was this written?', { type: 'fact' });
    const [fakt] = await c.getSemanticMemory().getRecent(1);
    const db = new Database(datei, { readonly: true });
    const roh = (db.prepare('SELECT created_at FROM learned_facts').get() as { created_at: string })
      .created_at;
    db.close();
    await c.close();

    // Old format: `new Date('2026-09-28 21:25:17')` is local time, off by the
    // zone offset — invisible on a UTC machine, two hours in Berlin. The string
    // itself must already say UTC, so the comparison is exact on any machine.
    expect(roh).toMatch(ISO_UTC);
    expect(fakt.createdAt.toISOString()).toBe(roh);
  });
});

describe('a database written by an earlier version', () => {
  /** The pre-change schema, verbatim where it matters: `datetime('now')` defaults. */
  function alteDatei(): string {
    const datei = neueDatei();
    const db = new Database(datei);
    db.exec(`
      CREATE TABLE episodic_memories (id TEXT PRIMARY KEY, content TEXT NOT NULL, context TEXT,
        embedding TEXT, emotional_weight REAL, metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE learned_facts (id TEXT PRIMARY KEY, content TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.7, source TEXT NOT NULL DEFAULT 'conversation',
        embedding TEXT, access_count INTEGER NOT NULL DEFAULT 0, fsrs_difficulty REAL,
        fsrs_stability REAL, fsrs_next_review TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), last_accessed TEXT);
    `);
    const fakt = db.prepare(
      `INSERT INTO learned_facts (id, content, fsrs_next_review, created_at, last_accessed)
       VALUES (?, ?, ?, ?, ?)`,
    );
    fakt.run('alt', 'written by 0.2.3', '2026-09-29T15:05:23.006Z', '2026-09-28 21:23:20', '2026-09-28 21:23:20');
    fakt.run('unlesbar', 'kept as it is', null, 'last tuesday', null);
    db.prepare(`INSERT INTO episodic_memories (id, content, created_at) VALUES (?, ?, ?)`)
      .run('ep', 'an old episode', '2026-09-28 21:23:20');
    db.close();
    return datei;
  }

  it('is rewritten into the one format once, without changing any instant', async () => {
    const datei = alteDatei();
    new SqliteAdapter({ filename: datei }).getDatabase().close();

    const db = new Database(datei, { readonly: true });
    const alt = db.prepare("SELECT * FROM learned_facts WHERE id = 'alt'").get() as Record<string, string>;
    expect(alt.created_at).toBe('2026-09-28T21:23:20.000Z');
    expect(alt.last_accessed).toBe('2026-09-28T21:23:20.000Z');
    expect(alt.fsrs_next_review).toBe('2026-09-29T15:05:23.006Z'); // was canonical already
    expect(
      (db.prepare("SELECT created_at FROM episodic_memories").get() as { created_at: string }).created_at,
    ).toBe('2026-09-28T21:23:20.000Z');
    // A migration must not destroy what it cannot read.
    expect(
      (db.prepare("SELECT created_at FROM learned_facts WHERE id = 'unlesbar'").get() as {
        created_at: string;
      }).created_at,
    ).toBe('last tuesday');
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    db.close();
  });

  it('is left alone on the next start', async () => {
    const datei = alteDatei();
    new SqliteAdapter({ filename: datei }).getDatabase().close();
    const db = new Database(datei);
    // Something the migration would rewrite, planted after it ran.
    db.prepare("UPDATE learned_facts SET last_accessed = '2026-09-30 10:00:00' WHERE id = 'alt'").run();
    db.close();

    new SqliteAdapter({ filename: datei }).getDatabase().close();
    const nachher = new Database(datei, { readonly: true });
    expect(
      (nachher.prepare("SELECT last_accessed FROM learned_facts WHERE id = 'alt'").get() as {
        last_accessed: string;
      }).last_accessed,
    ).toBe('2026-09-30 10:00:00');
    nachher.close();
  });
});
