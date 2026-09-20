import { describe, expect, it } from "vitest";

import { getGolden } from "../../lib/venueDetails/golden";
import { criticalFieldPaths } from "../../lib/venueDetails/tiers";
import type { AddOn } from "../../lib/venueDetails/types";
import { emptyRates, fact, makeVenue, spineWith } from "../../lib/venueDetails/testHelpers";
import { alignSpaces, normalizeTime, scoreCapacities, scoreCostDelta, scoreImportantCore, scorePricingScalars, scoreSpaces, scoreSpineTiers, scoreVenue } from "./score";
import type { CapacityTuple, FixedFee, PerGuestTier, PricingPath, Space } from "../../lib/venueDetails/types";

describe("scoreVenue: golden vs itself", () => {
  it("scores 100% on every tier and 0 cost delta for every golden fixture", () => {
    for (const slug of ["galleria-marchetti", "greenhouse-loft", "diamond-garden-banquet-hall", "londonhouse-chicago", "field-museum", "geraghty"] as const) {
      const golden = getGolden(slug)!;
      const result = scoreVenue(golden, golden, criticalFieldPaths(golden));
      expect(result.tiers.critical.accuracy, `${slug} critical`).toBe(1);
      expect(result.tiers.important.accuracy, `${slug} important`).toBe(1);
      expect(result.tiers.secondary.accuracy, `${slug} secondary`).toBe(1);
      expect(result.capacities.headlineExact, `${slug} headline`).toBe(true);
      expect(result.costDelta.pctDelta ?? 0, `${slug} cost delta`).toBeLessThanOrEqual(0.0001);
    }
  });
});

describe("scoreSpineTiers: one swapped critical value drops critical accuracy by one field", () => {
  it("field-museum-style: flipping a critical field lowers only the critical tier", () => {
    const golden = getGolden("galleria-marchetti")!;
    const critical = scoreSpineTiers(golden, golden).critical;
    expect(critical.matches).toBe(critical.total);

    const candidate: typeof golden = JSON.parse(JSON.stringify(golden));
    // catering is critical; swap it to a different valid enum value.
    candidate.spine.catering = { status: "stated", value: "open", quote: "x", source_url: candidate.spine.catering.status === "stated" ? candidate.spine.catering.source_url : "https://example.com", snapshot_id: null };

    const result = scoreSpineTiers(candidate, golden);
    expect(result.critical.matches).toBe(critical.total - 1);
    expect(result.critical.misses.map((m) => m.path)).toContain("/spine/catering");
  });
});

describe("scoreSpaces: a missing space drops recall", () => {
  it("recall is 0.5 when the candidate is missing one of two golden spaces", () => {
    const golden = makeVenue({
      spaces: [
        { id: "a", name: "The Pavilion", structure_label: null, sq_ft: null, sq_ft_outdoor: null, ceiling_ft: null, setting: null, bookable_separately: true, description: null, includes_summary: null, evidence: { source_url: "https://example.com", snapshot_id: null } },
        { id: "b", name: "La Pergola", structure_label: null, sq_ft: null, sq_ft_outdoor: null, ceiling_ft: null, setting: null, bookable_separately: true, description: null, includes_summary: null, evidence: { source_url: "https://example.com", snapshot_id: null } },
      ],
    });
    const candidate = makeVenue({
      spaces: [{ id: "a", name: "The Pavilion", structure_label: null, sq_ft: null, sq_ft_outdoor: null, ceiling_ft: null, setting: null, bookable_separately: true, description: null, includes_summary: null, evidence: { source_url: "https://example.com", snapshot_id: null } }],
    });

    const result = scoreSpaces(candidate, golden);
    expect(result.recall).toBe(0.5);
    expect(result.precision).toBe(1);
  });
});

describe("human_only-tagged fields are ignored unless --all-fields", () => {
  it("excludes a human_only spine field from the tier score by default, includes it with allFields", () => {
    const golden = makeVenue({
      spine: spineWith({ catering: fact("open"), coat_check: fact("included") }),
      eval: { "/spine/catering": "extractor", "/spine/coat_check": "human_only" },
      sources: { snapshot_ids: [], pages: ["https://example.com"], crawled_at: null },
    });
    // golden.spine.catering.source_url defaults to https://example.com via `fact()`.

    const candidateMissingBoth = makeVenue({ spine: spineWith({}), sources: { snapshot_ids: [], pages: ["https://example.com"], crawled_at: null } });

    const defaultScore = scoreSpineTiers(candidateMissingBoth, golden);
    // catering (critical) is in scope and missed; coat_check (secondary, human_only) is excluded
    // entirely, so secondary's total should be 0 (vacuous accuracy 1), not counted as a miss.
    expect(defaultScore.critical.total).toBe(1);
    expect(defaultScore.critical.matches).toBe(0);
    expect(defaultScore.secondary.total).toBe(0);
    expect(defaultScore.secondary.accuracy).toBe(1);

    const allFieldsScore = scoreSpineTiers(candidateMissingBoth, golden, { allFields: true });
    expect(allFieldsScore.secondary.total).toBeGreaterThan(0);
  });
});

describe("scorePricingScalars: seasons and includes (round 3 scalars)", () => {
  const samePath = { id: "standard", name: "Standard", description: null, applies_to_spaces: "all" as const, fixed_fees: [], per_guest_tiers: [], minimums: [], required_staffing: null, rental_hours: null, year_surcharges: [], promotions: [], quote: "q", source_url: "https://example.com", snapshot_id: null };

  it("counts a seasons match/mismatch only when eval-tagged", () => {
    const golden = makeVenue({
      pricing: { archetype: null, paths: [], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [], seasons: { peak: "Apr-Oct, Dec", off: "Jan, Feb, Mar, Nov" } },
      eval: { "/pricing/seasons": "extractor" },
    });
    const candidateMatch = makeVenue({ pricing: { archetype: null, paths: [], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [], seasons: { peak: "Apr-Oct, Dec", off: "Jan, Feb, Mar, Nov" } } });
    const candidateMiss = makeVenue({ pricing: { archetype: null, paths: [], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [], seasons: { peak: "different", off: null } } });
    const candidateUntagged = makeVenue({ pricing: { archetype: null, paths: [], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });

    const matchResult = scorePricingScalars(candidateMatch, golden);
    expect(matchResult.total).toBeGreaterThan(0);
    expect(matchResult.matches).toBe(matchResult.total);

    const missResult = scorePricingScalars(candidateMiss, golden);
    expect(missResult.misses.map((m) => m.path)).toContain("/pricing/seasons");

    // No eval tag on an untagged golden -> not in scope at all.
    const untaggedGolden = makeVenue({ pricing: { archetype: null, paths: [], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [], seasons: { peak: "Apr-Oct, Dec", off: null } } });
    const result = scorePricingScalars(candidateUntagged, untaggedGolden);
    expect(result.misses.map((m) => m.path)).not.toContain("/pricing/seasons");
  });

  it("counts an includes[] match/mismatch on the default path only when eval-tagged", () => {
    const golden = makeVenue({
      pricing: { archetype: null, paths: [{ ...samePath, includes: ["tables", "chairs"] }], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] },
      eval: { "/pricing/paths/standard/includes": "extractor" },
    });
    const candidateMatch = makeVenue({ pricing: { archetype: null, paths: [{ ...samePath, includes: ["chairs", "tables"] }], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });
    const candidateMiss = makeVenue({ pricing: { archetype: null, paths: [{ ...samePath, includes: ["tables"] }], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });

    const matchResult = scorePricingScalars(candidateMatch, golden);
    expect(matchResult.matches).toBe(matchResult.total);

    const missResult = scorePricingScalars(candidateMiss, golden);
    expect(missResult.misses.map((m) => m.path)).toContain("/pricing/paths/standard/includes");
  });

  it("counts a paths[].terms match/mismatch on the default path (set equality on labels) only when eval-tagged", () => {
    const term = (label: string) => ({ label, text: `${label} text`, evidence: { source_url: "https://example.com", snapshot_id: null } });
    const golden = makeVenue({
      pricing: { archetype: null, paths: [{ ...samePath, terms: [term("Access"), term("Overtime")] }], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] },
      eval: { "/pricing/paths/standard/terms": "extractor" },
    });
    const candidateMatch = makeVenue({ pricing: { archetype: null, paths: [{ ...samePath, terms: [term("Overtime"), term("Access")] }], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });
    const candidateMiss = makeVenue({ pricing: { archetype: null, paths: [{ ...samePath, terms: [term("Access")] }], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });
    const candidateUntagged = makeVenue({ pricing: { archetype: null, paths: [{ ...samePath, terms: [term("Access")] }], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });

    const matchResult = scorePricingScalars(candidateMatch, golden);
    expect(matchResult.matches).toBe(matchResult.total);

    const missResult = scorePricingScalars(candidateMiss, golden);
    expect(missResult.misses.map((m) => m.path)).toContain("/pricing/paths/standard/terms");

    // No eval tag on an untagged golden -> not in scope at all.
    const untaggedGolden = makeVenue({ pricing: { archetype: null, paths: [{ ...samePath, terms: [term("Access"), term("Overtime")] }], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });
    const result = scorePricingScalars(candidateUntagged, untaggedGolden);
    expect(result.misses.map((m) => m.path)).not.toContain("/pricing/paths/standard/terms");
  });
});

describe("capacity headline exact / mismatch", () => {
  it("headlineExact is false when the two documents' headline numbers differ", () => {
    const golden = getGolden("galleria-marchetti")!;
    const candidate: typeof golden = JSON.parse(JSON.stringify(golden));
    const idx = candidate.capacities.findIndex((c) => c.space_id === "the-pavilion" && c.layout === "seated_dinner");
    candidate.capacities[idx] = { ...candidate.capacities[idx], max: 999 };
    const result = scoreCapacities(candidate, golden);
    expect(result.headlineExact).toBe(false);
    expect(result.matches).toBeLessThan(result.total);
  });
});

// ---------------------------------------------------------------------------
// important_core / inventory split (the important-tier line-item fix)
// ---------------------------------------------------------------------------

function makeAddOn(i: number, overrides: Partial<AddOn> = {}): AddOn {
  return {
    id: `add-${i}`,
    name: `Add-on ${i}`,
    category: "extras",
    variant: null,
    group: "other",
    price: i * 10,
    price_max: null,
    unit: "flat",
    per_space_prices: null,
    applies_to: null,
    path_ids: null,
    condition: null,
    priceable: true,
    tax_pct_override: null,
    min_guests: null,
    as_stated_price: null,
    note: null,
    quote: "quote",
    source_url: "https://example.com",
    snapshot_id: null,
    ...overrides,
  };
}

function importantCoreFixture() {
  const addOns = Array.from({ length: 10 }, (_, i) => makeAddOn(i));
  const addOnEval = Object.fromEntries(addOns.map((a) => [`/pricing/add_ons/${a.id}`, "extractor" as const]));
  const golden = makeVenue({
    spine: spineWith({
      event_insurance: fact("required"),
      day_of_coordinator: fact("included"),
      security: fact("required_hire"),
    }),
    pricing: { archetype: null, paths: [], rates: emptyRates(), add_ons: addOns, required_third_party: [], notes: [] },
    sources: { snapshot_ids: [], pages: ["https://example.com"], crawled_at: null },
    eval: {
      "/spine/event_insurance": "extractor",
      "/spine/day_of_coordinator": "extractor",
      "/spine/security": "extractor",
      ...addOnEval,
    },
  });
  return { golden, addOns };
}

describe("important_core vs inventory: a wrong spine field and missing add-ons hit different numbers", () => {
  it("a wrong important-tier spine field drops important_core but leaves inventory alone", () => {
    const { golden, addOns } = importantCoreFixture();
    const candidate = makeVenue({
      ...golden,
      spine: spineWith({
        event_insurance: fact("not_required"), // wrong -- golden says "required"
        day_of_coordinator: fact("included"),
        security: fact("required_hire"),
      }),
      pricing: { archetype: null, paths: [], rates: emptyRates(), add_ons: addOns, required_third_party: [], notes: [] },
      sources: { snapshot_ids: [], pages: ["https://example.com"], crawled_at: null },
    });

    const result = scoreVenue(candidate, golden, []);
    expect(result.important_core.total).toBe(3);
    expect(result.important_core.matches).toBe(2);
    expect(result.important_core.accuracy).toBeCloseTo(2 / 3);
    expect(result.important_core.misses.map((m) => m.path)).toContain("/spine/event_insurance");

    // Inventory (all 10 add-ons present, correct) is untouched by the spine miss.
    expect(result.inventory.by_kind.add_ons.recall).toBe(1);
    expect(result.inventory.by_kind.add_ons.precision).toBe(1);
  });

  it("missing add-ons only lower inventory recall, not important_core", () => {
    const { golden, addOns } = importantCoreFixture();
    const candidate = makeVenue({
      ...golden,
      spine: spineWith({
        event_insurance: fact("required"),
        day_of_coordinator: fact("included"),
        security: fact("required_hire"),
      }),
      // Only 7 of the golden's 10 add-ons survive extraction.
      pricing: { archetype: null, paths: [], rates: emptyRates(), add_ons: addOns.slice(0, 7), required_third_party: [], notes: [] },
      sources: { snapshot_ids: [], pages: ["https://example.com"], crawled_at: null },
    });

    const result = scoreVenue(candidate, golden, []);
    expect(result.important_core.total).toBe(3);
    expect(result.important_core.matches).toBe(3);
    expect(result.important_core.accuracy).toBe(1);

    expect(result.inventory.by_kind.add_ons.golden_items).toBe(10);
    expect(result.inventory.by_kind.add_ons.found).toBe(7);
    expect(result.inventory.by_kind.add_ons.recall).toBeCloseTo(0.7);
  });

  it("tiers.important (deprecated) still equals the old spine-only computation", () => {
    const { golden, addOns } = importantCoreFixture();
    const candidate = makeVenue({
      ...golden,
      spine: spineWith({
        event_insurance: fact("not_required"),
        day_of_coordinator: fact("included"),
        security: fact("required_hire"),
      }),
      pricing: { archetype: null, paths: [], rates: emptyRates(), add_ons: addOns.slice(0, 4), required_third_party: [], notes: [] },
      sources: { snapshot_ids: [], pages: ["https://example.com"], crawled_at: null },
    });

    const result = scoreVenue(candidate, golden, []);
    const standalone = scoreSpineTiers(candidate, golden).important;
    expect(result.tiers.important).toEqual(standalone);
    // The old number is spine-only -- it never sees the add-on losses that important_core/inventory do.
    expect(result.tiers.important.total).toBe(3);
  });
});

describe("excluded: a fact whose source_url was never crawled is accounted for, not silently dropped", () => {
  it("lands in source_not_crawled with the url counted", () => {
    const hiddenAddOn = makeAddOn(0, { id: "hidden", name: "Hidden add-on", source_url: "https://example.com/hidden.pdf" });
    const golden = makeVenue({
      pricing: { archetype: null, paths: [], rates: emptyRates(), add_ons: [hiddenAddOn], required_third_party: [], notes: [] },
      sources: { snapshot_ids: [], pages: ["https://example.com/hidden.pdf"], crawled_at: null },
      eval: { "/pricing/add_ons/hidden": "extractor" },
    });
    // The candidate's own crawl never reached the PDF -- it's absent from `sources.pages`.
    const candidate = makeVenue({
      pricing: { archetype: null, paths: [], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] },
      sources: { snapshot_ids: [], pages: ["https://example.com"], crawled_at: null },
    });

    const result = scoreVenue(candidate, golden, []);
    expect(result.excluded.source_not_crawled.total).toBe(1);
    expect(result.excluded.source_not_crawled.by_url).toEqual([{ url: "https://example.com/hidden.pdf", count: 1 }]);
    expect(result.excluded.total).toBeGreaterThanOrEqual(1);
    // It never silently entered any denominator.
    expect(result.inventory.by_kind.add_ons.golden_items).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// alignSpaces (tick c2 calibration fix): candidateId -> goldenId, so a model's own space-id
// spelling never has to match a golden fixture's hand-authored slug verbatim.
// ---------------------------------------------------------------------------

function makeSpace(id: string, name: string): Space {
  return { id, name, structure_label: null, sq_ft: null, sq_ft_outdoor: null, ceiling_ft: null, setting: null, bookable_separately: true, description: null, includes_summary: null, evidence: { source_url: "https://example.com", snapshot_id: null } };
}

describe("alignSpaces", () => {
  it("matches by normalized id (underscore/space -> hyphen, strip a leading 'the-')", () => {
    const golden = [makeSpace("the-pavilion", "The Pavilion"), makeSpace("la-pergola", "La Pergola")];
    const candidate = [makeSpace("the_pavilion", "The Pavilion Room"), makeSpace("la_pergola", "La Pergola Room")];
    const map = alignSpaces(golden, candidate);
    expect(map.get("the_pavilion")).toBe("the-pavilion");
    expect(map.get("la_pergola")).toBe("la-pergola");
  });

  it("falls back to normalized name token overlap when ids don't line up", () => {
    const golden = [makeSpace("loft", "Greenhouse Loft")];
    const candidate = [makeSpace("greenhouse_loft", "Greenhouse Loft")];
    const map = alignSpaces(golden, candidate);
    expect(map.get("greenhouse_loft")).toBe("loft");
  });

  it("single-space rule: a golden with exactly one space aligns any candidate space, including the literal whole_venue pseudo-id", () => {
    const golden = [makeSpace("the-geraghty", "The Geraghty")];
    // A candidate that never declares a `Space` named "whole_venue" at all -- it only shows up as
    // a CapacityTuple/FixedFee space_id, which alignSpaces must still resolve.
    const map = alignSpaces(golden, []);
    expect(map.get("whole_venue")).toBe("the-geraghty");
  });

  it("does not collapse whole_venue onto a multi-space golden", () => {
    const golden = [makeSpace("the-pavilion", "The Pavilion"), makeSpace("la-pergola", "La Pergola")];
    const map = alignSpaces(golden, []);
    expect(map.has("whole_venue")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeTime
// ---------------------------------------------------------------------------

describe("normalizeTime", () => {
  it("normalizes 12h and 24h spellings to the same HH:MM", () => {
    expect(normalizeTime("2:00 am")).toBe("02:00");
    expect(normalizeTime("02:00")).toBe("02:00");
    expect(normalizeTime("2am")).toBe("02:00");
    expect(normalizeTime("12:00 am")).toBe("00:00");
    expect(normalizeTime("12:00 pm")).toBe("12:00");
  });

  it("returns null for an unparseable string", () => {
    expect(normalizeTime("Midnight")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Semantic spine-field comparison (payment_schedule, cancellation, noise_curfew, fb_minimum):
// two honest write-ups of the same fact must match even when the wording/object-key-order differs.
// ---------------------------------------------------------------------------

// A candidate's `sources.pages` must include the golden's stated `source_url` for a field to be
// in scope at all (`passesEvalAndCrawlFilter`'s crawled-set gate) -- every test below uses this
// same single-page crawled set since `fact()`'s default `source_url` is "https://example.com".
const CRAWLED = { snapshot_ids: [], pages: ["https://example.com"], crawled_at: null };

describe("semantic spine-field comparison", () => {
  it("payment_schedule matches on numeric tokens, not verbatim wording", () => {
    const golden = makeVenue({
      spine: spineWith({ payment_schedule: fact({ deposit: "50% deposit (non-refundable)", balance_due: "Homepage: 10 days before the event." }) }),
      eval: { "/spine/payment_schedule": "extractor" },
    });
    const candidate = makeVenue({
      spine: spineWith({ payment_schedule: fact({ deposit: "50% of the rental amount as a non-refundable deposit", balance_due: "10 days prior to your wedding" }) }),
      sources: CRAWLED,
    });
    const result = scoreSpineTiers(candidate, golden);
    expect(result.important.matches).toBe(1);
    expect(result.important.misses).toEqual([]);
  });

  it("noise_curfew matches after time normalization", () => {
    const golden = makeVenue({ spine: spineWith({ noise_curfew: fact("2:00 am") }), eval: { "/spine/noise_curfew": "extractor" } });
    const candidate = makeVenue({ spine: spineWith({ noise_curfew: fact("02:00") }), sources: CRAWLED });
    const result = scoreSpineTiers(candidate, golden);
    expect(result.important.matches).toBe(1);
  });

  it("fb_minimum matches on applies + amount_usd only, ignoring detail prose and key order", () => {
    const golden = makeVenue({
      spine: spineWith({ fb_minimum: fact({ applies: false, amount_usd: null, detail: null }) }),
      eval: { "/spine/fb_minimum": "extractor" },
    });
    // Same values, different key order AND a candidate that adds prose the golden has none of --
    // neither should matter.
    const candidate = makeVenue({ spine: spineWith({ fb_minimum: fact({ detail: "We have an open catering list", applies: false, amount_usd: null }) }), sources: CRAWLED });
    const result = scoreSpineTiers(candidate, golden);
    expect(result.critical.matches).toBe(1);
  });

  it("cancellation requires deposit_refundable to agree even when the summary's numeric tokens agree", () => {
    const golden = makeVenue({
      spine: spineWith({ cancellation: fact({ summary: "50% due at 60 days", deposit_refundable: false }) }),
      eval: { "/spine/cancellation": "extractor" },
    });
    const candidate = makeVenue({ spine: spineWith({ cancellation: fact({ summary: "50% due at 60 days", deposit_refundable: true }) }), sources: CRAWLED });
    const result = scoreSpineTiers(candidate, golden);
    expect(result.important.matches).toBe(0);
    expect(result.important.misses[0]?.path).toBe("/spine/cancellation");
  });

  it("a golden `conflicting` payment_schedule still scores a differently-worded stated candidate as a miss", () => {
    const golden = makeVenue({
      spine: spineWith({
        payment_schedule: {
          status: "conflicting",
          candidates: [
            { value: { deposit: "Non-refundable retainer, then 180 days before", balance_due: "10 business days before" }, quote: "q1", source_url: "https://example.com/a", snapshot_id: null },
            { value: { deposit: "Non-refundable retainer, then 180 days before", balance_due: "15 business days before" }, quote: "q2", source_url: "https://example.com/b", snapshot_id: null },
          ],
        },
      }),
      eval: { "/spine/payment_schedule": "extractor" },
    });
    const candidate = makeVenue({ spine: spineWith({ payment_schedule: fact({ deposit: "50% deposit", balance_due: "10 days before" }) }), sources: CRAWLED });
    const result = scoreSpineTiers(candidate, golden);
    expect(result.important.matches).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: capacities and fixed fees compare correctly across a model's own space-id spelling
// (tick c2 evidence -- Marchetti/Greenhouse: identical values, all-zero scores before the fix).
// ---------------------------------------------------------------------------

function makeCapacity(overrides: Partial<CapacityTuple>): CapacityTuple {
  return { space_id: "space-a", layout: "seated_dinner", min: null, max: 100, as_stated_label: "Seated", tile: "seated", condition: null, quote: "q", source_url: "https://example.com", snapshot_id: null, ...overrides };
}

function makeFee(overrides: Partial<FixedFee>): FixedFee {
  return { applies_to: "space", space_id: "space-a", day: "sat", season: null, amount: 1000, unit: "flat", label: "Rental", includes: [], key: "fee-a", quote: "q", source_url: "https://example.com", snapshot_id: null, ...overrides };
}

describe("capacities and fixed fees align on space, not on a model's own id spelling", () => {
  it("scoreCapacities matches identical capacity values across differently-spelled space ids", () => {
    const golden = makeVenue({
      spaces: [makeSpace("the-pavilion", "The Pavilion")],
      capacities: [makeCapacity({ space_id: "the-pavilion", max: 425 })],
      eval: { "/capacities/the-pavilion:seated_dinner": "extractor" },
    });
    const candidate = makeVenue({
      spaces: [makeSpace("the_pavilion", "The Pavilion")],
      capacities: [makeCapacity({ space_id: "the_pavilion", max: 425 })],
      sources: CRAWLED,
    });
    const result = scoreCapacities(candidate, golden);
    expect(result.matches).toBe(1);
    expect(result.total).toBe(1);
    expect(result.misses).toEqual([]);
  });

  it("a single-space golden's whole-venue fee matches a candidate fee keyed on its own single (differently-named) space", () => {
    const path: PricingPath = {
      id: "standard",
      name: "Standard",
      description: null,
      applies_to_spaces: "all",
      fixed_fees: [makeFee({ applies_to: "whole_venue", space_id: null, day: "sat", season: "peak", amount: 12000 })],
      per_guest_tiers: [],
      minimums: [],
      required_staffing: null,
      rental_hours: null,
      year_surcharges: [],
      promotions: [],
      quote: "q",
      source_url: "https://example.com",
      snapshot_id: null,
    };
    const golden = makeVenue({
      spaces: [makeSpace("loft", "Greenhouse Loft")],
      pricing: { archetype: null, paths: [path], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] },
      eval: { "/pricing/paths/standard/fixed_fees/fee-a": "extractor" },
    });
    const candidatePath: PricingPath = { ...path, fixed_fees: [makeFee({ applies_to: "space", space_id: "greenhouse_loft", day: "sat", season: "peak", amount: 12000 })] };
    const candidate = makeVenue({
      spaces: [makeSpace("greenhouse_loft", "Greenhouse Loft")],
      pricing: { archetype: null, paths: [candidatePath], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] },
      sources: CRAWLED,
    });

    const result = scoreImportantCore(candidate, golden);
    expect(result.matches).toBe(1);
    expect(result.total).toBe(1);
    expect(result.misses).toEqual([]);
  });

  it("per-guest tiers match by normalized name/id + price within 1%, independent of exact id spelling", () => {
    const tier: PerGuestTier = { id: "argento", name: "Argento", per_guest: 190, day: null, season: "any", inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "q", source_url: "https://example.com", snapshot_id: null };
    const path: PricingPath = { id: "standard", name: "Standard", description: null, applies_to_spaces: "all", fixed_fees: [], per_guest_tiers: [tier], minimums: [], required_staffing: null, rental_hours: null, year_surcharges: [], promotions: [], quote: "q", source_url: "https://example.com", snapshot_id: null };
    const golden = makeVenue({ pricing: { archetype: null, paths: [path], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] }, eval: { "/pricing/paths/standard/per_guest_tiers/argento": "extractor" } });
    const candidateTier: PerGuestTier = { ...tier, per_guest: 190.5 }; // within 1%
    const candidate = makeVenue({ pricing: { archetype: null, paths: [{ ...path, per_guest_tiers: [candidateTier] }], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] }, sources: CRAWLED });

    const result = scoreImportantCore(candidate, golden);
    expect(result.matches).toBe(1);
    expect(result.misses).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Misses carry values (tick c2): every miss is {path, golden, candidate, note}, not a bare string.
// ---------------------------------------------------------------------------

describe("misses carry values", () => {
  it("a capacity miss reports the golden max, the candidate's aligned max, and why", () => {
    const golden = makeVenue({ spaces: [makeSpace("the-pavilion", "The Pavilion")], capacities: [makeCapacity({ space_id: "the-pavilion", max: 425 })], eval: { "/capacities/the-pavilion:seated_dinner": "extractor" } });
    const candidate = makeVenue({ spaces: [makeSpace("the_pavilion", "The Pavilion")], capacities: [makeCapacity({ space_id: "the_pavilion", max: 999 })], sources: CRAWLED });
    const result = scoreCapacities(candidate, golden);
    expect(result.misses).toEqual([{ path: "/capacities/the-pavilion:seated_dinner", golden: 425, candidate: 999, note: "max differs" }]);
  });

  it("a spine miss reports both sides' resolved values", () => {
    const golden = makeVenue({ spine: spineWith({ catering: fact("open") }), eval: { "/spine/catering": "extractor" } });
    const candidate = makeVenue({ spine: spineWith({ catering: fact("exclusive_in_house") }), sources: CRAWLED });
    const result = scoreSpineTiers(candidate, golden);
    expect(result.critical.misses).toEqual([{ path: "/spine/catering", golden: "open", candidate: "exclusive_in_house", note: "value mismatch" }]);
  });
});

// ---------------------------------------------------------------------------
// Crawled-set URL matching normalizes like the validator (tick c3, LondonHouse evidence): scheme,
// `www.`, and a trailing slash must not decide whether a golden fact is in scope.
// ---------------------------------------------------------------------------

describe("crawled-set URL matching normalizes scheme/www/trailing-slash like the validator", () => {
  it("a trailing-slash-only difference between the golden's source_url and the crawled page still counts as crawled", () => {
    const golden = makeVenue({
      spine: spineWith({ catering: fact("open", "quote", "https://example.com/weddings") }),
      eval: { "/spine/catering": "extractor" },
    });
    const candidate = makeVenue({
      spine: spineWith({ catering: fact("open") }),
      sources: { snapshot_ids: [], pages: ["https://example.com/weddings/"], crawled_at: null },
    });
    const result = scoreSpineTiers(candidate, golden);
    expect(result.critical.total).toBe(1);
    expect(result.critical.matches).toBe(1);
  });

  it("http vs https and www vs no-www also count as the same crawled page", () => {
    const golden = makeVenue({
      spine: spineWith({ catering: fact("open", "quote", "http://www.example.com/weddings") }),
      eval: { "/spine/catering": "extractor" },
    });
    const candidate = makeVenue({
      spine: spineWith({ catering: fact("open") }),
      sources: { snapshot_ids: [], pages: ["https://example.com/weddings"], crawled_at: null },
    });
    const result = scoreSpineTiers(candidate, golden);
    expect(result.critical.total).toBe(1);
    expect(result.critical.matches).toBe(1);
  });

  it("a genuinely different page still counts as not crawled (out of scope)", () => {
    const golden = makeVenue({
      spine: spineWith({ catering: fact("open", "quote", "https://example.com/weddings") }),
      eval: { "/spine/catering": "extractor" },
    });
    const candidate = makeVenue({
      spine: spineWith({ catering: fact("open") }),
      sources: { snapshot_ids: [], pages: ["https://example.com/other-page"], crawled_at: null },
    });
    const result = scoreSpineTiers(candidate, golden);
    expect(result.critical.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// scoreCostDelta maps the golden's pinned default axes (space_id/path_id) onto the CANDIDATE's own
// ids before calling estimateCost on it (tick c3 evidence: Greenhouse candidateTotal 0, Marchetti
// missing its Pavilion Saturday fee -- estimateCost keys fee lookups off these raw ids).
// ---------------------------------------------------------------------------

describe("scoreCostDelta aligns space_id/path_id onto the candidate before estimating", () => {
  it("a candidate with the same fee under a differently-slugged space id and path id yields the golden total", () => {
    const goldenFee: FixedFee = { applies_to: "space", space_id: "the-pavilion", day: "sat", season: null, amount: 6000, unit: "flat", label: "Rental", includes: [], key: "fee-a", quote: "q", source_url: "https://example.com", snapshot_id: null };
    const goldenPath: PricingPath = { id: "default", name: "Default", description: null, applies_to_spaces: "all", fixed_fees: [goldenFee], per_guest_tiers: [], minimums: [], required_staffing: null, rental_hours: null, year_surcharges: [], promotions: [], quote: "q", source_url: "https://example.com", snapshot_id: null };
    const golden = makeVenue({
      spaces: [makeSpace("the-pavilion", "The Pavilion")],
      pricing: { archetype: null, paths: [goldenPath], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [], default_axes: { space_id: "the-pavilion", path_id: "default", guests: 100 } },
    });

    const candidatePath: PricingPath = { ...goldenPath, id: "wedding_experiences", fixed_fees: [{ ...goldenFee, space_id: "the_pavilion" }] };
    const candidate = makeVenue({
      spaces: [makeSpace("the_pavilion", "The Pavilion")],
      pricing: { archetype: null, paths: [candidatePath], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] },
    });

    const result = scoreCostDelta(candidate, golden);
    expect(result.goldenTotal).toBe(6000);
    expect(result.candidateTotal).toBe(6000);
    expect(result.pctDelta).toBe(0);
    expect(result.withinGate).toBe(true);
  });
});
