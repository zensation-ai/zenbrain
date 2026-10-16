/**
 * Temporal Multi-Route Decomposition — EvoReasoner-style query routing.
 *
 * Problem
 * -------
 * LoCoMo Cat 2 (Temporal) questions blend three orthogonal temporal
 * intents that benefit from different retrieval strategies:
 *
 *   - Absolute   ("when did Caroline first mention her birthday?") —
 *                 binds to a point-in-time anchor; benefits from event
 *                 retrieval keyed on the entity + topic.
 *   - Relative   ("what did Joanna do AFTER her trip to Spain?") —
 *                 binds to ordering signals (before / after / first /
 *                 last); benefits from anchor-event retrieval PLUS an
 *                 ordered slice around the anchor.
 *   - Duration   ("how long ago did Caroline's daughter graduate?") —
 *                 binds to interval delta against a reference time;
 *                 benefits from event retrieval PLUS a delta computation.
 *
 * Single-query retrieval over-fits to whichever route the surface
 * wording most closely matches and silently misses the other intents
 * that a good answer needs.
 *
 * What this module does
 * ---------------------
 * 1. `decomposeTemporalQuery` — pure-regex English cue detection that
 *    splits a query into 1–3 sub-queries, one per active route. No LLM,
 *    no I/O, < 1 ms.
 * 2. `runTemporalMultiRoute` — runs every active route through a
 *    caller-supplied retriever in parallel.
 * 3. `fuseRoutes` — Reciprocal Rank Fusion (RRF) across routes plus a
 *    `multiRouteBoost` for items that surfaced under more than one
 *    route, plus a per-route confidence weight. Returns
 *    `FusedHit<T>[]` sorted by score descending.
 *
 * Why standalone (vs. extending services/rag-query-decomposition.ts)
 * ------------------------------------------------------------------
 * - rag-query-decomposition.ts is German, surface-level
 *   ("vergleich" / "warum"), and produces sub-queries for general
 *   multi-hop retrieval.
 * - This module is English (LoCoMo-language), temporal-only, and
 *   produces sub-queries that are semantically TYPED (`absolute` /
 *   `relative` / `duration`) so downstream callers can apply
 *   route-specific behaviour (different KG-edge filters, different
 *   anchor handling, ordering hints).
 *
 * The two should coexist; this one runs first when the query is
 * temporal, and the general decomposer is the fall-back for everything
 * else.
 *
 * Phase H sprint reference: spec § H1 task 6 (EvoReasoner pattern,
 * arXiv:2509.15464). The paper does the type-classification with an
 * LLM call; we use deterministic regex because (a) latency, (b) cost,
 * and (c) on English LoCoMo wording the cue patterns are unambiguous
 * — see test suite for empirical coverage.
 *
 * Interplay with existing H1 modules
 * ----------------------------------
 * - `services/memory/temporal-normalizer` — normalises ingest-time
 *   timestamps into ISO-8601. This module operates on the QUERY side;
 *   the two are caller-composable.
 * - `services/reasoning/timeline-generator` — renders chronological
 *   text blocks from already-retrieved memories. Calling pattern:
 *   multi-route decomposition → routes retrieve memories → optional
 *   timeline rendering on the fused result.
 * - `services/tool-handlers/date-tools` — exposes `compute_date_delta`
 *   to the agent. The Duration route is what makes that tool actually
 *   useful for end-to-end LoCoMo Cat 2 answers.
 *
 * @module algorithms/temporal-multi-route
 */

/* eslint-disable security/detect-unsafe-regex */

// ===========================================================================
// Types
// ===========================================================================

/** Three orthogonal temporal intents per EvoReasoner. */
export type TemporalRouteKind = 'absolute' | 'relative' | 'duration';

/** Direction hint for relative-route retrieval. */
export type OrderingHint =
  | 'earliest'      // "first time", "originally"
  | 'latest'        // "most recently", "last time"
  | 'before-anchor' // "before X", "prior to X"
  | 'after-anchor'  // "after X", "since X", "following X"
  | null;

/** A single decomposed sub-query for one route. */
export interface TemporalSubQuery {
  /** Which route this sub-query feeds. */
  kind: TemporalRouteKind;
  /** The cleaned query text — temporal cue words stripped where it
   *  helps the downstream embedder, kept where they carry semantic
   *  load (e.g. "trip to Spain" stays intact). */
  query: string;
  /** The cue tokens that activated this route — kept for audit /
   *  debugging and for logging which patterns are firing in production. */
  cues: string[];
  /** Pattern-matcher's confidence in [0, 1]. 1.0 = exact strong cue
   *  ("how long"); lower = weaker / inferred cue. Used as the
   *  per-route weight in score fusion. */
  confidence: number;
  /** For relative routes only: which side of the anchor to weigh
   *  toward. `null` for absolute / duration. */
  orderingHint?: OrderingHint;
}

/** Output of the decomposition phase. */
export interface DecomposedTemporalQuery {
  /** The original query string verbatim (for trace-back). */
  original: string;
  /** True if at least one temporal cue was detected. When false, the
   *  caller should fall back to non-temporal retrieval (the routes
   *  array will still contain a single pass-through entry so the
   *  pipeline can proceed uniformly). */
  isTemporal: boolean;
  /** The decomposed sub-queries — between 1 and 3. */
  routes: TemporalSubQuery[];
  /** Convenience: which route fired with highest confidence. `null`
   *  if `isTemporal` is false. */
  primaryRouteKind: TemporalRouteKind | null;
  /** Per-cue-class detection flags (for analytics / ablation). */
  detectedCues: {
    absoluteWhen: boolean;
    relativeOrder: boolean;
    duration: boolean;
  };
}

/** What a caller-supplied retriever returns for one sub-query. */
export interface RouteHit<T> {
  item: T;
  /** Retriever-internal score (e.g. cosine, BM25). Used for tie-break
   *  when two items have identical RRF scores. NOT used directly in
   *  the RRF computation. */
  score: number;
}

/** Per-route retrieval bundle, fed into `fuseRoutes`. */
export interface RouteResult<T> {
  route: TemporalSubQuery;
  hits: RouteHit<T>[];
}

/** Options that tune the score-fusion. */
export interface FuseRoutesOptions<T = unknown> {
  /** RRF-K constant. Default 60 (matches synthesis-engine.ts and the
   *  original Cormack/Clarke/Buettcher 2009 paper). Lower K → ranks
   *  matter more; higher K → smoother ranking. */
  rrfK?: number;
  /** Multiplier applied to an item's fused score when it appears under
   *  more than one route (capped at one application — boosting per
   *  extra route led to ranking instability in early experiments).
   *  Default 1.2. Set to 1.0 to disable. */
  multiRouteBoost?: number;
  /** Multiplier on the per-route confidence when computing the route's
   *  contribution to RRF. A route with confidence 0.8 and weight
   *  1.5 contributes 1.2× to RRF. Default 1.0 (use confidence as-is).
   *  EvoReasoner uses 1.5 to over-weight cleanly-routed sub-queries. */
  perRouteWeight?: number;
  /** Stable identifier extractor for items, used to merge hits across
   *  routes. Default tries `(item as any).id`, then `String(item)`. */
  itemId?: (item: T) => string;
  /** Cap on the number of fused hits returned. Default: no cap. */
  maxHits?: number;
}

/** A fused hit — item plus aggregate score plus which routes contributed. */
export interface FusedHit<T> {
  item: T;
  /** Aggregate fused score (post boosts). Higher = more relevant. */
  score: number;
  /** Which routes contained this item. Length 1..3. */
  contributingRoutes: TemporalRouteKind[];
  /** Highest retriever-internal score among contributing routes. Used
   *  for tie-break and for debugging when fused scores are close. */
  bestRetrieverScore: number;
}

/** The async retrieval callback the caller supplies. */
export type RouteRunner<T> = (sub: TemporalSubQuery) => Promise<RouteHit<T>[]>;

// ===========================================================================
// Cue patterns (English; matches LoCoMo wording)
// ===========================================================================

interface CuePattern {
  /** The route this cue activates. */
  kind: TemporalRouteKind;
  /** The regex. Should be case-insensitive (`i` flag) and use word
   *  boundaries (`\b`) so partial-word matches don't fire. */
  pattern: RegExp;
  /** Confidence contribution when this cue fires. Multiple cues for
   *  the same route are aggregated with a saturating combiner
   *  (`1 - Π (1 - c_i)`) so two strong cues don't exceed 1.0. */
  confidence: number;
  /** Optional ordering hint for relative cues. */
  orderingHint?: OrderingHint;
  /** Tokens to strip from the sub-query when this cue fires. Stripped
   *  positionally on a per-cue basis; if the strip would remove > half
   *  the query, the strip is skipped (preserves semantic content). */
  strip?: RegExp;
}

const CUE_PATTERNS: readonly CuePattern[] = [
  // ── Absolute cues (when, what date, what year) ─────────────────────
  {
    kind: 'absolute',
    pattern: /\bwhen\s+(?:did|was|will|does|do|is|are|were|had|has)\b/i,
    confidence: 0.95,
    strip: /\bwhen\s+(?:did|was|will|does|do|is|are|were|had|has)\b/i,
  },
  {
    kind: 'absolute',
    pattern: /\bwhat\s+(?:date|day|month|year|time)\b/i,
    confidence: 0.9,
    strip: /\b(?:on\s+)?what\s+(?:date|day|month|year|time)\b/i,
  },
  {
    kind: 'absolute',
    pattern: /\bat\s+what\s+time\b/i,
    confidence: 0.95,
    strip: /\bat\s+what\s+time\b/i,
  },
  {
    kind: 'absolute',
    pattern: /\bon\s+which\s+(?:date|day)\b/i,
    confidence: 0.9,
    strip: /\bon\s+which\s+(?:date|day)\b/i,
  },

  // ── Relative cues (before / after / since / first / last) ──────────
  {
    kind: 'relative',
    pattern: /\b(?:before|prior\s+to|preceding|earlier\s+than)\b/i,
    confidence: 0.9,
    orderingHint: 'before-anchor',
  },
  {
    kind: 'relative',
    pattern: /\b(?:after|since|following|subsequent\s+to|later\s+than)\b/i,
    confidence: 0.9,
    orderingHint: 'after-anchor',
  },
  {
    kind: 'relative',
    pattern: /\b(?:first|originally|initially|earliest|the\s+first\s+time)\b/i,
    confidence: 0.85,
    orderingHint: 'earliest',
  },
  {
    kind: 'relative',
    pattern: /\b(?:last|most\s+recently|the\s+last\s+time|latest)\b/i,
    confidence: 0.85,
    orderingHint: 'latest',
  },
  {
    kind: 'relative',
    pattern: /\b(?:previous|previously|prior)\b/i,
    confidence: 0.7,
    orderingHint: 'before-anchor',
  },
  {
    kind: 'relative',
    pattern: /\bnext\b/i,
    confidence: 0.6,
    orderingHint: 'after-anchor',
  },

  // ── Duration cues (how long, how many days/months/years) ───────────
  {
    kind: 'duration',
    pattern: /\bhow\s+long\b/i,
    confidence: 0.95,
    strip: /\bhow\s+long\s+(?:ago\s+)?(?:did|was|has|have|since)?\b/i,
  },
  {
    kind: 'duration',
    pattern: /\bhow\s+many\s+(?:days?|weeks?|months?|years?|hours?|minutes?)\b/i,
    confidence: 0.95,
    strip: /\bhow\s+many\s+(?:days?|weeks?|months?|years?|hours?|minutes?)\s+(?:ago|since|between|until)?\b/i,
  },
  {
    kind: 'duration',
    pattern: /\bduration\s+of\b/i,
    confidence: 0.85,
    strip: /\bduration\s+of\b/i,
  },
  {
    kind: 'duration',
    pattern: /\bfor\s+how\s+long\b/i,
    confidence: 0.95,
    strip: /\bfor\s+how\s+long\b/i,
  },
  {
    kind: 'duration',
    pattern: /\b(?:ago|since\s+then)\b/i,
    confidence: 0.5,
  },
];

// ===========================================================================
// Decomposition
// ===========================================================================

/**
 * Pure-regex temporal classification + sub-query construction.
 *
 * Behaviour:
 *   - Walks every cue pattern, accumulates which routes fire.
 *   - For each firing route, builds a sub-query: original text minus
 *     the cue tokens (stripped) but only when the strip wouldn't
 *     remove more than half the query (preserves semantic load).
 *   - Aggregates per-route confidence via 1 − Π(1 − c_i) so multiple
 *     weak cues for the same route accumulate but don't exceed 1.0.
 *   - When no cues fire, returns a single pass-through `absolute` route
 *     with confidence 0.5 and `isTemporal=false` so callers can route
 *     uniformly.
 */
export function decomposeTemporalQuery(query: string): DecomposedTemporalQuery {
  const original = String(query ?? '');

  // Per-route accumulators.
  const buckets: Record<TemporalRouteKind, {
    cues: string[];
    failProb: number;        // running ∏(1 − c_i); confidence = 1 − this
    orderingHint: OrderingHint;
    stripPatterns: RegExp[];
  }> = {
    absolute: { cues: [], failProb: 1, orderingHint: null, stripPatterns: [] },
    relative: { cues: [], failProb: 1, orderingHint: null, stripPatterns: [] },
    duration: { cues: [], failProb: 1, orderingHint: null, stripPatterns: [] },
  };

  for (const cue of CUE_PATTERNS) {
    const m = original.match(cue.pattern);
    if (!m) continue;
    const bucket = buckets[cue.kind];
    bucket.cues.push(m[0]);
    bucket.failProb *= 1 - cue.confidence;
    if (cue.orderingHint && !bucket.orderingHint) {
      bucket.orderingHint = cue.orderingHint;
    }
    if (cue.strip) bucket.stripPatterns.push(cue.strip);
  }

  // Build the routes.
  const detectedCues = {
    absoluteWhen: buckets.absolute.cues.length > 0,
    relativeOrder: buckets.relative.cues.length > 0,
    duration: buckets.duration.cues.length > 0,
  };
  const isTemporal = detectedCues.absoluteWhen || detectedCues.relativeOrder || detectedCues.duration;

  if (!isTemporal) {
    return {
      original,
      isTemporal: false,
      routes: [{
        kind: 'absolute',
        query: original.trim(),
        cues: [],
        confidence: 0.5,
        orderingHint: null,
      }],
      primaryRouteKind: null,
      detectedCues,
    };
  }

  const routes: TemporalSubQuery[] = [];
  for (const kind of ['absolute', 'relative', 'duration'] as const) {
    const b = buckets[kind];
    if (b.cues.length === 0) continue;
    const confidence = 1 - b.failProb;
    routes.push({
      kind,
      query: buildSubQuery(original, b.stripPatterns),
      cues: b.cues,
      confidence,
      orderingHint: kind === 'relative' ? b.orderingHint : null,
    });
  }

  // Pick primary by confidence (tie-break: absolute > relative > duration,
  // matching EvoReasoner's reported preference order on temporal QA).
  const tiePriority: Record<TemporalRouteKind, number> = {
    absolute: 0, relative: 1, duration: 2,
  };
  const primary = routes.slice().sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return tiePriority[a.kind] - tiePriority[b.kind];
  })[0];

  return {
    original,
    isTemporal: true,
    routes,
    primaryRouteKind: primary.kind,
    detectedCues,
  };
}

/** Build a per-route sub-query by stripping cue tokens.
 *
 *  Guard: at least 2 content tokens must remain. We deliberately do NOT
 *  use a relative threshold (e.g. "≥ half the original tokens") — short
 *  but precisely-stripped queries like "Caroline's daughter graduate?"
 *  are exactly what we want from "How long ago did Caroline's daughter
 *  graduate?" even though 4 of the 7 original tokens were removed.
 *  The only failure mode worth guarding against is over-stripping that
 *  leaves nothing semantically searchable (e.g. "When?" → ""), and
 *  ≥ 2 content tokens catches that cleanly. */
function buildSubQuery(original: string, stripPatterns: RegExp[]): string {
  if (stripPatterns.length === 0) return original.trim();
  let candidate = original;
  for (const sp of stripPatterns) {
    candidate = candidate.replace(sp, ' ');
  }
  candidate = trimSeparators(candidate.replace(/\s+/g, ' '));
  // Guard: if the strip removed too much, fall back to original.
  if (countTokens(candidate) < 2) return original.trim();
  // Re-attach the trailing question mark if the original had one and we
  // accidentally trimmed it (helps downstream embedders).
  if (original.trim().endsWith('?') && !candidate.endsWith('?')) candidate = `${candidate}?`;
  return candidate || original.trim();
}

/** Remove whitespace, commas, question marks and full stops from both ends. A loop
 *  instead of `/^[\s,?.]+|[\s,?.]+$/g`, which backtracks over every run of those
 *  characters that is not at an end and so took quadratic time on input like
 *  `'when did a' + ','.repeat(n) + 'b'` (CodeQL js/polynomial-redos). */
function trimSeparators(s: string): string {
  const isSeparator = (c: string) => c === ',' || c === '?' || c === '.' || /\s/.test(c);
  let start = 0;
  let end = s.length;
  while (start < end && isSeparator(s[start])) start++;
  while (end > start && isSeparator(s[end - 1])) end--;
  return s.slice(start, end);
}

function countTokens(s: string): number {
  const trimmed = s.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// ===========================================================================
// Score Fusion (RRF + temporal-weight + multi-route boost)
// ===========================================================================

const DEFAULT_RRF_K = 60;
const DEFAULT_MULTI_ROUTE_BOOST = 1.2;
const DEFAULT_PER_ROUTE_WEIGHT = 1.0;

function defaultItemId(item: unknown): string {
  if (item === null || item === undefined) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'object' && item !== null) {
    const o = item as Record<string, unknown>;
    if (typeof o.id === 'string') return o.id;
    if (typeof o.id === 'number') return String(o.id);
  }
  return String(item);
}

/**
 * Pure score-fusion. Caller has already retrieved per-route hits and
 * passes them in. No I/O.
 *
 * Math:
 *   - For each route R, items are ranked 0..N-1 by `score` desc.
 *   - RRF contribution from route R for an item at rank r:
 *       contribution = (R.confidence × perRouteWeight) / (rrfK + r + 1)
 *   - Item's fused score = sum of contributions across routes that
 *     contained it.
 *   - If the item appeared in ≥ 2 routes, multiply by `multiRouteBoost`.
 */
export function fuseRoutes<T>(
  routeResults: readonly RouteResult<T>[],
  options: FuseRoutesOptions<T> = {},
): FusedHit<T>[] {
  const rrfK = options.rrfK ?? DEFAULT_RRF_K;
  const multiBoost = options.multiRouteBoost ?? DEFAULT_MULTI_ROUTE_BOOST;
  const perRouteWeight = options.perRouteWeight ?? DEFAULT_PER_ROUTE_WEIGHT;
  const itemId = (options.itemId ?? defaultItemId) as (item: T) => string;

  type Bucket = {
    item: T;
    score: number;
    routes: Set<TemporalRouteKind>;
    bestRetrieverScore: number;
  };
  const buckets = new Map<string, Bucket>();

  for (const route of routeResults) {
    if (!route.hits || route.hits.length === 0) continue;
    // Rank by retriever score desc (stable: original order on ties).
    const ranked = route.hits.slice().sort((a, b) => b.score - a.score);
    for (let r = 0; r < ranked.length; r++) {
      const hit = ranked[r];
      const id = itemId(hit.item);
      if (!id) continue;
      const contribution = (route.route.confidence * perRouteWeight) / (rrfK + r + 1);
      const existing = buckets.get(id);
      if (existing) {
        existing.score += contribution;
        existing.routes.add(route.route.kind);
        if (hit.score > existing.bestRetrieverScore) {
          existing.bestRetrieverScore = hit.score;
        }
      } else {
        buckets.set(id, {
          item: hit.item,
          score: contribution,
          routes: new Set([route.route.kind]),
          bestRetrieverScore: hit.score,
        });
      }
    }
  }

  // Apply multi-route boost.
  for (const b of buckets.values()) {
    if (b.routes.size >= 2) b.score *= multiBoost;
  }

  // Sort by fused score; tie-break on best retriever score.
  const out: FusedHit<T>[] = Array.from(buckets.values())
    .map((b) => ({
      item: b.item,
      score: b.score,
      contributingRoutes: Array.from(b.routes).sort(),
      bestRetrieverScore: b.bestRetrieverScore,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.bestRetrieverScore - a.bestRetrieverScore;
    });

  return options.maxHits !== undefined ? out.slice(0, options.maxHits) : out;
}

// ===========================================================================
// Top-level orchestrator
// ===========================================================================

/**
 * End-to-end: decompose, run each route through the caller's retriever
 * in parallel, fuse the results.
 *
 * The runner is injected so this module stays pure (testable without
 * the KG, the RAG pipeline, or any I/O). Production callers wire it
 * to whatever retrieval surface they want — see H2's
 * `services/knowledge-graph/hybrid-retriever.ts` for the planned
 * binding point.
 *
 * Performance note: routes execute in parallel via Promise.all, so the
 * wall-clock cost is max(route latencies), not sum.
 */
export async function runTemporalMultiRoute<T>(
  query: string,
  runner: RouteRunner<T>,
  options: FuseRoutesOptions<T> = {},
): Promise<{
  decomposition: DecomposedTemporalQuery;
  fused: FusedHit<T>[];
  perRoute: RouteResult<T>[];
}> {
  const decomposition = decomposeTemporalQuery(query);
  const perRoute = await Promise.all(
    decomposition.routes.map(async (route): Promise<RouteResult<T>> => ({
      route,
      hits: await runner(route),
    })),
  );
  const fused = fuseRoutes(perRoute, options);
  return { decomposition, fused, perRoute };
}
