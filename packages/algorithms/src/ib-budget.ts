/**
 * Context-Adaptive Information Bottleneck Budget
 *
 * Context-aware retention filtering in the spirit of the Information Bottleneck,
 * complementing the sleep consolidation cycle. The two quantities are heuristic
 * stand-ins computed from episode properties (see the estimate functions), not
 * mutual-information estimates.
 *
 * Based on: MemFly (Feb 2026) — "On-the-Fly Memory Optimization via
 * Information Bottleneck"
 *
 * IB criterion: retain episode if relevanceGain * beta > compressionCost
 * where beta varies by context:
 * - finance: 0.8 (retain most)
 * - people: 0.6
 * - operations: 0.4
 * - strategy: 0.3 (compress most)
 * Any other context throws a RangeError.
 */

/** The contexts IB_BETA has a beta for. */
export type IBContext = 'operations' | 'finance' | 'people' | 'strategy';

export const IB_BETA: Record<IBContext, number> = {
  finance: 0.8,
  people: 0.6,
  operations: 0.4,
  strategy: 0.3,
};

export interface IBEpisode {
  id: string;
  compressionCost: number;  // stands in for I(X;Z): cost of retaining the raw information
  relevanceGain: number;    // stands in for I(Z;Y): relevance for downstream tasks
}

/**
 * IB retention criterion: retain if relevanceGain * beta > compressionCost
 */
export function ibShouldRetain(
  compressionCost: number,
  relevanceGain: number,
  context: IBContext,
): boolean {
  return relevanceGain * betaFor(context, 'ibShouldRetain') > compressionCost;
}

function betaFor(context: IBContext, fn: string): number {
  if (!Object.hasOwn(IB_BETA, context)) {
    throw new RangeError(`${fn}: context must be one of ${Object.keys(IB_BETA).join(', ')}, got ${String(context)}`);
  }
  return IB_BETA[context];
}

/**
 * Estimate compression cost from episode properties: a weighted sum of content length,
 * entity count and embedding variance, each normalized to [0, 1]. A heuristic, not an entropy.
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
 * Estimate relevance gain from episode properties: a weighted sum of retrieval count,
 * confidence and recency, each in [0, 1].
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
  context: IBContext,
): IBEpisode[] {
  const beta = betaFor(context, 'ibFilterEpisodes');
  return episodes.filter(e => e.relevanceGain * beta > e.compressionCost);
}
