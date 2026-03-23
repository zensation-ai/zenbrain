/**
 * Emotional Tagger (Amygdala-Modulation)
 *
 * Heuristic-based emotional analysis of text content.
 * Inspired by the amygdala's role in tagging memories with emotional significance.
 *
 * Key insight: Emotionally charged memories are consolidated more strongly
 * and decay more slowly (Cahill & McGaugh, 1998; LaBar & Cabeza, 2006).
 *
 * This module provides fast, CPU-only emotion detection via keyword matching,
 * deliberately avoiding LLM calls for speed in the hot path.
 *
 * @packageDocumentation
 * @module @zenbrain/algorithms/emotional
 */

import type { Logger } from './types';
import { noopLogger } from './types';

// ===========================================
// Types
// ===========================================

export interface EmotionalTag {
  /** Overall sentiment polarity: -1 (negative) to +1 (positive) */
  sentiment: number;
  /** Physiological arousal level: 0 (calm) to 1 (excited/agitated) */
  arousal: number;
  /** Hedonic valence: 0 (unpleasant) to 1 (pleasant) */
  valence: number;
  /** Subjective significance / importance: 0 (trivial) to 1 (life-changing) */
  significance: number;
  /** Optional context-adjusted valence (populated when contextDomain is provided) */
  contextualValence?: ContextualValence;
}

export interface EmotionalWeight {
  /** Consolidation weight: how much this emotion boosts memory consolidation */
  consolidationWeight: number;
  /** Decay multiplier: factor applied to decay half-life (>1 means slower decay) */
  decayMultiplier: number;
}

/**
 * Contextual valence adjusts emotional valence based on the domain context.
 *
 * - Work: urgency words get higher arousal but neutral valence
 * - Personal: emotional words get amplified valence
 * - Learning: difficulty words get neutral valence (challenges are expected)
 * - Creative: emotional intensity gets moderate amplification
 */
export interface ContextualValence {
  /** Base valence (0-1, from tagEmotion) */
  valence: number;
  /** Modifier applied by context domain (-1 to +1) */
  contextModifier: number;
  /** Final valence after context adjustment (clamped 0-1) */
  effectiveValence: number;
  /** The context domain used */
  context: string;
}

/** Context modifier ranges: how much the domain adjusts valence */
const CONTEXT_MODIFIER_RANGES: Record<string, number> = {
  work: 0.1,
  personal: 0.2,
  learning: 0.05,
  creative: 0.15,
} as const;

/** Words that indicate urgency (dampened valence shift in work context) */
const URGENCY_WORDS = new Set([
  'urgent', 'dringend', 'deadline', 'asap', 'sofort', 'immediately',
  'critical', 'wichtig', 'important', 'priority', 'prioritaet',
]);

/** Words that indicate difficulty (neutral valence in learning context) */
const DIFFICULTY_WORDS = new Set([
  'difficult', 'schwierig', 'hard', 'challenging', 'complex', 'komplex',
  'complicated', 'tough', 'struggle', 'confused', 'verwirrend', 'struggle',
]);

/**
 * Compute context-adjusted valence for a given text and domain.
 *
 * Different domains interpret emotional signals differently:
 * - Work context: urgency is not negative, just high-arousal neutral
 * - Personal context: emotions are amplified (personal relevance)
 * - Learning context: difficulty is expected, not negative
 * - Creative context: moderate emotional amplification
 *
 * @param text - The text to analyze
 * @param contextDomain - The domain: 'work', 'personal', 'learning', 'creative'
 * @returns ContextualValence with adjusted values
 */
export function computeContextualValence(text: string, contextDomain: string): ContextualValence {
  const tag = tagEmotion(text);
  const baseValence = tag.valence;
  const modifierRange = CONTEXT_MODIFIER_RANGES[contextDomain] ?? 0.1;

  if (!text || text.trim().length === 0) {
    return { valence: 0.5, contextModifier: 0, effectiveValence: 0.5, context: contextDomain };
  }

  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);

  let contextModifier = 0;

  if (contextDomain === 'work') {
    const hasUrgency = words.some(w => URGENCY_WORDS.has(w.replace(/[.,!?]/g, '')));
    if (hasUrgency) {
      contextModifier = (0.5 - baseValence) * modifierRange * 2;
    }
  } else if (contextDomain === 'personal') {
    const deviation = baseValence - 0.5;
    contextModifier = deviation * modifierRange * 2;
  } else if (contextDomain === 'learning') {
    const hasDifficulty = words.some(w => DIFFICULTY_WORDS.has(w.replace(/[.,!?]/g, '')));
    if (hasDifficulty && baseValence < 0.5) {
      contextModifier = (0.5 - baseValence) * modifierRange * 2;
    }
  } else if (contextDomain === 'creative') {
    const deviation = baseValence - 0.5;
    contextModifier = deviation * modifierRange;
  }

  const effectiveValence = Math.max(0, Math.min(1, baseValence + contextModifier));

  return {
    valence: baseValence,
    contextModifier: Math.round(contextModifier * 1000) / 1000,
    effectiveValence: Math.round(effectiveValence * 1000) / 1000,
    context: contextDomain,
  };
}

// ===========================================
// Emotion Lexicons
// ===========================================

/** Words indicating positive emotion, grouped by intensity */
const POSITIVE_WORDS: ReadonlyMap<string, number> = new Map([
  // High intensity (0.8-1.0)
  ['begeistert', 0.9], ['fantastisch', 0.9], ['wunderbar', 0.85],
  ['amazing', 0.9], ['incredible', 0.9], ['brilliant', 0.85],
  ['outstanding', 0.85], ['extraordinary', 0.9], ['ecstatic', 1.0],
  ['overjoyed', 0.95], ['thrilled', 0.9], ['euphoric', 1.0],
  ['phenomenal', 0.9], ['magnificent', 0.85], ['genial', 0.85],
  // Medium intensity (0.5-0.79)
  ['super', 0.7], ['toll', 0.65], ['prima', 0.6], ['perfekt', 0.75],
  ['great', 0.7], ['excellent', 0.75], ['wonderful', 0.8],
  ['awesome', 0.75], ['fantastic', 0.8], ['love', 0.7],
  ['happy', 0.65], ['excited', 0.7], ['pleased', 0.6],
  ['grateful', 0.65], ['thankful', 0.6], ['proud', 0.7],
  ['freue', 0.65], ['freude', 0.7], ['gluecklich', 0.65],
  ['danke', 0.55], ['thanks', 0.55], ['appreciate', 0.6],
  // Low intensity (0.2-0.49)
  ['good', 0.4], ['nice', 0.35], ['fine', 0.3], ['okay', 0.25],
  ['gut', 0.4], ['nett', 0.35], ['angenehm', 0.4],
  ['interessant', 0.4], ['interesting', 0.4], ['helpful', 0.45],
  ['useful', 0.4], ['cool', 0.45],
]);

/** Words indicating negative emotion, grouped by intensity */
const NEGATIVE_WORDS: ReadonlyMap<string, number> = new Map([
  // High intensity (0.8-1.0)
  ['furchtbar', 0.9], ['schrecklich', 0.9], ['katastrophe', 1.0],
  ['terrible', 0.9], ['horrible', 0.9], ['devastating', 1.0],
  ['catastrophic', 1.0], ['disastrous', 0.95], ['nightmare', 0.9],
  ['desperate', 0.85], ['hopeless', 0.9], ['verzweifelt', 0.85],
  ['hasse', 0.85], ['hate', 0.85], ['despise', 0.9],
  // Medium intensity (0.5-0.79)
  ['problem', 0.55], ['fehler', 0.6], ['falsch', 0.55],
  ['schlecht', 0.6], ['schwierig', 0.5], ['frustriert', 0.7],
  ['aerger', 0.65], ['error', 0.55], ['wrong', 0.55],
  ['bad', 0.55], ['difficult', 0.5], ['frustrated', 0.7],
  ['angry', 0.7], ['confused', 0.55], ['stuck', 0.5],
  ['broken', 0.6], ['issue', 0.5], ['bug', 0.5],
  ['fail', 0.6], ['failed', 0.65], ['failure', 0.7],
  ['worried', 0.6], ['anxious', 0.65], ['stressed', 0.65],
  ['sorge', 0.6], ['angst', 0.65],
  // Low intensity (0.2-0.49)
  ['annoying', 0.4], ['inconvenient', 0.35], ['unclear', 0.3],
  ['slow', 0.3], ['boring', 0.35], ['tedious', 0.4],
  ['langweilig', 0.35], ['umstaendlich', 0.4], ['nervig', 0.45],
]);

/** Words indicating high arousal (excitement, urgency, intensity) */
const HIGH_AROUSAL_WORDS: ReadonlyMap<string, number> = new Map([
  ['dringend', 0.85], ['wichtig', 0.7], ['schnell', 0.6],
  ['sofort', 0.85], ['urgent', 0.85], ['important', 0.7],
  ['immediately', 0.85], ['asap', 0.9], ['critical', 0.9],
  ['deadline', 0.8], ['emergency', 1.0], ['notfall', 1.0],
  ['jetzt', 0.6], ['now', 0.6], ['hurry', 0.8],
  ['breakthrough', 0.8], ['discovered', 0.7], ['eureka', 0.9],
  ['entdeckt', 0.7], ['durchbruch', 0.8], ['ploetzlich', 0.65],
  ['suddenly', 0.65], ['shock', 0.85], ['surprise', 0.7],
  ['ueberraschung', 0.7], ['unglaublich', 0.75],
]);

/** Words indicating high personal significance */
const SIGNIFICANCE_WORDS: ReadonlyMap<string, number> = new Map([
  // Life events
  ['wedding', 0.95], ['hochzeit', 0.95], ['baby', 0.9],
  ['promotion', 0.85], ['befoerderung', 0.85], ['graduation', 0.85],
  ['abschluss', 0.8], ['birthday', 0.7], ['geburtstag', 0.7],
  ['anniversary', 0.75], ['jubilaeum', 0.75],
  // Career / Achievement
  ['career', 0.7], ['karriere', 0.7], ['achievement', 0.75],
  ['milestone', 0.8], ['meilenstein', 0.8], ['success', 0.7],
  ['erfolg', 0.7], ['goal', 0.65], ['ziel', 0.65],
  ['dream', 0.7], ['traum', 0.7],
  // Identity
  ['identity', 0.8], ['identitaet', 0.8], ['belief', 0.75],
  ['value', 0.65], ['wert', 0.65], ['principle', 0.7],
  ['decision', 0.6], ['entscheidung', 0.65],
  // Relationships
  ['family', 0.75], ['familie', 0.75], ['friend', 0.6],
  ['freund', 0.6], ['partner', 0.7], ['relationship', 0.7],
  ['beziehung', 0.7], ['love', 0.75], ['liebe', 0.75],
  // Health
  ['health', 0.8], ['gesundheit', 0.8], ['diagnosis', 0.9],
  ['diagnose', 0.9], ['surgery', 0.9], ['operation', 0.85],
]);

// ===========================================
// Emotional Tagger
// ===========================================

/**
 * Analyze text for emotional content using heuristic keyword matching.
 *
 * Returns a multidimensional emotional profile:
 * - sentiment: overall positive/negative polarity
 * - arousal: activation/excitement level
 * - valence: pleasantness (mapped from sentiment to 0-1)
 * - significance: personal importance/relevance
 *
 * @param text - The text to analyze
 * @param contextDomain - Optional domain context for contextual valence adjustment
 * @param logger - Optional logger for debug output
 */
export function tagEmotion(text: string, contextDomain?: string, logger: Logger = noopLogger): EmotionalTag {
  if (!text || text.trim().length === 0) {
    return { sentiment: 0, arousal: 0, valence: 0.5, significance: 0 };
  }

  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);
  const wordCount = Math.max(words.length, 1);

  let positiveScore = 0;
  let negativeScore = 0;
  let arousalScore = 0;
  let significanceScore = 0;
  let positiveHits = 0;
  let negativeHits = 0;
  let arousalHits = 0;
  let significanceHits = 0;

  for (const word of words) {
    const cleanWord = word.replace(/[.,!?;:'"()[\]{}]/g, '');
    if (cleanWord.length < 2) { continue; }

    const posIntensity = POSITIVE_WORDS.get(cleanWord);
    if (posIntensity !== undefined) {
      positiveScore += posIntensity;
      positiveHits++;
    }

    const negIntensity = NEGATIVE_WORDS.get(cleanWord);
    if (negIntensity !== undefined) {
      negativeScore += negIntensity;
      negativeHits++;
    }

    const arousalIntensity = HIGH_AROUSAL_WORDS.get(cleanWord);
    if (arousalIntensity !== undefined) {
      arousalScore += arousalIntensity;
      arousalHits++;
    }

    const sigIntensity = SIGNIFICANCE_WORDS.get(cleanWord);
    if (sigIntensity !== undefined) {
      significanceScore += sigIntensity;
      significanceHits++;
    }
  }

  // Exclamation marks boost arousal
  const exclamationCount = (text.match(/!/g) || []).length;
  if (exclamationCount > 0) {
    arousalScore += Math.min(exclamationCount * 0.15, 0.5);
    arousalHits++;
  }

  // Question marks slightly boost arousal (curiosity/uncertainty)
  const questionCount = (text.match(/\?/g) || []).length;
  if (questionCount > 0) {
    arousalScore += Math.min(questionCount * 0.05, 0.2);
  }

  // ALL CAPS words boost arousal
  const capsWords = text.match(/\b[A-Z]{2,}\b/g) || [];
  if (capsWords.length > 0) {
    arousalScore += Math.min(capsWords.length * 0.1, 0.3);
  }

  // Compute sentiment
  const totalEmotional = positiveHits + negativeHits;
  let sentiment: number;
  if (totalEmotional === 0) {
    sentiment = 0;
  } else {
    const rawSentiment = (positiveScore - negativeScore) / Math.max(totalEmotional, 1);
    const density = Math.min(totalEmotional / wordCount, 0.5) * 2;
    sentiment = rawSentiment * (0.5 + 0.5 * density);
  }

  // Compute arousal
  const baseArousal = 0.2;
  const arousal = arousalHits > 0
    ? Math.min(baseArousal + arousalScore / Math.max(arousalHits, 1), 1.0)
    : baseArousal + (totalEmotional > 0 ? 0.1 : 0);

  // Compute valence: map sentiment (-1,1) to (0,1)
  const valence = (sentiment + 1) / 2;

  // Compute significance
  let significance = 0;
  if (significanceHits > 0) {
    significance = significanceScore / Math.max(significanceHits, 1);
  }
  const emotionalIntensity = (positiveScore + negativeScore) / Math.max(totalEmotional, 1);
  if (emotionalIntensity > 0.7) {
    significance = Math.max(significance, emotionalIntensity * 0.6);
  }

  const result: EmotionalTag = {
    sentiment: Math.max(-1, Math.min(1, sentiment)),
    arousal: Math.max(0, Math.min(1, arousal)),
    valence: Math.max(0, Math.min(1, valence)),
    significance: Math.max(0, Math.min(1, significance)),
  };

  // Attach contextual valence if domain is provided
  if (contextDomain) {
    result.contextualValence = computeContextualValence(text, contextDomain);
  }

  logger.debug?.('Emotional tagging complete', {
    textLength: text.length,
    positiveHits,
    negativeHits,
    arousalHits,
    significanceHits,
    sentiment: result.sentiment,
    arousal: result.arousal,
  });

  return result;
}

/**
 * Compute consolidation weight and decay multiplier from emotional tag.
 *
 * Based on amygdala modulation of memory consolidation:
 * - High arousal + high significance = strong consolidation (flashbulb memories)
 * - Emotional memories get 3x longer decay half-life
 *
 * Consolidation weight formula: arousal * 0.4 + significance * 0.6
 * Decay multiplier: 1.0 (neutral) to 3.0 (highly emotional)
 */
export function computeEmotionalWeight(tag: EmotionalTag): EmotionalWeight {
  const consolidationWeight = tag.arousal * 0.4 + tag.significance * 0.6;

  const emotionalIntensity = Math.max(
    Math.abs(tag.sentiment),
    tag.arousal,
    tag.significance
  );
  const decayMultiplier = 1.0 + emotionalIntensity * 2.0;

  return {
    consolidationWeight: Math.max(0, Math.min(1, consolidationWeight)),
    decayMultiplier: Math.max(1.0, Math.min(3.0, decayMultiplier)),
  };
}

/**
 * Quick check: is this text emotionally significant enough to warrant tagging?
 * Used as a fast pre-filter before full analysis.
 */
export function isEmotionallySignificant(text: string, threshold = 0.3): boolean {
  const tag = tagEmotion(text);
  const weight = computeEmotionalWeight(tag);
  return weight.consolidationWeight >= threshold;
}
