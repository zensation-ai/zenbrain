// What the page's quick start set up: the coordinator and the imports.
declare const coordinator: import('@zensation/core').MemoryCoordinator;
declare const zenbrainMemory: typeof import('@zensation/ai-sdk').zenbrainMemory;
declare const streamText: typeof import('ai').streamText;
declare const wrapLanguageModel: typeof import('ai').wrapLanguageModel;
declare const openai: typeof import('@ai-sdk/openai').openai;
