import { describe, expect, it } from "vitest";
import { applyCorrections, type Correction } from "./merge";
import { NOT_STATED } from "./types";
import { fact, makeVenue, spineWith } from "./testHelpers";

describe("applyCorrections", () => {
  it("sets a spine field", () => {
    const venue = makeVenue({ spine: spineWith({ catering: NOT_STATED }) });
    const corrections: Correction[] = [{ id: 1, field_path: "/spine/catering", action: "set", value: "open", created_at: "2026-01-01T00:00:00Z" }];
    const { details, applied } = applyCorrections(venue, corrections);
    expect(applied).toEqual([1]);
    expect(details.spine.catering.status).toBe("stated");
    expect(details.spine.catering.status === "stated" && details.spine.catering.value).toBe("open");
  });

  it("unset on a spine key clears it to not_stated", () => {
    const venue = makeVenue({ spine: spineWith({ catering: fact("open") }) });
    const { details } = applyCorrections(venue, [{ id: 1, field_path: "/spine/catering", action: "unset", value: null, created_at: "2026-01-01T00:00:00Z" }]);
    expect(details.spine.catering).toEqual(NOT_STATED);
  });

  it("retire clears the same as unset", () => {
    const venue = makeVenue({ spine: spineWith({ bar: fact("byob") }) });
    const { details } = applyCorrections(venue, [{ id: 1, field_path: "/spine/bar", action: "retire", value: null, created_at: "2026-01-01T00:00:00Z" }]);
    expect(details.spine.bar).toEqual(NOT_STATED);
  });

  it("latest row per field_path wins (by created_at, regardless of array order)", () => {
    const venue = makeVenue({ spine: spineWith({ catering: NOT_STATED }) });
    const corrections: Correction[] = [
      { id: 2, field_path: "/spine/catering", action: "set", value: "preferred_list", created_at: "2026-02-01T00:00:00Z" },
      { id: 1, field_path: "/spine/catering", action: "set", value: "open", created_at: "2026-01-01T00:00:00Z" },
    ];
    const { details, applied } = applyCorrections(venue, corrections);
    expect(details.spine.catering.status === "stated" && details.spine.catering.value).toBe("preferred_list");
    // Only the winning correction's id is reported as applied.
    expect(applied).toEqual([2]);
  });

  it("unset on a keyed array item removes it (space)", () => {
    const space = { id: "loft", name: "The Loft", structure_label: null, sq_ft: 1000, sq_ft_outdoor: null, ceiling_ft: null, setting: null, bookable_separately: true, description: null, includes_summary: null, evidence: { source_url: "https://example.com", snapshot_id: 1 } };
    const venue = makeVenue({ spaces: [space] });
    const { details, applied } = applyCorrections(venue, [{ id: 1, field_path: "/spaces/loft", action: "unset", value: null, created_at: "2026-01-01T00:00:00Z" }]);
    expect(details.spaces).toHaveLength(0);
    expect(applied).toEqual([1]);
  });

  it("sets a property on a keyed array item (space sq_ft)", () => {
    const space = { id: "loft", name: "The Loft", structure_label: null, sq_ft: 1000, sq_ft_outdoor: null, ceiling_ft: null, setting: null, bookable_separately: true, description: null, includes_summary: null, evidence: { source_url: "https://example.com", snapshot_id: 1 } };
    const venue = makeVenue({ spaces: [space] });
    const { details } = applyCorrections(venue, [{ id: 1, field_path: "/spaces/loft/sq_ft", action: "set", value: 1500, created_at: "2026-01-01T00:00:00Z" }]);
    expect(details.spaces[0].sq_ft).toBe(1500);
  });

  it("returns unchanged details and no applied ids for an unresolvable field_path", () => {
    const venue = makeVenue();
    const { details, applied } = applyCorrections(venue, [{ id: 1, field_path: "/spaces/nonexistent/sq_ft", action: "set", value: 1500, created_at: "2026-01-01T00:00:00Z" }]);
    expect(applied).toEqual([]);
    expect(details).toEqual(venue);
  });

  it("does not mutate the input document", () => {
    const venue = makeVenue({ spine: spineWith({ catering: fact("open") }) });
    const before = structuredClone(venue);
    applyCorrections(venue, [{ id: 1, field_path: "/spine/catering", action: "unset", value: null, created_at: "2026-01-01T00:00:00Z" }]);
    expect(venue).toEqual(before);
  });

  it("sets a nested pricing add_on property via field_path", () => {
    const addOn = { id: "corkage", name: "Corkage fee", category: "Bar", variant: null, group: "fb" as const, price: 50, price_max: null, unit: "per_unit" as const, per_space_prices: null, applies_to: null, path_ids: null, condition: null, priceable: true, tax_pct_override: null, min_guests: null, as_stated_price: "$50/bottle", note: null, quote: "$50/bottle", source_url: "https://example.com", snapshot_id: 1 };
    const venue = makeVenue({ pricing: { ...makeVenue().pricing, add_ons: [addOn] } });
    const { details } = applyCorrections(venue, [{ id: 1, field_path: "/pricing/add_ons/corkage/price", action: "set", value: 75, created_at: "2026-01-01T00:00:00Z" }]);
    expect(details.pricing.add_ons[0].price).toBe(75);
  });
});
