/**
 * POST-MERGE PARITY ORACLE (post-table merge, plan rev 3, 2026-09-22) -- the gate every tick of the
 * `staging.instagram_posts` -> `public.posts` merge runs against.
 *
 * Two kinds of check, never mixed:
 *   FROZEN OUTPUTS  -- derived views and graph tables whose rows must come out identical to the P0
 *                      baseline, or differ only by a cause named in the P2 gate packet. Compared as
 *                      multisets of full row text, so a diff prints the actual rows that moved.
 *   POST-CONDITIONS -- absolute facts about the merged table (count = distinct shortcode = distinct
 *                      url, every evidence url resolves, exactly one is_first, ...). Measured, not
 *                      diffed: several are false TODAY (is_first is broken on ~1.3k posts), so a diff
 *                      against today would be meaningless. `--post` asserts them; without it they
 *                      are only reported.
 *
 * The funnel SQL below is a deliberate COPY of reportCorpusInventory.ts's (as of 2026-09-22), so the
 * planned rewrite of that report cannot move this gate.
 *
 * THE BASELINE IS WRITTEN ONCE. `--write-baseline` refuses if any pm-baseline directory exists; a
 * diff is resolved by naming its cause, never by re-baselining. Rows live in the gitignored
 * snapshots/ directory; the summary (counts + sha256 per output) is also written to tmp_analysis/
 * so it survives in git.
 *
 * Read-only: one `begin read only` transaction.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/checkPostMergeParity.ts --write-baseline
 *   bun run scripts/graph/checkPostMergeParity.ts --baseline scripts/graph/snapshots/<pm-baseline-dir>
 *   bun run scripts/graph/checkPostMergeParity.ts --baseline <dir> --post     # after P3: assert post-conditions
 *   ... --show 20   # max rows printed per diff side (default 10)
 *   ... --write-baseline --dry   # measure everything, write nothing (smoke test before the one real write)
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import { getPool, closePool } from "../classify/db";

const SNAP_ROOT = new URL("./snapshots/", import.meta.url).pathname;
const TMP_ROOT = new URL("./tmp_analysis/", import.meta.url).pathname;

// Two batches with real structural rows, used to pin structural_post_vendor_evidence_for_batch.
const PINNED_BATCHES = ["acq-20260919-probesA", "acq-20260920-probe6"];

/** Frozen outputs: each query returns one text column `r`, the full row. */
export const FROZEN: { name: string; sql: string }[] = [
  { name: "structural_post_vendor_evidence", sql: `select t::text r from structural_post_vendor_evidence t` },
  ...PINNED_BATCHES.map((b) => ({
    name: `structural_for_batch:${b}`,
    sql: `select t::text r from structural_post_vendor_evidence_for_batch('${b}') t`,
  })),
  { name: "v1_content_corpus", sql: `select t::text r from v1_content_corpus t` },
  { name: "venue_portfolio_content", sql: `select t::text r from venue_portfolio_content t` },
  { name: "post_styled_shoot_signal", sql: `select t::text r from post_styled_shoot_signal t` },
  { name: "human_confirmed_chicago_wedding_content", sql: `select t::text r from human_confirmed_chicago_wedding_content t` },
  { name: "human_confirmed_post_geography", sql: `select t::text r from human_confirmed_post_geography t` },
  { name: "human_confirmed_post_vendor_association", sql: `select t::text r from human_confirmed_post_vendor_association t` },
  { name: "human_confirmed_post_vendor_evidence", sql: `select t::text r from human_confirmed_post_vendor_evidence t` },
  { name: "human_confirmed_vendor_page_content", sql: `select t::text r from human_confirmed_vendor_page_content t` },
  { name: "venue_couple_signal_post_vendor_evidence", sql: `select t::text r from venue_couple_signal_post_vendor_evidence t` },
  { name: "venue_inline_mention_post_vendor_evidence", sql: `select t::text r from venue_inline_mention_post_vendor_evidence t` },
  {
    name: "funnel",
    sql: `with allp as materialized (select distinct post_url from v_ig_posts),
        parsed as materialized (select distinct post_url from stack_extraction_runs),
        clustered as materialized (select distinct source_post_url u from jeremy_wedding_candidate_posts),
        readp as materialized (select distinct post_url from post_venue_verdicts_current),
        inwed as materialized (select distinct p.url from wedding_posts wp join posts p on p.id = wp.post_id)
       select json_build_object(
              'total', count(*),
              'parsed', count(*) filter (where pa.post_url is not null),
              'clustered', count(*) filter (where cl.u is not null),
              'read_by_reader', count(*) filter (where r.post_url is not null),
              'in_a_wedding', count(*) filter (where iw.url is not null))::text r
       from allp a
       left join parsed pa on pa.post_url = a.post_url
       left join clustered cl on cl.u = a.post_url
       left join readp r on r.post_url = a.post_url
       left join inwed iw on iw.url = a.post_url`,
  },
  { name: "weddings.id", sql: `select id::text r from weddings` },
  { name: "wedding_posts", sql: `select t::text r from wedding_posts t` },
  { name: "wedding_vendors", sql: `select t::text r from wedding_vendors t` },
  { name: "edges", sql: `select t::text r from edges t` },
];

/** Sets captured at baseline and used by post-conditions (not diffed as frozen outputs). */
export const CAPTURED: { name: string; sql: string }[] = [
  // The corpus url set. Post-condition: baseline minus current == exactly the 10 profile urls.
  { name: "corpus_urls", sql: `select distinct post_url r from v_ig_posts` },
  // Ben's legacy bulk load: public, not in staging, never observed. Must never enter the
  // structural universe as a side effect of the merge.
  {
    name: "legacy_unobserved_urls",
    sql: `select p.url r from posts p
          where p.source in ('venue_tagged','own_profile')
            and not exists (select 1 from staging.instagram_posts sp where sp.post_url = p.url)
            and not exists (select 1 from ops.post_observations o where o.post_id = p.id)`,
  },
  // Staging rows that are not posts (profile urls).
  {
    name: "profile_urls",
    sql: `select post_url r from staging.instagram_posts where post_url !~ '^https://www\\.instagram\\.com/p/[^/]+/$'`,
  },
];

/** Every table that references a post by url text. [table, column] */
const EVIDENCE_URL_COLUMNS: [string, string][] = [
  ["stack_extraction_runs", "post_url"],
  ["stack_extraction_entries", "post_url"],
  ["stack_extraction_runs_v2", "post_url"],
  ["stack_extraction_entries_v2", "post_url"],
  ["post_classification_runs", "post_url"],
  ["post_extraction_runs", "post_url"],
  ["post_venue_verdicts", "post_url"],
  ["human_post_labels", "post_url"],
  ["extracted_venue_anchors", "post_url"],
  ["jeremy_wedding_candidate_posts", "source_post_url"],
  ["candidate_scores", "post_url"],
  ["golden_set", "post_url"],
  ["vendor_extraction_golden_set", "post_url"],
  ["label_queue", "post_url"],
  ["non_wedding_posts_retired", "post_url"],
];

export function sha(lines: string[]): string {
  const h = createHash("sha256");
  for (const l of lines) h.update(l + "\n");
  return h.digest("hex");
}

export async function fetchLines(c: PoolClient, sql: string): Promise<string[]> {
  const { rows } = await c.query<{ r: string | null }>(sql);
  return rows.map((x) => x.r ?? "\\N").sort();
}

export function multisetDiff(a: string[], b: string[]): { onlyA: string[]; onlyB: string[] } {
  const m = new Map<string, number>();
  for (const x of a) m.set(x, (m.get(x) ?? 0) + 1);
  const onlyB: string[] = [];
  for (const x of b) {
    const n = m.get(x) ?? 0;
    if (n > 0) m.set(x, n - 1);
    else onlyB.push(x);
  }
  const onlyA: string[] = [];
  for (const [x, n] of m) for (let i = 0; i < n; i++) onlyA.push(x);
  return { onlyA, onlyB };
}

export async function measurePostConditions(c: PoolClient, post: boolean) {
  const out: Record<string, unknown> = {};
  const { rows: k } = await c.query(
    `select count(*)::int n, count(distinct shortcode)::int sc, count(distinct url)::int url from posts`
  );
  out.posts_count_eq_distinct = k[0];

  // Orphans. Before the merge an orphan is a url missing from BOTH posts and staging; after, from posts.
  // After the merge a url is accounted for if it is a post, or one of the staging rows the merge
  // deliberately excluded as not-a-post (ops.post_merge_exclusions, each with its reason).
  const universe = post
    ? `select url u from posts union select post_url from ops.post_merge_exclusions`
    : `select url u from posts union select post_url from staging.instagram_posts`;
  const orphans: Record<string, number> = {};
  for (const [t, col] of EVIDENCE_URL_COLUMNS) {
    const { rows } = await c.query(
      `with u as materialized (${universe})
       select count(distinct x.${col})::int n from ${t} x where x.${col} is not null
         and not exists (select 1 from u where u.u = x.${col})`
    );
    orphans[t] = rows[0].n;
  }
  out.evidence_orphan_urls = orphans;

  const { rows: f } = await c.query(
    `with o as (select post_id, count(*) filter (where is_first) nf from ops.post_observations group by 1)
     select (select count(*) from posts p where not exists (select 1 from o where o.post_id = p.id))::int unobserved,
            (select count(*) from o where nf = 0)::int zero_is_first,
            (select count(*) from o where nf > 1)::int multi_is_first`
  );
  out.observations = f[0];
  return out;
}

export function checkPost(pc: Record<string, any>, captured: Record<string, string[]>, current: Record<string, string[]>): string[] {
  const fails: string[] = [];
  const k = pc.posts_count_eq_distinct;
  if (!(k.n === k.sc && k.n === k.url)) fails.push(`posts count/distinct mismatch ${JSON.stringify(k)}`);
  for (const [t, n] of Object.entries(pc.evidence_orphan_urls as Record<string, number>))
    if (n !== 0) fails.push(`${t}: ${n} evidence urls not in posts`);
  const o = pc.observations;
  if (o.unobserved || o.zero_is_first || o.multi_is_first) fails.push(`observations ${JSON.stringify(o)}`);
  // Corpus url set: exactly the profile urls may leave; nothing may arrive under the writer lock.
  const { onlyA, onlyB } = multisetDiff(captured.corpus_urls, current.corpus_urls);
  const prof = new Set(captured.profile_urls);
  const unexpectedGone = onlyA.filter((u) => !prof.has(u));
  if (unexpectedGone.length) fails.push(`${unexpectedGone.length} corpus urls vanished that are not profile urls`);
  if (onlyA.length - unexpectedGone.length !== prof.size) fails.push(`expected all ${prof.size} profile urls gone`);
  if (onlyB.length) fails.push(`${onlyB.length} corpus urls appeared (writer lock?)`);
  return fails;
}

// The baseline files are newline-joined row text, and some rows (captions) contain newlines -- a
// format slip in the one-time baseline write. The baseline is never rewritten, so the reader
// repairs it: regroup continuation lines into the row that starts with "(https://www.instagram",
// then PROVE the regrouping against the row count and sha256 recorded in summary.json at write
// time. Any mismatch throws rather than comparing against a guess.
export function baselineLoader(baselineDir: string): (name: string) => string[] {
  const summary = JSON.parse(readFileSync(`${baselineDir}/summary.json`, "utf8")) as {
    outputs: Record<string, { rows: number; sha256: string }>;
  };
  return (name: string): string[] => {
    const f = `${baselineDir}/${name.replace(/[^a-zA-Z0-9_.-]/g, "_")}.txt.gz`;
    const s = gunzipSync(readFileSync(f)).toString();
    let lines = s === "" ? [] : s.split("\n");
    const want = summary.outputs[name];
    if (want && lines.length !== want.rows) {
      const grouped: string[] = [];
      for (const l of lines) {
        if (grouped.length === 0 || l.startsWith("(https://www.instagram.com/")) grouped.push(l);
        else grouped[grouped.length - 1] += "\n" + l;
      }
      lines = grouped;
    }
    if (want && (lines.length !== want.rows || sha(lines) !== want.sha256)) {
      throw new Error(`baseline ${name}: cannot reproduce ${want.rows} rows / recorded sha256 (got ${lines.length})`);
    }
    return lines;
  };
}

async function main() {
  const args = process.argv.slice(2);
  const writeBaseline = args.includes("--write-baseline");
  const post = args.includes("--post");
  const bi = args.indexOf("--baseline");
  const baselineDir = bi !== -1 ? args[bi + 1] : undefined;
  const si = args.indexOf("--show");
  const show = si !== -1 ? Number(args[si + 1]) : 10;
  if (!writeBaseline && !baselineDir) {
    console.error("need --write-baseline or --baseline <dir>");
    process.exit(2);
  }

  if (writeBaseline) {
    const existing = existsSync(SNAP_ROOT) ? readdirSync(SNAP_ROOT).filter((d) => d.includes("pm-baseline")) : [];
    if (existing.length) {
      console.error(`REFUSING: a post-merge baseline already exists (${existing.join(", ")}). Never re-baseline; name the cause of the diff instead.`);
      process.exit(2);
    }
  }

  const pool = getPool();
  const c = await pool.connect();
  const started = Date.now();
  try {
    await c.query("begin read only");
    await c.query("set local statement_timeout = '1800s'");

    const current: Record<string, string[]> = {};
    for (const q of [...FROZEN, ...CAPTURED]) {
      const t0 = Date.now();
      current[q.name] = await fetchLines(c, q.sql);
      console.log(`[parity] ${q.name}: ${current[q.name].length} rows (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
    const pc = await measurePostConditions(c, post);
    await c.query("commit");

    if (args.includes("--dry")) {
      console.log(JSON.stringify(pc, null, 2));
      return;
    }
    if (writeBaseline) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const dir = `${SNAP_ROOT}${ts}-pm-baseline`;
      mkdirSync(dir, { recursive: true });
      const summary: Record<string, unknown> = { written_at: new Date().toISOString(), outputs: {}, post_conditions_at_baseline: pc };
      for (const [name, lines] of Object.entries(current)) {
        writeFileSync(`${dir}/${name.replace(/[^a-zA-Z0-9_.-]/g, "_")}.txt.gz`, gzipSync(lines.join("\n")));
        (summary.outputs as Record<string, unknown>)[name] = { rows: lines.length, sha256: sha(lines) };
      }
      writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 2));
      writeFileSync(`${TMP_ROOT}pm_baseline_${ts}.json`, JSON.stringify({ rows_dir: `scripts/graph/snapshots/${ts}-pm-baseline`, ...summary }, null, 2));
      console.log(`\n[parity] BASELINE written: ${dir}\n[parity] summary: tmp_analysis/pm_baseline_${ts}.json`);
      console.log(JSON.stringify(pc, null, 2));
      return;
    }

    const load = baselineLoader(baselineDir!);
    let frozenDiffs = 0;
    console.log("\n=== FROZEN OUTPUTS (must match baseline, or differ only by a named cause) ===");
    for (const q of FROZEN) {
      const base = load(q.name);
      const { onlyA, onlyB } = multisetDiff(base, current[q.name]);
      if (!onlyA.length && !onlyB.length) {
        console.log(`  OK   ${q.name} (${base.length})`);
        continue;
      }
      frozenDiffs++;
      console.log(`  DIFF ${q.name}: baseline ${base.length} -> now ${current[q.name].length}; -${onlyA.length} +${onlyB.length}`);
      for (const x of onlyA.slice(0, show)) console.log(`      - ${x.slice(0, 300)}`);
      for (const x of onlyB.slice(0, show)) console.log(`      + ${x.slice(0, 300)}`);
    }

    console.log("\n=== POST-CONDITIONS " + (post ? "(ASSERTED)" : "(reported only; --post asserts)") + " ===");
    console.log(JSON.stringify(pc, null, 2));
    const captured: Record<string, string[]> = {};
    for (const q of CAPTURED) captured[q.name] = load(q.name);
    // Legacy leak guard holds in every phase.
    const legacy = new Set(captured.legacy_unobserved_urls);
    const leaked = current["structural_post_vendor_evidence"].filter((r) => {
      const m = r.match(/^\((https:[^,]+),/);
      return m ? legacy.has(m[1]) : false;
    });
    const leakFail = leaked.length ? [`STRUCTURAL LEAK: ${leaked.length} structural rows from the ${legacy.size} legacy-unobserved posts`] : [];
    const postFails = post ? checkPost(pc, captured, current) : [];
    const fails = [...leakFail, ...postFails];
    for (const f of fails) console.log(`  FAIL ${f}`);

    console.log(`\n[parity] frozen outputs with diffs: ${frozenDiffs}; post-condition failures: ${fails.length}; ${((Date.now() - started) / 1000).toFixed(0)}s`);
    if (frozenDiffs || fails.length) process.exitCode = 1;
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
