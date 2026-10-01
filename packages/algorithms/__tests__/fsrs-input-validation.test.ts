/**
 * FSRS input checks (#53, N20). Invalid input used to flow through silently:
 * updateAfterRecall(state, 5) without a retrievability returned stability NaN and
 * an Invalid Date, and an unknown decay class fell back to 'normal_decay'.
 * Every function now names the bad argument instead of computing on.
 */
import { describe, it, expect } from 'vitest';
import {
  initFromDecayClass,
  updateAfterRecall,
  updateAfterForgot,
  getRetrievability,
  scheduleNextReview,
  type FSRSState,
} from '../src/fsrs';

const now = new Date('2026-10-01T08:00:00Z');
const valid = (): FSRSState => ({ difficulty: 5, stability: 7, nextReview: new Date('2026-10-05T08:00:00Z') });

describe('FSRS input checks', () => {
  it('#53: updateAfterRecall without a retrievability throws instead of returning NaN', () => {
    // @ts-expect-error — the call from examples/with-vercel-ai.ts, missing the third argument
    expect(() => updateAfterRecall(valid(), 5)).toThrow(RangeError);
  });

  it.each([0, 6, 2.5, Number.NaN])('rejects grade %s', (grade) => {
    expect(() => updateAfterRecall(valid(), grade, 0.9, now)).toThrow(/grade/);
  });

  it.each([-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY])('rejects retrievability %s', (r) => {
    expect(() => updateAfterRecall(valid(), 4, r, now)).toThrow(/retrievability/);
    expect(() => updateAfterForgot(valid(), r, now)).toThrow(/retrievability/);
  });

  it('rejects a broken state', () => {
    expect(() => getRetrievability({ ...valid(), stability: 0 }, now)).toThrow(/stability/);
    expect(() => getRetrievability({ ...valid(), difficulty: Number.NaN }, now)).toThrow(/difficulty/);
    expect(() => getRetrievability({ ...valid(), nextReview: new Date('nope') }, now)).toThrow(/nextReview/);
  });

  it.each([0, 1, 1.5, Number.NaN])('scheduleNextReview rejects target retention %s', (t) => {
    expect(() => scheduleNextReview(valid(), t, now)).toThrow(/targetRetention/);
  });

  it('rejects an unknown decay class and names the valid ones', () => {
    expect(() => initFromDecayClass('good')).toThrow(/permanent, slow_decay, normal_decay, fast_decay/);
  });

  it('rejects a non-finite emotional weight but still clamps finite ones', () => {
    expect(() => initFromDecayClass('normal_decay', Number.NaN)).toThrow(/emotionalWeight/);
    expect(initFromDecayClass('normal_decay', 5).stability).toBe(14);
    expect(initFromDecayClass('normal_decay', 0).stability).toBe(7);
  });

  it('valid input still returns finite numbers and a valid date', () => {
    const s = updateAfterRecall(valid(), 5, getRetrievability(valid(), now), now);
    expect(Number.isFinite(s.stability)).toBe(true);
    expect(Number.isNaN(s.nextReview.getTime())).toBe(false);
  });
});
