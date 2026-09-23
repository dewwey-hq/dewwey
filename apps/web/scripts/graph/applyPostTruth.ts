/**
 * POST-TABLE MERGE, phase P6 (2026-09-23): the truth layer and a frozen regression set.
 *
 * `post_truth` -- one row per post (all of `posts`), with a label and the trust tier it came from.
 * Tiers are never blended silently: every row says which source decided it, and every contributing
 * source is kept in `sources` for audit. Consumers pick tiers explicitly.
 *
 *   label  wedding | not_wedding | unknown | conflicting   (conflicting = two GOLD sources disagree)
 *   tier   gold    a human label (human_post_labels) or a human venue verdict (post_venue_verdicts
 *                  reviewed by 'jeremy' / 'human*'), each the latest per post. Human beats model.
 *          silver  the latest model verdict (haiku-extract-*, fable-structured; revert:* SKIP rows
 *                  neutralise it), then non_wedding_posts_retired, then an active wedding attachment.
 *          bronze  clustered into a wedding candidate and nothing stronger.
 *          null    nothing -> label unknown.
 *   Verdict mapping: THIS_VENUE / OTHER_VENUE -> wedding (OTHER_VENUE is still a wedding, at another
 *   venue); NOT_WEDDING -> not_wedding; UNSURE / SKIP / UNVIEWABLE -> no label from that source.
 *   `retirement_candidate`: a human not_wedding on a post that still has an active wedding
 *   attachment -- it stays not_wedding at gold, and is listed, never acted on here.
 *   `current_verdicts` views are NOT reused for the human/model split: post_venue_verdicts_current is
 *   latest ACROSS reviewers, so a later model or revert row would hide an earlier human verdict.
 *
 * `eval_set_versions` / `eval_set_members` -- insert-only (trigger). v1 = every GOLD post labelled
 * wedding or not_wedding (conflicting excluded), frozen with a sha256 over sorted "url|label" lines.
 * It is a REGRESSION set, not a holdout: the reader was tuned on these spot-check labels. The 6
 * suspected labelling slips named in STATE.md (probe6/deepen blind check, 2026-09-20) are FLAGGED in
 * `flags`, not dropped -- a scorer decides whether to exclude them.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyPostTruth.ts --dry-run   # create + freeze + assert in a transaction, ROLLBACK
 *   bun run scripts/graph/applyPostTruth.ts --apply     # same, COMMIT
 */
import { getPool, closePool } from "../classify/db";

const HUMAN = `(reviewed_by = 'jeremy' or reviewed_by like 'human%')`;
const SUSPECTED_SLIPS = ["DZVIwxJuoeC", "DZp8Fd9lCZO", "DdKMptwlpe3", "DVzAbTUmC4p", "DIzLiC0vp5w", "DTJV07KgOha"];

export const POST_TRUTH = `create or replace view post_truth as
with hl as (
  select distinct on (post_url) post_url, decision, labeled_at
  from human_post_labels
  where labeled_by = 'jeremy' or labeled_by like 'human%'
  order by post_url, labeled_at desc
), hv as (
  select distinct on (post_url) post_url, verdict, reviewed_at
  from post_venue_verdicts where ${HUMAN}
  order by post_url, reviewed_at desc
), mv as (
  select distinct on (post_url) post_url, verdict, reviewed_by, reviewed_at
  from post_venue_verdicts where not ${HUMAN}
  order by post_url, reviewed_at desc
), wp as (
  select x.post_id, min(x.wedding_id) as wedding_id from wedding_posts x group by 1
), rt as (
  select distinct post_url from non_wedding_posts_retired
), cl as (
  select distinct source_post_url as post_url from jeremy_wedding_candidate_posts
), m as (
  select p.url as post_url, p.id as post_id, p.origin, p.source,
         hl.decision as human_label, hl.labeled_at,
         hv.verdict as human_verdict, hv.reviewed_at as human_verdict_at,
         mv.verdict as model_verdict, mv.reviewed_by as model_reviewer, mv.reviewed_at as model_verdict_at,
         case hl.decision when 'WEDDING' then 'wedding' when 'NOT_WEDDING' then 'not_wedding' end as hl_label,
         case hv.verdict when 'THIS_VENUE' then 'wedding' when 'OTHER_VENUE' then 'wedding' when 'NOT_WEDDING' then 'not_wedding' end as hv_label,
         case mv.verdict when 'THIS_VENUE' then 'wedding' when 'OTHER_VENUE' then 'wedding' when 'NOT_WEDDING' then 'not_wedding' end as mv_label,
         wp.wedding_id, rt.post_url is not null as retired, cl.post_url is not null as clustered
  from posts p
  left join hl on hl.post_url = p.url
  left join hv on hv.post_url = p.url
  left join mv on mv.post_url = p.url
  left join wp on wp.post_id = p.id
  left join rt on rt.post_url = p.url
  left join cl on cl.post_url = p.url
)
select post_url, post_id, origin, source,
  case when hl_label is not null and hv_label is not null and hl_label <> hv_label then 'conflicting'
       when coalesce(hl_label, hv_label) is not null then coalesce(hl_label, hv_label)
       when mv_label is not null then mv_label
       when retired then 'not_wedding'
       when wedding_id is not null then 'wedding'
       when clustered then 'wedding'
       else 'unknown' end as label,
  case when coalesce(hl_label, hv_label) is not null then 'gold'
       when mv_label is not null or retired or wedding_id is not null then 'silver'
       when clustered then 'bronze' end as tier,
  case when hl_label is not null and hv_label is not null then 'human_label+human_verdict'
       when hl_label is not null then 'human_label'
       when hv_label is not null then 'human_verdict'
       when mv_label is not null then 'model_verdict:' || model_reviewer
       when retired then 'non_wedding_posts_retired'
       when wedding_id is not null then 'wedding_attachment'
       when clustered then 'wedding_candidate_cluster' end as label_source,
  case when hl_label is not null or hv_label is not null then greatest(labeled_at, human_verdict_at)
       when mv_label is not null then model_verdict_at end as label_at,
  (coalesce(hl_label, hv_label) = 'not_wedding' and wedding_id is not null
     and not (hl_label is not null and hv_label is not null and hl_label <> hv_label)) as retirement_candidate,
  (coalesce(hl_label, hv_label) is null and (
     (mv_label is not null and ((retired and mv_label <> 'not_wedding') or (wedding_id is not null and mv_label <> 'wedding')))
     or (retired and wedding_id is not null))) as silver_disagreement,
  jsonb_strip_nulls(jsonb_build_object(
     'human_label', human_label, 'human_verdict', human_verdict,
     'model_verdict', model_verdict, 'model_reviewer', model_reviewer,
     'wedding_id', wedding_id, 'retired', nullif(retired, false), 'clustered', nullif(clustered, false))) as sources
from m`;

export const STATEMENTS: string[] = [
  POST_TRUTH,
  `comment on view post_truth is 'POST-TABLE MERGE P6 (2026-09-23): one row per post with label (wedding|not_wedding|unknown|conflicting) and tier (gold=human, silver=model verdict/retirement/wedding attachment, bronze=candidate cluster). Tiers are never blended: pick them explicitly. conflicting = two gold sources disagree. See apps/web/scripts/graph/applyPostTruth.ts.';`,
  `create table if not exists eval_set_versions (
     id          serial primary key,
     name        text not null unique,
     definition  text not null,
     members     integer not null,
     sha256      text not null,
     created_at  timestamptz not null default now(),
     notes       text
   );`,
  `create table if not exists eval_set_members (
     eval_set_id   integer not null references eval_set_versions(id),
     post_url      text not null references posts(url),
     label         text not null check (label in ('wedding','not_wedding')),
     tier          text not null,
     label_source  text not null,
     flags         jsonb not null default '{}'::jsonb,
     primary key (eval_set_id, post_url)
   );`,
  `create or replace function forbid_eval_set_rewrite() returns trigger language plpgsql as $f$
   begin raise exception 'eval sets are insert-only: freeze a new version instead of editing %', tg_table_name; end $f$;`,
  `drop trigger if exists eval_set_versions_insert_only on eval_set_versions;`,
  `create trigger eval_set_versions_insert_only before update or delete on eval_set_versions for each row execute function forbid_eval_set_rewrite();`,
  `drop trigger if exists eval_set_members_insert_only on eval_set_members;`,
  `create trigger eval_set_members_insert_only before update or delete on eval_set_members for each row execute function forbid_eval_set_rewrite();`,
  `comment on table eval_set_versions is 'POST-TABLE MERGE P6: frozen, insert-only evaluation sets over post_truth. v1 = gold wedding/not_wedding, a REGRESSION set (the reader was tuned on these labels), not a holdout.';`,
];

const FREEZE_V1 = `with v as (
    insert into eval_set_versions (name, definition, members, sha256, notes)
    select 'post-truth-regression-v1',
           'post_truth where tier = ''gold'' and label in (''wedding'',''not_wedding'')  [conflicting excluded]',
           count(*),
           encode(sha256(convert_to(string_agg(post_url || '|' || label, E'\\n' order by post_url), 'UTF8')), 'hex'),
           'Regression set, not a holdout: the reader was tuned on these spot-check labels. flags.suspected_label_slip marks the 6 posts named in STATE.md 2026-09-20 (probe6/deepen blind check) -- flagged, not dropped.'
    from post_truth where tier = 'gold' and label in ('wedding','not_wedding')
    returning id)
  insert into eval_set_members (eval_set_id, post_url, label, tier, label_source, flags)
  select v.id, t.post_url, t.label, t.tier, t.label_source,
         jsonb_strip_nulls(jsonb_build_object(
           'origin', t.origin,
           'retirement_candidate', nullif(t.retirement_candidate, false),
           'suspected_label_slip', case when (regexp_match(t.post_url, '/p/([^/]+)'))[1] = any($1::text[]) then true end))
  from post_truth t, v
  where t.tier = 'gold' and t.label in ('wedding','not_wedding')`;

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply && !process.argv.includes("--dry-run")) throw new Error("need --dry-run or --apply");
  const pool = getPool();
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local statement_timeout = '900s'");
    for (const [i, s] of STATEMENTS.entries()) {
      await c.query(s);
      console.log(`[p6] ${i + 1}/${STATEMENTS.length} ok`);
    }
    const exists = (await c.query(`select count(*)::int n from eval_set_versions where name = 'post-truth-regression-v1'`)).rows[0].n;
    if (exists === 0) {
      await c.query(FREEZE_V1, [SUSPECTED_SLIPS]);
      console.log("[p6] froze post-truth-regression-v1");
    } else console.log("[p6] post-truth-regression-v1 already frozen -- left as is (insert-only)");

    let fails = 0;
    const check = (name: string, ok: boolean, detail: string) => {
      console.log(`  ${ok ? "ok  " : "FAIL"} ${name}: ${detail}`);
      if (!ok) fails++;
    };
    const r = (await c.query(`select
        (select count(*) from post_truth)::int rows, (select count(*) from posts)::int posts,
        (select count(distinct post_url) from post_truth)::int distinct_rows,
        (select count(*) from post_truth where tier = 'gold')::int gold,
        (select count(*) from posts p where exists (select 1 from human_post_labels h where h.post_url = p.url and (h.labeled_by = 'jeremy' or h.labeled_by like 'human%') and h.decision in ('WEDDING','NOT_WEDDING'))
                                       or exists (select 1 from post_venue_verdicts v where v.post_url = p.url and ${HUMAN.replace(/reviewed_by/g, "v.reviewed_by")} and v.verdict in ('THIS_VENUE','OTHER_VENUE','NOT_WEDDING')))::int gold_upper,
        (select count(*) from post_truth where label = 'conflicting')::int conflicting,
        (select count(*) from post_truth where tier = 'gold' and label <> 'conflicting')::int gold_labelled,
        (select count(*) from post_truth where tier is null and label <> 'unknown')::int untiered_labelled,
        (select count(*) from post_truth p join wedding_posts w on w.post_id = p.post_id where p.tier is null)::int wedding_untiered`)).rows[0];
    check("one row per post", r.rows === r.posts && r.distinct_rows === r.posts, `${r.rows} rows, ${r.posts} posts`);
    // gold can be below the upper bound: a post's LATEST human label may be UNSURE/SKIP (no label), which is correct.
    check("gold <= posts with any human wedding/not-wedding label or verdict", r.gold <= r.gold_upper, `gold ${r.gold} <= ${r.gold_upper}`);
    check("no labelled row without a tier", r.untiered_labelled === 0, `${r.untiered_labelled}`);
    check("every wedding-attached post has a tier", r.wedding_untiered === 0, `${r.wedding_untiered}`);
    const m = (await c.query(`select v.members, v.sha256, (select count(*) from eval_set_members e where e.eval_set_id = v.id)::int actual,
        (select count(*) from eval_set_members e where e.eval_set_id = v.id and e.flags ? 'suspected_label_slip')::int slips,
        encode(sha256(convert_to((select string_agg(post_url || '|' || label, E'\\n' order by post_url) from eval_set_members e where e.eval_set_id = v.id), 'UTF8')), 'hex') recomputed
        from eval_set_versions v where v.name = 'post-truth-regression-v1'`)).rows[0];
    check("v1 members = gold labelled (non-conflicting)", m.actual === r.gold_labelled && m.members === m.actual, `${m.actual} members, ${r.gold_labelled} gold labelled`);
    check("v1 sha reproduces from its members", m.sha256 === m.recomputed, m.sha256);
    check("the 6 suspected slips are flagged (if present in gold)", m.slips <= 6, `${m.slips} flagged`);
    // insert-only probe
    await c.query("savepoint probe");
    let blocked = false;
    try {
      await c.query(`update eval_set_members set label = label where eval_set_id = (select min(id) from eval_set_versions)`);
    } catch (e: any) {
      blocked = /insert-only/.test(e.message);
    }
    await c.query("rollback to savepoint probe");
    check("eval sets reject updates", blocked, String(blocked));

    console.log("\n[p6] post_truth by tier x label:");
    for (const row of (await c.query(`select coalesce(tier,'-') tier, label, count(*)::int n from post_truth group by 1,2 order by 1,2`)).rows)
      console.log(`  ${row.tier.padEnd(7)} ${row.label.padEnd(12)} ${row.n}`);
    console.log("\n[p6] gold coverage by origin (label: wedding / not_wedding / conflicting):");
    for (const row of (await c.query(`select origin, count(*) filter (where label='wedding')::int w, count(*) filter (where label='not_wedding')::int nw,
        count(*) filter (where label='conflicting')::int c from post_truth where tier='gold' group by 1 order by 1`)).rows)
      console.log(`  ${row.origin.padEnd(17)} ${row.w} / ${row.nw} / ${row.c}`);
    const extra = (await c.query(`select (select count(*) from post_truth where retirement_candidate)::int rc, (select count(*) from post_truth where silver_disagreement)::int sd`)).rows[0];
    console.log(`\n[p6] retirement candidates (human not_wedding, still attached to a wedding): ${extra.rc}; silver-tier disagreements: ${extra.sd}`);
    console.log(`[p6] regression set v1: ${m.actual} members, sha256 ${m.sha256}, ${m.slips} suspected slips flagged`);

    if (apply && fails === 0) {
      await c.query("commit");
      console.log("[p6] COMMITTED");
    } else {
      await c.query("rollback");
      console.log(fails ? `[p6] ${fails} check(s) failed -- ROLLED BACK` : "[p6] dry-run -- ROLLED BACK");
      if (fails) process.exitCode = 1;
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
