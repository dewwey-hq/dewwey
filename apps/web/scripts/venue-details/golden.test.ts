import { describe, expect, it } from "vitest";

import { GOLDEN_ACCOUNT_IDS, GOLDEN_SLUGS, getGolden, isGoldenSlug, type GoldenSlug } from "../../lib/venueDetails/golden";
import { defaultAxes, estimateCost, headlineCapacity } from "../../lib/venueDetails/derive";
import { isCompareReady, isExcellent } from "../../lib/venueDetails/tiers";
import {
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
  if (root === "pricing" && id === "paths") {
    const path_ = d.pricing.paths.find((p) => p.id === sub);
    if (!path_) return false;
    if (rest[0] === "fixed_fees") return path_.fixed_fees.some((fee) => fee.key === rest[1]);
    if (rest[0] === "per_guest_tiers") return path_.per_guest_tiers.some((t) => t.id === rest[1]);
    if (rest[0] === "minimums") return path_.minimums.some((m) => `${m.kind}:${m.day}:${m.season}` === rest[1]);
    return true;
  }
  if (root === "food_beverage") {
    if (!id) return true;
    if (id === "menus") return d.food_beverage.menus.some((m) => slugify(m.name) === sub);
    if (id === "bar_ladders") return d.food_beverage.bar_ladders.some((b) => slugify(b.name) === sub);
    if (id === "notes") return d.food_beverage.notes[Number(sub)] != null;
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

  it("Diamond Garden: all-inclusive 150/peak/sat -> 12,742.50; 120/fri -> under_minimum; hall-rental-only 150 -> 7,495, 151 -> 7,720", () => {
    const d = getGolden("diamond-garden-banquet-hall")!;
    const axes = defaultAxes(d);
    expect(axes.path_id).toBe("all-inclusive");
    const allInclusive = estimateCost(d, { ...axes, guests: 150, day: "sat", season: "peak" });
    expect(allInclusive.total).toBe(12742.5);

    const underMin = estimateCost(d, { ...axes, tier_id: undefined, guests: 120, day: "fri", season: "peak" });
    expect(underMin.warnings).toContain("under_minimum");
    expect(underMin.total).toBe(9234);

    const hall150 = estimateCost(d, { ...axes, path_id: "hall-rental-only", guests: 150, day: "sat", season: "peak" });
    expect(hall150.total).toBe(7495);
    const hall151 = estimateCost(d, { ...axes, path_id: "hall-rental-only", guests: 151, day: "sat", season: "peak" });
    expect(hall151.total).toBe(7720);
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
