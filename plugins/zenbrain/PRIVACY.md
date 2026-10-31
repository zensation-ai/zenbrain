# Privacy: ZenBrain plugin for Claude Code

Last updated: 3 November 2026. This covers the plugin and the MCP server it starts, `@zensation/mcp` 0.3.1.

## What is stored

Text that Claude passes to `zenbrain_store`, the records that `zenbrain_consolidate` derives from it, and bookkeeping
for each record such as its layer, timestamps, confidence and how often it was recalled. Apart from creating the empty
memory file when it first starts, the server writes only when one of its five tools is called. It does not read Claude's chat history, Claude's own memory or your files.

## Where it is stored

In one SQLite file on your computer, by default `~/.zenbrain/memory.db`. You can choose another file with the
plugin's `db_path` setting.

## What leaves your computer

Nothing that the plugin stores. The server makes no network call of its own: no account, no telemetry, no analytics.
The only network access is `npx` downloading `@zensation/mcp` 0.3.1 and its dependencies from the npm registry the first
time the server starts; npm's own terms and privacy policy apply to that download. ZenSation AI receives no data from
the plugin.

What you write to Claude, including what Claude then passes to the tools, is part of your Claude conversation and is
governed by Anthropic's terms, not by this document.

## How long it is kept, and how to delete it

Until you delete it. `zenbrain_forget` deletes a single memory together with what consolidation linked to it. Deleting
the memory file removes everything. Uninstalling the plugin leaves the file in place, so your memory survives a
reinstall; delete the file yourself if you want it gone.

## Contact

Questions: [GitHub issues](https://github.com/zensation-ai/zenbrain/issues). Security reports: security@zensation.ai
(see [SECURITY.md](https://github.com/zensation-ai/zenbrain/blob/main/SECURITY.md)).
