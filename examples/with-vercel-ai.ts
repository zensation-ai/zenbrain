/**
 * ZenBrain + Vercel AI SDK Integration Example
 *
 * Shows how to build a memory-aware system prompt for the Vercel AI SDK
 * `streamText` pattern. Uses WorkingMemory for active context and FSRS
 * to filter facts by their current retrievability.
 *
 * == Neuroscience Background ==
 *
 * This example demonstrates "Retrieval-Based Learning" (Karpicke & Roediger, 2008):
 * the act of RECALLING information strengthens it more than re-studying.
 * Each time the AI successfully uses a fact in a response, calling
 * `updateAfterRecall(state, grade)` strengthens that memory's stability.
 *
 * The `recallFacts()` function filters by retrievability threshold — mimicking
 * how the brain can't access memories below a certain activation level.
 * Facts with high emotional priority (via `computeEmotionalWeight`) are
 * retrieved preferentially, matching the amygdala's role in memory access.
 *
 * The combination of:
 * - Working Memory (immediate context, 5 slots)
 * - FSRS scheduling (long-term retention optimization)
 * - Emotional prioritization (significance-based ranking)
 * creates a biologically plausible memory system for AI assistants.
 *
 * Prerequisites:
 *   npm install @zensation/algorithms @zensation/core ai @ai-sdk/openai
 *
 * Run:
 *   npx tsx examples/with-vercel-ai.ts
 */
import { WorkingMemory, ShortTermMemory } from '@zensation/core';
import {
  initFromDecayClass,
  getRetrievability,
  updateAfterRecall,
  scheduleNextReview,
  tagEmotion,
  computeEmotionalWeight,
  type FSRSState,
} from '@zensation/algorithms';
// import { streamText } from 'ai';
// import { openai } from '@ai-sdk/openai';

// --- Fact store with FSRS + emotional priority ---

interface Fact {
  content: string;
  fsrs: FSRSState;
  priority: number; // emotional consolidation weight
}

const facts: Fact[] = [];
const session = new ShortTermMemory({ maxInteractions: 20 });
const workingMem = new WorkingMemory({ maxSlots: 5 });

function storeFact(content: string): void {
  const emotion = tagEmotion(content);
  const { consolidationWeight } = computeEmotionalWeight(emotion);
  facts.push({
    content,
    fsrs: initFromDecayClass('good'),
    priority: consolidationWeight,
  });
}

/** Return facts above a retrievability threshold, sorted by emotional priority. */
function recallFacts(minRetrievability = 0.6): string[] {
  return facts
    .filter(f => getRetrievability(f.fsrs) >= minRetrievability)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10)
    .map(f => `- ${f.content} (recall: ${(getRetrievability(f.fsrs) * 100).toFixed(0)}%)`);
}

/** Assemble the system prompt from working memory + long-term facts. */
function buildSystemPrompt(): string {
  const slots = workingMem.getSlots();
  const retained = recallFacts();

  const sections: string[] = [
    'You are a helpful AI assistant with persistent memory.',
  ];

  if (slots.length > 0) {
    sections.push(
      '## Active Context',
      ...slots.map(s => `- [${s.type}] ${s.content}`),
    );
  }

  if (retained.length > 0) {
    sections.push('## Remembered Facts', ...retained);
  }

  const recentHistory = session.getRecent(5);
  if (recentHistory.length > 0) {
    sections.push(
      '## Recent Conversation',
      ...recentHistory.map(h => `${h.role}: ${h.content}`),
    );
  }

  return sections.join('\n');
}

// --- Vercel AI SDK integration point ---

async function chat(userMessage: string) {
  session.addInteraction('user', userMessage);
  const systemPrompt = buildSystemPrompt();

  // Uncomment to use with real Vercel AI SDK:
  // const result = streamText({
  //   model: openai('gpt-4o'),
  //   system: systemPrompt,
  //   messages: session.toMessages(),
  // });
  // for await (const chunk of result.textStream) {
  //   process.stdout.write(chunk);
  // }

  console.log('--- System Prompt ---');
  console.log(systemPrompt);
  console.log('--- End ---\n');

  // Simulate assistant response and post-response FSRS update
  const response = 'I remember your preference for TypeScript. Let me help with that.';
  session.addInteraction('assistant', response);
}

// --- Demo ---

async function main() {
  // Seed memory from prior sessions
  storeFact('User prefers functional programming patterns');
  storeFact('User is building a SaaS product launching in April');
  storeFact('User had a bad experience with ORMs — prefers raw SQL');
  await workingMem.add('Help user design the billing API', 'goal', 1.0);
  await workingMem.add('Stack: TypeScript, PostgreSQL, Hono', 'context', 0.8);

  session.startSession('vercel-ai-demo');

  await chat('What database pattern should I use for the billing module?');

  // After the user confirms a fact was useful, strengthen it
  const billingFact = facts[1];
  billingFact.fsrs = updateAfterRecall(billingFact.fsrs, 5);
  billingFact.fsrs.nextReview = scheduleNextReview(billingFact.fsrs);
  console.log('SaaS fact next review:', billingFact.fsrs.nextReview.toISOString());
}

main().catch(console.error);
