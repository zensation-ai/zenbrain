/**
 * @zensation/algorithms — Neuroscience-inspired memory algorithms
 *
 * Pure TypeScript. Zero runtime dependencies.
 *
 * @packageDocumentation
 */

// Shared types
export type { Logger } from './types';
export { noopLogger } from './types';

// FSRS Spaced Repetition
export type { FSRSState } from './fsrs';
export {
  TARGET_RETENTION,
  MIN_STABILITY,
  MIN_DIFFICULTY,
  MAX_DIFFICULTY,
  MS_PER_DAY,
  clampDifficulty,
  getRetrievability,
  scheduleNextReview,
  updateAfterRecall,
  updateAfterForgot,
  initFromDecayClass,
  initFromSM2,
  updateStabilityCompat,
  getRetentionProbabilityCompat,
} from './fsrs';

// Ebbinghaus Forgetting Curve
export type {
  RetentionResult,
  RepetitionCandidate,
  UserDecayProfile,
  AccessEvent,
} from './ebbinghaus';
export {
  EBBINGHAUS_CONFIG,
  calculateRetention,
  updateStability,
  getRepetitionCandidates,
  shouldArchive,
  calculateOptimalInterval,
  batchCalculateRetention,
  learnDecayProfile,
  calculatePersonalizedRetention,
} from './ebbinghaus';

// Emotional Tagger
export type {
  EmotionalTag,
  EmotionalWeight,
  ContextualValence,
} from './emotional';
export {
  tagEmotion,
  computeEmotionalWeight,
  isEmotionallySignificant,
  computeContextualValence,
} from './emotional';

// Context-Dependent Retrieval
export type {
  TimeOfDay,
  EncodingContext,
  ContextSimilarityResult,
} from './context-retrieval';
export {
  captureEncodingContext,
  calculateContextSimilarity,
  serializeContext,
  deserializeContext,
} from './context-retrieval';

// Hebbian Learning
export {
  HEBBIAN_CONFIG,
  computeHebbianStrengthening,
  computeHebbianDecay,
  computeHomeostaticNormalization,
  generatePairs,
} from './hebbian';

// Bayesian Confidence Propagation
export {
  PROPAGATION_FACTORS,
  DAMPING,
  MAX_ITERATIONS,
  CHANGE_THRESHOLD,
  propagateForRelation,
  applyDamping,
  isSignificantChange,
} from './bayesian';

// Text Similarity & Negation
export type { NegationResult } from './similarity';
export {
  detectNegation,
  computeStringSimilarity,
  stripNegation,
  safeJsonParse,
} from './similarity';

// Confidence Intervals
export type { ConfidenceInterval } from './intervals';
export { getRetrievabilityWithCI, propagateWithCI } from './intervals';

// Visualization Helpers
export type { CurvePoint, SchedulePoint } from './visualization';
export { generateRetentionCurve, generateScheduleTimeline } from './visualization';

// Sleep Consolidation
export type {
  SleepConsolidationConfig,
  MemoryForConsolidation,
  ReplayedMemory,
  StrengthenedEdge,
  PrunedEdge,
  ConsolidationResult as SleepConsolidationResult,
} from './sleep-consolidation';
export {
  SLEEP_CONSOLIDATION_CONFIG,
  selectForReplay,
  simulateReplay,
  pruneWeakConnections,
} from './sleep-consolidation';
