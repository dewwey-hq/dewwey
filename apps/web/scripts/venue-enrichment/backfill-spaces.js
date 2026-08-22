#!/usr/bin/env node
/**
 * Backfill facts.spaces[] (+ fee attachments) from existing capacity_configurations
 * without calling the LLM. Bumps schema_version to 2.
 *
 *   npm run enrich-venues-backfill-spaces
 *   npm run enrich-venues-backfill-spaces -- --dry-run
 *   npm run enrich-venues-backfill-spaces -- --vendor-id 7
 *   npm run enrich-venues-backfill-spaces -- --limit 10
 */
require("dotenv").config({ path: ".env.local", quiet: true });
const { Pool } = require("pg");
const { backfillSpacesIntoFacts } = require("./spaces");
const { SCHEMA_VERSION } = require("./persist");

function parseArgs(argv) {
  const args = { dryRun: false, vendorId: null, limit: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--vendor-id" && argv[i + 1]) args.vendorId = parseInt(argv[++i], 10);
    else if (a === "--limit" && argv[i + 1]) args.limit = parseInt(argv[++i], 10);
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

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node scripts/venue-enrichment/backfill-spaces.js [options]
  --dry-run       Print what would change; no writes
  --vendor-id N   Only this vendor
  --limit N       Cap rows processed
`);
    process.exit(0);
  }

  if (!process.env.DB_HOST || !process.env.DB_NAME) {
    console.error("Missing DB_* env (load .env.local).");
    process.exit(1);
  }

  const pool = createPool();
  const params = [];
  let where = "WHERE e.facts IS NOT NULL";
  if (args.vendorId != null) {
    params.push(args.vendorId);
    where += ` AND e.vendor_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT e.vendor_id, v.name, e.schema_version, e.facts
     FROM venue_enrichment e
     JOIN vendors v ON v.id = e.vendor_id
     ${where}
     ORDER BY e.vendor_id
     ${args.limit != null ? `LIMIT ${Math.max(0, args.limit)}` : ""}`,
    params,
  );

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const before = row.facts || {};
    const after = backfillSpacesIntoFacts(before);
    const spaceCount = (after.spaces || []).length;
    const hadSpaces = Array.isArray(before.spaces) && before.spaces.length > 0;
    const same =
      JSON.stringify(before.spaces || []) === JSON.stringify(after.spaces || []) &&
      JSON.stringify(before.fee_schedule || []) === JSON.stringify(after.fee_schedule || []) &&
      Number(row.schema_version) === SCHEMA_VERSION;

    if (same && spaceCount === 0) {
      skipped += 1;
      continue;
    }

    const names = (after.spaces || []).map((s) => s.name).join(", ") || "(none)";
    console.log(
      `${args.dryRun ? "[dry] " : ""}${row.vendor_id} ${row.name}: ${spaceCount} space(s) — ${names}${hadSpaces ? " (merge)" : ""}`,
    );

    if (!args.dryRun) {
      await pool.query(
        `UPDATE venue_enrichment
         SET facts = $2::jsonb,
             schema_version = $3,
             updated_at = NOW()
         WHERE vendor_id = $1`,
        [row.vendor_id, JSON.stringify(after), SCHEMA_VERSION],
      );
    }
    updated += 1;
  }

  console.log(
    `\n${args.dryRun ? "Would update" : "Updated"} ${updated}; skipped ${skipped}; scanned ${rows.length}.`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
