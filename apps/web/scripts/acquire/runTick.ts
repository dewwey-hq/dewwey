/**
 * ACQUISITION LOOP (D061) — spends a budgeted slice of Apify credit on one "tick": a named,
 * dated batch of crawl targets at a given feed/tier. Registers `ops.crawl_targets` rows
 * (idempotent per account+feed+note), starts Apify runs in batches of 10 usernames, waits for
 * each, ingests it (calling ingest.ts's `ingestRun` directly, no shell-out), and stops the
 * instant projected spend would cross either `--max-cost-usd` or the account-wide $28.50 stop.
 *
 * Writes: ops.crawl_targets, ops.crawl_runs, ops.crawl_run_seeds, plus whatever ingestRun
 * writes for each run it ingests. Calls the Apify API (POST to start a run — the one paid,
 * non-read-only call anywhere in this loop) unless --dry-run or --resume-only-existing.
 *
 * Usage (from apps/web):
 *   bun run scripts/acquire/runTick.ts --tick <name> --feed tagged|own|profile \
 *     (--account-ids 1,2,3 | --usernames a,b,c) [--results-limit 25] \
 *     [--tier pilot|probe|probe6|discovered|canary|vendor|alias|deepen|recency_a|profile] \
 *     [--max-cost-usd 1.0] [--only-newer-than 2026-08-20] [--note "why"] \
 *     [--dry-run] [--resume]
 */
import { getPool, closePool } from "../classify/db";
import {
  ACTORS,
  PRICE_USD,
  buildInput,
  estimateCostUsd,
  getMonthlyUsageUsd,
  startRun,
  waitForRun,
  type Feed,
} from "./apifyClient";
import { ingestRun, normalizeHandle } from "./ingest";

/** Hard stop against the Apify account's live monthly usage, checked before every batch.
 *
 * D065 (2026-09-21): raised 28.5 -> 48.50. The old value existed to keep month 1 inside the Starter
 * plan's INCLUDED $29 and it did its job -- the D063 Stage 2 tick halted itself mid-run at $28.18.
 * But it is a self-imposed budget, not an account limit, and mistaking one for the other cost a
 * session: the account's real `maxMonthlyUsageUsd` is $100.
 *
 * SPENDING ABOVE $29 IS OVERAGE -- money billed beyond the subscription, against that $100 cap.
 * The user authorized a $20 test budget explicitly, so the ceiling is
 * usage-at-authorization ($28.18) + $20 = $48.50. Raising it further needs another explicit ask.
 *
 * Unchanged: the check runs before any paid call, projects at the conservative PRICE_USD rather
 * than the ~21%-lower rate we are actually billed, and fails CLOSED when the usage fetch errors. */
const MONTHLY_STOP_USD = 48.5;

/** D065: what to WRITE for `feed` in ops.*, which is a CONTENT type, not an actor name.
 *
 * `mentions` is the tagged feed pulled through the general actor so a date floor can apply, so it
 * records as 'tagged' -- that is what the content is, it keeps every downstream consumer
 * (ingest's posts.source, measure's rollup, targets' crawled-set) working unchanged, and it
 * satisfies crawl_runs_feed_check, which allows only tagged|own|profile. Which actor actually ran
 * is not lost: ops.crawl_runs.actor records it, and the input jsonb carries resultsType. */
function dbFeed(feed: Feed): "tagged" | "own" {
  return feed === "own" ? "own" : "tagged";
}
const BATCH_SIZE = 10;
const RUN_TIMEOUT_MS = 30 * 60 * 1000;
const SLEEP_BETWEEN_RUNS_MS = 20_000;

// Prior table (README §1). `canary` and `vendor` added 2026-09-19 (coordinator note, after this
// build started): canary = probe-tier prior for the canary tick's 25 top-band venues; vendor =
// pilot-tier prior for tagged feeds of non-venue Chicago vendors (planners/caterers/DJs etc.),
// a coverage lever found the same day. profile carries no yield prior of its own (0).
export const PRIOR_BY_TIER: Record<string, number> = {
  pilot: 0.35,
  // D063: `discover` = never-crawled venue accounts with no documented wedding, AFTER
  // disqualifyTarget() has removed out-of-area, umbrella, non-venue and house-of-worship handles.
  // Seeded at the measured realized rate of the qualified band rather than a guess: the top
  // quartile of the recalibrated prior realized 0.134 w/post with 82% of venues yielding >= 1.
  discover: 0.12,
  probe: 0.08,
  probe6: 0.12, // 6-15 bucket venues: documented elsewhere, own feed never crawled (2026-09-20 remainder tick)
  discovered: 0.08, // hop-1 frontier venues, same unknown as a probe
  canary: 0.08,
  vendor: 0.35,
  // D065, seeded at the arms' OWN measured realized rate rather than a guess (same discipline as
  // `discover` above). vendorthin = arm C: 129 weddings from 1,182 fetched = 0.109 w/post, the best
  // of the three arms and 9x arm A's depth-at-thin-venues. crossing = arm A: 18 from 1,496 = 0.012,
  // which is what a deep re-pull at an already-thin venue actually returns.
  vendorthin: 0.109,
  crossing: 0.012,
  alias: 0.2,
  deepen: 0.35,
  recency_a: 0.4,
  profile: 0,
};

/** Pure: `acq-<YYYYMMDD in America/Chicago>-<tick>`. */
export function formatBatchId(tick: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `acq-${y}${m}${d}-${tick}`;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface Args {
  tick: string;
  feed: Feed;
  accountIds: number[] | null;
  usernames: string[] | null;
  resultsLimit: number;
  tier: string | null;
  maxCostUsd: number;
  /** usernames per Apify run (default 10, the crawl-1 pace for tagged feeds; profiles tolerate 50). */
  batchSize: number;
  onlyNewerThan: string | null;
  note: string | null;
  dryRun: boolean;
  resume: boolean;
}

function usage(): never {
  console.error(
    "[run-tick] Usage:\n" +
      "  bun run scripts/acquire/runTick.ts --tick <name> --feed tagged|own|profile \\\n" +
      "    (--account-ids 1,2,3 | --usernames a,b,c) [--results-limit 25] \\\n" +
      "    [--tier pilot|probe|probe6|discovered|canary|vendor|alias|deepen|recency_a|profile] \\\n" +
      "    [--max-cost-usd 1.0] [--batch-size 10] [--only-newer-than 2026-08-20] [--note \"why\"] \\\n" +
      "    [--dry-run] [--resume]\n"
  );
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i === -1 ? null : argv[i + 1] ?? null;
  };
  const tick = get("--tick");
  const feed = get("--feed") as Feed | null;
  if (!tick || !feed || !(feed in ACTORS)) usage();
  const accountIdsRaw = get("--account-ids");
  const usernamesRaw = get("--usernames");
  if (!accountIdsRaw && !usernamesRaw) usage();
  return {
    tick,
    feed,
    accountIds: accountIdsRaw ? accountIdsRaw.split(",").map((s) => Number(s.trim())) : null,
    usernames: usernamesRaw ? usernamesRaw.split(",").map((s) => normalizeHandle(s)) : null,
    resultsLimit: Number(get("--results-limit") ?? "25"),
    tier: get("--tier"),
    maxCostUsd: Number(get("--max-cost-usd") ?? "1.0"),
    batchSize: Math.max(1, Number(get("--batch-size") ?? String(BATCH_SIZE))),
    onlyNewerThan: get("--only-newer-than"),
    note: get("--note"),
    dryRun: argv.includes("--dry-run"),
    resume: argv.includes("--resume"),
  };
}

interface ResolvedAccount {
  accountId: number | null;
  username: string;
}

async function resolveAccounts(args: Args, dryRun: boolean): Promise<ResolvedAccount[]> {
  const pool = getPool();
  if (args.accountIds) {
    const { rows } = await pool.query(
      `select id, username::text as username from accounts where id = any($1::bigint[])`,
      [args.accountIds]
    );
    return rows.map((r) => ({ accountId: r.id, username: normalizeHandle(r.username) }));
  }
  const usernames = args.usernames!;
  if (dryRun) {
    return usernames.map((u) => ({ accountId: null, username: u }));
  }
  const out: ResolvedAccount[] = [];
  for (const u of usernames) {
    const { rows } = await pool.query(
      `insert into accounts (username) values ($1) on conflict (username) do update set username = excluded.username returning id`,
      [u]
    );
    out.push({ accountId: rows[0].id, username: u });
  }
  return out;
}

async function canonicalAccountId(accountId: number): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(`select canonical_account_id from account_aliases where alias_account_id = $1`, [accountId]);
  return rows.length > 0 ? rows[0].canonical_account_id : accountId;
}

/** Registers (idempotently) one ops.crawl_targets row per account and returns account_id -> target_id. */
async function ensureTargets(
  accounts: ResolvedAccount[],
  feed: Feed,
  tier: string,
  targetNote: string
): Promise<Map<number, number>> {
  const pool = getPool();
  const targetsFeed = dbFeed(feed);
  const targetsTier = feed === "profile" ? "profile" : tier;
  const prior = PRIOR_BY_TIER[targetsTier] ?? 0;
  const idByAccount = new Map<number, number>();

  for (const a of accounts) {
    if (a.accountId === null) continue;
    const { rows: existing } = await pool.query(
      `select id from ops.crawl_targets where account_id = $1 and feed = $2 and note = $3`,
      [a.accountId, targetsFeed, targetNote]
    );
    if (existing.length > 0) {
      idByAccount.set(a.accountId, existing[0].id);
      continue;
    }
    const canonicalId = await canonicalAccountId(a.accountId);
    const { rows } = await pool.query(
      `insert into ops.crawl_targets (account_id, canonical_account_id, feed, tier, prior_w_per_post, prior_n, status, features, note)
       values ($1,$2,$3,$4,$5,0,'unknown','{}'::jsonb,$6) returning id`,
      [a.accountId, canonicalId, targetsFeed, targetsTier, prior, targetNote]
    );
    idByAccount.set(a.accountId, rows[0].id);
  }
  return idByAccount;
}

interface RunSummary {
  runId: number | null;
  status: string;
  items: number | null;
  costUsd: number | null;
}

async function processExistingRun(runId: number, status: string): Promise<RunSummary> {
  const pool = getPool();
  if (status === "started") {
    const { rows } = await pool.query(`select apify_run_id, dataset_id, feed from ops.crawl_runs where id = $1`, [runId]);
    const apifyRunId = rows[0]?.apify_run_id as string | null;
    const datasetId = rows[0]?.dataset_id as string | null;
    const feed = rows[0]?.feed as Feed;
    if (!apifyRunId) {
      await pool.query(`update ops.crawl_runs set status = 'failed', note = 'no apify_run_id to resume' where id = $1`, [runId]);
      return { runId, status: "failed", items: null, costUsd: null };
    }
    const result = await waitForRun(apifyRunId, { timeoutMs: RUN_TIMEOUT_MS });
    if (result.status !== "SUCCEEDED") {
      await pool.query(`update ops.crawl_runs set status = 'failed', note = $2 where id = $1`, [runId, `apify status ${result.status}`]);
      return { runId, status: "failed", items: null, costUsd: null };
    }
    const { getDatasetItems } = await import("./apifyClient");
    const items = await getDatasetItems(datasetId ?? result.datasetId);
    const costUsd = items.length * PRICE_USD[feed];
    await pool.query(`update ops.crawl_runs set status = 'succeeded', items = $2, cost_usd = $3, finished_at = now() where id = $1`, [
      runId,
      items.length,
      costUsd,
    ]);
  }
  await ingestRun(runId, { dryRun: false, noImages: false });
  const { rows: after } = await pool.query(`select status, items, cost_usd from ops.crawl_runs where id = $1`, [runId]);
  return { runId, status: after[0]?.status ?? "ingested", items: after[0]?.items ?? null, costUsd: after[0]?.cost_usd ?? null };
}

async function resumeTick(batchId: string): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select id, status from ops.crawl_runs where batch_id = $1 and status in ('started','succeeded') order by id`,
    [batchId]
  );
  if (rows.length === 0) {
    console.log(`[run-tick] --resume: no started/succeeded runs found for batch ${batchId}`);
    return;
  }
  for (const r of rows) {
    console.log(`[run-tick] resuming run ${r.id} (was ${r.status})`);
    try {
      const summary = await processExistingRun(r.id, r.status);
      console.log(`[run-tick] run ${summary.runId}: ${summary.status}, items=${summary.items}, cost=$${summary.costUsd}`);
    } catch (e) {
      console.error(`[run-tick] run ${r.id} resume failed:`, e);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const batchId = formatBatchId(args.tick);
  const targetNote = args.note ? `${batchId} ${args.note}` : batchId;

  if (args.resume) {
    await resumeTick(batchId);
    await closePool();
    return;
  }

  const accounts = await resolveAccounts(args, args.dryRun);
  const batches = chunk(accounts, args.batchSize);
  const tier =
    args.feed === "profile" ? "profile" : args.tier ?? (args.tick in PRIOR_BY_TIER ? args.tick : null);
  if (!tier) {
    console.error(`[run-tick] --tier is required (tick name '${args.tick}' isn't a known tier) -- pass --tier explicitly`);
    process.exit(1);
  }

  if (args.dryRun) {
    console.log(`[run-tick] DRY RUN batch_id=${batchId} feed=${args.feed} tier=${tier} accounts=${accounts.length} results_limit=${args.resultsLimit}`);
    let currentUsage = 0;
    try {
      currentUsage = await getMonthlyUsageUsd();
    } catch (e) {
      console.error(`[run-tick] could not fetch monthly usage (continuing dry-run without it):`, e);
    }
    console.log(`[run-tick] current monthly usage: $${currentUsage.toFixed(2)} (stop at $${MONTHLY_STOP_USD})`);
    let total = 0;
    for (const [i, b] of batches.entries()) {
      const usernames = b.map((a) => a.username);
      const input = buildInput(args.feed, usernames, {
        resultsLimit: args.resultsLimit,
        onlyPostsNewerThan: args.onlyNewerThan ?? undefined,
      });
      const cost = estimateCostUsd(args.feed, usernames.length, args.resultsLimit);
      total += cost;
      console.log(`[run-tick] run ${i + 1}/${batches.length}: ${usernames.join(", ")}`);
      console.log(`  actor=${ACTORS[args.feed]} input=${JSON.stringify(input)}`);
      console.log(`  projected cost: $${cost.toFixed(4)}`);
    }
    console.log(`[run-tick] projected total: $${total.toFixed(4)} (max $${args.maxCostUsd})`);
    return;
  }

  const targetIdByAccount = await ensureTargets(accounts, args.feed, tier, targetNote);
  const pool = getPool();

  let spentThisTick = 0;
  const summaries: RunSummary[] = [];

  for (const [i, b] of batches.entries()) {
    const usernames = b.map((a) => a.username);
    const projected = estimateCostUsd(args.feed, usernames.length, args.resultsLimit);

    if (spentThisTick + projected > args.maxCostUsd) {
      console.log(`[run-tick] stopping: batch ${i + 1} would push tick spend to $${(spentThisTick + projected).toFixed(2)} > --max-cost-usd $${args.maxCostUsd}`);
      break;
    }
    let monthlyUsage: number;
    try {
      monthlyUsage = await getMonthlyUsageUsd();
    } catch (e) {
      console.error(`[run-tick] could not fetch monthly usage, stopping out of caution:`, e);
      break;
    }
    if (monthlyUsage + projected > MONTHLY_STOP_USD) {
      console.log(`[run-tick] stopping: monthly usage $${monthlyUsage.toFixed(2)} + projected $${projected.toFixed(2)} > $${MONTHLY_STOP_USD} stop`);
      break;
    }

    const input = buildInput(args.feed, usernames, {
      resultsLimit: args.resultsLimit,
      onlyPostsNewerThan: args.onlyNewerThan ?? undefined,
    });

    const { rows: runRows } = await pool.query(
      `insert into ops.crawl_runs (batch_id, actor, feed, input, status, note)
       values ($1,$2,$3,$4,'started',$5) returning id`,
      [batchId, ACTORS[args.feed], dbFeed(args.feed), JSON.stringify(input), args.note]
    );
    const runId = runRows[0].id as number;

    for (const a of b) {
      if (a.accountId === null) continue;
      const targetId = targetIdByAccount.get(a.accountId) ?? null;
      await pool.query(
        `insert into ops.crawl_run_seeds (run_id, account_id, target_id, requested) values ($1,$2,$3,$4)
         on conflict (run_id, account_id) do nothing`,
        [runId, a.accountId, targetId, args.resultsLimit]
      );
    }

    try {
      const handle = await startRun(ACTORS[args.feed], input);
      await pool.query(`update ops.crawl_runs set apify_run_id = $1, dataset_id = $2 where id = $3`, [
        handle.runId,
        handle.datasetId,
        runId,
      ]);

      const result = await waitForRun(handle.runId, { timeoutMs: RUN_TIMEOUT_MS });
      if (result.status !== "SUCCEEDED") {
        await pool.query(`update ops.crawl_runs set status = 'failed', note = $2 where id = $1`, [
          runId,
          `apify status ${result.status}`,
        ]);
        console.log(`[run-tick] run ${runId} FAILED (apify status ${result.status}) -- continuing with next batch`);
        summaries.push({ runId, status: "failed", items: null, costUsd: null });
        continue;
      }

      // items/cost -- getDatasetItems is called again inside ingestRun; count here from the run.
      const { getDatasetItems } = await import("./apifyClient");
      const items = await getDatasetItems(handle.datasetId);
      const costUsd = items.length * PRICE_USD[args.feed];
      await pool.query(`update ops.crawl_runs set status = 'succeeded', items = $2, cost_usd = $3, finished_at = now() where id = $1`, [
        runId,
        items.length,
        costUsd,
      ]);
      spentThisTick += costUsd;

      await ingestRun(runId, { dryRun: false, noImages: false });
      console.log(`[run-tick] run ${runId} ingested: ${items.length} items, $${costUsd.toFixed(4)}`);
      summaries.push({ runId, status: "ingested", items: items.length, costUsd });
    } catch (e) {
      console.error(`[run-tick] run ${runId} error:`, e);
      await pool.query(`update ops.crawl_runs set status = 'failed', note = $2 where id = $1`, [
        runId,
        String(e).slice(0, 500),
      ]);
      summaries.push({ runId, status: "failed", items: null, costUsd: null });
    }

    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, SLEEP_BETWEEN_RUNS_MS));
    }
  }

  const totalCost = summaries.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const totalItems = summaries.reduce((s, r) => s + (r.items ?? 0), 0);
  console.log(
    `[run-tick] DONE batch_id=${batchId}: ${summaries.length} runs, ${summaries.filter((s) => s.status === "ingested").length} ingested, ${summaries.filter((s) => s.status === "failed").length} failed, ${totalItems} items, $${totalCost.toFixed(4)} spent`
  );

  await closePool();
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
