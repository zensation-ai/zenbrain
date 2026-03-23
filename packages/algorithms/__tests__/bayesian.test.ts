/**
 * Bayesian Confidence Propagation — Pure Function Tests
 */
import { describe, it, expect } from 'vitest';
import {
  propagateForRelation,
  applyDamping,
  isSignificantChange,
  PROPAGATION_FACTORS,
  DAMPING,
  CHANGE_THRESHOLD,
} from '../src/bayesian';

const BASE = 0.5;
const SOURCE = 0.8;
const WEIGHT = 1.0;

describe('propagateForRelation', () => {
  it('increases confidence for "supports"', () => {
    expect(propagateForRelation(BASE, SOURCE, WEIGHT, 'supports')).toBeGreaterThan(BASE);
  });

  it('supports: 0.5 + 1.0*1.0*0.8*0.5 = 0.9', () => {
    expect(propagateForRelation(0.5, 0.8, 1.0, 'supports')).toBeCloseTo(0.9, 5);
  });

  it('decreases confidence for "contradicts"', () => {
    expect(propagateForRelation(BASE, SOURCE, WEIGHT, 'contradicts')).toBeLessThan(BASE);
  });

  it('contradicts: 0.5 * (1 - 1.0*1.0*0.8) = 0.1', () => {
    expect(propagateForRelation(0.5, 0.8, 1.0, 'contradicts')).toBeCloseTo(0.1, 5);
  });

  it('"causes" < "supports"', () => {
    const causes = propagateForRelation(BASE, SOURCE, WEIGHT, 'causes');
    const supports = propagateForRelation(BASE, SOURCE, WEIGHT, 'supports');
    expect(causes).toBeGreaterThan(BASE);
    expect(causes).toBeLessThan(supports);
  });

  it('"requires" < "causes"', () => {
    const requires = propagateForRelation(BASE, SOURCE, WEIGHT, 'requires');
    const causes = propagateForRelation(BASE, SOURCE, WEIGHT, 'causes');
    expect(requires).toBeLessThan(causes);
  });

  it('similar_to: 0.5 + 0.2*1.0*0.8*0.5 = 0.58', () => {
    expect(propagateForRelation(0.5, 0.8, 1.0, 'similar_to')).toBeCloseTo(0.58, 5);
  });

  it('no change for "created_by" (non-epistemic)', () => {
    expect(propagateForRelation(BASE, SOURCE, WEIGHT, 'created_by')).toBe(BASE);
  });

  it('no change for "used_by" (non-epistemic)', () => {
    expect(propagateForRelation(BASE, SOURCE, WEIGHT, 'used_by')).toBe(BASE);
  });

  it('never exceeds 1.0', () => {
    expect(propagateForRelation(0.95, 0.99, 1.0, 'supports')).toBeLessThanOrEqual(1.0);
  });

  it('never goes below 0.0', () => {
    expect(propagateForRelation(0.05, 0.99, 1.0, 'contradicts')).toBeGreaterThanOrEqual(0.0);
  });

  it('zero edge weight → no change', () => {
    expect(propagateForRelation(BASE, SOURCE, 0, 'supports')).toBeCloseTo(BASE, 5);
  });
});

describe('PROPAGATION_FACTORS', () => {
  it('has correct factors', () => {
    expect(PROPAGATION_FACTORS['supports']).toBe(1.0);
    expect(PROPAGATION_FACTORS['contradicts']).toBe(-1.0);
    expect(PROPAGATION_FACTORS['causes']).toBe(0.8);
    expect(PROPAGATION_FACTORS['requires']).toBe(0.6);
    expect(PROPAGATION_FACTORS['part_of']).toBe(0.3);
    expect(PROPAGATION_FACTORS['similar_to']).toBe(0.2);
    expect(PROPAGATION_FACTORS['created_by']).toBe(0.0);
    expect(PROPAGATION_FACTORS['used_by']).toBe(0.0);
  });
});

describe('applyDamping', () => {
  it('blends new and previous values', () => {
    // 0.7 * 0.9 + 0.3 * 0.6 = 0.63 + 0.18 = 0.81
    expect(applyDamping(0.9, 0.6)).toBeCloseTo(0.81, 5);
  });

  it('clamps to [0, 1]', () => {
    expect(applyDamping(1.5, 0.5)).toBeLessThanOrEqual(1.0);
    expect(applyDamping(-0.5, 0.1)).toBeGreaterThanOrEqual(0.0);
  });
});

describe('isSignificantChange', () => {
  it('returns true for changes > threshold', () => {
    expect(isSignificantChange(0.5, 0.48)).toBe(true);
  });

  it('returns false for changes <= threshold', () => {
    expect(isSignificantChange(0.5, 0.505)).toBe(false);
  });
});
