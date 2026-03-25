/**
 * Basic Chatbot with ZenBrain Memory
 *
 * Shows how to use Working Memory + Short-Term Memory
 * to give a chatbot conversation context and task awareness.
 *
 * == Neuroscience Background ==
 *
 * Working Memory (Baddeley, 1974): The brain's "scratchpad" — holds 7±2 items
 * in active focus. Items decay unless refreshed. This is why you can hold a
 * phone number in your head briefly but forget it after a distraction.
 *
 * Short-Term Memory: Conversation context that persists within a session.
 * Unlike working memory, it's sequential (ordered interactions) rather than
 * slot-based. Think of it as the "what we've discussed so far" buffer.
 *
 * Emotional Tagging (LaBar & Cabeza, 2006): The amygdala modulates memory
 * consolidation — emotional events are remembered 2-3x better than neutral ones.
 * ZenBrain mirrors this: emotionally significant messages get higher relevance
 * in working memory and stronger consolidation weights.
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
// Working Memory: 5 slots (reduced from default 7 for a focused chatbot)
// Each slot holds one piece of active context that decays over time.
// Decay rate 0.05 = 5% relevance loss per minute of inactivity.
const workingMemory = new WorkingMemory({ maxSlots: 5 });

// Short-Term Memory: sliding window of last 20 interactions.
// Older interactions are automatically evicted (recency bias).
const sessionMemory = new ShortTermMemory({ maxInteractions: 20 });

// Start a conversation session
const sessionId = sessionMemory.startSession();

// ── Simulate a Conversation ─────────────────────────

async function processMessage(userMessage: string) {
  // 1. Add to short-term memory
  sessionMemory.addInteraction('user', userMessage);

  // 2. Emotional analysis (amygdala modulation simulation)
  // tagEmotion() analyzes text for sentiment, arousal, valence, and significance
  // using a 400+ keyword lexicon. computeEmotionalWeight() converts these to
  // memory parameters: consolidationWeight (how strongly to store) and
  // decayMultiplier (how slowly to forget — emotional memories last 1-3x longer).
  const emotion = tagEmotion(userMessage);
  const weight = computeEmotionalWeight(emotion);

  if (emotion.significance > 0.5) {
    // Emotionally significant → promote to working memory with high relevance.
    // This mirrors how the brain prioritizes emotional events for active processing.
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
