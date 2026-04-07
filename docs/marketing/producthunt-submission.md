# Product Hunt Submission

## Product Name

ZenBrain

## Tagline (max 60 chars)

Neuroscience-inspired memory for AI agents

## Description

**Your AI forgets everything after every conversation. ZenBrain fixes that -- with the same mechanisms your brain uses.**

ZenBrain is a 7-layer memory architecture for AI agents that implements actual neuroscience: FSRS spaced repetition (the algorithm behind Anki), Hebbian learning, sleep consolidation (memory replay simulation), emotional memory tagging, Bayesian confidence propagation, and a MemoryCoordinator that orchestrates all layers. Not a vector database with a wrapper. Actual neuroscience. 276 tests.

The core algorithms are pure TypeScript with zero dependencies -- install with `npm install @zensation/algorithms` and start giving your AI real memory in minutes. Every algorithm is tree-shakeable, so you can import only what you need. Extracted from a production AI platform with 322K+ lines of code and 11,589 tests.

While competitors like Mem0 ($24M raised) and Letta ($10M raised) offer 2-3 memory layers, ZenBrain provides 7 specialized layers with algorithms grounded in decades of memory research. Open source under Apache 2.0, built for the community.

## Topics

- Artificial Intelligence
- Developer Tools
- Open Source

## First Comment (Maker)

Hey Product Hunt! Alexander here, solo developer from Kiel, Germany.

I've been building an AI platform for the past year, and the biggest challenge was always memory. Every solution I evaluated was either a hosted API (vendor lock-in) or a thin wrapper around a vector database (insufficient for real memory).

I went deep into the neuroscience literature and implemented the mechanisms the human brain actually uses for memory:

- **FSRS** schedules memory reviews at optimal intervals -- the same algorithm Anki uses, 30% better than SM-2
- **Hebbian learning** makes frequently co-activated knowledge connections stronger and prunes unused ones
- **Emotional tagging** gives important memories up to 3x longer retention -- just like your amygdala does
- **Ebbinghaus decay** models realistic forgetting so irrelevant memories naturally fade
- **Bayesian propagation** flows confidence through your knowledge graph

7 memory layers from working memory to cross-context shared knowledge. Each with different retention, consolidation, and retrieval rules -- just like the human brain.

The monorepo ships 4 packages: `@zensation/algorithms` (12 algorithm modules), `@zensation/core` (7 memory layers + MemoryCoordinator), `@zensation/adapter-postgres` (pgvector), and `@zensation/adapter-sqlite` (zero-config). Docker Compose included. 276 tests. Everything is Apache 2.0.

I'd love to hear how you'd use this in your AI projects. Happy to answer any questions about the neuroscience or the implementation!

## Links

- **Website**: https://github.com/zensation-ai/zenbrain
- **npm**: https://www.npmjs.com/package/@zensation/algorithms
- **GitHub**: https://github.com/zensation-ai/zenbrain

## Screenshots / Media to Prepare

1. **Architecture diagram** -- The 7-layer stack visualization (Layer 1: Working Memory through Layer 7: Cross-Context Memory). Clean, dark-themed diagram.

2. **Comparison table** -- ZenBrain vs Mem0 vs Letta vs Zep feature matrix. Shows the 7 layers, FSRS, Hebbian, emotional memory, etc. The README already has this table.

3. **Code example** -- Terminal screenshot showing the Quick Start code running. Show the FSRS scheduling, emotional tagging, and Hebbian strengthening in action.

4. **Forgetting curve visualization** -- Graph showing Ebbinghaus decay (R = e^(-t/S)) with different stability values, demonstrating how emotional memories decay slower.

5. **npm install screenshot** -- Clean terminal showing `npm install @zensation/algorithms` and the zero-dependency output.

## Scheduling Notes

- Best launch day: Tuesday-Thursday
- Best time: 12:01 AM PT (Product Hunt resets at midnight)
- Have GitHub README polished with badges before launch
- Prepare 5 upvotes from genuine supporters for initial momentum
- Respond to every comment within 1 hour on launch day
