/**
 * The guard that decides whether the bin entry actually starts the server.
 *
 * Measured on 0.1.4: `npm i -g @zensation/mcp` then `zenbrain-mcp`, and
 * `npx -y @zensation/mcp` — the two ways the README tells people to start the
 * server — both exited **0 with an empty stdout and an empty stderr**. `main()`
 * was never reached, because npm installs every `bin` as a symlink and the guard
 * compared `import.meta.url` (symlinks resolved) against `process.argv[1]`
 * (symlink path as spelled). Only `node <realpath>` came up.
 *
 * Two levels on purpose. The unit tests pin the comparison rule and are cheap.
 * They are not enough: a pure-function test passes just as happily while the
 * installed binary stays dead, which is exactly how this shipped. So the last
 * test spawns the built entry point **through a real symlink** — the arrangement
 * npm creates — and requires an answer on the wire.
 */
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDirectInvocation } from '../src/index.js';

const hier = dirname(fileURLToPath(import.meta.url));
const gebauteDatei = join(hier, '..', 'dist', 'index.js');

describe('the entry guard', () => {
  it('recognises a plain direct run, where no symlink is involved', () => {
    const pfad = '/pkg/dist/index.js';
    expect(isDirectInvocation(pathToFileURL(pfad).href, pfad, (p) => p)).toBe(true);
  });

  it('recognises the npm bin symlink — the case that shipped broken', () => {
    const echt = '/usr/local/lib/node_modules/@zensation/mcp/dist/index.js';
    const link = '/usr/local/bin/zenbrain-mcp';
    expect(
      isDirectInvocation(pathToFileURL(echt).href, link, (p) => (p === link ? echt : p)),
    ).toBe(true);
  });

  it('still says no when the module was imported rather than run', () => {
    const anderes = '/pkg/dist/some-other-entry.js';
    expect(
      isDirectInvocation(pathToFileURL('/pkg/dist/index.js').href, anderes, (p) => p),
    ).toBe(false);
  });

  it('says no instead of throwing when argv[1] is absent or unresolvable', () => {
    const url = pathToFileURL('/pkg/dist/index.js').href;
    expect(isDirectInvocation(url, undefined)).toBe(false);
    expect(
      isDirectInvocation(url, '/nope', () => {
        throw new Error('ENOENT');
      }),
    ).toBe(false);
  });

  it('handles paths a `file://${path}` template would misread', () => {
    // Measured on Node 22: a space comes out the same either way, but `#`, `?`
    // and `%` do not — the template hands them to the URL parser as fragment,
    // query and escape introducer instead of as filename characters.
    for (const pfad of ['/pkg/a#b/dist/index.js', '/pkg/a?b/dist/index.js', '/pkg/a%b/dist/index.js']) {
      expect(isDirectInvocation(pathToFileURL(pfad).href, pfad, (p) => p), pfad).toBe(true);
      expect(new URL(`file://${pfad}`).href, pfad).not.toBe(pathToFileURL(pfad).href);
    }
  });

  it('answers MCP when started through a symlink, the way npm installs it', async () => {
    expect(
      existsSync(gebauteDatei),
      `${gebauteDatei} is missing — run \`npm run build\` in packages/mcp first. ` +
        'This test deliberately does not skip: it is the only one that exercises the ' +
        'path that shipped broken.',
    ).toBe(true);

    const verzeichnis = mkdtempSync(join(tmpdir(), 'zenbrain-bin-'));
    const link = join(verzeichnis, 'zenbrain-mcp');
    symlinkSync(gebauteDatei, link);

    const antwort = await new Promise<string>((loese, scheitere) => {
      const kind = spawn(process.execPath, [link], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ZENBRAIN_DB: ':memory:' },
      });
      let aus = '';
      let fehler = '';
      const uhr = setTimeout(() => {
        kind.kill();
        scheitere(
          new Error(
            `no MCP response within 15s. stdout=${JSON.stringify(aus)} ` +
              `stderr=${JSON.stringify(fehler)}`,
          ),
        );
      }, 15_000);

      kind.stdout.on('data', (d) => {
        aus += String(d);
        for (const zeile of aus.split('\n')) {
          if (!zeile.trim().startsWith('{')) continue;
          try {
            const nachricht = JSON.parse(zeile);
            if (nachricht.id === 1 && nachricht.result) {
              clearTimeout(uhr);
              kind.kill();
              loese(zeile);
            }
          } catch {
            // a partial line; wait for the rest
          }
        }
      });
      kind.stderr.on('data', (d) => (fehler += String(d)));
      kind.on('error', scheitere);

      kind.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'entry-guard-test', version: '1.0.0' },
          },
        }) + '\n',
      );
    });

    const ergebnis = JSON.parse(antwort).result;
    expect(ergebnis.serverInfo).toBeDefined();
    expect(ergebnis.capabilities).toBeDefined();
  }, 20_000);
});
