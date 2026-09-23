/**
 * POST-TABLE MERGE, phase P4 wave 1 (2026-09-23): the last DB objects that read
 * `staging.instagram_posts` are re-pointed at `public.posts`.
 *
 * Seven views read staging directly (v1_content_corpus, human_confirmed_post_geography,
 * human_confirmed_post_vendor_association, venue_couple_signal_post_vendor_evidence,
 * venue_inline_mention_post_vendor_evidence, venue_portfolio_content, post_styled_shoot_signal).
 * Each is DEFINED on Jeremy's slice (e.g. v1_content_corpus is his classified corpus), and widening
 * them to crawled posts would be a behaviour change a merge must not make. So they read
 * `v_jeremy_beta_posts`: the posts rows linked to a staging row, exposing the staging columns with
 * their original types and values (from the verbatim staging row the merge stored). Output is
 * identical except the 10 staging rows that were never posts (profile urls, logged in
 * ops.post_merge_exclusions), which drop out -- a named cause.
 *
 * The structural view/function and v_ig_posts were already swapped in P3 (mergeStagingPosts.ts);
 * this script also mirrors their LIVE definitions into the printed schema block so
 * pipeline/schema.sql can carry the post-merge state.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyPostMergeViewsW1.ts --dry-run   # swap + frozen check in a transaction, ROLLBACK
 *   bun run scripts/graph/applyPostMergeViewsW1.ts --apply     # COMMIT only if every diff is a profile url
 *   bun run scripts/graph/applyPostMergeViewsW1.ts --print-schema   # live post-merge DDL for pipeline/schema.sql
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";
import { FROZEN, baselineLoader, fetchLines, multisetDiff } from "./checkPostMergeParity";

const BASELINE = new URL("./snapshots/2026-09-22T22-43-25-093Z-pm-baseline", import.meta.url).pathname;
const ACCEPTED = new URL("./tmp_analysis/pm_accepted_pm-20260923-merge-1/accepted.json", import.meta.url).pathname;

export const VIEWS = [
  "v1_content_corpus",
  "human_confirmed_post_geography",
  "human_confirmed_post_vendor_association",
  "venue_couple_signal_post_vendor_evidence",
  "venue_inline_mention_post_vendor_evidence",
  "venue_portfolio_content",
  "post_styled_shoot_signal",
];

export const V_JEREMY_BETA_POSTS = `create or replace view v_jeremy_beta_posts as
 select p.staging_post_id as id,
        (s.j->>'vendor_id')::integer as vendor_id,
        p.url as post_url,
        (s.j->>'location_tag')::varchar(255) as location_tag,
        s.j->>'caption_raw' as caption_raw,
        (s.j->>'scraped_at')::timestamp as scraped_at,
        (s.j->>'post_timestamp')::timestamp as post_timestamp,
        s.j->>'image_url' as image_url,
        (s.j->>'likes_count')::integer as likes_count,
        (s.j->>'owner_username')::varchar(100) as owner_username,
        nullif(s.j->'mentions', 'null'::jsonb) as mentions,
        nullif(s.j->'hashtags', 'null'::jsonb) as hashtags,
        (s.j->>'post_type')::varchar(20) as post_type,
        nullif(s.j->'images', 'null'::jsonb) as images,
        (s.j->>'media_width')::integer as media_width,
        (s.j->>'media_height')::integer as media_height,
        p.id as post_id,
        p.shortcode
   from posts p
   cross join lateral (select case when p.raw_format = 'jeremy_staging_v1' then p.raw else p.staging_raw end as j) s
  where p.staging_post_id is not null`;
const COMMENT = `comment on view v_jeremy_beta_posts is 'POST-TABLE MERGE (P4 W1, 2026-09-23): Jeremy''s beta rows, sourced from public.posts (rows linked to a staging row), with the staging.instagram_posts columns, types and values (from the verbatim staging row the merge stored) plus post_id/shortcode. Use it where a query is DEFINED on his slice; use posts / v_ig_posts for the whole corpus. Never read staging.instagram_posts.'`;

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const pool = getPool();
  const c = await pool.connect();
  try {
    if (args.includes("--print-schema")) {
      // Live definitions only (W2 replaced the lateral versions this file first installed).
      const out: string[] = [`create or replace view v_jeremy_beta_posts as\n${(await c.query(`select pg_get_viewdef('v_jeremy_beta_posts'::regclass, true) d`)).rows[0].d}`, COMMENT + ";"];
      out.push(`create or replace view v_ig_posts as\n${(await c.query(`select pg_get_viewdef('v_ig_posts'::regclass, true) d`)).rows[0].d}`);
      for (const v of VIEWS) out.push(`create or replace view ${v} as\n${(await c.query(`select pg_get_viewdef($1::regclass, true) d`, [v])).rows[0].d}`);
      out.push(`create or replace view structural_post_vendor_evidence as\n${(await c.query(`select pg_get_viewdef('structural_post_vendor_evidence'::regclass, true) d`)).rows[0].d}`);
      out.push(`${(await c.query(`select pg_get_functiondef('structural_post_vendor_evidence_for_batch'::regproc) d`)).rows[0].d};`);
      console.log(out.map((x) => x.replace(/;?\s*$/, ";")).join("\n\n"));
      return;
    }
    if (!apply && !args.includes("--dry-run")) throw new Error("need --dry-run, --apply or --print-schema");

    await c.query("begin");
    await c.query("set local statement_timeout = '1800s'");
    await c.query(V_JEREMY_BETA_POSTS);
    await c.query(COMMENT);
    // Tick 9 finding: the P3 v_ig_posts read s.j->'mentions' / 'hashtags', and to_jsonb() had turned
    // SQL NULL into JSON null -- so 25,107 / 17,633 staging rows returned jsonb 'null' instead of NULL
    // (no frozen output exposes those columns). Same fix here, then a direct column-equality check.
    const vig = (await c.query(`select pg_get_viewdef('v_ig_posts'::regclass, true) d`)).rows[0].d as string;
    const vigFixed = vig
      .replace(/s\.j -> 'mentions'::text AS mentions/, "NULLIF(s.j -> 'mentions'::text, 'null'::jsonb) AS mentions")
      .replace(/s\.j -> 'hashtags'::text AS hashtags/, "NULLIF(s.j -> 'hashtags'::text, 'null'::jsonb) AS hashtags");
    if (vigFixed === vig || (vigFixed.match(/NULLIF/g) ?? []).length < 2) throw new Error("v_ig_posts: mentions/hashtags text not found -- refusing");
    await c.query(`create or replace view v_ig_posts as ${vigFixed}`);
    const cols: [string, string][] = [
      ["vendor_id", "vendor_id"], ["location_tag", "location_tag"], ["caption_raw", "caption_raw"],
      ["scraped_at", "scraped_at"], ["post_timestamp", "post_timestamp"], ["image_url", "image_url"],
      ["likes_count", "likes_count"], ["owner_username", "owner_username"], ["mentions", "mentions"],
      ["hashtags", "hashtags"], ["post_type", "post_type"], ["images", "images"],
      ["media_width", "media_width"], ["media_height", "media_height"], ["post_url", "post_url"],
    ];
    let colDiffs = 0;
    for (const [sc, vc] of cols) {
      const n = (await c.query(`select count(*)::int n from staging.instagram_posts s join v_jeremy_beta_posts v on v.id = s.id
                                where s.${sc}::text is distinct from v.${vc}::text`)).rows[0].n as number;
      if (n) console.log(`  COLUMN DIFF v_jeremy_beta_posts.${vc}: ${n}`);
      colDiffs += n;
    }
    // v_ig_posts staging branch vs the pre-merge union's staging branch expressions
    const vigCheck = (await c.query(`select count(*)::int n from staging.instagram_posts s
        join v_ig_posts v on v.post_url = s.post_url and v.corpus_source = 'staging'
        where (s.caption_raw, s.post_timestamp::timestamptz, s.location_tag::text, lower(s.owner_username::text), s.mentions, s.hashtags,
               s.post_type::text, s.image_url, s.likes_count, s.vendor_id, s.scraped_at::timestamptz)
          is distinct from (v.caption_raw, v.post_timestamp, v.location_tag::text, v.owner_username, v.mentions, v.hashtags,
               v.post_type::text, v.image_url, v.likes_count, v.vendor_id, v.scraped_at)`)).rows[0].n as number;
    if (vigCheck) console.log(`  COLUMN DIFF v_ig_posts staging branch: ${vigCheck} rows`);
    colDiffs += vigCheck;
    const missing = (await c.query(`select count(*)::int n from staging.instagram_posts s
        where s.post_url ~ '/p/' and not exists (select 1 from v_jeremy_beta_posts v where v.id = s.id)`)).rows[0].n as number;
    if (missing) console.log(`  MISSING from v_jeremy_beta_posts: ${missing}`);
    colDiffs += missing;
    console.log(`[w1] column-by-column equality vs staging: ${colDiffs} differences`);
    for (const v of VIEWS) {
      const def = (await c.query(`select pg_get_viewdef($1::regclass, true) d`, [v])).rows[0].d as string;
      const n = def.split("staging.instagram_posts").length - 1;
      if (n === 0) throw new Error(`${v}: no staging.instagram_posts reference -- refusing`);
      await c.query(`create or replace view ${v} as ${def.replaceAll("staging.instagram_posts", "v_jeremy_beta_posts")}`);
      console.log(`[w1] ${v}: ${n} reference(s) re-pointed`);
    }
    const left = await c.query(
      `select string_agg(distinct cl.relname, ', ') s from pg_depend d join pg_rewrite r on r.oid = d.objid
       join pg_class cl on cl.oid = r.ev_class where d.refobjid = 'staging.instagram_posts'::regclass`
    );
    if (left.rows[0].s) throw new Error(`still depending on staging: ${left.rows[0].s}`);
    console.log("[w1] no view depends on staging.instagram_posts any more");

    const load = baselineLoader(BASELINE);
    const accepted = JSON.parse(readFileSync(ACCEPTED, "utf8")).diffs as Record<string, { minus: string[]; plus: string[] }>;
    const profile = new Set(load("profile_urls"));
    const urlOf = (r: string) => r.match(/^\(?(https:[^,)]+)/)?.[1] ?? "";
    let unexplained = 0;
    const newAccepted: Record<string, { minus: string[]; plus: string[] }> = {};
    for (const f of FROZEN) {
      let base = load(f.name);
      const acc = accepted[f.name];
      if (acc) base = [...multisetDiff(base, acc.minus).onlyA, ...acc.plus];
      const now = await fetchLines(c, f.sql);
      const { onlyA, onlyB } = multisetDiff(base, now);
      if (!onlyA.length && !onlyB.length) {
        console.log(`  OK   ${f.name}`);
        continue;
      }
      const bad = [...onlyB, ...onlyA.filter((r) => !profile.has(urlOf(r)))];
      unexplained += bad.length;
      newAccepted[f.name] = { minus: onlyA, plus: onlyB };
      console.log(`  DIFF ${f.name}: -${onlyA.length} +${onlyB.length} (profile-url removals ${onlyA.length - (bad.length - onlyB.length)}, unexplained ${bad.length})`);
      for (const r of bad.slice(0, 10)) console.log(`      ? ${r.slice(0, 220)}`);
    }
    console.log(`[w1] unexplained rows: ${unexplained}`);
    unexplained += colDiffs;
    writeFileSync(`/tmp/claude-1000/w1_diffs.json`, JSON.stringify(newAccepted));
    if (apply && unexplained === 0) {
      await c.query("commit");
      console.log("[w1] COMMITTED");
    } else {
      await c.query("rollback");
      console.log(apply ? "[w1] REFUSED (unexplained diffs) -- ROLLED BACK" : "[w1] dry-run -- ROLLED BACK");
      if (apply) process.exitCode = 1;
    }
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
    await closePool();
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
