/**
 * Hebbian Edge Dynamics — Pure Function Tests
 */
import { describe, it, expect } from 'vitest';
import {
  HEBBIAN_CONFIG,
  computeHebbianStrengthening,
  computeHebbianDecay,
  computeHomeostaticNormalization,
  generatePairs,
} from '../src/hebbian';

describe('HEBBIAN_CONFIG', () => {
  it('exports expected constants', () => {
    expect(HEBBIAN_CONFIG.LEARNING_RATE).toBe(0.1);
    expect(HEBBIAN_CONFIG.MAX_WEIGHT).toBe(10.0);
    expect(HEBBIAN_CONFIG.DECAY_RATE).toBe(0.02);
    expect(HEBBIAN_CONFIG.MIN_WEIGHT).toBe(0.1);
    expect(HEBBIAN_CONFIG.TARGET_SUM).toBe(50.0);
    expect(HEBBIAN_CONFIG.NEUTRAL_WEIGHT).toBe(1.0);
  });
});

describe('computeHebbianStrengthening', () => {
  it('strengthens from neutral', () => {
    // 1.0 + 0.1 * (1 - 1/10) = 1.09
    expect(computeHebbianStrengthening(1.0)).toBeCloseTo(1.09, 5);
  });

  it('shows diminishing returns near MAX', () => {
    const nearMax = computeHebbianStrengthening(9.5) - 9.5;
    const fromNeutral = computeHebbianStrengthening(1.0) - 1.0;
    expect(nearMax).toBeLessThan(fromNeutral);
  });

  it('never exceeds MAX_WEIGHT', () => {
    expect(computeHebbianStrengthening(HEBBIAN_CONFIG.MAX_WEIGHT)).toBeLessThanOrEqual(HEBBIAN_CONFIG.MAX_WEIGHT);
  });

  it('growth is always non-negative', () => {
    for (const w of [0.1, 1.0, 5.0, 9.9, 10.0]) {
      expect(computeHebbianStrengthening(w)).toBeGreaterThanOrEqual(w);
    }
  });
});

describe('computeHebbianDecay', () => {
  it('reduces weight by decay rate', () => {
    // 5.0 * 0.98 = 4.9
    expect(computeHebbianDecay(5.0)).toBeCloseTo(4.9, 5);
  });

  it('returns 0 (pruning signal) below MIN_WEIGHT', () => {
    expect(computeHebbianDecay(0.05)).toBe(0);
  });

  it('prunes at MIN_WEIGHT boundary', () => {
    expect(computeHebbianDecay(HEBBIAN_CONFIG.MIN_WEIGHT)).toBe(0);
  });

  it('does not prune safely above MIN_WEIGHT', () => {
    expect(computeHebbianDecay(2.0)).toBeGreaterThan(0);
    expect(computeHebbianDecay(2.0)).toBeCloseTo(1.96, 5);
  });
});

describe('computeHomeostaticNormalization', () => {
  it('scales weights to targetSum', () => {
    const result = computeHomeostaticNormalization([1, 2, 3, 4], 50);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(50, 5);
  });

  it('preserves proportions', () => {
    const result = computeHomeostaticNormalization([1, 2, 4], 70);
    expect(result[1] / result[0]).toBeCloseTo(2, 5);
    expect(result[2] / result[0]).toBeCloseTo(4, 5);
  });

  it('handles empty array', () => {
    expect(computeHomeostaticNormalization([], 50)).toEqual([]);
  });

  it('handles zero-sum gracefully', () => {
    const result = computeHomeostaticNormalization([0, 0, 0], 50);
    expect(result).toHaveLength(3);
    result.forEach(w => expect(isFinite(w)).toBe(true));
  });
});

describe('generatePairs', () => {
  it('generates C(3,2)=3 pairs', () => {
    expect(generatePairs(['a', 'b', 'c'])).toEqual([['a', 'b'], ['a', 'c'], ['b', 'c']]);
  });

  it('generates C(4,2)=6 pairs', () => {
    expect(generatePairs(['a', 'b', 'c', 'd'])).toHaveLength(6);
  });

  it('returns empty for < 2 items', () => {
    expect(generatePairs(['a'])).toEqual([]);
    expect(generatePairs([])).toEqual([]);
  });
});
