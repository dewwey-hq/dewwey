/**
 * Live-DB regression test for the D061 repoint of getPostReviewQueue's post-caption join from a
 * direct `staging.instagram_posts` join to a `v_ig_posts`-backed one (distinct on shortcode,
 * staging precedence) -- see lib/server/postVenueReview.ts's own comment on the change. Read-only
 * (getPostReviewQueue never writes), so no fixture setup/teardown is needed -- follows
 * graphStrengthening.test.ts's convention of loading .env.local manually, same as
 * lib/server/labeling.test.ts.
 */
import { describe, it, expect, afterAll } from "vitest";

process.loadEnvFile(new URL("../../.env.local", import.meta.url).pathname);
const { closePool } = await import("../../scripts/classify/db");
const { getPostReviewQueue } = await import("./postVenueReview");

afterAll(async () => {
  await closePool();
});

describe("getPostReviewQueue (live DB)", () => {
  it("returns items with the expected top-level shape (unchanged by the v_ig_posts repoint)", async () => {
    const items = await getPostReviewQueue(10);
    expect(Array.isArray(items)).toBe(true);
    for (const item of items) {
      expect(item).toHaveProperty("post");
      expect(item).toHaveProperty("venue");
      expect(item).toHaveProperty("group");
      expect(item).toHaveProperty("couple_guess");
      expect(item).toHaveProperty("vendors");
      expect(item).toHaveProperty("other_venue_credits");
      expect(item).toHaveProperty("duplicate_hint");
      expect(item).toHaveProperty("styled_signal");
      expect(item).toHaveProperty("model");
      // Same PostReviewPost shape as before the repoint -- caption/posted_at/location_tag/
      // owner_username/mentions must still resolve, whether the post is a staging row or (once
      // the acquisition schema is live) a public/acquisition-sourced one.
      expect(item.post).toHaveProperty("post_url");
      expect(typeof item.post.post_url).toBe("string");
      expect(item.post).toHaveProperty("caption");
      expect(item.post).toHaveProperty("posted_at");
      expect(item.post).toHaveProperty("location_tag");
      expect(item.post).toHaveProperty("owner_username");
      expect(Array.isArray(item.post.mentions)).toBe(true);
    }
  }, 30000);

  it("never serves the same post_url twice in one queue page (the 629 staging/public overlaps must not double it)", async () => {
    const items = await getPostReviewQueue(50);
    const urls = items.map((i) => i.post.post_url);
    expect(new Set(urls).size).toBe(urls.length);
  }, 30000);
});
