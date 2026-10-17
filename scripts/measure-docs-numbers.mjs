#!/usr/bin/env node
/**
 * Produces every number the documentation states about this code that the repository can measure:
 * the README quick-start values, the Hebbian convergence table, the emotional decay multipliers,
 * the Hopfield recall quality and time, and the bundle sizes.
 *
 *   node scripts/measure-docs-numbers.mjs          # after building algorithms and core
 *
 * Until 0.5.2 these tables were written by hand: the Hebbian table and the bundle sizes did not
 * match the code (e.g. 100 co-activations give 6.71, not 4.0; the full algorithms bundle is
 * 38 KB, not 18), and the Hopfield module promised "sub-ms" where a recall took about 3 ms.
 * Whoever changes one of these numbers in the docs reruns this script and copies its output.
 *
 * Deterministic sections give the same output everywhere. The timing section depends on the
 * machine, so it prints Node version, platform and CPU next to the number. Bundle sizes need
 * esbuild, which the build toolchain (tsup) already installs; without it that section is skipped.
 */
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { cpus } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const alg = (name) => require(join(ROOT, 'packages', 'algorithms', 'dist', `${name}.cjs`));

const fsrs = alg('fsrs');
const emotional = alg('emotional');
const hebbian = alg('hebbian');
const hopfield = alg('hopfield-stm');

const out = (s = '') => console.log(s);
out(`# Documentation numbers — ${new Date().toISOString().slice(0, 10)}, Node ${process.version}, ${process.platform}/${process.arch}, ${cpus()[0]?.model ?? 'unknown CPU'}`);

// ---------------------------------------------------------------------------
out('\n## README quick start (packages/algorithms/README.md, README.md)');
{
  // The same calls as the quick start: a fresh memory, read and recalled a week later.
  const state = fsrs.initFromDecayClass('normal_decay');
  const weekLater = new Date(Date.now() + 7 * 86_400_000);
  const r = fsrs.getRetrievability(state, weekLater);
  const updated = fsrs.updateAfterRecall(state, 4, r, weekLater);
  const tag = emotional.tagEmotion('I am absolutely thrilled — I got the promotion!');
  const weight = emotional.computeEmotionalWeight(tag);
  out(`initial state (normal_decay): difficulty ${state.difficulty}, stability ${state.stability}`);
  out(`retrievability after 7 days: ${(r * 100).toFixed(1)} %`);
  out(`stability after a grade-4 recall at that point: ${state.stability} -> ${updated.stability.toFixed(2)}`);
  out(`tagEmotion: sentiment ${tag.sentiment.toFixed(2)}, arousal ${tag.arousal.toFixed(2)}, valence ${tag.valence.toFixed(3)}, significance ${tag.significance.toFixed(2)}`);
  out(`decay multiplier: ${weight.decayMultiplier.toFixed(1)}x, consolidation weight ${weight.consolidationWeight.toFixed(2)}`);
  out(`computeHebbianStrengthening(1.0): ${hebbian.computeHebbianStrengthening(1.0).toFixed(2)}`);
}

// ---------------------------------------------------------------------------
out('\n## Hebbian convergence (docs/benchmarks.md)');
{
  out('co-activations | edge weight | growth on that step');
  let w = 1.0;
  let prev = w;
  const rows = new Set([5, 10, 20, 50, 100]);
  for (let n = 1; n <= 100; n++) {
    prev = w;
    w = hebbian.computeHebbianStrengthening(w);
    if (rows.has(n)) out(`${String(n).padStart(3)} | ${w.toFixed(2)} | +${(w - prev).toFixed(3)}`);
  }
  out('closed form for a start at 1.0: w_n = 10 - 9 * 0.99^n');
}

// ---------------------------------------------------------------------------
out('\n## Emotional intensity and decay multiplier (docs/benchmarks.md)');
{
  out('intensity = max(|sentiment|, arousal, significance) | decay multiplier');
  for (const x of [0, 0.3, 0.5, 0.7, 1.0]) {
    const w = emotional.computeEmotionalWeight({ sentiment: 0, arousal: x, valence: 0.5, significance: 0 });
    out(`${x.toFixed(1)} | ${w.decayMultiplier.toFixed(1)}x`);
  }
}

// ---------------------------------------------------------------------------
out('\n## Hopfield recall, N = 600 random unit vectors, d = 1536 (packages/algorithms/src/hopfield-stm.ts)');
{
  // mulberry32 + Box-Muller: the same patterns on every machine
  let seed = 42;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const unit = (d) => {
    const v = new Array(d);
    for (let i = 0; i < d; i += 2) {
      const m = Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-12)));
      const a = 2 * Math.PI * rnd();
      v[i] = m * Math.cos(a);
      if (i + 1 < d) v[i + 1] = m * Math.sin(a);
    }
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  };
  const N = 600, d = 1536, q = 17;
  const patterns = Array.from({ length: N }, (_, i) => ({ id: `p${i}`, vector: unit(d) }));
  const cos = (a, b) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; } return s / Math.sqrt(na * nb); };
  out('beta | weight on the queried pattern | ranked first | cos(recovered state, pattern)');
  for (const beta of [1, 2, 4, 8, 16, 32]) {
    const res = hopfield.hopfieldRecall(patterns[q].vector, patterns, { beta });
    const w = res.matches.find((m) => m.pattern.id === `p${q}`).weight;
    out(`${String(beta).padStart(2)} | ${w.toFixed(4)} | ${res.matches[0].pattern.id === `p${q}`} | ${cos(res.recoveredVector, patterns[q].vector).toFixed(3)}`);
  }

  // The smallest beta (step 0.5) at which every one of Q queried patterns keeps a weight >= 0.99.
  const Q = 20;
  const minBeta = (P) => {
    const worst = (beta) => {
      let m = 1;
      for (let i = 0; i < Q; i++) m = Math.min(m, hopfield.hopfieldRecall(P[i].vector, P, { beta }).matches.find((x) => x.pattern.id === `p${i}`).weight);
      return m;
    };
    for (let b = 1; b <= 120; b += 0.5) if (worst(b) >= 0.99) return { beta: b, at16: worst(16) };
    return { beta: null, at16: worst(16) };
  };
  out(`\nsmallest beta with weight >= 0.99 on each of ${Q} queried patterns (random unit vectors)`);
  out('d | N | beta | ln(99(N-1)) | lowest weight at the default beta 16');
  for (const dim of [384, 768, 1536]) {
    for (const n of [100, 600, 2000]) {
      seed = 1000 + dim + n;
      const P = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, vector: unit(dim) }));
      const r = minBeta(P);
      out(`${dim} | ${n} | ${r.beta} | ${Math.log(99 * (n - 1)).toFixed(1)} | ${r.at16.toFixed(4)}`);
    }
  }
  out(`\ncorrelated patterns: d = 768, N = 600, pairwise cosine about c (a shared direction)`);
  out('c | beta | ln(99(N-1))/(1-c) | lowest weight at beta 16');
  for (const c of [0.3, 0.5, 0.7]) {
    seed = 2000 + Math.round(c * 10);
    const common = unit(768);
    const P = Array.from({ length: 600 }, (_, i) => {
      const r = unit(768).map((x, j) => Math.sqrt(1 - c) * x + Math.sqrt(c) * common[j]);
      const n = Math.hypot(...r);
      return { id: `p${i}`, vector: r.map((x) => x / n) };
    });
    const r = minBeta(P);
    out(`${c} | ${r.beta} | ${(Math.log(99 * 599) / (1 - c)).toFixed(1)} | ${r.at16.toFixed(4)}`);
  }

  for (let i = 0; i < 20; i++) hopfield.hopfieldRecall(patterns[i].vector, patterns);
  const R = 200;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < R; i++) hopfield.hopfieldRecall(patterns[i % N].vector, patterns);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / R;
  out(`\ntime per recall (N = 600, d = 1536, default beta, mean of ${R} after 20 warm-up calls): ${ms.toFixed(2)} ms`);
}

// ---------------------------------------------------------------------------
out('\n## Bundle size, esbuild --bundle --minify, ESM (docs/benchmarks.md)');
let esbuild;
try { esbuild = require('esbuild'); } catch { out('skipped: esbuild is not installed (it comes with the build toolchain)'); }
if (esbuild) {
  const cases = [
    ['@zensation/algorithms (full)', "export * from '@zensation/algorithms';"],
    ['@zensation/algorithms/fsrs', "export * from '@zensation/algorithms/fsrs';"],
    ['@zensation/algorithms/emotional', "export * from '@zensation/algorithms/emotional';"],
    ['@zensation/algorithms/hebbian', "export * from '@zensation/algorithms/hebbian';"],
    ['@zensation/algorithms/bayesian', "export * from '@zensation/algorithms/bayesian';"],
    ['@zensation/core (full, includes algorithms)', "export * from '@zensation/core';"],
    ['@zensation/core (WorkingMemory only)', "export { WorkingMemory } from '@zensation/core';"],
    ['FSRS + emotional + WorkingMemory', "export * from '@zensation/algorithms/fsrs'; export * from '@zensation/algorithms/emotional'; export { WorkingMemory } from '@zensation/core';"],
  ];
  out('import | minified | gzip');
  for (const [label, contents] of cases) {
    const r = await esbuild.build({
      stdin: { contents, resolveDir: ROOT, loader: 'js' },
      bundle: true, minify: true, format: 'esm', platform: 'neutral', write: false,
      mainFields: ['module', 'main'], conditions: ['import'], logLevel: 'silent',
    });
    const bytes = r.outputFiles[0].contents;
    out(`${label} | ${bytes.length.toLocaleString('en-US')} B | ${gzipSync(bytes).length.toLocaleString('en-US')} B`);
  }
}
