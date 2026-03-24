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
