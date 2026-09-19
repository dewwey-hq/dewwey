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
  it("pivots season x day, leaving unmatched cells null (round 4 rule 2: calendar day order, Fri before Sat)", () => {
    const fees = [fixedFee({ day: "fri", season: "peak", amount: 4000 }), fixedFee({ day: "sat", season: "peak", amount: 6000 })];
    const grid = fmt.fixedFeeGrid(fees);
    expect(grid.seasons).toEqual(["peak"]);
    expect(grid.days).toEqual(["fri", "sat"]);
    expect(grid.grid).toEqual([[4000, 6000]]);
  });

  it("falls back to off-season-first when the venue's own season months aren't given (round 4 rule 2)", () => {
    const grid = fmt.fixedFeeGrid([fixedFee({ season: "off", day: "sat" }), fixedFee({ season: "peak", day: "sat" })]);
    expect(grid.seasons).toEqual(["off", "peak"]);
  });

  it("orders seasons chronologically by the venue's own month definitions when given", () => {
    const fees = [fixedFee({ season: "off", day: "sat" }), fixedFee({ season: "peak", day: "sat" })];
    // Greenhouse shape: off-season is Jan-Mar (month 1), peak is Apr-Dec (month 4) -> off first.
    expect(fmt.fixedFeeGrid(fees, { peak: "Apr–Dec", off: "Jan–Mar" }).seasons).toEqual(["off", "peak"]);
    // A venue whose peak starts earlier in the year than its off-season -> peak first.
    expect(fmt.fixedFeeGrid(fees, { peak: "Jan–Jun", off: "Jul–Dec" }).seasons).toEqual(["peak", "off"]);
  });
});

describe("perGuestTierGrid", () => {
  it("pivots per-guest amounts the same way as fixed fees, calendar day order", () => {
    const grid = fmt.perGuestTierGrid([tier({ day: "sat", per_guest: 150 }), tier({ day: "fri", per_guest: 120 })]);
    expect(grid.days).toEqual(["fri", "sat"]);
    expect(grid.grid[0]).toEqual([120, 150]);
  });
});

describe("parseFirstMonth / seasonOrderFor", () => {
  it("parses the first month from a venue's own season-definition string", () => {
    expect(fmt.parseFirstMonth("Apr–Oct, Dec")).toBe(4);
    expect(fmt.parseFirstMonth("Jan, Feb, Mar, Nov")).toBe(1);
    expect(fmt.parseFirstMonth(null)).toBeNull();
    expect(fmt.parseFirstMonth("")).toBeNull();
  });

  it("falls back to off-first when months can't be parsed or aren't stated", () => {
    expect(fmt.seasonOrderFor(undefined)).toEqual(["off", "peak", "any"]);
    expect(fmt.seasonOrderFor({ peak: null, off: null })).toEqual(["off", "peak", "any"]);
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

  it("orders days calendar-first (Friday before Saturday) — round 4 rule 2", () => {
    expect(fmt.pathDayOptions(path).map((o) => o.value)).toEqual(["fri", "sat"]);
  });

  it("orders seasons off-first by default (no season months given) — round 4 rule 2", () => {
    expect(fmt.pathSeasonOptions(path).map((o) => o.value)).toEqual(["off", "peak"]);
  });

  it("orders seasons chronologically once the venue's own season months are given", () => {
    expect(fmt.pathSeasonOptions(path, { peak: "Jan–Jun", off: "Jul–Dec" }).map((o) => o.value)).toEqual(["peak", "off"]);
  });

  it("dedupes tiers by id, preserving first-seen order, each carrying its own price sublabel (round 4 rule 9)", () => {
    expect(fmt.pathTierOptions(path)).toEqual([
      { value: "argento", label: "Argento", sublabel: "$100/guest" },
      { value: "oro", label: "Oro", sublabel: "$130/guest" },
    ]);
  });
});

describe("pathPillSublabel / ceremonyFeeAmount", () => {
  it("shows a flat 'from $X' sublabel for a fixed-fee path", () => {
    const path = fixedFeePath({ fixed_fees: [fixedFee({ amount: 2100 }), fixedFee({ amount: 6595, space_id: null, applies_to: "whole_venue" })] });
    expect(fmt.pathPillSublabel(path)).toBe("from $2,100");
  });

  it("shows a per-guest 'from $X/guest' sublabel for a per-guest path", () => {
    const path = fixedFeePath({ per_guest_tiers: [tier({ per_guest: 68.95 }), tier({ per_guest: 84.95 })] });
    expect(fmt.pathPillSublabel(path)).toBe("from $68.95/guest");
  });

  it("is null when the path has nothing fixed to quote", () => {
    expect(fmt.pathPillSublabel(fixedFeePath())).toBeNull();
  });

  it("resolves the ceremony fee's amount for the chosen space", () => {
    const ceremonyAddOn = addOn({ group: "ceremony", condition: "ceremony_on_site", price: null, per_space_prices: { pavilion: 2000, "la-pergola": 1000 } });
    expect(fmt.ceremonyFeeAmount([ceremonyAddOn], "pavilion")).toBe(2000);
    expect(fmt.ceremonyFeeAmount([ceremonyAddOn], "la-pergola")).toBe(1000);
  });

  it("falls back to the flat price when there's no per-space price for the chosen space", () => {
    const ceremonyAddOn = addOn({ group: "ceremony", condition: "ceremony_on_site", price: 750 });
    expect(fmt.ceremonyFeeAmount([ceremonyAddOn], "juliette")).toBe(750);
  });

  it("is null when there's no real ceremony fee add-on", () => {
    expect(fmt.ceremonyFeeAmount([addOn({ group: "other", condition: null })], "main")).toBeNull();
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
  it("always groups, even a handful of items in a single category (round-3 fix: no flat-under-7 threshold)", () => {
    const items = Array.from({ length: 3 }, (_, i) => inclusion({ label_raw: `item ${i}`, category: "Space" }));
    const groups = fmt.groupInclusions(items);
    expect(groups.map((g) => g.category)).toEqual(["Space"]);
    expect(groups[0].items).toHaveLength(3);
  });

  it("groups by category in the pinned INCLUSION_CATEGORIES order, not first-seen order", () => {
    const items = [inclusion({ label_raw: "a", category: "Furniture" }), inclusion({ label_raw: "b", category: "Space" })];
    const groups = fmt.groupInclusions(items);
    expect(groups.map((g) => g.category)).toEqual(["Space", "Furniture"]);
    expect(groups.find((g) => g.category === "Space")!.items).toHaveLength(1);
  });
});

describe("inclusionDisplay", () => {
  it("prefers a structured detail, bold-labeled, when present", () => {
    const inc = inclusion({ label: "Parking", label_raw: "Parking", detail: "30 spaces" });
    expect(fmt.inclusionDisplay(inc)).toEqual({ boldLabel: "Parking", text: "30 spaces" });
  });

  it("round 4 rule 15: every row is Label: detail — 'Included' when label_raw is just the label itself", () => {
    const inc = inclusion({ label: "Dance floor", label_raw: "Dance floor", detail: null });
    expect(fmt.inclusionDisplay(inc)).toEqual({ boldLabel: "Dance floor", text: "Included" });
  });

  it("strips the label phrase out of label_raw and capitalizes what remains", () => {
    expect(fmt.inclusionDisplay(inclusion({ label: "Bridal suite", label_raw: "Private bridal suite", detail: null }))).toEqual({
      boldLabel: "Bridal suite",
      text: "Private",
    });
    expect(fmt.inclusionDisplay(inclusion({ label: "Chairs", label_raw: "New silver Chiavari chairs", detail: null }))).toEqual({
      boldLabel: "Chairs",
      text: "New silver Chiavari",
    });
  });

  it("keeps the full raw text as the detail when the label phrase doesn't literally occur in it", () => {
    expect(fmt.inclusionDisplay(inclusion({ label: "Accessibility", label_raw: "Handicap accessible", detail: null }))).toEqual({
      boldLabel: "Accessibility",
      text: "Handicap accessible",
    });
  });

  it("keeps the bold 'Label: raw' form (stripped) when label_raw is a genuinely separate fact", () => {
    expect(fmt.inclusionDisplay(inclusion({ label: "Parking", label_raw: "2 parking lots, 75+ spaces", detail: null }))).toEqual({
      boldLabel: "Parking",
      text: "2 lots, 75+ spaces",
    });
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

describe("pricingGridClass", () => {
  it("uses 2 columns for 2 paths", () => {
    expect(fmt.pricingGridClass(2)).toBe("grid gap-5 sm:grid-cols-2");
  });
  it("uses 3 columns for exactly 3 paths so the third card isn't orphaned onto its own row", () => {
    expect(fmt.pricingGridClass(3)).toBe("grid gap-5 sm:grid-cols-2 lg:grid-cols-3");
  });
  it("wraps 2x2 for 4 paths", () => {
    expect(fmt.pricingGridClass(4)).toBe("grid gap-5 sm:grid-cols-2");
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

describe("showSpaceRentalGrid", () => {
  it("renders when the space has no scoped fee, there are whole-venue fees, and there's no standalone Pricing section", () => {
    expect(fmt.showSpaceRentalGrid(0, 2, 1)).toBe(true);
    expect(fmt.showSpaceRentalGrid(0, 2, 0)).toBe(true);
  });
  it("is false once there's a standalone Pricing section (2+ paths) — that section already shows the same fees per path", () => {
    expect(fmt.showSpaceRentalGrid(0, 2, 2)).toBe(false);
  });
  it("is false when the space has its own scoped fee, or there are no whole-venue fees to show", () => {
    expect(fmt.showSpaceRentalGrid(1, 2, 1)).toBe(false);
    expect(fmt.showSpaceRentalGrid(0, 0, 1)).toBe(false);
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

// ---------------------------------------------------------------------------
// Round 3 (Diamond Garden) — pricing headline/grid/minimum/season, add-on category cards,
// single-select splitting, bar per-guest pricing.
// ---------------------------------------------------------------------------

function fixedFeePath(overrides: Partial<import("../../../lib/venueDetails/types").PricingPath> = {}) {
  return {
    id: "p",
    name: "P",
    description: null,
    applies_to_spaces: "all" as const,
    fixed_fees: [],
    per_guest_tiers: [],
    minimums: [],
    required_staffing: null,
    rental_hours: null,
    year_surcharges: [],
    promotions: [],
    quote: "q",
    source_url: "https://example.com",
    snapshot_id: 1,
    ...overrides,
  };
}

describe("minimumValueLabel", () => {
  it("formats a guest minimum as a headcount, not money (round-3 fix)", () => {
    expect(fmt.minimumValueLabel({ kind: "guest_minimum", day: null, season: null, amount: 150, quote: "q", source_url: "https://example.com", snapshot_id: 1 })).toBe("150 guests");
  });
  it("formats an F&B minimum as money", () => {
    expect(fmt.minimumValueLabel({ kind: "fb_minimum", day: null, season: null, amount: 3000, quote: "q", source_url: "https://example.com", snapshot_id: 1 })).toBe("$3,000");
  });
});

describe("pricingHeadlineLine", () => {
  it("shows a flat fee range for a fixed-fee path", () => {
    const path = fixedFeePath({ fixed_fees: [fixedFee({ amount: 2100 }), fixedFee({ amount: 6595, space_id: null, applies_to: "whole_venue" })] });
    expect(fmt.pricingHeadlineLine(path)).toBe("$2,100–$6,595 flat");
  });
  it("shows a /guest range for a per-guest path", () => {
    const path = fixedFeePath({ per_guest_tiers: [tier({ per_guest: 68.95 }), tier({ per_guest: 84.95 })] });
    expect(fmt.pricingHeadlineLine(path)).toBe("$68.95–$84.95 /guest");
  });
  it("returns null when there's nothing fixed to show", () => {
    expect(fmt.pricingHeadlineLine(fixedFeePath())).toBeNull();
  });
});

describe("buildMergedPriceGrid — round 4 rule 2 drops the old identical-price day-merging", () => {
  it("never merges Fri/Sun even when their price is identical — four separate calendar-order columns (Diamond Garden's shape)", () => {
    const path = fixedFeePath({
      fixed_fees: [
        fixedFee({ day: "weekday", season: "off", amount: 2100, applies_to: "whole_venue", space_id: null, key: "wk" }),
        fixedFee({ day: "fri", season: "off", amount: 3700, applies_to: "whole_venue", space_id: null, key: "fr" }),
        fixedFee({ day: "sun", season: "off", amount: 3700, applies_to: "whole_venue", space_id: null, key: "su" }),
        fixedFee({ day: "sat", season: "off", amount: 4700, applies_to: "whole_venue", space_id: null, key: "sa" }),
      ],
    });
    const grid = fmt.buildMergedPriceGrid(fmt.fixedFeeGrid(path.fixed_fees));
    expect(grid!.columns.map((c) => c.label)).toEqual(["Weekday", "Fri", "Sat", "Sun"]);
    expect(grid!.grid[0]).toEqual([2100, 3700, 4700, 3700]);
  });

  it("never merges weekday/Fri/Sun even when they share one price (Diamond Garden's All-Inclusive)", () => {
    const path = fixedFeePath({
      per_guest_tiers: [
        tier({ id: "wk", day: "weekday", season: "peak", per_guest: 76.95 }),
        tier({ id: "fr", day: "fri", season: "peak", per_guest: 76.95 }),
        tier({ id: "su", day: "sun", season: "peak", per_guest: 76.95 }),
        tier({ id: "sa", day: "sat", season: "peak", per_guest: 84.95 }),
      ],
    });
    const grid = fmt.buildMergedPriceGrid(fmt.perGuestTierGrid(path.per_guest_tiers));
    expect(grid!.columns.map((c) => c.label)).toEqual(["Weekday", "Fri", "Sat", "Sun"]);
  });

  it("returns null when there's no grid to show", () => {
    expect(fmt.buildMergedPriceGrid(fmt.fixedFeeGrid([]))).toBeNull();
  });

  it("uses calendar order (Weekday, Fri, Sat, Sun) for whole-venue fees, same as the Pricing cards use for path fees", () => {
    const wholeVenueFees = [
      fixedFee({ key: "wk", day: "weekday", season: "off", amount: 2100, applies_to: "whole_venue", space_id: null }),
      fixedFee({ key: "fr", day: "fri", season: "off", amount: 3700, applies_to: "whole_venue", space_id: null }),
      fixedFee({ key: "su", day: "sun", season: "off", amount: 3700, applies_to: "whole_venue", space_id: null }),
      fixedFee({ key: "sa", day: "sat", season: "off", amount: 4700, applies_to: "whole_venue", space_id: null }),
    ];
    const grid = fmt.buildMergedPriceGrid(fmt.fixedFeeGrid(wholeVenueFees));
    expect(grid!.columns.map((c) => c.label)).toEqual(["Weekday", "Fri", "Sat", "Sun"]);
  });
});

describe("seasonsMonthsLine", () => {
  it("states both season definitions once", () => {
    expect(fmt.seasonsMonthsLine({ peak: "Apr–Oct, Dec", off: "Jan, Feb, Mar, Nov" })).toBe("off-season is Jan, Feb, Mar, Nov; peak season is Apr–Oct, Dec");
  });
  it("returns null when a venue states neither", () => {
    expect(fmt.seasonsMonthsLine(undefined)).toBeNull();
    expect(fmt.seasonsMonthsLine({ peak: null, off: null })).toBeNull();
  });
});

describe("barLadderPriceLabel / barMinGuestsLine", () => {
  it("shows a per-guest range across duration options", () => {
    expect(fmt.barLadderPriceLabel({ "4hr": 3.95, "5hr": 4.95 })).toBe("$3.95–$4.95 /guest");
  });
  it("collapses to one value when durations cost the same", () => {
    expect(fmt.barLadderPriceLabel({ "4hr": 12, "5hr": 12 })).toBe("$12 /guest");
  });
  it("states the bar section's own guest minimum", () => {
    expect(fmt.barMinGuestsLine(50)).toBe("Bar packages require 50+ guests.");
    expect(fmt.barMinGuestsLine(null)).toBeNull();
  });
});

describe("underMinimumMessage", () => {
  const path = fixedFeePath({
    minimums: [
      { kind: "guest_minimum", day: null, season: null, amount: 150, quote: "q", source_url: "https://example.com", snapshot_id: 1 },
      { kind: "guest_minimum", day: "fri", season: null, amount: 125, quote: "q", source_url: "https://example.com", snapshot_id: 1 },
    ],
  });
  it("names the day-specific minimum when one applies", () => {
    expect(fmt.underMinimumMessage(path, 120, "fri", "peak")).toBe("120 guests is below the 125-guest minimum for Fridays.");
  });
  it("falls back to the general minimum on a day with no specific one", () => {
    expect(fmt.underMinimumMessage(path, 100, "sat", "peak")).toBe("100 guests is below the 150-guest minimum.");
  });
  it("returns null when the path states no guest minimum at all", () => {
    expect(fmt.underMinimumMessage(fixedFeePath(), 10, "sat", "peak")).toBeNull();
  });
});

describe("splitAddOnsBySelection", () => {
  it("groups items sharing a selection_group, leaves the rest individual", () => {
    const bronze = addOn({ id: "bronze", selection_group: "food-package" });
    const silver = addOn({ id: "silver", selection_group: "food-package" });
    const parking = addOn({ id: "parking2" });
    const { groups, individual } = fmt.splitAddOnsBySelection([bronze, silver, parking]);
    expect(groups).toEqual([{ key: "food-package", items: [bronze, silver] }]);
    expect(individual).toEqual([parking]);
  });

  it("returns no groups when nothing sets selection_group", () => {
    const a = addOn({ id: "a" });
    expect(fmt.splitAddOnsBySelection([a])).toEqual({ groups: [], individual: [a] });
  });
});

describe("selectionGroupLabel", () => {
  it("humanizes the known Diamond Garden group keys", () => {
    expect(fmt.selectionGroupLabel("food-package")).toBe("Food package");
    expect(fmt.selectionGroupLabel("bar")).toBe("Bar tier");
  });
  it("title-cases an unknown key as a fallback", () => {
    expect(fmt.selectionGroupLabel("some-other-group")).toBe("Some Other Group");
  });
});

describe("addOnCategoryGroups", () => {
  it("returns null when the venue has no curated add_on_categories", () => {
    expect(fmt.addOnCategoryGroups(makeVenue())).toBeNull();
  });

  it("groups add-ons by category, joining on the category name; excludes selection_group items from `items`", () => {
    const bronze = addOn({ id: "bronze", category: "Food & beverage add-ons", selection_group: "food-package" });
    const uplights = addOn({ id: "uplights", category: "Lighting & video add-ons" });
    const ceremonyUpgrade = addOn({ id: "backdrop", category: "Ceremony" });
    const d = makeVenue({
      pricing: {
        ...makeVenue().pricing,
        add_ons: [bronze, uplights, ceremonyUpgrade],
        add_on_categories: [
          { category: "Food & beverage add-ons", blurb: "Food blurb", examples: ["Food package: $15.95-$35/guest"], evidence: { source_url: "https://example.com", snapshot_id: null } },
          { category: "Lighting & video add-ons", blurb: "Lighting blurb", examples: [], evidence: { source_url: "https://example.com", snapshot_id: null } },
        ],
      },
    });
    const groups = fmt.addOnCategoryGroups(d)!;
    const food = groups.find((g) => g.category === "Food & beverage add-ons")!;
    expect(food.items).toEqual([]); // bronze excluded — it's a selection_group item
    expect(food.examples).toEqual(["Food package: $15.95-$35/guest"]);
    const lighting = groups.find((g) => g.category === "Lighting & video add-ons")!;
    expect(lighting.items).toEqual([uplights]);
    // A category the curated list doesn't name still gets a home, not silently dropped.
    const ceremony = groups.find((g) => g.category === "Ceremony")!;
    expect(ceremony.items).toEqual([ceremonyUpgrade]);
    expect(ceremony.blurb).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Round 4 — six-venue review (2026-09-19)
// ---------------------------------------------------------------------------

describe("int (rule 1)", () => {
  it("adds thousands separators", () => {
    expect(fmt.int(1500)).toBe("1,500");
    expect(fmt.int(60)).toBe("60");
  });
});

describe("resourceLabel (rule 4)", () => {
  it("uses the standard label for a kind with only one resource in its slot", () => {
    const r = resource({ id: "fp1", kind: "floor_plan", label: "Whatever the venue called it" });
    expect(fmt.resourceLabel(r, [r])).toBe("Floor plan");
  });

  it("capacity_sheet also reads 'Floor plan'", () => {
    const r = resource({ id: "cs", kind: "capacity_sheet" });
    expect(fmt.resourceLabel(r, [r])).toBe("Floor plan");
  });

  it("a space-scoped video reads 'Video tour'", () => {
    const r = resource({ id: "v", kind: "video", scope: "space:loft" });
    expect(fmt.resourceLabel(r, [r])).toBe("Video tour");
  });

  it("a venue-scoped video reads plain 'Video'", () => {
    const r = resource({ id: "v", kind: "video", scope: "venue" });
    expect(fmt.resourceLabel(r, [r])).toBe("Video");
  });

  it("disambiguates with the venue's own name (menu suffix stripped) only when 2+ share a kind+slot", () => {
    const cuisine = resource({ id: "m1", kind: "menu", label: "Italian Menu" });
    const bbq = resource({ id: "m2", kind: "menu", label: "BBQ menu" });
    const siblings = [cuisine, bbq];
    expect(fmt.resourceLabel(cuisine, siblings)).toBe("Italian");
    expect(fmt.resourceLabel(bbq, siblings)).toBe("BBQ");
  });

  it("never repeats the venue name when there's only one resource of that kind, even with an odd own label", () => {
    const r = resource({ id: "m1", kind: "menu", label: "The Geraghty Wedding Menu" });
    expect(fmt.resourceLabel(r, [r])).toBe("Menu");
  });
});

describe("orderSpaceCardResources (rule 5)", () => {
  it("orders Floor plan(s) (incl. capacity_sheet), Virtual tour, Video, Gallery", () => {
    const gallery = resource({ id: "g", kind: "gallery" });
    const video = resource({ id: "v", kind: "video" });
    const tour = resource({ id: "t", kind: "virtual_tour" });
    const cap = resource({ id: "cs", kind: "capacity_sheet" });
    const fp = resource({ id: "fp", kind: "floor_plan" });
    const ordered = fmt.orderSpaceCardResources([gallery, video, tour, cap, fp]);
    expect(ordered.map((r) => r.id)).toEqual(["fp", "cs", "t", "v", "g"]);
  });
});

describe("spaceRentalLine (rule 6; regression fix — precedence must survive a standalone Pricing section)", () => {
  const pathWithTiers = fixedFeePath({ per_guest_tiers: [tier()] });
  const pathWithoutTiers = fixedFeePath();
  const wholeVenueFees = [
    fixedFee({ key: "a", applies_to: "whole_venue", space_id: null, amount: 2100 }),
    fixedFee({ key: "b", applies_to: "whole_venue", space_id: null, amount: 6595 }),
  ];

  it("(1) is 'fees' when this space has its own scoped fee rows, regardless of anything else", () => {
    expect(fmt.spaceRentalLine(1, wholeVenueFees, 3, pathWithTiers)).toEqual({ kind: "fees" });
  });

  it("(2a) is 'grid' when the default path prices the whole venue and there's no standalone Pricing section", () => {
    expect(fmt.spaceRentalLine(0, wholeVenueFees, 1, pathWithTiers)).toEqual({ kind: "grid" });
    expect(fmt.spaceRentalLine(0, wholeVenueFees, 0, pathWithTiers)).toEqual({ kind: "grid" });
  });

  it("(2b) is 'summary' — never 'on_request' — when a standalone Pricing section already shows the grid (Diamond Garden regression)", () => {
    expect(fmt.spaceRentalLine(0, wholeVenueFees, 3, pathWithTiers)).toEqual({ kind: "summary", line: "$2,100–$6,595 flat · see Pricing below" });
  });

  it("(3) is 'bundled' when the default path has per-guest tiers and no whole-venue fees either, same-rate flag from applies_to_spaces", () => {
    expect(fmt.spaceRentalLine(0, [], 3, pathWithTiers)).toEqual({ kind: "bundled", sameRateAnyRoom: true });
    expect(fmt.spaceRentalLine(0, [], 3, { ...pathWithTiers, applies_to_spaces: ["a"] })).toEqual({ kind: "bundled", sameRateAnyRoom: false });
  });

  it("(4) is 'on_request' with no fees, no whole-venue fees, and no per-guest tiers (inquire-only / no paths)", () => {
    expect(fmt.spaceRentalLine(0, [], 3, pathWithoutTiers)).toEqual({ kind: "on_request" });
    expect(fmt.spaceRentalLine(0, [], 0, undefined)).toEqual({ kind: "on_request" });
  });
});

describe("fbMinimumLine (rule 7)", () => {
  it("uses the venue's own detail text when stated", () => {
    expect(fmt.fbMinimumLine(fact({ applies: true, amount_usd: 3000, detail: "Varies by date and guest count" }))).toBe("Varies by date and guest count");
  });
  it("falls back to the plain amount", () => {
    expect(fmt.fbMinimumLine(fact({ applies: true, amount_usd: 5000, detail: null }))).toBe("$5,000");
  });
  it("says amount not published when a minimum applies with no number", () => {
    expect(fmt.fbMinimumLine(fact({ applies: true, amount_usd: null, detail: null }))).toBe("Amount not published");
  });
  it("is null when no minimum applies, or the field isn't stated", () => {
    expect(fmt.fbMinimumLine(fact({ applies: false, amount_usd: null, detail: null }))).toBeNull();
    expect(fmt.fbMinimumLine({ status: "not_stated" })).toBeNull();
  });
});

describe("tierPriceParts (rule 8)", () => {
  it("splits a flat price from its /guest unit", () => {
    expect(fmt.tierPriceParts(100, 100)).toEqual({ main: "$100", unit: "/guest" });
  });
  it("splits a range from its /guest unit", () => {
    expect(fmt.tierPriceParts(68.95, 84.95)).toEqual({ main: "from $68.95 to $84.95", unit: "/guest" });
  });
});

describe("collapsedGuestMinimumLine (rule 16)", () => {
  it("collapses a general minimum plus day-specific ones into one line", () => {
    const minimums = [
      { kind: "guest_minimum" as const, day: null, season: null, amount: 150, quote: "q", source_url: "https://example.com", snapshot_id: 1 },
      { kind: "guest_minimum" as const, day: "fri" as const, season: null, amount: 125, quote: "q", source_url: "https://example.com", snapshot_id: 1 },
      { kind: "guest_minimum" as const, day: "sun" as const, season: null, amount: 100, quote: "q", source_url: "https://example.com", snapshot_id: 1 },
    ];
    expect(fmt.collapsedGuestMinimumLine(minimums)).toBe("150 guests (125 Friday, 100 Sunday)");
  });

  it("shows just the general minimum when there's no day-specific one", () => {
    expect(fmt.collapsedGuestMinimumLine([{ kind: "guest_minimum", day: null, season: null, amount: 150, quote: "q", source_url: "https://example.com", snapshot_id: 1 }])).toBe("150 guests");
  });

  it("is null when the path states no guest minimum at all (fb_minimum rows don't count)", () => {
    expect(fmt.collapsedGuestMinimumLine([{ kind: "fb_minimum", day: null, season: null, amount: 3000, quote: "q", source_url: "https://example.com", snapshot_id: 1 }])).toBeNull();
    expect(fmt.collapsedGuestMinimumLine([])).toBeNull();
  });
});

describe("groupTierInclusionBullets (rule 16)", () => {
  it("returns one flat list when no inclusion carries a Food:/Bar:/Setup: prefix", () => {
    expect(fmt.groupTierInclusionBullets(["Tables and chairs", "Linens"])).toEqual([{ header: null, items: ["Tables and chairs", "Linens"] }]);
  });

  it("groups by prefix header when the venue's own inclusions carry one", () => {
    const groups = fmt.groupTierInclusionBullets(["Food: Plated dinner", "Food: Dessert station", "Bar: 4-hour open bar", "Setup: 2-hour access"]);
    expect(groups).toEqual([
      { header: "Food", items: ["Plated dinner", "Dessert station"] },
      { header: "Bar", items: ["4-hour open bar"] },
      { header: "Setup", items: ["2-hour access"] },
    ]);
  });

  it("returns [] for a tier with no inclusions", () => {
    expect(fmt.groupTierInclusionBullets([])).toEqual([]);
  });
});

describe("samePricingAsEarlierPath (rule 16)", () => {
  const feeA = fixedFee({ key: "a", day: "sat", season: "peak", amount: 6595, applies_to: "whole_venue", space_id: null });
  const feeB = fixedFee({ key: "b", day: "sat", season: "peak", amount: 6595, applies_to: "whole_venue", space_id: null });
  const feeC = fixedFee({ key: "c", day: "sat", season: "peak", amount: 9999, applies_to: "whole_venue", space_id: null });

  it("finds an earlier path with the identical fee shape (same day/season/amount)", () => {
    const paths = [fixedFeePath({ id: "hall-only", name: "Hall Rental Only", fixed_fees: [feeA] }), fixedFeePath({ id: "hall-plus", name: "Hall + À La Carte", fixed_fees: [feeB] })];
    expect(fmt.samePricingAsEarlierPath(paths, 1)?.name).toBe("Hall Rental Only");
  });

  it("returns null when fees differ, or the path has none, or it's the first path", () => {
    const paths = [fixedFeePath({ id: "a", fixed_fees: [feeA] }), fixedFeePath({ id: "b", fixed_fees: [feeC] })];
    expect(fmt.samePricingAsEarlierPath(paths, 1)).toBeNull();
    expect(fmt.samePricingAsEarlierPath(paths, 0)).toBeNull();
    expect(fmt.samePricingAsEarlierPath([fixedFeePath({ fixed_fees: [] })], 0)).toBeNull();
  });
});

describe("seasonLabelWithMonths (rule 16)", () => {
  it("appends the venue's own months in parens", () => {
    expect(fmt.seasonLabelWithMonths("off", { peak: "Apr–Oct, Dec", off: "Jan, Feb, Mar, Nov" })).toBe("Off-season (Jan, Feb, Mar, Nov)");
    expect(fmt.seasonLabelWithMonths("peak", { peak: "Apr–Oct, Dec", off: "Jan, Feb, Mar, Nov" })).toBe("Peak season (Apr–Oct, Dec)");
  });
  it("falls back to the plain label with no months stated", () => {
    expect(fmt.seasonLabelWithMonths("peak", undefined)).toBe("Peak season");
  });
});

describe("seasonMonthsOnly", () => {
  it("returns just the months half, for rendering the season name and months on two lines", () => {
    expect(fmt.seasonMonthsOnly("off", { peak: "Apr–Oct, Dec", off: "Jan, Feb, Mar, Nov" })).toBe("Jan, Feb, Mar, Nov");
    expect(fmt.seasonMonthsOnly("peak", { peak: "Apr–Oct, Dec", off: "Jan, Feb, Mar, Nov" })).toBe("Apr–Oct, Dec");
  });
  it("is null when the venue doesn't state months for that season, or at all", () => {
    expect(fmt.seasonMonthsOnly("peak", undefined)).toBeNull();
    expect(fmt.seasonMonthsOnly("any", { peak: "Apr", off: "Jan" })).toBeNull();
  });
});

describe("truncateNote (rule 10)", () => {
  it("passes short notes through unchanged", () => {
    expect(fmt.truncateNote("Short note")).toEqual({ display: "Short note", full: "Short note", truncated: false });
  });
  it("truncates at 140 chars with an ellipsis, keeping the full text", () => {
    const long = "x".repeat(200);
    const { display, full, truncated } = fmt.truncateNote(long);
    expect(truncated).toBe(true);
    expect(full).toBe(long);
    expect(display.length).toBe(140);
    expect(display.endsWith("…")).toBe(true);
  });
});

describe("humanizeCondition via buildAddOnTable (rule 10)", () => {
  it("names a non-ceremony condition in plain words, not just enum-cased", () => {
    const a = addOn({ id: "corkage-note", condition: "not_in_house_bar_or_catering", variant: null, group: "other" });
    const table = fmt.buildAddOnTable([a], []);
    expect(table.rows[0].variants[0].name).toBe("If you're not using the venue's own bar or catering");
  });
});

describe("resolvedAddOnCategoryGroups / buildAddOnCategoryTables (rule 17)", () => {
  it("falls back to plain distinct-category grouping when there are no curated categories", () => {
    const a = addOn({ id: "a1", category: "Parking" });
    const b = addOn({ id: "a2", category: "Rehearsal" });
    const d = makeVenue({ pricing: { ...makeVenue().pricing, add_ons: [a, b] } });
    const groups = fmt.resolvedAddOnCategoryGroups(d);
    expect(groups.map((g) => g.category).sort()).toEqual(["Parking", "Rehearsal"]);
  });

  it("builds an Item|Price table per category, folding variant/condition into the item label", () => {
    const dj = addOn({ id: "dj", category: "Entertainment", name: "DJ upgrade", variant: "Premium package" });
    const d = makeVenue({ pricing: { ...makeVenue().pricing, add_ons: [dj] } });
    const tables = fmt.buildAddOnCategoryTables(d);
    const entertainment = tables.find((t) => t.category === "Entertainment")!;
    expect(entertainment.columnLabels).toEqual(["Price"]);
    expect(entertainment.rows[0].itemLabel).toBe("DJ upgrade (Premium package)");
  });

  it("skips the redundant '(X)' when the add-on's own name already says X (Marchetti's 'Dance floor: White' + variant 'White')", () => {
    const danceFloor = addOn({ id: "df1", category: "Dance floor", name: "Dance floor: White", variant: "White" });
    const ceremony = addOn({ id: "c1", category: "Ceremony fee", name: "On-site ceremony", group: "ceremony", condition: "ceremony_on_site", variant: null });
    const d = makeVenue({ pricing: { ...makeVenue().pricing, add_ons: [danceFloor, ceremony] } });
    const tables = fmt.buildAddOnCategoryTables(d);
    expect(tables.find((t) => t.category === "Dance floor")!.rows[0].itemLabel).toBe("Dance floor: White");
    expect(tables.find((t) => t.category === "Ceremony fee")!.rows[0].itemLabel).toBe("On-site ceremony");
  });

  it("uses per-space columns when the category's items carry per_space_prices", () => {
    const spaces = [space({ id: "s1", name: "La Pergola" }), space({ id: "s2", name: "The Pavilion" })];
    const a = addOn({ id: "d1", category: "Dance floor", per_space_prices: { s1: 1000, s2: 1200 } });
    const d = makeVenue({ spaces, pricing: { ...makeVenue().pricing, add_ons: [a] } });
    const table = fmt.buildAddOnCategoryTables(d).find((t) => t.category === "Dance floor")!;
    expect(table.columnLabels).toEqual(["La Pergola", "The Pavilion"]);
    expect(table.rows[0].prices).toEqual(["$1,000", "$1,200"]);
  });
});

describe("isCompactAddOnsLayout / addOnsLayout (rules 12, 17)", () => {
  it("is compact for 2 or fewer real add-ons and no curated categories", () => {
    const d = makeVenue({ pricing: { ...makeVenue().pricing, add_ons: [addOn({ id: "a" }), addOn({ id: "b" })] } });
    expect(fmt.isCompactAddOnsLayout(d)).toBe(true);
    expect(fmt.addOnsLayout(d)).toBe("compact");
  });

  it("is 'cards' for a single, uncurated flat category with more than 2 items", () => {
    const d = makeVenue({ pricing: { ...makeVenue().pricing, add_ons: [addOn({ id: "a", category: "Extras" }), addOn({ id: "b", category: "Extras" }), addOn({ id: "c", category: "Extras" })] } });
    expect(fmt.addOnsLayout(d)).toBe("cards");
  });

  it("is 'tables' once there are 2+ distinct categories, even uncurated", () => {
    const d = makeVenue({
      pricing: { ...makeVenue().pricing, add_ons: [addOn({ id: "a", category: "Parking" }), addOn({ id: "b", category: "Rehearsal" }), addOn({ id: "c", category: "Rehearsal" })] },
    });
    expect(fmt.addOnsLayout(d)).toBe("tables");
  });

  it("is 'tables' whenever curated add_on_categories exist, regardless of item count", () => {
    const d = makeVenue({
      pricing: {
        ...makeVenue().pricing,
        add_ons: [addOn({ id: "a", category: "Food" })],
        add_on_categories: [{ category: "Food", blurb: null, examples: [], evidence: { source_url: "https://example.com", snapshot_id: null } }],
      },
    });
    expect(fmt.addOnsLayout(d)).toBe("tables");
  });
});

describe("groupVendorListsByRelationship (rule 11)", () => {
  const list = (relationship: VendorList["relationship"], label: string): VendorList => ({
    label,
    category: label,
    relationship,
    entries: [{ name: "A", url: null, instagram: null }, { name: "B", url: null, instagram: null }],
    source_url: "https://example.com",
    snapshot_id: 1,
  });

  it("groups by relationship with a plain-language header + sentence", () => {
    const groups = fmt.groupVendorListsByRelationship([list("preferred", "Caterers"), list("in_house_partner", "Décor")]);
    expect(groups.map((g) => g.header)).toEqual(["Required (in-house partners)", "Preferred"]);
    expect(groups.find((g) => g.relationship === "in_house_partner")!.sentence).toBe("You'll work with these vendors; they're part of the venue.");
    expect(groups.find((g) => g.relationship === "preferred")!.sentence).toContain("confirm whether outside caterers");
  });

  it("collects multiple lists sharing one relationship under one group", () => {
    const groups = fmt.groupVendorListsByRelationship([list("in_house_partner", "Décor"), list("in_house_partner", "A/V")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].lists.map((l) => l.label)).toEqual(["Décor", "A/V"]);
  });

  it("says catering must come from the list for approved_required", () => {
    const groups = fmt.groupVendorListsByRelationship([list("approved_required", "Caterers")]);
    expect(groups[0].header).toBe("Approved list only");
    expect(groups[0].sentence).toBe("Catering must come from this list.");
  });
});

describe("groupSelectableAddOnsByCategory (rule 18)", () => {
  it("groups by category, splitting each category into single-select groups vs individual items", () => {
    const bronze = addOn({ id: "bronze", category: "Food", selection_group: "food-package" });
    const silver = addOn({ id: "silver", category: "Food", selection_group: "food-package" });
    const parking = addOn({ id: "parking", category: "Rentals" });
    const groups = fmt.groupSelectableAddOnsByCategory([bronze, silver, parking]);
    const food = groups.find((g) => g.category === "Food")!;
    expect(food.groups).toEqual([{ key: "food-package", items: [bronze, silver] }]);
    expect(food.individual).toEqual([]);
    const rentals = groups.find((g) => g.category === "Rentals")!;
    expect(rentals.individual).toEqual([parking]);
    expect(rentals.groups).toEqual([]);
  });
});
