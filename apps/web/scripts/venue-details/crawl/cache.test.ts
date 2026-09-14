import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { readCacheText, readManifest, sha256, writeCacheEntry } from "./cache";

// Uses a dedicated fake account id (well outside the real id space) under the real (gitignored)
// scripts/venue-details/cache/ dir so the test exercises the real filesystem paths, then cleans
// up after itself.
const TEST_ACCOUNT_ID = 999_999_901;

afterAll(async () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cache", String(TEST_ACCOUNT_ID));
  await rm(dir, { recursive: true, force: true });
});

describe("sha256", () => {
  test("is deterministic for the same text", () => {
    expect(sha256("hello world")).toBe(sha256("hello world"));
  });

  test("differs for different text", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });
});

describe("cache round trip", () => {
  test("writeCacheEntry then readCacheText returns the same content, keyed by sha256", async () => {
    const text = "Wedding pricing and capacity details.";
    const hash = await writeCacheEntry(
      TEST_ACCOUNT_ID,
      { url: "https://venue.com/pricing", finalUrl: "https://venue.com/pricing", kind: "html", title: "Pricing", hasTextLayer: null, depth: 1, score: 5 },
      text
    );
    expect(hash).toBe(sha256(text));

    const readBack = await readCacheText(TEST_ACCOUNT_ID, hash);
    expect(readBack).toBe(text);
  });

  test("writing the same url twice replaces its manifest entry rather than duplicating it", async () => {
    await writeCacheEntry(
      TEST_ACCOUNT_ID,
      { url: "https://venue.com/faq", finalUrl: null, kind: "html", title: "FAQ v1", hasTextLayer: null, depth: 1, score: 3 },
      "first version"
    );
    await writeCacheEntry(
      TEST_ACCOUNT_ID,
      { url: "https://venue.com/faq", finalUrl: null, kind: "html", title: "FAQ v2", hasTextLayer: null, depth: 1, score: 3 },
      "second version"
    );
    const manifest = await readManifest(TEST_ACCOUNT_ID);
    const entries = manifest.entries.filter((e) => e.url === "https://venue.com/faq");
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("FAQ v2");
  });

  test("readManifest on an account with no cache yet returns an empty entry list", async () => {
    const manifest = await readManifest(999_999_902);
    expect(manifest.entries).toEqual([]);
  });

  test("readCacheText on a missing hash returns null", async () => {
    const result = await readCacheText(TEST_ACCOUNT_ID, "deadbeef");
    expect(result).toBeNull();
  });
});
