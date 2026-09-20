/**
 * Universal must-not floor for arbitrary venues (D060 fill loop, plan "Execution loop for
 * Phases 2-3", step "F -- every fill tick": "the six universal must-not assertions green on
 * every served venue"). The fill loop has no hand-built golden/must-not fixture for most of the
 * ~475 listed venues, so it can't call `scoreAgainstGolden.ts` per venue -- but every venue about
 * to be served still owes the six UNIVERSAL assertions from `mustnot/assertions.ts`
 * (no_generic_label_space, no_duplicate_space, no_summed_rooms, no_adr_price,
 * no_junk_vendor_names, capacity_headline_not_null_if_site_states).
 *
 * Given `--account-ids` or `--ids-file`, this selects each account's latest SERVABLE run the same
 * way `serveVenueDetails.ts` would -- `pickRunToServe` (`serve/computeServeRow.ts`), imported, not
 * copied -- applies active corrections the same way serve does (`lib/venueDetails/merge.ts`'s
 * `applyCorrections`), and runs the pure `runMustNot` (`./check.ts`) against the assembled
 * document. Read-only: no DB writes, no network calls. Exits 1 iff any venue FAILs; a venue with
 * no servable run yet is reported as SKIP and does not fail the exit code (so a fresh account
 * with nothing extracted yet "says so cleanly" instead of erroring).
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/mustnot/checkUniversal.ts --account-ids 31,477,507
 *   bun run scripts/venue-details/mustnot/checkUniversal.ts --ids-file scripts/graph/tmp_analysis/f1.ids --json
 *   bun run scripts/venue-details/mustnot/checkUniversal.ts --account-ids 477 --prompt-version venue-details-v3.0 --allow-needs-review
 */
import { readFileSync } from "node:fs";
import { getPool, closePool } from "../../classify/db";
import { applyCorrections, type Correction } from "../../../lib/venueDetails/merge";
import { pickRunToServe } from "../serve/computeServeRow";
import { DEFAULT_PROMPT_VERSION, type RunRow } from "../contract";
import { UNIVERSAL } from "./assertions";
import { runMustNot, type MustNotFailure } from "./check";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

interface Args {
  accountIds: number[] | null;
  idsFile: string | null;
  promptVersion: string;
  allowNeedsReview: boolean;
  json: boolean;
}

function usage(): never {
  console.error(
    "[check-universal] Usage: bun run scripts/venue-details/mustnot/checkUniversal.ts " +
      "(--account-ids 1,2,3 | --ids-file <path>) [--prompt-version v] [--allow-needs-review] [--json]"
  );
  process.exit(1);
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const accountIdsRaw = get("--account-ids");
  const idsFile = get("--ids-file") ?? null;
  const accountIds = accountIdsRaw ? accountIdsRaw.split(",").map((s) => Number(s.trim())) : null;
  if (!accountIds && !idsFile) usage();
  if (accountIds && idsFile) usage();
  return {
    accountIds,
    idsFile,
    promptVersion: get("--prompt-version") ?? DEFAULT_PROMPT_VERSION,
    allowNeedsReview: a.includes("--allow-needs-review"),
    json: a.includes("--json"),
  };
}

/** Pure: parses one account id per non-blank line of an `--ids-file` (same shape `targets.ts`
 * writes). Exported for unit testing. */
export function parseIdsFile(text: string): number[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map(Number);
}

function loadIds(args: Args): number[] {
  if (args.accountIds) return args.accountIds;
  return parseIdsFile(readFileSync(args.idsFile!, "utf8"));
}

// ---------------------------------------------------------------------------
// DB reads (same shape as serveVenueDetails.ts's loadRuns/loadActiveCorrections -- duplicated
// here rather than imported since those are private to that script's own transaction client).
// ---------------------------------------------------------------------------

async function loadRuns(accountId: number): Promise<RunRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<RunRow>(
    `select id, account_id, prompt_version, schema_version, model, stage, parent_run_id, input_hash,
            snapshot_ids, website_url, validation, spine_stated_count, critical_failures, cost_usd, created_at
     from venue_details_runs where account_id = $1 order by created_at desc`,
    [accountId]
  );
  return rows;
}

async function loadActiveCorrections(accountId: number): Promise<Correction[]> {
  const pool = getPool();
  const { rows } = await pool.query<{ id: number; field_path: string; action: Correction["action"]; value: unknown; created_at: string }>(
    `select distinct on (field_path) id, field_path, action, value, created_at
     from venue_details_corrections
     where account_id = $1
     order by field_path, created_at desc`,
    [accountId]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Per-venue check
// ---------------------------------------------------------------------------

export type VenueOutcome =
  | { accountId: number; status: "no_run" }
  | { accountId: number; status: "pass"; runId: number }
  | { accountId: number; status: "fail"; runId: number; failed: MustNotFailure[] };

async function checkOne(accountId: number, args: Args): Promise<VenueOutcome> {
  const runs = await loadRuns(accountId);
  const run = pickRunToServe(runs, { promptVersion: args.promptVersion, allowNeedsReview: args.allowNeedsReview });
  if (!run || !run.validation) return { accountId, status: "no_run" };

  const corrections = await loadActiveCorrections(accountId);
  const { details } = applyCorrections(run.validation.document, corrections);
  const result = runMustNot(details, UNIVERSAL);
  return result.passed ? { accountId, status: "pass", runId: run.id } : { accountId, status: "fail", runId: run.id, failed: result.failed };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printReport(outcomes: VenueOutcome[], promptVersion: string): void {
  console.log(`# Universal must-not floor (${UNIVERSAL.length} assertions, prompt_version=${promptVersion})\n`);
  console.log(`| account_id | run | result |`);
  console.log(`|---|---|---|`);
  for (const o of outcomes) {
    if (o.status === "no_run") console.log(`| ${o.accountId} | -- | SKIP (no servable run yet) |`);
    else if (o.status === "pass") console.log(`| ${o.accountId} | ${o.runId} | PASS |`);
    else console.log(`| ${o.accountId} | ${o.runId} | FAIL (${o.failed.length}) |`);
  }

  const failures = outcomes.filter((o): o is Extract<VenueOutcome, { status: "fail" }> => o.status === "fail");
  if (failures.length > 0) {
    console.log(`\n## Failures\n`);
    for (const f of failures) {
      console.log(`### account ${f.accountId} (run ${f.runId})`);
      for (const d of f.failed) console.log(`  - [${d.assertion}] ${d.detail}`);
    }
  }

  const noRun = outcomes.filter((o) => o.status === "no_run").length;
  const passed = outcomes.filter((o) => o.status === "pass").length;
  const scored = outcomes.length - noRun;
  console.log(`\n# Totals: ${passed}/${scored} pass (${noRun} venue(s) have no servable run yet).`);
}

async function main() {
  const args = parseArgs();
  const ids = loadIds(args);
  if (ids.length === 0) {
    console.log("[check-universal] no account ids given.");
    return;
  }

  const outcomes: VenueOutcome[] = [];
  for (const accountId of ids) outcomes.push(await checkOne(accountId, args));

  if (args.json) {
    console.log(JSON.stringify(outcomes, null, 2));
  } else {
    printReport(outcomes, args.promptVersion);
  }

  await closePool();
  if (outcomes.some((o) => o.status === "fail")) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
