/**
 * CLI wrapper around the pure `score.ts` (golden-6 tier-weighted scoring) and `mustnot/check.ts`
 * (the rubric's 15-venue must-not floor). No scoring logic lives here -- this only resolves a
 * candidate document (from the DB or a file) and prints/writes the result.
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/scoreAgainstGolden.ts                                   # scores all 6 goldens' CURRENT served versions (DB)
 *   bun run scripts/venue-details/scoreAgainstGolden.ts --slug galleria-marchetti --source runs
 *   bun run scripts/venue-details/scoreAgainstGolden.ts --source versions --prompt-version venue-details-v3.0
 *   bun run scripts/venue-details/scoreAgainstGolden.ts --from-file scripts/graph/tmp_analysis/candidate.json --slug galleria-marchetti
 *   bun run scripts/venue-details/scoreAgainstGolden.ts --all-fields --json
 *   bun run scripts/venue-details/scoreAgainstGolden.ts --mustnot                          # the 15-venue must-not floor only
 *   bun run scripts/venue-details/scoreAgainstGolden.ts --mustnot --account-map scripts/graph/tmp_analysis/mustnot-accounts.csv
 */
import { readFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";
import { GOLDEN_ACCOUNT_IDS, GOLDEN_SLUGS, getGolden, type GoldenSlug } from "../../lib/venueDetails/golden";
import { criticalFieldPaths } from "../../lib/venueDetails/tiers";
import type { VenueDetailsV3 } from "../../lib/venueDetails/types";
import { DEFAULT_PROMPT_VERSION } from "./contract";
import { scoreVenue, type VenueScoreResult, type InventoryKindScore, type Miss } from "./score";
import { MUST_NOT_ASSERTIONS } from "./mustnot/assertions";
import { runMustNot, type MustNotResult } from "./mustnot/check";
import { parseCsvRows } from "./csv";

interface Args {
  slug: GoldenSlug | null;
  source: "runs" | "versions";
  promptVersion: string;
  includeCorrections: boolean;
  allFields: boolean;
  json: boolean;
  fromFile: string | null;
  mustnot: boolean;
  accountMapPath: string | null;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const slugRaw = get("--slug");
  if (slugRaw && !(GOLDEN_SLUGS as readonly string[]).includes(slugRaw)) {
    console.error(`[score-against-golden] --slug must be one of: ${GOLDEN_SLUGS.join(", ")}`);
    process.exit(1);
  }
  return {
    slug: (slugRaw as GoldenSlug) ?? null,
    source: (get("--source") as "runs" | "versions") ?? "versions",
    promptVersion: get("--prompt-version") ?? DEFAULT_PROMPT_VERSION,
    includeCorrections: a.includes("--include-corrections"),
    allFields: a.includes("--all-fields"),
    json: a.includes("--json"),
    fromFile: get("--from-file") ?? null,
    mustnot: a.includes("--mustnot"),
    accountMapPath: get("--account-map") ?? null,
  };
}

// ---------------------------------------------------------------------------
// Candidate resolution (golden scorer)
// ---------------------------------------------------------------------------

async function loadCandidateFromRuns(accountId: number, promptVersion: string): Promise<VenueDetailsV3 | null> {
  const pool = getPool();
  const { rows } = await pool.query<{ validation: { document: VenueDetailsV3; ok: boolean } }>(
    `select validation from venue_details_runs
     where account_id = $1 and prompt_version = $2 and validation is not null and (validation->>'ok')::boolean = true
     order by created_at desc limit 1`,
    [accountId, promptVersion]
  );
  return rows[0]?.validation.document ?? null;
}

async function loadCandidateFromVersions(accountId: number): Promise<VenueDetailsV3 | null> {
  const pool = getPool();
  const { rows } = await pool.query<{ details: VenueDetailsV3 }>(
    `select vv.details from venue_details vd join venue_details_versions vv on vv.id = vd.current_version_id where vd.account_id = $1`,
    [accountId]
  );
  return rows[0]?.details ?? null;
}

async function loadActiveCorrectionsCount(accountId: number): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ count: string }>(`select count(distinct field_path) as count from venue_details_corrections where account_id = $1`, [accountId]);
  return Number(rows[0]?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Golden scoring path
// ---------------------------------------------------------------------------

function printTierRow(label: string, m: number, t: number, acc: number, gate: number, pass: boolean) {
  console.log(`    ${label.padEnd(10)} ${m}/${t}  (${(acc * 100).toFixed(1)}%, gate >= ${(gate * 100).toFixed(0)}%)  ${pass ? "PASS" : "FAIL"}`);
}

/** One line per miss, `path: golden -> candidate (note)` -- every miss carries its own values
 * (tick c2), so a scorecard reader can tell a real extraction error from a scorer artifact without
 * re-running anything. */
function printMisses(misses: Miss[]) {
  for (const m of misses) {
    const note = m.note ? ` (${m.note})` : "";
    console.log(`      ${m.path}: ${JSON.stringify(m.golden)} → ${JSON.stringify(m.candidate)}${note}`);
  }
}

function printInventoryKindRow(label: string, k: InventoryKindScore) {
  if (k.golden_items === 0 && k.extracted_items === 0) return; // nothing to report for this kind
  console.log(
    `      ${label.padEnd(16)} recall=${(k.recall * 100).toFixed(0)}% (${k.found}/${k.golden_items})  precision=${(k.precision * 100).toFixed(0)}% (${k.matched}/${k.extracted_items})`
  );
}

function printExclusions(excluded: VenueScoreResult["excluded"]) {
  if (excluded.total === 0) {
    console.log(`    excluded    none -- every in-scope golden fact was measured`);
    return;
  }
  const parts: string[] = [];
  if (excluded.source_not_crawled.total > 0) {
    const urlList = excluded.source_not_crawled.by_url.map((u) => `${u.url} x${u.count}`).join(", ");
    parts.push(`${excluded.source_not_crawled.total} source_not_crawled (${urlList})`);
  }
  if (excluded.human_only > 0) parts.push(`${excluded.human_only} human_only`);
  if (excluded.no_text_layer > 0) parts.push(`${excluded.no_text_layer} no_text_layer`);
  if (excluded.other > 0) parts.push(`${excluded.other} other (untagged fields)`);
  console.log(`    Excluded from scoring: ${parts.join(", ")}`);
}

async function runGoldenScoring(args: Args) {
  const slugs = args.slug ? [args.slug] : GOLDEN_SLUGS;
  const results: { slug: GoldenSlug; result: VenueScoreResult | null; note: string | null }[] = [];

  for (const slug of slugs) {
    const golden = getGolden(slug);
    if (!golden) {
      results.push({ slug, result: null, note: "no golden fixture" });
      continue;
    }

    let candidate: VenueDetailsV3 | null;
    if (args.fromFile) {
      candidate = JSON.parse(readFileSync(args.fromFile, "utf8"));
    } else {
      const accountId = GOLDEN_ACCOUNT_IDS[slug];
      candidate = args.source === "runs" ? await loadCandidateFromRuns(accountId, args.promptVersion) : await loadCandidateFromVersions(accountId);
      if (candidate && args.includeCorrections) {
        // Corrections are already folded into the served document by serveVenueDetails.ts, so
        // --include-corrections only matters for --source runs (a raw, unserved run).
        const n = await loadActiveCorrectionsCount(accountId);
        if (n > 0) console.log(`[score-against-golden] note: ${n} correction(s) exist for account ${accountId} but --source runs reads the raw run, not the corrected document.`);
      }
    }

    if (!candidate) {
      results.push({ slug, result: null, note: `no candidate document (source=${args.source}${args.fromFile ? `, from-file=${args.fromFile}` : ""})` });
      continue;
    }

    const result = scoreVenue(candidate, golden, criticalFieldPaths(golden), { allFields: args.allFields });
    results.push({ slug, result, note: null });
  }

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`# Golden scoring (${slugs.length} venue${slugs.length === 1 ? "" : "s"}, source=${args.fromFile ? "file" : args.source}, prompt_version=${args.promptVersion})\n`);
  for (const { slug, result, note } of results) {
    console.log(`## ${slug}`);
    if (!result) {
      console.log(`  SKIP -- ${note}\n`);
      continue;
    }
    printTierRow("critical", result.tiers.critical.matches, result.tiers.critical.total, result.tiers.critical.accuracy, 0.95, result.gates.critical);
    printMisses(result.tiers.critical.misses);
    printTierRow("important_core", result.important_core.matches, result.important_core.total, result.important_core.accuracy, 0.85, result.gates.important);
    printMisses(result.important_core.misses);
    printTierRow("secondary", result.tiers.secondary.matches, result.tiers.secondary.total, result.tiers.secondary.accuracy, 0.7, result.gates.secondary);
    printMisses(result.tiers.secondary.misses);
    console.log(
      `    (deprecated) important (old, spine-only)  ${result.tiers.important.matches}/${result.tiers.important.total}  (${(result.tiers.important.accuracy * 100).toFixed(1)}%) -- superseded by important_core above`
    );
    console.log(
      `    headline    golden=${result.capacities.goldenHeadline ?? "null"} candidate=${result.capacities.candidateHeadline ?? "null"}  ${result.gates.headlineExact ? "EXACT" : "MISMATCH"}`
    );
    console.log(`    capacities  ${result.capacities.matches}/${result.capacities.total} exact-max matches`);
    printMisses(result.capacities.misses);
    console.log(`    spaces      recall=${(result.spaces.recall * 100).toFixed(0)}% precision=${(result.spaces.precision * 100).toFixed(0)}% (${result.spaces.matchedCount}/${result.spaces.goldenCount})`);
    console.log(`    pricing     ${result.pricingScalars.matches}/${result.pricingScalars.total} scalar matches`);
    printMisses(result.pricingScalars.misses);
    console.log(
      `    inventory   recall=${(result.inventory.recall * 100).toFixed(0)}% (${result.inventory.found}/${result.inventory.golden_items})  precision=${(result.inventory.precision * 100).toFixed(0)}% (${result.inventory.matched}/${result.inventory.extracted_items})  (informational, not gated)`
    );
    printInventoryKindRow("add_ons", result.inventory.by_kind.add_ons);
    printInventoryKindRow("inclusions", result.inventory.by_kind.inclusions);
    printInventoryKindRow("faqs", result.inventory.by_kind.faqs);
    printInventoryKindRow("resources", result.inventory.by_kind.resources);
    printInventoryKindRow("vendor_entries", result.inventory.by_kind.vendor_entries);
    printInventoryKindRow("add_on_categories", result.inventory.by_kind.add_on_categories);
    printInventoryKindRow("press_features", result.inventory.by_kind.press_features);
    console.log(
      `    cost delta  ${result.costDelta.pctDelta == null ? "n/a (no_path)" : `${(result.costDelta.pctDelta * 100).toFixed(2)}%`} (gate <= 2%)  ${result.gates.costDelta ? "PASS" : "FAIL"}`
    );
    console.log(
      `    crit. grounding  ${result.criticalGrounding.withQuote}/${result.criticalGrounding.statedCriticalNumerics}  (${(result.criticalGrounding.rate * 100).toFixed(1)}%, gate = 100%)  ${result.gates.criticalGrounding ? "PASS" : "FAIL"}`
    );
    printExclusions(result.excluded);
    const res = result.inventory.by_kind.resources;
    console.log(`    resources   ${res.found}/${res.golden_items} found (gate >= 80%)  ${result.gates.resourcesRecall ? "PASS" : "FAIL"}`);
    console.log(`    OVERALL: ${result.gates.overall ? "PASS" : "FAIL"}  (critical >= 95%, important_core >= 85%, headline exact, cost <= 2%, grounding 100%, resources >= 80%; secondary informational)\n`);
  }

  const scored = results.filter((r) => r.result != null).map((r) => r.result as VenueScoreResult);
  if (scored.length > 0) {
    const overallPass = scored.filter((r) => r.gates.overall).length;
    console.log(`# Totals: ${overallPass}/${scored.length} venues pass every gate.`);
  }
}

// ---------------------------------------------------------------------------
// Must-not path (the rubric's 15-venue floor)
// ---------------------------------------------------------------------------

async function resolveMustNotAccountIds(accountMapPath: string | null): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (accountMapPath) {
    const { rows, header } = parseCsvRows(readFileSync(accountMapPath, "utf8"), ["slug", "account_id"]);
    const slugIdx = header.indexOf("slug");
    const accountIdIdx = header.indexOf("account_id");
    for (const row of rows) map.set(row[slugIdx], Number(row[accountIdIdx]));
  }

  const pool = getPool();
  for (const [slug, fixture] of Object.entries(MUST_NOT_ASSERTIONS)) {
    if (map.has(slug)) continue;
    // Try vendors.id (legacy rubric numbering lives in the OLD venue_enrichment/vendors table,
    // which may or may not still exist under that exact id in `public.vendors` post-merge) -- fall
    // back to a name ILIKE against accounts.
    const { rows: byVendorId } = await pool.query<{ account_id: number | null }>(`select account_id from vendors where id = $1 and account_id is not null`, [
      fixture.vendor_id_legacy,
    ]);
    if (byVendorId[0]?.account_id) {
      map.set(slug, byVendorId[0].account_id);
      continue;
    }
    const { rows: byHandle } = await pool.query<{ id: number }>(`select id from accounts where lower(username) = lower($1) limit 1`, [fixture.account_hint]);
    if (byHandle[0]) {
      map.set(slug, byHandle[0].id);
      continue;
    }
    const { rows: byName } = await pool.query<{ id: number }>(`select id from accounts where full_name ilike $1 limit 1`, [`%${fixture.account_hint}%`]);
    if (byName[0]) map.set(slug, byName[0].id);
  }
  return map;
}

async function runMustNotScoring(args: Args) {
  const accountIds = await resolveMustNotAccountIds(args.accountMapPath);
  console.log(`# Must-not floor (${Object.keys(MUST_NOT_ASSERTIONS).length} rubric venues)\n`);
  console.log(`| venue | account_id | assertions checked | result |`);
  console.log(`|---|---|---|---|`);

  const failures: { slug: string; result: MustNotResult }[] = [];
  let unresolved = 0;

  for (const [slug, fixture] of Object.entries(MUST_NOT_ASSERTIONS)) {
    const accountId = accountIds.get(slug);
    if (!accountId) {
      console.log(`| ${slug} | unresolved | -- | SKIP (could not resolve account_id, legacy id ${fixture.vendor_id_legacy}) |`);
      unresolved++;
      continue;
    }
    const candidate = await loadCandidateFromVersions(accountId);
    if (!candidate) {
      console.log(`| ${slug} | ${accountId} | ${fixture.assertions.length} | SKIP (no served document -- an unserved/thin crawl passes trivially, not scored) |`);
      continue;
    }
    const result = runMustNot(candidate, fixture.assertions);
    console.log(`| ${slug} | ${accountId} | ${fixture.assertions.length} | ${result.passed ? "PASS" : `FAIL (${result.failed.length})`} |`);
    if (!result.passed) failures.push({ slug, result });
  }

  if (failures.length > 0) {
    console.log(`\n## Failures\n`);
    for (const { slug, result } of failures) {
      console.log(`### ${slug}`);
      for (const f of result.failed) console.log(`  - [${f.assertion}] ${f.detail}`);
    }
  }
  if (unresolved > 0) {
    console.log(`\n${unresolved} venue(s) could not be resolved to an account_id -- pass --account-map <csv with slug,account_id columns> to override.`);
  }
  console.log(`\n# Totals: ${Object.keys(MUST_NOT_ASSERTIONS).length - failures.length - unresolved}/${Object.keys(MUST_NOT_ASSERTIONS).length} pass (${unresolved} unresolved).`);
}

async function main() {
  const args = parseArgs();
  try {
    if (args.mustnot) await runMustNotScoring(args);
    else await runGoldenScoring(args);
  } finally {
    // Safe even when no DB call was ever made (pure --from-file, single golden-vs-itself run):
    // closePool() is a no-op until getPool() has actually been called once.
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
