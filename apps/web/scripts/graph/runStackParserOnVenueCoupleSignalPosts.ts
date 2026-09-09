/**
 * Third leg of the "v1 data completion, venues-first" mission (D047 follow-on): stack
 * extraction for posts authored by a KNOWN Chicago venue vendor (`vendors.city='Chicago'
 * and category='venue'`, and, as of D055 2026-09-08, `discovery_source='google_places'` --
 * city defaults to 'Chicago' on every row, docs/jeremy-ddl.sql) whose caption matches an
 * explicit couple-name signal (Mr./Mrs.,
 * "Couple:", "Bride:", or "Name & Name") — regardless of V3's decision (most of this
 * population was never scored ≥12, so V3 never ran on it at all; this is deliberately NOT
 * the golden_set/human-labeled population, see runStackParserOnGoldenSet.ts for that).
 *
 * Rationale (checked live before building this): Track B's blanket "venue-authored + V3
 * INCLUDE" promotion only hit ~50-72% real-wedding precision on a 40-post hand-read sample
 * (one confirmed false positive, ~22% generic marketing). The couple-signal pattern narrows
 * this dramatically — 15/15 and then another ~14/16 hand-read fresh samples were genuinely
 * specific, real, named-couple weddings, independent of V3's own decision (many of the
 * cleanest hits were posts V3 never classified or even EXCLUDEd). A venue's own account
 * posting about a named couple's wedding is about as strong a "real wedding, real Chicago
 * location" prior as this corpus has.
 *
 * Same append-only stack_extraction_runs/stack_extraction_entries tables as
 * runStackParserOnGoldenSet.ts/runStackParserBaseline.ts -- no schema change. `decision`
 * recorded as 'VENUE_COUPLE_SIGNAL_INCLUDE' (free text, no CHECK constraint) so these rows
 * stay distinguishable from V3's and golden_set's own provenance.
 *
 * Idempotent: only selects posts with zero existing stack_extraction_runs row for this
 * parser version (checking _runs, not _entries -- same has_stack=false trap documented in
 * runStackParserOnGoldenSet.ts).
 *
 * Usage (from apps/web): bun run scripts/graph/runStackParserOnVenueCoupleSignalPosts.ts
 */
import { getPool, closePool } from "../classify/db";
import { parseCaption, STACK_PARSER_VERSION } from "./stackParser";

// Same shape as reportVendorPageContentCorpus.ts's COUPLE_PATTERNS -- kept as its own copy
// here (not a shared import) since this repo's convention elsewhere (PHASE1/PHASE2_ACCOUNT_IDS
// etc.) is small per-script copies over a shared module for scoping arrays like this.
const COUPLE_SIGNAL_SQL = String.raw`(Mr\.? *& *Mrs\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\+|and) *[A-Z][a-z]+)`;

async function main() {
  const pool = getPool();
  const { rows } = await pool.query<{ post_url: string; caption_raw: string | null }>(
    `select sp.post_url, sp.caption_raw
     from staging.instagram_posts sp
     join accounts a on lower(a.username::text) = lower(sp.owner_username)
     join vendors v on v.account_id = a.id
     left join golden_set gs on gs.post_url = sp.post_url
     -- D055 (2026-09-08): vendors.city defaults to 'Chicago' on every row (docs/jeremy-ddl.sql)
     -- -- only trust it as "known Chicago venue" evidence when discovery_source='google_places'.
     where v.city = 'Chicago' and v.discovery_source = 'google_places' and v.category = 'venue'
       and sp.caption_raw ~ $2
       and gs.post_url is null
       and not exists (
         select 1 from stack_extraction_runs sr
         where sr.post_url = sp.post_url and sr.stack_parser_version = $1
       )`,
    [STACK_PARSER_VERSION, COUPLE_SIGNAL_SQL]
  );
  console.log(`[stack-venue-couple-signal] version=${STACK_PARSER_VERSION} posts=${rows.length}`);

  let processed = 0;
  let withStack = 0;
  for (const row of rows) {
    const { stack, has_stack } = parseCaption(row.caption_raw);
    const distinctRoles = new Set(stack.map((s) => s.role)).size;
    if (has_stack) withStack++;

    await pool.query(
      `insert into stack_extraction_runs
         (post_url, stack_parser_version, decision, candidate_score, has_stack, distinct_role_count, entry_count)
       values ($1,$2,'VENUE_COUPLE_SIGNAL_INCLUDE',null,$3,$4,$5)
       on conflict (post_url, stack_parser_version) do update set
         decision = excluded.decision, has_stack = excluded.has_stack,
         distinct_role_count = excluded.distinct_role_count, entry_count = excluded.entry_count,
         extracted_at = now()`,
      [row.post_url, STACK_PARSER_VERSION, has_stack, distinctRoles, stack.length]
    );

    await pool.query(`delete from stack_extraction_entries where post_url=$1 and stack_parser_version=$2`, [
      row.post_url,
      STACK_PARSER_VERSION,
    ]);
    for (const e of stack) {
      await pool.query(
        `insert into stack_extraction_entries (post_url, stack_parser_version, role_raw, role, handle, line_no)
         values ($1,$2,$3,$4,$5,$6)`,
        [row.post_url, STACK_PARSER_VERSION, e.role_raw, e.role, e.handle, e.line_no]
      );
    }
    processed++;
    if (processed % 200 === 0) console.log(`[stack-venue-couple-signal] ${processed}/${rows.length}`);
  }

  console.log(`[stack-venue-couple-signal] DONE -- processed ${processed} posts, ${withStack} had a parseable credit stack`);
  await closePool();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
