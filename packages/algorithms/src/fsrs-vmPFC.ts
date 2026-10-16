/**
 * vmPFC Prediction-Error Coupled FSRS
 *
 * Adds a KG-derived prediction-error signal to FSRS-style interval scheduling. The
 * module computes its own interval adjustment; it does not call ./fsrs.
 *
 * The prediction-error coupling is this project's own construction. Earlier versions
 * attributed it to Zou et al. (2025, Cell Reports 44(2), 115232); that work contains no
 * prediction-error signal, and the published correction notice withdraws the attribution
 * (doi:10.5281/zenodo.22831087, section 8).
 *
 * Couples FSRS interval scheduling with a KG-derived prediction error signal.
 * Low PE at review = extend interval (no re-encoding benefit).
 * High PE at review = shorten interval (ideal re-encoding window).
 *
 */

export interface VmPFCConfig {
  /** PE threshold where re-encoding benefit transitions (sigmoid center) */
  REENCODING_THRESHOLD: number;
  /** Strength of interval adaptation [0, 1] */
  ADAPTATION_STRENGTH: number;
  /** Maximum extension factor (interval * MAX_EXTENSION) */
  MAX_EXTENSION: number;
  /** Minimum shortening factor (interval * MIN_SHORTENING) */
  MIN_SHORTENING: number;
}

export const VMPFC_DEFAULTS: VmPFCConfig = {
  REENCODING_THRESHOLD: 0.5,
  ADAPTATION_STRENGTH: 0.6,
  MAX_EXTENSION: 2.0,
  MIN_SHORTENING: 0.3,
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Compute prediction error between past and current KG context.
 * Uses cosine distance of entity embeddings.
 * High distance = high PE = context changed = re-encoding opportunity.
 */
export function computeKGPredictionError(
  embeddingAtLastReview: number[],
  currentEmbedding: number[],
): number {
  if (embeddingAtLastReview.length !== currentEmbedding.length) {
    throw new Error('Embedding dimensions must match');
  }

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < embeddingAtLastReview.length; i++) {
    dot += embeddingAtLastReview[i] * currentEmbedding[i];
    normA += embeddingAtLastReview[i] ** 2;
    normB += currentEmbedding[i] ** 2;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  const cosineSimilarity = dot / denom;
  // Cosine distance: 0 = identical, 1 = orthogonal, clamped to [0, 1]
  return Math.max(0, Math.min(1, 1 - cosineSimilarity));
}

/**
 * Re-encoding factor: sigmoid of (PE - threshold), scaled to [0, 1].
 * At threshold: factor = 0.5 (neutral).
 * Above threshold: factor > 0.5 (shorten interval, good learning moment).
 * Below threshold: factor < 0.5 (extend interval, too early for re-encoding).
 */
export function computeReEncodingFactor(
  predictionError: number,
  config: VmPFCConfig = VMPFC_DEFAULTS,
): number {
  // Scale sigmoid input so transition is smooth over [0, 1] PE range
  const scaledInput = (predictionError - config.REENCODING_THRESHOLD) * 6;
  return sigmoid(scaledInput);
}

/**
 * Compute adaptive FSRS interval based on vmPFC prediction error.
 *
 * Formula: interval_new = interval_base * (1 + (0.5 - reEncodingFactor) * strength)
 * - reEncodingFactor > 0.5 → shorten (PE high, ideal learning moment)
 * - reEncodingFactor < 0.5 → extend (PE low, no re-encoding benefit)
 * - reEncodingFactor ≈ 0.5 → keep base interval
 */
export function computeAdaptiveFSRSInterval(
  baseInterval: number,
  kgPredictionError: number,
  config: VmPFCConfig = VMPFC_DEFAULTS,
): number {
  const reEncodingFactor = computeReEncodingFactor(kgPredictionError, config);
  const adaptationMultiplier = 1 + (0.5 - reEncodingFactor) * config.ADAPTATION_STRENGTH;

  // Clamp to safety bounds
  const clampedMultiplier = Math.max(
    config.MIN_SHORTENING,
    Math.min(config.MAX_EXTENSION, adaptationMultiplier),
  );

  return Math.max(0.1, baseInterval * clampedMultiplier);
}

// ===========================================
// Natural recall -> FSRS coupling
// ===========================================

/**
 * Record that a fact was naturally recalled during conversation.
 * This event can be fed into the FSRS scheduler to reset/extend
 * review intervals — a natural recall is equivalent to a successful review.
 *
 * Grade scale: 1 (barely recalled) to 5 (instant, effortless).
 * Default grade 4 = "Good" (recalled without difficulty).
 * Pass `enabled: false` to switch the coupling off (it then returns null).
 */
export function recordNaturalRecall(
  factId: string,
  grade: number = 4,
  enabled: boolean = true,
): { factId: string; grade: number; recordedAt: Date } | null {
  if (!enabled) return null;
  return { factId, grade, recordedAt: new Date() };
}
