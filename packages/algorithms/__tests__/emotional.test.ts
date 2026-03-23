/**
 * Emotional Tagger Tests
 */
import { describe, it, expect } from 'vitest';
import {
  tagEmotion,
  computeEmotionalWeight,
  isEmotionallySignificant,
  computeContextualValence,
} from '../src/emotional';

describe('tagEmotion', () => {
  it('returns neutral for empty text', () => {
    const result = tagEmotion('');
    expect(result.sentiment).toBe(0);
    expect(result.arousal).toBe(0);
    expect(result.valence).toBe(0.5);
    expect(result.significance).toBe(0);
  });

  it('detects positive sentiment', () => {
    const result = tagEmotion('This is amazing and fantastic!');
    expect(result.sentiment).toBeGreaterThan(0);
    expect(result.valence).toBeGreaterThan(0.5);
  });

  it('detects negative sentiment', () => {
    const result = tagEmotion('This is terrible and horrible');
    expect(result.sentiment).toBeLessThan(0);
    expect(result.valence).toBeLessThan(0.5);
  });

  it('detects German emotions', () => {
    const result = tagEmotion('Das ist fantastisch und wunderbar!');
    expect(result.sentiment).toBeGreaterThan(0);
  });

  it('detects high arousal from urgency words', () => {
    const result = tagEmotion('This is urgent and critical!');
    expect(result.arousal).toBeGreaterThan(0.5);
  });

  it('detects significance from life events', () => {
    const result = tagEmotion('I got a promotion at work!');
    expect(result.significance).toBeGreaterThan(0);
  });

  it('exclamation marks boost arousal', () => {
    const calm = tagEmotion('The meeting is today');
    const excited = tagEmotion('The meeting is today!!!');
    expect(excited.arousal).toBeGreaterThan(calm.arousal);
  });

  it('ALL CAPS boost arousal', () => {
    const normal = tagEmotion('this is important');
    const caps = tagEmotion('this is VERY IMPORTANT');
    expect(caps.arousal).toBeGreaterThan(normal.arousal);
  });

  it('attaches contextualValence when domain provided', () => {
    const result = tagEmotion('urgent deadline approaching', 'work');
    expect(result.contextualValence).toBeDefined();
    expect(result.contextualValence?.context).toBe('work');
  });
});

describe('computeEmotionalWeight', () => {
  it('high arousal + significance → strong consolidation', () => {
    const weight = computeEmotionalWeight({
      sentiment: 0.8,
      arousal: 0.9,
      valence: 0.9,
      significance: 0.9,
    });
    expect(weight.consolidationWeight).toBeGreaterThan(0.5);
    expect(weight.decayMultiplier).toBeGreaterThan(2.0);
  });

  it('neutral emotion → baseline weight', () => {
    const weight = computeEmotionalWeight({
      sentiment: 0,
      arousal: 0,
      valence: 0.5,
      significance: 0,
    });
    expect(weight.consolidationWeight).toBeCloseTo(0, 1);
    expect(weight.decayMultiplier).toBeCloseTo(1.0, 1);
  });

  it('decay multiplier between 1.0 and 3.0', () => {
    const weight = computeEmotionalWeight({
      sentiment: -0.5,
      arousal: 0.6,
      valence: 0.25,
      significance: 0.3,
    });
    expect(weight.decayMultiplier).toBeGreaterThanOrEqual(1.0);
    expect(weight.decayMultiplier).toBeLessThanOrEqual(3.0);
  });
});

describe('isEmotionallySignificant', () => {
  it('returns true for emotional text', () => {
    expect(isEmotionallySignificant('This is an emergency! Critical deadline!')).toBe(true);
  });

  it('returns false for neutral text', () => {
    expect(isEmotionallySignificant('The meeting is at three')).toBe(false);
  });
});

describe('computeContextualValence', () => {
  it('work context: urgency does not lower valence', () => {
    const result = computeContextualValence('This is urgent and critical', 'work');
    expect(result.context).toBe('work');
    // Urgency words push toward neutral, not negative
    expect(result.effectiveValence).toBeGreaterThanOrEqual(0.4);
  });

  it('personal context: amplifies emotional deviation', () => {
    const result = computeContextualValence('I am so happy and grateful!', 'personal');
    expect(result.contextModifier).toBeGreaterThan(0);
    expect(result.effectiveValence).toBeGreaterThan(result.valence);
  });

  it('learning context: difficulty is not negative', () => {
    const result = computeContextualValence('This is very difficult and challenging', 'learning');
    // Difficulty words push toward neutral in learning context
    expect(result.effectiveValence).toBeGreaterThanOrEqual(result.valence);
  });

  it('returns neutral for empty text', () => {
    const result = computeContextualValence('', 'work');
    expect(result.effectiveValence).toBe(0.5);
  });
});
