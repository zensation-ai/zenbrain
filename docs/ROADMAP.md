# ZenBrain Roadmap

## Vision

ZenBrain aims to be the standard memory layer for AI agents — the way pgvector is for embeddings and LangChain is for LLM orchestration.

## Current: v0.1 (March 2026)

**Released.** Foundation packages with 7-layer architecture.

- `@zensation/algorithms` — 9 neuroscience algorithms (FSRS, Hebbian, Ebbinghaus, Emotional, Bayesian, Context Retrieval, Sleep Consolidation, Confidence Intervals, Visualization)
- `@zensation/core` — 7 memory layers + MemoryCoordinator
- `@zensation/adapter-postgres` — PostgreSQL + pgvector
- `@zensation/adapter-sqlite` — SQLite (zero-config)
- 5 integration examples (Claude, LangChain, CrewAI, Vercel AI, basic)

---

## Near-Term: v0.2 (April 2026)

**Focus: Developer Experience + Adapters**

- [ ] Redis adapter (caching layer with TTL)
- [ ] OpenAI embedding adapter (built-in OpenAI integration)
- [ ] Anthropic Claude adapter (LLM provider)
- [ ] `MemoryCoordinator` enhancements (auto-consolidation scheduler, background decay)
- [ ] CLI tool: `npx zenbrain init` for project scaffolding
- [ ] Improved InMemoryStorage for testing (better SQL parsing)
- [ ] Performance benchmarks with automated CI tracking

## Mid-Term: v0.3 (Q2 2026)

**Focus: Intelligence + Scale**

- [ ] Multi-model embedding support (switch models without re-embedding)
- [ ] Batch FSRS scheduling (optimize 10K+ facts at once)
- [ ] Graph-based retrieval (combine Hebbian edges with semantic search)
- [ ] Memory compression (summarize old episodic memories to save storage)
- [ ] Event-driven consolidation (auto-trigger sleep cycles based on inactivity)
- [ ] Streaming API for real-time memory updates
- [ ] Python bindings (PyPI package)

## Long-Term: v1.0 (Q3-Q4 2026)

**Focus: Production + Enterprise**

- [ ] Federated memory (sync across agents/devices)
- [ ] Memory encryption at rest (AES-256 field-level)
- [ ] Multi-tenant isolation (namespace-based separation)
- [ ] Memory analytics dashboard (retention curves, knowledge gaps)
- [ ] Plugin system (custom layers, algorithms, adapters)
- [ ] Benchmark suite vs Mem0, Letta, Zep
- [ ] Kubernetes operator for production deployments

---

## How to Influence the Roadmap

- **Vote on issues**: Use thumbs-up on [GitHub Issues](https://github.com/zensation-ai/zenbrain/issues) to signal priority
- **Propose features**: Open an issue with the `enhancement` label
- **Contribute**: PRs that align with the roadmap are prioritized for review
- **Discuss**: Join our [Discord](https://discord.gg/YKVTHaXK) to discuss direction

## Philosophy

We prioritize in this order:
1. **Correctness** — algorithms must be scientifically accurate
2. **Simplicity** — APIs should be intuitive, not clever
3. **Performance** — optimize for real workloads, not benchmarks
4. **Compatibility** — don't break existing users
