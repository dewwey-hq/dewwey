import { getPool } from "./db";

// Serves the merged schema (pipeline/schema.sql): the IG-observed graph
// (accounts / weddings / edges) is the source of truth; the Places-seeded
// `vendors` layer joins in via vendors.account_id and enriches rows where it
// exists. Until that layer is populated, Places-only fields come back null
// and the UI falls back (avatar instead of Places photo, no rating).

// vendor_role enum values (see pipeline/schema.sql).
export const VALID_CATEGORIES = new Set([
  "venue",
  "planner",
  "photographer",
  "videographer",
  "florist",
  "hair",
  "makeup",
  "dj",
  "band",
  "musician",
  "attire",
  "stationery",
  "cake",
  "catering",
  "rentals",
  "transportation",
  "photobooth",
  "officiant",
  "hotel",
  "jeweler",
  "content_creator",
  "beauty_other",
  "other",
]);

// DB stores R2 keys (avatars/<username>.jpg); URL is composed at read time so
// the bucket domain can change without touching rows.
function avatarUrl(avatarPath: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (!avatarPath || !base) return null;
  return `${base}/${avatarPath}`;
}

// One vendor/venue card, shaped for the existing UI: graph columns first,
// Places columns (place_id, rating, photos…) null until the vendors layer has data.
const CARD_SELECT = `
  a.id::int,
  a.username,
  v.place_id,
  COALESCE(v.name, a.full_name, a.username::text) AS name,
  var.role::text AS category,
  v.category AS primary_type,
  v.rating, v.review_count, v.price_level,
  COALESCE(v.address, al.address) AS address,
  v.zip, v.state,
  v.neighborhood,
  NULL::text AS short_address,
  COALESCE(v.city, al.city) AS city,
  v.phone,
  COALESCE(v.website, a.external_url) AS website,
  v.photo_keys AS photos,
  NULL::text AS editorial_summary,
  a.username::text AS instagram_handle,
  a.avatar_path,
  a.followers,
  COALESCE(al.lat, v.lat) AS lat,
  COALESCE(al.lng, v.lng) AS lng,
  COALESCE(wc.n_weddings, 0)::int AS n_weddings`;

const CARD_JOINS = `
  FROM accounts a
  JOIN v_account_role var ON var.account_id = a.id
  LEFT JOIN account_locations al ON al.account_id = a.id
  LEFT JOIN vendors v ON v.account_id = a.id
  LEFT JOIN (
    SELECT venue_id, COUNT(*) AS n_weddings
    FROM weddings GROUP BY venue_id
  ) wc ON wc.venue_id = a.id`;

// pg rows are untyped; call sites cast to their view models (VenueVendor etc.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCard(row: any) {
  const { avatar_path, ...rest } = row;
  return { ...rest, avatar_url: avatarUrl(avatar_path) };
}

export interface VendorSearchParams {
  category?: string | null;
  city?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function searchVendors(params: VendorSearchParams) {
  const category = params.category || null;
  // Single-metro product: "city" is accepted for API compat but Chicago-ness
  // is venue-anchored (account_locations.in_metro), not a text match.
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
    `SELECT ${CARD_SELECT},
       COUNT(*) OVER() AS total_count
     ${CARD_JOINS}
     WHERE ($1::text IS NULL OR var.role = $1::vendor_role)
       AND al.in_metro
       AND (
         $4::text IS NULL
         OR a.username::text ILIKE $4 ESCAPE '\\'
         OR COALESCE(a.full_name, '') ILIKE $4 ESCAPE '\\'
         OR COALESCE(v.name, '') ILIKE $4 ESCAPE '\\'
         OR COALESCE(al.address, '') ILIKE $4 ESCAPE '\\'
       )
     ORDER BY
       wc.n_weddings DESC NULLS LAST,
       v.rating DESC NULLS LAST,
       a.followers DESC NULLS LAST,
       a.username
     LIMIT $2 OFFSET $3`,
    [category, safeLimit, offset, searchPattern]
  );

  const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
  const vendors = rows.map(({ total_count: _tc, ...row }) => toCard(row));

  return { vendors, total, category, city, q: q || null, limit: safeLimit, offset };
}

export async function getVendorDetail(id: number) {
  const pool = getPool();

  const { rows: vendorRows } = await pool.query(
    `SELECT ${CARD_SELECT} ${CARD_JOINS} WHERE a.id = $1`,
    [id]
  );

  if (vendorRows.length === 0) return null;

  // Every post from every wedding this account worked (any role).
  // No image URLs: IG CDN links expire, so the UI embeds via post_url.
  const { rows: weddingRows } = await pool.query(
    `SELECT
       p.url AS post_url,
       p.posted_at AS post_timestamp,
       p.likes_count,
       p.caption,
       (SELECT jsonb_agg(m.username)
          FROM post_mentions pm JOIN accounts m ON m.id = pm.account_id
         WHERE pm.post_id = p.id) AS mentions
     FROM wedding_vendors wv
     JOIN wedding_posts wp ON wp.wedding_id = wv.wedding_id
     JOIN posts p ON p.id = wp.post_id
     WHERE wv.account_id = $1
     ORDER BY p.posted_at DESC
     LIMIT 100`,
    [id]
  );

  const realWeddings = weddingRows.map((row) => ({
    post_url: row.post_url,
    post_timestamp: row.post_timestamp,
    mentions: row.mentions,
    likes_count: row.likes_count,
    image_url: null,
    images: [],
    caption: row.caption || null,
    post_type: null,
  }));

  // The graph: real weddings worked together (edges matview), not read-time
  // mention counts.
  const { rows: partnerRows } = await pool.query(
    `SELECT
       partner.id::int,
       COALESCE(pv.name, partner.full_name, partner.username::text) AS name,
       pvar.role::text AS category,
       partner.avatar_path,
       e.n_weddings,
       e.last_worked_together
     FROM edges e
     JOIN accounts partner
       ON partner.id = CASE WHEN e.account_a = $1 THEN e.account_b ELSE e.account_a END
     LEFT JOIN v_account_role pvar ON pvar.account_id = partner.id
     LEFT JOIN vendors pv ON pv.account_id = partner.id
     WHERE $1 IN (e.account_a, e.account_b)
     ORDER BY e.n_weddings DESC, e.last_worked_together DESC NULLS LAST
     LIMIT 6`,
    [id]
  );

  const frequentlyWorksWith = partnerRows.map(toCard);

  // Venue-website facts arrive via the Places vendors layer when it's populated.
  const { rows: enrichmentRows } = await pool.query(
    `SELECT
       ve.vendor_id, ve.website, ve.status, ve.needs_review, ve.schema_version,
       ve.capacity_max, ve.capacity_min, ve.capacity_as_stated,
       ve.catering, ve.event_insurance, ve.pricing_model, ve.price_display,
       ve.facts, ve.crawled_at, ve.extracted_at, ve.enriched_at, ve.updated_at
     FROM venue_enrichment ve
     JOIN vendors v ON v.id = ve.vendor_id
     WHERE v.account_id = $1`,
    [id]
  );

  return {
    vendor: toCard(vendorRows[0]),
    realWeddings,
    frequentlyWorksWith,
    enrichment: enrichmentRows[0] || null,
  };
}
