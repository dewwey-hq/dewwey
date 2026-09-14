/**
 * Rolls a served venue back to a prior version -- never deletes, always writes a NEW version
 * copying the target's `details` (plan: "versions are linear; --to-version N writes a new version
 * copying N and moves the pointer"). Shares `persistVersion` with `serveVenueDetails.ts` so the
 * pointer + denormalized columns are always recomputed the same way regardless of entry point.
 *
 * Two modes:
 *  - `--account-id --to-version N`: roll one account back to version N.
 *  - `--batch-id <served-batch>`: for every account whose CURRENT version has that batch_id, roll
 *    back to the version immediately before it (each as its own new version) -- the plan's "batch
 *    rollback" is LATER, but this narrow form (undo exactly one serve batch) is ~the same one-venue
 *    logic run per account, which the plan explicitly scopes as NOW ("single-venue rollback").
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/rollbackVenueDetails.ts --account-id 31 --to-version 2 --note "bad price" --batch-id vd-rollback-1
 *   bun run scripts/venue-details/rollbackVenueDetails.ts --account-id 31 --to-version 2 --note "bad price" --batch-id vd-rollback-1 --apply
 *   bun run scripts/venue-details/rollbackVenueDetails.ts --undo-batch vd-serve-1 --note "undo bad batch" --batch-id vd-rollback-2 --apply
 */
import type { PoolClient } from "pg";
import { getPool, closePool } from "../classify/db";
import type { VenueDetailsV3 } from "../../lib/venueDetails/types";
import { diffVersions } from "../../lib/venueDetails/diff";
import { computeLastChangedAt, nextVersionNo, summarizeChanges } from "./serve/computeServeRow";
import { persistVersion } from "./serve/persistVersion";

interface Args {
  accountId: number | null;
  toVersion: number | null;
  undoBatchId: string | null; // the PRIOR serve batch_id being undone
  note: string;
  batchId: string; // this rollback's own batch_id
  apply: boolean;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const batchId = get("--batch-id");
  const accountId = get("--account-id") ? Number(get("--account-id")) : null;
  const toVersion = get("--to-version") ? Number(get("--to-version")) : null;
  const note = get("--note") ?? null;

  if (!batchId) {
    console.error(
      "[rollback-venue-details] --batch-id <id> is required (this rollback's own batch id).\n" +
        "Usage:\n" +
        "  bun run scripts/venue-details/rollbackVenueDetails.ts --account-id N --to-version N --note \"<why>\" --batch-id <id> [--apply]\n" +
        "  bun run scripts/venue-details/rollbackVenueDetails.ts --undo-batch <served-batch-id> --note \"<why>\" --batch-id <id> [--apply]"
    );
    process.exit(1);
  }
  if (!note) {
    console.error('[rollback-venue-details] --note "<why>" is required.');
    process.exit(1);
  }

  const undoBatchId = get("--undo-batch") ?? null;
  if (accountId == null && undoBatchId == null) {
    console.error("[rollback-venue-details] pass either --account-id --to-version, or --undo-batch <served-batch-id>.");
    process.exit(1);
  }
  if (accountId != null && toVersion == null) {
    console.error("[rollback-venue-details] --account-id requires --to-version N.");
    process.exit(1);
  }

  return { accountId, toVersion, undoBatchId, note, batchId, apply: a.includes("--apply") };
}

interface TargetPlan {
  accountId: number;
  toVersionId: number;
  toVersionNo: number;
}

async function planSingle(client: PoolClient, accountId: number, toVersion: number): Promise<TargetPlan> {
  const { rows } = await client.query<{ id: number }>(`select id from venue_details_versions where account_id = $1 and version_no = $2`, [accountId, toVersion]);
  if (rows.length === 0) throw new Error(`account ${accountId}: no version ${toVersion}`);
  return { accountId, toVersionId: rows[0].id, toVersionNo: toVersion };
}

async function planBatchUndo(client: PoolClient, undoBatchId: string): Promise<TargetPlan[]> {
  const { rows } = await client.query<{ account_id: number; current_version_id: number }>(
    `select account_id, current_version_id from venue_details where batch_id = $1`,
    [undoBatchId]
  );
  const plans: TargetPlan[] = [];
  for (const row of rows) {
    const { rows: curRows } = await client.query<{ version_no: number }>(`select version_no from venue_details_versions where id = $1`, [row.current_version_id]);
    const currentVersionNo = curRows[0]?.version_no;
    if (currentVersionNo == null || currentVersionNo <= 1) {
      console.log(`  account ${row.account_id}: SKIP -- current version (${currentVersionNo ?? "?"}) has no prior version to roll back to`);
      continue;
    }
    const target = currentVersionNo - 1;
    const { rows: targetRows } = await client.query<{ id: number }>(`select id from venue_details_versions where account_id = $1 and version_no = $2`, [
      row.account_id,
      target,
    ]);
    if (targetRows.length === 0) continue;
    plans.push({ accountId: row.account_id, toVersionId: targetRows[0].id, toVersionNo: target });
  }
  return plans;
}

async function main() {
  const args = parseArgs();
  const pool = getPool();
  const client = await pool.connect();

  try {
    console.log(`[rollback-venue-details] mode: ${args.apply ? "APPLY (real write)" : "DRY RUN (no write)"}`);
    console.log(`[rollback-venue-details] batch_id: ${args.batchId}, note: ${args.note}`);

    const plans =
      args.accountId != null
        ? [await planSingle(client, args.accountId, args.toVersion as number)]
        : await planBatchUndo(client, args.undoBatchId as string);

    console.log(`[rollback-venue-details] accounts to roll back: ${plans.length}`);

    let done = 0;
    for (const plan of plans) {
      const { rows } = await client.query<{ details: VenueDetailsV3 }>(`select details from venue_details_versions where id = $1`, [plan.toVersionId]);
      const targetDetails = rows[0].details;

      const { rows: currentRows } = await client.query<{ current_version_id: number; human_verified_at: string | null; last_changed_at: string | null; website_url: string | null }>(
        `select current_version_id, human_verified_at, last_changed_at, website_url from venue_details where account_id = $1`,
        [plan.accountId]
      );
      const current = currentRows[0];
      const { rows: currentDetailsRows } = await client.query<{ details: VenueDetailsV3; version_no: number }>(
        `select details, version_no from venue_details_versions where id = $1`,
        [current.current_version_id]
      );
      const prevDetails = currentDetailsRows[0].details;
      const prevVersionNo = currentDetailsRows[0].version_no;

      const changes = diffVersions(prevDetails, targetDetails);
      const versionNo = nextVersionNo(prevVersionNo);
      const summary = summarizeChanges(changes);

      console.log(
        `  account ${plan.accountId}: rollback to version ${plan.toVersionNo} -> new version ${versionNo}, changes: ${summary.total} ` +
          `(added ${summary.byKind.added}, changed ${summary.byKind.changed}, removed ${summary.byKind.removed})`
      );

      if (!args.apply) continue;

      const now = new Date().toISOString();
      const lastChangedAt = computeLastChangedAt({ changes, isFirstVersion: false, prevLastChangedAt: current.last_changed_at, now });

      await client.query("begin");
      try {
        const { versionId } = await persistVersion(client, {
          accountId: plan.accountId,
          versionNo,
          details: targetDetails,
          runId: null,
          correctionIds: targetDetails.provenance?.correction_ids ?? [],
          changes,
          reason: "rollback",
          batchId: args.batchId,
          // `venue_details_versions` has no free-text note/reason column (see applyVenueDetailsSchema.ts
          // DDL) -- the required --note is folded into created_by, the only free-text field on the row.
          createdBy: `rollbackVenueDetails: ${args.note}`,
          rollbackOfVersionId: plan.toVersionId,
          promptVersion: targetDetails.extraction?.prompt_version ?? null,
          // A rollback restores a document that already passed its own validation when first
          // served; there is no fresh validation payload to re-derive tier failures from, so
          // treat it as clean (0 critical failures, not needs_review) -- the SAME assumption the
          // target version itself served under, since that's exactly what we're restoring.
          criticalGroundingFailures: 0,
          needsReview: false,
          reviewReasons: [],
          provenanceCarry: { humanVerifiedAt: current.human_verified_at, verifiedBy: null },
          humanVerifiedAt: current.human_verified_at,
          verifiedVersionId: current.human_verified_at ? current.current_version_id : null,
          lastCheckedAt: now,
          lastChangedAt,
          websiteUrl: current.website_url,
        });
        await client.query("commit");
        done++;
        console.log(`      APPLIED -- version ${versionNo} (id ${versionId}), rollback_of_version_id=${plan.toVersionId}`);
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
    }

    console.log(`\n[rollback-venue-details] done. ${args.apply ? `rolled back ${done}` : `would roll back ${plans.length}`}`);
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
