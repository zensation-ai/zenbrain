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
import { generateText, wrapLanguageModel } from 'ai';
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
