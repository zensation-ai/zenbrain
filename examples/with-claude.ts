/**
 * ZenBrain + Claude API Integration
 *
 * Shows how to use ZenBrain's memory layers with the Anthropic Claude API
 * to create an AI assistant that remembers across conversations.
 *
 * Prerequisites:
 *   npm install @zensation/algorithms @zensation/core @anthropic-ai/sdk
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *
 * Run: npx tsx examples/with-claude.ts
 */
import { WorkingMemory, ShortTermMemory } from '@zensation/core';
import {
  tagEmotion,
  computeEmotionalWeight,
  initFromDecayClass,
  getRetrievability,
  updateAfterRecall,
} from '@zensation/algorithms';

// ── Memory Setup ────────────────────────────────────

const workingMemory = new WorkingMemory({ maxSlots: 7 });
const sessionMemory = new ShortTermMemory({ maxInteractions: 30 });

// Facts the AI "knows" about the user (would come from persistent storage)
const knownFacts = [
  { content: 'User is Alexander, a solo founder from Kiel, Germany', memory: initFromDecayClass('slow_decay') },
  { content: 'User prefers TypeScript over Python', memory: initFromDecayClass('normal_decay') },
  { content: 'User is building an AI platform called ZenAI', memory: initFromDecayClass('slow_decay') },
];

// ── Build Context for Claude ────────────────────────

async function buildContext(userMessage: string) {
  // 1. Check which facts are still well-retained
  const retainedFacts = knownFacts
    .filter(f => getRetrievability(f.memory) > 0.5)
    .map(f => f.content);

  // 2. Get working memory items
  const activeItems = workingMemory.getSlots().map(s => `[${s.type}] ${s.content}`);

  // 3. Check emotional weight of the message
  const emotion = tagEmotion(userMessage);
  const weight = computeEmotionalWeight(emotion);

  // 4. Build system prompt with memory context
  const systemPrompt = [
    'You are a helpful AI assistant with persistent memory.',
    '',
    retainedFacts.length > 0 ? `What you know about the user:\n${retainedFacts.map(f => `- ${f}`).join('\n')}` : '',
    '',
    activeItems.length > 0 ? `Current context:\n${activeItems.join('\n')}` : '',
    '',
    emotion.significance > 0.3
      ? `Note: This message has emotional significance (${emotion.significance.toFixed(2)}). Remember it well.`
      : '',
  ].filter(Boolean).join('\n');

  // 5. Get conversation history
  const messages = sessionMemory.toMessages();

  return { systemPrompt, messages, emotionalWeight: weight };
}

// ── Demo (without actual API call) ──────────────────

console.log('ZenBrain + Claude Integration Demo\n');

const sessionId = sessionMemory.startSession();
await workingMemory.add('Help user with ZenBrain documentation', 'goal', 1.0);

const userMessage = 'I need help writing the getting-started guide for ZenBrain';
sessionMemory.addInteraction('user', userMessage);

const context = await buildContext(userMessage);

console.log('System Prompt for Claude:');
console.log('─'.repeat(50));
console.log(context.systemPrompt);
console.log('─'.repeat(50));
console.log(`\nConversation history: ${context.messages.length} messages`);
console.log(`Emotional weight: ${context.emotionalWeight.consolidationWeight.toFixed(2)}`);

console.log('\n// To use with the real Claude API:');
console.log('// const anthropic = new Anthropic();');
console.log('// const response = await anthropic.messages.create({');
console.log('//   model: "claude-sonnet-4-20250514",');
console.log('//   system: context.systemPrompt,');
console.log('//   messages: context.messages,');
console.log('// });');
