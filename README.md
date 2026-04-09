<p align="center">
  <h1 align="center">ZenBrain</h1>
  <p align="center"><strong>The neuroscience-inspired memory system for AI agents.</strong></p>
  <p align="center">7 memory layers. FSRS spaced repetition. Hebbian learning. Emotional tagging. Sleep consolidation.<br/>Pure TypeScript. Zero dependencies. 276 tests. Battle-tested in production.</p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@zensation/algorithms"><img src="https://img.shields.io/npm/v/@zensation/algorithms?color=blue&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@zensation/algorithms"><img src="https://img.shields.io/npm/dm/@zensation/algorithms?color=blue" alt="npm downloads"></a>
  <a href="https://github.com/zensation-ai/zenbrain/stargazers"><img src="https://img.shields.io/github/stars/zensation-ai/zenbrain?style=social" alt="GitHub stars"></a>
  <a href="https://github.com/zensation-ai/zenbrain/actions/workflows/ci.yml"><img src="https://github.com/zensation-ai/zenbrain/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/zensation-ai/zenbrain/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7+-blue.svg" alt="TypeScript"></a>
  <a href="#"><img src="https://img.shields.io/badge/dependencies-0-brightgreen.svg" alt="Zero Dependencies"></a>
  <a href="https://doi.org/10.5281/zenodo.19353663"><img src="https://zenodo.org/badge/DOI/10.5281/zenodo.19353663.svg" alt="DOI"></a>
  <a href="https://huggingface.co/alexanderbering/zenbrain"><img src="https://img.shields.io/badge/%F0%9F%A4%97_HuggingFace-Model_Card-yellow" alt="HuggingFace"></a>
  <a href="https://discord.gg/YKVTHaXK"><img src="https://img.shields.io/discord/1485937855447695443?color=7289da&label=Discord&logo=discord&logoColor=white" alt="Discord"></a>
  <a href="https://x.com/zensationai"><img src="https://img.shields.io/twitter/follow/zensationai?style=social" alt="Follow on X"></a>
</p>

---

<p align="center">
  <img src="docs/demo.gif" alt="ZenBrain Playground Demo" width="700"/>
</p>

> **Your AI forgets everything after every conversation.** ZenBrain fixes that — with the same mechanisms your brain uses: spaced repetition, emotional consolidation, Hebbian strengthening, and exponential forgetting curves. Not a vector database with a wrapper. Actual neuroscience.

---

## Why ZenBrain?

Every AI memory system today is a key-value store or a vector database with a thin layer on top. Human memory doesn't work that way. Your brain has specialized systems for different types of memory, active forgetting mechanisms, emotional modulation, and context-dependent retrieval.

ZenBrain brings these mechanisms to AI agents:

| Feature | ZenBrain | Mem0 | Letta | Zep |
|---------|:--------:|:----:|:-----:|:---:|
| Memory Layers | **7** | 2 | 3 | 2 |
| Memory Coordinator | :white_check_mark: | :x: | :x: | :x: |
| Spaced Repetition (FSRS) | :white_check_mark: | :x: | :x: | :x: |
| Hebbian Learning | :white_check_mark: | :x: | :x: | :x: |
| Emotional Memory | :white_check_mark: | :x: | :x: | :x: |
| Sleep Consolidation | :white_check_mark: | :x: | :x: | :x: |
| Ebbinghaus Forgetting Curves | :white_check_mark: | :x: | :x: | :x: |
| Bayesian Confidence Propagation | :white_check_mark: | :x: | :x: | :x: |
| Context-Dependent Retrieval | :white_check_mark: | :x: | :x: | :x: |
| Confidence Intervals | :white_check_mark: | :x: | :x: | :x: |
| Retention Curve Visualization | :white_check_mark: | :x: | :x: | :x: |
| TypeScript Native | :white_check_mark: | :white_check_mark: | :x: | :x: |
| Zero Dependencies (core) | :white_check_mark: | :x: | :x: | :x: |
| Self-Hosted | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |

> Mem0 raised $24M. Letta raised $10M. ZenBrain has 7 layers, they have 2-3. This is the deepest open-source memory system for AI agents.

## Quick Start

```bash
npm install @zensation/algorithms
```

```typescript
import {
  initFromDecayClass,
  getRetrievability,
  updateAfterRecall,
  tagEmotion,
  computeEmotionalWeight,
  computeHebbianStrengthening,
  propagateForRelation,
} from '@zensation/algorithms';

// 1. Schedule a memory with FSRS
const memory = initFromDecayClass('normal_decay');

// 2. Check recall probability (Ebbinghaus curve)
const retention = getRetrievability(memory);
console.log(`Recall probability: ${(retention * 100).toFixed(1)}%`);

// 3. User recalled it — update scheduling
const updated = updateAfterRecall(memory, 4, retention);
// Stability increased, next review pushed further out

// 4. Tag emotional significance
const emotion = tagEmotion('I just closed a $2M deal!');
const weight = computeEmotionalWeight(emotion);
console.log(`Decay multiplier: ${weight.decayMultiplier}x`);
// ~2.7x — emotional memories decay nearly 3x slower

// 5. Strengthen knowledge connections (Hebbian)
const stronger = computeHebbianStrengthening(1.0);
// 1.09 — "neurons that fire together wire together"

// 6. Propagate confidence through your knowledge graph
const confidence = propagateForRelation(0.5, 0.8, 1.0, 'supports');
// 0.9 — supporting evidence increases confidence
```

## The Science Behind It

### 7-Layer Memory Architecture

```
Layer 7: Cross-Context Memory    ← Shared knowledge across domains
Layer 6: Core Memory             ← Pinned facts (Letta-style)
Layer 5: Procedural Memory       ← "How to do X" (skills & workflows)
Layer 4: Long-Term Semantic      ← Facts with FSRS scheduling
Layer 3: Episodic Memory         ← Concrete experiences & events
Layer 2: Short-Term / Session    ← Current conversation context
Layer 1: Working Memory          ← Active task focus (7±2 items)
```

Each layer has different retention characteristics, consolidation rules, and retrieval mechanisms — just like the human brain.

### FSRS Spaced Repetition

[FSRS](https://github.com/open-spaced-repetition/fsrs4anki) (Free Spaced Repetition Scheduler) outperforms SM-2 by 30%. It uses the **desirable difficulty** principle: reviewing when retention is low gives a bigger stability boost. Your AI reviews important facts at optimal intervals — never too early (wasteful), never too late (forgotten).

### Emotional Memory

The amygdala modulates memory consolidation — emotional events are remembered more vividly (flashbulb memory). ZenBrain's emotional tagger assigns arousal, valence, and significance scores using a 400+ keyword lexicon (English & German). Emotional memories get up to **3x longer** decay half-lives.

### Hebbian Learning

"Neurons that fire together wire together" (Hebb, 1949). Knowledge graph edges that are frequently co-activated grow stronger. Unused edges decay and eventually get pruned. The result: a self-organizing knowledge structure that reflects actual usage patterns, with homeostatic normalization to prevent runaway growth.

### Ebbinghaus Forgetting Curves

Ebbinghaus (1885) showed that memory decays exponentially: `R = e^(-t/S)`. ZenBrain implements personalized decay profiles that adapt to individual learning patterns, with SM-2 compatibility for existing spaced repetition systems.

### Context-Dependent Retrieval

Tulving's Encoding Specificity Principle (1973): memories are recalled better when the retrieval context matches the encoding context. ZenBrain captures temporal context (time of day, day of week) and task type at encoding time, providing up to a **30% retrieval boost** when contexts match.

### Bayesian Confidence Propagation

Knowledge isn't isolated — facts support or contradict each other. ZenBrain propagates confidence through your knowledge graph using Bayesian belief updates: supporting evidence increases confidence, contradictions decrease it, with damping for numerical stability.

### Sleep Consolidation *(New — unique to ZenBrain)*

During sleep, the hippocampus replays recent experiences, strengthening important memories and pruning weak connections (Stickgold & Walker, 2013). ZenBrain simulates this process: `selectForReplay()` prioritizes emotional and recently-accessed memories, `simulateReplay()` boosts their stability by 50%, and `pruneWeakConnections()` removes weak Hebbian edges — implementing the Synaptic Homeostasis Hypothesis (Tononi & Cirelli, 2006).

```typescript
import { selectForReplay, simulateReplay } from '@zensation/algorithms/sleep-consolidation';

// Select memories for overnight consolidation
const toReplay = selectForReplay(allMemories);
// Simulate sleep replay — stability ↑, weak edges pruned
const result = simulateReplay(toReplay);
console.log(`Replayed ${result.summary.totalReplayed} memories, avg stability +${result.summary.avgStabilityIncrease.toFixed(1)} days`);
```

### Memory Coordinator *(New)*

The `MemoryCoordinator` orchestrates all 7 layers into a single cohesive system — inspired by Global Workspace Theory (Baars, 1988):

```typescript
import { MemoryCoordinator } from '@zensation/core';

const memory = new MemoryCoordinator({ storage: adapter, embedding: embedder });

// Auto-routes to the right layer (semantic, episodic, procedural, or core)
await memory.store('User prefers TypeScript', { type: 'auto' });

// Cross-layer search with ranked, deduplicated results
const results = await memory.recall('programming preferences');

// Consolidate: promote episodic → semantic, apply decay
await memory.consolidate();

// FSRS review queue across all layers
const dueItems = await memory.getReviewQueue();
```

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [`@zensation/algorithms`](./packages/algorithms) | 12 neuroscience algorithms (FSRS, Hebbian, Ebbinghaus, emotional, Bayesian, sleep consolidation, confidence intervals, visualization) | :white_check_mark: Published |
| [`@zensation/core`](./packages/core) | Memory layers, coordinator, adapter interfaces | :white_check_mark: Published |
| [`@zensation/adapter-postgres`](./packages/adapters/postgres) | PostgreSQL + pgvector storage adapter | :white_check_mark: Ready |
| [`@zensation/adapter-sqlite`](./packages/adapters/sqlite) | SQLite storage adapter (zero-config) | :white_check_mark: Ready |

### Tree-Shakeable Imports

Every algorithm is available as a subpath export:

```typescript
// Import everything
import { tagEmotion, updateAfterRecall } from '@zensation/algorithms';

// Or just what you need (better tree-shaking)
import { updateAfterRecall } from '@zensation/algorithms/fsrs';
import { tagEmotion } from '@zensation/algorithms/emotional';
import { computeHebbianStrengthening } from '@zensation/algorithms/hebbian';
import { propagateForRelation } from '@zensation/algorithms/bayesian';
import { selectForReplay } from '@zensation/algorithms/sleep-consolidation';
import { getRetrievabilityWithCI } from '@zensation/algorithms/intervals';
import { generateRetentionCurve } from '@zensation/algorithms/visualization';
```

## Use Cases

### AI Chatbots with Long-Term Memory

```typescript
import { updateAfterRecall, getRetrievability, scheduleNextReview } from '@zensation/algorithms/fsrs';
import { tagEmotion, computeEmotionalWeight } from '@zensation/algorithms/emotional';

// When your AI learns a fact about the user:
function rememberFact(fact: string) {
  const memory = initFromDecayClass('normal_decay');
  const emotion = tagEmotion(fact);
  const weight = computeEmotionalWeight(emotion);

  // Emotional facts get longer retention
  return {
    ...memory,
    emotionalWeight: weight.consolidationWeight,
    decayMultiplier: weight.decayMultiplier,
  };
}

// Before each conversation, check what needs reinforcement:
function getFactsDueForReview(facts: MemoryState[]) {
  return facts.filter(f => getRetrievability(f) < 0.7);
}
```

### Knowledge Graph with Self-Organizing Edges

```typescript
import { computeHebbianStrengthening, computeHebbianDecay } from '@zensation/algorithms/hebbian';
import { propagateForRelation } from '@zensation/algorithms/bayesian';

// When two concepts are mentioned together:
function coActivate(edge: { weight: number }) {
  edge.weight = computeHebbianStrengthening(edge.weight);
}

// Periodic maintenance — decay unused edges:
function decayEdges(edges: { weight: number; lastUsed: Date }[]) {
  for (const edge of edges) {
    edge.weight = computeHebbianDecay(edge.weight);
    // Edges below MIN_WEIGHT (0.1) can be pruned
  }
}
```

### RAG with Confidence Scoring

```typescript
import { propagateForRelation, isSignificantChange } from '@zensation/algorithms/bayesian';

// After retrieval, propagate confidence through related facts:
function updateConfidenceGraph(facts: Fact[], relations: Relation[]) {
  for (const rel of relations) {
    const newConf = propagateForRelation(
      rel.target.confidence,
      rel.source.confidence,
      rel.weight,
      rel.type // 'supports' | 'contradicts' | 'related_to'
    );
    if (isSignificantChange(newConf, rel.target.confidence)) {
      rel.target.confidence = newConf;
    }
  }
}
```

## Extracted From Production

ZenBrain's algorithms are extracted from [ZenAI](https://zensation.ai) — a production AI platform with:

- **322,000+** lines of TypeScript
- **11,589** passing tests (ZenAI) + **276** tests (ZenBrain)
- **60** AI tools across 14 categories
- **7-layer** HiMeS memory architecture
- **Phase 145** of active development

These aren't toy implementations. They've been battle-tested with real users, real data, and real edge cases.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

**Resources:** [API Reference](./docs/api-reference.md) | [Architecture](./docs/architecture.md) | [Benchmarks](./docs/benchmarks.md) | [FAQ](./docs/FAQ.md) | [Roadmap](./docs/ROADMAP.md)

```bash
# Clone the repo
git clone https://github.com/zensation-ai/zenbrain.git
cd zenbrain

# Install dependencies
npm install

# Run tests
npm test

# Build all packages
npm run build
```

## Research

ZenBrain's architecture and algorithms are documented in a peer-reviewed technical disclosure:

- **Paper:** [ZenBrain: A Neuroscience-Inspired 7-Layer Memory Architecture for Autonomous AI Systems](https://zenodo.org/records/19481262) (Zenodo, DOI: [10.5281/zenodo.19353663](https://doi.org/10.5281/zenodo.19353663))
- **TDCommons:** [Technical Disclosure](https://www.tdcommons.org/dpubs_series/9683) (CC BY 4.0)
- **HuggingFace:** [Model Card & Benchmarks](https://huggingface.co/alexanderbering/zenbrain)

If you use ZenBrain in academic work, please cite:

```bibtex
@misc{bering2026zenbrain,
  title   = {ZenBrain: A Neuroscience-Inspired 7-Layer Memory Architecture for Autonomous AI Systems},
  author  = {Bering, Alexander},
  year    = {2026},
  doi     = {10.5281/zenodo.19353663},
  url     = {https://doi.org/10.5281/zenodo.19353663},
  publisher = {Zenodo}
}
```

## Community

- **Discord**: [ZenBrain Community](https://discord.gg/YKVTHaXK) — help, show-and-tell, feature requests
- **Twitter/X**: [@zensationai](https://x.com/zensationai) — updates, launches, AI memory discussions
- **GitHub Issues**: [Bug reports & feature requests](https://github.com/zensation-ai/zenbrain/issues)
- **Email**: open-source@zensation.ai

## License

[Apache 2.0](./LICENSE) — use it in production, modify it, distribute it. Just keep the attribution.

---

<p align="center">
  Built by <a href="https://zensation.ai">ZenSation</a> in Kiel, Germany.
</p>
