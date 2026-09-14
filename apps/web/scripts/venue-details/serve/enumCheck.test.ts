import { describe, expect, it } from "vitest";
import { checkEnumValidity } from "./enumCheck";

describe("checkEnumValidity", () => {
  it("passes a valid enum value", () => {
    expect(checkEnumValidity("/spine/catering", "exclusive_in_house")).toEqual({ ok: true, reason: null });
  });

  it("fails an invalid enum value with a helpful reason", () => {
    const result = checkEnumValidity("/spine/catering", "made_up_value");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("made_up_value");
    expect(result.reason).toContain("/spine/catering");
  });

  it("fails a non-string value for an enum field", () => {
    expect(checkEnumValidity("/spine/bar", 42).ok).toBe(false);
  });

  it("passes any value for a non-enum spine field (out of scope for this check)", () => {
    expect(checkEnumValidity("/spine/service_charge_pct", 22).ok).toBe(true);
  });

  it("passes any value for a non-spine field_path", () => {
    expect(checkEnumValidity("/capacities/main:seated_dinner", { max: 100 }).ok).toBe(true);
  });
});
