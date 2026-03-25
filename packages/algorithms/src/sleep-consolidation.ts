/**
 * Sleep Consolidation — Memory replay simulation
 *
 * Simulates the memory consolidation that occurs during sleep.
 * During slow-wave sleep, the hippocampus replays recent experiences,
 * strengthening important memories and pruning weak connections.
 *
 * Scientific basis:
 * - Stickgold & Walker (2013): Memory replay during sleep
 * - Born & Wilhelm (2012): Slow-wave sleep consolidates declarative memory
 * - Diekelmann & Born (2010): Sleep selectively strengthens emotional memories
 *
 * @packageDocumentation
 * @module @zensation/algorithms/sleep-consolidation
 */
import type { Logger } from './types';
import { noopLogger } from './types';

const MS_PER_DAY = 86_400_000;

export const SLEEP_CONSOLIDATION_CONFIG = {
  /** Stability multiplier per replay cycle (default: 1.5 = 50% boost). */
  REPLAY_STRENGTH_MULTIPLIER: 1.5,
  /** Weight given to emotional memories in selection (default: 0.3). */
  EMOTIONAL_BIAS_WEIGHT: 0.3,
  /** Maximum memories replayed per cycle (default: 20). */
  MAX_REPLAYS_PER_CYCLE: 20,
  /** Edge weight threshold below which connections are pruned (default: 0.2). */
  WEAK_CONNECTION_THRESHOLD: 0.2,
  /** Maximum stability after replay (365 days = 1 year). */
  MAX_STABILITY: 365,
  /** Additional emotional bonus multiplier for high-emotion memories. */
  EMOTIONAL_BONUS: 1.2,
  /** Edge strengthening factor during replay. */
  EDGE_STRENGTHEN_FACTOR: 1.1,
  /** Maximum edge weight. */
  MAX_EDGE_WEIGHT: 10.0,
} as const;

export interface SleepConsolidationConfig {
  replayStrengthMultiplier?: number;
  emotionalBiasWeight?: number;
  maxReplaysPerCycle?: number;
  weakConnectionThreshold?: number;
}

export interface MemoryForConsolidation {
  id: string;
  content: string;
  accessCount: number;
  emotionalWeight: number;
  lastAccessed: Date;
  stability: number;
  hebbianEdges?: Array<{ targetId: string; weight: number }>;
}

export interface ReplayedMemory {
  id: string;
  stabilityBefore: number;
  stabilityAfter: number;
  emotionalBoost: boolean;
}

export interface StrengthenedEdge {
  sourceId: string;
  targetId: string;
  weightBefore: number;
  weightAfter: number;
}

export interface PrunedEdge {
  sourceId: string;
  targetId: string;
  weight: number;
}

export interface ConsolidationResult {
  replayed: ReplayedMemory[];
  strengthened: StrengthenedEdge[];
  pruned: PrunedEdge[];
  summary: {
    totalReplayed: number;
    totalStrengthened: number;
    totalPruned: number;
    avgStabilityIncrease: number;
  };
}

/**
 * Select memories for replay based on priority scoring.
 *
 * Priority Score = accessCount * 0.3 + emotionalWeight * 0.3 + recency * 0.2 + instability * 0.2
 *
 * Emotional and frequently-accessed memories are prioritized, matching
 * the brain's preferential consolidation of salient experiences during sleep.
 *
 * @param memories - Candidate memories for consolidation
 * @param config - Optional configuration overrides
 * @param logger - Optional logger for debugging
 * @returns Selected memories sorted by priority (highest first)
 */
export function selectForReplay(
  memories: MemoryForConsolidation[],
  config?: SleepConsolidationConfig,
  logger?: Logger,
): MemoryForConsolidation[] {
  const log = logger ?? noopLogger;
  const maxReplays = config?.maxReplaysPerCycle ?? SLEEP_CONSOLIDATION_CONFIG.MAX_REPLAYS_PER_CYCLE;
  const emotionalBias = config?.emotionalBiasWeight ?? SLEEP_CONSOLIDATION_CONFIG.EMOTIONAL_BIAS_WEIGHT;

  if (memories.length === 0) {
    log.debug?.('No memories to replay');
    return [];
  }

  const now = Date.now();

  // Normalize access counts for scoring
  const maxAccess = Math.max(...memories.map(m => m.accessCount), 1);

  const scored = memories.map(m => {
    const daysSinceAccess = (now - m.lastAccessed.getTime()) / MS_PER_DAY;
    const recency = Math.exp(-daysSinceAccess * 0.1);
    const normalizedAccess = m.accessCount / maxAccess;
    const instability = 1 - Math.min(1, m.stability / SLEEP_CONSOLIDATION_CONFIG.MAX_STABILITY);

    const priority =
      normalizedAccess * 0.3 +
      m.emotionalWeight * emotionalBias +
      recency * 0.2 +
      instability * (0.5 - emotionalBias);

    return { memory: m, priority };
  });

  scored.sort((a, b) => b.priority - a.priority);

  const selected = scored.slice(0, maxReplays).map(s => s.memory);
  log.debug?.(`Selected ${selected.length}/${memories.length} memories for replay`);
  return selected;
}

/**
 * Simulate memory replay during sleep.
 *
 * For each memory:
 * 1. Stability boost: newStability = stability * replayStrengthMultiplier
 * 2. Emotional bonus: if emotionalWeight > 0.5, additional 20% boost
 * 3. Hebbian strengthening: co-activated edges get +10% weight
 * 4. Weak edge pruning: edges below threshold removed (synaptic homeostasis)
 *
 * @param memories - Memories selected for replay (use selectForReplay first)
 * @param config - Optional configuration overrides
 * @param logger - Optional logger for debugging
 * @returns Detailed consolidation results
 */
export function simulateReplay(
  memories: MemoryForConsolidation[],
  config?: SleepConsolidationConfig,
  logger?: Logger,
): ConsolidationResult {
  const log = logger ?? noopLogger;
  const multiplier = config?.replayStrengthMultiplier ?? SLEEP_CONSOLIDATION_CONFIG.REPLAY_STRENGTH_MULTIPLIER;
  const threshold = config?.weakConnectionThreshold ?? SLEEP_CONSOLIDATION_CONFIG.WEAK_CONNECTION_THRESHOLD;

  const replayed: ReplayedMemory[] = [];
  const strengthened: StrengthenedEdge[] = [];
  const pruned: PrunedEdge[] = [];

  for (const memory of memories) {
    const stabilityBefore = memory.stability;
    let newStability = stabilityBefore * multiplier;

    // Emotional bonus: high-emotion memories get extra consolidation
    const emotionalBoost = memory.emotionalWeight > 0.5;
    if (emotionalBoost) {
      newStability *= SLEEP_CONSOLIDATION_CONFIG.EMOTIONAL_BONUS;
    }

    // Cap at max stability (1 year)
    newStability = Math.min(newStability, SLEEP_CONSOLIDATION_CONFIG.MAX_STABILITY);

    replayed.push({
      id: memory.id,
      stabilityBefore,
      stabilityAfter: newStability,
      emotionalBoost,
    });

    // Strengthen Hebbian edges (co-activated during replay)
    if (memory.hebbianEdges) {
      for (const edge of memory.hebbianEdges) {
        if (edge.weight >= threshold) {
          const newWeight = Math.min(
            edge.weight * SLEEP_CONSOLIDATION_CONFIG.EDGE_STRENGTHEN_FACTOR,
            SLEEP_CONSOLIDATION_CONFIG.MAX_EDGE_WEIGHT,
          );
          strengthened.push({
            sourceId: memory.id,
            targetId: edge.targetId,
            weightBefore: edge.weight,
            weightAfter: newWeight,
          });
        } else {
          // Weak edges are pruned (synaptic homeostasis)
          pruned.push({
            sourceId: memory.id,
            targetId: edge.targetId,
            weight: edge.weight,
          });
        }
      }
    }
  }

  const totalStabilityIncrease = replayed.reduce(
    (sum, r) => sum + (r.stabilityAfter - r.stabilityBefore), 0
  );

  const result: ConsolidationResult = {
    replayed,
    strengthened,
    pruned,
    summary: {
      totalReplayed: replayed.length,
      totalStrengthened: strengthened.length,
      totalPruned: pruned.length,
      avgStabilityIncrease: replayed.length > 0 ? totalStabilityIncrease / replayed.length : 0,
    },
  };

  log.debug?.('Sleep consolidation complete', result.summary);
  return result;
}

/**
 * Prune weak connections (synaptic homeostasis hypothesis).
 *
 * During sleep, the brain scales down synaptic strength globally,
 * effectively removing connections that are too weak to maintain.
 * This prevents the nervous system from saturating.
 *
 * Reference: Tononi & Cirelli (2006) — Synaptic Homeostasis Hypothesis
 *
 * @param edges - Array of edges with weight
 * @param threshold - Minimum weight to keep (default: 0.2)
 * @param logger - Optional logger for debugging
 * @returns Object with kept and pruned edge arrays
 */
export function pruneWeakConnections(
  edges: Array<{ sourceId: string; targetId: string; weight: number }>,
  threshold?: number,
  logger?: Logger,
): { kept: typeof edges; pruned: typeof edges } {
  const log = logger ?? noopLogger;
  const cutoff = threshold ?? SLEEP_CONSOLIDATION_CONFIG.WEAK_CONNECTION_THRESHOLD;

  const kept: typeof edges = [];
  const prunedEdges: typeof edges = [];

  for (const edge of edges) {
    if (edge.weight >= cutoff) {
      kept.push(edge);
    } else {
      prunedEdges.push(edge);
    }
  }

  log.debug?.(`Pruned ${prunedEdges.length}/${edges.length} weak connections (threshold: ${cutoff})`);
  return { kept, pruned: prunedEdges };
}
