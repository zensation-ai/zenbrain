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
Promote episodic memories to semantic facts based on access patterns.

#### `decay(): Promise<{ decayed, pruned }>`
Apply Ebbinghaus decay to working memory.

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
