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

- No vector similarity search (embeddings stored as JSON, not pgvector)
- Memory layers fall back to recency-based retrieval instead of semantic search
- Single-writer concurrency (WAL mode helps with reads)

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
zero-dependency TypeScript and published under Apache-2.0. On LongMemEval-500 it wins all nine
head-to-head answer-quality comparisons against Letta, Mem0 and A-Mem (three competitors x three
LLM judges, Bonferroni-corrected), reaching 91.3% of a full-context oracle's binary-judge
accuracy at 1/106th of the per-query token cost.

- Source and issues: [github.com/zensation-ai/zenbrain](https://github.com/zensation-ai/zenbrain)
- Paper: [arXiv:2604.23878](https://arxiv.org/abs/2604.23878) · Open-access archive: [10.5281/zenodo.19353663](https://doi.org/10.5281/zenodo.19353663)
- Try it in the browser: [zensation.ai/en/playground](https://zensation.ai/en/playground)
- Model card: [huggingface.co/zensation-ai/zenbrain](https://huggingface.co/zensation-ai/zenbrain)
- Packages: [`@zensation/algorithms`](https://www.npmjs.com/package/@zensation/algorithms) · [`@zensation/core`](https://www.npmjs.com/package/@zensation/core) · [`@zensation/adapter-postgres`](https://www.npmjs.com/package/@zensation/adapter-postgres) · [`@zensation/adapter-sqlite`](https://www.npmjs.com/package/@zensation/adapter-sqlite) · [`@zensation/mcp`](https://www.npmjs.com/package/@zensation/mcp) · [`@zensation/ai-sdk`](https://www.npmjs.com/package/@zensation/ai-sdk) · [`@zensation/cli`](https://www.npmjs.com/package/@zensation/cli)

License: Apache-2.0
