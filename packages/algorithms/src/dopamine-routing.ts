/**
 * Dopamine-inspired retrieval routing.
 *
 * Inspired by D-MEM (Song & Xin 2026, "D-MEM: Dopamine-Gated Agentic Memory via
 * Reward Prediction Error Routing", arXiv:2603.14597), which routes incoming
 * information by reward prediction error: routine inputs take a fast path,
 * surprising ones trigger the expensive memory-evolution pipeline. Its authors
 * report over 80 % less token consumption. This module applies the same
 * fast/slow idea to retrieval queries — our own adaptation, not part of D-MEM:
 * a query whose predicted difficulty is low can be answered from a fast cache,
 * a difficult one needs the deeper walk through the memory store.
 *
 * The intended mapping onto LoCoMo question types:
 *   - Cat 4 (Single-Hop) — simple lookup, low surprise → fast path.
 *   - Cat 1 (Multi-Hop)  — high uncertainty, needs full scan.
 *   - Cat 2 (Temporal)   — medium-uncertainty, depends on recency
 *                          markers (`yesterday` / `last year`).
 *   - Cat 3 (Open-domain)— typically high.
 * No latency or accuracy effect of this module is measured in this repository.
 * The "predicted-difficulty" critic itself runs in microseconds.
 *
 * Why pure-algorithm here
 * -----------------------
 * The critic is a small bundle of regex / token heuristics over the
 * query string. No DB, no LLM, no logger. Callers compose the routing
 * decision with their own retrieval surface.
 *
 * Score-fusion math
 * -----------------
 * The difficulty signal is a sum of zero-or-positive heuristic
 * contributors, multiplied by `scale` and clamped to [0, 1]. Each
 * contributor is deliberately small (≤ 0.20) so no single signal
 * dominates. An evaluation can sweep `surpriseThreshold` (default 0.5)
 * without retraining a critic.
 *
 *   - long-query bonus     (+0..0.20)  — long queries are usually complex
 *   - multi-clause bonus   (+0..0.20)  — `,` / `and` / `or` separators
 *   - comparison marker    (+0.20)     — `before`, `after`, `compared to`
 *   - count/list marker    (+0.20)     — `how many`, `list all`, `which of`
 *   - multi-entity bonus   (+0..0.20)  — > 1 capitalized noun-like token
 *   - temporal anchors     (+0.10)     — `last year`, `yesterday`, dates
 *   - negation markers     (+0.10)     — `not`, `except`, `besides`
 *   - question head        (+0.05)     — the query starts like a question
 *   - recent misses        (+0..0.10)  — earlier queries in the conversation missed the cache
 *
 * The maxima add up to 1.35; the sum is clamped to [0, 1].
 *
 * @module algorithms/dopamine-routing
 */

// ===========================================================================
// Types
// ===========================================================================

/** Routing-decision target: which retrieval path to execute. */
export type RetrievalRoute = 'fast_cache' | 'full_scan' | 'hybrid';

export interface DifficultySignal {
  /** Sum of heuristic contributions, clamped to [0, 1]. */
  difficulty: number;
  /** Per-contributor breakdown for logging / observability. */
  contributors: Readonly<Record<string, number>>;
  /** Routing decision under the supplied threshold. */
  route: RetrievalRoute;
  /** Threshold actually applied (after defaults / option resolution). */
  thresholdUsed: number;
  /** Optional bypass reason ("phasic burst observed",
   *  "cache miss recently") — empty when no bypass. */
  bypassReason: string;
}

export interface DopamineRoutingOptions {
  /** Difficulty score above which we route to `full_scan`. Default 0.5.
   *  Below this, we route to `fast_cache`. The narrow band around the
   *  threshold (± `hybridBand`) routes to `hybrid` for safety. */
  surpriseThreshold?: number;
  /** Half-width of the `hybrid` band around the threshold. Set to 0 to
   *  disable hybrid mode. Default 0.05. */
  hybridBand?: number;
  /** When true, force `full_scan` regardless of difficulty. Used for
   *  the eval harness's "always-deep" baseline. Default false. */
  forceFullScan?: boolean;
  /** Multiplicative scale applied to ALL contributors. Default 1.0.
   *  Use < 1.0 to make the critic more conservative (more queries fall
   *  below threshold → more fast-cache hits). */
  contributorScale?: number;
}

export interface DopamineRoutingContext {
  /** Recent query history — same-conversation queries that already had
   *  a cache miss raise the difficulty for related queries. Optional. */
  recentMisses?: ReadonlyArray<string>;
  /** Override the entire difficulty signal (e.g. from an LLM critic).
   *  When supplied, the heuristic path is skipped — we just gate on
   *  the supplied value. */
  externalDifficulty?: number;
}

// ===========================================================================
// Defaults
// ===========================================================================

const DEFAULT_THRESHOLD = 0.5;
const DEFAULT_HYBRID_BAND = 0.05;
const DEFAULT_CONTRIBUTOR_SCALE = 1.0;

const QUESTION_HEAD = /^\s*(when|where|why|how|what|which|who|whom|whose)\b/i;

const COMPARISON_PATTERNS = [
  /\bbefore\b/i,
  /\bafter\b/i,
  /\bcompared\s+to\b/i,
  /\bdifference\s+between\b/i,
  /\bthan\b/i,
  /\bversus\b|\bvs\.?\b/i,
];

const COUNT_LIST_PATTERNS = [
  /\bhow\s+many\b/i,
  /\bhow\s+much\b/i,
  /\blist\s+all\b/i,
  /\beach\s+of\b/i,
  /\bwhich\s+of\b/i,
  /\bevery\b/i,
];

const TEMPORAL_PATTERNS = [
  /\byesterday\b/i,
  /\btoday\b/i,
  /\btomorrow\b/i,
  /\blast\s+(year|month|week|day|night)\b/i,
  /\bnext\s+(year|month|week|day)\b/i,
  /\bago\b/i,
  /\bin\s+the\s+(past|future)\b/i,
];

const NEGATION_PATTERNS = [
  /\bnot\b/i,
  /\bnever\b/i,
  /\bexcept\b/i,
  /\bbesides\b/i,
  /\bother\s+than\b/i,
];

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Score a query's predicted retrieval difficulty using only the query
 * text plus optional context. Returns the routing decision under the
 * supplied options.
 *
 * Pure function — same input, same output, no side effects.
 */
export function routeRetrieval(
  query: string,
  options: DopamineRoutingOptions = {},
  context: DopamineRoutingContext = {},
): DifficultySignal {
  const threshold = options.surpriseThreshold ?? DEFAULT_THRESHOLD;
  const hybridBand = options.hybridBand ?? DEFAULT_HYBRID_BAND;
  const scale = options.contributorScale ?? DEFAULT_CONTRIBUTOR_SCALE;

  // Force-full-scan bypass.
  if (options.forceFullScan) {
    return {
      difficulty: 1.0,
      contributors: { force_full_scan: 1.0 },
      route: 'full_scan',
      thresholdUsed: threshold,
      bypassReason: 'forceFullScan option',
    };
  }

  // External-difficulty bypass (LLM critic, etc.).
  if (context.externalDifficulty !== undefined) {
    const d = clamp(context.externalDifficulty, 0, 1);
    return {
      difficulty: d,
      contributors: { external: d },
      route: pickRoute(d, threshold, hybridBand),
      thresholdUsed: threshold,
      bypassReason: 'externalDifficulty supplied',
    };
  }

  const trimmed = String(query ?? '').trim();
  if (!trimmed) {
    return {
      difficulty: 0,
      contributors: { empty_query: 0 },
      route: 'fast_cache',
      thresholdUsed: threshold,
      bypassReason: 'empty query',
    };
  }

  const contributors: Record<string, number> = {};

  // Long-query bonus — saturates at 30+ tokens.
  const tokenCount = trimmed.split(/\s+/).length;
  contributors.length = clamp(((tokenCount - 5) / 25) * 0.20, 0, 0.20);

  // Multi-clause bonus — count separators, saturate at 3.
  const separatorCount =
    (trimmed.match(/[,;]/g)?.length ?? 0) +
    (trimmed.match(/\b(and|or|but|while|whereas)\b/gi)?.length ?? 0);
  contributors.multi_clause = clamp((separatorCount / 3) * 0.20, 0, 0.20);

  // Comparison marker — fixed +0.20.
  contributors.comparison = COMPARISON_PATTERNS.some((p) => p.test(trimmed)) ? 0.20 : 0;

  // Count / list marker — fixed +0.20.
  contributors.count_list = COUNT_LIST_PATTERNS.some((p) => p.test(trimmed)) ? 0.20 : 0;

  // Multi-entity bonus — count capitalized non-stop tokens, saturate at 4.
  const entityTokens = countEntityLikeTokens(trimmed);
  contributors.multi_entity = clamp(((entityTokens - 1) / 3) * 0.20, 0, 0.20);

  // Temporal anchors — fixed +0.10.
  contributors.temporal = TEMPORAL_PATTERNS.some((p) => p.test(trimmed)) ? 0.10 : 0;

  // Negation markers — fixed +0.10.
  contributors.negation = NEGATION_PATTERNS.some((p) => p.test(trimmed)) ? 0.10 : 0;

  // Question-head softener — questions start at a small base difficulty.
  contributors.question_head = QUESTION_HEAD.test(trimmed) ? 0.05 : 0;

  // Recent-miss bonus — if any previous query in this conversation
  // missed the cache, raise the difficulty floor.
  const misses = context.recentMisses ?? [];
  contributors.recent_miss = misses.length > 0 ? Math.min(0.10, misses.length * 0.05) : 0;

  // Apply contributor scale.
  let total = 0;
  for (const k of Object.keys(contributors)) {
    contributors[k] = contributors[k] * scale;
    total += contributors[k];
  }
  const difficulty = clamp(total, 0, 1);
  const route = pickRoute(difficulty, threshold, hybridBand);

  return {
    difficulty,
    contributors,
    route,
    thresholdUsed: threshold,
    bypassReason: '',
  };
}

/** Pick the routing target from a difficulty score and threshold. */
function pickRoute(
  difficulty: number,
  threshold: number,
  hybridBand: number,
): RetrievalRoute {
  if (difficulty >= threshold + hybridBand) return 'full_scan';
  if (difficulty <= threshold - hybridBand) return 'fast_cache';
  return 'hybrid';
}

// ===========================================================================
// Helpers
// ===========================================================================

/** Count tokens that LOOK like proper nouns / entities — capitalized,
 *  ≥ 2 chars, not starting the sentence (sentence-initial caps don't
 *  signal entity-hood). */
function countEntityLikeTokens(query: string): number {
  const tokens = query.split(/\s+/);
  let count = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i].replace(/[^\p{L}\p{N}]/gu, '');
    if (tok.length < 2) continue;
    // Skip sentence-initial capitals — first non-question-word token.
    if (i === 0 || (i === 1 && /^(when|where|how|what|which|who|why)$/i.test(tokens[0]))) {
      continue;
    }
    if (/^[A-Z]/.test(tok) && !/^[A-Z]+$/.test(tok)) count++;
  }
  return count;
}

function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

// ===========================================================================
// Convenience: routing-decision helpers
// ===========================================================================

/**
 * Convenience that turns a route into an `enableX` flag bag — useful
 * for callers that want to translate the routing decision into
 * existing retriever options without rewriting the whole flag matrix.
 *
 * The interpretation:
 *   - `fast_cache`: skip expensive PPR / community / event-aware
 *     strategies; rely on vector + BM25 only.
 *   - `full_scan`: enable all strategies including PPR.
 *   - `hybrid`: enable PPR but cap subgraph aggressively.
 */
export function routeToHybridOptions(
  route: RetrievalRoute,
): Readonly<{ enableVector: boolean; enableGraph: boolean; enableCommunity: boolean; enableBM25: boolean; enableEventAware: boolean; enablePPR: boolean }> {
  switch (route) {
    case 'fast_cache':
      return {
        enableVector: true,
        enableGraph: false,
        enableCommunity: false,
        enableBM25: true,
        enableEventAware: false,
        enablePPR: false,
      };
    case 'hybrid':
      return {
        enableVector: true,
        enableGraph: true,
        enableCommunity: false,
        enableBM25: true,
        enableEventAware: false,
        enablePPR: true,
      };
    case 'full_scan':
    default:
      return {
        enableVector: true,
        enableGraph: true,
        enableCommunity: true,
        enableBM25: true,
        enableEventAware: true,
        enablePPR: true,
      };
  }
}
