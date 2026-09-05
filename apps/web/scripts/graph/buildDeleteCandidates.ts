/**
 * Tick 4/5 prep for the non-wedding-posts mission. Builds the final,
 * de-duplicated delete-candidate list: the 11 seeds (kept first, so
 * retireNonWeddingPosts.ts can report "N/11 seeds" cleanly) + the 34
 * hand-labeled similar-pool EXCLUDEs (tick 2) + the role_shape_v1
 * corpus-wide matches (tick 4, queried fresh here rather than hardcoded).
 * Read-only. Writes data/non_wedding_delete_candidates.json.
 *
 * Usage (from apps/web): bun run scripts/graph/buildDeleteCandidates.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";

const SEEDS = JSON.parse(
  readFileSync(new URL("./data/non_wedding_seeds.json", import.meta.url), "utf8")
) as { posts: { post_url: string }[] };

const LABELS = JSON.parse(
  readFileSync(new URL("./data/non_wedding_labels.json", import.meta.url), "utf8")
) as { posts: { post_url: string; group: string; expected_decision: string }[] };

async function main() {
  const pool = getPool();

  const seedUrls = SEEDS.posts.map((p) => p.post_url);
  const handExcludeUrls = LABELS.posts
    .filter((p) => p.group === "similar_pool" && p.expected_decision === "EXCLUDE")
    .map((p) => p.post_url);

  const { rows: roleShapeMatches } = await pool.query(`
    select p.shortcode
    from weddings w
    join wedding_posts wp on wp.wedding_id = w.id
    join posts p on p.id = wp.post_id
    where exists (select 1 from wedding_vendors wv where wv.wedding_id = w.id
                    and wv.role::text not in ('venue', 'band', 'musician')) = false
      and exists (select 1 from wedding_vendors wv where wv.wedding_id = w.id)
      and not exists (select 1 from jeremy_weddings_created j where j.wedding_id = w.id)
      and exists (
        select 1 from wedding_posts wp2 join posts p2 on p2.id = wp2.post_id
        where wp2.wedding_id = w.id and p2.source = 'venue_tagged'
      )
  `);
  const roleShapeUrls = roleShapeMatches.map((r: any) => `https://www.instagram.com/p/${r.shortcode}/`);

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const url of [...seedUrls, ...handExcludeUrls, ...roleShapeUrls]) {
    if (!seen.has(url)) {
      seen.add(url);
      ordered.push(url);
    }
  }

  console.log(`[delete-candidates] seeds: ${seedUrls.length}`);
  console.log(`[delete-candidates] hand-labeled pool EXCLUDEs: ${handExcludeUrls.length}`);
  console.log(`[delete-candidates] role_shape_v1 corpus-wide matches: ${roleShapeUrls.length}`);
  console.log(`[delete-candidates] union (deduped): ${ordered.length}`);

  writeFileSync(
    new URL("./data/non_wedding_delete_candidates.json", import.meta.url),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        note: "Delete candidates for tick 5 of non-wedding-posts.md. First 11 are always the original seeds (order matters for retireNonWeddingPosts.ts's seed-count check). Sources: seeds, tick-2 hand-labeled similar-pool EXCLUDEs, locked role_shape_v1 rule applied corpus-wide.",
        counts: {
          seeds: seedUrls.length,
          hand_labeled_pool_exclude: handExcludeUrls.length,
          role_shape_v1_corpus_wide: roleShapeUrls.length,
          union: ordered.length,
        },
        post_urls: ordered,
      },
      null,
      2
    )
  );
  console.log("[delete-candidates] wrote scripts/graph/data/non_wedding_delete_candidates.json");

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
