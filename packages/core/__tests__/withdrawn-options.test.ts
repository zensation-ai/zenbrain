/**
 * `RecallOptions.includeContext` and `taskType` promised a context-dependent boost, but no
 * store path ever wrote an encoding context and no layer returned one, so the options could
 * never change a result. They were withdrawn in 0.5.0 (the MCP tool dropped them in 0.4.9).
 *
 * The fixture marks both with `@ts-expect-error`. While the options exist the directives
 * are unused, which TypeScript reports as an error, so this test fails against 0.4.x.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

describe('withdrawn recall options', () => {
  it('RecallOptions no longer accepts includeContext or taskType', () => {
    const fixture = fileURLToPath(new URL('./fixtures/withdrawn-recall-options.ts', import.meta.url));
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
