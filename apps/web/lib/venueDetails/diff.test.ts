import { describe, expect, it } from "vitest";
import { diffVersions } from "./diff";
import { fact, makeVenue, spineWith } from "./testHelpers";

describe("diffVersions", () => {
  it("treats a null prev as one top-level 'added' change", () => {
    const next = makeVenue();
    const changes = diffVersions(null, next);
    expect(changes).toEqual([{ field_path: "/", kind: "added", from: null, to: next }]);
  });

  it("detects a changed spine field by key, not index, and reports the plain value (not the Tri wrapper)", () => {
    const prev = makeVenue({ spine: spineWith({ catering: fact("open") }) });
    const next = makeVenue({ spine: spineWith({ catering: fact("preferred_list") }) });
    const changes = diffVersions(prev, next);
    expect(changes).toContainEqual({ field_path: "/spine/catering", kind: "changed", from: "open", to: "preferred_list" });
  });

  it("ignores spine fields that didn't change", () => {
    const prev = makeVenue({ spine: spineWith({ catering: fact("open"), bar: fact("byob") }) });
    const next = makeVenue({ spine: spineWith({ catering: fact("open"), bar: fact("in_house") }) });
    const changes = diffVersions(prev, next);
    expect(changes.filter((c) => c.field_path.startsWith("/spine/"))).toEqual([{ field_path: "/spine/bar", kind: "changed", from: "byob", to: "in_house" }]);
  });

  it("matches spaces by stable id, not array position", () => {
    const spaceA = { id: "loft", name: "The Loft", structure_label: null, sq_ft: 1000, sq_ft_outdoor: null, ceiling_ft: null, setting: null, bookable_separately: true, description: null, includes_summary: null, evidence: { source_url: "https://example.com", snapshot_id: 1 } };
    const spaceB = { ...spaceA, id: "garden", name: "The Garden" };
    const prev = makeVenue({ spaces: [spaceA, spaceB] });
    // Reordered, and only `garden`'s name changed -- a naive index-based diff would report BOTH
    // as "changed" (position 0 and 1 both differ). A stable-id diff reports only the real change.
    const next = makeVenue({ spaces: [{ ...spaceB, name: "The Garden Room" }, spaceA] });
    const changes = diffVersions(prev, next);
    const spaceChanges = changes.filter((c) => c.field_path.startsWith("/spaces/"));
    expect(spaceChanges).toHaveLength(1);
    expect(spaceChanges[0].field_path).toBe("/spaces/garden");
    expect(spaceChanges[0].kind).toBe("changed");
  });

  it("reports added and removed spaces distinctly", () => {
    const spaceA = { id: "loft", name: "The Loft", structure_label: null, sq_ft: 1000, sq_ft_outdoor: null, ceiling_ft: null, setting: null, bookable_separately: true, description: null, includes_summary: null, evidence: { source_url: "https://example.com", snapshot_id: 1 } };
    const spaceB = { ...spaceA, id: "garden", name: "The Garden" };
    const prev = makeVenue({ spaces: [spaceA] });
    const next = makeVenue({ spaces: [spaceB] });
    const changes = diffVersions(prev, next).filter((c) => c.field_path.startsWith("/spaces/"));
    expect(changes).toContainEqual({ field_path: "/spaces/garden", kind: "added", from: null, to: spaceB });
    expect(changes).toContainEqual({ field_path: "/spaces/loft", kind: "removed", from: spaceA, to: null });
  });

  it("matches capacities by `${space_id}:${layout}`", () => {
    const tuple = { space_id: "loft", layout: "seated_dinner" as const, min: null, max: 100, as_stated_label: "Seated", tile: "seated" as const, condition: null, quote: "up to 100", source_url: "https://example.com", snapshot_id: 1 };
    const prev = makeVenue({ capacities: [tuple] });
    const next = makeVenue({ capacities: [{ ...tuple, max: 120 }] });
    const changes = diffVersions(prev, next);
    expect(changes).toContainEqual({ field_path: "/capacities/loft:seated_dinner", kind: "changed", from: tuple, to: { ...tuple, max: 120 } });
  });

  it("matches pricing add-ons by id and fixed fees by path id + fee key", () => {
    const addOn = { id: "corkage", name: "Corkage fee", category: "Bar", variant: null, group: "fb" as const, price: 50, price_max: null, unit: "per_unit" as const, per_space_prices: null, applies_to: null, path_ids: null, condition: null, priceable: true, tax_pct_override: null, min_guests: null, as_stated_price: "$50/bottle", note: null, quote: "$50/bottle", source_url: "https://example.com", snapshot_id: 1 };
    const fee = { applies_to: "space" as const, space_id: "loft", day: "sat" as const, season: null, amount: 6000, unit: "flat" as const, label: "Venue rental, Saturday", includes: [], key: "loft-sat", quote: "$6,000", source_url: "https://example.com", snapshot_id: 1 };
    const path = { id: "default", name: "Default", description: null, applies_to_spaces: "all" as const, fixed_fees: [fee], per_guest_tiers: [], minimums: [], required_staffing: null, rental_hours: null, year_surcharges: [], promotions: [], quote: "", source_url: "https://example.com", snapshot_id: 1 };

    const prev = makeVenue({ pricing: { archetype: null, paths: [path], rates: makeVenue().pricing.rates, add_ons: [addOn], required_third_party: [], notes: [] } });
    const next = makeVenue({
      pricing: {
        archetype: null,
        paths: [{ ...path, fixed_fees: [{ ...fee, amount: 6500 }] }],
        rates: makeVenue().pricing.rates,
        add_ons: [{ ...addOn, price: 60 }],
        required_third_party: [],
        notes: [],
      },
    });

    const changes = diffVersions(prev, next);
    expect(changes).toContainEqual({ field_path: "/pricing/add_ons/corkage", kind: "changed", from: addOn, to: { ...addOn, price: 60 } });
    expect(changes).toContainEqual({ field_path: "/pricing/paths/default/fixed_fees/loft-sat", kind: "changed", from: fee, to: { ...fee, amount: 6500 } });
  });

  it("matches faqs by question and inclusions by label+category", () => {
    const faq = { question: "Is parking included?", answer: "No.", source_url: "https://example.com", snapshot_id: 1 };
    const inclusion = { label: "Parking" as const, label_raw: "Parking", detail: "30 spaces", category: "Space" as const, quote: "30 spaces", source_url: "https://example.com", snapshot_id: 1 };
    const prev = makeVenue({ faqs: [faq], inclusions: [inclusion] });
    const next = makeVenue({ faqs: [{ ...faq, answer: "Yes, 30 spaces." }], inclusions: [{ ...inclusion, detail: "75 spaces" }] });
    const changes = diffVersions(prev, next);
    expect(changes).toContainEqual({ field_path: "/faqs/is-parking-included", kind: "changed", from: faq, to: { ...faq, answer: "Yes, 30 spaces." } });
    expect(changes).toContainEqual({ field_path: "/inclusions/Parking:Space", kind: "changed", from: inclusion, to: { ...inclusion, detail: "75 spaces" } });
  });
});
