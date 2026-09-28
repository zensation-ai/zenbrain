/**
 * Consolidation on a real SQLite store, through the coordinator.
 *
 * Measured on 2026-09-28 against the published @zensation/mcp 0.1.6 with a
 * file database: one episode with emotional weight 0.8, three consolidation
 * passes, three identical semantic facts — every pass promoted the same
 * episode again, and `pruned` came back 0 each time because nothing prunes.
 */
import { describe, it, expect } from 'vitest';
import { MemoryCoordinator } from '@zensation/core';
import { createMemoryAdapter } from '../src/index.js';

async function coordinatorMitEpisoden() {
  const storage = createMemoryAdapter();
  const c = new MemoryCoordinator({ storage });
  await c.store('I was thrilled when the deploy finally worked.', { type: 'episode', emotionalWeight: 0.8 });
  await c.store('Routine standup, nothing notable happened.', { type: 'episode', emotionalWeight: 0.1 });
  return { c, db: storage.getDatabase() };
}

const fakten = (db: ReturnType<ReturnType<typeof createMemoryAdapter>['getDatabase']>) =>
  (db.prepare("SELECT content FROM learned_facts WHERE source = 'consolidation'").all() as {
    content: string;
  }[]).map((r) => r.content);

describe('consolidate() on SQLite', () => {
  it('promotes a significant episode once, however often it runs', async () => {
    const { c, db } = await coordinatorMitEpisoden();

    const erste = await c.consolidate();
    const zweite = await c.consolidate();
    const dritte = await c.consolidate();

    expect([erste.promoted, zweite.promoted, dritte.promoted]).toEqual([1, 0, 0]);
    expect(fakten(db)).toEqual(['I was thrilled when the deploy finally worked.']);
    // The control: the episode below the threshold was never promoted.
    expect(fakten(db)).not.toContain('Routine standup, nothing notable happened.');
    await c.close();
  });

  it('marks the episode with the fact it became, and keeps its other metadata', async () => {
    const storage = createMemoryAdapter();
    const c = new MemoryCoordinator({ storage });
    await c.getEpisodicMemory().store('A big win today.', undefined, 0.9, { source: 'journal' });
    await c.consolidate();

    const db = storage.getDatabase();
    const { metadata } = db.prepare('SELECT metadata FROM episodic_memories').get() as { metadata: string };
    const { id } = db.prepare("SELECT id FROM learned_facts WHERE source = 'consolidation'").get() as { id: string };
    expect(JSON.parse(metadata)).toEqual({ source: 'journal', consolidatedInto: id });
    await c.close();
  });

  it('does not copy an episode again that an earlier version already promoted', async () => {
    // What a database written before the mark looks like: the fact is there,
    // the episode carries no trace of it.
    const { c, db } = await coordinatorMitEpisoden();
    await c.getSemanticMemory().storeFact('I was thrilled when the deploy finally worked.', 'consolidation', 0.7);

    const r = await c.consolidate();

    expect(r.promoted).toBe(0);
    expect(fakten(db)).toHaveLength(1);
    const { metadata } = db
      .prepare("SELECT metadata FROM episodic_memories WHERE emotional_weight > 0.5")
      .get() as { metadata: string };
    expect(JSON.parse(metadata).consolidatedInto).toEqual(expect.any(String));
    await c.close();
  });

  it('reports pruned as 0, because it deletes nothing from long-term memory', async () => {
    const { c, db } = await coordinatorMitEpisoden();
    const vorher = (db.prepare('SELECT COUNT(*) AS n FROM episodic_memories').get() as { n: number }).n;
    const r = await c.consolidate();
    expect(r.pruned).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS n FROM episodic_memories').get() as { n: number }).n).toBe(vorher);
    await c.close();
  });
});
