# Changelog

All notable changes to ZenBrain are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed — one score model across layers

Measured on 0.5.1 (SQLite, and over MCP): "Which city is the capital?" returned `procedural 1.000 "How to bake
bread"` first, then a core block at 0.500, and the actual hit `semantic 0.309` last; working memory without an
embedding provider ignored the query ("trains" returned "boats" at 1); the vector path returned −1 to 1 while the
docs said 0 to 1. Every result's `score` now runs from 0 to 1 and says how well it matches the query:

- **Procedures** score their match, not match × success rate; a procedure that matches nothing scores 0 instead
  of its success rate. The success rate stays `confidence`, and among equally relevant procedures the more
  reliable one still comes first.
- **Working memory** (on request) is ranked like the other layers: cosine similarity with an embedding provider,
  lexical relevance without one, its most relevant slots at 0 when nothing matches. The slot's own relevance
  moved to `metadata.relevance`. `WorkingMemory.search()` is new; `findRelevant()` is unchanged.
- **Vector similarity** is clamped to [0, 1] in the episodic, semantic, procedural and working layers: a negative
  similarity matches no better than an unrelated memory.
- **Core blocks** are unchanged (0.8 with a shared word, else 0.5) and documented: with `core: 'always'` a block
  can still rank above a weak hit.
- **`recall(query, { minScore })`** (also on `zenbrain_recall`), default 0: fallbacks at 0 are not dropped by
  default, they come after every hit; any `minScore` above 0 leaves them out. A value outside 0–1 throws a
  `RangeError`.

The API reference has one section for it, *How scores are computed, per layer*. Re-check thresholds you set on
`score`: procedure and working-memory scores mean something else now.

### Breaking — `forget()` deletes what consolidation derived from a memory

Measured on 0.5.1 with a real SQLite file: an episode with emotional weight 0.9, `consolidate()` (one fact, a
verbatim copy), a recall showing one hit because deduplication hid the semantic twin, `forget(id, 'episodic')` =
`true` — and the same recall then returned the text from semantic memory. "Forget this" left the content stored,
and an MCP agent could not see the twin before it forgot.

`forget(id, layer, options?)` now follows the edge `consolidate()` records, in both directions: forgetting an
episode deletes the fact consolidated from it (and any other episode promoted into that same fact), forgetting a
fact deletes the episodes it was made from, and every layer's forget deletes the working-memory copies of that
content. Forgetting a working-memory result deletes only that copy. `{ cascade: false }` restores the old
behaviour of deleting only the addressed memory; an episode then keeps its `consolidatedInto` mark, so the next
`consolidate()` does not promote it again. The return value is unchanged (`boolean`); the new
`forgetWithDerived()` also returns `alsoForgotten: { id, layer }[]`, and the MCP tool `zenbrain_forget` reports
that list. A fact an LLM distilled into other words is linked the same way: the cascade follows the recorded edge,
it does not search for memories with a similar meaning. A memory stored on its own with the same wording is not
derived and stays — `RecallResult.duplicates` (new, also in `zenbrain_recall`) names the copies deduplication hid.

The edge is the episode's `consolidatedInto` mark, written since 0.4.8, so the cascade works on existing
databases without a schema change: checked with a file written by the published 0.5.2, where forgetting the fact
now also deleted its episode (zero rows left in both tables; 0.5.2 itself left the fact). The tests read the
tables directly, on SQLite and on PostgreSQL. **Migration:** pass `{ cascade: false }` where you relied on a
consolidated fact outliving its episode.

## [0.5.2] — 2026-10-16

**Fixes and corrected texts, all six packages.** A review of 414 claims the packages and their docs make, 67 of
which did not hold, found bugs in working memory, recall, eight algorithms, the PostgreSQL
retry and the cross-context layer, and texts that promised more than the code does. This release fixes the bugs,
each with a test that fails on 0.5.1, and makes the texts say what the code does. No API is removed; values
outside a documented range now throw a `RangeError` (see *Changed* below). Three CI checks now keep the docs'
code blocks, examples and test counts true.

| Package | From | To | Why |
|---|---|---|---|
| `@zensation/algorithms` | 0.5.1 | 0.5.2 | eight algorithm fixes, input checks, two linear-time regexes, module texts |
| `@zensation/core` | 0.5.1 | 0.5.2 | working memory, recall dedup, `getHealth`, `recordReview`, table names, ids, input checks, cross-context, texts |
| `@zensation/adapter-postgres` | 0.2.7 | 0.2.8 | retries a refused connection and pg-pool's timeouts; schema isolation documented |
| `@zensation/adapter-sqlite` | 0.2.6 | 0.2.7 | README (it ships in the tarball) |
| `@zensation/mcp` | 0.2.1 | 0.2.2 | tool texts, start error, `server.json` |
| `@zensation/ai-sdk` | 0.3.0 | 0.3.1 | README and JSDoc |

The ranges between the packages are unchanged.

### Fixed — working memory dropped the newest slot and decayed twice

Every `store()` adds its content to working memory at relevance 1.0, and nothing decays between stores, so a full
working memory is all ties. `WorkingMemory.add()` sorted by relevance and evicted the last slot; the sort is stable,
so the last slot was the new one. Once seven memories had been stored in a process, working memory kept those seven
and dropped every later one at once. It now evicts the least relevant slot and, among equals, the oldest. Without an
embedding provider, `findRelevant()` returns the most relevant slots, newest first among equals; it used to return
them in array order.

`decay()` multiplied each slot by e^(−rate × age) on every call, counting the age from when the slot was added, so a
slot ten minutes old fell to 0.61, 0.37 or 0.22 after one, two or three calls. Each call now counts only the minutes
since the slot was last decayed: how often `consolidate()` runs no longer changes how long a slot lives.

### Fixed — recall merged memories that differ only in a short word or number

Recall drops a result whose words overlap another result's by more than 90 %. The overlap ignored every word of two
characters or fewer, so "Locker code is 47" and "Locker code is 81", or "Server A is up" and "Server B is up",
counted as the same memory and recall returned only one of them. Every word and number now counts; case and
punctuation are ignored, so "Paris." and "paris" still match.

### Fixed — `getHealth()` stopped counting at 1000

`procedural.count` and `semantic.dueForReview` listed rows with `LIMIT 1000` and took the length, so 1001 procedures or
due facts reported 1000. Both are `COUNT(*)` queries now (`ProceduralMemory.count()`,
`SemanticMemory.countDueForReview()`), as `episodic.count` and `semantic.count` already were.

### Fixed — `recordReview()` accepted grades outside 1–5 and ignored unknown ids

The FSRS functions reject a grade outside 1–5, but `recordReview()` checked nothing itself: 0 and 2.5 went through as
"forgotten", and 6 threw only when the fact existed. The grade is now checked first, with the same rule and a
`RangeError`. An unknown id resolved silently, so a typo in a review loop went unseen; `recordReview()` now returns
`true` when it updated a fact and `false` when there is none (`SemanticMemory.recordRecall()` likewise). The docs say
what the grades mean: 1 and 2 count as forgotten, 3 to 5 as recalled.

### Fixed — the README quick start did not compile

`memory.forget(results[0].id, results[0].layer)` failed type-checking (TS2345) because `RecallResult.layer` was a
`string` while `forget()` takes a `RecallLayer`. `RecallResult.layer` is now a `RecallLayer`. Code that builds a
`RecallResult` with a layer name outside `'working' | 'episodic' | 'semantic' | 'procedural' | 'core'` no longer
type-checks. A test compiles the README line.

### Fixed — adapter-postgres did not retry a refused connection

`query()` promised automatic retries for transient connection errors, but it opened the connection before its
`try`, so `ECONNREFUSED` or `ECONNRESET` while connecting failed at once; only errors of an already open client were
retried. Connecting is now part of each attempt. A client that hit a transient error is released with that error, so
`pg` discards it instead of handing a possibly dead connection to the next query.

### Fixed — eight algorithms did not do what their documentation says

Each fix comes with a test that fails on 0.5.1.

- `tagEmotion`: "!", "?" and words in capitals entered the average of the arousal words. An exclamation mark
  pulled a strong arousal word down ("This is urgent!" scored 0.70, "This is urgent" 1.00), and "?" or capitals
  changed nothing without an arousal word ("THE SERVER IS DOWN" 0.20, like the lower-case sentence). They now add
  on top of the word average, as documented; arousal goes up for such texts, never down.
- `initFromSM2(0)` returns the documented default (difficulty 5, stability 1) instead of (7.5, 0.5).
- `ibShouldRetain` / `ibFilterEpisodes`: the module header listed the contexts work, learning, personal and
  creative, which have no beta, so every episode was dropped without an error. The header now lists the real
  ones (finance 0.8, people 0.6, operations 0.4, strategy 0.3); the context type is exported as `IBContext`.
- `applyVFERetrievalBoost` clamps the delta to [−1, 1], so the boost stays within ±alpha (±10 % by default) as
  the module promises; a delta of 5 used to move a score by 50 %. `signHint` defaults to +1, as the code always
  did; its documentation said 0 and gave +1 the opposite meaning.
- `hopfieldRecall` checks convergence after a single step too; with the default `maxIterations: 1` it reported
  `converged: true` without looking.
- `detectNegation` and `stripNegation` recognise every n't contraction (can't, won't, didn't, …) with a straight
  or a typographic apostrophe, and "cannot". The alternative meant for the typographic apostrophe held a second
  straight one, so "doesn’t" as phones type it was not a negation.
- `ebbinghaus`: `calculateRetention` computed with one stability and reported another, and
  `batchCalculateRetention` used a third formula. All now use S × emotional multiplier (clamped to the documented
  1.0–3.0), floored at 0.1. The module had no test; it has nineteen now.
- `simulateReplay` no longer lowers a stability that is already above the 365-day cap.

### Changed — out-of-range inputs throw a `RangeError` instead of being stored

Values outside a documented range used to be stored or computed on silently: `computeHebbianStrengthening(-5)`
returned −4.85, a working-memory relevance of 42 outranked every slot for good, and an `emotionalWeight` of 2
went into routing. These now throw a `RangeError` naming the argument, before anything is stored:
Hebbian strengthening and decay (NaN, infinite or negative weights; weights above `MAX_WEIGHT` are still capped),
`WorkingMemory.add` (relevance outside 0–1), `store()` (`emotionalWeight` or `confidence` outside 0–1),
`initFromSM2` (negative or non-finite stability) and the `ib-budget` functions (unknown context). Code that
passed such values gets an exception where it used to get a corrupted value. `SECURITY.md` lists what is checked.

### Fixed — adapter-postgres retries pg-pool's connection timeouts

`query()` promises to retry "a timed-out connection", but pg-pool raises its two connection timeouts ("timeout
exceeded when trying to connect", "Connection terminated due to connection timeout") without an error code, so
they were thrown at once. Both are retried now. The README's quick start no longer sets `schema: 'personal'`
without the steps that create that schema; without them the adapter quietly used `public`.

### Fixed — cross-context memory paired every entity with itself

`knowledge_entities` has no context column in either adapter, so every context reads the same rows, and
`detectMergeCandidates()` reported each entity as a merge candidate of itself (similarity 1) and every real pair
once per ordering of the contexts. It now skips an entity's own id and reports each pair once. The layer is
experimental and not wired into the coordinator; the docs say so instead of "merges and deduplicates", and the
ROADMAP lists the schema migration it needs.

### Documentation — the FAQ compares with Mem0, Letta and Zep only where the README measured

The FAQ's comparison table claimed layer counts (7 / 2 / 3 / 2) and a flat "No" for every other system, with no
source and no date; the README's comparison is measured at pinned commits and says what a missing term means. The
FAQ now summarises ZenBrain and links to that comparison.

### Documentation — numbers the repository can measure come from a script

`scripts/measure-docs-numbers.mjs` prints the quick-start values, the Hebbian convergence table, the emotional
decay multipliers, Hopfield recall quality and time, and bundle sizes. The hand-written tables were off: 100
co-activations give a weight of 6.71, not 4.0; the full algorithms bundle is 38.8 KB minified, not ~18 KB; a
Hopfield recall over 600 patterns of 1536 dimensions takes about 2.8 ms (Node 22, Apple M1 Pro), not "sub-ms",
and at the default beta of 1 its recovered state is close to the average of the patterns (the ranking is right at
every beta). The emotional table's 30-day retention column had no source and is gone; the PostgreSQL latency
table had no measurement in this repository and is gone too. `scripts/compare-mechanisms.sh` now clones the
commits the README's comparison was measured at (27 August 2026) and counts the dependency row as well;
`--latest` runs it against today's default branches.

### Security — table names are checked before they reach SQL

Values always went through placeholders, but table names were put into SQL as given: the `tableName` option of the
episodic, semantic, procedural and core layers, and the `entityTable` and `linkTable` parameters of
`CrossContextMemory.detectMergeCandidates()` and `createLink()`. A name like `x; DROP TABLE learned_facts; --` reached
the query. Each is now checked against a plain identifier (letters, digits, underscores, optionally `schema.table`, at
most 63 characters a part) and anything else throws a `TypeError`. `SECURITY.md` said "never string concatenation"; it
now says what holds.

### Security — two regular expressions took quadratic time (CodeQL alerts #3, #4)

`detectNegation()` trimmed trailing punctuation off the negation target with `/[.,!?;:]+$/`, and
`decomposeTemporalQuery()` trimmed separators with `/^[\s,?.]+|[\s,?.]+$/g`. Both backtrack over every run of those
characters that is not at the end, so `'not ' + '.'.repeat(100000) + 'x'` and `'when did a' + ','.repeat(100000) + 'b'`
took about 16 seconds each. Both trims are loops now and finish in milliseconds; results for ordinary input are
unchanged.

### Security — ids never come from `Math.random`

Working-memory slots and sessions fell back to `Math.random()` for their ids when `crypto.randomUUID` was missing
(CodeQL alert #5). On Node 22 and newer, the engines floor, it never is; the fallback is gone.

### Documentation — examples that did not run as written

- `docs/getting-started.md`: the PostgreSQL quick start called `adapter.initialize()`, `storeFact()` and `searchFacts()`,
  none of which exist; it now applies the shipped migration and stores and recalls through `MemoryCoordinator`.
  `getRetrievability` was imported from `@zensation/algorithms/ebbinghaus`, which does not export it.
- `README.md`: the chatbot use case used `initFromDecayClass` without importing it and a type `MemoryState` that does not
  exist; the RAG use case used undeclared types and a relation type `'related_to'` that `propagateForRelation()` does not
  know.
- `examples/with-crewai.ts` passed hours into the logger parameter of `computeHebbianDecay()` and two extra numbers to
  `computeHebbianStrengthening()`, and described a homeostatic normalization it never applied. It now calls both with one
  weight, runs 24 maintenance passes of 2 % each, removes edges at the pruning signal 0 and normalizes the weights.

### Documentation — what core and the algorithms actually do

- `docs/architecture.md`: short-term memory keeps 50 interactions by default (not 20), in the process only, and does not
  resume sessions; episodes and facts are kept until forgotten (not "days to weeks"); consolidation turns emotional
  episodes into one fact each rather than "extracting patterns"; the coordinator keeps no knowledge graph and runs no
  Bayesian propagation; procedures are recorded through `store()` and scored through `feedback()`, not "adapted"; the
  emotion lexicon has about 170 weighted keywords, not "400+"; the context boost is capped at 1.3 by a design constant,
  not a measured "up to 30%".
- `docs/recipes.md`: a serverless handler that never consolidates loses nothing it stored; decay touches only working
  memory, which the default recall does not search; `initFromDecayClass('good', …)` threw.
- JSDoc and `docs/api-reference.md`: routing order, which options a layer keeps (`context` only on episodes), `steps`
  optional, `decayed` counts removed slots, `getHealth()` covers six layers, the `cache` option and `LayerConfig` are
  unused, the lexical path is for every setup without an embedding provider (not only SQLite).

### Documentation — the MCP server's tool texts and README

- `zenbrain_store`: the routing rules in the order they apply (first match wins), and which options a memory keeps
  (`context` only on episodes, `confidence` only on facts); working memory keeps the most recent seven.
- `zenbrain_consolidate`: only the 100 most recent episodes are looked at; `decayed` counts removed slots.
- `ZENBRAIN_CONTEXTS` (README and `server.json`): no tool uses the cross-context layer, so the value has no effect yet.
- README: the five tools reach five of the seven layers; long-term memory does not decay; no tool records an FSRS
  review; SQLite keeps `-wal` and `-shm` files next to the store.
- Every package README said ZenBrain is "built as zero-dependency TypeScript"; only `@zensation/algorithms` and
  `@zensation/core` are.
- The start error for a store that cannot be opened told an absolute `ZENBRAIN_DB` to "set an absolute path"; it now
  says to check the directory, and calls `~/…` what it is (a path the server expands, not an absolute one).
- `zenbrain_recall` says how the layers score (a procedure or core block that does not match can rank above a real
  hit) and that working memory ignores the query; `zenbrain_forget` and the server instructions say that a fact
  consolidated from an episode, and the working-memory copy, stay when one memory is forgotten; `zenbrain_store`
  says that each store replaces the oldest working-memory copy once seven are held; `skipped` says what it counts;
  `server.json` lists the five layers the tools reach instead of "seven-layer".

### Documentation — the ai-sdk README says what the middleware does in this release

Without a lexical match, recall falls back to the most recent memories, and the middleware injects them like any
other result; the README now says so. An aborted or failed stream stores nothing, not even the user's turn (the
README said the user's turn was kept). `store.context` is kept with episodes only.

### Fixed — the ai-sdk README pointed at a CI check that did not check ai-sdk

`scripts/verify-zero-dependencies.sh` packed and checked `@zensation/algorithms` and `@zensation/core` only, while the
ai-sdk README said its "0 runtime dependencies" were checked there. The script now also packs `@zensation/ai-sdk` and
requires its packed `package.json` to declare no dependencies (its peers belong to the caller). The README no longer
says the package "installs nothing" — npm 7 and later installs a missing peer — and its routing description and a
broken section reference are corrected.

### Documentation — adapter-postgres schema isolation, checked on PostgreSQL 17

The README showed two adapters with `schema: 'personal'` and `schema: 'work'` but not how to create their tables.
Run as the obvious steps on a fresh database, the migration installs `vector` and `pg_trgm` into the first schema of
the search path, and the second schema then fails with `type "vector" does not exist` (measured with PostgreSQL 17.10
and pgvector 0.8.2). The README now creates both extensions in `public` first and migrates each schema; through the
adapter each schema then sees only its own facts. It also names pgvector 0.5 as the minimum (HNSW) and says that
`query()` retries and `transaction()` does not. The adapter-sqlite example no longer stores the "FSRS outperforms
SM-2 by 30%" sentence corrected above.

### Fixed — `fsrs-vmPFC` attributed its mechanism to a paper that does not contain it

The module header and the algorithms README named Zou et al. (2025, Cell Reports) as the basis of the
prediction-error coupling. That work contains no prediction-error signal; the project's correction notice withdrew
the attribution on 18 September 2026 (doi:10.5281/zenodo.22831087, section 8), and the header now says so. It also
claimed to be "the first" such extension with "no equivalent" anywhere — a claim nobody here measured — and to
extend `./fsrs`, which it does not import. The `backend/` copy carried the same text. `cross-context.ts` called its
layer "unique to ZenBrain"; that line is gone.

### Documentation — what each layer scores, and what `forget` leaves

`RecallResult.score`, `recall()` and the API reference say how each layer scores — cosine similarity (−1 to 1) with
an embedding provider, lexical relevance (0 to 1) without; when nothing matches, recent episodes and facts at 0 but
procedures at their success rate; core blocks at 0.8 or 0.5; working memory without regard to the query — and that
the merged list is sorted by these unlike scales. `forget()` is final for the one memory it deletes: a fact that
`consolidate()` made from an episode, and the working-memory copy, stay, so recall again and forget what still
returns the content. Core blocks with the default `core: 'always'` compete for `limit` (12 blocks and `limit: 10`
gave 9 blocks and 1 hit). The `cache` option and `ShortTermMemory`'s `storage` are deprecated (accepted, never
used; removed in 1.0); `startSession(id)` starts a fresh session. Recipe 5 no longer stores a fact with an
`emotionalWeight` the coordinator ignores for facts; it builds the FSRS state itself. The FSRS texts say that the
library keeps an exponential curve with S as its time constant, while FSRS has used a power curve since v4.

### Documentation — project-wide texts

- `docs/FAQ.md`: the license paragraph said attribution is "not required"; Apache 2.0 section 4 requires keeping the
  license and the copyright and attribution notices when redistributing. 0.4.0 was not the only breaking change
  (0.5.0 withdrew two recall options). Five algorithm modules do not cite a source yet. Semantic search depends on
  an embedding provider, not on pgvector: SQLite compares vectors by full scan, and without a provider the layers rank
  by wording, not by recency. Only working memory decays.
- `docs/ROADMAP.md`: v0.1 shipped 7 algorithm modules, not 10; the compatibility history now lists 0.5.0.
- `AGENTS.md`: a breaking change takes a minor bump below 1.0 (as the ROADMAP says), not a major one; the project maps
  in `AGENTS.md` and `CONTRIBUTING.md` include `mcp`, `ai-sdk`, `backend` and `scripts`.
- `docs/benchmarks.md`: the ablation tables run from `backend/` too; `generatePairs` is quadratic by nature; Bayesian
  propagation is one edge per call.
- `README.md`: emotional tagging runs only with automatic routing; consolidation looks at the 100 most recent episodes;
  the MCP server reaches five of the seven layers; zero runtime dependencies holds for algorithms and core.
- `examples/`: `with-mastra` needs `@zensation/adapter-sqlite`; `basic-chatbot` has its install line.

### Maintenance — changes since 0.5.1 this file had not recorded

The README says every change is recorded here; these five were not.

- `@zensation/mcp`: runtime dependency `@modelcontextprotocol/sdk` ^1.30.1 → ^1.32.1 (#133).
- `@zensation/adapter-postgres`: runtime dependency `pg` (and `@types/pg`) ^8.23.0 → ^8.23.1 (#120).
- Development dependencies: `turbo`, `ai`, `@ai-sdk/provider`, `@types/node` (#131).
- `CITATION.cff` describes v0.5.1, archived as a new version of the software record (#136).
- CI: the workflow token is read-only by default (#137).

### Added — CI checks that keep the documentation's code and numbers true

- `scripts/check-doc-snippets.mjs` compiles every TypeScript block in the README files and `docs/` against the
  built packages (`tsc --strict`, each block as its own module). A block that continues an earlier one says so on
  its fence (```` ```ts prelude=memory ````), which adds type declarations and nothing else. Run against the 0.5.1
  `getting-started.md`, it reports the four errors that page had.
- `npx tsc -p examples` type-checks all seven examples. The three third-party SDKs are stubbed in `examples/types/`,
  so the check covers every call into `@zensation/*`, not the third-party APIs.
- `scripts/verify-test-counts.mjs` compares every sentence that states a test count with what `vitest list`
  collects. It found the README header still at 822 and the other counts one short (`@zensation/mcp` had 59
  tests, not 58).

### Changed — the ablation reproduction calls its nine non-PMA components what the paper calls them

`backend/` carried an old working label for the nine components of the ablation that are not PMA components. They
are now `harness`, the paper's word for them ("harness mechanisms" — the mechanisms of the evaluation harness, not
the nine library algorithms), and the configuration without the PMA components is `No PMA (harness mechanisms only)`,
as in the paper's ablation table. The rename covers the three reference files in `backend/results/`, the ablation
suite that produces them, the integration-cascade suite and six module headers; all 722 point estimates are unchanged
(`scripts/verify-against-reference.mjs`: 722 identical, 0 drifted). The headers no longer call five of the modules
unpublished — all five ship in `@zensation/algorithms` — and the `fsrs-vmPFC` copy drops the Zou et al. attribution
and the claim to be the first such extension (correction notice doi:10.5281/zenodo.22831087, section 8).
Reproduction packages already archived on Zenodo keep their original labels (#140).

### Fixed — the FSRS comparison with SM-2 named the wrong quantity

Six places said FSRS "outperforms SM-2 by ~30%", the FAQ "in retention accuracy … across millions of Anki review logs".
The FSRS authors report something else: users need 20–30% fewer reviews than with SM-2 for the same retention, a
figure based on simulations ([ABC of FSRS](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS)).
`docs/benchmarks.md` also carried a day-by-day retention table and a curve with no source; both are removed. The
docs now say that `@zensation/algorithms` follows FSRS for difficulty and stability with an exponential forgetting
curve, and that we have not benchmarked it against SM-2. The `algorithms` README on npm changes with the next release.

## [0.5.1] — 2026-10-11

**Corrections only, three packages bumped so they reach npm.** No runtime code changed: `packages/*/src` is
byte-identical to `0.5.0`. Both adapters and `@zensation/ai-sdk` are unchanged.

| Package | From | To | Why |
|---|---|---|---|
| `@zensation/mcp` | 0.2.0 | 0.2.1 | the npm description names `forget` (#134); `server.json` |
| `@zensation/core` | 0.5.0 | 0.5.1 | the README package table lists all five MCP tools (#134) |
| `@zensation/algorithms` | 0.5.0 | 0.5.1 | same README correction (#134) |

### Fixed — the MCP server was described with four tools (#134)

0.2.0 of `@zensation/mcp` added `zenbrain_forget`, but four places still described the earlier surface: its own
npm description ("store, recall, consolidate, health"), the package tables of the `core` and `algorithms` READMEs
(same list) and the root README ("the seven layers as four tools"). npm keeps the description and README a version
was published with, so the corrected text reaches the package pages only with a new version. The `mcp` README
already said "Five tools".

### Documentation

- `SECURITY.md`: 0.5.x is the current line; 0.4.x and 0.3.x receive security fixes until 31 December 2026. The table
  still named 0.4.x as current after 0.5.0, and promised 0.3.x fixes without an end although Node.js 20, the reason
  for that line, reached end-of-life on 30 April 2026. Moving to 0.5.x needs no code change unless you pass `includeContext` or
  `taskType` (they never had an effect) or construct `RecallResult` yourself.
- README: the reproducibility line names `@zensation/algorithms@0.5.1`.

## [0.5.0] — 2026-10-10

**Four packages move, two only widen a range.** The round answers outside criticism of the library (Agent Memory Atlas, Glama's completeness review, tesseract, Core Memory Kit): what the system promised and did not do is either built or withdrawn, and the README now says which mechanisms the coordinator runs and which the algorithm library offers as functions.

| Package | From | To | Why |
|---|---|---|---|
| `@zensation/core` | 0.4.0 | **0.5.0** | `forget(id, layer)` and `RecallResult.id` (#124); `includeContext`/`taskType` withdrawn (#125); `RecallOptions.core` (#126); procedures work on PostgreSQL (#128) |
| `@zensation/mcp` | 0.1.9 | **0.2.0** | new tool `zenbrain_forget`, ids in `zenbrain_recall` (#124); depends on core `^0.5.0` |
| `@zensation/ai-sdk` | 0.2.0 | **0.3.0** | `store.shouldStore` (#124), `recall.taskType` withdrawn (#125), `recall.core` (#126), `role` (#127); peer core `^0.3.0 \|\| ^0.4.0 \|\| ^0.5.0` |
| `@zensation/adapter-postgres` | 0.2.6 | 0.2.7 | peer range adds core `^0.5.0`; source unchanged |
| `@zensation/adapter-sqlite` | 0.2.5 | 0.2.6 | peer range adds core `^0.5.0`; source unchanged |
| `@zensation/algorithms` | 0.5.0 | 0.5.0 | unchanged |

**Breaking (pre-1.0 minor):** `RecallOptions.includeContext` and `taskType`, and the ai-sdk's `recall.taskType`, are gone. They never changed a result; remove them from your calls. `RecallResult` gains a required `id`, which matters only if you construct results yourself.

### Fixed — procedures could not be stored or recalled on PostgreSQL (`@zensation/core`)

`steps` and `tools` are JSONB columns in `sql/001_init.sql`, which `pg` returns as parsed arrays; the procedural layer parsed them a second time, turned each array into its comma-joined text and threw. Every `store()` of a procedure and every procedural recall failed on PostgreSQL, in every published version; recall swallowed the error and simply returned no procedures. SQLite stores the columns as text and was not affected. The layer now accepts both forms, as the episodic layer already did for `metadata`. Found by the new real-PostgreSQL suite below; the adapter's unit tests mock `pg` and could not see it.

### Added — CI runs against a real PostgreSQL with pgvector

New job `postgres` (service `pgvector/pgvector:pg16`) runs `adapters/postgres/__tests__/real-postgres.test.ts` through the coordinator: every layer stores and recalls, 1536-dimension embeddings through pgvector, `forget` on the uuid columns (a malformed id is "not found", not a syntax error), consolidation marks an episode once in JSONB, `recordReview` writes the FSRS state, `getHealth` counts. Each run uses a schema of its own and drops it. `ZENBRAIN_REQUIRE_PG=1` makes the suite fail rather than skip in that job, and `publish` now waits for it.

### Added — forgetting by id (`@zensation/core`, `@zensation/mcp`, `@zensation/ai-sdk`)

Until now a memory that was stored could not be taken back through any public surface: the layers had `delete`, but `MemoryCoordinator` had no verb for it and a recall result carried no id to address it with. The Agent Memory Atlas and Glama's completeness review named the same gap (30.09.2026).

- `RecallResult.id`: every recall result carries the id of the memory in its layer.
- `MemoryCoordinator.forget(id, layer)`: deletes that one memory and returns whether it existed. An unknown or malformed id returns `false` instead of throwing. Nothing is forgotten automatically; to correct a memory, forget it and store the corrected version.
- `RecallLayer`: the layer union shared by `RecallOptions.layers` and `forget`, now exported.
- `WorkingMemory.remove(slotId)`.
- MCP: new tool `zenbrain_forget` (`destructiveHint: true`), taking exactly the `id` and `layer` that `zenbrain_recall` now returns with each result; the server instructions say when to use it. The smoke test stores, recalls, forgets and checks that the next recall no longer returns the memory.
- ai-sdk: `store.shouldStore(turn)` decides per turn whether it is stored at all, for example to keep secrets out of memory. A throwing predicate is reported through `onError` as a store error and the call answers normally.

### Added — `role: 'system' | 'user'` for the injected memories (`@zensation/ai-sdk`)

The middleware puts recalled memories into a system message in front of the prompt, so anything a user once said comes back with system authority (the Agent Memory Atlas flagged the injection as `system`). `role: 'user'` sends them as a user message directly before the latest user turn instead. The default stays `'system'`; the README explains when to switch.

### Added — `RecallOptions.core: 'always' | 'matching'` (`@zensation/core`, passed through by `@zensation/ai-sdk`)

Every recall adds every core block, scored 0.5, or 0.8 when the block shares a word of more than two letters with the query, and "the" is such a word. Measured on SQLite with fifteen core blocks and one fact: all three test queries returned ten core blocks at 0.8 and not the fact that answers them. `core: 'matching'` keeps only the blocks that share a content word with the query (the tokenizer of the lexical search, with its stopwords). The default stays `'always'`, so nothing changes unless you ask for it. The Agent Memory Atlas named the pattern on 30.09.2026.

### Removed — `RecallOptions.includeContext` and `taskType` (`@zensation/core`), `recall.taskType` (`@zensation/ai-sdk`)

The options promised a context-dependent retrieval boost, but no store path ever wrote an encoding context and no layer returned one, so they could never change a result (the MCP tool dropped them in 0.4.9; the Agent Memory Atlas found the option without a writer). The dead branch in `recall()` is gone, and core no longer imports `context-retrieval`. The functions themselves stay in `@zensation/algorithms` (`captureEncodingContext`, `calculateContextSimilarity`), tested, for anyone who stores a context of their own. A type fixture with `@ts-expect-error` on both options fails to compile against 0.4.x and passes now.

### Documentation

- README: new section *What runs on its own, and what you call yourself*, a table per mechanism of what the coordinator does and what `@zensation/algorithms` offers as functions. The README used to describe library functions as the system's behaviour: Hebbian edges, Bayesian propagation, a 30 % context boost, "reviews important facts at optimal intervals", "FSRS review queue across all layers", "apply decay". The coordinator calls few of those functions, and in long-term memory nothing decays on its own (the Agent Memory Atlas, tesseract and Core Memory Kit read it that way, rightly). The science sections now say which side each mechanism is on; the comparison footnote names Letta Code's "dreaming"; the coordinator example shows `forget()`. Same corrections in the `core` and `ai-sdk` package READMEs.
- README status line: only the **current** version of every package carries npm build provenance; 19 of the 64 versions published before provenance was switched on carry no attestation (checked against `dist.attestations` in the npm registry on 2026-10-04).
- README: new line *Self-hosted* — the library makes no network calls of its own; storage is SQLite or PostgreSQL, embeddings and an LLM are optional (`packages/core/src/types.ts`).
- `docs/FAQ.md`: test count 528 → 801 (CI run 36929686081, Node 22/24/26), and the production platform the layers were extracted from is described in the past tense.
- README *Cited by*: the two projects that build the library into their code, ACMS and neurograph-runtime, are listed with repository links; HindsightTag carries its revision date (30 September 2026).

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
