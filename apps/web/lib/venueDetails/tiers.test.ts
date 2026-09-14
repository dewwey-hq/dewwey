import { describe, expect, it } from "vitest";
import { criticalFieldPaths, isCompareReady, isExcellent } from "./tiers";
import { emptyRates, fact, makeVenue, spineWith } from "./testHelpers";

function compareReadySpine() {
  return spineWith({
    catering: fact("open"),
    bar: fact("byob"),
    pricing_archetype: fact("inquire_only"),
  });
}

const headlineCapacityTuple = {
  space_id: "whole-venue-room",
  layout: "seated_dinner" as const,
  min: null,
  max: 150,
  as_stated_label: "Seated",
  tile: "seated" as const,
  condition: null,
  quote: "up to 150",
  source_url: "https://example.com",
  snapshot_id: 1,
};

const bookableSpace = {
  id: "whole-venue-room",
  name: "Main Room",
  structure_label: null,
  sq_ft: 1000,
  sq_ft_outdoor: null,
  ceiling_ft: null,
  setting: null,
  bookable_separately: true,
  description: null,
  includes_summary: null,
  evidence: { source_url: "https://example.com", snapshot_id: 1 },
};

describe("isCompareReady", () => {
  it("is true with secondary gaps (coat_check, hvac, etc. all not_stated)", () => {
    const venue = makeVenue({ spine: compareReadySpine(), spaces: [bookableSpace], capacities: [headlineCapacityTuple] });
    expect(isCompareReady(venue, { criticalGroundingFailures: 0, needsReview: false })).toBe(true);
  });

  it("inquire_only counts as a stated pricing_archetype", () => {
    const venue = makeVenue({ spine: compareReadySpine(), spaces: [bookableSpace], capacities: [headlineCapacityTuple] });
    expect(venue.spine.pricing_archetype.status).toBe("stated");
    expect(isCompareReady(venue, { criticalGroundingFailures: 0, needsReview: false })).toBe(true);
  });

  it("is false when a critical field was stripped by validation (criticalGroundingFailures > 0)", () => {
    const venue = makeVenue({ spine: compareReadySpine(), spaces: [bookableSpace], capacities: [headlineCapacityTuple] });
    expect(isCompareReady(venue, { criticalGroundingFailures: 1, needsReview: false })).toBe(false);
  });

  it("is false when needsReview is true regardless of everything else", () => {
    const venue = makeVenue({ spine: compareReadySpine(), spaces: [bookableSpace], capacities: [headlineCapacityTuple] });
    expect(isCompareReady(venue, { criticalGroundingFailures: 0, needsReview: true })).toBe(false);
  });

  it("is false when the headline capacity is not stated", () => {
    const venue = makeVenue({ spine: compareReadySpine() });
    expect(isCompareReady(venue, { criticalGroundingFailures: 0, needsReview: false })).toBe(false);
  });

  it("is false when catering or bar is not_stated", () => {
    const venue = makeVenue({ spine: spineWith({ bar: fact("byob"), pricing_archetype: fact("inquire_only") }), spaces: [bookableSpace], capacities: [headlineCapacityTuple] });
    expect(isCompareReady(venue, { criticalGroundingFailures: 0, needsReview: false })).toBe(false);
  });
});

describe("isExcellent", () => {
  it("is false when not compare_ready", () => {
    const venue = makeVenue();
    expect(isExcellent(venue, { compareReady: false, humanVerified: true })).toBe(false);
  });

  it("is true when compare_ready and human_verified, even with no pricing paths", () => {
    const venue = makeVenue();
    expect(isExcellent(venue, { compareReady: true, humanVerified: true })).toBe(true);
  });

  it("is false when compare_ready but no pricing paths and not human_verified", () => {
    const venue = makeVenue();
    expect(isExcellent(venue, { compareReady: true, humanVerified: false })).toBe(false);
  });

  it("is true when compare_ready and estimateCost on the default path returns a total", () => {
    const path = {
      id: "default",
      name: "Default",
      description: null,
      applies_to_spaces: "all" as const,
      fixed_fees: [
        { applies_to: "whole_venue" as const, space_id: null, day: null, season: null, amount: 5000, unit: "flat" as const, label: "Venue rental", includes: [], key: "flat", quote: "$5,000", source_url: "https://example.com", snapshot_id: 1 },
      ],
      per_guest_tiers: [],
      minimums: [],
      required_staffing: null,
      rental_hours: null,
      year_surcharges: [],
      promotions: [],
      quote: "",
      source_url: "https://example.com",
      snapshot_id: 1,
    };
    const venue = makeVenue({ pricing: { archetype: "inquire_only", paths: [path], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });
    expect(isExcellent(venue, { compareReady: true, humanVerified: false })).toBe(true);
  });
});

describe("criticalFieldPaths", () => {
  it("includes every critical spine key", () => {
    const venue = makeVenue();
    const paths = criticalFieldPaths(venue);
    expect(paths).toContain("/spine/catering");
    expect(paths).toContain("/spine/bar");
    expect(paths).toContain("/spine/pricing_archetype");
    expect(paths).toContain("/spine/venue_kind");
    // Important/secondary keys are not included.
    expect(paths).not.toContain("/spine/hvac");
    expect(paths).not.toContain("/spine/event_insurance");
  });

  it("includes the headline capacity tuple path when a headline exists", () => {
    const venue = makeVenue({ spine: compareReadySpine(), spaces: [bookableSpace], capacities: [headlineCapacityTuple] });
    expect(criticalFieldPaths(venue)).toContain("/capacities/whole-venue-room:seated_dinner");
  });

  it("includes default-path fixed fees and always includes /pricing/rates", () => {
    const path = {
      id: "default",
      name: "Default",
      description: null,
      applies_to_spaces: "all" as const,
      fixed_fees: [
        { applies_to: "whole_venue" as const, space_id: null, day: null, season: null, amount: 5000, unit: "flat" as const, label: "Venue rental", includes: [], key: "flat-fee", quote: "$5,000", source_url: "https://example.com", snapshot_id: 1 },
      ],
      per_guest_tiers: [],
      minimums: [],
      required_staffing: null,
      rental_hours: null,
      year_surcharges: [],
      promotions: [],
      quote: "",
      source_url: "https://example.com",
      snapshot_id: 1,
    };
    const venue = makeVenue({ pricing: { archetype: "inquire_only", paths: [path], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] } });
    const paths = criticalFieldPaths(venue);
    expect(paths).toContain("/pricing/paths/default/fixed_fees/flat-fee");
    expect(paths).toContain("/pricing/rates");
  });
});
