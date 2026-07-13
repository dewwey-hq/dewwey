#!/usr/bin/env node
/**
 * Venue website enrichment CLI.
 *
 * Phase 0 (stdout):
 *   npm run enrich-venue -- --url https://www.wcofe-events.com/ --pretty
 *   npm run enrich-venue -- --vendor-id 42 --pretty
 *
 * Phase 1 (persist hybrid rules + optional LLM):
 *   npm run enrich-venue -- --vendor-id 42 --use-llm --persist
 *   npm run enrich-venue -- --vendor-id 42 --persist          # rules only
 *
 * Seed from existing pilot JSON (no re-crawl / no LLM $):
 *   npm run enrich-venue -- --persist-pilot --venue "Artifact Events"
 *   npm run enrich-venue -- --persist-pilot --all-pilot
 */
require("dotenv").config({ path: ".env.local", quiet: true });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { crawlSite, normalizeUrl } = require("./venue-enrichment/crawl");
const { mergeEnrichment } = require("./venue-enrichment/enrich");
const { DEFAULT_MAX_DEPTH, DEFAULT_MAX_PAGES } = require("./venue-enrichment/constants");
const { persistVenueEnrichment } = require("./venue-enrichment/persist");
const {
  getExtractFn,
  providerReady,
  getVertexConfig,
} = require("./venue-enrichment/llm-extract");
const { slugify } = require("./venue-enrichment/crawl-cache");

const PILOT_DIR = path.join(__dirname, "venue-enrichment", "sample-output", "llm-pilot");

function parseArgs(argv) {
  const args = {
    url: null,
    vendorId: null,
    maxDepth: DEFAULT_MAX_DEPTH,
    maxPages: DEFAULT_MAX_PAGES,
    pretty: false,
    probeSeeds: false,
    weddingOnly: true,
    persist: false,
    useLlm: false,
    persistPilot: false,
    allPilot: false,
    venueName: null,
    provider: null,
    model: process.env.ENRICH_LLM_MODEL || "gemini-3.5-flash",
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url" && argv[i + 1]) args.url = argv[++i];
    else if (a === "--vendor-id" && argv[i + 1]) args.vendorId = parseInt(argv[++i], 10);
    else if (a === "--max-depth" && argv[i + 1]) args.maxDepth = parseInt(argv[++i], 10);
    else if (a === "--max-pages" && argv[i + 1]) args.maxPages = parseInt(argv[++i], 10);
    else if (a === "--pretty") args.pretty = true;
    else if (a === "--probe-seeds") args.probeSeeds = true;
    else if (a === "--all-events") args.weddingOnly = false;
    else if (a === "--persist") args.persist = true;
    else if (a === "--use-llm") args.useLlm = true;
    else if (a === "--persist-pilot") args.persistPilot = true;
    else if (a === "--all-pilot") args.allPilot = true;
    else if ((a === "--venue" || a === "--name") && argv[i + 1]) args.venueName = argv[++i];
    else if (a === "--provider" && argv[i + 1]) args.provider = argv[++i].toLowerCase();
    else if (a === "--model" && argv[i + 1]) args.model = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
  }

  if (!args.provider) {
    args.provider = getVertexConfig() ? "vertex" : "gemini";
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run enrich-venue -- --url <website> [--pretty]
  npm run enrich-venue -- --vendor-id <id> [--use-llm] [--persist] [--pretty]
  npm run enrich-venue -- --persist-pilot --venue "Artifact Events"
  npm run enrich-venue -- --persist-pilot --all-pilot

Options:
  --max-depth N   (default ${DEFAULT_MAX_DEPTH})
  --max-pages N   (default ${DEFAULT_MAX_PAGES})
  --pretty        formatted JSON on stdout
  --probe-seeds   also try common paths (/weddings, /contact-us, …)
  --all-events    include corporate/social/blog pages
  --use-llm       run Vertex/Gemini semantic extraction (one call)
  --persist       write extraction_runs + venue_enrichment (requires --vendor-id)
  --persist-pilot load sample-output/llm-pilot JSON and upsert by venue name
  --provider vertex|gemini
  --model <id>    default gemini-3.5-flash
`);
}

function createPool() {
  return new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
}

async function loadVendor(pool, vendorId) {
  const { rows } = await pool.query(
    "SELECT id, name, website FROM vendors WHERE id = $1",
    [vendorId],
  );
  if (rows.length === 0) throw new Error(`Vendor ${vendorId} not found`);
  if (!rows[0].website) throw new Error(`Vendor ${vendorId} has no website`);
  return rows[0];
}

async function findVendorByName(pool, name) {
  const { rows } = await pool.query(
    `SELECT id, name, website FROM vendors
     WHERE category = 'venue'
       AND (
         LOWER(name) = LOWER($1)
         OR LOWER(name) LIKE LOWER($2)
       )
     ORDER BY CASE WHEN LOWER(name) = LOWER($1) THEN 0 ELSE 1 END, id
     LIMIT 5`,
    [name, `%${name}%`],
  );
  if (rows.length === 0) return null;
  if (rows.length > 1 && rows[0].name.toLowerCase() !== name.toLowerCase()) {
    process.stderr.write(
      `  multiple vendor matches for "${name}": ${rows.map((r) => `[${r.id}] ${r.name}`).join("; ")} — using first\n`,
    );
  }
  return rows[0];
}

function loadPilotPair(venueName) {
  const slug = slugify(venueName);
  const rulesPath = path.join(PILOT_DIR, `${slug}-rules.json`);
  const llmPath = path.join(PILOT_DIR, `${slug}-llm-gemini-3-5-flash.json`);
  if (!fs.existsSync(rulesPath)) {
    throw new Error(`Missing pilot rules JSON: ${rulesPath}`);
  }
  const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
  let llm = null;
  if (fs.existsSync(llmPath)) {
    const raw = JSON.parse(fs.readFileSync(llmPath, "utf8"));
    if (raw.extraction) {
      llm = { extraction: raw.extraction, meta: raw.meta || null };
    }
  }
  return { rules, llm, website: rules?.input?.website || null };
}

async function persistPilotVenue(pool, venueName) {
  const vendor = await findVendorByName(pool, venueName);
  if (!vendor) {
    process.stderr.write(`  SKIP "${venueName}" — no matching venue in RDS\n`);
    return null;
  }
  const { rules, llm, website } = loadPilotPair(venueName);
  const result = await persistVenueEnrichment(pool, {
    vendorId: vendor.id,
    website: website || vendor.website,
    rules,
    llm,
  });
  process.stderr.write(
    `  OK [${vendor.id}] ${vendor.name} capacity=${result.enrichment.capacity_max} needs_review=${result.enrichment.needs_review} rules_run=${result.rulesRunId} llm_run=${result.llmRunId}\n`,
  );
  return result;
}

async function runPersistPilot(args) {
  const pool = createPool();
  try {
    if (args.allPilot) {
      const files = fs.readdirSync(PILOT_DIR).filter((f) => f.endsWith("-rules.json"));
      for (const file of files) {
        const nameGuess = file.replace(/-rules\.json$/, "").replace(/-/g, " ");
        // Prefer name from rules JSON input
        const rules = JSON.parse(fs.readFileSync(path.join(PILOT_DIR, file), "utf8"));
        const venueName = rules.input?.vendor_name || nameGuess;
        process.stderr.write(`\nPilot → DB: ${venueName}\n`);
        await persistPilotVenue(pool, venueName);
      }
      return;
    }
    if (!args.venueName) {
      throw new Error("--persist-pilot requires --venue \"Name\" or --all-pilot");
    }
    process.stderr.write(`\nPilot → DB: ${args.venueName}\n`);
    await persistPilotVenue(pool, args.venueName);
  } finally {
    await pool.end();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  if (args.persistPilot || args.allPilot) {
    await runPersistPilot(args);
    return;
  }

  let startUrl = args.url;
  let vendorMeta = null;
  let pool = null;

  if (args.persist && !args.vendorId) {
    throw new Error("--persist requires --vendor-id");
  }

  if (args.vendorId) {
    pool = createPool();
    vendorMeta = await loadVendor(pool, args.vendorId);
    startUrl = vendorMeta.website;
    process.stderr.write(`Enriching [${vendorMeta.id}] ${vendorMeta.name}\n`);
  }

  if (!startUrl) {
    printHelp();
    process.exit(1);
  }

  startUrl = normalizeUrl(startUrl);
  if (!startUrl) {
    console.error("Invalid URL");
    process.exit(1);
  }

  process.stderr.write(
    `Crawl start: ${startUrl} (depth≤${args.maxDepth}, pages≤${args.maxPages}, wedding-only=${args.weddingOnly})\n`,
  );

  const crawledAt = new Date().toISOString();
  const pages = await crawlSite(startUrl, {
    maxDepth: args.maxDepth,
    maxPages: args.maxPages,
    probeSeeds: args.probeSeeds,
    weddingOnly: args.weddingOnly,
  });

  process.stderr.write(`Crawled ${pages.length} page(s)\n`);

  const rules = await mergeEnrichment(pages, startUrl, {
    id: vendorMeta?.id ?? null,
    name: vendorMeta?.name ?? null,
    crawled_at: crawledAt,
  });
  rules.extraction_method = "rules_v1";

  let llm = null;
  if (args.useLlm) {
    if (!providerReady(args.provider)) {
      throw new Error(
        `LLM provider "${args.provider}" not configured (Vertex needs GOOGLE_CLOUD_PROJECT + ADC; Gemini needs GEMINI_API_KEY)`,
      );
    }
    const extractFn = getExtractFn(args.provider);
    process.stderr.write(`LLM ${args.provider}:${args.model}…\n`);
    llm = await extractFn(
      pages,
      { name: vendorMeta?.name, website: startUrl },
      args.model,
    );
    process.stderr.write(
      `  confidence=${llm.extraction?.confidence} cost≈$${(llm.meta?.estimated_cost_usd ?? 0).toFixed(5)}\n`,
    );
  }

  if (args.persist) {
    if (!pool) pool = createPool();
    const saved = await persistVenueEnrichment(pool, {
      vendorId: vendorMeta.id,
      website: startUrl,
      rules,
      llm,
    });
    process.stderr.write(
      `Persisted enrichment for vendor ${vendorMeta.id}: status=${saved.enrichment.status} capacity_max=${saved.enrichment.capacity_max} needs_review=${saved.enrichment.needs_review}\n`,
    );
  }

  if (pool) await pool.end();

  const out = {
    rules,
    llm: llm
      ? { extraction: llm.extraction, meta: llm.meta }
      : null,
  };
  const json = args.pretty ? JSON.stringify(out, null, 2) : JSON.stringify(out);
  process.stdout.write(`${json}\n`);
}

main().catch(async (err) => {
  console.error("enrich-venue-website failed:", err.message);
  process.exit(1);
});
