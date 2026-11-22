#!/usr/bin/env node
/**
 * Whether the MCP Registry already lists a version of a server.
 *
 *   node scripts/mcp-registry-lists.mjs ai.zensation/zenbrain 0.3.3   # prints listed=true or listed=false
 *
 * `.github/workflows/publish-mcp-registry.yml` runs on every release tag, and every tag carries the
 * `server.json` of that day. When a release does not change `@zensation/mcp`, that version is
 * already in the registry, and publishing it again fails: at tag v0.6.2 (2026-11-15) the workflow
 * went red in "Log in via DNS and publish" although the release was fine. The workflow skips the
 * publish when this script prints `listed=true`.
 *
 * It reads the same endpoint the workflow's last step reads, `/v0/servers?search=`, page by page
 * through `metadata.nextCursor`, and compares `server.name` and `server.version` exactly. Only a
 * positive answer skips: when the registry cannot be read, it prints `listed=false` with a
 * warning, and the workflow publishes as it did before. `MCP_REGISTRY_URL` replaces the base
 * address, for a test against a local server.
 */
const [name, version] = process.argv.slice(2);
if (!name || !version) {
  console.error('usage: node scripts/mcp-registry-lists.mjs <server name> <version>');
  process.exit(2);
}
const BASE = process.env.MCP_REGISTRY_URL ?? 'https://registry.modelcontextprotocol.io';
const MAX_PAGES = 20;

async function listed() {
  let cursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL('/v0/servers', BASE);
    url.searchParams.set('search', name.split('/').pop());
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body.servers)) throw new Error(`${url} returned no list of servers`);
    if (body.servers.some((entry) => entry?.server?.name === name && entry?.server?.version === version)) return true;
    cursor = body.metadata?.nextCursor;
    if (!cursor) return false;
  }
  throw new Error(`more than ${MAX_PAGES} pages for "${name}"`);
}

try {
  const found = await listed();
  console.error(`${name} ${version} is ${found ? 'already' : 'not yet'} in the registry`);
  console.log(`listed=${found}`);
} catch (err) {
  console.error(`::warning::could not read the registry (${err.message}); publishing as if ${version} were new`);
  console.log('listed=false');
}
