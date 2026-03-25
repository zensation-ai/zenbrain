# ZenBrain Architecture

## 7-Layer Memory System

ZenBrain's architecture mirrors the human brain's memory systems. Each layer has distinct retention characteristics, consolidation rules, and retrieval mechanisms.

```
Layer 7: Cross-Context Memory    ← Shared knowledge across domains
Layer 6: Core Memory             ← Pinned facts (always available)
Layer 5: Procedural Memory       ← "How to do X" (skills & workflows)
Layer 4: Long-Term Semantic      ← Facts with FSRS scheduling
Layer 3: Episodic Memory         ← Concrete experiences & events
Layer 2: Short-Term / Session    ← Current conversation context
Layer 1: Working Memory          ← Active task focus (7±2 items)
```

## Layer Details

### Layer 1: Working Memory

**Capacity:** 7±2 slots (Miller's Law)
**Retention:** Active session only
**Eviction:** Lowest-relevance item removed when full

Working Memory holds the immediate task context. Items have a relevance score (0-1) and a type (goal, fact, constraint, context). When capacity is reached, the lowest-relevance item is evicted — just like human attention.

### Layer 2: Short-Term Memory

**Capacity:** Configurable (default: 20 interactions)
**Retention:** Current session
**Format:** Message pairs (user/assistant)

Manages conversation context. Exports to standard LLM message format. Supports session persistence and resumption.

### Layer 3: Episodic Memory

**Retention:** Days to weeks
**Consolidation:** Patterns extracted to Long-Term Memory
**Key feature:** Temporal context (when did this happen?)

Stores concrete experiences — "last Tuesday, the user asked about TypeScript generics and we solved it using conditional types." Episodic memories consolidate into semantic facts over time.

### Layer 4: Long-Term Semantic Memory

**Retention:** Months to permanent
**Scheduling:** FSRS spaced repetition
**Key feature:** Confidence scoring + Bayesian propagation

Facts with retrieval scheduling. FSRS determines when each fact should be reviewed. Confidence propagates through the knowledge graph — supporting evidence increases confidence, contradictions decrease it.

### Layer 5: Procedural Memory

**Retention:** Permanent (skill-based)
**Key feature:** Trigger → Steps → Outcome patterns

"How to do X" memories. When the AI successfully completes a multi-step task, the procedure is recorded. On similar future requests, the proven approach is recalled and adapted.

### Layer 6: Core Memory

**Retention:** Permanent (pinned)
**Key feature:** Always included in context

Pinned facts that are always available — user preferences, system rules, key relationships. Inspired by Letta's core memory blocks. These never decay and are always loaded.

### Layer 7: Cross-Context Memory

**Retention:** Permanent
**Key feature:** Shared across domains

Knowledge that spans contexts (e.g., personal + work). When the same entity appears in multiple domains, cross-context memory merges and deduplicates the information.

## Algorithms

### FSRS (Free Spaced Repetition Scheduler)

Based on the [open-spaced-repetition](https://github.com/open-spaced-repetition/fsrs4anki) project. Outperforms SM-2 by ~30%. Uses the desirable difficulty principle: reviewing when retention is low gives a bigger stability boost.

### Hebbian Learning

"Neurons that fire together wire together" (Hebb, 1949). Knowledge graph edges strengthen through co-activation and decay through disuse. Homeostatic normalization prevents runaway growth.

### Ebbinghaus Forgetting Curves

Memory decays exponentially: `R = e^(-t/S)`. Personalized decay profiles adapt to individual learning patterns.

### Emotional Tagging

The amygdala modulates memory consolidation. A 400+ keyword lexicon (EN/DE) computes arousal, valence, and significance. Emotional memories get up to 3x longer decay half-lives.

### Bayesian Confidence Propagation

Confidence flows through the knowledge graph. Supporting evidence increases confidence, contradictions decrease it. Damping ensures numerical stability.

### Context-Dependent Retrieval

Tulving's Encoding Specificity Principle (1973). Memories are recalled better when retrieval context matches encoding context. Captures time-of-day, day-of-week, and task type for up to 30% retrieval boost.

## Package Structure

```
@zensation/algorithms     Pure math, zero dependencies
       ↓
@zensation/core           Memory layers + coordinator
       ↓
@zensation/adapter-*      Storage backends (Postgres, SQLite)
```

Each package can be used independently. `algorithms` works standalone for any project. `core` adds structured memory management. Adapters provide persistence.
