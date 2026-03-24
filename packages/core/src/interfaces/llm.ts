/**
 * Provider interface for LLM text generation.
 *
 * Used by memory layers that need LLM assistance (e.g., summarization during consolidation).
 */
export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  /** Request JSON output from the model. */
  json?: boolean;
}

export interface LLMProvider {
  /** Generate text given a system prompt and user prompt. */
  generate(system: string, prompt: string, opts?: GenerateOptions): Promise<string>;
}
