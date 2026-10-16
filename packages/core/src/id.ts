/**
 * A random UUID from the platform's Web Crypto API. Node 22 and newer (the
 * engines floor), current browsers, Deno, Bun and edge runtimes all provide it.
 * There is deliberately no Math.random fallback: an id must not be predictable.
 */
export function randomId(): string {
  return globalThis.crypto.randomUUID();
}
