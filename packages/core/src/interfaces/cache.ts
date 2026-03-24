/**
 * Provider interface for key-value caching.
 *
 * Implement this with Redis, in-memory Map, or any cache backend.
 * All methods are optional — layers degrade gracefully without a cache.
 */
export interface CacheProvider {
  /** Get a cached value by key. Returns null if not found or expired. */
  get<T = unknown>(key: string): Promise<T | null>;

  /** Set a value with optional TTL in seconds. */
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;

  /** Delete a cached key. */
  del(key: string): Promise<void>;
}
