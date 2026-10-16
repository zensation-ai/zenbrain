/**
 * Uncertainty bands for two probabilistic memory outputs
 *
 * Heuristic bands, not calibrated confidence intervals: one for retrievability
 * (a Wald-type interval that treats the model's R like a rate observed over
 * the review count) and one for Bayesian-style propagation (the band widens
 * by a fixed rule per hop). More reviews → narrower band; few reviews → wide.
 *
 * @packageDocumentation
 * @module @zensation/algorithms/intervals
 */

export interface ConfidenceInterval {
  /** Point estimate (most likely value) */
  point: number;
  /** Lower bound of the band */
  lower: number;
  /** Upper bound of the band */
  upper: number;
}

/**
 * Calculate retrievability with a Wald-type band.
 * The width narrows with more reviews. It is nominally 95 % (z = 1.96), but R is a
 * model output, not a rate observed in reviewCount trials, so the coverage is not
 * calibrated; at R = 0 or 1 the band has zero width.
 *
 * Formula: band = point ± 1.96 * sqrt(R * (1-R) / max(reviewCount, 1))
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
 * Calculate confidence propagation with an uncertainty band.
 * The band widens by a heuristic rule (×1.1 plus 0.05 × edge weight per hop);
 * it has no coverage level.
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
