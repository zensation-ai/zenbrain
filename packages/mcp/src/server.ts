/**
 * The MCP surface of ZenBrain.
 *
 * This module builds the server around an already-constructed MemoryCoordinator
 * rather than constructing one itself. That is what makes it testable: the tests
 * drive the real protocol over an in-memory transport against an in-memory store,
 * and never touch a file or a database. `index.ts` does the wiring for real use.
 */
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type {
  MemoryCoordinator,
  RecallOptions,
  RecallResult,
  StoreOptions,
} from '@zensation/core';

/**
 * The version the server reports to clients that do not pass one.
 *
 * Read from the manifest, not written out here. The literal that used to stand
 * in this place said `0.1.0` while the package was at 0.1.4, so every client
 * saw a version that had been stale for four releases — and the test suite
 * never caught it, because it passes a version of its own and therefore never
 * exercised the default. A constant that has to be remembered on each release
 * is a constant that goes stale.
 *
 * `../package.json` resolves to the package root from both `src/` and `dist/`.
 */
const PACKAGE_VERSION: string = (
  createRequire(import.meta.url)('../package.json') as { version: string }
).version;

/** Layer names the coordinator accepts in `RecallOptions.layers`. */
const LAYERS = ['working', 'episodic', 'semantic', 'procedural', 'core'] as const;

/**
 * The layers `zenbrain_recall` searches when the client names none.
 *
 * Passed to the coordinator explicitly and used to write the tool description,
 * so the two come from one list. The description used to say "searches every
 * layer by default" while the schema said "all but working" and the handler
 * searched these four — an automated review of the tool definitions found the
 * contradiction before we did.
 */
const DEFAULT_RECALL_LAYERS = ['episodic', 'semantic', 'procedural', 'core'] as const;

/** `['a', 'b', 'c']` → `"a, b and c"`. */
function listed(items: readonly string[]): string {
  return items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Routing hints the coordinator accepts in `StoreOptions.type`. */
const STORE_TYPES = ['auto', 'fact', 'episode', 'procedure', 'core'] as const;

export interface ZenBrainServerOptions {
  /** Reported to the client during initialization. Defaults to the package name. */
  name?: string;
  /** Reported to the client during initialization. */
  version?: string;
}

/** Renders a value as the text block every MCP client can display. */
function text(value: unknown) {
  return [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }];
}

/**
 * Builds the ZenBrain MCP server.
 *
 * @param coordinator A live MemoryCoordinator. The caller owns its lifecycle —
 *   this function never closes it.
 */
export function createZenBrainServer(
  coordinator: MemoryCoordinator,
  options: ZenBrainServerOptions = {},
): McpServer {
  const server = new McpServer(
    {
      name: options.name ?? '@zensation/mcp',
      version: options.version ?? PACKAGE_VERSION,
    },
    {
      instructions:
        'Long-term memory that persists across conversations. Call zenbrain_recall before ' +
        'answering when the user refers to something from an earlier session, and ' +
        'zenbrain_store when they share something worth keeping (check with zenbrain_recall ' +
        'first, storing again adds a duplicate). Run zenbrain_consolidate between sessions, ' +
        'not on every turn; zenbrain_health shows how much is stored.',
    },
  );

  // ── store ────────────────────────────────────────────────────────────────
  server.registerTool(
    'zenbrain_store',
    {
      title: 'Store a memory',
      description:
        'Write something into long-term memory so it survives this conversation. ' +
        'Routing is automatic by default: steps or instructions become a procedure; content ' +
        'with an emotional weight above 0.5 (detected, or set via `emotionalWeight`) becomes an ' +
        'episode; a `confidence` above 0.9 makes it a pinned core memory; anything else becomes ' +
        'a semantic fact. Set `type` only when you want to override that. Every call adds a new ' +
        'memory, except that storing the same core memory again updates it; the content is also ' +
        'kept in working memory while the server runs. Returns the id of the stored memory. ' +
        'If it may already be stored, check with zenbrain_recall first: storing it again adds ' +
        'a duplicate.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        content: z.string().min(1).describe('The memory to store, in plain language.'),
        type: z
          .enum(STORE_TYPES)
          .optional()
          .describe("Routing hint. 'auto' (default) decides from the content."),
        context: z
          .string()
          .optional()
          .describe("Context domain, e.g. 'work', 'personal', 'learning'."),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('How certain this is (0–1). Above 0.9 routes to core memory.'),
        emotionalWeight: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe(
            'Emotional significance (0–1). Detected from the content when omitted. ' +
              'Above 0.5 routes to episodic memory.',
          ),
        source: z
          .string()
          .optional()
          .describe("Where this came from, e.g. 'user', 'ai', 'import'."),
        steps: z
          .array(z.string())
          .optional()
          .describe(
            'Ordered steps of a procedure. Optional: without them the steps are taken from ' +
              'the content (numbered or bulleted lines, otherwise every line).',
          ),
        tools: z.array(z.string()).optional().describe('Tools a procedure uses.'),
        outcome: z.string().optional().describe('What the procedure achieves.'),
      },
      outputSchema: {
        id: z.string().describe('Identifier of the stored memory.'),
      },
    },
    async ({ content, ...rest }) => {
      const opts: StoreOptions = {};
      if (rest.type !== undefined) opts.type = rest.type;
      if (rest.context !== undefined) opts.context = rest.context;
      if (rest.confidence !== undefined) opts.confidence = rest.confidence;
      if (rest.emotionalWeight !== undefined) opts.emotionalWeight = rest.emotionalWeight;
      if (rest.source !== undefined) opts.source = rest.source;
      if (rest.steps !== undefined) opts.steps = rest.steps;
      if (rest.tools !== undefined) opts.tools = rest.tools;
      if (rest.outcome !== undefined) opts.outcome = rest.outcome;

      const id = await coordinator.store(content, opts);
      return { content: text({ id }), structuredContent: { id } };
    },
  );

  // ── recall ───────────────────────────────────────────────────────────────
  server.registerTool(
    'zenbrain_recall',
    {
      title: 'Recall memories',
      description:
        'Search long-term memory for anything relevant to a query. By default it searches ' +
        `the ${listed(DEFAULT_RECALL_LAYERS)} layers; working memory (a handful of recently ` +
        'stored items, held only while the server runs) is searched only when named in ' +
        '`layers`. Returns results ranked by relevance, each tagged with the layer it came ' +
        'from. Use this before answering when the user refers to something from an earlier ' +
        'session. To see how much is stored rather than what, use zenbrain_health; ' +
        'to save something, use zenbrain_store.',
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: {
        query: z.string().min(1).describe('What to look for, in plain language.'),
        layers: z
          .array(z.enum(LAYERS))
          .optional()
          .describe(
            `Restrict the search to these layers. Defaults to ${listed(DEFAULT_RECALL_LAYERS)}; ` +
              "add 'working' to include recently stored items held in memory.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('How many results to return at most, after ranking (default 10).'),
        minConfidence: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe(
            'Leave out results whose stored confidence is below this value; results stored ' +
              'without a confidence count as 1 and are kept.',
          ),
      },
      outputSchema: {
        count: z.number().describe('How many memories were returned.'),
        results: z
          .array(
            z.object({
              content: z.string(),
              layer: z.string(),
              score: z.number(),
              confidence: z.number().optional(),
              emotionalWeight: z.number().optional(),
            }),
          )
          .describe('Matching memories, most relevant first.'),
        skipped: z
          .number()
          .describe('Rows that carried no readable content and were left out of `results`.'),
      },
    },
    async ({ query, ...rest }) => {
      const opts: RecallOptions = {
        layers: (rest.layers ?? [...DEFAULT_RECALL_LAYERS]) as RecallOptions['layers'],
      };
      if (rest.limit !== undefined) opts.limit = rest.limit;
      if (rest.minConfidence !== undefined) opts.minConfidence = rest.minConfidence;

      const found: RecallResult[] = await coordinator.recall(query, opts);

      // `RecallResult.content` is typed as a required string, but it is assembled
      // from whatever the storage adapter returns. A row that lost its content
      // column would otherwise fail output validation and turn a good recall into
      // a protocol error for the client. Leave those rows out and say how many.
      const usable = found.filter((r) => typeof r.content === 'string' && r.content.length > 0);
      const results = usable.map((r) => ({
        content: r.content,
        layer: typeof r.layer === 'string' ? r.layer : 'unknown',
        score: typeof r.score === 'number' ? r.score : 0,
        ...(typeof r.confidence === 'number' ? { confidence: r.confidence } : {}),
        ...(typeof r.emotionalWeight === 'number' ? { emotionalWeight: r.emotionalWeight } : {}),
      }));

      const payload = { count: results.length, results, skipped: found.length - usable.length };
      return { content: text(payload), structuredContent: payload };
    },
  );

  // ── consolidate ──────────────────────────────────────────────────────────
  server.registerTool(
    'zenbrain_consolidate',
    {
      title: 'Consolidate memory',
      description:
        'Run one consolidation pass: among the 100 most recent episodes, each one with an ' +
        'emotional weight above 0.5 becomes a semantic fact — once, however often the pass ' +
        'runs. Working-memory slots lose relevance with age, and slots whose relevance has ' +
        'dropped to 0.01 or below are removed; that is the only deletion, and nothing in ' +
        'long-term memory is deleted. Run it between sessions or after a batch of ' +
        'zenbrain_store calls, not on every turn; compare zenbrain_health before and after ' +
        'to see the effect.',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      inputSchema: {},
      outputSchema: {
        promoted: z.number().describe('Episodes promoted to semantic facts in this pass.'),
        decayed: z.number().describe('Working-memory slots decayed.'),
        pruned: z.number().describe('Always 0: consolidation deletes nothing from long-term memory.'),
      },
    },
    async () => {
      const r = await coordinator.consolidate();
      const payload = { promoted: r.promoted, decayed: r.decayed, pruned: r.pruned };
      return { content: text(payload), structuredContent: payload };
    },
  );

  // ── health ───────────────────────────────────────────────────────────────
  server.registerTool(
    'zenbrain_health',
    {
      title: 'Inspect memory state',
      description:
        'Report how full the memory layers are: working-memory slots in use, interactions held, ' +
        'episodes, facts and how many are due for review, procedures, core blocks. Read-only ' +
        'and cheap, safe to call at any time. It returns counts only; to read the memories ' +
        'themselves, use zenbrain_recall.',
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: {},
      outputSchema: {
        working: z
          .object({ used: z.number(), max: z.number() })
          .describe('Working-memory slots in use and the slot limit.'),
        shortTerm: z
          .object({ interactions: z.number() })
          .describe('Interactions held in short-term memory.'),
        episodic: z.object({ count: z.number() }).describe('Episodes stored.'),
        semantic: z
          .object({ count: z.number(), dueForReview: z.number() })
          .describe('Facts stored, and how many are due for spaced-repetition review.'),
        procedural: z.object({ count: z.number() }).describe('Procedures stored.'),
        core: z.object({ blocks: z.number() }).describe('Core memory blocks.'),
      },
    },
    async () => {
      const h = await coordinator.getHealth();
      const payload = {
        working: { used: h.working.used, max: h.working.max },
        shortTerm: { interactions: h.shortTerm.interactions },
        episodic: { count: h.episodic.count },
        semantic: { count: h.semantic.count, dueForReview: h.semantic.dueForReview },
        procedural: { count: h.procedural.count },
        core: { blocks: h.core.blocks },
      };
      return { content: text(payload), structuredContent: payload };
    },
  );

  return server;
}
