/**
 * Pure-function tests for venueAliasSignals.ts. No DB -- see that file's header for why these
 * are split out. Test cases mirror the worked examples in the findVenueAliasCandidates.ts spec.
 */
import { describe, it, expect } from "vitest";
import {
  computeStem,
  stripPunctuationVariant,
  isPunctuationVariant,
  normalizeExternalUrl,
  extractBioMentionSnippet,
  classifyBioMentionPhrase,
  levenshtein,
  isChurchLike,
  isChurchLikeUsername,
  isNonVenueBio,
  isExcludedPair,
  decideTier,
  suggestDirection,
} from "./venueAliasSignals";

describe("computeStem (S1)", () => {
  it("the.arbory and thearbory collapse to the same stem", () => {
    const a = computeStem("the.arbory");
    const b = computeStem("thearbory");
    expect(a).toBe(b);
    expect(a).toBe("arbory");
    expect(a.length).toBeGreaterThanOrEqual(4);
  });

  it("artifacteventschicago and artifactevents collapse to the same stem", () => {
    expect(computeStem("artifacteventschicago")).toBe(computeStem("artifactevents"));
    expect(computeStem("artifactevents")).toBe("artifact");
  });

  it("strips chicago/chi/events/weddings/venue/banquets/official/il/the/and/at tokens", () => {
    expect(computeStem("saltshedchicago")).toBe("saltshed");
    expect(computeStem("thedalcychicago")).toBe(computeStem("thedalcy"));
  });

  it("does not strip a token that isn't actually present", () => {
    expect(computeStem("cantignypark")).toBe("cantignypark");
  });
});

describe("stripPunctuationVariant / isPunctuationVariant (S1b)", () => {
  it("thedrakechicago and thedrakechicago. are the same after stripping punctuation", () => {
    expect(stripPunctuationVariant("thedrakechicago.")).toBe("thedrakechicago");
    expect(isPunctuationVariant("thedrakechicago", "thedrakechicago.")).toBe(true);
  });

  it("underscore and trailing-dot variants both count", () => {
    expect(isPunctuationVariant("morgan.mfg", "morgan.mfg.")).toBe(true);
    expect(isPunctuationVariant("rc_chicago", "rcchicago")).toBe(true);
  });

  it("identical usernames are not flagged as a variant of themselves", () => {
    expect(isPunctuationVariant("thedrakechicago", "thedrakechicago")).toBe(false);
  });

  it("genuinely different handles are not flagged", () => {
    expect(isPunctuationVariant("venutisrestaurant", "venutis.banquets")).toBe(false);
  });
});

describe("normalizeExternalUrl (S3)", () => {
  it("strips scheme and www", () => {
    expect(normalizeExternalUrl("https://www.example.com")).toBe("example.com");
    expect(normalizeExternalUrl("http://example.com")).toBe("example.com");
  });

  it("strips a trailing slash", () => {
    expect(normalizeExternalUrl("https://example.com/venue/")).toBe("example.com/venue");
  });

  it("drops utm_* params but keeps others", () => {
    expect(normalizeExternalUrl("https://example.com/?utm_source=ig&ref=bio")).toBe(
      "example.com?ref=bio"
    );
  });

  it("treats scheme-less and full URLs the same", () => {
    expect(normalizeExternalUrl("www.example.com/venue")).toBe(
      normalizeExternalUrl("https://www.example.com/venue")
    );
  });

  it("returns null for empty/missing input", () => {
    expect(normalizeExternalUrl(null)).toBeNull();
    expect(normalizeExternalUrl("")).toBeNull();
    expect(normalizeExternalUrl("   ")).toBeNull();
  });
});

describe("extractBioMentionSnippet + classifyBioMentionPhrase (S4)", () => {
  it("classifies a dedicated-events-account phrase as alias_like", () => {
    const snippet = extractBioMentionSnippet(
      "University Club of Chicago | Weddings Account @uccweddings | book your tour today",
      "uccweddings"
    );
    expect(snippet).toContain("@uccweddings");
    expect(classifyBioMentionPhrase("Weddings Account @uccweddings")).toBe("alias_like");
  });

  it("classifies a management/operator phrase as related_not_alias", () => {
    expect(classifyBioMentionPhrase("Venue Management for @rockwellontheriver")).toBe(
      "related_not_alias"
    );
  });

  it("classifies book at / book via as alias_like", () => {
    expect(classifyBioMentionPhrase("Book at @totlspecialevents for private events")).toBe(
      "alias_like"
    );
  });

  it("classifies a sister-brand phrase as related_not_alias", () => {
    expect(classifyBioMentionPhrase("Sister property of @somewhereelse")).toBe(
      "related_not_alias"
    );
  });

  it("returns null when the snippet matches neither pattern", () => {
    expect(classifyBioMentionPhrase("Say hi to our friends @somewhereelse!")).toBeNull();
  });

  it("extractBioMentionSnippet is word-boundary safe and returns null for no mention", () => {
    expect(
      extractBioMentionSnippet("Thanks @thevenuepartners for everything!", "thevenue")
    ).toBeNull();
    expect(extractBioMentionSnippet(null, "thevenue")).toBeNull();
    expect(extractBioMentionSnippet("no mentions here", "thevenue")).toBeNull();
  });
});

describe("levenshtein (S6)", () => {
  it("saltshechicago and saltshedchicago are distance 1", () => {
    expect(levenshtein("saltshechicago", "saltshedchicago")).toBe(1);
  });

  it("distance 0 for identical strings", () => {
    expect(levenshtein("venutisrestaurant", "venutisrestaurant")).toBe(0);
  });

  it("is symmetric", () => {
    expect(levenshtein("kitten", "sitting")).toBe(levenshtein("sitting", "kitten"));
  });

  it("handles an empty string as the full length of the other", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });
});

describe("isChurchLike / isNonVenueBio (exclusions)", () => {
  it("flags church/parish/cathedral/chapel/temple/synagogue/mosque/basilica, case-insensitively", () => {
    expect(isChurchLike("St. Clement Parish")).toBe(true);
    expect(isChurchLike("Holy Name Cathedral")).toBe(true);
    expect(isChurchLike("A lovely reception hall")).toBe(false);
  });

  it("does not false-positive on a substring that isn't a whole word", () => {
    expect(isChurchLike("archipelago")).toBe(false);
  });

  it("isChurchLikeUsername matches an embedded word with no separator (concatenated handle)", () => {
    // "saintclementparish" has no space before "parish" -- a \b-anchored regex would never
    // match it (no word-boundary transition mid-word), which is exactly the bug this username
    // variant fixes. See findVenueAliasCandidates.ts's real-run expectation for this handle.
    expect(isChurchLikeUsername("saintclementparish")).toBe(true);
    expect(isChurchLikeUsername("holynamecathedral")).toBe(true);
    expect(isChurchLikeUsername("thearbory")).toBe(false);
  });

  it("flags catering/management/hospitality/planner/photography bios as non-venue", () => {
    expect(isNonVenueBio("Full-service catering and event management")).toBe(true);
    expect(isNonVenueBio("Wedding planner based in Chicago")).toBe(true);
    expect(isNonVenueBio("A rooftop event space in Fulton Market")).toBe(false);
  });
});

describe("isExcludedPair (round-3 false positives + deny list)", () => {
  it("excludes thedrakeoakbrook/thedrake in either order", () => {
    expect(isExcludedPair("thedrakeoakbrook", "thedrake")).toBe(true);
    expect(isExcludedPair("thedrake", "thedrakeoakbrook")).toBe(true);
  });

  it("excludes every round-3 false-positive pair", () => {
    expect(isExcludedPair("ravenswoodloftchicago", "ftchicago")).toBe(true);
    expect(isExcludedPair("riverroastchi", "riverroastchicago")).toBe(true);
    expect(isExcludedPair("gooseislandchicago", "gooseisland")).toBe(true);
    expect(isExcludedPair("swissotelchi", "swissotel")).toBe(true);
    expect(isExcludedPair("chicagofirehouserestaurant", "chicagofire")).toBe(true);
    expect(isExcludedPair("rpmeventschicago", "rpmevents")).toBe(true);
    expect(isExcludedPair("cafebrauer", "patioatcafebrauer")).toBe(true);
    expect(isExcludedPair("artinstitutechi", "artinstitutechicago")).toBe(true);
  });

  it("excludes any pair touching a deny-listed brand handle", () => {
    expect(isExcludedPair("venuelogic", "somevenue")).toBe(true);
    expect(isExcludedPair("somevenue", "swissotel")).toBe(true);
  });

  it("does not exclude an unrelated, unlisted pair", () => {
    expect(isExcludedPair("venutisrestaurant", "venutis.banquets")).toBe(false);
  });
});

describe("decideTier", () => {
  const base = {
    signalCodes: [] as import("./venueAliasSignals").SignalCode[],
    s1bFired: false,
    s2BothVenueCategory: false,
    s4AliasLikeFired: false,
    s5MaxPostCount: 0,
    s6Fired: false,
    s7MaxPostCount: 0,
  };

  it("T1 on S1b alone", () => {
    expect(decideTier({ ...base, signalCodes: ["S1b"], s1bFired: true })).toBe("T1");
  });

  it("T1 on S2 with both venue-category", () => {
    expect(decideTier({ ...base, signalCodes: ["S2"], s2BothVenueCategory: true })).toBe("T1");
  });

  it("T1 on S4 alias_like", () => {
    expect(decideTier({ ...base, signalCodes: ["S4"], s4AliasLikeFired: true })).toBe("T1");
  });

  it("T2 on two distinct signals with no T1 trigger", () => {
    expect(decideTier({ ...base, signalCodes: ["S1", "S3"] })).toBe("T2");
  });

  it("T2 on S5 with >=5 posts alone", () => {
    expect(decideTier({ ...base, signalCodes: ["S5"], s5MaxPostCount: 5 })).toBe("T2");
  });

  it("T3 on S5 with fewer than 5 posts and nothing else", () => {
    expect(decideTier({ ...base, signalCodes: ["S5"], s5MaxPostCount: 2 })).toBe("T3");
  });

  it("T2 on S6 alone", () => {
    expect(decideTier({ ...base, signalCodes: ["S6"], s6Fired: true })).toBe("T2");
  });

  it("T2 on S7 with >=3 posts alone", () => {
    expect(decideTier({ ...base, signalCodes: ["S7"], s7MaxPostCount: 3 })).toBe("T2");
  });

  it("T3 on S7 with fewer than 3 posts and nothing else", () => {
    expect(decideTier({ ...base, signalCodes: ["S7"], s7MaxPostCount: 2 })).toBe("T3");
  });

  it("T3 on a single weak signal", () => {
    expect(decideTier({ ...base, signalCodes: ["S1"] })).toBe("T3");
  });
});

describe("suggestDirection", () => {
  it("prefers the scraped profile", () => {
    const d = suggestDirection(
      { username: "a", hasScrapedProfile: true, hasFullName: false, followers: null },
      { username: "b", hasScrapedProfile: false, hasFullName: true, followers: 5000 }
    );
    expect(d.canonicalUsername).toBe("a");
    expect(d.aliasUsername).toBe("b");
  });

  it("falls back to full_name when scraped-profile status ties", () => {
    const d = suggestDirection(
      { username: "a", hasScrapedProfile: true, hasFullName: false, followers: 100 },
      { username: "b", hasScrapedProfile: true, hasFullName: true, followers: 1 }
    );
    expect(d.canonicalUsername).toBe("b");
  });

  it("falls back to followers when profile and full_name both tie", () => {
    const d = suggestDirection(
      { username: "a", hasScrapedProfile: true, hasFullName: true, followers: 200 },
      { username: "b", hasScrapedProfile: true, hasFullName: true, followers: 900 }
    );
    expect(d.canonicalUsername).toBe("b");
  });

  it("falls back to an alphabetical tie-break and says so", () => {
    const d = suggestDirection(
      { username: "zeta", hasScrapedProfile: false, hasFullName: false, followers: null },
      { username: "alpha", hasScrapedProfile: false, hasFullName: false, followers: null }
    );
    expect(d.canonicalUsername).toBe("alpha");
    expect(d.reason).toMatch(/arbitrary/);
  });
});
