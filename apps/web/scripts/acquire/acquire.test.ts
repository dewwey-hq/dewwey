import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  attributeSeedUsername,
  captionSha256,
  extractBioHandles,
  mapItemToPostRow,
  mapProfileItemToAccountFields,
  normalizeCount,
  normalizeHandle,
  planPostWrites,
  selectImageCandidates,
  type ApifyPostItem,
} from "./ingest";
import { ACTORS, PRICE_USD, buildInput, estimateCostUsd } from "./apifyClient";
import { formatBatchId } from "./runTick";
import { computeSpotCheckAgreement, type SpotCheckPair } from "./reportSpotCheck";
import { venueLookupPrior, vendorLookupPrior } from "./targets";
import { dateFilterHonoured, overlapStats } from "./compareActors";
import { updatePrior, decideStatus, PRIOR_K } from "./measure";

const FIXTURE_DIR = new URL("./fixtures/", import.meta.url).pathname;
function loadFixture(name: string): ApifyPostItem {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}${name}`, "utf8"));
}

describe("normalizeHandle", () => {
  test("strips a leading @ and trailing dots, lowercases", () => {
    expect(normalizeHandle("@Foo.")).toBe("foo");
  });
  test("strips a trailing dot with no leading @", () => {
    expect(normalizeHandle("bar.")).toBe("bar");
  });
  test("trims whitespace", () => {
    expect(normalizeHandle("  Baz  ")).toBe("baz");
  });
  test("leaves an already-clean handle alone", () => {
    expect(normalizeHandle("galleriamarchetti")).toBe("galleriamarchetti");
  });
});

describe("attributeSeedUsername", () => {
  const usernames = ["galleriamarchetti"];
  test("matches a plain inputUrl", () => {
    expect(attributeSeedUsername("https://www.instagram.com/galleriamarchetti", usernames)).toBe(
      "galleriamarchetti"
    );
  });
  test("matches with a trailing slash", () => {
    expect(attributeSeedUsername("https://www.instagram.com/galleriamarchetti/", usernames)).toBe(
      "galleriamarchetti"
    );
  });
  test("matches case-insensitively", () => {
    expect(attributeSeedUsername("https://www.instagram.com/GalleriaMarchetti", usernames)).toBe(
      "galleriamarchetti"
    );
  });
  test("returns null when nothing matches", () => {
    expect(attributeSeedUsername("https://www.instagram.com/someoneelse", usernames)).toBeNull();
  });
  test("returns null for a missing inputUrl", () => {
    expect(attributeSeedUsername(undefined, usernames)).toBeNull();
    expect(attributeSeedUsername(null, usernames)).toBeNull();
  });
});

describe("normalizeCount", () => {
  test("-1 (IG's hidden-count sentinel) becomes null", () => {
    expect(normalizeCount(-1)).toBeNull();
  });
  test("null/undefined stay null", () => {
    expect(normalizeCount(null)).toBeNull();
    expect(normalizeCount(undefined)).toBeNull();
  });
  test("a real count passes through", () => {
    expect(normalizeCount(42)).toBe(42);
    expect(normalizeCount(0)).toBe(0);
  });
});

describe("captionSha256", () => {
  test("is deterministic and treats null/undefined as empty string", () => {
    expect(captionSha256(null)).toBe(captionSha256(undefined));
    expect(captionSha256("hello")).toBe(captionSha256("hello"));
    expect(captionSha256("hello")).not.toBe(captionSha256("world"));
  });
});

describe("selectImageCandidates", () => {
  test("Sidecar -> first 5 of images", () => {
    const item: ApifyPostItem = {
      type: "Sidecar",
      images: ["a", "b", "c", "d", "e", "f", "g"],
      displayUrl: "cover",
    };
    expect(selectImageCandidates(item)).toEqual({ status: "candidates", urls: ["a", "b", "c", "d", "e"] });
  });
  test("Image -> [displayUrl]", () => {
    const item: ApifyPostItem = { type: "Image", displayUrl: "cover.jpg" };
    expect(selectImageCandidates(item)).toEqual({ status: "candidates", urls: ["cover.jpg"] });
  });
  test("Video -> skipped, no urls", () => {
    const item: ApifyPostItem = { type: "Video", displayUrl: "cover.jpg" };
    expect(selectImageCandidates(item)).toEqual({ status: "skipped", urls: [] });
  });
  test("a Sidecar with fewer than 5 images returns all of them", () => {
    const item: ApifyPostItem = { type: "Sidecar", images: ["a", "b"] };
    expect(selectImageCandidates(item)).toEqual({ status: "candidates", urls: ["a", "b"] });
  });
});

describe("extractBioHandles", () => {
  test("finds @handles at least 3 chars long", () => {
    expect(extractBioHandles("DM @florist_co or @ab or see @galleriamarchetti")).toEqual([
      "florist_co",
      "galleriamarchetti",
    ]);
  });
  test("empty/null bio yields no handles", () => {
    expect(extractBioHandles(null)).toEqual([]);
    expect(extractBioHandles(undefined)).toEqual([]);
    expect(extractBioHandles("")).toEqual([]);
  });
});

describe("mapProfileItemToAccountFields", () => {
  test("maps documented output keys defensively", () => {
    const fields = mapProfileItemToAccountFields({
      fullName: "Galleria Marchetti",
      biography: "Chicago's premier event space",
      externalUrl: "https://galleriamarchetti.com",
      followersCount: 12345,
      isBusinessAccount: true,
      businessCategoryName: "Venue",
      private: false,
      profilePicUrlHD: "https://example.com/avatar.jpg",
    });
    expect(fields).toMatchObject({
      fullName: "Galleria Marchetti",
      biography: "Chicago's premier event space",
      externalUrl: "https://galleriamarchetti.com",
      followers: 12345,
      isBusiness: true,
      businessCategory: "Venue",
      isPrivate: false,
      avatarUrl: "https://example.com/avatar.jpg",
    });
  });
  test("degrades to nulls on an unexpected shape instead of throwing", () => {
    expect(() => mapProfileItemToAccountFields({})).not.toThrow();
    const fields = mapProfileItemToAccountFields({});
    expect(fields.fullName).toBeNull();
    expect(fields.followers).toBeNull();
  });
});

describe("buildInput", () => {
  test("tagged feed", () => {
    expect(buildInput("tagged", ["a", "b"], { resultsLimit: 25 })).toEqual({
      username: ["a", "b"],
      resultsLimit: 25,
    });
  });
  test("own feed", () => {
    expect(buildInput("own", ["a"], { resultsLimit: 10 })).toEqual({
      directUrls: ["https://www.instagram.com/a/"],
      resultsType: "posts",
      resultsLimit: 10,
    });
  });
  test("own feed with onlyPostsNewerThan", () => {
    expect(buildInput("own", ["a"], { resultsLimit: 10, onlyPostsNewerThan: "2026-08-20" })).toEqual({
      directUrls: ["https://www.instagram.com/a/"],
      resultsType: "posts",
      resultsLimit: 10,
      onlyPostsNewerThan: "2026-08-20",
    });
  });
  test("profile feed", () => {
    expect(buildInput("profile", ["a", "b"], { resultsLimit: 25 })).toEqual({ usernames: ["a", "b"] });
  });
});

describe("estimateCostUsd", () => {
  test("tagged/own scale with usernames x resultsLimit x price", () => {
    expect(estimateCostUsd("tagged", 10, 25)).toBeCloseTo(10 * 25 * PRICE_USD.tagged, 6);
    expect(estimateCostUsd("own", 5, 10)).toBeCloseTo(5 * 10 * PRICE_USD.own, 6);
  });
  test("profile scales with usernames only (one result per profile)", () => {
    expect(estimateCostUsd("profile", 450, 25)).toBeCloseTo(450 * PRICE_USD.profile, 6);
  });
});

describe("ACTORS", () => {
  test("actor ids are in the api-path (~) form", () => {
    expect(ACTORS.tagged).toBe("apify~instagram-tagged-scraper");
    expect(ACTORS.own).toBe("apify~instagram-scraper");
    expect(ACTORS.profile).toBe("apify~instagram-profile-scraper");
  });
});

describe("formatBatchId", () => {
  test("acq-<YYYYMMDD>-<tick> in America/Chicago", () => {
    // 2026-09-20T04:30:00Z is 2026-09-19 23:30 in America/Chicago (CDT, UTC-5) --
    // exercises the local-date rollback across midnight UTC.
    const d = new Date("2026-09-20T04:30:00.000Z");
    expect(formatBatchId("pilot", d)).toBe("acq-20260919-pilot");
  });
  test("a time safely inside the Chicago day matches the UTC date too", () => {
    const d = new Date("2026-09-20T18:00:00.000Z"); // 13:00 CDT
    expect(formatBatchId("probesA", d)).toBe("acq-20260920-probesA");
  });
});

describe("planPostWrites", () => {
  const items: ApifyPostItem[] = [
    { shortCode: "AAA", ownerUsername: "photog1", inputUrl: "https://www.instagram.com/galleriamarchetti" },
    { shortCode: "BBB", ownerUsername: "photog2", inputUrl: "https://www.instagram.com/galleriamarchetti" },
    { shortCode: "AAA", ownerUsername: "photog1", inputUrl: "https://www.instagram.com/galleriamarchetti" }, // duplicate in the same dataset
  ];

  test("marks a shortcode absent from the existing set as looksNew, dedupes repeats", () => {
    const planned = planPostWrites(items, "tagged", ["galleriamarchetti"], new Set());
    expect(planned).toHaveLength(2); // AAA deduped
    expect(planned.find((p) => p.mapped.shortcode === "AAA")?.looksNew).toBe(true);
    expect(planned.find((p) => p.mapped.shortcode === "BBB")?.looksNew).toBe(true);
  });

  test("marks a shortcode already in the existing set as not looksNew", () => {
    const planned = planPostWrites(items, "tagged", ["galleriamarchetti"], new Set(["AAA"]));
    expect(planned.find((p) => p.mapped.shortcode === "AAA")?.looksNew).toBe(false);
    expect(planned.find((p) => p.mapped.shortcode === "BBB")?.looksNew).toBe(true);
  });

  test("skips items with no shortCode", () => {
    const planned = planPostWrites([{ ownerUsername: "x" }], "tagged", [], new Set());
    expect(planned).toHaveLength(0);
  });
});

describe("mapItemToPostRow (real fixtures)", () => {
  test("video.json: a tagged post authored by someone other than the seed", () => {
    const item = loadFixture("video.json");
    const row = mapItemToPostRow(item, "tagged", ["galleriamarchetti"]);
    expect(row.shortcode).toBe("DcPuoVRA3y4");
    expect(row.ownerUsername).toBe("smilingtoadfilms");
    expect(row.seedUsername).toBe("galleriamarchetti");
    expect(row.source).toBe("venue_tagged");
    expect(row.likesCount).toBe(1);
    expect(row.commentsCount).toBe(0);
    expect(row.caption).toContain("Galleria Marchetti");
  });

  test("image_nostack.json: no seed match against an unrelated username list", () => {
    const item = loadFixture("image_nostack.json");
    const row = mapItemToPostRow(item, "tagged", ["someunrelatedvenue"]);
    expect(row.shortcode).toBe("DcMR34YNSKr");
    expect(row.ownerUsername).toBe("lauragreerresidential");
    expect(row.seedUsername).toBeNull();
  });

  test("sidecar_stack.json: mentions are a flat username array, dimensions carried through", () => {
    const item = loadFixture("sidecar_stack.json");
    expect(Array.isArray(item.mentions)).toBe(true);
    expect(item.mentions).toContain("galleriamarchetti");
    const sel = selectImageCandidates(item);
    expect(sel.status).toBe("candidates");
    expect(sel.urls).toHaveLength(5); // Sidecar caps at 5 even though this fixture has 20 images
    const row = mapItemToPostRow(item, "tagged", ["galleriamarchetti"]);
    expect(row.source).toBe("venue_tagged");
  });

  test("video.json: Video type is always skipped regardless of displayUrl", () => {
    const item = loadFixture("video.json");
    expect(selectImageCandidates(item)).toEqual({ status: "skipped", urls: [] });
  });
});

describe("computeSpotCheckAgreement (D061 blind spot-check)", () => {
  test("zero pairs: n=0, both percentages null, THIS_VENUE bar fails (empty sample never passes)", () => {
    const result = computeSpotCheckAgreement([]);
    expect(result.n).toBe(0);
    expect(result.agreeCount).toBe(0);
    expect(result.agreementPct).toBeNull();
    expect(result.disagreements).toEqual([]);
    expect(result.thisVenue.modelCount).toBe(0);
    expect(result.thisVenue.precisionPct).toBeNull();
    expect(result.thisVenue.pass).toBe(false);
  });

  test("all agree, all THIS_VENUE: 100% overall and 100% THIS_VENUE precision, PASS", () => {
    const pairs: SpotCheckPair[] = [
      { postUrl: "a", modelVerdict: "THIS_VENUE", modelConfidence: 0.9, humanVerdict: "THIS_VENUE" },
      { postUrl: "b", modelVerdict: "THIS_VENUE", modelConfidence: 0.95, humanVerdict: "THIS_VENUE" },
    ];
    const result = computeSpotCheckAgreement(pairs);
    expect(result.n).toBe(2);
    expect(result.agreeCount).toBe(2);
    expect(result.agreementPct).toBe(100);
    expect(result.disagreements).toEqual([]);
    expect(result.thisVenue).toMatchObject({ modelCount: 2, confirmedCount: 2, precisionPct: 100, pass: true });
  });

  test("a non-THIS_VENUE disagreement does not touch the THIS_VENUE bar", () => {
    const pairs: SpotCheckPair[] = [
      { postUrl: "a", modelVerdict: "THIS_VENUE", modelConfidence: 0.9, humanVerdict: "THIS_VENUE" },
      { postUrl: "b", modelVerdict: "NOT_WEDDING", modelConfidence: 0.8, humanVerdict: "OTHER_VENUE" },
    ];
    const result = computeSpotCheckAgreement(pairs);
    expect(result.n).toBe(2);
    expect(result.agreeCount).toBe(1);
    expect(result.agreementPct).toBe(50);
    expect(result.disagreements).toEqual([pairs[1]]);
    // THIS_VENUE bar only looks at the one THIS_VENUE model call, which the human confirmed.
    expect(result.thisVenue).toMatchObject({ modelCount: 1, confirmedCount: 1, precisionPct: 100, pass: true });
  });

  test("a THIS_VENUE model call the human overturns fails the 95% bar", () => {
    // 19/20 THIS_VENUE calls confirmed = 95% exactly -> PASS; add one more miss to drop under.
    const confirmed: SpotCheckPair[] = Array.from({ length: 18 }, (_, i) => ({
      postUrl: `ok-${i}`,
      modelVerdict: "THIS_VENUE",
      modelConfidence: 0.9,
      humanVerdict: "THIS_VENUE",
    }));
    const misses: SpotCheckPair[] = [
      { postUrl: "miss-1", modelVerdict: "THIS_VENUE", modelConfidence: 0.6, humanVerdict: "OTHER_VENUE" },
      { postUrl: "miss-2", modelVerdict: "THIS_VENUE", modelConfidence: 0.55, humanVerdict: "NOT_WEDDING" },
    ];
    const result = computeSpotCheckAgreement([...confirmed, ...misses]);
    expect(result.n).toBe(20);
    expect(result.thisVenue.modelCount).toBe(20);
    expect(result.thisVenue.confirmedCount).toBe(18);
    expect(result.thisVenue.precisionPct).toBe(90);
    expect(result.thisVenue.pass).toBe(false);
    expect(result.disagreements).toEqual(misses);
  });

  test("exactly 95% precision passes (bar is inclusive)", () => {
    const confirmed: SpotCheckPair[] = Array.from({ length: 19 }, (_, i) => ({
      postUrl: `ok-${i}`,
      modelVerdict: "THIS_VENUE",
      modelConfidence: 0.9,
      humanVerdict: "THIS_VENUE",
    }));
    const miss: SpotCheckPair = { postUrl: "miss-1", modelVerdict: "THIS_VENUE", modelConfidence: 0.6, humanVerdict: "OTHER_VENUE" };
    const result = computeSpotCheckAgreement([...confirmed, miss]);
    expect(result.thisVenue.precisionPct).toBe(95);
    expect(result.thisVenue.pass).toBe(true);
  });
});

describe("venueLookupPrior (D062 recalibration, 2026-09-20)", () => {
  // These bands are MEASURED, not chosen -- 570 of our own targets, >= 15 posts fetched each.
  // Weddings per post by follower band: <500 0.152 / 500-1.5k 0.116 / 1.5k-5k 0.104 /
  // 5k-20k 0.049 / 20k+ 0.013. Yield falls monotonically as followers rise. Re-run the back-test
  // before changing any number here.
  const f = (followers: number | null, venue_type: string | null = null) => ({
    venue_type, followers, reviews: null, ptype: null,
  });

  test("is monotonically DECREASING in followers -- the whole point of the recalibration", () => {
    const tiny = venueLookupPrior(f(200));
    const small = venueLookupPrior(f(900));
    const mid = venueLookupPrior(f(3000));
    const big = venueLookupPrior(f(12000));
    const huge = venueLookupPrior(f(90000));
    expect(tiny).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(big);
    expect(big).toBeGreaterThan(huge);
  });

  test("does NOT favour the 3k-10k band any more (the old rule added +0.06 there)", () => {
    // crawl nº1 measured weddings per VENUE; we pay per POST. A big venue hits the 25-post cap.
    expect(venueLookupPrior(f(5000))).toBeLessThan(venueLookupPrior(f(400)));
  });

  test("band boundaries are pinned on both sides", () => {
    expect(venueLookupPrior(f(499))).toBeGreaterThan(venueLookupPrior(f(500)));
    expect(venueLookupPrior(f(1499))).toBeGreaterThan(venueLookupPrior(f(1500)));
    expect(venueLookupPrior(f(4999))).toBeGreaterThan(venueLookupPrior(f(5000)));
    expect(venueLookupPrior(f(19999))).toBeGreaterThan(venueLookupPrior(f(20000)));
  });

  test("penalises venue_type 'other' -- measured 0.033 w/post with 69% of them empty", () => {
    expect(venueLookupPrior(f(1000, "other"))).toBeLessThan(venueLookupPrior(f(1000, null)));
    expect(venueLookupPrior(f(1000, "other"))).toBeLessThan(venueLookupPrior(f(1000, "event_space")));
  });

  test("never returns below the 0.01 floor, and rounds to 3 dp", () => {
    const worst = venueLookupPrior({ venue_type: "other", followers: 500000, reviews: 5000, ptype: "hotel" });
    expect(worst).toBeGreaterThanOrEqual(0.01);
    expect(String(worst).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(3);
  });
});

describe("vendorLookupPrior", () => {
  test("uses the role table when no measured own-yield exists", () => {
    expect(vendorLookupPrior("dj", null)).toBe(0.42);
    expect(vendorLookupPrior("planner", null)).toBe(0.41);
  });
  test("falls back to 0.2 for an unknown role", () => {
    expect(vendorLookupPrior("taxidermist", null)).toBe(0.2);
    expect(vendorLookupPrior(null, null)).toBe(0.2);
  });
  test("averages with the measured own-yield when present", () => {
    expect(vendorLookupPrior("dj", 0.1)).toBeCloseTo(0.26, 3);
  });
});

describe("updatePrior / decideStatus (measure.ts -- previously untested)", () => {
  test("a zero-fetch measurement leaves the prior untouched", () => {
    expect(updatePrior(0.2, 10, 0, 0)).toEqual({ prior: 0.2, n: 10 });
  });

  test("pulls the prior toward the realized rate, weighted by K", () => {
    const { prior } = updatePrior(0.2, 0, 5, 25);
    expect(prior).toBeCloseTo((PRIOR_K * 0.2 + 5) / (PRIOR_K + 25), 6);
  });

  test("dead needs >= 20 fetched AND nothing found -- 19 is ambiguous, not dead", () => {
    expect(decideStatus(20, 0, 0)).toBe("dead");
    expect(decideStatus(19, 0, 0)).toBe("ambiguous");
  });

  test("promising bar is inclusive at one hit per 25 fetched", () => {
    expect(decideStatus(25, 1, 0)).toBe("promising");
    expect(decideStatus(25, 0, 1)).toBe("promising");
    expect(decideStatus(26, 1, 0)).toBe("ambiguous");
  });
});

describe("buildInput refuses a date filter the tagged actor cannot apply (D063)", () => {
  // The bug this prevents: runTick passed onlyNewerThan in unconditionally and the tagged branch
  // dropped it. You paid for a full re-pull and the run reported success. The deepen tick burned
  // $0.82 of $1.84 that way.
  test("tagged + onlyPostsNewerThan throws rather than silently ignoring it", () => {
    expect(() => buildInput("tagged", ["a"], { resultsLimit: 25, onlyPostsNewerThan: "2026-08-01" })).toThrow(
      /no date filter/i
    );
  });

  test("tagged without a date filter is unchanged", () => {
    expect(buildInput("tagged", ["a", "b"], { resultsLimit: 25 })).toEqual({
      username: ["a", "b"],
      resultsLimit: 25,
    });
  });

  test("own still accepts the date filter -- that is the incremental path", () => {
    const input = buildInput("own", ["a"], { resultsLimit: 25, onlyPostsNewerThan: "2026-08-01" });
    expect(input.onlyPostsNewerThan).toBe("2026-08-01");
  });
});

describe("dateFilterHonoured (D063 Stage 0)", () => {
  // Measured 2026-09-21: of 45 items under a 2026-08-22 cutoff, exactly one predated it --
  // DbcXKLMtGZ3, posted 2026-07-31, isPinned: true. Apify documents that pinned posts ignore the
  // filter. A naive "zero older items" rule failed the whole incremental path over that one photo.
  test("a pinned older post does NOT fail the filter", () => {
    const r = dateFilterHonoured(
      [
        { timestamp: "2026-09-01T00:00:00Z", isPinned: false },
        { timestamp: "2026-07-31T00:00:00Z", isPinned: true },
      ],
      "2026-08-22"
    );
    expect(r.olderPinned).toBe(1);
    expect(r.olderUnpinned).toBe(0);
    expect(r.honoured).toBe(true);
  });

  test("an UNPINNED older post does fail the filter", () => {
    const r = dateFilterHonoured([{ timestamp: "2026-07-31T00:00:00Z", isPinned: false }], "2026-08-22");
    expect(r.olderUnpinned).toBe(1);
    expect(r.honoured).toBe(false);
  });

  test("a missing isPinned is treated as unpinned -- absence of proof is not exemption", () => {
    const r = dateFilterHonoured([{ timestamp: "2026-07-31T00:00:00Z" }], "2026-08-22");
    expect(r.honoured).toBe(false);
  });

  test("unparseable or missing timestamps are ignored, not counted as violations", () => {
    const r = dateFilterHonoured([{ timestamp: null }, { timestamp: "not-a-date" }], "2026-08-22");
    expect(r.total).toBe(2);
    expect(r.olderUnpinned).toBe(0);
    expect(r.honoured).toBe(true);
  });
});

describe("overlapStats (D063 Stage 0)", () => {
  test("counts how much of a pull we already held", () => {
    const held = new Set(["a", "b", "c"]);
    const r = overlapStats(["a", "b", "z"], held);
    expect(r).toEqual({ returned: 3, alreadyHeld: 2, fresh: 1, pctAlreadyHeld: 67 });
  });

  test("an empty pull does not divide by zero", () => {
    expect(overlapStats([], new Set(["a"])).pctAlreadyHeld).toBe(0);
  });
});
