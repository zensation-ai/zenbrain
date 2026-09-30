#!/usr/bin/env node
/**
 * `zenbrain-mcp` — the executable entry point.
 *
 * Wires a file-backed SQLite store to a MemoryCoordinator and speaks MCP over
 * stdio. Everything configurable is an environment variable, because that is the
 * only thing an MCP client config can set.
 *
 *   ZENBRAIN_DB        Path to the SQLite file.   Default: ./zenbrain.db
 *                      A leading `~/` means the home directory. Relative
 *                      paths are relative to the working directory the
 *                      client chose. Use ':memory:' for a store that dies
 *                      with the process.
 *   ZENBRAIN_CONTEXTS  Comma-separated context domains.
 *                      Default: personal,work,learning,creative
 *
 * Nothing is written to stdout except protocol traffic — stdout *is* the
 * transport. Diagnostics go to stderr.
 */
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
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

/** Where the store goes when `ZENBRAIN_DB` is not set. */
const DEFAULT_STORE = './zenbrain.db';

/**
 * The store path, from `ZENBRAIN_DB` as the client config spelled it.
 *
 * A shell expands `~`; an MCP client does not — it hands the environment over
 * verbatim. The README's own example, `"ZENBRAIN_DB": "~/.zenbrain/memory.db"`,
 * therefore reached the adapter as a relative path whose first directory is
 * literally named `~`. Measured on 0.1.6 (2026-09-30): started from a writable
 * directory the server created `./~/.zenbrain/memory.db` there; started from
 * `/`, where Claude Desktop may launch servers, it exited with
 * `ENOENT: mkdir '~/.zenbrain'`. So a leading `~/` means the home directory,
 * as it would in a shell. Everything else passes through unchanged: `:memory:`,
 * absolute paths, and relative paths, which stay relative to the working
 * directory.
 *
 * `home` is injectable so the expansion can be tested without touching the
 * real home directory.
 */
export function resolveStorePath(value: string | undefined, home: string = homedir()): string {
  const raw = value === undefined || value.trim() === '' ? DEFAULT_STORE : value;
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return join(home, raw.slice(2));
  return raw;
}

/**
 * What to say when the store cannot be opened.
 *
 * Measured on 0.1.6 (2026-09-30): with the default `./zenbrain.db` and the
 * working directory `/`, the server exited with `SqliteError: unable to open
 * database file` — without saying where it had tried, or that the directory
 * was the client's choice. Name the absolute path, and the way out.
 */
export function storeOpenFailureMessage(filename: string, cwd: string, cause: unknown): string {
  const absolute = filename === ':memory:' || isAbsolute(filename);
  const where = absolute ? filename : resolvePath(cwd, filename);
  return (
    `zenbrain-mcp could not open its store at ${where}: ${String(cause)}\n` +
    (absolute
      ? ''
      : `That path is relative to the working directory your MCP client started the server in (${cwd}).\n`) +
    `Set ZENBRAIN_DB to an absolute path, for example "~/.zenbrain/memory.db".\n`
  );
}

async function main(): Promise<void> {
  assertSupportedNode();

  // Imported here, not at module scope: a static import is hoisted above the
  // check and would load the native module before we get to say anything.
  const { MemoryCoordinator } = await import('@zensation/core');
  const { SqliteAdapter } = await import('@zensation/adapter-sqlite');

  const filename = resolveStorePath(process.env.ZENBRAIN_DB);
  const contexts = process.env.ZENBRAIN_CONTEXTS?.split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  let storage: InstanceType<typeof SqliteAdapter>;
  try {
    storage = new SqliteAdapter({ filename });
  } catch (err) {
    process.stderr.write(storeOpenFailureMessage(filename, process.cwd(), err));
    process.exit(1);
  }
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
  const where = filename === ':memory:' ? filename : resolvePath(filename);
  process.stderr.write(`zenbrain-mcp ready — store: ${where}\n`);
}

/**
 * Is this module the program the runtime was asked to run, or was it imported?
 *
 * `process.argv[1]` is the path as the caller spelled it. `import.meta.url` is
 * that path *after* the loader resolved symlinks. npm installs every `bin` as a
 * symlink — `/usr/local/bin/zenbrain-mcp -> ../lib/node_modules/@zensation/mcp/dist/index.js`
 * — so for an installed package the two spellings never match, and comparing
 * them unresolved left `main()` unreachable.
 *
 * Measured on 0.1.4 before this was fixed: `npm i -g @zensation/mcp` then
 * `zenbrain-mcp`, and `npx -y @zensation/mcp` — the two ways the README tells
 * people to start the server — both exited **0 with an empty stdout and an
 * empty stderr**. Only `node <realpath>` came up. A silent no-op on the
 * documented path is the same failure the Node guard above exists to prevent.
 *
 * So resolve the argv path the way the loader resolved this module, and compare
 * like with like. `pathToFileURL` rather than a `file://${path}` template: the
 * template hands `#`, `?` and `%` to the URL parser as fragment, query and
 * escape introducer instead of as filename characters (measured on Node 22; a
 * space, contrary to what one would guess, comes out the same either way).
 *
 * `resolve` is injectable so the symlink case can be tested without one.
 */
export function isDirectInvocation(
  moduleUrl: string,
  argv1: string | undefined,
  resolve: (path: string) => string = realpathSync,
): boolean {
  if (argv1 === undefined) return false;
  try {
    return moduleUrl === pathToFileURL(resolve(argv1)).href;
  } catch {
    // argv[1] names something unresolvable; that is not a direct invocation.
    return false;
  }
}

if (isDirectInvocation(import.meta.url, process.argv[1])) {
  main().catch((err: unknown) => {
    process.stderr.write(`zenbrain-mcp failed to start: ${String(err)}\n`);
    process.exit(1);
  });
}
