/**
 * Where the store goes, and what the server says when it cannot go there.
 *
 * Measured on 0.1.6 (2026-09-30) with the README's own client config,
 * `"ZENBRAIN_DB": "~/.zenbrain/memory.db"`: started from a writable directory the
 * server created a directory literally named `~` in it; started from `/` it exited
 * with `ENOENT: mkdir '~/.zenbrain'`. An MCP client passes the environment
 * verbatim — nothing expands the tilde unless the server does.
 *
 * Both functions are pure, so the cases run anywhere, without a home directory
 * or a root working directory.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolveStorePath, storeOpenFailureMessage } from '../src/index.js';

const HOME = join('/', 'home', 'someone');

describe('the store path', () => {
  it('expands a leading ~/ to the home directory', () => {
    expect(resolveStorePath('~/.zenbrain/memory.db', HOME)).toBe(join(HOME, '.zenbrain', 'memory.db'));
  });

  it('keeps the documented default when the variable is unset or empty', () => {
    expect(resolveStorePath(undefined, HOME)).toBe('./zenbrain.db');
    expect(resolveStorePath('', HOME)).toBe('./zenbrain.db');
    expect(resolveStorePath('   ', HOME)).toBe('./zenbrain.db');
  });

  it('passes everything else through unchanged', () => {
    for (const v of [':memory:', '/var/data/zenbrain.db', './zenbrain.db', 'data/memory.db', 'a~/b.db', '~user/x.db']) {
      expect(resolveStorePath(v, HOME), v).toBe(v);
    }
  });
});

describe('the message when the store cannot be opened', () => {
  const cause = new Error('unable to open database file');

  it('names the absolute path it tried and the working directory behind it', () => {
    const msg = storeOpenFailureMessage('./zenbrain.db', '/', cause);
    expect(msg).toContain(join('/', 'zenbrain.db'));
    expect(msg).toContain('working directory');
    expect(msg).toContain('unable to open database file');
  });

  it('tells the user what to set, not just what failed', () => {
    expect(storeOpenFailureMessage('./zenbrain.db', '/', cause)).toMatch(/ZENBRAIN_DB .*absolute path/);
  });

  it('does not blame the working directory for an absolute path', () => {
    const msg = storeOpenFailureMessage('/var/data/zenbrain.db', '/', cause);
    expect(msg).toContain('/var/data/zenbrain.db');
    expect(msg).not.toContain('working directory');
  });
});
