/**
 * Layer 7: Cross-Context Memory
 *
 * Detects and merges entities across different memory contexts.
 * Uses name similarity (Jaccard) to find duplicate entities.
 *
 * This layer is unique to ZenBrain — most memory systems operate in a single context.
 */
import type { StorageAdapter } from '../interfaces/storage';
import { type Logger, noopLogger } from '../types';
import { computeStringSimilarity } from '@zensation/algorithms/similarity';

export interface CrossContextConfig {
  storage: StorageAdapter;
  contexts: string[];
  similarityThreshold?: number;
  logger?: Logger;
}

export interface MergeCandidate {
  entityA: { context: string; id: string; name: string };
  entityB: { context: string; id: string; name: string };
  similarity: number;
}

export class CrossContextMemory {
  private readonly storage: StorageAdapter;
  private readonly contexts: string[];
  private readonly threshold: number;
  private readonly log: Logger;

  constructor(config: CrossContextConfig) {
    this.storage = config.storage;
    this.contexts = config.contexts;
    this.threshold = config.similarityThreshold ?? 0.7;
    this.log = config.logger ?? noopLogger;
  }

  /**
   * Detect entities that likely refer to the same thing across contexts.
   * Returns merge candidates sorted by similarity (highest first).
   */
  async detectMergeCandidates(entityTable = 'knowledge_entities', limit = 20): Promise<MergeCandidate[]> {
    // Collect entities from all contexts
    const allEntities: Array<{ context: string; id: string; name: string }> = [];

    for (const ctx of this.contexts) {
      const result = await this.storage.query<{ id: string; name: string }>(
        `SELECT id, name FROM ${entityTable} LIMIT 500`
      );
      for (const row of result.rows) {
        allEntities.push({ context: ctx, id: row.id, name: row.name });
      }
    }

    // Compare across contexts
    const candidates: MergeCandidate[] = [];
    for (let i = 0; i < allEntities.length; i++) {
      for (let j = i + 1; j < allEntities.length; j++) {
        const a = allEntities[i];
        const b = allEntities[j];
        if (a.context === b.context) continue; // Same context — skip

        const similarity = computeStringSimilarity(a.name, b.name);
        if (similarity >= this.threshold) {
          candidates.push({ entityA: a, entityB: b, similarity });
        }
      }
    }

    candidates.sort((a, b) => b.similarity - a.similarity);
    this.log.debug(`Found ${candidates.length} cross-context merge candidates`);
    return candidates.slice(0, limit);
  }

  /** Create a link between two cross-context entities. */
  async createLink(entityIdA: string, entityIdB: string, linkTable = 'cross_context_links'): Promise<void> {
    await this.storage.query(
      `INSERT INTO ${linkTable} (id, entity_a, entity_b, created_at)
       VALUES (gen_random_uuid(), $1, $2, NOW())
       ON CONFLICT DO NOTHING`,
      [entityIdA, entityIdB]
    );
    this.log.info(`Cross-context link created: ${entityIdA} <-> ${entityIdB}`);
  }
}
