/**
 * Bayesian Confidence Propagation — Pure Computation
 *
 * Propagates confidence scores through a knowledge graph via entity
 * relations. Each relation type has a propagation factor that determines
 * how much the source confidence influences the target confidence.
 *
 * This module contains ONLY the pure propagation formula.
 * Database operations and batch iteration are left to the consuming application.
 *
 * @packageDocumentation
 * @module @zensation/algorithms/bayesian
 */

import type { Logger } from './types';
import { noopLogger } from './types';

// ============================================================
// Constants
// ============================================================

/** Propagation factors by relation type */
export const PROPAGATION_FACTORS: Record<string, number> = {
  supports: 1.0,     // Full positive propagation
  contradicts: -1.0,  // Full negative propagation
  causes: 0.8,       // Strong causal link
  requires: 0.6,     // Moderate prerequisite link
  part_of: 0.3,      // Weak structural link
  similar_to: 0.2,   // Minimal similarity link
  created_by: 0.0,   // No epistemic propagation
  used_by: 0.0,      // No epistemic propagation
};

/** Damping factor for blending new values with previous ones */
export const DAMPING = 0.7;

/** Maximum propagation iterations before stopping */
export const MAX_ITERATIONS = 3;

/** Minimum change threshold — updates smaller than this are skipped */
export const CHANGE_THRESHOLD = 0.01;

// ============================================================
// Pure propagation formula
// ============================================================

/**
 * Compute the new propagated confidence for a single directed edge.
 *
 * For positive relations (supports, causes, requires, etc.):
 *   result = base + factor * weight * source * (1 - base)
 *
 * For negative relations (contradicts):
 *   result = base * (1 - |factor| * weight * source)
 *
 * For non-epistemic relations (created_by, used_by):
 *   result = base (no change)
 *
 * @param baseConfidence   - Current confidence of the target fact (0–1)
 * @param sourceConfidence - Confidence of the source fact (0–1)
 * @param edgeWeight       - Strength of the relation edge (0–1)
 * @param relationType     - One of the relation types in PROPAGATION_FACTORS
 * @param logger           - Optional logger for debug output
 * @returns New propagated confidence clamped to [0, 1]
 */
export function propagateForRelation(
  baseConfidence: number,
  sourceConfidence: number,
  edgeWeight: number,
  relationType: string,
  logger?: Logger,
): number {
  const factor = PROPAGATION_FACTORS[relationType] ?? 0;

  // Non-epistemic relation: no change
  if (factor === 0) {
    return baseConfidence;
  }

  let result: number;

  if (factor > 0) {
    // Positive reinforcement: Bayesian-style update toward 1
    result = baseConfidence + factor * edgeWeight * sourceConfidence * (1 - baseConfidence);
  } else {
    // Negative influence: reduce confidence proportionally
    result = baseConfidence * (1 - Math.abs(factor) * edgeWeight * sourceConfidence);
  }

  // Clamp to [0, 1]
  result = Math.max(0, Math.min(1, result));
  (logger ?? noopLogger).debug?.('Bayesian propagation', { baseConfidence, sourceConfidence, edgeWeight, relationType, result });
  return result;
}

/**
 * Apply damping to blend a new computed value with the previous value.
 *
 * Formula: damped = DAMPING * newValue + (1 - DAMPING) * previousValue
 *
 * @param newValue - Freshly computed propagated confidence
 * @param previousValue - Previous propagated confidence (or base confidence if null)
 * @param logger - Optional logger for debug output
 * @returns Damped confidence value clamped to [0, 1]
 */
export function applyDamping(newValue: number, previousValue: number, logger?: Logger): number {
  const result = Math.max(0, Math.min(1, DAMPING * newValue + (1 - DAMPING) * previousValue));
  (logger ?? noopLogger).debug?.('Bayesian damping', { newValue, previousValue, damped: result });
  return result;
}

/**
 * Check whether a confidence change is significant enough to persist.
 *
 * @param newValue - New computed value
 * @param previousValue - Previous value
 * @returns true if the change exceeds CHANGE_THRESHOLD
 */
export function isSignificantChange(newValue: number, previousValue: number): boolean {
  return Math.abs(newValue - previousValue) > CHANGE_THRESHOLD;
}
