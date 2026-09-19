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
