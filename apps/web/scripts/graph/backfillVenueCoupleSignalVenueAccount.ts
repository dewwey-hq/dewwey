/**
 * Backfills `venue_account_id` for `venue-couple-signal-v1` candidates that clustering left
 * null. Cause: runJeremyWeddingClustering.ts only resolves venue_account_id from an explicit
 * "Venue:"-style TAGGED credit in the stack -- but this evidence source's whole population is
 * posts authored by an already-known Chicago venue vendor (that's the population definition,
 * venue_couple_signal_post_vendor_evidence's own WHERE clause). A venue posting about its own
 * event often never re-credits itself by handle in the caption (it's implicit), so the tagged-
 * credit-only check misses it -- same root cause as D046's author-is-vendor finding, here
 * applied to venue resolution instead of vendor-association.
 *
 * Safe because: every affected candidate's attached post(s) share exactly ONE distinct author
 * account (verified live before writing this script -- 0 candidates had 2+ authors), and that
 * author is a known Chicago venue vendor by construction of the evidence view. Not a guess --
 * using data already established for this evidence source's own scope.
 *
 * Additive-only in effect (an UPDATE, not an insert, but only ever fills a NULL -- never
 * overwrites a resolved venue_account_id). `--dry-run` reports the count without writing.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/backfillVenueCoupleSignalVenueAccount.ts --dry-run
 *   bun run scripts/graph/backfillVenueCoupleSignalVenueAccount.ts
 */
import { getPool, closePool } from "../classify/db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();

  const { rows: candidates } = await pool.query<{ id: number; author_account_id: number }>(`
    select c.id, min(a.id)::int as author_account_id
    from jeremy_wedding_candidates c
    join jeremy_wedding_candidate_posts cp on cp.candidate_id = c.id
    join staging.instagram_posts sp on sp.post_url = cp.source_post_url
    join accounts a on lower(a.username::text) = lower(sp.owner_username)
    where c.clustering_version = 'venue-couple-signal-v1' and c.venue_account_id is null
    group by c.id
    having count(distinct a.id) = 1
  `);
  console.log(`[backfill-venue-account] ${dryRun ? "DRY RUN — " : ""}candidates to backfill: ${candidates.length}`);

  if (dryRun) {
    await closePool();
    return;
  }

  let updated = 0;
  for (const c of candidates) {
    await pool.query(`update jeremy_wedding_candidates set venue_account_id = $2 where id = $1 and venue_account_id is null`, [
      c.id,
      c.author_account_id,
    ]);
    updated++;
  }
  console.log(`[backfill-venue-account] updated ${updated} candidates`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
