import { describe, it, expect, afterEach } from 'vitest';
import { MemoryCoordinator, FakeEmbeddingProvider } from '@zensation/core';
import { createMemoryAdapter } from '../src/index.js';

// ── Coordinator ↔ SqliteAdapter integration ────────────────────────────────────
//
// Regression coverage for three bugs that unit tests missed because nothing
// exercised the real core→adapter path:
//  1. store() threw: fsrs_next_review was bound as a Date object, which
//     better-sqlite3 cannot bind.
//  2. recall() was silently empty: `embedding <=> ?` was rewritten to the
//     constant 0, producing `ORDER BY 0` (invalid in SQLite); the coordinator
//     swallowed the error per layer.
//  3. Numbered placeholders (?1) are named parameters in better-sqlite3 and
//     must be object-bound; positional spreading threw "Too many parameter
//     values were provided".

describe('MemoryCoordinator on SqliteAdapter', () => {
  const adapters: { close(): Promise<void> }[] = [];

  function makeCoordinator() {
    const adapter = createMemoryAdapter();
    adapters.push(adapter);
    return new MemoryCoordinator({
      storage: adapter,
      embedding: new FakeEmbeddingProvider(),
    });
  }

  afterEach(async () => {
    while (adapters.length) await adapters.pop()!.close();
  });

  it('stores semantic facts without throwing (Date param coercion)', async () => {
    const coordinator = makeCoordinator();
    const id = await coordinator.store('The capital of France is Paris.', {
      type: 'fact',
      source: 'test',
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('recalls stored facts via vector search (no silent empty result)', async () => {
    const coordinator = makeCoordinator();
    await coordinator.store('My sister Anna lives in Hamburg.', { type: 'fact', source: 'test' });
    await coordinator.store('The capital of France is Paris.', { type: 'fact', source: 'test' });
    await coordinator.store('Water boils at 100 degrees Celsius.', { type: 'fact', source: 'test' });

    const results = await coordinator.recall('Anna Hamburg', { limit: 5 });

    expect(results.length).toBeGreaterThan(0);
    const semantic = results.filter(r => r.layer === 'semantic');
    expect(semantic.length).toBeGreaterThan(0);
    for (const r of semantic) {
      expect(typeof r.content).toBe('string');
      expect(typeof r.score).toBe('number');
    }
  });

  it('round-trips the full auto-routing store path', async () => {
    const coordinator = makeCoordinator();
    // 'auto' routes plain declarative text to the semantic layer — the exact
    // path that crashed before the Date fix.
    await expect(
      coordinator.store('TypeScript is a typed superset of JavaScript.', {
        type: 'auto',
        source: 'test',
      }),
    ).resolves.toBeTruthy();
  });
});

describe('SqliteAdapter vector + parameter translation', () => {
  it('binds repeated numbered placeholders from a single parameter', async () => {
    const adapter = createMemoryAdapter();
    const result = await adapter.query<{ a: number; b: number; c: number }>(
      'SELECT $1 as a, $1 as b, $2 as c',
      [7, 9],
    );
    expect(result.rows[0]).toEqual({ a: 7, b: 7, c: 9 });
    await adapter.close();
  });

  it('computes real cosine distance and orders by it', async () => {
    const adapter = createMemoryAdapter();
    const db = adapter.getDatabase();
    db.prepare(
      `INSERT INTO learned_facts (id, content, confidence, source, embedding,
        fsrs_difficulty, fsrs_stability, fsrs_next_review, access_count, created_at, last_accessed)
       VALUES ('a', 'aligned', 0.7, 'test', '[1,0]', 5, 7, '2030-01-01', 0, datetime('now'), datetime('now'))`,
    ).run();
    db.prepare(
      `INSERT INTO learned_facts (id, content, confidence, source, embedding,
        fsrs_difficulty, fsrs_stability, fsrs_next_review, access_count, created_at, last_accessed)
       VALUES ('b', 'orthogonal', 0.7, 'test', '[0,1]', 5, 7, '2030-01-01', 0, datetime('now'), datetime('now'))`,
    ).run();

    // Exactly the shape the semantic layer sends: $1 twice, $2 once.
    const result = await adapter.query<{ id: string; score: number }>(
      `SELECT id, 1 - (embedding <=> $1::vector) as score
       FROM learned_facts
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      ['[1,0]', 5],
    );

    expect(result.rows.map(r => r.id)).toEqual(['a', 'b']);
    expect(result.rows[0].score).toBeCloseTo(1, 5); // identical vector → similarity 1
    expect(result.rows[1].score).toBeCloseTo(0, 5); // orthogonal → similarity 0
    await adapter.close();
  });

  it('gives unparsable embeddings max distance instead of crashing', async () => {
    const adapter = createMemoryAdapter();
    const result = await adapter.query<{ d: number }>(
      `SELECT zb_cosine_dist('not-a-vector', $1) as d`,
      ['[1,0]'],
    );
    expect(result.rows[0].d).toBe(1);
    await adapter.close();
  });

  it('names procedural_memories.trigger as the core layer queries it', async () => {
    // Regression: the schema called this column `trigger_text`, so every
    // ProceduralMemory.record() insert failed with "no column named trigger".
    // The canonical schema is adapters/postgres/sql/001_init.sql.
    const adapter = createMemoryAdapter();
    const columns = adapter
      .getDatabase()
      .prepare('PRAGMA table_info(procedural_memories)')
      .all() as { name: string }[];
    const names = columns.map(c => c.name);
    expect(names).toContain('trigger');
    expect(names).not.toContain('trigger_text');
    await adapter.close();
  });
});

describe('procedural layer on SqliteAdapter', () => {
  it('records a procedure end to end', async () => {
    const adapter = createMemoryAdapter();
    const coordinator = new MemoryCoordinator({
      storage: adapter,
      embedding: new FakeEmbeddingProvider(),
    });
    await expect(
      coordinator.store('Deploy by running npm run build then pushing the tag.', {
        type: 'procedure',
        steps: ['npm run build', 'git push --tags'],
        tools: ['npm', 'git'],
        outcome: 'released',
      }),
    ).resolves.toBeTruthy();
    await adapter.close();
  });
});
