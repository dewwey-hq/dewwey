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

  const vendorId = event.pathParameters?.id;
  if (vendorId) {
    return getVendorDetail(vendorId);
  }

  return searchVendors(event);
};

async function searchVendors(event) {
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
         id, place_id, name, category, primary_type,
         address, short_address, neighborhood, city, state, zip,
         phone, website, rating, review_count, price_level,
         photos, editorial_summary, ai_summary,
         outdoor_seating, live_music, good_for_groups, allows_dogs,
         serves_cocktails, serves_wine, serves_beer, serves_dinner,
         reservable, parking_options, lat, lng,
         ai_tags, featured, instagram_handle,
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
}

function weddingPreviewUrl(row) {
  if (row.image_url) return row.image_url;
  const images = row.images;
  if (Array.isArray(images) && images.length > 0) return images[0];
  return null;
}

function weddingImages(row) {
  if (Array.isArray(row.images) && row.images.length > 0) return row.images;
  if (row.image_url) return [row.image_url];
  return [];
}

// ── Vendor detail ─────────────────────────────────────────────────────────────
//
// Returns one vendor plus two derived views built from instagram_posts:
//   realWeddings        — this vendor's own posts (post_url is the permanent
//                          link; the frontend renders it as a real Instagram
//                          embed rather than hosting the scraped image)
//   frequentlyWorksWith — other vendors most often @mentioned across this
//                          vendor's posts, matched back to our vendors table

async function getVendorDetail(vendorId) {
  const id = parseInt(vendorId, 10);
  if (isNaN(id)) {
    return respond(400, { error: "id must be an integer" });
  }

  try {
    const pool = getPool();

    const { rows: vendorRows } = await pool.query(
      `SELECT
         id, place_id, name, category, primary_type,
         address, short_address, neighborhood, city, state, zip,
         phone, website, rating, review_count, price_level,
         photos, editorial_summary, ai_summary,
         outdoor_seating, live_music, good_for_groups, allows_dogs,
         serves_cocktails, serves_wine, serves_beer, serves_dinner,
         reservable, parking_options, ai_tags, instagram_handle,
         lat, lng, city, state
       FROM vendors
       WHERE id = $1`,
      [id]
    );

    if (vendorRows.length === 0) {
      return respond(404, { error: "Vendor not found" });
    }

    const { rows: weddingRows } = await pool.query(
      `SELECT post_url, post_timestamp, mentions, likes_count, image_url, images, caption_raw
       FROM instagram_posts
       WHERE vendor_id = $1
       ORDER BY post_timestamp DESC NULLS LAST
       LIMIT 12`,
      [id]
    );

    const realWeddings = weddingRows.map((row) => ({
      post_url: row.post_url,
      post_timestamp: row.post_timestamp,
      mentions: row.mentions,
      likes_count: row.likes_count,
      image_url: weddingPreviewUrl(row),
      images: weddingImages(row),
      caption: row.caption_raw || null,
    }));

    const { rows: frequentlyWorksWith } = await pool.query(
      `WITH this_vendor_mentions AS (
         SELECT LOWER(mention::text) AS handle
         FROM instagram_posts,
              jsonb_array_elements_text(mentions) AS mention
         WHERE vendor_id = $1
           AND mentions IS NOT NULL
       ),
       mention_counts AS (
         SELECT handle, COUNT(*) AS times_mentioned
         FROM this_vendor_mentions
         GROUP BY handle
       )
       SELECT v.id, v.name, v.category, v.photos, mc.times_mentioned
       FROM mention_counts mc
       JOIN vendors v ON LOWER(v.instagram_handle) = mc.handle
       WHERE v.id != $1
       ORDER BY mc.times_mentioned DESC
       LIMIT 6`,
      [id]
    );

    return respond(200, {
      vendor: vendorRows[0],
      realWeddings,
      frequentlyWorksWith,
    });
  } catch (err) {
    console.error("vendor-detail error:", err);
    return respond(500, { error: "Internal server error" });
  }
}
