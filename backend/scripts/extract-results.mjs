#!/usr/bin/env node
/**
 * Turns an experiment run into the JSON files the paper's tables are generated from.
 *
 * The suites print their results to stdout between marker lines rather than writing
 * files, so this reads a captured run and splits it back out. Without it the chain
 * test -> JSON -> table has a manual step in the middle, which is exactly where a
 * reproduction stops being reproducible.
 *
 *   npm run experiments:ablation > run.log 2>&1
 *   node scripts/extract-results.mjs run.log results/
 *
 * Jest interleaves its own decoration with the captured output ("console.log" headers
 * and "at Object.log (…)" trailers), so those lines are dropped before parsing. Every
 * marker pair below corresponds to one file consumed by generate-tables.ts.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const MARKERS = [
  ['ABLATION_STUDY_RESULTS_JSON', 'END_ABLATION_STUDY_RESULTS', 'ablation-study.json'],
  ['CHALLENGING_ABLATION_RESULTS_JSON', 'END_CHALLENGING_ABLATION_RESULTS', 'challenging-ablation.json'],
  ['STRESS_ABLATION_RESULTS_JSON', 'END_STRESS_ABLATION_RESULTS', 'stress-ablation.json'],
];

const DECORATION = [
  /^\s*console\.(log|info|warn|error)\s*$/,
  /^\s*at\s+\S+.*\(.*:\d+:\d+\)\s*$/,
];

const [, , logPath, outDir = 'results'] = process.argv;
if (!logPath) {
  console.error('usage: node scripts/extract-results.mjs <run.log> [outDir]');
  process.exit(2);
}

const lines = readFileSync(logPath, 'utf-8')
  .split('\n')
  .filter((l) => !DECORATION.some((rx) => rx.test(l)));

mkdirSync(outDir, { recursive: true });
let written = 0;
for (const [open, close, file] of MARKERS) {
  const from = lines.findIndex((l) => l.includes(open));
  const to = lines.findIndex((l, i) => i > from && l.includes(close));
  if (from === -1 || to === -1) {
    console.error(`  MISSING       ${file}  (marker ${open} not found)`);
    continue;
  }
  const body = lines.slice(from + 1, to).join('\n').trim();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    console.error(`  UNPARSEABLE   ${file}: ${e.message}`);
    continue;
  }
  writeFileSync(join(outDir, file), JSON.stringify(parsed, null, 2) + '\n');
  console.log(`  wrote  ${join(outDir, file)}  (${Array.isArray(parsed) ? parsed.length : '?'} configurations)`);
  written++;
}
process.exit(written === MARKERS.length ? 0 : 1);
