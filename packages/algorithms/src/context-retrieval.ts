/**
 * Context-Dependent Retrieval (Encoding Specificity)
 *
 * Implements Tulving's Encoding Specificity Principle (1973):
 * Memory retrieval is enhanced when the retrieval context matches
 * the encoding context.
 *
 * This module captures contextual snapshots at encoding time and
 * computes context similarity at retrieval time, providing a boost
 * to memories encoded in similar contexts.
 *
 * Context dimensions:
 * - Temporal: time of day, day of week
 * - Task: what type of work the user is doing
 *
 * Context boost formula: 1.0 + (similarity * 0.3) → max 30% boost
 *
 * @packageDocumentation
 * @module @zensation/algorithms/context-retrieval
 */

import type { Logger } from './types';
import { noopLogger } from './types';

// ===========================================
// Types
// ===========================================

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export interface EncodingContext {
  /** Time of day when the memory was encoded */
  timeOfDay: TimeOfDay;
  /** Day of the week (0=Sunday, 6=Saturday) */
  dayOfWeek: number;
  /** Type of task being performed during encoding */
  taskType: string;
}

export interface ContextSimilarityResult {
  /** Raw cosine similarity between encoding and current context (0-1) */
  similarity: number;
  /** Retrieval boost factor: 1.0 + (similarity * 0.3) */
  boost: number;
  /** Breakdown of dimension-level similarities */
  dimensions: {
    temporal: number;
    dayOfWeek: number;
    taskType: number;
  };
}

// ===========================================
// Constants
// ===========================================

/** Maximum context boost as a percentage (30%) */
const MAX_CONTEXT_BOOST = 0.3;

/** Time-of-day similarity matrix: how similar different times of day are */
const TIME_SIMILARITY: Record<TimeOfDay, Record<TimeOfDay, number>> = {
  morning:   { morning: 1.0, afternoon: 0.5, evening: 0.2, night: 0.1 },
  afternoon: { morning: 0.5, afternoon: 1.0, evening: 0.5, night: 0.2 },
  evening:   { morning: 0.2, afternoon: 0.5, evening: 1.0, night: 0.5 },
  night:     { morning: 0.1, afternoon: 0.2, evening: 0.5, night: 1.0 },
};

/** Day-of-week similarity: weekdays are similar to each other, weekends to each other */
function dayOfWeekSimilarity(day1: number, day2: number): number {
  if (day1 === day2) { return 1.0; }

  const isWeekend1 = day1 === 0 || day1 === 6;
  const isWeekend2 = day2 === 0 || day2 === 6;

  if (isWeekend1 === isWeekend2) { return 0.6; }
  return 0.2;
}

/** Known task types for matching */
const KNOWN_TASK_TYPES = [
  'coding', 'writing', 'research', 'communication', 'planning',
  'learning', 'creative', 'analysis', 'review', 'general',
] as const;

// ===========================================
// Context Capture
// ===========================================

/**
 * Capture the current encoding context.
 *
 * Creates a snapshot of the current temporal and task context
 * to be stored alongside the memory for later retrieval matching.
 *
 * @param taskType - Optional task type override. If not provided, defaults to 'general'.
 * @param logger - Optional logger for debug output
 * @returns EncodingContext snapshot
 */
export function captureEncodingContext(taskType = 'general', logger: Logger = noopLogger): EncodingContext {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();

  let timeOfDay: TimeOfDay;
  if (hour >= 5 && hour < 12) {
    timeOfDay = 'morning';
  } else if (hour >= 12 && hour < 17) {
    timeOfDay = 'afternoon';
  } else if (hour >= 17 && hour < 21) {
    timeOfDay = 'evening';
  } else {
    timeOfDay = 'night';
  }

  const context: EncodingContext = {
    timeOfDay,
    dayOfWeek,
    taskType: normalizeTaskType(taskType),
  };

  logger.debug?.('Encoding context captured', {
    timeOfDay: context.timeOfDay,
    dayOfWeek: context.dayOfWeek,
    taskType: context.taskType,
  });

  return context;
}

/**
 * Normalize a task type string to a known category.
 */
function normalizeTaskType(taskType: string): string {
  const lower = taskType.toLowerCase().trim();

  if ((KNOWN_TASK_TYPES as readonly string[]).includes(lower)) {
    return lower;
  }

  if (lower.includes('code') || lower.includes('program') || lower.includes('develop')) {
    return 'coding';
  }
  if (lower.includes('write') || lower.includes('writ') || lower.includes('compos') || lower.includes('draft')) {
    return 'writing';
  }
  if (lower.includes('research') || lower.includes('search') || lower.includes('investigate')) {
    return 'research';
  }
  if (lower.includes('email') || lower.includes('chat') || lower.includes('message')) {
    return 'communication';
  }
  if (lower.includes('plan') || lower.includes('organize') || lower.includes('schedule')) {
    return 'planning';
  }
  if (lower.includes('learn') || lower.includes('study') || lower.includes('tutorial')) {
    return 'learning';
  }
  if (lower.includes('design') || lower.includes('creat') || lower.includes('art')) {
    return 'creative';
  }
  if (lower.includes('analy') || lower.includes('evaluat') || lower.includes('assess')) {
    return 'analysis';
  }
  if (lower.includes('review') || lower.includes('audit') || lower.includes('check')) {
    return 'review';
  }

  return 'general';
}

// ===========================================
// Context Similarity
// ===========================================

/**
 * Calculate similarity between an encoding context and the current context.
 *
 * Uses a weighted cosine-like similarity across three dimensions:
 * - Temporal (time of day): 40% weight
 * - Day of week: 20% weight
 * - Task type: 40% weight
 *
 * Returns both raw similarity and the retrieval boost factor.
 * Boost formula: 1.0 + (similarity * 0.3) → max 1.3 (30% boost)
 *
 * @param encodingCtx - The context when the memory was encoded
 * @param currentCtx - The current retrieval context (defaults to captureEncodingContext())
 * @returns ContextSimilarityResult with similarity and boost
 */
export function calculateContextSimilarity(
  encodingCtx: EncodingContext,
  currentCtx?: EncodingContext
): ContextSimilarityResult {
  const current = currentCtx || captureEncodingContext();

  const temporalSim = TIME_SIMILARITY[encodingCtx.timeOfDay]?.[current.timeOfDay] ?? 0.3;
  const daySim = dayOfWeekSimilarity(encodingCtx.dayOfWeek, current.dayOfWeek);
  const taskSim = calculateTaskSimilarity(encodingCtx.taskType, current.taskType);

  const similarity = temporalSim * 0.4 + daySim * 0.2 + taskSim * 0.4;
  const boost = 1.0 + similarity * MAX_CONTEXT_BOOST;

  return {
    similarity: Math.max(0, Math.min(1, similarity)),
    boost: Math.max(1.0, Math.min(1.0 + MAX_CONTEXT_BOOST, boost)),
    dimensions: {
      temporal: temporalSim,
      dayOfWeek: daySim,
      taskType: taskSim,
    },
  };
}

/**
 * Calculate task type similarity.
 * Exact match = 1.0, related tasks = 0.5, unrelated = 0.1
 */
function calculateTaskSimilarity(task1: string, task2: string): number {
  if (task1 === task2) { return 1.0; }

  const RELATED_TASKS: Record<string, string[]> = {
    coding: ['review', 'analysis'],
    writing: ['creative', 'communication'],
    research: ['learning', 'analysis'],
    communication: ['writing', 'planning'],
    planning: ['analysis', 'communication'],
    learning: ['research', 'general'],
    creative: ['writing', 'general'],
    analysis: ['research', 'coding', 'review'],
    review: ['coding', 'analysis'],
    general: ['learning', 'creative'],
  };

  const related1 = RELATED_TASKS[task1] || [];
  const related2 = RELATED_TASKS[task2] || [];

  if (related1.includes(task2) || related2.includes(task1)) {
    return 0.5;
  }

  return 0.1;
}

/**
 * Serialize an EncodingContext to a JSON-compatible object for storage.
 */
export function serializeContext(ctx: EncodingContext): Record<string, unknown> {
  return {
    timeOfDay: ctx.timeOfDay,
    dayOfWeek: ctx.dayOfWeek,
    taskType: ctx.taskType,
  };
}

/**
 * Deserialize an EncodingContext from a stored JSON value.
 */
export function deserializeContext(data: unknown): EncodingContext | null {
  if (!data || typeof data !== 'object') { return null; }

  const obj = data as Record<string, unknown>;
  const timeOfDay = obj.timeOfDay as TimeOfDay | undefined;
  const dayOfWeek = obj.dayOfWeek as number | undefined;
  const taskType = obj.taskType as string | undefined;

  if (!timeOfDay || dayOfWeek === undefined) { return null; }

  return {
    timeOfDay,
    dayOfWeek,
    taskType: taskType || 'general',
  };
}
