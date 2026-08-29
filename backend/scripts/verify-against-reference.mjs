#!/usr/bin/env node
/**
 * Compares a fresh run against the reference results the paper's tables were built from.
 *
 *   node scripts/verify-against-reference.mjs frisch/ results/
 *
 * Point estimates (mean, std, the deltas and p-values) come from seeded runs and must
 * match exactly. The ci95 bounds come from bootstrap resampling with an unseeded RNG,
 * so they differ between runs by design — they are reported separately rather than
 * folded into the verdict, because a check that fails on them would cry wolf every time.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES = ['ablation-study.json', 'challenging-ablation.json', 'stress-ablation.json'];
const [, , freshDir = 'frisch', refDir = 'results'] = process.argv;

const num = (x) => typeof x === 'number' ? x : null;
let exact = 0, drift = 0, ciDrift = 0, missing = 0;

for (const f of FILES) {
  const a = JSON.parse(readFileSync(join(refDir, f), 'utf-8'));
  const b = JSON.parse(readFileSync(join(freshDir, f), 'utf-8'));
  if (a.length !== b.length) {
    console.error(`  ${f}: row count differs (${a.length} vs ${b.length})`);
    missing++;
    continue;
  }
  for (let i = 0; i < a.length; i++) {
    for (const key of Object.keys(a[i])) {
      const x = a[i][key], y = b[i][key];
      if (x && typeof x === 'object' && 'mean' in x) {
        for (const sub of ['mean', 'std']) {
          if (num(x[sub]) === null) continue;
          if (x[sub] === y?.[sub]) exact++;
          else { drift++; console.error(`  DRIFT ${f} · ${a[i].config} · ${key}.${sub}: ${x[sub]} vs ${y?.[sub]}`); }
        }
        if (JSON.stringify(x.ci95) !== JSON.stringify(y?.ci95)) ciDrift++;
      } else if (num(x) !== null) {
        if (x === y) exact++;
        else { drift++; console.error(`  DRIFT ${f} · ${a[i].config} · ${key}: ${x} vs ${y}`); }
      }
    }
  }
}

console.log(`\n  point estimates identical : ${exact}`);
console.log(`  point estimates drifted   : ${drift}`);
console.log(`  ci95 bounds differing     : ${ciDrift}  (bootstrap, unseeded — expected)`);
if (missing) console.log(`  files not comparable      : ${missing}`);
console.log(drift === 0 && missing === 0
  ? '\n  VERDICT: every published point estimate reproduces exactly.'
  : '\n  VERDICT: point estimates drifted — this is a real failure.');
process.exit(drift === 0 && missing === 0 ? 0 : 1);
