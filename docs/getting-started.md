# Getting Started with ZenBrain

## Installation

```bash
# Core algorithms (zero dependencies)
npm install @zensation/algorithms

# Full memory system (7 layers)
npm install @zensation/core

# Storage adapters (pick one)
npm install @zensation/adapter-postgres  # PostgreSQL + pgvector
npm install @zensation/adapter-sqlite    # SQLite (zero-config)
```

## Quick Start: Algorithms Only

The simplest way to start — pure functions, no storage needed:

```typescript
import {
  initFromDecayClass,
  getRetrievability,
  updateAfterRecall,
  tagEmotion,
  computeEmotionalWeight,
  computeHebbianStrengthening,
  propagateForRelation,
} from '@zensation/algorithms';

// Schedule a memory with FSRS
const memory = initFromDecayClass('normal_decay');
const retention = getRetrievability(memory);
console.log(`Recall probability: ${(retention * 100).toFixed(1)}%`);

// Tag emotional significance
const emotion = tagEmotion('I just closed a $2M deal!');
const weight = computeEmotionalWeight(emotion);
console.log(`Decay multiplier: ${weight.decayMultiplier}x`);
// Emotional memories decay ~3x slower

// Strengthen knowledge connections
const stronger = computeHebbianStrengthening(1.0);
// 1.09 — "neurons that fire together wire together"
```

## Quick Start: Memory Layers

Use the core package for structured memory management:

```typescript
import { WorkingMemory, ShortTermMemory } from '@zensation/core';

// Working Memory: 7±2 active items
const wm = new WorkingMemory({ maxSlots: 7 });
await wm.add('Current task: deploy v2', 'goal', 1.0);
await wm.add('User prefers TypeScript', 'fact', 0.8);

// Lowest-relevance items get evicted when full
console.log(`Active slots: ${wm.size}/${wm.capacity.max}`);

// Short-Term Memory: conversation context
const stm = new ShortTermMemory({ maxInteractions: 20 });
const sessionId = stm.startSession();
stm.addInteraction('user', 'What is FSRS?');
stm.addInteraction('assistant', 'FSRS is the Free Spaced Repetition Scheduler...');

// Export as LLM messages
const messages = stm.toMessages();
```

## Quick Start: With PostgreSQL

```typescript
import { PostgresAdapter } from '@zensation/adapter-postgres';

const adapter = new PostgresAdapter({
  connectionString: 'postgres://user:pass@localhost:5432/mydb',
});
await adapter.initialize();

// Store a fact
await adapter.storeFact({
  content: 'TypeScript was created by Microsoft in 2012',
  confidence: 0.95,
  context: { domain: 'technology' },
});

// Search by similarity
const results = await adapter.searchFacts('Who created TypeScript?', { limit: 5 });
```

## Quick Start: Docker Compose

Run the full stack with one command:

```bash
git clone https://github.com/zensation-ai/zenbrain.git
cd zenbrain
docker compose up
```

This starts PostgreSQL (pgvector) + the interactive playground.

## Tree-Shakeable Imports

Every algorithm is available as a subpath export for optimal bundle size:

```typescript
import { updateAfterRecall } from '@zensation/algorithms/fsrs';
import { tagEmotion } from '@zensation/algorithms/emotional';
import { computeHebbianStrengthening } from '@zensation/algorithms/hebbian';
import { propagateForRelation } from '@zensation/algorithms/bayesian';
import { getRetrievability } from '@zensation/algorithms/ebbinghaus';
```

## Next Steps

- [Architecture Overview](./architecture.md) — understand the 7-layer design
- [API Reference](https://www.npmjs.com/package/@zensation/algorithms) — full function signatures
- [Playground](../apps/playground/) — interactive demo
- [Discord](https://discord.gg/YKVTHaXK) — get help from the community
