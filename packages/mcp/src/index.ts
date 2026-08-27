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
import { MemoryCoordinator } from '@zensation/core';
import { SqliteAdapter } from '@zensation/adapter-sqlite';
import { createZenBrainServer } from './server.js';

export { createZenBrainServer } from './server.js';
export type { ZenBrainServerOptions } from './server.js';

async function main(): Promise<void> {
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
