/**
 * "Beyond INCLUDE" mining queue (D047 follow-on, 2026-09-06) -- the venues-first sweep and
 * every downstream evidence source (venue_inline_mention, the venuelogic/co-tag recovery
 * batches) all still only ever looked at posts V3 scored INCLUDE (candidate_score>=12 + V3
 * INCLUDE) or that a human already confirmed. This queue targets three specific, reasoned
 * pools of the corpus that never got that treatment, sized live against the real DB before
 * building anything (not a guess):
 *
 * 1. review_unprocessed: V3's own REVIEW decision (its "I'm not sure" bucket) that was never
 *    clustered or human-reviewed at all (~300 of 378 REVIEW posts).
 * 2. exclude_with_stack: V3 said EXCLUDE (a text-tone judgment) but the post has a REAL
 *    parseable vendor-credit stack with 3+ distinct roles -- a strong structural counter-signal
 *    the text classifier doesn't see (639 posts, not yet clustered).
 * 3. unscored_with_stack: candidate_scores between 6 and 11 (below V3's own run threshold, so
 *    V3 never even looked at it) but has a parseable stack anyway (173 posts).
 *
 * Each row's `bucket` records which of these three pools it came from -- deliberately, so a
 * human's WEDDING/NOT_WEDDING verdict can later be grouped by pool to see which of these three
 * automated signals is actually predictive (the standing ask: "use label queue to... test our
 * logic and see what is working and what isn't"), not just to harvest weddings one at a time.
 *
 * Same Chicago tri-state signal as human_confirmed_post_geography (CONFIRMED/NOT_CONFIRMED/
 * AMBIGUOUS/NO_SIGNAL), computed directly here since none of these posts are in golden_set yet
 * so that view doesn't cover them -- excludes only NOT_CONFIRMED (a real negative), keeps
 * everything else (this pool is about finding new venues too, not just filling in known ones).
 * Ordered: resolvable-venue posts with the LOWEST current documented-wedding count first (same
 * "prioritize low coverage" preference as venue_coverage_v3), then posts with no resolvable
 * venue yet (still real, just not coverage-rankable), then by pool priority (REVIEW's own
 * uncertainty bucket first, then the two stack-based recoveries), post_url last for
 * determinism.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/buildBeyondIncludeQueue.ts --dry-run
 *   bun run scripts/classify/buildBeyondIncludeQueue.ts
 */
import { getPool, closePool } from "../classify/db";

export const BEYOND_INCLUDE_QUEUE_VERSION = "beyond_include_v1";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();

  const { rows } = await pool.query<{
    post_url: string;
    bucket: string;
    chicago_status: string;
    n_weddings: number | null;
  }>(
    `with latest_v3 as (
       select distinct on (post_url) post_url, decision
       from post_classification_runs
       where classifier_version = 'v3'
       order by post_url, classified_at desc
     ),
     latest_stack as (
       select post_url, count(distinct role) as n_roles
       from stack_extraction_entries
       where stack_parser_version = (select max(stack_parser_version) from stack_extraction_runs)
       group by post_url
     ),
     review_unprocessed as (
       select lv.post_url, 'review_unprocessed' as bucket
       from latest_v3 lv
       where lv.decision = 'REVIEW'
     ),
     exclude_with_stack as (
       select lv.post_url, 'exclude_with_stack' as bucket
       from latest_v3 lv
       join latest_stack ls on ls.post_url = lv.post_url and ls.n_roles >= 3
       where lv.decision = 'EXCLUDE'
     ),
     unscored_with_stack as (
       select cs.post_url, 'unscored_with_stack' as bucket
       from candidate_scores cs
       join latest_stack ls on ls.post_url = cs.post_url
       where cs.score between 6 and 11
         and not exists (select 1 from latest_v3 lv where lv.post_url = cs.post_url)
     ),
     pool as (
       select * from review_unprocessed
       union all
       select * from exclude_with_stack
       union all
       select * from unscored_with_stack
     ),
     venue_signals as (
       select
         p.post_url,
         bool_or(al.in_metro = true or v.city = 'Chicago') as any_confirmed,
         bool_or(al.in_metro = false) as any_not_confirmed,
         count(*) > 0 as has_any_venue,
         min(coalesce((select count(distinct wv.wedding_id) from wedding_vendors wv where wv.account_id = a.id), 0))
           filter (where al.in_metro = true or v.city = 'Chicago') as n_weddings_min
       from pool p
       join stack_extraction_entries se on se.post_url = p.post_url
         and se.stack_parser_version = (select max(stack_parser_version) from stack_extraction_runs)
         and se.role = 'venue'
       join accounts a on lower(a.username::text) = se.handle
       left join account_locations al on al.account_id = a.id
       left join lateral (select city from vendors where account_id = a.id order by id limit 1) v on true
       group by p.post_url
     )
     select p.post_url, p.bucket,
       case
         when vs.any_confirmed then 'CONFIRMED'
         when sp.location_tag ~* 'chicago' then 'CONFIRMED'
         when sp.caption_raw ~* 'chicago' then 'CONFIRMED'
         when vs.any_not_confirmed then 'NOT_CONFIRMED'
         when sp.location_tag ~* '(new york|los angeles|miami|dallas|houston|atlanta|denver|seattle|boston|nashville|austin|san francisco|milwaukee|indianapolis|detroit|florida|california|texas|tuscany|italy|mexico|paris|london)' then 'NOT_CONFIRMED'
         when sp.caption_raw ~* '(new york|los angeles|miami|dallas|houston|atlanta|denver|seattle|boston|nashville|austin|san francisco|milwaukee|indianapolis|detroit|florida|california|texas|tuscany|italy|mexico|paris|london)' then 'NOT_CONFIRMED'
         when vs.has_any_venue then 'AMBIGUOUS'
         else 'NO_SIGNAL'
       end as chicago_status,
       vs.n_weddings_min as n_weddings
     from pool p
     join staging.instagram_posts sp on sp.post_url = p.post_url
     left join venue_signals vs on vs.post_url = p.post_url
     where not exists (select 1 from golden_set gs where gs.post_url = p.post_url)
       and not exists (select 1 from human_post_labels hpl where hpl.post_url = p.post_url and hpl.labeled_by = 'jeremy')
       and not exists (select 1 from jeremy_wedding_candidate_posts cp where cp.source_post_url = p.post_url)
       and coalesce((
         case
           when vs.any_confirmed then 'CONFIRMED'
           when sp.location_tag ~* 'chicago' then 'CONFIRMED'
           when sp.caption_raw ~* 'chicago' then 'CONFIRMED'
           when vs.any_not_confirmed then 'NOT_CONFIRMED'
           when sp.location_tag ~* '(new york|los angeles|miami|dallas|houston|atlanta|denver|seattle|boston|nashville|austin|san francisco|milwaukee|indianapolis|detroit|florida|california|texas|tuscany|italy|mexico|paris|london)' then 'NOT_CONFIRMED'
           when sp.caption_raw ~* '(new york|los angeles|miami|dallas|houston|atlanta|denver|seattle|boston|nashville|austin|san francisco|milwaukee|indianapolis|detroit|florida|california|texas|tuscany|italy|mexico|paris|london)' then 'NOT_CONFIRMED'
           when vs.has_any_venue then 'AMBIGUOUS'
           else 'NO_SIGNAL'
         end
       ), 'NO_SIGNAL') <> 'NOT_CONFIRMED'
     order by
       (vs.n_weddings_min is null) asc, vs.n_weddings_min asc nulls last,
       case p.bucket when 'review_unprocessed' then 0 when 'exclude_with_stack' then 1 else 2 end,
       p.post_url`
  );

  console.log(`[beyond-include-queue] ${dryRun ? "DRY RUN — " : ""}pool=${rows.length} posts`);
  const byBucket = new Map<string, number>();
  const byChicago = new Map<string, number>();
  for (const r of rows) {
    byBucket.set(r.bucket, (byBucket.get(r.bucket) ?? 0) + 1);
    byChicago.set(r.chicago_status, (byChicago.get(r.chicago_status) ?? 0) + 1);
  }
  console.log(`[beyond-include-queue] by bucket: ${[...byBucket.entries()].map(([k, v]) => `${k}:${v}`).join(", ")}`);
  console.log(`[beyond-include-queue] by chicago_status: ${[...byChicago.entries()].map(([k, v]) => `${k}:${v}`).join(", ")}`);

  if (dryRun) {
    await closePool();
    return;
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const res = await pool.query(
      `insert into label_queue (post_url, queue_version, bucket, source, rank)
       values ($1, $2, $3, $4, $5)
       on conflict (post_url, queue_version) do nothing`,
      [r.post_url, BEYOND_INCLUDE_QUEUE_VERSION, r.bucket, "staging", i + 1]
    );
    if (res.rowCount) inserted += res.rowCount;
  }
  console.log(`[beyond-include-queue] inserted ${inserted} rows under queue_version=${BEYOND_INCLUDE_QUEUE_VERSION}`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
