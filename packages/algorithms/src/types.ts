/**
 * Shared types for @zenbrain/algorithms
 *
 * @packageDocumentation
 * @module @zenbrain/algorithms/types
 */

/**
 * Minimal logger interface. Pass your own logger (e.g. winston, pino, console)
 * or use the default no-op logger for zero-dependency operation.
 */
export interface Logger {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
}

/** Default no-op logger — all methods are undefined, so optional chaining skips them. */
export const noopLogger: Logger = {};
