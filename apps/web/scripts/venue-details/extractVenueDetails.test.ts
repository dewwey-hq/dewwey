import { describe, expect, it } from "vitest";
import { findStringifiedArrayFields, PRICING_ARRAY_FIELD_PATHS, SPINE_ARRAY_FIELD_PATHS } from "./extractVenueDetails";

describe("findStringifiedArrayFields", () => {
  it("returns [] when every listed field is already an array", () => {
    const payload = { spaces: [{ id: "a" }], capacities: [], inclusions: [], resources: [], vendor_lists: [], press_features: [] };
    expect(findStringifiedArrayFields(payload, SPINE_ARRAY_FIELD_PATHS)).toEqual([]);
  });

  it("returns [] when a field is missing/null/undefined entirely", () => {
    const payload = { spaces: [] };
    expect(findStringifiedArrayFields(payload, SPINE_ARRAY_FIELD_PATHS)).toEqual([]);
  });

  it("does not flag a string that DOES parse into an array -- assemble.ts's coerceRawArrays recovers that for free", () => {
    const payload = { paths: JSON.stringify([{ id: "standard" }]) };
    expect(findStringifiedArrayFields(payload, PRICING_ARRAY_FIELD_PATHS)).toEqual([]);
  });

  it("flags a string that fails JSON.parse entirely (tick c4 Greenhouse: a truncated 24k-char string)", () => {
    const payload = { paths: '[{"id": "standard", "fixed_fees": [ this is not valid json' };
    expect(findStringifiedArrayFields(payload, PRICING_ARRAY_FIELD_PATHS)).toEqual(["paths"]);
  });

  it("flags a string that parses but not into an array (e.g. an object or a plain string)", () => {
    const payload = { add_ons: JSON.stringify({ not: "an array" }) };
    expect(findStringifiedArrayFields(payload, PRICING_ARRAY_FIELD_PATHS)).toEqual(["add_ons"]);
  });

  it("reads dotted paths into food_beverage's own array fields", () => {
    const payload = { food_beverage: { menus: "not json at all [", bar_ladders: [] } };
    expect(findStringifiedArrayFields(payload, PRICING_ARRAY_FIELD_PATHS)).toEqual(["food_beverage.menus"]);
  });

  it("names every bad field, not just the first", () => {
    const payload = { spaces: "nope [", capacities: [], inclusions: "also nope [", resources: [], vendor_lists: [], press_features: [] };
    expect(findStringifiedArrayFields(payload, SPINE_ARRAY_FIELD_PATHS)).toEqual(["spaces", "inclusions"]);
  });

  it("returns [] for a non-object payload", () => {
    expect(findStringifiedArrayFields(null, SPINE_ARRAY_FIELD_PATHS)).toEqual([]);
    expect(findStringifiedArrayFields("a string", SPINE_ARRAY_FIELD_PATHS)).toEqual([]);
  });
});
