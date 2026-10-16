import { describe, it, expect } from 'vitest';
import { MemoryCoordinator } from '../src/index';
import { InMemoryStorage } from '../src/testing';

// The MCP server runs the coordinator without an embedding provider, stores every
// memory into working memory at relevance 1.0 and never decays between stores.
describe('MemoryCoordinator working memory', () => {
  it('keeps the most recent stores once working memory is full', async () => {
    const coordinator = new MemoryCoordinator({ storage: new InMemoryStorage() });
    for (let i = 1; i <= 9; i++) {
      await coordinator.store(`note number ${i}`, { type: 'fact' });
    }

    const health = await coordinator.getHealth();
    expect(health.working).toEqual({ used: 7, max: 7 });

    const recalled = await coordinator.recall('note', { layers: ['working'], limit: 10 });
    const contents = recalled.map(r => r.content);
    expect(contents).toContain('note number 9');
    expect(contents).not.toContain('note number 1');

    await coordinator.close();
  });
});
