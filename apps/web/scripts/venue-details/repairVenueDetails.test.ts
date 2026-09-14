import { describe, expect, it } from "vitest";
import { buildExcerpt, excerptsForRepairs, mergeRepairReply } from "./repairVenueDetails";
import type { AssemblePage } from "./validate/assemble";
import type { RawSpineResult, Repair, VenueDetailsRunResult } from "./contract";

describe("buildExcerpt", () => {
  it("returns the whole page when it's <= 6000 chars", () => {
    const text = "short page text";
    expect(buildExcerpt(text, ["irrelevant"])).toBe(text);
  });

  it("returns windows around each keyword hit for a long page, not the whole thing", () => {
    const filler = "x".repeat(10_000);
    const text = `${filler.slice(0, 4000)} MINIMUM SPEND IS $6000 HERE ${filler.slice(4000)}`;
    const excerpt = buildExcerpt(text, ["minimum"]);
    expect(excerpt.length).toBeLessThan(text.length);
    expect(excerpt.toUpperCase()).toContain("MINIMUM SPEND IS $6000");
  });

  it("merges overlapping windows from multiple keyword hits into one", () => {
    const filler = "y".repeat(10_000);
    const text = `${filler.slice(0, 4000)} minimum near parking here ${filler.slice(4000, 4100)} more parking talk ${filler.slice(4100)}`;
    const excerpt = buildExcerpt(text, ["minimum", "parking"]);
    expect(excerpt).toContain("minimum near parking");
  });

  it("falls back to the first 6000 chars when no keyword is found at all", () => {
    const text = "z".repeat(10_000);
    expect(buildExcerpt(text, ["nonexistent"]).length).toBe(6000);
  });
});

describe("excerptsForRepairs", () => {
  it("builds one excerpt per referenced snapshot id, unioning keyword hits", () => {
    const pages = new Map<number, AssemblePage>([
      [1, { url: "https://x.com/pricing", text: "The minimum spend is $6,000 for Saturday events.", snapshot_id: 1 }],
      [2, { url: "https://x.com/faq", text: "Parking is available on-site for a fee.", snapshot_id: 2 }],
    ]);
    const repairs: Repair[] = [
      { field_path: "/spine/fb_minimum", issue_code: "ungrounded_spine", tier: "critical", instruction: "x", evidence_hint: { snapshot_ids: [1], keyword_hits: ["minimum"] } },
      { field_path: "/spine/parking", issue_code: "ungrounded_spine", tier: "important", instruction: "x", evidence_hint: { snapshot_ids: [2], keyword_hits: ["parking"] } },
    ];
    const excerpts = excerptsForRepairs(repairs, pages);
    expect(excerpts).toHaveLength(2);
    expect(excerpts.find((e) => e.url === "https://x.com/pricing")?.text).toContain("minimum spend");
    expect(excerpts.find((e) => e.url === "https://x.com/faq")?.text).toContain("Parking");
  });

  it("skips a snapshot id with no matching page", () => {
    const repairs: Repair[] = [{ field_path: "/spine/parking", issue_code: "ungrounded_spine", tier: "important", instruction: "x", evidence_hint: { snapshot_ids: [999], keyword_hits: ["parking"] } }];
    expect(excerptsForRepairs(repairs, new Map())).toEqual([]);
  });
});

function baseSpineCall(): RawSpineResult {
  return {
    spine: {
      catering: { status: "stated", value: "open", quote: "q", source_url: "u" },
      bar: { status: "stated", value: "in_house", quote: "q", source_url: "u" },
    },
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

function baseResult(): VenueDetailsRunResult {
  return { spine_call: baseSpineCall(), pricing_call: null, document_chars: 100, pages: ["https://x.com"] };
}

describe("mergeRepairReply -- field-path isolation", () => {
  it("only changes the requested spine key, leaving other spine fields untouched", () => {
    const parent = baseResult();
    const reply = { spine: { catering: { status: "not_stated" } } };
    const merged = mergeRepairReply(parent, ["/spine/catering"], reply);
    expect(merged.spine_call.spine.catering).toEqual({ status: "not_stated" });
    expect(merged.spine_call.spine.bar).toEqual(parent.spine_call.spine.bar);
  });

  it("drops an unrequested extra key even if the model included it", () => {
    const parent = baseResult();
    const reply = { spine: { catering: { status: "not_stated" }, bar: { status: "stated", value: "byob", quote: "q2", source_url: "u2" } } };
    const merged = mergeRepairReply(parent, ["/spine/catering"], reply);
    expect(merged.spine_call.spine.catering).toEqual({ status: "not_stated" });
    // bar was NOT in the requested field_paths -- must be untouched, even though the reply had it.
    expect(merged.spine_call.spine.bar).toEqual(parent.spine_call.spine.bar);
  });

  it("accepts a conflicting status for a spine field", () => {
    const parent = baseResult();
    const reply = {
      spine: {
        catering: { status: "conflicting", candidates: [{ value: "open", quote: "q1", source_url: "u1" }, { value: "preferred_list", quote: "q2", source_url: "u2" }] },
      },
    };
    const merged = mergeRepairReply(parent, ["/spine/catering"], reply);
    expect(merged.spine_call.spine.catering.status).toBe("conflicting");
  });

  it("does not mutate the parent result object", () => {
    const parent = baseResult();
    const originalCatering = parent.spine_call.spine.catering;
    mergeRepairReply(parent, ["/spine/catering"], { spine: { catering: { status: "not_stated" } } });
    expect(parent.spine_call.spine.catering).toBe(originalCatering);
  });

  it("merges a pricing sub-field and leaves other pricing fields untouched", () => {
    const parent: VenueDetailsRunResult = {
      spine_call: baseSpineCall(),
      pricing_call: {
        archetype: "rental_plus_fb_minimum",
        paths: [],
        rates: { service_charge_pct: null, service_charge_base: null, sales_tax_pct: null, sales_tax_base: null, taxes_included_in_rental: null, cc_fee_pct: null, quote: null, source_url: null },
        add_ons: [{ id: "a1", name: "Chairs", category: "rentals", variant: null, group: "rental", price: 5, price_max: null, unit: "per_unit", per_space_prices: null, applies_to: "all", path_ids: null, condition: null, priceable: true, tax_pct_override: null, min_guests: null, as_stated_price: null, note: null, quote: "q", source_url: "u" }],
        food_beverage: { food_pills: [], bar_pills: [], caption: null, menus: [], bar_ladders: [], bar_min_guests: null, notes: [] },
        required_third_party: [],
        faqs: [],
        notes: null,
      },
      document_chars: 100,
      pages: [],
    };
    const reply = { pricing: { add_ons: [{ id: "a1", name: "Chairs", category: "rentals", variant: null, group: "rental", price: 6, price_max: null, unit: "per_unit", per_space_prices: null, applies_to: "all", path_ids: null, condition: null, priceable: true, tax_pct_override: null, min_guests: null, as_stated_price: null, note: null, quote: "q2", source_url: "u2" }] } };
    const merged = mergeRepairReply(parent, ["/pricing/add_ons"], reply);
    expect(merged.pricing_call?.add_ons[0].price).toBe(6);
    expect(merged.pricing_call?.archetype).toBe("rental_plus_fb_minimum"); // untouched
  });

  it("ignores a pricing reply key entirely when pricing_call is null on the parent", () => {
    const parent = baseResult(); // pricing_call: null
    const merged = mergeRepairReply(parent, ["/pricing/add_ons"], { pricing: { add_ons: [{ id: "new" }] } });
    expect(merged.pricing_call).toBeNull();
  });

  it("merges a top-level root (capacities)", () => {
    const parent = baseResult();
    const newCapacities = [{ space_id: "whole_venue", layout: "seated_dinner", min: null, max: 150, as_stated_label: "Seated", condition: null, quote: "q", source_url: "u" }];
    const merged = mergeRepairReply(parent, ["/capacities"], { capacities: newCapacities });
    expect(merged.spine_call.capacities).toEqual(newCapacities);
  });
});
