/**
 * Layer 5: Procedural Memory
 *
 * "How to do X" — stores workflows, tool sequences, and skill knowledge.
 * Inspired by procedural memory in cognitive psychology (knowing how vs knowing what).
 */
import type { StorageAdapter } from '../interfaces/storage';
import type { EmbeddingProvider } from '../interfaces/embedding';
import { type Procedure, type Logger, noopLogger, formatForPgVector } from '../types';

export interface ProceduralMemoryConfig {
  storage: StorageAdapter;
  embedding?: EmbeddingProvider;
  tableName?: string;
  logger?: Logger;
}

interface ProcedureRow {
  id: string;
  trigger: string;
  steps: string;
  tools: string;
  outcome: string;
  success_rate: number;
  execution_count: number;
  created_at: string;
  score?: number;
}

function rowToProcedure(row: ProcedureRow): Procedure {
  return {
    id: row.id,
    trigger: row.trigger,
    steps: JSON.parse(row.steps || '[]'),
    tools: JSON.parse(row.tools || '[]'),
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
    this.table = config.tableName ?? 'procedural_memories';
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

  /** Recall procedures similar to a query. */
  async recall(query: string, limit = 3): Promise<(Procedure & { score: number })[]> {
    if (!this.embedding) {
      const result = await this.storage.query<ProcedureRow>(
        `SELECT * FROM ${this.table} ORDER BY success_rate DESC, execution_count DESC LIMIT $1`,
        [limit]
      );
      return result.rows.map(r => ({ ...rowToProcedure(r), score: r.success_rate }));
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

    return result.rows.map(r => ({ ...rowToProcedure(r), score: r.score ?? 0 }));
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

  /** List all procedures. */
  async list(limit = 20): Promise<Procedure[]> {
    const result = await this.storage.query<ProcedureRow>(
      `SELECT * FROM ${this.table} ORDER BY success_rate DESC, execution_count DESC LIMIT $1`,
      [limit]
    );
    return result.rows.map(rowToProcedure);
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
