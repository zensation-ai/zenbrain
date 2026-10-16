/**
 * Titans Surprise-Gradient Memory Updates.
 *
 * Based on: Titans (Behrouz et al. 2025, arXiv:2501.00663), with the
 * free-energy reading of surprise as a motivation. No gradient and no
 * free-energy term is computed here; see "Why pure-algorithm here".
 *
 * The idea
 * --------
 * Titans (Behrouz et al. 2025) treats long-term memory as a learnable
 * module whose embedding update at each step is the negative gradient
 * of a per-step prediction loss:
 *
 *     δ = -∇L(memory.predict(next_token) | context)
 *
 * Each memory carries a small running scalar `vfe_delta` ∈ [-1, 1]
 * that summarises how much surprise the memory has been associated
 * with over time. Two readouts use it:
 *
 *   - **Retrieval boost**: surprising memories rank higher for queries
 *     that share their context — they contain information the model
 *     can't trivially predict, which by FSRS-vmPFC-style logic is
 *     exactly what's worth retrieving. Score = base × (1 + α · δ).
 *
 *   - **Encoding-time FSRS-interval shrink**: a memory whose vfe_delta
 *     is high (lots of accumulated surprise) should be reviewed sooner.
 *     interval = base × (1 - β · |δ|).  This couples Titans-style
 *     surprise with the prediction-error coupling of `./fsrs-vmPFC`.
 *
 * Why pure-algorithm here
 * -----------------------
 * We don't have access to backbone-model gradients from the backend.
 * What we DO have:
 *
 *   - Prediction-error magnitudes from the caller's own pipeline (in the
 *     ZenAI platform, its neuromodulator component, which is not part of
 *     this package). When a memory was retrieved and the downstream
 *     answer didn't match the gold (or the agent's own confidence-
 *     calibration says "I was wrong"), that's an observable surprise.
 *   - Reactivation events with their own prior-vs-actual deltas.
 *
 * This module computes and updates `vfe_delta` from those observable
 * signals via an exponential moving average (EMA) with bounded magnitude. The
 * algorithm is a pure function — caller composes with their own
 * prediction-error feed.
 *
 * Bounded magnitude: `updateVFEDelta` keeps `vfe_delta` in [-1, 1] by
 * default, and `applyVFERetrievalBoost` clamps the delta it is given to
 * [-1, 1], so the boost (multiplied by `α = 0.10`) never moves a base
 * score by more than ±10 %. This prevents one anomalous high-surprise
 * event from blowing a memory's rank — the EMA smooths it out.
 *
 * @module algorithms/surprise-gradient-memory
 */

// ===========================================================================
// Types
// ===========================================================================

/** A single observation feeding the EMA update. */
export interface SurpriseObservation {
  /** Observed prediction error magnitude in [0, ∞), for example
   *  `|p_observed - p_expected|` from the caller's retrieval pipeline. */
  predictionError: number;
  /** Caller's confidence at prediction time in [0, 1]. High confidence
   *  + high error = strong surprise (the memory was confidently wrong).
   *  Low confidence + same error = weaker surprise (the memory was
   *  hedging). Default 1.0 (treat all error as fully-confident). */
  confidence?: number;
  /** Sign of the contribution: +1 counts the surprise as informative
   *  (pushes delta toward +1, which raises retrieval rank), -1 marks
   *  the memory as misleading (pushes delta toward -1, which lowers
   *  it), 0 contributes nothing (the EMA only decays delta toward 0).
   *  Default +1. */
  signHint?: -1 | 0 | 1;
}

export interface VFEUpdateOptions {
  /** EMA learning rate in (0, 1]. Default 0.10 — the new observation
   *  contributes 10 % to the running estimate, the old estimate keeps
   *  90 %. Higher = faster adaptation, more noise. */
  learningRate?: number;
  /** Magnitude clamp for the resulting delta. Default 1 (matches
   *  spec). Lower to reduce the maximum possible retrieval boost. */
  maxMagnitude?: number;
  /** Normaliser for the raw prediction error. Errors above this are
   *  treated as fully-saturated. Default 1.0 — caller is responsible
   *  for scaling errors into [0, 1] beforehand if a different scale
   *  is needed. */
  errorScale?: number;
}

export interface RetrievalBoostOptions {
  /** Coefficient on `vfe_delta` in the retrieval boost. Default 0.10.
   *  A caller can set it per context (e.g. 0.05 for `finance`, where
   *  stability matters more than novelty). The boost is at most ±alpha. */
  alpha?: number;
}

export interface EncodingIntervalOptions {
  /** Coefficient on `|vfe_delta|` in the interval shrink. Default 0.20.
   *  Higher = surprising memories reviewed faster. */
  beta?: number;
  /** Hard floor on the resulting interval as a fraction of the input
   *  interval. Default 0.20 — even maximally-surprising memories keep
   *  at least 20 % of the FSRS-base interval (avoids review-storm). */
  intervalFloor?: number;
}

// ===========================================================================
// Defaults
// ===========================================================================

const DEFAULT_LEARNING_RATE = 0.10;
const DEFAULT_MAX_MAGNITUDE = 1.0;
const DEFAULT_ERROR_SCALE = 1.0;
const DEFAULT_ALPHA = 0.10;
const DEFAULT_BETA = 0.20;
const DEFAULT_INTERVAL_FLOOR = 0.20;

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Compute the raw VFE-delta contribution for a single observation.
 *
 * Maps `(predictionError, confidence, signHint)` → signed delta in
 * [-1, 1] without touching any persistent state. Used by
 * `updateVFEDelta` internally and exported for callers that want the
 * raw signal (e.g. for logging the per-observation contribution).
 *
 * Mapping:
 *   normalised_error = clamp(predictionError / errorScale, 0, 1)
 *   magnitude        = normalised_error × confidence
 *   sign             = signHint when supplied; else +1 (positive
 *                      surprise — memory was retrieved but the
 *                      observed token didn't match the prediction)
 *
 * Output: sign × magnitude.
 */
export function computeVFEContribution(
  observation: SurpriseObservation,
  options: { errorScale?: number } = {},
): number {
  const errorScale = options.errorScale ?? DEFAULT_ERROR_SCALE;
  if (errorScale <= 0) {
    throw new Error(
      `computeVFEContribution: errorScale must be > 0; got ${errorScale}`,
    );
  }
  const rawError = Math.max(0, Number.isFinite(observation.predictionError)
    ? observation.predictionError
    : 0);
  const normalised = clamp(rawError / errorScale, 0, 1);
  const confidence = clamp(observation.confidence ?? 1, 0, 1);
  const magnitude = normalised * confidence;
  const sign = observation.signHint ?? 1;
  return sign * magnitude;
}

/**
 * Update a memory's running `vfe_delta` with a new observation.
 *
 * EMA: delta_new = (1 - lr) × delta_old + lr × contribution
 *
 * Bounded to [-maxMagnitude, +maxMagnitude] so anomalous spikes
 * don't blow a memory's retrieval rank.
 *
 * Pure function. Same input → same output.
 */
export function updateVFEDelta(
  currentDelta: number,
  observation: SurpriseObservation,
  options: VFEUpdateOptions = {},
): number {
  const lr = options.learningRate ?? DEFAULT_LEARNING_RATE;
  if (lr <= 0 || lr > 1) {
    throw new Error(
      `updateVFEDelta: learningRate must be in (0, 1]; got ${lr}`,
    );
  }
  const maxMag = options.maxMagnitude ?? DEFAULT_MAX_MAGNITUDE;
  if (maxMag <= 0) {
    throw new Error(
      `updateVFEDelta: maxMagnitude must be > 0; got ${maxMag}`,
    );
  }
  const safeOld = Number.isFinite(currentDelta) ? currentDelta : 0;
  const contribution = computeVFEContribution(observation, {
    errorScale: options.errorScale,
  });
  const fresh = (1 - lr) * safeOld + lr * contribution;
  return clamp(fresh, -maxMag, maxMag);
}

/**
 * Batch-update a list of memories from a parallel observation array.
 *
 * Convenience for callers that want to apply one observation per
 * memory in a single pass. Order-preserving — the i-th output is the
 * updated delta for the i-th input memory.
 *
 * Throws when input lengths differ.
 */
export function batchUpdateVFEDeltas(
  currentDeltas: ReadonlyArray<number>,
  observations: ReadonlyArray<SurpriseObservation>,
  options: VFEUpdateOptions = {},
): number[] {
  if (currentDeltas.length !== observations.length) {
    throw new Error(
      `batchUpdateVFEDeltas: length mismatch — ` +
      `${currentDeltas.length} deltas vs ${observations.length} observations`,
    );
  }
  const out = new Array<number>(currentDeltas.length);
  for (let i = 0; i < currentDeltas.length; i++) {
    out[i] = updateVFEDelta(currentDeltas[i], observations[i], options);
  }
  return out;
}

/**
 * Apply Titans retrieval-time boost: `score × (1 + α · vfe_delta)`.
 *
 * Pure function — caller passes in the base score and the memory's
 * stored delta, gets back the boosted score. A reranker can loop over
 * results and apply it per row. The delta is clamped to [-1, 1] first,
 * so the score moves by at most ±α (±10 % by default).
 *
 * Note: a NEGATIVE delta REDUCES the score (the memory has a record
 * of being misleading). This is the right direction — anti-helpful
 * memories deserve less retrieval mass.
 */
export function applyVFERetrievalBoost(
  baseScore: number,
  vfeDelta: number,
  options: RetrievalBoostOptions = {},
): number {
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  const safeDelta = clamp(Number.isFinite(vfeDelta) ? vfeDelta : 0, -1, 1);
  const boosted = baseScore * (1 + alpha * safeDelta);
  // Don't let the boost flip the sign of the score — clamp at 0 from
  // below. (A baseScore of 0 with negative delta would otherwise stay
  // 0, which is fine; a positive baseScore with strong negative delta
  // could go negative under extreme α — guard against it.)
  return Math.max(0, boosted);
}

/**
 * Apply Titans encoding-time FSRS-interval shrink:
 * `interval × (1 - β · |vfe_delta|)`.
 *
 * High |delta| (lots of surprise associated with this memory) →
 * shorter review interval. The magnitude is what matters here, not
 * the sign — both confidently-wrong memories AND confidently-right-
 * but-surprising memories deserve faster review. Floor at
 * `intervalFloor × baseInterval` to avoid pathological review storms.
 *
 * Returns the modified interval (same units as input).
 */
export function applyVFEIntervalShrink(
  baseInterval: number,
  vfeDelta: number,
  options: EncodingIntervalOptions = {},
): number {
  const beta = options.beta ?? DEFAULT_BETA;
  const floor = options.intervalFloor ?? DEFAULT_INTERVAL_FLOOR;
  if (baseInterval <= 0) return 0;
  const safeDelta = Number.isFinite(vfeDelta) ? vfeDelta : 0;
  const shrink = 1 - beta * Math.abs(safeDelta);
  return baseInterval * Math.max(floor, shrink);
}

// ===========================================================================
// Helpers
// ===========================================================================

function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}
