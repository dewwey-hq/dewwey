/**
 * Read-only sizer for the non-wedding-posts mission
 * (docs/engineering/graph-strengthening/non-wedding-posts.md).
 *
 * Re-run at the start of every /loop tick. Does not label, delete, or
 * write. Prints: seed lookup, posts-by-source, seed-wedding shape,
 * a caption heuristic (NOT ground truth), seed-venue wedding counts,
 * and the 25 newest Chicago weddings (what date-sorted feeds show first).
 *
 * Usage (from apps/web): bun run scripts/graph/sizeNonWeddingVenueTagged.ts
 */
import { readFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";

const SEEDS = JSON.parse(
  readFileSync(new URL("./data/non_wedding_seeds.json", import.meta.url), "utf8")
) as {
  posts: { post_url: string; expected_decision: string; exclusion_reason: string }[];
};

function shortcode(url: string): string {
  const m = url.match(/\/p\/([^/]+)/);
  if (!m) throw new Error(`unparseable post_url: ${url}`);
  return m[1];
}

async function main() {
  const pool = getPool();
  const urls = SEEDS.posts.map((p) => p.post_url);
  const shorts = urls.map(shortcode);

  const { rows: sources } = await pool.query(
    `select source, count(*)::int as n from posts group by source order by n desc`
  );
  console.log("[non-wedding] posts by source:");
  console.log(sources);

  const { rows: seeds } = await pool.query(
    `select
       p.shortcode, p.source, a.username as owner, va.username as venue,
       w.id as wedding_id, w.event_date_est, w.is_chicago,
       exists(select 1 from jeremy_weddings_created j where j.wedding_id = w.id) as created_via_jeremy,
       (select count(*) from wedding_posts wp2 where wp2.wedding_id = w.id)::int as n_posts,
       (select count(*) from wedding_vendors wv where wv.wedding_id = w.id)::int as n_vendors,
       (select string_agg(distinct wv.role::text, ',')
          from wedding_vendors wv where wv.wedding_id = w.id) as roles,
       (select pc.decision from post_classification_runs pc
          where pc.post_url = p.url and pc.classifier_version = 'v3'
          order by pc.classified_at desc limit 1) as v3_decision,
       left(coalesce(p.caption, ''), 160) as caption_head
     from posts p
     left join accounts a on a.id = p.owner_id
     left join wedding_posts wp on wp.post_id = p.id
     left join weddings w on w.id = wp.wedding_id
     left join accounts va on va.id = w.venue_id
     where p.shortcode = any($1::text[])
     order by w.id nulls last, p.shortcode`,
    [shorts]
  );
  console.log(`[non-wedding] seeds in posts: ${seeds.length}/${shorts.length}`);
  console.log(JSON.stringify(seeds, null, 2));

  const missing = shorts.filter((s) => !seeds.some((r) => r.shortcode === s));
  if (missing.length) console.log("[non-wedding] seeds NOT in posts:", missing);

  const { rows: concertish } = await pool.query(`
    select count(distinct w.id)::int as n_weddings, count(distinct p.id)::int as n_posts
    from posts p
    join wedding_posts wp on wp.post_id = p.id
    join weddings w on w.id = wp.wedding_id
    where p.source = 'venue_tagged'
      and p.caption ~* '(concert|live music|opening for|tour|gala|fundraiser|birthday|block party|raver|house music|doors [0-9]|tix in bio|#livemusic|#concert)'
  `);
  console.log("[non-wedding] caption concert/gala/birthday heuristic (NOT labels):");
  console.log(concertish[0]);

  const { rows: recent } = await pool.query(`
    select
      count(*)::int as n_weddings,
      count(*) filter (where w.event_date_est >= '2026-08-01')::int as n_aug2026_plus
    from weddings w
  `);
  console.log("[non-wedding] date mix:", recent[0]);

  const { rows: top } = await pool.query(`
    select w.id, w.event_date_est::date as event_date, va.username as venue,
           p.shortcode, p.source, left(coalesce(p.caption,''), 100) as caption_head
    from weddings w
    join accounts va on va.id = w.venue_id
    join wedding_posts wp on wp.wedding_id = w.id
    join posts p on p.id = wp.post_id
    where w.is_chicago
    order by w.event_date_est desc nulls last, w.id desc
    limit 25
  `);
  console.log("[non-wedding] 25 newest Chicago weddings (date-sorted feed head):");
  console.log(JSON.stringify(top, null, 2));

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
