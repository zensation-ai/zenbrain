import { describe, it, expect } from 'vitest';
import { MemoryCoordinator } from '../src/index';
import { InMemoryStorage } from '../src/testing';

// The FSRS functions reject a grade outside 1-5, but recordReview() checked nothing
// itself: 0 and 2.5 went through as "forgotten", only 6 threw, and only when the fact
// existed. The grade is now checked first, with the same rule and message.
describe('recordReview grades', () => {
  const coordinator = new MemoryCoordinator({ storage: new InMemoryStorage() });

  it.each([0, 2.5, 6, Number.NaN])('rejects grade %s before touching storage', async (grade) => {
    await expect(coordinator.recordReview('any-id', grade)).rejects.toThrow(RangeError);
  });
});
