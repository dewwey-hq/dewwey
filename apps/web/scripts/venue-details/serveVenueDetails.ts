/**
 * Picks the run to serve per account and moves the `venue_details` pointer -- the SERVE step of
 * the extraction loop (plan: "serve (new version, pointer move) or review queue"). Same
 * dry-run-by-default, `--batch-id`-required, printed-revert shape as `scripts/graph/seedVenueTypes.ts`.
 *
 * Selection (any explicit `--run-id` skips this): the latest run (any stage) for `--prompt-version`
 * (default DEFAULT_PROMPT_VERSION) whose `validation.ok` is true (or `--allow-needs-review`),
 * preferring a `repair` child over its parent when both validate (`serve/computeServeRow.ts`'s
 * `pickRunToServe`).
 *
 * Steps per account: load active corrections -> applyCorrections -> set provenance -> diffVersions
 * against the current served document -> compute denormalized columns -> in a transaction, insert
 * a new `venue_details_versions` row and upsert the `venue_details` pointer + denorm columns.
 *
 * TODO (plan "Provenance model", case 5, LATER): stale-correction detection (`needs_recheck`) is
 * not implemented here -- corrections are applied as-is regardless of whether the evidence
 * snapshot they were made against has since been superseded.
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/serveVenueDetails.ts --batch-id vd-golden-1 --account-ids 31,477 --dry-run
 *   bun run scripts/venue-details/serveVenueDetails.ts --batch-id vd-golden-1 --account-ids 31,477 --apply
 *   bun run scripts/venue-details/serveVenueDetails.ts --batch-id vd-golden-1 --run-id 4821 --apply
 *   bun run scripts/venue-details/serveVenueDetails.ts --batch-id vd-p3-1 --limit 70 --only-verified --apply
 */
import type { PoolClient } from "pg";
import { getPool, closePool } from "../classify/db";
import { applyCorrections, type Correction } from "../../lib/venueDetails/merge";
import { diffVersions } from "../../lib/venueDetails/diff";
import type { VenueDetailsV3 } from "../../lib/venueDetails/types";
import { DEFAULT_PROMPT_VERSION, type RunRow } from "./contract";
import { computeDenormalizedColumns, computeLastChangedAt, nextVersionNo, pickRunToServe, summarizeChanges } from "./serve/computeServeRow";
import { persistVersion } from "./serve/persistVersion";

type ServeReason = "extract" | "repair" | "prompt_bump" | "correction";

interface Args {
  batchId: string;
  apply: boolean;
  runId: number | null;
  accountIds: number[] | null;
  limit: number | null;
  onlyVerified: boolean;
  promptVersion: string;
  allowNeedsReview: boolean;
  reason: ServeReason;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const batchId = get("--batch-id");
  if (!batchId || batchId.startsWith("--")) {
    console.error(
      "[serve-venue-details] --batch-id <id> is required.\n" +
        "Usage: bun run scripts/venue-details/serveVenueDetails.ts --batch-id <id> [--apply] [--run-id N] " +
        "[--account-ids 1,2] [--limit N] [--only-verified] [--prompt-version v] [--allow-needs-review] " +
        "[--reason extract|repair|prompt_bump|correction]\n" +
        "Default (no --apply) is a dry run."
    );
    process.exit(1);
  }
  const accountIdsRaw = get("--account-ids");
  const reason = (get("--reason") ?? "extract") as ServeReason;
  if (!["extract", "repair", "prompt_bump", "correction"].includes(reason)) {
    console.error(`[serve-venue-details] --reason must be one of extract|repair|prompt_bump|correction (got: ${reason})`);
    process.exit(1);
  }
  return {
    batchId,
    apply: a.includes("--apply"),
    runId: get("--run-id") ? Number(get("--run-id")) : null,
    accountIds: accountIdsRaw ? accountIdsRaw.split(",").map((s) => Number(s.trim())) : null,
    limit: get("--limit") ? Number(get("--limit")) : null,
    onlyVerified: a.includes("--only-verified"),
    promptVersion: get("--prompt-version") ?? DEFAULT_PROMPT_VERSION,
    allowNeedsReview: a.includes("--allow-needs-review"),
    reason,
  };
}

interface CurrentRow {
  account_id: number;
  current_version_id: number | null;
  human_verified_at: string | null;
  last_changed_at: string | null;
  website_url: string | null;
}

async function loadTargetAccountIds(client: PoolClient, args: Args): Promise<number[]> {
  if (args.runId != null) {
    const { rows } = await client.query<{ account_id: number }>(`select account_id from venue_details_runs where id = $1`, [args.runId]);
    if (rows.length === 0) throw new Error(`--run-id ${args.runId}: no such run`);
    return [rows[0].account_id];
  }
  if (args.accountIds) return args.accountIds;

  // Every account that has at least one run for this prompt_version -- pickRunToServe narrows it
  // down to a servable one (or none) per account below.
  const params: unknown[] = [args.promptVersion];
  let sql = `select distinct r.account_id from venue_details_runs r where r.prompt_version = $1`;
  if (args.onlyVerified) {
    sql += ` and exists (select 1 from venue_details vd where vd.account_id = r.account_id and vd.human_verified_at is not null)`;
  }
  sql += ` order by r.account_id`;
  if (args.limit != null) {
    params.push(args.limit);
    sql += ` limit $${params.length}`;
  }
  const { rows } = await client.query<{ account_id: number }>(sql, params);
  return rows.map((r) => r.account_id);
}

async function loadRuns(client: PoolClient, accountId: number): Promise<RunRow[]> {
  const { rows } = await client.query<RunRow>(
    `select id, account_id, prompt_version, schema_version, model, stage, parent_run_id, input_hash,
            snapshot_ids, website_url, validation, spine_stated_count, critical_failures, cost_usd, created_at
     from venue_details_runs where account_id = $1 order by created_at desc`,
    [accountId]
  );
  return rows;
}

async function loadRunById(client: PoolClient, runId: number): Promise<RunRow> {
  const { rows } = await client.query<RunRow>(
    `select id, account_id, prompt_version, schema_version, model, stage, parent_run_id, input_hash,
            snapshot_ids, website_url, validation, spine_stated_count, critical_failures, cost_usd, created_at
     from venue_details_runs where id = $1`,
    [runId]
  );
  if (rows.length === 0) throw new Error(`run ${runId} not found`);
  return rows[0];
}

async function loadActiveCorrections(client: PoolClient, accountId: number): Promise<Correction[]> {
  // Effective correction per field_path = the latest row (spec resolution: "Corrections are
  // genuinely append-only" -- no status column, so DISTINCT ON created_at desc IS the "active" set).
  const { rows } = await client.query<{ id: number; field_path: string; action: Correction["action"]; value: unknown; created_at: string }>(
    `select distinct on (field_path) id, field_path, action, value, created_at
     from venue_details_corrections
     where account_id = $1
     order by field_path, created_at desc`,
    [accountId]
  );
  // A 'retire' action clears the field (applyCorrections treats unset/retire identically) --
  // still pass it through so applyCorrections sets NOT_STATED rather than leaving a stale value.
  return rows;
}

async function loadCurrentRow(client: PoolClient, accountId: number): Promise<CurrentRow | null> {
  const { rows } = await client.query<CurrentRow>(
    `select account_id, current_version_id, human_verified_at, last_changed_at, website_url from venue_details where account_id = $1`,
    [accountId]
  );
  return rows[0] ?? null;
}

async function loadPrevDetails(client: PoolClient, versionId: number | null): Promise<{ details: VenueDetailsV3; version_no: number } | null> {
  if (versionId == null) return null;
  const { rows } = await client.query<{ details: VenueDetailsV3; version_no: number }>(`select details, version_no from venue_details_versions where id = $1`, [
    versionId,
  ]);
  return rows[0] ?? null;
}

async function newestFetchTime(client: PoolClient, accountId: number, snapshotIds: number[]): Promise<string | null> {
  if (snapshotIds.length > 0) {
    const { rows } = await client.query<{ max: string | null }>(`select max(fetched_at) from venue_source_fetches where snapshot_id = any($1::bigint[])`, [
      snapshotIds,
    ]);
    if (rows[0]?.max) return rows[0].max;
  }
  const { rows } = await client.query<{ max: string | null }>(`select max(fetched_at) from venue_source_fetches where account_id = $1`, [accountId]);
  return rows[0]?.max ?? null;
}

async function main() {
  const args = parseArgs();
  const pool = getPool();
  const client = await pool.connect();

  try {
    console.log(`[serve-venue-details] mode: ${args.apply ? "APPLY (real write)" : "DRY RUN (no write)"}`);
    console.log(`[serve-venue-details] batch_id: ${args.batchId}, prompt_version: ${args.promptVersion}, reason: ${args.reason}`);

    const accountIds = await loadTargetAccountIds(client, args);
    console.log(`[serve-venue-details] candidate accounts: ${accountIds.length}`);

    let served = 0;
    let skipped = 0;

    for (const accountId of accountIds) {
      const run = args.runId != null ? await loadRunById(client, args.runId) : pickRunToServe(await loadRuns(client, accountId), {
        promptVersion: args.promptVersion,
        allowNeedsReview: args.allowNeedsReview,
      });

      if (!run) {
        console.log(`  account ${accountId}: SKIP -- no servable run (validation.ok, prompt_version=${args.promptVersion}${args.allowNeedsReview ? ", needs_review allowed" : ""})`);
        skipped++;
        continue;
      }
      if (!run.validation) {
        console.log(`  account ${accountId}: SKIP -- run ${run.id} has no validation payload`);
        skipped++;
        continue;
      }

      const current = await loadCurrentRow(client, accountId);
      const prev = await loadPrevDetails(client, current?.current_version_id ?? null);
      const corrections = await loadActiveCorrections(client, accountId);

      const { details: corrected, applied } = applyCorrections(run.validation.document, corrections);
      const versionNo = nextVersionNo(prev?.version_no ?? null);
      const changes = diffVersions(prev?.details ?? null, corrected);

      const denorm = computeDenormalizedColumns(corrected, {
        criticalGroundingFailures: run.critical_failures ?? run.validation.critical_failures ?? 0,
        needsReview: run.validation.needs_review,
        reviewReasons: run.validation.review_reasons,
      });

      const now = new Date().toISOString();
      const lastChangedAt = computeLastChangedAt({ changes, isFirstVersion: prev == null, prevLastChangedAt: current?.last_changed_at ?? null, now });
      const websiteUrl = run.website_url ?? current?.website_url ?? null;
      const lastCheckedAt = (await newestFetchTime(client, accountId, run.snapshot_ids ?? [])) ?? now;

      const summary = summarizeChanges(changes);
      console.log(
        `  account ${accountId}: run ${run.id} (${run.stage}) -> version ${versionNo}, changes: ${summary.total} ` +
          `(added ${summary.byKind.added}, changed ${summary.byKind.changed}, removed ${summary.byKind.removed}), ` +
          `compare_ready=${denorm.compare_ready}, needs_review=${denorm.needs_review}` +
          (summary.firstPaths.length ? `\n      first paths: ${summary.firstPaths.join(", ")}` : "")
      );

      if (!args.apply) {
        console.log(`      [dry-run] revert plan: bun run scripts/venue-details/rollbackVenueDetails.ts --account-id ${accountId} --to-version ${prev?.version_no ?? 0} --note "revert vd-serve" --apply`);
        continue;
      }

      await client.query("begin");
      try {
        const { versionId } = await persistVersion(client, {
          accountId,
          versionNo,
          details: corrected,
          runId: run.id,
          correctionIds: applied,
          changes,
          reason: args.reason,
          batchId: args.batchId,
          createdBy: "serveVenueDetails",
          rollbackOfVersionId: null,
          promptVersion: run.prompt_version,
          criticalGroundingFailures: run.critical_failures ?? run.validation.critical_failures ?? 0,
          needsReview: run.validation.needs_review,
          reviewReasons: run.validation.review_reasons,
          provenanceCarry: { humanVerifiedAt: current?.human_verified_at ?? null, verifiedBy: null },
          humanVerifiedAt: current?.human_verified_at ?? null,
          verifiedVersionId: current?.human_verified_at ? (current.current_version_id ?? null) : null,
          lastCheckedAt,
          lastChangedAt,
          websiteUrl,
        });

        await client.query("commit");
        served++;
        console.log(`      APPLIED -- version ${versionNo} (id ${versionId})`);
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
    }

    console.log(`\n[serve-venue-details] done. served=${served} skipped=${skipped}`);
    if (args.apply && served > 0) {
      console.log(`[serve-venue-details] to revert this batch: bun run scripts/venue-details/rollbackVenueDetails.ts --batch-id ${args.batchId} --apply`);
    }
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
