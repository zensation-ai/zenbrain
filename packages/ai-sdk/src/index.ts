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
import type { MemoryCoordinator, RecallOptions, RecallResult, StoreOptions } from '@zensation/core';

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
        /**
         * Drop memories that score below this value (0 to 1). By default only memories scoring
         * above 0 are injected: when nothing matches, recall returns fallbacks at score 0
         * (recent episodes and facts, the most successful procedures), and those are left out.
         * Without an embedding provider, above 0 means at least one shared content word; with
         * one, any positive similarity — set a higher bar here if you need one. `minScore: 0`
         * injects the fallbacks too, as releases before 0.4.0 did. Needs `@zensation/core`
         * 0.6.0, where every layer scores 0 to 1.
         */
        minScore?: number;
        /**
         * `'matching'` injects only core blocks that share a content word with the message;
         * `'always'` (default) injects every core block. With many core blocks and a small
         * `limit`, `'matching'` keeps them from crowding out the actual hits.
         */
        core?: 'always' | 'matching';
      };

  /** What to write back after each call. Set to `false` to disable writing. */
  store?:
    | false
    | {
        /** Store the user's message. Default true. */
        user?: boolean;
        /** Store the model's reply. Default false — replies are cheap to regenerate. */
        assistant?: boolean;
        /** Context domain, e.g. 'work'. Kept with episodes only; facts and procedures have no context field. */
        context?: string;
        /** Source attribution. Defaults to 'user' / 'ai' per turn. */
        source?: string;
        /**
         * Decide per turn whether to store it, for example to keep secrets or small talk
         * out of memory. Receives the user's message and the model's reply; return
         * `false` to store neither. Default: every turn is stored.
         */
        shouldStore?: (turn: { user: string; assistant: string }) => boolean | Promise<boolean>;
      };

  /**
   * The line placed above the recalled memories in the injected message.
   * Keep it short; it is spent from the same context budget as the memories.
   */
  header?: string;

  /**
   * The role the recalled memories travel with. `'system'` (default) puts them in a system
   * message in front of the prompt, which gives anything a user once said system authority
   * when it is recalled. If text you do not trust can reach memory, use `'user'`: the
   * memories then arrive as a user message directly before the latest user turn, as context
   * rather than instruction.
   */
  role?: 'system' | 'user';

  /**
   * Called when recall or store throws. Defaults to swallowing the error, because a
   * memory layer that breaks a chat is worse than one that forgets. Pass your logger
   * here to see what it is hiding.
   */
  onError?: (error: unknown, phase: 'recall' | 'store') => void;
}

/**
 * A transformer with the `cancel` callback of the Streams standard, which Node's
 * TransformStream calls when the stream is aborted or cancelled. TypeScript's DOM lib
 * does not list it yet.
 */
type CancellableTransformer<I, O> = Transformer<I, O> & { cancel?: (reason: unknown) => void | Promise<void> };

const DEFAULT_HEADER = 'Relevant memories from earlier sessions:';
const DEFAULT_LIMIT = 5;
/** How many turns the middleware remembers what it stored for (see `ownTurns` below). */
const TURNS_KEPT = 100;

/** What one turn stored: the ids `store()` returned, and the texts. */
interface StoredTurn {
  ids: Set<string>;
  texts: Set<string>;
}

/**
 * Whether a recall result is something the current turn stored itself: every long-term memory
 * in it, the result and the twins deduplication folded into it, has an id the turn stored. An
 * earlier memory with the same text keeps the result in. A working-memory copy with no
 * long-term twin counts when it holds a text the turn stored, since it has an id of its own.
 */
function storedByTurn(result: RecallResult, turn: StoredTurn): boolean {
  const longTerm = [result, ...(result.duplicates ?? [])].filter((m) => m.layer !== 'working');
  return longTerm.length > 0 ? longTerm.every((m) => turn.ids.has(m.id)) : turn.texts.has(result.content);
}

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

/** Index of the last message from the user, or -1. */
function lastUserIndex(prompt: readonly LanguageModelV4Message[]): number {
  for (let i = prompt.length - 1; i >= 0; i--) {
    if (prompt[i].role === 'user') return i;
  }
  return -1;
}

/** The last message from the user, which is what a recall should be about. */
function lastUserText(prompt: readonly LanguageModelV4Message[]): string {
  const i = lastUserIndex(prompt);
  return i < 0 ? '' : messageText(prompt[i]);
}

/**
 * Whether this model call is a follow-up step of the user's turn: tool results came after the
 * user's last message, and the AI SDK calls the model again with them. The middleware runs on
 * every model call, and until 0.4.1 it stored the user's turn after each step, so a call with
 * one tool call put it into memory twice (measured on 2026-11-22 against 0.4.0).
 */
function isFollowUpStep(prompt: readonly LanguageModelV4Message[]): boolean {
  return prompt.slice(lastUserIndex(prompt) + 1).some((message) => message.role === 'tool');
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
  const role = options.role ?? 'system';

  const report = (err: unknown, phase: 'recall' | 'store'): void => {
    if (onError) onError(err, phase);
  };

  /**
   * What each turn of a call with tool steps stored, by the text of the user's message, so that
   * its follow-up steps can leave it out of their memories: it is the turn itself, not a memory
   * from an earlier session. The first step of a turn starts its entry afresh. Keyed by the
   * text, because the steps of one call share nothing else the middleware sees; two calls with
   * the same message at the same time therefore share an entry. The oldest entries go first.
   */
  const ownTurns = new Map<string, StoredTurn>();
  const noteStored = (userText: string, id: unknown, text: string): void => {
    const turn = ownTurns.get(userText);
    if (turn && typeof id === 'string') {
      turn.ids.add(id);
      turn.texts.add(text);
    }
  };

  /**
   * Writes one turn back into memory. Never throws into the caller's request. In a follow-up
   * step the user's turn is already stored, after the first step; only a reply can be new.
   */
  const remember = async (userText: string, assistantText: string, followUp: boolean): Promise<void> => {
    if (storeOpts === false) return;
    if (!followUp) {
      ownTurns.delete(userText);
      ownTurns.set(userText, { ids: new Set(), texts: new Set() });
      if (ownTurns.size > TURNS_KEPT) ownTurns.delete(ownTurns.keys().next().value!);
    }
    if (followUp && !(storeOpts.assistant === true && assistantText)) return;
    const base: StoreOptions = {};
    if (storeOpts.context !== undefined) base.context = storeOpts.context;

    try {
      if (storeOpts.shouldStore && !(await storeOpts.shouldStore({ user: userText, assistant: assistantText }))) {
        return;
      }
      if (!followUp && storeOpts.user !== false && userText) {
        noteStored(userText, await coordinator.store(userText, { ...base, source: storeOpts.source ?? 'user' }), userText);
      }
      if (storeOpts.assistant === true && assistantText) {
        noteStored(userText, await coordinator.store(assistantText, { ...base, source: storeOpts.source ?? 'ai' }), assistantText);
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

      // In a follow-up step the turn was stored after the first step, and the recall finds it:
      // the question being asked, not a memory from an earlier session (measured on 2026-11-22,
      // it came first among the memories of the second model call). What the turn stored is left
      // out by its ids, and the recall asks for that many more, so `limit` still holds.
      const turn = isFollowUpStep(params.prompt) ? ownTurns.get(query) : undefined;
      const limit = recallOpts.limit ?? DEFAULT_LIMIT;

      let memories: string[];
      try {
        const search: RecallOptions = { limit: limit + (turn?.ids.size ?? 0) };
        if (recallOpts.layers) search.layers = recallOpts.layers;
        if (recallOpts.minConfidence !== undefined) search.minConfidence = recallOpts.minConfidence;
        if (recallOpts.core !== undefined) search.core = recallOpts.core;
        if (recallOpts.minScore !== undefined) search.minScore = recallOpts.minScore;

        const results = await coordinator.recall(query, search);
        // Fallbacks (score 0) come after every hit, so dropping them never costs a hit.
        const relevant = (score: unknown) =>
          typeof score === 'number' &&
          (recallOpts.minScore === undefined ? score > 0 : score >= recallOpts.minScore);
        // `content` is typed as required but assembled from whatever the storage
        // adapter returned. A row that lost it must not produce a blank bullet.
        memories = results
          .filter((r) => relevant(r.score) && typeof r.content === 'string' && r.content.length > 0)
          .filter((r) => !(turn && storedByTurn(r, turn)))
          .slice(0, limit)
          .map((r) => `- ${r.content}`);
      } catch (err) {
        report(err, 'recall');
        return params;
      }

      // Nothing recalled means nothing to inject. Never spend context on an empty header.
      if (memories.length === 0) return params;

      const body = `${header}\n${memories.join('\n')}`;

      if (role === 'user') {
        // Just before the turn it is about, as context rather than instruction. A query was
        // found, so there is a user message to put it in front of.
        const prompt = [...params.prompt];
        prompt.splice(lastUserIndex(prompt), 0, { role: 'user', content: [{ type: 'text', text: body }] });
        return { ...params, prompt };
      }

      // Prepended, so the caller's own system prompt keeps the last word.
      const memoryMessage: LanguageModelV4Message = { role: 'system', content: body };
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

      await remember(userText, assistantText, isFollowUpStep(params.prompt));
      return result;
    },

    async wrapStream({ doStream, params }) {
      const result = await doStream();
      const userText = lastUserText(params.prompt);
      const followUp = isFollowUpStep(params.prompt);

      // The reply only exists once the stream has run, so accumulate the deltas and
      // write on flush. The stream is passed through unchanged — a memory layer must
      // not sit between the model and the screen.
      //
      // An abort through `abortSignal` stores the user's turn but not the partial reply:
      // what the user said is complete, half an answer is not. A provider whose stream
      // errors on abort (fetch does) reaches `cancel`; one that just ends the stream
      // reaches `flush` with the signal set. Until 0.4.0 an abort stored nothing when the
      // provider errored its stream, and the turn with the partial reply when it closed it.
      // A stream that errors for any other reason stores nothing; a provider that reports a
      // failure as an `error` part and then ends the stream reaches `flush` as usual.
      let assistantText = '';
      const aborted = () => params.abortSignal?.aborted === true;
      const transformer: CancellableTransformer<LanguageModelV4StreamPart, LanguageModelV4StreamPart> = {
        transform(chunk, controller) {
          if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
            assistantText += chunk.delta;
          }
          controller.enqueue(chunk);
        },
        async flush() {
          await remember(userText, aborted() ? '' : assistantText.trim(), followUp);
        },
        async cancel() {
          if (aborted()) await remember(userText, '', followUp);
        },
      };
      const capture = new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>(transformer);

      return { ...result, stream: result.stream.pipeThrough(capture) };
    },
  };
}
