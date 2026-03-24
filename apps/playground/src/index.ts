#!/usr/bin/env node
/**
 * ZenBrain Playground
 *
 * Interactive demo of the 7-layer neuroscience-inspired memory system.
 * Run with: npx tsx src/index.ts
 */
import {
  initFromDecayClass,
  getRetrievability,
  updateAfterRecall,
  scheduleNextReview,
  tagEmotion,
  computeEmotionalWeight,
  computeHebbianStrengthening,
  computeHebbianDecay,
  propagateForRelation,
  detectNegation,
} from '@zensation/algorithms';

import {
  WorkingMemory,
  ShortTermMemory,
  InMemoryStorage,
  cosineSimilarity,
} from '@zensation/core';

console.log('');
console.log('===========================================');
console.log('  ZenBrain Playground');
console.log('  Neuroscience-inspired memory for AI agents');
console.log('===========================================');
console.log('');

// ── 1. FSRS Spaced Repetition ──────────────────────────

console.log('1. FSRS Spaced Repetition');
console.log('─────────────────────────');

const memory = initFromDecayClass('normal_decay');
console.log(`   Initial state: difficulty=${memory.difficulty}, stability=${memory.stability.toFixed(1)}`);

const retention = getRetrievability(memory);
console.log(`   Current retention: ${(retention * 100).toFixed(1)}%`);

const afterRecall = updateAfterRecall(memory, 4, retention);
console.log(`   After recall (grade 4): stability=${afterRecall.stability.toFixed(1)}`);

const nextReview = scheduleNextReview(afterRecall);
console.log(`   Next review: ${nextReview.toISOString()}`);
console.log('');

// ── 2. Emotional Memory ────────────────────────────────

console.log('2. Emotional Memory');
console.log('───────────────────');

const texts = [
  'I just got promoted to Senior Engineer!',
  'The weather is nice today.',
  'My grandmother passed away last week.',
  'I need to buy groceries.',
];

for (const text of texts) {
  const emotion = tagEmotion(text);
  const weight = computeEmotionalWeight(emotion);
  const significant = emotion.significance > 0.5;
  console.log(`   "${text}"`);
  console.log(`   → arousal=${emotion.arousal.toFixed(2)}, valence=${emotion.valence.toFixed(2)}, significance=${emotion.significance.toFixed(2)}`);
  console.log(`   → decay multiplier: ${weight.decayMultiplier.toFixed(1)}x ${significant ? '(SIGNIFICANT — decays slower)' : ''}`);
  console.log('');
}

// ── 3. Hebbian Learning ────────────────────────────────

console.log('3. Hebbian Learning');
console.log('───────────────────');

let edgeWeight = 1.0;
console.log(`   Initial edge weight: ${edgeWeight.toFixed(2)}`);

for (let i = 0; i < 5; i++) {
  edgeWeight = computeHebbianStrengthening(edgeWeight);
  console.log(`   After co-activation ${i + 1}: ${edgeWeight.toFixed(3)}`);
}
console.log('');

console.log('   Decay simulation (unused edge):');
let decayWeight = 5.0;
for (let i = 0; i < 5; i++) {
  decayWeight = computeHebbianDecay(decayWeight);
  console.log(`   After decay step ${i + 1}: ${decayWeight.toFixed(3)}`);
}
console.log('');

// ── 4. Bayesian Confidence ─────────────────────────────

console.log('4. Bayesian Confidence Propagation');
console.log('──────────────────────────────────');

const scenarios = [
  { base: 0.5, source: 0.9, weight: 1.0, type: 'supports' as const },
  { base: 0.8, source: 0.9, weight: 1.0, type: 'contradicts' as const },
  { base: 0.5, source: 0.6, weight: 0.5, type: 'related_to' as const },
];

for (const s of scenarios) {
  const result = propagateForRelation(s.base, s.source, s.weight, s.type);
  console.log(`   ${s.type}: base=${s.base} + source=${s.source} → ${result.toFixed(3)}`);
}
console.log('');

// ── 5. Negation Detection ──────────────────────────────

console.log('5. Negation Detection (EN/DE)');
console.log('─────────────────────────────');

const negationTests = [
  'TypeScript is not a compiled language',
  'I never liked Python',
  'Das stimmt nicht',
  'Er kann kein Deutsch',
  'I love coding',
];

for (const text of negationTests) {
  const result = detectNegation(text);
  console.log(`   "${text}" → negated=${result.isNegated}${result.negationTarget ? `, target="${result.negationTarget}"` : ''}`);
}
console.log('');

// ── 6. Working Memory ──────────────────────────────────

console.log('6. Working Memory (7±2 slots)');
console.log('─────────────────────────────');

const wm = new WorkingMemory({ maxSlots: 5 });

await wm.add('Current task: build ZenBrain demo', 'goal', 1.0);
await wm.add('TypeScript is the primary language', 'fact', 0.8);
await wm.add('User prefers concise code', 'constraint', 0.6);
await wm.add('Previous topic was FSRS', 'context', 0.4);
await wm.add('Meeting at 3pm', 'context', 0.3);

console.log(`   Slots: ${wm.size}/${wm.capacity.max}`);
for (const slot of wm.getSlots()) {
  console.log(`   [${slot.type}] ${slot.content} (relevance: ${slot.relevance.toFixed(1)})`);
}

// Add one more — should evict the lowest relevance
await wm.add('BREAKING: new AI model released', 'fact', 0.9);
console.log(`\n   After adding 6th item (eviction):`);
console.log(`   Slots: ${wm.size}/${wm.capacity.max}`);
for (const slot of wm.getSlots()) {
  console.log(`   [${slot.type}] ${slot.content} (relevance: ${slot.relevance.toFixed(1)})`);
}
console.log('');

// ── 7. Short-Term Memory ───────────────────────────────

console.log('7. Short-Term Memory (Session)');
console.log('──────────────────────────────');

const stm = new ShortTermMemory({ maxInteractions: 10 });
const sessionId = stm.startSession();
console.log(`   Session: ${sessionId.substring(0, 8)}...`);

stm.addInteraction('user', 'What is FSRS?');
stm.addInteraction('assistant', 'FSRS is the Free Spaced Repetition Scheduler, an algorithm that outperforms SM-2.');
stm.addInteraction('user', 'How does it compare to Anki?');

console.log(`   Interactions: ${stm.size}`);
const messages = stm.toMessages();
for (const msg of messages) {
  console.log(`   [${msg.role}] ${msg.content.substring(0, 60)}${msg.content.length > 60 ? '...' : ''}`);
}
console.log('');

// ── Summary ────────────────────────────────────────────

console.log('===========================================');
console.log('  All 7 algorithms demonstrated!');
console.log('');
console.log('  Learn more: https://github.com/zensation-ai/zenbrain');
console.log('  npm install @zensation/algorithms');
console.log('===========================================');
console.log('');
