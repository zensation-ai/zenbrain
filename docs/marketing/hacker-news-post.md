# Hacker News Post

## Title

Show HN: ZenBrain -- Neuroscience-Inspired Memory for AI Agents (7 layers, sleep consolidation, 276 tests)

## URL

https://github.com/zensation-ai/zenbrain

## First Comment (Founder)

Hi HN, Alexander here, solo dev from Kiel, Germany.

I've been building a production AI platform for the past year (170K+ LOC, 9,228 tests). The hardest problem was always memory: how do you make an AI that actually remembers things in a way that's useful, not just a vector database that returns the top-k nearest neighbors?

I went deep into the neuroscience literature and implemented the actual mechanisms the human brain uses for memory:

**7 memory layers**, each with different retention characteristics:

1. Working Memory (7 +/- 2 items, active task focus)
2. Short-Term / Session (current conversation)
3. Episodic Memory (concrete experiences)
4. Long-Term Semantic (facts with FSRS scheduling)
5. Procedural Memory (skills -- "how to do X")
6. Core Memory (pinned facts, Letta-style)
7. Cross-Context Memory (shared knowledge across domains)

**The algorithms that power it:**

- **FSRS** (Free Spaced Repetition Scheduler) -- the algorithm behind Anki, outperforms SM-2 by ~30%. Your AI reviews important facts at optimal intervals based on the desirable difficulty principle.

- **Hebbian learning** -- "neurons that fire together wire together" (Hebb, 1949). Knowledge graph edges that are co-activated strengthen. Unused edges decay and get pruned. Homeostatic normalization prevents runaway growth.

- **Ebbinghaus forgetting curves** -- memory decays exponentially: R = e^(-t/S). Personalized decay profiles that adapt to individual patterns.

- **Emotional tagging** -- the amygdala modulates consolidation. Emotional memories get up to 3x longer decay half-lives. A 400+ keyword lexicon (EN/DE) computes arousal, valence, and significance.

- **Bayesian confidence propagation** -- facts support or contradict each other. Confidence flows through the knowledge graph via Bayesian belief updates.

- **Context-dependent retrieval** -- Tulving's Encoding Specificity Principle. Memories recalled better when retrieval context matches encoding context. Up to 30% retrieval boost.

**New in v0.2.0:**

- **Sleep Consolidation** -- simulates memory replay during sleep (Stickgold & Walker 2013). Your AI can run a "sleep cycle" that replays important memories, boosts their stability by 50%, strengthens Hebbian edges, and prunes weak connections. No other memory system has this.

- **MemoryCoordinator** -- orchestrates all 7 layers as a single cohesive system. Auto-routes content to the right layer, cross-layer search with ranked results, episodic-to-semantic consolidation, FSRS review queue.

- **Confidence Intervals** -- 95% CIs for all probabilistic outputs. More reviews = narrower interval. Proper uncertainty quantification.

- **Retention Curve Visualization** -- export Ebbinghaus forgetting curves as data points for charting.

All of this is pure TypeScript with zero runtime dependencies. Everything is tree-shakeable:

```
npm install @zensation/algorithms @zensation/core
```

I extracted the algorithms from my production system and open-sourced them. The monorepo ships 4 packages: `@zensation/algorithms` (12 algorithm modules), `@zensation/core` (7 memory layers + coordinator), `@zensation/adapter-postgres` (pgvector), and `@zensation/adapter-sqlite` (zero-config). 276 tests, all passing. Docker Compose included for quick self-hosting.

Compared to Mem0 ($24M raised) and Letta ($10M raised) -- they have 2-3 memory layers and none of this neuroscience machinery. I'm not saying funding is bad, but I think the open-source community deserves a deeper approach to AI memory than "vector store + LLM summarization."

GitHub: https://github.com/zensation-ai/zenbrain
npm: https://www.npmjs.com/package/@zensation/algorithms

Happy to answer any questions about the implementation, the neuroscience behind it, or the production system it was extracted from.
