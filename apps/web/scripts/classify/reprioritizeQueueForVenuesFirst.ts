/**
 * Reprioritizes the remaining, not-yet-labeled portion of the `/label` v2 queue so continued
 * labeling directly serves the "v1 data completion, venues-first" mission (D047,
 * docs/decisions.md) — a human WEDDING label on a venue-authored post feeds straight into the
 * human-confirmed-evidence pipeline (already built: human_confirmed_post_vendor_evidence ->
 * clustering --evidence-source human_confirmed -> reconciliation -> creation), which can then
 * grow that venue's documented-wedding count exactly like Track A's WebSearch batches do.
 *
 * Moves venue-authored, not-yet-labeled posts to the very front of the queue (negative ranks,
 * below the existing 1..2081 range, so relative order of everything else is untouched), ordered
 * so venues with the FEWEST existing documented weddings come first — maximizes the chance a
 * label creates value at a venue with little or no `weddings` coverage yet, rather than adding
 * more evidence to an already well-documented venue.
 *
 * Pure reordering: no rows added/removed, no bucket/source changed, nothing already labeled is
 * touched (getQueueBatch already excludes those). Reversible by re-running buildLabelingQueue.ts
 * fresh if ever wanted back to the original stratified order.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/reprioritizeQueueForVenuesFirst.ts --dry-run
 *   bun run scripts/classify/reprioritizeQueueForVenuesFirst.ts
 */
import { getPool, closePool } from "../classify/db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();

  const { rows } = await pool.query<{ post_url: string; n_weddings: string }>(`
    select lq.post_url,
      coalesce((select count(*) from wedding_vendors wv where wv.account_id = a.id), 0) as n_weddings
    from label_queue lq
    join staging.instagram_posts sp on sp.post_url = lq.post_url
    join accounts a on lower(a.username::text) = lower(sp.owner_username)
    join vendors v on v.account_id = a.id
    -- D055 (2026-09-08): vendors.city defaults to 'Chicago' on every row (docs/jeremy-ddl.sql)
    -- -- only trust it as "known Chicago venue" evidence when discovery_source='google_places'.
    where lq.queue_version = 'v2' and v.city = 'Chicago' and v.discovery_source = 'google_places' and v.category = 'venue'
      and not exists (
        select 1 from human_post_labels hpl where hpl.post_url = lq.post_url and hpl.labeled_by = 'jeremy'
      )
    order by n_weddings asc, lq.post_url asc
  `);
  console.log(`[reprioritize] ${dryRun ? "DRY RUN — " : ""}venue-authored, unlabeled posts to move to front: ${rows.length}`);

  if (dryRun) {
    console.log(`[reprioritize] sample (first 10): ${rows.slice(0, 10).map((r) => `${r.post_url} (${r.n_weddings} existing)`).join(", ")}`);
    await closePool();
    return;
  }

  let updated = 0;
  for (let i = 0; i < rows.length; i++) {
    await pool.query(`update label_queue set rank = $2 where post_url = $1 and queue_version = 'v2'`, [
      rows[i].post_url,
      -(rows.length - i), // most-underserved venue gets the lowest (most negative) rank -> first
    ]);
    updated++;
  }
  console.log(`[reprioritize] updated ${updated} ranks`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
