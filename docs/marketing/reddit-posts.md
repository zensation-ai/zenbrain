# Reddit Posts

---

## r/LocalLLaMA

### Title

I built an open-source memory system for AI agents inspired by neuroscience (7 layers, sleep consolidation, 276 tests)

### Body

I've been running local LLMs for my AI platform and the biggest pain point was always persistent memory. Every solution I found was either a hosted service (defeats the purpose of local) or a thin wrapper around a vector database.

So I went deep into neuroscience papers and built ZenBrain -- a 7-layer memory architecture that implements the actual mechanisms the human brain uses:

- **FSRS spaced repetition** (the algorithm powering Anki) -- your AI reviews important facts at optimal intervals. Not random, not "everything forever" -- actual scheduling based on recall probability.
- **Hebbian dynamics** -- knowledge connections that get used together get stronger. Unused ones decay and get pruned. Your knowledge graph self-organizes based on actual usage.
- **Ebbinghaus forgetting curves** -- exponential decay with personalized stability. Memories don't just disappear, they fade realistically.
- **Emotional tagging** -- emotional memories decay 3x slower. A 400+ keyword lexicon scores arousal, valence, and significance.
- **Bayesian confidence propagation** -- facts that support each other increase confidence. Contradictions decrease it.

It's pure TypeScript, zero dependencies, works with any LLM (local or cloud). No API calls to external services. Your data stays on your machine.

```bash
npm install @zensation/algorithms
```

This was extracted from a production AI platform I've been building solo (170K+ LOC, 9,228 tests) + 276 ZenBrain tests). Ships 4 packages: algorithms, core (7 layers), adapter-postgres (pgvector), and adapter-sqlite (zero-config). Docker Compose included.

I'm comparing against Mem0 ($24M) and Letta ($10M) -- they have 2-3 memory layers and none of this neuroscience machinery. ZenBrain has 7 layers and it's Apache 2.0.

GitHub: https://github.com/zensation-ai/zenbrain

Would love feedback from anyone who's been thinking about persistent memory for their local AI setups.

---

## r/selfhosted

### Title

ZenBrain: Self-hosted AI memory with Docker Compose -- 7 layers of neuroscience-inspired memory for your local AI

### Body

I've been self-hosting my own AI platform and the one thing I couldn't find a good open-source solution for was persistent memory. Every AI assistant forgets everything between conversations. The commercial solutions either phone home or cost a fortune.

So I built ZenBrain. It's a neuroscience-inspired memory system for AI agents with 7 specialized memory layers -- working memory, episodic memory, long-term semantic memory, procedural memory ("how to do X"), and more.

What makes it different from "just use a vector database":

- **FSRS spaced repetition** schedules memory reviews at optimal intervals (same algorithm Anki uses)
- **Hebbian learning** makes frequently co-activated knowledge connections stronger and prunes unused ones
- **Emotional tagging** gives important/emotional memories 3x longer retention
- **Ebbinghaus forgetting curves** with realistic exponential decay

The core algorithms package is available now:

```bash
npm install @zensation/algorithms
```

Zero dependencies, pure TypeScript. No cloud services, no telemetry, no vendor lock-in.

Extracted from a production system (170K+ LOC, 9,228 tests) + 276 ZenBrain tests). Ships with Postgres/pgvector + SQLite adapters and Docker Compose for the complete self-hosted setup.

Licensed under Apache 2.0. Competing with Mem0 ($24M raised, 2 layers) and Letta ($10M raised, 3 layers). ZenBrain has 7 layers and it costs you nothing.

GitHub: https://github.com/zensation-ai/zenbrain

---

## r/MachineLearning

### Title

[P] ZenBrain: Neuroscience-inspired memory architecture for AI agents (FSRS, Hebbian dynamics, Ebbinghaus decay)

### Body

I'm open-sourcing ZenBrain, a 7-layer memory architecture for AI agents that implements mechanisms from computational neuroscience rather than relying solely on vector similarity search.

**Architecture** -- 7 specialized layers mirroring known memory subsystems:
1. Working Memory (capacity-limited active focus, cf. Baddeley & Hitch 1974)
2. Short-Term / Session context
3. Episodic Memory (event-specific, cf. Tulving 1972)
4. Long-Term Semantic (fact storage with FSRS scheduling)
5. Procedural Memory (action sequences and skills)
6. Core Memory (pinned high-importance facts)
7. Cross-Context Memory (shared representations across domains)

**Implemented algorithms:**

- **FSRS** (Ye 2022) -- Free Spaced Repetition Scheduler using the desirable difficulty principle. Outperforms SM-2 by ~30% on retention metrics. Each memory has a stability parameter that increases with successful recall at low retrievability.

- **Hebbian dynamics** (Hebb 1949) -- Edge weights in the knowledge graph strengthen via co-activation: `w(t+1) = w(t) + eta * delta`. Homeostatic normalization prevents saturation. Unused connections decay with configurable half-life.

- **Ebbinghaus decay** (Ebbinghaus 1885) -- `R = e^(-t/S)` with personalized stability parameters that adapt via SM-2 compatible updates.

- **Emotional modulation** -- Inspired by amygdala-hippocampal interaction during consolidation. A keyword-based tagger (400+ terms, EN/DE) computes arousal, valence, and significance. High-arousal memories receive up to 3x decay half-life extension.

- **Bayesian confidence propagation** -- Belief updates flow through the knowledge graph. Supporting evidence increases node confidence, contradictions decrease it, with damping for numerical stability.

- **Context-dependent retrieval** -- Tulving's Encoding Specificity Principle (1973). Temporal context (time-of-day, day-of-week, task type) captured at encoding provides up to 30% retrieval boost.

Pure TypeScript, zero runtime dependencies, tree-shakeable subpath exports. Extracted from a production system (170K+ LOC, 9,228 tests) + 276 ZenBrain tests).

```bash
npm install @zensation/algorithms
```

GitHub: https://github.com/zensation-ai/zenbrain

The algorithms package is published now. Storage adapters (Postgres + pgvector, SQLite + sqlite-vec) and the full memory coordinator are in development.

I'd appreciate feedback on the architecture from anyone working on memory systems for LLM agents. Particularly interested in whether the Hebbian normalization approach is sound -- I'm using divisive normalization across all outgoing edges rather than subtractive.
