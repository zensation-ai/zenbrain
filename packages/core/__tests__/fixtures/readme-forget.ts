// Type fixture, compiled by readme-types.test.ts. Not imported at runtime.
import type { MemoryCoordinator } from '../../src/index';

// The README quick start forgets a recall result by its own id and layer. Up to 0.5.1
// RecallResult.layer was a plain string, so this line did not compile (TS2345).
export async function forgetFirst(memory: MemoryCoordinator): Promise<boolean> {
  const results = await memory.recall('What does the user prefer?');
  return memory.forget(results[0].id, results[0].layer);
}
