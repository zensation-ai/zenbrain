/**
 * Tests for algorithms/hopfield-stm.
 *
 * Coverage:
 *   - Math invariants: softmax weights sum to 1, single-step convergence
 *     for separated patterns, energy decreases per update.
 *   - Recall correctness: query close to a stored pattern → that pattern
 *     dominates the softmax weights; unit-norm separation gives clean
 *     attractor recall.
 *   - β behaviour: high β → spike on top match (entropy ≈ 0); low β →
 *     uniform weights (entropy ≈ log N).
 *   - Defensive: empty patterns, empty query, bad β, bad maxIterations.
 *   - Multi-iteration convergence on metastable inputs.
 *   - Energy non-increase across recall steps.
 *   - topKHopfieldMatches: cap, minWeight floor.
 *
 * No mocks — pure algorithm.
 *
 * @module tests/unit/algorithms/hopfield-stm
 */

import {
  hopfieldRecall,
  hopfieldUpdate,
  hopfieldEnergy,
  topKHopfieldMatches,
  type HopfieldPattern,
} from '../src/hopfield-stm';

// ===========================================================================
// Helpers
// ===========================================================================

function unitNorm(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n);
  return n === 0 ? v.slice() : v.map((x) => x / n);
}

function makePattern<T>(vector: number[], payload?: T, id?: string): HopfieldPattern<T> {
  return { vector, payload, id };
}

// Three orthogonal unit-norm patterns in 4-d for cleanly-separated tests.
const P1 = makePattern(unitNorm([1, 0, 0, 0]), 'p1');
const P2 = makePattern(unitNorm([0, 1, 0, 0]), 'p2');
const P3 = makePattern(unitNorm([0, 0, 1, 0]), 'p3');
const PATTERNS = [P1, P2, P3];

// ===========================================================================
// hopfieldUpdate (low-level)
// ===========================================================================

describe('hopfieldUpdate', () => {
  it('softmax weights sum to 1', () => {
    const { weights } = hopfieldUpdate([1, 0, 0, 0], PATTERNS, 1.0);
    let s = 0;
    for (const w of weights) s += w;
    expect(s).toBeCloseTo(1, 9);
  });

  it('returns one weight per pattern', () => {
    const { weights, scores } = hopfieldUpdate([1, 0, 0, 0], PATTERNS, 1.0);
    expect(weights.length).toBe(PATTERNS.length);
    expect(scores.length).toBe(PATTERNS.length);
  });

  it('weight on closest pattern dominates', () => {
    const { weights } = hopfieldUpdate([1, 0, 0, 0], PATTERNS, 4.0);
    expect(weights[0]).toBeGreaterThan(weights[1]);
    expect(weights[0]).toBeGreaterThan(weights[2]);
  });

  it('empty patterns → state unchanged + empty weights', () => {
    const r = hopfieldUpdate([1, 2, 3], [], 1.0);
    expect(r.state).toEqual([1, 2, 3]);
    expect(r.weights).toEqual([]);
  });
});

// ===========================================================================
// hopfieldEnergy
// ===========================================================================

describe('hopfieldEnergy', () => {
  it('finite for any non-degenerate state + patterns', () => {
    const e = hopfieldEnergy([1, 0, 0, 0], PATTERNS, 1.0);
    expect(Number.isFinite(e)).toBe(true);
  });

  it('decreases (or stays equal) after one Hopfield update step', () => {
    const start = [0.6, 0.4, 0, 0];
    const e1 = hopfieldEnergy(start, PATTERNS, 1.0);
    const { state: next } = hopfieldUpdate(start, PATTERNS, 1.0);
    const e2 = hopfieldEnergy(next, PATTERNS, 1.0);
    expect(e2).toBeLessThanOrEqual(e1 + 1e-9);
  });

  it('empty patterns → energy = 1/2 ‖ξ‖²', () => {
    const e = hopfieldEnergy([3, 4], [], 1.0);
    expect(e).toBeCloseTo(0.5 * 25, 9);
  });

  it('higher β does not break energy computation (logsumexp stability)', () => {
    const e = hopfieldEnergy([1, 0, 0, 0], PATTERNS, 100.0);
    expect(Number.isFinite(e)).toBe(true);
  });
});

// ===========================================================================
// hopfieldRecall — correctness
// ===========================================================================

describe('hopfieldRecall — correctness', () => {
  it('query identical to a stored pattern recovers it (top match)', () => {
    const r = hopfieldRecall([1, 0, 0, 0], PATTERNS, { beta: 4.0 });
    expect(r.matches[0].pattern.payload).toBe('p1');
    expect(r.matches[0].weight).toBeGreaterThan(0.9);
  });

  it('noisy query converges toward nearest pattern', () => {
    // P1 + small noise on every other axis.
    const noisy = unitNorm([0.95, 0.1, 0.05, 0.05]);
    const r = hopfieldRecall(noisy, PATTERNS, { beta: 4.0 });
    expect(r.matches[0].pattern.payload).toBe('p1');
  });

  it('orthogonal noise → softmax close to uniform at low β', () => {
    const r = hopfieldRecall([0.5, 0.5, 0.5, 0.5], PATTERNS, { beta: 0.01 });
    // All three weights should be near 1/3.
    for (const m of r.matches) {
      expect(m.weight).toBeCloseTo(1 / 3, 1);
    }
  });

  it('high β → spike on top pattern (entropy → 0)', () => {
    const r = hopfieldRecall([1, 0, 0, 0], PATTERNS, { beta: 50.0 });
    expect(r.matches[0].weight).toBeGreaterThan(0.99);
  });

  it('matches sorted by weight descending', () => {
    const r = hopfieldRecall([1, 0, 0, 0], PATTERNS, { beta: 4.0 });
    for (let i = 1; i < r.matches.length; i++) {
      expect(r.matches[i - 1].weight).toBeGreaterThanOrEqual(r.matches[i].weight);
    }
  });

  // `converged` used to be true after any single step, unchecked. At beta 1 the first step
  // moves [1, 0, 0, 0] far towards the average of the patterns, so it has not settled.
  it('a single step that moves the state by more than the tolerance is not converged', () => {
    const r = hopfieldRecall([1, 0, 0, 0], PATTERNS, { beta: 1.0 });
    expect(r.iterations).toBe(1);
    expect(r.converged).toBe(false);
  });

  it('a single step from a fixed point is converged', () => {
    const r = hopfieldRecall([1, 0, 0, 0], PATTERNS, { beta: 60 });
    expect(r.iterations).toBe(1);
    expect(r.converged).toBe(true);
  });

  it('respects maxIterations > 1', () => {
    const r = hopfieldRecall([0.6, 0.4, 0, 0], PATTERNS, { beta: 1.0, maxIterations: 5, convergenceTol: 1e-9 });
    expect(r.iterations).toBeGreaterThanOrEqual(1);
    expect(r.iterations).toBeLessThanOrEqual(5);
  });

  it('returns query unchanged when patterns is empty', () => {
    const q = [1, 2, 3, 4];
    const r = hopfieldRecall(q, [], { beta: 1.0 });
    expect(r.recoveredVector).toEqual(q);
    expect(r.matches).toEqual([]);
    expect(r.converged).toBe(true);
    expect(r.iterations).toBe(0);
  });

  it('payload is propagated into matches', () => {
    const r = hopfieldRecall([1, 0, 0, 0], PATTERNS, { beta: 4.0 });
    const payloads = r.matches.map((m) => m.pattern.payload);
    expect(payloads).toContain('p1');
    expect(payloads).toContain('p2');
    expect(payloads).toContain('p3');
  });
});

// ===========================================================================
// hopfieldRecall — defensive
// ===========================================================================

describe('hopfieldRecall — defensive', () => {
  it('throws on β <= 0', () => {
    expect(() => hopfieldRecall([1, 0, 0, 0], PATTERNS, { beta: 0 })).toThrow(/beta/);
    expect(() => hopfieldRecall([1, 0, 0, 0], PATTERNS, { beta: -1 })).toThrow(/beta/);
  });

  it('throws on β = NaN / Infinity', () => {
    expect(() => hopfieldRecall([1, 0, 0, 0], PATTERNS, { beta: NaN })).toThrow(/beta/);
    expect(() => hopfieldRecall([1, 0, 0, 0], PATTERNS, { beta: Infinity })).toThrow(/beta/);
  });

  it('throws on maxIterations < 1', () => {
    expect(() => hopfieldRecall([1, 0, 0, 0], PATTERNS, { maxIterations: 0 })).toThrow(/maxIterations/);
  });

  it('throws on empty query', () => {
    expect(() => hopfieldRecall([], PATTERNS)).toThrow(/non-empty/);
  });

  it('handles dimension mismatch gracefully (uses min length)', () => {
    // Query is 4-d, but if we add a 5-d pattern, dot uses min(d). Should
    // not crash.
    const longerPattern = makePattern(unitNorm([1, 0, 0, 0, 0.1]));
    const r = hopfieldRecall([1, 0, 0, 0], [longerPattern, P1, P2], { beta: 1.0 });
    expect(r.matches.length).toBe(3);
  });
});

// ===========================================================================
// Energy monotonicity across multi-step recall
// ===========================================================================

describe('hopfieldRecall — energy monotonicity', () => {
  it('energy never increases across recall steps', () => {
    // Mildly correlated patterns to stress multi-step behaviour.
    const correlated = [
      makePattern(unitNorm([1, 0.3, 0.1, 0]), 'a'),
      makePattern(unitNorm([0.3, 1, 0.1, 0]), 'b'),
      makePattern(unitNorm([0.1, 0.1, 1, 0]), 'c'),
    ];
    let state = [0.5, 0.5, 0.3, 0.1];
    let lastEnergy = hopfieldEnergy(state, correlated, 1.0);
    for (let i = 0; i < 5; i++) {
      const { state: next } = hopfieldUpdate(state, correlated, 1.0);
      const e = hopfieldEnergy(next, correlated, 1.0);
      expect(e).toBeLessThanOrEqual(lastEnergy + 1e-9);
      state = next;
      lastEnergy = e;
    }
  });
});

// ===========================================================================
// Capacity sanity check
// ===========================================================================

describe('hopfieldRecall — capacity sanity', () => {
  it('handles 100 stored patterns in 64-d without degradation', () => {
    // Quasi-random unit-norm patterns.
    const patterns: HopfieldPattern<number>[] = [];
    for (let i = 0; i < 100; i++) {
      const v: number[] = [];
      for (let j = 0; j < 64; j++) v.push(Math.sin(i * 7.13 + j * 1.27));
      patterns.push(makePattern(unitNorm(v), i));
    }
    // Query = noisy version of pattern 42.
    const target = patterns[42].vector.slice();
    for (let j = 0; j < target.length; j++) target[j] += 0.05 * Math.cos(j * 3.7);
    const r = hopfieldRecall(unitNorm(target), patterns, { beta: 8.0 });
    expect(r.matches[0].pattern.payload).toBe(42);
  });
});

// ===========================================================================
// topKHopfieldMatches
// ===========================================================================

describe('topKHopfieldMatches', () => {
  it('caps at K', () => {
    const r = hopfieldRecall([1, 0, 0, 0], PATTERNS, { beta: 1.0 });
    const top = topKHopfieldMatches(r, 2);
    expect(top.length).toBe(2);
    expect(top[0].weight).toBeGreaterThanOrEqual(top[1].weight);
  });

  it('K=0 returns []', () => {
    const r = hopfieldRecall([1, 0, 0, 0], PATTERNS);
    expect(topKHopfieldMatches(r, 0)).toEqual([]);
  });

  it('minWeight filters distractors', () => {
    const r = hopfieldRecall([1, 0, 0, 0], PATTERNS, { beta: 50.0 });
    // At β=50, only the top match has near-1 weight; others ~0.
    const top = topKHopfieldMatches(r, 10, 0.5);
    expect(top.length).toBe(1);
    expect(top[0].pattern.payload).toBe('p1');
  });
});
