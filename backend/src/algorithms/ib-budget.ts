/**
 * Context-Adaptive Information Bottleneck Budget
 *
 * NeurIPS Algorithm F — NOT yet published in @zensation/algorithms.
 * Provides context-aware memory retention filtering using Information
 * Bottleneck theory, complementing the sleep consolidation cycle.
 *
 * Based on: MemFly (Feb 2026) — "On-the-Fly Memory Optimization via
 * Information Bottleneck"
 *
 * IB criterion: retain episode if relevanceGain * beta > compressionCost
 * where beta varies by context:
 * - work: 0.8 (high relevance retention)
 * - learning: 0.6 (balance: compression creates abstraction)
 * - personal: 0.4 (forgetting irrelevant is desired)
 * - creative: 0.3 (maximum compression to concepts)
 *
 * Production callsite: backend/src/services/memory/sleep-compute.ts
 */

type ContextType = 'operations' | 'finance' | 'people' | 'strategy';

export const IB_BETA: Record<ContextType, number> = {
  finance: 0.8,
  people: 0.6,
  operations: 0.4,
  strategy: 0.3,
};

export interface IBEpisode {
  id: string;
  compressionCost: number;  // I(X;Z): cost of retaining raw information
  relevanceGain: number;    // I(Z;Y): downstream task relevance
}

/**
 * IB retention criterion: retain if relevanceGain * beta > compressionCost
 */
export function ibShouldRetain(
  compressionCost: number,
  relevanceGain: number,
  context: ContextType,
): boolean {
  const beta = IB_BETA[context];
  return relevanceGain * beta > compressionCost;
}

/**
 * Estimate compression cost from episode properties.
 * Higher entropy content = higher compression cost.
 */
export function estimateCompressionCost(
  contentLength: number,
  uniqueEntityCount: number,
  embeddingVariance: number,
): number {
  // Normalized to [0, 1]
  const lengthCost = Math.min(1, contentLength / 5000);
  const entityCost = Math.min(1, uniqueEntityCount / 20);
  const varianceCost = Math.min(1, embeddingVariance);
  return 0.4 * lengthCost + 0.3 * entityCost + 0.3 * varianceCost;
}

/**
 * Estimate relevance gain from episode properties.
 * High retrieval frequency + high confidence = high relevance.
 */
export function estimateRelevanceGain(
  retrievalCount: number,
  avgConfidence: number,
  recency: number, // days since last access, lower = more relevant
): number {
  const retrievalScore = Math.min(1, retrievalCount / 10);
  const recencyScore = Math.max(0, 1 - recency / 90);
  return 0.4 * retrievalScore + 0.3 * avgConfidence + 0.3 * recencyScore;
}

/**
 * Filter episodes through IB criterion for a given context.
 */
export function ibFilterEpisodes(
  episodes: IBEpisode[],
  context: ContextType,
): IBEpisode[] {
  return episodes.filter(e => ibShouldRetain(e.compressionCost, e.relevanceGain, context));
}
