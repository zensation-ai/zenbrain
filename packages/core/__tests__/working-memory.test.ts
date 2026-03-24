import { describe, it, expect, beforeEach } from 'vitest';
import { WorkingMemory } from '../src/layers/working';
import { FakeEmbeddingProvider } from '../src/testing';

describe('WorkingMemory', () => {
  let wm: WorkingMemory;

  beforeEach(() => {
    wm = new WorkingMemory({ maxSlots: 5 });
  });

  it('should add and retrieve slots', async () => {
    await wm.add('fact 1', 'fact');
    await wm.add('goal: write tests', 'goal');
    expect(wm.size).toBe(2);
    expect(wm.getSlots()).toHaveLength(2);
  });

  it('should evict lowest relevance when full', async () => {
    for (let i = 0; i < 6; i++) {
      await wm.add(`item ${i}`, 'fact', i * 0.2);
    }
    expect(wm.size).toBe(5);
    // Lowest relevance (0.0) should be evicted
    const contents = wm.getSlots().map(s => s.content);
    expect(contents).not.toContain('item 0');
  });

  it('should filter by type', async () => {
    await wm.add('fact', 'fact');
    await wm.add('goal', 'goal');
    await wm.add('context', 'context');
    expect(wm.getByType('fact')).toHaveLength(1);
    expect(wm.getByType('goal')).toHaveLength(1);
  });

  it('should boost slot relevance', async () => {
    const slot = await wm.add('important', 'fact', 0.5);
    wm.boost(slot.id, 0.3);
    const found = wm.getSlots().find(s => s.id === slot.id);
    expect(found!.relevance).toBe(0.8);
  });

  it('should cap relevance at 1.0', async () => {
    const slot = await wm.add('important', 'fact', 0.9);
    wm.boost(slot.id, 0.5);
    const found = wm.getSlots().find(s => s.id === slot.id);
    expect(found!.relevance).toBe(1.0);
  });

  it('should decay relevance over time', async () => {
    const slot = await wm.add('decaying', 'fact', 1.0);
    // Manually age the slot
    slot.addedAt = new Date(Date.now() - 60 * 60_000); // 60 minutes ago
    // Replace in the internal array
    const slots = wm.getSlots();
    slots[0].addedAt = slot.addedAt;
    wm.decay();
    // After decay, relevance should be lower (but slot still exists with this decay rate)
  });

  it('should clear all slots', async () => {
    await wm.add('a', 'fact');
    await wm.add('b', 'fact');
    wm.clear();
    expect(wm.size).toBe(0);
  });

  it('should report capacity', async () => {
    await wm.add('a', 'fact');
    const cap = wm.capacity;
    expect(cap.used).toBe(1);
    expect(cap.max).toBe(5);
    expect(cap.available).toBe(4);
  });

  it('should find relevant slots with embedding provider', async () => {
    const wmEmb = new WorkingMemory({
      maxSlots: 10,
      embedding: new FakeEmbeddingProvider(),
    });
    await wmEmb.add('TypeScript is great');
    await wmEmb.add('Python is popular');
    await wmEmb.add('Cooking pasta');
    const results = await wmEmb.findRelevant('programming languages', 2);
    expect(results).toHaveLength(2);
  });

  it('should fallback to all slots without embedding', async () => {
    await wm.add('a', 'fact');
    await wm.add('b', 'fact');
    const results = await wm.findRelevant('anything', 5);
    expect(results).toHaveLength(2);
  });
});
