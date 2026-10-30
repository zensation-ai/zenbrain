# ZenBrain plugin for Claude Code

Memory that lasts across sessions, as a Claude Code plugin. The plugin starts the
[ZenBrain MCP server](https://github.com/zensation-ai/zenbrain/tree/main/packages/mcp) (`@zensation/mcp`): five tools, one local SQLite
file, no account and no network call of its own.

## Install

From your shell (Claude Code 2.1.292 or newer):

```bash
claude plugin install zenbrain --marketplace zensation-ai/zenbrain
```

Inside a session the same works as `/plugin install zenbrain --marketplace zensation-ai/zenbrain` (2.1.275 or newer). On
older versions add the marketplace first: `claude plugin marketplace add zensation-ai/zenbrain`, then
`claude plugin install zenbrain@zensation-ai`.

The server needs **Node.js 22 or newer** on your `PATH`. The plugin runs `@zensation/mcp` at an exact version (0.3.0)
through `npx`, which downloads that version from the npm registry the first time it starts; after that the server makes no
network call of its own. A new server release reaches the plugin with a new plugin version.

## Where the memory lives

By default in `~/.zenbrain/memory.db`, the same file the `claude mcp add` line in the
[ZenBrain README](https://github.com/zensation-ai/zenbrain#readme) uses, so both setups share one memory. To use another file:

```bash
claude plugin install zenbrain@zensation-ai --config db_path=~/notes/zenbrain.db
```

or `/plugin configure zenbrain@zensation-ai` inside a session. The file stays where it is when you
uninstall the plugin; delete it yourself if you want the memory gone.

## Tools

| Tool | What it does |
|---|---|
| `zenbrain_store` | Write something into long-term memory; the layer is chosen from the content |
| `zenbrain_recall` | Search the episodic, semantic, procedural and core layers, sorted by a score from 0 to 1 |
| `zenbrain_forget` | Delete a memory for good, together with what consolidation linked to it |
| `zenbrain_consolidate` | One maintenance pass: emotionally weighted episodes become facts, working memory decays |
| `zenbrain_health` | How full each layer is |

The full description of each tool, and what this release does not do, is in the
[MCP server README](https://github.com/zensation-ai/zenbrain/blob/main/packages/mcp/README.md).
