# ZenBrain — reproduction package for the mechanism ablation tables

This is the material behind the sentence in the ZenBrain abstract:

> Every ablation table here reproduces in under one minute on a laptop (`npm install`, no API keys).

**Scope, stated plainly.** The paper carries five tables captioned as ablations. This package
reproduces **three** of them — Tables 7, 8 and 9, the mechanism ablation across moderate,
challenging and stress conditions. **Table 11** (*NoDecay ablation on real LoCoMo*) needs the
LoCoMo corpus, and **Table 13** (*Routing ablation study*, reported in F1 and Task Success) is
produced by a different pipeline. Neither is here, and neither runs without data.

Paper: [arXiv:2604.23878](https://arxiv.org/abs/2604.23878) · Archive: [10.5281/zenodo.19353663](https://doi.org/10.5281/zenodo.19353663)

```bash
npm install
npm run experiments
```

Four suites, 95 tests. **No API keys, no network, no data files, no external services** — the
only runtime imports are Node's own `crypto`, `fs` and `path`. Measured on an Apple M-series
laptop: the ablation suite takes **13 s**, all four together well under a minute.

The suites were written for Jest in the development tree. They run unchanged under Vitest,
which is what this package uses: same numbers to the last digit, a quarter of the runtime, and
no second test runner or native compiler for a repository that already uses Vitest throughout.

## What produces which printed number

| Command | Suite | Feeds | Numbers it produces |
|---|---|---|---|
| `npm run experiments:ablation` | `ablation-study.test.ts` | `ablation-study.json`, `challenging-ablation.json`, `stress-ablation.json` → `ablation-study.tex` | The 15-algorithm ablation across three loads: **moderate** (300 facts, 45 days, decay 0.15/day), **challenging** (400/50/0.20), **stress** (500/60/0.25). Every Retention, P@5, NDCG@5 and ΔQ in that table, including −93.7 % for TripleCopy, +2.0 % for PriorityMap and −98.7 % for the bare configuration. |
| `npm run experiments:comparison` | `competitive-comparison.test.ts` | `competitive-comparison.tex` | Static RAG vs. Simple Memory vs. the full fifteen-algorithm system, on synthetic data. |
| `npm run experiments:pma` | `pma-benchmark.test.ts` | `pma-benchmark.tex` | The six Predictive Memory Architecture components measured one at a time — tonic drift over 1000 events, reconsolidation PE-accuracy, TripleCopy retention at 7/14/30 days. |
| *(part of `npm run experiments`)* | `integration-cascade.test.ts` | — | The end-to-end cascade: event → neuromodulation → two-factor update → sleep consolidation → stability protection → FSRS interval → ranking. Not a paper table; it is the check that the algorithms still interact as described. |

## Getting the JSON back out

The suites print their results to stdout between marker lines rather than writing files, so
the run has to be captured and split:

```bash
npm run experiments:ablation > run.log 2>&1
node scripts/extract-results.mjs run.log results/
```

## Checking a run against the published numbers

`results/` holds the three JSON files the paper's tables were generated from. To confirm a
fresh run reproduces them:

```bash
node scripts/verify-against-reference.mjs <fresh-dir> results/
```

Last measured: **722 point estimates identical, 0 drifted** — under both runners.

⚠️ **One caveat, stated because it would otherwise look like a failure.** The point estimates
(`mean`, `std`, the deltas and p-values) come from seeded runs — `mulberry32`, ten seeds — and
reproduce exactly. The `ci95` bounds come from bootstrap resampling with an **unseeded** RNG and
therefore differ between runs, in the last comparison for **181** of them. None of those bounds
appears in a printed table. The verification script reports them separately for that reason: a
check that failed on them would cry wolf on every run, and a check that cried wolf every run
would soon be ignored.

The comparison is tested against a planted defect: perturbing one `precision.mean` by 1 × 10⁻⁷
moves the count to 721 identical / 1 drifted and flips the verdict. A check that cannot fail
proves nothing.

## What is not here

The four suites above are the ones that need nothing but Node. Five further suites in the
development tree — `ablation-study-real`, `competitive-comparison-real`, `competitive-locomo-real`,
`baseline-zenbrain` and `sleep-consolidation` — read a LoCoMo corpus and an embedding cache. They
feed **Table 11** and the sleep-consolidation table, and belong to a separate package.

**Table 13** (*Routing ablation*) is produced by neither set. A search across the development
tree for the routing ablation finds nothing that generates it; it reports LoCoMo metrics and
comes from the retrieval pipeline.

## Layout

```
src/algorithms/          six mechanism modules, imported by the suites
src/__tests__/experiments/   the four suites
scripts/                 extract-results.mjs · verify-against-reference.mjs
results/                 the JSON the published tables were generated from
```

Apache-2.0.
