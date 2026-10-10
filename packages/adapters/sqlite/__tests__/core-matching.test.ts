/**
 * Core blocks crowding out the actual hit, on a real SQLite database.
 *
 * Every recall adds every core block, scored 0.5, or 0.8 when the block shares a word
 * of more than two letters with the query. "the" is such a word, so with fifteen core
 * blocks every block scored 0.8 and a fact that answers the question did not reach the
 * top ten at all (measured on 2026-10-10 against 0.4.10; the Agent Memory Atlas named the
 * pattern on 30.09.2026). `core: 'matching'` keeps only blocks that share a content word.
 */
import { describe, it, expect } from 'vitest';
import { MemoryCoordinator } from '@zensation/core';
import { createMemoryAdapter } from '../src/index.js';

const BLOCKS = [
  'The assistant persona is calm and precise.',
  'The user is called Alex.',
  'The user works as a carpenter.',
  'The user has two cats, Mira and Tobi.',
  'The workshop is in Kiel.',
  'The user prefers metric units.',
  'Invoices go out on the first Monday.',
  'The van is a blue Transit.',
  'The user speaks German and English.',
  'The apprentice is named Jonas.',
  'The user dislikes long emails.',
  'The workshop alarm code changes monthly.',
  'The user drinks black coffee.',
  'Holidays are taken in August.',
  'The accountant is reachable by phone only.',
];
const FACT = 'Beech planks arrive every Thursday from the sawmill.';

async function setUp() {
  const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
  for (const b of BLOCKS) await c.store(b, { type: 'core' });
  await c.store(FACT, { type: 'fact', confidence: 0.8 });
  return c;
}

describe("RecallOptions.core: 'matching'", () => {
  it('lets the fact through that fifteen core blocks push out by default', async () => {
    const c = await setUp();
    const query = 'which day do the beech planks arrive';

    const byDefault = await c.recall(query);
    expect(byDefault.some((r) => r.content === FACT)).toBe(false); // the documented default
    expect(byDefault.filter((r) => r.layer === 'core')).toHaveLength(10);

    const matching = await c.recall(query, { core: 'matching' });
    expect(matching.some((r) => r.content === FACT)).toBe(true);
    expect(matching.filter((r) => r.layer === 'core')).toHaveLength(0);
    await c.close();
  });

  it('still returns the core block a query is about', async () => {
    const c = await setUp();
    const results = await c.recall('who is the apprentice', { core: 'matching' });
    const core = results.filter((r) => r.layer === 'core').map((r) => r.content);
    expect(core).toHaveLength(1);
    expect(core[0]).toContain('The apprentice is named Jonas.');
    await c.close();
  });

  it("does not count stopwords as a match", async () => {
    const c = await setUp();
    const results = await c.recall('what is the plan for the', { core: 'matching' });
    expect(results.filter((r) => r.layer === 'core')).toHaveLength(0);
    await c.close();
  });
});
