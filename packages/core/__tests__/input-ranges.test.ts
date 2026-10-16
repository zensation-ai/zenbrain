import { describe, it, expect } from 'vitest';
import { MemoryCoordinator, WorkingMemory } from '../src/index';
import { InMemoryStorage } from '../src/testing';

// Values outside the documented 0-1 ranges used to be stored as they came: a relevance of 42
// outranked every other slot for good, and an emotional weight of 2 or a confidence of NaN
// went into routing and storage unnoticed. They now throw before anything is stored.
describe('input ranges', () => {
  it('WorkingMemory.add rejects a relevance outside 0-1', async () => {
    const wm = new WorkingMemory();
    for (const relevance of [42, -0.1, Number.NaN]) {
      await expect(wm.add('x', 'fact', relevance)).rejects.toThrow(RangeError);
    }
    expect(wm.size).toBe(0);
    await expect(wm.add('x', 'fact', 0)).resolves.toBeDefined();
    await expect(wm.add('y', 'fact', 1)).resolves.toBeDefined();
  });

  it('store() rejects an emotionalWeight or confidence outside 0-1', async () => {
    const memory = new MemoryCoordinator({ storage: new InMemoryStorage() });
    for (const options of [{ emotionalWeight: 2 }, { emotionalWeight: Number.NaN }, { confidence: -0.1 }, { confidence: 1.5 }]) {
      await expect(memory.store('x', options)).rejects.toThrow(RangeError);
    }
    expect((await memory.getHealth()).working.used).toBe(0);
    await expect(memory.store('x', { emotionalWeight: 1, confidence: 0 })).resolves.toBeTypeOf('string');
    await memory.close();
  });
});
