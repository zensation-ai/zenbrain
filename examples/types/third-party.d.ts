// Stand-ins for the third-party SDKs three examples import, so CI can type-check every example
// without installing LangChain, LlamaIndex or Mastra (`npx tsc -p examples`).
//
// They declare only the members the examples use, shaped the way the examples use them. They check
// the examples' calls into @zensation/*; they do not check the third-party APIs, and they are not a
// description of those SDKs. Install the real package before running an example that needs it.

declare module '@langchain/core/messages' {
  export class SystemMessage { constructor(content: string); }
  export class HumanMessage { constructor(content: string); }
  export class AIMessage { constructor(content: string); }
}

declare module '@llamaindex/core/memory' {
  export function staticBlock(options: { content: string }): unknown;
}

declare module '@mastra/core/agent' {
  export interface MastraMessageV2 {
    role: string;
    content?: { parts?: Array<{ type: string; text?: string }> };
  }
}

declare module '@mastra/core/processors' {
  import type { MastraMessageV2 } from '@mastra/core/agent';
  export interface Processor {
    readonly name: string;
    processInput?(args: { messages: MastraMessageV2[] }): Promise<MastraMessageV2[]>;
  }
}
