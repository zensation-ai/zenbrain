# @zensation/adapter-postgres

> PostgreSQL + pgvector storage adapter for ZenBrain.

## Quick Start

```bash
npm install @zensation/core @zensation/adapter-postgres
```

```typescript
import { SemanticMemory, EpisodicMemory } from '@zensation/core';
import { PostgresAdapter } from '@zensation/adapter-postgres';

const storage = new PostgresAdapter({
  connectionString: process.env.DATABASE_URL,
  schema: 'personal', // optional: schema isolation
});

const memory = new SemanticMemory({ storage });
await memory.storeFact('TypeScript was released in 2012', 'conversation');
```

## Schema Migration

Run the included SQL migration to create all tables:

```bash
psql -f node_modules/@zensation/adapter-postgres/sql/001_init.sql -d your_database
```

Requires PostgreSQL 15+ with the `pgvector` and `pg_trgm` extensions.

## Configuration

```typescript
const storage = new PostgresAdapter({
  // Connection (URL or individual fields)
  connectionString: 'postgres://user:pass@host:5432/db',
  // OR:
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '',
  database: 'zenbrain',

  // Pool settings
  maxConnections: 8,
  minConnections: 2,
  idleTimeoutMs: 60_000,
  connectionTimeoutMs: 5_000,

  // Schema isolation (optional)
  schema: 'personal',

  // SSL
  ssl: { rejectUnauthorized: true },

  // Retries for transient errors
  maxRetries: 3,

  // Logger
  logger: console,
});
```

## Multi-Context (Schema Isolation)

ZenBrain supports isolating memory into separate schemas:

```typescript
const personal = new PostgresAdapter({ connectionString: DB_URL, schema: 'personal' });
const work = new PostgresAdapter({ connectionString: DB_URL, schema: 'work' });

const personalMemory = new SemanticMemory({ storage: personal });
const workMemory = new SemanticMemory({ storage: work });
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
- Paper: [arXiv:2604.23878](https://arxiv.org/abs/2604.23878) · Reproduction material: [10.5281/zenodo.19481262](https://doi.org/10.5281/zenodo.19481262)
- Try it in the browser: [zensation.ai/en/playground](https://zensation.ai/en/playground)
- Packages: [`@zensation/algorithms`](https://www.npmjs.com/package/@zensation/algorithms) · [`@zensation/core`](https://www.npmjs.com/package/@zensation/core) · [`@zensation/adapter-postgres`](https://www.npmjs.com/package/@zensation/adapter-postgres) · [`@zensation/adapter-sqlite`](https://www.npmjs.com/package/@zensation/adapter-sqlite)

License: Apache-2.0
