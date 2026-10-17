# ZenBrain Roadmap

## Vision

ZenBrain aims to be a dependable, scientifically grounded memory layer for AI
agents — small enough to drop into any project, complete enough to run a full
seven-layer memory system. Development is self-funded and proceeds without
external deadlines; the items below are directions, not dated commitments.

## Released

The [CHANGELOG](../CHANGELOG.md) has every release in detail; this is the outline.

### v0.6 — Forgetting that follows consolidation, one score model (October 2026)

- `forget()` deletes what `consolidate()` linked to a memory, in both directions (episode ⇄ fact), and its
  working-memory copies; `{ cascade: false }` keeps the old single delete, `forgetWithDerived()` lists what went.
  `RecallResult.duplicates` names the copies deduplication hid. **Breaking** (see the table below).
- One score model across layers: every `score` runs from 0 to 1 and says how well the result matches the query;
  `recall(query, { minScore })`.
- `@zensation/ai-sdk` injects only memories scoring above 0, and a stream aborted through `abortSignal` keeps the
  user's turn but not the partial reply.
- An emotional weight given for a fact stretches its starting FSRS stability; `hopfieldRecall` defaults to
  β = 16, after a measurement.

### v0.5 — Forgetting by id, the package audit (October 2026)

- `0.5.0`: `forget(id, layer)` in core and the MCP server (`zenbrain_forget`); every recall result carries an
  `id`; `core: 'matching'`; the ai-sdk's `store.shouldStore` and `role: 'user'`; procedures work on PostgreSQL,
  and CI runs against a real PostgreSQL with pgvector.
- `0.5.2`: a review of 414 claims the packages and their docs make, 67 of which did not hold — the bugs fixed,
  each with a test that fails on 0.5.1, and the texts made to say what the code does. CI now compiles the
  documentation's code blocks, type-checks the examples and compares every stated test count with the suites.

### v0.4 — Node 22, an MCP server and AI SDK middleware (August–October 2026)

- `0.4.0`: Node.js 22 or newer (`better-sqlite3` 13).
- `0.4.1`: `@zensation/mcp`, an MCP server over a local SQLite file; `@zensation/ai-sdk`, Vercel AI SDK
  middleware, published the same day.
- `0.4.8`: recall without an embedding provider ranks by the query (lexically) instead of returning the same
  rows; consolidation promotes each episode once; core memory writes work on SQLite.
- `0.4.9`: FSRS functions reject invalid input; `InMemoryStorage` is no longer exported.

### v0.3 — Advanced algorithms (May 2026)

- `@zensation/algorithms@0.3.x` — 10 advanced algorithms added on top of the 10
  core ones (**20 total**), each a zero-dependency subpath export: prediction-error
  coupled FSRS (`fsrs-vmPFC`), two-factor synaptic Hebbian, simulation-selection
  sleep, spectral (Fiedler-value) KG health, Information-Bottleneck budget,
  dopamine-modulated routing, Hopfield STM, Personalized PageRank,
  surprise-gradient memory, temporal multi-route retrieval.
- **429 tests** in the algorithms package (dual ESM + CJS + type declarations).

### v0.2 — Coordinator, consolidation, packaging (March–May 2026)

- `@zensation/core@0.2.x` — `MemoryCoordinator` orchestrating all seven layers
  (auto-routing `store()`, cross-layer `recall()`, `consolidate()`, `decay()`,
  FSRS review queue).
- Sleep Consolidation, heuristic uncertainty bands (Wald-type, not calibrated
  confidence intervals), and retention-curve
  visualization added to `@zensation/algorithms`.
- Reliable dual ESM/CJS builds (migrated to `tsup`); packaging fixes.

### v0.1 — Foundation (March 2026)

- Initial public release: the 7-layer memory architecture and 7
  neuroscience-inspired algorithm modules (FSRS, Ebbinghaus, Hebbian, Bayesian,
  emotional, context-retrieval, similarity) plus shared types; v0.2 added
  intervals, visualization and sleep consolidation, completing the 10 core modules.
- Pluggable storage / embedding / LLM provider interfaces; Apache-2.0.

---

## Planned / Exploratory

These are candidate directions under consideration. They are not scheduled and
may change or be dropped based on evidence and contributor interest.

**Adapters & integration**
- Additional storage adapters (e.g. Redis caching layer).
- Built-in embedding/LLM provider adapters (currently bring-your-own interface).
- `npx zenbrain init` project scaffolding.

**Algorithms & scale**
- Graph-aware retrieval that combines Hebbian edges with semantic search.
- Batch FSRS scheduling for large fact sets.
- Episodic memory compression (summarize older episodes).
- Event-driven consolidation (trigger sleep cycles on inactivity).
- A power forgetting curve as an option (`curve: 'power'`, the form FSRS has used since v4) next to today's
  exponential curve. Only after a measurement shows it holds better here: it would move every existing review date.

**Memory layers**
- Cross-context layer: a context column for entities (a schema migration in both adapters), a write path, and
  a coordinator that uses the layer. Until then it is experimental and not wired in.
- Resumable short-term sessions: `startSession(id)` continuing a stored conversation (needs its own table).
  Today a session lives in the process.

**Reproducibility & evaluation**
- A reproducible, comparative benchmark suite against other open-source memory
  systems, with published methodology and raw results.
- Automated performance tracking in CI.

**Production**
- Memory encryption at rest and multi-tenant namespace isolation.
- Federated memory (sync across agents/devices).

---

## How to Influence the Roadmap

- **Open an issue** describing a use case or proposing a feature.
- **Upvote** existing issues to signal priority.
- **Contribute** — PRs that align with the directions above are prioritized for
  review. See [CONTRIBUTING.md](../CONTRIBUTING.md).

## Philosophy

We prioritize, in this order:

1. **Correctness** — algorithms must be scientifically defensible and tested.
2. **Simplicity** — APIs should be intuitive, not clever.
3. **Performance** — optimize for real workloads, not microbenchmarks.
4. **Compatibility** — avoid breaking existing users; follow semver.

## Compatibility history

Breaking changes are expressed through the **minor** version while the packages are below `1.0.0`, which is
what semver prescribes for the `0.y.z` range. A `^0.3.4` range therefore does *not* pick up `0.4.0`: existing
installations never move across a break on their own, and opting in is an explicit act.

| Release | Break | Why |
|---|---|---|
| `0.6.0` | **`forget()` cascades by default**: forgetting an episode also deletes the fact consolidated from it, forgetting such a fact its episodes, and both their working-memory copies. Procedure and working-memory **scores** mean something else (match only, 0 to 1). The ai-sdk injects only memories scoring above 0 and needs core `^0.6.0`. | "Forget this" left the content stored in the derived memory (measured on 0.5.1). Migration: pass `{ cascade: false }` where a consolidated fact must outlive its episode; re-check thresholds you set on `score`; `recall: { minScore: 0 }` in the ai-sdk restores injecting fallbacks. |
| `0.5.0` (2026-10-10) | **`RecallOptions.includeContext` and `taskType` removed** (and the ai-sdk's `recall.taskType`); `RecallResult` gains a required `id` | The options never changed a result: no store path wrote an encoding context. The `id` is what `forget()` takes. Migration: remove the two options from your calls; only code that constructs a `RecallResult` itself has to add `id`. |
| `0.4.0` (2026-08-05) | **Node.js 18/20 dropped, 22+ required** | The declared `>=18` was never accurate — `@zensation/adapter-sqlite` depended on `better-sqlite3@^12`, which itself requires Node 20 or newer, so a Node 18 install failed on a transitive dependency while our metadata claimed support. Adopting `better-sqlite3@13` (N-API, ABI-independent prebuilds) sets the real floor at 22. Both dropped lines are end of life. |

Migration for `0.4.0`: move to Node 22 LTS or newer, then raise the ranges — `@zensation/algorithms` to
`^0.4.0`, `@zensation/core` to `^0.3.0`, either adapter to `^0.2.0`. No imports, APIs or configuration
change. Staying on `0.3.x` / `0.1.x` remains valid on Node 20; those versions are unaffected and are not
being removed.
