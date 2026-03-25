/**
 * Basic Chatbot with ZenBrain Memory
 *
 * Shows how to use Working Memory + Short-Term Memory
 * to give a chatbot conversation context and task awareness.
 *
 * Run: npx tsx examples/basic-chatbot.ts
 */
import { WorkingMemory, ShortTermMemory } from '@zensation/core';
import {
  tagEmotion,
  computeEmotionalWeight,
  updateAfterRecall,
  initFromDecayClass,
  getRetrievability,
} from '@zensation/algorithms';

// ── Setup Memory Layers ─────────────────────────────

const workingMemory = new WorkingMemory({ maxSlots: 5 });
const sessionMemory = new ShortTermMemory({ maxInteractions: 20 });

// Start a conversation session
const sessionId = sessionMemory.startSession();

// ── Simulate a Conversation ─────────────────────────

async function processMessage(userMessage: string) {
  // 1. Add to short-term memory
  sessionMemory.addInteraction('user', userMessage);

  // 2. Check emotional significance
  const emotion = tagEmotion(userMessage);
  const weight = computeEmotionalWeight(emotion);

  if (emotion.significance > 0.5) {
    // Important message — add to working memory with high relevance
    await workingMemory.add(userMessage, 'fact', 0.9);
    console.log(`  [Emotional] Significance: ${emotion.significance.toFixed(2)}, decay multiplier: ${weight.decayMultiplier.toFixed(1)}x`);
  }

  // 3. Build context for LLM
  const messages = sessionMemory.toMessages();
  const activeContext = workingMemory.getSlots().map(s => s.content);

  console.log(`  [Context] ${messages.length} messages, ${activeContext.length} active items`);

  // 4. Simulate LLM response
  const response = `I understand: "${userMessage.substring(0, 50)}"`;
  sessionMemory.addInteraction('assistant', response);

  return response;
}

// ── Run Demo ────────────────────────────────────────

console.log('ZenBrain Basic Chatbot Demo\n');

// Seed working memory with user profile
await workingMemory.add('User is a TypeScript developer', 'fact', 0.8);
await workingMemory.add('Current project: AI chatbot', 'goal', 1.0);

const messages = [
  'How do I implement streaming in Express?',
  'I just got promoted to tech lead!',
  'What about error handling in SSE?',
  'Can you show me a code example?',
];

for (const msg of messages) {
  console.log(`User: ${msg}`);
  await processMessage(msg);
  console.log();
}

// Show final memory state
console.log('── Final Working Memory ──');
for (const slot of workingMemory.getSlots()) {
  console.log(`  [${slot.type}] ${slot.content} (relevance: ${slot.relevance})`);
}

console.log(`\n── Session: ${sessionMemory.size} interactions ──`);
