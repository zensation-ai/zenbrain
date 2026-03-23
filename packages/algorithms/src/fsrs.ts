/**
 * FSRS (Free Spaced Repetition Scheduler)
 *
 * Implements the FSRS algorithm for spaced repetition scheduling.
 *
 * Key concepts:
 * - Difficulty (D): 1.0–10.0, how hard the fact is to recall
 * - Stability (S): days until retention drops to target (usually 0.9)
 * - Retrievability (R): current probability of recall, R = e^(-t/S)
 * - Desirable difficulty: reviewing at low R gives a bigger stability boost
 *
 * References:
 * - FSRS paper: https://github.com/open-spaced-repetition/fsrs4anki
 * - Ebbinghaus (1885): R = e^(-t/S)
 *
 * @packageDocumentation
 * @module @zenbrain/algorithms/fsrs
 */

import type { Logger } from './types';
import { noopLogger } from './types';

// ===========================================
// Types
// ===========================================

export interface FSRSState {
  /** Difficulty of the fact: 1.0 (easy) to 10.0 (very hard) */
  difficulty: number;
  /** Stability in days: how long until retention drops to TARGET_RETENTION */
  stability: number;
  /** When the next review should occur at TARGET_RETENTION */
  nextReview: Date;
}

// ===========================================
// Constants
// ===========================================

/** Target retention probability at next review (90%) */
export const TARGET_RETENTION = 0.9;

/** Minimum stability to prevent instant forgetting (0.5 days) */
export const MIN_STABILITY = 0.5;

/** Minimum difficulty value */
export const MIN_DIFFICULTY = 1.0;

/** Maximum difficulty value */
export const MAX_DIFFICULTY = 10.0;

/** Milliseconds per day */
export const MS_PER_DAY = 86_400_000;

// FSRS stability update hyper-parameters (tuned from open-spaced-repetition research)
const FSRS_A = 0.2;
const FSRS_B = 0.2;
const FSRS_C = 0.3;

// ===========================================
// clampDifficulty
// ===========================================

/**
 * Clamp a difficulty value to the valid range [MIN_DIFFICULTY, MAX_DIFFICULTY].
 */
export function clampDifficulty(d: number): number {
  return Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, d));
}

// ===========================================
// getRetrievability
// ===========================================

/**
 * Calculate current retrievability R = e^(-t/S).
 *
 * Derives lastReviewed from nextReview and stability:
 *   intervalDays = -S * ln(TARGET_RETENTION)
 *   lastReviewed  = nextReview - intervalDays
 *
 * @param state   Current FSRS state
 * @param now     Reference time (defaults to now)
 */
export function getRetrievability(state: FSRSState, now: Date = new Date()): number {
  const { stability, nextReview } = state;

  // Derive lastReviewed: the moment when the scheduling interval started
  const intervalDays = -stability * Math.log(TARGET_RETENTION);
  const lastReviewedMs = nextReview.getTime() - intervalDays * MS_PER_DAY;

  const t = Math.max(0, (now.getTime() - lastReviewedMs) / MS_PER_DAY);
  const r = Math.exp(-t / stability);

  return Math.max(0, Math.min(1, r));
}

// ===========================================
// scheduleNextReview
// ===========================================

/**
 * Schedule the next review date given a target retention.
 *
 * From R = e^(-t/S) → t = -S * ln(targetRetention)
 *
 * @param state           Current FSRS state
 * @param targetRetention Desired retention at review time (default: TARGET_RETENTION)
 * @param now             Reference time (defaults to now)
 */
export function scheduleNextReview(
  state: FSRSState,
  targetRetention: number = TARGET_RETENTION,
  now: Date = new Date()
): Date {
  const intervalDays = -state.stability * Math.log(targetRetention);
  return new Date(now.getTime() + intervalDays * MS_PER_DAY);
}

// ===========================================
// updateAfterRecall
// ===========================================

/**
 * Update FSRS state after a successful recall.
 *
 * Stability update (FSRS formula with desirable difficulty):
 *   S_new = S * (1 + a * (11-D) * S^(-b) * (e^(c*(1-R)) - 1))
 *
 * Difficulty update:
 *   D_new = clamp(D - 0.15*(grade-3), 1, 10)
 *
 * @param state         Current FSRS state
 * @param grade         Review grade 1–5 (1=blackout, 5=perfect)
 * @param retrievability Current retrievability at time of review
 * @param now           Reference time (defaults to now)
 * @param logger        Optional logger for debug output
 */
export function updateAfterRecall(
  state: FSRSState,
  grade: number,
  retrievability: number,
  now: Date = new Date(),
  logger: Logger = noopLogger
): FSRSState {
  const { difficulty: D, stability: S } = state;

  // Stability grows more when retrievability was low (desirable difficulty principle)
  const stabilityBoost =
    1 +
    FSRS_A *
      (11 - D) *
      Math.pow(S, -FSRS_B) *
      (Math.exp(FSRS_C * (1 - retrievability)) - 1);

  const newStability = Math.max(MIN_STABILITY, S * Math.max(1, stabilityBoost));

  // Difficulty: grade 3 = neutral, higher = easier, lower = harder
  const newDifficulty = clampDifficulty(D - 0.15 * (grade - 3));

  const nextReview = scheduleNextReview({ difficulty: newDifficulty, stability: newStability, nextReview: now }, TARGET_RETENTION, now);

  logger.debug?.('FSRS updateAfterRecall', {
    oldD: D, newD: newDifficulty,
    oldS: S, newS: newStability,
    grade, retrievability,
  });

  return { difficulty: newDifficulty, stability: newStability, nextReview };
}

// ===========================================
// updateAfterForgot
// ===========================================

/**
 * Update FSRS state after a failed recall (forgot the fact).
 *
 * Stability decreases:
 *   S_new = S * max(0.1, 0.2 * D^(-0.4) * (S+1)^0.2 * (e^(0.02*(1-R)) - 1))
 *
 * Difficulty increases by 0.2.
 *
 * @param state         Current FSRS state
 * @param retrievability Current retrievability at time of review
 * @param now           Reference time (defaults to now)
 * @param logger        Optional logger for debug output
 */
export function updateAfterForgot(
  state: FSRSState,
  retrievability: number,
  now: Date = new Date(),
  logger: Logger = noopLogger
): FSRSState {
  const { difficulty: D, stability: S } = state;

  const decayFactor = Math.max(
    0.1,
    0.2 * Math.pow(D, -0.4) * Math.pow(S + 1, 0.2) * (Math.exp(0.02 * (1 - retrievability)) - 1)
  );

  const newStability = Math.max(MIN_STABILITY, S * decayFactor);
  const newDifficulty = clampDifficulty(D + 0.2);

  const nextReview = scheduleNextReview({ difficulty: newDifficulty, stability: newStability, nextReview: now }, TARGET_RETENTION, now);

  logger.debug?.('FSRS updateAfterForgot', {
    oldD: D, newD: newDifficulty,
    oldS: S, newS: newStability,
    retrievability,
  });

  return { difficulty: newDifficulty, stability: newStability, nextReview };
}

// ===========================================
// initFromDecayClass
// ===========================================

/**
 * Map a decay class string to an initial FSRSState.
 *
 * Decay class → (difficulty, baseStability):
 *   permanent    → (1.5,  90)
 *   slow_decay   → (3.0,  30)
 *   normal_decay → (5.0,   7)
 *   fast_decay   → (7.5,   2)
 *
 * emotionalWeight scales stability from 1.0× (no boost) to 2.0× (double stability).
 *
 * @param decayClass     One of: permanent, slow_decay, normal_decay, fast_decay
 * @param emotionalWeight 1.0–2.0 multiplier on base stability (default 1.0)
 */
export function initFromDecayClass(
  decayClass: string,
  emotionalWeight = 1.0
): FSRSState {
  const presets: Record<string, { difficulty: number; stability: number }> = {
    permanent:    { difficulty: 1.5,  stability: 90 },
    slow_decay:   { difficulty: 3.0,  stability: 30 },
    normal_decay: { difficulty: 5.0,  stability: 7  },
    fast_decay:   { difficulty: 7.5,  stability: 2  },
  };

  const preset = presets[decayClass] ?? presets['normal_decay'];

  const difficulty = clampDifficulty(preset.difficulty);
  // Clamp emotional weight to [1.0, 2.0] and apply as multiplier
  const clampedWeight = Math.max(1.0, Math.min(2.0, emotionalWeight));
  const stability = Math.max(MIN_STABILITY, preset.stability * clampedWeight);

  const now = new Date();
  const nextReview = scheduleNextReview({ difficulty, stability, nextReview: now }, TARGET_RETENTION, now);

  return { difficulty, stability, nextReview };
}

// ===========================================
// initFromSM2
// ===========================================

/**
 * Convert an existing SM-2 stability value into an FSRSState.
 *
 * Stability ranges → difficulty mapping:
 *   null or 0  → default (D:5, S:1)
 *   < 3        → D:7.5  (fast decay)
 *   3–10       → D:5.0  (normal)
 *   10–30      → D:3.5  (slow)
 *   > 30       → D:2.0  (very stable)
 *
 * @param sm2Stability Existing SM-2 stability in days, or null for default
 */
export function initFromSM2(sm2Stability: number | null): FSRSState {
  if (sm2Stability === null) {
    const now = new Date();
    const difficulty = 5.0;
    const stability = 1.0;
    const nextReview = scheduleNextReview({ difficulty, stability, nextReview: now }, TARGET_RETENTION, now);
    return { difficulty, stability, nextReview };
  }

  let difficulty: number;
  if (sm2Stability < 3) {
    difficulty = 7.5;
  } else if (sm2Stability < 10) {
    difficulty = 5.0;
  } else if (sm2Stability <= 30) {
    difficulty = 3.5;
  } else {
    difficulty = 2.0;
  }

  const stability = Math.max(MIN_STABILITY, sm2Stability);
  const now = new Date();
  const nextReview = scheduleNextReview({ difficulty, stability, nextReview: now }, TARGET_RETENTION, now);

  return { difficulty, stability, nextReview };
}

// ===========================================
// Backward-compat wrappers (drop-in for ebbinghaus-decay systems)
// ===========================================

/**
 * Drop-in replacement for SM-2 updateStability.
 *
 * Maps SM-2 boolean success to FSRS grade and updates stability.
 * Uses a neutral retrievability of 0.9 for the FSRS update.
 *
 * @param currentStability Current stability in days
 * @param retrievalSuccess Whether recall succeeded
 * @param emotionalMultiplier Optional multiplier (applied on success)
 */
export function updateStabilityCompat(
  currentStability: number,
  retrievalSuccess: boolean,
  emotionalMultiplier = 1.0
): number {
  const now = new Date();
  const intervalDays = -currentStability * Math.log(TARGET_RETENTION);
  const state: FSRSState = {
    difficulty: 5,
    stability: Math.max(MIN_STABILITY, currentStability),
    nextReview: new Date(now.getTime() + intervalDays * MS_PER_DAY),
  };

  if (retrievalSuccess) {
    const updated = updateAfterRecall(state, 4, 0.9, now);
    return Math.max(MIN_STABILITY, updated.stability * Math.max(1.0, emotionalMultiplier));
  } else {
    const updated = updateAfterForgot(state, 0.9, now);
    return Math.max(MIN_STABILITY, updated.stability);
  }
}

/**
 * Drop-in replacement for Ebbinghaus calculateRetention (returns R only).
 *
 * @param lastAccess        When the fact was last accessed
 * @param stability         Current stability in days
 * @param emotionalMultiplier Optional multiplier (boosts effective stability)
 */
export function getRetentionProbabilityCompat(
  lastAccess: Date,
  stability: number,
  emotionalMultiplier = 1.0
): number {
  const effectiveStability = Math.max(MIN_STABILITY, stability * Math.max(1.0, emotionalMultiplier));
  const now = new Date();
  const t = Math.max(0, (now.getTime() - lastAccess.getTime()) / MS_PER_DAY);
  return Math.max(0, Math.min(1, Math.exp(-t / effectiveStability)));
}
