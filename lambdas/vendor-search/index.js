const { Pool } = require("pg");

// ── Connection pool ───────────────────────────────────────────────────────────
//
// Initialized lazily and reused across warm invocations. Lambda instances are
// single-threaded and handle one request at a time, so max:1 is sufficient and
// avoids exhausting RDS connection limits under concurrent Lambda scaling.
//
// idleTimeoutMillis is kept short so stale connections (from a frozen/thawed
// instance) are evicted quickly rather than causing query errors.

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "5432", 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set([
  "venue",
  "florist",
  "caterer",
  "photographer",
  "dj_music",
  "hair_makeup",
]);

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function respond(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const qs = event.queryStringParameters || {};

  // Parse and validate parameters
  const category = qs.category || null;
  const city = qs.city || "Chicago";
  const limit = parseInt(qs.limit || "20", 10);
  const offset = parseInt(qs.offset || "0", 10);

  if (category && !VALID_CATEGORIES.has(category)) {
    return respond(400, {
      error: `Invalid category. Valid values: ${[...VALID_CATEGORIES].join(", ")}`,
    });
  }

  if (isNaN(limit) || limit < 1) {
    return respond(400, { error: "limit must be a positive integer" });
  }

  if (isNaN(offset) || offset < 0) {
    return respond(400, { error: "offset must be a non-negative integer" });
  }

  const safeLimit = Math.min(limit, 100); // hard cap — prevent runaway queries

  try {
    const { rows } = await getPool().query(
      `SELECT
         place_id, name, category, primary_type,
         address, short_address, neighborhood, city, state, zip,
         phone, website, rating, review_count, price_level,
         photos, editorial_summary, ai_summary,
         outdoor_seating, live_music, good_for_groups, allows_dogs,
         serves_cocktails, serves_wine, serves_beer, serves_dinner,
         reservable, parking_options, lat, lng,
         ai_tags, featured,
         COUNT(*) OVER() AS total_count
       FROM vendors
       WHERE ($1::text IS NULL OR category = $1)
         AND city ILIKE $2
       ORDER BY
         featured DESC,
         rating DESC NULLS LAST,
         review_count DESC NULLS LAST
       LIMIT $3 OFFSET $4`,
      [category, city, safeLimit, offset]
    );

    const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
    const vendors = rows.map(({ total_count, ...vendor }) => vendor);

    return respond(200, { vendors, total, category, city, limit: safeLimit, offset });
  } catch (err) {
    console.error("vendor-search error:", err);
    return respond(500, { error: "Internal server error" });
  }
};
