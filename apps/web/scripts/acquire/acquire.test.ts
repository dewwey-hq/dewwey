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
import { venueLookupPrior, vendorLookupPrior, disqualifyTarget, disqualifyVendorTarget } from "./targets";
import { dateFilterHonoured, overlapStats } from "./compareActors";
import { updatePrior, decideStatus, PRIOR_K } from "./measure";
import { bucket, scoreCrossings } from "./compareArms";
import { shortcodeFromUrl, allocateSlots } from "./sampleCredible";

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

describe("venueLookupPrior (D063 hump correction, 2026-09-21)", () => {
  // MEASURED, not chosen -- all 697 measured targets. Weddings per VENUE, which is the metric that
  // matters at the ">= 1 wedding" bar, is hump-shaped:
  //   <50 0.36 | 50-149 0.90 | 150-399 1.91 | 400-999 2.43 | 1.5k-5k 2.59 | 5-20k 1.21 | 20k+ 0.33
  // Tiny accounts are not good targets, they just have no feed to pull -- under 50 followers
  // returns 4.5 posts and is 82% empty. D062 read the per-post rate off a >=15-posts subsample,
  // which structurally could not see them, and made the prior monotonically decreasing.
  // Back-test on all targets, top quartile: D062 60% of venues yielded >= 1 wedding, D063 82%.
  // Re-run the back-test before changing any number here.
  const f = (followers: number | null, venue_type: string | null = null) => ({
    venue_type, followers, reviews: null, ptype: null,
  });

  test("peaks in the middle -- the 400-5k band beats both extremes", () => {
    const peak = venueLookupPrior(f(2000));
    expect(peak).toBeGreaterThan(venueLookupPrior(f(20)));      // no feed to pull
    expect(peak).toBeGreaterThan(venueLookupPrior(f(100)));
    expect(peak).toBeGreaterThan(venueLookupPrior(f(12000)));   // signal dilution
    expect(peak).toBeGreaterThan(venueLookupPrior(f(90000)));
  });

  test("still falls off hard at the top -- 20k+ measured 0.33 weddings/venue, 83% empty", () => {
    expect(venueLookupPrior(f(90000))).toBeLessThan(venueLookupPrior(f(600)));
    expect(venueLookupPrior(f(12000))).toBeLessThan(venueLookupPrior(f(600)));
  });

  test("and falls off at the bottom -- the D063 correction to D062", () => {
    // @cityhallofchicago (4 followers) ranked SECOND in the first qualified queue under D062.
    expect(venueLookupPrior(f(4))).toBeLessThan(venueLookupPrior(f(600)));
    expect(venueLookupPrior(f(4))).toBeLessThan(venueLookupPrior(f(300)));
  });

  test("band boundaries are pinned on both sides", () => {
    expect(venueLookupPrior(f(49))).toBeLessThan(venueLookupPrior(f(50)));
    expect(venueLookupPrior(f(149))).toBeLessThan(venueLookupPrior(f(150)));
    expect(venueLookupPrior(f(399))).toBeLessThan(venueLookupPrior(f(400)));
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

describe("disqualifyTarget (D063 qualification gate)", () => {
  // The prior RANKS; it does not QUALIFY. D062 made the prior favour small accounts, which is
  // right, but junk accounts are also small -- so the top of the never-crawled queue filled with a
  // Scottsdale gallery, a Panama shopping plaza, a catering manager's personal account and four
  // parishes. Qualifying first cut 244 raw targets to 61.
  const base = { username: "someplace", biography: null as string | null, full_name: null as string | null, in_metro: true, venue_type: null as string | null };

  test("an in_metro venue passes", () => {
    expect(disqualifyTarget(base)).toBeNull();
  });

  test("out-of-area is caught from the bio even when in_metro is unset", () => {
    expect(disqualifyTarget({ ...base, in_metro: false, biography: "Scottsdale's Premier Fine Art Gallery & Events" })).toBe("out_of_area");
    expect(disqualifyTarget({ ...base, in_metro: false, biography: "Plaza Comercial en Via Transistmica, Panama" })).toBe("out_of_area");
  });

  test("out-of-area beats a Chicago mention -- a bio can name both", () => {
    expect(disqualifyTarget({ ...base, in_metro: false, biography: "Scottsdale gallery, also serving Chicago clients" })).toBe("out_of_area");
  });

  test("umbrella brands and non-venue trades are refused", () => {
    expect(disqualifyTarget({ ...base, username: "hiltonhotels" })).toBe("umbrella_brand");
    expect(disqualifyTarget({ ...base, username: "jddesignandplanning" })).toBe("non_venue_trade");
  });

  // Houses of worship measure 0.053 w/post with half returning nothing.
  test("houses of worship are refused, including handles with no explicit church word", () => {
    expect(disqualifyTarget({ ...base, username: "chicagochurchvenue" })).toBe("house_of_worship");
    // Ranked FIRST in the first gate run: no church word in the handle, bio says only
    // "Founded in 1953 as a community of faith".
    expect(disqualifyTarget({ ...base, username: "st.johnbrebeufniles", biography: "Founded in 1953 as a community of faith" })).toBe("house_of_worship");
  });

  // Handles are concatenated words, so \b cannot match inside them.
  test("the HANDLE counts as geography evidence -- @msichicago is a real Chicago venue", () => {
    expect(disqualifyTarget({ ...base, in_metro: false, username: "msichicago", biography: "Looking for Griffin Museum of Science and Industry" })).toBeNull();
    expect(disqualifyTarget({ ...base, in_metro: false, username: "lespacechicago" })).toBeNull();
  });

  // Two iterations got the saint rule wrong in OPPOSITE directions during the Stage 2 dry-run.
  // Both directions are pinned so neither can come back.
  test("saint handles are caught with any separator", () => {
    expect(disqualifyTarget({ ...base, username: "saint_spyridon" })).toBe("house_of_worship");
    expect(disqualifyTarget({ ...base, username: "st.johnbrebeufniles" })).toBe("house_of_worship");
  });

  test("but venues whose name merely BEGINS with 'st' are not churches", () => {
    // A separator-optional rule swallowed all four of these.
    for (const u of ["stonegatebanquet", "standardclub", "stagecoachinn", "stainedglass"]) {
      expect(disqualifyTarget({ ...base, username: u })).toBeNull();
    }
  });

  test("bare st+letters is ambiguous and relies on the bio instead -- a documented gap", () => {
    expect(disqualifyTarget({ ...base, username: "stbenschicago" })).toBeNull();
    expect(disqualifyTarget({ ...base, username: "stbenschicago", biography: "St Benedict Catholic parish" })).toBe("house_of_worship");
  });

  test("no Chicago evidence anywhere is refused rather than guessed at", () => {
    expect(disqualifyTarget({ ...base, in_metro: false, username: "thebasementeast", biography: "Live music venue" })).toBe("no_chicago_evidence");
  });
});

describe("mentions feed (D065)", () => {
  // `mentions` exists ONLY because the tagged actor has no date filter. D063 Stage 0 measured 99%
  // content overlap between the two (74 of 75 items already held), so this is the same feed with a
  // floor -- which matters because the product wants 2024+ weddings, not 2019 ones.
  test("mentions uses the general scraper, not the tagged actor", () => {
    expect(ACTORS.mentions).toBe("apify~instagram-scraper");
    expect(ACTORS.mentions).not.toBe(ACTORS.tagged);
  });

  test("mentions builds resultsType 'mentions' and accepts a date floor", () => {
    const input = buildInput("mentions", ["venueA"], {
      resultsLimit: 100,
      onlyPostsNewerThan: "2024-01-01",
    });
    expect(input.resultsType).toBe("mentions");
    expect(input.onlyPostsNewerThan).toBe("2024-01-01");
    expect(input.directUrls).toEqual(["https://www.instagram.com/venueA/"]);
  });

  test("own still means the account's OWN posts, not mentions of it", () => {
    // These are opposite content: a venue's own feed is marketing (D055 measured 0.056 w/post);
    // its tagged feed is vendor recaps (0.21). Mixing them up would silently poison the priors.
    expect(buildInput("own", ["v"], { resultsLimit: 25 }).resultsType).toBe("posts");
    expect(buildInput("mentions", ["v"], { resultsLimit: 25 }).resultsType).toBe("mentions");
  });

  test("mentions is priced the same as every other feed", () => {
    expect(PRICE_USD.mentions).toBe(PRICE_USD.tagged);
    expect(estimateCostUsd("mentions", 10, 100)).toBeCloseTo(10 * 100 * PRICE_USD.mentions, 6);
  });
});

describe("compareArms scoring (D065)", () => {
  test("bucket uses the coverage bands STATE.md reports", () => {
    expect(bucket(0)).toBe("0");
    expect(bucket(1)).toBe("1-5");
    expect(bucket(5)).toBe("1-5");
    expect(bucket(6)).toBe("6-15");
    expect(bucket(15)).toBe("6-15");
    expect(bucket(16)).toBe("16-49");
    expect(bucket(49)).toBe("16-49");
    expect(bucket(50)).toBe("50+");
  });

  test("a 1-5 venue pushed to 6+ counts once, and a thick venue never counts", () => {
    const baseline = new Map([[1, 5], [2, 42]]);
    const { crossed_1_5_to_6, crossed_0_to_1 } = scoreCrossings(baseline, new Map([[1, 1], [2, 5]]));
    // venue 1: 5 -> 6 crosses. venue 2 got MORE weddings (5 of them) but was already thick, so it
    // contributes nothing -- this is the arm-A pathology the comparison has to make visible.
    expect(crossed_1_5_to_6).toEqual([{ venue_id: 1, from: 5, to: 6 }]);
    expect(crossed_0_to_1).toEqual([]);
  });

  test("0 -> 1 is its own bucket and is not double counted as 1-5 -> 6+", () => {
    const { crossed_0_to_1, crossed_1_5_to_6 } = scoreCrossings(new Map([[9, 0]]), new Map([[9, 8]]));
    expect(crossed_0_to_1).toEqual([{ venue_id: 9, from: 0, to: 8 }]);
    expect(crossed_1_5_to_6).toEqual([]);
  });

  test("a venue short of 6 does not cross, and an unseen venue baselines at 0", () => {
    expect(scoreCrossings(new Map([[1, 3]]), new Map([[1, 2]])).crossed_1_5_to_6).toEqual([]);
    expect(scoreCrossings(new Map(), new Map([[7, 1]])).crossed_0_to_1).toEqual([{ venue_id: 7, from: 0, to: 1 }]);
  });

  test("the SHARED baseline is what stops two arms both claiming one crossing", () => {
    // Venue 1 sat at 4. Arm A created 1, arm C created 1 -- together 6, neither alone.
    const baseline = new Map([[1, 4]]);
    expect(scoreCrossings(baseline, new Map([[1, 1]])).crossed_1_5_to_6).toEqual([]);
    expect(scoreCrossings(baseline, new Map([[1, 1]])).crossed_1_5_to_6).toEqual([]);
    // The union of both arms is what actually crosses, which is why the report prints a UNION row.
    expect(scoreCrossings(baseline, new Map([[1, 2]])).crossed_1_5_to_6).toEqual([{ venue_id: 1, from: 4, to: 6 }]);
  });

  test("zero creations at a venue is ignored rather than scored as a 0 -> 0 crossing", () => {
    expect(scoreCrossings(new Map([[1, 0]]), new Map([[1, 0]]))).toEqual({ crossed_0_to_1: [], crossed_1_5_to_6: [] });
  });
});

describe("sampleCredible (D065 verification sample)", () => {
  test("shortcodeFromUrl handles p / reel / tv and rejects a non-post url", () => {
    expect(shortcodeFromUrl("https://www.instagram.com/p/DU2P2K9Du4q/")).toBe("DU2P2K9Du4q");
    expect(shortcodeFromUrl("https://www.instagram.com/reel/Abc-1_9/")).toBe("Abc-1_9");
    expect(shortcodeFromUrl("https://www.instagram.com/tv/XYZ123/")).toBe("XYZ123");
    // A profile url carries no post to open, so it must not become a bogus shortcode.
    expect(shortcodeFromUrl("https://www.instagram.com/silverlake.cc/")).toBeNull();
  });

  test("allocateSlots spreads evenly when every arm has supply", () => {
    const got = allocateSlots(new Map([["A", 50], ["C", 50], ["D", 50]]), 20);
    expect([...got.values()].reduce((a, b) => a + b, 0)).toBe(20);
    expect([...got.values()].every((v) => v === 6 || v === 7)).toBe(true);
  });

  test("an arm short on supply gives its leftover slots to the others, not the floor", () => {
    // D has only 2 credible posts; the other 18 slots must still be filled from A and C.
    const got = allocateSlots(new Map([["A", 50], ["C", 50], ["D", 2]]), 20);
    expect(got.get("D")).toBe(2);
    expect([...got.values()].reduce((a, b) => a + b, 0)).toBe(20);
  });

  test("it never over-draws an arm, and asking for more than exists returns everything", () => {
    const got = allocateSlots(new Map([["A", 3], ["C", 1]]), 20);
    expect(got.get("A")).toBe(3);
    expect(got.get("C")).toBe(1);
    expect([...got.values()].reduce((a, b) => a + b, 0)).toBe(4);
  });

  test("no supply anywhere yields no slots rather than looping forever", () => {
    const got = allocateSlots(new Map([["A", 0], ["C", 0]]), 20);
    expect([...got.values()].reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("disqualifyVendorTarget (D065 -- the venue gate inverts on vendors)", () => {
  const base = { biography: null as string | null, full_name: null as string | null };

  test("a trade handle is NOT excluded -- in a vendor pool that is the target population", () => {
    // disqualifyTarget returns "non_venue_trade" for these; it threw out 121 real vendors.
    expect(disqualifyTarget({ ...base, username: "christytylerphotography", in_metro: true, venue_type: null })).toBe("non_venue_trade");
    expect(disqualifyVendorTarget(base)).toBeNull();
  });

  test("a silent bio is NOT 'no_chicago_evidence' for a vendor", () => {
    // The vendor is in the pool because it is credited at a Chicago venue's wedding, which beats any
    // bio string. The venue gate excluded 316 vendors on this reason alone.
    expect(disqualifyTarget({ ...base, username: "lifeinbloom", in_metro: false, venue_type: null })).toBe("no_chicago_evidence");
    expect(disqualifyVendorTarget({ biography: "Floral design", full_name: "Life in Bloom" })).toBeNull();
  });

  test("'group' and 'talent' are ordinary vendor names, not umbrella brands", () => {
    // Arm C itself contained @sparkentgroup and @greenlinetalent.
    expect(disqualifyVendorTarget({ biography: "Chicago entertainment", full_name: "Spark Entertainment Group" })).toBeNull();
  });

  test("text that positively names somewhere else still excludes -- the one signal that carries", () => {
    expect(disqualifyVendorTarget({ biography: "Nashville, TN wedding florist", full_name: null })).toBe("out_of_area");
  });

  test("a church-like vendor handle is not excluded -- officiants are vendors", () => {
    expect(disqualifyVendorTarget({ biography: "Wedding officiant serving Chicagoland", full_name: "Rev. A" })).toBeNull();
  });
});
