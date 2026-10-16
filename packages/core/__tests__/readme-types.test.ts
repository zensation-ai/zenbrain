/**
 * README code has to compile as written. The fixture holds the lines a reader copies;
 * this test compiles it strictly and expects no diagnostics.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

describe('README code compiles', () => {
  it('forget(results[0].id, results[0].layer) type-checks', () => {
    const fixture = fileURLToPath(new URL('./fixtures/readme-forget.ts', import.meta.url));
    const program = ts.createProgram([fixture], {
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file?.fileName === fixture)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    expect(diagnostics).toEqual([]);
  });
});
