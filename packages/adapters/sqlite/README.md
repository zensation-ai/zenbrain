# @zensation/adapter-sqlite

> Zero-config SQLite storage adapter for ZenBrain. No database server needed.

## Quick Start

```bash
npm install @zensation/core @zensation/adapter-sqlite
```

```typescript
import { SemanticMemory } from '@zensation/core';
import { SqliteAdapter } from '@zensation/adapter-sqlite';

// File-based (persistent)
const storage = new SqliteAdapter({ filename: './my-memory.db' });

// Or in-memory (testing)
import { createMemoryAdapter } from '@zensation/adapter-sqlite';
const testStorage = createMemoryAdapter();

const memory = new SemanticMemory({ storage });
await memory.storeFact('FSRS outperforms SM-2 by 30%', 'research');
```

## When to Use

| Use Case | Adapter |
|----------|---------|
| Development / prototyping | **SQLite** |
| Single-user desktop app | **SQLite** |
| Unit tests | **SQLite** (`:memory:`) |
| Multi-user production | PostgreSQL |
| Vector similarity search | PostgreSQL (pgvector) |

## Limitations

- Similarity search is a full scan per query: embeddings are stored as JSON arrays and compared
  by a cosine-distance function, with no ANN index. Fine for development and single-user data
  volumes; use PostgreSQL with pgvector for large stores.
- Without an embedding provider, recall ranks by wording, not meaning: synonyms need one.
- Single-writer concurrency (WAL mode helps with reads)

## Schema

The adapter creates these tables on first open (`CREATE TABLE IF NOT EXISTS`) and records the
schema version in `PRAGMA user_version` (exported as `SCHEMA_VERSION`, currently 1).

| Layer | Table | Columns |
|---|---|---|
| Episodic | `episodic_memories` | `id`, `content`, `context`, `embedding` (JSON array), `emotional_weight`, `metadata` (JSON), `created_at` |
| Semantic | `learned_facts` | `id`, `content`, `confidence`, `source`, `embedding`, `access_count`, `fsrs_difficulty`, `fsrs_stability`, `fsrs_next_review`, `created_at`, `last_accessed` |
| Procedural | `procedural_memories` | `id`, `trigger`, `steps` (JSON), `tools` (JSON), `outcome`, `embedding`, `success_rate`, `execution_count`, `created_at` |
| Core | `core_memory_blocks` | `id`, `label` (one block per label), `content`, `pinned` (1 or 0), `updated_at` |
| Cross-context | `cross_context_links` | `id`, `entity_a`, `entity_b` (one link per pair), `created_at` |
| — | `knowledge_entities` | `id`, `name`, `type`, `embedding`, `created_at` |

Working and short-term memory live in the process and have no table. Episodes carry
`emotional_weight`; `confidence` is a column of facts only.

**Timestamps** are text in one format: ISO 8601, UTC, milliseconds, `Z`
(`2026-09-28T21:25:17.000Z`), so text order is time order and every value parses as UTC. Code
that writes these tables directly should use the same format — in SQL,
`strftime('%Y-%m-%dT%H:%M:%fZ','now')`.

| Schema version | Change |
|---|---|
| 1 | One timestamp format. A file written by an earlier version is rewritten once when it is opened; text SQLite cannot read as a time is left as it was. |

## Configuration

```typescript
const storage = new SqliteAdapter({
  filename: './data/memory.db', // default: './zenbrain.db'
  walMode: true,                // default: true (better read concurrency)
  logger: console,              // optional
});
```

## License

Apache 2.0

## About ZenBrain

ZenBrain is a seven-layer, neuroscience-derived memory architecture for LLM agents, built as
zero-dependency TypeScript and published under Apache-2.0. On LongMemEval-500 three of nine
head-to-head answer-quality comparisons hold against Letta, Mem0 and A-Mem — all three against
A-Mem, the remaining six are ties, none lost (three competitors x three LLM judges,
Bonferroni-corrected, version-matched) — reaching 91.3% of a full-context oracle's binary-judge
accuracy at 1/109.6 of the per-query token cost.

Works out of the box without an embedding provider — lexical ranking, zero
dependencies. With `nomic-embed-text` as the embedding provider you get the
configuration those figures were measured in.

- Source and issues: [github.com/zensation-ai/zenbrain](https://github.com/zensation-ai/zenbrain)
- Paper: [arXiv:2604.23878](https://arxiv.org/abs/2604.23878) · Open-access archive: [10.5281/zenodo.19353663](https://doi.org/10.5281/zenodo.19353663)
- Try it in the browser: [zensation.ai/en/playground](https://zensation.ai/en/playground?utm_source=npm&utm_medium=readme&utm_campaign=evergreen)
- Model card: [huggingface.co/zensation-ai/zenbrain](https://huggingface.co/zensation-ai/zenbrain)
- Packages: [`@zensation/algorithms`](https://www.npmjs.com/package/@zensation/algorithms) · [`@zensation/core`](https://www.npmjs.com/package/@zensation/core) · [`@zensation/adapter-postgres`](https://www.npmjs.com/package/@zensation/adapter-postgres) · [`@zensation/adapter-sqlite`](https://www.npmjs.com/package/@zensation/adapter-sqlite) · [`@zensation/mcp`](https://www.npmjs.com/package/@zensation/mcp) · [`@zensation/ai-sdk`](https://www.npmjs.com/package/@zensation/ai-sdk) · [`@zensation/cli`](https://www.npmjs.com/package/@zensation/cli)

License: Apache-2.0
