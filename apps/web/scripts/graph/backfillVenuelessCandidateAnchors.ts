/**
 * Backfill step for the venue-less Jeremy candidates mission
 * (docs/engineering/graph-strengthening/venueless-candidates.md). Applies the same
 * confident-match logic as matchVenuelessLocationTags.ts (sizing/read-only sibling —
 * kept as a separate, self-contained script per this repo's established convention,
 * e.g. applyJeremyEvidenceToGraph.ts vs its own sizing predecessors) but actually writes:
 * `jeremy_wedding_candidates.venue_account_id`.
 *
 * Safety properties (same bar as D023/D030 — applyJeremyEvidenceToGraph.ts /
 * applyAmbiguousEvidenceToGraph.ts):
 * - Scope: only the 131 candidates hand-verified in matchVenuelessLocationTags.ts's
 *   output (exact name match to vendors.name/accounts.full_name, matched account already
 *   carries a `venue` role, single distinct account only — ambiguous/no-role matches are
 *   never touched).
 * - Additive/surgical: `UPDATE ... WHERE venue_account_id IS NULL` — never overwrites an
 *   existing anchor. Naturally idempotent: a second run finds venue_account_id already set
 *   for these candidates and updates 0 rows.
 * - This script ONLY sets the venue anchor. It does not touch `wedding_vendors`,
 *   `jeremy_wedding_candidate_reconciliation`, or run any reconciliation logic itself —
 *   that's `runJeremyWeddingReconciliation.ts`'s job, run separately afterward against
 *   just this newly-anchored subset.
 * - Whole-run transaction; `--dry-run` rolls back at the end, same code path.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/backfillVenuelessCandidateAnchors.ts --dry-run
 *   bun run scripts/graph/backfillVenuelessCandidateAnchors.ts
 */
import { getPool, closePool } from "../classify/db";

const GENERIC_PLACEHOLDER = /^[A-Za-z ]+,\s*(Illinois|IL)$/i;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const { rows: tagged } = await client.query<{
      candidate_id: number;
      location_tags: string[];
    }>(
      `select cp.candidate_id::int,
              array_agg(distinct ip.location_tag) as location_tags
       from jeremy_wedding_candidate_posts cp
       join jeremy_wedding_candidates c on c.id = cp.candidate_id and c.venue_account_id is null
       join staging.instagram_posts ip on ip.post_url = cp.source_post_url
       where ip.location_tag is not null and ip.location_tag <> ''
       group by cp.candidate_id`
    );

    let attempted = 0;
    let updated = 0;
    const applied: { candidateId: number; tag: string; accountId: number; username: string }[] = [];

    for (const row of tagged) {
      if (row.location_tags.length > 1) continue;
      const tag = row.location_tags[0];
      if (GENERIC_PLACEHOLDER.test(tag.trim()) || tag.trim().toLowerCase() === "private location") continue;

      const { rows: matches } = await client.query<{ account_id: number; username: string; has_venue_role: boolean }>(
        `select distinct a.id as account_id, a.username::text as username,
                exists(select 1 from account_tags at2 where at2.account_id = a.id and at2.role = 'venue') as has_venue_role
         from accounts a
         where a.id in (
           select ve.account_id from vendors ve where lower(ve.name) = lower($1) and ve.account_id is not null
           union
           select ac.id from accounts ac where lower(ac.full_name) = lower($1)
         )`,
        [tag]
      );

      const venueMatches = matches.filter((m) => m.has_venue_role);
      const distinctAccountIds = [...new Set(venueMatches.map((m) => m.account_id))];
      if (distinctAccountIds.length !== 1) continue;

      attempted++;
      const accountId = distinctAccountIds[0];
      const { rows: updatedRows } = await client.query(
        `update jeremy_wedding_candidates
         set venue_account_id = $1, updated_at = now()
         where id = $2 and venue_account_id is null
         returning id`,
        [accountId, row.candidate_id]
      );
      if (updatedRows.length > 0) {
        updated++;
        applied.push({ candidateId: row.candidate_id, tag, accountId, username: venueMatches[0].username });
      }
    }

    console.log(`[backfill-venueless] ${dryRun ? "DRY RUN — " : ""}attempted=${attempted} updated=${updated}`);
    for (const a of applied) {
      console.log(`  candidate=${a.candidateId} tag="${a.tag}" -> @${a.username} (account ${a.accountId})`);
    }

    if (dryRun) {
      await client.query("rollback");
      console.log("[backfill-venueless] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("[backfill-venueless] COMMITTED");
    }
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
