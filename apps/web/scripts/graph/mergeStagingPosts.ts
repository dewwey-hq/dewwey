/**
 * POST-TABLE MERGE, phases P2 (dry-run + gate packet) and P3 (apply) -- plan rev 3, 2026-09-22.
 * Folds every real post in `staging.instagram_posts` into `public.posts`, in ONE transaction that
 * checks the frozen outputs and post-conditions of checkPostMergeParity.ts before it may COMMIT.
 *
 * Ops, in order (one op list drives both the packet and the writes):
 *   1. exclusions   the staging rows that are not posts (profile urls) -> ops.post_merge_exclusions
 *   2. twins        mint candidates whose handle equals an existing account up to '.'/'_' -- NEVER
 *                   auto-minted. owner_id goes to the existing account unless --twin-decisions says
 *                   mint. --apply refuses unless every twin has an explicit decision.
 *   3. mint         bare accounts for the remaining owner handles we do not hold
 *   4. insert       staging-only posts -> posts (origin jeremy_beta, raw = the full staging row,
 *                   raw_format jeremy_staging_v1, source own_profile when the owner is the scraped
 *                   vendor, else unknown; scraped_at = Jeremy's own scrape clock)
 *   5. relabel      the `jeremy_evidence` copies: source -> own_profile|unknown, raw -> full staging
 *                   row. Before-state logged (the old 5-field raw included).
 *   6. link         crawled posts also in staging: staging_post_id + staging_raw. Typed columns kept.
 *   7. sightings    one observation per staging-linked post under run legacy-jeremy-beta-import
 *                   (observed_at = staging scraped_at), and one per Ben post not already registered
 *                   by run 31 under legacy-ben-pipeline (observed_at = scraped_at, the LOAD clock).
 *   8. is_first     posts with no is_first get it on their earliest sighting (tie: run_id). A post
 *                   that already has one keeps it -- is_first records the sighting under which the
 *                   row entered our records, and moving it would rewrite acquisition history (and
 *                   the batch function's output). Posts the loop counted as new although they were
 *                   already in staging are REPORTED, not rewritten.
 *   9. views        v_ig_posts becomes one source (posts), same columns and same values: staging-
 *                   linked rows read the staging row (`corpus_source` stays 'staging'|'public',
 *                   post_id stays null on staging rows -- readers change with those values in P4).
 *                   The structural view/function universe gate becomes "observed by a run that is
 *                   not a legacy-import channel", which keeps the 3,610 legacy posts out.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/mergeStagingPosts.ts --batch-id pm-20260923-merge-1                 # dry-run: packet, ROLLBACK
 *   bun run scripts/graph/mergeStagingPosts.ts --batch-id <id> --twin-decisions <file.json> --apply
 * --twin-decisions: {"<twin handle>": "existing" | "mint", ...} for every twin the packet lists.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import type { PoolClient } from "pg";
import { getPool, closePool } from "../classify/db";
import {
  CAPTURED,
  FROZEN,
  baselineLoader,
  checkPost,
  fetchLines,
  measurePostConditions,
  multisetDiff,
} from "./checkPostMergeParity";

const BASELINE = new URL("./snapshots/2026-09-22T22-43-25-093Z-pm-baseline", import.meta.url).pathname;
const TMP = new URL("./tmp_analysis/", import.meta.url).pathname;
const SHORTCODE = `(regexp_match(sp.post_url, '/p/([^/]+)'))[1]`;
const norm = (h: string) => h.toLowerCase().replace(/[._]/g, "");

type Packet = string[];

async function q<T = any>(c: PoolClient, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await c.query(sql, params)).rows as T[];
}
async function one<T = any>(c: PoolClient, sql: string, params: unknown[] = []): Promise<T> {
  return (await q<T>(c, sql, params))[0];
}

function freshSnapshot(): boolean {
  const root = new URL("./snapshots/", import.meta.url).pathname;
  return readdirSync(root)
    .filter((d) => !d.includes("pm-baseline"))
    .some((d) => Date.now() - statSync(`${root}${d}`).mtimeMs < 24 * 3600 * 1000);
}

/** Patch the live structural view / batch function universe gate. Throws if the text is not found. */
function patchGate(def: string, kind: "view" | "function"): string {
  const re =
    kind === "view"
      ? /\(EXISTS \( SELECT 1\s+FROM post_observations o\s+WHERE o\.post_id = v\.post_id\)\) AND NOT \(EXISTS \( SELECT 1\s+FROM staging\.instagram_posts s2\s+WHERE \(regexp_match\(s2\.post_url, '\/p\/\(\[\^\/\]\+\)'::text\)\)\[1\] = v\.shortcode\)\)/
      : /and exists \(select 1 from ops\.post_observations o where o\.post_id = v\.post_id\)\s+and not exists \(select 1 from staging\.instagram_posts s2\s+where \(regexp_match\(s2\.post_url, '\/p\/\(\[\^\/\]\+\)'\)\)\[1\] = v\.shortcode\)/;
  if (!re.test(def)) throw new Error(`structural ${kind}: universe gate text not found -- refusing to guess`);
  const gate =
    "(EXISTS ( SELECT 1 FROM ops.post_observations o JOIN ops.crawl_runs r ON r.id = o.run_id " +
    "WHERE o.post_id = v.post_id AND r.actor <> 'legacy-import'))";
  let out = def.replace(re, kind === "view" ? gate : `and ${gate}`);
  // Deterministic venue pick (tick 5 finding): credit_line_venue's DISTINCT ON had no tie-break,
  // so two venue handles on one credit line (@sunsetmonalisa + @sunsetmonalisaromance) were picked
  // by plan order -- the pre-merge view and batch function already disagreed on DcWbbHFmyph. Lowest
  // account id wins; every such row already carries venue_anchor_conflict = true.
  const tie =
    kind === "view"
      ? /(END\), credit_line_accounts\.line_no)(\s*\), credit_line_conflict AS)/
      : /(end,\s*line_no asc)(\s*\),\s*credit_line_conflict as)/;
  if (!tie.test(out)) throw new Error(`structural ${kind}: credit_line_venue ORDER BY not found -- refusing to guess`);
  out = out.replace(tie, kind === "view" ? "$1, credit_line_accounts.account_id$2" : "$1, account_id$2");
  return out;
}

// Two UNION ALL branches on a REAL column (staging_post_id null / not null), each emitting a
// constant corpus_source -- the same shape as the pre-merge union. A filter on corpus_source then
// prunes a whole branch by constant folding, and each branch's row estimate comes from table
// statistics. (Tick 5: one branch with corpus_source as a CASE expression gave the planner no
// statistics, and the structural view ran > 19 min vs ~50 s -- the D061 bad-plan trap.)
const V_IG_POSTS = `create or replace view v_ig_posts as
 select p.url as post_url,
        p.shortcode,
        s.j->>'caption_raw' as caption_raw,
        (s.j->>'post_timestamp')::timestamp::timestamptz as post_timestamp,
        (s.j->>'location_tag')::varchar as location_tag,
        lower(s.j->>'owner_username') as owner_username,
        s.j->'mentions' as mentions,
        s.j->'hashtags' as hashtags,
        (s.j->>'post_type')::varchar as post_type,
        s.j->>'image_url' as image_url,
        (s.j->>'likes_count')::int as likes_count,
        (s.j->>'vendor_id')::int as vendor_id,
        (s.j->>'scraped_at')::timestamp::timestamptz as scraped_at,
        null::bigint as post_id,
        'staging'::text as corpus_source
   from posts p
   cross join lateral (select case when p.raw_format = 'jeremy_staging_v1' then p.raw else p.staging_raw end as j) s
  where p.staging_post_id is not null
 union all
 select p.url, p.shortcode, p.caption, p.posted_at,
        (p.raw->>'locationName')::varchar, lower(a.username::text),
        coalesce(p.raw->'mentions', '[]'::jsonb), coalesce(p.raw->'hashtags', '[]'::jsonb),
        (p.raw->>'type')::varchar, p.raw->>'displayUrl', p.likes_count, null::integer,
        p.scraped_at, p.id, 'public'::text
   from posts p
   join accounts a on a.id = p.owner_id
  where p.staging_post_id is null`;
const V_IG_POSTS_COMMENT = `comment on view v_ig_posts is 'DERIVED (post-table merge P3, 2026-09-23): one row per post, single source public.posts. Staging-linked rows (corpus_source=staging) read the verbatim staging row (raw when raw_format=jeremy_staging_v1, else staging_raw), so values match the pre-merge union exactly; post_id is null on them until the P4 reader cutover. staging.instagram_posts is no longer read.'`;

async function main() {
  const args = process.argv.slice(2);
  const bi = args.indexOf("--batch-id");
  const batchId = bi !== -1 ? args[bi + 1] : "";
  if (!/^pm-\d{8}-merge-\d+$/.test(batchId)) {
    console.error("need --batch-id pm-YYYYMMDD-merge-<n>");
    process.exit(2);
  }
  const apply = args.includes("--apply");
  const ti = args.indexOf("--twin-decisions");
  const twinDecisions: Record<string, "existing" | "mint"> =
    ti !== -1 ? JSON.parse(readFileSync(args[ti + 1], "utf8")) : {};
  if (apply && !freshSnapshot()) {
    console.error("REFUSING --apply: no snapshot < 24h (snapshotGraphTables.ts --label <x>)");
    process.exit(1);
  }

  const P: Packet = [];
  const say = (s = "") => {
    P.push(s);
    console.log(s);
  };
  const t0 = Date.now();
  const lap = (what: string) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(0)}s] ${what}`);

  const pool = getPool();
  const c = await pool.connect();
  let committed = false;
  try {
    await c.query("begin");
    await c.query("set local statement_timeout = '3600s'");
    await c.query("set local timezone = 'UTC'");

    const runs = await q<{ id: number; batch_id: string }>(
      c,
      `select id, batch_id from ops.crawl_runs where batch_id in ('legacy-ben-pipeline','legacy-jeremy-beta-import')`
    );
    const RUN_BEN = runs.find((r) => r.batch_id === "legacy-ben-pipeline")!.id;
    const RUN_JB = runs.find((r) => r.batch_id === "legacy-jeremy-beta-import")!.id;
    const already = await one<{ n: number }>(c, `select count(*)::int n from ops.post_merge_log where batch_id = $1`, [batchId]);
    if (already.n > 0) throw new Error(`batch ${batchId} already has ${already.n} merge-log rows -- use a new batch id`);

    // ---- working set: every staging row with its shortcode, owner and scraped vendor
    await c.query(`create temp table stg on commit drop as
      select sp.id as staging_post_id, sp.post_url, ${SHORTCODE} as shortcode,
             lower(sp.owner_username) as owner, lower(trim(leading '@' from v.instagram_handle)) as vendor_handle,
             sp.caption_raw, sp.post_timestamp, sp.likes_count, sp.scraped_at, to_jsonb(sp) as j
      from staging.instagram_posts sp left join staging.vendors v on v.id = sp.vendor_id`);
    await c.query(`create index on stg (shortcode)`);
    await c.query(`analyze stg`);
    lap("working set");

    // ---- 1. exclusions
    const excl = await q(c, `insert into ops.post_merge_exclusions (staging_post_id, post_url, reason, batch_id)
      select staging_post_id, post_url, 'not a post: profile url (no /p/<shortcode>/)', $1 from stg where shortcode is null
      returning staging_post_id, post_url`, [batchId]);

    // ---- 2 + 3. owners: twins and mints
    const missing = await q<{ owner: string; n: number }>(c, `select s.owner, count(*)::int n from stg s
      where s.shortcode is not null
        and not exists (select 1 from posts p where p.shortcode = s.shortcode)
        and not exists (select 1 from accounts a where a.username = s.owner)
      group by 1 order by 1`);
    const existingNorm = new Map<string, string>();
    for (const r of await q<{ u: string }>(c, `select username::text u from accounts`)) existingNorm.set(norm(r.u), r.u);
    const twins = missing.filter((m) => existingNorm.has(norm(m.owner)) && existingNorm.get(norm(m.owner)) !== m.owner);
    const twinSet = new Set(twins.map((t) => t.owner));
    const undecided = twins.filter((t) => !twinDecisions[t.owner]);
    if (apply && undecided.length) throw new Error(`--apply needs a decision for every twin; missing: ${undecided.map((t) => t.owner).join(", ")}`);
    const toMint = missing.filter((m) => !twinSet.has(m.owner) || twinDecisions[m.owner] === "mint").map((m) => m.owner);
    const minted = await q<{ id: number; username: string }>(c,
      `insert into accounts (username) select unnest($1::text[]) returning id, username::text`, [toMint]);
    await c.query(`insert into ops.post_merge_log (batch_id, action, after)
      select $1, 'mint_account', jsonb_build_object('account_id', m.id, 'username', m.u)
      from unnest($2::bigint[], $3::text[]) m(id, u)`, [batchId, minted.map((m) => m.id), minted.map((m) => m.username)]);
    // owner map: twins default to the existing account unless decided "mint"
    await c.query(`create temp table owner_map (owner text primary key, account_id bigint not null) on commit drop`);
    await c.query(`insert into owner_map select distinct s.owner, a.id from stg s join accounts a on a.username = s.owner where s.shortcode is not null`);
    for (const t of twins) {
      if (twinDecisions[t.owner] === "mint") continue;
      await c.query(`insert into owner_map select $1, id from accounts where username = $2`, [t.owner, existingNorm.get(norm(t.owner))]);
    }
    lap(`owners: ${minted.length} minted, ${twins.length} twins`);

    // ---- 4. insert staging-only posts
    const inserted = await q<{ id: number }>(c, `insert into posts
        (shortcode, url, owner_id, caption, posted_at, likes_count, seed_username, scraped_at, source, raw,
         origin, raw_format, staging_post_id, merge_batch_id)
      select s.shortcode, s.post_url, om.account_id, s.caption_raw, s.post_timestamp::timestamptz, s.likes_count,
             s.vendor_handle, s.scraped_at::timestamptz,
             case when s.owner = s.vendor_handle then 'own_profile' else 'unknown' end,
             s.j, 'jeremy_beta', 'jeremy_staging_v1', s.staging_post_id, $1
      from stg s join owner_map om on om.owner = s.owner
      where s.shortcode is not null and not exists (select 1 from posts p where p.shortcode = s.shortcode)
      returning id`, [batchId]);
    await c.query(`insert into ops.post_merge_log (batch_id, post_id, staging_post_id, action, after)
      select $1, p.id, p.staging_post_id, 'insert', jsonb_build_object('source', p.source, 'owner_id', p.owner_id)
      from posts p where p.merge_batch_id = $1`, [batchId]);
    lap(`inserted ${inserted.length}`);

    // ---- 5. relabel the jeremy_evidence copies
    await c.query(`insert into ops.post_merge_log (batch_id, post_id, staging_post_id, action, before, after)
      select $1, p.id, s.staging_post_id, 'relabel',
             jsonb_build_object('source', p.source, 'raw', p.raw, 'raw_format', p.raw_format),
             jsonb_build_object('source', case when s.owner = s.vendor_handle then 'own_profile' else 'unknown' end, 'raw_format', 'jeremy_staging_v1')
      from posts p join stg s on s.shortcode = p.shortcode where p.source = 'jeremy_evidence'`, [batchId]);
    const relabeled = await q(c, `update posts p set
        source = case when s.owner = s.vendor_handle then 'own_profile' else 'unknown' end,
        raw = s.j, raw_format = 'jeremy_staging_v1', staging_post_id = s.staging_post_id, merge_batch_id = $1
      from stg s where s.shortcode = p.shortcode and p.source = 'jeremy_evidence' returning p.id`, [batchId]);
    lap(`relabeled ${relabeled.length}`);

    // ---- 6. link crawled posts that are also in staging
    await c.query(`insert into ops.post_merge_log (batch_id, post_id, staging_post_id, action, before)
      select $1, p.id, s.staging_post_id, 'link', jsonb_build_object('staging_post_id', p.staging_post_id, 'staging_raw', p.staging_raw)
      from posts p join stg s on s.shortcode = p.shortcode where p.staging_post_id is null and p.raw_format = 'apify_v1'`, [batchId]);
    const linked = await q(c, `update posts p set staging_post_id = s.staging_post_id, staging_raw = s.j, merge_batch_id = $1
      from stg s where s.shortcode = p.shortcode and p.staging_post_id is null and p.raw_format = 'apify_v1' returning p.id`, [batchId]);
    const conflicts = await q(c, `select p.shortcode, a.username::text as posts_owner, s.owner as staging_owner,
        length(p.caption) as posts_caption_len, length(s.caption_raw) as staging_caption_len
      from posts p join stg s on s.staging_post_id = p.staging_post_id join accounts a on a.id = p.owner_id
      where p.raw_format = 'apify_v1'
        and (lower(a.username::text) <> s.owner or coalesce(nullif(p.caption, ''), '') <> coalesce(nullif(s.caption_raw, ''), ''))`);
    for (const x of conflicts)
      await c.query(`insert into ops.post_merge_log (batch_id, staging_post_id, action, after)
        select $1, staging_post_id, 'field_conflict', $2::jsonb from posts where shortcode = $3`, [batchId, JSON.stringify(x), x.shortcode]);
    lap(`linked ${linked.length}, conflicts ${conflicts.length}`);

    // ---- 7. sightings
    const obsJ = await one<{ n: number }>(c, `with ins as (
        insert into ops.post_observations (run_id, post_id, seed_account_id, observed_at, is_first, caption_sha256, caption_changed)
        select $1, p.id, va.id, s.scraped_at::timestamptz, false,
               encode(sha256(convert_to(coalesce(s.caption_raw, ''), 'UTF8')), 'hex'),
               coalesce(s.caption_raw, '') <> coalesce(p.caption, '')
        from posts p join stg s on s.staging_post_id = p.staging_post_id
        left join accounts va on va.username = s.vendor_handle
        returning 1) select count(*)::int n from ins`, [RUN_JB]);
    const obsB = await one<{ n: number }>(c, `with ins as (
        insert into ops.post_observations (run_id, post_id, observed_at, is_first, caption_sha256, caption_changed)
        select $1, p.id, p.scraped_at, false, encode(sha256(convert_to(coalesce(p.caption, ''), 'UTF8')), 'hex'), false
        from posts p
        where p.origin = 'ben_pipeline'
          and not exists (select 1 from ops.post_observations o join ops.crawl_runs r on r.id = o.run_id
                          where o.post_id = p.id and r.batch_id = 'legacy-ben-crawl1-zero-venues')
        returning 1) select count(*)::int n from ins`, [RUN_BEN]);
    // ---- 8. is_first for posts that have none
    await c.query(`create temp table first_fix on commit drop as
      select distinct on (o.post_id) o.post_id, o.run_id from ops.post_observations o
      where not exists (select 1 from ops.post_observations x where x.post_id = o.post_id and x.is_first)
      order by o.post_id, o.observed_at, o.run_id`);
    const firstFix = await q<{ run_id: number; n: number }>(c, `select run_id, count(*)::int n from first_fix group by 1 order by 1`);
    await c.query(`insert into ops.post_merge_log (batch_id, post_id, action, after)
      select $1, post_id, 'is_first_set', jsonb_build_object('run_id', run_id) from first_fix`, [batchId]);
    await c.query(`update ops.post_observations o set is_first = true from first_fix f where f.post_id = o.post_id and f.run_id = o.run_id`);
    const preexistingNew = await q(c, `select r.batch_id, count(*)::int n
      from ops.post_observations o join ops.crawl_runs r on r.id = o.run_id join posts p on p.id = o.post_id
      where o.is_first and r.actor <> 'legacy-import' and p.staging_post_id is not null
        and exists (select 1 from stg s where s.staging_post_id = p.staging_post_id and s.scraped_at::timestamptz < o.observed_at)
      group by 1 order by 2 desc`);
    lap(`sightings: jeremy ${obsJ.n}, ben ${obsB.n}; is_first set on ${firstFix.reduce((a, b) => a + b.n, 0)}`);

    // Fresh statistics for the rows this transaction added, before any view is planned.
    await c.query(`analyze posts`);
    await c.query(`analyze ops.post_observations`);
    await c.query(`analyze accounts`);

    // ---- 9. views
    const svDef = (await one<{ d: string }>(c, `select pg_get_viewdef('structural_post_vendor_evidence'::regclass, true) d`)).d;
    const sfDef = (await one<{ d: string }>(c, `select pg_get_functiondef('structural_post_vendor_evidence_for_batch'::regproc) d`)).d;
    await c.query(V_IG_POSTS);
    await c.query(V_IG_POSTS_COMMENT);
    await c.query(`create or replace view structural_post_vendor_evidence as ${patchGate(svDef, "view")}`);
    await c.query(patchGate(sfDef, "function"));
    lap("views swapped");

    // ---- checks, inside the transaction
    const load = baselineLoader(BASELINE);
    const current: Record<string, string[]> = {};
    for (const f of [...FROZEN, ...CAPTURED]) {
      current[f.name] = await fetchLines(c, f.sql);
      lap(`checked ${f.name}`);
    }
    const pc = await measurePostConditions(c, true);
    const captured: Record<string, string[]> = {};
    for (const f of CAPTURED) captured[f.name] = load(f.name);
    const postFails = checkPost(pc, captured, current);
    const legacy = new Set(captured.legacy_unobserved_urls);
    const leaked = current["structural_post_vendor_evidence"].filter((r) => legacy.has(r.match(/^\((https:[^,]+),/)?.[1] ?? ""));
    if (leaked.length) postFails.push(`STRUCTURAL LEAK: ${leaked.length} rows from the legacy-unobserved posts`);

    const mintedIds = new Set(minted.map((m) => String(m.id)));
    const profileUrls = new Set(captured.profile_urls);
    // Named causes. A row is explained only by one of these; a - row is explained by its paired
    // + row (same post_url) when that + row is.
    const twinNames = new Set(twins.flatMap((t) => [t.owner, existingNorm.get(norm(t.owner))!]));
    const urlOf = (row: string) => row.match(/^\((https:[^,]+),/)?.[1] ?? "";
    const fieldsOf = (row: string) => row.slice(1, -1).split(",");
    const explainOne = (view: string, row: string): string | null => {
      if (profileUrls.has(urlOf(row))) return "profile-url exclusion";
      const fields = fieldsOf(row);
      if (fields.some((f) => mintedIds.has(f))) return "minted account resolves";
      if (view === "post_styled_shoot_signal" && twinNames.has(fields[1])) return "twin owner (default: existing account)";
      return null;
    };
    const frozenReport: { name: string; minus: string[]; plus: string[]; unexplained: string[]; why: Map<string, string> }[] = [];
    for (const f of FROZEN) {
      if (f.name === "funnel") continue;
      const { onlyA, onlyB } = multisetDiff(load(f.name), current[f.name]);
      if (!onlyA.length && !onlyB.length) continue;
      const why = new Map<string, string>();
      for (const r of [...onlyA, ...onlyB]) {
        const e = explainOne(f.name, r);
        if (e) why.set(r, e);
      }
      // Venue tie-break: a -/+ pair identical except account_id, on a credit line the view already
      // marks venue_anchor_conflict = true.
      if (f.name.startsWith("structural")) {
        const key = (r: string) => { const x = fieldsOf(r); x[1] = "*"; return x.join(","); };
        const plusKeys = new Map<string, string>();
        for (const r of onlyB) plusKeys.set(key(r), r);
        for (const r of onlyA) {
          const x = fieldsOf(r);
          const twin = plusKeys.get(key(r));
          if (twin && x[5] === "credit_line" && x[6] === "t" && !why.has(r) && !why.has(twin)) {
            why.set(r, "venue tie-break (conflicting credit line)");
            why.set(twin, "venue tie-break (conflicting credit line)");
          }
        }
      }
      const plusByUrl = new Map<string, string>();
      for (const r of onlyB) if (why.has(r)) plusByUrl.set(urlOf(r), why.get(r)!);
      for (const r of onlyA) if (!why.has(r) && plusByUrl.has(urlOf(r))) why.set(r, `${plusByUrl.get(urlOf(r))} (paired)`);
      const unexplained = [...onlyA, ...onlyB].filter((r) => !why.has(r));
      frozenReport.push({ name: f.name, minus: onlyA, plus: onlyB, unexplained, why });
    }
    const explain = (row: string): string | null => {
      for (const f of frozenReport) if (f.why.has(row)) return f.why.get(row)!;
      return null;
    };
    const funnelBase = JSON.parse(load("funnel")[0]);
    const funnelNow = JSON.parse(current["funnel"][0]);

    // ---- the packet
    say(`# Post-table merge — P2 gate packet (${batchId})`);
    say(`Generated ${new Date().toISOString()} by \`mergeStagingPosts.ts\` ${apply ? "--apply" : "(dry-run, rolled back)"}.`);
    say(`\n## Ops`);
    say(`| op | rows |\n|---|---|`);
    say(`| exclusions (profile urls) | ${excl.length} |`);
    say(`| accounts minted | ${minted.length} |`);
    say(`| twin handles (not auto-minted) | ${twins.length} |`);
    say(`| posts inserted (origin jeremy_beta) | ${inserted.length} |`);
    say(`| jeremy_evidence copies relabeled | ${relabeled.length} |`);
    say(`| crawled posts linked to staging | ${linked.length} |`);
    say(`| field conflicts logged | ${conflicts.length} |`);
    say(`| sightings: legacy-jeremy-beta-import (run ${RUN_JB}) | ${obsJ.n} |`);
    say(`| sightings: legacy-ben-pipeline (run ${RUN_BEN}) | ${obsB.n} |`);
    say(`| is_first set (posts that had none) | ${firstFix.map((f) => `run ${f.run_id}: ${f.n}`).join(" · ")} |`);
    const bySource = await q(c, `select origin, source, raw_format, count(*)::int n from posts group by 1,2,3 order by 1,2,3`);
    say(`\n## posts after the merge\n| origin | source | raw_format | rows |\n|---|---|---|---|`);
    for (const r of bySource) say(`| ${r.origin} | ${r.source} | ${r.raw_format} | ${r.n} |`);
    say(`\n## Decisions for the user: twin handles (default = existing account)`);
    say(`| staging owner handle | posts | existing account | decision |\n|---|---|---|---|`);
    for (const t of twins) say(`| ${t.owner} | ${t.n} | ${existingNorm.get(norm(t.owner))} | ${twinDecisions[t.owner] ?? "UNDECIDED (default: existing)"} |`);
    say(`\n## Field conflicts (typed columns kept; staging row stored in staging_raw)`);
    for (const x of conflicts) say(`- ${x.shortcode}: owner posts=${x.posts_owner} staging=${x.staging_owner}; caption len posts=${x.posts_caption_len} staging=${x.staging_caption_len}`);
    say(`\n## Frozen outputs vs the P0 baseline`);
    say(`Funnel: baseline ${JSON.stringify(funnelBase)} → now ${JSON.stringify(funnelNow)}`);
    if (!frozenReport.length) say(`All other frozen outputs identical.`);
    for (const f of frozenReport) {
      say(`\n### ${f.name}: -${f.minus.length} +${f.plus.length} (unexplained: ${f.unexplained.length})`);
      for (const r of f.minus.slice(0, 40)) say(`- \`-\` [${explain(r) ?? "UNEXPLAINED"}] ${r.slice(0, 220)}`);
      for (const r of f.plus.slice(0, 40)) say(`- \`+\` [${explain(r) ?? "UNEXPLAINED"}] ${r.slice(0, 220)}`);
    }
    say(`\n## Post-conditions (asserted)`);
    say("```json\n" + JSON.stringify(pc, null, 2) + "\n```");
    say(postFails.length ? postFails.map((f) => `- FAIL ${f}`).join("\n") : "All post-conditions hold.");
    say(`\n## Reported, not rewritten: posts the loop counted as NEW that Jeremy's staging already held`);
    for (const r of preexistingNew) say(`- ${r.batch_id}: ${r.n}`);
    say(`\n## Revert (valid until the first write that references a merged row -- the P4-W3 lock release)`);
    say("```sql\n" + [
      `begin;`,
      `-- views: re-apply the pre-merge definitions (git show fcd2445:pipeline/schema.sql + the live defs saved in tmp_analysis/pm_predefs_${batchId}.sql)`,
      `delete from ops.post_observations where run_id in (${RUN_JB}, ${RUN_BEN});`,
      `update ops.post_observations o set is_first = false from ops.post_merge_log l where l.batch_id = '${batchId}' and l.action = 'is_first_set' and o.post_id = l.post_id and o.run_id = (l.after->>'run_id')::bigint;`,
      `update posts p set source = l.before->>'source', raw = l.before->'raw', raw_format = l.before->>'raw_format', staging_post_id = null, merge_batch_id = null from ops.post_merge_log l where l.batch_id = '${batchId}' and l.action = 'relabel' and p.id = l.post_id;`,
      `update posts p set staging_post_id = null, staging_raw = null, merge_batch_id = null from ops.post_merge_log l where l.batch_id = '${batchId}' and l.action = 'link' and p.id = l.post_id;`,
      `delete from posts p using ops.post_merge_log l where l.batch_id = '${batchId}' and l.action = 'insert' and p.id = l.post_id;  -- the one sanctioned post delete: undoing this batch's own inserts`,
      `delete from accounts a using ops.post_merge_log l where l.batch_id = '${batchId}' and l.action = 'mint_account' and a.id = (l.after->>'account_id')::bigint;`,
      `delete from ops.post_merge_exclusions where batch_id = '${batchId}';`,
      `commit;`,
    ].join("\n") + "\n```");

    const unexplained = frozenReport.reduce((n, f) => n + f.unexplained.length, 0);
    const funnelMoved = JSON.stringify(funnelBase) !== JSON.stringify(funnelNow);
    say(`\n## Verdict`);
    say(`- unexplained frozen-output rows: **${unexplained}**`);
    say(`- post-condition failures: **${postFails.length}**`);
    say(`- funnel moved: ${funnelMoved} (expected: total −${excl.length} for the profile urls, nothing else)`);

    writeFileSync(`${TMP}pm_predefs_${batchId}.sql`, `-- live definitions before the P3 swap\n${svDef}\n\n${sfDef}\n`);
    const packetPath = `${TMP}pm_gate_packet_${batchId}${apply ? "" : "_dryrun"}.md`;
    writeFileSync(packetPath, P.join("\n") + "\n");
    console.log(`\npacket: ${packetPath}`);

    if (apply && unexplained === 0 && postFails.length === 0) {
      await c.query("commit");
      committed = true;
      console.log("COMMITTED");
    } else {
      await c.query("rollback");
      console.log(apply ? "REFUSED TO COMMIT (see verdict) -- ROLLED BACK" : "dry-run -- ROLLED BACK");
      if (apply) process.exitCode = 1;
    }
  } catch (e) {
    if (!committed) await c.query("rollback").catch(() => {});
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
