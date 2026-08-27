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
