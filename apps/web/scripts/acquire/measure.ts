/**
 * ACQUISITION LOOP (D061) -- measure one tick's realized yield per target and update priors.
 *
 * For every seed (account) of an acquisition batch: posts fetched / new / already had (from
 * ops.crawl_run_seeds, filled by ingest), stack posts (stack_extraction_runs.has_stack on the
 * seed's first-observed posts), candidates (jeremy_wedding_candidate_posts), weddings created
 * (wedding_posts on those posts, alias-rolled to the canonical venue), and the venue-coverage
 * effect (weddings at venues that had < 6 before the batch). Then:
 *   - writes stack_posts onto ops.crawl_run_seeds,
 *   - appends ONE new ops.crawl_targets row per (account, feed) with the updated prior
 *       prior_next = (K * prior + weddings) / (K + posts_fetched),  K = 25
 *     and the tri-state status: promising (>= 1 stack post or candidate per 25 fetched), dead
 *     (>= 20 fetched, 0 stacks, 0 candidates), ambiguous otherwise (re-probe once, never deepen),
 *   - stamps ops.crawl_runs.pipeline_versions for the batch's runs with the versions that
 *     processed it (parser / prompt / clustering / reconciliation), if not already set.
 * Append-only: never updates an existing crawl_targets row (latest per account x feed wins).
 *
 * Usage (from apps/web):
 *   bun run scripts/acquire/measure.ts --batch-id acq-20260919-canary            # dry run, prints the table
 *   bun run scripts/acquire/measure.ts --batch-id acq-20260919-canary --apply    # writes
 */
import { getPool, closePool } from "../classify/db";
import { STACK_PARSER_VERSION } from "../graph/stackParser";
import { EXTRACT_PROMPT_VERSION } from "../classify/extractPrompt";
import { STRUCTURAL_CLUSTERING_VERSION } from "../../lib/server/structuralVersion";

export const PRIOR_K = 25;

export type TargetStatus = "promising" | "dead" | "ambiguous";

/** Pure: the prior update and tri-state status rule from the plan (docs/decisions.md D061). */
export function updatePrior(prior: number, priorN: number, weddings: number, fetched: number): { prior: number; n: number } {
  if (fetched <= 0) return { prior, n: priorN };
  const k = PRIOR_K;
  return { prior: (k * prior + weddings) / (k + fetched), n: priorN + fetched };
}

export function decideStatus(fetched: number, stackPosts: number, candidates: number): TargetStatus {
  if (fetched >= 20 && stackPosts === 0 && candidates === 0) return "dead";
  if (fetched > 0 && (stackPosts + candidates) / fetched >= 1 / 25) return "promising";
  return "ambiguous";
}

interface SeedYield {
  run_id: number;
  account_id: number;
  username: string;
  target_id: number | null;
  feed: string;
  tier: string;
  prior: number;
  prior_n: number;
  canonical_account_id: number;
  requested: number;
  fetched: number;
  new_posts: number;
  already_had: number;
  stack_posts: number;
  candidates: number;
  weddings: number;
  weddings_thin: number;
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
  const batchId = get("--batch-id");
  const apply = argv.includes("--apply");
  if (!batchId) {
    console.error("Usage: bun run scripts/acquire/measure.ts --batch-id <acq batch> [--apply]");
    process.exit(2);
  }
  const pool = getPool();

  // Per-seed yield over the seed's FIRST-observed posts in this batch (spend credited to the first
  // sighting; later sightings are already_had, per the provenance rule).
  const { rows } = await pool.query<SeedYield>(
    `with runs as (select id, feed from ops.crawl_runs where batch_id = $1),
     seeds as (
       select s.run_id, s.account_id, s.target_id, s.requested, coalesce(s.fetched,0) fetched,
              coalesce(s.new_posts,0) new_posts, coalesce(s.already_had,0) already_had, r.feed
       from ops.crawl_run_seeds s join runs r on r.id = s.run_id),
     fo as (
       select o.seed_account_id account_id, o.run_id, p.id post_id, p.url
       from ops.post_observations o join runs r on r.id = o.run_id join posts p on p.id = o.post_id
       where o.is_first),
     per as (
       select fo.account_id, fo.run_id,
         count(*) filter (where exists (select 1 from stack_extraction_runs x where x.post_url = fo.url and x.has_stack)) stack_posts,
         count(distinct cp.candidate_id) candidates,
         count(distinct wp.wedding_id) weddings,
         count(distinct wp.wedding_id) filter (where vb.n_before < 6) weddings_thin
       from fo
       left join jeremy_wedding_candidate_posts cp on cp.source_post_url = fo.url
       -- only weddings created AFTER this run was ingested count as this run's yield: a legacy
       -- registration (Ben's crawl posts) carries wedding_posts links that predate the batch, and
       -- those are not new weddings (2026-09-20: 57 phantom weddings on legacy-ben-crawl1-zero-venues)
       left join wedding_posts wp0 on wp0.post_id = fo.post_id
       left join weddings w on w.id = wp0.wedding_id
         and w.created_at >= (select coalesce(r2.ingested_at, r2.started_at) from ops.crawl_runs r2 where r2.id = fo.run_id)
       left join lateral (select w.id as wedding_id) wp on w.id is not null
       left join lateral (
         select count(*) n_before from weddings w2
         where w2.venue_id = w.venue_id
           and w2.created_at < (select min(started_at) from ops.crawl_runs where batch_id = $1)) vb on w.id is not null
       group by 1, 2)
     select s.run_id, s.account_id, a.username::text username, s.target_id, s.feed,
            coalesce(t.tier, 'unknown') tier, coalesce(t.prior_w_per_post, 0.1)::float prior, coalesce(t.prior_n, 0) prior_n,
            coalesce(al.canonical_account_id, s.account_id)::int canonical_account_id,
            s.requested, s.fetched, s.new_posts, s.already_had,
            coalesce(per.stack_posts,0)::int stack_posts, coalesce(per.candidates,0)::int candidates,
            coalesce(per.weddings,0)::int weddings, coalesce(per.weddings_thin,0)::int weddings_thin
     from seeds s
     join accounts a on a.id = s.account_id
     left join ops.crawl_targets t on t.id = s.target_id
     left join account_aliases al on al.alias_account_id = s.account_id
     left join per on per.account_id = s.account_id and per.run_id = s.run_id
     order by weddings desc, stack_posts desc, a.username`,
    [batchId]
  );
  if (rows.length === 0) {
    console.log(`[measure] no seeds for batch ${batchId}`);
    await closePool();
    return;
  }

  const feed = rows[0].feed;
  const totals = { fetched: 0, new_posts: 0, stack_posts: 0, candidates: 0, weddings: 0, weddings_thin: 0, dead: 0, promising: 0, ambiguous: 0 };
  console.log(`[measure] ${apply ? "APPLY" : "DRY RUN"} batch=${batchId} feed=${feed} seeds=${rows.length}`);
  console.log(`  account | tier | fetched | new | stack | cand | weddings | thin | w/post | prior -> next | status`);
  const updates: { row: SeedYield; next: { prior: number; n: number }; status: TargetStatus }[] = [];
  for (const r of rows) {
    if (feed === "profile") continue; // profile ticks carry no yield of their own
    const next = updatePrior(r.prior, r.prior_n, r.weddings, r.fetched);
    const status = decideStatus(r.fetched, r.stack_posts, r.candidates);
    updates.push({ row: r, next, status });
    totals.fetched += r.fetched; totals.new_posts += r.new_posts; totals.stack_posts += r.stack_posts;
    totals.candidates += r.candidates; totals.weddings += r.weddings; totals.weddings_thin += r.weddings_thin;
    totals[status]++;
    const wpp = r.fetched > 0 ? (r.weddings / r.fetched).toFixed(2) : "-";
    console.log(
      `  ${r.username} | ${r.tier} | ${r.fetched} | ${r.new_posts} | ${r.stack_posts} | ${r.candidates} | ${r.weddings} | ${r.weddings_thin} | ${wpp} | ${r.prior.toFixed(2)} -> ${next.prior.toFixed(3)} | ${status}`
    );
  }
  const wppTotal = totals.fetched > 0 ? (totals.weddings / totals.fetched).toFixed(3) : "-";
  console.log(
    `[measure] totals: fetched=${totals.fetched} new=${totals.new_posts} stack=${totals.stack_posts} candidates=${totals.candidates} weddings=${totals.weddings} thin=${totals.weddings_thin} weddings/post=${wppTotal} | promising=${totals.promising} ambiguous=${totals.ambiguous} dead=${totals.dead}`
  );

  if (!apply) {
    console.log("[measure] dry run -- nothing written");
    await closePool();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    let seedsUpdated = 0;
    let targetsAppended = 0;
    for (const u of updates) {
      const r = u.row;
      await client.query(`update ops.crawl_run_seeds set stack_posts = $1 where run_id = $2 and account_id = $3`, [r.stack_posts, r.run_id, r.account_id]);
      seedsUpdated++;
      const targetFeed = r.feed === "own" ? "own" : "tagged";
      await client.query(
        `insert into ops.crawl_targets (account_id, canonical_account_id, feed, tier, prior_w_per_post, prior_n, status, features, last_run_id, note)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          r.account_id,
          r.canonical_account_id,
          targetFeed,
          r.tier,
          u.next.prior,
          u.next.n,
          u.status,
          JSON.stringify({ measured: { batch: batchId, fetched: r.fetched, new_posts: r.new_posts, stack_posts: r.stack_posts, candidates: r.candidates, weddings: r.weddings, weddings_thin: r.weddings_thin } }),
          r.run_id,
          `measure.ts after ${batchId}`,
        ]
      );
      targetsAppended++;
    }
    const versions = {
      stack_parser: STACK_PARSER_VERSION,
      prompt: EXTRACT_PROMPT_VERSION,
      clustering: [STRUCTURAL_CLUSTERING_VERSION, "structural-v3-a1"],
      reconciliation: "reconcile-v2",
      stamped_by: "measure.ts",
    };
    const { rowCount } = await client.query(
      `update ops.crawl_runs set pipeline_versions = $2::jsonb where batch_id = $1 and pipeline_versions is null`,
      [batchId, JSON.stringify(versions)]
    );
    await client.query("commit");
    console.log(`[measure] COMMITTED: seeds updated=${seedsUpdated}, target rows appended=${targetsAppended}, runs stamped=${rowCount}`);
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
  await closePool();
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
