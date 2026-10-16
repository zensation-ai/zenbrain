# ZenBrain Benchmarks

This file collects the numbers behind ZenBrain. The system-level result — the one the
architecture is judged on — is LongMemEval-500, below. The algorithm-level figures under it are
a mix: some are measured, and some are taken from the published literature, cited at the table
that uses them. Two things here run from this repository: the mechanism comparison,
`scripts/compare-mechanisms.sh`, and the ablation tables, from `backend/` (`npm run experiments`;
CI checks every point estimate against `backend/results`).

## LongMemEval-500 (system level)

On LongMemEval-500, **three of nine head-to-head comparisons hold** against
Letta, Mem0 and A-Mem — all three against A-Mem, the remaining six are ties, none lost. Three
competitors x three LLM judges, Bonferroni-corrected (alpha = 0.05/18) and version-matched.

| Measure | Result |
|---|---|
| Head-to-head comparisons against Letta, Mem0 and A-Mem, three LLM judges each | 3 hold (all against A-Mem), 6 ties, 0 lost |
| Significance | Bonferroni-corrected, alpha = 0.05/18, version-matched judges |
| Share of full-context oracle binary-judge accuracy | 91.3% (47.7% vs. 52.2%) |
| Per-query token cost against that oracle | 1/109.6 |
| Multi-layer routing vs. flat single-layer baseline (LoCoMo) | +20.7% F1 |
| Cost of principled forgetting (NoDecay ablation) | Delta-P@5 = 0.002 |

> **Corrected on 2026-09-30.** Until today this file still carried the figures retracted on
> 2026-09-15 — *9 of 9*, *1/106th*, and `p_min` and Cohen's `d` computed over nine wins — after
> the README and the package pages had been corrected in 0.4.7. The judge
> versions had not been matched, and the 106 came from a thousands constant in a charting
> script; the CHANGELOG entry for 0.4.7 lists each change and why. Correction note:
> [10.5281/zenodo.22831087](https://doi.org/10.5281/zenodo.22831087).

**Where ZenBrain loses.** On LoCoMo, substring-based aggregate F1 favours lexical retrieval
(BM25) by metric design, and we do not contest that. Retrieval-proper metrics go to a competing
system. The advantage is most pronounced in the judge-graded comparisons and on cross-session
reasoning.

**Ablations.** Under moderate load, fourteen of the fifteen mechanism ablations look costless.
Raising decay to 0.25/day over 60 days, with no change to the mechanisms, makes nine of the
fifteen individually critical (Delta-Q up to -93.7%; Wilcoxon, 10 seeds). Mild-load ablation
systematically underestimates architectural contributions — the paper calls this cooperative
masking.

**Checking it.** The mechanism comparison in the README re-runs from this repository with
`bash scripts/compare-mechanisms.sh` — it needs git and network access for three shallow clones,
no API keys and no `npm install`, and it prints a positive and a negative control before the result. The LongMemEval and LoCoMo figures above come
from the paper; this repository does not yet ship a runner that reproduces them.

- Method and full tables: [arXiv:2604.23878](https://arxiv.org/abs/2604.23878)
- Open-access archive: [10.5281/zenodo.19353663](https://doi.org/10.5281/zenodo.19353663)

---

## Algorithm-level micro-benchmarks

## FSRS and SM-2

The authors of [FSRS](https://github.com/open-spaced-repetition/fsrs4anki) report that users need 20–30% fewer reviews than with SM-2 to reach the same retention level, a figure they base on simulations ([ABC of FSRS](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS)). The public [SRS benchmark](https://github.com/open-spaced-repetition/srs-benchmark) measures something different: how well each algorithm predicts the probability of recall (log loss, RMSE (bins), AUC) across 9,999 Anki collections; SM-2 is not in its current result table.

`@zensation/algorithms` follows FSRS for difficulty, stability and the stability updates after a review, with an exponential forgetting curve `R = e^(-t/S)`. We have not benchmarked this implementation against SM-2, so this page gives no retention figures of its own.

---

## Emotional Memory Boost

`computeEmotionalWeight()` turns an emotional tag into two numbers. The decay multiplier is
`1 + 2 × intensity`, where intensity is the largest of |sentiment|, arousal and significance
(computed by `scripts/measure-docs-numbers.mjs`):

```
Emotional intensity    Decay multiplier
───────────────────────────────────────
0.0 (neutral)               1.0x
0.3 (mild)                  1.6x
0.5 (moderate)              2.0x
0.7 (strong)                2.4x
1.0 (intense)               3.0x
```

The multiplier stretches the stability in `R = e^(−t / (S × multiplier))`, so emotional memories
decay up to 3x slower. The other number, the consolidation weight (0–1), decides whether the
coordinator turns an episode into a fact (above 0.5). The direction follows the findings on
amygdala-mediated memory modulation (LaBar & Cabeza 2006; Cahill & McGaugh 1998); the size of
the effect is a design constant, not a measurement.

---

## Hebbian Learning Convergence

Edge strengthening follows an asymptotic curve (diminishing returns):

```
Co-activations    Edge Weight    Growth on that step
────────────────────────────────────────────────────
     0              1.00          (baseline)
     5              1.44          +0.086
    10              1.86          +0.082
    20              2.64          +0.074
    50              4.55          +0.055
   100              6.71          +0.033
```

From a start at 1.0 the weight after n co-activations is `10 − 9 × 0.99^n` (computed by
`scripts/measure-docs-numbers.mjs`).

The asymptotic formula `growth = LR * (1 - w/MAX)` ensures weights never exceed `MAX_WEIGHT` (10.0), preventing runaway strengthening. Homeostatic normalization keeps the total weight budget constant.

---

## Algorithmic Complexity

| Algorithm | Time | Space | Notes |
|-----------|------|-------|-------|
| FSRS update | O(1) | O(1) | Single state update |
| Ebbinghaus retention | O(1) | O(1) | Exponential formula |
| Emotional tagging | O(n) | O(1) | n = words in text |
| Hebbian strengthening | O(1) | O(1) | Single edge update |
| Hebbian normalization | O(k) | O(k) | k = edges in context |
| Co-activation pairs (`generatePairs`) | O(n²) | O(n²) | n = co-activated items; it returns every pair |
| Bayesian propagation | O(1) per edge | O(1) | `propagateForRelation` updates one edge; i passes over e edges in your code cost O(i * e) |
| Context similarity | O(1) | O(1) | Matrix lookup |
| Sleep consolidation | O(m * e) | O(m) | m = memories, e = avg edges per memory |
| String similarity | O(w) | O(w) | w = unique words |

Per call, the functions are constant-time or linear in their input, with two exceptions: `generatePairs` is
quadratic, because it returns every pair of the items it is given, and `selectForReplay` sorts its candidates
(O(m log m)). Two regular expressions that took quadratic
time on adversarial input (CodeQL alerts #3, #4) are linear now; the CHANGELOG records the fix.

---

## Memory Footprint

Estimates from the data layout, not measurements — except the two embedding rows and the FSRS
state, which are arithmetic (4 bytes per dimension; two numbers and a date).

| Component | Per-Item Size | Notes |
|-----------|--------------|-------|
| Working memory slot | ~1 KB | Content + metadata |
| Short-term interaction | ~500 B | Role + content |
| Episodic memory | ~2 KB | Content + embedding reference |
| Semantic fact | ~2.5 KB | Content + FSRS state + embedding |
| Embedding (1536D) | 6 KB | OpenAI ada-002 dimensions |
| Embedding (384D) | 1.5 KB | all-MiniLM-L6-v2 dimensions |
| FSRS state | 24 B | difficulty + stability + nextReview |

### Typical Deployment Sizes

Rough estimates from the sizes above, not measured deployments.

| Scale | Facts | Embeddings | DB Size | RAM |
|-------|-------|-----------|---------|-----|
| Personal assistant | 1K | 1536D | ~15 MB | ~50 MB |
| Team knowledge base | 10K | 1536D | ~150 MB | ~200 MB |
| Enterprise | 100K | 1536D | ~1.5 GB | ~1 GB |

---

## Bundle Size

ZenBrain is tree-shakeable. Import only what you need. Measured with esbuild 0.27 (`--bundle --minify`, ESM)
by `scripts/measure-docs-numbers.mjs`; each row exports everything from the import named, except where it says
otherwise:

| Import | Minified | gzip |
|--------|---------:|-----:|
| `@zensation/algorithms` (full) | 38.8 KB | 14.2 KB |
| `@zensation/algorithms/fsrs` | 3.9 KB | 1.4 KB |
| `@zensation/algorithms/emotional` | 5.2 KB | 2.3 KB |
| `@zensation/algorithms/hebbian` | 0.9 KB | 0.5 KB |
| `@zensation/algorithms/bayesian` | 0.7 KB | 0.5 KB |
| `@zensation/core` (full, includes the algorithms it uses) | 33.2 KB | 10.6 KB |
| `@zensation/core` (`WorkingMemory` only) | 2.4 KB | 1.0 KB |

**A typical integration — FSRS, emotional tagging and working memory — is 11.5 KB minified, 4.5 KB gzip.**

---

## Database Query Performance

This repository ships no database latency benchmark, so this page states no query times; they depend on
your PostgreSQL, pgvector and hardware. `sql/001_init.sql` of `@zensation/adapter-postgres` already creates
HNSW indexes on the four embedding columns. If you write your own schema, these are the indexes that matter:
```sql
CREATE INDEX ON learned_facts USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON learned_facts (fsrs_next_review) WHERE fsrs_next_review IS NOT NULL;
CREATE INDEX ON episodic_memories (created_at DESC);
CREATE INDEX ON procedural_memories (success_rate DESC);
```
