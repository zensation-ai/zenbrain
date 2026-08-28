#!/usr/bin/env node
/**
 * `zenbrain-mcp` — the executable entry point.
 *
 * Wires a file-backed SQLite store to a MemoryCoordinator and speaks MCP over
 * stdio. Everything configurable is an environment variable, because that is the
 * only thing an MCP client config can set.
 *
 *   ZENBRAIN_DB        Path to the SQLite file.   Default: ./zenbrain.db
 *                      Use ':memory:' for a store that dies with the process.
 *   ZENBRAIN_CONTEXTS  Comma-separated context domains.
 *                      Default: personal,work,learning,creative
 *
 * Nothing is written to stdout except protocol traffic — stdout *is* the
 * transport. Diagnostics go to stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createZenBrainServer } from './server.js';

export { createZenBrainServer } from './server.js';
export type { ZenBrainServerOptions } from './server.js';

/** Lowest Node this package supports, mirroring `engines.node` in package.json. */
const MIN_NODE_MAJOR = 22;

/**
 * `engines` only makes npm print a warning, and an MCP client shows the user
 * nothing at all. On Node 20 the storage adapter's native module loads and then
 * segfaults the moment it is instantiated — exit 139, no stdout, no stderr. From
 * the client's side the server simply never comes up, with nothing to go on.
 *
 * So check before anything native is reachable, and say what is wrong.
 */
export function unsupportedNodeMessage(version: string): string | null {
  const major = Number(version.replace(/^v/, '').split('.')[0]);
  if (Number.isFinite(major) && major >= MIN_NODE_MAJOR) return null;

  return (
    `zenbrain-mcp needs Node ${MIN_NODE_MAJOR} or newer — this is Node ${version}.\n` +
    `Its SQLite storage uses better-sqlite3, whose native module crashes on older\n` +
    `runtimes instead of failing cleanly. Upgrade Node, or point your MCP client at a\n` +
    `Node ${MIN_NODE_MAJOR}+ binary:\n\n` +
    `  { "command": "/path/to/node22/bin/node",\n` +
    `    "args": ["/path/to/node_modules/@zensation/mcp/dist/index.js"] }\n`
  );
}

function assertSupportedNode(): void {
  const message = unsupportedNodeMessage(process.version);
  if (message === null) return;
  process.stderr.write(message);
  process.exit(1);
}

async function main(): Promise<void> {
  assertSupportedNode();

  // Imported here, not at module scope: a static import is hoisted above the
  // check and would load the native module before we get to say anything.
  const { MemoryCoordinator } = await import('@zensation/core');
  const { SqliteAdapter } = await import('@zensation/adapter-sqlite');

  const filename = process.env.ZENBRAIN_DB ?? './zenbrain.db';
  const contexts = process.env.ZENBRAIN_CONTEXTS?.split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  const storage = new SqliteAdapter({ filename });
  const coordinator = new MemoryCoordinator({
    storage,
    ...(contexts && contexts.length > 0 ? { contexts } : {}),
  });

  const server = createZenBrainServer(coordinator);

  const shutdown = async (): Promise<void> => {
    try {
      await server.close();
    } finally {
      await coordinator.close();
    }
  };
  process.on('SIGINT', () => void shutdown().finally(() => process.exit(0)));
  process.on('SIGTERM', () => void shutdown().finally(() => process.exit(0)));

  await server.connect(new StdioServerTransport());
  process.stderr.write(`zenbrain-mcp ready — store: ${filename}\n`);
}

// Only run when executed, not when imported. `process.argv[1]` is the script
// path the runtime was handed; comparing against import.meta.url is the
// ESM-safe form of the CommonJS `require.main === module` check.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  main().catch((err: unknown) => {
    process.stderr.write(`zenbrain-mcp failed to start: ${String(err)}\n`);
    process.exit(1);
  });
}
