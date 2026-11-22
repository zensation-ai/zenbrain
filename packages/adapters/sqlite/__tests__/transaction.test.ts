/**
 * `transaction()` on the adapter's one connection, with queries from elsewhere arriving while
 * the callback awaits.
 *
 * Measured on 2026-11-22 against the published 0.2.8: the adapter ran BEGIN and COMMIT by hand
 * on its one connection around the asynchronous callback. A `store()` that came while the
 * callback awaited ran inside that transaction, reported success, and was gone after the
 * callback threw; a second `transaction()` in that time failed with "cannot start a
 * transaction within a transaction". Now a query or transaction from outside waits until the
 * open transaction ends, the callback gets an adapter of its own, and a transaction inside it
 * is nested through a SAVEPOINT.
 */
import { describe, it, expect } from 'vitest';
import { MemoryCoordinator, type StorageAdapter } from '@zensation/core';
import { createMemoryAdapter } from '../src/index.js';

const insert = (adapter: StorageAdapter, id: string) =>
  adapter.query('INSERT INTO learned_facts (id, content) VALUES ($1, $2)', [id, `fact ${id}`]);
const ids = async (adapter: StorageAdapter) =>
  (await adapter.query<{ id: string }>('SELECT id FROM learned_facts ORDER BY id')).rows.map((r) => r.id);

/** A promise and the function that resolves it. */
function gate(): [Promise<void>, () => void] {
  let open!: () => void;
  const p = new Promise<void>((resolve) => (open = resolve));
  return [p, open];
}

describe('transaction() with queries from elsewhere', () => {
  it('keeps a store() from outside out of the transaction: it waits, and survives the rollback', async () => {
    const storage = createMemoryAdapter();
    const memory = new MemoryCoordinator({ storage });
    const [held, release] = gate();
    const events: string[] = [];

    const failed = (e: Error) => `failed: ${e.message}`;
    const tx = storage.transaction(async (t) => {
      await insert(t, 'in-tx');
      await held;
      events.push('callback throws');
      throw new Error('roll back');
    }).catch(failed);
    const outside = memory.store('The ferry to Laboe leaves at noon.', { type: 'fact' }).then((id) => {
      events.push('store done');
      return id;
    });
    const second = storage.transaction(async (t) => {
      await insert(t, 'second');
      events.push('second transaction');
      return 'second done';
    }).catch(failed);
    // Give the store and the second transaction every chance to run before the first one ends.
    await new Promise((r) => setTimeout(r, 20));
    release();

    expect(await tx).toBe('failed: roll back');
    const factId = await outside;
    const secondResult = await second;

    // On 0.2.8 the store reported success and its fact was rolled back with the transaction.
    const facts = await ids(storage);
    expect(facts).toContain(factId);
    expect(facts).not.toContain('in-tx');
    expect(secondResult).toBe('second done');
    expect(facts).toContain('second');
    expect(events[0]).toBe('callback throws');
    expect(events.slice(1).sort()).toEqual(['second transaction', 'store done']);
    await memory.close();
  });

  it('gives the callback an adapter of its own, whose queries run in the transaction at once', async () => {
    const storage = createMemoryAdapter();
    await storage.transaction(async (t) => {
      expect(t).not.toBe(storage);
      await insert(t, 'a');
      expect(await ids(t)).toEqual(['a']);
    });
    expect(await ids(storage)).toEqual(['a']);
    await storage.close();
  });

  it('nests a transaction through a savepoint: an inner success stays, an inner failure goes', async () => {
    const storage = createMemoryAdapter();
    await storage.transaction(async (t) => {
      await insert(t, 'a');
      await t.transaction(async (u) => {
        await insert(u, 'b');
      });
      await t.transaction(async (u) => {
        await insert(u, 'c');
        throw new Error('inner');
      }).catch(() => undefined);
      await insert(t, 'd');
    });
    expect(await ids(storage)).toEqual(['a', 'b', 'd']);

    // An outer failure takes the nested work with it.
    await storage.transaction(async (t) => {
      await t.transaction(async (u) => insert(u, 'e'));
      throw new Error('outer');
    }).catch(() => undefined);
    expect(await ids(storage)).toEqual(['a', 'b', 'd']);
    await storage.close();
  });

  it('runs two nested transactions started together one after the other', async () => {
    const storage = createMemoryAdapter();
    await storage.transaction(async (t) => {
      await Promise.all([
        t.transaction(async (u) => { await insert(u, 'x1'); await new Promise((r) => setTimeout(r, 5)); await insert(u, 'x2'); }),
        t.transaction(async (u) => { await insert(u, 'y1'); throw new Error('y fails'); }).catch(() => undefined),
      ]);
    });
    expect(await ids(storage)).toEqual(['x1', 'x2']);
    await storage.close();
  });

  it('still lets the callback use the adapter itself: those queries join the transaction instead of waiting for it', async () => {
    // Code written against 0.2.8 may call the adapter, not the callback's argument, inside the
    // callback. Waiting for the transaction there would wait forever; the query belongs to it.
    const storage = createMemoryAdapter();
    await storage.transaction(async () => {
      await insert(storage, 'joined');
      throw new Error('roll back');
    }).catch(() => undefined);
    expect(await ids(storage)).toEqual([]);

    await storage.transaction(async () => {
      await storage.transaction(async () => insert(storage, 'nested-by-the-adapter'));
    });
    expect(await ids(storage)).toEqual(['nested-by-the-adapter']);
    await storage.close();
  });

  it('lets the callback adapter be used after the transaction ended, as the adapter itself', async () => {
    const storage = createMemoryAdapter();
    let kept: StorageAdapter | undefined;
    await storage.transaction(async (t) => {
      kept = t;
    });
    await insert(kept!, 'after');
    expect(await ids(storage)).toEqual(['after']);
    await storage.close();
  });
});
