/**
 * Personalized PageRank (PPR) — graph-agnostic implementation.
 *
 * Based on the HippoRAG 2 pattern (arXiv:2502.14802), which runs PPR over
 * a parahippocampal encoder graph; here it runs over whatever graph the
 * caller passes, for example a Hebbian knowledge graph.
 *
 * Why PPR for multi-hop retrieval
 * --------------------------------
 * A naive 2-hop traversal gets a flat union of neighbours and treats all
 * of them equally. PPR runs a
 * random-walk-with-restart from query-anchored seed nodes and assigns each
 * graph node a relevance score that:
 *   - decays with hop distance (geometrically, governed by alpha),
 *   - rewards multiple paths to the same node (a fact mentioned in two
 *     places gets boosted),
 *   - respects edge weights (Hebbian co-activation strength weighs the
 *     transitions automatically),
 *   - converges deterministically — no LLM call, no I/O.
 *
 * On a sparse KG (a few thousand entities, an order of magnitude more
 * edges) PPR runs in milliseconds with the iterative power-method.
 *
 * Why standalone
 * --------------
 * - Pure algorithm: no DB, no I/O, no logger dependency. Trivially
 *   testable. Caller composes graph + seeds + options.
 * - Reusable: multi-hop retrieval is one consumer; community-detection
 *   seeding (centrality-flavoured PPR) or per-route PPR in
 *   `./temporal-multi-route` are others.
 *
 * Algorithm
 * ---------
 * Power-iteration of the PPR equation:
 *
 *     v_{t+1} = (1 − α) · M · v_t + α · s
 *
 * where:
 *   - v: score vector over nodes (length |V|)
 *   - M: column-stochastic transition matrix (out-edges normalised by
 *        out-strength; equivalent to a weighted random walk)
 *   - s: personalisation vector — uniform mass over the seed set
 *   - α: restart probability (default 0.15 per Brin & Page 1998 and
 *        widely repeated in the random-walk literature)
 *
 * Iteration stops when the L1 norm of (v_{t+1} − v_t) drops below
 * `convergenceTol`, or after `maxIterations`. On dangling nodes (no
 * out-edges) the mass is redistributed back to the seed set, which is
 * the correct "personalised" behaviour (vs. uniform redistribution which
 * gives the *non*-personalised PPR variant).
 *
 * Edge weights: a directed edge `[src, tgt, w]` with w > 0 contributes
 * w to src's outgoing-mass denominator. Bidirectional edges should be
 * passed twice (once per direction); `undirectedToDirected` does that
 * for a list of symmetric edges such as Hebbian ones.
 *
 * Complexity
 * ----------
 *   - Time:  O(iterations × |E|) — each iteration touches every edge once.
 *   - Space: O(|V| + |E|) — sparse adjacency map + score vector.
 *
 * @module algorithms/personalized-pagerank
 */

// ===========================================================================
// Types
// ===========================================================================

/** Directed weighted edge: source → target with weight > 0. */
export type WeightedEdge = readonly [src: string, tgt: string, weight: number];

/** Graph passed to PPR — list of node IDs and directed weighted edges.
 *  Node order is irrelevant; the algorithm builds its own index. */
export interface PPRGraph {
  /** All node IDs that should appear in the output. Edges may reference
   *  any of these. Edges to nodes not in this list are silently dropped. */
  readonly nodes: ReadonlyArray<string>;
  /** Directed edges. For an undirected KG, pass each edge twice (a→b and
   *  b→a). Negative or zero weights are treated as weight 0 (edge dropped). */
  readonly edges: ReadonlyArray<WeightedEdge>;
}

export interface PPROptions {
  /** Restart probability in (0, 1). Default 0.15. Higher → score sticks
   *  closer to seeds (less exploration); lower → score diffuses further. */
  readonly alpha?: number;
  /** Maximum power-iteration steps. Default 100 (typically converges
   *  in 30–60 on real-world sparse graphs). */
  readonly maxIterations?: number;
  /** L1-norm change threshold for convergence. Default 1e-6. */
  readonly convergenceTol?: number;
  /** When the seed list is empty, treat all nodes as uniform seeds
   *  (i.e. compute the regular non-personalised PageRank). Default false
   *  — empty seeds raise an error to surface bugs early. */
  readonly allowEmptySeeds?: boolean;
}

export interface PPRResult {
  /** Score per node ID. Sums to 1 (modulo floating-point drift). */
  readonly scores: ReadonlyMap<string, number>;
  /** Number of power-iteration steps performed. */
  readonly iterations: number;
  /** True if iteration stopped because L1 change < tol; false if stopped
   *  at maxIterations. Callers should log when this is false. */
  readonly converged: boolean;
}

const DEFAULT_ALPHA = 0.15;
const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_CONVERGENCE_TOL = 1e-6;

// ===========================================================================
// Core PPR
// ===========================================================================

/**
 * Compute Personalized PageRank starting from `seedNodes`.
 *
 * Returns a score for every node in `graph.nodes`. Seed nodes receive the
 * personalisation mass on every iteration; their score is typically (but
 * not always) the highest in the result.
 *
 * Throws when `seedNodes` is empty unless `options.allowEmptySeeds=true`.
 * Throws when alpha is outside (0, 1).
 */
export function personalizedPageRank(
  graph: PPRGraph,
  seedNodes: ReadonlyArray<string>,
  options: PPROptions = {},
): PPRResult {
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  if (alpha <= 0 || alpha >= 1) {
    throw new Error(`personalizedPageRank: alpha must be in (0, 1); got ${alpha}`);
  }
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  if (maxIterations < 1) {
    throw new Error(`personalizedPageRank: maxIterations must be >= 1; got ${maxIterations}`);
  }
  const convergenceTol = options.convergenceTol ?? DEFAULT_CONVERGENCE_TOL;

  // ── Build node index ──────────────────────────────────────────────
  // Map node ID → integer index for fast vector access.
  const nodeIds = Array.from(new Set(graph.nodes));
  const N = nodeIds.length;
  if (N === 0) {
    return { scores: new Map(), iterations: 0, converged: true };
  }
  const nodeIdx = new Map<string, number>();
  for (let i = 0; i < N; i++) nodeIdx.set(nodeIds[i], i);

  // ── Build sparse adjacency (out-edges per node, weight-normalised) ─
  // outNeighbours[i] = [(neighbourIdx, normalisedWeight), ...]
  // outStrength[i]   = sum of out-edge weights from node i (pre-norm).
  const outNeighbours: Array<Array<{ idx: number; w: number }>> =
    Array.from({ length: N }, () => []);
  const outStrength = new Float64Array(N);

  for (const [src, tgt, w] of graph.edges) {
    if (w <= 0 || !Number.isFinite(w)) continue;
    const sIdx = nodeIdx.get(src);
    const tIdx = nodeIdx.get(tgt);
    if (sIdx === undefined || tIdx === undefined) continue;
    outNeighbours[sIdx].push({ idx: tIdx, w });
    outStrength[sIdx] += w;
  }
  // Normalise out-edge weights so each node's row sums to 1 (column-
  // stochastic when viewed as a transition matrix).
  for (let i = 0; i < N; i++) {
    const s = outStrength[i];
    if (s > 0) {
      for (const e of outNeighbours[i]) e.w /= s;
    }
  }

  // ── Build personalisation vector s ────────────────────────────────
  // Uniform mass over seed nodes that exist in the graph.
  const validSeeds: number[] = [];
  for (const seed of seedNodes) {
    const i = nodeIdx.get(seed);
    if (i !== undefined) validSeeds.push(i);
  }
  if (validSeeds.length === 0) {
    if (!options.allowEmptySeeds) {
      throw new Error(
        'personalizedPageRank: no valid seed nodes (none of the seeds were in graph.nodes). ' +
        'Pass options.allowEmptySeeds=true to compute regular PageRank instead.',
      );
    }
    // Regular PageRank: uniform personalisation over all nodes.
    for (let i = 0; i < N; i++) validSeeds.push(i);
  }
  const s = new Float64Array(N);
  const seedMass = 1 / validSeeds.length;
  for (const i of validSeeds) s[i] = seedMass;

  // ── Power-iteration ───────────────────────────────────────────────
  // Initialise v = s (warm start; converges faster than uniform-init).
  let v = new Float64Array(s);
  let next = new Float64Array(N);
  let iterations = 0;
  let converged = false;

  for (let step = 0; step < maxIterations; step++) {
    // Reset accumulator.
    next.fill(0);
    // Add restart contribution: α · s
    for (let i = 0; i < N; i++) next[i] = alpha * s[i];

    // Add walk contribution: (1 − α) · M · v
    let danglingMass = 0;
    for (let i = 0; i < N; i++) {
      const vi = v[i];
      if (vi === 0) continue;
      if (outStrength[i] === 0) {
        // Dangling node: redistribute back to seeds (personalised variant).
        danglingMass += vi;
        continue;
      }
      const contribution = (1 - alpha) * vi;
      for (const e of outNeighbours[i]) {
        next[e.idx] += contribution * e.w;
      }
    }
    if (danglingMass > 0) {
      const danglingShare = (1 - alpha) * danglingMass;
      for (const i of validSeeds) next[i] += danglingShare * seedMass;
    }

    // Convergence check (L1 norm of change).
    let l1Change = 0;
    for (let i = 0; i < N; i++) l1Change += Math.abs(next[i] - v[i]);
    iterations = step + 1;

    // Swap buffers.
    const tmp = v;
    v = next;
    next = tmp;

    if (l1Change < convergenceTol) {
      converged = true;
      break;
    }
  }

  // ── Pack result ───────────────────────────────────────────────────
  const scores = new Map<string, number>();
  for (let i = 0; i < N; i++) scores.set(nodeIds[i], v[i]);

  return { scores, iterations, converged };
}

// ===========================================================================
// Convenience: top-K
// ===========================================================================

/** A single (nodeId, score) pair returned from `topKByPageRank`. */
export interface RankedNode {
  readonly nodeId: string;
  readonly score: number;
}

/**
 * Return the top-K nodes by PPR score, descending.
 *
 * `excludeSeeds` (default false) is useful for retrieval — the seeds are
 * the query-anchored entities, and the retrieval payload should be the
 * *expanded* relevant set. When excluding seeds, `seeds` must be supplied.
 */
export function topKByPageRank(
  result: PPRResult,
  k: number,
  options: { excludeSeeds?: boolean; seeds?: ReadonlyArray<string> } = {},
): RankedNode[] {
  if (k <= 0) return [];
  const seedSet = options.excludeSeeds && options.seeds ? new Set(options.seeds) : null;
  const all: RankedNode[] = [];
  for (const [nodeId, score] of result.scores) {
    if (seedSet && seedSet.has(nodeId)) continue;
    all.push({ nodeId, score });
  }
  // Sort descending by score; tie-break by nodeId for determinism.
  all.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.nodeId.localeCompare(b.nodeId);
  });
  return all.slice(0, k);
}

// ===========================================================================
// Convenience: undirected-graph helper
// ===========================================================================

/**
 * Convert an undirected edge list to the directed form PPR expects (each
 * undirected edge becomes two directed edges with the same weight).
 *
 * The Hebbian KG stores symmetric co-activation pairs as a single row
 * with `entity_a_id < entity_b_id`. The KG-to-PPR loader uses this
 * helper so the random walk explores in both directions.
 */
export function undirectedToDirected(
  undirected: ReadonlyArray<WeightedEdge>,
): WeightedEdge[] {
  const out: WeightedEdge[] = [];
  for (const [a, b, w] of undirected) {
    out.push([a, b, w]);
    out.push([b, a, w]);
  }
  return out;
}
