import { getPool } from "./db";
import { avatarUrl } from "./graph";

// Serves the merged schema (pipeline/schema.sql): the IG-observed graph
// (accounts / weddings / edges) is the source of truth; the Places-seeded
// `vendors` layer joins in via vendors.account_id and enriches rows where it
// exists. Until that layer is populated, Places-only fields come back null
// and the UI falls back (avatar instead of Places photo, no rating).

// vendor_role enum values (see pipeline/schema.sql). D056 stage 2 (2026-09-10): the enum was
// renamed (beauty_other -> beauty_services, jeweler -> jewelry, photobooth -> photo_booth,
// musician -> live_music) and ~30 new values were added. This is a copy, not an import, of the
// `isVendor: true` slugs from `VENDOR_ROLES` in `scripts/graph/vendorRoleRules.ts` (that source
// of truth) — `scripts/` is excluded from the production tsconfig/build, so this file doesn't
// reach across that boundary; keep the two lists in sync by hand. `hotel` is kept alongside
// `accommodations` even though it isn't in VENDOR_ROLES: it's a live legacy role value the query
// below still filters on directly (see the "hotel" comment on CARD_JOINS' WHERE clause).
export const VALID_CATEGORIES = new Set([
  // venue
  "venue",
  "venue_management",
  "accommodations",
  "hotel",
  // planning
  "planner",
  "coordinator",
  "event_design",
  // photo / video
  "photographer",
  "second_shooter",
  "videographer",
  "content_creator",
  "photo_booth",
  "drone",
  "album_editing",
  // florals / decor
  "florist",
  "lighting_production",
  "rentals",
  "tent",
  "signage",
  "decor_other",
  // food / drink
  "catering",
  "bar_service",
  "cake",
  "desserts",
  // music / entertainment
  "dj",
  "band",
  "live_music",
  "mc",
  "cultural_performers",
  "dancers_choreography",
  "entertainment_other",
  // beauty
  "hair",
  "makeup",
  "beauty_services",
  // attire
  "attire",
  "accessories",
  "alterations",
  "jewelry",
  // paper
  "stationery",
  "calligraphy",
  // art / keepsakes
  "live_painter",
  "guest_book",
  "favors_gifts",
  // logistics / services
  "transportation",
  "valet",
  "officiant",
  "security",
  "childcare",
  "pet_attendant",
  "travel_honeymoon",
  "website_registry",
  "staffing",
  // other
  "other",
]);

// One vendor/venue card, shaped for the existing UI: graph columns first,
// Places columns (place_id, rating, photos…) null until the vendors layer has data.
const CARD_SELECT = `
  a.id::int,
  a.username,
  v.place_id,
  CASE WHEN v.name IS NULL OR v.name IN (a.username::text, '@' || a.username::text)
       THEN COALESCE(a.full_name, a.username::text) ELSE v.name END AS name,
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
  a.venue_type,
  COALESCE(wc.n_weddings, 0)::int AS n_weddings`;

const CARD_JOINS = `
  FROM accounts a
  JOIN v_account_role var ON var.account_id = a.id
  LEFT JOIN account_locations al ON al.account_id = a.id
  LEFT JOIN LATERAL (
    SELECT * FROM vendors WHERE account_id = a.id ORDER BY id LIMIT 1
  ) v ON true
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
  /** D056 facet on accounts.venue_type (house_of_worship, hotel, restaurant, …); null = no filter. */
  venueType?: string | null;
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
  const venueType = params.venueType && /^[a-z_]{1,32}$/.test(params.venueType) ? params.venueType : null;

  const { rows } = await getPool().query(
    `SELECT ${CARD_SELECT},
       COUNT(*) OVER() AS total_count
     ${CARD_JOINS}
     WHERE (
         $1::text IS NULL
         OR ($1::text <> 'venue' AND var.role = $1::vendor_role)
         -- Listing bar (user, 2026-09-11): a venue lists only when it is the venue of at least
         -- one documented wedding. Zero-wedding venue-tagged accounts keep their vendor page but
         -- stay out of the browse until something is documented there.
         -- Bar refined (user, 2026-09-11): 2+ documented weddings, or 1 with a known venue type
         -- (hotel, event space, park, farm/estate, museum, club, house of worship, restaurant);
         -- single-wedding accounts with no venue signal in their name/bio stay off the browse.
         OR ($1::text = 'venue' AND var.role = 'venue'
             AND (COALESCE(wc.n_weddings, 0) >= 2
                  OR (COALESCE(wc.n_weddings, 0) = 1 AND a.venue_type IS NOT NULL AND a.venue_type <> 'other')))
         -- Product rule (user, 2026-09-10): a hotel (D056: accommodations) belongs under "venue" when it was
         -- used as one, i.e. it is the venue of at least one documented wedding. Its top
         -- role tag stays 'hotel' (that is what the credit lines say); the wedding count
         -- is the evidence. See D055 "count honestly" in docs/decisions.md.
         OR ($1::text = 'venue' AND var.role::text IN ('hotel', 'accommodations') AND COALESCE(wc.n_weddings, 0) > 0)
       )
       -- An alias handle (account_aliases) is the same business as its canonical account;
       -- the detail page already resolves it, so the browse list must not show it as a
       -- second card (D055 count-honestly, 2026-09-10).
       AND NOT EXISTS (SELECT 1 FROM account_aliases x WHERE x.alias_account_id = a.id)
       AND al.in_metro
       AND ($5::text IS NULL OR a.venue_type = $5::text)
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
    [category, safeLimit, offset, searchPattern, venueType]
  );

  const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
  const vendors = rows.map(({ total_count: _tc, ...row }) => toCard(row));

  return { vendors, total, category, city, q: q || null, venueType, limit: safeLimit, offset };
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
       CASE WHEN pv.name IS NULL OR pv.name IN (partner.username::text, '@' || partner.username::text)
       THEN COALESCE(partner.full_name, partner.username::text) ELSE pv.name END AS name,
       pvar.role::text AS category,
       partner.avatar_path,
       e.n_weddings,
       e.last_worked_together
     FROM edges e
     JOIN accounts partner
       ON partner.id = CASE WHEN e.account_a = $1 THEN e.account_b ELSE e.account_a END
     LEFT JOIN v_account_role pvar ON pvar.account_id = partner.id
     LEFT JOIN LATERAL (
       SELECT name FROM vendors WHERE account_id = partner.id ORDER BY id LIMIT 1
     ) pv ON true
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
