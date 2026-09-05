/**
 * Tick 2 prep for the non-wedding-posts mission
 * (docs/engineering/graph-strengthening/non-wedding-posts.md).
 *
 * Read-only. Builds the two populations to hand-label:
 *   (b) a stratified sample of the tick-1 similar-set pool (~50, excluding
 *       the 11 seeds which are already labeled)
 *   (c) a known-good candidate set: is_chicago weddings NOT in the similar
 *       pool, with a full wedding-day vendor stack and a caption that reads
 *       like a real event, for a human to confirm/reject as ground truth
 *
 * Pulls FULL captions (not the 160-char heads used for sizing) so labeling
 * has real evidence to cite per labeling_rubric.md. Writes
 * data/tick2_unlabeled_batch.json. Does not label or write to any DB table.
 *
 * Usage (from apps/web): bun run scripts/graph/prepareTick2Labeling.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";

const POOL = JSON.parse(
  readFileSync(new URL("./data/non_wedding_similar_pool.json", import.meta.url), "utf8")
) as { pool: { post_url: string; shortcode: string; wedding_id: string; venue: string; buckets: string[] }[] };

const SEEDS = JSON.parse(
  readFileSync(new URL("./data/non_wedding_seeds.json", import.meta.url), "utf8")
) as { posts: { post_url: string }[] };

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  const pool = getPool();
  const seedUrls = new Set(SEEDS.posts.map((p) => p.post_url));
  const candidates = POOL.pool.filter((r) => !seedUrls.has(r.post_url));

  // Stratified sample: cap per-bucket so no single bucket (feed_head,
  // caption_heuristic) drowns the others, target ~50 unique posts.
  const caps: Record<string, number> = {
    same_venue: 15,
    caption_heuristic: 20,
    role_shape: 8,
    feed_head: 12,
  };
  const chosen = new Map<string, (typeof candidates)[number]>();
  for (const bucket of Object.keys(caps)) {
    const inBucket = candidates.filter((r) => r.buckets.includes(bucket));
    const shuffled = seededShuffle(inBucket, 42);
    for (const r of shuffled) {
      if (chosen.size >= 1000) break;
      const already = [...chosen.values()].filter((c) => c.buckets.includes(bucket)).length;
      if (already >= caps[bucket]) continue;
      chosen.set(r.post_url, r);
    }
  }
  const sampleUrls = [...chosen.keys()];

  const { rows: sampleRows } = await pool.query(
    `select p.shortcode, w.id as wedding_id, va.username as venue, p.source,
            w.event_date_est, w.is_chicago,
            (select string_agg(distinct wv.role::text, ',')
               from wedding_vendors wv where wv.wedding_id = w.id) as roles,
            coalesce(p.caption, '') as caption
     from posts p
     join wedding_posts wp on wp.post_id = p.id
     join weddings w on w.id = wp.wedding_id
     left join accounts va on va.id = w.venue_id
     where p.shortcode = any($1::text[])`,
    [sampleUrls.map((u) => u.match(/\/p\/([^/]+)/)![1])]
  );

  const SEED_VENUES = [
    "hobchicago", "lh_schubas", "reggieslive", "garcias_chicago",
    "navypiereventcenter", "revelspace", "rcchicago", "thegeraghty",
    "_thefirehouse_",
  ];
  const poolUrls = new Set(POOL.pool.map((r) => r.post_url));

  // Known-good candidates: is_chicago weddings NOT already in the similar
  // pool, with a full wedding-day stack (planner + photographer at minimum,
  // plus at least 4 distinct roles), caption mentions "wedding", venue not
  // one of the 9 seed venues. This is a CANDIDATE list for a human to
  // confirm, not a label.
  const { rows: knownGoodCandidates } = await pool.query(
    `select p.shortcode, w.id as wedding_id, va.username as venue, p.source,
            w.event_date_est, w.is_chicago,
            (select string_agg(distinct wv.role::text, ',')
               from wedding_vendors wv where wv.wedding_id = w.id) as roles,
            coalesce(p.caption, '') as caption
     from weddings w
     join wedding_posts wp on wp.wedding_id = w.id
     join posts p on p.id = wp.post_id
     left join accounts va on va.id = w.venue_id
     where w.is_chicago
       and (va.username is null or not (va.username = any($1::text[])))
       and p.caption ~* '\\ywedding\\y'
       and (select count(distinct wv.role) from wedding_vendors wv where wv.wedding_id = w.id) >= 4
       and exists (select 1 from wedding_vendors wv where wv.wedding_id = w.id and wv.role = 'planner')
       and exists (select 1 from wedding_vendors wv where wv.wedding_id = w.id and wv.role = 'photographer')
     order by w.event_date_est desc nulls last
     limit 60`,
    [SEED_VENUES]
  );
  const knownGoodFiltered = knownGoodCandidates.filter(
    (r) => !poolUrls.has(`https://www.instagram.com/p/${r.shortcode}/`)
  );
  const knownGoodSample = seededShuffle(knownGoodFiltered, 7).slice(0, 25);

  console.log(`[tick2-prep] similar-pool sample: ${sampleRows.length} posts`);
  console.log(
    `[tick2-prep] known-good candidates found: ${knownGoodFiltered.length}, sampled: ${knownGoodSample.length}`
  );

  const out = {
    generated_at: new Date().toISOString(),
    note: "Tick 2 input for hand-labeling per labeling_rubric.md. 'group' distinguishes the similar-pool tune sample from the known-good regression candidates; neither is labeled yet.",
    similar_pool_sample: sampleRows.map((r) => ({ ...r, group: "similar_pool" })),
    known_good_candidates: knownGoodSample.map((r) => ({ ...r, group: "known_good" })),
  };
  writeFileSync(
    new URL("./data/tick2_unlabeled_batch.json", import.meta.url),
    JSON.stringify(out, null, 2)
  );
  console.log("[tick2-prep] wrote scripts/graph/data/tick2_unlabeled_batch.json");

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
