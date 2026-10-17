/**
 * These tests wrap a real model with the real `wrapLanguageModel` and read what the
 * model actually received. A middleware that returns a well-formed object but never
 * reaches the prompt would pass a shape test and do nothing in production.
 *
 * The coordinator is a stub here, on purpose: `InMemoryStorage` cannot round-trip
 * content (it stores parameters as `col_0`, `col_1`, …), so it can prove nothing about
 * injection. The real round trip is covered in `sqlite-integration.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
import { generateText, streamText, wrapLanguageModel } from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import type { MemoryCoordinator, RecallResult } from '@zensation/core';
import { zenbrainMemory } from '../src/index.js';

/** A coordinator that records what it was asked and returns what the test dictates. */
function stubCoordinator(recallResults: Partial<RecallResult>[] = []) {
  const stored: { content: string; options: unknown }[] = [];
  const recalls: { query: string; options: unknown }[] = [];
  const coordinator = {
    async store(content: string, options: unknown) {
      stored.push({ content, options });
      return `id-${stored.length}`;
    },
    async recall(query: string, options: unknown) {
      recalls.push({ query, options });
      return recallResults as RecallResult[];
    },
  } as unknown as MemoryCoordinator;
  return { coordinator, stored, recalls };
}

const reply = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  finishReason: 'stop' as const,
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  warnings: [],
});

function systemTexts(prompt: readonly { role: string; content: unknown }[]): string[] {
  return prompt.filter((m) => m.role === 'system').map((m) => String(m.content));
}

describe('recall injection', () => {
  it('puts recalled memories in front of the model', async () => {
    const { coordinator, recalls } = stubCoordinator([
      { content: 'The user prefers dark mode.', layer: 'semantic', score: 0.9 },
      { content: 'The user works in Kiel.', layer: 'semantic', score: 0.7 },
    ]);
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('ok') });

    await generateText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator }) }),
      prompt: 'What theme should I use?',
    });

    const systems = systemTexts(model.doGenerateCalls[0].prompt);
    expect(systems.length).toBe(1);
    expect(systems[0]).toContain('dark mode');
    expect(systems[0]).toContain('Kiel');
    expect(systems[0]).toContain('Relevant memories');

    // The query has to be the user's message, not the whole conversation.
    expect(recalls[0].query).toBe('What theme should I use?');
  });

  it('leaves the caller\'s own system prompt with the last word', async () => {
    const { coordinator } = stubCoordinator([
      { content: 'A memory.', layer: 'semantic', score: 1 },
    ]);
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('ok') });

    await generateText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator }) }),
      system: 'You are terse.',
      prompt: 'Hello',
    });

    const prompt = model.doGenerateCalls[0].prompt;
    expect(prompt[0].role).toBe('system');
    expect(String(prompt[0].content)).toContain('A memory.');
    expect(systemTexts(prompt).some((s) => s.includes('You are terse.'))).toBe(true);
    // ours first, the caller's after it
    expect(systemTexts(prompt)[1]).toBe('You are terse.');
  });

  it("with role 'user', puts the memories in a user message right before the latest turn, not in a system message", async () => {
    const { coordinator } = stubCoordinator([{ content: 'Anna moved to Hamburg.', layer: 'semantic', score: 1 }]);
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('ok') });

    await generateText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator, role: 'user' }) }),
      system: 'You are terse.',
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello.' },
        { role: 'user', content: 'Where does Anna live?' },
      ],
    });

    const prompt = model.doGenerateCalls[0].prompt;
    expect(systemTexts(prompt)).toEqual(['You are terse.']);
    const roles = prompt.map((m) => m.role);
    expect(roles).toEqual(['system', 'user', 'assistant', 'user', 'user']);
    const injected = prompt[3] as { content: { type: string; text: string }[] };
    expect(injected.content[0].text).toContain('Anna moved to Hamburg.');
    expect(JSON.stringify(prompt[4])).toContain('Where does Anna live?');
  });

  it('injects nothing when nothing was recalled', async () => {
    const { coordinator } = stubCoordinator([]);
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('ok') });

    await generateText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator }) }),
      prompt: 'Hello',
    });

    expect(systemTexts(model.doGenerateCalls[0].prompt)).toEqual([]);
  });

  it('drops rows whose content did not survive the storage adapter', async () => {
    const { coordinator } = stubCoordinator([
      { layer: 'semantic', score: 0.5 } as Partial<RecallResult>, // no content
      { content: 'A real one.', layer: 'semantic', score: 0.4 },
    ]);
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('ok') });

    await generateText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator }) }),
      prompt: 'Hello',
    });

    const injected = systemTexts(model.doGenerateCalls[0].prompt)[0];
    expect(injected).toContain('A real one.');
    expect(injected).not.toContain('- \n');
    expect(injected.split('\n').filter((l) => l.startsWith('- ')).length).toBe(1);
  });

  it('honours limit, layers and a custom header', async () => {
    const { coordinator, recalls } = stubCoordinator([
      { content: 'x', layer: 'core', score: 1 },
    ]);
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('ok') });

    await generateText({
      model: wrapLanguageModel({
        model,
        middleware: zenbrainMemory({
          coordinator,
          recall: { limit: 3, layers: ['core'], minConfidence: 0.5 },
          header: 'What I remember:',
        }),
      }),
      prompt: 'Hello',
    });

    expect(recalls[0].options).toMatchObject({ limit: 3, layers: ['core'], minConfidence: 0.5 });
    expect(systemTexts(model.doGenerateCalls[0].prompt)[0]).toContain('What I remember:');
  });

  it('leaves out score-0 fallbacks by default and injects them with minScore: 0', async () => {
    // Measured on 0.3.1: "What is the capital of France?" got unrelated memories (the recall
    // fallback, score 0) injected as "Relevant memories from earlier sessions:".
    const results = [
      { content: 'Paris is the capital of France.', layer: 'semantic' as const, score: 0.6 },
      { content: 'The user owns a red bicycle.', layer: 'semantic' as const, score: 0 },
    ];
    const injected = async (recall?: { minScore?: number }) => {
      const { coordinator, recalls } = stubCoordinator(results);
      const model = new MockLanguageModelV4({ doGenerate: async () => reply('ok') });
      await generateText({
        model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator, recall }) }),
        prompt: 'What is the capital of France?',
      });
      return { text: systemTexts(model.doGenerateCalls[0].prompt).join('\n'), options: recalls[0].options };
    };

    const byDefault = await injected();
    expect(byDefault.text).toContain('Paris');
    expect(byDefault.text).not.toContain('bicycle');
    expect(byDefault.options).not.toHaveProperty('minScore');

    const all = await injected({ minScore: 0 });
    expect(all.text).toContain('bicycle');
    expect(all.options).toMatchObject({ minScore: 0 });

    const strict = await injected({ minScore: 0.7 });
    expect(strict.text).toBe('');
  });

  it('injects nothing when only fallbacks came back', async () => {
    const { coordinator } = stubCoordinator([{ content: 'The user owns a red bicycle.', layer: 'semantic', score: 0 }]);
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('ok') });

    await generateText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator }) }),
      prompt: 'What is the capital of France?',
    });

    expect(systemTexts(model.doGenerateCalls[0].prompt)).toEqual([]);
  });

  it('does not search at all when recall is switched off', async () => {
    const { coordinator, recalls } = stubCoordinator([
      { content: 'never used', layer: 'semantic', score: 1 },
    ]);
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('ok') });

    await generateText({
      model: wrapLanguageModel({
        model,
        middleware: zenbrainMemory({ coordinator, recall: false }),
      }),
      prompt: 'Hello',
    });

    expect(recalls).toHaveLength(0);
    expect(systemTexts(model.doGenerateCalls[0].prompt)).toEqual([]);
  });
});

describe('storing the turn', () => {
  it('stores the user message by default and the reply only on request', async () => {
    const { coordinator, stored } = stubCoordinator();
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('Use dark mode.') });

    await generateText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator }) }),
      prompt: 'Which theme?',
    });
    expect(stored.map((s) => s.content)).toEqual(['Which theme?']);

    const second = stubCoordinator();
    const model2 = new MockLanguageModelV4({ doGenerate: async () => reply('Use dark mode.') });
    await generateText({
      model: wrapLanguageModel({
        model: model2,
        middleware: zenbrainMemory({
          coordinator: second.coordinator,
          store: { assistant: true, context: 'work' },
        }),
      }),
      prompt: 'Which theme?',
    });
    expect(second.stored.map((s) => s.content)).toEqual(['Which theme?', 'Use dark mode.']);
    expect(second.stored[0].options).toMatchObject({ context: 'work', source: 'user' });
    expect(second.stored[1].options).toMatchObject({ context: 'work', source: 'ai' });
  });

  it('skips a turn when shouldStore says no, and stores the next one', async () => {
    const { coordinator, stored } = stubCoordinator();
    const seen: { user: string; assistant: string }[] = [];
    const middleware = zenbrainMemory({
      coordinator,
      store: {
        assistant: true,
        shouldStore: (turn) => {
          seen.push(turn);
          return !turn.user.includes('password');
        },
      },
    });

    for (const prompt of ['My password is hunter2', 'I prefer dark mode']) {
      const model = new MockLanguageModelV4({ doGenerate: async () => reply('Noted.') });
      await generateText({ model: wrapLanguageModel({ model, middleware }), prompt });
    }

    expect(seen).toEqual([
      { user: 'My password is hunter2', assistant: 'Noted.' },
      { user: 'I prefer dark mode', assistant: 'Noted.' },
    ]);
    expect(stored.map((s) => s.content)).toEqual(['I prefer dark mode', 'Noted.']);
  });

  it('reports a throwing shouldStore as a store error and answers normally', async () => {
    const { coordinator, stored } = stubCoordinator();
    const onError = vi.fn();
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('ok') });

    const { text } = await generateText({
      model: wrapLanguageModel({
        model,
        middleware: zenbrainMemory({
          coordinator,
          onError,
          store: { shouldStore: () => { throw new Error('policy down'); } },
        }),
      }),
      prompt: 'Hello',
    });

    expect(text).toBe('ok');
    expect(stored).toHaveLength(0);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'store');
  });

  it('writes nothing when storing is switched off', async () => {
    const { coordinator, stored } = stubCoordinator();
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('ok') });

    await generateText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator, store: false }) }),
      prompt: 'Hello',
    });

    expect(stored).toHaveLength(0);
  });
});

describe('streaming', () => {
  it('passes the stream through unchanged and stores what was said', async () => {
    const { coordinator, stored } = stubCoordinator();
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Use ' },
            { type: 'text-delta', id: '1', delta: 'dark ' },
            { type: 'text-delta', id: '1', delta: 'mode.' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 1, outputTokens: 3, totalTokens: 4 },
            },
          ],
        }),
      }),
    });

    const result = streamText({
      model: wrapLanguageModel({
        model,
        middleware: zenbrainMemory({ coordinator, store: { assistant: true } }),
      }),
      prompt: 'Which theme?',
    });

    let text = '';
    for await (const part of result.textStream) text += part;

    // The reader sees exactly what the model sent.
    expect(text).toBe('Use dark mode.');
    // And both sides of the turn were written once the stream finished.
    expect(stored.map((s) => s.content)).toEqual(['Which theme?', 'Use dark mode.']);
  });
});

/** A model that streams one delta and then waits; an abort errors its stream, as fetch does. */
function hangingModel(onAbort: 'error' | 'close' = 'error') {
  return new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: '1' });
          controller.enqueue({ type: 'text-delta', id: '1', delta: 'Half an ans' });
          abortSignal?.addEventListener('abort', () =>
            onAbort === 'error'
              ? controller.error(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))
              : controller.close(),
          );
        },
      }),
    }),
  });
}

describe('aborted and failed streams', () => {
  for (const onAbort of ['error', 'close'] as const) {
    it(`an abort stores the user's turn but not the partial reply (provider ${onAbort}s the stream)`, async () => {
      // Until 0.4.0 an abort stored nothing (provider errors) or the partial reply too (provider
      // closes; red on 0.3.1 here). The user's turn is complete; half an
      // answer is not.
      const { coordinator, stored } = stubCoordinator();
      const controller = new AbortController();
      const result = streamText({
        model: wrapLanguageModel({
          model: hangingModel(onAbort),
          middleware: zenbrainMemory({ coordinator, store: { assistant: true } }),
        }),
        prompt: 'Explain the tides.',
        abortSignal: controller.signal,
      });

      let text = '';
      try {
        for await (const part of result.textStream) {
          text += part;
          controller.abort();
        }
      } catch {
        // the reader sees the abort; that is the caller's business
      }
      await vi.waitFor(() => expect(stored).toHaveLength(1));

      expect(text).toBe('Half an ans');
      expect(stored.map((s) => s.content)).toEqual(['Explain the tides.']);
    });
  }

  it('a stream that fails for another reason stores nothing', async () => {
    const { coordinator, stored } = stubCoordinator();
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: '1' });
            controller.enqueue({ type: 'text-delta', id: '1', delta: 'Half' });
            controller.error(new Error('connection reset'));
          },
        }),
      }),
    });
    const result = streamText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator, store: { assistant: true } }) }),
      prompt: 'Explain the tides.',
      onError: () => {},
    });

    try {
      for await (const part of result.textStream) void part;
    } catch {
      // expected
    }
    await new Promise((r) => setTimeout(r, 20));

    expect(stored).toEqual([]);
  });
});

describe('failure is contained', () => {
  it('answers normally when recall throws, and reports it', async () => {
    const onError = vi.fn();
    const coordinator = {
      async recall() {
        throw new Error('storage is down');
      },
      async store() {
        return 'id';
      },
    } as unknown as MemoryCoordinator;
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('still here') });

    const out = await generateText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator, onError }) }),
      prompt: 'Hello',
    });

    expect(out.text).toBe('still here');
    expect(systemTexts(model.doGenerateCalls[0].prompt)).toEqual([]);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'recall');
  });

  it('answers normally when storing throws, and reports it', async () => {
    const onError = vi.fn();
    const coordinator = {
      async recall() {
        return [];
      },
      async store() {
        throw new Error('disk full');
      },
    } as unknown as MemoryCoordinator;
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('still here') });

    const out = await generateText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator, onError }) }),
      prompt: 'Hello',
    });

    expect(out.text).toBe('still here');
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'store');
  });

  it('stays silent when no onError was given', async () => {
    const coordinator = {
      async recall() {
        throw new Error('boom');
      },
      async store() {
        throw new Error('boom');
      },
    } as unknown as MemoryCoordinator;
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('fine') });

    const out = await generateText({
      model: wrapLanguageModel({ model, middleware: zenbrainMemory({ coordinator }) }),
      prompt: 'Hello',
    });
    expect(out.text).toBe('fine');
  });
});
