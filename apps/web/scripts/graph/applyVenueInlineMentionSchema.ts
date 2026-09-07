/**
 * One-off, idempotent apply of the venue_inline_mention_post_vendor_evidence view
 * (pipeline/schema.sql, D047 follow-on, 2026-09-06) directly to Supabase. One new view,
 * derived/read-only -- no table changes, no data written. Safe to re-run: CREATE OR REPLACE.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyVenueInlineMentionSchema.ts
 */
import { getPool, closePool } from "../classify/db";

const STATEMENTS: string[] = [
  `create or replace view venue_inline_mention_post_vendor_evidence as
   with recovered_venue as (
     select distinct sp.post_url as source_post_url, va.id as account_id, 'venue' as role
     from staging.instagram_posts sp
     cross join lateral regexp_matches(sp.caption_raw, '@([a-zA-Z0-9_.]+)', 'g') as m(handle_arr)
     join accounts va on lower(va.username::text) = lower(m.handle_arr[1])
     join vendors v on v.account_id = va.id and v.city = 'Chicago' and v.category = 'venue'
     where sp.caption_raw ~* '(wedding day|.s wedding|their wedding|wedding at |wedding weekend|wedding celebration|wedding reception|wedding ceremony|congrat.*wedding|bride|groom|mr\\.? *& *mrs\\.?)'
       and not exists (select 1 from jeremy_post_vendor_evidence e where e.source_post_url = sp.post_url and e.role = 'venue')
       and not exists (select 1 from human_confirmed_post_vendor_evidence e where e.source_post_url = sp.post_url and e.role = 'venue')
       and not exists (select 1 from wedding_posts wp join posts p on p.id = wp.post_id where p.url = sp.post_url)
   )
   select source_post_url, account_id, role from recovered_venue
   union
   select e.source_post_url, e.account_id, e.role
   from jeremy_post_vendor_evidence e
   where e.source_post_url in (select source_post_url from recovered_venue);`,
  `comment on view venue_inline_mention_post_vendor_evidence is 'DERIVED: recovers the missing venue-role credit for posts where a known Chicago venue was mentioned inline rather than in a labeled "Venue:" line, unioned with the post''s own already-parsed non-venue vendor credits -- see D047 follow-on in docs/decisions.md';`,
];

async function main() {
  const pool = getPool();
  for (const [i, sql] of STATEMENTS.entries()) {
    await pool.query(sql);
    console.log(`[apply-schema] statement ${i + 1}/${STATEMENTS.length} ok`);
  }
  const { rows } = await pool.query<{ n: string; posts: string }>(
    `select count(*) as n, count(distinct source_post_url) as posts from venue_inline_mention_post_vendor_evidence`
  );
  console.log(`[apply-schema] venue_inline_mention_post_vendor_evidence: ${rows[0].n} evidence rows across ${rows[0].posts} posts`);
  console.log("[apply-schema] done");
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
