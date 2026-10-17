/**
 * Layer 5: Procedural Memory
 *
 * "How to do X" — stores workflows, tool sequences, and skill knowledge.
 * Inspired by procedural memory in cognitive psychology (knowing how vs knowing what).
 */
import type { StorageAdapter } from '../interfaces/storage';
import type { EmbeddingProvider } from '../interfaces/embedding';
import { type Procedure, type Logger, noopLogger, formatForPgVector, toUnitScore } from '../types';
import { rankByLexicalRelevance, LEXICAL_CANDIDATE_WINDOW } from '../lexical';
import { assertSqlIdentifier } from '../sql-identifier';

export interface ProceduralMemoryConfig {
  storage: StorageAdapter;
  embedding?: EmbeddingProvider;
  tableName?: string;
  logger?: Logger;
}

interface ProcedureRow {
  id: string;
  trigger: string;
  steps: unknown;
  tools: unknown;
  outcome: string;
  success_rate: number;
  execution_count: number;
  created_at: string;
  score?: number;
}

/**
 * A list column as strings. SQLite hands `steps` and `tools` back as JSON text, PostgreSQL
 * (JSONB) as an already parsed array; anything unreadable counts as empty. Parsing the
 * PostgreSQL array again turned it into its comma-joined text and threw, so every procedure
 * failed to store and to recall on PostgreSQL (found by the real-PostgreSQL CI suite).
 */
function readList(value: unknown): string[] {
  let list: unknown = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(list) ? list.map(String) : [];
}

function rowToProcedure(row: ProcedureRow): Procedure {
  return {
    id: row.id,
    trigger: row.trigger,
    steps: readList(row.steps),
    tools: readList(row.tools),
    outcome: row.outcome,
    successRate: row.success_rate,
    executionCount: row.execution_count,
    createdAt: new Date(row.created_at),
  };
}

export class ProceduralMemory {
  private readonly storage: StorageAdapter;
  private readonly embedding?: EmbeddingProvider;
  private readonly table: string;
  private readonly log: Logger;

  constructor(config: ProceduralMemoryConfig) {
    this.storage = config.storage;
    this.embedding = config.embedding;
    this.table = assertSqlIdentifier(config.tableName ?? 'procedural_memories', 'tableName');
    this.log = config.logger ?? noopLogger;
  }

  /** Record a new procedure from a completed task. */
  async record(trigger: string, steps: string[], tools: string[], outcome: string): Promise<Procedure> {
    let embStr: string | null = null;
    if (this.embedding) {
      try {
        const emb = await this.embedding.embed(`${trigger} ${outcome}`);
        embStr = formatForPgVector(emb);
      } catch {
        this.log.warn('Failed to generate embedding for procedure');
      }
    }

    const result = await this.storage.query<ProcedureRow>(
      `INSERT INTO ${this.table} (id, trigger, steps, tools, outcome, embedding, success_rate, execution_count, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 1.0, 1, NOW())
       RETURNING *`,
      [trigger, JSON.stringify(steps), JSON.stringify(tools), outcome, embStr]
    );

    this.log.debug(`Recorded procedure: ${trigger}`);
    return rowToProcedure(result.rows[0]);
  }

  /**
   * Recall procedures similar to a query: by vector similarity with an embedding provider,
   * by wording (lexical ranking) without one. The score says how well a procedure matches
   * the query, from 0 to 1, as in every other layer; how well it worked is its
   * `successRate`. When nothing matches, the procedures with the highest success rate come
   * back at score 0.
   */
  async recall(query: string, limit = 3): Promise<(Procedure & { score: number })[]> {
    if (!this.embedding) {
      // This fallback was defensible — "the procedures that work best" is a real answer —
      // but it was query-blind: the same list came back whatever was asked. Lexical
      // relevance now decides WHICH procedures; candidates arrive sorted by success rate,
      // so among equally relevant ones the more reliable comes first. Until 0.6.0 the score
      // was relevance × success rate, and a fallback scored its success rate — up to 1, so
      // an unrelated procedure ranked above every real hit of the other layers.
      const result = await this.storage.query<ProcedureRow>(
        `SELECT * FROM ${this.table} ORDER BY success_rate DESC, execution_count DESC LIMIT $1`,
        [LEXICAL_CANDIDATE_WINDOW]
      );
      const procedures = result.rows.map(rowToProcedure);
      const ranked = rankByLexicalRelevance(
        query,
        procedures,
        p => `${p.trigger} ${p.outcome} ${p.tools.join(' ')}`,
        limit
      );
      if (ranked.length > 0) {
        return ranked.map(({ item, score }) => ({ ...item, score }));
      }
      return procedures.slice(0, limit).map(p => ({ ...p, score: 0 }));
    }

    const queryEmb = await this.embedding.embed(query);
    const embStr = formatForPgVector(queryEmb);

    const result = await this.storage.query<ProcedureRow>(
      `SELECT *, 1 - (embedding <=> $1::vector) as score
       FROM ${this.table}
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [embStr, limit]
    );

    return result.rows.map(r => ({ ...rowToProcedure(r), score: toUnitScore(r.score) }));
  }

  /** Record feedback for a procedure (success/failure). */
  async feedback(procedureId: string, success: boolean): Promise<void> {
    // Incremental average: newRate = oldRate + (result - oldRate) / (count + 1)
    const resultVal = success ? 1.0 : 0.0;
    await this.storage.query(
      `UPDATE ${this.table} SET
        success_rate = success_rate + ($2 - success_rate) / (execution_count + 1),
        execution_count = execution_count + 1
       WHERE id = $1`,
      [procedureId, resultVal]
    );
    this.log.debug(`Procedure ${procedureId} feedback: ${success ? 'success' : 'failure'}`);
  }

  /** List procedures, highest success rate first (default limit 20). */
  async list(limit = 20): Promise<Procedure[]> {
    const result = await this.storage.query<ProcedureRow>(
      `SELECT * FROM ${this.table} ORDER BY success_rate DESC, execution_count DESC LIMIT $1`,
      [limit]
    );
    return result.rows.map(rowToProcedure);
  }

  /** Count all procedures. */
  async count(): Promise<number> {
    const result = await this.storage.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.table}`
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /** One procedure by id, or null. */
  async getById(id: string): Promise<Procedure | null> {
    const result = await this.storage.query<ProcedureRow>(`SELECT * FROM ${this.table} WHERE id = $1`, [id]);
    // Checked again here, so a storage that does not evaluate WHERE cannot return another procedure
    // (case ignored, as PostgreSQL compares uuids).
    const row = result.rows.find(r => String(r.id).toLowerCase() === id.toLowerCase());
    return row ? rowToProcedure(row) : null;
  }

  /** Delete a procedure. */
  async delete(id: string): Promise<boolean> {
    const result = await this.storage.query(
      `DELETE FROM ${this.table} WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
