#!/usr/bin/env node
/**
 * Install smoke test: the packages as npm serves them, on the user's platform.
 *
 * ci.yml builds and tests the source on Linux. A user gets something else: the tarballs on npm,
 * resolved by their own npm on their own operating system. A native module without a prebuild for
 * that platform, an `engines` range that makes npm pick an older release, or a bin shim that does
 * not start would pass ci.yml and fail on the user's machine.
 *
 * Copy this file into a directory where the packages were installed from the registry, and run
 * it there, so that it imports them exactly as the READMEs do:
 *
 *   npm init -y
 *   npm install @zensation/core @zensation/adapter-sqlite @zensation/algorithms
 *   node install-smoke.mjs
 *
 * It checks:
 *   1. npm installed the current release of each package (`dist-tags.latest`), not an older line;
 *   2. the Quick Start of packages/core/README.md runs, and its recall finds the stored fact;
 *   3. the Quick Start of packages/algorithms/README.md returns the values its comments state;
 *   4. `npx -y @zensation/mcp`, the launch line of packages/mcp/README.md, starts over stdio,
 *      lists its five tools, and stores and recalls a memory.
 *
 * .github/workflows/install-smoke.yml runs it on Linux, macOS and Windows with Node 22, 24 and 26.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryCoordinator } from '@zensation/core';
import { SqliteAdapter } from '@zensation/adapter-sqlite';
import {
  initFromDecayClass,
  getRetrievability,
  updateAfterRecall,
  tagEmotion,
  computeEmotionalWeight,
  computeHebbianStrengthening,
  propagateForRelation,
} from '@zensation/algorithms';

const here = dirname(fileURLToPath(import.meta.url));
const windows = process.platform === 'win32';
let failures = 0;

function check(passed, what) {
  console.log(`${passed ? '✓' : '✗'} ${what}`);
  if (!passed) failures++;
}

async function section(name, fn) {
  try {
    await fn();
  } catch (err) {
    check(false, `${name}: ${err?.message ?? err}`);
  }
}

const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-9;
const work = mkdtempSync(join(tmpdir(), 'zenbrain-install-smoke-'));
console.log(`Node ${process.version} · npm ${spawnSync(windows ? 'npm.cmd' : 'npm', ['-v'], { encoding: 'utf8', shell: windows }).stdout.trim()} · ${process.platform}-${process.arch}`);

// 1. npm resolved the current release, not an older line whose `engines` happens to fit.
await section('versions', async () => {
  for (const pkg of ['@zensation/core', '@zensation/adapter-sqlite', '@zensation/algorithms']) {
    const installed = JSON.parse(readFileSync(join(here, 'node_modules', ...pkg.split('/'), 'package.json'), 'utf8')).version;
    const res = await fetch(`https://registry.npmjs.org/${pkg.replaceAll('/', '%2f')}`, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
    });
    const latest = (await res.json())['dist-tags'].latest;
    check(installed === latest, `${pkg}@${installed} installed; latest on npm is ${latest}`);
  }
});

// 2. packages/core/README.md, Quick Start.
await section('core Quick Start', async () => {
  const storage = new SqliteAdapter({ filename: join(work, 'memory.db') });
  const memory = new MemoryCoordinator({ storage });
  await memory.store('User prefers TypeScript', { type: 'auto' });
  const results = await memory.recall('Which language does the user prefer?');
  check(results.length > 0 && results[0].score > 0, `core: recall finds the stored fact (score ${results[0]?.score?.toFixed(2) ?? 'none'})`);
  check((await memory.forget(results[0].id, results[0].layer)) === true, 'core: forget() deletes it by the id and layer of the recall result');
  const consolidated = await memory.consolidate();
  check(typeof consolidated?.promoted === 'number', 'core: consolidate() runs');
  check(Array.isArray(await memory.getReviewQueue()), 'core: getReviewQueue() returns a list');
  await storage.close();
});

// 3. packages/algorithms/README.md, Quick Start: the values its comments state.
await section('algorithms Quick Start', async () => {
  const state = initFromDecayClass('normal_decay');
  const aWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const retention = getRetrievability(state, aWeekLater);
  check((retention * 100).toFixed(1) === '36.8', `algorithms: recall probability a week later ${(retention * 100).toFixed(1)}% (README: ~36.8%)`);
  const updated = updateAfterRecall(state, 4, retention, aWeekLater);
  check(updated.stability.toFixed(2) === '8.19', `algorithms: stability 7 -> ${updated.stability.toFixed(2)} (README: 8.19)`);
  const emotion = tagEmotion('I am absolutely thrilled — I got the promotion!');
  check(
    near(emotion.sentiment, 0.55) && near(emotion.arousal, 0.45) && near(emotion.valence, 0.775) && near(emotion.significance, 0.85),
    `algorithms: tagEmotion ${JSON.stringify(emotion)}`,
  );
  check(near(computeEmotionalWeight(emotion).decayMultiplier, 2.7), 'algorithms: decay multiplier 2.7');
  check(near(computeHebbianStrengthening(1.0), 1.09), 'algorithms: Hebbian strengthening 1.0 -> 1.09');
  check(near(propagateForRelation(0.5, 0.8, 1.0, 'supports'), 0.9), "algorithms: propagateForRelation(…, 'supports') = 0.9");
});

// 4. packages/mcp/README.md: `npx -y @zensation/mcp`, over stdio, the way an MCP client starts it.
await section('mcp over npx', async () => {
  const child = spawn('npx', ['-y', '@zensation/mcp'], {
    cwd: work,
    env: { ...process.env, ZENBRAIN_DB: join(work, 'mcp.db') },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: windows, // npx is npx.cmd on Windows; Node refuses to spawn .cmd files without a shell
  });
  let buffer = '';
  const waiting = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      let msg;
      try { msg = JSON.parse(line); } catch { continue; } // stdout carries only JSON-RPC; skip anything else
      if (msg.id != null && waiting.has(msg.id)) waiting.get(msg.id)(msg);
    }
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  let nextId = 1;
  const rpc = (method, params, ms = 30_000) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const onExit = (code) => {
        clearTimeout(timer);
        reject(new Error(`the server exited (code ${code}) before answering ${method}: ${stderr.trim().split('\n').slice(-2).join(' | ')}`));
      };
      const timer = setTimeout(() => { child.off('exit', onExit); reject(new Error(`${method}: no answer within ${ms / 1000} s`)); }, ms);
      child.once('exit', onExit);
      waiting.set(id, (msg) => { clearTimeout(timer); child.off('exit', onExit); resolve(msg); });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  try {
    // The first start downloads the package; give it time on a cold cache.
    const init = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'zenbrain-install-smoke', version: '1.0.0' },
    }, 180_000);
    check(init.result?.serverInfo?.name === '@zensation/mcp', `mcp: initialize answers as ${init.result?.serverInfo?.name}@${init.result?.serverInfo?.version}`);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const tools = (await rpc('tools/list', {})).result.tools.map((t) => t.name).sort();
    const expected = ['zenbrain_consolidate', 'zenbrain_forget', 'zenbrain_health', 'zenbrain_recall', 'zenbrain_store'];
    check(JSON.stringify(tools) === JSON.stringify(expected), `mcp: tools ${tools.join(', ')}`);
    const call = async (name, args) => JSON.parse((await rpc('tools/call', { name, arguments: args })).result.content[0].text);
    await call('zenbrain_store', { content: 'The install smoke test stored this sentence about Kiel harbour.' });
    const recalled = await call('zenbrain_recall', { query: 'Kiel harbour' });
    check(recalled.results?.some((r) => r.content.includes('Kiel harbour')), `mcp: recall finds the stored memory (${recalled.count} result)`);
  } finally {
    if (windows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else child.kill('SIGTERM');
  }
});

try { rmSync(work, { recursive: true, force: true }); } catch { /* a file still open on Windows; the runner discards it */ }
console.log(failures ? `\nFAIL: ${failures} check(s) failed.` : '\nOK: every check passed.');
process.exit(failures ? 1 : 0);
