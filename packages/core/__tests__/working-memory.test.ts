import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    // getSlots() copies the array, not the slots: aging this object ages the stored slot.
    slot.addedAt = new Date(Date.now() - 60 * 60_000); // 60 minutes ago
    wm.decay();
    // Default rate 0.05 per minute: e^(-3) ≈ 0.0498, still above the 0.01 floor.
    expect(wm.getSlots()[0].relevance).toBeCloseTo(Math.exp(-3), 3);
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

describe('WorkingMemory eviction', () => {
  it('keeps the newest slot when every slot is equally relevant', async () => {
    // Every store adds its content at relevance 1.0, so a full working memory
    // with no decay in between is all ties. Up to 0.5.1 the stable sort left the
    // new slot last and pop() evicted it at once: memory kept its first seven.
    const wm = new WorkingMemory({ maxSlots: 3 });
    for (const c of ['a', 'b', 'c', 'd', 'e']) await wm.add(c, 'fact', 1.0);
    expect(wm.getSlots().map(s => s.content)).toEqual(['c', 'd', 'e']);
  });

  it('evicts the oldest of the least relevant slots', async () => {
    const wm = new WorkingMemory({ maxSlots: 3 });
    await wm.add('a', 'fact', 0.5);
    await wm.add('b', 'fact', 1.0);
    await wm.add('c', 'fact', 0.5);
    await wm.add('d', 'fact', 1.0);
    expect(wm.getSlots().map(s => s.content)).toEqual(['b', 'c', 'd']);
  });

  it('evicts a new slot that is less relevant than every slot it would join', async () => {
    const wm = new WorkingMemory({ maxSlots: 2 });
    await wm.add('a', 'fact', 1.0);
    await wm.add('b', 'fact', 1.0);
    await wm.add('weak', 'fact', 0.1);
    expect(wm.getSlots().map(s => s.content)).toEqual(['a', 'b']);
  });
});

describe('WorkingMemory decay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not decay a slot twice for the same minutes', async () => {
    // Up to 0.5.1 each call multiplied by e^(-rate * total age), so a slot's
    // lifetime depended on how often consolidate() ran: 0.61, 0.37, 0.22 for one,
    // two, three calls at the same age of ten minutes.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
    const wm = new WorkingMemory({ decayRate: 0.05 });
    await wm.add('x', 'fact', 1.0);
    vi.setSystemTime(new Date('2026-10-16T08:10:00Z'));
    wm.decay();
    wm.decay();
    wm.decay();
    expect(wm.getSlots()[0].relevance).toBeCloseTo(Math.exp(-0.5), 6);
  });

  it('decays over two intervals as much as over one of the same total length', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
    const wm = new WorkingMemory({ decayRate: 0.05 });
    await wm.add('x', 'fact', 1.0);
    vi.setSystemTime(new Date('2026-10-16T08:04:00Z'));
    wm.decay();
    vi.setSystemTime(new Date('2026-10-16T08:10:00Z'));
    wm.decay();
    expect(wm.getSlots()[0].relevance).toBeCloseTo(Math.exp(-0.5), 6);
  });

  it('removes a slot once its relevance drops to 0.01 or below', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
    const wm = new WorkingMemory({ decayRate: 0.05 });
    await wm.add('old', 'fact', 1.0);
    vi.setSystemTime(new Date('2026-10-16T09:30:00Z')); // 90 min: e^-4.5 ≈ 0.011
    await wm.add('new', 'fact', 1.0);
    wm.decay();
    expect(wm.getSlots().map(s => s.content)).toEqual(['old', 'new']);
    vi.setSystemTime(new Date('2026-10-16T09:33:00Z')); // 93 min: e^-4.65 ≈ 0.0096
    wm.decay();
    expect(wm.getSlots().map(s => s.content)).toEqual(['new']);
  });

  it('decays a boosted slot from its boosted relevance onwards', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
    const wm = new WorkingMemory({ decayRate: 0.05 });
    const slot = await wm.add('x', 'fact', 1.0);
    vi.setSystemTime(new Date('2026-10-16T08:10:00Z'));
    wm.decay(); // e^-0.5 ≈ 0.607
    wm.boost(slot.id, 0.2); // ≈ 0.807
    vi.setSystemTime(new Date('2026-10-16T08:20:00Z'));
    wm.decay(); // only the ten minutes since the last decay count
    expect(wm.getSlots()[0].relevance).toBeCloseTo((Math.exp(-0.5) + 0.2) * Math.exp(-0.5), 6);
  });
});

describe('WorkingMemory without an embedding provider', () => {
  it('returns the most relevant slots first, newest first among equals', async () => {
    const wm = new WorkingMemory({ maxSlots: 5 });
    await wm.add('a', 'fact', 0.5);
    await wm.add('b', 'fact', 1.0);
    await wm.add('c', 'fact', 1.0);
    await wm.add('d', 'fact', 0.2);
    const results = await wm.findRelevant('anything', 3);
    expect(results.map(s => s.content)).toEqual(['c', 'b', 'a']);
  });
});
