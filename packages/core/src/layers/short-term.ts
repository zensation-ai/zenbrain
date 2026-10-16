/**
 * Layer 2: Short-Term / Session Memory
 *
 * Maintains conversation context within a single session.
 * Stores recent interactions with automatic sliding window.
 */
import type { StorageAdapter } from '../interfaces/storage';
import { type Logger, noopLogger } from '../types';
import { randomId } from '../id';

export interface Interaction {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ShortTermMemoryConfig {
  /** @deprecated Accepted but never used: sessions live in the process. It will be removed in 1.0. */
  storage?: StorageAdapter;
  maxInteractions?: number;
  logger?: Logger;
}

export class ShortTermMemory {
  private interactions: Interaction[] = [];
  private readonly maxInteractions: number;
  private readonly storage?: StorageAdapter;
  private readonly log: Logger;
  private sessionId?: string;

  constructor(config: ShortTermMemoryConfig = {}) {
    this.maxInteractions = config.maxInteractions ?? 50;
    this.storage = config.storage;
    this.log = config.logger ?? noopLogger;
  }

  /**
   * Start a new session. The id is a label only: the interactions of the current session
   * are cleared, and nothing is loaded for an id used before — a session lives in this
   * process. (Resuming stored sessions is on the roadmap.)
   */
  startSession(sessionId?: string): string {
    this.sessionId = sessionId ?? randomId();
    this.interactions = [];
    return this.sessionId;
  }

  /** Add an interaction to the session. */
  addInteraction(role: Interaction['role'], content: string, metadata?: Record<string, unknown>): void {
    this.interactions.push({
      role,
      content,
      timestamp: new Date(),
      metadata,
    });

    // Sliding window eviction
    if (this.interactions.length > this.maxInteractions) {
      this.interactions = this.interactions.slice(-this.maxInteractions);
    }
  }

  /** Get all interactions in current session. */
  getHistory(): Interaction[] {
    return [...this.interactions];
  }

  /** Get recent N interactions. */
  getRecent(n = 10): Interaction[] {
    return this.interactions.slice(-n);
  }

  /** Format as LLM messages array. */
  toMessages(): Array<{ role: string; content: string }> {
    return this.interactions.map(i => ({
      role: i.role,
      content: i.content,
    }));
  }

  /** Get current session ID. */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /** Clear session. */
  clear(): void {
    this.interactions = [];
  }

  get size(): number {
    return this.interactions.length;
  }
}
