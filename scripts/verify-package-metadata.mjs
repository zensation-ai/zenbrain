#!/usr/bin/env node
/**
 * Checks the metadata npm shows on the page of every published package: the licence, the
 * repository with the package's own directory, the homepage, where to report a bug, and the
 * author.
 *
 * These fields are what a reader of an npm page and every tool that reads package metadata
 * get; nothing else checked them. Read on 2026-11-22 from the tarballs on npm:
 * `@zensation/adapter-sqlite` 0.2.8, `@zensation/adapter-postgres` 0.2.9 and
 * `@zensation/ai-sdk` 0.4.0 had no `bugs`, so their pages named no issue tracker, while the
 * other three did.
 *
 *   node scripts/verify-package-metadata.mjs
 *
 * `npm pack` copies package.json as it is, so the source is what the tarball carries.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/zensation-ai/zenbrain';
const PACKAGES = [
  'packages/algorithms',
  'packages/core',
  'packages/adapters/postgres',
  'packages/adapters/sqlite',
  'packages/mcp',
  'packages/ai-sdk',
];

let bad = 0;
for (const dir of PACKAGES) {
  const pkg = JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf-8'));
  const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
  const problems = [];
  if (pkg.license !== 'Apache-2.0') problems.push(`license is ${JSON.stringify(pkg.license)}, not "Apache-2.0"`);
  if (pkg.repository?.type !== 'git' || pkg.repository?.url !== `${REPO}.git`) {
    problems.push(`repository is ${JSON.stringify(pkg.repository)}, not git ${REPO}.git`);
  }
  if (pkg.repository?.directory !== dir) problems.push(`repository.directory is ${JSON.stringify(pkg.repository?.directory)}, not "${dir}"`);
  if (pkg.homepage !== `${REPO}/tree/main/${dir}#readme`) problems.push(`homepage is ${JSON.stringify(pkg.homepage)}`);
  if (pkg.bugs?.url !== `${REPO}/issues`) problems.push(`bugs is ${JSON.stringify(pkg.bugs)}, not { "url": "${REPO}/issues" }`);
  if (typeof author !== 'string' || !/^Zensation AI\b/.test(author)) problems.push('author is not Zensation AI');

  console.log(`${pkg.name.padEnd(30)}${problems.length === 0 ? 'OK' : 'FAIL'}`);
  for (const p of problems) console.log(`  ${p}`);
  bad += problems.length;
}

if (bad > 0) {
  console.log(`\nFAIL: ${bad} metadata field(s) missing or wrong.`);
  process.exit(1);
}
console.log(`\nOK: ${PACKAGES.length} packages name their licence, repository directory, homepage, issue tracker and author.`);
