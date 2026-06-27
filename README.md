<p align="center">
  <h1 align="center">ZenBrain</h1>
  <p align="center"><strong>The neuroscience-inspired memory system for AI agents.</strong></p>
  <p align="center">7 memory layers. Real neuroscience — FSRS, Hebbian, sleep consolidation, emotional tagging, plus 10 advanced research modules (vmPFC-FSRS, two-factor Hebbian, simulation-selection sleep, Fiedler-value KG health, IB budget, Hopfield STM, ...).<br/>Pure TypeScript. Zero dependencies. 528 tests. Extracted from a production AI platform.</p>
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
  <a href="https://arxiv.org/abs/2604.23878"><img src="https://img.shields.io/badge/arXiv-2604.23878-b31b1b.svg" alt="arXiv"></a>
  <a href="https://orcid.org/0009-0001-1793-012X"><img src="https://img.shields.io/badge/ORCID-0009--0001--1793--012X-A6CE39?logo=orcid&logoColor=white" alt="ORCID"></a>
  <a href="https://huggingface.co/alexanderbering/zenbrain"><img src="https://img.shields.io/badge/%F0%9F%A4%97_HuggingFace-Model_Card-yellow" alt="HuggingFace"></a>
  <a href="https://discord.gg/YKVTHaXK"><img src="https://img.shields.io/discord/1485937855447695443?color=7289da&label=Discord&logo=discord&logoColor=white" alt="Discord"></a>
  <a href="https://x.com/zensationai"><img src="https://img.shields.io/twitter/follow/zensationai?style=social" alt="Follow on X"></a>
</p>

---

<p align="center">
  <img src="docs/demo.gif" alt="ZenBrain Playground Demo" width="700"/>
</p>

<details>
<summary><strong>📄 Paper & Citation</strong> — ZenBrain: A Neuroscience-Inspired 7-Layer Memory Architecture for Autonomous AI Systems</summary>

<br/>

- **arXiv preprint** (cs.AI): [arxiv.org/abs/2604.23878](https://arxiv.org/abs/2604.23878)
- **Open-access archive** (Zenodo / CERN): [doi.org/10.5281/zenodo.19353663](https://doi.org/10.5281/zenodo.19353663)
- **Reproducibility artifacts** (Zenodo): [doi.org/10.5281/zenodo.19481262](https://doi.org/10.5281/zenodo.19481262)
- **ORCID**: [0009-0001-1793-012X](https://orcid.org/0009-0001-1793-012X)
- **License**: CC BY 4.0 (paper) · Apache-2.0 (code)

```bibtex
@misc{bering2026zenbrain,
  title         = {ZenBrain: A Neuroscience-Inspired 7-Layer Memory Architecture for Autonomous AI Systems},
  author        = {Bering, Alexander},
  year          = {2026},
  eprint        = {2604.23878},
  archivePrefix = {arXiv},
  primaryClass  = {cs.AI},
  doi           = {10.5281/zenodo.19353663},
  url           = {https://arxiv.org/abs/2604.23878}
}
```

Feedback, replications, and counter-results are explicitly welcome — please open an issue or reach out via [research@zensation.ai](mailto:research@zensation.ai).

</details>

> **Your AI forgets everything after every conversation.** ZenBrain fixes that — with the same mechanisms your brain uses: spaced repetition, emotional consolidation, Hebbian strengthening, and exponential forgetting curves. Not a vector database with a wrapper. Actual neuroscience.

> **Architecture vs. this package.** ZenBrain's architecture is **15 neuroscience-inspired mechanisms — 9 foundational algorithms + 6 Predictive Memory Architecture (PMA) components** ([paper](https://arxiv.org/abs/2604.23878)). The 6 PMA components are proprietary and run in the production system. **This open-source package ships the algorithm library: 10 core algorithms + 10 advanced research modules (20 modules), zero-dependency.**

---

## Comparison with related open-source memory systems

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


### Advanced algorithms (v0.3.0, May 2026)

On top of the 10 core algorithms above, `@zensation/algorithms@0.3.0` ships 10 advanced algorithms grounded in recent neuroscience and ML research. Each is exposed as its own sub-path (`@zensation/algorithms/<name>`) and remains zero-dependency:

- **`fsrs-vmPFC`** — Prediction-Error coupled FSRS
- **`hebbian-two-factor`** — Two-Factor synaptic consolidation
- **`sleep-simulation-selection`** — RL-based replay selection
- **`spectral-health`** — Fiedler-value KG health monitor
- **`ib-budget`** — Information-Bottleneck retention budget
- **`dopamine-routing`** · **`hopfield-stm`** · **`personalized-pagerank`** · **`surprise-gradient-memory`** · **`temporal-multi-route`**

See [`CHANGELOG.md`](./CHANGELOG.md#030--2026-05-08) for details.

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

// 2. A week later, check recall probability (Ebbinghaus curve)
const aWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const retention = getRetrievability(memory, aWeekLater);
console.log(`Recall probability: ${(retention * 100).toFixed(1)}%`);
// ~36.8% — retrievability has decayed over the week

// 3. User recalled it anyway — update scheduling
const updated = updateAfterRecall(memory, 4, retention, aWeekLater);
// stability 7 -> 8.19: recalling at low retrievability gives a bigger boost

// 4. Tag emotional significance
const emotion = tagEmotion('I am absolutely thrilled — I got the promotion!');
const weight = computeEmotionalWeight(emotion);
console.log(`Decay multiplier: ${weight.decayMultiplier}x`);
// 2.7x — emotional memories decay nearly 3x slower

// 5. Strengthen knowledge connections (Hebbian)
const stronger = computeHebbianStrengthening(1.0);
// 1.09 — "neurons that fire together wire together"

// 6. Propagate confidence through your knowledge graph
const confidence = propagateForRelation(0.5, 0.8, 1.0, 'supports');
// 0.9 — supporting evidence increases confidence
```

### Want the advanced algorithms?

```typescript
import {
  computeKGPredictionError,
  computeAdaptiveFSRSInterval,
} from '@zensation/algorithms/fsrs-vmPFC';

// Couple FSRS scheduling with the prediction-error signal from your
// knowledge graph: when the embedding has shifted a lot since the last
// review (high cosine distance), shrink the next interval; otherwise push
// it out. Both arrays must have the same length.
const lastEmbedding = [0.1, 0.2, 0.3, 0.4];
const currentEmbedding = [0.5, 0.4, 0.1, 0.2];
const pe = computeKGPredictionError(lastEmbedding, currentEmbedding);
const nextInterval = computeAdaptiveFSRSInterval(14, pe);
```

Each advanced algorithm has its own sub-path (`@zensation/algorithms/spectral-health`, `@zensation/algorithms/ib-budget`, …). All zero dependencies.

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
| [`@zensation/algorithms`](./packages/algorithms) | 20 algorithm modules — 10 core (FSRS, Hebbian, Ebbinghaus, emotional, Bayesian, sleep consolidation, intervals, visualization) + 10 advanced (vmPFC-FSRS, two-factor Hebbian, IB budget, Hopfield STM, …) | :white_check_mark: Published |
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

These aren't toy implementations — ZenBrain's algorithms are extracted from [ZenAI](https://zensation.ai), a production AI platform, and run against real users and real data. Everything claimed here is verifiable in this repository:

- **528 tests** (429 algorithms + 99 core), all passing
- **Zero runtime dependencies** — pure TypeScript, dual ESM + CJS, tree-shakeable subpath exports
- **Reproducible** — building from this source produces the same 152-file `@zensation/algorithms@0.3.3` tarball published on npm
- **7-layer** memory architecture grounded in published neuroscience

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

ZenBrain's architecture and algorithms are documented in an open-access technical disclosure:

- **Paper:** [ZenBrain: A Neuroscience-Inspired 7-Layer Memory Architecture for Autonomous AI Systems](https://doi.org/10.5281/zenodo.19353663) (Zenodo, DOI: [10.5281/zenodo.19353663](https://doi.org/10.5281/zenodo.19353663) — resolves to the latest version)
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
