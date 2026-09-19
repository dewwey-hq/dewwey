import { describe, expect, it } from "vitest";
import { GOLDEN_SLUGS, getGolden } from "../../../lib/venueDetails/golden";
import { emptyRates, fact, makeVenue } from "../../../lib/venueDetails/testHelpers";
import type { AddOn, CapacityTuple, FixedFee, InclusionItem, PerGuestTier, Resource, Space, VendorList } from "../../../lib/venueDetails/types";
import * as fmt from "./format";

function resource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: "r1",
    kind: "brochure",
    label: "Resource",
    url: "https://example.com/r.pdf",
    scope: "venue",
    embeddable: null,
    has_text_layer: null,
    checked_at: null,
    source_url: "https://example.com",
    snapshot_id: null,
    ...overrides,
  };
}

function space(overrides: Partial<Space> = {}): Space {
  return {
    id: "main",
    name: "Main Room",
    structure_label: null,
    sq_ft: null,
    sq_ft_outdoor: null,
    ceiling_ft: null,
    setting: null,
    bookable_separately: true,
    description: null,
    includes_summary: null,
    evidence: { source_url: "https://example.com", snapshot_id: 1 },
    ...overrides,
  };
}

function capacity(overrides: Partial<CapacityTuple> = {}): CapacityTuple {
  return {
    space_id: "main",
    layout: "seated_dinner",
    min: null,
    max: 100,
    as_stated_label: "Seated Dinner",
    tile: "seated",
    condition: null,
    quote: "seats 100",
    source_url: "https://example.com",
    snapshot_id: 1,
    ...overrides,
  };
}

function fixedFee(overrides: Partial<FixedFee> = {}): FixedFee {
  return {
    applies_to: "space",
    space_id: "main",
    day: "sat",
    season: null,
    amount: 5000,
    unit: "flat",
    label: "Saturday rental",
    includes: [],
    key: "sat-rental",
    quote: "5000",
    source_url: "https://example.com",
    snapshot_id: 1,
    ...overrides,
  };
}

function addOn(overrides: Partial<AddOn> = {}): AddOn {
  return {
    id: "parking",
    name: "Additional Parking",
    category: "Parking",
    variant: null,
    group: "other",
    price: 150,
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
    quote: "150",
    source_url: "https://example.com",
    snapshot_id: 1,
    ...overrides,
  };
}

function inclusion(overrides: Partial<InclusionItem> = {}): InclusionItem {
  return {
    label: "Parking",
    label_raw: "Free parking",
    detail: null,
    category: "Space",
    quote: "free parking",
    source_url: "https://example.com",
    snapshot_id: 1,
    ...overrides,
  };
}

function tier(overrides: Partial<PerGuestTier> = {}): PerGuestTier {
  return {
    id: "t1",
    name: "Tier",
    per_guest: 100,
    day: "sat",
    season: "peak",
    inherits_from: null,
    inclusions: [],
    bar_tier: null,
    min_guests: null,
    quote: "q",
    source_url: "https://example.com",
    snapshot_id: 1,
    ...overrides,
  };
}

describe("money", () => {
  it("formats with a dollar sign and thousands separators", () => {
    expect(fmt.money(1234)).toBe("$1,234");
    expect(fmt.money(0)).toBe("$0");
  });

  it("keeps up to 2 fraction digits", () => {
    expect(fmt.money(12742.5)).toBe("$12,742.5");
  });
});

describe("moneyRange", () => {
  it("collapses to one value when equal", () => {
    expect(fmt.moneyRange(100, 100)).toBe("$100");
  });
  it("renders an en-dash range otherwise", () => {
    expect(fmt.moneyRange(100, 200)).toBe("$100–$200");
  });
});

describe("sqFtLabel", () => {
  it("joins sq ft and structure label", () => {
    expect(fmt.sqFtLabel(3000, "Tented ballroom")).toBe("3,000 sq ft · Tented ballroom");
  });
  it("handles either half missing", () => {
    expect(fmt.sqFtLabel(3000, null)).toBe("3,000 sq ft");
    expect(fmt.sqFtLabel(null, "Tented")).toBe("Tented");
    expect(fmt.sqFtLabel(null, null)).toBe("");
  });
});

describe("feeRentalLabel", () => {
  it("derives '{Day} rental' from the fee's day", () => {
    expect(fmt.feeRentalLabel(fixedFee({ day: "sat" }))).toBe("Saturday rental");
    expect(fmt.feeRentalLabel(fixedFee({ day: "fri" }))).toBe("Friday rental");
  });
  it("falls back to the fee's own label when day-less", () => {
    expect(fmt.feeRentalLabel(fixedFee({ day: null, label: "Ceremony fee" }))).toBe("Ceremony fee");
  });
});

describe("spaceCapacityTiles", () => {
  it("always returns exactly 3 tiles, in seated/seated_dance/cocktail order", () => {
    const d = makeVenue({ capacities: [capacity({ tile: "seated", max: 120 })] });
    const tiles = fmt.spaceCapacityTiles(d, "main");
    expect(tiles.map((t) => t.tile)).toEqual(["seated", "seated_dance", "cocktail"]);
  });

  it("greys out an unstated tile as null, not zero", () => {
    const d = makeVenue({ capacities: [capacity({ tile: "seated", max: 120 })] });
    const tiles = fmt.spaceCapacityTiles(d, "main");
    const dance = tiles.find((t) => t.tile === "seated_dance")!;
    expect(dance.max).toBeNull();
    expect(dance.as_stated_label).toBeNull();
  });

  it("picks the max value when two tuples share a tile for the same space", () => {
    const d = makeVenue({
      capacities: [capacity({ tile: "cocktail", max: 150 }), capacity({ tile: "cocktail", max: 200, as_stated_label: "Standing" })],
    });
    const tiles = fmt.spaceCapacityTiles(d, "main");
    const cocktail = tiles.find((t) => t.tile === "cocktail")!;
    expect(cocktail.max).toBe(200);
    expect(cocktail.as_stated_label).toBe("Standing");
  });

  it("only looks at the given space's own capacities", () => {
    const d = makeVenue({
      capacities: [capacity({ space_id: "main", tile: "seated", max: 100 }), capacity({ space_id: "other", tile: "seated", max: 999 })],
    });
    const tiles = fmt.spaceCapacityTiles(d, "main");
    expect(tiles.find((t) => t.tile === "seated")!.max).toBe(100);
  });
});

describe("pathSpaceFixedFees / pathWholeVenueFixedFees", () => {
  it("filters to the given space's own space-scoped fees", () => {
    const path = {
      id: "p1",
      name: "Path",
      description: null,
      applies_to_spaces: "all" as const,
      fixed_fees: [fixedFee({ space_id: "main" }), fixedFee({ space_id: "other", key: "other-fee" }), fixedFee({ applies_to: "whole_venue", space_id: null, key: "whole" })],
      per_guest_tiers: [],
      minimums: [],
      required_staffing: null,
      rental_hours: null,
      year_surcharges: [],
      promotions: [],
      quote: "q",
      source_url: "https://example.com",
      snapshot_id: 1,
    };
    expect(fmt.pathSpaceFixedFees(path, "main").map((f) => f.key)).toEqual(["sat-rental"]);
    expect(fmt.pathWholeVenueFixedFees(path).map((f) => f.key)).toEqual(["whole"]);
  });

  it("returns [] when there is no path", () => {
    expect(fmt.pathSpaceFixedFees(undefined, "main")).toEqual([]);
    expect(fmt.pathWholeVenueFixedFees(undefined)).toEqual([]);
  });
});

describe("buildPriceGrid (fixedFeeGrid)", () => {
  it("pivots season x day, leaving unmatched cells null", () => {
    const fees = [fixedFee({ day: "fri", season: "peak", amount: 4000 }), fixedFee({ day: "sat", season: "peak", amount: 6000 })];
    const grid = fmt.fixedFeeGrid(fees);
    expect(grid.seasons).toEqual(["peak"]);
    expect(grid.days).toEqual(["sat", "fri"]); // sat leads (affirmative/default-first order)
    expect(grid.grid).toEqual([[6000, 4000]]);
  });

  it("orders peak season before off-season", () => {
    const grid = fmt.fixedFeeGrid([fixedFee({ season: "off", day: "sat" }), fixedFee({ season: "peak", day: "sat" })]);
    expect(grid.seasons).toEqual(["peak", "off"]);
  });
});

describe("perGuestTierGrid", () => {
  it("pivots per-guest amounts the same way as fixed fees", () => {
    const grid = fmt.perGuestTierGrid([tier({ day: "sat", per_guest: 150 }), tier({ day: "fri", per_guest: 120 })]);
    expect(grid.days).toEqual(["sat", "fri"]);
    expect(grid.grid[0]).toEqual([150, 120]);
  });
});

describe("pathDayOptions / pathSeasonOptions / pathTierOptions", () => {
  const path = {
    id: "p1",
    name: "Path",
    description: null,
    applies_to_spaces: "all" as const,
    fixed_fees: [fixedFee({ day: "sat", season: "peak" }), fixedFee({ day: "fri", season: "off", key: "f2" })],
    per_guest_tiers: [
      { id: "argento", name: "Argento", per_guest: 100, day: null, season: null, inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "q", source_url: "https://example.com", snapshot_id: 1 },
      { id: "oro", name: "Oro", per_guest: 130, day: null, season: null, inherits_from: "Argento", inclusions: [], bar_tier: null, min_guests: null, quote: "q", source_url: "https://example.com", snapshot_id: 1 },
    ],
    minimums: [],
    required_staffing: null,
    rental_hours: null,
    year_surcharges: [],
    promotions: [],
    quote: "q",
    source_url: "https://example.com",
    snapshot_id: 1,
  };

  it("orders days affirmative/default-first (Saturday before Friday)", () => {
    expect(fmt.pathDayOptions(path).map((o) => o.value)).toEqual(["sat", "fri"]);
  });

  it("orders seasons peak-first", () => {
    expect(fmt.pathSeasonOptions(path).map((o) => o.value)).toEqual(["peak", "off"]);
  });

  it("dedupes tiers by id, preserving first-seen order", () => {
    expect(fmt.pathTierOptions(path)).toEqual([
      { value: "argento", label: "Argento" },
      { value: "oro", label: "Oro" },
    ]);
  });
});

describe("guestRangeReminder", () => {
  it("renders a min-max range for seated capacity", () => {
    expect(fmt.guestRangeReminder({ min: 60, max: 190, max_measures: "seated" })).toBe("60–190 seated");
  });
  it("renders 'Up to N' when there is no min", () => {
    expect(fmt.guestRangeReminder({ min: null, max: 200, max_measures: "guests" })).toBe("Up to 200 guests");
  });
  it("renders nothing when there's no headline at all", () => {
    expect(fmt.guestRangeReminder({ min: null, max: null, max_measures: "seated" })).toBe("");
  });
});

describe("addOnPriceString", () => {
  it("prefers the venue's own as_stated_price wording", () => {
    expect(fmt.addOnPriceString(addOn({ as_stated_price: "Starting at $500" }))).toBe("Starting at $500");
  });
  it("says 'No published rate' for a real add-on with no number, not 'Not published'", () => {
    expect(fmt.addOnPriceString(addOn({ price: null }))).toBe("No published rate");
  });
  it("appends the unit suffix", () => {
    expect(fmt.addOnPriceString(addOn({ price: 25, unit: "per_guest" }))).toBe("$25 /guest");
    expect(fmt.addOnPriceString(addOn({ price: 25, unit: "per_unit" }))).toBe("$25 /unit");
  });
  it("shows a range when price_max differs", () => {
    expect(fmt.addOnPriceString(addOn({ price: 1400, price_max: 4400, unit: "flat" }))).toBe("$1,400–$4,400");
  });
});

describe("buildAddOnTable", () => {
  it("uses per_space_prices as columns when present", () => {
    const spaces = [space({ id: "s1", name: "La Pergola" }), space({ id: "s2", name: "The Pavilion" })];
    const addOns = [addOn({ id: "a1", category: "Dance floor", variant: "White", per_space_prices: { s1: 1000, s2: 1200 } })];
    const table = fmt.buildAddOnTable(addOns, spaces);
    expect(table.columnLabels).toEqual(["La Pergola", "The Pavilion"]);
    expect(table.rows[0].variants[0].prices).toEqual(["$1,000", "$1,200"]);
  });

  it("falls back to a single Price column with no per-space variation", () => {
    const table = fmt.buildAddOnTable([addOn({ price: 150 })], []);
    expect(table.columnLabels).toEqual(["Price"]);
    expect(table.rows[0].variants[0].prices).toEqual(["$150"]);
  });

  it("groups multiple variants under one category row", () => {
    const addOns = [addOn({ id: "a1", category: "Chairs", variant: "7 swags" }), addOn({ id: "a2", category: "Chairs", variant: "13 swags", price: 300 })];
    const table = fmt.buildAddOnTable(addOns, []);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].variants.map((v) => v.name)).toEqual(["7 swags", "13 swags"]);
  });

  it("names a ceremony add-on's option label after its condition, not 'Flat rate' (Marchetti's On-site ceremony fix)", () => {
    const spaces = [space({ id: "the-pavilion", name: "The Pavilion" }), space({ id: "la-pergola", name: "La Pergola" })];
    const ceremonyAddOn = addOn({
      id: "ceremony-onsite",
      name: "On-site ceremony",
      category: "Ceremony fee",
      variant: null,
      group: "ceremony",
      condition: "ceremony_on_site",
      per_space_prices: { "the-pavilion": 2000, "la-pergola": 1000 },
    });
    const table = fmt.buildAddOnTable([ceremonyAddOn], spaces);
    expect(table.rows[0].variants[0].name).toBe("On-site ceremony");
    expect(table.rows[0].variants[0].name).not.toBe("Flat rate");
  });

  it("still falls back to 'Flat rate' for a genuinely unconditional add-on with no variant", () => {
    const table = fmt.buildAddOnTable([addOn({ variant: null, group: "other", condition: null })], []);
    expect(table.rows[0].variants[0].name).toBe("Flat rate");
  });
});

describe("fbPillLabel / fbSharedRow", () => {
  it("labels the three additive pills", () => {
    expect(fmt.fbPillLabel("byo")).toBe("Bring Your Own (BYO)");
    expect(fmt.fbPillLabel("a_la_carte")).toBe("À la carte");
    expect(fmt.fbPillLabel("all_inclusive")).toBe("All-Inclusive");
  });

  it("shares one row when food and bar match and there's no caption", () => {
    expect(fmt.fbSharedRow(["all_inclusive"], ["all_inclusive"], false)).toBe(true);
  });

  it("splits into Food/Bar sub-rows when pills differ", () => {
    expect(fmt.fbSharedRow(["all_inclusive"], ["byo"], false)).toBe(false);
  });

  it("splits when a caption exists even if pills match", () => {
    expect(fmt.fbSharedRow(["all_inclusive"], ["all_inclusive"], true)).toBe(false);
  });

  it("ignores pill order when comparing sets", () => {
    expect(fmt.fbSharedRow(["byo", "a_la_carte"], ["a_la_carte", "byo"], false)).toBe(true);
  });
});

describe("fbLayout", () => {
  function resource(overrides: Partial<{ kind: "catering_guidelines" | "bar_menu" }> = {}) {
    return {
      id: "r1",
      kind: "catering_guidelines" as const,
      label: "Guidelines",
      url: "https://example.com/guidelines.pdf",
      scope: "venue" as const,
      embeddable: null,
      has_text_layer: null,
      checked_at: null,
      source_url: "https://example.com",
      snapshot_id: 1,
      ...overrides,
    };
  }

  it("is 'split' when the pill sets genuinely differ", () => {
    const d = makeVenue({
      food_beverage: {
        food_pills: [fact("byo", "q", "https://example.com", 1)],
        bar_pills: [fact("all_inclusive", "q", "https://example.com", 1)],
        caption: null,
        menus: [],
        bar_ladders: [],
        bar_min_guests: null,
        notes: [],
      },
    });
    expect(fmt.fbLayout(d)).toBe("split");
  });

  it("is 'split' for Greenhouse Loft's shape: identical BYO/BYO pills, but a catering_guidelines resource", () => {
    const d = makeVenue({
      food_beverage: {
        food_pills: [fact("byo", "q", "https://example.com", 1)],
        bar_pills: [fact("byo", "q", "https://example.com", 1)],
        caption: null,
        menus: [],
        bar_ladders: [],
        bar_min_guests: null,
        notes: [fact("LEED Platinum certified building: mandatory recycling + composting at every event.", "q", "https://example.com", 1)],
      },
      resources: [resource({ kind: "catering_guidelines" })],
    });
    expect(fmt.fbLayout(d)).toBe("split");
  });

  it("is 'shared' for Marchetti's shape: identical All-Inclusive pills, no caption, no side resource — a bare note isn't enough on its own", () => {
    const d = makeVenue({
      food_beverage: {
        food_pills: [fact("all_inclusive", "q", "https://example.com", 1)],
        bar_pills: [fact("all_inclusive", "q", "https://example.com", 1)],
        caption: null,
        menus: [],
        bar_ladders: [],
        bar_min_guests: null,
        notes: [fact("Villa, Tenuta, and Riserva Bar Collections build on each other.", "q", "https://example.com", 1)],
      },
    });
    expect(fmt.fbLayout(d)).toBe("shared");
  });

  it("is 'split' for LondonHouse's shape: identical All-Inclusive pills, but a corkage caption", () => {
    const d = makeVenue({
      food_beverage: {
        food_pills: [fact("all_inclusive", "q", "https://example.com", 1)],
        bar_pills: [fact("all_inclusive", "q", "https://example.com", 1)],
        caption: fact("You can bring your own wine or liquor for a $50/bottle corkage fee.", "q", "https://example.com", 1),
        menus: [],
        bar_ladders: [],
        bar_min_guests: null,
        notes: [],
      },
    });
    expect(fmt.fbLayout(d)).toBe("split");
  });
});

describe("fbNoteSide", () => {
  it("attributes a catering/composting note to food", () => {
    expect(fmt.fbNoteSide("LEED Platinum certified building: mandatory recycling + composting, caterer load-in via a freight entrance.")).toBe("food");
  });

  it("attributes a bar/corkage note to bar", () => {
    expect(fmt.fbNoteSide("You can bring your own wine or liquor for a $50/bottle corkage fee.")).toBe("bar");
  });

  it("returns null when a note matches neither side", () => {
    expect(fmt.fbNoteSide("Ask about our seasonal promotions.")).toBeNull();
  });
});

describe("groupInclusions", () => {
  it("stays flat (null) at 7 or fewer items", () => {
    const items = Array.from({ length: 7 }, (_, i) => inclusion({ label_raw: `item ${i}`, category: "Space" }));
    expect(fmt.groupInclusions(items)).toBeNull();
  });

  it("groups by category once past 7 items", () => {
    const items = Array.from({ length: 8 }, (_, i) => inclusion({ label_raw: `item ${i}`, category: i < 4 ? "Space" : "Furniture" }));
    const groups = fmt.groupInclusions(items);
    expect(groups).not.toBeNull();
    expect(groups!.map((g) => g.category)).toEqual(["Space", "Furniture"]);
    expect(groups!.find((g) => g.category === "Space")!.items).toHaveLength(4);
  });
});

describe("section visibility predicates", () => {
  it("showPricingSection requires 2+ paths", () => {
    const onePath = { id: "p", name: "P", description: null, applies_to_spaces: "all" as const, fixed_fees: [], per_guest_tiers: [], minimums: [], required_staffing: null, rental_hours: null, year_surcharges: [], promotions: [], quote: "q", source_url: "https://example.com", snapshot_id: 1 };
    const zero = makeVenue();
    const one = makeVenue({ pricing: { archetype: null, paths: [onePath], rates: zero.pricing.rates, add_ons: [], required_third_party: [], notes: [] } });
    const two = makeVenue({ pricing: { archetype: null, paths: [onePath, { ...onePath, id: "p2" }], rates: zero.pricing.rates, add_ons: [], required_third_party: [], notes: [] } });
    expect(fmt.showPricingSection(zero)).toBe(false);
    expect(fmt.showPricingSection(one)).toBe(false);
    expect(fmt.showPricingSection(two)).toBe(true);
  });

  it("showInclusions / showAddOns / showPressFeatures are simple non-empty checks", () => {
    expect(fmt.showInclusions(makeVenue({ inclusions: [inclusion()] }))).toBe(true);
    expect(fmt.showInclusions(makeVenue())).toBe(false);
    expect(fmt.showAddOns(makeVenue({ pricing: { ...makeVenue().pricing, add_ons: [addOn()] } }))).toBe(true);
    expect(fmt.showPressFeatures(makeVenue({ press_features: [{ title: "T", attribution: "A", url: "https://example.com", source_url: "https://example.com", snapshot_id: 1 }] }))).toBe(true);
  });

  it("visibleVendorLists / showVendorLists require >= 2 entries", () => {
    const list = (entries: number): VendorList => ({
      label: "Photographers",
      category: "Photography",
      relationship: "preferred",
      entries: Array.from({ length: entries }, (_, i) => ({ name: `Vendor ${i}`, url: null, instagram: null })),
      source_url: "https://example.com",
      snapshot_id: 1,
    });
    expect(fmt.showVendorLists(makeVenue({ vendor_lists: [list(1)] }))).toBe(false);
    expect(fmt.showVendorLists(makeVenue({ vendor_lists: [list(2)] }))).toBe(true);
    expect(fmt.visibleVendorLists(makeVenue({ vendor_lists: [list(1), list(2)] }))).toHaveLength(1);
  });

  it("differentiatorColor is emerald only for sustainability", () => {
    expect(fmt.differentiatorColor("Sustainability")).toBe("emerald");
    expect(fmt.differentiatorColor("A converted industrial loft")).toBe("rose");
  });
});

describe("policyEvidence", () => {
  it("returns none for not_stated", () => {
    const d = makeVenue();
    expect(fmt.policyEvidence(d, "catering")).toEqual({ kind: "none" });
  });

  it("returns the fact for a stated value", () => {
    const d = makeVenue({ spine: { ...makeVenue().spine, catering: fact("open", "any caterer welcome", "https://example.com/faq", 5) } });
    expect(fmt.policyEvidence(d, "catering")).toEqual({ kind: "stated", fact: { quote: "any caterer welcome", source_url: "https://example.com/faq", snapshot_id: 5 } });
  });

  it("returns every candidate for conflicting", () => {
    const d = makeVenue({
      spine: {
        ...makeVenue().spine,
        bar: { status: "conflicting", candidates: [fact("in_house", "bar is in-house", "https://a", 1), fact("byob", "BYOB allowed", "https://b", 2)] },
      },
    });
    const ev = fmt.policyEvidence(d, "bar");
    expect(ev.kind).toBe("conflicting");
    if (ev.kind === "conflicting") {
      expect(ev.candidates).toEqual([
        { quote: "bar is in-house", source_url: "https://a", snapshot_id: 1 },
        { quote: "BYOB allowed", source_url: "https://b", snapshot_id: 2 },
      ]);
    }
  });
});

describe("siteDomain", () => {
  it("strips protocol and www", () => {
    expect(fmt.siteDomain("https://www.galleriamarchetti.com/weddings")).toBe("galleriamarchetti.com");
  });
  it("returns null for no website", () => {
    expect(fmt.siteDomain(null)).toBeNull();
  });
  it("falls back to the raw string on a malformed URL", () => {
    expect(fmt.siteDomain("not-a-url")).toBe("not-a-url");
  });
});

// ---------------------------------------------------------------------------
// Fix round (2026-09-13 review)
// ---------------------------------------------------------------------------

describe("spaceSizeLine", () => {
  it("shows indoor/outdoor split when sq_ft_outdoor is stated", () => {
    expect(fmt.spaceSizeLine(3600, 3500, null)).toBe("3,600 sq ft indoor · 3,500 sq ft outdoor");
  });
  it("appends the structure label after the indoor/outdoor split", () => {
    expect(fmt.spaceSizeLine(3600, 3500, "Tented")).toBe("3,600 sq ft indoor · 3,500 sq ft outdoor · Tented");
  });
  it("falls back to the plain sq-ft line when there's no outdoor figure", () => {
    expect(fmt.spaceSizeLine(3000, null, "Glass-enclosed")).toBe("3,000 sq ft · Glass-enclosed");
  });
  it("returns null (omit the line) when sq_ft itself isn't stated, never a placeholder", () => {
    expect(fmt.spaceSizeLine(null, null, null)).toBeNull();
    expect(fmt.spaceSizeLine(null, 3500, "Tented")).toBeNull();
  });
});

describe("anySpaceHasScopedFees", () => {
  const path = {
    id: "p1",
    name: "Path",
    description: null,
    applies_to_spaces: "all" as const,
    fixed_fees: [fixedFee({ space_id: "main", applies_to: "space" })],
    per_guest_tiers: [],
    minimums: [],
    required_staffing: null,
    rental_hours: null,
    year_surcharges: [],
    promotions: [],
    quote: "q",
    source_url: "https://example.com",
    snapshot_id: 1,
  };
  it("is true when at least one space has its own space-scoped fee", () => {
    expect(fmt.anySpaceHasScopedFees([space({ id: "main" })], path)).toBe(true);
  });
  it("is false when no space has a space-scoped fee (Greenhouse's one whole-venue rental)", () => {
    expect(fmt.anySpaceHasScopedFees([space({ id: "other" })], path)).toBe(false);
    expect(fmt.anySpaceHasScopedFees([space({ id: "main" })], undefined)).toBe(false);
  });
});

describe("groupWholeVenueFees", () => {
  it("groups by season instead of printing flat undifferentiated entries", () => {
    const fees = [
      fixedFee({ key: "off-fri", day: "fri", season: "off", amount: 4000 }),
      fixedFee({ key: "off-sat", day: "sat", season: "off", amount: 5000 }),
      fixedFee({ key: "peak-fri", day: "fri", season: "peak", amount: 5000 }),
      fixedFee({ key: "peak-sat", day: "sat", season: "peak", amount: 6000 }),
    ];
    const groups = fmt.groupWholeVenueFees(fees);
    expect(groups.map((g) => g.season)).toEqual(["peak", "off"]); // peak-first
    // Fri -> Sat -> Sun within a season for this line specifically (not the affirmative/
    // Saturday-first order used by pathDayOptions/buildPriceGrid elsewhere).
    expect(groups[0].parts.map((p) => p.label)).toEqual(["Friday rental", "Saturday rental"]);
  });

  it("returns one ungrouped season for a venue with only one real season", () => {
    const fees = [fixedFee({ key: "a", day: "fri", season: null }), fixedFee({ key: "b", day: "sat", season: null })];
    const groups = fmt.groupWholeVenueFees(fees);
    expect(groups).toHaveLength(1);
    expect(groups[0].season).toBe("any");
  });
});

describe("formatWholeVenueFees", () => {
  it("orders days Fri -> Sat -> Sun when there's no season split", () => {
    const fees = [
      fixedFee({ key: "sun", day: "sun", season: null, amount: 4000 }),
      fixedFee({ key: "sat", day: "sat", season: null, amount: 5000 }),
      fixedFee({ key: "fri", day: "fri", season: null, amount: 4500 }),
    ];
    expect(fmt.formatWholeVenueFees(fees)).toBe("Fri $4,500 · Sat $5,000 · Sun $4,000");
  });

  it("groups by season with short Peak/Off-season prefixes when seasons differ", () => {
    const fees = [
      fixedFee({ key: "peak-fri", day: "fri", season: "peak", amount: 5000 }),
      fixedFee({ key: "peak-sat", day: "sat", season: "peak", amount: 6000 }),
      fixedFee({ key: "off-fri", day: "fri", season: "off", amount: 4000 }),
      fixedFee({ key: "off-sat", day: "sat", season: "off", amount: 5000 }),
    ];
    expect(fmt.formatWholeVenueFees(fees)).toBe("Peak: Fri $5,000 · Sat $6,000 / Off-season: Fri $4,000 · Sat $5,000");
  });
});

describe("collapseTiersByName / tierPriceLabel", () => {
  it("collapses same-named tiers that only differ by day/season into one, with a min-max range", () => {
    const tiers = [
      tier({ id: "t1", name: "All-Inclusive", day: "fri", season: "off", per_guest: 68.95 }),
      tier({ id: "t2", name: "All-Inclusive", day: "sat", season: "off", per_guest: 74.95 }),
      tier({ id: "t3", name: "All-Inclusive", day: "fri", season: "peak", per_guest: 78.95 }),
      tier({ id: "t4", name: "All-Inclusive", day: "sat", season: "peak", per_guest: 84.95 }),
    ];
    const collapsed = fmt.collapseTiersByName(tiers);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].minPerGuest).toBe(68.95);
    expect(collapsed[0].maxPerGuest).toBe(84.95);
    expect(collapsed[0].representative.id).toBe("t1");
  });

  it("keeps distinctly-named tiers separate, in first-seen order", () => {
    const tiers = [tier({ id: "a", name: "Argento", per_guest: 100 }), tier({ id: "b", name: "Oro", per_guest: 130 })];
    const collapsed = fmt.collapseTiersByName(tiers);
    expect(collapsed.map((t) => t.name)).toEqual(["Argento", "Oro"]);
  });

  it("tierPriceLabel shows one price when min equals max, a range otherwise", () => {
    expect(fmt.tierPriceLabel(100, 100)).toBe("$100 /guest");
    expect(fmt.tierPriceLabel(68.95, 84.95)).toBe("from $68.95 to $84.95 /guest");
  });
});

describe("fbRateSentence", () => {
  it("never prints 'Plus 0% service charge' — says 'No service charge' instead", () => {
    const sentence = fmt.fbRateSentence(emptyRates({ service_charge_pct: 0, sales_tax_pct: 10, sales_tax_source: "stated" }));
    expect(sentence).toBe("No service charge, plus 10% sales tax.");
    expect(sentence).not.toMatch(/0% service charge/);
  });

  it("omits the sentence entirely when service charge is 0 and taxes are included", () => {
    expect(fmt.fbRateSentence(emptyRates({ service_charge_pct: 0, sales_tax_source: "included" }))).toBeNull();
  });

  it("says 'No service charge.' alone when there's nothing else to add", () => {
    expect(fmt.fbRateSentence(emptyRates({ service_charge_pct: 0, sales_tax_source: "unknown" }))).toBe("No service charge.");
  });

  it("keeps the normal 'Plus X%, plus Y%' sentence for a real nonzero service charge", () => {
    expect(fmt.fbRateSentence(emptyRates({ service_charge_pct: 22, sales_tax_pct: 11.75, sales_tax_source: "chicago_default" }))).toBe(
      "Plus 22% service charge on food & beverage, plus 11.75% sales tax (assumed).",
    );
  });

  it("returns null when there's nothing at all to say", () => {
    expect(fmt.fbRateSentence(emptyRates())).toBeNull();
  });
});

describe("shouldCollapseResourceButtons / shouldCollapseFloorPlans", () => {
  it("collapses a section heading's resource buttons past 3", () => {
    expect(fmt.shouldCollapseResourceButtons(3)).toBe(false);
    expect(fmt.shouldCollapseResourceButtons(4)).toBe(true);
  });
  it("collapses a space card's floor plan buttons past 1 (stricter — a much smaller layout)", () => {
    expect(fmt.shouldCollapseFloorPlans(1)).toBe(false);
    expect(fmt.shouldCollapseFloorPlans(2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fix round (2026-09-18 user review of the goldens)
// ---------------------------------------------------------------------------

describe("spaceSizeLine with sqFtLabelRaw (Field Museum's string-stated sizes)", () => {
  it("shows the venue's own wording verbatim instead of the reduced-to-one-number version", () => {
    expect(fmt.spaceSizeLine(11376, null, null, "11,376–35,997")).toBe("11,376–35,997 sq ft");
  });
  it("still appends the structure label after the verbatim wording", () => {
    expect(fmt.spaceSizeLine(21000, null, "Main floor", "~21,000")).toBe("~21,000 sq ft · Main floor");
  });
  it("falls back to the formatted number when no label is given (every other golden venue)", () => {
    expect(fmt.spaceSizeLine(3000, null, null)).toBe("3,000 sq ft");
  });
  it("prefers the label over the plain number even in the indoor/outdoor split", () => {
    expect(fmt.spaceSizeLine(21000, 500, null, "~21,000 (main floor)")).toBe("~21,000 (main floor) sq ft · 500 sq ft outdoor");
  });
});

describe("ceilingLine", () => {
  it("shows the venue's own wording verbatim when given", () => {
    expect(fmt.ceilingLine(8, "8–14 ft (highest in the East Atrium)")).toBe("Ceiling height: 8–14 ft (highest in the East Atrium)");
  });
  it("falls back to the formatted number when no label is given", () => {
    expect(fmt.ceilingLine(76, null)).toBe("Ceiling height: 76 ft");
    expect(fmt.ceilingLine(22)).toBe("Ceiling height: 22 ft");
  });
  it("returns null (omit the line) when neither is stated", () => {
    expect(fmt.ceilingLine(null, null)).toBeNull();
    expect(fmt.ceilingLine(null)).toBeNull();
  });
});

describe("placeResources", () => {
  it("routes a brochure to About regardless of scope", () => {
    const d = makeVenue({ resources: [resource({ id: "b1", kind: "brochure" })] });
    const placed = fmt.placeResources(d);
    expect(placed.about.map((r) => r.id)).toEqual(["b1"]);
    expect(placed.unplaced).toEqual([]);
  });

  it("routes venue-scoped floor_plan/capacity_sheet/virtual_tour/video/gallery to the Spaces heading", () => {
    const d = makeVenue({
      resources: [
        resource({ id: "fp", kind: "floor_plan", scope: "venue" }),
        resource({ id: "cs", kind: "capacity_sheet", scope: "venue" }),
        resource({ id: "vt", kind: "virtual_tour", scope: "venue" }),
        resource({ id: "v", kind: "video", scope: "venue" }),
        resource({ id: "g", kind: "gallery", scope: "venue" }),
      ],
    });
    const placed = fmt.placeResources(d);
    expect(placed.spacesHeading.map((r) => r.id).sort()).toEqual(["cs", "fp", "g", "v", "vt"]);
    expect(placed.unplaced).toEqual([]);
  });

  it("routes the same kinds, space-scoped, to that space's own bucket — except capacity_sheet, which stays venue-level", () => {
    const d = makeVenue({
      resources: [
        resource({ id: "fp", kind: "floor_plan", scope: "space:main" }),
        resource({ id: "vt", kind: "virtual_tour", scope: "space:main" }),
        resource({ id: "cs", kind: "capacity_sheet", scope: "space:main" }),
      ],
    });
    const placed = fmt.placeResources(d);
    expect(placed.perSpace.main.map((r) => r.id).sort()).toEqual(["fp", "vt"]);
    // A space-scoped capacity_sheet has nowhere to go in the routing table (capacity sheets are
    // always venue-level) — surfaced via `unplaced`, not silently dropped.
    expect(placed.unplaced.map((r) => r.id)).toEqual(["cs"]);
  });

  it("splits menu/bar_menu/catering_guidelines by side when the F&B layout is split", () => {
    const d = makeVenue({
      food_beverage: { food_pills: [fact("byo")], bar_pills: [fact("byo")], caption: null, menus: [], bar_ladders: [], bar_min_guests: null, notes: [] },
      resources: [resource({ id: "cg", kind: "catering_guidelines" }), resource({ id: "bm", kind: "bar_menu" })],
    });
    const placed = fmt.placeResources(d);
    expect(placed.food.map((r) => r.id)).toEqual(["cg"]);
    expect(placed.bar.map((r) => r.id)).toEqual(["bm"]);
    expect(placed.fbShared).toEqual([]);
  });

  it("collects menu/bar_menu into one shared row when the F&B layout is shared", () => {
    const d = makeVenue({
      food_beverage: { food_pills: [fact("all_inclusive")], bar_pills: [fact("all_inclusive")], caption: null, menus: [], bar_ladders: [], bar_min_guests: null, notes: [] },
      resources: [resource({ id: "m", kind: "menu" })],
    });
    const placed = fmt.placeResources(d);
    expect(placed.fbShared.map((r) => r.id)).toEqual(["m"]);
    expect(placed.food).toEqual([]);
  });

  it("routes contract to Policies, other to Add-ons, vendor_list to Vendors", () => {
    const d = makeVenue({
      resources: [resource({ id: "c", kind: "contract" }), resource({ id: "o", kind: "other" }), resource({ id: "vl", kind: "vendor_list" })],
    });
    const placed = fmt.placeResources(d);
    expect(placed.policies.map((r) => r.id)).toEqual(["c"]);
    expect(placed.addOns.map((r) => r.id)).toEqual(["o"]);
    expect(placed.vendors.map((r) => r.id)).toEqual(["vl"]);
    expect(placed.unplaced).toEqual([]);
  });

  it("invariant: every resource in all six golden fixtures is placed exactly once, unplaced is empty", () => {
    for (const slug of GOLDEN_SLUGS) {
      const d = getGolden(slug)!;
      const placed = fmt.placeResources(d);
      const allPlaced = [
        ...placed.about,
        ...placed.spacesHeading,
        ...Object.values(placed.perSpace).flat(),
        ...placed.food,
        ...placed.bar,
        ...placed.fbShared,
        ...placed.addOns,
        ...placed.policies,
        ...placed.vendors,
      ];
      const allPlacedIds = allPlaced.map((r) => r.id).sort();
      expect(placed.unplaced, `${slug}: unplaced should be empty`).toEqual([]);
      expect(new Set(allPlacedIds).size, `${slug}: no resource placed twice`).toBe(allPlacedIds.length);
      expect(allPlacedIds, `${slug}: every fixture resource is placed`).toEqual(d.resources.map((r) => r.id).sort());
    }
  });
});
