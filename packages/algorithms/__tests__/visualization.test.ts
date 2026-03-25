/**
 * Visualization Helpers — Tests
 */
import { describe, it, expect } from 'vitest';
import { generateRetentionCurve, generateScheduleTimeline } from '../src/visualization';

describe('generateRetentionCurve', () => {
  it('generates correct number of points', () => {
    const points = generateRetentionCurve(7, 30);
    expect(points).toHaveLength(31); // 0 to 30 inclusive
  });

  it('starts with retention = 1 at day 0', () => {
    const points = generateRetentionCurve(7, 10);
    expect(points[0].day).toBe(0);
    expect(points[0].retention).toBeCloseTo(1, 5);
  });

  it('retention decays over time', () => {
    const points = generateRetentionCurve(7, 10);
    expect(points[5].retention).toBeLessThan(points[0].retention);
    expect(points[10].retention).toBeLessThan(points[5].retention);
  });

  it('higher stability means slower decay', () => {
    const lowS = generateRetentionCurve(2, 10);
    const highS = generateRetentionCurve(30, 10);
    expect(highS[10].retention).toBeGreaterThan(lowS[10].retention);
  });

  it('all retention values are in [0, 1]', () => {
    const points = generateRetentionCurve(7, 60);
    for (const p of points) {
      expect(p.retention).toBeGreaterThanOrEqual(0);
      expect(p.retention).toBeLessThanOrEqual(1);
    }
  });

  it('marks review days correctly', () => {
    const reviews = [{ day: 3, grade: 4 as const }, { day: 7, grade: 5 as const }];
    const points = generateRetentionCurve(7, 10, reviews);
    expect(points[3].reviewed).toBe(true);
    expect(points[7].reviewed).toBe(true);
    expect(points[5].reviewed).toBe(false);
  });

  it('reviews reset retention curve', () => {
    const withoutReview = generateRetentionCurve(3, 10);
    const withReview = generateRetentionCurve(3, 10, [{ day: 5, grade: 5 }]);
    // After review on day 5, day 7 should have higher retention
    expect(withReview[7].retention).toBeGreaterThan(withoutReview[7].retention);
  });

  it('emotional multiplier boosts stability', () => {
    const normal = generateRetentionCurve(7, 10, undefined, 1.0);
    const emotional = generateRetentionCurve(7, 10, undefined, 1.5);
    expect(emotional[10].retention).toBeGreaterThan(normal[10].retention);
  });

  it('uses default days=30 when not specified', () => {
    const points = generateRetentionCurve(7);
    expect(points).toHaveLength(31);
  });

  it('grade 1 review reduces stability', () => {
    const badReview = generateRetentionCurve(7, 20, [{ day: 5, grade: 1 }]);
    const goodReview = generateRetentionCurve(7, 20, [{ day: 5, grade: 5 }]);
    // After a grade-1 review, subsequent retention should be lower
    expect(badReview[15].retention).toBeLessThan(goodReview[15].retention);
  });
});

describe('generateScheduleTimeline', () => {
  it('returns initial state plus one entry per grade', () => {
    const grades: (1 | 2 | 3 | 4 | 5)[] = [4, 4, 4];
    const points = generateScheduleTimeline(undefined, grades);
    expect(points).toHaveLength(4); // initial + 3 reviews
  });

  it('review number is sequential', () => {
    const points = generateScheduleTimeline(undefined, [4, 4, 4]);
    expect(points.map(p => p.review)).toEqual([0, 1, 2, 3]);
  });

  it('stability increases with successful reviews', () => {
    const points = generateScheduleTimeline(undefined, [4, 4, 4, 4]);
    // Stability should generally increase with grade 4 reviews
    expect(points[points.length - 1].stability).toBeGreaterThan(points[0].stability);
  });

  it('interval grows with stability', () => {
    const points = generateScheduleTimeline(undefined, [4, 4, 4, 4, 4]);
    // Later intervals should be longer as stability grows
    expect(points[points.length - 1].intervalDays).toBeGreaterThan(points[0].intervalDays);
  });

  it('difficulty decreases with high grades', () => {
    const points = generateScheduleTimeline(undefined, [5, 5, 5, 5]);
    expect(points[points.length - 1].difficulty).toBeLessThan(points[0].difficulty);
  });

  it('forgot (grade 1) decreases stability', () => {
    const points = generateScheduleTimeline(undefined, [4, 4, 1]);
    // After forgetting, stability should drop
    expect(points[3].stability).toBeLessThan(points[2].stability);
  });

  it('uses default 5 grade-4 reviews when no grades provided', () => {
    const points = generateScheduleTimeline();
    expect(points).toHaveLength(6); // initial + 5 defaults
  });

  it('accepts custom initial difficulty', () => {
    const easy = generateScheduleTimeline(2.0, [4]);
    const hard = generateScheduleTimeline(8.0, [4]);
    expect(easy[0].difficulty).toBeLessThan(hard[0].difficulty);
  });

  it('all stability values are positive', () => {
    const points = generateScheduleTimeline(undefined, [1, 1, 1, 5, 5]);
    for (const p of points) {
      expect(p.stability).toBeGreaterThan(0);
    }
  });

  it('all interval values are positive', () => {
    const points = generateScheduleTimeline(undefined, [3, 4, 5, 2, 1]);
    for (const p of points) {
      expect(p.intervalDays).toBeGreaterThan(0);
    }
  });
});
