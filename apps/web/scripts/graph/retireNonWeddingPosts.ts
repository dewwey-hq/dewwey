/**
 * Tick 5 of the non-wedding-posts mission
 * (docs/engineering/graph-strengthening/non-wedding-posts.md).
 *
 * Surgical retirement of confirmed non-wedding posts from the serving graph.
 * Default mode is --dry-run: runs the real SQL inside a transaction, prints
 * before/after counts and the provenance rows it WOULD write, then ROLLS
 * BACK. No commit happens unless --commit is passed explicitly by a human
 * (never from auto-mode — see docs/engineering/graph-strengthening/
 * non-wedding-posts.md Constraints: "Ask before any real DELETE/UPDATE on
 * Supabase").
 *
 * Candidate set = data/non_wedding_delete_candidates.json, which is the
 * union of:
 *   - role_shape_v1 (locked tick 4): every wedding where wedding_vendors'
 *     role set is a non-empty subset of {venue, band, musician} — auto,
 *     corpus-wide, 100% precision / 0 false-EXCLUDEs on tune+known-good+heldout.
 *   - hand-reviewed EXCLUDEs: the 11 original seeds + 34 hand-labeled
 *     similar-pool EXCLUDEs from tick 2, individually cited against
 *     labeling_rubric.md. NOT the raw caption-heuristic or same-venue
 *     buckets — only posts a human-equivalent label actually checked.
 *
 * For each candidate post_url: detach its wedding_posts row. If the
 * wedding then has 0 remaining posts, retire the weddings row and its
 * wedding_vendors rows too (never leave an empty wedding in the graph).
 * Every retired id is logged into non_wedding_posts_retired (created if
 * missing, --commit only).
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/retireNonWeddingPosts.ts                                   # dry run, default candidates file
 *   bun run scripts/graph/retireNonWeddingPosts.ts --commit                          # real write — human only
 *   bun run scripts/graph/retireNonWeddingPosts.ts --candidates=data/foo.json        # a later batch (e.g. a second user-flagged round)
 */
import { readFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";

const candidatesArg = process.argv.find((a) => a.startsWith("--candidates="));
const candidatesPath = candidatesArg
  ? candidatesArg.slice("--candidates=".length)
  : "./data/non_wedding_delete_candidates.json";
const CANDIDATES = JSON.parse(
  readFileSync(new URL(candidatesPath, import.meta.url), "utf8")
) as { post_urls: string[] };

function shortcode(url: string): string {
  return url.match(/\/p\/([^/]+)/)![1];
}

async function main() {
  const commit = process.argv.includes("--commit");
  const pool = getPool();
  const client = await pool.connect();
  const shorts = CANDIDATES.post_urls.map(shortcode);

  try {
    await client.query("begin");

    if (commit) {
      await client.query(`
        create table if not exists non_wedding_posts_retired (
          id            bigint generated always as identity primary key,
          post_url      text not null,
          shortcode     text not null,
          wedding_id    bigint not null,
          wedding_also_retired boolean not null,
          reason        text not null,
          ruled_by      text not null,
          retired_at    timestamptz not null default now()
        )
      `);
    }

    const { rows: before } = await client.query(`
      select
        (select count(*) from weddings)::int as n_weddings,
        (select count(*) from wedding_posts)::int as n_wedding_posts,
        (select count(*) from wedding_vendors)::int as n_wedding_vendors
    `);
    console.log(`[tick5] mode: ${commit ? "COMMIT (real write)" : "DRY RUN (will roll back)"}`);
    console.log("[tick5] before:", before[0]);

    const { rows: targets } = await client.query(
      `select p.id as post_id, p.shortcode, wp.wedding_id
       from posts p
       join wedding_posts wp on wp.post_id = p.id
       where p.shortcode = any($1::text[])`,
      [shorts]
    );
    const missing = shorts.filter((s) => !targets.some((t) => t.shortcode === s));
    if (missing.length) console.log("[tick5] WARNING: not found on any wedding_posts row (already retired?):", missing);

    for (const t of targets) {
      await client.query(`delete from wedding_posts where post_id = $1`, [t.post_id]);
    }

    // Re-check remaining post count AFTER all of this batch's deletes, not a
    // per-post pre-count — a wedding with 2+ candidate posts in the SAME
    // batch (e.g. duplicate posts of one non-wedding event) would otherwise
    // never be recognized as empty, leaving an orphaned weddings row behind.
    const affectedWeddingIds = [...new Set(targets.map((t) => String(t.wedding_id)))];
    const { rows: remaining } = await client.query(
      `select wedding_id, count(*)::int as n
       from wedding_posts where wedding_id = any($1::bigint[])
       group by wedding_id`,
      [affectedWeddingIds]
    );
    const remainingById = new Map(remaining.map((r: any) => [String(r.wedding_id), r.n]));
    const weddingsFullyRetired = new Set(
      affectedWeddingIds.filter((wid) => (remainingById.get(wid) ?? 0) === 0)
    );

    const provenance = targets.map((t) => ({
      post_url: `https://www.instagram.com/p/${t.shortcode}/`,
      shortcode: t.shortcode,
      wedding_id: String(t.wedding_id),
      wedding_also_retired: weddingsFullyRetired.has(String(t.wedding_id)),
    }));

    for (const wid of weddingsFullyRetired) {
      await client.query(`delete from wedding_vendors where wedding_id = $1`, [wid]);
      await client.query(`delete from weddings where id = $1`, [wid]);
    }

    if (commit) {
      for (const p of provenance) {
        await client.query(
          `insert into non_wedding_posts_retired (post_url, shortcode, wedding_id, wedding_also_retired, reason, ruled_by)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            p.post_url,
            p.shortcode,
            p.wedding_id,
            p.wedding_also_retired,
            "non_wedding_posts mission (D040) — role_shape_v1 or hand-labeled EXCLUDE",
            candidatesArg ? `non-wedding-posts.md, batch: ${candidatesPath}` : "non-wedding-posts.md tick 5",
          ]
        );
      }
    }

    const { rows: after } = await client.query(`
      select
        (select count(*) from weddings)::int as n_weddings,
        (select count(*) from wedding_posts)::int as n_wedding_posts,
        (select count(*) from wedding_vendors)::int as n_wedding_vendors
    `);
    console.log("[tick5] after (within transaction):", after[0]);
    console.log(`[tick5] posts detached: ${provenance.length}`);
    console.log(`[tick5] weddings fully retired (0 posts left): ${weddingsFullyRetired.size}`);
    console.log(
      "[tick5] weddings fully retired ids:",
      [...weddingsFullyRetired].sort((a, b) => Number(a) - Number(b))
    );

    if (!candidatesArg) {
      // Only meaningful for the original tick-5 file, where seeds are always first 11.
      const seedShorts = new Set(shorts.slice(0, 11));
      const seedsDetached = provenance.filter((p) => seedShorts.has(p.shortcode)).length;
      console.log(`[tick5] of the 11 original seeds, detached this run: ${seedsDetached}/11`);
    }

    if (commit) {
      await client.query("commit");
      console.log("[tick5] COMMITTED. Run: cd apps/web && bun run scripts/graph/refreshEdges.ts (or `refresh materialized view edges` directly) to refresh edges.");
    } else {
      await client.query("rollback");
      console.log("[tick5] DRY RUN complete — rolled back, nothing changed.");
      const commitCmd = candidatesArg
        ? `bun run scripts/graph/retireNonWeddingPosts.ts --commit --candidates=${candidatesPath}`
        : "bun run scripts/graph/retireNonWeddingPosts.ts --commit";
      console.log(`[tick5] To actually apply this (human only, not auto-mode): ! cd apps/web && ${commitCmd}`);
    }
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
