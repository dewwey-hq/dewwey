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
  isUmbrellaBrandUsername,
  registrableHost,
  isAggregatorHost,
  sharesRegistrableHost,
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

  // Re-pinned 2026-09-20 (D062): S6 alone used to reach T2. It no longer does -- bare
  // Levenshtein <= 2 on 8-10 char handles paired @ihchicago with five different Chicago hotels.
  // It needs a shared stem or host to corroborate; see "decideTier with S3b and corroborated S6".
  it("S6 alone is T3 -- needs corroboration since D062", () => {
    expect(decideTier({ ...base, signalCodes: ["S6"], s6Fired: true })).toBe("T3");
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

describe("computeStem facility suffix (S1, D062)", () => {
  // The regression this whole change exists for: a venue's event arm never paired with its
  // brand handle because "center" survived the token strip.
  it("navypierchicago and navypiereventcenter reach the same stem", () => {
    expect(computeStem("navypierchicago")).toBe("navypier");
    expect(computeStem("navypiereventcenter")).toBe("navypier");
    expect(computeStem("navypiereventcenter")).toBe(computeStem("navypierchicago"));
  });

  it("strips other trailing facility nouns", () => {
    expect(computeStem("theramovapavilion")).toBe("ramova");
    expect(computeStem("skylineterrace")).toBe("skyline");
    expect(computeStem("aonballroom")).toBe("aon");
  });

  // The reason this is suffix-anchored instead of added to STRIP_TOKENS_RE. A global strip of
  // facility words would take greenhouseloft (34 weddings) down to "green".
  it("does NOT strip facility words that sit inside the venue's real name", () => {
    expect(computeStem("greenhouseloft")).toBe("greenhouseloft");
    expect(computeStem("dunhamwoodsridingclub")).toBe("dunhamwoodsridingclub");
  });

  it("never returns an empty stem when the handle is only a facility noun", () => {
    // The fallback matters: an empty stem would group every such handle together.
    expect(computeStem("eventcenter").length).toBeGreaterThan(0);
    expect(computeStem("pavilion").length).toBeGreaterThan(0);
    expect(computeStem("ballroom").length).toBeGreaterThan(0);
  });
});

describe("registrableHost / isAggregatorHost / sharesRegistrableHost (S3b, D062)", () => {
  it("drops scheme, www., path, query and port -- the S3 gap", () => {
    expect(registrableHost("https://www.navypier.org/host-an-event")).toBe("navypier.org");
    expect(registrableHost("navypier.org")).toBe("navypier.org");
    expect(registrableHost("http://navypier.org:8080/x?y=1#z")).toBe("navypier.org");
  });

  it("S3 and S3b disagree on exactly the case that matters", () => {
    // Same venue, different paths: S3's key differs, S3b's matches.
    expect(normalizeExternalUrl("https://navypier.org")).not.toBe(
      normalizeExternalUrl("https://navypier.org/host-an-event")
    );
    expect(sharesRegistrableHost("https://navypier.org", "https://navypier.org/host-an-event")).toBe(true);
  });

  it("returns null for empty/missing input", () => {
    expect(registrableHost(null)).toBeNull();
    expect(registrableHost("")).toBeNull();
    expect(registrableHost("   ")).toBeNull();
  });

  // Measured 2026-09-20: un-denied, linkin.bio groups 21 unrelated accounts, sprout.link 15.
  it("denies link-in-bio aggregators, including subdomains", () => {
    expect(isAggregatorHost("linkin.bio")).toBe(true);
    expect(isAggregatorHost("chicagowinery.linkin.bio")).toBe(true);
    expect(isAggregatorHost("sprout.link")).toBe(true);
    expect(isAggregatorHost("linktr.ee")).toBe(true);
  });

  it("denies booking and social platforms venues link to instead of their own site", () => {
    expect(isAggregatorHost("opentable.com")).toBe(true);
    expect(isAggregatorHost("exploretock.com")).toBe(true);
    expect(isAggregatorHost("instagram.com")).toBe(true);
    expect(isAggregatorHost("vimeo.com")).toBe(true);
  });

  // D062 round 2: surfaced by the profile-enrichment scrape. Every property of a chain links to
  // the chain's booking site, so the host groups unrelated hotels across cities and continents.
  it("denies hotel-chain booking domains", () => {
    expect(isAggregatorHost("marriott.com")).toBe(true);
    expect(isAggregatorHost("hyatt.com")).toBe(true);
    expect(isAggregatorHost("hilton.com")).toBe(true);
    expect(isAggregatorHost("reservations.marriott.com")).toBe(true);
  });

  it("denies the shorteners the same run exposed", () => {
    expect(isAggregatorHost("likeshop.me")).toBe(true);
    expect(isAggregatorHost("youtu.be")).toBe(true);
  });

  it("allows a real venue domain", () => {
    expect(isAggregatorHost("salvageone.com")).toBe(false);
    expect(isAggregatorHost("navypier.org")).toBe(false);
    expect(isAggregatorHost(null)).toBe(false);
  });

  it("sharesRegistrableHost refuses to pair on an aggregator", () => {
    // Both navypierchicago and navypiereventcenter really do sit on sprout.link -- a right
    // answer for the wrong reason, alongside Loyola and Choose Chicago.
    expect(sharesRegistrableHost("https://sprout.link/navypier", "https://sprout.link/loyola")).toBe(false);
    expect(sharesRegistrableHost("https://salvageone.com", "https://salvageone.com/events")).toBe(true);
  });
});

describe("isNonVenueBio venue-self-description override (D062)", () => {
  // The bug: @victoriainthepark (15 weddings) was excluded from aliasing because its bio
  // contains the bare word "catering".
  it("an all-inclusive venue describing its amenities is not a caterer", () => {
    expect(isNonVenueBio("All-inclusive venue (catering, bar) for any event!")).toBe(false);
    expect(isNonVenueBio("Private & Public Events Venue. Catering by @greenspoonk")).toBe(false);
  });

  it("still excludes an account that IS a catering or planning business", () => {
    expect(isNonVenueBio("Chicago's premier catering company")).toBe(true);
    expect(isNonVenueBio("Full-service wedding planning")).toBe(true);
    expect(isNonVenueBio("Restaurant group / hospitality")).toBe(true);
  });

  it("is unchanged for bios with no non-venue keyword at all", () => {
    expect(isNonVenueBio("Historic wedding and event venue")).toBe(false);
    expect(isNonVenueBio(null)).toBe(false);
  });
});

describe("decideTier with S3b and corroborated S6 (D062)", () => {
  const base = {
    signalCodes: [] as import("./venueAliasSignals").SignalCode[],
    s1bFired: false,
    s2BothVenueCategory: false,
    s4AliasLikeFired: false,
    s5MaxPostCount: 0,
    s6Fired: false,
    s7MaxPostCount: 0,
  };

  it("S3b alone is T2", () => {
    expect(decideTier({ ...base, signalCodes: ["S3b"], s3bFired: true })).toBe("T2");
  });

  it("S3b plus any second signal is T1", () => {
    expect(decideTier({ ...base, signalCodes: ["S3b", "S1"], s3bFired: true })).toBe("T1");
  });

  // The @ihchicago alphabet soup: five different Chicago hotels, all T2 before this change.
  it("uncorroborated S6 falls to T3", () => {
    expect(decideTier({ ...base, signalCodes: ["S6"], s6Fired: true })).toBe("T3");
    expect(decideTier({ ...base, signalCodes: ["S6"], s6Fired: true, s6Corroborated: false })).toBe("T3");
  });

  it("corroborated S6 still reaches T2 (the real typo captures)", () => {
    expect(
      decideTier({ ...base, signalCodes: ["S6"], s6Fired: true, s6Corroborated: true })
    ).toBe("T2");
  });

  it("two distinct signals still reach T2 even when S6 is one of them", () => {
    expect(decideTier({ ...base, signalCodes: ["S6", "S1"], s6Fired: true })).toBe("T2");
  });
});

describe("isUmbrellaBrandUsername (S3b guard, D062)", () => {
  // A shared domain between an umbrella and one of its properties is genuine but is NOT identity.
  it("flags operators, chains and conference offices", () => {
    expect(isUmbrellaBrandUsername("luc_conferences")).toBe(true);
    expect(isUmbrellaBrandUsername("victoriavenues")).toBe(true);
    expect(isUmbrellaBrandUsername("marriottbonvoy")).toBe(true);
    expect(isUmbrellaBrandUsername("pendryhotels")).toBe(true);
    expect(isUmbrellaBrandUsername("invitedclubs")).toBe(true);
    expect(isUmbrellaBrandUsername("episcope.hospitality")).toBe(true);
  });

  it("does not flag a single bookable venue", () => {
    expect(isUmbrellaBrandUsername("loyola_cuneomansion")).toBe(false);
    expect(isUmbrellaBrandUsername("victoriainthepark")).toBe(false);
    expect(isUmbrellaBrandUsername("officialwrigleyfield")).toBe(false);
    expect(isUmbrellaBrandUsername("salvageone")).toBe(false);
    expect(isUmbrellaBrandUsername(null)).toBe(false);
  });
});
