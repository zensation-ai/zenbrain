#!/usr/bin/env node
/**
 * Compiles every TypeScript code block in the documentation against the built packages.
 *
 * A code block in a README is a claim that this code works. Until 0.5.2 nothing checked that
 * claim: the PostgreSQL quick start in docs/getting-started.md called three methods the adapter
 * does not have, and the README's forget() line did not compile — both for months. This script
 * makes a block that stops compiling fail CI, the same way verify-package-contents.sh does for
 * the `files` field.
 *
 *   node scripts/check-doc-snippets.mjs                 # the documentation set below
 *   node scripts/check-doc-snippets.mjs docs/recipes.md # only these files
 *
 * Run it after building the packages: the snippets import `@zensation/*` and resolve to dist/.
 *
 * Every block fenced as ```ts or ```typescript is compiled with `tsc --strict`, each as its own
 * module, so blocks do not see each other's declarations. Two markers on the fence line change that:
 *
 *   ```ts skip                not compiled; say next to the block why (e.g. it needs a third-party SDK)
 *   ```ts prelude=<a>[,<b>]   compiled after scripts/doc-snippets/<a>.ts (and <b>.ts …), for blocks that
 *                             use something the page set up earlier, such as `memory`; a prelude only
 *                             declares types (`declare const memory: MemoryCoordinator`), it runs nothing
 *
 * scripts/doc-snippets/*.d.ts are type stubs for third-party packages a snippet imports but this
 * repository does not install (such as `@ai-sdk/openai`); they are part of every run.
 *
 * Errors are reported at the line of the Markdown file, not of the generated file.
 * No dependencies beyond the repository's own `typescript`.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRELUDES = join(ROOT, 'scripts', 'doc-snippets');
const WORK = join(ROOT, 'node_modules', '.cache', 'check-doc-snippets');

// Everything a user reads as documentation. CHANGELOG.md is history and quotes old APIs on purpose.
const DOCS = ['README.md', 'docs/*.md', 'packages/*/README.md', 'packages/adapters/*/README.md', 'examples/README.md'];

function expand(pattern) {
  if (!pattern.includes('*')) return existsSync(join(ROOT, pattern)) ? [pattern] : [];
  const dir = dirname(pattern);
  const name = basename(pattern);
  const parents = dir.includes('*') ? expandDirs(dir) : [dir];
  return parents.flatMap((p) => {
    if (!existsSync(join(ROOT, p))) return [];
    if (!name.includes('*')) return existsSync(join(ROOT, p, name)) ? [`${p}/${name}`] : [];
    const [before, after] = name.split('*');
    return readdirSync(join(ROOT, p))
      .filter((f) => f.startsWith(before) && f.endsWith(after))
      .sort()
      .map((f) => `${p}/${f}`);
  });
}

function expandDirs(dirPattern) {
  const [base, rest] = dirPattern.split('/*');
  if (!existsSync(join(ROOT, base))) return [];
  return readdirSync(join(ROOT, base), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `${base}/${d.name}${rest ?? ''}`)
    .sort();
}

/** Fenced blocks of a Markdown file: { line, info, code } with `line` = first line of the code. */
function blocks(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)```(ts|typescript)(?:\s+(.*))?\s*$/.exec(lines[i]);
    if (!open) continue;
    const indent = open[1].length;
    const code = [];
    let j = i + 1;
    for (; j < lines.length && !/^\s*```\s*$/.test(lines[j]); j++) code.push(lines[j].slice(Math.min(indent, lines[j].search(/\S|$/))));
    out.push({ line: i + 2, info: (open[3] ?? '').trim(), code: code.join('\n') });
    i = j;
  }
  return out;
}

const files = (process.argv.length > 2 ? process.argv.slice(2) : DOCS.flatMap(expand)).map((f) => relative(ROOT, join(ROOT, f)));
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const origin = new Map(); // generated file name -> { doc, line, offset }
let compiled = 0;
let skipped = 0;
const problems = [];

for (const doc of files) {
  const text = readFileSync(join(ROOT, doc), 'utf-8');
  blocks(text).forEach((b, n) => {
    const flags = b.info.split(/\s+/).filter(Boolean);
    if (flags.includes('skip')) { skipped++; return; }
    let prelude = '';
    const p = flags.find((f) => f.startsWith('prelude='));
    for (const name of p ? p.slice('prelude='.length).split(',') : []) {
      const file = join(PRELUDES, `${name}.ts`);
      if (!existsSync(file)) { problems.push(`${doc}:${b.line - 1}: unknown prelude "${name}" (no ${relative(ROOT, file)})`); return; }
      prelude += readFileSync(file, 'utf-8').replace(/\n*$/, '\n');
    }
    const unknown = flags.filter((f) => f !== 'skip' && !f.startsWith('prelude='));
    if (unknown.length) { problems.push(`${doc}:${b.line - 1}: unknown fence marker(s) ${unknown.join(' ')}`); return; }
    const name = `${doc.replace(/[^A-Za-z0-9]+/g, '_')}__${n + 1}.ts`;
    writeFileSync(join(WORK, name), `${prelude}${b.code}\nexport {};\n`);
    origin.set(name, { doc, line: b.line, offset: prelude.split('\n').length - 1 });
    compiled++;
  });
}

// Ambient type stubs (scripts/doc-snippets/*.d.ts) for third-party packages a snippet imports.
for (const f of readdirSync(PRELUDES).filter((f) => f.endsWith('.d.ts'))) {
  writeFileSync(join(WORK, f), readFileSync(join(PRELUDES, f), 'utf-8'));
}

writeFileSync(join(WORK, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    strict: true, noEmit: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler',
    skipLibCheck: true, types: ['node'], typeRoots: [join(ROOT, 'node_modules', '@types')],
  },
  include: ['*.ts'],
}, null, 2));

let tscOut = '';
if (compiled > 0) {
  const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  const r = spawnSync(process.execPath, [tsc, '-p', WORK, '--pretty', 'false'], { encoding: 'utf-8' });
  if (r.error) throw r.error;
  tscOut = `${r.stdout}${r.stderr}`;
  for (const raw of tscOut.split('\n')) {
    const m = /^(.+?)\((\d+),(\d+)\): (error TS\d+: .*)$/.exec(raw.trim());
    if (!m) { if (raw.trim()) problems.push(raw.trim()); continue; }
    const o = origin.get(basename(m[1]));
    if (!o) { problems.push(raw.trim()); continue; }
    const line = Number(m[2]) - o.offset;
    problems.push(line >= 1
      ? `${o.doc}:${o.line + line - 1}: ${m[4]}`
      : `${o.doc}:${o.line - 1}: (in the prelude, line ${m[2]}) ${m[4]}`);
  }
}

console.log(`doc snippets: ${files.length} files, ${compiled} blocks compiled, ${skipped} skipped`);
for (const p of problems) console.log(`  ${p}`);
if (problems.length) {
  console.log(`\nFAIL: ${problems.length} problem(s). Fix the block, or mark it \`\`\`ts skip / \`\`\`ts prelude=<name> (see the header of this script).`);
  process.exit(1);
}
console.log('OK: every compiled block type-checks.');
rmSync(WORK, { recursive: true, force: true });
