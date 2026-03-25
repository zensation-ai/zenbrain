/**
 * ZenBrain + LangChain Integration Example
 *
 * Shows how to use ZenBrain as a memory backend for a LangChain agent.
 * Conversation turns are stored in ShortTermMemory, facts are scheduled
 * for review with FSRS, and emotional tagging prioritizes important memories.
 *
 * Prerequisites:
 *   npm install @zensation/algorithms @zensation/core @langchain/core @langchain/openai
 *
 * Run:
 *   npx tsx examples/with-langchain.ts
 */
import { ShortTermMemory, WorkingMemory } from '@zensation/core';
import {
  initFromDecayClass,
  getRetrievability,
  updateAfterRecall,
  scheduleNextReview,
  tagEmotion,
  computeEmotionalWeight,
  type FSRSState,
} from '@zensation/algorithms';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

// --- Memory setup ---

const session = new ShortTermMemory({ maxInteractions: 30 });
session.startSession('langchain-demo');

const workingMemory = new WorkingMemory({ maxSlots: 7 });

// Simulated fact store with FSRS scheduling state
interface StoredFact {
  content: string;
  fsrs: FSRSState;
  emotionalWeight: number;
}
const factStore: StoredFact[] = [];

// --- Core functions to wire into your LangChain chain ---

/** Store a new fact extracted from conversation, tagged with emotion and FSRS state. */
function learnFact(content: string): StoredFact {
  const emotion = tagEmotion(content);
  const { consolidationWeight } = computeEmotionalWeight(emotion);
  const fsrs = initFromDecayClass('good'); // new fact, assume good initial recall
  const fact: StoredFact = { content, fsrs, emotionalWeight: consolidationWeight };
  factStore.push(fact);
  return fact;
}

/** Get facts that are still well-retained (retrievability > 0.7). */
function getRetainedFacts(): string[] {
  return factStore
    .filter(f => getRetrievability(f.fsrs) > 0.7)
    .sort((a, b) => b.emotionalWeight - a.emotionalWeight)
    .map(f => f.content);
}

/** After user confirms they remember a fact, update its FSRS schedule. */
function reviewFact(index: number, grade: 1 | 2 | 3 | 4 | 5): void {
  const fact = factStore[index];
  if (!fact) return;
  fact.fsrs = updateAfterRecall(fact.fsrs, grade);
  fact.fsrs.nextReview = scheduleNextReview(fact.fsrs);
}

/** Build a LangChain-compatible message array with memory context. */
function buildMessages(userInput: string) {
  // Record the turn in short-term memory
  session.addInteraction('user', userInput);

  // Build system prompt from working memory + retained facts
  const facts = getRetainedFacts();
  const wmSlots = workingMemory.getSlots().map(s => s.content);
  const contextBlock = [
    facts.length > 0 ? `Known facts:\n${facts.map(f => `- ${f}`).join('\n')}` : '',
    wmSlots.length > 0 ? `Current focus:\n${wmSlots.map(s => `- ${s}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  const systemPrompt = `You are a helpful assistant with memory.\n\n${contextBlock}`;

  // Convert session history to LangChain messages
  const history = session.getRecent(10);
  const messages = [
    new SystemMessage(systemPrompt),
    ...history.map(h =>
      h.role === 'user' ? new HumanMessage(h.content) : new AIMessage(h.content)
    ),
  ];
  return messages;
}

// --- Demo usage ---

async function main() {
  // Simulate learning facts from prior conversations
  learnFact('The user prefers TypeScript over JavaScript');
  learnFact('Project deadline is March 30th — critical milestone');
  await workingMemory.add('Refactoring the auth module', 'goal', 0.9);

  // Build messages ready for a LangChain chat model
  const messages = buildMessages('How should I prioritize my work today?');
  console.log('System prompt includes', getRetainedFacts().length, 'retained facts');
  console.log('Message count:', messages.length);

  // In a real chain, pass `messages` to ChatOpenAI.invoke(messages)
  // The assistant response would then be stored:
  session.addInteraction('assistant', 'Focus on the auth module — your deadline is March 30th.');

  // After conversation, review a fact the user confirmed
  reviewFact(1, 5); // user confirmed they remember the deadline
  console.log('Next review for deadline fact:', factStore[1].fsrs.nextReview);
}

main().catch(console.error);
