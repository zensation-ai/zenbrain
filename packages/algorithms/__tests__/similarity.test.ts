/**
 * Similarity & Negation Detection Tests
 */
import { describe, it, expect } from 'vitest';
import {
  detectNegation,
  computeStringSimilarity,
  stripNegation,
  safeJsonParse,
} from '../src/similarity';

describe('detectNegation', () => {
  it('returns false for empty text', () => {
    expect(detectNegation('')).toEqual({ isNegated: false, negationTarget: null, confidence: 0 });
  });

  it('detects English negation with target', () => {
    const result = detectNegation("He doesn't like coffee");
    expect(result.isNegated).toBe(true);
    expect(result.negationTarget).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('detects German negation', () => {
    const result = detectNegation('Er mag nicht Kaffee');
    expect(result.isNegated).toBe(true);
  });

  it('detects "never"', () => {
    expect(detectNegation('I never eat fish').isNegated).toBe(true);
  });

  it('detects "no"', () => {
    expect(detectNegation('There is no way').isNegated).toBe(true);
  });

  it('returns false for positive text', () => {
    expect(detectNegation('The sun is shining brightly').isNegated).toBe(false);
  });

  it('double negation → low confidence', () => {
    const result = detectNegation("It's not that I don't like it");
    expect(result.isNegated).toBe(true);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('detects "kein"', () => {
    expect(detectNegation('Ich habe keine Ahnung').isNegated).toBe(true);
  });
});

describe('computeStringSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(computeStringSimilarity('hello world test', 'hello world test')).toBeCloseTo(1.0);
  });

  it('returns 0 for completely different strings', () => {
    expect(computeStringSimilarity('apple banana cherry', 'dog elephant fox')).toBe(0);
  });

  it('returns partial overlap', () => {
    const sim = computeStringSimilarity('the cat sat on the mat', 'the dog sat on the rug');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('returns 0 for empty strings', () => {
    expect(computeStringSimilarity('', '')).toBe(0);
    expect(computeStringSimilarity('hello', '')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(computeStringSimilarity('Hello World', 'hello world')).toBeCloseTo(1.0);
  });
});

describe('stripNegation', () => {
  it('removes English negation words', () => {
    expect(stripNegation("I don't like coffee")).toBe('I like coffee');
  });

  it('removes German negation words', () => {
    expect(stripNegation('Ich mag nicht Kaffee')).toBe('Ich mag Kaffee');
  });

  it('handles "no longer"', () => {
    expect(stripNegation('I no longer work there')).toBe('I work there');
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('not json', 'default')).toBe('default');
  });

  it('returns fallback for null', () => {
    expect(safeJsonParse(null, [])).toEqual([]);
  });

  it('returns fallback for undefined', () => {
    expect(safeJsonParse(undefined, 42)).toBe(42);
  });
});
