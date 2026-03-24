/**
 * Layer 6: Core Memory
 *
 * Pinned, user-editable memory blocks (Letta/MemGPT pattern).
 * Always loaded into context. Never decays. User controls content.
 */
import type { StorageAdapter } from '../interfaces/storage';
import { type CoreMemoryBlock, type Logger, noopLogger } from '../types';

export interface CoreMemoryConfig {
  storage: StorageAdapter;
  tableName?: string;
  logger?: Logger;
}

export class CoreMemory {
  private readonly storage: StorageAdapter;
  private readonly table: string;
  private readonly log: Logger;

  constructor(config: CoreMemoryConfig) {
    this.storage = config.storage;
    this.table = config.tableName ?? 'core_memory_blocks';
    this.log = config.logger ?? noopLogger;
  }

  /** Get all core memory blocks. */
  async getBlocks(): Promise<CoreMemoryBlock[]> {
    const result = await this.storage.query<CoreMemoryBlock>(
      `SELECT id, label, content, pinned, updated_at as "updatedAt"
       FROM ${this.table} ORDER BY label`
    );
    return result.rows;
  }

  /** Get a single block by label. */
  async getBlock(label: string): Promise<CoreMemoryBlock | null> {
    const result = await this.storage.query<CoreMemoryBlock>(
      `SELECT id, label, content, pinned, updated_at as "updatedAt"
       FROM ${this.table} WHERE label = $1`,
      [label]
    );
    return result.rows[0] ?? null;
  }

  /** Update or create a core memory block. */
  async upsertBlock(label: string, content: string, pinned = true): Promise<CoreMemoryBlock> {
    const result = await this.storage.query<CoreMemoryBlock>(
      `INSERT INTO ${this.table} (id, label, content, pinned, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW())
       ON CONFLICT (label) DO UPDATE SET content = $2, pinned = $3, updated_at = NOW()
       RETURNING id, label, content, pinned, updated_at as "updatedAt"`,
      [label, content, pinned]
    );
    this.log.info(`Core memory block upserted: ${label}`);
    return result.rows[0];
  }

  /** Delete a core memory block. */
  async deleteBlock(label: string): Promise<boolean> {
    const result = await this.storage.query(
      `DELETE FROM ${this.table} WHERE label = $1`,
      [label]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Get all blocks formatted as context for LLM system prompt. */
  async assembleContext(): Promise<string> {
    const blocks = await this.getBlocks();
    if (blocks.length === 0) return '';

    return blocks
      .map(b => `[${b.label}]: ${b.content}`)
      .join('\n');
  }
}
