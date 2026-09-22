/**
 * POST-TABLE MERGE, phase P1 (plan rev 3, 2026-09-22) -- the ADDITIVE schema for folding
 * `staging.instagram_posts` into `public.posts`. Nothing here reads or moves a staging row; that
 * is P2/P3 (`mergeStagingPosts.ts`). After this runs, every frozen output of
 * checkPostMergeParity.ts must be byte-identical: no view reads the new columns yet.
 *
 * What it adds:
 *   posts.origin          which pipeline CREATED the row: ben_pipeline | jeremy_beta |
 *                         acquisition_loop. NOT NULL, no default -- every writer states it
 *                         (postMergeCompat.ts). It is NOT "who saw it first": sightings live in
 *                         ops.post_observations, and one post can be seen by several channels.
 *   posts.raw_format      what `raw` holds: apify_v1 (Ben's pipeline.py + acquisition ingest store
 *                         the Apify item) | jeremy_evidence_subset (the 5-field staging subset
 *                         createWeddingsFromJeremyEvidence.ts copied; P3 upgrades these to the
 *                         full row) | jeremy_staging_v1 (the full staging row, from P3).
 *   posts.staging_raw     the verbatim staging row, ONLY where `raw` is an Apify payload and the
 *                         post is also in staging (the overlap), so normalized fields keep
 *                         today's staging precedence without reading staging (rev 3 item 2).
 *   posts.staging_post_id soft link to the import record (not an FK: staging is frozen).
 *   posts.merge_batch_id  set on every row the merge inserts or changes.
 *   unique(url)           every evidence table joins on the url TEXT; this makes it a real key.
 *   ops.post_merge_log / ops.post_merge_exclusions   append-only provenance for P3.
 *   two synthetic ops.crawl_runs (actor 'legacy-import', batch_id 'legacy-*'): the channels P3
 *                         backfills sightings under. They are channel totals, not strategies --
 *                         reportCorpusInventory's w/$ ranking only counts batch_id like 'acq-%'.
 *                         started_at never precedes the existing 2026-08-20 sentinel (run 31),
 *                         which structural_post_vendor_evidence_for_batch still reads.
 *
 * Origin backfill -- derived TWO independent ways, and the transaction refuses to commit if they
 * disagree on a single row (tick 3 finding: run 31 `legacy-ben-crawl1-zero-venues` already
 * registered 1,541 of Ben's posts as sightings, and 826 more Ben posts were later re-seen by the
 * loop, so "has an observation" does NOT mean the loop created the row):
 *   (a) provenance: source='jeremy_evidence' -> jeremy_beta; else an is_first observation from a
 *       non-legacy run -> acquisition_loop; else ben_pipeline.
 *   (b) clock: jeremy_evidence -> jeremy_beta; scraped_at before 2026-08-21 (Ben's 08-20 bulk
 *       load) -> ben_pipeline; scraped_at at/after the first real acquisition run -> acquisition_loop.
 *
 * Mirrored into pipeline/schema.sql under the "POST-TABLE MERGE (P1, 2026-09-22)" banner.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyPostMergeSchema.ts --print     # statements only, no DB access
 *   bun run scripts/graph/applyPostMergeSchema.ts --dry-run   # apply + assert inside a transaction, ROLLBACK
 *   bun run scripts/graph/applyPostMergeSchema.ts --apply     # same, COMMIT (needs a snapshot < 24h)
 */
import { readdirSync, statSync } from "node:fs";
import { getPool, closePool } from "../classify/db";

const JEREMY_SUBSET_KEYS = ["caption_raw", "likes_count", "owner_username", "post_timestamp", "post_url"];

export const STATEMENTS: string[] = [
  `alter table posts add column if not exists origin text;`,
  `alter table posts add column if not exists raw_format text;`,
  `alter table posts add column if not exists staging_raw jsonb;`,
  `alter table posts add column if not exists staging_post_id integer;`,
  `alter table posts add column if not exists merge_batch_id text;`,
  `do $$ begin
     if not exists (select 1 from pg_constraint where conname = 'posts_origin_check') then
       alter table posts add constraint posts_origin_check
         check (origin in ('ben_pipeline','jeremy_beta','acquisition_loop'));
     end if;
     if not exists (select 1 from pg_constraint where conname = 'posts_raw_format_check') then
       alter table posts add constraint posts_raw_format_check
         check (raw_format in ('apify_v1','jeremy_evidence_subset','jeremy_staging_v1'));
     end if;
   end $$;`,
  `create unique index if not exists posts_url_key on posts (url);`,
  `create unique index if not exists posts_staging_post_id_key on posts (staging_post_id);`,

  `create table if not exists ops.post_merge_log (
     id               bigint generated always as identity primary key,
     batch_id         text not null,
     post_id          bigint,
     staging_post_id  integer,
     action           text not null,
     before           jsonb,
     after            jsonb,
     logged_at        timestamptz not null default now()
   );`,
  `create index if not exists idx_post_merge_log_batch on ops.post_merge_log (batch_id, action);`,
  `comment on table ops.post_merge_log is 'POST-TABLE MERGE (2026-09-22): append-only, one row per insert/relabel/link/observation-repair the merge made, with before-state. The revert reads it. Never updated or deleted.';`,
  `create table if not exists ops.post_merge_exclusions (
     staging_post_id  integer primary key,
     post_url         text not null,
     reason           text not null,
     batch_id         text not null,
     excluded_at      timestamptz not null default now()
   );`,
  `comment on table ops.post_merge_exclusions is 'POST-TABLE MERGE (2026-09-22): staging rows deliberately NOT merged into posts, each with its reason (the 10 profile urls, which are not posts).';`,

  `insert into ops.crawl_runs (batch_id, actor, feed, input, status, started_at, finished_at, ingested_at, note)
   select 'legacy-ben-pipeline', 'legacy-import', 'tagged',
          '{"source":"pipeline/pipeline.py (apify/instagram-tagged-scraper)","registered_by":"post-table merge P1"}'::jsonb,
          'ingested', '2026-08-20 05:21:20+00', '2026-08-20 06:32:26+00', now(),
          'POST-TABLE MERGE (2026-09-22): channel for Ben''s pre-loop pipeline.py crawl, bulk-loaded 2026-08-20 05:21-06:32 UTC. Sightings backfilled under this run use posts.scraped_at, which is the LOAD clock, not an Instagram scrape time. Not a strategy: excluded from w/$ (batch_id is not acq-%).'
   where not exists (select 1 from ops.crawl_runs where batch_id = 'legacy-ben-pipeline');`,
  `insert into ops.crawl_runs (batch_id, actor, feed, input, status, started_at, finished_at, ingested_at, note)
   select 'legacy-jeremy-beta-import', 'legacy-import', 'own',
          '{"source":"Jeremy beta RDS public.instagram_posts, loaded verbatim into staging.instagram_posts","registered_by":"post-table merge P1"}'::jsonb,
          'ingested', '2026-08-22 00:00:00+00', '2026-08-22 00:00:00+00', now(),
          'POST-TABLE MERGE (2026-09-22): channel for Jeremy''s beta own-profile scrape (vendor profiles, scraped 2026-06-17..08-21, imported 2026-08-22). Sightings use the staging row''s scraped_at (his real scrape clock). Not a strategy: excluded from w/$ (batch_id is not acq-%).'
   where not exists (select 1 from ops.crawl_runs where batch_id = 'legacy-jeremy-beta-import');`,

  `update posts p set origin = case
       when p.source = 'jeremy_evidence' then 'jeremy_beta'
       when exists (select 1 from ops.post_observations o join ops.crawl_runs r on r.id = o.run_id
                    where o.post_id = p.id and o.is_first and r.batch_id not like 'legacy-%') then 'acquisition_loop'
       else 'ben_pipeline' end
   where p.origin is null;`,
  `update posts set raw_format = case when source = 'jeremy_evidence' then 'jeremy_evidence_subset' else 'apify_v1' end
   where raw_format is null;`,
  `alter table posts alter column origin set not null;`,
  `alter table posts alter column raw_format set default 'apify_v1';`,
  `alter table posts alter column raw_format set not null;`,
  `comment on column posts.origin is 'POST-TABLE MERGE: which pipeline CREATED this row (ben_pipeline | jeremy_beta | acquisition_loop). No default: writers state it. Sightings (who saw it, when) live in ops.post_observations.';`,
  `comment on column posts.raw_format is 'POST-TABLE MERGE: shape of raw -- apify_v1 | jeremy_evidence_subset (5-field copy, pre-P3) | jeremy_staging_v1 (full staging row).';`,
  `comment on column posts.staging_raw is 'POST-TABLE MERGE: verbatim staging.instagram_posts row, only where raw is an Apify payload and the post is also in staging; normalized fields read it first (staging precedence).';`,
];

/** Assertions run inside the transaction, before COMMIT. Each returns a violation count. */
const ASSERTS: { name: string; sql: string }[] = [
  { name: "origin null", sql: `select count(*)::int n from posts where origin is null` },
  {
    name: "origin disagrees with the clock derivation",
    sql: `with first_acq as (select min(started_at) t from ops.crawl_runs where batch_id not like 'legacy-%')
          select count(*)::int n from posts p, first_acq f
          where origin <> case when p.source = 'jeremy_evidence' then 'jeremy_beta'
                               when p.scraped_at < '2026-08-21' then 'ben_pipeline'
                               when p.scraped_at >= f.t then 'acquisition_loop'
                               else 'UNCLASSIFIABLE' end`,
  },
  {
    // Tick 3: exactly 1 row (37676, DaAoG40mUmC, copied 2026-09-21 via the v_ig_posts path at
    // createWeddingsFromJeremyEvidence.ts:~1420) also carries the view's corpus_source tag.
    name: "jeremy_evidence raw is not the 5-field subset (+ optional corpus_source tag)",
    sql: `select count(*)::int n from posts where source = 'jeremy_evidence'
          and (select array_agg(k order by k) from jsonb_object_keys(raw - 'corpus_source') k) <> array[${JEREMY_SUBSET_KEYS.map((k) => `'${k}'`).join(",")}]::text[]`,
  },
  {
    name: "min(crawl_runs.started_at) moved from the 2026-08-20 sentinel",
    sql: `select (min(started_at) <> '2026-08-20 00:00:00+00')::int n from ops.crawl_runs`,
  },
  { name: "synthetic runs not exactly 2", sql: `select (count(*) <> 2)::int n from ops.crawl_runs where actor = 'legacy-import'` },
  { name: "synthetic run in the acq-% ranking", sql: `select count(*)::int n from ops.crawl_runs where actor = 'legacy-import' and batch_id like 'acq-%'` },
  { name: "url not unique", sql: `select (count(*) <> count(distinct url))::int n from posts` },
];

function freshSnapshot(): string | undefined {
  const root = new URL("./snapshots/", import.meta.url).pathname;
  const day = 24 * 3600 * 1000;
  return readdirSync(root)
    .filter((d) => !d.includes("pm-baseline"))
    .find((d) => Date.now() - statSync(`${root}${d}`).mtimeMs < day);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--print")) {
    STATEMENTS.forEach((s, i) => console.log(`-- ${i + 1}/${STATEMENTS.length}\n${s}\n`));
    return;
  }
  const apply = args.includes("--apply");
  if (!apply && !args.includes("--dry-run")) {
    console.error("need --print, --dry-run or --apply");
    process.exit(2);
  }
  if (apply && !freshSnapshot()) {
    console.error("REFUSING --apply: no snapshot < 24h under scripts/graph/snapshots/ (snapshotGraphTables.ts --label <x>)");
    process.exit(1);
  }

  const pool = getPool();
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local statement_timeout = '900s'");
    const { rows: before } = await c.query(`select count(*)::int n from posts`);
    for (const [i, s] of STATEMENTS.entries()) {
      const r = await c.query(s);
      console.log(`[p1] ${i + 1}/${STATEMENTS.length} ok${r.rowCount != null && r.command !== "ALTER" ? ` (${r.command} ${r.rowCount})` : ""}`);
    }

    const { rows: dist } = await c.query(
      `select origin, raw_format, source, count(*)::int n from posts group by 1,2,3 order by 1,2,3`
    );
    console.log("\n[p1] origin x raw_format x source:");
    for (const d of dist) console.log(`  ${d.origin.padEnd(17)} ${d.raw_format.padEnd(23)} ${d.source.padEnd(16)} ${d.n}`);
    const { rows: runs } = await c.query(
      `select id, batch_id, actor, feed, started_at from ops.crawl_runs where batch_id like 'legacy-%' order by id`
    );
    console.log("\n[p1] legacy runs:");
    for (const r of runs) console.log(`  ${r.id} ${r.batch_id} ${r.actor} ${r.feed} ${r.started_at.toISOString()}`);

    const { rows: after } = await c.query(`select count(*)::int n from posts`);
    let failures = 0;
    if (after[0].n !== before[0].n) {
      console.log(`  FAIL posts count moved ${before[0].n} -> ${after[0].n}`);
      failures++;
    }
    console.log("\n[p1] assertions (must all be 0):");
    for (const a of ASSERTS) {
      const { rows } = await c.query(a.sql);
      const n = rows[0].n as number;
      console.log(`  ${n === 0 ? "ok  " : "FAIL"} ${a.name}: ${n}`);
      if (n !== 0) failures++;
    }

    if (failures || !apply) {
      await c.query("rollback");
      console.log(failures ? `\n[p1] ${failures} assertion(s) failed -- ROLLED BACK` : "\n[p1] dry-run -- ROLLED BACK");
      if (failures) process.exitCode = 1;
    } else {
      await c.query("commit");
      console.log("\n[p1] COMMITTED");
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
