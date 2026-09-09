/**
 * Coverage-gap Track 2.2 (D050 follow-on, 2026-09-07): bridges `vendors.account_id` for known
 * Chicago venue rows that already have a Google-Places-sourced `instagram_handle` but were never
 * linked to an `accounts` row -- 101 of the 147 zero-coverage venues have a handle on file at
 * all; of those, this script only touches the subset (53, sized live) where an `accounts` row
 * with that EXACT handle already exists (case-insensitive). Same `account_matched_by =
 * 'handle_exact'` convention as the original D006 merge-time bridge -- an exact-string match on
 * data captured independently at Places-scrape time, the same trust level already used for the
 * other 1,896 handle-exact matches in this table, not a new/weaker heuristic.
 *
 * Purely additive: only ever sets `vendors.account_id`/`account_matched_by` where both are
 * currently NULL -- never overwrites an existing link, never touches `accounts` or any graph
 * table. Does not itself create any wedding; it only makes these venues visible as venues (real
 * address/rating/photos on /vendors) and eligible for the SAME candidate/reconciliation pipeline
 * every other venue already goes through.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/bridgeUnmatchedVenueAccounts.ts --dry-run
 *   bun run scripts/graph/bridgeUnmatchedVenueAccounts.ts
 */
import { getPool, closePool } from "../classify/db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();

  // D055 (2026-09-08): vendors.city defaults to 'Chicago' on every row (docs/jeremy-ddl.sql)
  // -- only trust it as "known Chicago venue" evidence when discovery_source='google_places'.
  const { rows } = await pool.query<{ vendor_id: number; name: string; handle: string; account_id: number }>(
    `select v.id as vendor_id, v.name, v.instagram_handle::text as handle, a.id as account_id
     from vendors v
     join accounts a on lower(a.username::text) = lower(v.instagram_handle::text)
     where v.category = 'venue' and v.city = 'Chicago' and v.discovery_source = 'google_places'
       and v.account_id is null and v.instagram_handle is not null`
  );

  console.log(`[bridge-venue-accounts] ${dryRun ? "DRY RUN — " : ""}found ${rows.length} exact-handle matches`);
  for (const r of rows) {
    console.log(`[bridge-venue-accounts] vendor=${r.vendor_id} (${r.name}) -> account=${r.account_id} (@${r.handle})`);
    if (!dryRun) {
      await pool.query(`update vendors set account_id = $2, account_matched_by = 'handle_exact', updated_at = now() where id = $1`, [
        r.vendor_id,
        r.account_id,
      ]);
    }
  }
  console.log(`[bridge-venue-accounts] ${dryRun ? "DRY RUN — " : ""}total bridged=${rows.length}`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
