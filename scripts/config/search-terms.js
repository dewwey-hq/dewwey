/**
 * Dewy — Master Search Strategy Config
 * =====================================
 * This file defines every query used to populate the vendors database.
 * It is the single source of truth for what we search for, where, and why.
 *
 * TWO COMPLEMENTARY STRATEGIES
 * ─────────────────────────────
 * 1. TEXT_SEARCH_TERMS  — keyword-based searches via Google Places Text Search API.
 *    Best for: categories where vendors self-identify with wedding-specific language
 *    (e.g., "wedding photographer"), and for categories that have no Google place type.
 *
 * 2. NEARBY_SEARCH_TYPES — place-type-based searches within a fixed radius of Chicago
 *    center (lat: 41.8827, lng: -87.6233). Uses Google's official place taxonomy.
 *    Best for: brick-and-mortar businesses (florists, salons, caterers, venues) that
 *    may not use wedding keywords but show up under the correct place type.
 *
 * WHY BOTH?
 * ─────────
 * Text search maximizes recall for wedding-intent keywords but misses businesses that
 * don't market themselves as wedding-specific. Nearby search by place type catches
 * those businesses but may over-fetch (e.g., a random hair salon with no bridal
 * experience). Together they provide broad coverage with better signal quality.
 *
 * CATEGORIES WITH NO GOOGLE PLACE TYPE
 * ──────────────────────────────────────
 * - Photography: Google has no "photographer" place type. Text search is the only path.
 * - DJ & Music:  No "dj" or "wedding_band" place type exists. Text search only.
 * These categories rely entirely on TEXT_SEARCH_TERMS.
 *
 * ADDING NEW SEARCHES
 * ────────────────────
 * Always add an entry here before writing seed script logic. Fill in the `notes` field
 * explaining what gap the new term fills — if you can't articulate it, it may not be
 * worth adding. Avoid duplicating coverage without reason; API calls cost money.
 *
 * Chicago search center: 41.8827° N, 87.6233° W
 * Default nearby radius: 30 miles (~48,000 meters)
 */

// ── Text Search Terms ─────────────────────────────────────────────────────────
//
// Each entry is sent as a POST to the Places Text Search API:
//   POST https://places.googleapis.com/v1/places:searchText
//   body: { textQuery: term }
//
// Returns up to 20 results per query. Results are keyword-ranked by Google,
// so more specific terms (e.g., "wedding venue") surface higher-intent results.

const TEXT_SEARCH_TERMS = [

  // ── Venues ────────────────────────────────────────────────────────────────
  // Venues are the most searched category in Chicago's wedding market.
  // We use multiple terms because venues vary widely in how they market themselves.

  {
    term: "wedding venue Chicago IL",
    category: "venue",
    notes:
      "Primary venue search. Surfaces venues that explicitly market to weddings — " +
      "ballrooms, event spaces, hotels with event facilities. Highest intent signal.",
  },
  {
    term: "event venue Chicago IL",
    category: "venue",
    notes:
      "Catches venues that host weddings but don't lead with wedding-specific marketing. " +
      "Many corporate event spaces and multi-use venues fall here. Overlaps with the " +
      "primary search but surfaces different results due to keyword ranking.",
  },
  {
    term: "banquet hall Chicago IL",
    category: "venue",
    notes:
      "Traditional reception spaces, often family-owned, that use 'banquet hall' over " +
      "'event venue'. Common in Chicago's ethnic communities (Polish, Greek, Latino). " +
      "Would be missed by the other venue searches.",
  },
  {
    term: "rooftop venue Chicago IL",
    category: "venue",
    notes:
      "Rooftop ceremonies and receptions are a major Chicago wedding trend given the " +
      "skyline views. These venues rarely rank for generic 'wedding venue' searches " +
      "because the venue type is the differentiator, not the wedding keyword.",
  },
  {
    term: "loft venue Chicago IL",
    category: "venue",
    notes:
      "Industrial loft spaces are popular for modern, non-traditional Chicago weddings. " +
      "West Loop, Fulton Market, and Pilsen have many. Like rooftops, these market on " +
      "aesthetic rather than wedding-specific language.",
  },
  {
    term: "historic venue Chicago IL",
    category: "venue",
    notes:
      "Chicago has a wealth of landmark buildings used for weddings: theaters, " +
      "mansions, cultural institutions. They market on history and architecture. " +
      "Captures a distinct segment of the venue market not covered by loft/rooftop terms.",
  },

  // ── Photography ───────────────────────────────────────────────────────────
  // IMPORTANT: Google has no 'photographer' place type. Text search is our ONLY
  // mechanism for finding photographers. These terms are especially critical.

  {
    term: "wedding photographer Chicago IL",
    category: "photographer",
    notes:
      "Primary photography search. Most wedding photographers use this exact phrasing " +
      "on their Google Business Profile. High precision — nearly all results will be " +
      "wedding-relevant. This is our highest-value photography search.",
  },
  {
    term: "engagement photographer Chicago IL",
    category: "photographer",
    notes:
      "Photographers who offer engagement sessions almost always shoot weddings too. " +
      "This term surfaces photographers who may not rank for 'wedding photographer' " +
      "but are active in the wedding market. Useful for catching newer photographers " +
      "still building their Google presence.",
  },

  // ── Florals ───────────────────────────────────────────────────────────────
  // The 'florist' place type (used in NEARBY_SEARCH_TYPES) catches general flower
  // shops. Text search is needed to surface specifically wedding-focused designers.

  {
    term: "wedding florist Chicago IL",
    category: "florist",
    notes:
      "Primary floral search. Surfaces florists who explicitly serve weddings. " +
      "Complements the nearby 'florist' place type search by prioritizing wedding " +
      "intent over proximity. Expect significant overlap but different ranking.",
  },
  {
    term: "floral designer Chicago IL",
    category: "florist",
    notes:
      "High-end floral studios often use 'floral designer' rather than 'florist' — " +
      "it signals artistry over retail. These businesses appear on wedding blogs and " +
      "Style Me Pretty but may not rank for 'florist'. Fills a premium market gap.",
  },

  // ── Catering ──────────────────────────────────────────────────────────────
  // Catering businesses range from full-service caterers to restaurant groups that
  // offer off-site catering. Multiple terms help catch both ends of the spectrum.

  {
    term: "wedding caterer Chicago IL",
    category: "caterer",
    notes:
      "Primary catering search. Focuses on caterers who explicitly serve weddings. " +
      "Filters out corporate and office caterers that dominate the broader 'catering' " +
      "keyword. Highest precision for our use case.",
  },
  {
    term: "catering company Chicago IL",
    category: "caterer",
    notes:
      "Broader search that catches catering businesses who serve weddings but don't " +
      "lead with wedding language. Restaurant groups, off-site caterers, and food " +
      "halls with catering arms often appear here but not in the wedding-specific search.",
  },

  // ── DJ & Music ────────────────────────────────────────────────────────────
  // IMPORTANT: Google has no place type for DJs or wedding bands. Like photography,
  // text search is our ONLY mechanism for finding this category.

  {
    term: "wedding DJ Chicago IL",
    category: "dj_music",
    notes:
      "Primary DJ search. Wedding DJs are a distinct market from club DJs — they MC " +
      "the reception, coordinate with the venue, and handle toasts. This term surfaces " +
      "professionals who market specifically to weddings. No Google place type exists " +
      "for DJs, making this search irreplaceable.",
  },
  {
    term: "wedding band Chicago IL",
    category: "dj_music",
    notes:
      "Live bands for wedding receptions. A separate market segment from DJs — higher " +
      "price point, different booking process. Chicago has a strong live music scene " +
      "with bands that specialize in weddings. No Google place type exists for this " +
      "category, so text search is the only path.",
  },

  // ── Hair & Makeup ─────────────────────────────────────────────────────────
  // The beauty category is broad. These terms narrow to bridal-specific providers
  // who have experience with photography-ready makeup, timeline management, etc.

  {
    term: "bridal hair makeup Chicago IL",
    category: "hair_makeup",
    notes:
      "Primary bridal beauty search. Combines hair and makeup in one query since most " +
      "bridal artists offer both services as a package. 'Bridal' is the highest-intent " +
      "signal in this category — these are providers who understand the wedding context.",
  },
  {
    term: "wedding makeup artist Chicago IL",
    category: "hair_makeup",
    notes:
      "Standalone makeup artists who may not offer hair services. Many freelance makeup " +
      "artists operate without a salon and market themselves as artists rather than " +
      "stylists. This term surfaces them where the 'bridal hair makeup' search may not.",
  },
];

// ── Nearby Search Types ───────────────────────────────────────────────────────
//
// Each entry is sent to the Places Nearby Search API:
//   POST https://places.googleapis.com/v1/places:searchNearby
//   body: { includedTypes: [type], locationRestriction: { circle: { center, radius } } }
//
// Searches within `radius` meters of Chicago center: { lat: 41.8827, lng: -87.6233 }
// The default 48,280m radius covers roughly 30 miles — Chicago proper + suburbs.
//
// Nearby search is type-based, not keyword-based. It catches every business Google
// classifies under a given type, regardless of whether they use wedding language.
// This is powerful for brick-and-mortar businesses (venues, florists, salons)
// but does not exist for service-based categories like photography or DJs.

const CHICAGO_CENTER = { lat: 41.8827, lng: -87.6233 };
const DEFAULT_RADIUS_METERS = 48_280; // ~30 miles

const NEARBY_SEARCH_TYPES = [

  // ── Venues ────────────────────────────────────────────────────────────────

  {
    type: "wedding_venue",
    category: "venue",
    radius: DEFAULT_RADIUS_METERS,
    notes:
      "Google's official place type for wedding venues. High precision — businesses " +
      "classified here have explicitly indicated they host weddings. Should be the " +
      "highest-signal venue source. Run this before broader event_venue to identify " +
      "which venues are already tagged by Google.",
  },
  {
    type: "event_venue",
    category: "venue",
    radius: DEFAULT_RADIUS_METERS,
    notes:
      "Broader event space type that includes many venues that also host weddings. " +
      "Expect significant overlap with wedding_venue results — use ON CONFLICT DO " +
      "NOTHING in the insert to handle duplicates. Valuable for catching spaces that " +
      "haven't been specifically typed as wedding venues by Google.",
  },
  {
    type: "banquet_hall",
    category: "venue",
    radius: DEFAULT_RADIUS_METERS,
    notes:
      "Traditional banquet halls that Google classifies separately from event venues. " +
      "Common in Chicago's ethnic communities and suburbs. These may not appear in " +
      "wedding_venue or event_venue results. Distinct enough from the other venue " +
      "types to warrant its own search.",
  },

  // ── Catering ──────────────────────────────────────────────────────────────

  {
    type: "catering_service",
    category: "caterer",
    radius: DEFAULT_RADIUS_METERS,
    notes:
      "Google's place type for catering businesses. Catches caterers who may not use " +
      "wedding-specific keywords in their Business Profile. Complements the text " +
      "search by surfacing businesses by trade rather than marketing language. " +
      "Will include corporate caterers — filter by reviewing individual listings.",
  },

  // ── Florals ───────────────────────────────────────────────────────────────

  {
    type: "florist",
    category: "florist",
    radius: DEFAULT_RADIUS_METERS,
    notes:
      "All flower shops and floral studios within range. Will include grocery store " +
      "floral departments and general gift shops — post-insert filtering by name or " +
      "editorial summary may be needed to remove non-bridal florists. Still valuable " +
      "because many legitimate wedding florists don't use 'wedding' in their profile.",
  },

  // ── Hair & Makeup ─────────────────────────────────────────────────────────
  // The beauty category has three relevant place types. Running all three maximizes
  // coverage since Google's classification of beauty businesses is inconsistent —
  // a full-service bridal salon may be typed as beauty_salon, hair_salon, or both.

  {
    type: "beauty_salon",
    category: "hair_makeup",
    radius: DEFAULT_RADIUS_METERS,
    notes:
      "Full-service salons offering both hair and makeup. The broadest beauty type — " +
      "will return many non-bridal salons. However, many bridal studios are classified " +
      "here because they offer full services. High volume, lower precision. Use in " +
      "combination with the other beauty types and rely on text search for filtering.",
  },
  {
    type: "hair_salon",
    category: "hair_makeup",
    radius: DEFAULT_RADIUS_METERS,
    notes:
      "Hair-focused salons that may not be classified as beauty_salon. Some bridal " +
      "hair specialists operate as hair salons. Expect overlap with beauty_salon — " +
      "ON CONFLICT handles duplicates. Included because Google's typing is inconsistent " +
      "and we'd rather over-fetch than miss a legitimate bridal provider.",
  },
  {
    type: "makeup_artist",
    category: "hair_makeup",
    radius: DEFAULT_RADIUS_METERS,
    notes:
      "Standalone makeup artists with a physical location or Google Business Profile. " +
      "Many freelance makeup artists operate from home studios or travel to clients " +
      "and still have a Google listing. This type has lower volume than salon types " +
      "but higher precision for bridal makeup specifically.",
  },

  // ── Photography & DJ: NOT included here ───────────────────────────────────
  // Google Places has no official type for photographers or DJs/musicians.
  // These categories rely entirely on TEXT_SEARCH_TERMS above.
  // If Google adds types in the future, add entries here and update AGENTS.md.
];

module.exports = {
  TEXT_SEARCH_TERMS,
  NEARBY_SEARCH_TYPES,
  CHICAGO_CENTER,
  DEFAULT_RADIUS_METERS,
};
