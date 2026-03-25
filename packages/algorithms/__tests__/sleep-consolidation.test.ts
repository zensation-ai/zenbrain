import { describe, it, expect } from 'vitest';
import {
  selectForReplay,
  simulateReplay,
  pruneWeakConnections,
  SLEEP_CONSOLIDATION_CONFIG,
  type MemoryForConsolidation,
} from '../src/sleep-consolidation';

function createMemory(overrides: Partial<MemoryForConsolidation> = {}): MemoryForConsolidation {
  return {
    id: overrides.id ?? 'mem-1',
    content: overrides.content ?? 'Test memory',
    accessCount: overrides.accessCount ?? 5,
    emotionalWeight: overrides.emotionalWeight ?? 0.3,
    lastAccessed: overrides.lastAccessed ?? new Date(),
    stability: overrides.stability ?? 7,
    hebbianEdges: overrides.hebbianEdges,
  };
}

describe('selectForReplay', () => {
  it('returns empty array for empty input', () => {
    expect(selectForReplay([])).toEqual([]);
  });

  it('returns single memory when only one provided', () => {
    const mem = createMemory();
    const result = selectForReplay([mem]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('mem-1');
  });

  it('prioritizes emotional memories', () => {
    const neutral = createMemory({ id: 'neutral', emotionalWeight: 0.1, accessCount: 1 });
    const emotional = createMemory({ id: 'emotional', emotionalWeight: 0.9, accessCount: 1 });
    const result = selectForReplay([neutral, emotional]);
    expect(result[0].id).toBe('emotional');
  });

  it('prioritizes frequently accessed memories', () => {
    const rare = createMemory({ id: 'rare', accessCount: 1, emotionalWeight: 0 });
    const frequent = createMemory({ id: 'frequent', accessCount: 100, emotionalWeight: 0 });
    const result = selectForReplay([rare, frequent]);
    expect(result[0].id).toBe('frequent');
  });

  it('prioritizes recent memories over old ones', () => {
    const old = createMemory({ id: 'old', lastAccessed: new Date(Date.now() - 30 * 86400000), emotionalWeight: 0, accessCount: 1 });
    const recent = createMemory({ id: 'recent', lastAccessed: new Date(), emotionalWeight: 0, accessCount: 1 });
    const result = selectForReplay([old, recent]);
    expect(result[0].id).toBe('recent');
  });

  it('respects maxReplaysPerCycle', () => {
    const memories = Array.from({ length: 30 }, (_, i) => createMemory({ id: `mem-${i}` }));
    const result = selectForReplay(memories, { maxReplaysPerCycle: 5 });
    expect(result).toHaveLength(5);
  });

  it('prioritizes unstable memories', () => {
    const stable = createMemory({ id: 'stable', stability: 300, emotionalWeight: 0, accessCount: 1 });
    const unstable = createMemory({ id: 'unstable', stability: 0.5, emotionalWeight: 0, accessCount: 1 });
    const result = selectForReplay([stable, unstable]);
    expect(result[0].id).toBe('unstable');
  });
});

describe('simulateReplay', () => {
  it('returns empty result for empty input', () => {
    const result = simulateReplay([]);
    expect(result.replayed).toHaveLength(0);
    expect(result.summary.totalReplayed).toBe(0);
    expect(result.summary.avgStabilityIncrease).toBe(0);
  });

  it('boosts stability by replay multiplier', () => {
    const mem = createMemory({ stability: 10 });
    const result = simulateReplay([mem]);
    expect(result.replayed[0].stabilityBefore).toBe(10);
    expect(result.replayed[0].stabilityAfter).toBe(15); // 10 * 1.5
  });

  it('applies emotional bonus for high-emotion memories', () => {
    const mem = createMemory({ stability: 10, emotionalWeight: 0.8 });
    const result = simulateReplay([mem]);
    expect(result.replayed[0].emotionalBoost).toBe(true);
    expect(result.replayed[0].stabilityAfter).toBe(18); // 10 * 1.5 * 1.2
  });

  it('does not apply emotional bonus for low-emotion memories', () => {
    const mem = createMemory({ stability: 10, emotionalWeight: 0.2 });
    const result = simulateReplay([mem]);
    expect(result.replayed[0].emotionalBoost).toBe(false);
    expect(result.replayed[0].stabilityAfter).toBe(15); // 10 * 1.5
  });

  it('caps stability at MAX_STABILITY (365)', () => {
    const mem = createMemory({ stability: 300 });
    const result = simulateReplay([mem]);
    expect(result.replayed[0].stabilityAfter).toBe(365);
  });

  it('strengthens Hebbian edges above threshold', () => {
    const mem = createMemory({
      hebbianEdges: [{ targetId: 'target-1', weight: 0.5 }],
    });
    const result = simulateReplay([mem]);
    expect(result.strengthened).toHaveLength(1);
    expect(result.strengthened[0].weightAfter).toBeCloseTo(0.55, 2); // 0.5 * 1.1
  });

  it('prunes weak Hebbian edges', () => {
    const mem = createMemory({
      hebbianEdges: [{ targetId: 'weak', weight: 0.1 }],
    });
    const result = simulateReplay([mem]);
    expect(result.pruned).toHaveLength(1);
    expect(result.pruned[0].targetId).toBe('weak');
  });

  it('caps edge weight at MAX_EDGE_WEIGHT', () => {
    const mem = createMemory({
      hebbianEdges: [{ targetId: 'strong', weight: 9.8 }],
    });
    const result = simulateReplay([mem]);
    expect(result.strengthened[0].weightAfter).toBe(10.0);
  });

  it('respects custom replay multiplier', () => {
    const mem = createMemory({ stability: 10 });
    const result = simulateReplay([mem], { replayStrengthMultiplier: 2.0 });
    expect(result.replayed[0].stabilityAfter).toBe(20); // 10 * 2.0
  });

  it('calculates correct average stability increase', () => {
    const memories = [
      createMemory({ id: 'a', stability: 10 }),
      createMemory({ id: 'b', stability: 20 }),
    ];
    const result = simulateReplay(memories);
    // a: 10 -> 15 (increase 5), b: 20 -> 30 (increase 10), avg = 7.5
    expect(result.summary.avgStabilityIncrease).toBe(7.5);
  });
});

describe('pruneWeakConnections', () => {
  it('keeps edges above threshold', () => {
    const edges = [
      { sourceId: 'a', targetId: 'b', weight: 0.5 },
      { sourceId: 'a', targetId: 'c', weight: 0.8 },
    ];
    const { kept, pruned } = pruneWeakConnections(edges);
    expect(kept).toHaveLength(2);
    expect(pruned).toHaveLength(0);
  });

  it('prunes edges below threshold', () => {
    const edges = [
      { sourceId: 'a', targetId: 'b', weight: 0.1 },
      { sourceId: 'a', targetId: 'c', weight: 0.05 },
    ];
    const { kept, pruned } = pruneWeakConnections(edges);
    expect(kept).toHaveLength(0);
    expect(pruned).toHaveLength(2);
  });

  it('handles mixed edges', () => {
    const edges = [
      { sourceId: 'a', targetId: 'b', weight: 0.5 },
      { sourceId: 'a', targetId: 'c', weight: 0.1 },
    ];
    const { kept, pruned } = pruneWeakConnections(edges);
    expect(kept).toHaveLength(1);
    expect(pruned).toHaveLength(1);
    expect(kept[0].targetId).toBe('b');
    expect(pruned[0].targetId).toBe('c');
  });

  it('handles empty input', () => {
    const { kept, pruned } = pruneWeakConnections([]);
    expect(kept).toHaveLength(0);
    expect(pruned).toHaveLength(0);
  });

  it('respects custom threshold', () => {
    const edges = [{ sourceId: 'a', targetId: 'b', weight: 0.3 }];
    const low = pruneWeakConnections(edges, 0.1);
    const high = pruneWeakConnections(edges, 0.5);
    expect(low.kept).toHaveLength(1);
    expect(high.pruned).toHaveLength(1);
  });
});
