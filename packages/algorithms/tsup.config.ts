import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    fsrs: 'src/fsrs.ts',
    ebbinghaus: 'src/ebbinghaus.ts',
    emotional: 'src/emotional.ts',
    'context-retrieval': 'src/context-retrieval.ts',
    hebbian: 'src/hebbian.ts',
    bayesian: 'src/bayesian.ts',
    similarity: 'src/similarity.ts',
    intervals: 'src/intervals.ts',
    visualization: 'src/visualization.ts',
    'sleep-consolidation': 'src/sleep-consolidation.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  clean: true,
  sourcemap: true,
});
