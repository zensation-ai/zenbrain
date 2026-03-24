/**
 * Shared types for the ZenBrain core memory system.
 */

/** Optional logger interface. Pass `console` or your favorite logger. */
export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

/** No-op logger (default when no logger is provided). */
export const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/** Configuration for a memory layer. */
export interface LayerConfig {
  storage: import('./interfaces/storage').StorageAdapter;
  embedding?: import('./interfaces/embedding').EmbeddingProvider;
  llm?: import('./interfaces/llm').LLMProvider;
  cache?: import('./interfaces/cache').CacheProvider;
  logger?: Logger;
}

/** A stored memory fact with metadata. */
export interface MemoryFact {
  id: string;
  content: string;
  confidence: number;
  source: string;
  createdAt: Date;
  lastAccessed?: Date;
  accessCount: number;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

/** A stored episode (concrete experience). */
export interface Episode {
  id: string;
  content: string;
  context?: string;
  timestamp: Date;
  embedding?: number[];
  emotionalWeight?: number;
  metadata?: Record<string, unknown>;
}

/** A procedural memory (how-to knowledge). */
export interface Procedure {
  id: string;
  trigger: string;
  steps: string[];
  tools: string[];
  outcome: string;
  successRate: number;
  executionCount: number;
  createdAt: Date;
  embedding?: number[];
}

/** A core memory block (pinned, user-editable). */
export interface CoreMemoryBlock {
  id: string;
  label: string;
  content: string;
  pinned: boolean;
  updatedAt: Date;
}

/** Working memory slot (active task focus, 7±2 items). */
export interface WorkingMemorySlot {
  id: string;
  type: 'fact' | 'context' | 'goal' | 'constraint';
  content: string;
  relevance: number;
  addedAt: Date;
  embedding?: number[];
}

/** Cosine similarity between two vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** Format a number[] vector for PostgreSQL pgvector storage. */
export function formatForPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
