/**
 * Tests for Titans surprise-gradient memory updates (Phase H6.3).
 *
 * Verifies:
 *   - computeVFEContribution: sign + magnitude follow inputs.
 *   - updateVFEDelta: EMA math correct, magnitude clamps respected.
 *   - batchUpdateVFEDeltas: order-preserving, length-mismatch throws.
 *   - applyVFERetrievalBoost: + delta lifts, − delta reduces, score ≥ 0.
 *   - applyVFEIntervalShrink: |delta|-based, floor respected.
 *   - defensive: NaN / negative / out-of-range inputs don't poison
 *     the running estimate.
 *   - determinism: same inputs → same outputs.
 */

import {
  computeVFEContribution,
  updateVFEDelta,
  batchUpdateVFEDeltas,
  applyVFERetrievalBoost,
  applyVFEIntervalShrink,
} from '../src/surprise-gradient-memory';

describe('computeVFEContribution', () => {
  it('zero predictionError → 0 contribution', () => {
    expect(computeVFEContribution({ predictionError: 0 })).toBe(0);
  });

  it('1.0 error × 1.0 confidence → magnitude 1.0', () => {
    expect(
      computeVFEContribution({ predictionError: 1.0, confidence: 1.0 }),
    ).toBe(1.0);
  });

  it('default sign is +1 (positive surprise)', () => {
    expect(
      computeVFEContribution({ predictionError: 0.5 }),
    ).toBe(0.5);
  });

  it('signHint=-1 produces negative contribution', () => {
    expect(
      computeVFEContribution({ predictionError: 0.5, signHint: -1 }),
    ).toBe(-0.5);
  });

  it('signHint=0 zeroes out the contribution', () => {
    expect(
      computeVFEContribution({ predictionError: 0.5, signHint: 0 }),
    ).toBe(0);
  });

  it('confidence < 1 scales the contribution', () => {
    expect(
      computeVFEContribution({ predictionError: 1.0, confidence: 0.4 }),
    ).toBe(0.4);
  });

  it('predictionError above errorScale saturates at 1.0', () => {
    expect(
      computeVFEContribution({ predictionError: 5 }, { errorScale: 1 }),
    ).toBe(1.0);
  });

  it('errorScale=2 halves the normalised error', () => {
    expect(
      computeVFEContribution({ predictionError: 1 }, { errorScale: 2 }),
    ).toBe(0.5);
  });

  it('NaN predictionError treated as 0', () => {
    expect(
      computeVFEContribution({ predictionError: NaN }),
    ).toBe(0);
  });

  it('negative predictionError clamps to 0', () => {
    expect(
      computeVFEContribution({ predictionError: -3 }),
    ).toBe(0);
  });

  it('confidence > 1 clamps to 1', () => {
    expect(
      computeVFEContribution({ predictionError: 0.5, confidence: 5 }),
    ).toBe(0.5);
  });

  it('throws on errorScale ≤ 0', () => {
    expect(() =>
      computeVFEContribution({ predictionError: 1 }, { errorScale: 0 }),
    ).toThrow(/errorScale/);
    expect(() =>
      computeVFEContribution({ predictionError: 1 }, { errorScale: -1 }),
    ).toThrow(/errorScale/);
  });
});

describe('updateVFEDelta — EMA math', () => {
  it('default lr=0.10 + zero current + observation 1.0 → 0.10', () => {
    const next = updateVFEDelta(0, { predictionError: 1.0 });
    expect(next).toBeCloseTo(0.10, 9);
  });

  it('default lr + current 0.5 + zero observation → 0.45 (decay)', () => {
    const next = updateVFEDelta(0.5, { predictionError: 0 });
    expect(next).toBeCloseTo(0.45, 9);
  });

  it('lr=1.0 → fully overwrite with new contribution', () => {
    const next = updateVFEDelta(0.9, { predictionError: 0.2 }, { learningRate: 1 });
    expect(next).toBeCloseTo(0.2, 9);
  });

  it('lr=0.5 + current 0.6 + obs 0.0 → 0.30 (half decay)', () => {
    const next = updateVFEDelta(0.6, { predictionError: 0 }, { learningRate: 0.5 });
    expect(next).toBeCloseTo(0.30, 9);
  });

  it('clamps to maxMagnitude in both directions', () => {
    const high = updateVFEDelta(0.95, { predictionError: 5, signHint: 1 }, {
      learningRate: 0.5,
      maxMagnitude: 1,
    });
    expect(high).toBeLessThanOrEqual(1);

    const low = updateVFEDelta(-0.95, { predictionError: 5, signHint: -1 }, {
      learningRate: 0.5,
      maxMagnitude: 1,
    });
    expect(low).toBeGreaterThanOrEqual(-1);
  });

  it('custom maxMagnitude restricts the boost ceiling', () => {
    const next = updateVFEDelta(0.4, { predictionError: 1.0 }, {
      learningRate: 1,
      maxMagnitude: 0.5,
    });
    // Pure overwrite would give 1.0; clamped at 0.5.
    expect(next).toBe(0.5);
  });

  it('NaN current delta treated as 0', () => {
    const next = updateVFEDelta(Number.NaN, { predictionError: 1 });
    expect(next).toBeCloseTo(0.10, 9);
  });

  it('throws on lr outside (0, 1]', () => {
    expect(() => updateVFEDelta(0, { predictionError: 1 }, { learningRate: 0 })).toThrow();
    expect(() => updateVFEDelta(0, { predictionError: 1 }, { learningRate: 1.5 })).toThrow();
    expect(() => updateVFEDelta(0, { predictionError: 1 }, { learningRate: -0.5 })).toThrow();
  });

  it('throws on maxMagnitude ≤ 0', () => {
    expect(() => updateVFEDelta(0, { predictionError: 1 }, { maxMagnitude: 0 })).toThrow();
    expect(() => updateVFEDelta(0, { predictionError: 1 }, { maxMagnitude: -1 })).toThrow();
  });

  it('repeated zero observations decay delta toward 0', () => {
    let d = 0.9;
    for (let i = 0; i < 50; i++) d = updateVFEDelta(d, { predictionError: 0 });
    expect(d).toBeCloseTo(0, 1);
  });
});

describe('batchUpdateVFEDeltas', () => {
  it('order-preserving: i-th output is i-th input updated', () => {
    const deltas = [0, 0.5, -0.3];
    const obs = [
      { predictionError: 1.0 }, // contribution 1.0
      { predictionError: 0 },   // contribution 0
      { predictionError: 0.5, signHint: -1 as const }, // -0.5
    ];
    const next = batchUpdateVFEDeltas(deltas, obs);
    expect(next[0]).toBeCloseTo(0.10, 9);  // 0 + 0.10*1.0
    expect(next[1]).toBeCloseTo(0.45, 9);  // 0.5 * 0.9
    expect(next[2]).toBeCloseTo(-0.32, 9); // -0.3 * 0.9 + 0.10*-0.5
  });

  it('throws on length mismatch', () => {
    expect(() => batchUpdateVFEDeltas([0, 0], [{ predictionError: 1 }])).toThrow();
  });

  it('empty inputs → empty output', () => {
    expect(batchUpdateVFEDeltas([], [])).toEqual([]);
  });
});

describe('applyVFERetrievalBoost', () => {
  it('positive delta lifts the score', () => {
    expect(applyVFERetrievalBoost(0.5, 1.0)).toBeCloseTo(0.55, 9);
  });

  it('negative delta reduces the score', () => {
    expect(applyVFERetrievalBoost(0.5, -1.0)).toBeCloseTo(0.45, 9);
  });

  it('zero delta is a no-op', () => {
    expect(applyVFERetrievalBoost(0.5, 0)).toBe(0.5);
  });

  // The module promises the boost "can never move a base score by more than ±10 %" (α = 0.10).
  // A delta outside [-1, 1] (updateVFEDelta allows maxMagnitude > 1) used to move it by 50 %.
  it('moves a score by at most ±α however large the delta', () => {
    expect(applyVFERetrievalBoost(1.0, 5)).toBeCloseTo(1.1, 12);
    expect(applyVFERetrievalBoost(1.0, -5)).toBeCloseTo(0.9, 12);
  });

  it('custom alpha changes the lift magnitude', () => {
    expect(applyVFERetrievalBoost(1.0, 1.0, { alpha: 0.5 })).toBeCloseTo(1.5, 9);
  });

  it('boosted score never drops below 0', () => {
    // Edge case: alpha large enough to flip the sign. Guard clamps at 0.
    expect(applyVFERetrievalBoost(1.0, -1.0, { alpha: 10 })).toBe(0);
  });

  it('NaN delta treated as 0 (no boost)', () => {
    expect(applyVFERetrievalBoost(0.5, NaN)).toBe(0.5);
  });
});

describe('applyVFEIntervalShrink', () => {
  it('zero delta keeps interval unchanged', () => {
    expect(applyVFEIntervalShrink(10, 0)).toBe(10);
  });

  it('positive delta shrinks the interval', () => {
    expect(applyVFEIntervalShrink(10, 1.0)).toBeCloseTo(8.0, 9);
  });

  it('|delta| matters, not sign', () => {
    expect(applyVFEIntervalShrink(10, 1.0)).toBe(applyVFEIntervalShrink(10, -1.0));
  });

  it('custom beta scales the shrink', () => {
    expect(applyVFEIntervalShrink(10, 1.0, { beta: 0.5 })).toBeCloseTo(5.0, 9);
  });

  it('floor prevents the interval from going below intervalFloor × base', () => {
    // β=0.95, |delta|=1 → 1 - 0.95 = 0.05 < default floor 0.20 → 0.20 × 10 = 2.
    expect(
      applyVFEIntervalShrink(10, 1.0, { beta: 0.95 }),
    ).toBeCloseTo(2.0, 9);
  });

  it('custom intervalFloor respected', () => {
    // β=1.0, |delta|=1 → would be 0; with floor=0.5 → 5.
    expect(
      applyVFEIntervalShrink(10, 1.0, { beta: 1.0, intervalFloor: 0.5 }),
    ).toBeCloseTo(5.0, 9);
  });

  it('non-positive base interval → 0', () => {
    expect(applyVFEIntervalShrink(0, 1.0)).toBe(0);
    expect(applyVFEIntervalShrink(-5, 1.0)).toBe(0);
  });

  it('NaN delta treated as 0 (interval unchanged)', () => {
    expect(applyVFEIntervalShrink(10, NaN)).toBe(10);
  });
});

describe('determinism', () => {
  it('updateVFEDelta same input → same output (10× repeat)', () => {
    const obs = { predictionError: 0.5, confidence: 0.7, signHint: 1 as const };
    const expected = updateVFEDelta(0.3, obs);
    for (let i = 0; i < 10; i++) {
      expect(updateVFEDelta(0.3, obs)).toBe(expected);
    }
  });

  it('applyVFERetrievalBoost same input → same output', () => {
    const a = applyVFERetrievalBoost(0.5, 0.7);
    const b = applyVFERetrievalBoost(0.5, 0.7);
    expect(a).toBe(b);
  });
});

describe('integration: encoding loop simulation', () => {
  it('memory exposed to repeated high-surprise events stabilises near maxMagnitude', () => {
    // 50 high-surprise observations: delta should converge near 1.0 not exceed it.
    let d = 0;
    for (let i = 0; i < 50; i++) {
      d = updateVFEDelta(d, { predictionError: 1.0, confidence: 1.0 });
    }
    expect(d).toBeGreaterThan(0.9);
    expect(d).toBeLessThanOrEqual(1.0);
  });

  it('memory exposed to alternating + and − surprises hovers near 0', () => {
    let d = 0;
    for (let i = 0; i < 100; i++) {
      d = updateVFEDelta(d, {
        predictionError: 1.0,
        signHint: i % 2 === 0 ? 1 : -1,
      });
    }
    expect(Math.abs(d)).toBeLessThan(0.2);
  });
});
