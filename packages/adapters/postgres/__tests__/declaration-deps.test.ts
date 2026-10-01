/**
 * Published type declarations — every bare module that dist/index.d.ts imports
 * must resolve for the consumer. The driver ships no types of its own, so its
 * @types package has to be a runtime dependency, not a devDependency; otherwise
 * a consumer under --strict gets TS7016 ("implicitly has an 'any' type").
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const dts = join(root, 'dist', 'index.d.ts');

function bareImports(source: string): string[] {
  const specs = [...source.matchAll(/(?:from|import\()\s*['"]([^'"./][^'"]*)['"]/g)].map((m) => m[1]);
  return [...new Set(specs)].filter((s) => !s.startsWith('node:') && !s.startsWith('@zensation/'));
}

describe('published type declarations', () => {
  it('dist/index.d.ts exists after the build', () => {
    expect(existsSync(dts)).toBe(true);
  });

  it('imports at least one third-party module (the driver)', () => {
    expect(bareImports(readFileSync(dts, 'utf8')).length).toBeGreaterThan(0);
  });

  it('ships @types for every third-party module the declarations import', () => {
    for (const mod of bareImports(readFileSync(dts, 'utf8'))) {
      const name = mod.startsWith('@') ? mod.split('/').slice(0, 2).join('/') : mod.split('/')[0];
      const typesName = name.startsWith('@') ? `@types/${name.slice(1).replace('/', '__')}` : `@types/${name}`;
      expect(pkg.dependencies?.[name], `${name} in dependencies`).toBeTypeOf('string');
      expect(pkg.dependencies?.[typesName], `${typesName} in dependencies`).toBeTypeOf('string');
      expect(pkg.devDependencies?.[typesName], `${typesName} not (only) a devDependency`).toBeUndefined();
    }
  });
});
