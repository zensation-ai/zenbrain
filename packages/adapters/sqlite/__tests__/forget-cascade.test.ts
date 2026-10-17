/**
 * forget() follows the consolidation edge, on a real SQLite database (0.6.0).
 *
 * Measured on 2026-10-16 against 0.5.1 with a real SQLite file: an episode with emotional
 * weight 0.9, `consolidate()` (promoted 1, verbatim fact), a recall showing one hit because
 * deduplication hid the semantic twin, `forget(id, 'episodic')` = true — and the same recall
 * then returned the text from semantic memory. "Forget this" left the content stored.
 *
 * The criterion is the one from the plan of 2026-10-11: after forgetting, a query on the
 * content returns zero rows in every table, read straight from the database.
 */
import { describe, it, expect } from 'vitest';
import { MemoryCoordinator, type LLMProvider } from '@zensation/core';
import { createMemoryAdapter } from '../src/index.js';

const MOMENT = 'The car slid on the ice and I was terrified.';

type Db = ReturnType<ReturnType<typeof createMemoryAdapter>['getDatabase']>;

function rows(db: Db, table: 'episodic_memories' | 'learned_facts', content: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE content = ?`).get(content) as { n: number }).n;
}

async function consolidated(llm?: LLMProvider) {
  const storage = createMemoryAdapter();
  const c = new MemoryCoordinator({ storage, llm });
  const episodeId = await c.store(MOMENT, { type: 'episode', emotionalWeight: 0.9 });
  expect((await c.consolidate()).promoted).toBe(1);
  const db = storage.getDatabase();
  const { id: factId, content: factContent } = db
    .prepare("SELECT id, content FROM learned_facts WHERE source = 'consolidation'")
    .get() as { id: string; content: string };
  return { c, db, episodeId, factId, factContent };
}

describe('forget() cascade on SQLite', () => {
  it('forgetting the episode deletes its fact and the working-memory copy: zero rows left', async () => {
    const { c, db, episodeId, factId } = await consolidated();
    expect(rows(db, 'episodic_memories', MOMENT)).toBe(1);
    expect(rows(db, 'learned_facts', MOMENT)).toBe(1);

    const result = await c.forgetWithDerived(episodeId, 'episodic');

    expect(result.removed).toBe(true);
    expect(result.alsoForgotten).toContainEqual({ id: factId, layer: 'semantic' });
    expect(result.alsoForgotten.filter((f) => f.layer === 'working')).toHaveLength(1);
    expect(rows(db, 'episodic_memories', MOMENT)).toBe(0);
    expect(rows(db, 'learned_facts', MOMENT)).toBe(0);
    const all = await c.recall(MOMENT, { layers: ['working', 'episodic', 'semantic', 'procedural', 'core'] });
    expect(all.filter((r) => r.content === MOMENT)).toEqual([]);
    await c.close();
  });

  it('forgetting the fact deletes the episode it was made from: zero rows left', async () => {
    const { c, db, episodeId, factId } = await consolidated();

    const result = await c.forgetWithDerived(factId, 'semantic');

    expect(result.removed).toBe(true);
    expect(result.alsoForgotten).toContainEqual({ id: episodeId, layer: 'episodic' });
    expect(rows(db, 'episodic_memories', MOMENT)).toBe(0);
    expect(rows(db, 'learned_facts', MOMENT)).toBe(0);
    await c.close();
  });

  it('cascade: false on the episode leaves exactly the fact', async () => {
    const { c, db, episodeId } = await consolidated();

    expect(await c.forgetWithDerived(episodeId, 'episodic', { cascade: false })).toEqual({
      removed: true,
      alsoForgotten: [],
    });
    expect(rows(db, 'episodic_memories', MOMENT)).toBe(0);
    expect(rows(db, 'learned_facts', MOMENT)).toBe(1);
    await c.close();
  });

  it('cascade: false on the fact keeps the episode and its mark, so consolidate() does not promote it again', async () => {
    const { c, db, factId } = await consolidated();

    expect(await c.forget(factId, 'semantic', { cascade: false })).toBe(true);
    expect(rows(db, 'learned_facts', MOMENT)).toBe(0);
    expect(rows(db, 'episodic_memories', MOMENT)).toBe(1);
    const { metadata } = db.prepare('SELECT metadata FROM episodic_memories').get() as { metadata: string };
    expect(JSON.parse(metadata)).toEqual({ consolidatedInto: factId });

    expect((await c.consolidate()).promoted).toBe(0);
    expect(rows(db, 'learned_facts', MOMENT)).toBe(0);
    await c.close();
  });

  it('follows the edge to a fact an LLM distilled into other words', async () => {
    const llm: LLMProvider = { generate: async () => 'Driving on ice is dangerous.' };
    const { c, db, episodeId, factContent } = await consolidated(llm);
    expect(factContent).toBe('Driving on ice is dangerous.');

    await c.forget(episodeId, 'episodic');

    expect(rows(db, 'learned_facts', 'Driving on ice is dangerous.')).toBe(0);
    expect(rows(db, 'episodic_memories', MOMENT)).toBe(0);
    await c.close();
  });

  it('also deletes a second episode that was promoted into the same fact', async () => {
    const storage = createMemoryAdapter();
    const c = new MemoryCoordinator({ storage });
    const first = await c.store(MOMENT, { type: 'episode', emotionalWeight: 0.9 });
    await c.consolidate();
    // Stored again and consolidated: consolidate() finds the verbatim fact and only marks it.
    const second = await c.store(MOMENT, { type: 'episode', emotionalWeight: 0.9 });
    expect((await c.consolidate()).promoted).toBe(0);
    const db = storage.getDatabase();
    expect(rows(db, 'episodic_memories', MOMENT)).toBe(2);
    expect(rows(db, 'learned_facts', MOMENT)).toBe(1);

    const result = await c.forgetWithDerived(first, 'episodic');

    expect(result.alsoForgotten).toContainEqual({ id: second, layer: 'episodic' });
    expect(rows(db, 'episodic_memories', MOMENT)).toBe(0);
    expect(rows(db, 'learned_facts', MOMENT)).toBe(0);
    await c.close();
  });

  it('leaves alone what is not derived: other memories, a twin stored on its own, a fact id elsewhere in metadata', async () => {
    const { c, db, factId } = await consolidated();
    // The same wording stored by hand is a memory of its own, not derived from the episode.
    await c.store(MOMENT, { type: 'fact', source: 'user' });
    await c.store('The user lives in Hamburg.', { type: 'fact' });
    // An episode whose metadata contains the fact id, but not as its consolidation mark.
    await c.getEpisodicMemory().store('Unrelated note.', undefined, 0.2, { source: factId });

    await c.forget(factId, 'semantic');

    expect(rows(db, 'learned_facts', MOMENT)).toBe(1);
    expect(rows(db, 'episodic_memories', MOMENT)).toBe(0);
    expect(rows(db, 'learned_facts', 'The user lives in Hamburg.')).toBe(1);
    expect(rows(db, 'episodic_memories', 'Unrelated note.')).toBe(1);
    await c.close();
  });

  it('a recall names the twins deduplication hid, so a caller can see every copy', async () => {
    const { c, episodeId, factId } = await consolidated();

    const results = await c.recall(MOMENT, { layers: ['episodic', 'semantic'] });

    expect(results).toHaveLength(1);
    const kept = results[0];
    const both = [{ id: kept.id, layer: kept.layer }, ...(kept.duplicates ?? [])];
    expect(both).toEqual(
      expect.arrayContaining([
        { id: episodeId, layer: 'episodic' },
        { id: factId, layer: 'semantic' },
      ]),
    );
    expect(both).toHaveLength(2);
    await c.close();
  });

  it('an unknown id deletes nothing and reports nothing', async () => {
    const { c, db } = await consolidated();

    expect(await c.forgetWithDerived('00000000-0000-4000-8000-000000000000', 'episodic')).toEqual({
      removed: false,
      alsoForgotten: [],
    });
    expect(rows(db, 'episodic_memories', MOMENT)).toBe(1);
    expect(rows(db, 'learned_facts', MOMENT)).toBe(1);
    await c.close();
  });
});
