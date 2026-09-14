/**
 * VenueDetails v3 validation (D060 Phase 2, part A): loads a `venue_details_runs` row's raw
 * `result` (the two tool-call outputs from `extractVenueDetails.ts`) plus the crawled page texts
 * it referenced, runs it through `validate/assemble.ts`'s deterministic pipeline (grounding,
 * structural sanity, tier-aware issue/repair generation), and prints (or, with `--write`,
 * persists) the `validation` object (`contract.ts`'s `Validation` shape).
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/validateVenueDetails.ts --run-id 123
 *   bun run scripts/venue-details/validateVenueDetails.ts --account-ids 477 --report
 *   bun run scripts/venue-details/validateVenueDetails.ts --account-ids 31,477,507 --prompt-version venue-details-v3.0 --write
 *   bun run scripts/venue-details/validateVenueDetails.ts --limit 20 --report
 */
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { getPool, closePool } from "../classify/db";
import { readCacheText } from "./crawl/cache";
import { getSnapshotText, snapshotKey } from "./crawl/r2";
import { assembleDocument, type AssembleInput, type AssemblePage } from "./validate/assemble";
import { isCompareReady } from "../../lib/venueDetails/tiers";
import { headlineCapacity } from "../../lib/venueDetails/derive";
import { VENUE_DETAILS_PROMPT_VERSION } from "./contract";
import type { Issue, RawPricingResult, RawSpineResult, Validation, VenueDetailsRunResult } from "./contract";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

interface Args {
  runId: number | null;
  accountIds: number[] | null;
  promptVersion: string | null;
  limit: number | null;
  write: boolean;
  keepUngrounded: boolean;
  report: boolean;
  fixturePath: string | null;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const accountIdsRaw = get("--account-ids");
  return {
    runId: get("--run-id") ? Number(get("--run-id")) : null,
    accountIds: accountIdsRaw ? accountIdsRaw.split(",").map((s) => Number(s.trim())) : null,
    promptVersion: get("--prompt-version") ?? null,
    limit: get("--limit") ? Number(get("--limit")) : null,
    write: a.includes("--write"),
    keepUngrounded: a.includes("--keep-ungrounded"),
    report: a.includes("--report"),
    fixturePath: get("--fixture") ?? null,
  };
}

// ---------------------------------------------------------------------------
// --fixture: fully offline, no DB/pool -- a hand-written JSON file shaped like
// `{ accountId?, name?, websiteUrl?, promptVersion?, model?, extractedAt?, assetCandidateUrls?,
//    pages: AssemblePage[], spineRaw: RawSpineResult, pricingRaw: RawPricingResult|null }`
// (see validate/fixtures/mini-venue.json, the end-to-end fixture assemble.test.ts also uses).
// ---------------------------------------------------------------------------

interface FixtureFile {
  accountId?: number;
  name?: string;
  websiteUrl?: string | null;
  promptVersion?: string;
  model?: string;
  extractedAt?: string;
  assetCandidateUrls?: string[];
  pages: AssemblePage[];
  spineRaw: RawSpineResult;
  pricingRaw: RawPricingResult | null;
}

async function runFixture(fixturePath: string, args: Args): Promise<void> {
  const raw = JSON.parse(await readFile(fixturePath, "utf8")) as FixtureFile;
  const input: AssembleInput = {
    accountId: raw.accountId ?? 0,
    name: raw.name ?? "Fixture Venue",
    websiteUrl: raw.websiteUrl ?? null,
    runId: null,
    promptVersion: raw.promptVersion ?? VENUE_DETAILS_PROMPT_VERSION,
    model: raw.model ?? "fixture",
    extractedAt: raw.extractedAt ?? new Date().toISOString(),
    spineRaw: raw.spineRaw,
    pricingRaw: raw.pricingRaw,
    pages: raw.pages,
    assetCandidateUrls: raw.assetCandidateUrls ?? [],
  };

  const assembled = assembleDocument(input);
  const validation: Validation = {
    ok: assembled.ok,
    needs_review: assembled.needsReview,
    review_reasons: assembled.reviewReasons,
    issues: assembled.issues,
    repairs: assembled.repairs,
    grounding: assembled.grounding,
    spine_stated_count: assembled.spineStatedCount,
    critical_failures: assembled.criticalFailures,
    document: assembled.document,
  };

  console.log(`[validate] --fixture ${fixturePath} (no DB, no network)`);
  printSummary({ id: 0, account_id: input.accountId, prompt_version: input.promptVersion, model: input.model, snapshot_ids: [], website_url: input.websiteUrl, result: { spine_call: input.spineRaw, pricing_call: input.pricingRaw, document_chars: 0, pages: input.pages.map((p) => p.url) }, created_at: input.extractedAt }, input.name, validation);
  if (args.report) printReport(assembled.issues, 1);
}

// ---------------------------------------------------------------------------
// Run selection
// ---------------------------------------------------------------------------

interface RunRow {
  id: number;
  account_id: number;
  prompt_version: string;
  model: string | null;
  snapshot_ids: number[];
  website_url: string | null;
  result: VenueDetailsRunResult;
  created_at: string;
}

async function selectRuns(pool: Pool, args: Args): Promise<RunRow[]> {
  const conditions: string[] = [`stage = 'extract'`];
  const params: unknown[] = [];

  if (args.runId != null) {
    params.push(args.runId);
    conditions.push(`id = $${params.length}`);
  }
  if (args.accountIds) {
    params.push(args.accountIds);
    conditions.push(`account_id = any($${params.length}::bigint[])`);
  }
  if (args.promptVersion) {
    params.push(args.promptVersion);
    conditions.push(`prompt_version = $${params.length}`);
  }

  // Latest extract run per account (never re-validate a superseded run unless --run-id pins one).
  const distinctClause = args.runId != null ? "" : "distinct on (account_id)";
  const orderClause = args.runId != null ? "order by id" : "order by account_id, created_at desc";
  params.push(args.limit ?? 500);

  const { rows } = await pool.query<{
    id: string;
    account_id: string;
    prompt_version: string;
    model: string | null;
    snapshot_ids: string[];
    website_url: string | null;
    result: VenueDetailsRunResult;
    created_at: string;
  }>(
    `select ${distinctClause} id::text as id, account_id::text as account_id, prompt_version, model, snapshot_ids, website_url, result, created_at
     from venue_details_runs
     where ${conditions.join(" and ")}
     ${orderClause}
     limit $${params.length}`,
    params
  );

  return rows.map((r) => ({
    id: Number(r.id),
    account_id: Number(r.account_id),
    prompt_version: r.prompt_version,
    model: r.model,
    snapshot_ids: (r.snapshot_ids ?? []).map(Number),
    website_url: r.website_url,
    result: r.result,
    created_at: r.created_at,
  }));
}

async function lookupName(pool: Pool, accountId: number): Promise<string> {
  const { rows } = await pool.query<{ full_name: string | null; username: string }>(`select full_name, username::text as username from accounts where id = $1`, [accountId]);
  return rows[0]?.full_name ?? rows[0]?.username ?? `account ${accountId}`;
}

// ---------------------------------------------------------------------------
// Page loading (by the run's own snapshot_ids -- exactly what it saw, not "latest crawl")
// ---------------------------------------------------------------------------

async function loadPagesForRun(pool: Pool, accountId: number, snapshotIds: number[]): Promise<AssemblePage[]> {
  if (snapshotIds.length === 0) return [];
  const { rows } = await pool.query<{ id: string; url: string; sha256: string }>(
    `select id::text as id, url, sha256 from venue_source_snapshots where account_id = $1 and id = any($2::bigint[])`,
    [accountId, snapshotIds]
  );
  const pages: AssemblePage[] = [];
  for (const r of rows) {
    let text = await readCacheText(accountId, r.sha256);
    if (text == null) {
      try {
        text = await getSnapshotText(snapshotKey(accountId, r.sha256));
      } catch {
        continue;
      }
    }
    pages.push({ url: r.url, text, snapshot_id: Number(r.id) });
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Report / write
// ---------------------------------------------------------------------------

function printSummary(run: RunRow, name: string, validation: Validation) {
  const hc = headlineCapacity(validation.document);
  const compareReady = isCompareReady(validation.document, { criticalGroundingFailures: validation.critical_failures, needsReview: validation.needs_review });
  console.log(`\n[validate] run ${run.id} account ${run.account_id} (${name})`);
  console.log(`  ok=${validation.ok}  needs_review=${validation.needs_review}  review_reasons=${JSON.stringify(validation.review_reasons)}`);
  console.log(`  spine_stated_count=${validation.spine_stated_count}  critical_failures=${validation.critical_failures}`);
  console.log(`  grounding: checked=${validation.grounding.checked} passed=${validation.grounding.passed} failed=${validation.grounding.failed} min_coverage=${validation.grounding.min_coverage ?? "n/a"}`);
  console.log(`  headline capacity: ${hc.headline ?? "none"} (${hc.headline_layout ?? "n/a"})  compare_ready=${compareReady}`);
  console.log(`  issues: ${validation.issues.length}  repairs: ${validation.repairs.length}`);
}

function issueHistogram(allIssues: Issue[]): Map<string, number> {
  const hist = new Map<string, number>();
  for (const i of allIssues) hist.set(i.code, (hist.get(i.code) ?? 0) + 1);
  return hist;
}

function printReport(allIssues: Issue[], runCount: number) {
  console.log(`\n=== --report: issue-code histogram across ${runCount} run(s) ===`);
  const hist = issueHistogram(allIssues);
  const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  for (const [code, count] of sorted) {
    console.log(`  ${code.padEnd(30)} ${count}`);
  }
  if (sorted.length === 0) console.log("  (no issues)");
}

async function writeValidation(pool: Pool, runId: number, validation: Validation): Promise<void> {
  await pool.query(`update venue_details_runs set validation = $2, spine_stated_count = $3, critical_failures = $4 where id = $1`, [
    runId,
    JSON.stringify(validation),
    validation.spine_stated_count,
    validation.critical_failures,
  ]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();

  if (args.fixturePath) {
    await runFixture(args.fixturePath, args);
    return;
  }

  if (args.runId == null && args.accountIds == null && args.limit == null) {
    console.error("[validate] pass --run-id, --account-ids, --limit, or --fixture <path>.");
    process.exit(1);
  }

  const pool = getPool();
  const runs = await selectRuns(pool, args);
  console.log(`[validate] runs selected: ${runs.length}${args.keepUngrounded ? " (--keep-ungrounded: dropped items are still shown in the issue list below)" : ""}`);

  const allIssues: Issue[] = [];

  for (const run of runs) {
    const pages = await loadPagesForRun(pool, run.account_id, run.snapshot_ids);
    const name = await lookupName(pool, run.account_id);

    const spineRaw: RawSpineResult = run.result.spine_call;
    const pricingRaw: RawPricingResult | null = run.result.pricing_call;

    const assembled = assembleDocument({
      accountId: run.account_id,
      name,
      websiteUrl: run.website_url,
      runId: run.id,
      promptVersion: run.prompt_version,
      model: run.model ?? "unknown",
      extractedAt: run.created_at,
      spineRaw,
      pricingRaw,
      pages,
      assetCandidateUrls: [],
    });

    const validation: Validation = {
      ok: assembled.ok,
      needs_review: assembled.needsReview,
      review_reasons: assembled.reviewReasons,
      issues: assembled.issues,
      repairs: assembled.repairs,
      grounding: assembled.grounding,
      spine_stated_count: assembled.spineStatedCount,
      critical_failures: assembled.criticalFailures,
      document: assembled.document,
    };

    printSummary(run, name, validation);
    allIssues.push(...assembled.issues);

    if (args.write) {
      await writeValidation(pool, run.id, validation);
      console.log(`  [validate] wrote validation to venue_details_runs.id=${run.id}`);
    }
  }

  if (args.report) printReport(allIssues, runs.length);

  await closePool();
}

// Guarded so importing the pure helpers above for unit tests never triggers CLI arg parsing /
// process.exit as an import side effect (same discipline as crawlVenue.ts).
if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
