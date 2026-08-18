# ZenBrain Examples

Seven runnable examples. Every file carries a detailed header comment explaining
the cognitive mechanism it demonstrates and the neuroscience behind it — this
page is the index and the run guide.

## The examples

| Example | What it demonstrates |
|---|---|
| [`basic-chatbot.ts`](basic-chatbot.ts) | Working Memory + Short-Term Memory giving a chatbot conversation context and task awareness. |
| [`with-claude.ts`](with-claude.ts) | ZenBrain's memory layers behind the Anthropic Claude API, for an assistant that remembers across conversations. |
| [`with-crewai.ts`](with-crewai.ts) | Multiple agents (Researcher, Writer, Reviewer) sharing Working Memory, with Hebbian learning strengthening connections between co-activated concepts. |
| [`with-langchain.ts`](with-langchain.ts) | ZenBrain as a memory backend for a LangChain agent: turns in ShortTermMemory, facts scheduled with FSRS, emotional tagging for prioritisation. |
| [`with-llamaindex.ts`](with-llamaindex.ts) | ZenBrain's `MemoryCoordinator` as long-term memory for a LlamaIndex.TS agent — LlamaIndex keeps the short-term window, ZenBrain decides what outlives it. |
| [`with-mastra.ts`](with-mastra.ts) | ZenBrain's `MemoryCoordinator` behind a Mastra agent: a Processor records each turn, and the agent's instructions are rebuilt from what is currently recallable. |
| [`with-vercel-ai.ts`](with-vercel-ai.ts) | A memory-aware system prompt for the Vercel AI SDK `streamText` pattern, with FSRS filtering facts by current retrievability. |

## Running them

From the repository root:

```bash
npx tsx examples/basic-chatbot.ts
```

Any example runs the same way — swap the filename.

**Five of the seven run as-is**, on the workspace packages alone
(`@zensation/core`, `@zensation/algorithms`): `basic-chatbot`, `with-claude`,
`with-crewai`, `with-mastra` and `with-vercel-ai`.

**Two need a third-party package installed first**, because they import a value
from it at runtime:

| Example | Install before running |
|---|---|
| `with-langchain.ts` | `@langchain/core` |
| `with-llamaindex.ts` | `@llamaindex/core` (its header also lists `llamaindex`) |

Without it the run stops immediately with `ERR_MODULE_NOT_FOUND`.

`with-mastra.ts` is the exception worth knowing: it imports `@mastra/core` with
`import type`, so the import disappears at runtime and the example runs without
Mastra installed. You only need the package to type-check it.

Each file repeats its own `npm install` line in the header comment — that line
is authoritative for the example you are about to run.

## No API keys required

**None of the seven makes a live model call.** Each one builds the prompt, the
memory state and the retrieval decision, then prints the result; the actual
provider call sits next to it, commented out (see the end of `with-claude.ts`).
No key is needed to run any of them. The `ANTHROPIC_API_KEY` line in
`with-claude.ts` applies only once you uncomment that call and wire it up.

## What CI runs

The CI workflow runs a single smoke test over this folder:

```bash
npx tsx examples/basic-chatbot.ts
```

So `basic-chatbot.ts` is exercised on every commit that reaches `main`. The
other six are not covered by CI.
