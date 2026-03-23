/**
 * Text Similarity & Negation Detection Utilities
 *
 * Pure CPU-only functions for text analysis:
 * - Negation detection (English + German)
 * - String similarity (Jaccard word overlap)
 * - Negation stripping
 * - Safe JSON parsing
 *
 * @packageDocumentation
 * @module @zenbrain/algorithms/similarity
 */

import type { Logger } from './types';
import { noopLogger } from './types';

// ===========================================
// Negation Detection
// ===========================================

/**
 * Result of negation detection analysis.
 */
export interface NegationResult {
  /** Whether the text contains a negation */
  isNegated: boolean;
  /** The target of the negation (the thing being negated), or null */
  negationTarget: string | null;
  /** Confidence in the negation detection (0-1) */
  confidence: number;
}

/**
 * Negation patterns for English and German.
 * Each pattern includes a regex and the group index for the negation target.
 */
const NEGATION_PATTERNS_WITH_TARGET = [
  // English patterns — capture up to 2 words after negation
  { regex: /\bdoes(?:n't| not) (\S+ ?\S*)/i },
  { regex: /\bisn't (\S+ ?\S*)/i },
  { regex: /\bhasn't (\S+ ?\S*)/i },
  { regex: /\bdon't (\S+ ?\S*)/i },
  { regex: /\bnot (\S+ ?\S*)/i },
  { regex: /\bnever (\S+ ?\S*)/i },
  { regex: /\bno longer (\S+ ?\S*)/i },
  { regex: /\bno (\S+ ?\S*)/i },
  // German patterns
  { regex: /\bnicht (?:mehr )?(\S+ ?\S*)/i },
  { regex: /\bkeine?n? (\S+ ?\S*)/i },
  { regex: /\bnie (\S+ ?\S*)/i },
  { regex: /\bnicht mehr (\S+ ?\S*)/i },
] as const;

/** Simple negation keyword patterns (no target extraction) */
const SIMPLE_NEGATION_PATTERNS = [
  /\bnot\b/i,
  /\bnever\b/i,
  /\bdoes(?:n'|')t\b/i,
  /\bdon(?:'|')t\b/i,
  /\bisn(?:'|')t\b/i,
  /\bhasn(?:'|')t\b/i,
  /\bno longer\b/i,
  /\bno\b/i,
  /\bnicht mehr\b/i,
  /\bnicht\b/i,
  /\bkein(?:e|en|em|er|es)?\b/i,
  /\bnie(?:mals)?\b/i,
];

/**
 * Detect negation in text using regex-based heuristics.
 *
 * Supports English and German negation patterns.
 * Pure CPU-only — no LLM calls.
 *
 * @param text - The text to analyze for negation
 * @returns NegationResult with isNegated flag, target, and confidence
 */
export function detectNegation(text: string): NegationResult {
  if (!text || text.trim().length === 0) {
    return { isNegated: false, negationTarget: null, confidence: 0 };
  }

  const lowerText = text.toLowerCase();

  // Count distinct negation occurrences for double-negation detection
  let countText = lowerText;
  let negationCount = 0;
  const COUNTING_PATTERNS = [
    /\bnicht mehr\b/gi,
    /\bno longer\b/gi,
    /\bdoes(?:n'|'|n')t\b/gi,
    /\bdon(?:'|'|n')t\b/gi,
    /\bisn(?:'|'|n')t\b/gi,
    /\bhasn(?:'|'|n')t\b/gi,
    /\bnot\b/gi,
    /\bnever\b/gi,
    /\bno\b/gi,
    /\bnicht\b/gi,
    /\bkein(?:e|en|em|er|es)?\b/gi,
    /\bnie(?:mals)?\b/gi,
  ];
  for (const pattern of COUNTING_PATTERNS) {
    const matches = countText.match(pattern);
    if (matches) {
      negationCount += matches.length;
      countText = countText.replace(pattern, '___');
    }
  }

  if (negationCount >= 2) {
    return { isNegated: true, negationTarget: null, confidence: 0.3 };
  }

  // Try to extract negation target with detailed patterns
  for (const { regex } of NEGATION_PATTERNS_WITH_TARGET) {
    const match = text.match(regex);
    if (match && match[1]) {
      const target = match[1].trim().replace(/[.,!?;:]+$/, '');
      return {
        isNegated: true,
        negationTarget: target.length > 0 ? target : null,
        confidence: 0.85,
      };
    }
  }

  // Fallback: check simple patterns without target extraction
  for (const pattern of SIMPLE_NEGATION_PATTERNS) {
    if (pattern.test(lowerText)) {
      return { isNegated: true, negationTarget: null, confidence: 0.6 };
    }
  }

  return { isNegated: false, negationTarget: null, confidence: 0 };
}

/**
 * Compute simple string similarity between two texts using word overlap (Jaccard-like).
 * Used for finding similar facts with opposite polarity.
 *
 * @param a - First text
 * @param b - Second text
 * @returns Similarity score 0-1
 */
export function computeStringSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) { return 0; }

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) { intersection++; }
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Strip negation words from text for comparison.
 *
 * @param text - Text with negation words
 * @returns Text with negation words removed
 */
export function stripNegation(text: string): string {
  return text
    .replace(/\b(?:not|never|no longer|doesn't|don't|isn't|hasn't|can't|won't)\b/gi, '')
    .replace(/\b(?:nicht|kein(?:e|en|em|er|es)?|nie(?:mals)?|nicht mehr)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Safely parse JSON with fallback value.
 * Prevents crashes from corrupted data.
 *
 * @param json - JSON string to parse
 * @param fallback - Value to return if parsing fails
 * @param logger - Optional logger for warnings
 * @returns Parsed value or fallback
 */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T, logger: Logger = noopLogger): T {
  if (!json || typeof json !== 'string') {
    return fallback;
  }
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    logger.warn?.('Failed to parse JSON, using fallback', {
      jsonPreview: json.substring(0, 100),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return fallback;
  }
}
