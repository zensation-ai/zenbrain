# API Reference

## @zensation/algorithms

Pure TypeScript, zero dependencies. All functions are stateless and side-effect free.

### FSRS (Spaced Repetition)

```typescript
import {
  getRetrievability,
  scheduleNextReview,
  updateAfterRecall,
  updateAfterForgot,
  initFromDecayClass,
  initFromSM2,
} from '@zensation/algorithms/fsrs';
```

#### `getRetrievability(state, now?): number`
Calculate current recall probability (0-1) using R = e^(-t/S).

#### `scheduleNextReview(state, targetRetention?, now?): Date`
Compute optimal next review date for target retention (default: 0.9).

#### `updateAfterRecall(state, grade, retrievability, now?, logger?): FSRSState`
Update FSRS state after successful recall. Grade: 1-5 (1=hard, 5=perfect).

#### `updateAfterForgot(state, retrievability, now?, logger?): FSRSState`
Update FSRS state after failed recall.

#### `initFromDecayClass(class, emotionalWeight?): FSRSState`
Create initial FSRS state from preset: `'permanent'` | `'slow_decay'` | `'normal_decay'` | `'fast_decay'`.

#### `initFromSM2(sm2Stability): FSRSState`
Convert SM-2 stability value to FSRS state.

#### `FSRSState`
```typescript
interface FSRSState {
  difficulty: number;  // 1.0-10.0
  stability: number;   // time constant of R = e^(-t/S): R = 1/e after S days
  nextReview: Date;
}
```

---

### Ebbinghaus (Forgetting Curves)

```typescript
import {
  calculateRetention,
  getRepetitionCandidates,
  batchCalculateRetention,
  learnDecayProfile,
  calculatePersonalizedRetention,
} from '@zensation/algorithms/ebbinghaus';
```

#### `calculateRetention(lastAccess, stability, emotionalMultiplier?): RetentionResult`
Calculate current retention using exponential decay: R = e^(-t/S).

#### `getRepetitionCandidates(facts, threshold?): RepetitionCandidate[]`
Get facts that need review, sorted by urgency.

#### `batchCalculateRetention(facts): Map<string, RetentionResult>`
Calculate retention for multiple facts in one call.

#### `learnDecayProfile(accessHistory): UserDecayProfile | null`
Learn personalized decay parameters from a user's review history.

---

### Emotional Tagging

```typescript
import {
  tagEmotion,
  computeEmotionalWeight,
  isEmotionallySignificant,
} from '@zensation/algorithms/emotional';
```

#### `tagEmotion(text, contextDomain?, logger?): EmotionalTag`
Analyze text for emotional content. Returns sentiment (-1 to +1), arousal (0-1), valence (0-1), significance (0-1).

#### `computeEmotionalWeight(tag): EmotionalWeight`
Convert emotional tag to memory consolidation parameters. Returns `consolidationWeight` (0-1) and `decayMultiplier` (1.0-3.0).

#### `isEmotionallySignificant(text, threshold?): boolean`
Quick check if text has emotional significance above threshold (default: 0.3).

---

### Hebbian Learning

```typescript
import {
  computeHebbianStrengthening,
  computeHebbianDecay,
  computeHomeostaticNormalization,
  generatePairs,
} from '@zensation/algorithms/hebbian';
```

#### `computeHebbianStrengthening(weight, logger?): number`
Asymptotic strengthening: `new = old + LR * (1 - old/MAX)`. Returns new weight.

#### `computeHebbianDecay(weight, logger?): number`
Exponential decay: `new = old * (1 - DECAY_RATE)`. Returns 0 as pruning signal.

#### `computeHomeostaticNormalization(weights, targetSum, logger?): number[]`
Scale all weights proportionally so their sum equals targetSum.

#### `generatePairs<T>(items): [T, T][]`
Generate all unique pairs C(n,2) from an array.

---

### Bayesian Confidence

```typescript
import {
  propagateForRelation,
  applyDamping,
  isSignificantChange,
} from '@zensation/algorithms/bayesian';
```

#### `propagateForRelation(base, source, weight, type, logger?): number`
Propagate confidence through a knowledge graph edge. Supports 8 relation types.

#### `applyDamping(newValue, previousValue, logger?): number`
Blend new confidence with previous value using damping factor.

---

### Context-Dependent Retrieval

```typescript
import {
  captureEncodingContext,
  calculateContextSimilarity,
} from '@zensation/algorithms/context-retrieval';
```

#### `captureEncodingContext(taskType?, logger?): EncodingContext`
Capture current context (time of day, day of week, task type).

#### `calculateContextSimilarity(encoding, current?): ContextSimilarityResult`
Calculate context match with up to 30% retrieval boost.

---

### Sleep Consolidation

```typescript
import {
  selectForReplay,
  simulateReplay,
  pruneWeakConnections,
} from '@zensation/algorithms/sleep-consolidation';
```

#### `selectForReplay(memories, config?, logger?): MemoryForConsolidation[]`
Select memories for sleep replay based on priority scoring (access count, emotional weight, recency, instability).

#### `simulateReplay(memories, config?, logger?): ConsolidationResult`
Simulate memory replay: boost stability, strengthen Hebbian edges, prune weak connections.

#### `pruneWeakConnections(edges, threshold?, logger?): { kept, pruned }`
Remove edges below weight threshold (synaptic homeostasis).

---

### Confidence Intervals

```typescript
import {
  getRetrievabilityWithCI,
  propagateWithCI,
} from '@zensation/algorithms/intervals';
```

#### `getRetrievabilityWithCI(retrievability, reviewCount): ConfidenceInterval`
Get retrievability with a heuristic Wald-type band (nominally 95 %, z = 1.96; not a calibrated confidence interval). More reviews = narrower band.

#### `propagateWithCI(base, source, weight, factor): ConfidenceInterval`
Propagate confidence with uncertainty bounds.

---

### Visualization

```typescript
import {
  generateRetentionCurve,
  generateScheduleTimeline,
} from '@zensation/algorithms/visualization';
```

#### `generateRetentionCurve(stability, days?, reviews?, emotionalMultiplier?): CurvePoint[]`
Generate forgetting-curve data points for charting. Illustrative: after a review it multiplies stability by a fixed
factor per grade instead of running the FSRS update, so the curve does not match `updateAfterRecall`.

#### `generateScheduleTimeline(initialDifficulty?, grades?): SchedulePoint[]`
Generate FSRS scheduling timeline from a simulated grade sequence.

---

### Similarity

```typescript
import {
  detectNegation,
  computeStringSimilarity,
  stripNegation,
  safeJsonParse,
} from '@zensation/algorithms/similarity';
```

#### `detectNegation(text): NegationResult`
Detect negation and extract its target (English & German).

#### `computeStringSimilarity(a, b): number`
Jaccard word-overlap similarity (0–1).

#### `stripNegation(text): string`
Remove negation words from text.

#### `safeJsonParse<T>(json, fallback, logger?): T`
Parse JSON, returning `fallback` on any error.

---

## Advanced Algorithms (v0.3)

Ten additional algorithms grounded in recent neuroscience and ML literature.
Each is a separate **zero-dependency subpath export** (`@zensation/algorithms/<name>`)
and, like the core modules, exposes pure functions.

### Prediction-Error Coupled FSRS — `./fsrs-vmPFC`

#### `computeKGPredictionError(lastEmbedding, currentEmbedding): number`
Cosine-distance prediction error between a memory's embedding at its last review and now (both arrays must be the same length).

#### `computeReEncodingFactor(predictionError, config?): number`
Map a prediction error to a re-encoding factor.

#### `computeAdaptiveFSRSInterval(baseInterval, kgPredictionError, config?): number`
Shrink the next FSRS interval when prediction error is high, extend it when low.

### Two-Factor Synaptic Hebbian — `./hebbian-two-factor`

#### `createTwoFactorEdge(u, r, v, initialWeight?, initialVariance?): TwoFactorEdge`
Create a (subject, relation, object) edge carrying both a weight and a variance.

#### `hebbianUpdateTwoFactor(edge, tagScore, activationProduct, config?): TwoFactorEdge`
Update an edge from a co-activation event using the two-factor rule.

#### `getImportance(edge): number`
Importance score used for consolidation and protection.

#### `computeEWCPenalty(edge, proposedWeight, lambda?): number`
Elastic-weight-consolidation penalty for changing a stable, important edge.

#### `decayTwoFactor(edge, baseDecayRate): TwoFactorEdge`
Importance-weighted decay (important edges decay more slowly).

### Simulation-Selection Sleep — `./sleep-simulation-selection`

#### `generateReplayCandidates(realEpisodes, counterfactualPaths): ReplayCandidate[]`
Build the replay candidate set from real and counterfactual episodes.

#### `selectAndApply(candidates, config?, ablationRegistry?): SelectionResult[]`
Score candidates and apply the selected replays.

#### `runSimulationSelectionCycle(realEpisodes, counterfactualPaths, config?, ablationRegistry?): SleepCycleResult`
Run a full simulation-selection sleep cycle.

### Spectral KG Health (Fiedler value) — `./spectral-health`

#### `computeFiedlerValue(adjacency): number`
Second-smallest Laplacian eigenvalue (algebraic connectivity) of the knowledge graph.

#### `computeSpectralHealth(adjacency, previousFiedlerValue): SpectralReport`
Health report comparing current connectivity against a previous Fiedler value.

### Information-Bottleneck Budget — `./ib-budget`

#### `ibShouldRetain(compressionCost, relevanceGain, context): boolean`
Retention decision under an Information-Bottleneck trade-off: keep when `relevanceGain × β > compressionCost`. `context` is one of
`finance` (β 0.8), `people` (0.6), `operations` (0.4) or `strategy` (0.3); anything else throws a `RangeError`.

#### `estimateCompressionCost(contentLength, uniqueEntityCount, embeddingVariance): number`
Estimate the cost of storing an item.

#### `estimateRelevanceGain(retrievalCount, avgConfidence, recency): number`
Estimate the relevance gain of keeping an item.

#### `ibFilterEpisodes(episodes, context): IBEpisode[]`
Filter a set of episodes against the retention budget.

### Dopamine-Modulated Routing — `./dopamine-routing`

#### `routeRetrieval(query, options?, context?): DifficultySignal`
Estimate query difficulty and route retrieval accordingly (reward-modulated).

### Hopfield Short-Term Memory — `./hopfield-stm`

#### `hopfieldRecall(query, patterns, options?): HopfieldRecallResult`
Modern (continuous) Hopfield associative recall over stored patterns: `ξ_new = X · softmax(β · Xᵀ · ξ)`, O(N · d)
per step. With the default single iteration the ranking in `matches` does not depend on β; the weights and
`recoveredVector` do. The default β is 16
(1 until 0.6.0): measured on random unit vectors, it puts a weight of at least 0.999 on the queried pattern up to
N = 2000 at d = 384, 768 and 1536. The β needed for 0.99 grows with the number of patterns, about ln(99 · (N − 1))
(measured 11.5 at N = 600, where the formula gives 11.0), not with d; for patterns with a typical pairwise cosine c, divide by (1 − c) — 23 at N = 600 and c = 0.5. All
numbers come from `scripts/measure-docs-numbers.mjs`.

#### `hopfieldEnergy(state, patterns, beta): number`
Energy of a state given the stored patterns.

#### `topKHopfieldMatches(result, k, minWeight?)`
Top-k matches from a recall result.

### Personalized PageRank — `./personalized-pagerank`

#### `personalizedPageRank(graph, seedNodes, options?): PPRResult`
Personalized PageRank from seed nodes over a weighted graph.

#### `topKByPageRank(result, k, options?)`
Top-k nodes by PageRank score.

### Surprise-Gradient Memory — `./surprise-gradient-memory`

A surprise EMA inspired by Titans and the free-energy principle; it computes no gradient and no free energy
(the `VFE` in the names is historical).

#### `updateVFEDelta(currentDelta, observation, options?): number`
Update a memory's surprise delta (an exponential moving average in [−1, 1]) from a new observation.

#### `applyVFERetrievalBoost(baseScore, vfeDelta, options?): number`
Boost a retrieval score by surprise: `score × (1 + α · delta)`, with the delta clamped to [−1, 1], so at most ±α
(±10 % by default).

#### `applyVFEIntervalShrink(baseInterval, vfeDelta, options?): number`
Shrink the encoding interval for surprising items.

### Temporal Multi-Route Retrieval — `./temporal-multi-route`

#### `decomposeTemporalQuery(query): DecomposedTemporalQuery`
Split a temporal query into parallel retrieval routes.

#### `fuseRoutes(routeResults, options?): FusedHit[]`
Fuse and rank results from multiple routes.

#### `runTemporalMultiRoute(query, runner, options?)`
Decompose a query, run each route via the supplied `runner`, and fuse the results.

---

## @zensation/core

### MemoryCoordinator

The recommended entry point. It creates all seven layers: `store`, `recall`, `forget` and `consolidate` work on
working, episodic, semantic, procedural and core memory; short-term memory is reached through the session methods,
cross-context memory through `getCrossContextMemory()`.

```typescript prelude=adapter
import { MemoryCoordinator } from '@zensation/core';

const memory = new MemoryCoordinator({
  storage: adapter,
  embedding: embeddingProvider,  // optional
  logger: console,               // optional
});
```

#### `store(content, options?): Promise<string>`
Route content to a memory layer and return the id of the stored memory. With `type: 'auto'` (the default) the order
is: `steps` or procedural wording ("How to …", "Steps:", "workflow:" …) → procedure; an emotional weight above 0.5
(given or detected) → episode; `confidence` above 0.9 → core block; otherwise a fact. Only episodes keep `context`.
An `emotionalWeight` you pass for a fact is not stored with it; it multiplies the fact's starting FSRS stability by
`1 + emotionalWeight` (7 at 0, 14 at 1); the first review comes after about 0.105 × stability days (≈ 0.7 and
≈ 1.5). A detected weight does not.
Every store also adds the content to working memory.

#### `recall(query, options?): Promise<RecallResult[]>`
Cross-layer search with ranked, deduplicated results (two results whose words and numbers overlap by more than
90 %, case and punctuation ignored, count as one; the higher score stays, on a tie the earlier layer in the order
episodic, semantic, procedural, core, working). Options: `layers`, `limit` (default 10; the episodic,
semantic and procedural layers are searched with it, then the merged list is cut to it), `minConfidence`
(applied before the final ranking, so fewer than `limit` results may come back; facts use their stored
confidence, procedures their success rate, core blocks count as 1, results without a confidence count as 1),
`minScore` (0 to 1, default 0: results scoring below it are left out after deduplication; any value above 0 drops
the fallbacks described below).
`core: 'matching'` returns only the core blocks that share a content word with the query (stopwords do not
count); the default `'always'` adds every core block to the candidates, where the blocks compete for `limit`
like any result (measured: 12 blocks and `limit: 10` gave 9 blocks and 1 hit). Every result carries the `id` of
the memory in its layer, next to `layer`; a result that deduplication kept over others names them in
`duplicates` (`{ id, layer }[]`, present only when there were any).

##### How scores are computed, per layer

Every result's `score` runs from 0 to 1 and says how well it matches the query; the merged list is sorted by it.
How much to trust a result is `confidence` (a fact's stored confidence, a procedure's success rate), not the score.

| Layer | With an embedding provider | Without one | Without one, when no word matches |
|---|---|---|---|
| episodic, semantic | cosine similarity of the nearest rows, a negative one counted as 0 | lexical relevance over the 500 most recent rows | the most recent rows, at 0 |
| procedural | cosine similarity of the nearest rows, a negative one counted as 0 | lexical relevance over the 500 rows with the highest success rate | the highest success rates, at 0 |
| working (on request, up to five) | cosine similarity, a negative one counted as 0 | lexical relevance over the slots | the most relevant slots, at 0 |
| core | 0.8 when a query word longer than two characters occurs in the block's label or content (substring, case ignored), else 0.5 | same | with `core: 'always'` every block comes, at 0.5 |

Without an embedding provider a layer with at least one lexical hit returns only hits; with one, it returns the
nearest rows whatever their similarity. Results at 0 come after every hit and keep a recall from coming back empty
for a reason the caller cannot see; `minScore` above 0 leaves them out. Core blocks are the exception to
"one scale": with `core: 'always'` a block that shares no word with the query still scores 0.5 and ranks above
lexical hits below 0.5; use `core: 'matching'` to get only the blocks that share a content word. Until 0.6.0 the
vector path returned −1 to 1, a procedure that matched nothing scored its success rate (up to 1), and working memory
without an embedding provider ignored the query.

#### `forget(id, layer, options?): Promise<boolean>`
Delete a memory, addressed by the `id` and `layer` of a recall result, together with what consolidation linked to it.
Returns `true` if the addressed memory was deleted, `false` if the layer holds no memory with that id (an id that
is not a UUID counts as unknown, not as an error). Nothing in long-term memory is deleted on its own.

The cascade (`cascade: true`, the default since 0.6.0) follows the edge `consolidate()` records:

| Forgotten | Also deleted |
|---|---|
| an episode | the fact consolidated from it, and the working-memory copies of both |
| a fact | every episode consolidated into it, and the working-memory copies of all of them |
| a procedure or core block | its working-memory copy |
| a working-memory result | nothing: the slot is a copy, and forgetting it does not reach into long-term memory |

The edge is the episode's `consolidatedInto` mark, written by `consolidate()` since 0.4.8 and found in existing
databases without a schema change. An episode promoted before 0.4.8 is linked only once a later `consolidate()`
finds its verbatim fact (among the 100 most recent episodes); one an LLM distilled before 0.4.8 has no edge. A fact
an LLM distilled since then is linked like any other — the cascade follows the recorded edge and does not search for
memories that say something similar. `consolidate()` links a second episode with the same text to the fact the
first one became instead of copying it again (also a fact stored with source `'consolidation'` and that exact text):
forgetting one of those episodes keeps the other, forgetting the fact deletes both. A memory stored on its own and
never linked keeps its long-term entry (`RecallResult.duplicates` names such copies). Working-memory copies are the
slot `store()` created for each deleted memory in this process and, for episodes, facts and core blocks, any slot
holding exactly their content; a procedure keeps only its first 200 characters, so only its own slot goes. On equal
scores recall keeps and lists long-term memories before the working-memory copy (episodic, semantic, procedural,
core, then working), so the result to forget is a long-term one; forgetting a working-memory slot deletes only the
slot. `{ cascade: false }`
deletes only the addressed memory (the behaviour before 0.6.0); an episode keeps its mark, so a later
`consolidate()` does not promote it again. To correct a memory, forget it and store the corrected version.

#### `forgetWithDerived(id, layer, options?): Promise<{ removed, alsoForgotten }>`
`forget()`, and in addition `alsoForgotten: { id, layer }[]`, every other memory the cascade deleted. Linked
memories are deleted before the addressed one, so a call repeated after a failure still deletes the remaining
long-term memories; working-memory copies of what the failed call deleted may remain, and the repeated call does
not list what the failed one deleted.

#### `consolidate(): Promise<ConsolidationResult>`
Promote emotionally significant episodes (weight above 0.5, among the 100 most recent) to semantic
facts, each episode once, and decay working memory. Deletes nothing from long-term memory:
`pruned` is always 0.

#### `decay(): { removed: number }`
Apply exponential decay to working-memory slots for the minutes since each was last decayed; returns how many fell
to a relevance of 0.01 or below and were removed. Long-term memory is not touched.

#### `getReviewQueue(limit?): Promise<{ id, content, confidence }[]>`
Semantic facts whose FSRS review is due. Nothing reviews them on its own: report each review with `recordReview`.

#### `recordReview(factId, grade): Promise<boolean>`
Record a review of a semantic fact and update its FSRS state. `grade` is an integer from 1 to 5: 1 and 2 count as
forgotten, 3 to 5 as recalled (3 neutral, 5 perfect); anything else throws a `RangeError`. Returns `false` if no fact
has that id.

#### `getHealth(): Promise<MemoryHealth>`
Counts from six layers (cross-context memory has no counter): working-memory slots in use and the limit, short-term
interactions, episodes, facts and how many are due for review, procedures, core blocks.

---

### Individual Layers

Each layer can be used independently without the coordinator.

| Layer | Class | Requires Storage |
|-------|-------|-----------------|
| Working | `WorkingMemory` | No (in-memory) |
| Short-Term | `ShortTermMemory` | No (in-memory) |
| Episodic | `EpisodicMemory` | Yes |
| Semantic | `SemanticMemory` | Yes |
| Procedural | `ProceduralMemory` | Yes |
| Core | `CoreMemory` | Yes |
| Cross-Context | `CrossContextMemory` | Yes |

See the source code for detailed method signatures.

---

## @zensation/adapter-postgres

```typescript
import { PostgresAdapter } from '@zensation/adapter-postgres';

const adapter = new PostgresAdapter({
  connectionString: 'postgresql://user:pass@localhost:5432/mydb',
  schema: 'personal',  // optional: schema isolation
  maxConnections: 8,
  ssl: true,
});
```

Features: pgvector support, connection pooling, schema isolation, auto-retry for transient errors.

---

## @zensation/adapter-sqlite

```typescript
import { SqliteAdapter } from '@zensation/adapter-sqlite';

const adapter = new SqliteAdapter({
  filename: './my-memory.db',  // default: './zenbrain.db'
});
```

Features: zero-config, WAL mode, auto-translates PostgreSQL queries.
