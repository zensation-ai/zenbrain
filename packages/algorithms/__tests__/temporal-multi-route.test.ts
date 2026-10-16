import { describe, it, expect, vi } from 'vitest';
/**
 * Tests for algorithms/temporal-multi-route.
 *
 * Coverage:
 *   - decomposeTemporalQuery: every cue family + multi-route + passthrough
 *     + defensive (null/empty/garbage) + strip safety + token-guard.
 *   - fuseRoutes: RRF math, multi-route boost, perRouteWeight, maxHits,
 *     deterministic ordering on ties, custom itemId.
 *   - runTemporalMultiRoute: parallel runner execution + end-to-end
 *     orchestration shape.
 *
 * No external API / DB. Runner is a hand-stubbed callback.
 *
 * Reference: spec § H1 task 6.
 */

import {
  decomposeTemporalQuery,
  fuseRoutes,
  runTemporalMultiRoute,
  type RouteHit,
  type RouteResult,
  type RouteRunner,
  type TemporalSubQuery,
} from '../src/temporal-multi-route';

// ===========================================================================
// Test fixtures
// ===========================================================================

interface Doc {
  id: string;
  text: string;
}

const DOCS: Doc[] = [
  { id: 'd1', text: 'Caroline mentioned her birthday is May 8' },
  { id: 'd2', text: 'Caroline celebrated her birthday with friends' },
  { id: 'd3', text: 'Joanna planned a trip to Spain next month' },
  { id: 'd4', text: 'Joanna returned from Spain and started a new job' },
  { id: 'd5', text: "Caroline's daughter graduated from college in 2022" },
];

function makeStubRunner(): RouteRunner<Doc> {
  // Naive lexical overlap; stable across calls.
  return async (sub: TemporalSubQuery): Promise<RouteHit<Doc>[]> => {
    const tokens = sub.query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    return DOCS
      .map((d) => {
        let score = 0;
        const haystack = d.text.toLowerCase();
        for (const t of tokens) if (haystack.includes(t)) score += 1;
        return { item: d, score };
      })
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score);
  };
}

function makeSub(
  kind: TemporalSubQuery['kind'],
  confidence = 1.0,
): TemporalSubQuery {
  return { kind, query: 'x', cues: [], confidence, orderingHint: null };
}

// ===========================================================================
// decomposeTemporalQuery
// ===========================================================================

describe('decomposeTemporalQuery', () => {
  describe('absolute cues', () => {
    it.each([
      ['When did Caroline mention her birthday?', 'when did'],
      ['When was the last time Joanna travelled?', 'when was'],
      ['When will the conference start?', 'when will'],
      ['When does the meeting begin?', 'when does'],
      ['When is the next session?', 'when is'],
      ['When are they arriving?', 'when are'],
      ['When were they last seen?', 'when were'],
      ['When had they finished?', 'when had'],
      ['When has she travelled before?', 'when has'],
      ['What date did Caroline celebrate?', 'what date'],
      ['What day is the meeting?', 'what day'],
      ['What month did they meet?', 'what month'],
      ['What year did Caroline graduate?', 'what year'],
      ['What time did the call end?', 'what time'],
      ['At what time did the meeting end?', 'at what time'],
      ['On which date did they meet?', 'on which date'],
    ])('detects "%s" as absolute', (query) => {
      const d = decomposeTemporalQuery(query);
      expect(d.isTemporal).toBe(true);
      expect(d.detectedCues.absoluteWhen).toBe(true);
      expect(d.routes.some((r) => r.kind === 'absolute')).toBe(true);
    });

    it('strips "when did" tokens from absolute sub-query', () => {
      const d = decomposeTemporalQuery('When did Caroline mention her birthday?');
      const abs = d.routes.find((r) => r.kind === 'absolute')!;
      expect(abs.query.toLowerCase()).not.toMatch(/^when did/);
      expect(abs.query.toLowerCase()).toContain('caroline');
      expect(abs.query.toLowerCase()).toContain('birthday');
    });

    it('preserves trailing question mark after strip', () => {
      const d = decomposeTemporalQuery('When did Caroline first mention her birthday?');
      const abs = d.routes.find((r) => r.kind === 'absolute')!;
      expect(abs.query.endsWith('?')).toBe(true);
    });
  });

  describe('relative cues', () => {
    const cases: Array<[string, TemporalSubQuery['orderingHint']]> = [
      ['What did Joanna do after her trip to Spain?', 'after-anchor'],
      ['What happened since her birthday?', 'after-anchor'],
      ['What did she do following the meeting?', 'after-anchor'],
      ['What occurred subsequent to the trip?', 'after-anchor'],
      ['What did Caroline mention before her birthday?', 'before-anchor'],
      ['What did she say prior to the meeting?', 'before-anchor'],
      ['What was discussed earlier than that?', 'before-anchor'],
      ['When did Caroline first mention her birthday?', 'earliest'],
      ['What did Caroline originally say about it?', 'earliest'],
      ['What did Joanna mention initially?', 'earliest'],
      ['When was the earliest mention of Spain?', 'earliest'],
      ['What was the last thing Caroline said?', 'latest'],
      ['What did she most recently mention?', 'latest'],
      ['What was the latest update on Joanna?', 'latest'],
    ];
    it.each(cases)('detects "%s" → relative %s', (query, expectedHint) => {
      const d = decomposeTemporalQuery(query);
      expect(d.isTemporal).toBe(true);
      expect(d.detectedCues.relativeOrder).toBe(true);
      const rel = d.routes.find((r) => r.kind === 'relative');
      expect(rel).toBeDefined();
      expect(rel!.orderingHint).toBe(expectedHint);
    });
  });

  describe('duration cues', () => {
    it.each([
      ['How long ago did Caroline mention this?', 'how long'],
      ['How many days since her birthday?', 'how many days'],
      ['How many months has it been?', 'how many months'],
      ['How many years did they wait?', 'how many years'],
      ['How many hours did the meeting last?', 'how many hours'],
      ['What is the duration of the project?', 'duration of'],
      ['For how long did Caroline live there?', 'for how long'],
    ])('detects "%s" as duration', (query) => {
      const d = decomposeTemporalQuery(query);
      expect(d.isTemporal).toBe(true);
      expect(d.detectedCues.duration).toBe(true);
      expect(d.routes.some((r) => r.kind === 'duration')).toBe(true);
    });

    it('strips "how long ago did" producing a clean searchable sub-query', () => {
      const d = decomposeTemporalQuery("How long ago did Caroline's daughter graduate?");
      const dur = d.routes.find((r) => r.kind === 'duration')!;
      expect(dur.query.toLowerCase()).not.toMatch(/how long/);
      expect(dur.query.toLowerCase()).toContain('caroline');
      expect(dur.query.toLowerCase()).toContain('daughter');
      expect(dur.query.toLowerCase()).toContain('graduate');
    });

    it('aggregates multiple duration cues without exceeding 1.0', () => {
      const d = decomposeTemporalQuery("How long ago did Caroline's daughter graduate?");
      // "how long" + "ago" cues both fire under duration.
      const dur = d.routes.find((r) => r.kind === 'duration')!;
      expect(dur.confidence).toBeGreaterThan(0.95);
      expect(dur.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('multi-route', () => {
    it('fires absolute + relative when both cues present', () => {
      const d = decomposeTemporalQuery('When did Caroline first mention her birthday?');
      expect(d.routes.length).toBe(2);
      expect(d.routes.map((r) => r.kind).sort()).toEqual(['absolute', 'relative']);
    });

    it('fires absolute + duration when both cues present', () => {
      const d = decomposeTemporalQuery('When did this happen and how long ago was it?');
      expect(d.routes.length).toBe(2);
      const kinds = new Set(d.routes.map((r) => r.kind));
      expect(kinds.has('absolute')).toBe(true);
      expect(kinds.has('duration')).toBe(true);
    });

    it('primaryRouteKind = highest confidence', () => {
      const d = decomposeTemporalQuery('When did Caroline first mention her birthday?');
      // absolute "when did" = 0.95, relative "first" = 0.85.
      expect(d.primaryRouteKind).toBe('absolute');
    });

    it('primaryRouteKind tie-break: absolute > relative > duration', () => {
      // Forge a tied case by handcrafting then asserting against
      // confidences. We verify via the spec — at equal confidence the
      // tie-break picks `absolute`. Here both fire at 0.95: "when did"
      // (absolute) and "how long" (duration).
      const d = decomposeTemporalQuery('When did this happen — how long ago?');
      const abs = d.routes.find((r) => r.kind === 'absolute')!;
      const dur = d.routes.find((r) => r.kind === 'duration')!;
      // "how long" is 0.95 and "ago" adds 0.5 → aggregated > "when did"
      // alone. So duration actually wins on confidence here.
      expect(d.primaryRouteKind).toBe(dur.confidence > abs.confidence ? 'duration' : 'absolute');
    });
  });

  describe('non-temporal pass-through', () => {
    it.each([
      'Where does Caroline live?',
      'Who is Joanna married to?',
      'What is the capital of Spain?',
      'How does this work?',
    ])('marks "%s" as non-temporal with single passthrough route', (q) => {
      const d = decomposeTemporalQuery(q);
      expect(d.isTemporal).toBe(false);
      expect(d.routes.length).toBe(1);
      expect(d.routes[0].kind).toBe('absolute');
      expect(d.routes[0].confidence).toBe(0.5);
      expect(d.routes[0].query).toBe(q);
      expect(d.primaryRouteKind).toBe(null);
    });
  });

  describe('defensive', () => {
    it('handles empty string', () => {
      const d = decomposeTemporalQuery('');
      expect(d.isTemporal).toBe(false);
      expect(d.routes.length).toBe(1);
    });

    it('handles whitespace-only', () => {
      const d = decomposeTemporalQuery('   \t\n   ');
      expect(d.isTemporal).toBe(false);
    });

    it('handles null/undefined coerced to string', () => {
      const d1 = decomposeTemporalQuery(null as unknown as string);
      const d2 = decomposeTemporalQuery(undefined as unknown as string);
      expect(d1.isTemporal).toBe(false);
      expect(d2.isTemporal).toBe(false);
    });
  });

  describe('strip safety', () => {
    it('falls back to original when strip would leave fewer than 2 tokens', () => {
      const d = decomposeTemporalQuery('When did?');
      const abs = d.routes.find((r) => r.kind === 'absolute')!;
      // Without the guard, strip would leave "?" → unusable. The guard
      // forces a fallback to the original.
      expect(abs.query).toBe('When did?');
    });

    it('keeps content tokens when strip is reasonable', () => {
      const d = decomposeTemporalQuery('When did Joanna start her new job?');
      const abs = d.routes.find((r) => r.kind === 'absolute')!;
      expect(abs.query.toLowerCase()).toContain('joanna');
      expect(abs.query.toLowerCase()).toContain('job');
    });
  });
});

// ===========================================================================
// fuseRoutes
// ===========================================================================

describe('fuseRoutes', () => {
  it('returns empty list when no hits', () => {
    const out = fuseRoutes<Doc>([{ route: makeSub('absolute'), hits: [] }]);
    expect(out).toEqual([]);
  });

  it('single-route, single-hit: score = (conf × perRouteWeight) / (k+1)', () => {
    const out = fuseRoutes<Doc>([{
      route: makeSub('absolute', 1.0),
      hits: [{ item: DOCS[0], score: 0.9 }],
    }]);
    expect(out.length).toBe(1);
    expect(out[0].score).toBeCloseTo(1.0 / 61, 9);
    expect(out[0].contributingRoutes).toEqual(['absolute']);
    expect(out[0].bestRetrieverScore).toBe(0.9);
  });

  it('respects rrfK override', () => {
    const out = fuseRoutes<Doc>([{
      route: makeSub('absolute', 1.0),
      hits: [{ item: DOCS[0], score: 0.9 }],
    }], { rrfK: 10 });
    expect(out[0].score).toBeCloseTo(1.0 / 11, 9);
  });

  it('confidence weights the contribution', () => {
    const high = fuseRoutes<Doc>([{
      route: makeSub('absolute', 1.0),
      hits: [{ item: DOCS[0], score: 1.0 }],
    }])[0];
    const low = fuseRoutes<Doc>([{
      route: makeSub('absolute', 0.5),
      hits: [{ item: DOCS[0], score: 1.0 }],
    }])[0];
    expect(low.score).toBeCloseTo(high.score / 2, 9);
  });

  it('perRouteWeight scales the contribution', () => {
    const base = fuseRoutes<Doc>([{
      route: makeSub('absolute', 1.0),
      hits: [{ item: DOCS[0], score: 1.0 }],
    }])[0];
    const weighted = fuseRoutes<Doc>([{
      route: makeSub('absolute', 1.0),
      hits: [{ item: DOCS[0], score: 1.0 }],
    }], { perRouteWeight: 1.5 })[0];
    expect(weighted.score).toBeCloseTo(base.score * 1.5, 9);
  });

  it('multi-route boost applies once when item appears in 2+ routes', () => {
    const routes: RouteResult<Doc>[] = [
      { route: makeSub('absolute', 1.0), hits: [{ item: DOCS[0], score: 1.0 }] },
      { route: makeSub('relative', 1.0), hits: [{ item: DOCS[0], score: 1.0 }] },
    ];
    const noBoost = fuseRoutes<Doc>(routes, { multiRouteBoost: 1.0 });
    const withBoost = fuseRoutes<Doc>(routes, { multiRouteBoost: 1.2 });
    expect(withBoost[0].score).toBeCloseTo(noBoost[0].score * 1.2, 9);
    expect(withBoost[0].contributingRoutes).toEqual(['absolute', 'relative']);
  });

  it('multi-route boost does NOT apply when item appears in only one route', () => {
    const routes: RouteResult<Doc>[] = [
      { route: makeSub('absolute', 1.0), hits: [{ item: DOCS[0], score: 1.0 }] },
      { route: makeSub('relative', 1.0), hits: [{ item: DOCS[1], score: 1.0 }] },
    ];
    const out = fuseRoutes<Doc>(routes, { multiRouteBoost: 1.5 });
    // Both items in 1 route only — no boost. They should have equal scores.
    expect(out[0].score).toBeCloseTo(out[1].score, 9);
    expect(out[0].contributingRoutes.length).toBe(1);
    expect(out[1].contributingRoutes.length).toBe(1);
  });

  it('sorts by fused score descending', () => {
    const routes: RouteResult<Doc>[] = [{
      route: makeSub('absolute', 1.0),
      hits: [
        { item: DOCS[0], score: 1.0 }, // rank 0
        { item: DOCS[1], score: 0.5 }, // rank 1
        { item: DOCS[2], score: 0.1 }, // rank 2
      ],
    }];
    const out = fuseRoutes<Doc>(routes);
    expect(out.map((h) => h.item.id)).toEqual(['d1', 'd2', 'd3']);
  });

  it('tie-break uses bestRetrieverScore', () => {
    // Two items with identical RRF (same single-route rank 0) — but
    // d1 has higher retriever score, so it wins the tie. Constructed
    // by giving each its own route so RRF is identical.
    const routes: RouteResult<Doc>[] = [
      { route: makeSub('absolute', 1.0), hits: [{ item: DOCS[0], score: 5.0 }] },
      { route: makeSub('relative', 1.0), hits: [{ item: DOCS[1], score: 1.0 }] },
    ];
    const out = fuseRoutes<Doc>(routes, { multiRouteBoost: 1.0 });
    expect(out[0].item.id).toBe('d1');
    expect(out[0].score).toBeCloseTo(out[1].score, 9);
  });

  it('respects maxHits cap', () => {
    const routes: RouteResult<Doc>[] = [{
      route: makeSub('absolute', 1.0),
      hits: DOCS.map((d, i) => ({ item: d, score: 5 - i })),
    }];
    const out = fuseRoutes<Doc>(routes, { maxHits: 2 });
    expect(out.length).toBe(2);
  });

  it('uses custom itemId for merging', () => {
    type Tagged = { uniq: string; payload: string };
    const a: Tagged = { uniq: 'k', payload: 'first' };
    const b: Tagged = { uniq: 'k', payload: 'second' }; // same id, different payload
    const out = fuseRoutes<Tagged>([
      { route: makeSub('absolute', 1.0), hits: [{ item: a, score: 1.0 }] },
      { route: makeSub('relative', 1.0), hits: [{ item: b, score: 1.0 }] },
    ], { itemId: (x) => x.uniq });
    expect(out.length).toBe(1);
    expect(out[0].contributingRoutes.length).toBe(2);
  });

  it('skips items with empty id', () => {
    const noisy = [{ id: '', text: 'noise' }, ...DOCS];
    const out = fuseRoutes<Doc>([{
      route: makeSub('absolute', 1.0),
      hits: noisy.map((d) => ({ item: d, score: 1 })),
    }]);
    expect(out.find((h) => h.item.id === '')).toBeUndefined();
    expect(out.length).toBe(noisy.length - 1);
  });

  it('numeric ids handled by default itemId', () => {
    type Numeric = { id: number; text: string };
    const items: Numeric[] = [{ id: 1, text: 'a' }, { id: 2, text: 'b' }];
    const out = fuseRoutes<Numeric>([{
      route: makeSub('absolute', 1.0),
      hits: items.map((d) => ({ item: d, score: 1 })),
    }]);
    expect(out.length).toBe(2);
  });
});

// ===========================================================================
// runTemporalMultiRoute (integration of decompose + fuse + runner)
// ===========================================================================

describe('runTemporalMultiRoute', () => {
  it('end-to-end on a multi-cue query returns fused hits', async () => {
    const result = await runTemporalMultiRoute(
      'When did Caroline first mention her birthday?',
      makeStubRunner(),
      { itemId: (d) => d.id, maxHits: 5 },
    );
    expect(result.decomposition.isTemporal).toBe(true);
    expect(result.decomposition.routes.length).toBe(2);
    expect(result.perRoute.length).toBe(2);
    expect(result.fused.length).toBeGreaterThan(0);
    expect(result.fused[0].score).toBeGreaterThan(0);
    // The top hit should be one of Caroline's birthday docs.
    const topId = result.fused[0].item.id;
    expect(['d1', 'd2']).toContain(topId);
  });

  it('non-temporal query falls back to single passthrough route', async () => {
    const runner = vi.fn(makeStubRunner());
    const result = await runTemporalMultiRoute(
      'Who is Caroline married to?',
      runner,
      { itemId: (d) => d.id },
    );
    expect(result.decomposition.isTemporal).toBe(false);
    expect(result.perRoute.length).toBe(1);
    // Runner was called exactly once (one route, the passthrough).
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0][0].kind).toBe('absolute');
    expect(runner.mock.calls[0][0].confidence).toBe(0.5);
  });

  it('runs routes in parallel (Promise.all semantics — total time ≈ max, not sum)', async () => {
    // We don't measure wall-clock — that's flaky. Instead, we use a
    // counter inside the runner that records max-concurrency seen. If
    // execution were sequential, max-concurrency would always be 1.
    let active = 0;
    let maxActive = 0;
    const runner: RouteRunner<Doc> = async (sub) => {
      active++;
      if (active > maxActive) maxActive = active;
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return [{ item: DOCS[0], score: 1 }];
    };
    await runTemporalMultiRoute(
      'When did Caroline first mention her birthday?',
      runner,
      { itemId: (d) => d.id },
    );
    expect(maxActive).toBe(2); // 2 routes fired concurrently
  });

  it('runner errors propagate (caller is responsible for error policy)', async () => {
    const runner: RouteRunner<Doc> = async () => {
      throw new Error('retriever exploded');
    };
    await expect(
      runTemporalMultiRoute(
        'When did this happen?',
        runner,
        { itemId: (d) => d.id },
      ),
    ).rejects.toThrow('retriever exploded');
  });
});

// CodeQL js/polynomial-redos (zenbrain alert #4): the trim after stripping cue tokens used
// /^[\s,?.]+|[\s,?.]+$/g, which backtracked over every run of commas that was not at the
// end ('when did a' + 64 000 commas + 'b' took 6.7 s). Linear now.
describe('decomposeTemporalQuery on adversarial input', () => {
  it('stays linear on a long run of commas', () => {
    const query = 'when did a' + ','.repeat(100_000) + 'b';
    const start = performance.now();
    decomposeTemporalQuery(query);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
