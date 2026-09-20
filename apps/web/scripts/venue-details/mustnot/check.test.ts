import { describe, expect, it } from "vitest";
import { fact, makeVenue } from "../../../lib/venueDetails/testHelpers";
import type { CapacityTuple, Space, VendorList } from "../../../lib/venueDetails/types";
import { runMustNot, type MustNotAssertion } from "./check";

function space(overrides: Partial<Space>): Space {
  return {
    id: overrides.id ?? "space",
    name: overrides.name ?? "Main Room",
    structure_label: null,
    sq_ft: null,
    sq_ft_outdoor: null,
    ceiling_ft: null,
    setting: null,
    bookable_separately: true,
    description: null,
    includes_summary: null,
    evidence: { source_url: "https://example.com", snapshot_id: null },
    ...overrides,
  };
}

function capacity(overrides: Partial<CapacityTuple>): CapacityTuple {
  return {
    space_id: "space",
    layout: "seated_dinner",
    min: null,
    max: 100,
    as_stated_label: "Seated",
    tile: "seated",
    condition: null,
    quote: "up to 100",
    source_url: "https://example.com",
    snapshot_id: null,
    ...overrides,
  };
}

describe("runMustNot: an empty document passes every assertion", () => {
  const ALL_ASSERTIONS: MustNotAssertion[] = [
    { kind: "no_generic_label_space" },
    { kind: "no_duplicate_space" },
    { kind: "no_summed_rooms" },
    { kind: "no_adr_price" },
    { kind: "no_hotel_faq_majority" },
    { kind: "no_junk_vendor_names" },
    { kind: "no_gala_floor_plan_when_wedding_exists" },
    { kind: "no_amalgam_capacity_range" },
    { kind: "no_split_single_area", areaNames: ["Loft", "Skygarden"] },
    { kind: "capacity_headline_not_null_if_site_states" },
  ];

  it("a thin/empty crawl passes trivially", () => {
    const result = runMustNot(makeVenue(), ALL_ASSERTIONS);
    expect(result.passed).toBe(true);
    expect(result.failed).toEqual([]);
  });
});

describe("no_generic_label_space", () => {
  it("fails a 'Wedding Venues' space", () => {
    const d = makeVenue({ spaces: [space({ name: "Wedding Venues" })] });
    const result = runMustNot(d, [{ kind: "no_generic_label_space" }]);
    expect(result.passed).toBe(false);
    expect(result.failed[0].assertion).toBe("no_generic_label_space");
  });

  it("passes a real named room", () => {
    const d = makeVenue({ spaces: [space({ name: "The Pavilion" })] });
    expect(runMustNot(d, [{ kind: "no_generic_label_space" }]).passed).toBe(true);
  });
});

describe("no_duplicate_space", () => {
  it("fails the Four Seasons Delaware / Delaware Room pattern", () => {
    const d = makeVenue({ spaces: [space({ id: "a", name: "Delaware" }), space({ id: "b", name: "Delaware Room" })] });
    expect(runMustNot(d, [{ kind: "no_duplicate_space" }]).passed).toBe(false);
  });

  it("passes two genuinely distinct rooms", () => {
    const d = makeVenue({ spaces: [space({ id: "a", name: "The Pavilion" }), space({ id: "b", name: "La Pergola" })] });
    expect(runMustNot(d, [{ kind: "no_duplicate_space" }]).passed).toBe(true);
  });
});

describe("no_amalgam_capacity_range", () => {
  it("fails a min-max span over 10x", () => {
    const d = makeVenue({ capacities: [capacity({ min: 10, max: 1200 })] });
    expect(runMustNot(d, [{ kind: "no_amalgam_capacity_range" }]).passed).toBe(false);
  });

  it("passes a normal span", () => {
    const d = makeVenue({ capacities: [capacity({ min: 100, max: 425 })] });
    expect(runMustNot(d, [{ kind: "no_amalgam_capacity_range" }]).passed).toBe(true);
  });
});

describe("no_adr_price", () => {
  it("fails a guest-room nightly-rate quote on a fixed fee", () => {
    const d = makeVenue({
      pricing: {
        archetype: null,
        rates: { service_charge_pct: null, service_charge_base: null, sales_tax_pct: null, sales_tax_base: null, sales_tax_source: "unknown", cc_fee_pct: null, quote: null, source_url: null, snapshot_id: null },
        add_ons: [],
        required_third_party: [],
        notes: [],
        paths: [
          {
            id: "default",
            name: "Default",
            description: null,
            applies_to_spaces: "all",
            fixed_fees: [{ applies_to: "whole_venue", space_id: null, day: null, season: null, amount: 163, unit: "flat", label: "Room", includes: [], key: "room", quote: "From $163/night", source_url: "https://example.com", snapshot_id: null }],
            per_guest_tiers: [],
            minimums: [],
            required_staffing: null,
            rental_hours: null,
            year_surcharges: [],
            promotions: [],
            quote: "",
            source_url: "https://example.com",
            snapshot_id: null,
          },
        ],
      },
    });
    expect(runMustNot(d, [{ kind: "no_adr_price" }]).passed).toBe(false);
  });

  it("passes a real venue rental fee quote", () => {
    const d = makeVenue({
      pricing: {
        archetype: null,
        rates: { service_charge_pct: null, service_charge_base: null, sales_tax_pct: null, sales_tax_base: null, sales_tax_source: "unknown", cc_fee_pct: null, quote: null, source_url: null, snapshot_id: null },
        add_ons: [],
        required_third_party: [],
        notes: [],
        paths: [
          {
            id: "default",
            name: "Default",
            description: null,
            applies_to_spaces: "all",
            fixed_fees: [{ applies_to: "whole_venue", space_id: null, day: null, season: null, amount: 5000, unit: "flat", label: "Venue rental", includes: [], key: "rental", quote: "Venue rental: $5,000", source_url: "https://example.com", snapshot_id: null }],
            per_guest_tiers: [],
            minimums: [],
            required_staffing: null,
            rental_hours: null,
            year_surcharges: [],
            promotions: [],
            quote: "",
            source_url: "https://example.com",
            snapshot_id: null,
          },
        ],
      },
    });
    expect(runMustNot(d, [{ kind: "no_adr_price" }]).passed).toBe(true);
  });
});

describe("no_hotel_faq_majority", () => {
  const hotelSpine = () => ({ ...makeVenue().spine, venue_kind: fact("hotel" as const) });

  it("fails when a hotel venue's FAQs are >90% generic hotel-guest content", () => {
    const d = makeVenue({
      spine: hotelSpine(),
      faqs: Array.from({ length: 5 }, (_, i) => ({ question: `Check-in / check-out question ${i}`, answer: "Check-in is at 3pm, wifi is free.", source_url: "https://example.com", snapshot_id: null })),
    });
    expect(runMustNot(d, [{ kind: "no_hotel_faq_majority" }]).passed).toBe(false);
  });

  it("passes when FAQs are wedding-relevant", () => {
    const d = makeVenue({
      spine: hotelSpine(),
      faqs: [{ question: "Can we bring our own caterer?", answer: "Catering must be through our in-house wedding team.", source_url: "https://example.com", snapshot_id: null }],
    });
    expect(runMustNot(d, [{ kind: "no_hotel_faq_majority" }]).passed).toBe(true);
  });
});

describe("no_junk_vendor_names", () => {
  function vendorList(entries: { name: string; url: string | null; instagram: string | null }[]): VendorList {
    return { label: "Preferred vendors", category: "general", relationship: "preferred", entries, source_url: "https://example.com", snapshot_id: null };
  }

  it("fails nav-junk and sluggy names", () => {
    const d = makeVenue({ vendor_lists: [vendorList([{ name: "Privacy Request", url: null, instagram: null }, { name: "Hmrdesigns", url: null, instagram: null }])] });
    const result = runMustNot(d, [{ kind: "no_junk_vendor_names" }]);
    expect(result.passed).toBe(false);
    expect(result.failed.length).toBe(2);
  });

  it("passes real vendor names", () => {
    const d = makeVenue({ vendor_lists: [vendorList([{ name: "HMR Designs", url: null, instagram: null }, { name: "Blush Botanicals", url: null, instagram: null }])] });
    expect(runMustNot(d, [{ kind: "no_junk_vendor_names" }]).passed).toBe(true);
  });

  // f1 (2026-09-20): the length-only heuristic failed 5 real one-word Chicago vendors whose own
  // domain vouches for them, and missed 4 of the 7 category headings Salvatore's list had leaked.
  it("passes one-word brands whose own domain vouches for them", () => {
    const d = makeVenue({
      vendor_lists: [
        vendorList([
          { name: "Limelight", url: "https://www.limelightcatering.com", instagram: null },
          { name: "Tablescapes", url: "https://tablescapes.com", instagram: null },
          { name: "Shutterbooth", url: "https://shutterbooth.com", instagram: null },
          { name: "Bittersweet", url: "https://bittersweetpastry.com", instagram: null },
          { name: "Marryment", url: "https://marryment.com", instagram: null },
        ]),
      ],
    });
    expect(runMustNot(d, [{ kind: "no_junk_vendor_names" }]).passed).toBe(true);
  });

  it("fails every vendor-category heading ingested as an entry with no url", () => {
    const d = makeVenue({
      vendor_lists: [
        vendorList(
          ["Florists", "Photographers", "Bands", "DJs", "Hotels", "Transportation", "Officiants"].map((name) => ({ name, url: null, instagram: null }))
        ),
      ],
    });
    const result = runMustNot(d, [{ kind: "no_junk_vendor_names" }]);
    expect(result.passed).toBe(false);
    expect(result.failed.length).toBe(7);
    expect(result.failed[0].detail).toContain("vendor-category heading");
  });

  it("still fails a long one-word name its url does not vouch for", () => {
    const d = makeVenue({ vendor_lists: [vendorList([{ name: "Hmrdesigns", url: "https://example.com/vendors", instagram: null }])] });
    expect(runMustNot(d, [{ kind: "no_junk_vendor_names" }]).passed).toBe(false);
  });

  it("still fails an actual url-slug shape even when the domain matches", () => {
    const d = makeVenue({ vendor_lists: [vendorList([{ name: "kehoe-designs", url: "https://kehoedesigns.com", instagram: null }])] });
    expect(runMustNot(d, [{ kind: "no_junk_vendor_names" }]).passed).toBe(false);
  });

  it("passes a category word when the entry has a url (a real business may be named that)", () => {
    const d = makeVenue({ vendor_lists: [vendorList([{ name: "Transportation", url: "https://transportationchicago.com", instagram: null }])] });
    expect(runMustNot(d, [{ kind: "no_junk_vendor_names" }]).passed).toBe(true);
  });
});

describe("no_gala_floor_plan_when_wedding_exists", () => {
  it("fails when a gala-labeled plan exists alongside a wedding-labeled one", () => {
    const d = makeVenue({
      resources: [
        { id: "r1", kind: "floor_plan", label: "Wedding Floor Plan", url: "https://example.com/w.pdf", scope: "venue", embeddable: null, has_text_layer: null, checked_at: null, source_url: "https://example.com", snapshot_id: null },
        { id: "r2", kind: "floor_plan", label: "Gala Floor Plan", url: "https://example.com/g.pdf", scope: "venue", embeddable: null, has_text_layer: null, checked_at: null, source_url: "https://example.com", snapshot_id: null },
      ],
    });
    expect(runMustNot(d, [{ kind: "no_gala_floor_plan_when_wedding_exists" }]).passed).toBe(false);
  });

  it("passes a venue with only a wedding-labeled floor plan", () => {
    const d = makeVenue({
      resources: [{ id: "r1", kind: "floor_plan", label: "Wedding Floor Plan", url: "https://example.com/w.pdf", scope: "venue", embeddable: null, has_text_layer: null, checked_at: null, source_url: "https://example.com", snapshot_id: null }],
    });
    expect(runMustNot(d, [{ kind: "no_gala_floor_plan_when_wedding_exists" }]).passed).toBe(true);
  });
});

describe("no_split_single_area (Greenhouse Loft/Skygarden/Art Gallery)", () => {
  it("fails when the same physical area is split into multiple spaces", () => {
    const d = makeVenue({ spaces: [space({ id: "a", name: "Loft" }), space({ id: "b", name: "Skygarden" })] });
    expect(runMustNot(d, [{ kind: "no_split_single_area", areaNames: ["Loft", "Skygarden", "Art Gallery"] }]).passed).toBe(false);
  });

  it("passes when it's one space", () => {
    const d = makeVenue({ spaces: [space({ id: "a", name: "Loft" })] });
    expect(runMustNot(d, [{ kind: "no_split_single_area", areaNames: ["Loft", "Skygarden", "Art Gallery"] }]).passed).toBe(true);
  });
});
