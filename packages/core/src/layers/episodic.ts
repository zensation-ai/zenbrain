/**
 * Layer 3: Episodic Memory
 *
 * Stores concrete experiences and events.
 * Inspired by Tulving's distinction between episodic and semantic memory (1972).
 * Supports temporal queries, emotional weighting, and similarity search.
 */
import type { StorageAdapter } from '../interfaces/storage';
import type { EmbeddingProvider } from '../interfaces/embedding';
import { type Episode, type Logger, noopLogger, formatForPgVector, toUnitScore } from '../types';
import { rankByLexicalRelevance, LEXICAL_CANDIDATE_WINDOW } from '../lexical';
import { assertSqlIdentifier } from '../sql-identifier';

/**
 * An episode's metadata as an object. SQLite hands the column back as JSON
 * text, PostgreSQL as a parsed value; anything unreadable counts as empty.
 */
function readMetadata(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

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
    this.table = assertSqlIdentifier(config.tableName ?? 'episodic_memories', 'tableName');
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

  /** Whether a consolidation pass has already promoted this episode (see `markConsolidated`). */
  isConsolidated(episode: Episode): boolean {
    return typeof readMetadata(episode.metadata).consolidatedInto === 'string';
  }

  /**
   * Record in the episode's own metadata that it was promoted into a semantic
   * fact, so a later consolidation pass leaves it alone. Both adapters already
   * store `metadata`, so this needs no schema change. Existing keys are kept.
   */
  async markConsolidated(episode: Episode, factId: string): Promise<void> {
    const metadata = { ...readMetadata(episode.metadata), consolidatedInto: factId };
    await this.storage.query(`UPDATE ${this.table} SET metadata = $1 WHERE id = $2`, [
      JSON.stringify(metadata),
      episode.id,
    ]);
  }

  /** The fact a consolidation pass promoted this episode into, if it was promoted (see `markConsolidated`). */
  consolidatedInto(episode: Episode): string | undefined {
    const factId = readMetadata(episode.metadata).consolidatedInto;
    return typeof factId === 'string' ? factId : undefined;
  }

  /** One episode by id, with its metadata, or null. */
  async getById(id: string): Promise<Episode | null> {
    const result = await this.storage.query<Episode>(
      `SELECT id, content, context, created_at as "timestamp", emotional_weight as "emotionalWeight", metadata
       FROM ${this.table} WHERE id = $1`,
      [id]
    );
    // Checked again here, so a storage that does not evaluate WHERE cannot return another episode
    // (case ignored: PostgreSQL compares uuids that way and returns them in lower case).
    return result.rows.find(r => String(r.id).toLowerCase() === id.toLowerCase()) ?? null;
  }

  /**
   * The episodes a consolidation pass promoted into this fact: those whose metadata says
   * `consolidatedInto: <factId>`. Works on databases written before 0.6.0 — the mark is the
   * one record of the edge, and both adapters have stored it since 0.4.8.
   *
   * The database narrows the rows by text (`metadata::text LIKE`, which the SQLite adapter
   * reads as `metadata LIKE`); every row is then checked on its parsed metadata, so a fact id
   * that only occurs somewhere else in the JSON never counts. A storage that rejects the
   * narrowing query gets a scan of every episode with metadata instead.
   */
  async findConsolidatedInto(factId: string): Promise<Episode[]> {
    const columns = `id, content, context, created_at as "timestamp", emotional_weight as "emotionalWeight", metadata`;
    let rows: Episode[];
    try {
      rows = (await this.storage.query<Episode>(
        `SELECT ${columns} FROM ${this.table} WHERE metadata::text LIKE $1`,
        [`%${factId}%`]
      )).rows;
    } catch {
      rows = (await this.storage.query<Episode>(
        `SELECT ${columns} FROM ${this.table} WHERE metadata IS NOT NULL`
      )).rows;
    }
    return rows.filter(r => this.consolidatedInto(r)?.toLowerCase() === factId.toLowerCase());
  }

  /** Search episodes: by vector similarity with an embedding provider, by wording (lexical ranking) without one. */
  async search(query: string, limit = 5): Promise<(Episode & { score: number })[]> {
    if (!this.embedding) {
      // Was: return the most recent episodes and drop the query on the floor. The warning
      // was honest but the behaviour was not useful — see ../lexical.ts for the measurement.
      this.log.warn('No embedding provider — ranking episodes lexically, not semantically');
      const candidates = await this.getRecent(LEXICAL_CANDIDATE_WINDOW);
      const ranked = rankByLexicalRelevance(query, candidates, e => e.content, limit);
      if (ranked.length > 0) {
        return ranked.map(({ item, score }) => ({ ...item, score }));
      }
      return candidates.slice(0, limit).map(e => ({ ...e, score: 0 }));
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

    return result.rows.map(r => ({ ...r, score: toUnitScore(r.score) }));
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
