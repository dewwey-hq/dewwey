/**
 * Pure-function tests for weddingMaintenance.ts (reanchorWeddings.ts /
 * mergeDuplicateWeddings.ts / seedVenueTypes.ts's shared helpers). No DB -- see that file's
 * header for why these are split out.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeCoupleNamePair,
  coupleNamesMatch,
  daysBetween,
  classifyVenueType,
  chooseReanchorTarget,
  type ReanchorInputs,
} from "./weddingMaintenance";

describe("normalizeCoupleNamePair / coupleNamesMatch", () => {
  it("matches '&' vs '+' vs different order/case", () => {
    expect(coupleNamesMatch("Natalie & Paul", "paul + natalie")).toBe(true);
  });

  it("matches 'and' as a separator", () => {
    expect(normalizeCoupleNamePair("Kelley and Corwin")).toBe("corwin|kelley");
    expect(coupleNamesMatch("Kelley and Corwin", "corwin & kelley")).toBe(true);
  });

  it("rejects a string with no whitespace-padded separator ('caterer+reception')", () => {
    expect(normalizeCoupleNamePair("caterer+reception")).toBeNull();
  });

  it("rejects a single-token string with no separator at all ('The Bedekers')", () => {
    expect(normalizeCoupleNamePair("The Bedekers")).toBeNull();
  });

  it("rejects when a first name is under 3 letters", () => {
    expect(normalizeCoupleNamePair("Jo & Alexandra")).toBeNull();
  });

  it("rejects null/empty/undefined input", () => {
    expect(normalizeCoupleNamePair(null)).toBeNull();
    expect(normalizeCoupleNamePair(undefined)).toBeNull();
    expect(normalizeCoupleNamePair("")).toBeNull();
  });

  it("does not match two different pairings", () => {
    expect(coupleNamesMatch("Natalie & Paul", "Jill & Sean")).toBe(false);
  });

  it("strips digits/@ from handle-shaped names without merging tokens", () => {
    expect(normalizeCoupleNamePair("@mjoy4mn & @mfolson2")).toBe("mfolson|mjoymn");
  });

  it("is false (not throwing) when either side fails to normalize", () => {
    expect(coupleNamesMatch("caterer+reception", "Natalie & Paul")).toBe(false);
  });
});

describe("daysBetween", () => {
  it("is symmetric and non-negative", () => {
    expect(daysBetween("2026-01-01", "2026-01-11")).toBe(10);
    expect(daysBetween("2026-01-11", "2026-01-01")).toBe(10);
  });

  it("is zero for the same date", () => {
    expect(daysBetween("2026-06-15", "2026-06-15")).toBe(0);
  });
});

describe("classifyVenueType", () => {
  const cases: Array<[string, string, string | null]> = [
    ["Holy Name Cathedral", "house_of_worship", "cathedral"],
    ["St. Michael Parish", "house_of_worship", "parish"],
    ["The Peninsula Chicago", "hotel", "peninsula"],
    ["Chicago Marriott Downtown", "hotel", "marriott"],
    ["River Forest Inn", "hotel", "inn\\b"],
    ["Butterfield Country Club", "country_club", "country club"],
    ["Medinah Golf Club", "country_club", "golf"],
    ["Field Museum", "museum", "museum"],
    ["Garfield Park Conservatory", "museum", "conservatory"],
    ["Lincoln Park Zoo", "park_outdoor", "park\\b"],
    ["Chicago Botanic Garden", "park_outdoor", "garden"],
    ["Hidden Barn Farm", "farm_estate", "farm"],
    ["Blackberry Vineyard", "farm_estate", "vineyard"],
    ["RPM Steakhouse", "restaurant", "steakhouse"],
    ["The Aviary Cocktail Kitchen", "restaurant", "kitchen"],
    ["Rockwell on the River Loft", "event_space", "loft"],
    ["Bridgeport Art Center", "event_space", "center"],
    ["Jane Smith Photography", "other", null],
    // D056 follow-up 2 (coordinator, 2026-09-10) -- zero-metadata accounts (username only),
    // exercising the squash mechanism and the new keyword additions.
    ["crowneplaza", "hotel", "plaza"],
    // Matches via country_club's very FIRST keyword ("country club") through its squashed
    // form -- squash("country club") = "countryclub", which is a literal substring of the
    // squashed haystack "thegrovecountryclub". The new explicit "golfclub|countryclub|golf
    // club" keyword (added per the coordinator's request) is redundant for this exact case,
    // since "country club" already wins via squashing before that later rule is even tried --
    // it still adds real coverage for OTHER un-squashed country-club-flavored text.
    ["thegrovecountryclub", "country_club", "country club"],
    ["saddleandcycleclub", "country_club", "cycle club"],
    ["whirlyball", "other", null],
    ["harrycarays", "other", null], // no reclassify: zero metadata, no substring signal at all
  ];

  it.each(cases)("classifies %s as %s (keyword %s)", (text, type, keyword) => {
    const result = classifyVenueType(text);
    expect(result.type).toBe(type);
    expect(result.matchedKeyword).toBe(keyword);
  });

  it("is case-insensitive", () => {
    expect(classifyVenueType("HOLY NAME CATHEDRAL").type).toBe("house_of_worship");
  });

  it("first category wins when text matches multiple categories (church before event_space's 'hall')", () => {
    // "church" hits house_of_worship (category 1); the same text also contains no event_space
    // keyword here, but this checks category ORDER specifically: a hotel keyword appearing in
    // a museum-ish name still resolves to hotel because hotel is checked before museum below.
    expect(classifyVenueType("Hyatt Regency Ballroom").type).toBe("hotel");
  });
});

describe("chooseReanchorTarget", () => {
  const base: ReanchorInputs = {
    isProtected: false,
    currentVenueAccountId: 1,
    currentAnchorIsVenueCategory: false,
    otherVenueCreditAccountIds: [],
    locationTagVenueAccountIds: [],
    venueCategoryAccountIds: new Set<number>(),
  };

  it("is protected outright regardless of other facts", () => {
    expect(
      chooseReanchorTarget({ ...base, isProtected: true, otherVenueCreditAccountIds: [2], venueCategoryAccountIds: new Set([2]) })
    ).toEqual({ kind: "protected" });
  });

  it("protected wins even over an already-venue-category current anchor", () => {
    expect(chooseReanchorTarget({ ...base, isProtected: true, currentAnchorIsVenueCategory: true })).toEqual({
      kind: "protected",
    });
  });

  // --- D056 follow-up 1 shapes: currentAnchorIsVenueCategory takes priority over rule (a)/(b) ---

  it("insert_credit when the current anchor is already venue-category, even with a competing rule-(a) candidate (wedding 2135 shape: chicagoparks anchor, theblackstonehotel carrying the sole other venue-role credit)", () => {
    expect(
      chooseReanchorTarget({
        ...base,
        currentAnchorIsVenueCategory: true,
        otherVenueCreditAccountIds: [99],
        venueCategoryAccountIds: new Set([1, 99]),
      })
    ).toEqual({ kind: "insert_credit" });
  });

  it("insert_credit when the current anchor is venue-category with zero other credits (wedding 5105/5107 shape: adlerplanet/chicagowinery anchors, no competing credit at all)", () => {
    expect(chooseReanchorTarget({ ...base, currentAnchorIsVenueCategory: true })).toEqual({ kind: "insert_credit" });
  });

  // --- rule (a)/(b) only fire when the current anchor is NOT venue-category ---

  it("rule (a): moved when the current anchor is NOT venue-category and the sole other credit IS (wedding 267 shape: lmcateringchi anchor -> lacunaloftevents)", () => {
    expect(
      chooseReanchorTarget({
        ...base,
        otherVenueCreditAccountIds: [2],
        venueCategoryAccountIds: new Set([2]),
      })
    ).toEqual({ kind: "moved", rule: "other_venue_credit", newVenueAccountId: 2 });
  });

  it("rule (a) ignores the current venue_id if it appears in the credit list", () => {
    expect(
      chooseReanchorTarget({ ...base, otherVenueCreditAccountIds: [1, 2], venueCategoryAccountIds: new Set([2]) })
    ).toEqual({ kind: "moved", rule: "other_venue_credit", newVenueAccountId: 2 });
  });

  it("human queue (NOT moved, NOT a fallback to rule b) when the sole rule-(a) candidate is not itself venue-category (rojogusano/eleganteventlighting shape)", () => {
    const result = chooseReanchorTarget({
      ...base,
      otherVenueCreditAccountIds: [2],
      locationTagVenueAccountIds: [3], // present, but must NOT be tried -- rule (a)'s single hit is decisive
      venueCategoryAccountIds: new Set([3]), // note: 2 is deliberately absent
    });
    expect(result.kind).toBe("human_queue");
    if (result.kind === "human_queue") {
      expect(result.reason).toMatch(/rule \(a\).*not itself venue-category/);
    }
  });

  it("human queue when the sole rule-(b) candidate is not itself venue-category", () => {
    const result = chooseReanchorTarget({
      ...base,
      locationTagVenueAccountIds: [3],
      venueCategoryAccountIds: new Set<number>(),
    });
    expect(result.kind).toBe("human_queue");
    if (result.kind === "human_queue") {
      expect(result.reason).toMatch(/rule \(b\).*not itself venue-category/);
    }
  });

  it("falls through to rule (b) when rule (a) has zero candidates", () => {
    expect(
      chooseReanchorTarget({ ...base, locationTagVenueAccountIds: [3], venueCategoryAccountIds: new Set([3]) })
    ).toEqual({ kind: "moved", rule: "location_tag", newVenueAccountId: 3 });
  });

  it("falls through to rule (b) when rule (a) is ambiguous (>1 candidates)", () => {
    expect(
      chooseReanchorTarget({
        ...base,
        otherVenueCreditAccountIds: [2, 3],
        locationTagVenueAccountIds: [4],
        venueCategoryAccountIds: new Set([2, 3, 4]),
      })
    ).toEqual({ kind: "moved", rule: "location_tag", newVenueAccountId: 4 });
  });

  it("human queue when neither rule resolves", () => {
    const result = chooseReanchorTarget(base);
    expect(result.kind).toBe("human_queue");
    if (result.kind === "human_queue") {
      expect(result.reason).toMatch(/rule \(a\)/);
      expect(result.reason).toMatch(/rule \(b\)/);
    }
  });

  it("human queue when both rules are ambiguous", () => {
    const result = chooseReanchorTarget({
      ...base,
      otherVenueCreditAccountIds: [2, 3],
      locationTagVenueAccountIds: [4, 5],
      venueCategoryAccountIds: new Set([2, 3, 4, 5]),
    });
    expect(result.kind).toBe("human_queue");
    if (result.kind === "human_queue") {
      expect(result.reason).toMatch(/2 other venue-role credits, ambiguous/);
      expect(result.reason).toMatch(/2 location-tag-resolved venue accounts, ambiguous/);
    }
  });

  it("dedupes duplicate account ids before counting", () => {
    expect(
      chooseReanchorTarget({ ...base, otherVenueCreditAccountIds: [2, 2, 2], venueCategoryAccountIds: new Set([2]) })
    ).toEqual({ kind: "moved", rule: "other_venue_credit", newVenueAccountId: 2 });
  });
});
