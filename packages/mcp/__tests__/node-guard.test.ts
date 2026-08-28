/**
 * The runtime guard on the bin entry.
 *
 * Measured before it existed: on Node 20 the binary exits **139 (SIGSEGV) with
 * an empty stdout and an empty stderr** — better-sqlite3's native module loads
 * and then crashes the process the moment `new SqliteAdapter()` runs. `engines`
 * only makes npm print a warning, and an MCP client surfaces none of that, so
 * the server just never comes up and the user has nothing to go on.
 *
 * The check is a pure function over a version string so it can be tested on any
 * runtime, rather than only on the one where the crash happens.
 */
import { describe, it, expect } from 'vitest';
import { unsupportedNodeMessage } from '../src/index.js';

describe('the Node version guard', () => {
  it('passes every supported runtime', () => {
    for (const v of ['v22.0.0', 'v22.11.0', 'v24.3.1', 'v26.0.0', 'v30.1.2', '22.11.0']) {
      expect(unsupportedNodeMessage(v), `${v} should be accepted`).toBeNull();
    }
  });

  it('rejects every runtime below the engines floor', () => {
    for (const v of ['v18.20.4', 'v20.20.2', 'v21.7.3', '20.0.0']) {
      expect(unsupportedNodeMessage(v), `${v} should be rejected`).not.toBeNull();
    }
  });

  it('names the runtime it found and the one it needs', () => {
    const msg = unsupportedNodeMessage('v20.20.2');
    expect(msg).toContain('v20.20.2');
    expect(msg).toContain('Node 22 or newer');
  });

  it('tells the user what to do, not just what is wrong', () => {
    const msg = unsupportedNodeMessage('v20.20.2')!;
    expect(msg).toMatch(/command/);
    expect(msg).toMatch(/dist\/index\.js/);
  });

  it('rejects a version string it cannot parse rather than waving it through', () => {
    for (const v of ['', 'not-a-version', 'vNaN']) {
      expect(unsupportedNodeMessage(v), `${v} should not be treated as supported`).not.toBeNull();
    }
  });
});
