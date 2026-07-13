#!/usr/bin/env node
/**
 * LLM extraction pilot: crawl (HTTP-only) → cache HTML → rules baseline vs Gemini models.
 *
 *   npm run enrich-venue-llm-pilot                    # crawl + rules + both Gemini models
 *   npm run enrich-venue-llm-pilot -- --use-cache     # skip re-crawl
 *   npm run enrich-venue-llm-pilot -- --rules-only    # crawl + rules only
 *   npm run enrich-venue-llm-pilot -- --llm-only --limit 3
 *   npm run enrich-venue-llm-pilot -- --llm-only --limit 3 --provider vertex
 *   npm run enrich-venue-llm-pilot -- --llm-only --models flash --provider vertex
 *   npm run enrich-venue-llm-pilot -- --venue "The Geraghty" --provider vertex
 *
 * Providers:
 *   vertex  — Vertex AI (GCP project credits). Needs GOOGLE_CLOUD_PROJECT + ADC/SA JSON.
 *   gemini  — Gemini Developer API key (AI Studio). Needs GEMINI_API_KEY.
 *
 * Models: gemini-3.5-flash + gemini-3.1-flash-lite on each venue (override with --models flash|lite|all).
 */
require("dotenv").config({ path: ".env.local", quiet: true });
const fs = require("fs");
const path = require("path");
const { crawlSite, normalizeUrl } = require("./crawl");
const { mergeEnrichment } = require("./enrich");
const { saveCrawlCache, loadCrawlCache, slugify } = require("./crawl-cache");
const {
  getExtractFn,
  providerReady,
  getVertexConfig,
  summarizeLlmExtraction,
  PILOT_GEMINI_MODELS,
} = require("./llm-extract");
const { FETCH_DELAY_MS } = require("./constants");
const { sleep } = require("./fetch");

const PILOT_VENUES = [
  { name: "Woman's Club of Evanston", url: "https://www.wcofe-events.com/" },
  { name: "Artifact Events", url: "https://www.artifacteventschicago.com/" },
  { name: "The Geraghty", url: "http://www.thegeraghty.com/" },
  { name: "Chez Wedding Venue", url: "http://chezweddingvenue.com/" },
  { name: "Rockwell on the River", url: "https://rockwellontheriver.com/" },
  { name: "Room 1520", url: "http://www.room1520.com/" },
  { name: "The Joinery", url: "http://www.thejoinerychicago.com/" },
  { name: "Stan Mansion", url: "https://www.stanmansion.com/" },
  { name: "Diamond Garden Banquet Hall", url: "http://www.diamondgardenhall.com/" },
  { name: "Colvin House", url: "https://colvinhouseevents.com/" },
];

const OUT_DIR = path.join(__dirname, "sample-output", "llm-pilot");
const CACHE_DIR = path.join(OUT_DIR, "cache");
const MAX_PAGES = parseInt(process.env.ENRICH_MAX_PAGES || "30", 10);

function rulesSummary(rules) {
  return {
    status: rules.status,
    enriched_at: rules.enriched_at ?? null,
    crawled_at: rules.crawled_at ?? null,
    pages: rules.pages_crawled.length,
    capacity_max: rules.pricing.capacity_max,
    capacity_context: rules.pricing.capacity_context ?? null,
    amenities: Object.keys(rules.amenities).length,
    policies: Object.keys(rules.policies).length,
    price_display: rules.pricing.display,
    network_vendors: rules.network_vendors.length,
    faqs: rules.faqs.length,
    emails: rules.contact.emails.length,
  };
}

function compareLlmToRulesSummary(rs, llmResult) {
  if (!llmResult || llmResult.error) return { skipped: true, error: llmResult?.error ?? null };
  const ls = summarizeLlmExtraction(llmResult);
  return {
    model: ls.model,
    capacity: {
      rules: rs.capacity_max,
      llm: ls.capacity_max,
      llm_as_stated: ls.capacity_as_stated,
      llm_quote: ls.capacity_quote,
      configurations: ls.capacity_configurations_count,
    },
    price: {
      rules: rs.price_display,
      llm: ls.price_display,
      model: ls.pricing_model,
      as_stated: ls.pricing_as_stated,
    },
    discovered_assets: ls.discovered_assets_count,
    amenities: { rules: rs.amenities, llm: ls.amenities_count },
    included_inventory: ls.included_inventory_count,
    catering: ls.catering,
    event_insurance: ls.event_insurance,
    policies: { rules: rs.policies, llm: ls.policies_set },
    confidence: ls.confidence,
    cost_usd: ls.cost_usd,
    latency_ms: ls.latency_ms,
  };
}

async function processVenue(venue, options) {
  const startUrl = normalizeUrl(venue.url);
  process.stderr.write(`\n=== ${venue.name} ===\n`);

  let pages;
  let crawledAt = null;
  if (options.useCache || options.llmOnly) {
    const cached = loadCrawlCache(CACHE_DIR, venue.name);
    if (cached) {
      pages = cached.pages;
      crawledAt = cached.manifest?.crawled_at || cached.manifest?.saved_at || null;
      process.stderr.write(
        `  loaded ${pages.length} cached pages` +
          (crawledAt ? ` (crawled_at=${crawledAt})` : "") +
          "\n",
      );
    }
  }
  if (!pages && !options.llmOnly) {
    crawledAt = new Date().toISOString();
    pages = await crawlSite(startUrl, { maxPages: MAX_PAGES, weddingOnly: true });
    saveCrawlCache(CACHE_DIR, venue.name, pages, startUrl);
    process.stderr.write(`  crawled ${pages.length} pages → cache (crawled_at=${crawledAt})\n`);
  }
  if (!pages) {
    throw new Error("No cached pages — run without --llm-only first");
  }

  const slug = slugify(venue.name);
  let rulesSummaryData = null;

  if (!options.llmOnly) {
    const rules = await mergeEnrichment(pages, startUrl, {
      name: venue.name,
      crawled_at: crawledAt,
    });
    rules.extraction_method = "rules_v1";
    fs.writeFileSync(path.join(OUT_DIR, `${slug}-rules.json`), JSON.stringify(rules, null, 2));
    rulesSummaryData = rulesSummary(rules);
  } else {
    const rulesPath = path.join(OUT_DIR, `${slug}-rules.json`);
    if (fs.existsSync(rulesPath)) {
      rulesSummaryData = rulesSummary(JSON.parse(fs.readFileSync(rulesPath, "utf8")));
    }
  }

  const llmResults = {};
  const compares = {};
  const extractFn = getExtractFn(options.provider);
  const providerLabel = options.provider === "vertex" ? "Vertex" : "Gemini";
  const models = options.models || PILOT_GEMINI_MODELS;

  if (!options.rulesOnly) {
    for (const model of models) {
      try {
        process.stderr.write(`  ${providerLabel} ${model.id}…\n`);
        const result = await extractFn(pages, { name: venue.name, website: startUrl }, model.id);
        llmResults[model.slug] = result;
        fs.writeFileSync(
          path.join(OUT_DIR, `${slug}-llm-${model.slug}.json`),
          JSON.stringify(
            {
              venue: venue.name,
              website: startUrl,
              extracted_at: new Date().toISOString(),
              crawled_at: crawledAt,
              ...result,
            },
            null,
            2,
          ),
        );
        process.stderr.write(
          `    confidence=${result.extraction.confidence} configs=${(result.extraction.capacity_configurations || []).length} assets=${(result.extraction.discovered_assets || []).length} cost≈$${(result.meta.estimated_cost_usd ?? 0).toFixed(5)} ${result.meta.latency_ms}ms\n`,
        );
        if (rulesSummaryData) {
          compares[model.slug] = compareLlmToRulesSummary(rulesSummaryData, result);
        }
        await sleep(FETCH_DELAY_MS);
      } catch (err) {
        process.stderr.write(`    FAILED ${model.id}: ${err.message}\n`);
        llmResults[model.slug] = { error: err.message };
        compares[model.slug] = { error: err.message };
      }
    }
  }

  const llmSummaries = {};
  for (const [key, val] of Object.entries(llmResults)) {
    llmSummaries[key] = val.error ? { error: val.error } : summarizeLlmExtraction(val);
  }

  return {
    venue: venue.name,
    url: startUrl,
    crawled_at: crawledAt || rulesSummaryData?.crawled_at || null,
    rules: rulesSummaryData,
    llm: llmSummaries,
    compare: compares,
  };
}

function parseLimit(argv) {
  const idx = argv.indexOf("--limit");
  if (idx === -1 || !argv[idx + 1]) return null;
  const n = parseInt(argv[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseVenueFilter(argv) {
  const idx = argv.indexOf("--venue");
  if (idx === -1 || !argv[idx + 1]) return null;
  return argv[idx + 1].toLowerCase();
}

function parseProvider(argv) {
  const idx = argv.indexOf("--provider");
  if (idx === -1 || !argv[idx + 1]) {
    // Prefer Vertex when project is configured (credit-driven path).
    return getVertexConfig() ? "vertex" : "gemini";
  }
  const p = argv[idx + 1].toLowerCase();
  if (p !== "vertex" && p !== "gemini") {
    throw new Error(`Unknown --provider ${p} (use vertex or gemini)`);
  }
  return p;
}

/** --models flash|lite|all (default all) */
function parseModels(argv) {
  const idx = argv.indexOf("--models");
  const raw = idx === -1 || !argv[idx + 1] ? "all" : argv[idx + 1].toLowerCase();
  if (raw === "flash") {
    return PILOT_GEMINI_MODELS.filter((m) => m.id === "gemini-3.5-flash");
  }
  if (raw === "lite") {
    return PILOT_GEMINI_MODELS.filter((m) => m.id === "gemini-3.1-flash-lite");
  }
  if (raw === "all") return PILOT_GEMINI_MODELS;
  throw new Error(`Unknown --models ${raw} (use flash, lite, or all)`);
}

async function main() {
  const options = {
    useCache: process.argv.includes("--use-cache"),
    rulesOnly: process.argv.includes("--rules-only"),
    llmOnly: process.argv.includes("--llm-only"),
    limit: parseLimit(process.argv),
    venueFilter: parseVenueFilter(process.argv),
    provider: parseProvider(process.argv),
    models: parseModels(process.argv),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  if (!options.rulesOnly && !providerReady(options.provider)) {
    if (options.provider === "vertex") {
      process.stderr.write(
        "Vertex not ready — set GOOGLE_CLOUD_PROJECT and GOOGLE_APPLICATION_CREDENTIALS (or ADC).\nFalling back to rules-only.\n",
      );
    } else {
      process.stderr.write(
        "No GEMINI_API_KEY — running rules-only. Add GEMINI_API_KEY or use --provider vertex.\n",
      );
    }
    options.rulesOnly = true;
  }

  const vertexCfg = getVertexConfig();
  const report = {
    run_at: new Date().toISOString(),
    provider: options.provider,
    vertex: options.provider === "vertex" ? vertexCfg : null,
    max_pages: MAX_PAGES,
    fetch: "http_only (Playwright fallback — not used in pilot)",
    storage: "local cache at sample-output/llm-pilot/cache/",
    provenance: "{ value, quote, source_url } per LLM field",
    gemini_models: options.models.map((m) => m.id),
    limit: options.limit ?? PILOT_VENUES.length,
    venue_filter: options.venueFilter,
    venues: [],
  };

  process.stderr.write(
    `Provider: ${options.provider}` +
      (options.provider === "vertex" && vertexCfg
        ? ` (project=${vertexCfg.project}, location=${vertexCfg.location})`
        : "") +
      "\n",
  );

  let venues = PILOT_VENUES;
  if (options.venueFilter) {
    venues = venues.filter((v) => v.name.toLowerCase().includes(options.venueFilter));
    if (venues.length === 0) {
      throw new Error(`No pilot venue matches --venue ${options.venueFilter}`);
    }
  }
  if (options.limit) venues = venues.slice(0, options.limit);

  for (const venue of venues) {
    try {
      report.venues.push(await processVenue(venue, options));
    } catch (err) {
      process.stderr.write(`  FAILED: ${err.message}\n`);
      report.venues.push({ venue: venue.name, url: venue.url, error: err.message });
    }
  }

  let totalCost = 0;
  for (const v of report.venues) {
    if (!v.llm) continue;
    for (const summary of Object.values(v.llm)) {
      totalCost += summary.cost_usd || 0;
    }
  }
  report.total_llm_cost_usd = totalCost;

  fs.writeFileSync(path.join(OUT_DIR, "_summary.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.stderr.write(`\nOutput: ${OUT_DIR}/\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
