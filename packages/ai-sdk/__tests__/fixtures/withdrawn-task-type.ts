// Type fixture, compiled by withdrawn-task-type.test.ts. Not imported at runtime.
import type { ZenBrainMemoryOptions } from '../../src/index';

// @ts-expect-error recall.taskType was withdrawn in 0.3.0 together with core's includeContext
export const withTaskType: ZenBrainMemoryOptions['recall'] = { taskType: 'coding' };

export const stillValid: ZenBrainMemoryOptions['recall'] = { limit: 5, layers: ['semantic'], minConfidence: 0.5 };
