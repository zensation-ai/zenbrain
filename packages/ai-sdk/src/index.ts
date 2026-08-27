/**
 * @zensation/ai-sdk
 *
 * ZenBrain as Vercel AI SDK middleware: recall before the model call, store after it.
 *
 * The middleware is a plain object — `wrapLanguageModel` is called by *you*, not by this
 * package. That is why nothing here is imported from `ai` at runtime; only its types are.
 * The package therefore ships with zero runtime dependencies, like the rest of the core
 * chain.
 */
import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Message,
  LanguageModelV4Middleware,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import type { MemoryCoordinator, RecallOptions, StoreOptions } from '@zensation/core';

/** Layers the coordinator understands, repeated here so callers get completion. */
export type MemoryLayer = 'working' | 'episodic' | 'semantic' | 'procedural' | 'core';

export interface ZenBrainMemoryOptions {
  /** A live MemoryCoordinator. This package never creates or closes one. */
  coordinator: MemoryCoordinator;

  /** How to search before each call. Set to `false` to disable recall entirely. */
  recall?:
    | false
    | {
        /** Maximum memories to inject. Default 5. */
        limit?: number;
        /** Restrict the search to these layers. */
        layers?: MemoryLayer[];
        /** Drop memories below this confidence. */
        minConfidence?: number;
        /** Current task type, used for context-dependent retrieval. */
        taskType?: string;
      };

  /** What to write back after each call. Set to `false` to disable writing. */
  store?:
    | false
    | {
        /** Store the user's message. Default true. */
        user?: boolean;
        /** Store the model's reply. Default false — replies are cheap to regenerate. */
        assistant?: boolean;
        /** Context domain for stored memories, e.g. 'work'. */
        context?: string;
        /** Source attribution. Defaults to 'user' / 'ai' per turn. */
        source?: string;
      };

  /**
   * The line placed above the recalled memories in the injected system message.
   * Keep it short; it is spent from the same context budget as the memories.
   */
  header?: string;

  /**
   * Called when recall or store throws. Defaults to swallowing the error, because a
   * memory layer that breaks a chat is worse than one that forgets. Pass your logger
   * here to see what it is hiding.
   */
  onError?: (error: unknown, phase: 'recall' | 'store') => void;
}

const DEFAULT_HEADER = 'Relevant memories from earlier sessions:';
const DEFAULT_LIMIT = 5;

/** Pulls the plain text out of one prompt message, ignoring files and tool parts. */
function messageText(message: LanguageModelV4Message | undefined): string {
  if (!message) return '';
  if (message.role === 'system') return typeof message.content === 'string' ? message.content : '';
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter((part): part is { type: 'text'; text: string } => {
      const p = part as { type?: unknown; text?: unknown };
      return p.type === 'text' && typeof p.text === 'string';
    })
    .map((part) => part.text)
    .join('\n')
    .trim();
}

/** The last message from the user, which is what a recall should be about. */
function lastUserText(prompt: readonly LanguageModelV4Message[]): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    if (prompt[i].role === 'user') return messageText(prompt[i]);
  }
  return '';
}

/**
 * Builds the middleware.
 *
 * ```ts
 * const model = wrapLanguageModel({
 *   model: openai('gpt-5'),
 *   middleware: zenbrainMemory({ coordinator }),
 * });
 * ```
 */
export function zenbrainMemory(options: ZenBrainMemoryOptions): LanguageModelV4Middleware {
  const { coordinator, onError } = options;
  const recallOpts = options.recall === false ? false : (options.recall ?? {});
  const storeOpts = options.store === false ? false : (options.store ?? {});
  const header = options.header ?? DEFAULT_HEADER;

  const report = (err: unknown, phase: 'recall' | 'store'): void => {
    if (onError) onError(err, phase);
  };

  /** Writes one turn back into memory. Never throws into the caller's request. */
  const remember = async (userText: string, assistantText: string): Promise<void> => {
    if (storeOpts === false) return;
    const base: StoreOptions = {};
    if (storeOpts.context !== undefined) base.context = storeOpts.context;

    try {
      if (storeOpts.user !== false && userText) {
        await coordinator.store(userText, { ...base, source: storeOpts.source ?? 'user' });
      }
      if (storeOpts.assistant === true && assistantText) {
        await coordinator.store(assistantText, { ...base, source: storeOpts.source ?? 'ai' });
      }
    } catch (err) {
      report(err, 'store');
    }
  };

  return {
    specificationVersion: 'v4',

    async transformParams({ params }): Promise<LanguageModelV4CallOptions> {
      if (recallOpts === false) return params;

      const query = lastUserText(params.prompt);
      if (!query) return params;

      let memories: string[];
      try {
        const search: RecallOptions = { limit: recallOpts.limit ?? DEFAULT_LIMIT };
        if (recallOpts.layers) search.layers = recallOpts.layers;
        if (recallOpts.minConfidence !== undefined) search.minConfidence = recallOpts.minConfidence;
        if (recallOpts.taskType !== undefined) search.taskType = recallOpts.taskType;

        const results = await coordinator.recall(query, search);
        // `content` is typed as required but assembled from whatever the storage
        // adapter returned. A row that lost it must not produce a blank bullet.
        memories = results
          .filter((r) => typeof r.content === 'string' && r.content.length > 0)
          .map((r) => `- ${r.content}`);
      } catch (err) {
        report(err, 'recall');
        return params;
      }

      // Nothing recalled means nothing to inject. Never spend context on an empty header.
      if (memories.length === 0) return params;

      const memoryMessage: LanguageModelV4Message = {
        role: 'system',
        content: `${header}\n${memories.join('\n')}`,
      };

      // Prepended, so the caller's own system prompt keeps the last word.
      return { ...params, prompt: [memoryMessage, ...params.prompt] };
    },

    async wrapGenerate({ doGenerate, params }) {
      const result = await doGenerate();

      const userText = lastUserText(params.prompt);
      const assistantText = result.content
        .filter((c): c is { type: 'text'; text: string } => {
          const p = c as { type?: unknown; text?: unknown };
          return p.type === 'text' && typeof p.text === 'string';
        })
        .map((c) => c.text)
        .join('')
        .trim();

      await remember(userText, assistantText);
      return result;
    },

    async wrapStream({ doStream, params }) {
      const result = await doStream();
      const userText = lastUserText(params.prompt);

      // The reply only exists once the stream has run, so accumulate the deltas and
      // write on flush. The stream is passed through unchanged — a memory layer must
      // not sit between the model and the screen.
      let assistantText = '';
      const capture = new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
        transform(chunk, controller) {
          if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
            assistantText += chunk.delta;
          }
          controller.enqueue(chunk);
        },
        async flush() {
          await remember(userText, assistantText.trim());
        },
      });

      return { ...result, stream: result.stream.pipeThrough(capture) };
    },
  };
}
