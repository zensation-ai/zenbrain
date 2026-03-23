/**
 * Context-Dependent Retrieval Tests
 */
import { describe, it, expect } from 'vitest';
import {
  captureEncodingContext,
  calculateContextSimilarity,
  serializeContext,
  deserializeContext,
} from '../src/context-retrieval';
import type { EncodingContext } from '../src/context-retrieval';

describe('captureEncodingContext', () => {
  it('returns valid encoding context', () => {
    const ctx = captureEncodingContext();
    expect(ctx.timeOfDay).toMatch(/^(morning|afternoon|evening|night)$/);
    expect(ctx.dayOfWeek).toBeGreaterThanOrEqual(0);
    expect(ctx.dayOfWeek).toBeLessThanOrEqual(6);
    expect(ctx.taskType).toBe('general');
  });

  it('normalizes task type', () => {
    expect(captureEncodingContext('programming').taskType).toBe('coding');
    expect(captureEncodingContext('writing').taskType).toBe('writing');
    expect(captureEncodingContext('email').taskType).toBe('communication');
    expect(captureEncodingContext('learning').taskType).toBe('learning');
  });

  it('falls back to general for unknown types', () => {
    expect(captureEncodingContext('xyz_unknown').taskType).toBe('general');
  });
});

describe('calculateContextSimilarity', () => {
  it('returns 1.0 similarity for identical contexts', () => {
    const ctx: EncodingContext = { timeOfDay: 'morning', dayOfWeek: 1, taskType: 'coding' };
    const result = calculateContextSimilarity(ctx, ctx);
    expect(result.similarity).toBeCloseTo(1.0, 5);
    expect(result.boost).toBeCloseTo(1.3, 5);
  });

  it('returns low similarity for opposite contexts', () => {
    const encoding: EncodingContext = { timeOfDay: 'morning', dayOfWeek: 1, taskType: 'coding' };
    const current: EncodingContext = { timeOfDay: 'night', dayOfWeek: 0, taskType: 'communication' };
    const result = calculateContextSimilarity(encoding, current);
    expect(result.similarity).toBeLessThan(0.5);
    expect(result.boost).toBeGreaterThanOrEqual(1.0);
  });

  it('boost is always >= 1.0 and <= 1.3', () => {
    const ctx1: EncodingContext = { timeOfDay: 'morning', dayOfWeek: 1, taskType: 'coding' };
    const ctx2: EncodingContext = { timeOfDay: 'night', dayOfWeek: 6, taskType: 'creative' };
    const result = calculateContextSimilarity(ctx1, ctx2);
    expect(result.boost).toBeGreaterThanOrEqual(1.0);
    expect(result.boost).toBeLessThanOrEqual(1.3);
  });

  it('related tasks have moderate similarity', () => {
    const encoding: EncodingContext = { timeOfDay: 'morning', dayOfWeek: 1, taskType: 'coding' };
    const current: EncodingContext = { timeOfDay: 'morning', dayOfWeek: 1, taskType: 'review' };
    const result = calculateContextSimilarity(encoding, current);
    expect(result.dimensions.taskType).toBeCloseTo(0.5);
  });
});

describe('serializeContext / deserializeContext', () => {
  it('roundtrips correctly', () => {
    const ctx: EncodingContext = { timeOfDay: 'afternoon', dayOfWeek: 3, taskType: 'research' };
    const serialized = serializeContext(ctx);
    const deserialized = deserializeContext(serialized);
    expect(deserialized).toEqual(ctx);
  });

  it('returns null for invalid data', () => {
    expect(deserializeContext(null)).toBeNull();
    expect(deserializeContext(undefined)).toBeNull();
    expect(deserializeContext('string')).toBeNull();
    expect(deserializeContext({})).toBeNull();
  });

  it('defaults taskType to general', () => {
    const result = deserializeContext({ timeOfDay: 'morning', dayOfWeek: 1 });
    expect(result?.taskType).toBe('general');
  });
});
