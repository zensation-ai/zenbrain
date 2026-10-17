# ZenBrain Architecture

## 7-Layer Memory System

ZenBrain's architecture mirrors the human brain's memory systems. Each layer has distinct retention characteristics, consolidation rules, and retrieval mechanisms.

```
Layer 7: Cross-Context Memory    ← Entity links across domains (experimental)
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
**Eviction:** Least relevant slot removed when full; among equally relevant slots, the oldest

Working Memory holds the immediate task context, in the process only. Items have a relevance score (0-1) and a type (goal, fact, constraint, context). When capacity is reached, the least relevant item is evicted, and among equals the oldest. `decay()` and `consolidate()` lower each slot's relevance exponentially for the minutes since it was last decayed and remove slots that fall to 0.01 or below.

### Layer 2: Short-Term Memory

**Capacity:** Configurable (default: 50 interactions, sliding window)
**Retention:** Current session, in the process
**Format:** Single interactions with role `user`, `assistant` or `system`

Manages conversation context. Exports to standard LLM message format. The history lives in the process: `startSession(id)` starts a fresh session under that id, and the `storage` option is not used.

### Layer 3: Episodic Memory

**Retention:** Until forgotten — nothing deletes episodes on its own
**Consolidation:** `consolidate()` turns each episode with an emotional weight above 0.5, among the 100 most recent, into one semantic fact (verbatim, or one sentence distilled by an LLM if one is configured)
**Key feature:** Temporal context (when did this happen?)

Stores concrete experiences — "last Tuesday, the user asked about TypeScript generics and we solved it using conditional types." Emotional episodes become semantic facts when `consolidate()` runs.

### Layer 4: Long-Term Semantic Memory

**Retention:** Until forgotten — nothing deletes facts on its own
**Scheduling:** FSRS spaced repetition
**Key feature:** A confidence per fact, and an FSRS review schedule

Facts with retrieval scheduling. FSRS determines when each fact is due; your application reports reviews with `recordReview()`. `@zensation/algorithms` offers Bayesian-style confidence propagation between related facts as a function; the coordinator keeps no knowledge graph and does not call it.

### Layer 5: Procedural Memory

**Retention:** Until forgotten
**Key feature:** Trigger → Steps → Outcome patterns

"How to do X" memories, recorded through `store()` (or `ProceduralMemory.record()`). Your application reports how a procedure went with `feedback()`, which updates its success rate; recall returns matching procedures, and adapting them to the new request is up to the caller.

### Layer 6: Core Memory

**Retention:** Permanent (pinned)
**Key feature:** Joins every default recall as a candidate

Pinned facts — user preferences, system rules, key relationships. Inspired by Letta's core memory blocks. They never decay. With the default `core: 'always'`, every recall adds all blocks to its candidates, where they compete for `limit` like any result; `core: 'matching'` adds only the blocks that share a word with the query. `CoreMemory.assembleContext()` returns all blocks for a prompt.

### Layer 7: Cross-Context Memory (experimental)

**Retention:** Permanent
**Key feature:** Links between entities of different domains

Meant for knowledge that spans contexts (e.g., personal + work). Today it is experimental and not wired into the
coordinator: `detectMergeCandidates()` finds entities with similar names and `createLink()` records a link between
two of them; nothing is merged, and no store or recall path writes or reads entities. The shipped schemas have no
context column yet, so every context reads the same `knowledge_entities` table. Giving entities a context
(a schema migration) and a write path is on the roadmap.

## Algorithms

### FSRS (Free Spaced Repetition Scheduler)

Based on the [open-spaced-repetition](https://github.com/open-spaced-repetition/fsrs4anki) project, whose authors report 20–30% fewer reviews than SM-2 for the same retention, in simulations ([ABC of FSRS](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS)). The library keeps FSRS's difficulty and stability updates with an exponential forgetting curve, `R = e^(−t/S)` (FSRS itself has used a power curve since v4): S is the time constant — R falls to 1/e after S days — and a review is scheduled when R reaches the target retention 0.9, after 0.105 × S days. Uses the desirable difficulty principle: reviewing when retention is low gives a bigger stability boost.

### Hebbian Learning

"Neurons that fire together wire together" (Hebb, 1949). Functions for graph edges you keep yourself: an edge strengthens on co-activation and decays by a fixed step per maintenance pass; homeostatic normalization scales a set of weights to a budget. The coordinator keeps no graph.

### Ebbinghaus Forgetting Curves

Memory decays exponentially: `R = e^(-t/S)`. Personalized decay profiles adapt to individual learning patterns.

### Emotional Tagging

The amygdala modulates memory consolidation. About 170 weighted keywords (English and German) in four lists give sentiment, arousal and significance. `computeEmotionalWeight()` turns them into a consolidation weight and a decay multiplier from 1 to 3 for your application to apply; the coordinator uses the weight to route a memory (above 0.5: an episode), and a weight passed for a fact multiplies its starting FSRS stability by 1 + weight.

### Bayesian Confidence Propagation

`propagateForRelation()` computes how a fact's confidence moves when a related fact's confidence is known, one edge at a time: supporting relations raise it, contradicting ones lower it, relations like `created_by` leave it unchanged. `applyDamping()` blends a new value with the previous one, `isSignificantChange()` says whether an update is worth keeping; iterating over a graph is up to the caller.

### Context-Dependent Retrieval

Tulving's Encoding Specificity Principle (1973). Memories are recalled better when retrieval context matches encoding context. The functions capture time-of-day, day-of-week and task type and compute a boost factor capped at 1.3 (`MAX_CONTEXT_BOOST = 0.3`, a design constant, not a measured effect). The coordinator does not use them.

## Package Structure

```
@zensation/algorithms     Pure math, zero dependencies
       ↓
@zensation/core           Memory layers + coordinator (depends on algorithms)
       ↓
@zensation/adapter-*      Storage backends (Postgres, SQLite; core as a peer dependency)
       ↓
@zensation/mcp            MCP server over core + adapter-sqlite
@zensation/ai-sdk         Vercel AI SDK middleware over core
```

`algorithms` works standalone for any project. `core` adds structured memory management and needs a storage adapter for every layer except working and short-term memory. Adapters provide persistence. `mcp` and `ai-sdk` connect the coordinator to an MCP client or a model call.
