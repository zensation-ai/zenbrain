/**
 * Confidence Intervals for Probabilistic Memory Outputs
 *
 * Provides uncertainty bounds for all probabilistic estimates.
 * More reviews → narrower intervals. Few reviews → wide intervals (high uncertainty).
 *
 * @packageDocumentation
 * @module @zensation/algorithms/intervals
 */

export interface ConfidenceInterval {
  /** Point estimate (most likely value) */
  point: number;
  /** 95% CI lower bound */
  lower: number;
  /** 95% CI upper bound */
  upper: number;
}

/**
 * Calculate retrievability with confidence interval.
 * CI width narrows with more reviews (Central Limit Theorem).
 *
 * Formula: CI = point ± 1.96 * sqrt(R * (1-R) / max(reviewCount, 1))
 */
export function getRetrievabilityWithCI(
  retrievability: number,
  reviewCount: number,
): ConfidenceInterval {
  const R = Math.max(0, Math.min(1, retrievability));
  const n = Math.max(1, reviewCount);
  const se = Math.sqrt((R * (1 - R)) / n);
  const margin = 1.96 * se;
  return {
    point: R,
    lower: Math.max(0, R - margin),
    upper: Math.min(1, R + margin),
  };
}

/**
 * Calculate confidence propagation with uncertainty.
 */
export function propagateWithCI(
  base: ConfidenceInterval,
  sourceConfidence: number,
  edgeWeight: number,
  factor: number,
): ConfidenceInterval {
  // Propagate point estimate
  let point: number;
  if (factor > 0) {
    point = base.point + factor * edgeWeight * sourceConfidence * (1 - base.point);
  } else {
    point = base.point * (1 - Math.abs(factor) * edgeWeight * sourceConfidence);
  }
  point = Math.max(0, Math.min(1, point));

  // Uncertainty grows with propagation
  const uncertaintyGrowth = 1.1; // 10% uncertainty increase per hop
  const baseWidth = base.upper - base.lower;
  const newWidth = Math.min(1.0, baseWidth * uncertaintyGrowth + edgeWeight * 0.05);

  return {
    point,
    lower: Math.max(0, point - newWidth / 2),
    upper: Math.min(1, point + newWidth / 2),
  };
}
