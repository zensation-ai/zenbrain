/**
 * ZenBrain + Mastra Integration Example
 *
 * Shows how to use ZenBrain's MemoryCoordinator as the memory layer behind a
 * Mastra agent: a Processor records every turn on its way to the model, and the
 * agent's instructions are rebuilt each turn from what ZenBrain can currently
 * recall.
 *
 * == Where the seam is ==
 *
 * Mastra offers two extension points, and this example uses both for the half
 * each is good at:
 *
 *   Processor.processInput  -> the WRITE path. Sees every message, returns them
 *                              unchanged, and consolidates on the way past.
 *   dynamic instructions    -> the READ path. Built per turn from recall().
 *
 * The write path deliberately does not rewrite messages. A processor that both
 * observes and rewrites is very hard to debug later, because a wrong answer no
 * longer tells you whether retrieval or rewriting caused it.
 *
 * == Neuroscience Background ==
 *
 * Splitting write from read mirrors the difference between encoding and
 * retrieval, which are not the same operation run backwards. Encoding is
 * automatic and cheap; retrieval is cue-driven, effortful, and can fail. The
 * testing effect (Roediger & Karpicke, 2006) is the clearest evidence they are
 * separate: retrieving a fact strengthens it more than re-reading it does.
 *
 * That is why `recordReview()` exists in the read path below rather than the
 * write path — a fact that was successfully used gets its schedule updated,
 * which is exactly the asymmetry the effect describes.
 *
 * Prerequisites:
 *   npm install @zensation/core @mastra/core
 *
 * Verified against @mastra/core 0.24.9 (2026-08-14). Two details differ from
 * some published docs: the Processor identity field is `name` (not `id`), and
 * the message type is `MastraMessageV2` (not `MastraDBMessage`).
 *
 * Run (no API key needed — the demo stops before the model call):
 *   npx tsx examples/with-mastra.ts
 */
import { MemoryCoordinator, InMemoryStorage, FakeEmbeddingProvider } from '@zensation/core';
import type { Processor } from '@mastra/core/processors';
import type { MastraMessageV2 } from '@mastra/core/agent';

// --- Memory setup ---
// InMemoryStorage + FakeEmbeddingProvider come from @zensation/core's testing
// exports, so this file runs with no database and no API key. Swap in
// @zensation/adapter-sqlite (or -postgres) and a real embedding provider for
// anything you intend to keep.

const memory = new MemoryCoordinator({
  storage: new InMemoryStorage(),
  embedding: new FakeEmbeddingProvider(),
  contexts: ['personal', 'work', 'learning'],
});

/** Pull plain text out of a Mastra message without assuming a single part shape. */
function textOf(message: MastraMessageV2): string {
  const parts = message.content?.parts ?? [];
  return parts
    .filter((p): p is typeof p & { text: string } => p.type === 'text' && 'text' in p)
    .map(p => p.text)
    .join(' ')
    .trim();
}

// --- Write path: a Processor that records, and changes nothing ---

class ZenBrainRecorder implements Processor {
  readonly name = 'zenbrain-recorder';

  async processInput({ messages }: { messages: MastraMessageV2[] }): Promise<MastraMessageV2[]> {
    for (const message of messages) {
      const text = textOf(message);
      if (!text) continue;

      const role = message.role === 'assistant' ? 'assistant' : 'user';
      memory.addInteraction(role, text);

      // Only user statements become candidate long-term material. Storing the
      // model's own output would let the agent consolidate its guesses into
      // facts, which is how long-running agents become confidently wrong.
      if (role === 'user') {
        await memory.store(text, { type: 'auto', context: 'work' });
      }
    }

    // Returned unchanged on purpose — see "Where the seam is" above.
    return messages;
  }
}

// --- Read path: instructions rebuilt from recall each turn ---

const BASE_INSTRUCTIONS = 'You are a helpful assistant. Use what you remember, and say so when you do not know.';

async function instructionsFor(userInput: string): Promise<string> {
  const recalled = await memory.recall(userInput, {
    layers: ['semantic', 'episodic', 'core'],
    limit: 5,
    minConfidence: 0.6,
  });

  if (recalled.length === 0) {
    // Retrieval that can come back empty is the point: it tells the model to
    // ask rather than to invent.
    return BASE_INSTRUCTIONS;
  }

  const lines = recalled
    .sort((a, b) => b.score - a.score)
    .map(r => `- [${r.layer}] ${r.content}`)
    .join('\n');

  return `${BASE_INSTRUCTIONS}\n\nWhat you remember about this:\n${lines}`;
}

// --- Demo usage ---

async function main() {
  memory.startSession('mastra-demo');

  const recorder = new ZenBrainRecorder();

  // Simulate what Mastra hands a processor on the way to the model.
  const incoming = [
    {
      id: '1',
      role: 'user',
      createdAt: new Date(),
      content: { format: 2, parts: [{ type: 'text', text: 'Our production database runs in eu-central-1' }] },
    },
    {
      id: '2',
      role: 'user',
      createdAt: new Date(),
      content: { format: 2, parts: [{ type: 'text', text: 'The March 30th deadline is the hard kind' }] },
    },
  ] as unknown as MastraMessageV2[];

  await recorder.processInput({ messages: incoming });

  const question = 'How should I prioritise my work today?';
  const instructions = await instructionsFor(question);

  console.log('--- instructions for this turn ---');
  console.log(instructions);

  // Hand both to Mastra. In a real program:
  //
  //   import { Agent } from '@mastra/core/agent';
  //   const agent = new Agent({
  //     name: 'assistant',
  //     model,
  //     instructions: async ({ runtimeContext }) => instructionsFor(currentInput(runtimeContext)),
  //     inputProcessors: [recorder],
  //   });
  //   const result = await agent.generate(question);
  //
  // Rebuild instructions per turn — recall() is cue-dependent, so instructions
  // built for the previous question are stale in a way that is easy to miss.

  // A fact that was actually used gets its review schedule updated (testing effect).
  const due = await memory.getReviewQueue(3);
  if (due[0]) {
    await memory.recordReview(due[0].id, 4);
    console.log('\nreviewed:', due[0].content);
  }

  const { promoted, decayed, pruned } = await memory.consolidate();
  console.log(`consolidated: ${promoted} promoted, ${decayed} decayed, ${pruned} pruned`);

  await memory.close();
}

main().catch(console.error);
