/**
 * Simulation-Selection Sleep Consolidation Loop
 *
 * NeurIPS Algorithm C — NOT yet published in @zensation/algorithms.
 * Extends the basic sleep consolidation from @zensation/algorithms/sleep-consolidation
 * with a novel two-stage offline RL model for replay selection.
 *
 * Note: @zensation/algorithms provides selectForReplay/simulateReplay/pruneWeakConnections
 * which implement the Stickgold & Walker (2013) basic replay model. This file
 * adds the RL-based simulation-selection extension with counterfactual paths.
 *
 * Based on: "Memory consolidation from a reinforcement learning perspective"
 * (Frontiers in Computational Neuroscience, 2025)
 *
 * Two-stage offline RL model:
 * Stage 1 (CA3-analog): Generate diverse replay candidates from episodic buffer,
 *   including counterfactual extrapolations of failed episodes
 * Stage 2 (CA1-analog): Score candidates by TD-value, strengthen high-value
 *   replays (LTP), decay low-value replays (LTD)
 *
 * Production callsite: backend/src/services/memory/sleep-compute.ts
 */

import { type AblationRegistry, PMA_FEATURES } from './ablation';

export interface ReplayCandidate {
  id: string;
  content: string;
  tdError: number;
  reward: number;
  source: 'real' | 'counterfactual';
  relatedEntityIds: string[];
  /** PMA 4.8.4: Emotional valence (-1 to +1) */
  emotionalValence?: number;
  /** PMA 4.8.4: Emotional arousal (0 to 1) */
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
  /** PMA 4.8.4: Emotional replay weight */
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
 * PMA 4.8.4: Extended with emotional replay weighting (delta term).
 * When PMA NEUROMODULATOR_ENGINE is disabled, uses the original 3-term formula
 * (alpha=0.40, beta=0.35, gamma=0.25) without the emotional term.
 */
export function computeTagScore(
  candidate: ReplayCandidate,
  config: SleepConfig = SLEEP_DEFAULTS,
  ablationRegistry?: AblationRegistry,
): number {
  const novelty = computeNovelty(candidate);
  const pmaEnabled = ablationRegistry?.isEnabled(PMA_FEATURES.NEUROMODULATOR_ENGINE) ?? true;
  if (!pmaEnabled) {
    // Original pre-PMA formula (α=0.40, β=0.35, γ=0.25, no emotional term)
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
 * Stage 2 (CA1-analog): Score a candidate by its TD value using the TAG formula.
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
