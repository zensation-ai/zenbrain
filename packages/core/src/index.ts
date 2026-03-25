// Interfaces
export type {
  StorageAdapter,
  QueryResult,
} from './interfaces/storage';
export type { EmbeddingProvider } from './interfaces/embedding';
export type { LLMProvider, GenerateOptions } from './interfaces/llm';
export type { CacheProvider } from './interfaces/cache';

// Types
export type {
  Logger,
  LayerConfig,
  MemoryFact,
  Episode,
  Procedure,
  CoreMemoryBlock,
  WorkingMemorySlot,
} from './types';
export { noopLogger, cosineSimilarity, formatForPgVector } from './types';

// Memory Layers
export { WorkingMemory, type WorkingMemoryConfig } from './layers/working';
export { ShortTermMemory, type ShortTermMemoryConfig, type Interaction } from './layers/short-term';
export { EpisodicMemory, type EpisodicMemoryConfig } from './layers/episodic';
export { SemanticMemory, type SemanticMemoryConfig } from './layers/semantic';
export { ProceduralMemory, type ProceduralMemoryConfig } from './layers/procedural';
export { CoreMemory, type CoreMemoryConfig } from './layers/core';
export { CrossContextMemory, type CrossContextConfig, type MergeCandidate } from './layers/cross-context';

// Coordinator
export {
  MemoryCoordinator,
  type CoordinatorConfig,
  type StoreOptions,
  type RecallOptions,
  type RecallResult,
  type ConsolidationResult,
  type MemoryHealth,
} from './coordinator';

// Testing utilities
export { InMemoryStorage, FakeEmbeddingProvider, InMemoryCache } from './testing';
