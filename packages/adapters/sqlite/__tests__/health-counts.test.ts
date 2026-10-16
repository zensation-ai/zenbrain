/**
 * getHealth() counts on a real SQLite database. Up to 0.5.1 two counters listed rows
 * with LIMIT 1000 and took the length, so 1001 procedures or due facts reported 1000.
 */
import { describe, it, expect } from 'vitest';
import { MemoryCoordinator } from '@zensation/core';
import { createMemoryAdapter } from '../src/index.js';

describe('getHealth counts past 1000', () => {
  it('counts every procedure and every due fact', async () => {
    const storage = createMemoryAdapter();
    const c = new MemoryCoordinator({ storage });
    const procedures = c.getProceduralMemory();
    const facts = c.getSemanticMemory();
    for (let i = 0; i < 1001; i++) {
      await procedures.record(`procedure ${i}`, ['step'], [], '');
      await facts.storeFact(`fact ${i}`, 'test', 0.7);
    }
    await storage.query(`UPDATE learned_facts SET fsrs_next_review = '2000-01-01T00:00:00.000Z'`);

    const health = await c.getHealth();
    expect(health.procedural.count).toBe(1001);
    expect(health.semantic.dueForReview).toBe(1001);
    expect(health.semantic.count).toBe(1001);

    await c.close();
  });
});
