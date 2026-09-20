/**
 * Live-DB regression test for D061's blind spot-check mode: getPostReviewQueue(limit,
 * { spotCheckBatch }) -- see that function's getD061BatchSpotCheckQueue helper in
 * postVenueReview.ts for the query itself. Read-only (never writes), same ".env.local" loading
 * convention as postVenueReview.test.ts / labeling.test.ts.
 */
import { describe, it, expect, afterAll } from "vitest";

process.loadEnvFile(new URL("../../.env.local", import.meta.url).pathname);
const { closePool } = await import("../../scripts/classify/db");
const { getPostReviewQueue } = await import("./postVenueReview");

const PILOT_BATCH_ID = "acq-20260919-pilot";

afterAll(async () => {
  await closePool();
});

describe("getPostReviewQueue spotCheckBatch mode (live DB)", () => {
  it("returns > 0 items for the pilot batch, none carrying a model verdict or a human verdict yet", async () => {
    const items = await getPostReviewQueue(100, { spotCheckBatch: PILOT_BATCH_ID });
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      // The UI must stay blind: no model verdict/venue-decided hint reaches the client in this
      // mode (getD061BatchSpotCheckQueue never joins latest_extraction).
      expect(item.model).toBeNull();
      // your_verdict is only ever populated by getPostReviewItemsByPostUrls, never this queue.
      expect(item.your_verdict).toBeUndefined();
    }
  }, 30000);

  it("never serves a post that already has a human ('jeremy') verdict row", async () => {
    const { getPool } = await import("./db");
    const pool = getPool();
    const items = await getPostReviewQueue(100, { spotCheckBatch: PILOT_BATCH_ID });
    const urls = items.map((i) => i.post.post_url);
    if (urls.length === 0) return; // covered by the "> 0 items" assertion above

    const { rows } = await pool.query<{ post_url: string }>(
      `select distinct post_url from post_venue_verdicts
       where post_url = any($1::text[]) and (reviewed_by = 'jeremy' or reviewed_by like 'human%')`,
      [urls]
    );
    expect(rows).toEqual([]);
  }, 30000);

  it("is deterministically ordered (md5(post_url)) -- two calls return the same order", async () => {
    const a = await getPostReviewQueue(20, { spotCheckBatch: PILOT_BATCH_ID });
    const b = await getPostReviewQueue(20, { spotCheckBatch: PILOT_BATCH_ID });
    expect(a.map((i) => i.post.post_url)).toEqual(b.map((i) => i.post.post_url));
  }, 30000);
});

describe("getPostReviewQueue batch mode (live DB)", () => {
  it("the normal (no-current-verdict) queue scoped to the pilot batch returns 5 items today", async () => {
    // Pinned count (2026-09-19): of the pilot batch's 60 posts that landed in a
    // jeremy_wedding_candidate_posts row, 55 already carry a model (haiku-extract-v1) current
    // verdict -- these 5 are the ones with no current verdict from any reviewer yet, same
    // definition getPostReviewQueue's unscoped queue uses, just restricted to this batch's
    // first-observed posts (and, unlike the unscoped queue, not restricted to
    // STRUCTURAL_CLUSTERING_VERSION -- see the `batch` option's own comment in postVenueReview.ts
    // for why). This is a live-data pin, not an invariant -- it will need updating once someone
    // labels one of these 5 or a later tick adds more.
    // Unlike spotCheckBatch, `batch` scopes the ORDINARY queue -- it still surfaces the model's
    // opinion as a visible hint (PostReviewQueueItem.model), same as the unscoped queue does, so
    // no "model must be null" assertion applies here.
    const items = await getPostReviewQueue(200, { batch: PILOT_BATCH_ID });
    expect(items.length).toBe(5);
  }, 30000);
});
