/**
 * ACQUISITION LOOP (D061) — the funnel report: $ -> fetched -> new -> stack -> candidates ->
 * creation decisions -> weddings created -> venues gaining coverage, by tier and total, for one
 * tick batch (or every acquisition batch with --all). Read-only; every query tolerates empty
 * tables (a batch with no runs yet prints a row of zeros, not an error).
 *
 * Tier breakdown covers the metrics that trace through ops.crawl_run_seeds ->
 * ops.crawl_targets.tier ($ / runs / fetched / new / already_had / stack / candidates).
 * Creation decisions, weddings created, and venue-coverage gains have no tier column of their
 * own (a creation decision's candidate can trace back to posts from several ticks) and are
 * reported batch-total only — noted in the output, not silently per-tier'd.
 *
 * Usage (from apps/web):
 *   bun run scripts/acquire/reportAcquisitionFunnel.ts --batch-id acq-20260920-pilot
 *   bun run scripts/acquire/reportAcquisitionFunnel.ts --all
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";

const OUT_DIR = new URL("../graph/tmp_analysis/", import.meta.url).pathname;

interface TierRow {
  tier: string;
  runs: number;
  cost_usd: number;
  fetched: number;
  new_posts: number;
  already_had: number;
  stack_posts: number;
  candidates: number;
}

function zeroTierRow(tier: string): TierRow {
  return { tier, runs: 0, cost_usd: 0, fetched: 0, new_posts: 0, already_had: 0, stack_posts: 0, candidates: 0 };
}

function usage(): never {
  console.error(
    "[report-acquisition-funnel] Usage:\n" +
      "  bun run scripts/acquire/reportAcquisitionFunnel.ts --batch-id acq-20260920-pilot\n" +
      "  bun run scripts/acquire/reportAcquisitionFunnel.ts --all\n"
  );
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const batchIdx = args.indexOf("--batch-id");
  const batchId = batchIdx === -1 ? null : args[batchIdx + 1];
  const all = args.includes("--all");
  if (!batchId && !all) usage();

  // batchFilter: exact batch_id, or every acquisition batch for --all.
  const batchFilter = batchId ? "r.batch_id = $1" : "r.batch_id like 'acq-%'";
  const filterParams = batchId ? [batchId] : [];
  const createBatchLike = batchId ? `${batchId}-create-%` : "acq-%-create-%";
  const acquisitionBatchFilter = batchId ? "cd.acquisition_batch_id = $1" : "cd.acquisition_batch_id like 'acq-%'";

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`set statement_timeout = '120s'`);
    await client.query("begin");

    // ------------------------------------------------------------
    // Per-tier $ / runs, via ops.crawl_run_seeds -> ops.crawl_targets.tier.
    // ------------------------------------------------------------
    const { rows: tierCostRows } = await client.query(
      `with runs as (
         select r.id, r.cost_usd,
           coalesce((
             select t.tier from ops.crawl_run_seeds s join ops.crawl_targets t on t.id = s.target_id
             where s.run_id = r.id limit 1
           ), 'unknown') as tier
         from ops.crawl_runs r where ${batchFilter}
       )
       select tier, count(*)::int as runs, coalesce(sum(cost_usd), 0)::numeric as cost_usd
       from runs group by tier`,
      filterParams
    );

    const { rows: seedRows } = await client.query(
      `with runs as (
         select r.id,
           coalesce((
             select t.tier from ops.crawl_run_seeds s join ops.crawl_targets t on t.id = s.target_id
             where s.run_id = r.id limit 1
           ), 'unknown') as tier
         from ops.crawl_runs r where ${batchFilter}
       )
       select r.tier, coalesce(sum(s.fetched), 0)::int as fetched,
              coalesce(sum(s.new_posts), 0)::int as new_posts,
              coalesce(sum(s.already_had), 0)::int as already_had
       from ops.crawl_run_seeds s join runs r on r.id = s.run_id
       group by r.tier`,
      filterParams
    );

    // Batch's first-observed posts (the worklist every downstream stage scopes to).
    const { rows: firstObservedRows } = await client.query(
      `with runs as (
         select r.id,
           coalesce((
             select t.tier from ops.crawl_run_seeds s join ops.crawl_targets t on t.id = s.target_id
             where s.run_id = r.id limit 1
           ), 'unknown') as tier
         from ops.crawl_runs r where ${batchFilter}
       )
       select r.tier, p.id as post_id, p.url, p.posted_at, o.observed_at
       from ops.post_observations o
       join runs r on r.id = o.run_id
       join posts p on p.id = o.post_id
       where o.is_first`,
      filterParams
    );

    const { rows: stackRows } = await client.query(
      `with runs as (
         select r.id,
           coalesce((
             select t.tier from ops.crawl_run_seeds s join ops.crawl_targets t on t.id = s.target_id
             where s.run_id = r.id limit 1
           ), 'unknown') as tier
         from ops.crawl_runs r where ${batchFilter}
       ),
       first_observed as (
         select distinct r.tier, p.id as post_id, p.url
         from ops.post_observations o join runs r on r.id = o.run_id join posts p on p.id = o.post_id
         where o.is_first
       )
       select fo.tier, count(distinct fo.post_id)::int as stack_posts
       from first_observed fo
       join stack_extraction_runs ser on ser.post_url = fo.url and ser.has_stack
       group by fo.tier`,
      filterParams
    );

    const { rows: candidateRows } = await client.query(
      `with runs as (
         select r.id,
           coalesce((
             select t.tier from ops.crawl_run_seeds s join ops.crawl_targets t on t.id = s.target_id
             where s.run_id = r.id limit 1
           ), 'unknown') as tier
         from ops.crawl_runs r where ${batchFilter}
       ),
       first_observed as (
         select distinct r.tier, p.id as post_id, p.url
         from ops.post_observations o join runs r on r.id = o.run_id join posts p on p.id = o.post_id
         where o.is_first
       )
       select fo.tier, count(distinct jwcp.candidate_id)::int as candidates
       from first_observed fo
       join jeremy_wedding_candidate_posts jwcp on jwcp.source_post_url = fo.url
       group by fo.tier`,
      filterParams
    );

    const byTier = new Map<string, TierRow>();
    const ensure = (t: string) => {
      if (!byTier.has(t)) byTier.set(t, zeroTierRow(t));
      return byTier.get(t)!;
    };
    for (const r of tierCostRows) Object.assign(ensure(r.tier), { runs: r.runs, cost_usd: Number(r.cost_usd) });
    for (const r of seedRows)
      Object.assign(ensure(r.tier), { fetched: r.fetched, new_posts: r.new_posts, already_had: r.already_had });
    for (const r of stackRows) ensure(r.tier).stack_posts = r.stack_posts;
    for (const r of candidateRows) ensure(r.tier).candidates = r.candidates;

    const tierRows = [...byTier.values()].sort((a, b) => a.tier.localeCompare(b.tier));
    const total: TierRow = tierRows.reduce(
      (acc, r) => ({
        tier: "TOTAL",
        runs: acc.runs + r.runs,
        cost_usd: acc.cost_usd + r.cost_usd,
        fetched: acc.fetched + r.fetched,
        new_posts: acc.new_posts + r.new_posts,
        already_had: acc.already_had + r.already_had,
        stack_posts: acc.stack_posts + r.stack_posts,
        candidates: acc.candidates + r.candidates,
      }),
      zeroTierRow("TOTAL")
    );

    // ------------------------------------------------------------
    // Creation decisions (batch-total only -- no tier column).
    // ------------------------------------------------------------
    const { rows: decisionRows } = await client.query(
      `select cd.decision, count(*)::int as n from ops.creation_decisions cd where ${acquisitionBatchFilter} group by cd.decision`,
      filterParams
    );

    // ------------------------------------------------------------
    // Weddings created by this batch's creation runs (batch_id like '<batch>-create-%').
    // ------------------------------------------------------------
    const { rows: createdRows } = await client.query(
      `select w.id, w.venue_id, jwc.created_at
       from jeremy_weddings_created jwc
       join weddings w on w.id = jwc.wedding_id
       where jwc.batch_id like $1`,
      [createBatchLike]
    );
    const weddingsCreated = createdRows.length;

    // Venue coverage gains: for each venue touched by this batch's created weddings, compare
    // "before" (current total minus this batch's contribution) against "now".
    const venueIds = [...new Set(createdRows.map((r) => r.venue_id).filter((v) => v !== null))];
    let crossedTo1 = 0;
    let crossedTo6 = 0;
    let newWeddingsAtUnder6 = 0;
    if (venueIds.length > 0) {
      const { rows: totals } = await client.query(
        `select venue_id, count(*)::int as n from weddings where venue_id = any($1::bigint[]) group by venue_id`,
        [venueIds]
      );
      const totalByVenue = new Map<number, number>(totals.map((r) => [r.venue_id, r.n]));
      const createdByVenue = new Map<number, number>();
      for (const r of createdRows) {
        if (r.venue_id === null) continue;
        createdByVenue.set(r.venue_id, (createdByVenue.get(r.venue_id) ?? 0) + 1);
      }
      for (const venueId of venueIds) {
        const now = totalByVenue.get(venueId) ?? 0;
        const createdHere = createdByVenue.get(venueId) ?? 0;
        const before = now - createdHere;
        if (before === 0 && now >= 1) crossedTo1++;
        else if (before > 0 && before < 6 && now >= 6) crossedTo6++;
        if (before < 6) newWeddingsAtUnder6 += createdHere;
      }
    }

    // ------------------------------------------------------------
    // Three clocks.
    // ------------------------------------------------------------
    const postedAts = firstObservedRows.map((r) => r.posted_at).filter(Boolean);
    const observedAts = firstObservedRows.map((r) => r.observed_at).filter(Boolean);
    const createdAts = createdRows.map((r) => r.created_at).filter(Boolean);
    const minMax = (dates: Date[]) =>
      dates.length === 0
        ? "n/a"
        : `${new Date(Math.min(...dates.map((d) => +new Date(d)))).toISOString()} .. ${new Date(
            Math.max(...dates.map((d) => +new Date(d)))
          ).toISOString()}`;

    await client.query("commit");

    // ------------------------------------------------------------
    // $ per wedding.
    // ------------------------------------------------------------
    const totalCost = total.cost_usd;
    const perCreatedWedding = weddingsCreated > 0 ? totalCost / weddingsCreated : null;
    const perNewWeddingUnder6 = newWeddingsAtUnder6 > 0 ? totalCost / newWeddingsAtUnder6 : null;

    // ------------------------------------------------------------
    // Render.
    // ------------------------------------------------------------
    const label = batchId ?? "ALL acquisition batches";
    const rowsForTable = tierRows.length > 0 ? [...tierRows, total] : [zeroTierRow("(none)"), total];
    const tableRows = rowsForTable
      .map(
        (r) =>
          `| ${r.tier} | ${r.runs} | $${r.cost_usd.toFixed(4)} | ${r.fetched} | ${r.new_posts} | ${r.already_had} | ${r.stack_posts} | ${r.candidates} |`
      )
      .join("\n");
    const decisionLines =
      decisionRows.length > 0
        ? decisionRows.map((r) => `- ${r.decision}: ${r.n}`).join("\n")
        : "- (no creation_decisions rows for this batch)";

    const md = `# Acquisition funnel report -- ${label}

## Per tier

| Tier | Runs | $ | Fetched | New posts | Already had | Stack posts | Candidates |
|---|---|---|---|---|---|---|---|
${tableRows}

## Creation decisions (batch-total, no tier breakdown -- see file header)

${decisionLines}

## Weddings created

- Weddings created (\`jeremy_weddings_created.batch_id like '${createBatchLike}'\`): **${weddingsCreated}**
- Venues crossing 0 -> 1 documented wedding: **${crossedTo1}**
- Venues crossing into 6+ (previously 1-5): **${crossedTo6}**
- $ per created wedding: ${perCreatedWedding !== null ? `$${perCreatedWedding.toFixed(2)}` : "n/a (0 weddings created)"}
- $ per new wedding at a venue that had < 6 before: ${perNewWeddingUnder6 !== null ? `$${perNewWeddingUnder6.toFixed(2)}` : "n/a (0 qualifying weddings)"}

## Three clocks

- \`posts.posted_at\` (Instagram) range: ${minMax(postedAts)}
- \`observed_at\` (fetch) range: ${minMax(observedAts)}
- \`jeremy_weddings_created.created_at\` (decision) range: ${minMax(createdAts)}
`;

    console.log(md);

    const today = new Date().toISOString().slice(0, 10);
    mkdirSync(OUT_DIR, { recursive: true });
    const outPath = `${OUT_DIR}acquisition_funnel_${batchId ?? "all"}_${today}.md`;
    writeFileSync(outPath, md);
    console.log(`[report-acquisition-funnel] wrote ${outPath}`);
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
    await closePool();
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
