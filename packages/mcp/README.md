# @zensation/mcp

**Status: early release.** The tool surface is small on purpose and may still
change before 1.0. The memory layers underneath it are the same ones the
[ZenBrain paper](https://arxiv.org/abs/2604.23878) describes and the
[benchmarks](https://github.com/zensation-ai/zenbrain/blob/main/docs/benchmarks.md) measure.

An [MCP](https://modelcontextprotocol.io) server that gives any MCP client — Claude
Desktop, Claude Code, Cursor, or your own — a memory that survives the conversation.

Five tools, one local SQLite file, no account and no network call.

| Tool | What it does |
|---|---|
| `zenbrain_store` | Write something into long-term memory. Routing is automatic, first match wins: `steps` or wording such as "How to", "Steps:", "workflow:" make a procedure, an emotional weight above 0.5 an episode, a confidence above 0.9 a pinned core memory, anything else a semantic fact. Each call adds a memory; the same core memory stored again is updated. |
| `zenbrain_recall` | Search the episodic, semantic, procedural and core layers for what is relevant to a query; working memory only when you name it. Results come back sorted by a score from 0 to 1, each with its id and the layer it came from; a layer in which nothing matches returns recent episodes and facts, or its most successful procedures, at score 0, behind every hit, and `minScore` above 0 leaves them out. Every core block scores 0.5 or 0.8. |
| `zenbrain_forget` | Delete a memory for good, by the id and layer `zenbrain_recall` returned, together with what consolidation linked to it: forgetting an episode deletes the fact made from it, forgetting such a fact every episode consolidated into it, and both delete the working-memory copies of that content. `alsoForgotten` lists what went with it. A memory stored on its own and never consolidated keeps its long-term entry (`duplicates` on a recall result names such copies); forget a long-term result rather than a working-memory slot, which is only a copy. To correct a memory, forget it and store the corrected version. |
| `zenbrain_consolidate` | One maintenance pass: among the 100 most recent episodes, each with an emotional weight above 0.5 becomes a semantic fact, only once; working-memory slots decay, and those at a relevance of 0.01 or below are removed. Deletes nothing from long-term memory. |
| `zenbrain_health` | How full each layer is: slots in use, episodes, facts and how many are due for review, procedures, core blocks. |

Each tool also tells the client what it does to the store, through the MCP tool annotations: `zenbrain_recall` and
`zenbrain_health` are read-only; `zenbrain_store` only adds; `zenbrain_forget` and `zenbrain_consolidate` are marked
destructive (consolidation removes decayed working-memory slots), so a client that asks before destructive calls asks
before these two. No tool reaches anything outside the local file.

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
| `ZENBRAIN_DB` | `./zenbrain.db` | Path to the SQLite file. A leading `~/` means your home directory. A relative path is relative to the directory your client starts the server in — some clients, Claude Desktop among them, may start it in `/`, where nothing can be written — so give an absolute or `~/` path. `:memory:` gives a store that is discarded when the process exits. A value that is only an unfilled placeholder such as `${user_config.db_path}`, which a host may pass on when it does not fill in plugin settings, counts as `~/.zenbrain/memory.db`; the server says so on stderr. |
| `ZENBRAIN_CONTEXTS` | `personal,work,learning,creative` | Comma-separated context domains, passed to the cross-context layer. None of the five tools uses that layer yet, so the value currently has no effect. |

The server speaks MCP over stdio. Stdout carries protocol traffic only; diagnostics go
to stderr.

In Claude Code, one line does the same with the memory in `~/.zenbrain/memory.db`:

```bash
claude mcp add --scope user zenbrain -e ZENBRAIN_DB=~/.zenbrain/memory.db -- npx -y @zensation/mcp
```

or install the [Claude Code plugin](https://github.com/zensation-ai/zenbrain/tree/main/plugins/zenbrain), which runs
this server at a pinned version, keeps the memory in the same file and lets you choose another (`db_path`):

```bash
claude plugin install zenbrain --marketplace zensation-ai/zenbrain
```

## The seven layers

Storing is not filing. Which layer a memory lands in decides how it is retrieved and what
consolidation does with it. The five tools reach working, episodic, semantic, procedural and
core memory; short-term memory shows up only as a counter in `zenbrain_health`, and
cross-context memory is not wired to any tool.

| | Layer | Holds |
|--:|---|---|
| 7 | Cross-Context Memory | Links between entities of different domains (experimental; no tool uses it) |
| 6 | Core Memory | Pinned facts |
| 5 | Procedural Memory | "How to do X" — skills and workflows |
| 4 | Long-Term Semantic | Facts, with FSRS-style scheduling |
| 3 | Episodic Memory | Concrete experiences and events |
| 2 | Short-Term / Session | Current conversation context |
| 1 | Working Memory | Active task focus, 7±2 items |

Nothing in long-term memory decays or is deleted on its own; only working memory decays.
Every fact gets an FSRS-style review schedule, but no tool reports a review, so through this
server the schedule is not advanced. Emotional weight decides routing (above 0.5: an
episode) and which episodes consolidation turns into facts. The algorithms are in
[`@zensation/algorithms`](https://www.npmjs.com/package/@zensation/algorithms) and can be
read line by line.

This server configures **no LLM provider**, so nothing in it calls a model: routing on
store is a content heuristic, and consolidation runs without generated summaries.

## What this release does not do

Worth knowing before you wire it in:

- **No embedding provider is configured by default, so recall is lexical, not semantic.**
  Without vectors, recall ranks by folded token overlap — umlauts and accents are folded,
  rarer words weigh more, and an adjacent phrase beats the same words scattered. It will
  find "Kieler Foerde" in a note about the "Kieler Förde"; it will *not* connect "car" to
  "automobile". Episodes and facts are ranked over the most recent 500 of each, procedures
  over the 500 with the highest success rate. A layer in which the query matches nothing
  returns its most recent episodes and facts, or its most successful procedures, at
  `score: 0`, behind every hit; every core block comes with 0.5 or 0.8, so a block can rank
  above a weak hit. Working memory, when you ask for it, is ranked the same way. Pass an `EmbeddingProvider`
  through the library for true semantic matching — that is the configuration the published
  benchmarks were measured with.
- **SQLite similarity search is a full scan.** Fine for one person's memory; use
  [`@zensation/adapter-postgres`](https://www.npmjs.com/package/@zensation/adapter-postgres)
  for larger volumes.
- **Consolidation is a tool call, not a schedule.** Nothing runs it for you.
- **The store is a plain file.** It is not encrypted. Put it somewhere you would put a
  notebook. While the server runs, SQLite keeps `-wal` and `-shm` files next to it.

## Using it as a library

The server factory is exported, so you can mount ZenBrain's tools on a server of your own
or drive them in tests. The package is ESM; `require()` loads it on Node 22.12 and later (on 22.0–22.11, use `import`).

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

ZenBrain is a seven-layer, neuroscience-derived memory architecture for LLM agents, built in
TypeScript and published under Apache-2.0; `@zensation/algorithms` and `@zensation/core` have no third-party
dependencies. The benchmark results, and the
configuration they were measured in, are reported in the paper; the reproduction packages
are on Zenodo.

Works out of the box without an embedding provider — lexical ranking, nothing extra
to install. In the paper, ZenBrain's benchmark runs against other systems used `nomic-embed-text` as the embedding
provider; the retrieval ablations used OpenAI `text-embedding-3-small`.

- Source and issues: [github.com/zensation-ai/zenbrain](https://github.com/zensation-ai/zenbrain)
- Paper: [arXiv:2604.23878](https://arxiv.org/abs/2604.23878) · Open-access archive: [10.5281/zenodo.19353663](https://doi.org/10.5281/zenodo.19353663)
- Try it in the browser: [zensation.ai/en/playground](https://zensation.ai/en/playground?utm_source=npm&utm_medium=readme&utm_campaign=evergreen)
- Model card: [huggingface.co/zensation-ai/zenbrain](https://huggingface.co/zensation-ai/zenbrain)
- Packages: [`@zensation/algorithms`](https://www.npmjs.com/package/@zensation/algorithms) · [`@zensation/core`](https://www.npmjs.com/package/@zensation/core) · [`@zensation/adapter-postgres`](https://www.npmjs.com/package/@zensation/adapter-postgres) · [`@zensation/adapter-sqlite`](https://www.npmjs.com/package/@zensation/adapter-sqlite) · [`@zensation/mcp`](https://www.npmjs.com/package/@zensation/mcp) · [`@zensation/ai-sdk`](https://www.npmjs.com/package/@zensation/ai-sdk)
- Registry entry: `ai.zensation/zenbrain`

License: Apache-2.0
