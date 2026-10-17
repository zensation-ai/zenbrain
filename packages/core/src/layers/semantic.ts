/**
 * Layer 4: Semantic Long-Term Memory
 *
 * Facts with FSRS spaced repetition scheduling.
 * Facts are stored with confidence scores, access patterns, and embeddings.
 * Uses @zensation/algorithms for FSRS scheduling and Ebbinghaus retention.
 */
import type { StorageAdapter } from '../interfaces/storage';
import type { EmbeddingProvider } from '../interfaces/embedding';
import { type MemoryFact, type Logger, noopLogger, formatForPgVector, toUnitScore } from '../types';
import { getRetrievability, updateAfterRecall, updateAfterForgot, initFromDecayClass } from '@zensation/algorithms/fsrs';
import { rankByLexicalRelevance, LEXICAL_CANDIDATE_WINDOW } from '../lexical';
import { assertSqlIdentifier } from '../sql-identifier';

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
    this.table = assertSqlIdentifier(config.tableName ?? 'learned_facts', 'tableName');
    this.log = config.logger ?? noopLogger;
  }

  /**
   * Store a new fact with FSRS initial scheduling.
   *
   * An `emotionalWeight` (0 to 1) multiplies the starting stability by `1 + emotionalWeight`
   * (the `initFromDecayClass` multiplier): 7 without a weight, up to 14 at 1. The first review
   * comes after about 0.105 × stability days (≈ 0.7 and ≈ 1.5 days). It acts once, at creation, through the FSRS columns; the
   * weight itself is not stored with the fact.
   *
   * @throws RangeError if emotionalWeight is not a number from 0 to 1
   */
  async storeFact(content: string, source: string, confidence = 0.7, emotionalWeight?: number): Promise<MemoryFact> {
    if (emotionalWeight !== undefined && (typeof emotionalWeight !== 'number' || !(emotionalWeight >= 0 && emotionalWeight <= 1))) {
      throw new RangeError(`storeFact: emotionalWeight must be a number from 0 to 1, got ${emotionalWeight}`);
    }
    let embStr: string | null = null;
    if (this.embedding) {
      try {
        const emb = await this.embedding.embed(content);
        embStr = formatForPgVector(emb);
      } catch {
        this.log.warn('Failed to generate embedding for fact');
      }
    }

    const fsrs = initFromDecayClass('normal_decay', 1 + (emotionalWeight ?? 0));

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

  /**
   * A fact with exactly this content — and this source, if one is given — or
   * null. The match is checked again on the returned rows, so a storage that
   * does not evaluate WHERE (like the in-memory test double) cannot turn any
   * fact into a match.
   */
  async findExact(content: string, source?: string): Promise<MemoryFact | null> {
    const result = await this.storage.query<FactRow>(
      source === undefined
        ? `SELECT * FROM ${this.table} WHERE content = $1 LIMIT 1`
        : `SELECT * FROM ${this.table} WHERE content = $1 AND source = $2 LIMIT 1`,
      source === undefined ? [content] : [content, source]
    );
    const row = result.rows.find(
      (r) => r.content === content && (source === undefined || r.source === source)
    );
    return row ? rowToFact(row) : null;
  }

  /** One fact by id, or null. */
  async getById(id: string): Promise<MemoryFact | null> {
    const result = await this.storage.query<FactRow>(`SELECT * FROM ${this.table} WHERE id = $1`, [id]);
    // Checked again here, so a storage that does not evaluate WHERE cannot return another fact.
    const row = result.rows.find(r => r.id === id);
    return row ? rowToFact(row) : null;
  }

  /** Retrieve facts: by vector similarity with an embedding provider, by wording (lexical ranking) without one. */
  async search(query: string, limit = 5): Promise<(MemoryFact & { score: number })[]> {
    if (!this.embedding) {
      return this.lexicalSearch(query, limit);
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

    return result.rows.map(row => ({ ...rowToFact(row), score: toUnitScore(row.score) }));
  }

  /**
   * Non-vector retrieval: rank a bounded recency window by lexical relevance.
   *
   * This branch used to hand back `getRecent()` with `score: 0`, discarding the query.
   * Every user without an embedding provider lands here — among them the default
   * `npx @zensation/mcp` install, which answered every question with the same rows.
   *
   * A score of 0 now carries information: it means nothing matched lexically, and the
   * rows are the recency fallback. Before, 0 meant "this path does not rank at all".
   */
  private async lexicalSearch(query: string, limit: number): Promise<(MemoryFact & { score: number })[]> {
    const result = await this.storage.query<FactRow>(
      `SELECT * FROM ${this.table} ORDER BY created_at DESC LIMIT $1`,
      [LEXICAL_CANDIDATE_WINDOW]
    );
    const facts = result.rows.map(rowToFact);
    const ranked = rankByLexicalRelevance(query, facts, f => f.content, limit);
    if (ranked.length > 0) {
      return ranked.map(({ item, score }) => ({ ...item, score }));
    }
    // Nothing matched. Recency keeps a recall from coming back empty for a reason the
    // caller cannot see, and the zero score says plainly that the query did not land.
    return facts.slice(0, limit).map(f => ({ ...f, score: 0 }));
  }

  /** Get recent facts. */
  async getRecent(limit = 10): Promise<MemoryFact[]> {
    const result = await this.storage.query<FactRow>(
      `SELECT * FROM ${this.table} ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows.map(rowToFact);
  }

  /**
   * Record a review of a fact and update its FSRS state.
   *
   * @param grade - An integer from 1 to 5. 1 and 2 count as forgotten (stability falls),
   *   3 to 5 as recalled (3 neutral, 5 perfect). Anything else throws a RangeError.
   * @returns `true` if the fact exists and was updated, `false` if there is no fact with that id.
   */
  async recordRecall(factId: string, grade: number): Promise<boolean> {
    if (!Number.isInteger(grade) || grade < 1 || grade > 5) {
      throw new RangeError(`recordRecall: grade must be an integer from 1 to 5, got ${grade}`);
    }
    const result = await this.storage.query<FactRow>(
      `SELECT * FROM ${this.table} WHERE id = $1`,
      [factId]
    );
    const row = result.rows[0];
    if (!row) return false;

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
    return true;
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

  /** Count the facts whose FSRS review is due (the same condition as `getDueForReview`). */
  async countDueForReview(): Promise<number> {
    const result = await this.storage.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.table}
       WHERE fsrs_next_review IS NOT NULL AND fsrs_next_review <= NOW()`
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }
}
