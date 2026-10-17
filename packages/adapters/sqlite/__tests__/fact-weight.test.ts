/**
 * An emotional weight given for a fact sets its starting FSRS stability (0.6.0), on SQLite.
 *
 * Measured on 0.5.1 (PostgreSQL): facts stored with weight 0.1 and 0.95 both started at
 * difficulty 5, stability 7 — the option was accepted and dropped, while the recipes promised
 * an effect on the schedule.
 */
import { describe, it, expect } from 'vitest';
import { MemoryCoordinator } from '@zensation/core';
import { createMemoryAdapter } from '../src/index.js';

describe('emotional weight on facts, on SQLite', () => {
  it('stretches the starting stability by 1 + weight and schedules the first review later', async () => {
    const storage = createMemoryAdapter();
    const c = new MemoryCoordinator({ storage });
    const ids = {
      none: await c.store('The user takes the 7:40 ferry.', { type: 'fact' }),
      low: await c.store('The user once tried oat milk.', { type: 'fact', emotionalWeight: 0.1 }),
      high: await c.store('The user is allergic to penicillin.', { type: 'fact', emotionalWeight: 0.95 }),
    };
    const state = (id: string) =>
      storage
        .getDatabase()
        .prepare('SELECT fsrs_difficulty AS d, fsrs_stability AS s, fsrs_next_review AS next, created_at AS created FROM learned_facts WHERE id = ?')
        .get(id) as { d: number; s: number; next: string; created: string };

    expect(state(ids.none).s).toBeCloseTo(7, 10);
    expect(state(ids.low).s).toBeCloseTo(7.7, 10);
    expect(state(ids.high).s).toBeCloseTo(13.65, 10);
    expect([state(ids.none).d, state(ids.low).d, state(ids.high).d]).toEqual([5, 5, 5]);
    const days = (id: string) => (Date.parse(state(id).next) - Date.parse(state(id).created)) / 86_400_000;
    expect(days(ids.high)).toBeGreaterThan(days(ids.low));
    expect(days(ids.high)).toBeCloseTo(-13.65 * Math.log(0.9), 2);
    await c.close();
  });

  it('a weight above 0.5 with automatic routing still makes an episode, not a fact', async () => {
    const storage = createMemoryAdapter();
    const c = new MemoryCoordinator({ storage });
    await c.store('The user is allergic to penicillin.', { emotionalWeight: 0.95 });
    expect(await c.getSemanticMemory().count()).toBe(0);
    expect(await c.getEpisodicMemory().count()).toBe(1);
    await c.close();
  });
});
