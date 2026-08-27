/**
 * The MCP surface of ZenBrain.
 *
 * This module builds the server around an already-constructed MemoryCoordinator
 * rather than constructing one itself. That is what makes it testable: the tests
 * drive the real protocol over an in-memory transport against an in-memory store,
 * and never touch a file or a database. `index.ts` does the wiring for real use.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type {
  MemoryCoordinator,
  RecallOptions,
  RecallResult,
  StoreOptions,
} from '@zensation/core';

/** Layer names the coordinator accepts in `RecallOptions.layers`. */
const LAYERS = ['working', 'episodic', 'semantic', 'procedural', 'core'] as const;

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
  const server = new McpServer({
    name: options.name ?? '@zensation/mcp',
    version: options.version ?? '0.1.0',
  });

  // ── store ────────────────────────────────────────────────────────────────
  server.registerTool(
    'zenbrain_store',
    {
      title: 'Store a memory',
      description:
        'Write something into long-term memory so it survives this conversation. ' +
        'Routing is automatic by default: a general statement becomes a semantic fact, ' +
        'a narrated event becomes an episode, a sequence of instructions becomes a procedure. ' +
        'Set `type` only when you want to override that. Returns the id of the stored memory.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
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
          .describe('Emotional significance (0–1). Detected from the content when omitted.'),
        source: z
          .string()
          .optional()
          .describe("Where this came from, e.g. 'user', 'ai', 'import'."),
        steps: z
          .array(z.string())
          .optional()
          .describe("Ordered steps. Required when type is 'procedure'."),
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
        'Search long-term memory for anything relevant to a query. Searches every layer ' +
        'by default and returns results ranked by relevance, each tagged with the layer it ' +
        'came from. Use this before answering when the user refers to something from an ' +
        'earlier session.',
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: {
        query: z.string().min(1).describe('What to look for, in plain language.'),
        layers: z
          .array(z.enum(LAYERS))
          .optional()
          .describe('Restrict the search to these layers. Defaults to all but working.'),
        limit: z.number().int().min(1).max(100).optional().describe('Maximum results (default 10).'),
        minConfidence: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('Drop results below this confidence.'),
        includeContext: z
          .boolean()
          .optional()
          .describe('Boost results matching the current context.'),
        taskType: z
          .string()
          .optional()
          .describe("Current task, e.g. 'coding', 'writing' — used for context matching."),
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
      const opts: RecallOptions = {};
      if (rest.layers !== undefined) opts.layers = rest.layers as RecallOptions['layers'];
      if (rest.limit !== undefined) opts.limit = rest.limit;
      if (rest.minConfidence !== undefined) opts.minConfidence = rest.minConfidence;
      if (rest.includeContext !== undefined) opts.includeContext = rest.includeContext;
      if (rest.taskType !== undefined) opts.taskType = rest.taskType;

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
        'Run one consolidation pass: promote repeated episodes into semantic facts, decay ' +
        'stale working-memory slots, prune what has fallen below the retention threshold. ' +
        'This is the sleep-like maintenance step — safe to run periodically, not per turn.',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      inputSchema: {},
      outputSchema: {
        promoted: z.number().describe('Episodes promoted to semantic facts.'),
        decayed: z.number().describe('Working-memory slots decayed.'),
        pruned: z.number().describe('Items pruned below the retention threshold.'),
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
        'Report how full each of the seven layers is: working-memory slots in use, ' +
        'interactions held, episodes, facts and how many are due for review, procedures, ' +
        'core blocks. Use it to check what the agent actually remembers.',
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: {},
    },
    async () => {
      const health = await coordinator.getHealth();
      return { content: text(health) };
    },
  );

  return server;
}
