import { describe, it, expect } from 'vitest';
import { foldText, tokenize, scoreCandidates, rankByLexicalRelevance } from '../src/lexical';

/**
 * The cases below are the ones that were measured failing on 2026-09-26 against
 * `npx -y @zensation/mcp`: three unrelated facts stored, and every query returned all
 * three with score 0. Each `it` here is one of those probes.
 */
const FACTS = [
  'Der Leuchtturm von Bülk steht westlich der Kieler Förde.',
  'Zwiebelkuchen wird mit Speck, Sahne und Kümmel gebacken.',
  'Die Zugspitze ist der höchste Berg Deutschlands.',
];

const rank = (query: string, limit = 5) =>
  rankByLexicalRelevance(query, FACTS, f => f, limit);

describe('foldText', () => {
  it('folds German umlauts and sharp s', () => {
    expect(foldText('Bülk Förde groß')).toBe('buelk foerde gross');
  });

  it('strips accents so accented and plain spellings meet', () => {
    expect(foldText('café')).toBe(foldText('cafe'));
  });
});

describe('tokenize', () => {
  it('drops stopwords and one-character noise', () => {
    expect(tokenize('Der Leuchtturm von Bülk')).toEqual(['leuchtturm', 'buelk']);
  });

  it('returns nothing for a query made only of stopwords', () => {
    expect(tokenize('und der die das')).toEqual([]);
  });
});

describe('rankByLexicalRelevance — the regression this module exists for', () => {
  it('returns only the matching fact, not the whole store', () => {
    const hits = rank('Leuchtturm');
    expect(hits).toHaveLength(1);
    expect(hits[0].item).toContain('Leuchtturm');
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('discriminates: an unrelated query reaches a different fact', () => {
    const hits = rank('Backrezept mit Speck');
    expect(hits).toHaveLength(1);
    expect(hits[0].item).toContain('Zwiebelkuchen');
  });

  it('returns nothing when nothing matches — the negative control', () => {
    expect(rank('Quantenchromodynamik')).toEqual([]);
  });

  it('matches across the umlaut fold in both directions', () => {
    expect(rank('Kieler Foerde')[0].item).toContain('Förde');
    expect(rank('Kieler Förde')[0].item).toContain('Förde');
  });

  it('ranks the better match first when several hit', () => {
    const items = ['Speck und Sahne', 'Speck, Sahne und Kümmel im Zwiebelkuchen'];
    const hits = rankByLexicalRelevance('Zwiebelkuchen mit Kümmel', items, i => i, 5);
    expect(hits[0].item).toContain('Zwiebelkuchen');
  });

  it('honours the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => `Leuchtturm Nummer ${i}`);
    expect(rankByLexicalRelevance('Leuchtturm', many, i => i, 3)).toHaveLength(3);
  });

  it('prefers an exact phrase over the same words scattered', () => {
    // Both candidates carry both tokens; only the second carries them ADJACENT.
    // My first version of this test had the phrase in both, so the bonus separated
    // nothing and the assertion was meaningless — it failed on the first run.
    const items = ['Turm mit rotem Dach, daneben ein roter Wagen', 'roter Turm'];
    const hits = rankByLexicalRelevance('roter Turm', items, i => i, 5);
    expect(hits[0].item).toBe('roter Turm');
  });
});

describe('scoreCandidates — edges that must not throw', () => {
  it('scores an empty candidate list as an empty result', () => {
    expect(scoreCandidates('anything', [])).toEqual([]);
  });

  it('scores every candidate 0 for a stopword-only query', () => {
    expect(scoreCandidates('und der die', [{ text: 'Leuchtturm' }])).toEqual([0]);
  });

  it('never exceeds 1', () => {
    const scores = scoreCandidates('Leuchtturm', [{ text: 'Leuchtturm' }]);
    expect(scores[0]).toBeLessThanOrEqual(1);
    expect(scores[0]).toBeGreaterThan(0);
  });

  it('weighs a rare token above one that every candidate carries', () => {
    const candidates = [
      { text: 'Bericht über Speicher' },
      { text: 'Bericht über Leuchtturm' },
    ];
    const [common, rare] = scoreCandidates('Bericht Leuchtturm', candidates);
    expect(rare).toBeGreaterThan(common);
  });
});
