/**
 * Pure-function tests for reportVenueIdentityTaxonomy.ts's classifyVenue. No DB -- the script
 * resolves every fact in SQL first and passes a plain row in, same split as venueAliasSignals.ts.
 * Importing the module never runs it: main() is guarded by import.meta.url === process.argv[1].
 */
import { describe, it, expect } from "vitest";
import { classifyVenue, type VenueRow } from "./reportVenueIdentityTaxonomy";

const base: VenueRow = {
  id: 1,
  username: "someplace",
  followers: 1000,
  weddings: 0,
  isAlias: false,
  hasLocationRow: true,
  inMetro: true,
  topRoleIsVenueOrHotel: true,
  crawlStatus: null,
  postsFetched: 0,
  hasWebsite: true,
  hasPlaces: false,
  scraped: true,
  biography: null,
};

describe("classifyVenue (D062 taxonomy)", () => {
  it("an alias is merged_away, whatever else is true of it", () => {
    expect(classifyVenue({ ...base, isAlias: true, weddings: 5 })).toBe("merged_away");
  });

  // The biggest actionable bucket: already clears the >= 1 bar, invisible for want of geography.
  it("geo_blocked: has weddings but no location row", () => {
    expect(classifyVenue({ ...base, weddings: 3, hasLocationRow: false, inMetro: false })).toBe("geo_blocked");
  });

  it("geo_blocked: has weddings and a location row, but in_metro is false", () => {
    expect(classifyVenue({ ...base, weddings: 3, hasLocationRow: true, inMetro: false })).toBe("geo_blocked");
  });

  it("mis_anchored: has weddings, is located, but its top role is not venue/hotel", () => {
    expect(classifyVenue({ ...base, weddings: 2, topRoleIsVenueOrHotel: false })).toBe("mis_anchored");
  });

  it("geography is checked before role -- a wedding-bearing account missing both is geo_blocked", () => {
    // Deliberate ordering: geography is a cheaper and more certain fix than re-anchoring.
    expect(
      classifyVenue({ ...base, weddings: 2, hasLocationRow: false, topRoleIsVenueOrHotel: false })
    ).toBe("geo_blocked");
  });

  it("not_a_venue: a website builder that reached a venue role through credit-line parsing", () => {
    expect(classifyVenue({ ...base, username: "wix", followers: 882810 })).toBe("not_a_venue");
    expect(classifyVenue({ ...base, username: "Squarespace" })).toBe("not_a_venue");
  });

  it("chain_brand: an umbrella handle with no weddings of its own", () => {
    expect(classifyVenue({ ...base, username: "marriottbonvoy", weddings: 0 })).toBe("chain_brand");
  });

  it("an umbrella handle that DOES hold weddings is left alone -- it is functioning as a venue", () => {
    expect(classifyVenue({ ...base, username: "marriottbonvoy", weddings: 4 })).not.toBe("chain_brand");
  });

  it("dead_feed: zero weddings and the feed was measured dead", () => {
    expect(classifyVenue({ ...base, weddings: 0, crawlStatus: "dead", postsFetched: 25 })).toBe("dead_feed");
  });

  it("never_crawled: zero weddings, identity known, feed never pulled", () => {
    expect(classifyVenue({ ...base, weddings: 0, crawlStatus: null, postsFetched: 0 })).toBe("never_crawled");
  });

  it("no_identity: zero weddings and nothing to decide a remedy from", () => {
    expect(
      classifyVenue({ ...base, weddings: 0, scraped: false, hasWebsite: false, hasPlaces: false })
    ).toBe("no_identity");
  });

  it("a scraped-but-uncrawled account is never_crawled, not no_identity", () => {
    expect(
      classifyVenue({ ...base, weddings: 0, scraped: true, hasWebsite: false, hasPlaces: false, postsFetched: 0 })
    ).toBe("never_crawled");
  });
});
