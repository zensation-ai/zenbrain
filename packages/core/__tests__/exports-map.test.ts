/**
 * Package exports map — each entry must point require() at the CommonJS type
 * declarations (.d.cts) and import at the ESM ones (.d.ts). A single top-level
 * "types" condition sends CommonJS consumers under moduleResolution node16 to the
 * ESM declarations (TS1479, "FalseESM" in @arethetypeswrong/cli).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const entries = Object.entries(pkg.exports as Record<string, any>);

describe('package exports map', () => {
  it('has at least one entry', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)('%s: import → .d.ts + .js, require → .d.cts + .cjs', (_name, entry) => {
    expect(entry.import?.types).toMatch(/\.d\.ts$/);
    expect(entry.import?.default).toMatch(/\.js$/);
    expect(entry.require?.types).toMatch(/\.d\.cts$/);
    expect(entry.require?.default).toMatch(/\.cjs$/);
  });

  it.each(entries)('%s: every referenced file exists after the build', (_name, entry) => {
    for (const cond of ['import', 'require'] as const) {
      for (const field of ['types', 'default'] as const) {
        const file = entry[cond]?.[field];
        expect(file, `${cond}.${field}`).toBeTypeOf('string');
        expect(existsSync(join(root, file)), `${cond}.${field} → ${file}`).toBe(true);
      }
    }
  });
});
