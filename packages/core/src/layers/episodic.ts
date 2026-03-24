/**
 * Layer 3: Episodic Memory
 *
 * Stores concrete experiences and events.
 * Inspired by Tulving's distinction between episodic and semantic memory (1972).
 * Supports temporal queries, emotional weighting, and similarity search.
 */
import type { StorageAdapter } from '../interfaces/storage';
import type { EmbeddingProvider } from '../interfaces/embedding';
import { type Episode, type Logger, noopLogger, formatForPgVector, cosineSimilarity } from '../types';

export interface EpisodicMemoryConfig {
  storage: StorageAdapter;
  embedding?: EmbeddingProvider;
  tableName?: string;
  logger?: Logger;
}

export class EpisodicMemory {
  private readonly storage: StorageAdapter;
  private readonly embedding?: EmbeddingProvider;
  private readonly table: string;
  private readonly log: Logger;

  constructor(config: EpisodicMemoryConfig) {
    this.storage = config.storage;
    this.embedding = config.embedding;
    this.table = config.tableName ?? 'episodic_memories';
    this.log = config.logger ?? noopLogger;
  }

  /** Store a new episode. */
  async store(content: string, context?: string, emotionalWeight?: number, metadata?: Record<string, unknown>): Promise<Episode> {
    let embedding: number[] | undefined;
    if (this.embedding) {
      try {
        embedding = await this.embedding.embed(content);
      } catch (err) {
        this.log.warn('Failed to generate embedding for episode');
      }
    }

    const embParam = embedding ? formatForPgVector(embedding) : null;

    const result = await this.storage.query<Episode>(
      `INSERT INTO ${this.table} (id, content, context, embedding, emotional_weight, metadata, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
       RETURNING id, content, context, created_at as "timestamp", emotional_weight as "emotionalWeight"`,
      [content, context ?? null, embParam, emotionalWeight ?? null, metadata ? JSON.stringify(metadata) : null]
    );

    this.log.debug(`Stored episode: ${content.substring(0, 60)}`);
    return { ...result.rows[0], embedding };
  }

  /** Retrieve recent episodes, optionally filtered by context. */
  async getRecent(limit = 10, context?: string): Promise<Episode[]> {
    const params: unknown[] = [limit];
    let whereClause = '';
    if (context) {
      whereClause = 'WHERE context = $2';
      params.push(context);
    }

    const result = await this.storage.query<Episode>(
      `SELECT id, content, context, created_at as "timestamp", emotional_weight as "emotionalWeight", metadata
       FROM ${this.table} ${whereClause}
       ORDER BY created_at DESC LIMIT $1`,
      params
    );
    return result.rows;
  }

  /** Search episodes by semantic similarity (requires embedding provider). */
  async search(query: string, limit = 5): Promise<(Episode & { score: number })[]> {
    if (!this.embedding) {
      this.log.warn('No embedding provider — falling back to recent episodes');
      const recent = await this.getRecent(limit);
      return recent.map(e => ({ ...e, score: 0 }));
    }

    const queryEmb = await this.embedding.embed(query);
    const embStr = formatForPgVector(queryEmb);

    // Use pgvector cosine distance operator
    const result = await this.storage.query<Episode & { score: number }>(
      `SELECT id, content, context, created_at as "timestamp", emotional_weight as "emotionalWeight",
              1 - (embedding <=> $1::vector) as score
       FROM ${this.table}
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [embStr, limit]
    );

    return result.rows;
  }

  /** Get episodes within a time range. */
  async getByTimeRange(start: Date, end: Date, limit = 50): Promise<Episode[]> {
    const result = await this.storage.query<Episode>(
      `SELECT id, content, context, created_at as "timestamp", emotional_weight as "emotionalWeight"
       FROM ${this.table}
       WHERE created_at >= $1 AND created_at <= $2
       ORDER BY created_at DESC LIMIT $3`,
      [start, end, limit]
    );
    return result.rows;
  }

  /** Count total episodes. */
  async count(): Promise<number> {
    const result = await this.storage.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.table}`
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /** Delete an episode by ID. */
  async delete(id: string): Promise<boolean> {
    const result = await this.storage.query(
      `DELETE FROM ${this.table} WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
