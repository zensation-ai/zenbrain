/**
 * Hebbian Edge Dynamics — Pure Computation Functions
 *
 * Implements Hebbian learning rules for knowledge graphs.
 * "Neurons that fire together, wire together" — entity co-activation
 * strengthens their connecting edges, while disuse causes decay.
 *
 * This module contains ONLY the pure mathematical functions.
 * Database operations are left to the consuming application.
 *
 * @packageDocumentation
 * @module @zensation/algorithms/hebbian
 */

import type { Logger } from './types';
import { noopLogger } from './types';

// ===========================================
// Configuration
// ===========================================

export const HEBBIAN_CONFIG = {
  /** Rate at which co-activation strengthens an edge. */
  LEARNING_RATE: 0.1,
  /** Hard upper bound for hebbian_weight. */
  MAX_WEIGHT: 10.0,
  /** Fraction by which idle edges decay per batch cycle. */
  DECAY_RATE: 0.02,
  /** Weight floor; edges below this are pruned (reset to NEUTRAL). */
  MIN_WEIGHT: 0.1,
  /** Homeostatic target for the sum of weights in a context. */
  TARGET_SUM: 50.0,
  /** Default weight for edges with no Hebbian history. */
  NEUTRAL_WEIGHT: 1.0,
} as const;

// ===========================================
// Pure computation functions
// ===========================================

/**
 * Asymptotic Hebbian strengthening.
 *
 * Formula: new = old + LR * (1 - old / MAX)
 * Growth diminishes as weight approaches MAX_WEIGHT.
 *
 * @param currentWeight - Current edge weight
 * @param logger - Optional logger for debug output
 * @returns New strengthened weight (capped at MAX_WEIGHT)
 */
export function computeHebbianStrengthening(currentWeight: number, logger?: Logger): number {
  const growth = HEBBIAN_CONFIG.LEARNING_RATE * (1 - currentWeight / HEBBIAN_CONFIG.MAX_WEIGHT);
  const newWeight = currentWeight + Math.max(0, growth);
  (logger ?? noopLogger).debug?.('Hebbian strengthening', { currentWeight, newWeight });
  return Math.min(HEBBIAN_CONFIG.MAX_WEIGHT, newWeight);
}

/**
 * Exponential Hebbian decay.
 *
 * Formula: new = old * (1 - DECAY_RATE)
 * Returns 0 as a pruning signal when the result drops below MIN_WEIGHT.
 *
 * @param currentWeight - Current edge weight
 * @param logger - Optional logger for debug output
 * @returns Decayed weight, or 0 as a pruning signal
 */
export function computeHebbianDecay(currentWeight: number, logger?: Logger): number {
  const decayed = currentWeight * (1 - HEBBIAN_CONFIG.DECAY_RATE);
  (logger ?? noopLogger).debug?.('Hebbian decay', { currentWeight, decayed, pruned: decayed < HEBBIAN_CONFIG.MIN_WEIGHT });
  if (decayed < HEBBIAN_CONFIG.MIN_WEIGHT) {
    return 0; // pruning signal
  }
  return decayed;
}

/**
 * Homeostatic normalization: scale all weights proportionally so their
 * sum equals targetSum. Preserves the ratios between individual weights.
 *
 * Edge cases:
 *  - Empty array → return []
 *  - Near-zero sum → return weights unchanged (cannot scale zeros)
 *
 * @param weights - Array of edge weights
 * @param targetSum - Desired sum of all weights
 * @param logger - Optional logger for debug output
 * @returns Normalized weight array
 */
export function computeHomeostaticNormalization(
  weights: number[],
  targetSum: number,
  logger?: Logger,
): number[] {
  if (weights.length === 0) { return []; }

  const currentSum = weights.reduce((a, b) => a + b, 0);
  const EPSILON = 1e-10;
  if (currentSum < EPSILON) {
    return [...weights];
  }

  const scale = targetSum / currentSum;
  (logger ?? noopLogger).debug?.('Homeostatic normalization', { weightCount: weights.length, currentSum, targetSum, scale });
  return weights.map(w => w * scale);
}

/**
 * Generate all unique pairs from an array (combinations C(n,2), not permutations).
 * Useful for computing co-activation pairs from a set of active entities.
 *
 * @param items - Array of items to pair
 * @returns Array of [item1, item2] tuples
 */
export function generatePairs<T>(items: T[]): [T, T][] {
  const pairs: [T, T][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      pairs.push([items[i], items[j]]);
    }
  }
  return pairs;
}
