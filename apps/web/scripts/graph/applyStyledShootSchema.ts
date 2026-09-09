/**
 * One-off, idempotent apply of the styled-shoot-vs-real-wedding signal
 * schema addition (pipeline/schema.sql, D049; regex extended D056) directly
 * to Supabase. Two new views, both derived/read-only -- no table changes, no
 * data written. Safe to re-run: CREATE OR REPLACE VIEW.
 *
 * Same dry-run/commit shape as applyPostVenueVerdictSchema.ts /
 * applyCandidateReviewSchema.ts: everything runs inside one transaction,
 * rolled back under --dry-run, committed otherwise.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyStyledShootSchema.ts --dry-run
 *   bun run scripts/graph/applyStyledShootSchema.ts
 */
import { getPool, closePool } from "../classify/db";

export const STATEMENTS: string[] = [
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
       or s.caption ~* '#(styledshoot|stylizedshoot|editorialshoot|flatlaystyling)\\y'
       -- D056 addendum (2026-09-08): extends the phrase/hashtag regex per the user's own read of
       -- a specific POSSIBLE-rated post ("This opulent Chicago style shoot... Models:
       -- @dr.king_speaks & @mike6691") -- a "style shoot" (no d) phrase and a "Models:" credit
       -- line, neither of which the original regex caught. Same \\y word-boundary discipline as
       -- the original build (the #editorialweddingphotography false-positive lesson) applied to
       -- every new clause. NOTE: every \\y/\\s/\\m below is deliberately DOUBLE-backslashed --
       -- this file's SQL lives inside JS template literals, where an unrecognized single-backslash
       -- escape (e.g. \\y) is silently stripped down to the bare letter before it ever reaches
       -- Postgres, which would silently defeat the word-boundary anchors it's supposed to add.
       --
       -- Two things were DROPPED after empirical testing against golden_set (matches
       -- pipeline/schema.sql's own comment verbatim -- see there for the full numbers): (1)
       -- "inspiration|inspo|bridal" from the adjective+shoot phrase group and
       -- "#weddinginspiration"/"#bridalinspo" from the hashtag family -- #weddinginspiration alone
       -- is 6.85% FP against confirmed-real golden INCLUDEs. (2) the bare "Models:"/"Model:"
       -- credit line is gated to co-occur with shoot/styled/editorial/session elsewhere in the
       -- caption -- ungated it alone is 0.89% FP. (3) three of the ORIGINAL D049 hashtags
       -- (#editorialwedding, #weddingflatlay, #designerschallenge) are also dropped: this
       -- addendum is what first made \\y actually take effect in the deployed view (the previous
       -- single-backslash \\y was silently stripped to a bare "y" by JS/Bun template-literal
       -- parsing, so the hashtag clause never really ran), and once it did, those three turned out
       -- to have real FP contact with golden INCLUDEs that the original 0.16% figure never caught.
       -- Final combined FP: 7/1576 = 0.44%.
       or s.caption ~* '\\y(styled?|editorial|concept)\\s+(shoot|session|editorial)\\y'
       or (s.caption ~* '\\ymodels?\\s*[:|]' and s.caption ~* '\\y(shoot|styled|editorial|session)\\y')
       or s.caption ~* '#(styledshoot|styledshoots|stylizedshoot|editorialshoot|inspirationshoot|styledweddingshoot)\\y'
       or (s.caption ~* '\\ystyled by\\y' and s.caption ~* '\\yshoot\\y'),
       false
     ) as phrase_or_hashtag_signal,
     coalesce(s.author_username in (select username from known_network_accounts), false) as known_network_account,
     (gsa.author_username is not null) as repeat_producer_account,
     coalesce(s.caption ~* 'styl', false) as bare_keyword_signal,
     case
       when gsty.post_url is not null then 'CONFIRMED'
       when s.caption ~* '(styled shoot|styled editorial|this styled|editorial shoot|stylized shoot|style.?d wedding)'
         or s.caption ~* '#(styledshoot|stylizedshoot|editorialshoot|flatlaystyling)\\y'
         or s.caption ~* '\\y(styled?|editorial|concept)\\s+(shoot|session|editorial)\\y'
         or (s.caption ~* '\\ymodels?\\s*[:|]' and s.caption ~* '\\y(shoot|styled|editorial|session)\\y')
         or s.caption ~* '#(styledshoot|styledshoots|stylizedshoot|editorialshoot|inspirationshoot|styledweddingshoot)\\y'
         or (s.caption ~* '\\ystyled by\\y' and s.caption ~* '\\yshoot\\y')
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
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const [i, sql] of STATEMENTS.entries()) {
      await client.query(sql);
      console.log(`[apply-schema] statement ${i + 1}/${STATEMENTS.length} ok`);
    }

    const { rows: confirmedRows } = await client.query<{ n: string }>(
      `select count(*) as n from post_styled_shoot_signal where confidence = 'CONFIRMED'`
    );
    const { rows: likelyRows } = await client.query<{ n: string }>(
      `select count(*) as n from post_styled_shoot_signal where confidence = 'LIKELY'`
    );
    console.log(
      `[apply-schema] ${dryRun ? "DRY RUN — " : ""}post_styled_shoot_signal: CONFIRMED=${confirmedRows[0].n}, LIKELY=${likelyRows[0].n}`
    );

    if (dryRun) {
      await client.query("rollback");
      console.log("[apply-schema] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("[apply-schema] COMMITTED");
    }
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
    await closePool();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
