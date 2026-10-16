import {
  ibShouldRetain,
  IB_BETA,
  estimateCompressionCost,
  estimateRelevanceGain,
  ibFilterEpisodes,
} from '../src/ib-budget';

describe('Context-Adaptive IB Budget', () => {
  describe('IB_BETA values', () => {
    it('should have finance > people > operations > strategy', () => {
      expect(IB_BETA.finance).toBeGreaterThan(IB_BETA.people);
      expect(IB_BETA.people).toBeGreaterThan(IB_BETA.operations);
      expect(IB_BETA.operations).toBeGreaterThan(IB_BETA.strategy);
    });
  });

  describe('ibShouldRetain', () => {
    // The module header used to list work/learning/personal/creative. Those names have no beta,
    // so the comparison ran against NaN and returned false for every episode, without an error.
    it('rejects a context it has no beta for', () => {
      for (const context of ['work', 'learning', 'personal', 'creative']) {
        expect(() => ibShouldRetain(0.1, 1.0, context as never)).toThrow(RangeError);
        expect(() => ibFilterEpisodes([{ id: 'e', compressionCost: 0.1, relevanceGain: 1 }], context as never)).toThrow(RangeError);
        expect(() => ibFilterEpisodes([], context as never)).toThrow(RangeError);
      }
    });

    it('should retain high-relevance episodes in work context', () => {
      expect(ibShouldRetain(0.3, 0.8, 'finance')).toBe(true); // 0.8*0.8 > 0.3
    });

    it('should discard low-relevance episodes in creative context', () => {
      expect(ibShouldRetain(0.5, 0.4, 'strategy')).toBe(false); // 0.4*0.3 < 0.5
    });

    it('should be stricter in creative (more compression) than work', () => {
      // Same episode: retained in work, discarded in creative
      const compressionCost = 0.4;
      const relevanceGain = 0.6;
      expect(ibShouldRetain(compressionCost, relevanceGain, 'finance')).toBe(true);
      expect(ibShouldRetain(compressionCost, relevanceGain, 'strategy')).toBe(false);
    });
  });

  describe('estimateCompressionCost', () => {
    it('should return higher cost for longer content', () => {
      const short = estimateCompressionCost(500, 5, 0.3);
      const long = estimateCompressionCost(4000, 5, 0.3);
      expect(long).toBeGreaterThan(short);
    });

    it('should cap at 1.0', () => {
      const maxed = estimateCompressionCost(10000, 50, 2.0);
      expect(maxed).toBeLessThanOrEqual(1.0);
    });

    it('should return 0 for empty content', () => {
      expect(estimateCompressionCost(0, 0, 0)).toBe(0);
    });
  });

  describe('estimateRelevanceGain', () => {
    it('should return higher gain for frequently retrieved items', () => {
      const low = estimateRelevanceGain(1, 0.5, 30);
      const high = estimateRelevanceGain(8, 0.5, 30);
      expect(high).toBeGreaterThan(low);
    });

    it('should penalize stale items', () => {
      const recent = estimateRelevanceGain(5, 0.7, 1);
      const stale = estimateRelevanceGain(5, 0.7, 80);
      expect(recent).toBeGreaterThan(stale);
    });

    it('should return 0 for very old unretrieved items', () => {
      const result = estimateRelevanceGain(0, 0, 100);
      expect(result).toBe(0);
    });
  });

  describe('ibFilterEpisodes', () => {
    it('should filter more aggressively in creative context', () => {
      const episodes = [
        { id: '1', compressionCost: 0.3, relevanceGain: 0.5 },
        { id: '2', compressionCost: 0.6, relevanceGain: 0.4 },
        { id: '3', compressionCost: 0.2, relevanceGain: 0.9 },
      ];

      const workRetained = ibFilterEpisodes(episodes, 'finance');
      const creativeRetained = ibFilterEpisodes(episodes, 'strategy');

      expect(workRetained.length).toBeGreaterThanOrEqual(creativeRetained.length);
    });

    it('should return empty array when all episodes are below threshold', () => {
      const episodes = [
        { id: '1', compressionCost: 0.9, relevanceGain: 0.1 },
      ];
      const result = ibFilterEpisodes(episodes, 'strategy');
      expect(result).toHaveLength(0);
    });

    it('should retain all episodes when all are above threshold', () => {
      const episodes = [
        { id: '1', compressionCost: 0.1, relevanceGain: 0.9 },
        { id: '2', compressionCost: 0.05, relevanceGain: 0.95 },
      ];
      const result = ibFilterEpisodes(episodes, 'finance');
      expect(result).toHaveLength(2);
    });
  });
});
