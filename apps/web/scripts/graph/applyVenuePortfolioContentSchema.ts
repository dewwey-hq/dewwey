/**
 * One-off, idempotent apply of Track C's `venue_portfolio_content` view (pipeline/schema.sql)
 * directly to Supabase. One new view, derived/read-only -- no table changes, no data written.
 * Safe to re-run: CREATE OR REPLACE VIEW.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyVenuePortfolioContentSchema.ts
 */
import { getPool, closePool } from "../classify/db";

const STATEMENTS: string[] = [
  `create or replace view venue_portfolio_content as
   with venue_posts as (
     select sp.post_url, sp.caption_raw, va.id as venue_account_id, 'own_profile' as connection
     from staging.instagram_posts sp
     join accounts va on lower(va.username::text) = lower(sp.owner_username)
     join vendors v on v.account_id = va.id
     -- D055: v.city='Chicago' is a geography claim here (this view's whole scope is "a
     -- Chicago venue's own portfolio content") -- only trust it with
     -- discovery_source='google_places' (docs/jeremy-ddl.sql defaults city to 'Chicago').
     where v.city = 'Chicago' and v.discovery_source = 'google_places' and v.category = 'venue'
     union
     select e.source_post_url as post_url, sp.caption_raw, va.id as venue_account_id, 'tagged' as connection
     from jeremy_post_vendor_evidence e
     join accounts va on va.id = e.account_id
     join vendors v on v.account_id = va.id
     join staging.instagram_posts sp on sp.post_url = e.source_post_url
     where e.role = 'venue' and v.city = 'Chicago' and v.discovery_source = 'google_places' and v.category = 'venue'
     union
     select e.source_post_url as post_url, sp.caption_raw, va.id as venue_account_id, 'tagged' as connection
     from human_confirmed_post_vendor_evidence e
     join accounts va on va.id = e.account_id
     join vendors v on v.account_id = va.id
     join staging.instagram_posts sp on sp.post_url = e.source_post_url
     where e.role = 'venue' and v.city = 'Chicago' and v.discovery_source = 'google_places' and v.category = 'venue'
   )
   select distinct on (post_url)
     post_url,
     venue_account_id,
     connection,
     (caption_raw ~ '(Mr\\.? *& *Mrs\\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\\+|and) *[A-Z][a-z]+)') as has_couple_evidence,
     exists (select 1 from wedding_posts wp join posts p on p.id = wp.post_id where p.url = venue_posts.post_url) as is_documented_wedding
   from venue_posts
   where coalesce(length(trim(caption_raw)), 0) > 15
   order by post_url, connection;`,
  `comment on view venue_portfolio_content is 'Track C (D047 follow-on): a Chicago venue''s own portfolio content, own-profile or tagged, no couple/wedding gate at all -- non-gating dimension, distinct from Layer 1 (human_confirmed_chicago_wedding_content) and the structured weddings entity. See docs/decisions.md D047.';`,
];

async function main() {
  const pool = getPool();
  for (const [i, sql] of STATEMENTS.entries()) {
    await pool.query(sql);
    console.log(`[apply-schema] statement ${i + 1}/${STATEMENTS.length} ok`);
  }
  const { rows } = await pool.query<{ n: string; documented: string; couple: string }>(
    `select count(*) as n,
            count(*) filter (where is_documented_wedding) as documented,
            count(*) filter (where has_couple_evidence) as couple
     from venue_portfolio_content`
  );
  console.log(`[apply-schema] venue_portfolio_content: ${rows[0].n} rows, ${rows[0].documented} already documented weddings, ${rows[0].couple} with couple evidence`);
  console.log("[apply-schema] done");
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
