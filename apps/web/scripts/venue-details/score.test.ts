import { describe, expect, it } from "vitest";

import { getGolden } from "../../lib/venueDetails/golden";
import { criticalFieldPaths } from "../../lib/venueDetails/tiers";
import type { AddOn } from "../../lib/venueDetails/types";
import { emptyRates, fact, makeVenue, spineWith } from "../../lib/venueDetails/testHelpers";
import { scoreCapacities, scorePricingScalars, scoreSpaces, scoreSpineTiers, scoreVenue } from "./score";

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
    expect(result.critical.misses).toContain("/spine/catering");
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
    expect(missResult.misses).toContain("/pricing/seasons");

    // No eval tag on an untagged golden -> not in scope at all.
    const untaggedGolden = makeVenue({ pricing: { archetype: null, paths: [], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [], seasons: { peak: "Apr-Oct, Dec", off: null } } });
    const result = scorePricingScalars(candidateUntagged, untaggedGolden);
    expect(result.misses).not.toContain("/pricing/seasons");
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
    expect(missResult.misses).toContain("/pricing/paths/standard/includes");
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
    expect(missResult.misses).toContain("/pricing/paths/standard/terms");

    // No eval tag on an untagged golden -> not in scope at all.
    const untaggedGolden = makeVenue({ pricing: { archetype: null, paths: [{ ...samePath, terms: [term("Access"), term("Overtime")] }], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });
    const result = scorePricingScalars(candidateUntagged, untaggedGolden);
    expect(result.misses).not.toContain("/pricing/paths/standard/terms");
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
    expect(result.important_core.misses).toContain("/spine/event_insurance");

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
