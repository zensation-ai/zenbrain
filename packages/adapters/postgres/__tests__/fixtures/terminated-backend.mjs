// Run by real-postgres.test.ts in a process of its own, because what it checks is whether the
// process survives: an unhandled `error` event ends it. While `pg_sleep` runs, a second
// connection ends the adapter's backend with `pg_terminate_backend`, which fails the query
// with 57P01 ("terminating connection due to administrator command") and closes the
// connection, as a server restart does. Prints one line of JSON.
import pg from 'pg';
import { PostgresAdapter } from '../../dist/index.js';

const url = process.env.ZENBRAIN_TEST_PG_URL;
const admin = new pg.Client({ connectionString: url });
await admin.connect();
const warnings = [];
const adapter = new PostgresAdapter({
  connectionString: url,
  minConnections: 0,
  logger: { info() {}, warn: (msg) => warnings.push(String(msg)), error() {} },
});

/** Waits until a backend runs the query marked `marker`, then terminates it. */
async function terminate(marker) {
  for (let i = 0; i < 250; i++) {
    const { rows } = await admin.query(
      'SELECT pid FROM pg_stat_activity WHERE query LIKE $1 AND pid <> pg_backend_pid()',
      [`%${marker}%`],
    );
    if (rows.length > 0) {
      await admin.query('SELECT pg_terminate_backend($1)', [rows[0].pid]);
      return;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`no backend ran ${marker}`);
}

const settle = (p) => p.then((value) => ({ value }), (e) => ({ code: e.code, message: e.message }));
const out = {};

const query = settle(adapter.query('SELECT /* zb_terminate_query */ 1 AS one, pg_sleep(1)'));
await terminate('zb_terminate_query');
out.query = await query;

const tx = settle(adapter.transaction(async (t) => {
  await t.query('SELECT /* zb_terminate_tx */ pg_sleep(1)');
  return 'committed';
}));
await terminate('zb_terminate_tx');
out.transaction = await tx;

// Errors on the dead connections can arrive after the calls returned.
await new Promise((r) => setTimeout(r, 500));
out.afterwards = (await adapter.query('SELECT 2 AS two')).rows;
out.warnings = warnings;
await adapter.close();
await admin.end();
console.log(JSON.stringify(out));
