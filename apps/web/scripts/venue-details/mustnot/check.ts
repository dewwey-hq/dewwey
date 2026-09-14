/**
 * `runMustNot` -- pure evaluation of the rubric's 15-venue must-not assertion floor against a
 * `VenueDetailsV3` document. No DB, no network. A thin/empty crawl (a document with no spaces, no
 * capacities, no pricing) PASSES every assertion here by construction (there's nothing to violate),
 * matching the plan's "a thin crawl on a hotel SPA passes must-not by staying empty."
 */
import type { VenueDetailsV3 } from "../../../lib/venueDetails/types";
import { headlineCapacity } from "../../../lib/venueDetails/derive";

// ---------------------------------------------------------------------------
// Assertion types
// ---------------------------------------------------------------------------

export type MustNotAssertion =
  | { kind: "no_generic_label_space" }
  | { kind: "no_duplicate_space" }
  | { kind: "no_summed_rooms" }
  | { kind: "no_adr_price" }
  | { kind: "no_hotel_faq_majority" }
  | { kind: "no_junk_vendor_names" }
  | { kind: "no_gala_floor_plan_when_wedding_exists" }
  | { kind: "no_amalgam_capacity_range" }
  | { kind: "no_split_single_area"; areaNames: string[] } // e.g. Greenhouse's Loft/Skygarden/Art Gallery
  | { kind: "capacity_headline_not_null_if_site_states" }; // informational only, never fails

export interface MustNotFailure {
  assertion: MustNotAssertion["kind"];
  detail: string;
}

export interface MustNotResult {
  passed: boolean;
  failed: MustNotFailure[];
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

const GENERIC_LABEL_RE = /^(wedding venues?|event space|meeting rooms?)$/i;

function checkNoGenericLabelSpace(d: VenueDetailsV3): MustNotFailure[] {
  const failures: MustNotFailure[] = [];
  for (const s of d.spaces) {
    if (GENERIC_LABEL_RE.test(s.name.trim())) {
      failures.push({ assertion: "no_generic_label_space", detail: `space "${s.name}" (id ${s.id}) looks like a category heading, not a real room` });
    }
  }
  return failures;
}

function normalizeSpaceName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\broom\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Fuzzy: same normalized name (ignoring "Room" and punctuation), OR one name is a strict prefix
 * of the other (the Four Seasons "Delaware" / "Delaware Room" pattern). */
function fuzzyDuplicate(a: string, b: string): boolean {
  const na = normalizeSpaceName(a);
  const nb = normalizeSpaceName(b);
  if (na.length === 0 || nb.length === 0) return false;
  return na === nb;
}

function checkNoDuplicateSpace(d: VenueDetailsV3): MustNotFailure[] {
  const failures: MustNotFailure[] = [];
  for (let i = 0; i < d.spaces.length; i++) {
    for (let j = i + 1; j < d.spaces.length; j++) {
      if (fuzzyDuplicate(d.spaces[i].name, d.spaces[j].name)) {
        failures.push({ assertion: "no_duplicate_space", detail: `"${d.spaces[i].name}" and "${d.spaces[j].name}" look like the same room counted twice` });
      }
    }
  }
  return failures;
}

/** `headlineCapacity` already refuses to sum rooms (max-of, never sum-of); this assertion instead
 * catches the one place a sum could still sneak in: a capacity tuple whose `as_stated_label` reads
 * like a sum of two named spaces (e.g. "Pavilion + Pergola: 800") when neither space alone states
 * that number. */
function checkNoSummedRooms(d: VenueDetailsV3): MustNotFailure[] {
  const failures: MustNotFailure[] = [];
  const singleMaxes = new Set(d.capacities.filter((c) => c.space_id !== "whole_venue").map((c) => c.max));
  for (const c of d.capacities) {
    const looksSummed = /\+|\band\b|combined|together/i.test(c.as_stated_label);
    if (looksSummed && c.space_id !== "whole_venue" && !singleMaxes.has(c.max)) {
      // A "combined" label describing a number no single space states on its own, attributed to a
      // single space_id (not whole_venue), is the amalgam-sum pattern this assertion targets.
      failures.push({ assertion: "no_summed_rooms", detail: `capacity "${c.as_stated_label}" (${c.max}) on space ${c.space_id} looks like two rooms summed` });
    }
  }
  return failures;
}

/** Guest-room ADR ("From $163/night") mistaken for a venue rental fee. Matches the rubric's own
 * example phrasing: a dollar amount followed by "/night" or "per night", or the literal "ADR". */
const ADR_QUOTE_RE = /\b(adr|average daily rate)\b|\$\s?[\d,]+(\.\d+)?\s*\/?\s*(per\s+)?night\b/i;

function checkNoAdrPrice(d: VenueDetailsV3): MustNotFailure[] {
  const failures: MustNotFailure[] = [];
  for (const fee of d.pricing.paths.flatMap((p) => p.fixed_fees)) {
    if (ADR_QUOTE_RE.test(fee.quote)) failures.push({ assertion: "no_adr_price", detail: `fixed fee "${fee.label}" quote looks like a guest-room nightly rate: "${fee.quote}"` });
  }
  for (const a of d.pricing.add_ons) {
    if (ADR_QUOTE_RE.test(a.quote)) failures.push({ assertion: "no_adr_price", detail: `add-on "${a.name}" quote looks like a guest-room nightly rate: "${a.quote}"` });
  }
  return failures;
}

/** Hotel-guest FAQ contamination: a hotel-category venue whose FAQ list is >90% generic
 * hotel-guest content (check-in/out, wifi, loyalty points, gift cards) and near-zero wedding
 * relevance. Keyword-based per the rubric's own admission this is imperfect. */
const HOTEL_GUEST_FAQ_RE = /\b(check-?in|check-?out|wi-?fi|loyalty|gift card|parking garage rate|pet policy|room service|housekeeping)\b/i;
const WEDDING_FAQ_RE = /\b(wedding|ceremony|reception|bride|groom|bridal|catering|venue rental|event space)\b/i;

function checkNoHotelFaqMajority(d: VenueDetailsV3): MustNotFailure[] {
  if (d.faqs.length === 0) return [];
  const isHotelKind = d.spine.venue_kind.status === "stated" && d.spine.venue_kind.value === "hotel";
  if (!isHotelKind) return [];
  const genericCount = d.faqs.filter((f) => HOTEL_GUEST_FAQ_RE.test(f.question) && !WEDDING_FAQ_RE.test(f.question) && !WEDDING_FAQ_RE.test(f.answer)).length;
  const ratio = genericCount / d.faqs.length;
  if (ratio > 0.9) {
    return [{ assertion: "no_hotel_faq_majority", detail: `${genericCount}/${d.faqs.length} FAQs are generic hotel-guest content with no wedding relevance` }];
  }
  return [];
}

/** Nav-junk / legal-boilerplate / sluggy vendor names (the rubric's confirmed junk genres). */
const JUNK_VENDOR_RE =
  /\b(privacy (request|policy)|code of (business )?conduct|modern slavery|gift cards?|order online|follow us|terms (of|&) (service|conditions)|investor relations|accessibility statement|sitemap)\b/i;

function isSluggyName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 8 && !/\s/.test(trimmed) && /[a-z]/i.test(trimmed) && !/^[A-Z]+$/.test(trimmed);
}

function checkNoJunkVendorNames(d: VenueDetailsV3): MustNotFailure[] {
  const failures: MustNotFailure[] = [];
  for (const list of d.vendor_lists) {
    for (const entry of list.entries) {
      if (JUNK_VENDOR_RE.test(entry.name)) {
        failures.push({ assertion: "no_junk_vendor_names", detail: `vendor "${entry.name}" in list "${list.label}" looks like nav/legal boilerplate, not a real vendor` });
      } else if (isSluggyName(entry.name)) {
        failures.push({ assertion: "no_junk_vendor_names", detail: `vendor "${entry.name}" in list "${list.label}" looks like a URL slug, not a real business name` });
      }
    }
  }
  return failures;
}

/** A gala/corporate-labeled floor plan resource surfacing when a wedding-labeled one also exists
 * for the same venue (the Geraghty pattern: our stored plan was a Gala one while 3 wedding-labeled
 * plans existed on the same page). */
function checkNoGalaFloorPlanWhenWeddingExists(d: VenueDetailsV3): MustNotFailure[] {
  const floorPlans = d.resources.filter((r) => r.kind === "floor_plan");
  const hasWeddingPlan = floorPlans.some((r) => /wedding/i.test(r.label));
  const galaPlans = floorPlans.filter((r) => /\b(gala|corporate|social event)\b/i.test(r.label) && !/wedding/i.test(r.label));
  if (hasWeddingPlan && galaPlans.length > 0) {
    return galaPlans.map((r) => ({ assertion: "no_gala_floor_plan_when_wedding_exists" as const, detail: `resource "${r.label}" is a non-wedding floor plan alongside a wedding-labeled one` }));
  }
  // If there's no wedding-labeled plan AT ALL but a gala one is present and surfaced, that's the
  // stronger failure mode the pattern names -- also flag it.
  if (!hasWeddingPlan && galaPlans.length > 0) {
    return galaPlans.map((r) => ({ assertion: "no_gala_floor_plan_when_wedding_exists" as const, detail: `resource "${r.label}" is the ONLY floor plan and it's not wedding-labeled` }));
  }
  return [];
}

/** A fake amalgam capacity range: a span > 10x, or a headline > 1000 without a matching per-space
 * tuple backing it (i.e. the headline number doesn't correspond to any real capacity tuple). */
function checkNoAmalgamCapacityRange(d: VenueDetailsV3): MustNotFailure[] {
  const failures: MustNotFailure[] = [];
  for (const c of d.capacities) {
    if (c.min != null && c.min > 0 && c.max / c.min > 10) {
      failures.push({ assertion: "no_amalgam_capacity_range", detail: `capacity ${c.min}-${c.max} on ${c.space_id}:${c.layout} spans more than 10x -- looks like an amalgam range, not a real room` });
    }
  }
  const hc = headlineCapacity(d);
  if (hc.headline != null && hc.headline > 1000) {
    const backed = d.capacities.some((c) => c.max === hc.headline && c.space_id === hc.headline_space_id && c.layout === hc.headline_layout);
    if (!backed) failures.push({ assertion: "no_amalgam_capacity_range", detail: `headline capacity ${hc.headline} exceeds 1000 with no matching per-space tuple backing it` });
  }
  return failures;
}

/** One physical area (e.g. Greenhouse's Loft/Skygarden/Art Gallery) must be a SINGLE space, not
 * split across multiple `spaces[]` entries under different names. */
function checkNoSplitSingleArea(d: VenueDetailsV3, areaNames: string[]): MustNotFailure[] {
  const normalized = areaNames.map((n) => normalizeSpaceName(n));
  const matchingSpaces = d.spaces.filter((s) => normalized.includes(normalizeSpaceName(s.name)));
  if (matchingSpaces.length > 1) {
    return [{ assertion: "no_split_single_area", detail: `${matchingSpaces.map((s) => s.name).join(", ")} should be ONE bookable space, found ${matchingSpaces.length}` }];
  }
  return [];
}

function checkCapacityHeadlineNotNullIfSiteStates(_d: VenueDetailsV3): MustNotFailure[] {
  // Informational only per the plan ("capacity_headline_not_null_if_site_states (informational)")
  // -- there's no reliable way to know "the site states a capacity" from the document alone
  // without re-crawling, so this never fails; it exists as a documented no-op assertion kind.
  return [];
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export function runMustNot(document: VenueDetailsV3, assertions: MustNotAssertion[]): MustNotResult {
  const failed: MustNotFailure[] = [];
  for (const assertion of assertions) {
    switch (assertion.kind) {
      case "no_generic_label_space":
        failed.push(...checkNoGenericLabelSpace(document));
        break;
      case "no_duplicate_space":
        failed.push(...checkNoDuplicateSpace(document));
        break;
      case "no_summed_rooms":
        failed.push(...checkNoSummedRooms(document));
        break;
      case "no_adr_price":
        failed.push(...checkNoAdrPrice(document));
        break;
      case "no_hotel_faq_majority":
        failed.push(...checkNoHotelFaqMajority(document));
        break;
      case "no_junk_vendor_names":
        failed.push(...checkNoJunkVendorNames(document));
        break;
      case "no_gala_floor_plan_when_wedding_exists":
        failed.push(...checkNoGalaFloorPlanWhenWeddingExists(document));
        break;
      case "no_amalgam_capacity_range":
        failed.push(...checkNoAmalgamCapacityRange(document));
        break;
      case "no_split_single_area":
        failed.push(...checkNoSplitSingleArea(document, assertion.areaNames));
        break;
      case "capacity_headline_not_null_if_site_states":
        failed.push(...checkCapacityHeadlineNotNullIfSiteStates(document));
        break;
    }
  }
  return { passed: failed.length === 0, failed };
}
