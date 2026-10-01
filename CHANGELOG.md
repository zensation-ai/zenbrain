# Changelog

All notable changes to ZenBrain are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.10] — 2026-10-01

**Two packages bumped** (patch only). `@zensation/algorithms`, `@zensation/core`,
`@zensation/adapter-sqlite` and `@zensation/ai-sdk` are unchanged.

| Package | From | To | Why |
|---|---|---|---|
| `@zensation/adapter-postgres` | 0.2.5 | 0.2.6 | the schema name can no longer end the `search_path` statement (#116) |
| `@zensation/mcp` | 0.1.8 | 0.1.9 | `zenbrain_recall` says when `minConfidence` applies (#117); `server.json` |

### Security — `@zensation/adapter-postgres`: schema name in `SET search_path` (#116)

Up to 0.2.5 the `schema` option went unquoted into `SET search_path TO <schema>, public`, in `query()`
and in `transaction()`. `pg` sends a query without parameters over the simple protocol, which runs
several statements — so a schema name containing `;` could end that statement and run further SQL.
Checked against PostgreSQL 16 with the 0.2.5 build: the schema option `x; DROP TABLE public.sentinel; --`
dropped the table. The schema name comes from the adapter configuration (`schema?: string`, README
"Multi-Context"); **you are affected if you derive it from input you do not control — then update to 0.2.6.**

From 0.2.6 a plain identifier (`[A-Za-z_][A-Za-z0-9_$]*`) is still used unquoted, so PostgreSQL folds it to
lower case exactly as before (`Personal` lands in `personal`). Any other name is double-quoted with
embedded quotes doubled and is read as one identifier; a name with a NUL character is rejected when the
adapter is created. Same check with the 0.2.6 build: the table stays, and `tenant-1`, which used to fail
with a syntax error, now works. Six new unit tests. `@zensation/mcp` uses SQLite only and is not affected.

### Fixed — `@zensation/mcp`: what `minConfidence` does in `zenbrain_recall` (#117)

The description did not say when the filter applies or what counts as confidence in each layer.
Measured in `MemoryCoordinator.recall()`: the filter runs on the merged results before deduplication and the final
ranking, and the list is cut to `limit` without refilling, so fewer than `limit` results may come back.
Facts use their stored confidence, procedures their success rate; core blocks, episodes and
working-memory items count as 1 and are kept. The tool description and the `recall` entry in
`docs/api-reference.md` now say this. Text only, no behaviour change.

### Docs

- README: 801 tests (the six new adapter-postgres tests), in all three places.

## [0.4.9] — 2026-10-01

**All six packages bumped.** This release carries the fixes from the package audit of 2026-09-30
(#107–#114). Three packages take a minor bump because their behaviour changes for some callers:

| Package | From | To | Why |
|---|---|---|---|
| `@zensation/algorithms` | 0.4.6 | **0.5.0** | FSRS functions reject invalid input (#111); `require()` types (#107) |
| `@zensation/core` | 0.3.4 | **0.4.0** | `InMemoryStorage` removed from the public API (#110); `require()` types (#107) |
| `@zensation/adapter-postgres` | 0.2.4 | 0.2.5 | driver types as dependency (#108), `require()` (#113), README (#114) |
| `@zensation/adapter-sqlite` | 0.2.4 | 0.2.5 | driver types as dependency (#108), `require()` (#113), README (#114) |
| `@zensation/mcp` | 0.1.7 | 0.1.8 | tool definitions and `instructions` (#112), `require()` (#113), `server.json` |
| `@zensation/ai-sdk` | 0.1.5 | **0.2.0** | peers narrowed to `ai ^7` / `@ai-sdk/provider ^4` (#109), `require()` (#113) |

**Note on dependencies:** core now depends on `@zensation/algorithms ^0.5.0`; mcp on `@zensation/core ^0.4.0`;
the adapter peers accept `@zensation/core ^0.2.0 || ^0.3.0 || ^0.4.0`, the ai-sdk peer `^0.3.0 || ^0.4.0`.

### Removed — `InMemoryStorage` from `@zensation/core` (#110)

It was a test double: it keeps INSERT parameters as `col_0`, `col_1`, … and returns no content through
the coordinator. Measured before the change with the calls of `examples/with-mastra.ts`: three facts
stored, recall "green tea" → **0** results; the same steps with `createMemoryAdapter()` from
`@zensation/adapter-sqlite` → **3**, the tea fact first. **Use `createMemoryAdapter()`** (SQLite in
memory) for storage without a database server. `FakeEmbeddingProvider` and `InMemoryCache` stay.
`examples/with-mastra.ts` and `examples/with-llamaindex.ts` now use `createMemoryAdapter()` — until
now they recalled nothing.

### Changed — FSRS functions reject invalid input (#111, fixes #53)

`getRetrievability`, `scheduleNextReview`, `updateAfterRecall`, `updateAfterForgot` and
`initFromDecayClass` throw a `RangeError` that names the argument instead of computing on: a state
without finite `difficulty`, `stability > 0` or a valid `nextReview`; a `grade` outside the integers 1–5;
a `retrievability` outside [0, 1]; a `targetRetention` outside (0, 1); an unknown decay class (it used
to fall back to `normal_decay` silently — **this is the change that makes algorithms 0.5.0**); a
non-finite `emotionalWeight` (finite values are still clamped to 1–2). `updateAfterRecall(state, 5)`
without a retrievability used to return stability `NaN` and an `Invalid Date` (#53);
`examples/with-vercel-ai.ts` and `examples/with-langchain.ts` made that call and now pass
`getRetrievability(state)`; on an error they exit with code 1.

### Changed — `@zensation/ai-sdk` peers (#109)

The middleware uses the `LanguageModelV4*` types, which only `@ai-sdk/provider` 4 (the line under
`ai` 7) exports. The peers said `ai ^6 || ^7` and `@ai-sdk/provider ^3 || ^4`, so a consumer on ai 6
installed without a warning and got TS2724. Now `ai ^7.0.0` and `@ai-sdk/provider ^4.0.0`; on ai 6, npm
reports the peer conflict. **If you are on ai 6, stay on `@zensation/ai-sdk@0.1.5`** — its runtime works there.

### Fixed — types and module loading

- **`require()` gets CommonJS types** in algorithms and core (#107): each `exports` entry now has
  `import: { types: .d.ts }` and `require: { types: .d.cts }`. `@arethetypeswrong/cli` on the packed
  tarballs: FalseESM 21 → 0 (algorithms), 9 → 0 (core).
- **Driver types ship with the adapters** (#108): `@types/pg` and `@types/better-sqlite3` are
  dependencies, because the published declarations import from `pg` / `better-sqlite3`. A consumer
  under `--strict` got TS7016 twice; now none.
- **`require()` loads the ESM-only packages** (#113): adapter-postgres, adapter-sqlite, mcp and ai-sdk
  have a `default` export condition. `require()` used to fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`; on
  Node 22.12+ it now loads the ESM build (on 22.0–22.11, use `import`).

### Changed — `@zensation/mcp` tool definitions (#112)

- `zenbrain_recall` no longer offers `includeContext` and `taskType`. No store path writes an encoding
  context, so neither could change a result; clients that still send them are unaffected. "Read-only."
  left the description (the annotation says it); `limit` and `minConfidence` say what they do.
- The server sends `instructions` on `initialize`: when to call each of the four tools.
- `zenbrain_store` no longer claims `steps` are required for a procedure — without them the steps are
  taken from the content, as the coordinator always did.
- `server.json`: the `ZENBRAIN_DB` description carries the `~/` and absolute-path rule from the README.

### Docs

- `docs/api-reference.md`: `store()` returns the id as a `string` (it said `{ layer, id }`); `recall()`
  lists its options and says that `includeContext` / `taskType` change nothing today (#112).
- READMEs: response promise without a number (#114); `@zensation/cli` out of the package lists — the
  CLI is retired and deprecated on npm (#114); postgres embedding dimension `vector(1536)` (#114);
  ai-sdk install line includes `ai` and `@ai-sdk/openai` (#113).
- `scripts/verify-zero-dependencies.sh` resolves core together with the algorithms tarball from the
  same build, so a release that bumps both checks the artifacts being published.

## [0.4.8] — 2026-09-30

**All six packages bumped** (patch only). `@zensation/core` and `@zensation/adapter-sqlite` carry
the recall fix (#95) and the data fixes from #100. `@zensation/mcp` carries those, starts from any
working directory, and describes its four tools with their limits (#100, #101).
`@zensation/algorithms`, `@zensation/adapter-postgres` and `@zensation/ai-sdk` change only in their
README (#96, #101; for `ai-sdk` also #95): every package page now says where the benchmark results
are reported instead of printing them. npm reads the README at publish time — without a release the
package pages would keep the old text.

The recall fix from #95 was merged on 2026-09-26 but never published: until this release, every
install from npm still answered a query without an embedding provider with the same rows.

**Note on dependencies:** every internal range is a caret (`^0.4.0`, `^0.3.0`, `^0.2.0`), so no
dependent package falls out of its range with a patch bump.

### Fixed — recall without an embedding provider answered every query with the same rows (#95)

Without an `EmbeddingProvider`, `semantic.search` returned `getRecent(limit)` and never read the
query. `episodic` did the same; `procedural` ranked by recorded success rate, a real signal but
just as blind to the query. Every SQLite user lands on this path, a default
`npx @zensation/mcp` install included, because the vector branch is pgvector-only. Measured on
2026-09-26 against `npx -y @zensation/mcp` with three unrelated facts stored:

| Query | Before | After |
|---|---|---|
| `Leuchtturm` | all three rows, every score 0 | one result, score 1.0 |
| `Backrezept mit Speck` | the same three rows, every score 0 | one result, score 0.318 |

The non-vector path now ranks by wording (`packages/core/src/lexical.ts`, no dependencies):
folded tokens (umlauts, sharp s, accents), a small DE/EN stop list, IDF weighting over a recency
window of 500 rows, and a bonus when a candidate carries the query as an adjacent phrase.
Procedural memory keeps its success rate as a weight on top. A score of 0 now means that nothing
matched. The path matches wording, not meaning: synonyms still need an embedding provider.

### Fixed — `zenbrain_recall` described a default it does not use

The tool description told MCP clients that `zenbrain_recall` *"searches every layer by
default"*. The input schema said *"defaults to all but working"*, and the handler searched four
layers: episodic, semantic, procedural and core. Working memory is searched only when a client
names it; short-term and cross-context memory are not reachable through `recall`. Glama's
automated assessment of the tool definitions flagged the contradiction (as of 2026-09-18).

The default is now one list in `packages/mcp/src/server.ts`. The handler passes it to the
coordinator, and the tool description and the schema text are written from it, so the three can
no longer disagree. Two new tests hold this: one reads the layers off the call the handler
actually makes and checks the description against them; the other stores a memory and checks
that a default recall leaves working memory out while an explicit request finds it. What a
recall returns is unchanged. `packages/mcp/README.md` carried the same sentence and is corrected.

### Fixed — core memory could not be written on SQLite

`store(…, { type: 'core' })`, and every store with a confidence above 0.9 — the documented route
into core memory — failed on SQLite with *"SQLite3 can only bind numbers, strings, bigints,
buffers, and null"*, and nothing was written. The core layer passes a block's `pinned` flag as a
boolean; better-sqlite3 binds no booleans. Measured on 2026-09-28 against the published
`@zensation/mcp` 0.1.6: both calls errored, and `zenbrain_health` reported zero core blocks.

The adapter now binds `true` and `false` as `1` and `0`, next to the `Date` coercion it already
did, and the core layer hands `pinned` back as a real boolean on both adapters. Tested through
the coordinator and through `zenbrain_store` over a real SQLite store.

### Fixed — core blocks created by `store()` could replace each other

`store(…, { type: 'core' })` labels the new block itself, and a block with the same label is
updated in place. The label was the first 50 characters with everything outside `[a-zA-Z0-9_ -]`
removed. Measured on 2026-09-28 against a real SQLite store: two Chinese sentences both got the
label `""` and the second replaced the first; two English sentences that share their first 50
characters did the same; `Über` became `ber`. On PostgreSQL this happened already; on SQLite the
fix above is what makes core blocks writable, so the two changes ship together.

The label is now the first words of the content in any script, plus eight hex digits of a hash of
the whole content. Different memories never share a label, and the same memory stored twice
updates one block. A block written under an old-style label and stored again verbatim keeps that
label instead of gaining a twin. The label format was never documented; code that reads blocks
by label should keep choosing its own labels with `getCoreMemory().upsertBlock(label, content)`.

### Fixed — SQLite wrote two timestamp formats, and three queries went wrong because of it

`NOW()` and the column defaults wrote SQLite's `datetime('now')` — `2026-09-28 21:25:17`, no zone
— while `Date` parameters arrived as ISO strings with `Z`. One table, sometimes one row, held both
(`created_at` beside `fsrs_next_review`); a project that builds on the schema had to catch a
crash when comparing the two. Measured on 2026-09-28 against the published packages and a real
database file, each case with a control that shows the query can find the row at all:

| Case | Before | Control |
|---|---|---|
| a fact due for one hour | `getDueForReview` returns nothing | due for 25 hours: returned |
| an episode stored just now | `getByTimeRange(today 00:00Z, …)` returns nothing | range from yesterday: returned |
| `created_at` 21:25:17 UTC | `createdAt` 19:25:17Z in Europe/Berlin | — |

Text comparison puts `' '` before `'T'`, so on the day itself the zone-less value always lost;
and JavaScript reads a date-time without `T` or zone as local time.

The adapter now writes one format everywhere: ISO 8601, UTC, milliseconds, `Z`, the shape
`Date.prototype.toISOString()` produces. A database written by an earlier version is rewritten
once when the adapter opens it, in one transaction, and `PRAGMA user_version` records it — schema
version 1, exported as `SCHEMA_VERSION`. Only text SQLite can read as a time is rewritten;
anything else stays as it was. Checked on two database files that the published 0.1.6 wrote the
same day: every timestamp rewritten to the same instant, and the three cases above right.

SQLite cannot change a column default without rebuilding the table, so tables created before
this version keep `datetime('now')` as their default. The layers never rely on it; code that
inserts into these tables directly and leaves the timestamp out should write
`strftime('%Y-%m-%dT%H:%M:%fZ','now')`. The adapter README now documents every table, its
columns and the timestamp format, and no longer claims that SQLite has no similarity search or
falls back to recency: it has both a cosine scan and, without an embedding provider, the lexical
ranking of #95.

### Fixed — every consolidation pass promoted the same episodes again

`consolidate()` looks at the 100 most recent episodes and turns each one with an emotional weight
above 0.5 into a semantic fact. Nothing recorded that it had done so, so the next pass did it
again. Measured on 2026-09-28 against the published `@zensation/mcp` 0.1.6 with a real SQLite
file: one episode with weight 0.8, three passes, three identical facts. The tool description
called the pass *"safe to run periodically"*, and `docs/recipes.md` suggests running it hourly.

A promoted episode is now marked in its own `metadata` (`consolidatedInto: <fact id>`), which both
adapters already store, and later passes leave it alone. An episode that an earlier version
promoted verbatim is recognised by that fact and only marked, so upgrading does not add one more
copy. Copies made before this version stay where they are: consolidation deletes nothing.

The descriptions now say what the pass does. The MCP tool, its README and `docs/recipes.md` spoke
of promoting *"repeated episodes"* and of pruning *"what has fallen below the retention
threshold"*; the selection is by emotional weight, and `pruned` has always been 0 because nothing
prunes. `docs/api-reference.md` said *"based on access patterns"*, and gave `decay()` a signature
it does not have (`Promise<{ decayed, pruned }>`; it is `{ removed: number }`, synchronous).

Tests on a real SQLite store: three passes promote `[1, 0, 0]` (before: `[1, 1, 1]`), the mark
keeps other metadata, an earlier verbatim promotion is not copied again, and `pruned` is 0 with
nothing deleted; the same three-pass check runs over MCP. A database file that 0.1.6 wrote with
three copies of one fact gets no fourth.

### Fixed — the MCP server did not start from `/` with the documented configuration

The README's client config sets `"ZENBRAIN_DB": "~/.zenbrain/memory.db"`. An MCP client passes the
environment verbatim, and nothing expanded the tilde, so the adapter received a relative path whose
first directory is literally named `~`. Measured on 2026-09-30 against the published 0.1.6 with
Node 22.23.3, and against this change with a stand-in home directory:

| Working directory | `ZENBRAIN_DB` | 0.1.6 | Now |
|---|---|---|---|
| `/` — where Claude Desktop may start servers | `~/.zenbrain/memory.db` | exits: `ENOENT: mkdir '~/.zenbrain'` | opens `<home>/.zenbrain/memory.db` |
| `/` | unset, so `./zenbrain.db` | exits: `SqliteError: unable to open database file` | exits, naming `/zenbrain.db` and how to set `ZENBRAIN_DB` |
| a writable directory | `~/.zenbrain/memory.db` | creates a directory named `~` there | opens `<home>/.zenbrain/memory.db` |

A leading `~/` now means the home directory. Everything else passes through unchanged —
`:memory:`, absolute paths, and relative paths, which stay relative to the working directory as
documented. The ready line on stderr names the store's absolute path. Unit tests cover the
expansion and the message.

### Added — tests for the two start paths that silenced 0.1.3 on macOS and Windows

does-it-install's weekly runs have listed `@zensation/mcp` as failing on two of three platforms
since 2026-08-31: Linux passed, macOS and Windows ended the handshake with *"Connection closed"*.
Those runs test 0.1.3, whose entry guard compared `import.meta.url` with a `file://${argv[1]}`
template. Reproduced on 2026-09-28 by installing the published packages the way the service does,
into a prefix under `os.tmpdir()`, and starting `node <prefix>/…/dist/index.js`:

| Version | Path as the service passes it (`/var/…`) | Same file, resolved (`/private/var/…`) |
|---|---|---|
| 0.1.3 | exits 0, nothing on stdout or stderr | answers, four tools |
| 0.1.6 | answers, four tools | answers, four tools |

On macOS every `os.tmpdir()` lies under `/var`, a symlink to `/private/var`. On Windows the
runners' temp path carries the 8.3 short name `RUNNER~1`, and `pathToFileURL` writes `~` as `%7E`
where the template leaves it alone; that part is shown on the URL functions, not on a Windows
machine. Linux temp paths have neither. The guard fixed in 0.1.5 (#86) compares resolved path with
resolved path and handles both. The entry-guard tests now pin both shapes, the tilde as a unit case
and the directory symlink as a real start through a linked package directory. With the 0.1.3 guard
put back, five of the eight fail.

### Changed

- **`zenbrain_store` describes its routing as the code does it.** It said *"a narrated event becomes an
  episode"*; the router decides by emotional weight (above 0.5), whatever the form of the text. The
  description now names all four routes (procedure, episode, pinned core memory above confidence 0.9,
  semantic fact) and the side effects: every call adds a memory except a repeated core memory, which
  is updated, and the content is also kept in working memory while the server runs. A test over a
  real SQLite store checks each route and the exception against the layer counts.
- **The MCP registry entry is published on release** (#94). `packages/mcp/server.json` was bumped
  with every release, but no step ever pushed it: on 2026-09-26 the official registry still
  served 0.1.3, three patch versions behind npm. The new workflow runs on every `v*` tag and can
  be started by hand; it checks the result by the registry's `isLatest` flag, not by the first
  entry of the version list.
- **The repository README names the configuration the LongMemEval-500 figures were measured in**
  (#96): `nomic-embed-text` as the embedding provider. A default install takes the lexical path
  above, which is not that configuration.
- **The package pages carry no paper figures.** The *About ZenBrain* block in all six package
  READMEs printed the LongMemEval-500 results. A library page now says where they are reported —
  the paper, with the configuration they were measured in — and that the reproduction packages
  are on Zenodo. npm shows a README as it was at publish time, so this reaches the package pages
  with the next release.
- **The tool definitions say when to use a sibling, and `zenbrain_consolidate` says what it
  deletes.** It is annotated as destructive, and its description now names the deletion: working-
  memory slots whose relevance has decayed to 0.01 or below are removed; long-term memory is only
  added to. Each description names the other tool to use for the cases it does not cover, the
  `taskType` parameter of `zenbrain_recall` says it only acts together with `includeContext`,
  `zenbrain_health` returns its counts as structured content with an output schema like the other
  three, and `store` and `consolidate` declare `openWorldHint: false` like `recall` and `health`.
  Tests pin each of these; with the previous definitions, all four new ones fail.
- **`docs/benchmarks.md` still carried the figures retracted on 2026-09-15** after the README and
  the package pages were corrected in 0.4.7. It now matches them, with a note in the section.
- **The `@zensation/core` quick start runs as printed.** It passed an `adapter` and an `embedder`
  it never defined; it now sets up a SQLite store. The package tables in the `core` and
  `algorithms` READMEs no longer call the SQLite adapter *sqlite-vec* (it uses its own cosine
  function over `better-sqlite3`) and list the MCP server and the AI SDK middleware.
- **The README lists all seven examples.** The LlamaIndex.TS and Mastra examples exist (#17 and
  #18 were closed on 2026-08-14), but the README still offered them as open issues.
- The 0.4.7 entry below no longer quotes a traffic share in its reason for campaign parameters.

## [0.4.7] — 2026-09-21

**All six packages bumped** (patch only), so that corrected README text reaches the npm package
pages. npm reads the README at publish time, not from the repository — a merged fix to a README
does not change what npmjs.com serves until the next release of that package.

### Fixed — the package pages carried a retracted benchmark claim

The benchmark correction of 2026-09-15 was rolled out on the website (2026-09-18) but never
reached the package READMEs. All seven `@zensation` packages still served the superseded wording:

| Was | Now | Why |
|---|---|---|
| `wins all nine head-to-head answer-quality comparisons` | `three of nine … hold, the remaining six are ties, none lost` | The judge versions were not matched (Sonnet 4.5 against 4.6). Re-run version-matched on 2026-09-15: three comparisons hold, all against A-Mem; six are ties; none lost. |
| `1/106th of the per-query token cost` | `1/109.6` | The 106 came from 105,577.9 / **1,000**, a thousands constant in a charting script. Measured: 105,577.9 / 963.2 = **109.6**. |
| `p_min = 6.2e-31`, `d in [0.18, 0.52]` | removed | Both are side figures over **nine** wins, six of which are now ties. They did not become wrong — they became homeless, and they are not derivable for the three remaining comparisons from the published record. |

Unchanged: the Bonferroni correction `alpha = 0.05/18`, the ratio form `47.7% vs. 52.2%`, and the
phrase *the nine head-to-head comparisons* in `README.md` — there were nine comparisons; there were
not nine wins.

### Changed

- Self-set links to `zensation.ai` now carry campaign parameters, so that referral traffic can be
  attributed at all.
- `packages/mcp/server.json` now states the version it is published as; it had been left at 0.1.4
  while npm served 0.1.5.

### Note on dependencies

Patch bumps only. Every internal range is a caret (`^0.4.0`, `^0.3.0`, `^0.2.0`), so no dependent
package falls out of its range — verified before tagging, after the 2026-08-05 release left npm in
an `ERESOLVE` state for two days following a minor bump.

## [0.4.6] — 2026-09-11

**`@zensation/mcp` only** (0.1.4 → 0.1.5). No other package is bumped; the publish step skips
versions already on the registry.

### Fixed — the server did not start on either documented path

`zenbrain-mcp` exited 0 and wrote nothing to stdout or stderr. Not an error, not a crash: a
silent no-op. The entry guard compared `import.meta.url`, which has symlinks resolved, against
`process.argv[1]`, which is the path as the caller spelled it. npm installs every `bin` as a
symlink, so for an installed package the two never matched and `main()` was unreachable.

Measured across all three invocation paths on `node:22-slim`, with a known-good MCP server
probed identically on the same image as a control:

| How it is started | Before | After |
|---|---|---|
| `npm i -g @zensation/mcp` then `zenbrain-mcp` | exit 0, nothing on either stream | answers, four tools |
| `npx -y @zensation/mcp` | exit 0, nothing on either stream | answers, four tools |
| `node <realpath>/dist/index.js` | answers | answers |

The first two are what this package's own README documents — the install line and the
`"command": "npx"` client configuration. So the documented way in has been dead since the guard
was introduced, in the same file whose Node-version guard exists precisely to stop a server from
coming up silently wrong.

The check now resolves the argv path the way the loader resolved the module and compares like
with like, and it lives in an exported function so the symlink arrangement is testable.

### Fixed — clients were told the wrong version

`createZenBrainServer` fell back to a written-out `'0.1.0'`, and `index.ts` calls it with no
options, so that fallback was what every client saw while the package sat at 0.1.4. The default
now comes from the manifest.

### Added — the tests that would have caught both

The existing suites could not catch either defect, and this is worth stating plainly: the
protocol tests construct the server with a version of their own, so the bad default was never
exercised; and a pure-function test of the entry guard passes just as happily while the
installed binary stays dead. Verified rather than assumed — with the old call site restored,
every unit test stays green and only the new test goes red.

So one test spawns the built entry point **through a real symlink** and requires an answer on
the wire, and another drives the no-options path and compares the reported version against the
manifest rather than against a second literal.

## [0.4.5] — 2026-09-06

**`@zensation/mcp` only** (0.1.3 → 0.1.4), and nothing but the version (#85). No other package is
bumped; the publish step skips versions already on the registry.

### Changed

- Republished so that the npm search index would take a download snapshot of the package: the
  index records one at publish time, and a package published only once read zero there.
  `@zensation/ai-sdk` stayed at 0.1.3 on purpose, as the control. No description, keywords,
  README or repository field was touched. `packages/mcp/server.json` moved with the version.

## [0.4.4] — 2026-09-01

**`@zensation/algorithms` only, description only.** `src` is byte-identical to `0.4.2`; no other
package is bumped (the publish step skips versions already on the registry).

### Changed

- The package description now says what the library is for — *agent memory for LLM agents* —
  before listing how it works. The npm search ranks by word sequences in the description, and
  the previous text never contained the phrase people actually search for. Same correction the
  GitHub repository description received on 2026-08-29.

## [0.4.3] — 2026-08-29

**Metadata only, and every item is a correction rather than a change.** `packages/*/src` is
byte-identical to `0.4.2`. All six packages take a patch bump so the corrections reach npm.

### Fixed — the reproducibility claim was not backed by anything reachable

Every package page, this README, `docs/benchmarks.md` and the Hugging Face model card told the
reader that reproduction material sits behind a Zenodo DOI. It does not. Each of the three
deposited versions — v6, v7, v8 — holds exactly one file, the paper PDF, and is typed
`Preprint`. There is no reproduction record on Zenodo, no ablation runner in `scripts/`, and no
test in this repository that asserts any published figure.

That is the wrong claim for this project to get wrong, so it is gone. What replaces it is the
part that is true and can be run: `scripts/compare-mechanisms.sh` re-runs the mechanism
comparison in under a minute, without API keys or an install, and prints a positive and a
negative control before its result. The LongMemEval and LoCoMo figures come from the paper, and
the text now says so instead of implying a runner that does not exist.

The DOI itself keeps its place under the label that was already correct one line above it in
this README — **Open-access archive**. The README had listed the same DOI twice, once as the
archive and once as *Reproducibility artifacts*; the second line is removed.

**This is a wording correction, not a decision to stop there.** Depositing the material and
restoring the stronger sentence remains open, and would be the better ending.

### Fixed — the Zenodo DOI on every package page pointed at a pinned old version

`CITATION.cff` carries `10.5281/zenodo.19353663` and says why, in its own `description` field:
*"Concept DOI — resolves to the latest deposited version on Zenodo."* The **About ZenBrain**
block, which is the one paragraph every package page opens with, carried
`10.5281/zenodo.19481262` instead — that is the version DOI of **v6**, while the current
deposit is **v8**. Eighteen occurrences across eight files, including this repository's own
README and `docs/benchmarks.md`.

A version DOI in a README does not stay wrong quietly for one release; it drifts further with
every deposit. Every one of them is now the concept DOI, which is what the repository already
documented as the rule.

### Fixed — two package pages linked a Hugging Face namespace we left

`packages/algorithms/README.md` and `packages/core/README.md` pointed at
`huggingface.co/alexanderbering/zenbrain`. That URL answers `307` and redirects to
`huggingface.co/zensation-ai/zenbrain`, so nothing looked broken — but every visitor and every
crawler following it recorded the personal namespace we moved away from, which is exactly the
entity signal the move was meant to consolidate. Both now point at the organisation.

### Fixed — the `author` field disagreed with the citation metadata

Six packages declared `author: "ZenSation <open-source@zensation.ai>"`. `CITATION.cff` declares
`affiliation: "Zensation AI"`, and that lower-case form is the one used in structured fields
throughout, because the mixed-case brand spelling splits entity matching between records. The
`author` field is structured metadata, so it follows the citation file: `Zensation AI`.

### Fixed — `CITATION.cff` still described the 0.4.0 release

`version: 0.4.0` and `date-released: 2026-08-05`, three releases ago. Anyone who used the
"Cite this repository" button between 5 August and today got a citation for a version that was
no longer the one they had. Now `0.4.3` and `2026-08-29`.

## [0.4.2] — 2026-08-29

**Metadata only. No runtime code changed** — `packages/*/src` is byte-identical to `0.4.1`.
`@zensation/mcp` and `@zensation/ai-sdk` move `0.1.1 → 0.1.2`; the other four are untouched.

### Changed — the npm descriptions of the two integration packages

npm's search ranks on the words in a package's `description`, and it weighs that far above
download counts. For the query `vercel ai sdk memory`, `@turbomem/vercel-ai` (142 downloads a
month) ranks first and `ai` (90,669,436 downloads a month) second. Of the fifteen top results
for `mcp memory`, three carry no keywords at all; what all fifteen have in common is those two
words standing next to each other in a name or a description.

Neither of these packages had that. `@zensation/mcp` said *"gives any MCP client a 7-layer
memory"* and `@zensation/ai-sdk` said *"recall relevant memories before a model call"* — both
accurate, and neither in the top 250 for any phrase someone looking for this would actually
type, while `@mem0/vercel-ai-provider`, the direct counterpart to `@zensation/ai-sdk`, sits at
39. The new descriptions put the phrases together and claim nothing new:

- `@zensation/mcp` — "MCP memory server for ZenBrain: agent memory for any Model Context Protocol client — store, recall, consolidate, health. Local SQLite file, no account."
- `@zensation/ai-sdk` — "Vercel AI SDK memory middleware: agent memory that recalls before a model call and stores the turn after it. Zero runtime dependencies."

Whether this moves anything is an open question, and it is measured the same way it was found:
the same queries, re-run, with `7-layer memory` → `@zensation/core` at rank 1 as the control
that the instrument still works.

### Fixed — documentation that had drifted from what is published

- The old `@zensation/mcp` description named a tool `inspect`. There is no such tool. The four
  are `zenbrain_store`, `zenbrain_recall`, `zenbrain_consolidate` and `zenbrain_health`.
- The package table in the README listed `@zensation/mcp` and `@zensation/ai-sdk` as
  `:construction: Unreleased`. Both have been on npm with provenance attestations since
  2026-08-28.
- Both package READMEs opened with *"Status: 0.1.0, early release"* while `0.1.1` was the
  published version. The version number is out of the sentence — the status was the point, and
  a pinned number there only ages.
- `@zensation/ai-sdk` did not appear in this changelog at all. It is Vercel AI SDK middleware:
  it recalls before the model call and stores the turn after it, carries zero runtime
  dependencies, and its twelve tests assert on `doGenerateCalls[0].prompt` — what reached the
  model — rather than on what the middleware returned.

## [0.4.1] — 2026-08-28

**Two things: a new package, and a metadata-only republish of the existing four.**

Package versions move independently: `@zensation/algorithms` `0.4.0 → 0.4.1`, `@zensation/core` `0.3.0 → 0.3.1`, `@zensation/adapter-sqlite` and `@zensation/adapter-postgres` `0.2.0 → 0.2.1`. `@zensation/mcp` is new at `0.1.0`.

### Added — `@zensation/mcp`, an MCP server

`npm install -g @zensation/mcp` gives any [Model Context Protocol](https://modelcontextprotocol.io) client — Claude Desktop, Claude Code, Cursor — four tools: `zenbrain_store`, `zenbrain_recall`, `zenbrain_consolidate`, `zenbrain_health`. Storage is a local SQLite file (`ZENBRAIN_DB`, default `./zenbrain.db`). No account, no network call, no LLM provider configured.

**It is a separate package on purpose.** An MCP server needs the protocol SDK; `@zensation/core` must not have it. Keeping the dependency out here is what lets `scripts/verify-zero-dependencies.sh` keep passing unchanged — installing `@zensation/core` still resolves to exactly two packages, itself and `@zensation/algorithms`.

The server is verified three ways in CI on Node 22, 24 and 26: twelve tests drive a real MCP client over a linked in-memory transport; four run the same calls against the real SQLite adapter; and `scripts/smoke-mcp.mjs` spawns the built binary as a child process and round-trips a memory through real stdio, because green in-process tests say nothing about a bin path or a native module load.

`zenbrain_recall` leaves out rows whose `content` did not survive the storage adapter and reports the number in a `skipped` field, rather than failing the whole call with an output-validation error.

### Changed — the four existing packages: metadata only

**No runtime code changed.** `packages/*/src` is byte-identical to `0.4.0` in all four packages; the diff is READMEs and `package.json` keywords.

npm indexes a package by its title, description, README and keywords. Until this release, none of the four package READMEs on npmjs.com carried the benchmark result or a link to the paper, and the two adapter READMEs did not link back to the repository at all — so the one claim that distinguishes this library was invisible on the surface where people search for it. All four now carry the head-to-head result, the arXiv link and the repository link; keywords grew from 9 to 14 on `core` and from 5 to 11 on each adapter.

A version bump is the only way to move a README on npm: the registry renders the README of the *published* version, not of the default branch.

## [0.4.0] — 2026-08-05

**Compatibility-only release. No runtime code changed** — `packages/*/src` is byte-identical to `0.3.5`. This release exists to publish a narrower, and finally honest, platform requirement.

Package versions move independently: `@zensation/algorithms` `0.3.4 → 0.4.0`, `@zensation/core` `0.2.2 → 0.3.0`, `@zensation/adapter-sqlite` and `@zensation/adapter-postgres` `0.1.0 → 0.2.0`.

### Changed — BREAKING: Node.js 22 or newer is now required

`engines.node` moves from `>=18` to `>=22` in all four published packages.

**The previous `>=18` was never accurate.** `@zensation/adapter-sqlite@0.1.0` depended on `better-sqlite3@^12`, which itself declares `20.x || 22.x || 23.x || 24.x || 25.x || 26.x` — so the effective floor was already **20**, and a Node 18 install would fail on the transitive dependency while our own metadata claimed support. The real change for users is therefore **20 → 22**, not 18 → 22. Node 18 and 20 have both reached end of life.

Under semver, a breaking change in the `0.y.z` range is expressed by the **minor**, and this is deliberate: a `^0.3.4` or `^0.1.0` range does **not** match the new versions, so existing installations on Node 20 are never upgraded into a broken state automatically. Opting in is an explicit act.

**Migration:** upgrade to Node 22 LTS or newer, then bump the ranges — `@zensation/algorithms` to `^0.4.0`, `@zensation/core` to `^0.3.0`, either adapter to `^0.2.0`. Nothing else has to change: no import paths, no APIs, no configuration. Staying on `0.3.x` / `0.1.x` remains valid on Node 20; those versions are unaffected by this release and are not being removed.

### Changed — `@zensation/adapter-sqlite`: `better-sqlite3` 12 → 13

Version 13 is built on **N-API**, so its prebuilt binaries are ABI-independent and install cleanly across current and future Node releases; the version 12 line required a matching prebuild per Node ABI and was the reason the floor could not be stated honestly before. `better-sqlite3@13` itself requires Node `>=22`, which is what forces the baseline above. No adapter API changed.

### Changed — peer ranges widened

Both adapters previously declared `peerDependencies: { "@zensation/core": "^0.2.0" }`, which the move of `core` to `0.3.0` would have broken. The range is now `^0.2.0 || ^0.3.0`: `core`'s public API is unchanged between `0.2.2` and `0.3.0`, so pinning either line is legitimate.

## [0.3.5] — 2026-07-17

### Added

- **`@zensation/adapter-sqlite` and `@zensation/adapter-postgres` are now published to npm** (both `0.1.0`). Until now the README listed them as ready while they existed only in this repository, so anyone following the documented setup could not install the storage layer it described. The release job publishes them alongside `core` and `algorithms`.

### Fixed — `@zensation/adapter-sqlite`

The SQLite path did not work end to end when driven through `MemoryCoordinator`. Nothing in CI exercised the real core↔adapter integration, so five independent defects went unnoticed. Each was reproduced against realistic data before being fixed:

- **`store()` threw on every semantic fact.** The layers bind `fsrs_next_review` as a `Date`, which better-sqlite3 cannot bind. Parameters are now coerced (`Date` → ISO string).
- **`recall()` returned nothing, silently.** `embedding <=> ?` was rewritten to the constant `0`, producing `ORDER BY 0` — invalid in SQLite. The coordinator swallows per-layer errors, so callers saw an empty result indistinguishable from an empty memory. The operator now maps to a real cosine-distance function (`zb_cosine_dist`) over the stored embeddings, so similarity search works. It scans linearly (no ANN index): suitable for development, tests and single-user data; use the PostgreSQL adapter for large workloads.
- **Repeated `$1` placeholders bound the wrong values**, breaking all three vector queries. `$N` now maps to numbered `?N` with object binding.
- **`EpisodicMemory.getRecent(limit, context)` swapped its parameters.** Its query places `$2` before `$1`, so positional binding assigned the limit to `context` and the context to `LIMIT`. Every context-filtered recall failed.
- **`procedural_memories` used a `trigger_text` column** while the layer inserts into `trigger`, so every procedural write failed. The column now matches the canonical schema; all six tables are identical to it.

Adds a coordinator↔adapter integration test suite covering each regression, plus distance-function correctness. The PostgreSQL adapter is unaffected: it passes parameters straight to `pg`, where `$N`, `<=>` and date binding are native.

## [0.3.4] — 2026-06-27

### Documentation consistency

Cosmetic patch — no code changes. Reconciles the algorithm-count wording across the repo and the npm package so it matches the architecture described in the paper:

- The **architecture** is **15 neuroscience-inspired mechanisms — 9 foundational algorithms + 6 PMA components** (the 6 PMA are proprietary; see the [paper](https://arxiv.org/abs/2604.23878)). Stated as a clear callout in the root and package READMEs.
- The **open-source package** ships **20 algorithm modules (10 core + 10 advanced)** — corrected from the previous "22 / 12 core" miscount (the old "12 core" counted 10 algorithms plus shared `types`).
- `package.json` description, `docs/ROADMAP.md`, and historical changelog counts aligned to 10 core / 20 total.

No algorithm code or APIs changed.

## [0.2.2] — 2026-05-24

`@zensation/core` patch — packaging + dependency hygiene. No runtime API changes.

### Fixed
- **README now shipped to npm.** The `0.2.1` tarball was published without `README.md`, so the npm package page rendered no documentation. `0.2.2` includes the README (already listed in `files`).

### Changed
- **`@zensation/algorithms` dependency bumped `^0.2.1` → `^0.3.0`.** Aligns `@zensation/core` with the current advanced-algorithms release and lets the monorepo self-link its own `algorithms` workspace. Additive only — `0.3.x` introduced no breaking changes, and `core`'s public API is unchanged.

---

## [0.3.3] — 2026-05-08

### Documentation fix

- Root `README.md` "Want the advanced algorithms?" example fixed: the previous snippet called `computeKGPredictionError({ predicted, observed })` and `computeAdaptiveFSRSInterval({ baseInterval, predictionError })`, both of which are wrong — the actual signatures take embedding arrays and positional arguments. Anyone copy-pasting the old snippet hit a `TypeError: Cannot read properties of undefined`. The example now uses the real API.

No code changes; doc fix only.

## [0.3.2] — 2026-05-08

### Documentation cleanup

Cosmetic patch — no code changes. Reworded some user-facing text (description, README, source-file headers) for a cleaner, self-contained open-source presentation. Algorithms themselves and their references to the underlying neuroscience literature are unchanged.

- `package.json` `description` reworded.
- `packages/algorithms/README.md` "What's Inside" advanced-algorithm table reworded; the second column now lists each algorithm's inspiring research direction.
- Root `README.md` and `docs/FAQ.md` stats baseline retained from 0.3.1.
- Source-file JSDoc headers reworded.

(0.3.1 was tagged on GitHub but never published to npm; 0.3.2 supersedes it.)

## [0.3.0] — 2026-05-08

### Advanced algorithms

Adds 10 advanced algorithms grounded in recent neuroscience and ML research to the open-source `@zensation/algorithms` package.

**`@zensation/algorithms@0.3.0`** — 10 new algorithms (zero dependencies, pure TypeScript):

| Algorithm | Sub-path |
|---|---|
| Prediction-Error Coupled FSRS | `./fsrs-vmPFC` |
| Two-Factor Synaptic Hebbian | `./hebbian-two-factor` |
| Simulation-Selection Sleep Loop | `./sleep-simulation-selection` |
| Spectral KG Health Monitor | `./spectral-health` |
| Information-Bottleneck Budget | `./ib-budget` |
| Dopamine-Modulated Routing | `./dopamine-routing` |
| Hopfield Short-Term Memory | `./hopfield-stm` |
| Personalized PageRank | `./personalized-pagerank` |
| Surprise-Gradient (Variational FE) Memory | `./surprise-gradient-memory` |
| Temporal Multi-Route Retrieval | `./temporal-multi-route` |

### Tests
- **+250 new tests** (429 total, 179 existing + 250 new). All passing on vitest.

### Build
- `tsup` ESM + CJS + DTS dual format extended to all 20 algorithm modules.
- Package size: 379 KB packed, 1.7 MB unpacked, 152 files.

### Breaking changes
- None. Additive release; existing 0.2.x APIs unchanged.

### Notes
- The `AblationRegistry` interface in `./sleep-simulation-selection` is an *optional* injection point for ablation studies — pass `undefined` for default PMA-aware behavior.
- All algorithms remain zero runtime dependencies.

---

## [0.2.1] — 2026-03-30

### Fixed
- **Dual ESM/CJS build:** `import` and `require()` both work correctly. v0.2.0 had missing `.js` extensions in ESM that caused runtime failures.
- Migrated from raw `tsc` to **tsup** for reliable dual-format output.
- All `exports` maps now include `require` condition for CJS consumers.

### Changed
- 276 tests, all passing (179 algorithms + 97 core).

---

## [0.2.0] — 2026-03-25

### Added
- **MemoryCoordinator** — Orchestrates all 7 memory layers (Working, Episodic, Semantic, Procedural, Core, Cross-Context, Sleep). Auto-routing `store()`, cross-layer `recall()`, `consolidate()`, `decay()`, FSRS review queue.
- **Sleep Consolidation** (`@zensation/algorithms`) — Memory replay simulation: `selectForReplay()`, `simulateReplay()`, `pruneWeakConnections()`. Based on Stickgold & Walker (2013).
- **Confidence Intervals** — 95% CI for FSRS retrievability and Bayesian propagation.
- **Retention Visualization** — Export Ebbinghaus curves and FSRS schedule timelines.

---

## [0.1.0] — 2026-03-24

### Added
- Initial public release.
- 10 neuroscience-inspired memory algorithms (FSRS, Ebbinghaus, Hebbian, Bayesian, Emotional, Context-Retrieval, Similarity, Intervals, Visualization, Sleep-Consolidation, plus shared types).
- 7-layer memory system (Working, Short-Term, Episodic, Semantic, Procedural, Core, Cross-Context).
- Pluggable storage / embeddings / LLM providers.
- Apache-2.0 license.

[0.3.3]: https://github.com/zensation-ai/zenbrain/releases/tag/v0.3.3
[0.3.2]: https://github.com/zensation-ai/zenbrain/releases/tag/v0.3.2
[0.3.0]: https://github.com/zensation-ai/zenbrain/releases/tag/v0.3.0
[0.2.2]: https://github.com/zensation-ai/zenbrain/releases/tag/v0.2.2
[0.2.1]: https://github.com/zensation-ai/zenbrain/releases/tag/v0.2.1
[0.2.0]: https://github.com/zensation-ai/zenbrain/releases/tag/v0.2.0
[0.1.0]: https://github.com/zensation-ai/zenbrain/releases/tag/v0.1.0
