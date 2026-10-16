# Agent Context

This file gives coding agents (Claude Code, Cursor, Copilot, Aider, etc.) the
context needed to make correct, style-consistent changes to this repository.
Humans: see [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

## Mission

ZenBrain is a neuroscience-inspired, zero-dependency memory system for AI
agents: spaced repetition (FSRS), Hebbian learning, Ebbinghaus forgetting
curves, emotional tagging, sleep consolidation, and Bayesian confidence
propagation, organized into a 7-layer memory architecture. The open-source
package ships 20 algorithm modules (10 core + 10 advanced) plus a
`MemoryCoordinator` that creates all seven layers and works on five of them. Correctness and
scientific defensibility come before cleverness or performance.

## Project map

```
packages/
  algorithms/        @zensation/algorithms — pure algorithm functions, ZERO runtime
                      dependencies. Every module is also a tree-shakeable subpath
                      export (e.g. @zensation/algorithms/fsrs). This package must
                      stay dependency-free — do not add a runtime dependency here.
  core/               @zensation/core — MemoryCoordinator, the 7 memory layers,
                      pluggable storage/embedding/LLM-provider interfaces. Depends
                      on @zensation/algorithms.
  adapters/postgres/  @zensation/adapter-postgres — PostgreSQL + pgvector storage.
  adapters/sqlite/    @zensation/adapter-sqlite — zero-config SQLite storage.
  mcp/                @zensation/mcp — MCP server (five tools) over core + adapter-sqlite.
  ai-sdk/             @zensation/ai-sdk — Vercel AI SDK middleware over core, no runtime deps.
backend/              Ablation runner for the paper's mechanism tables; CI checks its
                      point estimates against backend/results.
apps/playground/      Interactive browser demo (also deployed as the HF Space and
                      zensation.ai/playground).
examples/              Runnable integration examples (plain chatbot, Claude, CrewAI,
                      LangChain, LlamaIndex, Mastra, Vercel AI SDK).
docs/                  architecture.md, api-reference.md, benchmarks.md, FAQ.md,
                      ROADMAP.md, getting-started.md, recipes.md.
scripts/               CI checks (zero dependencies, package contents, MCP smoke test) and
                      compare-mechanisms.sh, the mechanism comparison you run by hand.
```

Turborepo + npm workspaces. `packages/algorithms` has no dependencies on
anything else in the repo; `packages/core` depends on it; adapters depend on
`core`'s interfaces.

## Non-negotiables

- **`packages/algorithms` stays zero-dependency.** No runtime `dependencies` in
  its `package.json`, ever. This is a stated, badge-advertised guarantee.
- **Pure functions preferred**, especially in `algorithms` — no hidden side
  effects, no module-level mutable state. Accept an optional `Logger` param for
  debuggability instead of calling `console.*` directly (see `hebbian.ts`).
- **TypeScript strict mode.** Explicit types on public APIs; avoid `any`.
- **JSDoc on every public export** — `@param` and `@returns` at minimum. Follow
  the existing style in `hebbian.ts` or `semantic.ts` as the reference.
- **Tests are required for all new code**, not optional. See Testing below.
- **Semver discipline.** Follow `docs/ROADMAP.md`'s philosophy order:
  correctness → simplicity → performance → compatibility. Don't break existing
  public APIs without a version bump that signals it — a minor bump below 1.0, a major one
  from 1.0 on (`docs/ROADMAP.md`, Compatibility history) — and a migration note.
- **Every algorithm module is a subpath export.** New algorithm modules need a
  matching `exports` entry in the package's `package.json` (see
  `packages/algorithms/package.json` for the pattern).

## Testing

- Framework: **Vitest**. Test files live in `__tests__/` next to the source
  they test, not in a separate top-level test tree.
- Naming: descriptive, behavior-first — `it('returns 0 when stability is zero')`.
- Floating-point comparisons: use `toBeCloseTo()`, never `toBe()`.
- Cover edge cases and boundary conditions, not just the happy path.

```bash
npm install               # from repo root
npx turbo build            # build all packages, respects dependency order
npx turbo test              # run all tests
cd packages/algorithms && npm test        # test one package
cd packages/algorithms && npm run test:watch   # watch mode during development
npx turbo lint               # tsc --noEmit across packages
```

## Before opening a PR

1. `npx turbo build && npx turbo test` — must pass clean.
2. If the change is user-facing, add an entry to `CHANGELOG.md`.
3. If a public API changed, update the relevant `docs/api-reference.md` section
   and any affected `examples/`.
4. Breaking changes need a migration note and a breaking version bump (minor below 1.0, major after) — see
   `docs/ROADMAP.md` for the compatibility philosophy.
5. Branch naming: `feat/…`, `fix/…`, `docs/…` (see CONTRIBUTING.md).

## Anti-patterns

- Don't add a runtime dependency to `packages/algorithms`.
- Don't reach for a class/hidden-state pattern where a pure function works —
  look at how existing algorithms (`fsrs.ts`, `bayesian.ts`) are structured
  before introducing a new pattern.
- Don't skip the subpath `exports` entry for a new algorithm module — without
  it, tree-shaking breaks for consumers.
- Don't invent new test locations — tests belong in `__tests__/` beside the
  code, per existing convention.
