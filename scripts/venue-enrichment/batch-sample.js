#!/usr/bin/env node
/**
 * Run enrichment on a sample of venues and print a compact comparison table.
 * Usage: node scripts/venue-enrichment/batch-sample.js [batch1|batch2|batch3]
 */
require("dotenv").config({ path: ".env.local", quiet: true });
const fs = require("fs");
const path = require("path");
const { crawlSite, normalizeUrl } = require("./crawl");
const { mergeEnrichment } = require("./enrich");

const BATCHES = {
  batch1: [
    { name: "Woman's Club of Evanston", url: "https://www.wcofe-events.com/" },
    { name: "Salvatore's", url: "http://www.salvatores-chicago.com/" },
    { name: "Firehouse Chicago", url: "https://www.firehousechicago.com/" },
    { name: "Artifact Events", url: "https://www.artifacteventschicago.com/" },
    { name: "Colvin House", url: "https://www.colvinhouse.com/" },
    { name: "Greenhouse Loft", url: "https://www.greenhouseloft.com/" },
    { name: "Loft on Lake", url: "https://www.loftonlake.com/" },
    { name: "Chicago Winery", url: "https://www.chicagowinery.com/" },
    { name: "Ravenswood Event Center", url: "https://www.ravenswoodeventcenter.com/" },
    { name: "CityPoint Loft", url: "https://www.citypointloft.com/" },
  ],
  batch2: [
    { name: "The Arbory", url: "http://www.thearborychicago.com/" },
    { name: "Stan Mansion", url: "https://www.stanmansion.com/" },
    { name: "Galleria Marchetti", url: "http://galleriamarchetti.com/" },
    { name: "Loft Lucia", url: "https://www.loftlucia.com/" },
    { name: "Moonlight Studios", url: "https://moonlightstudioschicago.com/" },
    { name: "Artesian Loft", url: "http://www.artesianloft.com/" },
    { name: "City Hall Events", url: "https://thecityhall.com/" },
    { name: "LACUNA", url: "https://lacunachicago.com/" },
    { name: "LM Studio Chicago", url: "https://www.lmstudiochicago.com/" },
    { name: "Charcoal Factory Loft", url: "http://www.charcoalonada.com/" },
  ],
  /** Batch 3 — venues not in batches 1–2. */
  batch3: [
    { name: "Chez Wedding Venue", url: "http://chezweddingvenue.com/" },
    { name: "Glessner House", url: "http://www.glessnerhouse.org/" },
    { name: "Diamond Garden Banquet Hall", url: "http://www.diamondgardenhall.com/" },
    { name: "The Gallery Wicker Park", url: "https://www.thegallerywickerpark.com/" },
    { name: "The Geraghty", url: "http://www.thegeraghty.com/" },
    { name: "Rockwell on the River", url: "https://rockwellontheriver.com/" },
    { name: "Revel Motor Row", url: "http://www.revelspace.com/" },
    { name: "Room 1520", url: "http://www.room1520.com/" },
    { name: "Chez Event Venue", url: "http://www.chezeventvenue.com/" },
    { name: "The Joinery", url: "http://www.thejoinerychicago.com/" },
  ],
};

const batchKey = (process.argv[2] || process.env.ENRICH_BATCH || "batch3").toLowerCase();
const SAMPLE_VENUES = BATCHES[batchKey];
if (!SAMPLE_VENUES) {
  console.error(`Unknown batch "${batchKey}". Use: ${Object.keys(BATCHES).join(", ")}`);
  process.exit(1);
}

const MAX_PAGES = parseInt(process.env.ENRICH_MAX_PAGES || "30", 10);
const OUT_DIR = path.join(__dirname, "sample-output", batchKey);

function summarize(result) {
  const weddingPages = result.pages_crawled.filter((p) => p.context === "wedding").length;
  const neutralPages = result.pages_crawled.filter((p) => p.context === "neutral").length;
  return {
    status: result.status,
    focus: result.input.focus,
    pages: result.pages_crawled.length,
    wedding_pages: weddingPages,
    neutral_pages: neutralPages,
    about: Boolean(result.about),
    about_section: result.about?.source_section ?? null,
    emails: result.contact.emails.length,
    phones: result.contact.phones.length,
    social: Object.keys(result.social),
    ig: result.social.instagram?.instagram_handle ?? null,
    amenities: Object.keys(result.amenities).length,
    policies: Object.keys(result.policies).length,
    capacity_max: result.pricing.capacity_max,
    assets: result.assets.length,
    network_vendors: result.network_vendors.length,
    faqs: result.faqs.length,
    included_inventory: result.included_inventory.length,
    raw_lists: result.raw_lists.length,
  };
}

async function enrichOne(venue) {
  const startUrl = normalizeUrl(venue.url);
  process.stderr.write(`\n=== ${venue.name} ===\n`);
  const pages = await crawlSite(startUrl, { maxPages: MAX_PAGES, weddingOnly: true });
  const result = await mergeEnrichment(pages, startUrl, { name: venue.name });
  return { venue: venue.name, url: startUrl, result, summary: summarize(result) };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const rows = [];
  for (const venue of SAMPLE_VENUES) {
    try {
      const row = await enrichOne(venue);
      rows.push(row);
      const slug = venue.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), JSON.stringify(row.result, null, 2));
    } catch (err) {
      process.stderr.write(`  FAILED: ${err.message}\n`);
      rows.push({ venue: venue.name, url: venue.url, error: err.message });
    }
  }

  const report = {
    run_at: new Date().toISOString(),
    batch: batchKey,
    max_pages: MAX_PAGES,
    wedding_only: true,
    venues: rows.map((r) => (r.summary ? { ...r.summary, venue: r.venue, url: r.url } : r)),
  };
  fs.writeFileSync(path.join(OUT_DIR, "_summary.json"), JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  process.stderr.write(`\nFull JSON saved to ${OUT_DIR}/\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
