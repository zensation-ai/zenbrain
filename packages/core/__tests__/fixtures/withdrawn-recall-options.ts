// Type fixture, compiled by withdrawn-options.test.ts. Not imported at runtime.
import type { RecallOptions } from '../../src/index';

// @ts-expect-error includeContext was withdrawn in 0.5.0: no store path ever wrote an encoding context
export const withContext: RecallOptions = { includeContext: true };

// @ts-expect-error taskType was withdrawn together with includeContext
export const withTaskType: RecallOptions = { taskType: 'coding' };

export const stillValid: RecallOptions = { layers: ['semantic'], limit: 5, minConfidence: 0.5 };
