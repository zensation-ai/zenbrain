import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'interfaces/index': 'src/interfaces/index.ts',
    'layers/working': 'src/layers/working.ts',
    'layers/short-term': 'src/layers/short-term.ts',
    'layers/episodic': 'src/layers/episodic.ts',
    'layers/semantic': 'src/layers/semantic.ts',
    'layers/procedural': 'src/layers/procedural.ts',
    'layers/core': 'src/layers/core.ts',
    'layers/cross-context': 'src/layers/cross-context.ts',
    'layers/index': 'src/layers/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  clean: true,
  sourcemap: true,
  external: ['@zensation/algorithms'],
});
