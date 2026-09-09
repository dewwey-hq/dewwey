/**
 * One-off, idempotent apply of the venue_couple_signal_post_vendor_evidence view
 * (pipeline/schema.sql, D047 follow-on, 2026-09-06) directly to Supabase. Written now (D055,
 * 2026-09-08) because no apply script existed for this view before -- it was applied ad hoc
 * when introduced -- and this fix (see below) needs a repeatable, idempotent path like every
 * sibling view in this directory. One view, derived/read-only -- no table changes, no data
 * written. Safe to re-run: CREATE OR REPLACE VIEW.
 *
 * D055 fix: `v.city = 'Chicago'` narrowed to also require `v.discovery_source =
 * 'google_places'` -- vendors.city defaults to 'Chicago' on every row (docs/jeremy-ddl.sql),
 * so an un-verified mention/hashtag-discovered vendor row was silently passing this "known
 * Chicago venue" gate on the schema default alone. See docs/decisions.md D055.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyVenueCoupleSignalSchema.ts
 */
import { getPool, closePool } from "../classify/db";

const STATEMENTS: string[] = [
  `create or replace view venue_couple_signal_post_vendor_evidence as
   select
     latest.source_post_url,
     a.id as account_id,
     latest.role,
     latest.role_raw,
     latest.line_no,
     latest.parser_version
   from (
     select distinct on (post_url, line_no, handle)
       post_url as source_post_url, line_no, handle, role, role_raw, stack_parser_version as parser_version
     from stack_extraction_entries
     where stack_parser_version = (select max(stack_parser_version) from stack_extraction_runs)
     order by post_url, line_no, handle, extracted_at desc
   ) latest
   join accounts a on lower(a.username::text) = latest.handle
   where latest.role <> 'other'
     and exists (
       select 1
       from staging.instagram_posts sp
       join accounts va on lower(va.username::text) = lower(sp.owner_username)
       join vendors v on v.account_id = va.id
       where sp.post_url = latest.source_post_url
         and v.city = 'Chicago' and v.discovery_source = 'google_places' and v.category = 'venue'
         and sp.caption_raw ~ '(Mr\\.? *& *Mrs\\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\\+|and) *[A-Z][a-z]+)'
         and not exists (select 1 from golden_set gs where gs.post_url = sp.post_url)
     );`,
  `comment on view venue_couple_signal_post_vendor_evidence is 'DERIVED: vendor evidence for venue-authored, couple-signal-matched posts (V3-independent) -- see D047 follow-on in docs/decisions.md. D055 (2026-09-08): city=''Chicago'' only trusted with discovery_source=''google_places''.';`,
];

async function main() {
  const pool = getPool();
  for (const [i, sql] of STATEMENTS.entries()) {
    await pool.query(sql);
    console.log(`[apply-schema] statement ${i + 1}/${STATEMENTS.length} ok`);
  }
  const { rows } = await pool.query<{ n: string; posts: string }>(
    `select count(*) as n, count(distinct source_post_url) as posts from venue_couple_signal_post_vendor_evidence`
  );
  console.log(`[apply-schema] venue_couple_signal_post_vendor_evidence: ${rows[0].n} evidence rows across ${rows[0].posts} posts`);
  console.log("[apply-schema] done");
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
