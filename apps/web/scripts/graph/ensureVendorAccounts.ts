/**
 * Ensures every handle extracted by the stack parser (non-'other' roles, any
 * version) has a row in `accounts` — a pure, idempotent upsert-by-handle,
 * same as pipeline.py's `acct_id()`. `accounts` is deliberately permissive
 * by design (every IG handle we've ever seen); this asserts nothing about
 * wedding participation, just that the handle exists, so the
 * jeremy_post_vendor_evidence view's join to accounts doesn't silently drop
 * unresolved handles.
 *
 * Usage (from apps/web): bun run scripts/graph/ensureVendorAccounts.ts
 */
import { getPool, closePool } from "../classify/db";

async function main() {
  const pool = getPool();
  const { rows } = await pool.query<{ handle: string }>(
    `select distinct e.handle
     from stack_extraction_entries e
     where e.role <> 'other'
       and not exists (select 1 from accounts a where lower(a.username::text) = e.handle)`
  );
  console.log(`[ensure-accounts] ${rows.length} handles need an accounts row`);

  let created = 0;
  for (const row of rows) {
    await pool.query(
      `insert into accounts (username) values ($1) on conflict (username) do update set username = excluded.username`,
      [row.handle]
    );
    created++;
    if (created % 1000 === 0) console.log(`[ensure-accounts] ${created}/${rows.length}`);
  }
  console.log(`[ensure-accounts] DONE — ensured ${created} accounts`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
