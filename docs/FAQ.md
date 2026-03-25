# Frequently Asked Questions

## General

### What is ZenBrain?

ZenBrain is a neuroscience-inspired memory system for AI agents. It provides 7 distinct memory layers (working, short-term, episodic, semantic, procedural, core, cross-context) with algorithms based on peer-reviewed cognitive science research.

### How is ZenBrain different from Mem0, Letta, or Zep?

| Feature | ZenBrain | Mem0 | Letta | Zep |
|---------|----------|------|-------|-----|
| Memory Layers | **7** | 2 | 3 | 2 |
| FSRS Spaced Repetition | Yes | No | No | No |
| Hebbian Learning | Yes | No | No | No |
| Emotional Memory | Yes | No | No | No |
| Sleep Consolidation | Yes | No | No | No |
| Zero Dependencies (core) | Yes | No | No | No |
| Self-Hosted | Yes | Yes | Yes | Yes |

ZenBrain has deeper scientific grounding — every algorithm cites its neuroscience basis — and the algorithms package has zero runtime dependencies.

### Is ZenBrain production-ready?

The algorithms and core layers are extracted from ZenAI, a production platform with 170K+ lines of code and 9,228 passing tests. The algorithms are battle-tested with real users.

That said, ZenBrain is at v0.1 — expect API changes before v1.0. We follow semver.

### What license is ZenBrain under?

Apache 2.0 — use it in commercial products, modify it, distribute it. Attribution appreciated but not required.

---

## Architecture

### Why 7 memory layers?

Each layer maps to a distinct cognitive system in the human brain:

1. **Working Memory** — Baddeley's model (1974): active task focus, 7±2 slots
2. **Short-Term** — Session/conversation context
3. **Episodic** — Tulving (1972): concrete experiences with temporal context
4. **Semantic** — Long-term facts with spaced repetition scheduling
5. **Procedural** — "How to" knowledge (skills, workflows)
6. **Core** — Pinned facts always in context (Letta/MemGPT pattern)
7. **Cross-Context** — Entity deduplication across domains

These aren't arbitrary — each has different decay characteristics, retrieval patterns, and consolidation mechanisms.

### Do I need all 7 layers?

No. Use only what you need:

```typescript
// Minimal: just FSRS scheduling
import { updateAfterRecall } from '@zensation/algorithms/fsrs';

// Simple: working + short-term memory
import { WorkingMemory, ShortTermMemory } from '@zensation/core';

// Full: all layers with coordinator
import { MemoryCoordinator } from '@zensation/core';
```

Tree-shaking ensures you only bundle what you import.

### What's the MemoryCoordinator?

The coordinator orchestrates all 7 layers as a single cohesive system:
- **Auto-routing**: `store()` routes content to the right layer
- **Cross-layer recall**: `recall()` searches multiple layers with ranked results
- **Consolidation**: promotes episodic memories to semantic facts over time
- **Decay management**: applies Ebbinghaus forgetting curves

It's the recommended entry point for most use cases.

---

## Algorithms

### What is FSRS?

Free Spaced Repetition Scheduler — a modern replacement for SM-2 (the algorithm behind Anki). FSRS models memory retention with exponential decay curves and schedules reviews at optimal intervals.

ZenBrain's FSRS outperforms SM-2 by ~30% in retention accuracy (based on the open-spaced-repetition/fsrs4anki research across millions of Anki review logs).

### What is Hebbian Learning?

"Neurons that fire together, wire together." When two pieces of knowledge are accessed together, the connection between them strengthens. Disuse causes decay. Homeostatic normalization prevents runaway strengthening.

### What is Sleep Consolidation?

During sleep, the brain replays recent experiences, strengthening important memories and pruning weak connections. ZenBrain simulates this process: `selectForReplay()` prioritizes emotional and recently-accessed memories, `simulateReplay()` boosts their stability, and `pruneWeakConnections()` removes weak Hebbian edges.

### How does emotional memory work?

Emotional events consolidate 1-3x stronger and decay 1-3x slower than neutral events. ZenBrain's emotional tagger analyzes text for sentiment, arousal, valence, and significance using a 400+ keyword lexicon (English and German).

---

## Storage

### PostgreSQL or SQLite?

| Use Case | Recommendation |
|----------|---------------|
| Production, multi-user | PostgreSQL + pgvector |
| Development, prototyping | SQLite |
| Single-user apps | Either works |
| Semantic search needed | PostgreSQL (pgvector required) |

SQLite automatically translates PostgreSQL-style queries (`$1`, `gen_random_uuid()`, etc.), so you can develop with SQLite and deploy with PostgreSQL.

### Can I use a different database?

Yes — implement the `StorageAdapter` interface (2 methods: `query()` and `transaction()`). The interface is deliberately simple.

### Do I need pgvector?

Only if you want semantic search (similarity-based retrieval). Without pgvector, layers fall back to recency-based retrieval, which works well for many use cases.

---

## Integration

### Can I use ZenBrain with LangChain / CrewAI / Vercel AI?

Yes — see the `examples/` directory for integration examples with each framework.

### Can I use ZenBrain without an LLM?

Yes. The algorithms package and most core layers work without any LLM. The `LLMProvider` interface is optional — only needed for features like memory summarization.

### Can I use ZenBrain in the browser?

The `@zensation/algorithms` package works in any JavaScript environment (browser, Node.js, Deno, Bun). The `@zensation/core` layers that need storage require a `StorageAdapter` — in the browser, you could implement one backed by IndexedDB.

---

## Contributing

### How do I contribute?

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full guide. Quick version:
1. Fork → Clone → Branch
2. Write code + tests
3. `npx turbo build && npx turbo test`
4. Submit PR

### Where do I report bugs?

[GitHub Issues](https://github.com/zensation-ai/zenbrain/issues) — please include:
- ZenBrain version
- Node.js version
- Minimal reproduction
- Expected vs actual behavior
