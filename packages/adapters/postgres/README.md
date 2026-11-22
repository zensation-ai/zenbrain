# @zensation/adapter-postgres

> PostgreSQL + pgvector storage adapter for ZenBrain.

## Quick Start

```bash
npm install @zensation/core @zensation/adapter-postgres
```

This package is ESM. `require()` loads it on Node 22.12 and later; on Node 22.0–22.11, use `import`.

```typescript
import { SemanticMemory, EpisodicMemory } from '@zensation/core';
import { PostgresAdapter } from '@zensation/adapter-postgres';

const storage = new PostgresAdapter({
  connectionString: process.env.DATABASE_URL,
  // schema: 'personal' isolates memory in its own schema; it needs the steps under
  // "Multi-Context (Schema Isolation)" below first, or its queries fall back to the tables in public
});

const memory = new SemanticMemory({ storage });
await memory.storeFact('TypeScript was released in 2012', 'conversation');

// The pool keeps connections open, so the process ends only once it is closed
await storage.close();
```

## Schema Migration

Run the included SQL migration to create all tables:

```bash
psql -v ON_ERROR_STOP=1 -f node_modules/@zensation/adapter-postgres/sql/001_init.sql -d your_database
```

`-v ON_ERROR_STOP=1` makes psql stop at the first error and exit with a status other than 0; without it, psql
reports the error, runs the rest of the file and exits with 0.

Requires PostgreSQL 15+ with the `pgvector` (0.5 or newer, for its HNSW indexes) and `pg_trgm` extensions. The migration creates its four
embedding columns as `vector(1536)`, which fits embedding models with 1536 dimensions; for another size,
change those four columns in the file before running it.

## Configuration

```typescript prelude=postgres-page
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

  // query() retries transient errors — a refused, reset or timed-out connection, a server
  // shutting down or out of connections — up to this many times; transaction() does not retry
  maxRetries: 3,

  // Logger
  logger: console,
});
```

The pool does not close idle connections while it holds no more than `minConnections` (2 by default), so a
process with an open adapter does not end on its own: a script that is done with it calls `await storage.close()`.

## Multi-Context (Schema Isolation)

ZenBrain supports isolating memory into separate schemas. Each schema needs its own tables, and
the extensions must live in `public` first: run on a fresh database, the migration creates them in
the first schema of the search path, and the next schema then fails with `type "vector" does not exist`.

```bash
psql -v ON_ERROR_STOP=1 -d your_database -c 'CREATE EXTENSION IF NOT EXISTS vector SCHEMA public' \
                                         -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public' \
                                         -c 'CREATE SCHEMA personal' -c 'CREATE SCHEMA work'
PGOPTIONS='-c search_path=personal,public' psql -v ON_ERROR_STOP=1 -d your_database -f node_modules/@zensation/adapter-postgres/sql/001_init.sql
PGOPTIONS='-c search_path=work,public'     psql -v ON_ERROR_STOP=1 -d your_database -f node_modules/@zensation/adapter-postgres/sql/001_init.sql
```

```typescript prelude=postgres-page
const personal = new PostgresAdapter({ connectionString: DB_URL, schema: 'personal' });
const work = new PostgresAdapter({ connectionString: DB_URL, schema: 'work' });

const personalMemory = new SemanticMemory({ storage: personal });
const workMemory = new SemanticMemory({ storage: work });
```

## License

Apache 2.0

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
