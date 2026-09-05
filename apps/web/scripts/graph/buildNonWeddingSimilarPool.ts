/**
 * Tick 1 of the non-wedding-posts mission
 * (docs/engineering/graph-strengthening/non-wedding-posts.md).
 *
 * Read-only. Expands the 11 seeds into an UNLABELED similar-set pool across
 * four buckets (same venue accounts, caption heuristic, role-shape, feed
 * head), unions them, dedupes by post_url, and writes the pool to
 * data/non_wedding_similar_pool.json for tick 2 to hand-label a sample from.
 * Does not label, delete, or write to any DB table.
 *
 * Usage (from apps/web): bun run scripts/graph/buildNonWeddingSimilarPool.ts
 */
import { writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";

const SEED_VENUES = [
  "hobchicago",
  "lh_schubas",
  "reggieslive",
  "garcias_chicago",
  "navypiereventcenter",
  "revelspace",
  "rcchicago",
  "thegeraghty",
  "_thefirehouse_",
];

type PoolRow = {
  post_url: string;
  shortcode: string;
  wedding_id: string;
  venue: string;
  source: string;
  roles: string;
  event_date_est: string | null;
  caption_head: string;
  buckets: string[];
};

function toUrl(shortcode: string): string {
  return `https://www.instagram.com/p/${shortcode}/`;
}

async function main() {
  const pool = getPool();
  const byUrl = new Map<string, PoolRow>();

  function merge(rows: any[], bucket: string) {
    for (const r of rows) {
      const post_url = toUrl(r.shortcode);
      const existing = byUrl.get(post_url);
      if (existing) {
        if (!existing.buckets.includes(bucket)) existing.buckets.push(bucket);
      } else {
        byUrl.set(post_url, {
          post_url,
          shortcode: r.shortcode,
          wedding_id: String(r.wedding_id),
          venue: r.venue,
          source: r.source,
          roles: r.roles,
          event_date_est: r.event_date_est,
          caption_head: r.caption_head,
          buckets: [bucket],
        });
      }
    }
  }

  // Bucket 1: same venue accounts as the 11 seeds — ALL their weddings, not
  // just heuristic hits. Some of these venues (Geraghty, Revel, RC) do host
  // real weddings, so this bucket is expected to be mixed.
  const { rows: sameVenue } = await pool.query(
    `select p.shortcode, w.id as wedding_id, va.username as venue, p.source,
            w.event_date_est,
            (select string_agg(distinct wv.role::text, ',')
               from wedding_vendors wv where wv.wedding_id = w.id) as roles,
            left(coalesce(p.caption, ''), 160) as caption_head
     from weddings w
     join accounts va on va.id = w.venue_id
     join wedding_posts wp on wp.wedding_id = w.id
     join posts p on p.id = wp.post_id
     where va.username = any($1::text[])
     order by va.username, w.event_date_est desc nulls last`,
    [SEED_VENUES]
  );
  merge(sameVenue, "same_venue");

  // Bucket 2: caption heuristic (concert/gala/birthday language) on
  // venue_tagged posts — same regex as the sizer, NOT a label.
  const { rows: captionHits } = await pool.query(`
    select p.shortcode, w.id as wedding_id, va.username as venue, p.source,
           w.event_date_est,
           (select string_agg(distinct wv.role::text, ',')
              from wedding_vendors wv where wv.wedding_id = w.id) as roles,
           left(coalesce(p.caption, ''), 160) as caption_head
    from posts p
    join wedding_posts wp on wp.post_id = p.id
    join weddings w on w.id = wp.wedding_id
    left join accounts va on va.id = w.venue_id
    where p.source = 'venue_tagged'
      and p.caption ~* '(concert|live music|opening for|tour|gala|fundraiser|birthday|block party|raver|house music|doors [0-9]|tix in bio|#livemusic|#concert)'
  `);
  merge(captionHits, "caption_heuristic");

  // Bucket 3: role-shape — wedding_vendors role set is a non-empty subset of
  // {venue, band, musician} only (no planner/florist/photo+video wedding-day
  // stack). Concerts are expected to cluster here; the labeled sample must
  // check this doesn't also catch real weddings that only credited a band.
  const { rows: roleShape } = await pool.query(`
    select p.shortcode, w.id as wedding_id, va.username as venue, p.source,
           w.event_date_est,
           (select string_agg(distinct wv.role::text, ',')
              from wedding_vendors wv where wv.wedding_id = w.id) as roles,
           left(coalesce(p.caption, ''), 160) as caption_head
    from weddings w
    left join accounts va on va.id = w.venue_id
    join wedding_posts wp on wp.wedding_id = w.id
    join posts p on p.id = wp.post_id
    where exists (select 1 from wedding_vendors wv where wv.wedding_id = w.id)
      and not exists (
        select 1 from wedding_vendors wv
        where wv.wedding_id = w.id
          and wv.role::text not in ('venue', 'band', 'musician')
      )
  `);
  merge(roleShape, "role_shape");

  // Bucket 4: newest 50 Chicago venue_tagged weddings (the feed head) —
  // what a date-sorted feed shows first. Left UNLABELED here; tick 2 hand-
  // labels a sample of the pool against the rubric, this bucket just makes
  // sure the feed head is in that sampling frame.
  const { rows: feedHead } = await pool.query(`
    select p.shortcode, w.id as wedding_id, va.username as venue, p.source,
           w.event_date_est,
           (select string_agg(distinct wv.role::text, ',')
              from wedding_vendors wv where wv.wedding_id = w.id) as roles,
           left(coalesce(p.caption, ''), 160) as caption_head
    from weddings w
    left join accounts va on va.id = w.venue_id
    join wedding_posts wp on wp.wedding_id = w.id
    join posts p on p.id = wp.post_id
    where w.is_chicago and p.source = 'venue_tagged'
    order by w.event_date_est desc nulls last, w.id desc
    limit 50
  `);
  merge(feedHead, "feed_head");

  const pool_rows = [...byUrl.values()].sort((a, b) =>
    a.wedding_id.localeCompare(b.wedding_id, undefined, { numeric: true })
  );

  const bucketSizes: Record<string, number> = {
    same_venue: sameVenue.length,
    caption_heuristic: captionHits.length,
    role_shape: roleShape.length,
    feed_head: feedHead.length,
  };
  const uniqueByBucket: Record<string, number> = {};
  for (const b of Object.keys(bucketSizes)) {
    uniqueByBucket[b] = pool_rows.filter((r) => r.buckets.includes(b)).length;
  }

  console.log("[non-wedding] tick 1: raw bucket sizes (rows, pre-dedup):", bucketSizes);
  console.log("[non-wedding] tick 1: unique posts per bucket (post-dedup):", uniqueByBucket);
  console.log(`[non-wedding] tick 1: union pool size (unique post_url): ${pool_rows.length}`);

  const out = {
    generated_at: new Date().toISOString(),
    note: "UNLABELED similar-set pool for the non-wedding-posts mission (tick 1). Do not treat 'buckets' as a label — tick 2 hand-labels a sample of this pool against labeling_rubric.md.",
    seed_venues: SEED_VENUES,
    bucket_sizes_raw: bucketSizes,
    bucket_sizes_unique: uniqueByBucket,
    pool: pool_rows,
  };
  writeFileSync(
    new URL("./data/non_wedding_similar_pool.json", import.meta.url),
    JSON.stringify(out, null, 2)
  );
  console.log(
    "[non-wedding] tick 1: wrote scripts/graph/data/non_wedding_similar_pool.json"
  );

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
