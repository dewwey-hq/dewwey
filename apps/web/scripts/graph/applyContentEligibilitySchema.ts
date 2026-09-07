/**
 * One-off, idempotent apply of the "content eligibility vs. structured-
 * entity eligibility" schema addition (pipeline/schema.sql) directly to
 * Supabase. Two new views, both derived/read-only -- no table changes, no
 * data written. Safe to re-run: CREATE OR REPLACE VIEW.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyContentEligibilitySchema.ts
 */
import { getPool, closePool } from "../classify/db";

const STATEMENTS: string[] = [
  `create or replace view human_confirmed_post_geography as
   select
     gs.post_url,
     case
       when venue_signals.any_confirmed then 'CONFIRMED'
       when sp.location_tag ~* 'chicago' then 'CONFIRMED'
       when sp.caption_raw ~* 'chicago' then 'CONFIRMED'
       when venue_signals.any_not_confirmed then 'NOT_CONFIRMED'
       when sp.location_tag ~* '(new york|los angeles|miami|dallas|houston|atlanta|denver|seattle|boston|nashville|austin|san francisco|milwaukee|indianapolis|detroit|florida|california|texas|tuscany|italy|mexico|paris|london)' then 'NOT_CONFIRMED'
       when sp.caption_raw ~* '(new york|los angeles|miami|dallas|houston|atlanta|denver|seattle|boston|nashville|austin|san francisco|milwaukee|indianapolis|detroit|florida|california|texas|tuscany|italy|mexico|paris|london)' then 'NOT_CONFIRMED'
       when venue_signals.has_any_venue then 'AMBIGUOUS'
       else 'NO_SIGNAL'
     end as chicago_status
   from golden_set gs
   join staging.instagram_posts sp on sp.post_url = gs.post_url
   left join lateral (
     select
       bool_or(al.in_metro = true or v.city = 'Chicago') as any_confirmed,
       bool_or(al.in_metro = false) as any_not_confirmed,
       count(*) > 0 as has_any_venue
     from human_confirmed_post_vendor_evidence e
     left join account_locations al on al.account_id = e.account_id
     left join lateral (
       select city from vendors where account_id = e.account_id order by id limit 1
     ) v on true
     where e.source_post_url = gs.post_url and e.role = 'venue'
   ) venue_signals on true
   where gs.expected_decision = 'INCLUDE';`,
  `create or replace view human_confirmed_chicago_wedding_content as
   select gs.post_url, gs.labeled_by, gs.labeled_at, gs.source_note
   from golden_set gs
   join human_confirmed_post_geography g on g.post_url = gs.post_url
   where gs.expected_decision = 'INCLUDE' and g.chicago_status = 'CONFIRMED';`,
  `comment on view human_confirmed_post_geography is 'DERIVED: per-post Chicago relevance tri-state (+NO_SIGNAL), independent of clustering';`,
  `comment on view human_confirmed_chicago_wedding_content is 'THE PRODUCT (Layer 1): human-confirmed real wedding + confirmed Chicago relevance, nothing else required';`,
];

async function main() {
  const pool = getPool();
  for (const [i, sql] of STATEMENTS.entries()) {
    await pool.query(sql);
    console.log(`[apply-schema] statement ${i + 1}/${STATEMENTS.length} ok`);
  }
  console.log("[apply-schema] done");
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
