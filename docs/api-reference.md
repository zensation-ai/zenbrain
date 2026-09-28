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
  stability: number;   // days until retention drops to target
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
Get retrievability with 95% confidence interval. More reviews = narrower interval.

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
Generate Ebbinghaus forgetting curve data points for charting.

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
Retention decision under an Information-Bottleneck trade-off.

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
Modern (continuous) Hopfield associative recall over stored patterns.

#### `hopfieldEnergy(state, patterns, beta): number`
Energy of a state given the stored patterns.

#### `topKHopfieldMatches(result, k, minWeight?)`
Top-k matches from a recall result.

### Personalized PageRank — `./personalized-pagerank`

#### `personalizedPageRank(graph, seedNodes, options?): PPRResult`
Personalized PageRank from seed nodes over a weighted graph.

#### `topKByPageRank(result, k, options?)`
Top-k nodes by PageRank score.

### Surprise-Gradient (Variational Free Energy) Memory — `./surprise-gradient-memory`

#### `updateVFEDelta(currentDelta, observation, options?): number`
Update a memory's variational-free-energy delta from a new observation.

#### `applyVFERetrievalBoost(baseScore, vfeDelta, options?): number`
Boost a retrieval score by surprise (VFE delta).

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

The recommended entry point. Orchestrates all 7 layers.

```typescript
import { MemoryCoordinator } from '@zensation/core';

const memory = new MemoryCoordinator({
  storage: adapter,
  embedding: embeddingProvider,  // optional
  logger: console,               // optional
});
```

#### `store(content, options?): Promise<{ layer, id }>`
Route content to the appropriate memory layer. Auto-detects type when `type: 'auto'`.

#### `recall(query, options?): Promise<RecallResult[]>`
Cross-layer search with ranked, deduplicated results.

#### `consolidate(): Promise<ConsolidationResult>`
Promote emotionally significant episodes (weight above 0.5, among the 100 most recent) to semantic
facts, each episode once, and decay working memory. Deletes nothing from long-term memory:
`pruned` is always 0.

#### `decay(): { removed: number }`
Apply Ebbinghaus decay to working memory; returns how many slots were evicted.

#### `getReviewQueue(limit?): Promise<RecallResult[]>`
Get FSRS-due items for spaced repetition review.

#### `recordReview(factId, grade): Promise<void>`
Record recall grade (1-5) for a semantic fact.

#### `getHealth(): Promise<MemoryHealth>`
Get statistics from all memory layers.

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
