/**
 * One-off, idempotent apply of the styled-shoot-vs-real-wedding signal
 * schema addition (pipeline/schema.sql, D049) directly to Supabase. Two new
 * views, both derived/read-only -- no table changes, no data written. Safe
 * to re-run: CREATE OR REPLACE VIEW.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyStyledShootSchema.ts
 */
import { getPool, closePool } from "../classify/db";

const STATEMENTS: string[] = [
  `create or replace view post_styled_shoot_signal as
   with post_universe as (
     select sp.post_url, sp.caption_raw as caption, lower(sp.owner_username) as author_username
     from staging.instagram_posts sp
     union
     select p.url as post_url, p.caption, lower(a.username::text) as author_username
     from posts p
     left join accounts a on a.id = p.owner_id
   ),
   scored as (
     select post_url, max(caption) as caption, max(author_username) as author_username
     from post_universe
     group by post_url
   ),
   golden_styled as (
     select post_url from golden_set
     where expected_decision = 'EXCLUDE'
       and (exclusion_reason = 'styled_or_editorial' or notes ~* 'styl' or exclusion_reason ~* 'styl')
   ),
   golden_styled_authors as (
     select s.author_username, count(*) as n_styled_posts
     from golden_styled gsty
     join scored s on s.post_url = gsty.post_url
     where s.author_username is not null
     group by s.author_username
     having count(*) >= 2
   ),
   known_network_accounts (username) as (
     values ('styledshootsacrossamerica'), ('stylemepretty'), ('chicagostyleweddings')
   )
   select
     s.post_url,
     s.author_username,
     (gsty.post_url is not null) as golden_set_confirmed_styled,
     coalesce(
       s.caption ~* '(styled shoot|styled editorial|this styled|editorial shoot|stylized shoot|style.?d wedding)'
       or s.caption ~* '#(styledshoot|stylizedshoot|editorialwedding|editorialshoot|weddingflatlay|flatlaystyling|designerschallenge)\y',
       false
     ) as phrase_or_hashtag_signal,
     coalesce(s.author_username in (select username from known_network_accounts), false) as known_network_account,
     (gsa.author_username is not null) as repeat_producer_account,
     coalesce(s.caption ~* 'styl', false) as bare_keyword_signal,
     case
       when gsty.post_url is not null then 'CONFIRMED'
       when s.caption ~* '(styled shoot|styled editorial|this styled|editorial shoot|stylized shoot|style.?d wedding)'
         or s.caption ~* '#(styledshoot|stylizedshoot|editorialwedding|editorialshoot|weddingflatlay|flatlaystyling|designerschallenge)\y'
         then 'LIKELY'
       when gsa.author_username is not null
         or s.author_username in (select username from known_network_accounts)
         or s.caption ~* 'styl'
         then 'POSSIBLE'
       else 'NO_SIGNAL'
     end as confidence
   from scored s
   left join golden_styled gsty on gsty.post_url = s.post_url
   left join golden_styled_authors gsa on gsa.author_username = s.author_username;`,
  `create or replace view wedding_styled_shoot_flag as
   with post_scores as (
     select
       wp.wedding_id,
       pss.post_url,
       pss.confidence,
       case pss.confidence when 'CONFIRMED' then 3 when 'LIKELY' then 2 when 'POSSIBLE' then 1 else 0 end as rank
     from wedding_posts wp
     join posts p on p.id = wp.post_id
     join post_styled_shoot_signal pss on pss.post_url = p.url
   )
   select
     wedding_id,
     (array_agg(confidence order by rank desc))[1] as styled_shoot_confidence,
     count(*) filter (where confidence <> 'NO_SIGNAL') as flagged_post_count
   from post_scores
   group by wedding_id
   having max(rank) > 0;`,
  `comment on view post_styled_shoot_signal is 'DERIVED (D049): per-post styled-shoot-vs-real tri/quad-state signal (CONFIRMED/LIKELY/POSSIBLE/NO_SIGNAL), independent and non-gating -- never used to delete or exclude anything, only to tag. See docs/decisions.md D049.';`,
  `comment on view wedding_styled_shoot_flag is 'DERIVED (D049): rolls post_styled_shoot_signal up to the wedding level -- only weddings with >=1 flagged post appear. Never touches weddings/wedding_posts; a future UI reads this to tag/separate styled-shoot content from real weddings.';`,
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
