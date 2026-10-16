/**
 * recordReview() on a real SQLite database: it says whether the fact existed.
 * Up to 0.5.1 an unknown id resolved silently, so a typo in a review loop went unseen.
 */
import { describe, it, expect } from 'vitest';
import { MemoryCoordinator } from '@zensation/core';
import { createMemoryAdapter } from '../src/index.js';

describe('recordReview on SQLite', () => {
  it('returns true for a stored fact and false for an unknown id', async () => {
    const c = new MemoryCoordinator({ storage: createMemoryAdapter() });
    const id = await c.store('The user prefers tea.', { type: 'fact' });

    await expect(c.recordReview(id, 4)).resolves.toBe(true);
    await expect(c.recordReview('00000000-0000-4000-8000-000000000000', 4)).resolves.toBe(false);

    await c.close();
  });
});
