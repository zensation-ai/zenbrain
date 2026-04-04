# @zensation/core

> 7-layer memory system for AI agents. Pluggable storage, embeddings, and LLM providers.

[![npm](https://img.shields.io/npm/v/@zensation/core)](https://www.npmjs.com/package/@zensation/core)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../../LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)

## What's Inside

The orchestration layer that turns [`@zensation/algorithms`](https://www.npmjs.com/package/@zensation/algorithms) into a complete memory system:

- **MemoryCoordinator** — orchestrates all 7 layers: auto-routing `store()`, cross-layer `recall()`, `consolidate()`, `decay()`, FSRS review queue
- **7 Memory Layers** — Working, Short-Term, Episodic, Semantic, Procedural, Core, Cross-Context
- **Sleep Consolidation** — memory replay simulation (Stickgold & Walker, 2013)
- **Pluggable Adapters** — bring your own storage (`@zensation/adapter-postgres`, `@zensation/adapter-sqlite`)

## Quick Start

```bash
npm install @zensation/core
```

```typescript
import { MemoryCoordinator } from '@zensation/core';

const memory = new MemoryCoordinator({ storage: adapter, embedding: embedder });

// Auto-routes to the right layer (semantic, episodic, procedural, or core)
await memory.store('User prefers TypeScript', { type: 'auto' });

// Cross-layer search with ranked, deduplicated results
const results = await memory.recall('programming preferences');

// Consolidate: promote episodic -> semantic, apply decay
await memory.consolidate();

// FSRS review queue across all layers
const dueItems = await memory.getReviewQueue();
```

## Tree-Shakeable Imports

```typescript
// Full coordinator
import { MemoryCoordinator } from '@zensation/core';

// Individual layers
import { WorkingMemory } from '@zensation/core/layers/working';
import { EpisodicMemory } from '@zensation/core/layers/episodic';
import { SemanticMemory } from '@zensation/core/layers/semantic';
import { ProceduralMemory } from '@zensation/core/layers/procedural';
import { CoreMemory } from '@zensation/core/layers/core';
import { CrossContextMemory } from '@zensation/core/layers/cross-context';

// Adapter interfaces
import type { StorageAdapter, EmbeddingProvider } from '@zensation/core/interfaces';
```

## Research

These algorithms are documented in a peer-reviewed technical disclosure: [ZenBrain: A Neuroscience-Inspired 7-Layer Memory Architecture](https://doi.org/10.5281/zenodo.19353663) (Zenodo). See also: [HuggingFace Model Card](https://huggingface.co/alexanderbering/zenbrain).

## Part of ZenBrain

This package is part of the [ZenBrain](https://github.com/zensation-ai/zenbrain) monorepo — the neuroscience-inspired memory system for AI agents.

| Package | Description |
|---------|-------------|
| `@zensation/algorithms` | Pure algorithms (FSRS, Hebbian, emotional, Bayesian) |
| **@zensation/core** | Memory layers + coordinator (this package) |
| `@zensation/adapter-postgres` | PostgreSQL + pgvector storage |
| `@zensation/adapter-sqlite` | SQLite + sqlite-vec storage |

## License

Apache 2.0 — see [LICENSE](../../LICENSE).
