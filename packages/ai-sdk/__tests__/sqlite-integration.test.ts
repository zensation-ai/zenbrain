/**
 * The middleware over the storage a user actually gets.
 *
 * `middleware.test.ts` proves the contract against a stub coordinator. This proves the
 * one thing a stub cannot: that something stored in an earlier turn comes back into the
 * next prompt, through a real coordinator and a real SQLite file.
 *
 * Needs Node >= 22, because `better-sqlite3` 13 does. The version gate sits before the
 * import: on an unsupported runtime that module does not throw, it takes the worker down.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { generateText, jsonSchema, stepCountIs, tool, wrapLanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { MemoryCoordinator, FakeEmbeddingProvider, InMemoryCache } from '@zensation/core';
import { zenbrainMemory } from '../src/index.js';

const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
const SUPPORTED = NODE_MAJOR >= 22;

let sqlite: typeof import('@zensation/adapter-sqlite') | undefined;
if (SUPPORTED) {
  sqlite = await import('@zensation/adapter-sqlite');
} else {
  process.stderr.write(
    `\n[sqlite-integration] SKIPPED — Node ${process.version} is below the engines floor ` +
      `of >= 22 that better-sqlite3 13 requires. This suite is expected to RUN in CI ` +
      `(22, 24, 26); a green local run here proves nothing about it.\n\n`,
  );
}

const open: typeof describe.skip = sqlite ? describe : describe.skip;

/** One generateText call in which the model asks for a tool, then answers: two model calls. */
async function callWithOneTool(c: MemoryCoordinator, prompt: string, options: Partial<Parameters<typeof zenbrainMemory>[0]> = {}) {
  const lookup = tool({
    description: 'Look something up.',
    inputSchema: jsonSchema<{ q: string }>({ type: 'object', properties: { q: { type: 'string' } } }),
    execute: async () => 'found',
  });
  let calls = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () =>
      ++calls === 1
        ? {
            content: [{ type: 'tool-call' as const, toolCallId: 'c1', toolName: 'lookup', input: '{"q":"x"}' }],
            finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            warnings: [],
          }
        : reply('Done.'),
  });
  await generateText({
    model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator: c, ...options }) }),
    prompt,
    tools: { lookup },
    stopWhen: stepCountIs(3),
  });
  expect(model.doGenerateCalls).toHaveLength(2);
  return model;
}

/** The system messages the model got in one of its calls. */
function memoriesOf(model: MockLanguageModelV4, call: number): string[] {
  return model.doGenerateCalls[call].prompt.filter((m) => m.role === 'system').map((m) => String(m.content));
}

let coordinator: MemoryCoordinator | undefined;
afterEach(async () => {
  await coordinator?.close();
  coordinator = undefined;
});

const reply = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  finishReason: 'stop' as const,
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  warnings: [],
});

open('the middleware over a real SQLite store', () => {
  it('carries a memory from one turn into the next prompt', async () => {
    coordinator = new MemoryCoordinator({
      storage: new sqlite!.SqliteAdapter({ filename: ':memory:' }),
      embedding: new FakeEmbeddingProvider(),
      cache: new InMemoryCache(),
    });

    const middleware = zenbrainMemory({ coordinator, store: { assistant: false } });

    // Turn one: the user says something worth keeping. Nothing to recall yet.
    const first = new MockLanguageModelV4({ doGenerate: async () => reply('Noted.') });
    await generateText({
      model: wrapLanguageModel({ model: first, middleware }),
      prompt: 'Anna moved to Hamburg in March.',
    });
    expect(first.doGenerateCalls[0].prompt.filter((m) => m.role === 'system')).toHaveLength(0);

    // Turn two: a different question, same subject. The first turn must come back.
    const second = new MockLanguageModelV4({ doGenerate: async () => reply('Hamburg.') });
    await generateText({
      model: wrapLanguageModel({ model: second, middleware }),
      prompt: 'Where does Anna live?',
    });

    const injected = second.doGenerateCalls[0].prompt
      .filter((m) => m.role === 'system')
      .map((m) => String(m.content));

    expect(injected).toHaveLength(1);
    expect(injected[0]).toContain('Hamburg');
  });

  it('injects nothing for a question no memory matches (no embedding provider)', async () => {
    // Measured on 0.3.1 with core 0.5: "What is the capital of France?" got the stored, unrelated
    // memories injected as "Relevant memories from earlier sessions:" — the recall fallback.
    coordinator = new MemoryCoordinator({ storage: new sqlite!.SqliteAdapter({ filename: ':memory:' }) });
    await coordinator.store('The user owns a red bicycle.', { type: 'fact' });
    await coordinator.store('How to bake bread: knead, rest, bake.', { type: 'procedure' });

    const model = new MockLanguageModelV4({ doGenerate: async () => reply('Paris.') });
    await generateText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator, store: false, recall: { core: 'matching' } }) }),
      prompt: 'What is the capital of France?',
    });

    expect(model.doGenerateCalls[0].prompt.filter((m) => m.role === 'system')).toEqual([]);
  });

  it('in a follow-up step of a call with tools, leaves out the turn itself, stored after the first step', async () => {
    // Measured on 2026-11-22 with the turn stored once (0.4.1 before this filter): the second
    // model call got "Relevant memories from earlier sessions: - Where does Anna live? - Anna
    // moved to Hamburg in March.", its own question first, as if from an earlier session.
    coordinator = new MemoryCoordinator({ storage: new sqlite!.SqliteAdapter({ filename: ':memory:' }) });
    await coordinator.store('Anna moved to Hamburg in March.');
    const lookup = tool({
      description: 'Look something up.',
      inputSchema: jsonSchema<{ q: string }>({ type: 'object', properties: { q: { type: 'string' } } }),
      execute: async () => 'Hamburg',
    });
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        ++calls === 1
          ? {
              content: [{ type: 'tool-call' as const, toolCallId: 'c1', toolName: 'lookup', input: '{"q":"Anna"}' }],
              finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              warnings: [],
            }
          : reply('Anna lives in Hamburg.'),
    });

    await generateText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator }) }),
      prompt: 'Where does Anna live?',
      tools: { lookup },
      stopWhen: stepCountIs(3),
    });

    expect(model.doGenerateCalls).toHaveLength(2);
    const memories = (step: number) =>
      model.doGenerateCalls[step].prompt.filter((m) => m.role === 'system').map((m) => String(m.content));
    expect(memories(0)).toEqual(['Relevant memories from earlier sessions:\n- Anna moved to Hamburg in March.']);
    expect(memories(1)).toEqual(['Relevant memories from earlier sessions:\n- Anna moved to Hamburg in March.']);
    // The turn is in memory, once, for the next call.
    const facts = (await coordinator.getSemanticMemory().getRecent(10)).map((f) => f.content);
    expect(facts.filter((f) => f === 'Where does Anna live?')).toHaveLength(1);
  });

  it('in the first step, still injects an earlier memory with the same words as the question', async () => {
    // Control for the filter above: here a memory equal to the question is a real earlier one.
    coordinator = new MemoryCoordinator({ storage: new sqlite!.SqliteAdapter({ filename: ':memory:' }) });
    await coordinator.store('Where does Anna live?');
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('In Hamburg.') });

    await generateText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator }) }),
      prompt: 'Where does Anna live?',
    });

    const injected = model.doGenerateCalls[0].prompt.filter((m) => m.role === 'system').map((m) => String(m.content));
    expect(injected).toEqual(['Relevant memories from earlier sessions:\n- Where does Anna live?']);
  });

  it('in a follow-up step, leaves out the turn also when it was stored as a procedure', async () => {
    // With the filter on the text this turn came back as "How to renew … Steps: … Outcome: "
    // and stayed among the second call's memories. The ids store() returned leave it out.
    coordinator = new MemoryCoordinator({ storage: new sqlite!.SqliteAdapter({ filename: ':memory:' }) });
    await coordinator.store('The parking permit office is in the town hall.');
    const model = await callWithOneTool(coordinator, 'How to renew the parking permit for Anna?');

    expect(memoriesOf(model, 1)).toEqual(['Relevant memories from earlier sessions:\n- The parking permit office is in the town hall.']);
    expect((await coordinator.getProceduralMemory().list()).map((p) => p.trigger)).toEqual(['How to renew the parking permit for Anna?']);
  });

  it('in a follow-up step, still brings limit memories when there are enough', async () => {
    // The turn stored after the first step is one of the recall's hits; leaving it out of `limit`
    // results gave one memory fewer. The follow-up step asks for one more per memory the call stored.
    coordinator = new MemoryCoordinator({ storage: new sqlite!.SqliteAdapter({ filename: ':memory:' }) });
    for (const fact of ['Anna moved to Hamburg in March.', 'Anna works at the harbour office.', 'Anna has a red bicycle.']) {
      await coordinator.store(fact);
    }
    const model = await callWithOneTool(coordinator, 'Where does Anna live?', { recall: { limit: 2 } });

    const lines = (step: number) => memoriesOf(model, step)[0]?.split('\n').slice(1) ?? [];
    expect(lines(0)).toHaveLength(2);
    expect(lines(1)).toHaveLength(2);
    expect(lines(1)).not.toContain('- Where does Anna live?');
  });

  it('in a follow-up step, keeps an earlier memory with the same words as the question', async () => {
    // Only what this call stored is left out: the same question stored in an earlier session is a memory.
    coordinator = new MemoryCoordinator({ storage: new sqlite!.SqliteAdapter({ filename: ':memory:' }) });
    await coordinator.store('Where does Anna live?');
    const model = await callWithOneTool(coordinator, 'Where does Anna live?');

    expect(memoriesOf(model, 0)).toEqual(['Relevant memories from earlier sessions:\n- Where does Anna live?']);
    expect(memoriesOf(model, 1)).toEqual(['Relevant memories from earlier sessions:\n- Where does Anna live?']);
  });

  it('in a follow-up step another instance runs, leaves out the turn by its text', async () => {
    // A client-side tool: the first request ends with the tool call, and the tool result comes
    // back as a request of its own, which may reach another instance or process. That instance
    // does not know what the first one stored, so it falls back to leaving out a memory whose text
    // is exactly the user's message.
    coordinator = new MemoryCoordinator({ storage: new sqlite!.SqliteAdapter({ filename: ':memory:' }) });
    await coordinator.store('Anna moved to Hamburg in March.');
    const lookup = tool({
      description: 'Look something up.',
      inputSchema: jsonSchema<{ q: string }>({ type: 'object', properties: { q: { type: 'string' } } }),
    });
    const first = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'tool-call' as const, toolCallId: 'c1', toolName: 'lookup', input: '{"q":"Anna"}' }],
        finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
      }),
    });
    await generateText({
      model: wrapLanguageModel({ model: first, middleware: zenbrainMemory({ coordinator }) }),
      prompt: 'Where does Anna live?',
      tools: { lookup },
    });

    const second = new MockLanguageModelV4({ doGenerate: async () => reply('In Hamburg.') });
    await generateText({
      model: wrapLanguageModel({ model: second, middleware: zenbrainMemory({ coordinator }) }),
      messages: [
        { role: 'user', content: 'Where does Anna live?' },
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'lookup', input: { q: 'Anna' } }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'lookup', output: { type: 'text', value: 'Hamburg' } }] },
      ],
      tools: { lookup },
    });

    expect(memoriesOf(second, 0)).toEqual(['Relevant memories from earlier sessions:\n- Anna moved to Hamburg in March.']);
  });

  it('actually persists the turn, not just the prompt', async () => {
    coordinator = new MemoryCoordinator({
      storage: new sqlite!.SqliteAdapter({ filename: ':memory:' }),
      embedding: new FakeEmbeddingProvider(),
      cache: new InMemoryCache(),
    });

    const model = new MockLanguageModelV4({ doGenerate: async () => reply('ok') });
    await generateText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator }) }),
      prompt: 'Redis listens on port 6379.',
    });

    // Ask the coordinator directly — the middleware is not in this path at all.
    const found = await coordinator.recall('Redis port', { limit: 5 });
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((r) => typeof r.content === 'string' && r.content.includes('6379'))).toBe(
      true,
    );
  });
});
