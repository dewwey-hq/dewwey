/**
 * Appends one human correction row (`venue_details_corrections` -- genuinely append-only, no
 * status/superseded_by column: the latest row per `(account_id, field_path)` is the effective one,
 * `retire` clears it). Validates the correction BEFORE inserting by applying it to the currently
 * served document (`applyCorrections`) and re-checking enum validity + `isCompareReady`, printing
 * the before/after of the field so a human reviewing `--dry-run` output can see the actual effect.
 *
 * This is for the ~10 spot-check fixes the plan calls out (Phase 3), not a bulk-editing tool --
 * `/lab/venue?u=` is the review surface for anything larger.
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/addCorrection.ts --account-id 31 --path /spine/catering \
 *     --value-json '"open"' --reason "venue confirmed by phone" --by ben --evidence-url https://example.com --batch-id vd-corr-1
 *   bun run scripts/venue-details/addCorrection.ts --account-id 31 --path /spine/catering --unset \
 *     --reason "no longer confident" --by ben --evidence-url https://example.com --batch-id vd-corr-1 --apply
 *   bun run scripts/venue-details/addCorrection.ts --account-id 31 --path /spine/catering --retire \
 *     --reason "restored to extracted value" --by ben --evidence-url https://example.com --batch-id vd-corr-1 --apply
 */
import { getPool, closePool } from "../classify/db";
import { applyCorrections, type Correction } from "../../lib/venueDetails/merge";
import { isCompareReady } from "../../lib/venueDetails/tiers";
import type { VenueDetailsV3 } from "../../lib/venueDetails/types";
import { checkEnumValidity } from "./serve/enumCheck";

type Action = "set" | "unset" | "retire";

interface Args {
  accountId: number;
  path: string;
  action: Action;
  valueJson: string | null;
  reason: string;
  by: string;
  evidenceUrl: string;
  evidenceSnapshotId: number | null;
  batchId: string;
  apply: boolean;
}

function usage(): never {
  console.error(
    "[add-correction] Usage:\n" +
      "  bun run scripts/venue-details/addCorrection.ts --account-id N --path <field_path> " +
      "(--value-json '<json>' | --unset | --retire) --reason <text> --by <name> --evidence-url <url> " +
      "[--evidence-snapshot-id N] --batch-id <id> [--apply]\n" +
      "Default (no --apply) is a dry run.\n"
  );
  process.exit(1);
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };

  const accountId = get("--account-id") ? Number(get("--account-id")) : null;
  const path = get("--path") ?? null;
  const reason = get("--reason") ?? null;
  const by = get("--by") ?? null;
  const evidenceUrl = get("--evidence-url") ?? null;
  const batchId = get("--batch-id") ?? null;

  if (!accountId || !path || !reason || !by || !evidenceUrl || !batchId) usage();

  const isUnset = a.includes("--unset");
  const isRetire = a.includes("--retire");
  const valueJson = get("--value-json") ?? null;
  if ([isUnset, isRetire, valueJson != null].filter(Boolean).length !== 1) {
    console.error("[add-correction] pass exactly one of --value-json '<json>', --unset, --retire.");
    usage();
  }
  const action: Action = isRetire ? "retire" : isUnset ? "unset" : "set";

  return {
    accountId: accountId as number,
    path: path as string,
    action,
    valueJson,
    reason: reason as string,
    by: by as string,
    evidenceUrl: evidenceUrl as string,
    evidenceSnapshotId: get("--evidence-snapshot-id") ? Number(get("--evidence-snapshot-id")) : null,
    batchId: batchId as string,
    apply: a.includes("--apply"),
  };
}

function resolveFieldValueForDisplay(d: VenueDetailsV3, path: string): unknown {
  const parts = path.split("/").filter(Boolean);
  const [root, id, propOrSub] = parts;
  if (root === "spine") return (d.spine as unknown as Record<string, unknown>)[id];
  if (root === "spaces") return d.spaces.find((s) => s.id === id);
  if (root === "capacities") return d.capacities.find((c) => `${c.space_id}:${c.layout}` === id);
  if (root === "pricing" && id === "add_ons") return d.pricing.add_ons.find((x) => x.id === propOrSub);
  if (root === "faqs") return d.faqs.find((f) => f.question.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") === id);
  return undefined;
}

async function main() {
  const args = parseArgs();
  const pool = getPool();

  console.log(`[add-correction] mode: ${args.apply ? "APPLY (real write)" : "DRY RUN (no write)"}`);
  console.log(`[add-correction] account ${args.accountId}, path ${args.path}, action ${args.action}, batch_id ${args.batchId}`);

  let value: unknown = null;
  if (args.action === "set") {
    try {
      value = JSON.parse(args.valueJson as string);
    } catch (e) {
      console.error(`[add-correction] --value-json is not valid JSON: ${(e as Error).message}`);
      process.exit(1);
    }
    const enumCheck = checkEnumValidity(args.path, value);
    if (!enumCheck.ok) {
      console.error(`[add-correction] REJECTED -- ${enumCheck.reason}`);
      process.exit(1);
    }
  }

  const { rows: currentRows } = await pool.query<{ current_version_id: number }>(`select current_version_id from venue_details where account_id = $1`, [
    args.accountId,
  ]);
  if (currentRows.length === 0) {
    console.error(`[add-correction] account ${args.accountId} has no served venue_details row yet -- nothing to correct.`);
    process.exit(1);
  }
  const { rows: versionRows } = await pool.query<{ details: VenueDetailsV3 }>(`select details from venue_details_versions where id = $1`, [
    currentRows[0].current_version_id,
  ]);
  const served = versionRows[0].details;

  const before = resolveFieldValueForDisplay(served, args.path);

  // Existing corrections + this pending one, so the preview reflects the field as it would
  // actually resolve post-insert (a correction can supersede an earlier correction on the same path).
  const { rows: existingCorrections } = await pool.query<{ id: number; field_path: string; action: Action; value: unknown; created_at: string }>(
    `select id, field_path, action, value, created_at from venue_details_corrections where account_id = $1 order by created_at`,
    [args.accountId]
  );
  const pending: Correction = { id: -1, field_path: args.path, action: args.action, value, created_at: new Date(Date.now() + 1).toISOString() };
  const { details: corrected } = applyCorrections(served, [...(existingCorrections as Correction[]), pending]);
  const after = resolveFieldValueForDisplay(corrected, args.path);

  const beforeCompareReady = isCompareReady(served, { criticalGroundingFailures: 0, needsReview: false });
  const afterCompareReady = isCompareReady(corrected, { criticalGroundingFailures: 0, needsReview: false });

  console.log(`[add-correction] before: ${JSON.stringify(before)}`);
  console.log(`[add-correction] after:  ${JSON.stringify(after)}`);
  console.log(`[add-correction] compare_ready: ${beforeCompareReady} -> ${afterCompareReady}`);

  if (!args.apply) {
    console.log("[add-correction] dry run -- no row inserted. Re-run with --apply to write it.");
    await closePool();
    return;
  }

  const { rows: insertRows } = await pool.query<{ id: number }>(
    `insert into venue_details_corrections (account_id, field_path, action, value, reason, corrected_by, evidence_snapshot_id, evidence_url, batch_id)
     values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
     returning id`,
    [args.accountId, args.path, args.action, args.action === "set" ? JSON.stringify(value) : null, args.reason, args.by, args.evidenceSnapshotId, args.evidenceUrl, args.batchId]
  );
  console.log(`[add-correction] APPLIED -- correction id ${insertRows[0].id}. Run serveVenueDetails.ts to fold it into a new served version.`);

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
