/**
 * MemoryCoordinator — the entry point to ZenBrain's seven memory layers.
 *
 * It creates all seven. `store()`, `recall()`, `forget()` and `consolidate()` work on
 * working, episodic, semantic, procedural and core memory; short-term memory is reached
 * through the session methods, cross-context memory through `getCrossContextMemory()`.
 * It routes content to a layer, recalls across layers, promotes emotional episodes to
 * facts (`consolidate()`), and decays working memory when `decay()` or `consolidate()`
 * is called — there is no timer.
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
import { tokenize } from './lexical';

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
  /**
   * Cache provider. Accepted, but no layer reads or writes it.
   * @deprecated Has no effect; it will be removed in 1.0.
   */
  cache?: CacheProvider;
  /** Context domains for cross-context memory, an experimental layer the coordinator creates but does not call. Defaults to ['personal', 'work', 'learning', 'creative']. */
  contexts?: string[];
  /** Logger instance. Defaults to no-op. */
  logger?: Logger;
}

export interface StoreOptions {
  /** Routing hint: which layer to target. 'auto' uses content heuristics. */
  type?: 'auto' | 'fact' | 'episode' | 'procedure' | 'core';
  /** Context domain (e.g., 'work', 'personal'). Episodes keep it; facts, procedures and core blocks do not. */
  context?: string;
  /**
   * Emotional weight override (0-1). If not provided, auto-detected from content. In auto routing,
   * above 0.5 makes the memory an episode. Stored with episodes; for a fact, a weight given here
   * multiplies its starting FSRS stability by `1 + weight` (7 at 0, 14 at 1; the first review
   * comes after about 0.105 × stability days) and is not stored.
   */
  emotionalWeight?: number;
  /** Confidence score (0-1), stored with facts. In auto routing, above 0.9 routes to core memory — unless steps, procedural wording or an emotional weight above 0.5 routed it first. */
  confidence?: number;
  /** Source attribution (e.g., 'user', 'ai', 'import'). */
  source?: string;
  /** Steps for procedural memory. Optional: when omitted, numbered or bulleted lines of the content become the steps (otherwise each line). */
  steps?: string[];
  /** Tools used in the procedure. */
  tools?: string[];
  /** Expected outcome of the procedure. */
  outcome?: string;
}

/** The layers `recall()` can search and `forget()` can delete from. */
export type RecallLayer = 'working' | 'episodic' | 'semantic' | 'procedural' | 'core';

/**
 * Which of two equally scored results recall keeps and lists first: long-term memories before the
 * working-memory copy (forgetting a copy deletes only the copy), in a fixed layer order, so the
 * outcome does not depend on which layer's search finished first.
 */
const LAYER_ORDER: Record<RecallLayer, number> = { episodic: 0, semantic: 1, procedural: 2, core: 3, working: 4 };

/** Matches the UUIDs the layers write; anything else cannot be a stored id. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RecallOptions {
  /** Which layers to search. Defaults to all except working. */
  layers?: RecallLayer[];
  /** Maximum number of results. Defaults to 10. */
  limit?: number;
  /** Minimum confidence threshold for results. Defaults to 0. */
  minConfidence?: number;
  /**
   * Leave out results that score below this value (0 to 1). Defaults to 0, which keeps
   * everything: a layer in which the query matches nothing returns fallbacks at score 0
   * (see `RecallResult.score`), and they come after every real hit. Any value above 0 drops
   * them. Applied after deduplication, so fewer than `limit` results may come back.
   */
  minScore?: number;
  /**
   * Which core blocks a recall considers. `'always'` (default) adds every core block to the
   * candidates of every recall; the blocks then compete for `limit` like any other result
   * (measured: 12 blocks and `limit: 10` gave 9 blocks and 1 hit). `'matching'` adds only
   * the blocks that share a content word with the query (stopwords such as "the" do not
   * count), so a large core memory cannot push the actual hits out of `limit`; a `limit` of
   * at least the number of blocks plus the hits you want does the same.
   */
  core?: 'always' | 'matching';
}

export interface RecallResult {
  /** The memory's id in its layer. Pass it with `layer` to `forget()`. */
  id: string;
  /** The memory content. */
  content: string;
  /** Which layer this result came from; pass it with `id` to `forget()`. */
  layer: RecallLayer;
  /**
   * How well the result matches the query, from 0 to 1; `recall()` sorts by it. Episodic,
   * semantic, procedural and working memory score alike: the cosine similarity with an
   * embedding provider (a negative similarity counts as 0), lexical relevance without one.
   * 0 means no match: with an embedding provider a similarity of 0 or below; without one,
   * no content word of the query occurs in the layer's candidates, and the result is a
   * fallback (recent episodes and facts, the most successful procedures, the most relevant
   * working-memory slots) that keeps the recall from coming back empty. Core blocks score
   * 0.8 when a query word longer than two characters occurs in their label or content (as a
   * substring, case ignored), else 0.5 — so with `core: 'always'` a block outranks lexical
   * hits below 0.5. How much to trust a result is `confidence`, not the score.
   */
  score: number;
  /** Confidence level, if available. */
  confidence?: number;
  /** Emotional weight, if available. */
  emotionalWeight?: number;
  /** Additional metadata from the source layer. */
  metadata?: Record<string, unknown>;
  /**
   * Results that deduplication left out because their content is (nearly) the same as this
   * one's — for example the fact `consolidate()` made verbatim from this episode. Present only
   * when there were any. When this result is a long-term memory, forgetting it (cascade on, the
   * default) also deletes a duplicate linked to it by consolidation and the working-memory copies
   * of its content; any other duplicate was stored on its own and needs its own `forget()`. When
   * this result is itself a working-memory slot, forgetting it deletes only the slot — forget a
   * long-term duplicate instead.
   */
  duplicates?: Array<{ id: string; layer: RecallLayer }>;
}

export interface ForgetOptions {
  /**
   * Also delete what was derived from the memory, and what it was derived from (default
   * `true`): forgetting an episode deletes the fact `consolidate()` made from it, forgetting
   * a fact deletes the episodes it was made from, and in both cases the working-memory copies
   * of that content. `false` deletes only the addressed memory; an episode keeps its
   * `consolidatedInto` mark, so a later `consolidate()` does not promote it again.
   */
  cascade?: boolean;
}

export interface ForgetResult {
  /** `true` if the addressed memory was deleted, `false` if its layer holds none with that id. */
  removed: boolean;
  /** Every other memory the cascade deleted, by id and layer (working-memory copies included). */
  alsoForgotten: Array<{ id: string; layer: RecallLayer }>;
}

export interface ConsolidationResult {
  /** Number of episodic memories promoted to semantic facts in this pass. */
  promoted: number;
  /** Number of working-memory slots that decay removed (relevance at or below 0.01). Every slot loses relevance; only removed ones are counted. */
  decayed: number;
  /** Always 0: consolidation deletes nothing from long-term memory. Kept for the result's shape. */
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

/**
 * 32-bit FNV-1a over the UTF-16 code units, as eight hex digits. Stable and
 * dependency-free (core also runs in the browser, so no node:crypto); enough
 * to tell the labels of different memories apart.
 */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
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
  /** The working-memory slot each `store()` in this process created, by the stored memory's id. */
  private readonly workingCopyOf = new Map<string, string>();

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
   * 2. `steps`, or content starting "How to", "Step 1", "Steps:" or containing
   *    "workflow:", "recipe:", "procedure:", "instructions:", "step-by-step" → ProceduralMemory
   * 3. emotionalWeight > 0.5 (given or detected) → EpisodicMemory
   * 4. confidence > 0.9 → CoreMemory (pinned)
   * 5. otherwise → SemanticMemory
   *
   * Every stored content is also added to working memory, which keeps the most
   * recent seven in this process and is not part of the default recall.
   *
   * @param content - The text content to store
   * @param options - Routing hints and metadata
   * @returns The ID of the stored memory
   * @throws RangeError if options.emotionalWeight or options.confidence is not a number from 0 to 1
   */
  async store(content: string, options: StoreOptions = {}): Promise<string> {
    for (const key of ['emotionalWeight', 'confidence'] as const) {
      const value = options[key];
      if (value !== undefined && (typeof value !== 'number' || !(value >= 0 && value <= 1))) {
        throw new RangeError(`store: options.${key} must be a number from 0 to 1, got ${value}`);
      }
    }
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
        const block = await this.core.upsertBlock(await this.coreLabelFor(content), content);
        storedId = block.id;
        this.log.debug(`Stored as core block: ${storedId}`);
        break;
      }

      case 'fact':
      default: {
        const confidence = options.confidence ?? 0.7;
        const source = options.source ?? 'user';
        // An explicit weight stretches the fact's first FSRS interval (E-6); a detected one does not.
        const fact = await this.semantic.storeFact(content, source, confidence, options.emotionalWeight);
        storedId = fact.id;
        this.log.debug(`Stored as fact: ${storedId}`);
        break;
      }
    }

    // Also add to working memory (most recent seven; not part of the default recall)
    const slot = await this.working.add(content, 'fact', 1.0);
    this.workingCopyOf.set(storedId, slot.id);
    // Keep only entries whose slot still exists: the map never outgrows working memory.
    const live = new Set(this.working.getSlots().map(s => s.id));
    for (const [memoryId, slotId] of this.workingCopyOf) {
      if (!live.has(slotId)) this.workingCopyOf.delete(memoryId);
    }

    return storedId;
  }

  // ===========================================
  // Recall
  // ===========================================

  /**
   * Cross-layer recall: search across memory layers and return ranked results.
   *
   * Searches each requested layer, deduplicates by content similarity, and returns the
   * top N results sorted by score (0 to 1 in every layer, see `RecallResult.score`).
   * Results that match nothing score 0 and come after every real hit.
   *
   * @param query - The search query
   * @param options - Layer selection and limits
   * @returns Ranked recall results from across layers
   */
  async recall(query: string, options: RecallOptions = {}): Promise<RecallResult[]> {
    const layers = options.layers ?? ['episodic', 'semantic', 'procedural', 'core'];
    const limit = options.limit ?? 10;
    const minConfidence = options.minConfidence ?? 0;
    const minScore = options.minScore ?? 0;
    if (typeof minScore !== 'number' || !(minScore >= 0 && minScore <= 1)) {
      throw new RangeError(`recall: options.minScore must be a number from 0 to 1, got ${minScore}`);
    }

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
      searches.push(this.recallFromCore(query, results, options.core ?? 'always'));
    }

    await Promise.all(searches);

    // Filter by minimum confidence
    const filtered = minConfidence > 0
      ? results.filter(r => (r.confidence ?? 1.0) >= minConfidence)
      : results;

    // Deduplicate by content similarity (threshold 0.9), then drop what scores below minScore
    // (after dedup, so a kept result still names a low-scoring twin in `duplicates`)
    const deduped = this.deduplicateResults(filtered).filter(r => r.score >= minScore);

    // Sort by score descending (equal scores in a fixed layer order) and return top N
    deduped.sort((a, b) => b.score - a.score || LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer]);
    return deduped.slice(0, limit);
  }

  // ===========================================
  // Forget
  // ===========================================

  /**
   * Delete a memory, addressed by the `id` and `layer` of a recall result, together with
   * what consolidation linked to it (the cascade, on by default).
   *
   * - `forget(id, 'episodic')` deletes the episode, the fact `consolidate()` made from it,
   *   and the working-memory copies of both.
   * - `forget(id, 'semantic')` deletes the fact, every episode consolidated into it, and the
   *   working-memory copies of all of them.
   * - `forget(id, 'procedural')` and `forget(id, 'core')` delete the memory and its
   *   working-memory copy.
   *
   * Working-memory copies are the slot `store()` created for each deleted memory in this
   * process and, for episodes, facts and core blocks, any slot holding exactly their content
   * (a procedure keeps only the first 200 characters, so only its own slot goes).
   * - `forget(id, 'working')` deletes only that working-memory slot: the slot is a copy,
   *   and forgetting a copy does not reach into long-term memory.
   *
   * The edge between an episode and its fact is the episode's `consolidatedInto` mark, which
   * `consolidate()` has written since 0.4.8; it is found in existing databases without a
   * schema change. An episode promoted before 0.4.8 is linked only once a later
   * `consolidate()` finds its verbatim fact (among the 100 most recent episodes); one an LLM
   * distilled before 0.4.8 has no edge. A fact distilled by an LLM since then is linked like
   * any other: the cascade follows the recorded edge, it does not search for memories that say
   * something similar. `consolidate()` links a second episode with the same text to the fact
   * the first one became instead of copying it again (also a fact stored with source
   * `'consolidation'` and that exact text): forgetting one of those episodes keeps the other,
   * forgetting the fact deletes both. A memory stored on its own and never linked keeps its
   * long-term entry (`RecallResult.duplicates` names such twins); a working-memory slot with
   * exactly the forgotten content goes, whichever store created it.
   *
   * With `{ cascade: false }` only the addressed memory is deleted (the behaviour before
   * 0.6.0); an episode keeps its mark, so a later `consolidate()` does not promote it again.
   * Consolidation and decay never delete long-term memories. To correct a memory, forget it
   * and store the corrected version. Use `forgetWithDerived()` to learn what the cascade
   * deleted.
   *
   * @param id - The `id` of a recall result.
   * @param layer - The `layer` of the same result.
   * @param options - `cascade` (default `true`).
   * @returns `true` if the addressed memory was deleted, `false` if the layer holds none with that id.
   */
  async forget(id: string, layer: RecallLayer, options: ForgetOptions = {}): Promise<boolean> {
    return (await this.forgetWithDerived(id, layer, options)).removed;
  }

  /**
   * `forget()`, and in addition the list of every other memory the cascade deleted.
   *
   * Linked memories are deleted before the addressed one, so if a deletion fails half-way,
   * calling this again still deletes the remaining long-term memories; working-memory copies of
   * what the failed call already deleted may remain, and the repeated call does not list what
   * the failed one deleted.
   *
   * @returns `removed` for the addressed memory and `alsoForgotten` for the rest.
   */
  async forgetWithDerived(id: string, layer: RecallLayer, options: ForgetOptions = {}): Promise<ForgetResult> {
    const cascade = options.cascade ?? true;
    const alsoForgotten: ForgetResult['alsoForgotten'] = [];
    let removed: boolean;

    if (layer === 'working') {
      removed = this.working.remove(id);
    } else if (!['episodic', 'semantic', 'procedural', 'core'].includes(layer)) {
      throw new Error(`Unknown memory layer: ${String(layer)}`);
    } else if (!UUID_PATTERN.test(id)) {
      // Stored ids are UUIDs; anything else is unknown, not an error (PostgreSQL
      // would otherwise reject the query for its uuid column).
      removed = false;
    } else if (!cascade) {
      removed = await this.deleteOne(id.toLowerCase(), layer);
    } else {
      // Both adapters write lower-case UUIDs; PostgreSQL compares uuids ignoring case and
      // returns them in lower case, so the id is compared in lower case too.
      removed = await this.deleteWithDerived(id.toLowerCase(), layer, alsoForgotten);
    }

    this.log.debug(
      `Forget ${layer}/${id}: ${removed ? 'deleted' : 'not found'}` +
        (alsoForgotten.length > 0 ? `, also ${alsoForgotten.length} derived` : '')
    );
    return { removed, alsoForgotten };
  }

  /** Delete exactly one long-term memory. */
  private async deleteOne(id: string, layer: Exclude<RecallLayer, 'working'>): Promise<boolean> {
    switch (layer) {
      case 'episodic':
        return this.episodic.delete(id);
      case 'semantic':
        return this.semantic.delete(id);
      case 'procedural':
        return this.procedural.delete(id);
      case 'core': {
        const block = (await this.core.getBlocks()).find(b => b.id.toLowerCase() === id);
        return block ? this.core.deleteBlock(block.label) : false;
      }
    }
  }

  /** The cascade of `forgetWithDerived()`: linked memories first, the addressed one last. */
  private async deleteWithDerived(
    id: string,
    layer: Exclude<RecallLayer, 'working'>,
    alsoForgotten: ForgetResult['alsoForgotten']
  ): Promise<boolean> {
    // Working-memory copies: the slot store() created for each deleted memory, and for
    // episodes, facts and core blocks also any slot holding exactly their content.
    const contents = new Set<string>();
    const memoryIds = [id];

    if (layer === 'episodic') {
      const episode = await this.episodic.getById(id);
      if (!episode) return false;
      contents.add(episode.content);
      // The fact consolidated from this episode. Another episode promoted into the same fact
      // (consolidate() links a second episode with the same text to the existing fact) was
      // stored on its own and stays; it keeps its mark, so it is not promoted again.
      const factId = this.episodic.consolidatedInto(episode)?.toLowerCase();
      if (factId && UUID_PATTERN.test(factId)) {
        const fact = await this.semantic.getById(factId);
        if (fact && (await this.semantic.delete(factId))) {
          alsoForgotten.push({ id: factId, layer: 'semantic' });
          contents.add(fact.content);
          memoryIds.push(factId);
        }
      }
    } else if (layer === 'semantic') {
      const fact = await this.semantic.getById(id);
      if (!fact) return false;
      contents.add(fact.content);
      for (const episode of await this.episodic.findConsolidatedInto(id)) {
        if (await this.episodic.delete(episode.id)) {
          alsoForgotten.push({ id: episode.id, layer: 'episodic' });
          contents.add(episode.content);
          memoryIds.push(episode.id);
        }
      }
    } else if (layer === 'procedural') {
      // Only the slot store() created: a procedure keeps the first 200 characters of its
      // content, which can match other memories and can lose a split character.
      if (!(await this.procedural.getById(id))) return false;
    } else {
      const block = (await this.core.getBlocks()).find(b => b.id.toLowerCase() === id);
      if (!block) return false;
      contents.add(block.content);
    }

    const slotIds = new Set(
      memoryIds.map(m => this.workingCopyOf.get(m)).filter((s): s is string => s !== undefined)
    );
    for (const memoryId of memoryIds) this.workingCopyOf.delete(memoryId);
    for (const slotId of this.working.removeWhere((content, slotId) => slotIds.has(slotId) || contents.has(content))) {
      alsoForgotten.push({ id: slotId, layer: 'working' });
    }
    return this.deleteOne(id, layer);
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
   * Promote emotionally significant episodes to semantic facts, once each,
   * and decay working memory.
   *
   * Looks at the 100 most recent episodes. Each one with an emotional weight
   * above 0.5 that has not been promoted before becomes a semantic fact
   * (distilled by the LLM when one is configured, verbatim otherwise), and the
   * episode is marked in its metadata (`consolidatedInto: <fact id>`). This
   * mirrors the hippocampal-to-cortical transfer during sleep.
   *
   * Nothing in long-term memory is deleted: `pruned` is part of the result's
   * shape and is always 0.
   *
   * Until the mark existed, every pass promoted the same episodes again —
   * measured on 2026-09-28 against @zensation/mcp 0.1.6 with a real SQLite
   * file: three passes, three identical facts. An episode an earlier version
   * already promoted verbatim is recognised by that fact and only marked.
   *
   * @returns Counts of promoted episodes, working-memory slots removed by decay, and pruned items (0).
   */
  async consolidate(): Promise<ConsolidationResult> {
    let promoted = 0;
    const pruned = 0;

    // Get recent episodes for promotion evaluation
    const episodes = await this.episodic.getRecent(100);

    for (const episode of episodes) {
      const emotionalWeight = episode.emotionalWeight ?? 0;
      if (emotionalWeight <= 0.5 || this.episodic.isConsolidated(episode)) continue;

      // Promoted verbatim by an earlier version that left no mark: mark it, do not copy it again.
      const earlier = await this.semantic.findExact(episode.content, 'consolidation');
      if (earlier) {
        await this.episodic.markConsolidated(episode, earlier.id);
        continue;
      }

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

      const fact = await this.semantic.storeFact(summary, 'consolidation', 0.7);
      await this.episodic.markConsolidated(episode, fact.id);
      promoted++;
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
   * Apply exponential time-based decay to working-memory slots: each slot loses
   * relevance for the minutes since it was last decayed, and slots at 0.01 or below
   * are removed. Long-term memory is not touched.
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
   * @param grade - An integer from 1 to 5: 1 and 2 count as forgotten, 3 to 5 as recalled
   *   (3 neutral, 5 perfect). Anything else throws a RangeError.
   * @returns `true` if the fact exists and was updated, `false` if there is no fact with that id.
   */
  async recordReview(factId: string, grade: number): Promise<boolean> {
    const updated = await this.semantic.recordRecall(factId, grade);
    this.log.debug(`Review recorded: fact=${factId}, grade=${grade}, found=${updated}`);
    return updated;
  }

  // ===========================================
  // Health
  // ===========================================

  /**
   * Health statistics from six layers (cross-context memory has no counter).
   *
   * @returns MemoryHealth snapshot: working, short-term, episodic, semantic, procedural, core.
   */
  async getHealth(): Promise<MemoryHealth> {
    const capacity = this.working.capacity;

    const [episodicCount, semanticCount, dueForReview, coreBlocks] = await Promise.all([
      this.episodic.count(),
      this.semantic.count(),
      this.semantic.countDueForReview(),
      this.core.getBlocks().then(b => b.length),
    ]);

    let proceduralCount = 0;
    try {
      proceduralCount = await this.procedural.count();
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
   * The label a core block gets when `store()` creates it: the first words of
   * the content, in whatever script, plus a short hash of the whole content.
   * Two different memories never share a label; the same memory stored twice
   * updates one block.
   *
   * The label used to be the first 50 characters with everything outside
   * [a-zA-Z0-9_ -] removed. Measured on 2026-09-28 against a real SQLite store:
   * two Chinese sentences both became the label "" and the second replaced the
   * first; two English sentences sharing their first 50 characters did the
   * same; "Über" became "ber". A block written under such a label and stored
   * again verbatim keeps its label instead of gaining a twin.
   */
  private async coreLabelFor(content: string): Promise<string> {
    const legacy = content.substring(0, 50).replace(/[^a-zA-Z0-9_ -]/g, '').trim();
    if ((await this.core.getBlock(legacy))?.content === content) return legacy;

    const words = content
      .normalize('NFC')
      .replace(/[^\p{L}\p{N}_ -]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40)
      .trim();
    return `${words} #${fnv1a(content)}`;
  }

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
      const slots = await this.working.search(query, 5);
      for (const slot of slots) {
        results.push({
          id: slot.id,
          content: slot.content,
          layer: 'working',
          score: slot.score,
          metadata: { type: slot.type, addedAt: slot.addedAt, relevance: slot.relevance },
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
          id: ep.id,
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
          id: fact.id,
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
          id: proc.id,
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

  /** Recall from core memory: every block, or with `'matching'` only blocks sharing a content word. */
  private async recallFromCore(query: string, results: RecallResult[], mode: 'always' | 'matching'): Promise<void> {
    try {
      const blocks = await this.core.getBlocks();
      const queryLower = query.toLowerCase();
      const queryTokens = new Set(tokenize(query));

      for (const block of blocks) {
        if (mode === 'matching' && !tokenize(`${block.label} ${block.content}`).some(t => queryTokens.has(t))) {
          continue;
        }
        // Simple keyword matching for core blocks (they are always relevant)
        const contentLower = block.content.toLowerCase();
        const labelLower = block.label.toLowerCase();
        const hasOverlap = queryLower.split(/\s+/).some(
          word => word.length > 2 && (contentLower.includes(word) || labelLower.includes(word))
        );

        // Core blocks get a base score of 0.5, boosted if query matches
        const score = hasOverlap ? 0.8 : 0.5;

        results.push({
          id: block.id,
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
   * If two results have Jaccard similarity > 0.9 on their words and numbers
   * (case and punctuation ignored), keep only the higher-scored one; the kept
   * one names the others in `duplicates`.
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
          // Keep the higher-scored version (on a tie, the earlier layer in LAYER_ORDER); it carries
          // the other one (and what that one carried).
          const rWins = r.score > existing.score ||
            (r.score === existing.score && LAYER_ORDER[r.layer] < LAYER_ORDER[existing.layer]);
          const [kept, dropped] = rWins ? [r, existing] : [existing, r];
          deduped[i] = {
            ...kept,
            duplicates: [
              ...(kept.duplicates ?? []),
              { id: dropped.id, layer: dropped.layer },
              ...(dropped.duplicates ?? []),
            ],
          };
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
   * Compares the sets of words and numbers of two strings, ignoring case and
   * punctuation. Every token counts: short ones are often what tells two
   * memories apart ("Locker code is 47" / "Locker code is 81", "Server A" /
   * "Server B"), so dropping them made distinct memories look identical.
   */
  private contentSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const tokens = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
    const wordsA = tokens(a);
    const wordsB = tokens(b);

    if (wordsA.size === 0 || wordsB.size === 0) {
      return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1.0 : 0;
    }

    let intersection = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) intersection++;
    }

    const union = wordsA.size + wordsB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
