/**
 * The PostgreSQL adapter against a real PostgreSQL with pgvector.
 *
 * `postgres-adapter.test.ts` mocks `pg`, so it proves the adapter's own logic but nothing
 * PostgreSQL decides: whether the schema in `sql/001_init.sql` takes the layers' INSERTs,
 * whether a uuid column accepts what `forget()` passes, whether pgvector parses the
 * embeddings, whether `NOW()` and JSONB behave as the layers expect. Until this file,
 * nothing in CI ran a single query against PostgreSQL (the Agent Memory Atlas noted it).
 *
 * Runs when `ZENBRAIN_TEST_PG_URL` points at PostgreSQL 15+ with pgvector; the CI job
 * `postgres` provides one and sets `ZENBRAIN_REQUIRE_PG=1`, so there it cannot skip.
 * Each run works in a schema of its own and drops it afterwards.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { MemoryCoordinator, FakeEmbeddingProvider } from '@zensation/core';
import { PostgresAdapter } from '../src/index.js';

const PG_URL = process.env.ZENBRAIN_TEST_PG_URL;
if (!PG_URL && process.env.ZENBRAIN_REQUIRE_PG === '1') {
  throw new Error('ZENBRAIN_REQUIRE_PG=1 but ZENBRAIN_TEST_PG_URL is not set: the PostgreSQL suite would skip.');
}
if (!PG_URL) {
  process.stderr.write(
    '\n[real-postgres] SKIPPED: set ZENBRAIN_TEST_PG_URL to a PostgreSQL 15+ with pgvector. ' +
      'The CI job "postgres" runs this suite; a green run without it proves nothing about PostgreSQL.\n\n',
  );
}
const open: typeof describe.skip = PG_URL ? describe : describe.skip;

const SCHEMA = `zb_test_${process.pid}_${Date.now().toString(36)}`;
let admin: pg.Client;
const adapters: PostgresAdapter[] = [];

function coordinator(embedding?: FakeEmbeddingProvider): MemoryCoordinator {
  const storage = new PostgresAdapter({ connectionString: PG_URL!, schema: SCHEMA, maxRetries: 0 });
  adapters.push(storage);
  return new MemoryCoordinator({ storage, embedding });
}

async function row<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await admin.query(sql, params);
  return r.rows[0] as T;
}

open('PostgreSQL with pgvector, through the coordinator', () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: PG_URL });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.query(`SET search_path TO ${SCHEMA}, public`);
    await admin.query(readFileSync(new URL('../sql/001_init.sql', import.meta.url), 'utf8'));
  });

  afterAll(async () => {
    for (const a of adapters) await a.close();
    await admin.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
    await admin.end();
  });

  it('stores into every layer and recalls the content back (no embedding provider)', async () => {
    const c = coordinator();
    const cases = [
      { layer: 'semantic', type: 'fact', content: 'The user lives in Hamburg.' },
      { layer: 'episodic', type: 'episode', content: 'The deploy failed on Friday and everyone was furious.' },
      { layer: 'procedural', type: 'procedure', content: 'How to rotate the staging key: open the vault, rotate, redeploy.' },
      { layer: 'core', type: 'core', content: 'The user prefers answers in German.' },
    ] as const;
    for (const k of cases) await c.store(k.content, { type: k.type });

    for (const k of cases) {
      const results = await c.recall(k.content, { layers: [k.layer], limit: 20 });
      expect(results.some((r) => r.content.includes(k.content)), k.layer).toBe(true);
    }
  });

  it('stores and searches 1536-dimension embeddings through pgvector', async () => {
    const c = coordinator(new FakeEmbeddingProvider(1536));
    await c.store('Beech planks arrive every Thursday from the sawmill.', { type: 'fact' });
    const results = await c.recall('Beech planks arrive every Thursday from the sawmill.', { layers: ['semantic'] });
    expect(results[0]?.content).toBe('Beech planks arrive every Thursday from the sawmill.');
    expect(results[0]?.score).toBeGreaterThan(0.99);
  });

  it('forgets by uuid, and treats a malformed id as not found rather than a uuid syntax error', async () => {
    const c = coordinator();
    await c.store('The van is a blue Transit.', { type: 'fact' });
    const hit = (await c.recall('blue Transit van', { layers: ['semantic'] })).find((r) => r.content === 'The van is a blue Transit.');
    expect(hit).toBeDefined();

    expect(await c.forget('not-a-uuid', 'semantic')).toBe(false);
    expect(await c.forget('00000000-0000-4000-8000-000000000000', 'semantic')).toBe(false);
    expect(await c.forget(hit!.id, 'semantic')).toBe(true);
    const gone = await row<{ n: string }>('SELECT count(*) AS n FROM learned_facts WHERE id = $1', [hit!.id]);
    expect(Number(gone.n)).toBe(0);
  });

  it('promotes an emotional episode once, however often consolidation runs', async () => {
    const c = coordinator();
    await c.store('The launch slipped and the whole team was devastated.', { type: 'episode', emotionalWeight: 0.9 });
    const first = await c.consolidate();
    const second = await c.consolidate();
    expect(first.promoted).toBe(1);
    expect(second.promoted).toBe(0);
    const marked = await row<{ n: string }>(
      "SELECT count(*) AS n FROM episodic_memories WHERE metadata ? 'consolidatedInto'",
    );
    expect(Number(marked.n)).toBe(1);
  });

  it('writes the FSRS state back on recordReview', async () => {
    const c = coordinator();
    await c.store('The accountant is reachable by phone only.', { type: 'fact' });
    const hit = (await c.recall('accountant phone', { layers: ['semantic'] })).find((r) => r.content.includes('accountant'));
    const before = await row<{ next: Date; n: number }>(
      'SELECT fsrs_next_review AS next, access_count AS n FROM learned_facts WHERE id = $1', [hit!.id]);

    await c.recordReview(hit!.id, 4);

    const after = await row<{ next: Date; n: number }>(
      'SELECT fsrs_next_review AS next, access_count AS n FROM learned_facts WHERE id = $1', [hit!.id]);
    expect(after.n).toBe(before.n + 1);
    expect(after.next.getTime()).toBeGreaterThan(before.next.getTime());
  });

  it('counts every layer in getHealth', async () => {
    const c = coordinator();
    const h = await c.getHealth();
    expect(h.semantic.count).toBeGreaterThanOrEqual(1);
    expect(h.episodic.count).toBeGreaterThanOrEqual(1);
    expect(h.procedural.count).toBeGreaterThanOrEqual(1);
    expect(h.core.blocks).toBeGreaterThanOrEqual(1);
  });
});
