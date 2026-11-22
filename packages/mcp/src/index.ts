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
 *                      with the process. The file, and any missing
 *                      directory above it, is created when the first memory
 *                      is stored, not by the start.
 *   ZENBRAIN_CONTEXTS  Comma-separated context domains.
 *                      Default: personal,work,learning,creative
 *
 * Nothing is written to stdout except protocol traffic — stdout *is* the
 * transport. Diagnostics go to stderr.
 */
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { StorageAdapter } from '@zensation/core';
import { createZenBrainServer } from './server.js';
import { DeferredStore, notSqliteReason, precheckApplies, storeCreationProblem } from './store.js';

export { createZenBrainServer } from './server.js';
export type { ZenBrainServerOptions } from './server.js';

/** Lowest Node this package supports, mirroring `engines.node` in package.json. */
const MIN_NODE = { major: 22, minor: 14 } as const;
const MIN_NODE_LABEL = `${MIN_NODE.major}.${MIN_NODE.minor}`;

/**
 * `engines` only makes npm print a warning, and an MCP client shows the user
 * nothing at all. Below the floor the storage adapter's native module loads and
 * then segfaults the moment it is instantiated — exit 139, no stdout, no stderr.
 * From the client's side the server simply never comes up, with nothing to go on.
 *
 * Measured on Node 20 first. On 2026-11-21 the CI job `node-floor` found the same
 * crash on Node 22.0.0, 22.12.0 and 22.13.0, also after `npm rebuild` on that
 * version, and none on 22.14.0, 22.16.0, 22.18.0, 22.20.0 and 22.22.0:
 * better-sqlite3 13 is built against Node-API 10 (`NAPI_VERSION=10` in its
 * binding.gyp), which Node 22 has from 22.14.0 on. The floor was `>=22` until then.
 *
 * So check before anything native is reachable, and say what is wrong.
 */
export function unsupportedNodeMessage(version: string): string | null {
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number);
  const supported =
    Number.isFinite(major) &&
    Number.isFinite(minor) &&
    (major > MIN_NODE.major || (major === MIN_NODE.major && minor >= MIN_NODE.minor));
  if (supported) return null;

  return (
    `zenbrain-mcp needs Node ${MIN_NODE_LABEL} or newer — this is Node ${version}.\n` +
    `Its SQLite storage uses better-sqlite3, whose native module crashes on older\n` +
    `runtimes instead of failing cleanly. Upgrade Node, or point your MCP client at a\n` +
    `Node ${MIN_NODE_LABEL}+ binary:\n\n` +
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
  // `"ZENBRAIN_DB": "${user_config.db_path}"` in the Claude Code plugin is filled in by
  // Claude Code, but Anthropic's directory warns that user-config values are not supported
  // on every platform. A host that does not fill it would hand over the literal
  // `${user_config.db_path}`, and the store would land in a file of that name in the
  // working directory. A value that is nothing but such a placeholder therefore means
  // the plugin's documented default, the file the README's `claude mcp add` line uses.
  if (value !== undefined && isUnresolvedPlaceholder(value)) return join(home, '.zenbrain', 'memory.db');
  // Trimmed once, here, so that every later step sees the same path. better-sqlite3
  // trims the name it is given; a check for the file on the untrimmed value would
  // look somewhere else. A trailing space or a `\r` from a CRLF file then hid an
  // existing store until the first store (found by review of the 0.3.2 draft).
  const trimmed = value?.trim() ?? '';
  const raw = trimmed === '' ? DEFAULT_STORE : trimmed;
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return join(home, raw.slice(2));
  return raw;
}

/** True for a value that is only an unfilled `${...}` placeholder, such as `${user_config.db_path}`. */
export function isUnresolvedPlaceholder(value: string): boolean {
  return /^\$\{[^}]*\}$/.test(value.trim());
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
  // The hint about permissions only where the cause is one: for "file is not a
  // database" or "database is locked" it would send the user the wrong way.
  const permissions = /EACCES|EPERM|EROFS|permission denied|read-only|readonly|unable to open database file|cannot create files/i.test(String(cause));
  return (
    `zenbrain-mcp could not open its store at ${where}: ${String(cause)}\n` +
    (absolute
      ? permissions
        ? `Check that this user can write to that directory (missing directories are created).\n`
        : ''
      : `That path is relative to the working directory your MCP client started the server in (${cwd}).\n` +
        `Set ZENBRAIN_DB to an absolute path or one starting with ~/, for example "~/.zenbrain/memory.db".\n`)
  );
}

async function main(): Promise<void> {
  assertSupportedNode();

  // Imported here, not at module scope: a static import is hoisted above the
  // check and would load the native module before we get to say anything.
  const { MemoryCoordinator } = await import('@zensation/core');
  const { SqliteAdapter } = await import('@zensation/adapter-sqlite');

  const filename = resolveStorePath(process.env.ZENBRAIN_DB);
  if (process.env.ZENBRAIN_DB !== undefined && isUnresolvedPlaceholder(process.env.ZENBRAIN_DB)) {
    process.stderr.write(
      `zenbrain-mcp: ZENBRAIN_DB arrived as the unfilled placeholder ${process.env.ZENBRAIN_DB.trim()}; ` +
        `using ${filename} instead.\n`,
    );
  }
  const contexts = process.env.ZENBRAIN_CONTEXTS?.split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  // Rollback journal, not WAL: in WAL mode the first read after opening (or after
  // a write) writes SQLite's read mark into `<store>-shm`, so the tools annotated
  // `readOnlyHint: true` changed a file without changing a row (measured on 0.3.1).
  // A store file that is already in WAL mode keeps it: switching it back would
  // itself be a write, and SQLite cannot do it while another server has it open.
  const openFile = () => new SqliteAdapter({ filename, walMode: false });

  let storage: StorageAdapter;
  if (filename === ':memory:') {
    storage = new SqliteAdapter({ filename, walMode: false });
  } else {
    // Nothing is created before the first memory is stored (see ./store.ts), so check now,
    // without creating anything, that it could be created — unless the check would read the
    // path differently from SQLite (see precheckApplies).
    const problem = existsSync(filename) || !precheckApplies(filename) ? null : storeCreationProblem(filename);
    if (problem !== null) {
      process.stderr.write(storeOpenFailureMessage(filename, process.cwd(), problem));
      process.exit(1);
    }
    try {
      storage = new DeferredStore({
        filename,
        openFile: () => {
          try {
            const notSqlite = notSqliteReason(filename);
            if (notSqlite !== null) throw new Error(notSqlite);
            return openFile();
          } catch (err) {
            const message = storeOpenFailureMessage(filename, process.cwd(), err);
            process.stderr.write(message);
            throw new Error(message);
          }
        },
        openEmpty: () => new SqliteAdapter({ filename: ':memory:', walMode: false }),
      });
    } catch {
      // An existing file is opened at start; openFile has said why it failed.
      process.exit(1);
    }
  }
  const coordinator = new MemoryCoordinator({
    storage,
    ...(contexts && contexts.length > 0 ? { contexts } : {}),
  });

  // A store file that exists but cannot be opened must not look like an empty
  // memory, so every tool checks it before it runs. Since core 0.7.0 recall throws a
  // storage error itself; before, its recall paths caught it and answered from nothing.
  const server = createZenBrainServer(
    coordinator,
    storage instanceof DeferredStore ? { checkStorage: () => (storage as DeferredStore).ensureReadable() } : {},
  );

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
  // A path with a `..` part is named as given: resolving it as text could name a place
  // the system does not mean (see precheckApplies).
  const where = filename === ':memory:' || !precheckApplies(filename) ? filename : resolvePath(filename);
  const pending = storage instanceof DeferredStore && !storage.fileOpen ? ' (created when the first memory is stored)' : '';
  process.stderr.write(`zenbrain-mcp ready — store: ${where}${pending}\n`);
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
