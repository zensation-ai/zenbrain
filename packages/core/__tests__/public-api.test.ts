/**
 * Public API — no fake storage adapter. `InMemoryStorage` is a test double: it
 * keeps INSERT parameters as col_0, col_1, … and returns no content through the
 * coordinator (measured 2026-10-01: store three facts, recall → 0 results; the
 * same steps with createMemoryAdapter() from @zensation/adapter-sqlite → 3).
 * It stays in src/testing.ts for unit tests but is not exported from the package.
 */
import { describe, it, expect } from 'vitest';
import * as core from '../src/index';

describe('public API', () => {
  it('does not export the InMemoryStorage test double', () => {
    expect(core).not.toHaveProperty('InMemoryStorage');
  });

  it('still exports the coordinator and the stateless test helpers', () => {
    expect(core).toHaveProperty('MemoryCoordinator');
    expect(core).toHaveProperty('FakeEmbeddingProvider');
    expect(core).toHaveProperty('InMemoryCache');
  });
});
