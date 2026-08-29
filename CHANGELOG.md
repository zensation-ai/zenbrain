# Changelog

All notable changes to ZenBrain are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
