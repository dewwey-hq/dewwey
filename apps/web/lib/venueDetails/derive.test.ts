import { describe, expect, it } from "vitest";
import {
  addOnAxes,
  bandCapacityTuple,
  calculatorAxes,
  calculatorRange,
  defaultAxes,
  deriveStandardFaqs,
  estimateCost,
  fbPills,
  guestRange,
  headlineCapacity,
  policyRows,
  quickFacts,
  selectableAddOns,
  type EstimateInput,
} from "./derive";
import type { AddOn, CapacityTuple, PricingPath, Rates, Space, VenueDetailsV3 } from "./types";
import { emptyRates, fact, makeVenue, spineWith } from "./testHelpers";

const src = "https://example.com";

function space(overrides: Partial<Space>): Space {
  return {
    id: "space",
    name: "Space",
    structure_label: null,
    sq_ft: null,
    sq_ft_outdoor: null,
    ceiling_ft: null,
    setting: null,
    bookable_separately: true,
    description: null,
    includes_summary: null,
    evidence: { source_url: src, snapshot_id: 1 },
    ...overrides,
  };
}

function tuple(overrides: Partial<CapacityTuple>): CapacityTuple {
  return {
    space_id: "space",
    layout: "seated_dinner",
    min: null,
    max: 100,
    as_stated_label: "Seated",
    tile: "seated",
    condition: null,
    quote: "up to 100",
    source_url: src,
    snapshot_id: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// deriveStandardFaqs
// ---------------------------------------------------------------------------

describe("deriveStandardFaqs", () => {
  it("returns exactly the 5 locked questions, in order", () => {
    const venue = makeVenue();
    const faqs = deriveStandardFaqs(venue);
    expect(faqs.map((f) => f.question)).toEqual([
      "Can we bring our own caterer, or does it have to be from an approved list?",
      "Can we bring our own alcohol?",
      "Is there a food & beverage minimum?",
      "Do we need to hire our own day-of coordinator?",
      "Is event insurance required?",
    ]);
  });

  it("not_stated answers use the exact locked wording and are never an em dash", () => {
    const venue = makeVenue();
    const faqs = deriveStandardFaqs(venue);
    for (const f of faqs) {
      expect(f.answer).toBe("Not stated on their site. Confirm directly with the venue.");
      expect(f.answer).not.toContain("—"); // em dash
    }
  });

  it("opens with the venue's real name or Yes/No, from the spine alone", () => {
    const venue = makeVenue({
      name: "Galleria Marchetti",
      spine: spineWith({
        catering: fact("exclusive_in_house"),
        bar: fact("in_house"),
        fb_minimum: fact({ applies: true, amount_usd: null, detail: null }),
        day_of_coordinator: fact("included"),
        event_insurance: fact("required"),
      }),
    });
    const [catering, bar, fbMin, coordinator, insurance] = deriveStandardFaqs(venue);
    expect(catering.answer).toBe("No, catering is exclusive in-house at Galleria Marchetti.");
    expect(bar.answer).toBe("No, Galleria Marchetti's bar is in-house only.");
    expect(fbMin.answer).toBe("Yes, a food & beverage minimum applies (amount not published).");
    expect(coordinator.answer).toBe("No, a day-of coordinator is included.");
    expect(insurance.answer).toBe("Yes, event insurance is required.");
    for (const f of [catering, bar, fbMin, coordinator, insurance]) expect(f.answer).not.toContain("—");
  });

  it("conflicting status lists both candidate values and asks to confirm", () => {
    const venue = makeVenue({
      spine: spineWith({
        catering: {
          status: "conflicting",
          candidates: [fact("open"), fact("preferred_list")],
        },
      }),
    });
    const [catering] = deriveStandardFaqs(venue);
    expect(catering.answer).toContain("Confirm which applies.");
    expect(catering.answer).toContain("an open list, any caterer");
    expect(catering.answer).toContain("a preferred caterer list");
  });
});

// ---------------------------------------------------------------------------
// headlineCapacity
// ---------------------------------------------------------------------------

describe("inquire-only and gala-max rules (served pages, 2026-09-20)", () => {
  it("estimateCost returns no_path when no path carries numbers or the archetype is inquire_only", () => {
    const base = makeVenue();
    const emptyPath = { id: "inquire", name: "On request", description: null, applies_to_spaces: "all", fixed_fees: [], per_guest_tiers: [], minimums: [], required_staffing: null, rental_hours: null, year_surcharges: [], promotions: [], quote: "q", source_url: "u", snapshot_id: null };
    const v = { ...base, pricing: { ...base.pricing, archetype: "inquire_only", paths: [emptyPath] } } as unknown as VenueDetailsV3;
    expect(estimateCost(v, defaultAxes(v)).warnings).toContain("no_path");
  });
  it("guestRange ignores a stated max that is a gala figure when a wedding row exists", () => {
    const base = makeVenue();
    const t = (layout: "seated_dinner" | "seated_with_dance", max: number, condition: string | null) => ({ space_id: "whole_venue", layout, min: null, max, as_stated_label: null, tile: "seated" as const, condition, quote: "q", source_url: "u", snapshot_id: null });
    const v = { ...base, capacities: [t("seated_dinner", 1000, "gala"), t("seated_with_dance", 300, null)], spine: { ...base.spine, capacity_max_guests: { status: "stated", value: 1000, quote: "Gala - Maximum Capacity: 1,000", source_url: "u", snapshot_id: null } } } as unknown as VenueDetailsV3;
    expect(guestRange(v).max).toBe(300);
  });
});

describe("headlineCapacity", () => {
  it("conditioned tuples (gala, live band) never set the headline", () => {
    const base = makeVenue();
    const t = (layout: "seated_dinner" | "seated_with_dance", max: number, condition: string | null) => ({ space_id: "whole_venue", layout, min: null, max, as_stated_label: null, tile: "seated" as const, condition, quote: "q", source_url: "u", snapshot_id: null });
    const v = { ...base, spaces: [{ ...base.spaces[0], id: "whole_venue", bookable_separately: false }], capacities: [t("seated_dinner", 1000, "gala"), t("seated_with_dance", 300, null)] };
    expect(headlineCapacity(v as unknown as VenueDetailsV3).headline).toBe(300);
    // the Seated tile shows the wedding row (300), never the gala 1,000
    expect(headlineCapacity(v as unknown as VenueDetailsV3).tiles.find((t) => t.tile === "seated")?.max).toBe(300);
    // setup constraints (band / DJ) stay eligible: Greenhouse's only seated-with-dance rows are conditioned
    const w = { ...v, capacities: [t("seated_with_dance", 175, "DJ"), t("seated_with_dance", 150, "live band")] };
    expect(headlineCapacity(w as unknown as VenueDetailsV3).headline).toBe(175);
  });
  it("single-space venue: the only room counts even when marked not bookable_separately, and whole_venue tuples count", () => {
    const base = makeVenue();
    const v = { ...base, spaces: [{ ...base.spaces[0], id: "hall", bookable_separately: false }], capacities: [
      { space_id: "hall", layout: "seated_dinner" as const, min: null, max: 268, as_stated_label: null, tile: "seated" as const, condition: null, quote: "q", source_url: "u", snapshot_id: null },
    ] };
    expect(headlineCapacity(v as unknown as VenueDetailsV3).headline).toBe(268);
    const w = { ...v, capacities: [{ ...v.capacities[0], space_id: "whole_venue", max: 300 }] };
    expect(headlineCapacity(w as unknown as VenueDetailsV3).headline).toBe(300);
  });
  it("never sums rooms: takes the max of two single bookable spaces (425 + 180 -> 425)", () => {
    const venue = makeVenue({
      spaces: [space({ id: "pavilion" }), space({ id: "la-pergola" })],
      capacities: [
        tuple({ space_id: "pavilion", max: 425, as_stated_label: "Seated" }),
        tuple({ space_id: "la-pergola", max: 180, as_stated_label: "Seated" }),
      ],
    });
    const hc = headlineCapacity(venue);
    expect(hc.headline).toBe(425);
    expect(hc.headline_space_id).toBe("pavilion");
  });

  it("ignores a whole_venue tuple even when it's larger than any single-space tuple", () => {
    const venue = makeVenue({
      spaces: [space({ id: "pavilion" })],
      capacities: [
        tuple({ space_id: "pavilion", max: 425 }),
        tuple({ space_id: "whole_venue", max: 900 }),
      ],
    });
    expect(headlineCapacity(venue).headline).toBe(425);
  });

  it("falls back to seated_with_dance when no seated_dinner tuple exists", () => {
    const venue = makeVenue({
      spaces: [space({ id: "loft" })],
      capacities: [tuple({ space_id: "loft", layout: "seated_with_dance", tile: "seated_dance", max: 150, as_stated_label: "Seated (w/ dance floor)" })],
    });
    const hc = headlineCapacity(venue);
    expect(hc.headline).toBe(150);
    expect(hc.headline_layout).toBe("seated_with_dance");
    expect(hc.cocktail_only).toBe(false);
  });

  it("falls back to an 'other'-layout tuple tagged tile:'seated' when no seated_dinner/seated_with_dance exists", () => {
    const venue = makeVenue({
      spaces: [space({ id: "hall" })],
      capacities: [tuple({ space_id: "hall", layout: "other", tile: "seated", max: 268, as_stated_label: "Seated" })],
    });
    const hc = headlineCapacity(venue);
    expect(hc.headline).toBe(268);
    expect(hc.headline_layout).toBe("other");
  });

  it("falls back to cocktail-only when nothing else is stated, and flags cocktail_only", () => {
    const venue = makeVenue({
      spaces: [space({ id: "rooftop" })],
      capacities: [tuple({ space_id: "rooftop", layout: "cocktail_standing", tile: "cocktail", max: 300, as_stated_label: "Cocktail (standing)" })],
    });
    const hc = headlineCapacity(venue);
    expect(hc.headline).toBe(300);
    expect(hc.cocktail_only).toBe(true);
    expect(hc.guest_range.max_measures).toBe("guests");
  });

  it("excludes spaces with bookable_separately === false from the headline chain", () => {
    const venue = makeVenue({
      spaces: [space({ id: "sub-room", bookable_separately: false }), space({ id: "main-room" })],
      capacities: [tuple({ space_id: "sub-room", max: 500 }), tuple({ space_id: "main-room", max: 200 })],
    });
    expect(headlineCapacity(venue).headline).toBe(200);
  });

  it("builds the 3 tiles from the venue's own as_stated_labels regardless of headline chain", () => {
    const venue = makeVenue({
      spaces: [space({ id: "loft" })],
      capacities: [
        tuple({ space_id: "loft", layout: "seated_dinner", tile: "seated", max: 175, as_stated_label: "Seated (w/ DJ)" }),
        tuple({ space_id: "loft", layout: "seated_with_dance", tile: "seated_dance", max: 150, as_stated_label: "Seated (w/ band)" }),
        tuple({ space_id: "loft", layout: "cocktail_standing", tile: "cocktail", max: 200, as_stated_label: "Cocktail (standing)" }),
      ],
    });
    const hc = headlineCapacity(venue);
    expect(hc.tiles).toEqual([
      { tile: "seated", as_stated_label: "Seated (w/ DJ)", max: 175 },
      { tile: "seated_dance", as_stated_label: "Seated (w/ band)", max: 150 },
      { tile: "cocktail", as_stated_label: "Cocktail (standing)", max: 200 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// guestRange (round 4 rule 1) — the pill/stepper's own full range, distinct from headlineCapacity
// ---------------------------------------------------------------------------

describe("guestRange", () => {
  it("uses spine.capacity_max_guests when the venue states one, even over a larger seated tuple (round 5 rule 1)", () => {
    const venue = makeVenue({
      spine: spineWith({ capacity_max_guests: fact(200) }),
      spaces: [space({ id: "loft" })],
      capacities: [
        tuple({ space_id: "loft", layout: "seated_dinner", tile: "seated", max: 175 }),
        tuple({ space_id: "loft", layout: "cocktail_standing", tile: "cocktail", max: 200 }),
      ],
    });
    const gr = guestRange(venue);
    expect(gr.max).toBe(200);
    expect(gr.max_measures).toBe("guests");
  });

  it("falls back to the seated headline (never a raw cocktail/any-layout tuple max) when capacity_max_guests isn't stated", () => {
    const venue = makeVenue({
      spaces: [space({ id: "loft" })],
      capacities: [
        tuple({ space_id: "loft", layout: "seated_dinner", tile: "seated", max: 175 }),
        tuple({ space_id: "loft", layout: "seated_with_dance", tile: "seated_dance", max: 150 }),
        tuple({ space_id: "loft", layout: "cocktail_standing", tile: "cocktail", max: 200 }),
      ],
    });
    const gr = guestRange(venue);
    expect(gr.max).toBe(175); // the seated-dinner headline, not the larger cocktail tuple
    expect(gr.max_measures).toBe("seated");
  });

  it("reads 'guests' when the venue has no seated layout at all, so the headline itself is cocktail-only", () => {
    const venue = makeVenue({
      spaces: [space({ id: "hall" })],
      capacities: [tuple({ space_id: "hall", layout: "cocktail_standing", tile: "cocktail", max: 300 })],
    });
    const gr = guestRange(venue);
    expect(gr.max).toBe(300);
    expect(gr.max_measures).toBe("guests");
  });

  it("falls back to the headline when capacity_max_guests is conflicting (unknown beats wrong)", () => {
    const venue = makeVenue({
      spine: spineWith({ capacity_max_guests: { status: "conflicting", candidates: [fact(200), fact(250)] } }),
      spaces: [space({ id: "loft" })],
      capacities: [tuple({ space_id: "loft", layout: "seated_dinner", tile: "seated", max: 175 })],
    });
    expect(guestRange(venue).max).toBe(175);
    expect(guestRange(venue).max_measures).toBe("seated");
  });

  it("omits a conflicting stated minimum entirely — never falls back to a tuple min (unknown beats wrong)", () => {
    const venue = makeVenue({
      spine: spineWith({ capacity_min_guests: { status: "conflicting", candidates: [fact(10), fact(20)] } }),
      spaces: [space({ id: "hall" })],
      capacities: [tuple({ space_id: "hall", min: 50, max: 1500 })],
    });
    expect(guestRange(venue).min).toBeNull();
  });

  it("falls back to the smallest stated tuple min when capacity_min_guests isn't stated at all", () => {
    const venue = makeVenue({
      spaces: [space({ id: "a" }), space({ id: "b" })],
      capacities: [tuple({ space_id: "a", min: 50, max: 300 }), tuple({ space_id: "b", min: 20, max: 100 })],
    });
    expect(guestRange(venue).min).toBe(20);
  });

  it("prefers the stated capacity_min_guests over any tuple min", () => {
    const venue = makeVenue({
      spine: spineWith({ capacity_min_guests: fact(75) }),
      spaces: [space({ id: "a" })],
      capacities: [tuple({ space_id: "a", min: 10, max: 300 })],
    });
    expect(guestRange(venue).min).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// quickFacts guest pill — thousands separators (round 4 rule 1)
// ---------------------------------------------------------------------------

describe("quickFacts — guest pill formatting", () => {
  it("adds thousands separators (Field Museum's 1,500)", () => {
    const venue = makeVenue({ spaces: [space({ id: "hall" })], capacities: [tuple({ space_id: "hall", max: 1500 })] });
    const guests = quickFacts(venue).find((p) => p.icon === "guests")!;
    expect(guests.label).toBe("Up to 1,500 guests");
  });

  it("shows a min-max range with separators when a minimum is stated", () => {
    const venue = makeVenue({
      spine: spineWith({ capacity_min_guests: fact(25) }),
      spaces: [space({ id: "loft" })],
      capacities: [tuple({ space_id: "loft", layout: "cocktail_standing", tile: "cocktail", max: 1200 })],
    });
    const guests = quickFacts(venue).find((p) => p.icon === "guests")!;
    expect(guests.label).toBe("25 – 1,200 guests");
  });
});

// ---------------------------------------------------------------------------
// bandCapacityTuple / estimateCost — band vs DJ capacity (round 4 rule 9)
// ---------------------------------------------------------------------------

describe("bandCapacityTuple / estimateCost — band vs DJ capacity", () => {
  const venue = makeVenue({
    spaces: [space({ id: "loft" })],
    capacities: [
      tuple({ space_id: "loft", layout: "seated_with_dance", tile: "seated_dance", max: 150, condition: "live band", as_stated_label: "Seated (w/ band)" }),
      tuple({ space_id: "loft", layout: "seated_dinner", tile: "seated", max: 175, condition: "DJ", as_stated_label: "Seated (w/ DJ)" }),
    ],
    pricing: { archetype: "raw_space_byo", paths: [pathWith({})], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] },
  });

  it("picks the band tuple when input.band is true", () => {
    expect(bandCapacityTuple(venue, "loft", true)?.max).toBe(150);
  });

  it("picks the DJ tuple when input.band is false", () => {
    expect(bandCapacityTuple(venue, "loft", false)?.max).toBe(175);
  });

  it("estimateCost warns over_capacity against the band tuple's lower max once band is chosen", () => {
    const base: EstimateInput = { guests: 160, day: "sat", season: "peak", space_id: "loft", ceremonyOnSite: false, extras: [] };
    expect(estimateCost(venue, { ...base, band: true }).warnings).toContain("over_capacity");
    expect(estimateCost(venue, { ...base, band: false }).warnings).not.toContain("over_capacity");
  });
});

// ---------------------------------------------------------------------------
// policyRows
// ---------------------------------------------------------------------------

describe("policyRows", () => {
  it("returns all 13 rows, in the locked order, with the exact verbatim labels", () => {
    const rows = policyRows(makeVenue());
    expect(rows.map((r) => r.key)).toEqual([
      "catering",
      "bar",
      "rental_charge_type",
      "fb_minimum",
      "service_charge_pct",
      "parking",
      "day_of_coordinator",
      "payment_schedule",
      "cancellation",
      "event_insurance",
      "security",
      "vendor_access",
      "noise_curfew",
    ]);
    expect(rows.map((r) => r.label)).toEqual([
      "Catering",
      "Bar",
      "Venue rental charge type",
      "Food & beverage minimum",
      "Service charge",
      "Parking",
      "Day-of coordinator",
      "Payment schedule",
      "Cancellation / rescheduling",
      "Event insurance",
      "Security",
      "Vendor access (setup/teardown)",
      "Noise curfew",
    ]);
  });

  it("not_stated rows get the standard pill and stated: false", () => {
    const rows = policyRows(makeVenue());
    for (const r of rows) {
      expect(r.pill).toBe("Not stated (please confirm)");
      expect(r.stated).toBe(false);
    }
  });

  it("service_charge_pct of 0 renders as 'None', not 'Not stated'", () => {
    const rows = policyRows(makeVenue({ spine: spineWith({ service_charge_pct: fact(0) }) }));
    const row = rows.find((r) => r.key === "service_charge_pct")!;
    expect(row.pill).toBe("None");
    expect(row.stated).toBe(true);
  });

  it("conflicting rows get the 'Conflicting sources' pill and both values in the detail", () => {
    const rows = policyRows(
      makeVenue({
        spine: spineWith({
          bar: { status: "conflicting", candidates: [fact("byob"), fact("in_house")] },
        }),
      }),
    );
    const row = rows.find((r) => r.key === "bar")!;
    expect(row.pill).toBe("Conflicting sources");
    expect(row.detail).toContain("BYOB");
    expect(row.detail).toContain("In-house only");
    expect(row.stated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addOnAxes
// ---------------------------------------------------------------------------

function addOn(overrides: Partial<AddOn>): AddOn {
  return {
    id: "add-on",
    name: "Add-on",
    category: "Category",
    variant: null,
    group: "other",
    price: 100,
    price_max: null,
    unit: "flat",
    per_space_prices: null,
    applies_to: null,
    path_ids: null,
    condition: null,
    priceable: true,
    tax_pct_override: null,
    min_guests: null,
    as_stated_price: "$100",
    note: null,
    quote: "$100",
    source_url: src,
    snapshot_id: 1,
    ...overrides,
  };
}

describe("addOnAxes", () => {
  it("is 'card' for a single-axis add-on set (one category, no variants, no per-space prices)", () => {
    const addOns = [addOn({ id: "a1", category: "Parking" }), addOn({ id: "a2", category: "Rehearsal" })];
    expect(addOnAxes(addOns)).toBe("card");
  });

  it("is 'table' when a category varies by BOTH variant and per_space_prices", () => {
    const addOns = [
      addOn({ id: "d1", category: "Dance floor", variant: "White", per_space_prices: { pergola: 625, pavilion: 1725 } }),
      addOn({ id: "d2", category: "Dance floor", variant: "Black & white", per_space_prices: { pergola: 1000, pavilion: 2500 } }),
    ];
    expect(addOnAxes(addOns)).toBe("table");
  });
});

// ---------------------------------------------------------------------------
// fbPills
// ---------------------------------------------------------------------------

describe("fbPills", () => {
  it("never removes an extracted (grounded) pill", () => {
    const venue = makeVenue({
      food_beverage: { ...makeVenue().food_beverage, food_pills: [fact("all_inclusive")], bar_pills: [fact("all_inclusive")] },
    });
    expect(fbPills(venue)).toEqual({ food: ["all_inclusive"], bar: ["all_inclusive"] });
  });

  it("a corkage-named add-on implies BYO on the bar pill, additively", () => {
    const venue = makeVenue({
      food_beverage: { ...makeVenue().food_beverage, food_pills: [fact("all_inclusive")], bar_pills: [fact("all_inclusive")] },
      pricing: { ...makeVenue().pricing, add_ons: [addOn({ id: "corkage", name: "Corkage fee" })] },
    });
    // Round 4 rule 13: fixed pill order (BYO -> a la carte -> All-Inclusive), so the implied byo
    // pill sorts BEFORE all_inclusive regardless of which one was added second.
    expect(fbPills(venue)).toEqual({ food: ["all_inclusive"], bar: ["byo", "all_inclusive"] });
  });

  it("orders pills BYO -> a la carte -> All-Inclusive regardless of fixture/extraction order (round 4 rule 13)", () => {
    const venue = makeVenue({
      food_beverage: {
        ...makeVenue().food_beverage,
        food_pills: [fact("all_inclusive"), fact("a_la_carte"), fact("byo")],
        bar_pills: [fact("a_la_carte"), fact("byo")],
      },
    });
    expect(fbPills(venue)).toEqual({ food: ["byo", "a_la_carte", "all_inclusive"], bar: ["byo", "a_la_carte"] });
  });
});

// ---------------------------------------------------------------------------
// quickFacts
// ---------------------------------------------------------------------------

describe("quickFacts", () => {
  it("returns 4 pills by default, and a 5th only from differentiator.tagline", () => {
    const base = makeVenue({
      spine: spineWith({ setting: fact("both"), catering: fact("open"), bar: fact("byob") }),
      spaces: [space({ id: "loft" })],
      capacities: [tuple({ space_id: "loft", max: 200 })],
    });
    expect(quickFacts(base)).toHaveLength(4);

    const withTagline = makeVenue({
      ...base,
      differentiator: { title: "Sustainability", tagline: "LEED Platinum certified", groups: [], evidence: { source_url: src, snapshot_id: 1 } },
    });
    const pills = quickFacts(withTagline);
    expect(pills).toHaveLength(5);
    expect(pills[4]).toEqual({ icon: "sparkle", label: "LEED Platinum certified" });
  });

  it("bar pill reads 'In-house or BYO' when bar is in_house but bar_pills additively include byo (Diamond Garden shape)", () => {
    const venue = makeVenue({
      spine: spineWith({ bar: fact("in_house") }),
      food_beverage: { food_pills: [], bar_pills: [fact("byo")], caption: null, menus: [], bar_ladders: [], bar_min_guests: null, notes: [] },
    });
    const bar = quickFacts(venue).find((p) => p.icon === "bar")!;
    expect(bar.label).toBe("Bar: In-house or BYO");
  });

  it("keeps the plain 'In-house' bar pill when there's no byo pill", () => {
    const venue = makeVenue({ spine: spineWith({ bar: fact("in_house") }) });
    const bar = quickFacts(venue).find((p) => p.icon === "bar")!;
    expect(bar.label).toBe("Bar: In-house");
  });

  it("keeps '+ BYO (corkage)' wording for a venue that genuinely charges one", () => {
    const venue = makeVenue({
      spine: spineWith({ bar: fact("byo_with_corkage") }),
      food_beverage: { food_pills: [], bar_pills: [fact("byo")], caption: null, menus: [], bar_ladders: [], bar_min_guests: null, notes: [] },
    });
    const bar = quickFacts(venue).find((p) => p.icon === "bar")!;
    expect(bar.label).toBe("Bar: In-house + BYO");
  });
});

// ---------------------------------------------------------------------------
// estimateCost — pinned against the concept CostCalculator formulas
// ---------------------------------------------------------------------------

function ratesFor(overrides: Partial<Rates>): Rates {
  return emptyRates(overrides);
}

describe("estimateCost — Marchetti (150 guests, Pavilion, Saturday, Oro)", () => {
  const pavilion = space({ id: "pavilion" });
  const laPergola = space({ id: "la-pergola" });
  const capacities: CapacityTuple[] = [
    tuple({ space_id: "pavilion", max: 425, as_stated_label: "Seated" }),
    tuple({ space_id: "la-pergola", max: 180, as_stated_label: "Seated" }),
  ];
  const path: PricingPath = {
    id: "default",
    name: "Default",
    description: null,
    applies_to_spaces: "all",
    fixed_fees: [
      { applies_to: "space", space_id: "pavilion", day: "sat", season: null, amount: 6000, unit: "flat", label: "Venue rental: Pavilion, Saturday", includes: [], key: "pavilion-sat", quote: "$6,000", source_url: src, snapshot_id: 1 },
    ],
    per_guest_tiers: [
      { id: "oro", name: "Oro", per_guest: 235, day: null, season: null, inherits_from: "Argento", inclusions: [], bar_tier: null, min_guests: null, quote: "$235/guest", source_url: src, snapshot_id: 1 },
    ],
    minimums: [],
    required_staffing: null,
    rental_hours: null,
    year_surcharges: [],
    promotions: [],
    quote: "",
    source_url: src,
    snapshot_id: 1,
  };
  const ceremonyAddOn: AddOn = addOn({
    id: "ceremony-onsite",
    name: "On-site ceremony",
    category: "Ceremony fee",
    group: "ceremony",
    price: null,
    unit: "flat",
    per_space_prices: { pavilion: 2000, "la-pergola": 1000 },
    condition: "ceremony_on_site",
  });
  const rates = ratesFor({ service_charge_pct: 25, service_charge_base: "fb", sales_tax_pct: 11.75, sales_tax_base: "fb_and_rentals", sales_tax_source: "chicago_default" });

  const venue = makeVenue({
    spaces: [pavilion, laPergola],
    capacities,
    pricing: { archetype: "rental_plus_per_guest_packages", paths: [path], rates, add_ons: [ceremonyAddOn], required_third_party: [], notes: [] },
  });

  const baseInput: EstimateInput = { guests: 150, day: "sat", season: "peak", path_id: "default", tier_id: "oro", space_id: "pavilion", ceremonyOnSite: false, payment: "cash_check", extras: [] };

  it("totals $55,240 without the ceremony add-on", () => {
    const est = estimateCost(venue, baseInput);
    expect(est.total).toBe(55240);
    expect(est.warnings).not.toContain("no_path");
  });

  it("totals $57,475 with the on-site ceremony add-on selected", () => {
    const est = estimateCost(venue, { ...baseInput, ceremonyOnSite: true });
    expect(est.total).toBe(57475);
  });
});

describe("estimateCost — Greenhouse Loft (150 guests, peak Saturday, credit card)", () => {
  const path: PricingPath = {
    id: "default",
    name: "Default",
    description: null,
    applies_to_spaces: "all",
    fixed_fees: [
      { applies_to: "whole_venue", space_id: null, day: "sat", season: "peak", amount: 12000, unit: "flat", label: "Venue rental (peak season, Saturday)", includes: [], key: "peak-sat", quote: "$12,000", source_url: src, snapshot_id: 1 },
    ],
    per_guest_tiers: [],
    minimums: [],
    required_staffing: null,
    rental_hours: null,
    year_surcharges: [],
    promotions: [],
    quote: "",
    source_url: src,
    snapshot_id: 1,
  };
  const rates = ratesFor({ service_charge_pct: 0, sales_tax_pct: null, sales_tax_base: "included", sales_tax_source: "included", cc_fee_pct: 3.5 });
  const venue = makeVenue({
    spaces: [space({ id: "loft" })],
    capacities: [tuple({ space_id: "loft", max: 175 })],
    pricing: {
      archetype: "inquire_only",
      paths: [path],
      rates,
      add_ons: [],
      required_third_party: [{ name: "Event insurance", estimate_usd: 175, required: true, quote: "~$175", source_url: src, snapshot_id: 1 }],
      notes: [],
    },
  });

  it("totals $12,420 with credit card (3.5% cc fee, taxes included in the rental rate)", () => {
    const est = estimateCost(venue, { guests: 150, day: "sat", season: "peak", path_id: "default", ceremonyOnSite: false, payment: "credit_card", extras: [] });
    expect(est.total).toBe(12420);
  });

  it("lists required event insurance in not_included, not in the total", () => {
    const est = estimateCost(venue, { guests: 150, day: "sat", season: "peak", path_id: "default", ceremonyOnSite: false, payment: "credit_card", extras: [] });
    expect(est.not_included).toContain("Event insurance (~$175)");
  });
});

describe("estimateCost — LondonHouse (120 guests, Luxury, ceremony on-site)", () => {
  const path: PricingPath = {
    id: "default",
    name: "Default",
    description: null,
    applies_to_spaces: "all",
    fixed_fees: [], // "Included in package" -- no separate venue rental line
    per_guest_tiers: [
      { id: "luxury", name: "Luxury", per_guest: 260, day: null, season: null, inherits_from: "Elegance", inclusions: [], bar_tier: null, min_guests: null, quote: "$260/guest", source_url: src, snapshot_id: 1 },
    ],
    minimums: [],
    required_staffing: null,
    rental_hours: null,
    year_surcharges: [],
    promotions: [],
    quote: "",
    source_url: src,
    snapshot_id: 1,
  };
  const ceremonyAddOn = addOn({ id: "ceremony", name: "On-site ceremony fee", category: "Ceremony", group: "ceremony", price: 750, unit: "flat", condition: "ceremony_on_site", tax_pct_override: 15.75 });
  // Modeling note (see derive.test.ts's own report / README comment): LondonHouse's own
  // calculator taxes corkage on its own separately-rounded line even though the rate is the
  // SAME as the general sales tax rate (11.75%) -- not folded into the combined F&B+rentals
  // base the way Marchetti's rental add-ons are. We model that by giving corkage an explicit
  // tax_pct_override equal to the general rate, which is exactly what "tax_pct_override lines
  // get their own row" is for.
  const corkageAddOn = addOn({ id: "corkage", name: "Corkage fee", category: "Bar", group: "fb", price: 50, unit: "per_unit", tax_pct_override: 11.75 });
  const rates = ratesFor({ service_charge_pct: 25, service_charge_base: "fb", sales_tax_pct: 11.75, sales_tax_base: "fb_and_rentals", sales_tax_source: "stated" });
  const venue = makeVenue({
    spaces: [space({ id: "juliette" })],
    capacities: [tuple({ space_id: "juliette", max: 190 })],
    pricing: { archetype: "hotel_package", paths: [path], rates, add_ons: [ceremonyAddOn, corkageAddOn], required_third_party: [], notes: [] },
  });
  const baseInput: EstimateInput = { guests: 120, day: "sat", season: "peak", path_id: "default", tier_id: "luxury", space_id: "juliette", ceremonyOnSite: true, payment: "cash_check", extras: [] };

  it("totals $44,451 with the ceremony fee (its own 15.75% tax line) and no corkage", () => {
    const est = estimateCost(venue, baseInput);
    expect(est.total).toBe(44451);
  });

  it("totals $44,675 with 4 bottles of corkage added (its own separately-rounded tax line)", () => {
    const est = estimateCost(venue, { ...baseInput, extras: [{ add_on_id: "corkage", quantity: 4 }] });
    expect(est.total).toBe(44675);
  });
});

describe("estimateCost — Diamond Garden (two independent real pricing paths)", () => {
  const allInclusive: PricingPath = {
    id: "all-inclusive",
    name: "All-Inclusive",
    description: null,
    applies_to_spaces: "all",
    fixed_fees: [],
    per_guest_tiers: [
      { id: "sat-peak", name: "All-Inclusive (Saturday, peak)", per_guest: 84.95, day: "sat", season: "peak", inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "$84.95", source_url: src, snapshot_id: 1 },
      { id: "fri-peak", name: "All-Inclusive (Friday, peak)", per_guest: 76.95, day: "fri", season: "peak", inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "$76.95", source_url: src, snapshot_id: 1 },
    ],
    minimums: [
      { kind: "guest_minimum", day: null, season: null, amount: 150, quote: "150 guests general minimum", source_url: src, snapshot_id: 1 },
      { kind: "guest_minimum", day: "fri", season: null, amount: 125, quote: "125 guests on Fridays", source_url: src, snapshot_id: 1 },
    ],
    required_staffing: null,
    rental_hours: null,
    year_surcharges: [{ year: 2027, amount: 3, unit: "per_guest" }],
    promotions: [],
    quote: "",
    source_url: src,
    snapshot_id: 1,
  };
  const hallOnly: PricingPath = {
    id: "hall-rental-only",
    name: "Hall Rental Only",
    description: null,
    applies_to_spaces: "all",
    fixed_fees: [
      { applies_to: "whole_venue", space_id: null, day: "sat", season: "peak", amount: 6595, unit: "flat", label: "Hall rental (Saturday, peak)", includes: [], key: "sat-peak-flat", quote: "$6,595", source_url: src, snapshot_id: 1 },
    ],
    per_guest_tiers: [],
    minimums: [],
    required_staffing: { price_per_role: 225, bartender_per_guests: 150, other_roles: ["Door usher", "Maintenance", "Manager"], quote: "1 bartender every 150 guests", source_url: src, snapshot_id: 1 },
    rental_hours: null,
    year_surcharges: [{ year: 2027, amount: 300, unit: "flat" }],
    promotions: [],
    quote: "",
    source_url: src,
    snapshot_id: 1,
  };
  const rates = ratesFor({ sales_tax_source: "unknown" }); // "not stated" -- no sales tax line
  const venue = makeVenue({
    spaces: [space({ id: "main-hall" })],
    capacities: [tuple({ space_id: "main-hall", layout: "seated_with_dance", tile: "seated_dance", max: 268 })],
    pricing: { archetype: "mixed", paths: [allInclusive, hallOnly], rates, add_ons: [], required_third_party: [], notes: [] },
  });

  it("All-Inclusive: 150 guests, Saturday, peak -> exactly $12,742.50, no tax line", () => {
    const est = estimateCost(venue, { guests: 150, day: "sat", season: "peak", path_id: "all-inclusive", tier_id: "sat-peak", ceremonyOnSite: false, payment: "cash_check", extras: [] });
    expect(est.total).toBe(12742.5);
    expect(est.groups.find((g) => g.group === "taxes")).toBeUndefined();
    expect(est.assumptions).toContain("Taxes are not stated for this venue.");
  });

  it("All-Inclusive: 120 guests on Friday -> $9,234 and under_minimum (Friday's own 125-guest floor)", () => {
    const est = estimateCost(venue, { guests: 120, day: "fri", season: "peak", path_id: "all-inclusive", tier_id: "fri-peak", ceremonyOnSite: false, payment: "cash_check", extras: [] });
    expect(est.total).toBe(9234);
    expect(est.warnings).toContain("under_minimum");
  });

  it("Hall Rental Only: 150 guests -> $7,495 (flat rental + 1 bartender + 3 other roles)", () => {
    const est = estimateCost(venue, { guests: 150, day: "sat", season: "peak", path_id: "hall-rental-only", ceremonyOnSite: false, payment: "cash_check", extras: [] });
    expect(est.total).toBe(7495);
  });

  it("Hall Rental Only: 151 guests -> $7,720 (a 2nd bartender is required past 150 guests)", () => {
    const est = estimateCost(venue, { guests: 151, day: "sat", season: "peak", path_id: "hall-rental-only", ceremonyOnSite: false, payment: "cash_check", extras: [] });
    expect(est.total).toBe(7720);
  });
});

describe("estimateCost — no pricing paths at all (Field Museum: inquire-only, nothing to compute)", () => {
  it("returns total 0 and the no_path warning", () => {
    const venue = makeVenue({ pricing: { archetype: "inquire_only", paths: [], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });
    const est = estimateCost(venue, { guests: 150, day: "sat", season: "peak", ceremonyOnSite: false, payment: "cash_check", extras: [] });
    expect(est.total).toBe(0);
    expect(est.warnings).toEqual(["no_path"]);
    expect(est.groups).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rules added 2026-09-13 after the first golden renders (Fable review)
// ---------------------------------------------------------------------------

function pathWith(overrides: Partial<PricingPath>): PricingPath {
  return {
    id: "default",
    name: "Default",
    description: null,
    applies_to_spaces: "all",
    fixed_fees: [],
    per_guest_tiers: [],
    minimums: [],
    required_staffing: null,
    rental_hours: null,
    year_surcharges: [],
    promotions: [],
    quote: "",
    source_url: src,
    snapshot_id: 1,
    ...overrides,
  };
}

const feeBase = { unit: "flat" as const, includes: [] as string[], quote: "$", source_url: src, snapshot_id: 1 };

describe("estimateCost — whole-venue fees are an alternative to a space fee, never an addition", () => {
  const twoRooms = makeVenue({
    spaces: [space({ id: "pavilion" }), space({ id: "la-pergola" })],
    capacities: [tuple({ space_id: "pavilion", max: 425 }), tuple({ space_id: "la-pergola", max: 180 })],
    pricing: {
      archetype: "rental_plus_per_guest_packages",
      paths: [
        pathWith({
          fixed_fees: [
            { ...feeBase, applies_to: "space", space_id: "pavilion", day: "sat", season: null, amount: 6000, label: "Pavilion Saturday", key: "pav-sat" },
            { ...feeBase, applies_to: "space", space_id: "la-pergola", day: "sat", season: null, amount: 3000, label: "La Pergola Saturday", key: "lp-sat" },
            { ...feeBase, applies_to: "whole_venue", space_id: null, day: "sat", season: null, amount: 9000, label: "Both spaces Saturday", key: "both-sat" },
          ],
        }),
      ],
      rates: emptyRates(),
      add_ons: [],
      required_third_party: [],
      notes: [],
    },
  });
  const input: EstimateInput = { guests: 100, day: "sat", season: "any", space_id: "pavilion", ceremonyOnSite: false, extras: [] };

  it("charges only the chosen space's fee when that space has its own fee on the path (6,000, not 15,000)", () => {
    expect(estimateCost(twoRooms, input).total).toBe(6000);
  });

  it("charges the whole-venue fee when the couple books the whole venue", () => {
    expect(estimateCost(twoRooms, { ...input, space_id: "whole_venue" }).total).toBe(9000);
  });

  it("single-space venues with only whole-venue fees still charge them (Greenhouse shape)", () => {
    const oneRoom = makeVenue({
      spaces: [space({ id: "loft" })],
      capacities: [tuple({ space_id: "loft", max: 175 })],
      pricing: {
        archetype: "raw_space_byo",
        paths: [pathWith({ fixed_fees: [{ ...feeBase, applies_to: "whole_venue", space_id: null, day: "sat", season: "peak", amount: 12000, label: "Peak Saturday", key: "peak-sat" }] })],
        rates: emptyRates({ sales_tax_source: "included" }),
        add_ons: [],
        required_third_party: [],
        notes: [],
      },
    });
    expect(estimateCost(oneRoom, { guests: 100, day: "sat", season: "peak", ceremonyOnSite: false, extras: [] }).total).toBe(12000);
  });
});

describe("estimateCost — day matching", () => {
  const venue = makeVenue({
    spaces: [space({ id: "hall" })],
    capacities: [tuple({ space_id: "hall", max: 268 })],
    pricing: {
      archetype: "raw_space_byo",
      paths: [
        pathWith({
          fixed_fees: [
            { ...feeBase, applies_to: "whole_venue", space_id: null, day: "weekday", season: "peak", amount: 2400, label: "Weekday", key: "wk" },
            { ...feeBase, applies_to: "whole_venue", space_id: null, day: "fri", season: "peak", amount: 4595, label: "Friday", key: "fri" },
            { ...feeBase, applies_to: "whole_venue", space_id: null, day: "sun", season: "peak", amount: 4595, label: "Sunday", key: "sun" },
          ],
        }),
      ],
      rates: emptyRates(),
      add_ons: [],
      required_third_party: [],
      notes: [],
    },
  });
  const base: EstimateInput = { guests: 100, day: "fri", season: "peak", ceremonyOnSite: false, extras: [] };

  it("'weekday' means Mon-Thu, so a Friday fee never stacks on a weekday fee", () => {
    expect(estimateCost(venue, base).total).toBe(4595);
    expect(estimateCost(venue, { ...base, day: "tue" }).total).toBe(2400);
    expect(estimateCost(venue, { ...base, day: "sun" }).total).toBe(4595);
  });
});

describe("estimateCost — F&B minimums and the tax base", () => {
  const tier = { id: "t", name: "Package", per_guest: 100, day: null, season: null, inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "$100", source_url: src, snapshot_id: 1 };

  it("warns under_fb_minimum when a published F&B minimum exceeds the F&B subtotal", () => {
    const venue = makeVenue({
      pricing: {
        archetype: "rental_plus_fb_minimum",
        paths: [pathWith({ per_guest_tiers: [tier], minimums: [{ kind: "fb_minimum", day: "sat", season: "peak", amount: 15000, quote: "$15,000 minimum", source_url: src, snapshot_id: 1 }] })],
        rates: emptyRates(),
        add_ons: [],
        required_third_party: [],
        notes: [],
      },
    });
    const est = estimateCost(venue, { guests: 100, day: "sat", season: "peak", ceremonyOnSite: false, extras: [] });
    expect(est.warnings).toContain("under_fb_minimum");
    expect(estimateCost(venue, { guests: 200, day: "sat", season: "peak", ceremonyOnSite: false, extras: [] }).warnings).not.toContain("under_fb_minimum");
  });

  it("lists an unpublished F&B minimum under not_included (LondonHouse shape)", () => {
    const venue = makeVenue({
      spine: spineWith({ fb_minimum: fact({ applies: true, amount_usd: null, detail: "Varies by date" }) }),
      pricing: { archetype: "hotel_package", paths: [pathWith({ per_guest_tiers: [tier] })], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] },
    });
    const est = estimateCost(venue, { guests: 100, day: "sat", season: "peak", ceremonyOnSite: false, extras: [] });
    expect(est.not_included).toContain("Food & beverage minimum (amount not published)");
  });

  it("sales_tax_base 'all' taxes the flat venue rental too; the default base does not", () => {
    const build = (base: Rates["sales_tax_base"]) =>
      makeVenue({
        spaces: [space({ id: "hall" })],
        capacities: [tuple({ space_id: "hall", max: 200 })],
        pricing: {
          archetype: "rental_plus_per_guest_packages",
          paths: [pathWith({ fixed_fees: [{ ...feeBase, applies_to: "whole_venue", space_id: null, day: null, season: null, amount: 1000, label: "Rental", key: "r" }], per_guest_tiers: [tier] })],
          rates: emptyRates({ sales_tax_pct: 10, sales_tax_base: base, sales_tax_source: "stated" }),
          add_ons: [],
          required_third_party: [],
          notes: [],
        },
      });
    const input: EstimateInput = { guests: 10, day: "sat", season: "peak", ceremonyOnSite: false, extras: [] };
    expect(estimateCost(build("fb_and_rentals"), input).total).toBe(1000 + 1000 + 100);
    expect(estimateCost(build("all"), input).total).toBe(1000 + 1000 + 200);
  });
});

describe("calculatorAxes — space axis only when pricing varies by space", () => {
  const tier = { id: "t", name: "Package", per_guest: 100, day: null, season: null, inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "$100", source_url: src, snapshot_id: 1 };
  const twoSpaces = [space({ id: "a" }), space({ id: "b" })];

  it("omits 'space' for a two-room venue with one space-agnostic package price (LondonHouse)", () => {
    const venue = makeVenue({ spaces: twoSpaces, pricing: { archetype: "hotel_package", paths: [pathWith({ per_guest_tiers: [tier] })], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });
    expect(calculatorAxes(venue)).not.toContain("space");
  });

  it("includes 'space' when a fee is space-scoped (Marchetti)", () => {
    const venue = makeVenue({
      spaces: twoSpaces,
      pricing: {
        archetype: "rental_plus_per_guest_packages",
        paths: [pathWith({ fixed_fees: [{ ...feeBase, applies_to: "space", space_id: "a", day: "sat", season: null, amount: 6000, label: "A Saturday", key: "a-sat" }] })],
        rates: emptyRates(),
        add_ons: [],
        required_third_party: [],
        notes: [],
      },
    });
    expect(calculatorAxes(venue)).toContain("space");
  });
});

// ---------------------------------------------------------------------------
// Round 3 (Diamond Garden) — path_ids, tier-by-name, ceremony-fee-gated axis, selectTier
// day/season precedence, defaultAxes guest minimum, selectableAddOns, bar-pill-aware policy text.
// ---------------------------------------------------------------------------

describe("calculatorAxes — tier axis only when tier NAMES differ; ceremony axis only with a real fee", () => {
  const sameNameTiers = [
    { id: "peak-sat", name: "All-Inclusive", per_guest: 84.95, day: "sat" as const, season: "peak" as const, inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "q", source_url: src, snapshot_id: 1 },
    { id: "peak-fri", name: "All-Inclusive", per_guest: 76.95, day: "fri" as const, season: "peak" as const, inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "q", source_url: src, snapshot_id: 1 },
  ];
  const differentNameTiers = [
    { id: "oro", name: "Oro", per_guest: 235, day: null, season: null, inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "q", source_url: src, snapshot_id: 1 },
    { id: "argento", name: "Argento", per_guest: 200, day: null, season: null, inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "q", source_url: src, snapshot_id: 1 },
  ];

  it("omits 'tier' when every tier shares one name but different ids (Diamond Garden's 8 day/season rows)", () => {
    const venue = makeVenue({ pricing: { archetype: "mixed", paths: [pathWith({ per_guest_tiers: sameNameTiers })], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });
    expect(calculatorAxes(venue)).not.toContain("tier");
  });

  it("includes 'tier' when tiers genuinely differ by name (Marchetti's Oro/Argento)", () => {
    const venue = makeVenue({ pricing: { archetype: "rental_plus_per_guest_packages", paths: [pathWith({ per_guest_tiers: differentNameTiers })], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });
    expect(calculatorAxes(venue)).toContain("tier");
  });

  it("omits 'ceremony' when ceremony_on_site is stated but no add-on actually charges for it (Diamond Garden: free ceremony)", () => {
    const venue = makeVenue({
      spine: spineWith({ ceremony_on_site: fact(true) }),
      pricing: { archetype: "mixed", paths: [pathWith({})], rates: emptyRates(), add_ons: [addOn({ id: "backdrop", group: "other", category: "Ceremony", condition: null })], required_third_party: [], notes: [] },
    });
    expect(calculatorAxes(venue)).not.toContain("ceremony");
  });

  it("includes 'ceremony' when a real ceremony-fee add-on exists", () => {
    const venue = makeVenue({
      pricing: { archetype: "hotel_package", paths: [pathWith({})], rates: emptyRates(), add_ons: [addOn({ id: "fee", group: "ceremony", condition: "ceremony_on_site" })], required_third_party: [], notes: [] },
    });
    expect(calculatorAxes(venue)).toContain("ceremony");
  });
});

describe("estimateCost — ceremony auto-apply is scoped to condition:'ceremony_on_site' exactly", () => {
  it("does not auto-apply a group:'ceremony' add-on with a null condition (Diamond Garden's old bug: 5 upgrades all firing at once)", () => {
    const venue = makeVenue({
      pricing: {
        archetype: "mixed",
        paths: [pathWith({})],
        rates: emptyRates(),
        add_ons: [addOn({ id: "backdrop", group: "ceremony", condition: null, price: 250 })],
        required_third_party: [],
        notes: [],
      },
    });
    const est = estimateCost(venue, { guests: 100, day: "sat", season: "peak", ceremonyOnSite: true, extras: [] });
    expect(est.total).toBe(0);
  });
});

describe("estimateCost — path_ids scope an extra to the paths it's actually relevant to", () => {
  const inScope = addOn({ id: "food-bronze", path_ids: ["hall-only"], price: 15.95, unit: "per_guest" });
  const outOfScope = addOn({ id: "also-food", path_ids: ["hall-only"], price: 100, unit: "flat" });
  const venue = makeVenue({
    pricing: {
      archetype: "mixed",
      paths: [pathWith({ id: "hall-only" }), pathWith({ id: "all-inclusive" })],
      rates: emptyRates(),
      add_ons: [inScope, outOfScope],
      required_third_party: [],
      notes: [],
    },
  });

  it("prices a path_ids-scoped extra when the matching path is selected", () => {
    const est = estimateCost(venue, { guests: 100, day: "sat", season: "peak", path_id: "hall-only", ceremonyOnSite: false, extras: [{ add_on_id: "food-bronze", quantity: 1 }] });
    expect(est.total).toBe(1595);
  });

  it("silently drops the same extra on a path it doesn't apply to (no warning — it's a stale selection, not an error)", () => {
    const est = estimateCost(venue, { guests: 100, day: "sat", season: "peak", path_id: "all-inclusive", ceremonyOnSite: false, extras: [{ add_on_id: "food-bronze", quantity: 1 }] });
    expect(est.total).toBe(0);
    expect(est.warnings).toEqual([]);
  });
});

describe("selectableAddOns — path_ids-aware, excludes auto-applied ceremony fees", () => {
  const venue = makeVenue({
    pricing: {
      archetype: "mixed",
      paths: [pathWith({ id: "hall-only" }), pathWith({ id: "all-inclusive" })],
      rates: emptyRates(),
      add_ons: [
        addOn({ id: "food-bronze", path_ids: ["hall-only"], price: 15.95 }),
        addOn({ id: "uplights", path_ids: null, price: 25 }),
        addOn({ id: "ceremony-fee", group: "ceremony", condition: "ceremony_on_site", price: 750 }),
        addOn({ id: "backdrop", group: "other", condition: null, price: 250 }),
      ],
      required_third_party: [],
      notes: [],
    },
  });

  it("returns path-relevant + path-agnostic add-ons, excluding the auto-applied ceremony fee", () => {
    const ids = selectableAddOns(venue, "hall-only").map((a) => a.id);
    expect(ids).toEqual(["food-bronze", "uplights", "backdrop"]);
  });

  it("excludes a path-scoped add-on once a different path is selected", () => {
    const ids = selectableAddOns(venue, "all-inclusive").map((a) => a.id);
    expect(ids).toEqual(["uplights", "backdrop"]);
  });
});

// Round 6: a day/season-priced selection group (Diamond Garden's extra-hour rows) only offers
// its matching variant(s) once a real Day/Season is chosen, and estimateCost never prices a stale
// selection left over from before the couple changed Day/Season.
describe("selectableAddOns / estimateCost — day/season-priced add-ons", () => {
  const extraHour = (day: "weekday" | "sat", season: "off" | "peak", variant: string, price: number) =>
    addOn({ id: `eh-${day}-${season}-${variant}`, selection_group: "extra-hour", category_std: "time", price, day, season, variant });
  const addOns = [
    extraHour("weekday", "off", "no-servers", 700),
    extraHour("sat", "off", "no-servers", 800),
    extraHour("weekday", "peak", "no-servers", 1000),
    extraHour("sat", "peak", "no-servers", 1200),
    extraHour("sat", "peak", "with-servers", 1400),
  ];
  const venue = makeVenue({
    pricing: { archetype: "mixed", paths: [pathWith({ id: "hall-only" })], rates: emptyRates(), add_ons: addOns, required_third_party: [], notes: [] },
  });

  it("scopes options to the current day/season (peak Saturday sees only the two peak-Saturday rows)", () => {
    const ids = selectableAddOns(venue, "hall-only", "sat", "peak").map((a) => a.id);
    expect(ids).toEqual(["eh-sat-peak-no-servers", "eh-sat-peak-with-servers"]);
  });

  it("scopes to a different day/season independently (off-season weekday)", () => {
    const ids = selectableAddOns(venue, "hall-only", "weekday", "off").map((a) => a.id);
    expect(ids).toEqual(["eh-weekday-off-no-servers"]);
  });

  it("with no day/season passed, every priced add-on is still offered (back-compat)", () => {
    expect(selectableAddOns(venue, "hall-only").length).toBe(addOns.length);
  });

  it("estimateCost prices a day/season-matching selection", () => {
    const est = estimateCost(venue, {
      guests: 100,
      day: "sat",
      season: "peak",
      path_id: "hall-only",
      ceremonyOnSite: false,
      extras: [{ add_on_id: "eh-sat-peak-with-servers", quantity: 1 }],
    });
    expect(est.total).toBe(1400);
  });

  it("estimateCost silently drops a stale day/season selection left over from before the axes changed", () => {
    const est = estimateCost(venue, {
      guests: 100,
      day: "weekday",
      season: "off",
      path_id: "hall-only",
      ceremonyOnSite: false,
      extras: [{ add_on_id: "eh-sat-peak-with-servers", quantity: 1 }],
    });
    expect(est.total).toBe(0);
    expect(est.warnings).toEqual([]);
  });
});

describe("selectTier — a pinned tier_id that doesn't match the current day/season is ignored", () => {
  const tiers = [
    { id: "sat-peak", name: "All-Inclusive", per_guest: 84.95, day: "sat" as const, season: "peak" as const, inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "q", source_url: src, snapshot_id: 1 },
    { id: "fri-peak", name: "All-Inclusive", per_guest: 76.95, day: "fri" as const, season: "peak" as const, inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "q", source_url: src, snapshot_id: 1 },
  ];
  const venue = makeVenue({ pricing: { archetype: "mixed", paths: [pathWith({ per_guest_tiers: tiers })], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });

  it("honors the pinned tier_id when it matches the current day/season", () => {
    const est = estimateCost(venue, { guests: 100, day: "sat", season: "peak", tier_id: "sat-peak", ceremonyOnSite: false, extras: [] });
    expect(est.groups.find((g) => g.group === "fb")!.lines[0].amount).toBe(8495);
  });

  it("ignores a stale tier_id and falls back to day/season matching once the day changes (Diamond Garden's Day/Season pills fix)", () => {
    const est = estimateCost(venue, { guests: 100, day: "fri", season: "peak", tier_id: "sat-peak", ceremonyOnSite: false, extras: [] });
    expect(est.groups.find((g) => g.group === "fb")!.lines[0].amount).toBe(7695);
  });
});

describe("defaultAxes — guests default to the default path's own guest minimum, when it states one", () => {
  it("uses the path's general guest minimum instead of the flat 100 fallback", () => {
    const venue = makeVenue({
      pricing: {
        archetype: "mixed",
        paths: [pathWith({ minimums: [{ kind: "guest_minimum", day: null, season: null, amount: 150, quote: "q", source_url: src, snapshot_id: 1 }] })],
        rates: emptyRates(),
        add_ons: [],
        required_third_party: [],
        notes: [],
      },
    });
    expect(defaultAxes(venue).guests).toBe(150);
  });

  it("falls back to 100 when the default path states no guest minimum", () => {
    const venue = makeVenue({ pricing: { archetype: "mixed", paths: [pathWith({})], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });
    expect(defaultAxes(venue).guests).toBe(100);
  });

  it("a fixture's own default_axes.guests still wins over the path's minimum", () => {
    const venue = makeVenue({
      pricing: {
        archetype: "mixed",
        default_axes: { guests: 150 },
        paths: [pathWith({ minimums: [{ kind: "guest_minimum", day: null, season: null, amount: 100, quote: "q", source_url: src, snapshot_id: 1 }] })],
        rates: emptyRates(),
        add_ons: [],
        required_third_party: [],
        notes: [],
      },
    });
    expect(defaultAxes(venue).guests).toBe(150);
  });
});

describe("describePolicyValue (via policyRows) — bar 'in_house' + a real byo pill reads as 'In-house or BYO'", () => {
  it("renders 'In-house or BYO', not a bare 'In-house only' or a false '(corkage)'", () => {
    const venue = makeVenue({
      spine: spineWith({ bar: fact("in_house") }),
      food_beverage: { food_pills: [], bar_pills: [fact("byo")], caption: null, menus: [], bar_ladders: [], bar_min_guests: null, notes: [] },
    });
    const row = policyRows(venue).find((r) => r.key === "bar")!;
    expect(row.pill).toBe("In-house or BYO");
  });

  it("keeps the plain 'In-house only' pill when there's no byo pill", () => {
    const venue = makeVenue({ spine: spineWith({ bar: fact("in_house") }) });
    const row = policyRows(venue).find((r) => r.key === "bar")!;
    expect(row.pill).toBe("In-house only");
  });

  it("keeps '(corkage)' wording for a venue that genuinely charges one", () => {
    const venue = makeVenue({
      spine: spineWith({ bar: fact("byo_with_corkage") }),
      food_beverage: { food_pills: [], bar_pills: [fact("byo")], caption: null, menus: [], bar_ladders: [], bar_min_guests: null, notes: [] },
    });
    const row = policyRows(venue).find((r) => r.key === "bar")!;
    expect(row.pill).toBe("In-house + BYO (corkage)");
  });
});

describe("deriveStandardFaqs — bar 'in_house' + a real byo pill answers accurately", () => {
  it("says 'Partially' with no invented corkage fee when the venue's bar_pills include byo", () => {
    const venue = makeVenue({
      spine: spineWith({ bar: fact("in_house") }),
      food_beverage: { food_pills: [], bar_pills: [fact("byo")], caption: null, menus: [], bar_ladders: [], bar_min_guests: null, notes: [] },
    });
    const [, bar] = deriveStandardFaqs(venue);
    expect(bar.answer).not.toContain("corkage");
    expect(bar.answer).toContain("Partially");
  });
});

describe("policyDetail (via policyRows) — de-dupes payment_schedule/vendor_access, surfaces parking's quote", () => {
  it("omits a balance_due that's identical to (or a strict substring of) the deposit line", () => {
    const venue = makeVenue({ spine: spineWith({ payment_schedule: fact({ deposit: "$1,000 deposit; monthly payments available", balance_due: "$1,000 deposit" }) }) });
    const row = policyRows(venue).find((r) => r.key === "payment_schedule")!;
    expect(row.detail).toBeNull();
  });

  it("keeps a genuinely distinct balance_due", () => {
    const venue = makeVenue({ spine: spineWith({ payment_schedule: fact({ deposit: "$1,000 deposit", balance_due: "Balance due 60 days before the event" }) }) });
    const row = policyRows(venue).find((r) => r.key === "payment_schedule")!;
    expect(row.detail).toBe("Balance due 60 days before the event");
  });

  it("omits a setup-hours detail already stated in the vendor_access summary", () => {
    const venue = makeVenue({
      spine: spineWith({ vendor_access: fact({ summary: "2 hours before the event for setup", setup_hours_before: 2, teardown_hours_after: null }) }),
    });
    const row = policyRows(venue).find((r) => r.key === "vendor_access")!;
    expect(row.detail).toBeNull();
  });

  it("surfaces parking's own quote as its detail line (ParkingPolicy is a bare enum with nowhere else to carry it)", () => {
    const venue = makeVenue({ spine: spineWith({ parking: fact("included", "2 free lots, 75+ spaces") }) });
    const row = policyRows(venue).find((r) => r.key === "parking")!;
    expect(row.pill).toBe("Included");
    expect(row.detail).toBe("2 free lots, 75+ spaces");
  });
});

// ---------------------------------------------------------------------------
// calculatorRange (round 5 rule 8) — the "example range" bar's floor/ceiling numbers
// ---------------------------------------------------------------------------

describe("calculatorRange", () => {
  it("returns null when the venue has no pricing path at all", () => {
    const venue = makeVenue({ pricing: { archetype: "inquire_only", paths: [], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });
    expect(calculatorRange(venue, undefined)).toBeNull();
  });

  it("varies guests, day and named tiers between the cheap and pricey ends (Marchetti's shape)", () => {
    const argento = { id: "argento", name: "Argento", per_guest: 200, day: "sun" as const, season: null, inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "$200", source_url: src, snapshot_id: 1 };
    const platino = { id: "platino", name: "Platino", per_guest: 300, day: "sat" as const, season: null, inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "$300", source_url: src, snapshot_id: 1 };
    const venue = makeVenue({
      spine: spineWith({ capacity_min_guests: fact(50) }),
      spaces: [space({ id: "pavilion" })],
      capacities: [tuple({ space_id: "pavilion", layout: "seated_dinner", tile: "seated", max: 425 })],
      pricing: { archetype: "rental_plus_per_guest_packages", paths: [pathWith({ per_guest_tiers: [argento, platino] })], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] },
    });
    const range = calculatorRange(venue, undefined)!;
    expect(range.lowInput).toEqual({ guests: 50, day: "sun", tierName: "Argento" });
    expect(range.highInput).toEqual({ guests: 425, day: "sat", tierName: "Platino" });
    expect(range.low).toBe(50 * 200);
    expect(range.high).toBe(425 * 300);
  });

  it("omits the day from both ends when the path doesn't vary by day at all (LondonHouse's shape)", () => {
    const elegance = { id: "elegance", name: "Elegance", per_guest: 150, day: null, season: null, inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "$150", source_url: src, snapshot_id: 1 };
    const opulence = { id: "opulence", name: "Opulence", per_guest: 220, day: null, season: null, inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "$220", source_url: src, snapshot_id: 1 };
    const venue = makeVenue({
      spaces: [space({ id: "grand" })],
      capacities: [tuple({ space_id: "grand", layout: "seated_dinner", tile: "seated", max: 190 })],
      pricing: { archetype: "rental_plus_per_guest_packages", paths: [pathWith({ per_guest_tiers: [elegance, opulence] })], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] },
    });
    const range = calculatorRange(venue, undefined)!;
    expect(range.lowInput.day).toBeNull();
    expect(range.highInput.day).toBeNull();
    expect(range.lowInput.tierName).toBe("Elegance");
    expect(range.highInput.tierName).toBe("Opulence");
  });

  it("omits the tier name when the path has only one named tier", () => {
    const only = { id: "only", name: "All-Inclusive", per_guest: 100, day: null, season: null, inherits_from: null, inclusions: [], bar_tier: null, min_guests: null, quote: "$100", source_url: src, snapshot_id: 1 };
    const venue = makeVenue({
      spaces: [space({ id: "hall" })],
      capacities: [tuple({ space_id: "hall", layout: "seated_dinner", tile: "seated", max: 300 })],
      pricing: { archetype: "all_inclusive_per_guest", paths: [pathWith({ per_guest_tiers: [only] })], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] },
    });
    const range = calculatorRange(venue, undefined)!;
    expect(range.lowInput.tierName).toBeNull();
    expect(range.highInput.tierName).toBeNull();
  });

  it("holds the path fixed at whichever id the caller passes", () => {
    const cheapPath = pathWith({ id: "hall-only", name: "Hall Only", fixed_fees: [{ ...feeBase, applies_to: "whole_venue", space_id: null, day: null, season: null, amount: 2100, label: "Rental", key: "r1" }] });
    const pricePath = pathWith({ id: "all-inclusive", name: "All-Inclusive", per_guest_tiers: [] });
    const venue = makeVenue({
      spaces: [space({ id: "hall" })],
      capacities: [tuple({ space_id: "hall", layout: "seated_dinner", tile: "seated", max: 150 })],
      pricing: { archetype: "mixed", paths: [cheapPath, pricePath], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] },
    });
    expect(calculatorRange(venue, "hall-only")!.low).toBe(2100);
  });
});
