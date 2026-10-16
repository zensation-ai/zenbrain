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
import { randomId } from '../id';

export interface WorkingMemoryConfig {
  maxSlots?: number;
  decayRate?: number;
  embedding?: EmbeddingProvider;
  /** @deprecated Accepted but never read or written; it will be removed in 1.0. */
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
  /** When each slot was last decayed, so no minute is counted twice. */
  private readonly lastDecayAt = new Map<string, number>();

  constructor(config: WorkingMemoryConfig = {}) {
    this.maxSlots = config.maxSlots ?? 7;
    this.decayRate = config.decayRate ?? 0.05;
    this.embedding = config.embedding;
    this.cache = config.cache;
    this.log = config.logger ?? noopLogger;
  }

  /**
   * Add a slot to working memory. If that makes it overfull, the least relevant
   * slot is evicted; among equally relevant slots the oldest goes. A new slot is
   * only evicted itself if it is less relevant than every slot it would join.
   *
   * @throws RangeError if relevance is not a number from 0 to 1
   */
  async add(content: string, type: WorkingMemorySlot['type'] = 'fact', relevance = 1.0): Promise<WorkingMemorySlot> {
    if (typeof relevance !== 'number' || !(relevance >= 0 && relevance <= 1)) {
      throw new RangeError(`WorkingMemory.add: relevance must be a number from 0 to 1, got ${relevance}`);
    }
    let emb: number[] | undefined;
    if (this.embedding) {
      try {
        emb = await this.embedding.embed(content);
      } catch {
        this.log.warn('Failed to generate embedding for working memory slot');
      }
    }

    const slot: WorkingMemorySlot = {
      id: randomId(),
      type,
      content,
      relevance,
      addedAt: new Date(),
      embedding: emb,
    };

    this.slots.push(slot);

    // Evict if over capacity. Slots stay in insertion order, so the first of the
    // least relevant is the oldest. (Sorting by relevance and popping the last one
    // evicted the NEW slot whenever all were tied, which every store at 1.0 is.)
    if (this.slots.length > this.maxSlots) {
      let victim = 0;
      for (let i = 1; i < this.slots.length; i++) {
        if (this.slots[i].relevance < this.slots[victim].relevance) victim = i;
      }
      const [evicted] = this.slots.splice(victim, 1);
      this.lastDecayAt.delete(evicted.id);
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

  /**
   * Find the slots most similar to a query. This needs an embedding provider;
   * without one the query is not used and the most relevant slots come back,
   * newest first among equals.
   */
  async findRelevant(query: string, topK = 3): Promise<WorkingMemorySlot[]> {
    if (!this.embedding || this.slots.length === 0) {
      return this.slots
        .map((slot, order) => ({ slot, order }))
        .sort((a, b) => b.slot.relevance - a.slot.relevance || b.order - a.order)
        .slice(0, topK)
        .map(s => s.slot);
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

  /**
   * Apply time-based relevance decay to all slots: each slot is multiplied by
   * e^(-decayRate * minutes) for the minutes since it was last decayed, or since
   * it was added. Calling this twice at the same moment decays nothing the second
   * time, so a slot's lifetime does not depend on how often decay runs. Slots at
   * a relevance of 0.01 or below are removed.
   */
  decay(): void {
    const now = Date.now();
    for (const slot of this.slots) {
      const since = this.lastDecayAt.get(slot.id) ?? slot.addedAt.getTime();
      const minutes = Math.max(0, now - since) / 60_000;
      slot.relevance *= Math.exp(-this.decayRate * minutes);
      this.lastDecayAt.set(slot.id, now);
    }

    // Remove slots below minimum relevance threshold
    const before = this.slots.length;
    this.slots = this.slots.filter(s => s.relevance > 0.01);
    for (const id of this.lastDecayAt.keys()) {
      if (!this.slots.some(s => s.id === id)) this.lastDecayAt.delete(id);
    }
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

  /** Remove one slot. Returns `true` if a slot with that id existed. */
  remove(slotId: string): boolean {
    const before = this.slots.length;
    this.slots = this.slots.filter(s => s.id !== slotId);
    this.lastDecayAt.delete(slotId);
    return this.slots.length < before;
  }

  /** Clear all slots. */
  clear(): void {
    this.slots = [];
    this.lastDecayAt.clear();
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
