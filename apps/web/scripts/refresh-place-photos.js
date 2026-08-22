#!/usr/bin/env node
/**
 * Refresh vendors.photos from Places API (New) using GOOGLE_PLACES_SERVER_API_KEY.
 *
 * Photo resource names expire. When they go stale, venue cards show broken images
 * even though the browser API key is fine. Run this periodically — not on every
 * page view — so we don't burn Places quota serving pictures.
 *
 * Docs: docs/engineering/places-photos.md
 *
 *   npm run refresh-place-photos
 *   npm run refresh-place-photos -- --category venue
 *   npm run refresh-place-photos -- --limit 20
 *   npm run refresh-place-photos -- --vendor-id 20
 */
require("dotenv").config({ path: ".env.local", quiet: true });
const { Pool } = require("pg");

function serverKey() {
  return (
    process.env.GOOGLE_PLACES_SERVER_API_KEY?.trim() ||
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    null
  );
}

async function fetchPhotoNames(placeId, key) {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "photos",
      },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.photos || []).map((p) => p.name).filter(Boolean);
}

function parseArgs(argv) {
  const args = { limit: null, vendorId: null, category: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--limit" && argv[i + 1]) args.limit = parseInt(argv[++i], 10);
    else if (argv[i] === "--vendor-id" && argv[i + 1]) args.vendorId = parseInt(argv[++i], 10);
    else if (argv[i] === "--category" && argv[i + 1]) args.category = argv[++i];
  }
  return args;
}

async function main() {
  const key = serverKey();
  if (!key) throw new Error("Set GOOGLE_PLACES_SERVER_API_KEY in .env.local");

  const args = parseArgs(process.argv);
  const pool = new Pool({
    host: (process.env.DB_HOST || "").trim(),
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const params = [];
    let sql = `SELECT id, name, place_id FROM vendors WHERE place_id IS NOT NULL`;
    if (args.vendorId) {
      params.push(args.vendorId);
      sql += ` AND id = $${params.length}`;
    }
    if (args.category) {
      params.push(args.category);
      sql += ` AND category = $${params.length}`;
    }
    sql += ` ORDER BY id`;
    if (args.limit) {
      params.push(args.limit);
      sql += ` LIMIT $${params.length}`;
    }

    const { rows } = await pool.query(sql, params);
    process.stderr.write(`Refreshing photos for ${rows.length} vendor(s)…\n`);

    let ok = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const names = await fetchPhotoNames(row.place_id, key);
        await pool.query(`UPDATE vendors SET photos = $1::jsonb WHERE id = $2`, [
          JSON.stringify(names.length ? names : null),
          row.id,
        ]);
        ok += 1;
        process.stderr.write(`  OK [${row.id}] ${row.name} photos=${names.length}\n`);
      } catch (err) {
        failed += 1;
        process.stderr.write(`  FAIL [${row.id}] ${row.name}: ${err.message}\n`);
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    process.stderr.write(`Done. ok=${ok} failed=${failed}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
