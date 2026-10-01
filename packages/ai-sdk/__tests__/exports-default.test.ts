/**
 * ESM-only package: every exports entry carries a `default` condition next to
 * `import` (N19). Without it, require() fails with ERR_PACKAGE_PATH_NOT_EXPORTED,
 * which reads as a broken package. With it, Node 22.12+ loads the ESM build via
 * require(esm), and older Node versions report the clear ERR_REQUIRE_ESM.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

describe('package exports map', () => {
  it.each(Object.entries(pkg.exports as Record<string, Record<string, string>>))(
    '%s: default points at the same ESM file as import',
    (_name, entry) => {
      expect(entry.import).toMatch(/\.js$/);
      expect(entry.default).toBe(entry.import);
    },
  );
});
