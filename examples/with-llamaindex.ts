/**
 * ZenBrain + LlamaIndex.TS Integration Example
 *
 * Shows how to use ZenBrain's MemoryCoordinator as the long-term memory
 * backend for a LlamaIndex.TS agent. LlamaIndex keeps the short-term
 * conversation window; ZenBrain decides what is worth keeping beyond it,
 * and hands back only what is currently retrievable.
 *
 * == Where the seam is ==
 *
 * LlamaIndex composes memory from *blocks* (`createMemory({ memoryBlocks })`)
 * and merges short- and long-term content within `tokenLimit`. This example
 * puts ZenBrain behind a `staticBlock` that is refreshed per turn from
 * `coordinator.recall()`. That keeps the integration on documented LlamaIndex
 * API and leaves both sides doing what they are good at:
 *
 *   LlamaIndex  -> token budgeting, message adapters, agent loop
 *   ZenBrain    -> what to remember, what to surface, what to let go
 *
 * == Neuroscience Background ==
 *
 * This mirrors the split between working memory and long-term storage. The
 * conversation window is Baddeley's phonological loop: small, recent, and
 * overwritten constantly. `recall()` is cued retrieval from consolidated
 * stores — you do not get everything you ever knew, you get what the current
 * cue makes accessible (Tulving's encoding specificity, 1973).
 *
 * The practical consequence is the reason to bother: an agent that pastes its
 * whole history into context does not remember, it re-reads. Retrieval that
 * can *fail* is what makes remembering informative.
 *
 * Prerequisites:
 *   npm install @zensation/core @llamaindex/core llamaindex
 *
 * Verified against @llamaindex/core 0.6.22 (2026-08-14). Note the import path:
 * `staticBlock` and `createMemory` live in `@llamaindex/core/memory`, not in the
 * `llamaindex` umbrella package — some published docs show them imported from
 * `"llamaindex"`, which does not resolve.
 *
 * Run (no API key needed — the demo stops before the model call):
 *   npx tsx examples/with-llamaindex.ts
 */
import { MemoryCoordinator, InMemoryStorage, FakeEmbeddingProvider } from '@zensation/core';
import { staticBlock } from '@llamaindex/core/memory';

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

// --- The bridge: ZenBrain recall -> a LlamaIndex memory block ---

/**
 * Build the long-term block for one turn.
 *
 * Note the `limit`: this is a budget decision, not a search-quality one.
 * Everything returned here competes for the same `tokenLimit` as the live
 * conversation, so a generous limit silently evicts recent turns.
 */
async function longTermBlock(userInput: string, limit = 5) {
  const recalled = await memory.recall(userInput, {
    layers: ['semantic', 'episodic', 'core'],
    limit,
    minConfidence: 0.6,
  });

  if (recalled.length === 0) {
    // An empty block is a real answer: nothing consolidated matches this cue.
    return staticBlock({ content: '' });
  }

  const lines = recalled
    .sort((a, b) => b.score - a.score)
    .map(r => `- [${r.layer}] ${r.content}`)
    .join('\n');

  return staticBlock({ content: `What you remember about this:\n${lines}` });
}

/** Record a turn in both systems: ZenBrain for consolidation, the return value for the agent. */
async function recordTurn(role: 'user' | 'assistant', content: string) {
  memory.addInteraction(role, content);
  // Only user statements are stored as candidate long-term material. Storing the
  // assistant's own output would let the agent consolidate its own guesses into
  // facts — the failure mode that makes long-running agents confidently wrong.
  if (role === 'user') {
    await memory.store(content, { type: 'auto', context: 'work' });
  }
}

// --- Demo usage ---

async function main() {
  memory.startSession('llamaindex-demo');

  // Seed a few turns' worth of prior knowledge
  await recordTurn('user', 'I prefer TypeScript over JavaScript for anything with a team');
  await recordTurn('user', 'The project deadline is March 30th and it is the hard kind');
  await recordTurn('user', 'Our production database runs in eu-central-1');

  // A new turn: build the block that will go into the agent's context
  const question = 'How should I prioritise my work today?';
  const block = await longTermBlock(question);

  console.log('--- long-term block for this turn ---');
  console.log(block);

  // Hand it to LlamaIndex. In a real program:
  //
  //   import { createMemory, agent } from 'llamaindex';
  //   const mem = createMemory({ tokenLimit: 40000, memoryBlocks: [block] });
  //   const workflow = agent({ name: 'assistant', llm, memory: mem });
  //   const response = await workflow.run(question);
  //   await recordTurn('assistant', response.data.result);
  //
  // Rebuild the block each turn — `recall()` is cue-dependent, so a block built
  // for the previous question is stale in a way that is easy to miss.

  await recordTurn('user', question);

  // Between sessions, not during one: promote what was reinforced, decay the rest.
  const { promoted, decayed, pruned } = await memory.consolidate();
  console.log(`\nconsolidated: ${promoted} promoted, ${decayed} decayed, ${pruned} pruned`);

  const health = await memory.getHealth();
  console.log('semantic facts:', health.semantic.count, '| due for review:', health.semantic.dueForReview);

  await memory.close();
}

main().catch(console.error);
