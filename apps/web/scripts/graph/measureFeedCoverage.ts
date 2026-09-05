/**
 * Coverage metric: what fraction of the /feed corpus (v1_content_corpus, Jeremy's
 * V1-INCLUDE posts) has actually become a confirmed vendor credit in production
 * (`wedding_vendors`)? Read-only — no writes. Meant to be re-run over time to track
 * progress, not a one-off report.
 *
 * "Coverage" here means: does ANY vendor mentioned in this post have a wedding_vendors
 * row tying it to the wedding-cluster this post belongs to? This is a strict, honest
 * measure — it does not count a post as "covered" just because some OTHER post about the
 * same venue happens to be credited.
 *
 * Usage (from apps/web): bun run scripts/graph/measureFeedCoverage.ts
 */
import { getPool, closePool } from "../classify/db";

async function main() {
  const pool = getPool();

  const { rows: funnel } = await pool.query<{
    include_posts: string;
    posts_in_a_candidate: string;
    total_candidates: string;
    has_venue_anchor: string;
    no_venue_anchor: string;
  }>(`
    select
      (select count(*) from v1_content_corpus) as include_posts,
      (select count(distinct vc.post_url) from v1_content_corpus vc
         join jeremy_wedding_candidate_posts cp on cp.source_post_url = vc.post_url) as posts_in_a_candidate,
      (select count(*) from jeremy_wedding_candidates) as total_candidates,
      (select count(*) from jeremy_wedding_candidates where venue_account_id is not null) as has_venue_anchor,
      (select count(*) from jeremy_wedding_candidates where venue_account_id is null) as no_venue_anchor
  `);

  const { rows: tiers } = await pool.query<{
    high_conf: string;
    ambiguous: string;
    no_match: string;
  }>(`
    select
      count(*) filter (where match_confidence between 0.75 and 0.85) as high_conf,
      count(*) filter (where matched_wedding_id is not null and not (match_confidence between 0.75 and 0.85)) as ambiguous,
      count(*) filter (where matched_wedding_id is null) as no_match
    from jeremy_wedding_candidate_reconciliation where reconciliation_version = 'reconcile-v2'
  `);

  const { rows: ingested } = await pool.query<{ rows_ingested: string; weddings_touched: string }>(`
    select count(*) as rows_ingested, count(distinct wedding_id) as weddings_touched
    from jeremy_wedding_vendors_ingested
  `);

  const { rows: benTotal } = await pool.query<{ n: string }>(`select count(*) as n from weddings`);

  const f = funnel[0];
  const t = tiers[0];
  const ing = ingested[0];

  console.log(`[feed-coverage] /feed corpus (v1_content_corpus, V1 INCLUDE posts): ${f.include_posts}`);
  console.log(
    `[feed-coverage]   -> made it into any candidate cluster: ${f.posts_in_a_candidate} (${pct(f.posts_in_a_candidate, f.include_posts)})`
  );
  console.log(`[feed-coverage]   -> distinct candidate clusters formed: ${f.total_candidates}`);
  console.log(
    `[feed-coverage]      -> has a venue anchor: ${f.has_venue_anchor} (${pct(f.has_venue_anchor, f.total_candidates)})`
  );
  console.log(
    `[feed-coverage]      -> NO venue anchor (structurally excluded from reconciliation): ${f.no_venue_anchor} (${pct(f.no_venue_anchor, f.total_candidates)})`
  );
  console.log(`[feed-coverage]         of anchored candidates, reconciliation outcome:`);
  console.log(`[feed-coverage]           high-confidence match to an existing Ben wedding: ${t.high_conf}`);
  console.log(`[feed-coverage]           ambiguous match (false-merge risk): ${t.ambiguous}`);
  console.log(`[feed-coverage]           NO match to any existing Ben wedding at all: ${t.no_match}`);
  console.log(
    `[feed-coverage] Actually landed in production wedding_vendors: ${ing.rows_ingested} rows, ${ing.weddings_touched} distinct Ben weddings touched`
  );
  console.log(
    `[feed-coverage] Ben's total documented weddings (separate pipeline, unaffected by /feed): ${benTotal[0].n}`
  );
  console.log(
    `\n[feed-coverage] SUMMARY: of ${f.include_posts} /feed posts, only ${ing.weddings_touched} distinct Ben` +
      ` weddings (${pct(ing.weddings_touched, benTotal[0].n)} of all documented weddings) have received a` +
      ` confirmed vendor credit from this corpus so far.`
  );
  console.log(
    `[feed-coverage] Architectural note: reconciliation only ever MATCHES a candidate to an EXISTING Ben` +
      ` wedding — it never creates a new one. The ${t.no_match} "no match" candidates could include real` +
      ` weddings Ben's own crawler never found, but under the current design they cannot become a` +
      ` documented wedding no matter how credible the underlying post is. This is the single largest gap.`
  );

  await closePool();
}

function pct(n: string, d: string): string {
  return `${((Number(n) / Number(d)) * 100).toFixed(1)}%`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
