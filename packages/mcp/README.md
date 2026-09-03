# @zensation/mcp

**Status: early release.** The tool surface is small on purpose and may still
change before 1.0. The memory layers underneath it are the same ones the
[ZenBrain paper](https://arxiv.org/abs/2604.23878) describes and the
[benchmarks](https://github.com/zensation-ai/zenbrain/blob/main/docs/benchmarks.md) measure.

An [MCP](https://modelcontextprotocol.io) server that gives any MCP client — Claude
Desktop, Claude Code, Cursor, or your own — a memory that survives the conversation.

Four tools, one local SQLite file, no account and no network call.

| Tool | What it does |
|---|---|
| `zenbrain_store` | Write something into long-term memory. Routing is automatic: a general statement becomes a semantic fact, a narrated event an episode, a sequence of instructions a procedure. |
| `zenbrain_recall` | Search every layer for what is relevant to a query. Results come back ranked, each tagged with the layer it came from. |
| `zenbrain_consolidate` | One sleep-like maintenance pass: promote repeated episodes into facts, decay stale slots, prune what fell below the retention threshold. |
| `zenbrain_health` | How full each layer is: slots in use, episodes, facts and how many are due for review, procedures, core blocks. |

## Install

Requires **Node.js 22 or newer**.

```bash
npm install -g @zensation/mcp
```

## Configure your client

```json
{
  "mcpServers": {
    "zenbrain": {
      "command": "npx",
      "args": ["-y", "@zensation/mcp"],
      "env": {
        "ZENBRAIN_DB": "~/.zenbrain/memory.db"
      }
    }
  }
}
```

| Variable | Default | Meaning |
|---|---|---|
| `ZENBRAIN_DB` | `./zenbrain.db` | Path to the SQLite file. `:memory:` gives a store that is discarded when the process exits. |
| `ZENBRAIN_CONTEXTS` | `personal,work,learning,creative` | Comma-separated context domains for cross-context memory. |

The server speaks MCP over stdio. Stdout carries protocol traffic only; diagnostics go
to stderr.

## The seven layers

Storing is not filing. Which layer a memory lands in decides how it decays, how it is
retrieved, and whether it survives consolidation.

| | Layer | Holds |
|--:|---|---|
| 7 | Cross-Context Memory | Shared knowledge across domains |
| 6 | Core Memory | Pinned facts |
| 5 | Procedural Memory | "How to do X" — skills and workflows |
| 4 | Long-Term Semantic | Facts, with FSRS scheduling |
| 3 | Episodic Memory | Concrete experiences and events |
| 2 | Short-Term / Session | Current conversation context |
| 1 | Working Memory | Active task focus, 7±2 items |

Each layer has its own retention, consolidation and retrieval rules. Review scheduling
follows a forgetting curve rather than a fixed timer, and emotionally weighted content
consolidates more strongly; both are implemented in
[`@zensation/algorithms`](https://www.npmjs.com/package/@zensation/algorithms) and can be
read line by line.

This server configures **no LLM provider**, so nothing in it calls a model: routing on
store is a content heuristic, and consolidation runs without generated summaries.

## What this release does not do

Worth knowing before you wire it in:

- **No embedding provider is configured by default.** Semantic search degrades to the
  non-vector path. Recall still works; it is less sharp than the benchmarked
  configuration. Pass an `EmbeddingProvider` through the library if you need that today.
- **SQLite similarity search is a full scan.** Fine for one person's memory; use
  [`@zensation/adapter-postgres`](https://www.npmjs.com/package/@zensation/adapter-postgres)
  for larger volumes.
- **Consolidation is a tool call, not a schedule.** Nothing runs it for you.
- **The store is a plain file.** It is not encrypted. Put it somewhere you would put a
  notebook.

## Using it as a library

The server factory is exported, so you can mount ZenBrain's tools on a server of your own
or drive them in tests:

```typescript
import { createZenBrainServer } from '@zensation/mcp/server';
import { MemoryCoordinator } from '@zensation/core';
import { SqliteAdapter } from '@zensation/adapter-sqlite';

const coordinator = new MemoryCoordinator({
  storage: new SqliteAdapter({ filename: './memory.db' }),
});

const server = createZenBrainServer(coordinator);
// connect it to any transport you like — the caller owns the coordinator's lifecycle
```

## Zero-dependency, and where that stops

`@zensation/algorithms` and `@zensation/core` pull nothing but each other. That claim is
[checked in CI on every push](https://github.com/zensation-ai/zenbrain/blob/main/scripts/verify-zero-dependencies.sh)
against the packed tarballs, not against the source tree.

**This package is deliberately outside that boundary.** An MCP server needs the protocol
SDK, so it carries one. Keeping it in its own package is what lets the core stay clean:
installing `@zensation/core` never pulls the MCP SDK, and installing this never weakens
the claim the core makes.

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
- Registry entry: `ai.zensation/zenbrain`

License: Apache-2.0
