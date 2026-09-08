/**
 * Corrects `jeremy_wedding_candidates.venue_account_id` for candidates whose venue anchor was
 * set (under the old stack-parser v4) to a secondary, adjacent-event location instead of the
 * real venue -- see stackParser.ts's SECONDARY_EVENT_VENUE_MARKER comment and docs/decisions.md
 * D049's follow-on for the full bug writeup. Clustering's own venue_account_id write uses
 * `coalesce(venue_account_id, ...)` (never overwrites once set), so re-running clustering after
 * the parser fix does NOT retroactively fix already-formed candidates -- this script does that
 * one-time correction directly against the belief table (jeremy_wedding_candidates), which is
 * lower-risk than the weddings table since nothing has been created from these candidates yet.
 *
 * For each affected candidate, resolves the post's CURRENT (v5) role='venue' credits:
 *   - exactly 1 real venue left -> corrected directly (safe, unambiguous)
 *   - 0 real venues left (the secondary location was the ONLY venue-shaped credit) -> set to
 *     NULL, never guessed -- matches this project's "never guess a venue" principle
 *   - 2+ real venues left (a genuine ceremony+reception-style ambiguity, pre-existing and
 *     unrelated to this specific bug) -> left untouched, printed for hand review
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/fixSecondaryVenueAnchors.ts --dry-run
 *   bun run scripts/graph/fixSecondaryVenueAnchors.ts
 */
import { getPool, closePool } from "../classify/db";

const SECONDARY_MARKER = "(getting ready|rehearsal dinner|sangeet|welcome party|mehndi|haldi|bridal shower)";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();

  const { rows: affected } = await pool.query<{ candidate_id: number; old_venue: string }>(
    `with bad_accounts as (
       select distinct handle from stack_extraction_entries
       where stack_parser_version = 'stack-parser-ts-v4' and role = 'venue'
         and role_raw ~* $1
     )
     select c.id as candidate_id, a.username::text as old_venue
     from jeremy_wedding_candidates c
     join accounts a on a.id = c.venue_account_id
     where lower(a.username::text) in (select handle from bad_accounts)
     order by c.id`,
    [SECONDARY_MARKER]
  );

  let corrected = 0;
  let nulled = 0;
  let ambiguous = 0;

  for (const c of affected) {
    const { rows: realVenues } = await pool.query<{ account_id: number; username: string }>(
      `select distinct se.account_id, a.username::text as username
       from (
         select se.*, ac.id as account_id
         from stack_extraction_entries se
         join accounts ac on lower(ac.username::text) = se.handle
         where se.stack_parser_version = 'stack-parser-ts-v5' and se.role = 'venue'
       ) se
       join accounts a on a.id = se.account_id
       join jeremy_wedding_candidate_posts cp on cp.source_post_url = se.post_url
       where cp.candidate_id = $1`,
      [c.candidate_id]
    );

    if (realVenues.length === 1) {
      console.log(
        `[fix-secondary-venue] candidate=${c.candidate_id} ${c.old_venue} -> ${realVenues[0].username}`
      );
      if (!dryRun) {
        await pool.query(`update jeremy_wedding_candidates set venue_account_id = $2, updated_at = now() where id = $1`, [
          c.candidate_id,
          realVenues[0].account_id,
        ]);
      }
      corrected++;
    } else if (realVenues.length === 0) {
      console.log(`[fix-secondary-venue] candidate=${c.candidate_id} ${c.old_venue} -> NULL (no other venue credit)`);
      if (!dryRun) {
        await pool.query(`update jeremy_wedding_candidates set venue_account_id = null, updated_at = now() where id = $1`, [
          c.candidate_id,
        ]);
      }
      nulled++;
    } else {
      console.log(
        `[fix-secondary-venue] candidate=${c.candidate_id} ${c.old_venue} -> AMBIGUOUS (${realVenues
          .map((v) => v.username)
          .join(", ")}) -- left untouched, needs hand review`
      );
      ambiguous++;
    }
  }

  console.log(
    `[fix-secondary-venue] ${dryRun ? "DRY RUN — " : ""}total=${affected.length} corrected=${corrected} nulled=${nulled} ambiguous=${ambiguous}`
  );
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
