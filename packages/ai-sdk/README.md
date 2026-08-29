# @zensation/ai-sdk

**Status: early release.** The option shape may still change before 1.0. The memory
layers underneath are the ones the [ZenBrain paper](https://arxiv.org/abs/2604.23878)
describes and the
[benchmarks](https://github.com/zensation-ai/zenbrain/blob/main/docs/benchmarks.md) measure.

ZenBrain as [Vercel AI SDK](https://ai-sdk.dev) middleware. Recall what is relevant before
the model call, store the turn after it. Works with any provider the AI SDK supports,
because it never touches the provider.

```bash
npm install @zensation/ai-sdk @zensation/core @zensation/adapter-sqlite
```

```typescript
import { generateText, wrapLanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { MemoryCoordinator } from '@zensation/core';
import { SqliteAdapter } from '@zensation/adapter-sqlite';
import { zenbrainMemory } from '@zensation/ai-sdk';

const coordinator = new MemoryCoordinator({
  storage: new SqliteAdapter({ filename: './memory.db' }),
});

const model = wrapLanguageModel({
  model: openai('gpt-5'),
  middleware: zenbrainMemory({ coordinator }),
});

await generateText({ model, prompt: 'Anna moved to Hamburg in March.' });

// A later call, possibly days later, in a different process:
const { text } = await generateText({ model, prompt: 'Where does Anna live?' });
```

Between the two calls nothing was passed by hand. The second prompt arrives at the model
with a system message in front of it:

```
Relevant memories from earlier sessions:
- Anna moved to Hamburg in March.
```

## Zero runtime dependencies

The middleware is a plain object; `wrapLanguageModel` is called by you. Nothing here is
imported from `ai` at runtime — only its types are. So this package installs **nothing**:

| Package | Runtime dependencies |
|---|--:|
| `@zensation/ai-sdk` | **0** |
| `@zensation/core` | 1 (`@zensation/algorithms`) |
| `@zensation/algorithms` | **0** |

That claim is [checked in CI on every push](https://github.com/zensation-ai/zenbrain/blob/main/scripts/verify-zero-dependencies.sh)
against the packed tarballs rather than the source tree.

## Options

```typescript
zenbrainMemory({
  coordinator,                     // required — you own its lifecycle

  recall: {                        // or false to switch searching off
    limit: 5,                      // how many memories to inject
    layers: ['semantic', 'core'],  // which layers to search
    minConfidence: 0.6,            // drop anything below this
    taskType: 'coding',            // context-dependent retrieval hint
  },

  store: {                         // or false to switch writing off
    user: true,                    // store the user's message (default)
    assistant: false,              // store the reply too (default off)
    context: 'work',               // context domain for what gets stored
  },

  header: 'Relevant memories from earlier sessions:',

  onError: (err, phase) => console.warn(`[zenbrain] ${phase} failed`, err),
});
```

### Two defaults worth knowing

**Replies are not stored by default.** A model's answer is derived from the question and
cheap to regenerate; storing both sides doubles the volume and fills semantic memory with
your own model's phrasing. Turn it on with `store: { assistant: true }` when the answer
carries information the question does not.

**Failures are swallowed.** If recall or store throws, the call goes through anyway,
unmodified. A memory layer that breaks a chat is worse than one that forgets. Pass
`onError` to see what is being hidden — without it, failures are silent by design.

## Where the memory lands

Routing on store is automatic: a general statement becomes a semantic fact, a narrated
event an episode, a sequence of instructions a procedure. Which layer a memory lands in
decides how it decays and whether it survives consolidation. The seven layers, their
retention rules and the algorithms behind them are documented in the
[main README](https://github.com/zensation-ai/zenbrain#readme).

Consolidation does not run on its own. Call `coordinator.consolidate()` on a schedule that
suits your application.

## What this release does not do

- **No embedding provider is configured unless you pass one.** Semantic search then runs
  without vectors: recall still works, less sharply than the benchmarked configuration.
- **Streaming stores on flush.** The reply is written once the stream completes. An aborted
  stream stores the user's turn but not the partial answer.
- **Only text is read.** File and tool parts of a message are ignored when building the
  recall query and when storing.
- **One recall per call.** There is no re-retrieval mid-generation.

## Streaming

`streamText` works the same way and passes the stream through untouched:

```typescript
const result = streamText({
  model: wrapLanguageModel({
    model: openai('gpt-5'),
    middleware: zenbrainMemory({ coordinator, store: { assistant: true } }),
  }),
  prompt: 'Which theme should I use?',
});

for await (const chunk of result.textStream) process.stdout.write(chunk);
```

## About ZenBrain

ZenBrain is a seven-layer, neuroscience-derived memory architecture for LLM agents, built as
zero-dependency TypeScript and published under Apache-2.0. On LongMemEval-500 it wins all nine
head-to-head answer-quality comparisons against Letta, Mem0 and A-Mem (three competitors x three
LLM judges, Bonferroni-corrected), reaching 91.3% of a full-context oracle's binary-judge
accuracy at 1/106th of the per-query token cost.

- Source and issues: [github.com/zensation-ai/zenbrain](https://github.com/zensation-ai/zenbrain)
- Paper: [arXiv:2604.23878](https://arxiv.org/abs/2604.23878) · Open-access archive: [10.5281/zenodo.19353663](https://doi.org/10.5281/zenodo.19353663)
- Try it in the browser: [zensation.ai/en/playground](https://zensation.ai/en/playground)
- Packages: [`@zensation/algorithms`](https://www.npmjs.com/package/@zensation/algorithms) · [`@zensation/core`](https://www.npmjs.com/package/@zensation/core) · [`@zensation/adapter-postgres`](https://www.npmjs.com/package/@zensation/adapter-postgres) · [`@zensation/adapter-sqlite`](https://www.npmjs.com/package/@zensation/adapter-sqlite) · [`@zensation/mcp`](https://www.npmjs.com/package/@zensation/mcp) · [`@zensation/ai-sdk`](https://www.npmjs.com/package/@zensation/ai-sdk)

License: Apache-2.0
