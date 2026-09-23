/**
 * CORPUS INVENTORY (D066, 2026-09-22) -- the one place that answers "how many posts do we actually
 * have, where did they come from, and how far has each source been mined".
 *
 * WHY THIS EXISTS. The corpus size was quoted from memory as "47,623" for weeks. That is only
 * `staging.instagram_posts`, Jeremy's slice. The real total is ~68k because the acquisition loop has
 * been writing crawled posts into `public.posts` the whole time. Quoting the stale number caused two
 * concrete failures, not just an inaccurate doc:
 *   - I recommended "mine Jeremy's 47k corpus" as fresh headroom for a coverage gap when it had
 *     already been mined, having read "only ~6.5% is in public.posts" as "unmined" (it measures
 *     import share, which says nothing about mining -- the parser and reader work staging in place).
 *   - `runStackParserBaseline.ts --ungated` scanned `staging` ONLY, so 4,404 crawled posts could not
 *     be reached by any corpus-wide parse. The code carried the same stale idea of "the corpus" the
 *     docs did.
 * The user's ask (2026-09-22): the true total and its provenance must be "always up to date… and
 * pointed at all results", because Apify strategy decisions are supposed to learn from which batches
 * produced credible weddings. A number in a markdown file cannot do that. This script can.
 *
 * Read-only. Run it instead of trusting any hardcoded corpus count:
 *   bun run scripts/graph/reportCorpusInventory.ts
 *   bun run scripts/graph/reportCorpusInventory.ts --batches   # + per-acquisition-batch outcomes
 */
import { getPool, closePool } from "../classify/db";

function pct(n: number, d: number): string {
  return d > 0 ? `${((100 * n) / d).toFixed(1)}%` : "-";
}

async function main() {
  const withBatches = process.argv.includes("--batches");
  const pool = getPool();
  const c = await pool.connect();
  try {
    await c.query("set statement_timeout = '600s'");

    // ---- Where the posts live, post-merge (D066 -> post-table merge, 2026-09-23). `posts` is now
    // ONE table, one row per post, tagged with `origin` and `source`. There is no more staging-vs-
    // public split to reconcile by URL -- what's left is (1) the import record (staging.instagram_posts
    // itself, read-only, reconciled by row count against posts.staging_post_id + the exclusions
    // table) and (2) sightings, which now live in ops.post_observations/ops.crawl_runs.
    const { rows: originRows } = await c.query(
      `select coalesce(origin, '(null)') as origin, coalesce(source, '(null)') as source, count(*)::int as n
       from posts group by 1, 2 order by 1, 2`
    );
    const { rows: postsTotalRows } = await c.query(`select count(*)::int as n from posts`);
    const postsTotal = postsTotalRows[0].n;

    // import record reconciliation (allowed) -- the ONLY direct read of staging.instagram_posts in
    // this file. staging is Jeremy's raw import record now, not a corpus source: every staging row
    // either landed in `posts` (staging_post_id not null) or was explicitly excluded at merge time
    // (ops.post_merge_exclusions, the 10 rows that were profile URLs, not posts).
    const { rows: importRows } = await c.query(
      `select (select count(*) from staging.instagram_posts)::int as staging_rows,
              (select count(*) from posts where staging_post_id is not null)::int as linked,
              (select count(*) from ops.post_merge_exclusions)::int as excluded`
    );
    const imp = importRows[0];
    const importReconciled = imp.linked + imp.excluded;
    const importMismatch = importReconciled !== imp.staging_rows;

    // Sightings by channel. acq-% batches are the live acquisition loop; the two synthetic
    // legacy-import runs (batch_id 'legacy-ben-pipeline' / 'legacy-jeremy-beta-import') and run 31
    // ('legacy-ben-crawl1-zero-venues') are CHANNEL TOTALS from the historical import/registration,
    // never per-batch strategy data -- they are named individually here but never ranked (see
    // --batches below, which only ranks acq-% batches).
    const { rows: channelRows } = await c.query(
      `with runs_ch as (
         select id, batch_id, actor,
           case
             when batch_id like 'acq-%' then 'acquisition_loop'
             when actor = 'legacy-import' or batch_id like 'legacy-%' then batch_id
             else 'other'
           end as channel
         from ops.crawl_runs
       )
       select rc.channel,
              count(distinct rc.id)::int as runs,
              count(o.run_id)::int as observations,
              count(distinct o.post_id)::int as distinct_posts,
              count(*) filter (where o.is_first)::int as first_observed
       from runs_ch rc
       left join ops.post_observations o on o.run_id = rc.id
       group by 1
       order by 1`
    );

    const { rows: tot } = await c.query(
      `select (select count(*) from v_ig_posts)::int distinct_total`
    );
    const t = tot[0];

    // ---- The mining funnel over the WHOLE corpus, not one source of it.
    const { rows: fun } = await c.query(
      `with allp as materialized (select distinct post_url from v_ig_posts),
        parsed as materialized (select distinct post_url from stack_extraction_runs),
        clustered as materialized (select distinct source_post_url u from jeremy_wedding_candidate_posts),
        readp as materialized (select distinct post_url from post_venue_verdicts_current),
        inwed as materialized (select distinct p.url from wedding_posts wp join posts p on p.id = wp.post_id)
       select count(*)::int total,
              count(*) filter (where pa.post_url is not null)::int parsed,
              count(*) filter (where cl.u is not null)::int clustered,
              count(*) filter (where r.post_url is not null)::int read_by_reader,
              count(*) filter (where iw.url is not null)::int in_a_wedding
       from allp a
       left join parsed pa on pa.post_url = a.post_url
       left join clustered cl on cl.u = a.post_url
       left join readp r on r.post_url = a.post_url
       left join inwed iw on iw.url = a.post_url`
    );
    const f = fun[0];

    // ---- What is left, and WHY. The honest blocker is wedding evidence, not venue anchors: plenty
    // of unclustered posts name a venue, almost none say anything that makes them a wedding.
    const { rows: left } = await c.query(
      `with allp as materialized (select distinct post_url from v_ig_posts),
        parsed as materialized (select distinct post_url from stack_extraction_runs),
        clustered as materialized (select distinct source_post_url u from jeremy_wedding_candidate_posts),
        ev as materialized (
          select source_post_url,
                 max(case when role = 'venue' and venue_anchor_source is not null then 1 else 0 end) anchor,
                 max(case when role = 'venue' and venue_anchor_source = 'credit_line' then 1 else 0 end) credit_anchor,
                 bool_or(has_wedding_keyword) wk, bool_or(has_couple_signal) couple,
                 count(*) filter (where role <> 'venue') nonvenue_credits
          from structural_post_vendor_evidence group by 1)
       select count(*) filter (where pa.post_url is null)::int unparsed,
              count(*) filter (where pa.post_url is null and coalesce(e.anchor,0) = 1)::int unparsed_with_anchor,
              count(*) filter (where pa.post_url is not null and cl.u is null and coalesce(e.anchor,0) = 1)::int anchored_unclustered,
              count(*) filter (where pa.post_url is not null and cl.u is null and coalesce(e.anchor,0) = 1 and e.credit_anchor = 1)::int anchored_unclustered_credit_line,
              count(*) filter (where pa.post_url is not null and cl.u is null and coalesce(e.anchor,0) = 1 and e.wk)::int anchored_unclustered_wedding_kw,
              count(*) filter (where pa.post_url is not null and cl.u is null and coalesce(e.anchor,0) = 0)::int unclustered_no_anchor
       from allp a
       left join parsed pa on pa.post_url = a.post_url
       left join clustered cl on cl.u = a.post_url
       left join ev e on e.source_post_url = a.post_url`
    );
    const l = left[0];

    console.log(`# Corpus inventory -- ${new Date().toISOString()}\n`);
    console.log(`## Where the posts are (posts = ONE table, post-merge 2026-09-23)\n`);
    console.log(`| origin | source | posts |`);
    console.log(`|---|---|---|`);
    for (const r of originRows) console.log(`| ${r.origin} | ${r.source} | ${r.n} |`);
    console.log(`| **TOTAL** | | **${postsTotal}** |`);

    console.log(`\n### Import record reconciliation (allowed direct read of staging.instagram_posts)\n`);
    console.log(`| staging.instagram_posts rows | linked (posts.staging_post_id not null) | excluded (ops.post_merge_exclusions) |`);
    console.log(`|---|---|---|`);
    console.log(`| ${imp.staging_rows} | ${imp.linked} | ${imp.excluded} |`);
    console.log(
      `staging rows = linked + excluded  =>  ${imp.staging_rows} = ${imp.linked} + ${imp.excluded} (${importReconciled})` +
        (importMismatch ? `  **MISMATCH**` : `  OK`)
    );

    console.log(`\n### Sightings by channel (ops.crawl_runs / ops.post_observations)\n`);
    console.log(`| channel | runs | observations | distinct posts observed | first-observed |`);
    console.log(`|---|---|---|---|---|`);
    for (const r of channelRows) {
      console.log(`| ${r.channel} | ${r.runs} | ${r.observations} | ${r.distinct_posts} | ${r.first_observed} |`);
    }
    console.log(
      `\nThe legacy-import channels above are CHANNEL TOTALS from the one-time historical` +
        ` registration/import, not per-batch strategy data -- never ranked. Only \`acq-%\` batches are` +
        ` ranked (see --batches below).`
    );

    console.log(
      `\n**Quote the distinct total: ${t.distinct_total}.** \`v_ig_posts\` is one row per post now` +
        ` (post-table merge, 2026-09-23) -- no more ROWS-vs-distinct gap to reconcile.\n`
    );

    console.log(`## Mining funnel (whole corpus)\n`);
    console.log(`| stage | posts | % of corpus |`);
    console.log(`|---|---|---|`);
    console.log(`| total | ${f.total} | 100% |`);
    console.log(`| parsed (stack parser) | ${f.parsed} | ${pct(f.parsed, f.total)} |`);
    console.log(`| clustered into a candidate | ${f.clustered} | ${pct(f.clustered, f.total)} |`);
    console.log(`| read by the reader | ${f.read_by_reader} | ${pct(f.read_by_reader, f.total)} |`);
    console.log(`| attached to a wedding | ${f.in_a_wedding} | ${pct(f.in_a_wedding, f.total)} |`);

    console.log(`\n## What is left, and why\n`);
    console.log(`- unparsed: **${l.unparsed}** (${l.unparsed_with_anchor} of them already carry a venue anchor)`);
    console.log(`  - reachable with \`runStackParserBaseline.ts --ungated\`, which scans the FULL corpus as of D066.`);
    console.log(`- parsed, unclustered, WITH a venue anchor: **${l.anchored_unclustered}**`);
    console.log(`  - of those, credit_line anchor (the strong kind): ${l.anchored_unclustered_credit_line}`);
    console.log(`  - of those, containing ANY wedding language: **${l.anchored_unclustered_wedding_kw}**`);
    console.log(`- parsed, unclustered, no venue anchor at all: ${l.unclustered_no_anchor}`);
    console.log(
      `\n**Read that middle block before proposing more mining.** The corpus is not short of venue` +
        ` anchors; it is short of WEDDING EVIDENCE. Clustering needs an anchor PLUS wedding language` +
        ` (plus a credit or a named couple), because an anchor only says WHERE a post was taken. A` +
        ` large anchored-unclustered count with a tiny wedding-language count means those posts name a` +
        ` venue and never claim a wedding -- re-reading them does not help, and it was measured: 359` +
        ` re-read posts produced 3 weddings.`
    );

    if (withBatches) {
      // ---- Per-acquisition-batch outcomes. This is the table Apify strategy should be argued from:
      // what each batch cost and what it actually produced, not what a prior predicted.
      const { rows: b } = await c.query(
        // Only acq-% batches are strategies. The post-table merge's synthetic channel runs
        // (actor 'legacy-import', batch_id 'legacy-*') and run 31 are channel totals, never ranked.
        `with runs as (select id, batch_id, cost_usd from ops.crawl_runs where batch_id like 'acq-%'),
          seeds as (select r.batch_id, sum(s.fetched)::int fetched, sum(s.new_posts)::int new_posts,
                           count(distinct s.account_id)::int accounts
                    from ops.crawl_run_seeds s join runs r on r.id = s.run_id group by 1),
          cost as (select batch_id, sum(cost_usd)::numeric(10,2) cost from runs group by 1),
          made as (select regexp_replace(jc.batch_id, '-create-.*$', '') batch_id,
                          count(distinct jc.wedding_id)::int weddings
                   from jeremy_weddings_created jc where jc.batch_id like 'acq-%-create-%' group by 1)
         select c.batch_id, c.cost, s.accounts, s.fetched, s.new_posts, coalesce(m.weddings,0) weddings,
                case when c.cost > 0 then round(coalesce(m.weddings,0) / c.cost, 1) else null end w_per_dollar
         from cost c left join seeds s on s.batch_id = c.batch_id left join made m on m.batch_id = c.batch_id
         order by w_per_dollar desc nulls last`
      );
      console.log(`\n## Per-acquisition-batch outcomes (argue Apify strategy from THIS, not from priors)\n`);
      console.log(`| batch | $ | accounts | fetched | new | weddings | **w/$** |`);
      console.log(`|---|---|---|---|---|---|---|`);
      for (const r of b) {
        console.log(
          `| ${r.batch_id} | $${r.cost} | ${r.accounts ?? "-"} | ${r.fetched ?? "-"} | ${r.new_posts ?? "-"} | ${r.weddings} | ${r.w_per_dollar ?? "-"} |`
        );
      }
      console.log(
        `\nweddings/$ counts only weddings created under \`<batch>-create-%\`, so a batch whose` +
          ` candidates were later created under a different batch id will under-report. Coverage effect` +
          ` (which venues crossed) is NOT here -- use \`compareArms.ts\`, which scores every batch` +
          ` against one shared baseline.`
      );
    }
  } finally {
    c.release();
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
