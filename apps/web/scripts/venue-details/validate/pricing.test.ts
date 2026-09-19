import { describe, expect, it } from "vitest";
import type { AddOn, Minimum } from "../../../lib/venueDetails/types";
import {
  CC_FEE_RANGE,
  FLAT_RANGE,
  PER_GUEST_RANGE,
  SALES_TAX_RANGE,
  SERVICE_CHARGE_RANGE,
  checkCorkageImpliesByo,
  checkMinimumKindSanity,
  inRange,
  isAdrQuote,
  normalizeConflictingSingleCandidate,
  normalizeSelectionGroupSlug,
  normalizeStatedWithoutQuote,
  sanitizeAddOns,
  sanitizeFixedFees,
  sanitizeRates,
} from "./pricing";
import type { RawTriField } from "../contract";

function addOn(overrides: Partial<AddOn>): AddOn {
  return {
    id: "addon",
    name: "Chiavari chairs",
    category: "rentals",
    variant: null,
    group: "rental",
    price: 45,
    price_max: null,
    unit: "per_guest",
    per_space_prices: null,
    applies_to: "all",
    path_ids: null,
    condition: null,
    priceable: true,
    tax_pct_override: null,
    min_guests: null,
    as_stated_price: null,
    note: null,
    quote: "Chiavari chairs $45/guest",
    source_url: "https://x.com/pricing",
    snapshot_id: 1,
    ...overrides,
  };
}

describe("isAdrQuote", () => {
  it("flags nightly/room-rate language", () => {
    expect(isAdrQuote("Rooms from $163/night")).toBe(true);
    expect(isAdrQuote("Guest rooms starting at $289")).toBe(true);
    expect(isAdrQuote("Our ADR is $200")).toBe(true);
  });

  it("does not flag real event pricing", () => {
    expect(isAdrQuote("Venue rental is $6,000 on Saturdays")).toBe(false);
  });
});

describe("inRange / range constants", () => {
  it("validates each named range", () => {
    expect(inRange(150, PER_GUEST_RANGE)).toBe(true);
    expect(inRange(5, PER_GUEST_RANGE)).toBe(false);
    expect(inRange(6000, FLAT_RANGE)).toBe(true);
    expect(inRange(50, FLAT_RANGE)).toBe(false);
    expect(inRange(20, SERVICE_CHARGE_RANGE)).toBe(true);
    expect(inRange(50, SERVICE_CHARGE_RANGE)).toBe(false);
    expect(inRange(11.75, SALES_TAX_RANGE)).toBe(true);
    expect(inRange(3, CC_FEE_RANGE)).toBe(true);
  });
});

describe("normalizeStatedWithoutQuote", () => {
  it("demotes a stated field with no quote to not_stated", () => {
    const field: RawTriField = { status: "stated", value: "open", quote: "", source_url: "https://x.com" };
    expect(normalizeStatedWithoutQuote(field)).toEqual({ status: "not_stated" });
  });

  it("leaves a properly quoted stated field alone", () => {
    const field: RawTriField = { status: "stated", value: "open", quote: "any caterer", source_url: "https://x.com" };
    expect(normalizeStatedWithoutQuote(field)).toEqual(field);
  });
});

describe("normalizeConflictingSingleCandidate", () => {
  it("collapses a single-candidate conflicting field to stated", () => {
    const field: RawTriField = { status: "conflicting", candidates: [{ value: "open", quote: "q", source_url: "https://x.com" }] };
    expect(normalizeConflictingSingleCandidate(field)).toEqual({ status: "stated", value: "open", quote: "q", source_url: "https://x.com" });
  });

  it("collapses a zero-candidate conflicting field to not_stated", () => {
    const field: RawTriField = { status: "conflicting", candidates: [] };
    expect(normalizeConflictingSingleCandidate(field)).toEqual({ status: "not_stated" });
  });

  it("leaves a real (>=2 candidate) conflict alone", () => {
    const field: RawTriField = {
      status: "conflicting",
      candidates: [
        { value: "open", quote: "q1", source_url: "https://x.com/a" },
        { value: "preferred_list", quote: "q2", source_url: "https://x.com/b" },
      ],
    };
    expect(normalizeConflictingSingleCandidate(field)).toEqual(field);
  });
});

describe("checkCorkageImpliesByo", () => {
  it("overrides in_house to byo_with_corkage when a corkage add-on exists", () => {
    const result = checkCorkageImpliesByo("in_house", [addOn({ name: "Corkage fee", price: 25 })]);
    expect(result.bar).toBe("byo_with_corkage");
    expect(result.issue?.code).toBe("corkage_implies_byo");
    expect(result.issue?.tier).toBe("critical");
  });

  it("does nothing when there's no corkage add-on", () => {
    const result = checkCorkageImpliesByo("in_house", [addOn({ name: "Extra hour" })]);
    expect(result.bar).toBe("in_house");
    expect(result.issue).toBeNull();
  });

  it("does nothing when bar is already byo_with_corkage", () => {
    const result = checkCorkageImpliesByo("byo_with_corkage", [addOn({ name: "Corkage fee" })]);
    expect(result.bar).toBe("byo_with_corkage");
    expect(result.issue).toBeNull();
  });
});

describe("checkMinimumKindSanity", () => {
  it("flags a guest_minimum that looks like a dollar amount", () => {
    const minimums: Minimum[] = [{ kind: "guest_minimum", day: null, season: null, amount: 6000, quote: "q", source_url: "u", snapshot_id: 1 }];
    const issues = checkMinimumKindSanity(minimums, "path-1");
    expect(issues.some((i) => i.code === "fb_min_vs_guest_min")).toBe(true);
  });

  it("flags a fb_minimum that looks like a guest count", () => {
    const minimums: Minimum[] = [{ kind: "fb_minimum", day: null, season: null, amount: 40, quote: "q", source_url: "u", snapshot_id: 1 }];
    const issues = checkMinimumKindSanity(minimums, "path-1");
    expect(issues.some((i) => i.code === "fb_min_vs_guest_min")).toBe(true);
  });

  it("does not flag plausible minimums", () => {
    const minimums: Minimum[] = [
      { kind: "guest_minimum", day: null, season: null, amount: 100, quote: "q", source_url: "u", snapshot_id: 1 },
      { kind: "fb_minimum", day: null, season: null, amount: 6000, quote: "q", source_url: "u", snapshot_id: 1 },
    ];
    expect(checkMinimumKindSanity(minimums, "path-1")).toEqual([]);
  });
});

describe("sanitizeFixedFees", () => {
  it("rejects an ADR-shaped fee", () => {
    const result = sanitizeFixedFees(
      [{ applies_to: "whole_venue", space_id: null, day: null, season: null, amount: 200, unit: "flat", label: "Room", includes: [], key: "room", quote: "Rooms from $200/night", source_url: "u", snapshot_id: 1 }],
      "path-1"
    );
    expect(result.fees).toHaveLength(0);
    expect(result.issues.some((i) => i.code === "adr_rejected")).toBe(true);
  });

  it("rejects an out-of-range flat fee", () => {
    const result = sanitizeFixedFees(
      [{ applies_to: "whole_venue", space_id: null, day: null, season: null, amount: 50, unit: "flat", label: "Fee", includes: [], key: "fee", quote: "Venue fee $50", source_url: "u", snapshot_id: 1 }],
      "path-1"
    );
    expect(result.fees).toHaveLength(0);
    expect(result.issues.some((i) => i.code === "amount_out_of_range")).toBe(true);
  });

  it("keeps a plausible fee", () => {
    const result = sanitizeFixedFees(
      [{ applies_to: "whole_venue", space_id: null, day: "sat", season: "peak", amount: 6000, unit: "flat", label: "Rental", includes: [], key: "rental", quote: "Saturday rental $6,000", source_url: "u", snapshot_id: 1 }],
      "path-1"
    );
    expect(result.fees).toHaveLength(1);
    expect(result.issues).toHaveLength(0);
  });
});

describe("sanitizeAddOns", () => {
  it("rejects an ADR-shaped add-on", () => {
    const result = sanitizeAddOns([addOn({ quote: "Rooms from $163/night", unit: "flat", price: 163 })]);
    expect(result.addOns).toHaveLength(0);
    expect(result.issues.some((i) => i.code === "adr_rejected")).toBe(true);
  });

  it("rejects an out-of-range per-guest add-on price", () => {
    const result = sanitizeAddOns([addOn({ unit: "per_guest", price: 5000 })]);
    expect(result.addOns).toHaveLength(0);
    expect(result.issues.some((i) => i.code === "amount_out_of_range")).toBe(true);
  });

  it("keeps a plausible add-on", () => {
    const result = sanitizeAddOns([addOn({})]);
    expect(result.addOns).toHaveLength(1);
  });

  it("keeps an unpriceable add-on (price null) untouched", () => {
    const result = sanitizeAddOns([addOn({ price: null, priceable: false, as_stated_price: "No published rate" })]);
    expect(result.addOns).toHaveLength(1);
  });
});

describe("normalizeSelectionGroupSlug", () => {
  it("returns null for null/undefined/empty input", () => {
    expect(normalizeSelectionGroupSlug(null)).toBeNull();
    expect(normalizeSelectionGroupSlug(undefined)).toBeNull();
    expect(normalizeSelectionGroupSlug("")).toBeNull();
    expect(normalizeSelectionGroupSlug("   ")).toBeNull();
  });

  it("lowercases and collapses non-alnum runs to a single underscore", () => {
    expect(normalizeSelectionGroupSlug("Food Package")).toBe("food_package");
    expect(normalizeSelectionGroupSlug("Bar  Tier!!")).toBe("bar_tier");
  });

  it("makes two differently-cased/spaced venue labels for the same group compare equal", () => {
    expect(normalizeSelectionGroupSlug("Extra Hour")).toBe(normalizeSelectionGroupSlug("extra-hour"));
  });
});

describe("sanitizeRates", () => {
  it("clears an out-of-range service_charge_pct", () => {
    const result = sanitizeRates({ service_charge_pct: 90, service_charge_base: "fb", sales_tax_pct: null, sales_tax_base: null, sales_tax_source: "unknown", cc_fee_pct: null, quote: "q", source_url: "u", snapshot_id: 1 });
    expect(result.rates.service_charge_pct).toBeNull();
    expect(result.issues.some((i) => i.code === "amount_out_of_range" && i.path.includes("service_charge_pct"))).toBe(true);
  });

  it("leaves plausible rates untouched", () => {
    const rates = { service_charge_pct: 22, service_charge_base: "fb" as const, sales_tax_pct: 11.75, sales_tax_base: "fb_and_rentals" as const, sales_tax_source: "stated" as const, cc_fee_pct: 3, quote: "q", source_url: "u", snapshot_id: 1 };
    const result = sanitizeRates(rates);
    expect(result.rates).toEqual(rates);
    expect(result.issues).toEqual([]);
  });
});
