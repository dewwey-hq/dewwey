import { getPool } from "./db";

// Ported from the retired vendor-search Lambda (lambdas/vendor-search/index.js,
// see git history). Server components call these directly; client components go
// through app/api/vendors.

export const VALID_CATEGORIES = new Set([
  "venue",
  "florist",
  "caterer",
  "photographer",
  "dj_music",
  "hair_makeup",
  "planner",
  "baker",
]);

export interface VendorSearchParams {
  category?: string | null;
  city?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function searchVendors(params: VendorSearchParams) {
  const category = params.category || null;
  const city = params.city || "Chicago";
  const q = (params.q || "").trim();
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;

  if (category && !VALID_CATEGORIES.has(category)) {
    throw new RangeError(
      `Invalid category. Valid values: ${[...VALID_CATEGORIES].join(", ")}`
    );
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("limit must be a positive integer");
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new RangeError("offset must be a non-negative integer");
  }

  // Map view may request a few hundred venues once; list UI stays at pageSize 20.
  const safeLimit = Math.min(limit, 500);
  const searchPattern = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : null;

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
       AND (
         $5::text IS NULL
         OR name ILIKE $5 ESCAPE '\\'
         OR COALESCE(address, '') ILIKE $5 ESCAPE '\\'
         OR COALESCE(short_address, '') ILIKE $5 ESCAPE '\\'
         OR COALESCE(neighborhood, '') ILIKE $5 ESCAPE '\\'
       )
     ORDER BY
       featured DESC,
       rating DESC NULLS LAST,
       review_count DESC NULLS LAST
     LIMIT $3 OFFSET $4`,
    [category, city, safeLimit, offset, searchPattern]
  );

  const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
  const vendors = rows.map(({ total_count: _tc, ...vendor }) => vendor);

  return { vendors, total, category, city, q: q || null, limit: safeLimit, offset };
}

function weddingPreviewUrl(row: { image_url?: string | null; images?: unknown }) {
  if (row.image_url) return row.image_url;
  if (Array.isArray(row.images) && row.images.length > 0) return row.images[0];
  return null;
}

function weddingImages(row: { image_url?: string | null; images?: unknown }) {
  if (Array.isArray(row.images) && row.images.length > 0) return row.images;
  if (row.image_url) return [row.image_url];
  return [];
}

export async function getVendorDetail(id: number) {
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
       lat, lng
     FROM vendors
     WHERE id = $1`,
    [id]
  );

  if (vendorRows.length === 0) return null;

  const { rows: weddingRows } = await pool.query(
    `SELECT post_url, post_timestamp, mentions, likes_count, image_url, images, caption_raw, post_type
     FROM instagram_posts
     WHERE vendor_id = $1
     ORDER BY post_timestamp DESC NULLS LAST
     LIMIT 100`,
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
    post_type: row.post_type || null,
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

  let enrichment = null;
  try {
    const { rows: enrichmentRows } = await pool.query(
      `SELECT
         vendor_id, website, status, needs_review, schema_version,
         capacity_max, capacity_min, capacity_as_stated,
         catering, event_insurance, pricing_model, price_display,
         facts, crawled_at, extracted_at, enriched_at, updated_at
       FROM venue_enrichment
       WHERE vendor_id = $1`,
      [id]
    );
    enrichment = enrichmentRows[0] || null;
  } catch {
    // venue_enrichment may not exist yet — detail still works without it.
  }

  return { vendor: vendorRows[0], realWeddings, frequentlyWorksWith, enrichment };
}
