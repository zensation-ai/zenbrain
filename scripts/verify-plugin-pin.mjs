#!/usr/bin/env node
/**
 * Checks that the Claude Code plugin in plugins/zenbrain starts one exact, published version of
 * @zensation/mcp, and that every place naming that version agrees.
 *
 * The plugin's version lives in five places: the launcher in .mcp.json, the dependency in the
 * plugin's package.json, the package-lock.json next to it (which Anthropic's plugin directory reads
 * for its Verified badge: exact versions, registry sources and hashes), and the version named in
 * the plugin's README and PRIVACY.md. Each @zensation/mcp release has to move all five together,
 * and a pin to a version that is not on npm yet breaks every install. This script fails CI on
 * either.
 *
 *   node scripts/verify-plugin-pin.mjs
 *
 * The launcher must be exactly `npx -y @zensation/mcp@<x.y.z>`: the directory's locked launch
 * accepts no other npx options, and a range would not be a pin. The registry check fetches the
 * package document from registry.npmjs.org and compares the integrity hash of the pinned version
 * with the one in the lock, so the lock describes the tarball npm actually serves.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = join(ROOT, 'plugins', 'zenbrain');
const PKG = '@zensation/mcp';
const REGISTRY = 'https://registry.npmjs.org/';

const problems = [];
const read = (file) => readFileSync(join(PLUGIN, file), 'utf-8');
const json = (file) => JSON.parse(read(file));

// 1. The launcher.
const server = json('.mcp.json').mcpServers?.zenbrain;
const args = server?.args ?? [];
const launch = /^@zensation\/mcp@(\d+\.\d+\.\d+)$/.exec(args[1] ?? '');
if (server?.command !== 'npx' || args.length !== 2 || args[0] !== '-y' || !launch) {
  console.error(`✗ .mcp.json must run \`npx -y ${PKG}@<x.y.z>\`, found: ${[server?.command, ...args].join(' ')}`);
  process.exit(1);
}
const pin = launch[1];

// 2. The plugin's package.json and its lock.
const manifestDep = json('package.json').dependencies?.[PKG];
if (manifestDep !== pin) problems.push(`package.json depends on ${PKG} ${manifestDep}, the launcher on ${pin}`);

const lock = json('package-lock.json');
const rootDep = lock.packages?.['']?.dependencies?.[PKG];
const locked = lock.packages?.[`node_modules/${PKG}`];
if (rootDep !== pin) problems.push(`package-lock.json root depends on ${PKG} ${rootDep}, the launcher on ${pin}`);
if (locked?.version !== pin) problems.push(`package-lock.json locks ${PKG} ${locked?.version}, the launcher pins ${pin}`);

const entries = Object.entries(lock.packages ?? {}).filter(([key]) => key !== '');
for (const [key, entry] of entries) {
  if (!entry.resolved?.startsWith(REGISTRY)) problems.push(`${key}: resolved is not on ${REGISTRY} (${entry.resolved})`);
  if (!entry.integrity?.startsWith('sha512-')) problems.push(`${key}: no sha512 integrity hash`);
}

// 3. The version the plugin's documents name.
for (const file of ['README.md', 'PRIVACY.md']) {
  const text = read(file);
  const named = [
    ...text.matchAll(/`@zensation\/mcp`(?:@| )(\d+\.\d+\.\d+)/g),
    ...text.matchAll(/exact version \((\d+\.\d+\.\d+)\)/g),
  ].map((m) => m[1]);
  if (named.length === 0) problems.push(`${file} names no ${PKG} version; update the pattern here together with the text`);
  for (const v of named) if (v !== pin) problems.push(`${file} names ${PKG} ${v}, the launcher pins ${pin}`);
}

// 4. The pinned version is on npm, and the lock holds the tarball npm serves.
const res = await fetch(`${REGISTRY}${PKG.replace('/', '%2f')}`, { headers: { accept: 'application/json' } });
if (!res.ok) {
  problems.push(`registry answered ${res.status} for ${PKG}`);
} else {
  const published = (await res.json()).versions?.[pin];
  if (!published) problems.push(`${PKG}@${pin} is not on npm: the plugin would fail to start`);
  else if (published.dist?.integrity !== locked?.integrity) {
    problems.push(`package-lock.json integrity for ${PKG}@${pin} differs from the registry's`);
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`✓ plugin runs ${PKG}@${pin}: launcher, package.json, lock (${entries.length} packages, all hashed, all from npm), README and PRIVACY.md agree, and npm serves it`);
