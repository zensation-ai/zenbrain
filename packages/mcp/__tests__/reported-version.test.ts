/**
 * What the server tells a client it is.
 *
 * Measured on 0.1.4: every client saw `@zensation/mcp 0.1.0`. `createZenBrainServer`
 * carried a written-out fallback of `'0.1.0'`, and `index.ts` — the real entry
 * point — calls it with no options at all, so the fallback was what shipped. It
 * had been wrong for four releases.
 *
 * The existing protocol tests did not catch it and could not: they construct the
 * server with `{ version: '0.1.0-test' }` and therefore never exercise the
 * default. This file drives the path `index.ts` actually takes — no options —
 * and compares against the manifest rather than against a second written-out
 * literal, which would only move the staleness one file over.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  MemoryCoordinator,
  InMemoryStorage,
  FakeEmbeddingProvider,
  InMemoryCache,
} from '@zensation/core';
import { createZenBrainServer } from '../src/server.js';

const manifest = createRequire(import.meta.url)('../package.json') as {
  name: string;
  version: string;
};

let client: Client;
let coordinator: MemoryCoordinator;

beforeEach(async () => {
  coordinator = new MemoryCoordinator({
    storage: new InMemoryStorage(),
    embedding: new FakeEmbeddingProvider(),
    cache: new InMemoryCache(),
  });
  // No options — exactly what `index.ts` does.
  const server = createZenBrainServer(coordinator);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'version-test', version: '1.0.0' });
  await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
});

afterEach(async () => {
  await client.close();
  await coordinator.close();
});

describe('the version the server reports', () => {
  it('is the package version, not a written-out literal', () => {
    expect(client.getServerVersion()?.version).toBe(manifest.version);
  });

  it('is not the stale 0.1.0 that shipped for four releases', () => {
    // Guards the specific regression rather than only the general rule: if the
    // manifest ever goes back to 0.1.0 the test above would pass while the bug
    // is back.
    expect(manifest.version).not.toBe('0.1.0');
    expect(client.getServerVersion()?.version).not.toBe('0.1.0');
  });

  it('reports the package name too', () => {
    expect(client.getServerVersion()?.name).toBe(manifest.name);
  });
});
