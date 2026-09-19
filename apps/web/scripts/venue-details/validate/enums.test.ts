import { describe, expect, it } from "vitest";
import { checkEnums } from "./enums";
import type { RawPricingResult, RawSpineResult } from "../contract";

function baseSpine(): RawSpineResult {
  return {
    spine: {},
    about: null,
    differentiator: null,
    spaces: [],
    capacities: [],
    inclusions: [],
    resources: [],
    vendor_lists: [],
    press_features: [],
    notes: null,
  };
}

describe("checkEnums", () => {
  it("emits an enum_invalid Issue with the spine field's tier for a bad spine enum value", () => {
    const spine = baseSpine();
    spine.spine.catering = { status: "stated", value: "bogus", quote: "q", source_url: "u" };
    const issues = checkEnums(spine, null);
    const issue = issues.find((i) => i.code === "enum_invalid" && i.path.includes("catering"));
    expect(issue).toBeDefined();
    expect(issue?.tier).toBe("critical"); // catering is a critical spine field
    expect(issue?.severity).toBe("error");
  });

  it("emits nothing for a well-formed spine reply", () => {
    const spine = baseSpine();
    spine.spine.catering = { status: "stated", value: "open", quote: "any caterer", source_url: "u" };
    expect(checkEnums(spine, null)).toEqual([]);
  });

  it("emits an enum_invalid issue for a bad pricing archetype (no spine tier)", () => {
    const pricing: RawPricingResult = {
      archetype: "not_a_real_archetype",
      paths: [],
      rates: { service_charge_pct: null, service_charge_base: null, sales_tax_pct: null, sales_tax_base: null, taxes_included_in_rental: null, cc_fee_pct: null, quote: null, source_url: null },
      add_ons: [],
      add_on_categories: [],
      food_beverage: { food_pills: [], bar_pills: [], caption: null, food_note: null, bar_note: null, menus: [], bar_ladders: [], bar_min_guests: null, notes: [] },
      required_third_party: [],
      faqs: [],
      seasons: null,
      notes: null,
    };
    const issues = checkEnums(baseSpine(), pricing);
    const issue = issues.find((i) => i.code === "enum_invalid" && i.path.includes("archetype"));
    expect(issue).toBeDefined();
    expect(issue?.tier).toBeNull();
  });
});
