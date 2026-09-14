/**
 * The venue-details funnel report (plan Phase 3 "Done" criteria: "funnel + coverage reports
 * saved"). Every stage is a count over the LISTED universe (`universe.ts`'s `listedVenueAccountIds`,
 * called live -- never a remembered number, per the plan's "Open assumptions"), each stage a subset
 * of the one before it: listed -> website verified -> crawled (>=5 usable pages) -> extracted ->
 * validated ok -> repaired -> served -> compare_ready -> excellent -> human verified.
 *
 * Also reports: per-spine-field stated rate by tier (over served documents), a `review_reasons`
 * histogram, spend by prompt_version/stage, and the crawl ceiling (shells + image-only-PDF-only
 * venues among the listed universe's websites) -- the same numbers `reportCrawlCoverage.ts`
 * computes per-venue, aggregated here into one line each.
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/reportVenueDetailsFunnel.ts
 *   bun run scripts/venue-details/reportVenueDetailsFunnel.ts --prompt-version venue-details-v3.0 --json
 *   bun run scripts/venue-details/reportVenueDetailsFunnel.ts --out scripts/graph/tmp_analysis/funnel.md
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool, closePool } from "../classify/db";
import { listedVenueAccountIds } from "./universe";
import { DEFAULT_PROMPT_VERSION } from "./contract";
import { isExcellent } from "../../lib/venueDetails/tiers";
import { SPINE_KEYS, SPINE_TIERS, type SpineTier, type VenueDetailsV3 } from "../../lib/venueDetails/types";

const USABLE_PAGE_CHARS = 400;

interface Args {
  promptVersion: string;
  json: boolean;
  out: string | null;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return { promptVersion: get("--prompt-version") ?? DEFAULT_PROMPT_VERSION, json: a.includes("--json"), out: get("--out") ?? null };
}

interface FunnelCounts {
  listed: number;
  websiteVerified: number;
  crawled: number;
  extracted: number;
  validatedOk: number;
  repaired: number;
  served: number;
  compareReady: number;
  excellent: number;
  humanVerified: number;
}

async function computeFunnel(listedIds: number[], promptVersion: string): Promise<FunnelCounts> {
  const pool = getPool();
  if (listedIds.length === 0) {
    return { listed: 0, websiteVerified: 0, crawled: 0, extracted: 0, validatedOk: 0, repaired: 0, served: 0, compareReady: 0, excellent: 0, humanVerified: 0 };
  }

  const { rows: verifiedRows } = await pool.query<{ account_id: number }>(
    `select account_id from venue_websites where account_id = any($1::bigint[]) and status = 'verified'`,
    [listedIds]
  );
  const verifiedIds = verifiedRows.map((r) => r.account_id);

  let crawled = 0;
  if (verifiedIds.length > 0) {
    const { rows: fetchRows } = await pool.query<{ account_id: number; kind: string | null; chars: number | null }>(
      `select f.account_id, s.kind, s.chars
       from venue_source_fetches f
       left join venue_source_snapshots s on s.id = f.snapshot_id
       where f.account_id = any($1::bigint[])`,
      [verifiedIds]
    );
    const usablePagesByAccount = new Map<number, number>();
    for (const r of fetchRows) {
      if (r.kind !== "html" || (r.chars ?? 0) < USABLE_PAGE_CHARS) continue;
      usablePagesByAccount.set(r.account_id, (usablePagesByAccount.get(r.account_id) ?? 0) + 1);
    }
    crawled = [...usablePagesByAccount.values()].filter((n) => n >= 5).length;
  }

  const { rows: extractedRows } = await pool.query<{ account_id: number }>(
    `select distinct account_id from venue_details_runs where account_id = any($1::bigint[]) and stage = 'extract' and prompt_version = $2`,
    [listedIds, promptVersion]
  );
  const { rows: validatedRows } = await pool.query<{ account_id: number }>(
    `select distinct account_id from venue_details_runs where account_id = any($1::bigint[]) and prompt_version = $2 and (validation->>'ok')::boolean = true`,
    [listedIds, promptVersion]
  );
  const { rows: repairedRows } = await pool.query<{ account_id: number }>(
    `select distinct account_id from venue_details_runs where account_id = any($1::bigint[]) and stage = 'repair' and prompt_version = $2`,
    [listedIds, promptVersion]
  );
  const { rows: servedRows } = await pool.query<{ account_id: number; compare_ready: boolean; human_verified_at: string | null }>(
    `select account_id, compare_ready, human_verified_at from venue_details where account_id = any($1::bigint[])`,
    [listedIds]
  );
  const compareReady = servedRows.filter((r) => r.compare_ready).length;
  const humanVerified = servedRows.filter((r) => r.human_verified_at != null).length;

  let excellent = 0;
  if (servedRows.length > 0) {
    const { rows: docRows } = await pool.query<{ account_id: number; details: VenueDetailsV3; compare_ready: boolean; human_verified_at: string | null }>(
      `select vd.account_id, vv.details, vd.compare_ready, vd.human_verified_at
       from venue_details vd join venue_details_versions vv on vv.id = vd.current_version_id
       where vd.account_id = any($1::bigint[])`,
      [listedIds]
    );
    excellent = docRows.filter((r) => isExcellent(r.details, { compareReady: r.compare_ready, humanVerified: r.human_verified_at != null })).length;
  }

  return {
    listed: listedIds.length,
    websiteVerified: verifiedIds.length,
    crawled,
    extracted: extractedRows.length,
    validatedOk: validatedRows.length,
    repaired: repairedRows.length,
    served: servedRows.length,
    compareReady,
    excellent,
    humanVerified,
  };
}

// ---------------------------------------------------------------------------
// Per-spine-field stated rate by tier (over served documents)
// ---------------------------------------------------------------------------

interface FieldStatedRate {
  field: string;
  tier: SpineTier;
  statedRate: number;
}

async function computeFieldStatedRates(listedIds: number[]): Promise<{ perField: FieldStatedRate[]; byTier: Record<SpineTier, number> }> {
  const pool = getPool();
  if (listedIds.length === 0) {
    return { perField: [], byTier: { critical: 0, important: 0, secondary: 0 } };
  }
  const { rows } = await pool.query<{ details: VenueDetailsV3 }>(
    `select vv.details from venue_details vd join venue_details_versions vv on vv.id = vd.current_version_id where vd.account_id = any($1::bigint[])`,
    [listedIds]
  );
  const n = rows.length;
  const perField: FieldStatedRate[] = SPINE_KEYS.map((key) => {
    const statedCount = n === 0 ? 0 : rows.filter((r) => r.details.spine[key].status === "stated" || r.details.spine[key].status === "conflicting").length;
    return { field: key, tier: SPINE_TIERS[key], statedRate: n === 0 ? 0 : statedCount / n };
  });
  const byTier: Record<SpineTier, number> = { critical: 0, important: 0, secondary: 0 };
  for (const tier of ["critical", "important", "secondary"] as SpineTier[]) {
    const fields = perField.filter((f) => f.tier === tier);
    byTier[tier] = fields.length === 0 ? 0 : fields.reduce((sum, f) => sum + f.statedRate, 0) / fields.length;
  }
  return { perField, byTier };
}

// ---------------------------------------------------------------------------
// review_reasons histogram
// ---------------------------------------------------------------------------

async function computeReviewReasonsHistogram(listedIds: number[]): Promise<Record<string, number>> {
  const pool = getPool();
  if (listedIds.length === 0) return {};
  const { rows } = await pool.query<{ review_reasons: string[] }>(`select review_reasons from venue_details where account_id = any($1::bigint[]) and needs_review`, [
    listedIds,
  ]);
  const histogram: Record<string, number> = {};
  for (const row of rows) {
    for (const reason of row.review_reasons ?? []) histogram[reason] = (histogram[reason] ?? 0) + 1;
  }
  return histogram;
}

// ---------------------------------------------------------------------------
// Spend by prompt_version / stage
// ---------------------------------------------------------------------------

interface SpendRow {
  promptVersion: string;
  stage: string;
  totalCostUsd: number;
  runCount: number;
}

async function computeSpend(listedIds: number[]): Promise<SpendRow[]> {
  const pool = getPool();
  if (listedIds.length === 0) return [];
  const { rows } = await pool.query<{ prompt_version: string; stage: string; total_cost_usd: string | null; run_count: string }>(
    `select prompt_version, stage, sum(cost_usd) as total_cost_usd, count(*) as run_count
     from venue_details_runs where account_id = any($1::bigint[]) group by prompt_version, stage order by prompt_version, stage`,
    [listedIds]
  );
  return rows.map((r) => ({ promptVersion: r.prompt_version, stage: r.stage, totalCostUsd: Number(r.total_cost_usd ?? 0), runCount: Number(r.run_count) }));
}

// ---------------------------------------------------------------------------
// Crawl ceiling (shells + image-only-PDF-only) over the listed universe's websites
// ---------------------------------------------------------------------------

interface CrawlCeiling {
  websitesChecked: number;
  shells: number;
  imageOnlyPdfOnly: number;
}

async function computeCrawlCeiling(listedIds: number[]): Promise<CrawlCeiling> {
  const pool = getPool();
  if (listedIds.length === 0) return { websitesChecked: 0, shells: 0, imageOnlyPdfOnly: 0 };
  const { rows: websites } = await pool.query<{ account_id: number }>(`select account_id from venue_websites where account_id = any($1::bigint[])`, [listedIds]);
  if (websites.length === 0) return { websitesChecked: 0, shells: 0, imageOnlyPdfOnly: 0 };

  const websiteIds = websites.map((w) => w.account_id);
  const { rows: fetchRows } = await pool.query<{ account_id: number; outcome: string; kind: string | null; chars: number | null; has_text_layer: boolean | null }>(
    `select f.account_id, f.outcome, s.kind, s.chars, s.has_text_layer
     from venue_source_fetches f left join venue_source_snapshots s on s.id = f.snapshot_id
     where f.account_id = any($1::bigint[])`,
    [websiteIds]
  );

  const byAccount = new Map<number, { usablePages: number; textLayerPdfs: number; imageOnlyPdfs: number }>();
  for (const id of websiteIds) byAccount.set(id, { usablePages: 0, textLayerPdfs: 0, imageOnlyPdfs: 0 });
  for (const r of fetchRows) {
    const acc = byAccount.get(r.account_id);
    if (!acc) continue;
    if (r.kind === "html" && (r.chars ?? 0) >= USABLE_PAGE_CHARS) acc.usablePages++;
    else if (r.kind === "pdf") {
      if (r.has_text_layer) acc.textLayerPdfs++;
      else acc.imageOnlyPdfs++;
    }
  }

  let shells = 0;
  let imageOnlyPdfOnly = 0;
  for (const acc of byAccount.values()) {
    if (acc.usablePages === 0 && acc.textLayerPdfs === 0) {
      if (acc.imageOnlyPdfs > 0) imageOnlyPdfOnly++;
      else shells++;
    }
  }
  return { websitesChecked: websiteIds.length, shells, imageOnlyPdfOnly };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;
}

function buildMarkdown(
  funnel: FunnelCounts,
  fieldRates: { perField: FieldStatedRate[]; byTier: Record<SpineTier, number> },
  reviewHistogram: Record<string, number>,
  spend: SpendRow[],
  ceiling: CrawlCeiling,
  promptVersion: string
): string {
  const lines: string[] = [];
  lines.push(`# Venue details funnel`);
  lines.push("");
  lines.push(`Generated ${new Date().toISOString()}. prompt_version = ${promptVersion}.`);
  lines.push("");

  lines.push(`## Funnel`);
  lines.push("");
  lines.push(`| stage | count | % of listed |`);
  lines.push(`|---|---|---|`);
  lines.push(`| listed | ${funnel.listed} | 100% |`);
  lines.push(`| website verified | ${funnel.websiteVerified} | ${pct(funnel.websiteVerified, funnel.listed)} |`);
  lines.push(`| crawled (>=5 usable pages) | ${funnel.crawled} | ${pct(funnel.crawled, funnel.listed)} |`);
  lines.push(`| extracted | ${funnel.extracted} | ${pct(funnel.extracted, funnel.listed)} |`);
  lines.push(`| validated ok | ${funnel.validatedOk} | ${pct(funnel.validatedOk, funnel.listed)} |`);
  lines.push(`| repaired | ${funnel.repaired} | ${pct(funnel.repaired, funnel.listed)} |`);
  lines.push(`| served | ${funnel.served} | ${pct(funnel.served, funnel.listed)} |`);
  lines.push(`| **compare_ready** | **${funnel.compareReady}** | ${pct(funnel.compareReady, funnel.listed)} |`);
  lines.push(`| **excellent** | **${funnel.excellent}** | ${pct(funnel.excellent, funnel.listed)} |`);
  lines.push(`| human verified | ${funnel.humanVerified} | ${pct(funnel.humanVerified, funnel.listed)} |`);
  lines.push("");

  lines.push(`## Per-spine-field stated rate by tier (over served documents)`);
  lines.push("");
  lines.push(`Tier averages: critical ${pct(fieldRates.byTier.critical, 1)}, important ${pct(fieldRates.byTier.important, 1)}, secondary ${pct(fieldRates.byTier.secondary, 1)}`);
  lines.push("");
  lines.push(`| field | tier | stated rate |`);
  lines.push(`|---|---|---|`);
  for (const f of fieldRates.perField) lines.push(`| ${f.field} | ${f.tier} | ${pct(f.statedRate, 1)} |`);
  lines.push("");

  lines.push(`## review_reasons histogram (needs_review rows only)`);
  lines.push("");
  const reasonEntries = Object.entries(reviewHistogram).sort((a, b) => b[1] - a[1]);
  if (reasonEntries.length === 0) {
    lines.push(`(none)`);
  } else {
    lines.push(`| reason | count |`);
    lines.push(`|---|---|`);
    for (const [reason, count] of reasonEntries) lines.push(`| ${reason} | ${count} |`);
  }
  lines.push("");

  lines.push(`## Spend by prompt_version / stage`);
  lines.push("");
  if (spend.length === 0) {
    lines.push(`(no runs yet)`);
  } else {
    lines.push(`| prompt_version | stage | runs | total cost (USD) |`);
    lines.push(`|---|---|---|---|`);
    for (const s of spend) lines.push(`| ${s.promptVersion} | ${s.stage} | ${s.runCount} | $${s.totalCostUsd.toFixed(2)} |`);
    const total = spend.reduce((sum, s) => sum + s.totalCostUsd, 0);
    lines.push(`| **total** | | | **$${total.toFixed(2)}** |`);
  }
  lines.push("");

  lines.push(`## Crawl ceiling (listed universe's websites)`);
  lines.push("");
  lines.push(`- Websites checked: **${ceiling.websitesChecked}**`);
  lines.push(`- Shells (zero usable pages, no text-layer PDF): **${ceiling.shells}** (${pct(ceiling.shells, ceiling.websitesChecked)})`);
  lines.push(`- Image-only-PDF-only (zero usable pages, only image-only PDFs): **${ceiling.imageOnlyPdfOnly}** (${pct(ceiling.imageOnlyPdfOnly, ceiling.websitesChecked)})`);
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const args = parseArgs();
  const pool = getPool();

  const listedIds = await listedVenueAccountIds(pool);
  const funnel = await computeFunnel(listedIds, args.promptVersion);
  const fieldRates = await computeFieldStatedRates(listedIds);
  const reviewHistogram = await computeReviewReasonsHistogram(listedIds);
  const spend = await computeSpend(listedIds);
  const ceiling = await computeCrawlCeiling(listedIds);

  const markdown = buildMarkdown(funnel, fieldRates, reviewHistogram, spend, ceiling, args.promptVersion);
  console.log(markdown);

  const defaultOut = `scripts/graph/tmp_analysis/venue_details_funnel_${new Date().toISOString().slice(0, 10)}.md`;
  const outPath = args.out ?? defaultOut;
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, markdown, "utf8");
  console.log(`\n[report-venue-details-funnel] wrote ${outPath}`);

  if (args.json) {
    const jsonPath = outPath.replace(/\.md$/, ".json");
    await writeFile(jsonPath, JSON.stringify({ funnel, fieldRates, reviewHistogram, spend, ceiling }, null, 2), "utf8");
    console.log(`[report-venue-details-funnel] wrote ${jsonPath}`);
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
