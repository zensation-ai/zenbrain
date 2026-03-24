/**
 * Layer 4: Semantic Long-Term Memory
 *
 * Facts with FSRS spaced repetition scheduling.
 * Facts are stored with confidence scores, access patterns, and embeddings.
 * Uses @zensation/algorithms for FSRS scheduling and Ebbinghaus retention.
 */
import type { StorageAdapter } from '../interfaces/storage';
import type { EmbeddingProvider } from '../interfaces/embedding';
import { type MemoryFact, type Logger, noopLogger, formatForPgVector } from '../types';
import { getRetrievability, updateAfterRecall, updateAfterForgot, initFromDecayClass } from '@zensation/algorithms/fsrs';

export interface SemanticMemoryConfig {
  storage: StorageAdapter;
  embedding?: EmbeddingProvider;
  tableName?: string;
  logger?: Logger;
}

interface FactRow {
  id: string;
  content: string;
  confidence: number;
  source: string;
  created_at: string;
  last_accessed: string | null;
  access_count: number;
  fsrs_difficulty: number | null;
  fsrs_stability: number | null;
  fsrs_next_review: string | null;
  score?: number;
}

function rowToFact(row: FactRow): MemoryFact {
  return {
    id: row.id,
    content: row.content,
    confidence: row.confidence,
    source: row.source,
    createdAt: new Date(row.created_at),
    lastAccessed: row.last_accessed ? new Date(row.last_accessed) : undefined,
    accessCount: row.access_count,
  };
}

export class SemanticMemory {
  private readonly storage: StorageAdapter;
  private readonly embedding?: EmbeddingProvider;
  private readonly table: string;
  private readonly log: Logger;

  constructor(config: SemanticMemoryConfig) {
    this.storage = config.storage;
    this.embedding = config.embedding;
    this.table = config.tableName ?? 'learned_facts';
    this.log = config.logger ?? noopLogger;
  }

  /** Store a new fact with FSRS initial scheduling. */
  async storeFact(content: string, source: string, confidence = 0.7): Promise<MemoryFact> {
    let embStr: string | null = null;
    if (this.embedding) {
      try {
        const emb = await this.embedding.embed(content);
        embStr = formatForPgVector(emb);
      } catch {
        this.log.warn('Failed to generate embedding for fact');
      }
    }

    const fsrs = initFromDecayClass('normal_decay');

    const result = await this.storage.query<FactRow>(
      `INSERT INTO ${this.table} (id, content, confidence, source, embedding,
        fsrs_difficulty, fsrs_stability, fsrs_next_review,
        access_count, created_at, last_accessed)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 0, NOW(), NOW())
       RETURNING *`,
      [content, confidence, source, embStr, fsrs.difficulty, fsrs.stability, fsrs.nextReview]
    );

    this.log.debug(`Stored fact: ${content.substring(0, 60)}`);
    return rowToFact(result.rows[0]);
  }

  /** Retrieve facts by semantic similarity. */
  async search(query: string, limit = 5): Promise<(MemoryFact & { score: number })[]> {
    if (!this.embedding) {
      return this.getRecent(limit).then(facts => facts.map(f => ({ ...f, score: 0 })));
    }

    const queryEmb = await this.embedding.embed(query);
    const embStr = formatForPgVector(queryEmb);

    const result = await this.storage.query<FactRow>(
      `SELECT *, 1 - (embedding <=> $1::vector) as score
       FROM ${this.table}
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [embStr, limit]
    );

    return result.rows.map(row => ({ ...rowToFact(row), score: row.score ?? 0 }));
  }

  /** Get recent facts. */
  async getRecent(limit = 10): Promise<MemoryFact[]> {
    const result = await this.storage.query<FactRow>(
      `SELECT * FROM ${this.table} ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows.map(rowToFact);
  }

  /** Record a recall event (FSRS update). */
  async recordRecall(factId: string, grade: number): Promise<void> {
    const result = await this.storage.query<FactRow>(
      `SELECT * FROM ${this.table} WHERE id = $1`,
      [factId]
    );
    const row = result.rows[0];
    if (!row) return;

    const state = {
      difficulty: row.fsrs_difficulty ?? 5,
      stability: row.fsrs_stability ?? 1,
      nextReview: row.fsrs_next_review ? new Date(row.fsrs_next_review) : new Date(),
    };

    const retrievability = getRetrievability(state);
    const updated = grade >= 3
      ? updateAfterRecall(state, grade, retrievability)
      : updateAfterForgot(state, retrievability);

    await this.storage.query(
      `UPDATE ${this.table} SET
        fsrs_difficulty = $2, fsrs_stability = $3, fsrs_next_review = $4,
        access_count = access_count + 1, last_accessed = NOW()
       WHERE id = $1`,
      [factId, updated.difficulty, updated.stability, updated.nextReview]
    );

    this.log.debug(`Recall recorded for fact ${factId}: grade=${grade}, next=${updated.nextReview}`);
  }

  /** Get facts due for review (FSRS scheduling). */
  async getDueForReview(limit = 10): Promise<MemoryFact[]> {
    const result = await this.storage.query<FactRow>(
      `SELECT * FROM ${this.table}
       WHERE fsrs_next_review IS NOT NULL AND fsrs_next_review <= NOW()
       ORDER BY fsrs_next_review ASC LIMIT $1`,
      [limit]
    );
    return result.rows.map(rowToFact);
  }

  /** Delete a fact. */
  async delete(factId: string): Promise<boolean> {
    const result = await this.storage.query(
      `DELETE FROM ${this.table} WHERE id = $1`,
      [factId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Count total facts. */
  async count(): Promise<number> {
    const result = await this.storage.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.table}`
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }
}
