/**
 * Ebbinghaus module tests. Until 0.5.2 this module had none, while the README called the
 * library "twenty modules of tested functions". Two of the tests below were red against
 * 0.5.1: calculateRetention reported a different stability than the one it used, and
 * batchCalculateRetention disagreed with calculateRetention for the same fact.
 */
import { describe, it, expect } from 'vitest';
import {
  EBBINGHAUS_CONFIG,
  calculateRetention,
  updateStability,
  getRepetitionCandidates,
  shouldArchive,
  calculateOptimalInterval,
  batchCalculateRetention,
  learnDecayProfile,
  calculatePersonalizedRetention,
} from '../src/ebbinghaus';

const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

describe('calculateRetention', () => {
  it('follows R = e^(-t/S): at t = S retention is 1/e', () => {
    const r = calculateRetention(daysAgo(7), 7);
    expect(r.retention).toBeCloseTo(Math.exp(-1), 6);
    expect(r.daysSinceAccess).toBeCloseTo(7, 6);
    expect(r.stability).toBe(7);
  });

  it.each([
    [7, 0.5], [7, 1], [7, 2], [7, 5], [0.2, 1], [0.05, 3],
  ])('reports the stability it computed with (S %s, multiplier %s)', (stability, multiplier) => {
    const r = calculateRetention(daysAgo(2), stability, multiplier);
    expect(r.retention).toBeCloseTo(Math.exp(-r.daysSinceAccess / r.stability), 9);
  });

  it('clamps the emotional multiplier to the documented 1.0-3.0', () => {
    expect(calculateRetention(daysAgo(1), 7, 5).stability).toBe(21);
    expect(calculateRetention(daysAgo(1), 7, 0.5).stability).toBe(7);
  });

  it('never goes below the configured minimum stability', () => {
    expect(calculateRetention(daysAgo(1), 0.01).stability).toBe(EBBINGHAUS_CONFIG.MIN_STABILITY);
  });

  it('flags review and archive by the configured thresholds', () => {
    const review = calculateRetention(daysAgo(1.5), 1); // e^-1.5 ≈ 0.223
    expect(review.needsReview).toBe(true);
    expect(review.shouldArchive).toBe(false);
    const archive = calculateRetention(daysAgo(3), 1); // e^-3 ≈ 0.050
    expect(archive.needsReview).toBe(false);
    expect(archive.shouldArchive).toBe(true);
  });
});

describe('batchCalculateRetention', () => {
  it('gives the same result as calculateRetention for each fact', () => {
    const facts = [
      { id: 'a', lastAccess: daysAgo(2), stability: 7 },
      { id: 'b', lastAccess: daysAgo(2), stability: 1, emotionalMultiplier: 5 },
      { id: 'c', lastAccess: daysAgo(2), stability: 1, emotionalMultiplier: 0.5 },
      { id: 'd', lastAccess: daysAgo(2), stability: 0.2 },
    ];
    const batch = batchCalculateRetention(facts);
    for (const f of facts) {
      const single = calculateRetention(f.lastAccess, f.stability, f.emotionalMultiplier);
      expect(batch.get(f.id)!.stability).toBe(single.stability);
      expect(batch.get(f.id)!.retention).toBeCloseTo(single.retention, 6);
    }
  });
});

describe('updateStability', () => {
  it('raises stability after a successful retrieval and lowers it after a failure', () => {
    expect(updateStability(7, true)).toBeGreaterThan(7);
    expect(updateStability(7, false)).toBeLessThan(7);
  });

  it('stays within the configured bounds', () => {
    expect(updateStability(400, true)).toBe(EBBINGHAUS_CONFIG.MAX_STABILITY);
    expect(updateStability(0.1, false)).toBeGreaterThanOrEqual(EBBINGHAUS_CONFIG.MIN_STABILITY);
  });
});

describe('getRepetitionCandidates', () => {
  it('returns facts near the review threshold, most urgent first', () => {
    const facts = [
      { id: 'fresh', content: 'x', lastAccess: daysAgo(0.1), stability: 7 },
      { id: 'due', content: 'y', lastAccess: daysAgo(8), stability: 7 },     // e^-8/7 ≈ 0.32
      { id: 'late', content: 'z', lastAccess: daysAgo(14), stability: 7 },   // e^-2 ≈ 0.135
    ];
    const ids = getRepetitionCandidates(facts).map((c) => c.factId);
    expect(ids).toEqual(['late', 'due']);
  });
});

describe('shouldArchive and calculateOptimalInterval', () => {
  it('archives at or below the archive threshold', () => {
    expect(shouldArchive(EBBINGHAUS_CONFIG.ARCHIVE_THRESHOLD)).toBe(true);
    expect(shouldArchive(EBBINGHAUS_CONFIG.ARCHIVE_THRESHOLD + 0.01)).toBe(false);
  });

  it('solves R = e^(-t/S) for t, with a floor of 0.1 days', () => {
    expect(calculateOptimalInterval(10, 0.9)).toBeCloseTo(-10 * Math.log(0.9), 9);
    expect(calculateOptimalInterval(0.01, 0.9)).toBe(0.1);
  });
});

describe('learnDecayProfile and calculatePersonalizedRetention', () => {
  const history = (recalled: boolean[]) =>
    recalled.map((wasRecalled, i) => ({ accessedAt: new Date(Date.UTC(2026, 0, 1 + 7 * i)), wasRecalled }));

  it('needs at least two events', () => {
    expect(learnDecayProfile(history([true]))).toBeNull();
  });

  it('gives good recallers a multiplier above 1 and poor ones below, within 0.5-3.0', () => {
    const good = learnDecayProfile(history([true, true, true, true]))!;
    const poor = learnDecayProfile(history([false, false, false, true]))!;
    expect(good.personalStabilityMultiplier).toBeGreaterThan(1);
    expect(poor.personalStabilityMultiplier).toBeLessThan(1);
    for (const p of [good, poor]) {
      expect(p.personalStabilityMultiplier).toBeGreaterThanOrEqual(0.5);
      expect(p.personalStabilityMultiplier).toBeLessThanOrEqual(3);
    }
    expect(good.avgAccessInterval).toBeCloseTo(7, 9);
  });

  it('applies the personal multiplier, and falls back without a profile', () => {
    const last = daysAgo(3);
    const profile = { userId: 'u', avgAccessInterval: 7, retentionAtReview: 1, personalStabilityMultiplier: 2 };
    expect(calculatePersonalizedRetention(last, 7, profile).stability).toBe(14);
    expect(calculatePersonalizedRetention(last, 7, null).stability).toBe(calculateRetention(last, 7).stability);
  });
});
