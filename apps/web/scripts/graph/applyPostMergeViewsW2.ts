/**
 * POST-TABLE MERGE, phase P4 wave 2 (2026-09-23): make v_ig_posts / v_jeremy_beta_posts
 * index-friendly. Same rows, same values.
 *
 * Found in W2's page checks: /label/candidates?post=<shortcode> took ~20 s. Both views picked the
 * staging row with `cross join lateral (select case ... end as j)`, and a LATERAL subquery stops
 * the planner flattening the UNION ALL -- so a lookup by post_url could not be pushed into the
 * branches, and every call hashed all ~68k rows. Rewritten as plain UNION ALL branches split on
 * real columns (raw_format / staging_post_id), no LATERAL:
 *   A  staging_post_id not null, raw_format = 'jeremy_staging_v1'  -> staging row in raw
 *   B  staging_post_id not null, raw_format <> 'jeremy_staging_v1' -> staging row in staging_raw
 *   C  staging_post_id is null                                     -> Apify payload (public)
 * Gate (inside the transaction, before COMMIT): column-by-column equality vs staging for both
 * views, and every frozen output equal to baseline + the cumulative accepted diffs.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyPostMergeViewsW2.ts --dry-run | --apply
 */
import { readFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";
import { FROZEN, baselineLoader, fetchLines, multisetDiff } from "./checkPostMergeParity";

const BASELINE = new URL("./snapshots/2026-09-22T22-43-25-093Z-pm-baseline", import.meta.url).pathname;
const ACCEPTED = new URL("./tmp_analysis/pm_accepted_w1/accepted.json", import.meta.url).pathname;

const stagingCols = (j: string) => `
        ${j}->>'caption_raw',
        (${j}->>'post_timestamp')::timestamp::timestamptz,
        (${j}->>'location_tag')::varchar,
        lower(${j}->>'owner_username'),
        nullif(${j}->'mentions', 'null'::jsonb),
        nullif(${j}->'hashtags', 'null'::jsonb),
        (${j}->>'post_type')::varchar,
        ${j}->>'image_url',
        (${j}->>'likes_count')::int,
        (${j}->>'vendor_id')::int,
        (${j}->>'scraped_at')::timestamp::timestamptz,
        null::bigint,
        'staging'::text`;

export const V_IG_POSTS = `create or replace view v_ig_posts as
 select p.url as post_url, p.shortcode,
        p.raw->>'caption_raw' as caption_raw,
        (p.raw->>'post_timestamp')::timestamp::timestamptz as post_timestamp,
        (p.raw->>'location_tag')::varchar as location_tag,
        lower(p.raw->>'owner_username') as owner_username,
        nullif(p.raw->'mentions', 'null'::jsonb) as mentions,
        nullif(p.raw->'hashtags', 'null'::jsonb) as hashtags,
        (p.raw->>'post_type')::varchar as post_type,
        p.raw->>'image_url' as image_url,
        (p.raw->>'likes_count')::int as likes_count,
        (p.raw->>'vendor_id')::int as vendor_id,
        (p.raw->>'scraped_at')::timestamp::timestamptz as scraped_at,
        null::bigint as post_id,
        'staging'::text as corpus_source
   from posts p
  where p.staging_post_id is not null and p.raw_format = 'jeremy_staging_v1'
 union all
 select p.url, p.shortcode,${stagingCols("p.staging_raw")}
   from posts p
  where p.staging_post_id is not null and p.raw_format <> 'jeremy_staging_v1'
 union all
 select p.url, p.shortcode, p.caption, p.posted_at,
        (p.raw->>'locationName')::varchar, lower(a.username::text),
        coalesce(p.raw->'mentions', '[]'::jsonb), coalesce(p.raw->'hashtags', '[]'::jsonb),
        (p.raw->>'type')::varchar, p.raw->>'displayUrl', p.likes_count, null::integer,
        p.scraped_at, p.id, 'public'::text
   from posts p
   join accounts a on a.id = p.owner_id
  where p.staging_post_id is null`;

const betaCols = (j: string) => `
        p.staging_post_id as id,
        (${j}->>'vendor_id')::integer as vendor_id,
        p.url as post_url,
        (${j}->>'location_tag')::varchar(255) as location_tag,
        ${j}->>'caption_raw' as caption_raw,
        (${j}->>'scraped_at')::timestamp as scraped_at,
        (${j}->>'post_timestamp')::timestamp as post_timestamp,
        ${j}->>'image_url' as image_url,
        (${j}->>'likes_count')::integer as likes_count,
        (${j}->>'owner_username')::varchar(100) as owner_username,
        nullif(${j}->'mentions', 'null'::jsonb) as mentions,
        nullif(${j}->'hashtags', 'null'::jsonb) as hashtags,
        (${j}->>'post_type')::varchar(20) as post_type,
        nullif(${j}->'images', 'null'::jsonb) as images,
        (${j}->>'media_width')::integer as media_width,
        (${j}->>'media_height')::integer as media_height,
        p.id as post_id,
        p.shortcode`;

export const V_JEREMY_BETA_POSTS = `create or replace view v_jeremy_beta_posts as
 select ${betaCols("p.raw")}
   from posts p
  where p.staging_post_id is not null and p.raw_format = 'jeremy_staging_v1'
 union all
 select ${betaCols("p.staging_raw")}
   from posts p
  where p.staging_post_id is not null and p.raw_format <> 'jeremy_staging_v1'`;

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply && !process.argv.includes("--dry-run")) throw new Error("need --dry-run or --apply");
  const pool = getPool();
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local statement_timeout = '1800s'");
    await c.query(V_IG_POSTS);
    await c.query(V_JEREMY_BETA_POSTS);

    // Plan check: a single-url lookup must now be index-driven, not a scan of every row.
    const plan = (await c.query(`explain (analyze, costs off, timing off)
        select * from v_ig_posts where post_url = 'https://www.instagram.com/p/CfT6u3dufqb/'`)).rows
      .map((r) => r["QUERY PLAN"] as string);
    const exec = plan.find((l) => l.startsWith("Execution Time")) ?? "";
    console.log(`[w2] v_ig_posts single-url lookup: ${exec}; seq scans: ${plan.filter((l) => l.includes("Seq Scan on posts")).length}`);

    let diffs = 0;
    const cols = ["vendor_id", "location_tag", "caption_raw", "scraped_at", "post_timestamp", "image_url", "likes_count",
      "owner_username", "mentions", "hashtags", "post_type", "images", "media_width", "media_height", "post_url"];
    for (const col of cols) {
      const n = (await c.query(`select count(*)::int n from staging.instagram_posts s join v_jeremy_beta_posts v on v.id = s.id
                                where s.${col}::text is distinct from v.${col}::text`)).rows[0].n as number;
      if (n) console.log(`  COLUMN DIFF v_jeremy_beta_posts.${col}: ${n}`);
      diffs += n;
    }
    const vig = (await c.query(`select count(*)::int n from staging.instagram_posts s
        join v_ig_posts v on v.post_url = s.post_url and v.corpus_source = 'staging'
        where (s.caption_raw, s.post_timestamp::timestamptz, s.location_tag::text, lower(s.owner_username::text), s.mentions, s.hashtags,
               s.post_type::text, s.image_url, s.likes_count, s.vendor_id, s.scraped_at::timestamptz)
          is distinct from (v.caption_raw, v.post_timestamp, v.location_tag::text, v.owner_username, v.mentions, v.hashtags,
               v.post_type::text, v.image_url, v.likes_count, v.vendor_id, v.scraped_at)`)).rows[0].n as number;
    const counts = (await c.query(`select (select count(*) from v_ig_posts)::int vig, (select count(distinct post_url) from v_ig_posts)::int vig_d,
        (select count(*) from v_jeremy_beta_posts)::int beta, (select count(*) from staging.instagram_posts where post_url ~ '/p/')::int stg`)).rows[0];
    console.log(`[w2] v_ig_posts staging-branch column diffs: ${vig}; rows ${counts.vig} (distinct ${counts.vig_d}); v_jeremy_beta_posts ${counts.beta} vs staging posts ${counts.stg}`);
    diffs += vig + (counts.vig === counts.vig_d ? 0 : 1) + (counts.beta === counts.stg ? 0 : 1);

    const load = baselineLoader(BASELINE);
    const accepted = JSON.parse(readFileSync(ACCEPTED, "utf8")).diffs as Record<string, { minus: string[]; plus: string[] }>;
    for (const f of FROZEN) {
      let base = load(f.name);
      const acc = accepted[f.name];
      if (acc) base = [...multisetDiff(base, acc.minus).onlyA, ...acc.plus];
      const { onlyA, onlyB } = multisetDiff(base, await fetchLines(c, f.sql));
      if (onlyA.length || onlyB.length) console.log(`  DIFF ${f.name}: -${onlyA.length} +${onlyB.length}`);
      diffs += onlyA.length + onlyB.length;
    }
    console.log(`[w2] total differences: ${diffs}`);
    if (apply && diffs === 0) {
      await c.query("commit");
      console.log("[w2] COMMITTED");
    } else {
      await c.query("rollback");
      console.log(apply ? "[w2] REFUSED -- ROLLED BACK" : "[w2] dry-run -- ROLLED BACK");
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
