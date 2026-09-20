/**
 * VenueDetails v3 fill loop (D060, plan "Execution loop for Phases 2-3") -- thin orchestrator.
 * One tick = one command: shells the existing venue-details scripts in the fixed order below
 * (`Bun.spawn`, stdout inherited live AND teed into `<reports-dir>/<step>.md`), so a context loss
 * anywhere costs at most one tick and a cold session recovers from `git log` + `docs/STATE.md` +
 * the funnel report, never from memory. No extraction/validation/scoring logic lives here -- this
 * only sequences the scripts documented in `docs/engineering/venue-enrichment/loop/README.md`.
 *
 * Two units (tick kind inferred from `--tick`'s first letter): calibration (`c0`, `c1`... -- the
 * golden six, `--golden`) and fill (`f1`, `f2`... -- ~30 venues from `targets.ts`, `--account-ids`
 * or `--ids-file`). `c0`/`--crawl-only` is the crawl-only checkpoint (no model spend); `c1`... run
 * the full loop and score against the golden fixtures + the rubric's must-not slate; fill ticks
 * run the full loop and score against the six UNIVERSAL must-not assertions only
 * (`mustnot/checkUniversal.ts` -- no golden fixture exists for most of the ~475 listed venues).
 *
 * Steps: (1) crawl (skippable) (2) crawl-coverage checkpoint [stop here if --crawl-only]
 * (3) extract (4) validate (5) repair (6) validate again (7) score (golden+must-not for
 * calibration, universal must-not for fill) (8) serve -- dry-run always, `--apply` only with
 * `--apply-serve` (9) funnel (10) print + persist the tick's `ticks.md` row and the served
 * accounts' `/lab/venue?u=` spot-check URLs. A failing step stops the tick immediately and prints
 * which step failed; every report written before the failure stays on disk.
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/runTick.ts --tick c0 --golden --crawl-only --dry-run
 *   bun run scripts/venue-details/runTick.ts --tick c1 --golden --max-cost-usd 10
 *   bun run scripts/venue-details/runTick.ts --tick f1 --ids-file scripts/graph/tmp_analysis/vd_f1.ids --max-cost-usd 10
 *   bun run scripts/venue-details/runTick.ts --tick f1 --ids-file scripts/graph/tmp_analysis/vd_f1.ids --skip-crawl --apply-serve
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool, closePool } from "../classify/db";
import { GOLDEN_ACCOUNT_IDS, GOLDEN_SLUGS, type GoldenSlug } from "../../lib/venueDetails/golden";

// ---------------------------------------------------------------------------
// Pure helpers (unit tested in runTick.test.ts -- no DB, no network, no fs)
// ---------------------------------------------------------------------------

export type TickKind = "calibration" | "fill";

/** `c0`, `c1`... -> calibration; `f1`, `f2`... -> fill. Anything else is a usage error -- the tick
 * id's first letter is the only signal, per the plan ("the tick kind is inferred from the first
 * letter"). */
export function inferTickKind(tick: string): TickKind {
  const first = tick.trim().charAt(0).toLowerCase();
  if (first === "c") return "calibration";
  if (first === "f") return "fill";
  throw new Error(`--tick '${tick}' must start with 'c' (calibration) or 'f' (fill) so the tick kind can be inferred.`);
}

/** Pure: one account id per non-blank line, same shape `targets.ts --ids-file` writes. */
export function parseIdsFileText(text: string): number[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map(Number);
}

/** Pure: `<appsWebDir>/../../docs/engineering/venue-enrichment/loop/reports/<tick>` -- the
 * plan's default `--reports-dir`, computed relative to a given apps/web dir so it's testable
 * without touching the filesystem. */
export function defaultReportsDir(appsWebDir: string, tick: string): string {
  return path.join(appsWebDir, "..", "..", "docs", "engineering", "venue-enrichment", "loop", "reports", tick);
}

/** Pure: which golden slugs' account ids are actually in this tick's population -- for a
 * calibration tick run with `--golden` this is all six; for one run against a subset via
 * `--account-ids`/`--ids-file` it narrows to whichever golden accounts are present. */
export function goldenSlugsInPopulation(ids: number[]): GoldenSlug[] {
  const idSet = new Set(ids);
  return GOLDEN_SLUGS.filter((slug) => idSet.has(GOLDEN_ACCOUNT_IDS[slug]));
}

/** Pure: this tick's repair budget = the tick's overall cap minus whatever extraction (and any
 * prior repair round) already spent, floored at 0 so a tick that's already over cap runs repair
 * with a $0 budget (repairVenueDetails.ts's own `--max-cost-usd 0` stops before spending). */
export function computeRemainingBudget(maxCostUsd: number, spentSoFarUsd: number): number {
  return Math.max(0, Math.round((maxCostUsd - spentSoFarUsd) * 100) / 100);
}

// ---------------------------------------------------------------------------
// Pure command builders -- one per step. Each returns the argv AFTER `bun run`, e.g.
// `["scripts/venue-details/crawlVenue.ts", "--account-ids", "31,477", ...]`.
// ---------------------------------------------------------------------------

export function buildCrawlCommand(ids: number[], tick: string): string[] {
  return ["scripts/venue-details/crawlVenue.ts", "--account-ids", ids.join(","), "--crawl-batch", `vd-crawl-${tick}`, "--seed-urls", "scripts/venue-details/seeds/golden-seeds.csv"];
}

export function buildCoverageCommand(ids: number[], reportsDir: string): string[] {
  return ["scripts/venue-details/reportCrawlCoverage.ts", "--account-ids", ids.join(","), "--out", path.join(reportsDir, "coverage.md")];
}

/** `--golden` passthrough happens only when the population itself came from `--golden` (extract's
 * own `--pilot`/model-selection logic reads it) -- `--prompt-version` is NOT one of
 * extractVenueDetails.ts's flags (checked against its parseArgs), so it is never passed here. */
export function buildExtractCommand(ids: number[], maxCostUsd: number, golden: boolean): string[] {
  const cmd = ["scripts/venue-details/extractVenueDetails.ts", "--account-ids", ids.join(","), "--max-cost-usd", String(maxCostUsd)];
  if (golden) cmd.push("--golden");
  return cmd;
}

export function buildValidateCommand(ids: number[], promptVersion: string | null): string[] {
  const cmd = ["scripts/venue-details/validateVenueDetails.ts", "--account-ids", ids.join(","), "--write", "--report"];
  if (promptVersion) cmd.push("--prompt-version", promptVersion);
  return cmd;
}

export function buildRepairCommand(ids: number[], remainingBudget: number): string[] {
  return ["scripts/venue-details/repairVenueDetails.ts", "--account-ids", ids.join(","), "--max-rounds", "1", "--max-cost-usd", String(remainingBudget)];
}

/** Calibration: one `scoreAgainstGolden.ts --mustnot` call per golden slug in the population
 * (per the plan's exact step-7 command); fill: one `checkUniversal.ts` call over the whole
 * population (no per-venue golden fixture exists for the fill population). */
export function buildScoreCommands(kind: TickKind, ids: number[], promptVersion: string | null): string[][] {
  if (kind === "fill") {
    return [["scripts/venue-details/mustnot/checkUniversal.ts", "--account-ids", ids.join(",")]];
  }
  return goldenSlugsInPopulation(ids).map((slug) => {
    const cmd = ["scripts/venue-details/scoreAgainstGolden.ts", "--slug", slug, "--source", "runs", "--mustnot", "--account-map", "scripts/venue-details/mustnot/account-map.csv"];
    if (promptVersion) cmd.push("--prompt-version", promptVersion);
    return cmd;
  });
}

export function buildServeCommand(ids: number[], tick: string, apply: boolean, promptVersion: string | null): string[] {
  const cmd = ["scripts/venue-details/serveVenueDetails.ts", "--batch-id", `vd-serve-${tick}`, "--account-ids", ids.join(",")];
  if (promptVersion) cmd.push("--prompt-version", promptVersion);
  if (apply) cmd.push("--apply");
  return cmd;
}

/** `--json` is added to the literal spec command so `main()` can read `<reports>/funnel.json`
 * for the tick row's `compare_ready`/`excellent` counts as DB facts, instead of scraping stdout
 * (plan: "Parse the counts from the DB after the steps (not from stdout) so they are facts"). */
export function buildFunnelCommand(reportsDir: string, promptVersion: string | null): string[] {
  const cmd = ["scripts/venue-details/reportVenueDetailsFunnel.ts", "--out", path.join(reportsDir, "funnel.md"), "--json"];
  if (promptVersion) cmd.push("--prompt-version", promptVersion);
  return cmd;
}

// ---------------------------------------------------------------------------
// ticks.md row formatting
// ---------------------------------------------------------------------------

export interface TickRow {
  tick: string;
  date: string; // YYYY-MM-DD, America/Chicago
  venues: number;
  pagesTotal: number;
  pagesUsable: number;
  extracted: number;
  skipped: number;
  validatedOk: number;
  needsReview: number;
  repaired: number;
  served: number;
  compareReady: number; // cumulative, over the whole listed universe
  excellent: number; // cumulative
  costTickUsd: number;
  costCumulativeUsd: number;
  notes: string;
}

/** Pure: the exact `ticks.md` row (gate/commit left blank -- "the human/parent fills it"). */
export function formatTickRow(row: TickRow): string {
  return (
    `| ${row.tick} | ${row.date} | ${row.venues} | ${row.pagesTotal}/${row.pagesUsable} | ${row.extracted}/${row.skipped} | ` +
    `${row.validatedOk}/${row.needsReview} | ${row.repaired} | ${row.served} | ${row.compareReady} | ${row.excellent} | ` +
    `$${row.costTickUsd.toFixed(2)} | $${row.costCumulativeUsd.toFixed(2)} |  |  | ${row.notes} |`
  );
}

/** Pure: `YYYY-MM-DD` in America/Chicago, same convention as `scripts/acquire/runTick.ts`'s
 * `formatBatchId`. */
export function formatTickDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

interface Args {
  tick: string;
  kind: TickKind;
  golden: boolean;
  accountIds: number[] | null;
  idsFile: string | null;
  maxCostUsd: number;
  skipCrawl: boolean;
  applyServe: boolean;
  promptVersion: string | null;
  crawlOnly: boolean;
  dryRun: boolean;
  reportsDir: string;
}

function usage(): never {
  console.error(
    "[run-tick] Usage: bun run scripts/venue-details/runTick.ts --tick <id> (--golden | --account-ids 1,2,3 | --ids-file <path>) " +
      "[--max-cost-usd 10] [--skip-crawl] [--apply-serve] [--prompt-version v] [--crawl-only] [--dry-run] [--reports-dir <path>]"
  );
  process.exit(1);
}

function appsWebDir(): string {
  // scripts/venue-details/runTick.ts -> scripts/venue-details -> scripts -> apps/web.
  return path.resolve(import.meta.dir, "..", "..");
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const tick = get("--tick");
  if (!tick) usage();

  const golden = a.includes("--golden");
  const accountIdsRaw = get("--account-ids");
  const idsFile = get("--ids-file") ?? null;
  const accountIds = accountIdsRaw ? accountIdsRaw.split(",").map((s) => Number(s.trim())) : null;

  const populationFlagCount = [golden, accountIds != null, idsFile != null].filter(Boolean).length;
  if (populationFlagCount !== 1) {
    console.error("[run-tick] exactly one of --golden | --account-ids | --ids-file is required.");
    usage();
  }

  let kind: TickKind;
  try {
    kind = inferTickKind(tick);
  } catch (e) {
    console.error(`[run-tick] ${(e as Error).message}`);
    process.exit(1);
  }

  return {
    tick,
    kind,
    golden,
    accountIds,
    idsFile,
    maxCostUsd: Number(get("--max-cost-usd") ?? "10"),
    skipCrawl: a.includes("--skip-crawl"),
    applyServe: a.includes("--apply-serve"),
    promptVersion: get("--prompt-version") ?? null,
    crawlOnly: a.includes("--crawl-only"),
    dryRun: a.includes("--dry-run"),
    reportsDir: get("--reports-dir") ?? defaultReportsDir(appsWebDir(), tick),
  };
}

function resolvePopulationIds(args: Args): number[] {
  if (args.golden) return Object.values(GOLDEN_ACCOUNT_IDS);
  if (args.accountIds) return args.accountIds;
  return parseIdsFileText(readFileSync(args.idsFile!, "utf8"));
}

// ---------------------------------------------------------------------------
// Step execution: inherit stdout live, tee into <reports-dir>/<file> when given.
// ---------------------------------------------------------------------------

interface Step {
  name: string;
  cmd: string[];
  /** File name under reportsDir to tee this step's stdout into, or null when the step already
   * writes its own report via `--out` (coverage, funnel) and a second copy would be redundant. */
  teeFile: string | null;
}

async function runStep(step: Step, reportsDir: string): Promise<number> {
  console.log(`\n[run-tick] $ bun run ${step.cmd.join(" ")}`);
  const proc = Bun.spawn(["bun", "run", ...step.cmd], { cwd: appsWebDir(), stdout: "pipe", stderr: "inherit" });
  const chunks: Uint8Array[] = [];
  const reader = proc.stdout.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    process.stdout.write(value);
    chunks.push(value);
  }
  const code = await proc.exited;
  if (step.teeFile) {
    await mkdir(reportsDir, { recursive: true });
    await writeFile(path.join(reportsDir, step.teeFile), Buffer.concat(chunks));
  }
  return code;
}

async function runSteps(steps: Step[], reportsDir: string): Promise<boolean> {
  for (const step of steps) {
    const code = await runStep(step, reportsDir);
    if (code !== 0) {
      console.error(`\n[run-tick] STEP FAILED: ${step.name} (exit ${code}). Reports written so far stay in ${reportsDir}.`);
      return false;
    }
  }
  return true;
}

function printDryRun(args: Args, ids: number[], steps: Step[]): void {
  console.log(`[run-tick] DRY RUN tick=${args.tick} kind=${args.kind} population=${ids.length} account(s): ${ids.join(",")}`);
  console.log(`[run-tick] reports-dir: ${args.reportsDir}`);
  for (const step of steps) {
    console.log(`  [${step.name}] bun run ${step.cmd.join(" ")}`);
  }
}

// ---------------------------------------------------------------------------
// DB reads for the tick row (facts, not stdout scraping)
// ---------------------------------------------------------------------------

async function spentSoFarUsd(ids: number[], sinceIso: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ sum: string | null }>(
    `select sum(cost_usd) as sum from venue_details_runs where account_id = any($1::bigint[]) and created_at >= $2`,
    [ids, sinceIso]
  );
  return Number(rows[0]?.sum ?? 0);
}

async function cumulativeSpendUsd(): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ sum: string | null }>(`select sum(cost_usd) as sum from venue_details_runs`);
  return Number(rows[0]?.sum ?? 0);
}

async function countPages(ids: number[], crawlBatch: string): Promise<{ total: number; usable: number }> {
  const pool = getPool();
  const { rows } = await pool.query<{ kind: string | null; chars: number | null; has_text_layer: boolean | null }>(
    `select s.kind, s.chars, s.has_text_layer
     from venue_source_fetches f left join venue_source_snapshots s on s.id = f.snapshot_id
     where f.account_id = any($1::bigint[]) and f.crawl_batch = $2`,
    [ids, crawlBatch]
  );
  let usable = 0;
  for (const r of rows) {
    if ((r.kind === "html" && (r.chars ?? 0) >= 400) || (r.kind === "pdf" && r.has_text_layer)) usable++;
  }
  return { total: rows.length, usable };
}

async function countExtractedSkipped(ids: number[], sinceIso: string): Promise<{ extracted: number; skipped: number }> {
  const pool = getPool();
  const { rows } = await pool.query<{ account_id: number }>(
    `select distinct account_id from venue_details_runs where account_id = any($1::bigint[]) and stage = 'extract' and created_at >= $2`,
    [ids, sinceIso]
  );
  return { extracted: rows.length, skipped: Math.max(0, ids.length - rows.length) };
}

async function countValidated(ids: number[]): Promise<{ ok: number; needsReview: number }> {
  const pool = getPool();
  const { rows } = await pool.query<{ ok: boolean | null; needs_review: boolean | null }>(
    `select distinct on (account_id) (validation->>'ok')::boolean as ok, (validation->>'needs_review')::boolean as needs_review
     from venue_details_runs where account_id = any($1::bigint[]) and validation is not null
     order by account_id, created_at desc`,
    [ids]
  );
  return { ok: rows.filter((r) => r.ok).length, needsReview: rows.filter((r) => r.needs_review).length };
}

async function countRepaired(ids: number[], sinceIso: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ account_id: number }>(
    `select distinct account_id from venue_details_runs where account_id = any($1::bigint[]) and stage = 'repair' and created_at >= $2`,
    [ids, sinceIso]
  );
  return rows.length;
}

async function servedThisTick(batchId: string): Promise<number[]> {
  const pool = getPool();
  const { rows } = await pool.query<{ account_id: number }>(`select distinct account_id from venue_details_versions where batch_id = $1`, [batchId]);
  return rows.map((r) => r.account_id);
}

async function usernamesFor(ids: number[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const pool = getPool();
  const { rows } = await pool.query<{ username: string }>(`select username::text as username from accounts where id = any($1::bigint[]) order by username`, [ids]);
  return rows.map((r) => r.username);
}

interface FunnelJson {
  funnel: { compareReady: number; excellent: number };
}

async function readFunnelCounts(reportsDir: string): Promise<{ compareReady: number; excellent: number }> {
  try {
    const raw = await Bun.file(path.join(reportsDir, "funnel.json")).text();
    const parsed = JSON.parse(raw) as FunnelJson;
    return { compareReady: parsed.funnel.compareReady, excellent: parsed.funnel.excellent };
  } catch (e) {
    console.error(`[run-tick] could not read funnel.json for the tick row (${(e as Error).message}) -- reporting 0/0.`);
    return { compareReady: 0, excellent: 0 };
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  const ids = resolvePopulationIds(args);
  if (ids.length === 0) {
    console.error("[run-tick] population resolved to zero accounts -- nothing to do.");
    process.exit(1);
  }
  const tickStartIso = new Date().toISOString();

  const steps: Step[] = [];
  if (!args.skipCrawl) steps.push({ name: "crawl", cmd: buildCrawlCommand(ids, args.tick), teeFile: "crawl.md" });
  steps.push({ name: "coverage", cmd: buildCoverageCommand(ids, args.reportsDir), teeFile: null });

  if (args.crawlOnly) {
    if (args.dryRun) {
      printDryRun(args, ids, steps);
      return;
    }
    const ok = await runSteps(steps, args.reportsDir);
    await closePool();
    if (!ok) process.exit(1);
    console.log(`\n[run-tick] --crawl-only: stopping after the crawl checkpoint. Read ${args.reportsDir}/coverage.md before spending on extraction.`);
    return;
  }

  steps.push({ name: "extract", cmd: buildExtractCommand(ids, args.maxCostUsd, args.golden), teeFile: "extract.md" });
  steps.push({ name: "validate-1", cmd: buildValidateCommand(ids, args.promptVersion), teeFile: "validate-1.md" });

  // Dry-run never touches the DB (read-only queries are only sanctioned "in --dry-run paths" per
  // this task's own guardrail, and a preview doesn't need perfect accuracy here): the printed
  // repair command uses the full cap as a stand-in for "nothing spent yet this tick".
  const spentBeforeRepair = args.dryRun ? 0 : await spentSoFarUsd(ids, tickStartIso);
  const repairBudget = computeRemainingBudget(args.maxCostUsd, spentBeforeRepair);
  steps.push({ name: "repair", cmd: buildRepairCommand(ids, repairBudget), teeFile: "repair.md" });
  steps.push({ name: "validate-2", cmd: buildValidateCommand(ids, args.promptVersion), teeFile: "validate-2.md" });

  const scoreCommands = buildScoreCommands(args.kind, ids, args.promptVersion);
  const scoreFile = args.kind === "calibration" ? "scorecard.md" : "mustnot.md";
  scoreCommands.forEach((cmd, i) => steps.push({ name: `score-${i + 1}`, cmd, teeFile: scoreCommands.length > 1 ? null : scoreFile }));

  steps.push({ name: "serve-dry-run", cmd: buildServeCommand(ids, args.tick, false, args.promptVersion), teeFile: "serve-dry-run.md" });
  if (args.applyServe) steps.push({ name: "serve-apply", cmd: buildServeCommand(ids, args.tick, true, args.promptVersion), teeFile: "serve-apply.md" });

  steps.push({ name: "funnel", cmd: buildFunnelCommand(args.reportsDir, args.promptVersion), teeFile: null });

  if (args.dryRun) {
    printDryRun(args, ids, steps);
    return;
  }

  const ok = await runSteps(steps, args.reportsDir);
  if (!ok) {
    await closePool();
    process.exit(1);
  }

  // Score step(s): when there's more than one (calibration, one per golden slug), concatenate
  // their individually-buffered stdout into one scorecard.md rather than clobbering it N times --
  // handled by teeFile above (only the single-command case tees directly); multi-command scoring
  // is left to each command's own stdout (inherited live) since scoreAgainstGolden.ts --mustnot
  // reports the SAME 15-venue table regardless of --slug, so concatenating N identical tables adds
  // nothing -- read the last invocation's console output instead.
  await mkdir(args.reportsDir, { recursive: true });

  // --- Tick row: parse counts from the DB, not stdout (plan: "so they are facts"). ---
  const crawlBatch = `vd-crawl-${args.tick}`;
  const serveBatch = `vd-serve-${args.tick}`;
  const [pages, extractedSkipped, validated, repaired, servedIds, funnelCounts, costTick, costCumulative] = await Promise.all([
    args.skipCrawl ? Promise.resolve({ total: 0, usable: 0 }) : countPages(ids, crawlBatch),
    countExtractedSkipped(ids, tickStartIso),
    countValidated(ids),
    countRepaired(ids, tickStartIso),
    args.applyServe ? servedThisTick(serveBatch) : Promise.resolve<number[]>([]),
    readFunnelCounts(args.reportsDir),
    spentSoFarUsd(ids, tickStartIso),
    cumulativeSpendUsd(),
  ]);

  const row: TickRow = {
    tick: args.tick,
    date: formatTickDate(),
    venues: ids.length,
    pagesTotal: pages.total,
    pagesUsable: pages.usable,
    extracted: extractedSkipped.extracted,
    skipped: extractedSkipped.skipped,
    validatedOk: validated.ok,
    needsReview: validated.needsReview,
    repaired,
    served: servedIds.length,
    compareReady: funnelCounts.compareReady,
    excellent: funnelCounts.excellent,
    costTickUsd: costTick,
    costCumulativeUsd: costCumulative,
    notes: "",
  };
  const rowLine = formatTickRow(row);
  console.log(`\n[run-tick] ticks.md row:\n${rowLine}`);
  await writeFile(path.join(args.reportsDir, "tick-row.md"), rowLine + "\n", "utf8");

  if (servedIds.length > 0) {
    const usernames = await usernamesFor(servedIds);
    console.log(`\n[run-tick] spot-check URLs (${usernames.length} served this tick):`);
    for (const u of usernames) console.log(`  http://localhost:3000/lab/venue?u=${u}`);
  }

  await closePool();
}

// Guarded so importing the pure helpers/command builders above for unit tests never triggers CLI
// arg parsing / process.exit as an import side effect (same discipline as crawlVenue.ts /
// repairVenueDetails.ts).
if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
