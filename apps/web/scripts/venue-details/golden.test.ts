import { describe, expect, it } from "vitest";

import { GOLDEN_ACCOUNT_IDS, GOLDEN_SLUGS, getGolden, isGoldenSlug, type GoldenSlug } from "../../lib/venueDetails/golden";
import { defaultAxes, estimateCost, headlineCapacity } from "../../lib/venueDetails/derive";
import { isCompareReady, isExcellent } from "../../lib/venueDetails/tiers";
import {
  ADD_ON_CATEGORIES_STD,
  BAR_POLICIES,
  CATERING_POLICIES,
  CEREMONY_FEE_POLICIES,
  COAT_CHECK,
  COORDINATOR_POLICIES,
  INSURANCE_POLICIES,
  LAYOUTS,
  PARKING_POLICIES,
  PRICING_ARCHETYPES,
  RENTAL_CHARGE_TYPES,
  SECURITY_POLICIES,
  SETTINGS,
  SPINE_KEYS,
  VENDOR_LIST_POLICIES,
  VENUE_KINDS,
  type VenueDetailsV3,
} from "../../lib/venueDetails/types";

const ENUM_BY_SPINE_KEY: Partial<Record<string, readonly string[]>> = {
  venue_kind: VENUE_KINDS,
  setting: SETTINGS,
  catering: CATERING_POLICIES,
  bar: BAR_POLICIES,
  rental_charge_type: RENTAL_CHARGE_TYPES,
  parking: PARKING_POLICIES,
  day_of_coordinator: COORDINATOR_POLICIES,
  event_insurance: INSURANCE_POLICIES,
  security: SECURITY_POLICIES,
  vendor_list_policy: VENDOR_LIST_POLICIES,
  coat_check: COAT_CHECK,
  ceremony_fee: CEREMONY_FEE_POLICIES,
  pricing_archetype: PRICING_ARCHETYPES,
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Resolves a stable `field_path` (the grammar shared with merge.ts/diff.ts) against a document,
 * for the "every eval field_path resolves" test. Returns whether the path names a real field. */
function resolves(d: VenueDetailsV3, path: string): boolean {
  const parts = path.split("/").filter(Boolean);
  const [root, id, sub, ...rest] = parts;

  if (root === "spine") return id != null && id in d.spine;
  if (root === "capacities") return d.capacities.some((c) => `${c.space_id}:${c.layout}` === id);
  if (root === "spaces") return d.spaces.some((s) => s.id === id);
  if (root === "about") return true;
  if (root === "differentiator") return true;
  if (root === "faqs") return d.faqs.some((fq) => slugify(fq.question) === id);
  if (root === "resources") return d.resources.some((r) => r.id === id);
  if (root === "vendor_lists") return d.vendor_lists.some((vl) => slugify(vl.label) === id);
  if (root === "pricing" && id === "rates") return d.pricing.rates != null;
  if (root === "pricing" && id === "add_ons") return d.pricing.add_ons.some((a) => a.id === sub);
  if (root === "pricing" && id === "notes") return d.pricing.notes[Number(sub)] != null;
  if (root === "pricing" && id === "paths") {
    const path_ = d.pricing.paths.find((p) => p.id === sub);
    if (!path_) return false;
    if (rest[0] === "fixed_fees") return path_.fixed_fees.some((fee) => fee.key === rest[1]);
    if (rest[0] === "per_guest_tiers") return path_.per_guest_tiers.some((t) => t.id === rest[1]);
    if (rest[0] === "minimums") return path_.minimums.some((m) => `${m.kind}:${m.day}:${m.season}` === rest[1]);
    if (rest[0] === "terms") return (path_.terms?.length ?? 0) > 0;
    return true;
  }
  if (root === "food_beverage") {
    if (!id) return true;
    if (id === "menus") return d.food_beverage.menus.some((m) => slugify(m.name) === sub);
    if (id === "bar_ladders") return d.food_beverage.bar_ladders.some((b) => slugify(b.name) === sub);
    if (id === "notes") return d.food_beverage.notes[Number(sub)] != null;
    if (id === "food_note") return d.food_beverage.food_note != null;
    if (id === "bar_note") return d.food_beverage.bar_note != null;
    return false;
  }
  if (root === "inclusions") return d.inclusions.some((i) => slugify(i.label_raw) === id);
  return false;
}

describe("golden fixtures — schema invariants", () => {
  for (const slug of GOLDEN_SLUGS) {
    const d = getGolden(slug)!;

    it(`${slug}: exists and is schema_version 3`, () => {
      expect(d).toBeTruthy();
      expect(d.schema_version).toBe(3);
    });

    it(`${slug}: account_id matches GOLDEN_ACCOUNT_IDS`, () => {
      expect(d.account_id).toBe(GOLDEN_ACCOUNT_IDS[slug]);
    });

    it(`${slug}: every Tri on the spine has a valid status`, () => {
      for (const key of SPINE_KEYS) {
        const tri = d.spine[key];
        expect(["stated", "not_stated", "conflicting"]).toContain(tri.status);
      }
    });

    it(`${slug}: SPINE_KEYS are all present on the spine`, () => {
      for (const key of SPINE_KEYS) {
        expect(d.spine).toHaveProperty(key);
      }
    });

    it(`${slug}: every stated enum value is in its const array`, () => {
      for (const key of SPINE_KEYS) {
        const enumValues = ENUM_BY_SPINE_KEY[key];
        if (!enumValues) continue;
        const tri = d.spine[key];
        if (tri.status === "stated") expect(enumValues).toContain(tri.value as string);
        if (tri.status === "conflicting") for (const c of tri.candidates) expect(enumValues).toContain(c.value as string);
      }
    });

    it(`${slug}: every CapacityTuple.space_id is a real space id or whole_venue`, () => {
      const spaceIds = new Set(d.spaces.map((s) => s.id));
      for (const c of d.capacities) {
        expect(c.space_id === "whole_venue" || spaceIds.has(c.space_id)).toBe(true);
        expect(LAYOUTS).toContain(c.layout);
      }
    });

    it(`${slug}: every add-on's per_space_prices keys are real space ids`, () => {
      const spaceIds = new Set(d.spaces.map((s) => s.id));
      for (const a of d.pricing.add_ons) {
        if (!a.per_space_prices) continue;
        for (const key of Object.keys(a.per_space_prices)) expect(spaceIds.has(key)).toBe(true);
      }
    });

    it(`${slug}: every field_path in eval resolves`, () => {
      const evalMap = d.eval ?? {};
      for (const path of Object.keys(evalMap)) {
        expect(resolves(d, path), `path ${path} did not resolve`).toBe(true);
      }
    });
  }
});

describe("golden fixtures — headline capacity", () => {
  it("Marchetti: 425 (the Pavilion, seated_dinner)", () => {
    const hc = headlineCapacity(getGolden("galleria-marchetti")!);
    expect(hc.headline).toBe(425);
    expect(hc.headline_layout).toBe("seated_dinner");
    expect(hc.headline_space_id).toBe("the-pavilion");
  });

  it("LondonHouse: 190", () => {
    const hc = headlineCapacity(getGolden("londonhouse-chicago")!);
    expect(hc.headline).toBe(190);
  });

  it("Greenhouse: 175, tile labels from the venue's own vocabulary", () => {
    const d = getGolden("greenhouse-loft")!;
    const hc = headlineCapacity(d);
    expect(hc.headline).toBe(175);
    const [seated, seatedDance, cocktail] = hc.tiles;
    expect(seated.as_stated_label).toBe("Seated (w/ DJ)");
    expect(seated.max).toBe(175);
    expect(seatedDance.as_stated_label).toBe("Seated (w/ band)");
    expect(seatedDance.max).toBe(150);
    expect(cocktail.as_stated_label).toBe("Cocktail (standing)");
    expect(cocktail.max).toBe(200);
  });

  it("Diamond Garden: 268 (seated_dance; seated and cocktail tiles null)", () => {
    const hc = headlineCapacity(getGolden("diamond-garden-banquet-hall")!);
    expect(hc.headline).toBe(268);
    const [seated, seatedDance, cocktail] = hc.tiles;
    expect(seated.max).toBeNull();
    expect(seatedDance.max).toBe(268);
    expect(cocktail.max).toBeNull();
  });

  it("Field Museum: 1500", () => {
    const hc = headlineCapacity(getGolden("field-museum")!);
    expect(hc.headline).toBe(1500);
  });

  it("Geraghty: 300", () => {
    const hc = headlineCapacity(getGolden("geraghty")!);
    expect(hc.headline).toBe(300);
  });
});

describe("golden fixtures — pinned calculator totals", () => {
  it("Marchetti: 150/sat/Pavilion/Oro -> 55,240; with ceremony -> 57,475", () => {
    const d = getGolden("galleria-marchetti")!;
    const axes = defaultAxes(d);
    expect(axes.path_id).toBe("default");
    expect(axes.space_id).toBe("the-pavilion");
    expect(axes.tier_id).toBe("oro");
    const base = estimateCost(d, { ...axes, guests: 150, day: "sat", season: "peak", ceremonyOnSite: false });
    expect(base.total).toBe(55240);
    const withCeremony = estimateCost(d, { ...axes, guests: 150, day: "sat", season: "peak", ceremonyOnSite: true });
    expect(withCeremony.total).toBe(57475);
  });

  it("Greenhouse: 150/peak sat/credit card/ceremony -> 12,420; insurance ~175 in not_included", () => {
    const d = getGolden("greenhouse-loft")!;
    const axes = defaultAxes(d);
    const est = estimateCost(d, { ...axes, guests: 150, day: "sat", season: "peak", ceremonyOnSite: true, payment: "credit_card" });
    expect(est.total).toBe(12420);
    expect(est.not_included.some((n) => n.includes("175"))).toBe(true);
  });

  it("LondonHouse: 120/Luxury/ceremony -> 44,451; corkage x4 -> 44,675", () => {
    const d = getGolden("londonhouse-chicago")!;
    const axes = defaultAxes(d);
    expect(axes.tier_id).toBe("luxury");
    const base = estimateCost(d, { ...axes, guests: 120, day: "sat", season: "peak", ceremonyOnSite: true, payment: "cash_check", extras: [] });
    expect(base.total).toBe(44451);
    const withCorkage = estimateCost(d, { ...axes, guests: 120, day: "sat", season: "peak", ceremonyOnSite: true, payment: "cash_check", extras: [{ add_on_id: "corkage", quantity: 4 }] });
    expect(withCorkage.total).toBe(44675);
  });

  it("Diamond Garden: default path is Hall Rental Only (cheap-first), 150 guests -> 7,495, 151 -> 7,720; all-inclusive 150/peak/sat -> 12,742.50; 120/fri -> under_minimum, 9,234", () => {
    const d = getGolden("diamond-garden-banquet-hall")!;
    const axes = defaultAxes(d);
    // Round-3 fix: the default path is now the cheapest real one (Hall Rental Only), with no
    // tier_id pinned — All-Inclusive's own rate is selected purely by the Day/Season pills.
    expect(axes.path_id).toBe("hall-rental-only");
    expect(axes.guests).toBe(150);
    expect(axes.day).toBe("sat");
    expect(axes.season).toBe("peak");
    expect(axes.tier_id).toBeUndefined();

    const hall150 = estimateCost(d, axes);
    expect(hall150.total).toBe(7495);
    const hall151 = estimateCost(d, { ...axes, guests: 151 });
    expect(hall151.total).toBe(7720);

    const allInclusive = estimateCost(d, { ...axes, path_id: "all-inclusive", tier_id: "sat-peak" });
    expect(allInclusive.total).toBe(12742.5);

    const underMin = estimateCost(d, { ...axes, path_id: "all-inclusive", guests: 120, day: "fri", season: "peak" });
    expect(underMin.warnings).toContain("under_minimum");
    expect(underMin.total).toBe(9234);
  });

  it("Field Museum and Geraghty: no_path (inquire-only, nothing to compute)", () => {
    for (const slug of ["field-museum", "geraghty"] as const) {
      const d = getGolden(slug)!;
      const est = estimateCost(d, defaultAxes(d));
      expect(est.warnings).toContain("no_path");
      expect(est.total).toBe(0);
    }
  });
});

describe("golden fixtures — Diamond Garden round-3 structure", () => {
  const d = getGolden("diamond-garden-banquet-hall")!;

  it("has all three real booking paths, cheap-first", () => {
    expect(d.pricing.paths.map((p) => p.id)).toEqual(["hall-rental-only", "hall-plus-a-la-carte", "all-inclusive"]);
  });

  it("Hall + À La Carte shares Hall Rental Only's fixed fees, required staffing, and includes", () => {
    const hallOnly = d.pricing.paths.find((p) => p.id === "hall-rental-only")!;
    const alaCarte = d.pricing.paths.find((p) => p.id === "hall-plus-a-la-carte")!;
    expect(alaCarte.fixed_fees).toEqual(hallOnly.fixed_fees);
    expect(alaCarte.required_staffing).toEqual(hallOnly.required_staffing);
    expect(alaCarte.includes).toEqual(hallOnly.includes);
    expect(alaCarte.includes?.length).toBeGreaterThan(0);
  });

  it("carries 5 curated add-on categories, joined to the granular add-ons by category name", () => {
    expect(d.pricing.add_on_categories?.map((c) => c.category)).toEqual([
      "Food & beverage add-ons",
      "Decoration add-ons",
      "Lighting & video add-ons",
      "Staffing & service add-ons",
      "Extra hours",
    ]);
    const categoryNames = new Set(d.pricing.add_on_categories!.map((c) => c.category));
    // Real leftover categories not curated: the 7 "Ceremony Upgrades" rows, and the 2026-09-19
    // round's real sheet sub-categories (Linen, Dinnerware Rental Only, Professional Wait Staff,
    // Lighting & Video) added straight from the venue's own PDF headings rather than folded into
    // the 5 pre-existing curated buckets.
    const UNCURATED_CATEGORIES = new Set(["Ceremony Upgrades", "Linen", "Dinnerware Rental Only", "Professional Wait Staff", "Lighting & Video"]);
    for (const a of d.pricing.add_ons) {
      if (UNCURATED_CATEGORIES.has(a.category)) continue;
      expect(categoryNames.has(a.category), `add-on ${a.id} has an uncurated category ${a.category}`).toBe(true);
    }
  });

  it("states season months once, shared by every path", () => {
    expect(d.pricing.seasons).toEqual({ peak: "Apr–Oct, Dec", off: "Jan, Feb, Mar, Nov" });
  });

  it("food/dinnerware/bar/coffee/cake add-ons apply to both hall paths, never All-Inclusive; extra hour applies to all", () => {
    const scoped = d.pricing.add_ons.filter((a) => a.category === "Food & beverage add-ons");
    expect(scoped.length).toBeGreaterThan(0);
    for (const a of scoped) expect(a.path_ids).toEqual(["hall-rental-only", "hall-plus-a-la-carte"]);
    // 2026-09-19 round: 16 real rows (2 seasons x 2 servers options x 4 day buckets), not just
    // Saturday's own rate.
    const extraHour = d.pricing.add_ons.filter((a) => a.selection_group === "extra-hour");
    expect(extraHour.length).toBe(16);
    for (const a of extraHour) expect(a.path_ids).toBeNull();
  });

  it("food package / dinnerware / bar tiers / extra hour are single-select groups", () => {
    const groups = new Set(d.pricing.add_ons.map((a) => a.selection_group).filter(Boolean));
    expect(groups).toEqual(new Set(["food-package", "dinnerware", "bar", "extra-hour"]));
  });

  it("ceremony upgrades are individually selectable, not auto-applied (group 'other', category 'Ceremony Upgrades')", () => {
    // 2026-09-19 round: renamed from "Ceremony" to the source PDF's own heading, and grew from 5
    // to 7 rows (pipe & drape on the head table + lanterns w/ rose petals added).
    const ceremony = d.pricing.add_ons.filter((a) => a.category === "Ceremony Upgrades");
    expect(ceremony.length).toBe(7);
    for (const a of ceremony) {
      expect(a.group).toBe("other");
      expect(a.condition).toBeNull();
    }
    // No add-on auto-applies on the ceremony Yes/No toggle for this venue (ceremony is free) —
    // calculatorAxes correctly omits the axis entirely.
    expect(d.pricing.add_ons.some((a) => a.group === "ceremony" && a.condition === "ceremony_on_site")).toBe(false);
  });

  it("spine.bar is 'in_house' (no corkage fee exists here); the byo pill is additive", () => {
    expect(d.spine.bar.status === "stated" && d.spine.bar.value).toBe("in_house");
    expect(d.food_beverage.bar_pills.some((p) => p.value === "byo")).toBe(true);
  });

  it("every menu keeps its real Extras column", () => {
    expect(d.food_beverage.menus.length).toBe(3);
    for (const m of d.food_beverage.menus) expect(m.extras.length).toBeGreaterThan(0);
  });

  it("bar packages state a real guest minimum", () => {
    expect(d.food_beverage.bar_min_guests).toBe(50);
  });

  // 2026-09-19 round: the venue's own 2024 add-ons sheet ("Rental Add-Ons 2024") priced far more
  // than the earlier curated pass carried — this suite locks in that the section actually shows
  // what the venue sells, not just a curated sample of it.
  it("has at least 45 real add-ons (the 2024 add-ons sheet, priced in full)", () => {
    expect(d.pricing.add_ons.length).toBeGreaterThanOrEqual(45);
  });

  it("has a lanterns item from the Ceremony Upgrades section", () => {
    expect(d.pricing.add_ons.some((a) => /lanterns/i.test(a.name))).toBe(true);
  });

  it("extra-hour rows carry both day and season, covering both real seasons", () => {
    const extraHour = d.pricing.add_ons.filter((a) => a.selection_group === "extra-hour");
    expect(extraHour.length).toBeGreaterThan(0);
    for (const a of extraHour) {
      expect(a.day, `${a.id} should carry a day`).not.toBeNull();
      expect(a.season, `${a.id} should carry a season`).not.toBeNull();
    }
    expect(new Set(extraHour.map((a) => a.season))).toEqual(new Set(["off", "peak"]));
    expect(new Set(extraHour.map((a) => a.day))).toEqual(new Set(["weekday", "fri", "sun", "sat"]));
  });

  it("carries the add-ons sheet's own 2025 surcharge and tax-exclusion notes", () => {
    expect(d.pricing.notes.some((n) => /add 10% for 2025/i.test(n.value))).toBe(true);
    expect(d.pricing.notes.some((n) => /tax and other fees are not included/i.test(n.value))).toBe(true);
  });

  it("the 4 per-guest add-ons that used to price as null now have a real price (decoration package + 3 food/drink extras)", () => {
    const decorationPackage = d.pricing.add_ons.find((a) => a.id === "decorationPackage")!;
    expect(decorationPackage.price).toBe(9.95);
    for (const id of ["coffeeTea", "sodaPackage", "cakeTable"]) {
      const a = d.pricing.add_ons.find((x) => x.id === id)!;
      expect(a.price, `${id} should have a real price`).not.toBeNull();
    }
  });
});

describe("golden fixtures — compare-ready / excellent", () => {
  const EXCELLENT_TRUE: GoldenSlug[] = ["galleria-marchetti", "greenhouse-loft", "londonhouse-chicago", "diamond-garden-banquet-hall"];
  const EXCELLENT_FALSE: GoldenSlug[] = ["field-museum", "geraghty"];

  for (const slug of GOLDEN_SLUGS) {
    it(`${slug}: isCompareReady is true (zero grounding failures, needsReview false)`, () => {
      const d = getGolden(slug)!;
      expect(isCompareReady(d, { criticalGroundingFailures: 0, needsReview: false })).toBe(true);
    });
  }

  for (const slug of EXCELLENT_TRUE) {
    it(`${slug}: isExcellent is true`, () => {
      const d = getGolden(slug)!;
      const compareReady = isCompareReady(d, { criticalGroundingFailures: 0, needsReview: false });
      expect(isExcellent(d, { compareReady, humanVerified: false })).toBe(true);
    });
  }

  for (const slug of EXCELLENT_FALSE) {
    it(`${slug}: isExcellent is false (inquire-only, no priced path)`, () => {
      const d = getGolden(slug)!;
      const compareReady = isCompareReady(d, { criticalGroundingFailures: 0, needsReview: false });
      expect(isExcellent(d, { compareReady, humanVerified: false })).toBe(false);
    });
  }
});

describe("isGoldenSlug", () => {
  it("accepts only the six real slugs", () => {
    for (const slug of GOLDEN_SLUGS) expect(isGoldenSlug(slug)).toBe(true);
    expect(isGoldenSlug("not-a-real-venue")).toBe(false);
  });
});

describe("golden fixtures — round 4 (user feedback 2026-09-19), part B fixture fixes", () => {
  for (const slug of GOLDEN_SLUGS) {
    it(`${slug}: has a non-null food_beverage.food_note and bar_note`, () => {
      const d = getGolden(slug)!;
      expect(d.food_beverage.food_note, "food_note").toBeTruthy();
      expect(d.food_beverage.bar_note, "bar_note").toBeTruthy();
      expect(d.food_beverage.food_note!.value.length).toBeGreaterThan(0);
      expect(d.food_beverage.bar_note!.value.length).toBeGreaterThan(0);
    });
  }

  it("Greenhouse: has 3 rental terms (Access, Event hours, Holiday rates) and a seasons definition", () => {
    const d = getGolden("greenhouse-loft")!;
    const defaultPath = d.pricing.paths.find((p) => p.id === "default")!;
    expect(defaultPath.terms?.map((t) => t.label)).toEqual(["Access", "Event hours", "Holiday rates"]);
    for (const t of defaultPath.terms!) expect(t.text.length).toBeGreaterThan(0);
    expect(d.pricing.seasons).toEqual({ off: "Jan – Mar", peak: "Apr – Dec" });
  });

  it("Diamond Garden: seasons still set (round 3, verified unchanged)", () => {
    const d = getGolden("diamond-garden-banquet-hall")!;
    expect(d.pricing.seasons).toEqual({ peak: "Apr–Oct, Dec", off: "Jan, Feb, Mar, Nov" });
  });

  it("Geraghty: no add-on matching /nonprofit|donation/i (not a couple-facing wedding fee)", () => {
    const d = getGolden("geraghty")!;
    for (const a of d.pricing.add_ons) {
      expect(a.name).not.toMatch(/nonprofit|donation/i);
      expect(a.id).not.toMatch(/nonprofit|donation/i);
    }
    // The exception is still mentioned honestly, in prose, on the Bar side.
    expect(d.food_beverage.bar_note?.value).toMatch(/nonprofit/i);
  });

  it("Geraghty: pricing has no paths and a quoted pricing.notes fact ('Pricing: on request' has a quote)", () => {
    const d = getGolden("geraghty")!;
    expect(d.pricing.paths).toEqual([]);
    expect(d.pricing.notes.length).toBeGreaterThan(0);
    expect(d.pricing.notes[0].value.length).toBeGreaterThan(0);
  });

  it("Field Museum: keeps the real 1,500 headline and a conflicting capacity_min_guests (10 vs 20)", () => {
    const d = getGolden("field-museum")!;
    const stanley = d.capacities.find((c) => c.space_id === "stanley-field-hall-balcony" && c.layout === "seated_dinner");
    expect(stanley?.max).toBe(1500);
    expect(d.spine.capacity_min_guests.status).toBe("conflicting");
    if (d.spine.capacity_min_guests.status === "conflicting") {
      expect(d.spine.capacity_min_guests.candidates.map((c) => c.value).sort()).toEqual([10, 20]);
    }
    expect(d.pricing.notes.length).toBeGreaterThan(0);
    expect(d.pricing.notes[0].value.toLowerCase()).toContain("proposal");
  });

  it("Marchetti: ceremony add-on note is trimmed (round 4)", () => {
    const d = getGolden("galleria-marchetti")!;
    const ceremony = d.pricing.add_ons.find((a) => a.id === "ceremony-onsite")!;
    expect(ceremony.note).toBe(
      "Only if your ceremony is on-site; includes white garden chairs and a ceremony arbor (Pavilion: matching indoor arbor for weather backup).",
    );
  });

  it("every eval field_path still resolves after the round-4 fixture edits", () => {
    for (const slug of GOLDEN_SLUGS) {
      const d = getGolden(slug)!;
      const evalMap = d.eval ?? {};
      for (const path of Object.keys(evalMap)) {
        expect(resolves(d, path), `${slug}: path ${path} did not resolve`).toBe(true);
      }
    }
  });
});

describe("golden fixtures — round 5 (capacity_max_guests + add-on category_std)", () => {
  it("SPINE_KEYS (including capacity_max_guests) are all present and resolve on every fixture", () => {
    for (const slug of GOLDEN_SLUGS) {
      const d = getGolden(slug)!;
      for (const key of SPINE_KEYS) {
        expect(d.spine).toHaveProperty(key);
        expect(resolves(d, `/spine/${key}`)).toBe(true);
      }
    }
  });

  it("every add-on on every fixture has a category_std in ADD_ON_CATEGORIES_STD", () => {
    for (const slug of GOLDEN_SLUGS) {
      const d = getGolden(slug)!;
      for (const a of d.pricing.add_ons) {
        expect(a.category_std, `${slug}: add-on ${a.id} has no category_std`).toBeDefined();
        expect(ADD_ON_CATEGORIES_STD, `${slug}: add-on ${a.id} has category_std ${a.category_std}`).toContain(a.category_std);
      }
    }
  });

  it("Greenhouse: capacity_max_guests stated 200, from the same FAQ quote as the min", () => {
    const d = getGolden("greenhouse-loft")!;
    expect(d.spine.capacity_max_guests.status).toBe("stated");
    if (d.spine.capacity_max_guests.status === "stated") expect(d.spine.capacity_max_guests.value).toBe(200);
  });

  it("Diamond Garden: capacity_max_guests stated 268, the homepage's own general claim", () => {
    const d = getGolden("diamond-garden-banquet-hall")!;
    expect(d.spine.capacity_max_guests.status).toBe("stated");
    if (d.spine.capacity_max_guests.status === "stated") expect(d.spine.capacity_max_guests.value).toBe(268);
  });

  it("Geraghty: capacity_max_guests stated 300, from the wedding-labeled floor plans", () => {
    const d = getGolden("geraghty")!;
    expect(d.spine.capacity_max_guests.status).toBe("stated");
    if (d.spine.capacity_max_guests.status === "stated") expect(d.spine.capacity_max_guests.value).toBe(300);
  });

  it("Marchetti, LondonHouse, Field Museum: capacity_max_guests not_stated (per-room headline only)", () => {
    for (const slug of ["galleria-marchetti", "londonhouse-chicago", "field-museum"] as const) {
      const d = getGolden(slug)!;
      expect(d.spine.capacity_max_guests.status, `${slug}`).toBe("not_stated");
    }
  });

  it("pinned calculator totals unchanged by the round-5 fixture edits", () => {
    const marchetti = getGolden("galleria-marchetti")!;
    const marchettiAxes = defaultAxes(marchetti);
    expect(estimateCost(marchetti, { ...marchettiAxes, guests: 150, day: "sat", season: "peak", ceremonyOnSite: false }).total).toBe(55240);

    const greenhouse = getGolden("greenhouse-loft")!;
    const greenhouseAxes = defaultAxes(greenhouse);
    expect(estimateCost(greenhouse, { ...greenhouseAxes, guests: 150, day: "sat", season: "peak", ceremonyOnSite: true, payment: "credit_card" }).total).toBe(12420);

    const londonhouse = getGolden("londonhouse-chicago")!;
    const londonhouseAxes = defaultAxes(londonhouse);
    expect(
      estimateCost(londonhouse, { ...londonhouseAxes, guests: 120, day: "sat", season: "peak", ceremonyOnSite: true, payment: "cash_check", extras: [] }).total,
    ).toBe(44451);

    const diamondGarden = getGolden("diamond-garden-banquet-hall")!;
    const diamondGardenAxes = defaultAxes(diamondGarden);
    expect(estimateCost(diamondGarden, diamondGardenAxes).total).toBe(7495);
  });
});
