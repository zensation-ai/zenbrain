/**
 * Layer 1: Working Memory
 *
 * Active task focus, inspired by Baddeley's model (1974).
 * Maintains 7±2 slots with relevance-based eviction.
 * Pure in-memory — no storage adapter needed.
 */
import { cosineSimilarity, type WorkingMemorySlot, type Logger, noopLogger } from '../types';
import type { EmbeddingProvider } from '../interfaces/embedding';
import type { CacheProvider } from '../interfaces/cache';

export interface WorkingMemoryConfig {
  maxSlots?: number;
  decayRate?: number;
  embedding?: EmbeddingProvider;
  cache?: CacheProvider;
  logger?: Logger;
}

export class WorkingMemory {
  private slots: WorkingMemorySlot[] = [];
  private readonly maxSlots: number;
  private readonly decayRate: number;
  private readonly embedding?: EmbeddingProvider;
  private readonly cache?: CacheProvider;
  private readonly log: Logger;

  constructor(config: WorkingMemoryConfig = {}) {
    this.maxSlots = config.maxSlots ?? 7;
    this.decayRate = config.decayRate ?? 0.05;
    this.embedding = config.embedding;
    this.cache = config.cache;
    this.log = config.logger ?? noopLogger;
  }

  /** Add a slot to working memory. Evicts lowest-relevance if full. */
  async add(content: string, type: WorkingMemorySlot['type'] = 'fact', relevance = 1.0): Promise<WorkingMemorySlot> {
    let emb: number[] | undefined;
    if (this.embedding) {
      try {
        emb = await this.embedding.embed(content);
      } catch {
        this.log.warn('Failed to generate embedding for working memory slot');
      }
    }

    const slot: WorkingMemorySlot = {
      id: crypto.randomUUID(),
      type,
      content,
      relevance,
      addedAt: new Date(),
      embedding: emb,
    };

    this.slots.push(slot);

    // Evict if over capacity (keep highest relevance)
    if (this.slots.length > this.maxSlots) {
      this.slots.sort((a, b) => b.relevance - a.relevance);
      const evicted = this.slots.pop()!;
      this.log.debug(`Evicted slot: ${evicted.content.substring(0, 50)}`);
    }

    return slot;
  }

  /** Get all current slots. */
  getSlots(): WorkingMemorySlot[] {
    return [...this.slots];
  }

  /** Get slots of a specific type. */
  getByType(type: WorkingMemorySlot['type']): WorkingMemorySlot[] {
    return this.slots.filter(s => s.type === type);
  }

  /** Find the most relevant slot for a query (requires embedding provider). */
  async findRelevant(query: string, topK = 3): Promise<WorkingMemorySlot[]> {
    if (!this.embedding || this.slots.length === 0) {
      return this.slots.slice(0, topK);
    }

    const queryEmb = await this.embedding.embed(query);
    const scored = this.slots
      .filter(s => s.embedding)
      .map(s => ({
        slot: s,
        score: cosineSimilarity(queryEmb, s.embedding!),
      }))
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(s => s.slot);
  }

  /** Apply time-based relevance decay to all slots. */
  decay(): void {
    const now = Date.now();
    for (const slot of this.slots) {
      const ageMs = now - slot.addedAt.getTime();
      const ageMinutes = ageMs / 60_000;
      slot.relevance *= Math.exp(-this.decayRate * ageMinutes);
    }

    // Remove slots below minimum relevance threshold
    const before = this.slots.length;
    this.slots = this.slots.filter(s => s.relevance > 0.01);
    if (this.slots.length < before) {
      this.log.debug(`Decayed ${before - this.slots.length} slots below threshold`);
    }
  }

  /** Boost relevance for a slot (e.g., when re-accessed). */
  boost(slotId: string, amount = 0.2): void {
    const slot = this.slots.find(s => s.id === slotId);
    if (slot) {
      slot.relevance = Math.min(1.0, slot.relevance + amount);
    }
  }

  /** Clear all slots. */
  clear(): void {
    this.slots = [];
  }

  /** Get current slot count. */
  get size(): number {
    return this.slots.length;
  }

  /** Get capacity info. */
  get capacity(): { used: number; max: number; available: number } {
    return {
      used: this.slots.length,
      max: this.maxSlots,
      available: this.maxSlots - this.slots.length,
    };
  }
}
