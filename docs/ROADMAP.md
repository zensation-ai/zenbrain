# ZenBrain Roadmap

## Vision

ZenBrain aims to be a dependable, scientifically grounded memory layer for AI
agents — small enough to drop into any project, complete enough to run a full
seven-layer memory system. Development is self-funded and proceeds without
external deadlines; the items below are directions, not dated commitments.

## Released

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
- Sleep Consolidation, 95% confidence intervals, and retention-curve
  visualization added to `@zensation/algorithms`.
- Reliable dual ESM/CJS builds (migrated to `tsup`); packaging fixes.

### v0.1 — Foundation (March 2026)

- Initial public release: the 7-layer memory architecture and 10 core
  neuroscience-inspired algorithms (FSRS, Ebbinghaus, Hebbian, Bayesian,
  emotional, context-retrieval, similarity, intervals, visualization,
  sleep-consolidation, shared types).
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
| `0.4.0` (2026-08-05) | **Node.js 18/20 dropped, 22+ required** | The declared `>=18` was never accurate — `@zensation/adapter-sqlite` depended on `better-sqlite3@^12`, which itself requires Node 20 or newer, so a Node 18 install failed on a transitive dependency while our metadata claimed support. Adopting `better-sqlite3@13` (N-API, ABI-independent prebuilds) sets the real floor at 22. Both dropped lines are end of life. |

Migration for `0.4.0`: move to Node 22 LTS or newer, then raise the ranges — `@zensation/algorithms` to
`^0.4.0`, `@zensation/core` to `^0.3.0`, either adapter to `^0.2.0`. No imports, APIs or configuration
change. Staying on `0.3.x` / `0.1.x` remains valid on Node 20; those versions are unaffected and are not
being removed.
