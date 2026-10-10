/**
 * `recall.taskType` was passed through to core's `RecallOptions.taskType`, which never changed a
 * result (no store path wrote an encoding context). Both were withdrawn together. The fixture's
 * `@ts-expect-error` is unused while the option exists, so this test fails against 0.2.x.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

describe('withdrawn recall option', () => {
  it('ZenBrainMemoryOptions.recall no longer accepts taskType', () => {
    const fixture = fileURLToPath(new URL('./fixtures/withdrawn-task-type.ts', import.meta.url));
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
