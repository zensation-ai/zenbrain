# Changelog

All notable changes to ZenBrain are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
