/**
 * Retention Curve Visualization Helpers
 *
 * Generate data points for charting Ebbinghaus forgetting curves
 * and FSRS scheduling timelines.
 *
 * @packageDocumentation
 * @module @zensation/algorithms/visualization
 */

import { initFromDecayClass, updateAfterRecall, updateAfterForgot, scheduleNextReview, TARGET_RETENTION, MS_PER_DAY } from './fsrs';
import type { FSRSState } from './fsrs';

export interface CurvePoint {
  day: number;
  retention: number;
  reviewed: boolean;
}

export interface SchedulePoint {
  review: number;
  stability: number;
  difficulty: number;
  intervalDays: number;
}

/**
 * Generate Ebbinghaus forgetting curve data points.
 * Optionally includes review events that reset the curve.
 *
 * @param stability - Initial memory stability in days
 * @param days - Number of days to generate (default 30)
 * @param reviews - Optional review events with day and grade
 * @param emotionalMultiplier - Optional emotional boost to stability (default 1.0)
 * @returns Array of curve points, one per day
 */
export function generateRetentionCurve(
  stability: number,
  days = 30,
  reviews?: Array<{ day: number; grade: 1 | 2 | 3 | 4 | 5 }>,
  emotionalMultiplier = 1.0,
): CurvePoint[] {
  const points: CurvePoint[] = [];
  let currentStability = stability * Math.max(1.0, emotionalMultiplier);
  let lastReviewDay = 0;

  // Build a lookup map for review days
  const reviewMap = new Map<number, 1 | 2 | 3 | 4 | 5>();
  if (reviews) {
    for (const r of reviews) {
      reviewMap.set(r.day, r.grade);
    }
  }

  // Grade-dependent stability multipliers
  const gradeMultipliers: Record<number, number> = {
    5: 2.5,
    4: 2.0,
    3: 1.5,
    2: 1.0,
    1: 0.5,
  };

  for (let day = 0; day <= days; day++) {
    const isReviewDay = reviewMap.has(day);

    if (isReviewDay && day > 0) {
      const grade = reviewMap.get(day)!;
      currentStability = currentStability * gradeMultipliers[grade];
      lastReviewDay = day;
    }

    // R = e^(-t/S) where t = days since last review
    const t = day - lastReviewDay;
    const retention = Math.exp(-t / currentStability);

    points.push({
      day,
      retention: Math.max(0, Math.min(1, retention)),
      reviewed: isReviewDay,
    });
  }

  return points;
}

/**
 * Generate FSRS scheduling timeline from a sequence of grades.
 *
 * @param initialDifficulty - Starting difficulty (default uses normal_decay preset)
 * @param grades - Sequence of review grades to simulate
 * @returns Array of schedule points showing stability/difficulty progression
 */
export function generateScheduleTimeline(
  initialDifficulty?: number,
  grades?: (1 | 2 | 3 | 4 | 5)[],
): SchedulePoint[] {
  const points: SchedulePoint[] = [];
  const now = new Date();

  let state: FSRSState;
  if (initialDifficulty !== undefined) {
    const stability = 7; // normal starting stability
    state = {
      difficulty: Math.max(1, Math.min(10, initialDifficulty)),
      stability,
      nextReview: scheduleNextReview({ difficulty: initialDifficulty, stability, nextReview: now }, TARGET_RETENTION, now),
    };
  } else {
    state = initFromDecayClass('normal_decay');
  }

  // Initial state
  const initialInterval = -state.stability * Math.log(TARGET_RETENTION);
  points.push({
    review: 0,
    stability: state.stability,
    difficulty: state.difficulty,
    intervalDays: initialInterval,
  });

  const reviewGrades = grades ?? [4, 4, 4, 4, 4]; // default: 5 successful reviews

  for (let i = 0; i < reviewGrades.length; i++) {
    const grade = reviewGrades[i];
    // Simulate retrievability at review time (assume reviewing at scheduled time = TARGET_RETENTION)
    const retrievability = TARGET_RETENTION;

    if (grade >= 2) {
      state = updateAfterRecall(state, grade, retrievability, now);
    } else {
      state = updateAfterForgot(state, retrievability, now);
    }

    const intervalDays = -state.stability * Math.log(TARGET_RETENTION);
    points.push({
      review: i + 1,
      stability: state.stability,
      difficulty: state.difficulty,
      intervalDays,
    });
  }

  return points;
}
