/**
 * Dewy — Master Search Strategy Config
 * =====================================
 * This file defines every query used to populate the vendors database.
 * It is the single source of truth for what we search for and why.
 *
 * CURRENT STRATEGY: TEXT SEARCH ONLY
 * ────────────────────────────────────
 * All vendor discovery uses the Google Places Text Search API (New):
 *   POST https://places.googleapis.com/v1/places:searchText
 *   body: { textQuery: "<term>" }
 *
 * The `textQuery` parameter drives Google's relevance ranking — including the
 * business name, Google Business Profile description, reviews, and category.
 * A query like "wedding florist Chicago IL" surfaces businesses that explicitly
 * market to weddings, which is exactly the signal Dewy needs.
 *
 * WHY NOT NEARBY SEARCH?
 * ───────────────────────
 * We evaluated the Nearby Search API (POST .../places:searchNearby) but found
 * it too noisy for a wedding marketplace. Nearby search filters only by place
 * type (e.g., `florist`, `beauty_salon`) and location radius — it has no
 * equivalent of a keyword filter and no wedding-intent signal whatsoever.
 * In practice this meant:
 *
 *   - `florist`       → returned grocery store floral departments alongside
 *                        legitimate wedding florists
 *   - `beauty_salon`  → returned Ulta Beauty, chain salons, nail bars, etc.
 *   - `hair_salon`    → similarly broad; no way to distinguish a bridal
 *                        specialist from a walk-in barbershop
 *
 * The API does support `minRating` and `rankPreference` (DISTANCE | POPULARITY),
 * but neither parameter filters for wedding intent — they only affect which
 * non-wedding businesses surface first. There is no `includedKeywords` or
 * equivalent in the Nearby Search request body.
 *   Docs: https://developers.google.com/maps/documentation/places/web-service/nearby-search
 *
 * Two entire vendor categories — Photography and DJ & Music — have no Google
 * place type at all (see Place Types reference:
 *   https://developers.google.com/maps/documentation/places/web-service/place-types),
 * so nearby search could never cover them regardless.
 *
 * REVISITING NEARBY SEARCH
 * ─────────────────────────
 * Nearby search could be worth revisiting if Google adds:
 *   - A `textQuery`-style keyword filter to the nearby search request body
 *   - A `wedding_vendor` or equivalent high-level place type
 * Or if we build a post-fetch filtering layer (e.g., discard results whose
 * name or editorial summary contains no wedding-adjacent language). Until then,
 * text search gives better precision with less cleanup work.
 *   Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
 *
 * ADDING NEW SEARCH TERMS
 * ────────────────────────
 * Always add an entry here before updating the seed script. Fill in the `notes`
 * field explaining what gap the new term fills — if you can't articulate it,
 * it may not be worth adding. API calls cost money; avoid duplicating coverage.
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

module.exports = { TEXT_SEARCH_TERMS };
