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

// Uncertainty bands (heuristic, Wald-type; the type keeps its name ConfidenceInterval)
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

// ─── Advanced algorithms (v0.3.0) ───────────────────────────────────────

// vmPFC Prediction-Error FSRS ()
export type { VmPFCConfig } from './fsrs-vmPFC';
export {
  VMPFC_DEFAULTS,
  computeKGPredictionError,
  computeReEncodingFactor,
  computeAdaptiveFSRSInterval,
  recordNaturalRecall,
} from './fsrs-vmPFC';

// Two-Factor Synaptic Hebbian ()
export type { TwoFactorEdge } from './hebbian-two-factor';
export {
  TWO_FACTOR_DEFAULTS,
  createTwoFactorEdge,
  hebbianUpdateTwoFactor,
  getImportance,
  computeEWCPenalty,
  decayTwoFactor,
  fromLegacyEdge,
} from './hebbian-two-factor';

// Simulation-Selection Sleep ()
export type {
  AblationRegistry,
  ReplayCandidate,
  SelectionResult,
  SleepCycleResult,
  SleepConfig,
} from './sleep-simulation-selection';
export {
  SLEEP_DEFAULTS,
  generateReplayCandidates,
  computeTagScore,
  scoreByTDValue,
  selectAndApply,
} from './sleep-simulation-selection';

// Spectral KG Health ()
export type { SpectralReport } from './spectral-health';
export {
  computeLaplacian,
  computeFiedlerValue,
  computeSpectralHealth,
} from './spectral-health';

// Information Bottleneck Budget ()
export type { IBEpisode, IBContext } from './ib-budget';
export {
  IB_BETA,
  ibShouldRetain,
  estimateCompressionCost,
  estimateRelevanceGain,
  ibFilterEpisodes,
} from './ib-budget';

// Dopamine-Modulated Retrieval Routing
export type {
  RetrievalRoute,
  DifficultySignal,
  DopamineRoutingOptions,
  DopamineRoutingContext,
} from './dopamine-routing';
export { routeRetrieval, routeToHybridOptions } from './dopamine-routing';

// Hopfield Short-Term Memory
export type {
  HopfieldPattern,
  HopfieldOptions,
  HopfieldRecallResult,
} from './hopfield-stm';
export {
  hopfieldUpdate,
  hopfieldEnergy,
  hopfieldRecall,
  topKHopfieldMatches,
} from './hopfield-stm';

// Personalized PageRank
export type {
  WeightedEdge,
  PPRGraph,
  PPROptions,
  PPRResult,
  RankedNode,
} from './personalized-pagerank';
export {
  personalizedPageRank,
  topKByPageRank,
  undirectedToDirected,
} from './personalized-pagerank';

// Surprise-Gradient Memory (a surprise EMA, inspired by Titans and the free-energy principle)
export type {
  SurpriseObservation,
  VFEUpdateOptions,
  RetrievalBoostOptions,
  EncodingIntervalOptions,
} from './surprise-gradient-memory';
export {
  computeVFEContribution,
  updateVFEDelta,
  batchUpdateVFEDeltas,
  applyVFERetrievalBoost,
  applyVFEIntervalShrink,
} from './surprise-gradient-memory';

// Temporal Multi-Route Retrieval
export type {
  TemporalRouteKind,
  OrderingHint,
  TemporalSubQuery,
  DecomposedTemporalQuery,
  RouteHit,
  RouteResult,
  FuseRoutesOptions,
  FusedHit,
  RouteRunner,
} from './temporal-multi-route';
export { decomposeTemporalQuery } from './temporal-multi-route';
