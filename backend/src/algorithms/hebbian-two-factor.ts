/**
 * Two-Factor Synaptic Model for Knowledge Graph Edges
 *
 * NeurIPS Algorithm D — NOT yet published in @zensation/algorithms.
 * Extends the basic Hebbian dynamics from @zensation/algorithms/hebbian
 * with a novel two-factor (weight, variance) consolidation model.
 *
 * Based on: Zenke et al. (PNAS 2025) — "Two-factor synaptic consolidation
 * reconciles robustness with plasticity"
 *
 * Each edge carries (weight, variance). Variance decreases with activation
 * frequency (maturation), making mature edges robust against overwriting.
 * This is mathematically equivalent to Elastic Weight Consolidation (EWC)
 * where edge maturity (1/variance) serves as the Fisher Information proxy.
 *
 * Note: The basic Hebbian module in @zensation/algorithms provides simple
 * weight-based operations (strengthening, decay, normalization). This file
 * provides the advanced Two-Factor model with variance tracking and EWC penalty.
 *
 * Production callsite: backend/src/services/memory/sleep-compute.ts
 */

export interface TwoFactorEdge {
  u: string;
  r: string;
  v: string;
  weight: number;
  variance: number;
  activationCount: number;
}

export const TWO_FACTOR_DEFAULTS = {
  INITIAL_WEIGHT: 1.0,
  INITIAL_VARIANCE: 1.0,
  MIN_VARIANCE: 0.01,
  MAX_WEIGHT: 10.0,
  MIN_WEIGHT: 0.05,
  LR_W: 0.1,
  LR_SIGMA: 0.15,
  LAMBDA_EWC: 0.5,
} as const;

export function createTwoFactorEdge(
  u: string,
  r: string,
  v: string,
  initialWeight = TWO_FACTOR_DEFAULTS.INITIAL_WEIGHT,
  initialVariance = TWO_FACTOR_DEFAULTS.INITIAL_VARIANCE,
): TwoFactorEdge {
  return { u, r, v, weight: initialWeight, variance: initialVariance, activationCount: 0 };
}

function normalizeCount(count: number): number {
  // Returns a decreasing factor: large on first activations, small later.
  // Models diminishing plasticity as edges mature (synaptic consolidation).
  return 1 / (1 + count * 0.1);
}

export function hebbianUpdateTwoFactor(
  edge: TwoFactorEdge,
  tagScore: number,
  activationProduct: number,
  config = TWO_FACTOR_DEFAULTS,
  stabilityProtector?: { computeLockScoreFromVariance: (variance: number) => number },
): TwoFactorEdge {
  const newCount = edge.activationCount + 1;
  // PMA: Reduce LR for stable edges (low variance = high lock score)
  const lockScore = stabilityProtector?.computeLockScoreFromVariance(edge.variance) ?? 0;
  const gatedLR = config.LR_W * (1 - 0.5 * lockScore); // Reduce LR by up to 50%
  const rawWeight = edge.weight + gatedLR * tagScore * activationProduct;
  const clampedWeight = Math.max(config.MIN_WEIGHT, Math.min(config.MAX_WEIGHT, rawWeight));
  const maturationRate = config.LR_SIGMA * normalizeCount(newCount);
  const rawVariance = edge.variance * (1 - maturationRate);
  const clampedVariance = Math.max(config.MIN_VARIANCE, rawVariance);
  return { ...edge, weight: clampedWeight, variance: clampedVariance, activationCount: newCount };
}

export function getImportance(edge: TwoFactorEdge): number {
  return 1 / edge.variance;
}

export function computeEWCPenalty(
  edge: TwoFactorEdge,
  proposedWeight: number,
  lambda = TWO_FACTOR_DEFAULTS.LAMBDA_EWC,
): number {
  const importance = getImportance(edge);
  const delta = proposedWeight - edge.weight;
  return (lambda / 2) * importance * delta * delta;
}

export function decayTwoFactor(edge: TwoFactorEdge, baseDecayRate: number): TwoFactorEdge {
  const importance = getImportance(edge);
  const effectiveRate = baseDecayRate / (1 + importance * 0.1);
  const decayedWeight = edge.weight * (1 - effectiveRate);
  return { ...edge, weight: Math.max(TWO_FACTOR_DEFAULTS.MIN_WEIGHT, decayedWeight) };
}

export function fromLegacyEdge(
  u: string,
  r: string,
  v: string,
  weight: number,
  estimatedActivations = 0,
): TwoFactorEdge {
  const estimatedVariance = Math.max(
    TWO_FACTOR_DEFAULTS.MIN_VARIANCE,
    TWO_FACTOR_DEFAULTS.INITIAL_VARIANCE / (1 + weight * 0.5),
  );
  return { u, r, v, weight, variance: estimatedVariance, activationCount: estimatedActivations };
}
