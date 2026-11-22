# @zensation/core

> 7-layer memory system for AI agents. Pluggable storage, embeddings, and LLM providers.

[![npm](https://img.shields.io/npm/v/@zensation/core)](https://www.npmjs.com/package/@zensation/core)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../../LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)

## What's Inside

The orchestration layer that turns [`@zensation/algorithms`](https://www.npmjs.com/package/@zensation/algorithms) into a complete memory system:

- **MemoryCoordinator** — one API over the layers: auto-routing `store()`, cross-layer `recall()`, `forget()`, `consolidate()`, `decay()`, FSRS-style review queue
- **7 Memory Layers** — Working, Short-Term, Episodic, Semantic, Procedural, Core, Cross-Context (experimental: not wired into the coordinator)
- **Consolidation** — `consolidate()` turns emotionally weighted episodes into semantic facts, once each. The sleep-replay functions live in `@zensation/algorithms` and are not called by the coordinator
- **Pluggable Adapters** — bring your own storage (`@zensation/adapter-postgres`, `@zensation/adapter-sqlite`)

## Quick Start

```bash
npm install @zensation/core @zensation/adapter-sqlite
```

> **Requires Node.js 22 or newer, and 22.14 or newer with `@zensation/adapter-sqlite`** as installed
> above (on Node 23, 23.6 or newer): its SQLite driver, better-sqlite3 13, is built for Node-API 10, which Node has
> from 22.14 and 23.6 on.
> On Node 20 or older, npm silently installs the last release that
> allowed older Node (`@zensation/core@0.2.2` with `@zensation/algorithms@0.3.4`) instead of the current
> one, and the example below stops at `forget()`. That looks like a broken package but is a platform
> mismatch; see the [CHANGELOG](../../CHANGELOG.md#040--2026-08-05).

```typescript
import { MemoryCoordinator } from '@zensation/core';
import { SqliteAdapter } from '@zensation/adapter-sqlite';

// Storage is pluggable; SQLite needs no server. Without an embedding provider recall ranks
// by wording; pass `embedding: yourProvider` for semantic matching.
const memory = new MemoryCoordinator({ storage: new SqliteAdapter({ filename: './memory.db' }) });

// Auto-routes to the right layer (semantic, episodic, procedural, or core). An episode needs an
// emotional weight above 0.5; it is detected by keywords, and most clearly emotional texts stay
// below, so pass `emotionalWeight` when a memory should be an episode
await memory.store('User prefers TypeScript', { type: 'auto' });

// Cross-layer search: deduplicated results, sorted by score (0 to 1; 0 = nothing matched);
// a layer that cannot read the storage makes it throw an AggregateError
const results = await memory.recall('Which language does the user prefer?');

// Forget a memory by the id and layer of a recall result (a fact consolidated from it goes too)
await memory.forget(results[0].id, results[0].layer);

// Consolidate: emotionally weighted episodes among the 100 most recent become facts, once each;
// working memory decays
await memory.consolidate();

// Facts whose FSRS-style review is due; report each review with recordReview()
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

ZenBrain's architecture and algorithms are described in the paper [ZenBrain: A Neuroscience-Inspired 7-Layer Memory Architecture for Autonomous AI Systems](https://doi.org/10.5281/zenodo.19353663), open access on Zenodo (the DOI resolves to the latest version; preprint: [arXiv:2604.23878](https://arxiv.org/abs/2604.23878)). See also: [HuggingFace Model Card](https://huggingface.co/zensation-ai/zenbrain).

## Part of ZenBrain

This package is part of the [ZenBrain](https://github.com/zensation-ai/zenbrain) monorepo — the neuroscience-inspired memory system for AI agents.

| Package | Description |
|---------|-------------|
| `@zensation/algorithms` | Pure algorithms (FSRS-style scheduling, Hebbian, emotional, Bayesian) |
| **@zensation/core** | Memory layers + coordinator (this package) |
| `@zensation/adapter-postgres` | PostgreSQL + pgvector storage |
| `@zensation/adapter-sqlite` | SQLite storage (better-sqlite3) |
| `@zensation/mcp` | MCP server: store, recall, forget, consolidate, health |
| `@zensation/ai-sdk` | Vercel AI SDK memory middleware |

## License

Apache 2.0 — see [LICENSE](../../LICENSE).

## About ZenBrain

ZenBrain is a seven-layer, neuroscience-derived memory architecture for LLM agents, built in
TypeScript and published under Apache-2.0; `@zensation/algorithms` and `@zensation/core` have no third-party
dependencies. The benchmark results, and the
configurations they were measured in, are reported in the paper; the reproduction packages
are on Zenodo.

Works out of the box without an embedding provider — lexical ranking, nothing extra
to install. In the paper ([arXiv:2604.23878v4](https://arxiv.org/abs/2604.23878v4)), ZenBrain's arm in the comparisons
with other systems embedded with `nomic-embed-text`. The paper's other retrieval experiments ran with OpenAI
`text-embedding-3-small`, with `nomic-embed-text` or with a placeholder embedder, depending on the run; the Protocol
paragraph of the paper's setup section says which.

- Source and issues: [github.com/zensation-ai/zenbrain](https://github.com/zensation-ai/zenbrain)
- Paper: [arXiv:2604.23878](https://arxiv.org/abs/2604.23878) · Open-access archive: [10.5281/zenodo.19353663](https://doi.org/10.5281/zenodo.19353663)
- Try it in the browser: [zensation.ai/en/playground](https://zensation.ai/en/playground?utm_source=npm&utm_medium=readme&utm_campaign=evergreen)
- Model card: [huggingface.co/zensation-ai/zenbrain](https://huggingface.co/zensation-ai/zenbrain)
- Packages: [`@zensation/algorithms`](https://www.npmjs.com/package/@zensation/algorithms) · [`@zensation/core`](https://www.npmjs.com/package/@zensation/core) · [`@zensation/adapter-postgres`](https://www.npmjs.com/package/@zensation/adapter-postgres) · [`@zensation/adapter-sqlite`](https://www.npmjs.com/package/@zensation/adapter-sqlite) · [`@zensation/mcp`](https://www.npmjs.com/package/@zensation/mcp) · [`@zensation/ai-sdk`](https://www.npmjs.com/package/@zensation/ai-sdk)

License: Apache-2.0
