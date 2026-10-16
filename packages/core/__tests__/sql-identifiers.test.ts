import { describe, it, expect } from 'vitest';
import { EpisodicMemory } from '../src/layers/episodic';
import { SemanticMemory } from '../src/layers/semantic';
import { ProceduralMemory } from '../src/layers/procedural';
import { CoreMemory } from '../src/layers/core';
import { CrossContextMemory } from '../src/layers/cross-context';
import { InMemoryStorage } from '../src/testing';

// Values always go through $1 placeholders, but table names were interpolated as given:
// from each layer's `tableName` config and from two public method parameters of
// CrossContextMemory. SECURITY.md promises "never string concatenation"; an identifier
// is now checked before it reaches SQL.
const HOSTILE = 'episodic_memories; DROP TABLE learned_facts; --';

describe('SQL identifiers', () => {
  const storage = new InMemoryStorage();

  it.each([
    ['EpisodicMemory', () => new EpisodicMemory({ storage, tableName: HOSTILE })],
    ['SemanticMemory', () => new SemanticMemory({ storage, tableName: HOSTILE })],
    ['ProceduralMemory', () => new ProceduralMemory({ storage, tableName: HOSTILE })],
    ['CoreMemory', () => new CoreMemory({ storage, tableName: HOSTILE })],
  ])('%s rejects a table name that is not a plain identifier', (_name, make) => {
    expect(make).toThrow(/not a valid SQL identifier/);
  });

  it('accepts plain and schema-qualified table names', () => {
    expect(() => new EpisodicMemory({ storage, tableName: 'my_episodes' })).not.toThrow();
    expect(() => new SemanticMemory({ storage, tableName: 'personal.learned_facts' })).not.toThrow();
  });

  it('CrossContextMemory rejects hostile table names in its public methods', async () => {
    const cc = new CrossContextMemory({ storage, contexts: ['personal', 'work'] });
    await expect(cc.detectMergeCandidates(HOSTILE)).rejects.toThrow(/not a valid SQL identifier/);
    await expect(cc.createLink('a', 'b', HOSTILE)).rejects.toThrow(/not a valid SQL identifier/);
  });
});
