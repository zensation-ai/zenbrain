#!/usr/bin/env node
/**
 * Runtime smoke test for the published MCP server.
 *
 * The unit suite drives `createZenBrainServer` in-process. That proves the tools
 * are correct; it does not prove the *binary* works — a broken bin path, a bad
 * shebang, an ESM/CJS mismatch or a native module that fails to load would all
 * pass the unit suite and fail on a user's machine.
 *
 * So this spawns `packages/mcp/dist/index.js` as a real child process, talks to
 * it over real stdio, and round-trips a memory through it.
 *
 *   node scripts/smoke-mcp.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'packages/mcp/dist/index.js');

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!existsSync(entry)) fail(`built entry point missing: ${entry} — run the build first`);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entry],
  // ':memory:' keeps the smoke test from leaving a database behind in CI.
  env: { ...process.env, ZENBRAIN_DB: ':memory:' },
  stderr: 'inherit',
});

const client = new Client({ name: 'zenbrain-smoke', version: '1.0.0' });
await client.connect(transport);
console.log('✓ the binary started and completed the MCP handshake');

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
const expected = ['zenbrain_consolidate', 'zenbrain_health', 'zenbrain_recall', 'zenbrain_store'];
if (JSON.stringify(names) !== JSON.stringify(expected)) {
  fail(`unexpected tool list: ${names.join(', ')}`);
}
console.log(`✓ advertises all four tools: ${names.join(', ')}`);

const MEMORY = 'The smoke test stored this sentence in Hamburg.';

const stored = await client.callTool({
  name: 'zenbrain_store',
  arguments: { content: MEMORY, type: 'fact' },
});
if (stored.isError) fail(`store failed: ${JSON.stringify(stored.content)}`);
console.log(`✓ stored a memory, id ${stored.structuredContent.id}`);

const recalled = await client.callTool({
  name: 'zenbrain_recall',
  arguments: { query: 'smoke test Hamburg', limit: 5 },
});
if (recalled.isError) fail(`recall failed: ${JSON.stringify(recalled.content)}`);

const out = recalled.structuredContent;
if (out.skipped > 0) fail(`recall dropped ${out.skipped} row(s) with unreadable content`);
if (!out.results.some((r) => r.content.includes('Hamburg'))) {
  fail(`recall did not return the stored sentence. Got: ${JSON.stringify(out)}`);
}
console.log(`✓ recalled it back through a real stdio round trip (${out.count} result(s))`);

const health = await client.callTool({ name: 'zenbrain_health', arguments: {} });
if (health.isError) fail('health failed');
const layers = JSON.parse(health.content[0].text);
for (const l of ['working', 'shortTerm', 'episodic', 'semantic', 'procedural', 'core']) {
  if (layers[l] === undefined) fail(`health is missing the ${l} layer`);
}
console.log('✓ health reports every layer');

await client.close();
console.log('\nMCP server smoke test passed.');
