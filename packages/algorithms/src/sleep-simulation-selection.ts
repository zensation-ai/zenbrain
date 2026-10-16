/**
 * Simulation-Selection Sleep Consolidation Loop
 *
 * Complements the basic sleep consolidation of `./sleep-consolidation`
 * (Stickgold & Walker 2013 replay; it does not call it) with a two-stage
 * replay-selection model inspired by offline reinforcement learning.
 *
 * Based on: "Memory consolidation from a reinforcement learning perspective"
 * (Frontiers in Computational Neuroscience, 2025)
 *
 * Stage 1 (CA3-analog): merge the caller's real episodes and counterfactual
 *   paths into one candidate pool. This module does not generate counterfactuals;
 *   `identifyCounterfactualCandidates` only picks the episodes worth extrapolating.
 * Stage 2 (CA1-analog): score each candidate with the TAG score — a weighted sum
 *   of the caller-supplied TD error, reward, novelty and an emotional term (no TD
 *   learning is computed here) — and mark it 'strengthen' (LTP) or 'decay' (LTD).
 *   No candidate is skipped, so `skipped` is always 0.
 */

/**
 * Optional feature-flag injection point for ablation experiments.
 * Pass an object with `isEnabled(featureId)` to switch the emotional replay term
 * off and fall back to the original 3-term tag score.
 *
 * The feature ID is `'pma_neuromodulator_engine'`, kept as it is because it is part
 * of the public API: it names the component that plugs into this hook (the
 * neuromodulator of the Predictive Memory Architecture, which is not in this package).
 */
export interface AblationRegistry {
  isEnabled(featureId: string): boolean;
}

const FEATURE_IDS = {
  EMOTIONAL_REPLAY: 'pma_neuromodulator_engine',
} as const;

export interface ReplayCandidate {
  id: string;
  content: string;
  tdError: number;
  reward: number;
  source: 'real' | 'counterfactual';
  relatedEntityIds: string[];
  /** Emotional valence (-1 to +1), for the emotional replay term */
  emotionalValence?: number;
  /** Emotional arousal (0 to 1), for the emotional replay term */
  emotionalArousal?: number;
}

export interface SelectionResult {
  candidateId: string;
  tdValue: number;
  action: 'strengthen' | 'decay' | 'skip';
  weight: number;
}

export interface SleepCycleResult {
  totalCandidates: number;
  strengthened: number;
  decayed: number;
  skipped: number;
  results: SelectionResult[];
}

export interface SleepConfig {
  alphaTag: number;
  betaTag: number;
  gammaTag: number;
  /** Weight of the emotional replay term */
  deltaTag: number;
  valueThreshold: number;
  decayRate: number;
  maxCounterfactualDepth: number;
  highPEThreshold: number;
  lowRewardThreshold: number;
}

export const SLEEP_DEFAULTS: SleepConfig = {
  alphaTag: 0.34,
  betaTag: 0.30,
  gammaTag: 0.21,
  deltaTag: 0.15,
  valueThreshold: 0.5,
  decayRate: 0.05,
  maxCounterfactualDepth: 3,
  highPEThreshold: 0.6,
  lowRewardThreshold: 0.3,
};

/**
 * Stage 1 (CA3-analog): Combine real episodic memories with counterfactual paths
 * to produce a diverse pool of replay candidates.
 */
export function generateReplayCandidates(
  realEpisodes: ReplayCandidate[],
  counterfactualPaths: ReplayCandidate[],
): ReplayCandidate[] {
  return [...realEpisodes, ...counterfactualPaths];
}

/**
 * Compute novelty as a proxy for information content, based on entity diversity.
 */
function computeNovelty(candidate: ReplayCandidate): number {
  return Math.min(1.0, candidate.relatedEntityIds.length * 0.2);
}

/**
 * Compute the TAG score (TD-tagged replay value):
 *   Tag(e) = alpha * |PE| + beta * R + gamma * N + delta * E
 * where PE = prediction error (tdError), R = reward, N = novelty, E = emotional weight
 *
 * The delta term is the emotional replay weighting. When the feature
 * 'pma_neuromodulator_engine' is disabled, the original 3-term formula is used
 * (alpha=0.40, beta=0.35, gamma=0.25) without the emotional term.
 */
export function computeTagScore(
  candidate: ReplayCandidate,
  config: SleepConfig = SLEEP_DEFAULTS,
  ablationRegistry?: AblationRegistry,
): number {
  const novelty = computeNovelty(candidate);
  const emotionalTermEnabled = ablationRegistry?.isEnabled(FEATURE_IDS.EMOTIONAL_REPLAY) ?? true;
  if (!emotionalTermEnabled) {
    // Original 3-term formula (α=0.40, β=0.35, γ=0.25, no emotional term)
    return 0.40 * Math.abs(candidate.tdError) + 0.35 * candidate.reward + 0.25 * novelty;
  }
  const emotionalWeight = (Math.abs(candidate.emotionalValence ?? 0)) * (candidate.emotionalArousal ?? 0);
  return (
    config.alphaTag * Math.abs(candidate.tdError) +
    config.betaTag * candidate.reward +
    config.gammaTag * novelty +
    (config.deltaTag ?? 0) * emotionalWeight
  );
}

/**
 * Stage 2 (CA1-analog): Score a candidate with the TAG formula. The name says
 * "TD value" for compatibility; no TD learning is computed.
 */
export function scoreByTDValue(
  candidate: ReplayCandidate,
  config: SleepConfig = SLEEP_DEFAULTS,
  ablationRegistry?: AblationRegistry,
): number {
  return computeTagScore(candidate, config, ablationRegistry);
}

/**
 * Stage 2 (CA1-analog): For each candidate, decide to strengthen (LTP) or
 * decay (LTD) based on whether its TD value exceeds the threshold.
 */
export function selectAndApply(
  candidates: ReplayCandidate[],
  config: SleepConfig = SLEEP_DEFAULTS,
  ablationRegistry?: AblationRegistry,
): SelectionResult[] {
  return candidates.map(candidate => {
    const tdValue = scoreByTDValue(candidate, config, ablationRegistry);
    if (tdValue > config.valueThreshold) {
      return {
        candidateId: candidate.id,
        tdValue,
        action: 'strengthen' as const,
        weight: tdValue,
      };
    } else {
      return {
        candidateId: candidate.id,
        tdValue,
        action: 'decay' as const,
        weight: config.decayRate,
      };
    }
  });
}

/**
 * Run a full simulation-selection sleep cycle:
 * 1. Generate candidate pool (real + counterfactual)
 * 2. Score and select by TD value
 * 3. Return aggregate statistics
 */
export function runSimulationSelectionCycle(
  realEpisodes: ReplayCandidate[],
  counterfactualPaths: ReplayCandidate[],
  config: SleepConfig = SLEEP_DEFAULTS,
  ablationRegistry?: AblationRegistry,
): SleepCycleResult {
  const candidates = generateReplayCandidates(realEpisodes, counterfactualPaths);
  const results = selectAndApply(candidates, config, ablationRegistry);

  return {
    totalCandidates: candidates.length,
    strengthened: results.filter(r => r.action === 'strengthen').length,
    decayed: results.filter(r => r.action === 'decay').length,
    skipped: results.filter(r => r.action === 'skip').length,
    results,
  };
}

/**
 * Identify episodes that are candidates for counterfactual generation:
 * high prediction error (surprise) but low reward (failure).
 * These represent learning opportunities where an alternative path might help.
 */
export function identifyCounterfactualCandidates(
  episodes: ReplayCandidate[],
  config: SleepConfig = SLEEP_DEFAULTS,
): ReplayCandidate[] {
  return episodes.filter(
    e => e.tdError > config.highPEThreshold && e.reward < config.lowRewardThreshold,
  );
}
