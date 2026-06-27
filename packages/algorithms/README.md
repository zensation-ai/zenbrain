# @zensation/algorithms

> Neuroscience-inspired memory algorithms for AI agents. Pure TypeScript. Zero dependencies.

[![npm](https://img.shields.io/npm/v/@zensation/algorithms)](https://www.npmjs.com/package/@zensation/algorithms)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../../LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](#)

## What's Inside

**20 algorithm modules** (10 core + 10 advanced), extracted from a production AI platform and published as standalone, dependency-free modules. Pure TypeScript, zero runtime dependencies, tree-shakeable subpath exports, 429 tests.

> ZenBrain's full architecture is **15 neuroscience-inspired mechanisms (9 foundational + 6 PMA)** ([paper](https://arxiv.org/abs/2604.23878)). The 6 PMA components are proprietary; this open-source package ships the algorithm library described below.

### Core (10 algorithms — since v0.2.x)

| Algorithm | Inspired By | What It Does |
|-----------|------------|--------------|
| **FSRS** | [Free Spaced Repetition Scheduler](https://github.com/open-spaced-repetition/fsrs4anki) | Optimal review scheduling — your AI never forgets what matters |
| **Ebbinghaus** | [Ebbinghaus (1885)](https://en.wikipedia.org/wiki/Forgetting_curve) | Exponential forgetting curves with personalized decay profiles |
| **Emotional** | [Amygdala modulation](https://en.wikipedia.org/wiki/Emotion_and_memory) (Cahill & McGaugh, 1998) | Arousal/valence/significance tagging — emotional memories decay 3× slower |
| **Hebbian** | [Hebb's Rule](https://en.wikipedia.org/wiki/Hebbian_theory) (1949) | Co-activation strengthening with homeostatic normalization |
| **Bayesian** | [Bayesian belief propagation](https://en.wikipedia.org/wiki/Belief_propagation) | Confidence propagation through knowledge graphs |
| **Context Retrieval** | [Encoding Specificity](https://en.wikipedia.org/wiki/Encoding_specificity_principle) (Tulving, 1973) | Context-dependent retrieval boost when contexts match |
| **Similarity** | NLP heuristics | Negation detection (EN/DE), Jaccard similarity, text analysis |
| **Sleep Consolidation** | Stickgold & Walker (2013) | Replay simulation — strengthens emotional/recent memories, prunes weak edges |
| **Intervals** | Statistics | 95 % confidence intervals on retrievability and propagation |
| **Visualization** | — | Export retention curves and FSRS schedules for charting |
| (plus shared `types`) | — | Logger interface, common typedefs |

### Advanced algorithms (10 algorithms — new in v0.3.0)

Each is a separate sub-path import. Grounded in recent neuroscience and ML literature:

| Algorithm | Sub-path | Inspired by |
|-----------|----------|-------------|
| **Prediction-Error coupled FSRS** | `./fsrs-vmPFC` | Zou et al. 2025, vmPFC re-encoding |
| **Two-Factor Synaptic Hebbian** | `./hebbian-two-factor` | Zenke et al. 2025, two-factor consolidation |
| **Simulation-Selection Sleep Loop** | `./sleep-simulation-selection` | Frontiers Comp. Neurosci. 2025, RL replay |
| **Spectral KG Health (Fiedler value)** | `./spectral-health` | Algebraic graph theory |
| **Information-Bottleneck Budget** | `./ib-budget` | MemFly 2026, IB-based retention |
| **Dopamine-Modulated Routing** | `./dopamine-routing` | Reward-modulated retrieval routing |
| **Hopfield Short-Term Memory** | `./hopfield-stm` | Modern Hopfield networks |
| **Personalized PageRank** | `./personalized-pagerank` | Graph propagation |
| **Surprise-Gradient (Variational FE) Memory** | `./surprise-gradient-memory` | Free-energy principle |
| **Temporal Multi-Route Retrieval** | `./temporal-multi-route` | Decomposed temporal queries |

## Quick Start

```bash
npm install @zensation/algorithms
```

```typescript
import {
  // FSRS Spaced Repetition
  initFromDecayClass,
  getRetrievability,
  updateAfterRecall,
  scheduleNextReview,

  // Emotional Memory
  tagEmotion,
  computeEmotionalWeight,

  // Hebbian Learning
  computeHebbianStrengthening,
  computeHebbianDecay,

  // Bayesian Confidence
  propagateForRelation,
} from '@zensation/algorithms';

// 1. Create a memory with FSRS scheduling
const memory = initFromDecayClass('normal_decay');
console.log(memory);
// { difficulty: 5, stability: 7, nextReview: Date }

// 2. A week later, check recall probability (Ebbinghaus decay)
const aWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const retention = getRetrievability(memory, aWeekLater);
console.log(`Recall probability: ${(retention * 100).toFixed(1)}%`);
// ~36.8% — retrievability has decayed over the week

// 3. User recalled it anyway with grade 4 (good)
const updated = updateAfterRecall(memory, 4, retention, aWeekLater);
console.log(`Stability: ${memory.stability} -> ${updated.stability.toFixed(2)}`);
// 7 -> 8.19 — recalling at low retrievability gives a bigger boost (desirable difficulty)

// 4. Tag emotional significance
const emotion = tagEmotion('I am absolutely thrilled — I got the promotion!');
console.log(emotion);
// { sentiment: 0.55, arousal: 0.35, valence: 0.78, significance: 0.85 }

const weight = computeEmotionalWeight(emotion);
console.log(`Decay multiplier: ${weight.decayMultiplier}x`);
// 2.7x — this memory will decay nearly 3x slower

// 5. Strengthen knowledge graph edges via Hebbian learning
const newWeight = computeHebbianStrengthening(1.0);
// 1.09 — asymptotic growth toward MAX_WEIGHT (10.0)

// 6. Propagate confidence through relations
const newConfidence = propagateForRelation(
  0.5,   // base confidence
  0.8,   // source confidence
  1.0,   // edge weight
  'supports'
);
// 0.9 — supporting evidence increases confidence
```

## Tree-Shakeable Imports

Import only what you need:

```typescript
// Just FSRS
import { updateAfterRecall, getRetrievability } from '@zensation/algorithms/fsrs';

// Just emotional tagging
import { tagEmotion } from '@zensation/algorithms/emotional';

// Just Hebbian dynamics
import { computeHebbianStrengthening } from '@zensation/algorithms/hebbian';
```

## Why These Algorithms?

### FSRS vs SM-2

SM-2 (SuperMemo 2, 1990) uses fixed multipliers. FSRS uses the **desirable difficulty** principle: reviewing when retention is low gives a *bigger* stability boost. The result? 30% fewer reviews for the same retention.

### Emotional Memory

Human brains consolidate emotional memories more strongly (flashbulb memory effect). This module gives your AI the same capability: memories tagged with high arousal + significance get up to **3x longer** decay half-life.

### Hebbian Learning

Knowledge graph edges that are frequently co-activated grow stronger. Edges that are never used decay and get pruned. The result is a self-organizing knowledge structure that reflects actual usage patterns.

### Context-Dependent Retrieval

Tulving showed that memory recall improves when the retrieval context matches the encoding context. This module captures temporal + task context at encoding time and provides up to a **30% retrieval boost** when contexts match.

## API Reference

### FSRS (`@zensation/algorithms/fsrs`)

| Function | Description |
|----------|-------------|
| `initFromDecayClass(class, emotionalWeight?)` | Create initial state from decay class |
| `initFromSM2(stability)` | Convert SM-2 stability to FSRS state |
| `getRetrievability(state, now?)` | Calculate current recall probability |
| `scheduleNextReview(state, targetRetention?, now?)` | Schedule next optimal review |
| `updateAfterRecall(state, grade, retrievability, now?)` | Update after successful recall (grade 1-5) |
| `updateAfterForgot(state, retrievability, now?)` | Update after failed recall |
| `updateStabilityCompat(stability, success, multiplier?)` | Drop-in SM-2 replacement |
| `getRetentionProbabilityCompat(lastAccess, stability, multiplier?)` | Drop-in Ebbinghaus replacement |

### Ebbinghaus (`@zensation/algorithms/ebbinghaus`)

| Function | Description |
|----------|-------------|
| `calculateRetention(lastAccess, stability, emotionalMultiplier?)` | Full retention analysis |
| `updateStability(stability, success)` | SM-2 stability update |
| `getRepetitionCandidates(facts, threshold?)` | Find facts due for review |
| `calculateOptimalInterval(stability, targetRetention?)` | Optimal review interval |
| `batchCalculateRetention(facts)` | Efficient batch retention |
| `learnDecayProfile(history)` | Personalized decay curves |
| `calculatePersonalizedRetention(lastAccess, stability, profile)` | User-specific retention |

### Emotional (`@zensation/algorithms/emotional`)

| Function | Description |
|----------|-------------|
| `tagEmotion(text, contextDomain?)` | Multi-dimensional emotion analysis |
| `computeEmotionalWeight(tag)` | Consolidation weight + decay multiplier |
| `isEmotionallySignificant(text, threshold?)` | Quick significance check |
| `computeContextualValence(text, domain)` | Domain-adjusted valence |

### Hebbian (`@zensation/algorithms/hebbian`)

| Function | Description |
|----------|-------------|
| `computeHebbianStrengthening(weight)` | Asymptotic edge strengthening |
| `computeHebbianDecay(weight)` | Exponential decay with pruning |
| `computeHomeostaticNormalization(weights, targetSum)` | Normalize weight distribution |
| `generatePairs(items)` | Generate C(n,2) co-activation pairs |

### Bayesian (`@zensation/algorithms/bayesian`)

| Function | Description |
|----------|-------------|
| `propagateForRelation(base, source, weight, type)` | Single-edge confidence propagation |
| `applyDamping(newValue, previousValue)` | Blend with previous for stability |
| `isSignificantChange(newValue, previousValue)` | Check if update is worth persisting |

### Context Retrieval (`@zensation/algorithms/context-retrieval`)

| Function | Description |
|----------|-------------|
| `captureEncodingContext(taskType?)` | Snapshot current context |
| `calculateContextSimilarity(encoding, current?)` | Context match score + boost |
| `serializeContext(ctx)` / `deserializeContext(data)` | Storage helpers |

### Similarity (`@zensation/algorithms/similarity`)

| Function | Description |
|----------|-------------|
| `detectNegation(text)` | Detect negation with target extraction (EN/DE) |
| `computeStringSimilarity(a, b)` | Jaccard word overlap similarity |
| `stripNegation(text)` | Remove negation words |
| `safeJsonParse(json, fallback)` | Safe JSON parsing with fallback |

## Logging

All functions accept an optional `Logger` parameter. Pass `console`, your favorite logger, or nothing (silent by default):

```typescript
import { updateAfterRecall } from '@zensation/algorithms';

// Silent (default)
updateAfterRecall(state, 4, 0.9);

// With logging
updateAfterRecall(state, 4, 0.9, new Date(), console);
```

## Research

These algorithms are documented in an open-access technical disclosure: [ZenBrain: A Neuroscience-Inspired 7-Layer Memory Architecture](https://doi.org/10.5281/zenodo.19353663) (Zenodo). See also: [HuggingFace Model Card](https://huggingface.co/alexanderbering/zenbrain).

## Part of ZenBrain

This package is part of the [ZenBrain](https://github.com/zensation-ai/zenbrain) monorepo — the neuroscience-inspired memory system for AI agents.

| Package | Description |
|---------|-------------|
| **@zensation/algorithms** | Pure algorithms (this package) |
| `@zensation/core` | Memory layers + coordinator |
| `@zensation/adapter-postgres` | PostgreSQL + pgvector storage |
| `@zensation/adapter-sqlite` | SQLite + sqlite-vec storage |

## License

Apache 2.0 — see [LICENSE](../../LICENSE).
