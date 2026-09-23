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

    // ---- Where the posts live. staging is Jeremy's raw corpus (read-only reference); public.posts
    // is OUR graph's table. They overlap, so the distinct total is not the sum.
    const { rows: srcRows } = await c.query(
      `select coalesce(source, '(null)') as source, count(*)::int as n,
              count(*) filter (where exists (select 1 from staging.instagram_posts sp where sp.post_url = p.url))::int as also_in_staging
       from posts p group by 1 order by 2 desc`
    );
    const { rows: tot } = await c.query(
      `select (select count(*) from staging.instagram_posts)::int staging,
              (select count(*) from posts)::int public_posts,
              (select count(*) from staging.instagram_posts sp
                 where exists (select 1 from posts p where p.url = sp.post_url))::int overlap,
              (select count(distinct post_url) from v_ig_posts)::int distinct_total,
              (select count(*) from v_ig_posts)::int view_rows`
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
    console.log(`## Where the posts are\n`);
    console.log(`| table | posts | also in staging |`);
    console.log(`|---|---|---|`);
    console.log(`| staging.instagram_posts (Jeremy's raw corpus, read-only) | ${t.staging} | - |`);
    for (const r of srcRows) console.log(`| public.posts \`source=${r.source}\` | ${r.n} | ${r.also_in_staging} |`);
    console.log(`| **DISTINCT TOTAL** (\`v_ig_posts\`, by post_url) | **${t.distinct_total}** | overlap ${t.overlap} |`);
    console.log(
      `\n\`v_ig_posts\` has ${t.view_rows} ROWS but ${t.distinct_total} distinct post_urls -- the difference is posts` +
        ` present in both tables. Quote the distinct number.\n` +
        `Its public side is filtered to \`source in ('venue_tagged','own_profile')\`; the excluded` +
        ` \`jeremy_evidence\` rows are all staging posts promoted into our graph, so staging already supplies them.\n`
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
