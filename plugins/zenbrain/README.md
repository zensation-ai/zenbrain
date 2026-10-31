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
network call of its own. A new server release reaches the plugin with a new plugin version. (The `claude mcp add`
line in the [ZenBrain README](https://github.com/zensation-ai/zenbrain#readme) is not pinned and starts the newest release; Anthropic's
plugin directory asks plugins to pin the packages they launch.)

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

## Examples

Claude decides when to call a tool; these prompts show the tool each one usually leads to.

1. *"Remember that this project uses pnpm and Node 22, and that we never commit directly to main."*
   Claude stores the note with `zenbrain_store`.
2. In a new session: *"What do you remember about how we work in this repository?"*
   Claude searches with `zenbrain_recall` and finds the note from the earlier session.
3. *"Forget what you stored about committing to main."*
   Claude finds the entry with `zenbrain_recall` and deletes it with `zenbrain_forget`; a later recall no longer returns it.

*"How full is your memory?"* leads to `zenbrain_health`.

## Troubleshooting

- **`/mcp` or `claude mcp list` shows the server as failed.** Check `node -v`. The server needs Node.js 22 or newer;
  started with an older version it exits with *"zenbrain-mcp needs Node 22 or newer"*. Install Node 22 or newer, make
  sure it comes first on your `PATH`, and restart Claude Code.
- **The first start takes a few seconds.** `npx` downloads `@zensation/mcp` 0.3.0 once; later starts use the cached copy.
- **You want a fresh memory.** Delete the memory file (by default `~/.zenbrain/memory.db`), or point `db_path` at a new
  file as shown above.

## Privacy and support

The plugin keeps everything in the local memory file and sends nothing to us or anyone else; the details are in
[PRIVACY.md](PRIVACY.md). Questions and bug reports go to
[GitHub issues](https://github.com/zensation-ai/zenbrain/issues); security reports go to security@zensation.ai, as
described in [SECURITY.md](https://github.com/zensation-ai/zenbrain/blob/main/SECURITY.md).
