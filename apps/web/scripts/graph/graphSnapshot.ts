/**
 * Read-only snapshot of the parts of Ben's graph this ingestion touches,
 * for a precise before/after diff. Never writes.
 * Usage: bun run scripts/graph/graphSnapshot.ts [label]
 */
import { getPool, closePool } from "../classify/db";

async function main() {
  const label = process.argv[2] ?? "snapshot";
  const pool = getPool();

  const { rows } = await pool.query(`
    select
      (select count(*) from weddings) as weddings,
      (select count(*) from wedding_posts) as wedding_posts,
      (select count(*) from wedding_vendors) as wedding_vendors,
      (select count(*) from edges) as edges,
      (select count(*) from accounts) as accounts,
      (select md5(string_agg(wedding_id::text||':'||account_id::text||':'||role::text||':'||n_confirmations::text, '|' order by wedding_id, account_id, role)) from wedding_vendors) as wedding_vendors_content_hash
  `);
  console.log(`=== ${label} ===`);
  console.log(rows[0]);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
