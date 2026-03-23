/**
 * FSRS Spaced Repetition Scheduler Tests
 */
import { describe, it, expect } from 'vitest';
import {
  getRetrievability,
  scheduleNextReview,
  updateAfterRecall,
  updateAfterForgot,
  initFromDecayClass,
  initFromSM2,
  clampDifficulty,
  updateStabilityCompat,
  getRetentionProbabilityCompat,
  TARGET_RETENTION,
  MIN_STABILITY,
  MIN_DIFFICULTY,
  MAX_DIFFICULTY,
  MS_PER_DAY,
} from '../src/fsrs';
import type { FSRSState } from '../src/fsrs';

// ===========================================
// Helpers
// ===========================================

function makeState(overrides: Partial<FSRSState> = {}): FSRSState {
  const stability = overrides.stability ?? 7;
  const intervalDays = -stability * Math.log(TARGET_RETENTION);
  const nextReview = overrides.nextReview ?? new Date(Date.now() + intervalDays * MS_PER_DAY);
  return {
    difficulty: overrides.difficulty ?? 5,
    stability,
    nextReview,
  };
}

function stateReviewedDaysAgo(daysAgo: number, stability = 7): FSRSState {
  const intervalDays = -stability * Math.log(TARGET_RETENTION);
  const lastReviewed = new Date(Date.now() - daysAgo * MS_PER_DAY);
  const nextReview = new Date(lastReviewed.getTime() + intervalDays * MS_PER_DAY);
  return { difficulty: 5, stability, nextReview };
}

// ===========================================
// Constants
// ===========================================

describe('FSRS constants', () => {
  it('TARGET_RETENTION is 0.9', () => {
    expect(TARGET_RETENTION).toBeCloseTo(0.9);
  });
  it('MIN_STABILITY is 0.5', () => {
    expect(MIN_STABILITY).toBeCloseTo(0.5);
  });
  it('MIN_DIFFICULTY is 1.0', () => {
    expect(MIN_DIFFICULTY).toBeCloseTo(1.0);
  });
  it('MAX_DIFFICULTY is 10.0', () => {
    expect(MAX_DIFFICULTY).toBeCloseTo(10.0);
  });
  it('MS_PER_DAY is 86400000', () => {
    expect(MS_PER_DAY).toBe(86400000);
  });
});

// ===========================================
// clampDifficulty
// ===========================================

describe('clampDifficulty', () => {
  it('passes through values within range', () => {
    expect(clampDifficulty(5)).toBeCloseTo(5);
    expect(clampDifficulty(1)).toBeCloseTo(1);
    expect(clampDifficulty(10)).toBeCloseTo(10);
  });
  it('clamps values below 1 to 1', () => {
    expect(clampDifficulty(0)).toBeCloseTo(1);
    expect(clampDifficulty(-5)).toBeCloseTo(1);
  });
  it('clamps values above 10 to 10', () => {
    expect(clampDifficulty(11)).toBeCloseTo(10);
    expect(clampDifficulty(100)).toBeCloseTo(10);
  });
});

// ===========================================
// getRetrievability
// ===========================================

describe('getRetrievability', () => {
  it('returns ~0.9 at review time', () => {
    const s = 7;
    const intervalDays = -s * Math.log(TARGET_RETENTION);
    const lastReviewed = new Date(Date.now() - intervalDays * MS_PER_DAY);
    const nextReview = new Date(lastReviewed.getTime() + intervalDays * MS_PER_DAY);
    const state: FSRSState = { difficulty: 5, stability: s, nextReview };
    expect(getRetrievability(state)).toBeCloseTo(TARGET_RETENTION, 3);
  });

  it('returns ~1.0 immediately after review', () => {
    const stability = 7;
    const intervalDays = -stability * Math.log(TARGET_RETENTION);
    const nextReview = new Date(Date.now() + intervalDays * MS_PER_DAY);
    const state: FSRSState = { difficulty: 5, stability, nextReview };
    expect(getRetrievability(state)).toBeCloseTo(1.0, 3);
  });

  it('returns near-zero for very old facts', () => {
    const state = stateReviewedDaysAgo(100, 1);
    expect(getRetrievability(state)).toBeLessThan(0.01);
  });

  it('higher stability = higher retention at same elapsed time', () => {
    const lowS = stateReviewedDaysAgo(14, 7);
    const highS = stateReviewedDaysAgo(14, 30);
    expect(getRetrievability(highS)).toBeGreaterThan(getRetrievability(lowS));
  });

  it('is between 0 and 1', () => {
    const state = stateReviewedDaysAgo(0, 7);
    expect(getRetrievability(state)).toBeGreaterThanOrEqual(0);
    expect(getRetrievability(state)).toBeLessThanOrEqual(1);
  });
});

// ===========================================
// scheduleNextReview
// ===========================================

describe('scheduleNextReview', () => {
  it('schedules at -S * ln(targetRetention) days', () => {
    const stability = 10;
    const state = makeState({ stability });
    const expectedInterval = -stability * Math.log(TARGET_RETENTION);
    const now = new Date();
    const next = scheduleNextReview(state, TARGET_RETENTION, now);
    const actualDays = (next.getTime() - now.getTime()) / MS_PER_DAY;
    expect(actualDays).toBeCloseTo(expectedInterval, 3);
  });

  it('longer interval for higher stability', () => {
    const now = new Date();
    const lowS = makeState({ stability: 5 });
    const highS = makeState({ stability: 30 });
    expect(scheduleNextReview(highS, TARGET_RETENTION, now).getTime())
      .toBeGreaterThan(scheduleNextReview(lowS, TARGET_RETENTION, now).getTime());
  });

  it('returns a future date', () => {
    const now = new Date();
    const next = scheduleNextReview(makeState({ stability: 7 }), TARGET_RETENTION, now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });
});

// ===========================================
// updateAfterRecall
// ===========================================

describe('updateAfterRecall', () => {
  it('increases stability', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    const updated = updateAfterRecall(state, 4, 0.9);
    expect(updated.stability).toBeGreaterThan(state.stability);
  });

  it('decreases difficulty on high grade', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    const updated = updateAfterRecall(state, 5, 0.9);
    expect(updated.difficulty).toBeLessThan(state.difficulty);
  });

  it('increases difficulty on low grade', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    const updated = updateAfterRecall(state, 1, 0.9);
    expect(updated.difficulty).toBeGreaterThan(state.difficulty);
  });

  it('implements desirable difficulty: low R → bigger stability boost', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    const highR = updateAfterRecall(state, 4, 0.95);
    const lowR = updateAfterRecall(state, 4, 0.3);
    expect(lowR.stability).toBeGreaterThan(highR.stability);
  });

  it('clamps difficulty to [1, 10]', () => {
    const atMax = makeState({ difficulty: 10, stability: 7 });
    const atMin = makeState({ difficulty: 1, stability: 7 });
    expect(updateAfterRecall(atMax, 1, 0.9).difficulty).toBeLessThanOrEqual(MAX_DIFFICULTY);
    expect(updateAfterRecall(atMin, 5, 0.9).difficulty).toBeGreaterThanOrEqual(MIN_DIFFICULTY);
  });

  it('difficulty changes by 0.15*(grade-3)', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    const updated = updateAfterRecall(state, 4, 0.9);
    expect(updated.difficulty).toBeCloseTo(5 - 0.15, 3);
  });
});

// ===========================================
// updateAfterForgot
// ===========================================

describe('updateAfterForgot', () => {
  it('decreases stability', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    expect(updateAfterForgot(state, 0.9).stability).toBeLessThan(state.stability);
  });

  it('never drops below MIN_STABILITY', () => {
    const tiny = makeState({ difficulty: 5, stability: 0.5 });
    expect(updateAfterForgot(tiny, 0.9).stability).toBeGreaterThanOrEqual(MIN_STABILITY);
  });

  it('increases difficulty', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    expect(updateAfterForgot(state, 0.9).difficulty).toBeGreaterThan(state.difficulty);
  });

  it('difficulty increases by 0.2', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    expect(updateAfterForgot(state, 0.9).difficulty).toBeCloseTo(5.2, 3);
  });
});

// ===========================================
// initFromDecayClass
// ===========================================

describe('initFromDecayClass', () => {
  it('permanent → D:1.5, S:90', () => {
    const state = initFromDecayClass('permanent');
    expect(state.difficulty).toBeCloseTo(1.5, 1);
    expect(state.stability).toBeCloseTo(90, 1);
  });

  it('normal_decay → D:5, S:7', () => {
    const state = initFromDecayClass('normal_decay');
    expect(state.difficulty).toBeCloseTo(5, 1);
    expect(state.stability).toBeCloseTo(7, 1);
  });

  it('emotional weight 2.0 doubles stability', () => {
    const base = initFromDecayClass('normal_decay', 1.0);
    const emotional = initFromDecayClass('normal_decay', 2.0);
    expect(emotional.stability).toBeCloseTo(base.stability * 2, 3);
  });

  it('unknown decay class falls back to normal_decay', () => {
    const unknown = initFromDecayClass('unknown_type');
    const normal = initFromDecayClass('normal_decay');
    expect(unknown.difficulty).toBeCloseTo(normal.difficulty, 3);
    expect(unknown.stability).toBeCloseTo(normal.stability, 3);
  });
});

// ===========================================
// initFromSM2
// ===========================================

describe('initFromSM2', () => {
  it('null → default D:5, S:1', () => {
    const state = initFromSM2(null);
    expect(state.difficulty).toBeCloseTo(5, 1);
    expect(state.stability).toBeCloseTo(1, 1);
  });

  it('high SM-2 stability → low difficulty', () => {
    expect(initFromSM2(90).difficulty).toBeLessThan(5);
  });

  it('low SM-2 stability → higher difficulty', () => {
    expect(initFromSM2(1).difficulty).toBeGreaterThan(4);
  });

  it('preserves stability value', () => {
    expect(initFromSM2(14).stability).toBeCloseTo(14, 1);
  });
});

// ===========================================
// Backward-compat wrappers
// ===========================================

describe('updateStabilityCompat', () => {
  it('increases on success', () => {
    expect(updateStabilityCompat(7, true)).toBeGreaterThan(7);
  });
  it('decreases on failure', () => {
    expect(updateStabilityCompat(7, false)).toBeLessThan(7);
  });
  it('never drops below MIN_STABILITY', () => {
    expect(updateStabilityCompat(0.5, false)).toBeGreaterThanOrEqual(MIN_STABILITY);
  });
});

describe('getRetentionProbabilityCompat', () => {
  it('returns ~1.0 for just-accessed fact', () => {
    expect(getRetentionProbabilityCompat(new Date(), 7)).toBeCloseTo(1.0, 2);
  });
  it('recent > old', () => {
    const recent = getRetentionProbabilityCompat(new Date(Date.now() - 1 * MS_PER_DAY), 7);
    const old = getRetentionProbabilityCompat(new Date(Date.now() - 30 * MS_PER_DAY), 7);
    expect(recent).toBeGreaterThan(old);
  });
  it('higher emotionalMultiplier → higher retention', () => {
    const lastAccess = new Date(Date.now() - 10 * MS_PER_DAY);
    const base = getRetentionProbabilityCompat(lastAccess, 7, 1.0);
    const boosted = getRetentionProbabilityCompat(lastAccess, 7, 2.0);
    expect(boosted).toBeGreaterThan(base);
  });
});
