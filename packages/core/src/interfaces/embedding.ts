/**
 * Provider interface for text embeddings.
 *
 * Implement this to use OpenAI, Anthropic, local models, or any embedding service.
 */
export interface EmbeddingProvider {
  /** Generate an embedding vector for a single text. */
  embed(text: string): Promise<number[]>;

  /** Generate embeddings for multiple texts (batch). */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** Return the dimensionality of the embedding vectors. */
  dimensions(): number;
}
