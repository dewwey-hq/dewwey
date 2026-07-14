#!/usr/bin/env node
/**
 * Phase 2: batch-enrich Chicago venues → RDS (rules + Vertex LLM + persist).
 *
 *   npm run enrich-venues-batch
 *   npm run enrich-venues-batch -- --limit 5
 *   npm run enrich-venues-batch -- --force          # re-enrich even if success
 *   npm run enrich-venues-batch -- --include-review # also re-run needs_review rows
 *   npm run enrich-venues-batch -- --dry-run
 *
 * Skips venues with no website. By default skips rows already status=success
 * (pilot / prior runs) to save LLM cost.
 */
require("dotenv").config({ path: ".env.local", quiet: true });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { crawlSite, normalizeUrl } = require("./crawl");
const { mergeEnrichment } = require("./enrich");
const { DEFAULT_MAX_DEPTH, DEFAULT_MAX_PAGES, FETCH_DELAY_MS } = require("./constants");
const { persistVenueEnrichment } = require("./persist");
const { getExtractFn, providerReady, getVertexConfig } = require("./llm-extract");
const { sleep } = require("./fetch");

const OUT_DIR = path.join(__dirname, "sample-output", "batch-enrich");
const DEFAULT_MODEL = process.env.ENRICH_LLM_MODEL || "gemini-3.5-flash";

function parseArgs(argv) {
  const args = {
    limit: null,
    force: false,
    includeReview: false,
    dryRun: false,
    provider: getVertexConfig() ? "vertex" : "gemini",
    model: DEFAULT_MODEL,
    maxPages: DEFAULT_MAX_PAGES,
    maxDepth: DEFAULT_MAX_DEPTH,
    delayMs: Math.max(FETCH_DELAY_MS, 1500),
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit" && argv[i + 1]) args.limit = parseInt(argv[++i], 10);
    else if (a === "--force") args.force = true;
    else if (a === "--include-review") args.includeReview = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--provider" && argv[i + 1]) args.provider = argv[++i].toLowerCase();
    else if (a === "--model" && argv[i + 1]) args.model = argv[++i];
    else if (a === "--max-pages" && argv[i + 1]) args.maxPages = parseInt(argv[++i], 10);
    else if (a === "--delay-ms" && argv[i + 1]) args.delayMs = parseInt(argv[++i], 10);
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function createPool() {
  return new Pool({
    host: (process.env.DB_HOST || "").trim(),
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
}

async function listVenues(pool, args) {
  const { rows } = await pool.query(
    `SELECT
       v.id,
       v.name,
       v.website,
       e.status AS enrichment_status,
       e.needs_review,
       e.capacity_max
     FROM vendors v
     LEFT JOIN venue_enrichment e ON e.vendor_id = v.id
     WHERE v.category = 'venue'
       AND v.website IS NOT NULL
       AND TRIM(v.website) <> ''
     ORDER BY v.id`,
  );

  return rows.filter((v) => {
    if (args.force) return true;
    if (!v.enrichment_status) return true; // never enriched
    if (v.enrichment_status === "failed") return true;
    if (args.includeReview && v.needs_review) return true;
    return false;
  });
}

async function enrichOne(pool, venue, args, extractFn) {
  const startUrl = normalizeUrl(venue.website);
  if (!startUrl) {
    return { ok: false, error: "invalid website URL" };
  }

  const crawledAt = new Date().toISOString();
  const pages = await crawlSite(startUrl, {
    maxDepth: args.maxDepth,
    maxPages: args.maxPages,
    weddingOnly: true,
  });

  const rules = await mergeEnrichment(pages, startUrl, {
    id: venue.id,
    name: venue.name,
    crawled_at: crawledAt,
  });
  rules.extraction_method = "rules_v1";

  let llm = null;
  if (pages.length > 0) {
    llm = await extractFn(
      pages,
      { name: venue.name, website: startUrl },
      args.model,
    );
  }

  const saved = await persistVenueEnrichment(pool, {
    vendorId: venue.id,
    website: startUrl,
    rules,
    llm,
  });

  return {
    ok: true,
    pages: pages.length,
    status: saved.enrichment.status,
    needs_review: saved.enrichment.needs_review,
    capacity_max: saved.enrichment.capacity_max,
    cost_usd: llm?.meta?.estimated_cost_usd ?? null,
    rules_run_id: saved.rulesRunId,
    llm_run_id: saved.llmRunId,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: npm run enrich-venues-batch -- [--limit N] [--force] [--include-review] [--dry-run]`);
    return;
  }

  if (!providerReady(args.provider)) {
    throw new Error(
      `LLM provider "${args.provider}" not ready. Configure Vertex (GOOGLE_CLOUD_PROJECT + ADC) or GEMINI_API_KEY.`,
    );
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pool = createPool();
  const extractFn = getExtractFn(args.provider);

  try {
    let venues = await listVenues(pool, args);
    if (args.limit) venues = venues.slice(0, args.limit);

    const report = {
      run_at: new Date().toISOString(),
      provider: args.provider,
      model: args.model,
      force: args.force,
      include_review: args.includeReview,
      dry_run: args.dryRun,
      queued: venues.length,
      results: [],
      total_cost_usd: 0,
    };

    process.stderr.write(
      `Phase 2 batch: ${venues.length} venue(s) provider=${args.provider} model=${args.model}` +
        (args.dryRun ? " DRY-RUN" : "") +
        "\n",
    );

    for (let i = 0; i < venues.length; i++) {
      const venue = venues[i];
      process.stderr.write(
        `\n[${i + 1}/${venues.length}] [${venue.id}] ${venue.name} (${venue.website})\n`,
      );

      if (args.dryRun) {
        report.results.push({
          vendor_id: venue.id,
          name: venue.name,
          skipped: "dry-run",
          prior_status: venue.enrichment_status,
        });
        continue;
      }

      try {
        const result = await enrichOne(pool, venue, args, extractFn);
        report.results.push({
          vendor_id: venue.id,
          name: venue.name,
          ...result,
        });
        if (result.cost_usd) report.total_cost_usd += result.cost_usd;
        process.stderr.write(
          `  → status=${result.status} capacity=${result.capacity_max} needs_review=${result.needs_review} pages=${result.pages} cost≈$${(result.cost_usd ?? 0).toFixed(4)}\n`,
        );
      } catch (err) {
        report.results.push({
          vendor_id: venue.id,
          name: venue.name,
          ok: false,
          error: err.message,
        });
        process.stderr.write(`  → FAILED ${err.message}\n`);
      }

      if (i < venues.length - 1) await sleep(args.delayMs);
    }

    const outPath = path.join(OUT_DIR, `run-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.stderr.write(
      `\nDone. queued=${report.queued} ok=${report.results.filter((r) => r.ok).length} failed=${report.results.filter((r) => r.ok === false).length} cost≈$${report.total_cost_usd.toFixed(4)}\nWrote ${outPath}\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("enrich-venues-batch failed:", err.message);
  process.exit(1);
});
