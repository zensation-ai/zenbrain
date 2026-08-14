# Recipes

Short, copy-pasteable patterns. Each one is a few lines plus the reasoning behind it.

For complete runnable programs see [`examples/`](../examples); for the full surface see the
[API Reference](./api-reference.md). Everything below uses only exported API.

> **Node.js 22+** — every published package declares `engines.node >= 22` since `0.4.0`.

---

## 1. Which layer should this fact go to?

`store()` defaults to `type: 'auto'`, which routes for you. Override it when you already know the
shape of what you are writing, because the three layers answer three different questions:

| Layer | Answers | Write it when |
|---|---|---|
| `semantic` | *What is true?* | The statement stays true independently of when it was learned |
| `episodic` | *What happened?* | The event, its time, and its context are the point |
| `procedural` | *How is this done?* | You have an ordered sequence that can be replayed |

```ts
// A fact: true regardless of when it was said
await memory.store('The production database is eu-central-1', { type: 'fact' });

// An event: the timestamp and context carry the meaning
await memory.store('Deploy 4.2 failed on the migration step', {
  type: 'episode',
  context: 'work',
});

// A procedure: the steps ARE the content
await memory.store('Roll back a failed migration', {
  type: 'procedure',
  steps: ['Stop writers', 'Restore snapshot', 'Replay WAL', 'Re-enable writers'],
  tools: ['psql', 'pg_restore'],
  outcome: 'Database back at the pre-deploy state',
});
```

**Rule of thumb:** if you would still write the sentence a year from now without changing a word,
it is semantic. If it needs "on Tuesday" to make sense, it is episodic.

When in doubt, leave `type: 'auto'`. A wrong explicit type is worse than letting the router decide.

---

## 2. `consolidate()` on a schedule or on demand?

`consolidate()` promotes short-term material into long-term layers, decays what was not reinforced,
and prunes what fell below threshold. It returns what it did:

```ts
const { promoted, decayed, pruned } = await memory.consolidate();
```

It is modelled on sleep consolidation, so the useful mental picture is the same: run it **between**
sessions, not during one.

```ts
// Scheduled: a long-running assistant, consolidating while nobody is talking to it
setInterval(() => void memory.consolidate(), 60 * 60 * 1000); // hourly

// On demand: a request-scoped worker, consolidating at the end of a conversation
async function endSession() {
  const result = await memory.consolidate();
  await memory.close();
  return result;
}
```

**Pick scheduled** when the process outlives individual conversations and idle time exists.
**Pick on demand** when the process is short-lived — a serverless handler that never consolidates
throws away everything it learned.

⚠️ Do not call it inside a turn to "make the agent smarter mid-conversation". Promotion and decay
change what `recall()` returns, so a mid-turn call can move the ground under a reply that is already
half-written. `decay()` alone is cheaper if all you want is to expire stale entries:

```ts
const { removed } = memory.decay(); // synchronous, no promotion
```

---

## 3. Tuning review intervals for your use case

`scheduleNextReview()` takes the retention you want to hold at the moment of review. The default is
`TARGET_RETENTION` (0.9): review just before there is a 10 % chance of having forgotten.

```ts
import { scheduleNextReview, TARGET_RETENTION } from '@zensation/algorithms';

// Default: review at 90 % predicted retention
state.nextReview = scheduleNextReview(state);

// Support bot: a wrong answer is expensive, so review earlier and more often
state.nextReview = scheduleNextReview(state, 0.95);

// Long-running personal assistant: tolerate more forgetting, review far less
state.nextReview = scheduleNextReview(state, 0.8);
```

**Higher target ⇒ shorter intervals ⇒ more reviews.** The trade is review cost against error rate,
and it is genuinely a trade: pushing toward 0.99 produces a review queue nobody works through, which
is worse than 0.9 honestly maintained.

Reviews go through the coordinator, so you rarely touch FSRS state by hand:

```ts
const due = await memory.getReviewQueue(10);
for (const item of due) {
  const grade = await askUser(item.content); // 1..5
  await memory.recordReview(item.id, grade);
}
```

---

## 4. Combining Hebbian edge weights with your own relevance score

`recall()` already scores results. When you have domain knowledge it cannot have — a support ticket
is more relevant while its ticket is open — blend rather than replace, and keep the two factors
visible:

```ts
import { getImportance, hebbianUpdateTwoFactor, type TwoFactorEdge } from '@zensation/algorithms';

// Co-activation strengthens the edge; variance shrinks as it matures
edge = hebbianUpdateTwoFactor(edge, tagScore, activationProduct);

const results = await memory.recall('deployment problems', { limit: 20 });

const ranked = results
  .map(r => {
    const edge = edges.get(r.content);
    // getImportance() = 1 / variance: high for edges seen often and consistently
    const hebbian = edge ? Math.min(getImportance(edge) / 10, 1) : 0;
    return { ...r, blended: 0.6 * r.score + 0.3 * hebbian + 0.1 * myDomainScore(r) };
  })
  .sort((a, b) => b.blended - a.blended)
  .slice(0, 5);
```

**Why `getImportance()` and not `edge.weight`:** weight says how strong the association is, variance
says how *settled* it is. A brand-new edge can reach a high weight from a single coincidence;
importance (`1 / variance`) only rises once the association has survived repetition. Ranking on
weight alone surfaces flukes.

**Keep the coefficients summing to 1** and keep `r.score` dominant. If your own term outweighs it,
you have built a retrieval system and are using this one as a cache.

---

## 5. Domain-specific facts that must not fade

Emotional weight feeds both the initial FSRS state and the decay rate — `computeEmotionalWeight()`
returns `decayMultiplier`, where values above 1 mean slower decay. The automatic tagger reads
language, so it cannot know that in your domain "allergy" outranks any word with an exclamation mark:

```ts
import { tagEmotion, computeEmotionalWeight, initFromDecayClass } from '@zensation/algorithms';

const CRITICAL = /\b(allergy|contraindicat|dosage|safety)\b/i;

function weightFor(content: string): number {
  const { consolidationWeight } = computeEmotionalWeight(tagEmotion(content));
  // Domain override: floor critical facts near the top of the range
  return CRITICAL.test(content) ? Math.max(consolidationWeight, 0.9) : consolidationWeight;
}

await memory.store(content, { type: 'fact', emotionalWeight: weightFor(content) });

// Same weight when you build FSRS state directly
const state = initFromDecayClass('good', weightFor(content));
```

⚠️ **Use a floor, not a constant.** Writing `emotionalWeight: 1.0` for every domain hit flattens the
ranking you were trying to sharpen: if everything is critical, the layer can no longer tell you what
is *most* critical. `Math.max()` keeps the tagger's ordering inside the protected set.

**Do not use this to pin marketing copy.** The mechanism models why emotionally significant events
consolidate faster; spending it on material that merely *should* be seen means the signal no longer
means anything when a genuinely important fact arrives.

---

## See also

- [`examples/`](../examples) — complete runnable integrations (LangChain, CrewAI, Vercel AI SDK,
  LlamaIndex.TS, Mastra, plain Claude)
- [Architecture](./architecture.md) — how the seven layers relate
- [API Reference](./api-reference.md) — every exported symbol
- [FAQ](./FAQ.md)
