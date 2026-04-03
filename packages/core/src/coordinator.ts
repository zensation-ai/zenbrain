/**
 * MemoryCoordinator — Orchestrates all 7 memory layers into a cohesive cognitive system.
 *
 * This is the primary entry point for using ZenBrain. It routes content to the
 * appropriate memory layer, performs cross-layer recall with ranked results,
 * handles memory consolidation (episodic → semantic), and manages decay cycles.
 *
 * Inspired by the global workspace theory (Baars, 1988) — the coordinator acts
 * as a "conscious workspace" that integrates information across memory systems.
 *
 * @packageDocumentation
 */
import type { StorageAdapter } from './interfaces/storage';
import type { EmbeddingProvider } from './interfaces/embedding';
import type { LLMProvider } from './interfaces/llm';
import type { CacheProvider } from './interfaces/cache';
import { type Logger, noopLogger } from './types';
import { WorkingMemory } from './layers/working';
import { ShortTermMemory } from './layers/short-term';
import { EpisodicMemory } from './layers/episodic';
import { SemanticMemory } from './layers/semantic';
import { ProceduralMemory } from './layers/procedural';
import { CoreMemory } from './layers/core';
import { CrossContextMemory } from './layers/cross-context';
import { tagEmotion, computeEmotionalWeight } from '@zensation/algorithms/emotional';
import { captureEncodingContext, calculateContextSimilarity } from '@zensation/algorithms/context-retrieval';

// ===========================================
// Types
// ===========================================

export interface CoordinatorConfig {
  /** Storage adapter for persistent memory layers. */
  storage: StorageAdapter;
  /** Embedding provider for semantic search. Optional — layers degrade gracefully without it. */
  embedding?: EmbeddingProvider;
  /** LLM provider for consolidation summaries. Optional. */
  llm?: LLMProvider;
  /** Cache provider for working memory persistence. Optional. */
  cache?: CacheProvider;
  /** Context domains for cross-context memory. Defaults to ['personal', 'work', 'learning', 'creative']. */
  contexts?: string[];
  /** Logger instance. Defaults to no-op. */
  logger?: Logger;
}

export interface StoreOptions {
  /** Routing hint: which layer to target. 'auto' uses content heuristics. */
  type?: 'auto' | 'fact' | 'episode' | 'procedure' | 'core';
  /** Context domain (e.g., 'work', 'personal'). */
  context?: string;
  /** Emotional weight override (0-1). If not provided, auto-detected from content. */
  emotionalWeight?: number;
  /** Confidence score (0-1). High confidence (>0.9) routes to core memory. */
  confidence?: number;
  /** Source attribution (e.g., 'user', 'ai', 'import'). */
  source?: string;
  /** Steps for procedural memory. Required when type='procedure'. */
  steps?: string[];
  /** Tools used in the procedure. */
  tools?: string[];
  /** Expected outcome of the procedure. */
  outcome?: string;
}

export interface RecallOptions {
  /** Which layers to search. Defaults to all except working. */
  layers?: ('working' | 'episodic' | 'semantic' | 'procedural' | 'core')[];
  /** Maximum number of results. Defaults to 10. */
  limit?: number;
  /** Minimum confidence threshold for results. Defaults to 0. */
  minConfidence?: number;
  /** Apply context-dependent retrieval boost. */
  includeContext?: boolean;
  /** Current task type for context matching (e.g., 'coding', 'writing'). */
  taskType?: string;
}

export interface RecallResult {
  /** The memory content. */
  content: string;
  /** Which layer this result came from. */
  layer: string;
  /** Relevance score (0-1, higher is better). */
  score: number;
  /** Confidence level, if available. */
  confidence?: number;
  /** Emotional weight, if available. */
  emotionalWeight?: number;
  /** Additional metadata from the source layer. */
  metadata?: Record<string, unknown>;
}

export interface ConsolidationResult {
  /** Number of episodic memories promoted to semantic facts. */
  promoted: number;
  /** Number of working memory slots decayed. */
  decayed: number;
  /** Number of items pruned (below retention threshold). */
  pruned: number;
}

export interface MemoryHealth {
  /** Working memory capacity. */
  working: { used: number; max: number };
  /** Short-term memory interaction count. */
  shortTerm: { interactions: number };
  /** Episodic memory episode count. */
  episodic: { count: number };
  /** Semantic memory fact count and review queue size. */
  semantic: { count: number; dueForReview: number };
  /** Procedural memory procedure count. */
  procedural: { count: number };
  /** Core memory block count. */
  core: { blocks: number };
}

// ===========================================
// Pattern detection for auto-routing
// ===========================================

/** Patterns that indicate procedural content (how-to / step-by-step). */
const PROCEDURAL_PATTERNS = [
  /^how to /i,
  /^step \d/i,
  /^steps:/i,
  /\bstep-by-step\b/i,
  /\bworkflow:/i,
  /\brecipe:/i,
  /\bprocedure:/i,
  /\binstructions:/i,
];

/** Check if content looks like procedural knowledge. */
function looksLikeProcedure(content: string): boolean {
  return PROCEDURAL_PATTERNS.some(p => p.test(content));
}

// ===========================================
// Coordinator
// ===========================================

export class MemoryCoordinator {
  private readonly working: WorkingMemory;
  private readonly shortTerm: ShortTermMemory;
  private readonly episodic: EpisodicMemory;
  private readonly semantic: SemanticMemory;
  private readonly procedural: ProceduralMemory;
  private readonly core: CoreMemory;
  private readonly crossContext: CrossContextMemory;
  private readonly storage: StorageAdapter;
  private readonly embedding?: EmbeddingProvider;
  private readonly llm?: LLMProvider;
  private readonly log: Logger;

  constructor(config: CoordinatorConfig) {
    this.storage = config.storage;
    this.embedding = config.embedding;
    this.llm = config.llm;
    this.log = config.logger ?? noopLogger;

    const contexts = config.contexts ?? ['personal', 'work', 'learning', 'creative'];

    // Initialize all 7 layers
    this.working = new WorkingMemory({
      maxSlots: 7,
      decayRate: 0.05,
      embedding: config.embedding,
      cache: config.cache,
      logger: config.logger,
    });

    this.shortTerm = new ShortTermMemory({
      storage: config.storage,
      maxInteractions: 50,
      logger: config.logger,
    });

    this.episodic = new EpisodicMemory({
      storage: config.storage,
      embedding: config.embedding,
      logger: config.logger,
    });

    this.semantic = new SemanticMemory({
      storage: config.storage,
      embedding: config.embedding,
      logger: config.logger,
    });

    this.procedural = new ProceduralMemory({
      storage: config.storage,
      embedding: config.embedding,
      logger: config.logger,
    });

    this.core = new CoreMemory({
      storage: config.storage,
      logger: config.logger,
    });

    this.crossContext = new CrossContextMemory({
      storage: config.storage,
      contexts,
      logger: config.logger,
    });

    this.log.info('MemoryCoordinator initialized with all 7 layers');
  }

  // ===========================================
  // Store
  // ===========================================

  /**
   * Store content in the appropriate memory layer.
   *
   * Routing logic (in order of precedence):
   * 1. Explicit `type` in options overrides auto-detection.
   * 2. 'procedure' or procedural-looking content → ProceduralMemory
   * 3. 'episode' or emotionalWeight > 0.5 → EpisodicMemory
   * 4. 'core' or confidence > 0.9 → CoreMemory (pinned)
   * 5. 'fact' or default → SemanticMemory
   *
   * All stored content is also added to WorkingMemory for immediate access.
   *
   * @param content - The text content to store
   * @param options - Routing hints and metadata
   * @returns The ID of the stored memory
   */
  async store(content: string, options: StoreOptions = {}): Promise<string> {
    const type = this.resolveStoreType(content, options);
    let storedId: string;

    switch (type) {
      case 'procedure': {
        const steps = options.steps ?? this.extractSteps(content);
        const tools = options.tools ?? [];
        const outcome = options.outcome ?? '';
        const trigger = content.substring(0, 200);
        const proc = await this.procedural.record(trigger, steps, tools, outcome);
        storedId = proc.id;
        this.log.debug(`Stored as procedure: ${storedId}`);
        break;
      }

      case 'episode': {
        const emotionalWeight = options.emotionalWeight ?? this.detectEmotionalWeight(content);
        const episode = await this.episodic.store(
          content,
          options.context,
          emotionalWeight,
          options.source ? { source: options.source } : undefined
        );
        storedId = episode.id;
        this.log.debug(`Stored as episode: ${storedId}`);
        break;
      }

      case 'core': {
        const label = content.substring(0, 50).replace(/[^a-zA-Z0-9_ -]/g, '').trim();
        const block = await this.core.upsertBlock(label, content);
        storedId = block.id;
        this.log.debug(`Stored as core block: ${storedId}`);
        break;
      }

      case 'fact':
      default: {
        const confidence = options.confidence ?? 0.7;
        const source = options.source ?? 'user';
        const fact = await this.semantic.storeFact(content, source, confidence);
        storedId = fact.id;
        this.log.debug(`Stored as fact: ${storedId}`);
        break;
      }
    }

    // Also add to working memory for immediate access
    await this.working.add(content, 'fact', 1.0);

    return storedId;
  }

  // ===========================================
  // Recall
  // ===========================================

  /**
   * Cross-layer recall: search across memory layers and return ranked results.
   *
   * Searches each requested layer, applies optional context boost,
   * deduplicates by content similarity, and returns the top N results sorted by score.
   *
   * @param query - The search query
   * @param options - Layer selection, limits, and context settings
   * @returns Ranked recall results from across layers
   */
  async recall(query: string, options: RecallOptions = {}): Promise<RecallResult[]> {
    const layers = options.layers ?? ['episodic', 'semantic', 'procedural', 'core'];
    const limit = options.limit ?? 10;
    const minConfidence = options.minConfidence ?? 0;

    const results: RecallResult[] = [];

    // Search each requested layer in parallel
    const searches: Promise<void>[] = [];

    if (layers.includes('working')) {
      searches.push(this.recallFromWorking(query, results));
    }
    if (layers.includes('episodic')) {
      searches.push(this.recallFromEpisodic(query, limit, results));
    }
    if (layers.includes('semantic')) {
      searches.push(this.recallFromSemantic(query, limit, results));
    }
    if (layers.includes('procedural')) {
      searches.push(this.recallFromProcedural(query, limit, results));
    }
    if (layers.includes('core')) {
      searches.push(this.recallFromCore(query, results));
    }

    await Promise.all(searches);

    // Apply context-dependent retrieval boost
    if (options.includeContext) {
      const currentCtx = captureEncodingContext(options.taskType ?? 'general');
      for (const r of results) {
        const encodingCtx = r.metadata?.encodingContext;
        if (encodingCtx && typeof encodingCtx === 'object') {
          const sim = calculateContextSimilarity(
            encodingCtx as Parameters<typeof calculateContextSimilarity>[0],
            currentCtx
          );
          r.score *= sim.boost;
        }
      }
    }

    // Filter by minimum confidence
    const filtered = minConfidence > 0
      ? results.filter(r => (r.confidence ?? 1.0) >= minConfidence)
      : results;

    // Deduplicate by content similarity (threshold 0.9)
    const deduped = this.deduplicateResults(filtered);

    // Sort by score descending and return top N
    deduped.sort((a, b) => b.score - a.score);
    return deduped.slice(0, limit);
  }

  // ===========================================
  // Session Management (delegate to ShortTermMemory)
  // ===========================================

  /**
   * Start a new conversation session.
   *
   * @param id - Optional session ID. Auto-generated if not provided.
   * @returns The session ID.
   */
  startSession(id?: string): string {
    const sessionId = this.shortTerm.startSession(id);
    this.log.info(`Session started: ${sessionId}`);
    return sessionId;
  }

  /**
   * Add an interaction to the current session.
   *
   * @param role - The speaker role ('user', 'assistant', or 'system')
   * @param content - The message content
   */
  addInteraction(role: 'user' | 'assistant' | 'system', content: string): void {
    this.shortTerm.addInteraction(role, content);
  }

  /**
   * Get the current conversation context formatted for LLM consumption.
   *
   * @returns Array of { role, content } messages.
   */
  getConversationContext(): Array<{ role: string; content: string }> {
    return this.shortTerm.toMessages();
  }

  // ===========================================
  // Consolidation
  // ===========================================

  /**
   * Promote frequently accessed episodic memories to semantic facts.
   *
   * Scans recent episodes and, for those with high access patterns or
   * emotional significance, creates a corresponding semantic fact.
   * This mirrors the hippocampal-to-cortical transfer during sleep.
   *
   * @returns Counts of promoted, decayed, and pruned memories.
   */
  async consolidate(): Promise<ConsolidationResult> {
    let promoted = 0;
    const pruned = 0;

    // Get recent episodes for promotion evaluation
    const episodes = await this.episodic.getRecent(100);

    for (const episode of episodes) {
      const emotionalWeight = episode.emotionalWeight ?? 0;
      const isSignificant = emotionalWeight > 0.5;

      // Promote emotionally significant or contextually rich episodes
      if (isSignificant) {
        let summary = episode.content;

        // If LLM is available, generate a distilled fact
        if (this.llm) {
          try {
            summary = await this.llm.generate(
              'You are a memory consolidation system. Extract the key factual insight from this episode in one concise sentence.',
              episode.content,
              { maxTokens: 100, temperature: 0.3 }
            );
          } catch {
            this.log.warn('LLM consolidation failed, using raw content');
          }
        }

        await this.semantic.storeFact(summary, 'consolidation', 0.7);
        promoted++;
      }
    }

    // Apply decay to working memory
    const beforeDecay = this.working.size;
    this.working.decay();
    const decayed = beforeDecay - this.working.size;

    this.log.info(`Consolidation complete: promoted=${promoted}, decayed=${decayed}, pruned=${pruned}`);

    return { promoted, decayed, pruned };
  }

  // ===========================================
  // Decay
  // ===========================================

  /**
   * Apply Ebbinghaus time-based decay to working memory slots.
   *
   * Reduces relevance of older slots and evicts those below the minimum threshold.
   *
   * @returns Object with the number of slots removed.
   */
  decay(): { removed: number } {
    const before = this.working.size;
    this.working.decay();
    const removed = before - this.working.size;

    if (removed > 0) {
      this.log.debug(`Decay removed ${removed} working memory slots`);
    }

    return { removed };
  }

  // ===========================================
  // Spaced Repetition
  // ===========================================

  /**
   * Get facts due for spaced repetition review (FSRS scheduling).
   *
   * @param limit - Maximum number of review items. Defaults to 10.
   * @returns Array of facts needing review.
   */
  async getReviewQueue(limit = 10): Promise<Array<{ id: string; content: string; confidence: number }>> {
    const facts = await this.semantic.getDueForReview(limit);
    return facts.map(f => ({
      id: f.id,
      content: f.content,
      confidence: f.confidence,
    }));
  }

  /**
   * Record a recall attempt for FSRS scheduling.
   *
   * @param factId - The fact identifier.
   * @param grade - Recall quality grade (1-5: 1=forgot, 5=perfect).
   */
  async recordReview(factId: string, grade: number): Promise<void> {
    await this.semantic.recordRecall(factId, grade);
    this.log.debug(`Review recorded: fact=${factId}, grade=${grade}`);
  }

  // ===========================================
  // Health
  // ===========================================

  /**
   * Aggregate health statistics from all memory layers.
   *
   * @returns MemoryHealth snapshot across all layers.
   */
  async getHealth(): Promise<MemoryHealth> {
    const capacity = this.working.capacity;

    const [episodicCount, semanticCount, dueForReview, coreBlocks] = await Promise.all([
      this.episodic.count(),
      this.semantic.count(),
      this.semantic.getDueForReview(1000).then(r => r.length),
      this.core.getBlocks().then(b => b.length),
    ]);

    // Procedural count via list with a high limit
    let proceduralCount = 0;
    try {
      const procs = await this.procedural.list(1000);
      proceduralCount = procs.length;
    } catch {
      this.log.warn('Failed to count procedural memories');
    }

    return {
      working: { used: capacity.used, max: capacity.max },
      shortTerm: { interactions: this.shortTerm.size },
      episodic: { count: episodicCount },
      semantic: { count: semanticCount, dueForReview },
      procedural: { count: proceduralCount },
      core: { blocks: coreBlocks },
    };
  }

  // ===========================================
  // Direct Layer Access
  // ===========================================

  /** Get the WorkingMemory layer for direct access. */
  getWorkingMemory(): WorkingMemory {
    return this.working;
  }

  /** Get the ShortTermMemory layer for direct access. */
  getShortTermMemory(): ShortTermMemory {
    return this.shortTerm;
  }

  /** Get the EpisodicMemory layer for direct access. */
  getEpisodicMemory(): EpisodicMemory {
    return this.episodic;
  }

  /** Get the SemanticMemory layer for direct access. */
  getSemanticMemory(): SemanticMemory {
    return this.semantic;
  }

  /** Get the ProceduralMemory layer for direct access. */
  getProceduralMemory(): ProceduralMemory {
    return this.procedural;
  }

  /** Get the CoreMemory layer for direct access. */
  getCoreMemory(): CoreMemory {
    return this.core;
  }

  /** Get the CrossContextMemory layer for direct access. */
  getCrossContextMemory(): CrossContextMemory {
    return this.crossContext;
  }

  // ===========================================
  // Cleanup
  // ===========================================

  /**
   * Gracefully close the coordinator and release resources.
   * Delegates to the storage adapter's close method.
   */
  async close(): Promise<void> {
    this.working.clear();
    if (this.storage.close) {
      await this.storage.close();
    }
    this.log.info('MemoryCoordinator closed');
  }

  // ===========================================
  // Private Helpers
  // ===========================================

  /**
   * Resolve the target memory type from content and options.
   * Implements the auto-routing heuristics.
   */
  private resolveStoreType(content: string, options: StoreOptions): 'fact' | 'episode' | 'procedure' | 'core' {
    // Explicit type overrides auto-detection
    if (options.type && options.type !== 'auto') {
      return options.type;
    }

    // Procedural: has steps or looks like a how-to
    if (options.steps && options.steps.length > 0) {
      return 'procedure';
    }
    if (looksLikeProcedure(content)) {
      return 'procedure';
    }

    // Episode: high emotional weight
    const emotionalWeight = options.emotionalWeight ?? this.detectEmotionalWeight(content);
    if (emotionalWeight > 0.5) {
      return 'episode';
    }

    // Core: very high confidence
    if (options.confidence !== undefined && options.confidence > 0.9) {
      return 'core';
    }

    // Default: semantic fact
    return 'fact';
  }

  /**
   * Detect emotional weight of content using the emotional tagger algorithm.
   * Returns a value between 0 and 1.
   */
  private detectEmotionalWeight(content: string): number {
    const tag = tagEmotion(content);
    const weight = computeEmotionalWeight(tag);
    return weight.consolidationWeight;
  }

  /**
   * Extract steps from content that looks procedural.
   * Splits on numbered lines or bullet points.
   */
  private extractSteps(content: string): string[] {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    const steps: string[] = [];

    for (const line of lines) {
      // Match numbered steps (1. Step, 2) Step, Step 1:, etc.)
      const match = line.match(/^(?:\d+[.):]\s*|[-*]\s+|step\s+\d+[:.]\s*)/i);
      if (match) {
        steps.push(line.replace(match[0], '').trim());
      }
    }

    // If no structured steps found, treat each line as a step
    return steps.length > 0 ? steps : lines;
  }

  /** Recall from working memory and push results. */
  private async recallFromWorking(query: string, results: RecallResult[]): Promise<void> {
    try {
      const slots = await this.working.findRelevant(query, 5);
      for (const slot of slots) {
        results.push({
          content: slot.content,
          layer: 'working',
          score: slot.relevance,
          metadata: { type: slot.type, addedAt: slot.addedAt },
        });
      }
    } catch {
      this.log.warn('Working memory recall failed');
    }
  }

  /** Recall from episodic memory and push results. */
  private async recallFromEpisodic(query: string, limit: number, results: RecallResult[]): Promise<void> {
    try {
      const episodes = await this.episodic.search(query, limit);
      for (const ep of episodes) {
        results.push({
          content: ep.content,
          layer: 'episodic',
          score: ep.score,
          emotionalWeight: ep.emotionalWeight,
          metadata: { context: ep.context, timestamp: ep.timestamp },
        });
      }
    } catch {
      this.log.warn('Episodic memory recall failed');
    }
  }

  /** Recall from semantic memory and push results. */
  private async recallFromSemantic(query: string, limit: number, results: RecallResult[]): Promise<void> {
    try {
      const facts = await this.semantic.search(query, limit);
      for (const fact of facts) {
        results.push({
          content: fact.content,
          layer: 'semantic',
          score: fact.score,
          confidence: fact.confidence,
          metadata: { source: fact.source, accessCount: fact.accessCount },
        });
      }
    } catch {
      this.log.warn('Semantic memory recall failed');
    }
  }

  /** Recall from procedural memory and push results. */
  private async recallFromProcedural(query: string, limit: number, results: RecallResult[]): Promise<void> {
    try {
      const procs = await this.procedural.recall(query, limit);
      for (const proc of procs) {
        results.push({
          content: `${proc.trigger}\nSteps: ${proc.steps.join(' → ')}\nOutcome: ${proc.outcome}`,
          layer: 'procedural',
          score: proc.score,
          confidence: proc.successRate,
          metadata: { tools: proc.tools, executionCount: proc.executionCount },
        });
      }
    } catch {
      this.log.warn('Procedural memory recall failed');
    }
  }

  /** Recall from core memory (always loaded, keyword match). */
  private async recallFromCore(query: string, results: RecallResult[]): Promise<void> {
    try {
      const blocks = await this.core.getBlocks();
      const queryLower = query.toLowerCase();

      for (const block of blocks) {
        // Simple keyword matching for core blocks (they are always relevant)
        const contentLower = block.content.toLowerCase();
        const labelLower = block.label.toLowerCase();
        const hasOverlap = queryLower.split(/\s+/).some(
          word => word.length > 2 && (contentLower.includes(word) || labelLower.includes(word))
        );

        // Core blocks get a base score of 0.5, boosted if query matches
        const score = hasOverlap ? 0.8 : 0.5;

        results.push({
          content: `[${block.label}]: ${block.content}`,
          layer: 'core',
          score,
          confidence: 1.0, // Core blocks are always high-confidence
          metadata: { label: block.label, pinned: block.pinned },
        });
      }
    } catch {
      this.log.warn('Core memory recall failed');
    }
  }

  /**
   * Deduplicate results by content similarity.
   * If two results have Jaccard similarity > 0.9 on their content words,
   * keep only the higher-scored one.
   */
  private deduplicateResults(results: RecallResult[]): RecallResult[] {
    if (results.length <= 1) {
      return results;
    }

    const deduped: RecallResult[] = [];

    for (const r of results) {
      if (!r.content) continue;
      let isDuplicate = false;

      for (let i = 0; i < deduped.length; i++) {
        const existing = deduped[i];
        if (!existing.content) continue;
        if (this.contentSimilarity(r.content, existing.content) > 0.9) {
          isDuplicate = true;
          // Keep the higher-scored version
          if (r.score > existing.score) {
            deduped[i] = r;
          }
          break;
        }
      }

      if (!isDuplicate) {
        deduped.push(r);
      }
    }

    return deduped;
  }

  /**
   * Simple Jaccard content similarity for deduplication.
   * Compares word overlap between two strings.
   */
  private contentSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) intersection++;
    }

    const union = wordsA.size + wordsB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
