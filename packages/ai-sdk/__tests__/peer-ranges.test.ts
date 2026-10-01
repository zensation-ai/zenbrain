/**
 * Peer ranges — admit only the AI SDK line whose types the middleware uses.
 * The source imports LanguageModelV<N>* from @ai-sdk/provider; provider N ships
 * those names, earlier majors do not (a consumer on provider 3 gets TS2724).
 * ai 7 is the line built on provider 4.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const src = readdirSync(join(root, 'src'))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => readFileSync(join(root, 'src', f), 'utf8'))
  .join('\n');

const majors = (range: string) => new Set([...range.matchAll(/\^(\d+)/g)].map((m) => Number(m[1])));
const AI_FOR_PROVIDER: Record<number, number> = { 4: 7 };

describe('peer ranges', () => {
  const used = new Set([...src.matchAll(/LanguageModelV(\d+)/g)].map((m) => Number(m[1])));

  it('the source uses exactly one LanguageModel interface version', () => {
    expect([...used]).toHaveLength(1);
  });

  it('@ai-sdk/provider admits only the major that ships those types', () => {
    expect([...majors(pkg.peerDependencies['@ai-sdk/provider'])]).toEqual([...used]);
  });

  it('ai admits only the line built on that provider major', () => {
    const provider = [...used][0];
    expect([...majors(pkg.peerDependencies.ai)]).toEqual([AI_FOR_PROVIDER[provider]]);
  });
});
