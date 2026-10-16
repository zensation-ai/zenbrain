import { describe, it, expect, afterEach, vi } from 'vitest';
import { WorkingMemory } from '../src/layers/working';
import { ShortTermMemory } from '../src/layers/short-term';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Ids come from crypto.randomUUID, never from Math.random (CodeQL js/insecure-randomness,
// zenbrain alert #5). Making Math.random throw proves no code path still reaches it.
describe('generated ids', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('working-memory slots and sessions get random UUIDs without Math.random', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random used for an id');
    });

    const slot = await new WorkingMemory().add('x');
    const session = new ShortTermMemory().startSession();

    expect(slot.id).toMatch(UUID);
    expect(session).toMatch(UUID);
  });
});
