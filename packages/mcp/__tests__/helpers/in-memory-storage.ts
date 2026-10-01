/**
 * Test double for the MCP server tests. `InMemoryStorage` is no longer part of
 * @zensation/core's public API (it cannot round-trip content through the
 * coordinator), so the tests reach into core's source directly. Users who need
 * storage without a database server use createMemoryAdapter() from
 * @zensation/adapter-sqlite.
 */
export { InMemoryStorage } from '../../../core/src/testing.js';
