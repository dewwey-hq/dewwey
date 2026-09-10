/**
 * One-off, idempotent apply of the extracted_venue_anchors table (pipeline/schema.sql, D055
 * "squeeze the 47k" venue-discovery reader downstream) directly to Supabase.
 *
 * extracted_venue_anchors is a FIFTH venue-anchor source for structural_post_vendor_evidence,
 * populated by resolveDiscoveredVenues.ts from the Haiku pool-b reader's venue attribution
 * (post_extraction_runs, prompt_version 'extract-v1.2', candidate_id null -- posts that had NO
 * structural venue anchor at all). One row per post_url (its own venue verdict), so applying
 * this table adds capacity to the view rather than re-deciding it: a post here NEVER overrides
 * an existing credit_line/author/location_tag/inline_at/venue_hashtag anchor -- see
 * applyStructuralEvidenceSchema.ts's updated view SQL, which only reaches this CTE for posts the
 * other four missed (same "priority union" pattern the view already uses).
 *
 * Run this BEFORE applying the view change in applyStructuralEvidenceSchema.ts -- the view's
 * `extracted_venue` CTE joins this table, so it must exist first (`create or replace view`
 * against a table that doesn't exist yet fails outright, not silently).
 *
 * `create table if not exists` makes a rerun a no-op, same idempotency bar as every other apply
 * script in this directory.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyExtractedVenueAnchorSchema.ts              # same as --dry-run
 *   bun run scripts/graph/applyExtractedVenueAnchorSchema.ts --dry-run    # prints SQL, no write
 *   bun run scripts/graph/applyExtractedVenueAnchorSchema.ts --apply      # actually runs it
 */
import { getPool, closePool } from "../classify/db";

const STATEMENTS: string[] = [
  `create table if not exists extracted_venue_anchors (
     post_url         text primary key,
     venue_account_id bigint not null references accounts(id),
     source           text not null default 'extract-v1.2',
     confidence       real,
     venue_name_raw   text,
     resolved_by      text not null,
     resolved_at      timestamptz default now()
   );`,
  `comment on table extracted_venue_anchors is 'D055 venue-discovery reader downstream: one row per post_url the Haiku pool-b reader (extract-v1.2, posts with no structural anchor) resolved a venue for -- written by resolveDiscoveredVenues.ts. resolved_by is "handle" (venue_handle_guess resolved to an existing account, sanity-checked against the caption) or "name" (venue_name normalized-matched an existing venue unambiguously). Feeds structural_post_vendor_evidence as its 5th, lowest-priority venue_anchor_source ("extracted") -- see applyStructuralEvidenceSchema.ts. See docs/decisions.md.';`,
  `create index if not exists idx_extracted_venue_anchors_account on extracted_venue_anchors(venue_account_id);`,
];

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = getPool();

  if (!apply) {
    console.log(`[apply-extracted-venue-anchor] DRY RUN (pass --apply to execute) -- ${STATEMENTS.length} statement(s):\n`);
    for (const [i, sql] of STATEMENTS.entries()) {
      console.log(`-- statement ${i + 1}/${STATEMENTS.length}\n${sql}\n`);
    }
    await closePool();
    return;
  }

  for (const [i, sql] of STATEMENTS.entries()) {
    await pool.query(sql);
    console.log(`[apply-extracted-venue-anchor] statement ${i + 1}/${STATEMENTS.length} ok`);
  }
  const { rows } = await pool.query<{ n: string }>(`select count(*) as n from extracted_venue_anchors`);
  console.log(`[apply-extracted-venue-anchor] extracted_venue_anchors: ${rows[0].n} rows`);
  console.log("[apply-extracted-venue-anchor] done");
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
