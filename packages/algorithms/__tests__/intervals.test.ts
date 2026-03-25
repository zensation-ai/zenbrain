/**
 * Confidence Intervals — Tests
 */
import { describe, it, expect } from 'vitest';
import { getRetrievabilityWithCI, propagateWithCI } from '../src/intervals';
import type { ConfidenceInterval } from '../src/intervals';

describe('getRetrievabilityWithCI', () => {
  it('returns correct point estimate', () => {
    const ci = getRetrievabilityWithCI(0.8, 10);
    expect(ci.point).toBe(0.8);
  });

  it('CI contains the point estimate', () => {
    const ci = getRetrievabilityWithCI(0.7, 5);
    expect(ci.lower).toBeLessThanOrEqual(ci.point);
    expect(ci.upper).toBeGreaterThanOrEqual(ci.point);
  });

  it('narrower CI with more reviews', () => {
    const fewReviews = getRetrievabilityWithCI(0.8, 2);
    const manyReviews = getRetrievabilityWithCI(0.8, 100);
    const fewWidth = fewReviews.upper - fewReviews.lower;
    const manyWidth = manyReviews.upper - manyReviews.lower;
    expect(manyWidth).toBeLessThan(fewWidth);
  });

  it('CI is [0,0] → [0,0] for R=0', () => {
    const ci = getRetrievabilityWithCI(0, 10);
    expect(ci.point).toBe(0);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBe(0);
  });

  it('CI is [1,1] → [1,1] for R=1', () => {
    const ci = getRetrievabilityWithCI(1, 10);
    expect(ci.point).toBe(1);
    expect(ci.lower).toBe(1);
    expect(ci.upper).toBe(1);
  });

  it('clamps retrievability to [0, 1]', () => {
    const ci = getRetrievabilityWithCI(1.5, 10);
    expect(ci.point).toBe(1);
    const ciNeg = getRetrievabilityWithCI(-0.5, 10);
    expect(ciNeg.point).toBe(0);
  });

  it('handles reviewCount=0 (uses 1 as minimum)', () => {
    const ci = getRetrievabilityWithCI(0.5, 0);
    expect(ci.lower).toBeGreaterThanOrEqual(0);
    expect(ci.upper).toBeLessThanOrEqual(1);
  });

  it('bounds are always within [0, 1]', () => {
    for (const r of [0, 0.1, 0.5, 0.9, 1]) {
      for (const n of [1, 5, 50]) {
        const ci = getRetrievabilityWithCI(r, n);
        expect(ci.lower).toBeGreaterThanOrEqual(0);
        expect(ci.upper).toBeLessThanOrEqual(1);
      }
    }
  });

  it('produces symmetric CI for R=0.5 with 1 review', () => {
    const ci = getRetrievabilityWithCI(0.5, 1);
    // se = sqrt(0.25/1) = 0.5, margin = 0.98
    // lower = max(0, 0.5 - 0.98) = 0, upper = min(1, 0.5 + 0.98) = 1
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBe(1);
  });
});

describe('propagateWithCI', () => {
  const baseCi: ConfidenceInterval = { point: 0.5, lower: 0.4, upper: 0.6 };

  it('positive factor increases point estimate', () => {
    const result = propagateWithCI(baseCi, 0.8, 1.0, 1.0);
    expect(result.point).toBeGreaterThan(baseCi.point);
  });

  it('negative factor decreases point estimate', () => {
    const result = propagateWithCI(baseCi, 0.8, 1.0, -1.0);
    expect(result.point).toBeLessThan(baseCi.point);
  });

  it('uncertainty grows with propagation', () => {
    const result = propagateWithCI(baseCi, 0.8, 1.0, 1.0);
    const resultWidth = result.upper - result.lower;
    const baseWidth = baseCi.upper - baseCi.lower;
    expect(resultWidth).toBeGreaterThan(baseWidth);
  });

  it('point estimate is clamped to [0, 1]', () => {
    const highBase: ConfidenceInterval = { point: 0.99, lower: 0.95, upper: 1.0 };
    const result = propagateWithCI(highBase, 1.0, 1.0, 1.0);
    expect(result.point).toBeLessThanOrEqual(1);
    expect(result.point).toBeGreaterThanOrEqual(0);
  });

  it('bounds are within [0, 1]', () => {
    const result = propagateWithCI(baseCi, 0.9, 1.0, 1.0);
    expect(result.lower).toBeGreaterThanOrEqual(0);
    expect(result.upper).toBeLessThanOrEqual(1);
  });

  it('zero factor returns base point unchanged', () => {
    const result = propagateWithCI(baseCi, 0.8, 1.0, 0);
    // factor > 0 branch: 0.5 + 0*... = 0.5 — actually factor=0 goes to else branch
    // factor is not > 0, so: 0.5 * (1 - 0 * 1.0 * 0.8) = 0.5
    expect(result.point).toBeCloseTo(0.5);
  });

  it('zero edge weight preserves point estimate', () => {
    const result = propagateWithCI(baseCi, 0.8, 0, 1.0);
    expect(result.point).toBeCloseTo(baseCi.point);
  });
});
