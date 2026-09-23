/**
 * POST-TABLE MERGE guards (P4 W5, 2026-09-23). The split between staging.instagram_posts and
 * public.posts caused four bugs of one shape -- "code forgot the other table exists" (D066). These
 * tests make that class fail loudly instead of silently:
 *
 *   LINT (no DB)  -- no code reads staging.instagram_posts (FROM/JOIN) and no SQL filters on the
 *                    retired source value 'jeremy_evidence', outside an explicit allowlist: the
 *                    merge's own tooling (which reads the import record on purpose), the marked
 *                    import-record reconciliation in reportCorpusInventory.ts, and the superseded
 *                    apply*Schema.ts scripts (marker POST_MERGE_SUPERSEDED; they refuse to run).
 *   DB            -- the merge's post-conditions still hold, no view depends on staging, and the
 *                    live view/function definitions equal the POST-TABLE MERGE block in
 *                    pipeline/schema.sql (that file had silently drifted from live once already).
 *
 * Run: bunx --bun vitest run scripts/graph/postMergeInvariants.test.ts  (from apps/web)
 */
import { describe, it, expect, afterAll } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { getPool, closePool } from "../classify/db";

const REPO = new URL("../../../../", import.meta.url).pathname;
const ROOTS = ["apps/web/app", "apps/web/lib", "apps/web/scripts", "pipeline"];
const SKIP_DIRS = new Set(["node_modules", "tmp_analysis", "snapshots", ".next"]);
const EXT = /\.(ts|tsx|sql|py)$/;

// Files allowed to read the import record directly, or to name the retired value.
const ALLOW = new Set([
  "apps/web/scripts/graph/checkPostMergeParity.ts",
  "apps/web/scripts/graph/mergeStagingPosts.ts",
  "apps/web/scripts/graph/applyPostMergeSchema.ts",
  "apps/web/scripts/graph/applyPostMergeViewsW1.ts",
  "apps/web/scripts/graph/applyPostMergeViewsW2.ts",
  "apps/web/scripts/graph/applyPostMergeLockdown.ts", // probes that staging rejects writes
  "apps/web/scripts/graph/postMergeInvariants.test.ts",
  "apps/web/scripts/graph/reportCorpusInventory.ts", // import-record reconciliation (marked)
  "pipeline/schema.sql", // history: earlier definitions are superseded by the POST-TABLE MERGE block
]);
const READS_STAGING = /\b(from|join)\s+staging\.instagram_posts\b/i;
const JEREMY_EVIDENCE_FILTER = /source\s*=\s*'jeremy_evidence'/i;

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
}

describe("post-merge lint (no DB)", () => {
  const files: string[] = [];
  for (const r of ROOTS) walk(join(REPO, r), files);

  it("finds the source tree", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("no code reads staging.instagram_posts outside the allowlist or a POST_MERGE_SUPERSEDED script", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(REPO, f);
      if (ALLOW.has(rel)) continue;
      const text = readFileSync(f, "utf8");
      if (text.includes("POST_MERGE_SUPERSEDED")) continue;
      text.split("\n").forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "").replace(/--.*$/, "");
        if (/^\s*(\*|\/\*|#)/.test(line)) return; // comment lines
        if (READS_STAGING.test(code)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("no SQL filters on the retired posts.source value 'jeremy_evidence'", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(REPO, f);
      if (ALLOW.has(rel)) continue;
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (/^\s*(\*|\/\*|\/\/|--|#)/.test(line)) return;
        if (JEREMY_EVIDENCE_FILTER.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe("post-merge invariants (DB)", () => {
  const pool = getPool();
  afterAll(async () => {
    await closePool();
  });

  it("posts: count = distinct shortcode = distinct url; v_ig_posts is one row per post", async () => {
    const { rows } = await pool.query(
      `select (select count(*) from posts)::int n, (select count(distinct shortcode) from posts)::int sc,
              (select count(distinct url) from posts)::int url,
              (select count(*) from v_ig_posts)::int vig, (select count(distinct post_url) from v_ig_posts)::int vig_d`
    );
    const r = rows[0];
    expect(r.sc).toBe(r.n);
    expect(r.url).toBe(r.n);
    expect(r.vig).toBe(r.n);
    expect(r.vig_d).toBe(r.n);
  }, 120000);

  it("every post has at least one sighting and exactly one is_first", async () => {
    const { rows } = await pool.query(
      `with o as (select post_id, count(*) filter (where is_first) nf from ops.post_observations group by 1)
       select (select count(*) from posts p where not exists (select 1 from o where o.post_id = p.id))::int unobserved,
              (select count(*) from o where nf <> 1)::int bad_first`
    );
    expect(rows[0]).toEqual({ unobserved: 0, bad_first: 0 });
  }, 120000);

  it("no posts row carries the retired source 'jeremy_evidence'; every origin is set", async () => {
    const { rows } = await pool.query(
      `select count(*) filter (where source = 'jeremy_' || 'evidence')::int je, count(*) filter (where origin is null)::int no_origin from posts`
    );
    expect(rows[0]).toEqual({ je: 0, no_origin: 0 });
  }, 120000);

  it("staging import record reconciles: every staging row is a linked post or a logged exclusion", async () => {
    const { rows } = await pool.query(
      `select (select count(*) from staging.instagram_posts)::int staging,
              (select count(*) from posts where staging_post_id is not null)::int linked,
              (select count(*) from ops.post_merge_exclusions)::int excluded`
    );
    expect(rows[0].linked + rows[0].excluded).toBe(rows[0].staging);
  }, 120000);

  it("no database view or function body depends on staging.instagram_posts", async () => {
    const { rows } = await pool.query(
      `select coalesce(string_agg(distinct c.relname, ', '), '') s from pg_depend d
       join pg_rewrite r on r.oid = d.objid join pg_class c on c.oid = r.ev_class
       where d.refobjid = 'staging.instagram_posts'::regclass`
    );
    expect(rows[0].s).toBe("");
    // Function bodies keep their comments (the batch function's history notes mention staging), so
    // only non-comment lines count.
    const { rows: fn } = await pool.query(
      `select p.proname, l from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
              regexp_split_to_table(p.prosrc, E'\\n') l
       where n.nspname = 'public' and l ilike '%staging.instagram_posts%' and l !~ '^\\s*--'`
    );
    expect(fn).toEqual([]);
  }, 120000);

  it("core evidence tables reference only posts that exist (or a logged exclusion)", async () => {
    for (const [t, col] of [
      ["stack_extraction_runs", "post_url"],
      ["post_extraction_runs", "post_url"],
      ["post_venue_verdicts", "post_url"],
      ["human_post_labels", "post_url"],
      ["jeremy_wedding_candidate_posts", "source_post_url"],
    ]) {
      const { rows } = await pool.query(
        `select count(*)::int n from ${t} x where not exists (select 1 from posts p where p.url = x.${col})
           and not exists (select 1 from ops.post_merge_exclusions e where e.post_url = x.${col})`
      );
      expect({ table: t, orphans: rows[0].n }).toEqual({ table: t, orphans: 0 });
    }
  }, 120000);

  it("P5 lock-down holds: evidence FKs to posts(url) exist (validated except the named human_post_labels one); staging rejects writes", async () => {
    const { rows } = await pool.query(
      `select conname, convalidated from pg_constraint where conname in
         ('stack_extraction_runs_post_url_fkey','post_extraction_runs_post_url_fkey','post_venue_verdicts_post_url_fkey',
          'jeremy_wedding_candidate_posts_source_post_url_fkey','human_post_labels_post_url_fkey') order by 1`
    );
    expect(rows).toEqual([
      { conname: "human_post_labels_post_url_fkey", convalidated: false },
      { conname: "jeremy_wedding_candidate_posts_source_post_url_fkey", convalidated: true },
      { conname: "post_extraction_runs_post_url_fkey", convalidated: true },
      { conname: "post_venue_verdicts_post_url_fkey", convalidated: true },
      { conname: "stack_extraction_runs_post_url_fkey", convalidated: true },
    ]);
    const { rows: trg } = await pool.query(
      `select tgname from pg_trigger where tgrelid = 'staging.instagram_posts'::regclass and not tgisinternal order by 1`
    );
    expect(trg.map((t) => t.tgname)).toEqual(["instagram_posts_read_only", "instagram_posts_read_only_truncate"]);
  }, 120000);

  it("P6: post_truth has one row per post; regression set v1 is frozen and its sha reproduces", async () => {
    const { rows } = await pool.query(
      `select (select count(*) from post_truth)::int t, (select count(*) from posts)::int p,
              v.members, v.sha256,
              encode(sha256(convert_to((select string_agg(post_url || '|' || label, E'\\n' order by post_url)
                                         from eval_set_members e where e.eval_set_id = v.id), 'UTF8')), 'hex') recomputed
       from eval_set_versions v where v.name = 'post-truth-regression-v1'`
    );
    expect(rows[0].t).toBe(rows[0].p);
    expect(rows[0].members).toBe(4316);
    expect(rows[0].sha256).toBe("83879f9f12759e64978feaa1d12f2c4876b58061e077a0a7717a4be156566276");
    expect(rows[0].recomputed).toBe(rows[0].sha256);
  }, 120000);

  it("pipeline/schema.sql's POST-TABLE MERGE block equals the live definitions", async () => {
    const schema = readFileSync(join(REPO, "pipeline/schema.sql"), "utf8");
    const start = schema.indexOf("-- POST-TABLE MERGE (P3 + P4 W1/W2");
    expect(start).toBeGreaterThan(0);
    const end = schema.indexOf("-- END POST-TABLE MERGE VIEWS", start);
    expect(end).toBeGreaterThan(start);
    const block = schema.slice(start, end);
    const norm = (s: string) => s.replace(/\s+/g, " ").replace(/;\s*$/, "").trim();
    const chunks = block.split(/\n(?=create or replace view |CREATE OR REPLACE FUNCTION )/);
    let checked = 0;
    for (const ch of chunks) {
      const v = ch.match(/^create or replace view (\w+) as\n([\s\S]*)$/);
      const f = ch.match(/^CREATE OR REPLACE FUNCTION public\.(\w+)\(/);
      if (v) {
        const body = v[2].split(/\n(?=comment on )/)[0];
        const { rows } = await pool.query(`select pg_get_viewdef($1::regclass, true) d`, [v[1]]);
        expect({ view: v[1], same: norm(body) === norm(rows[0].d) }).toEqual({ view: v[1], same: true });
        checked++;
      } else if (f) {
        const { rows } = await pool.query(`select pg_get_functiondef($1::regproc) d`, [f[1]]);
        expect({ fn: f[1], same: norm(ch) === norm(rows[0].d) }).toEqual({ fn: f[1], same: true });
        checked++;
      }
    }
    expect(checked).toBe(11); // v_jeremy_beta_posts, v_ig_posts, 7 Jeremy-slice views, structural view + function
  }, 120000);
});
