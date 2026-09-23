/**
 * POST-TABLE MERGE, phase P5 (2026-09-23): lock-down.
 *
 * 1. Foreign keys from the core url-keyed evidence tables to posts(url) (unique since P1), so the
 *    "evidence points at a post that isn't in posts" class becomes a DB error instead of a silent
 *    orphan. Added NOT VALID, then VALIDATEd -- except human_post_labels, which carries ONE legacy
 *    row (a human NOT_WEDDING label from 2026-09-05 on https://www.instagram.com/chicagocatz/, a
 *    profile url that was never a post and is logged in ops.post_merge_exclusions). Labels are
 *    append-only, so that row stays; the FK stays NOT VALID and still enforces every new label.
 * 2. staging.instagram_posts becomes genuinely read-only: only the owner role holds grants, so a
 *    REVOKE would change nothing -- a trigger rejects INSERT/UPDATE/DELETE/TRUNCATE for everyone.
 *    It is the import record of the merge; posts is the corpus.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyPostMergeLockdown.ts --dry-run   # apply + assert in a transaction, ROLLBACK
 *   bun run scripts/graph/applyPostMergeLockdown.ts --apply     # same, COMMIT
 */
import { getPool, closePool } from "../classify/db";

const FKS: { table: string; col: string; name: string; validate: boolean }[] = [
  { table: "stack_extraction_runs", col: "post_url", name: "stack_extraction_runs_post_url_fkey", validate: true },
  { table: "post_extraction_runs", col: "post_url", name: "post_extraction_runs_post_url_fkey", validate: true },
  { table: "post_venue_verdicts", col: "post_url", name: "post_venue_verdicts_post_url_fkey", validate: true },
  { table: "jeremy_wedding_candidate_posts", col: "source_post_url", name: "jeremy_wedding_candidate_posts_source_post_url_fkey", validate: true },
  { table: "human_post_labels", col: "post_url", name: "human_post_labels_post_url_fkey", validate: false },
];

export const STATEMENTS: string[] = [
  ...FKS.map(
    (f) => `do $$ begin
      if not exists (select 1 from pg_constraint where conname = '${f.name}') then
        alter table ${f.table} add constraint ${f.name} foreign key (${f.col}) references posts(url) not valid;
      end if;
    end $$;`
  ),
  ...FKS.filter((f) => f.validate).map((f) => `alter table ${f.table} validate constraint ${f.name};`),
  `comment on constraint human_post_labels_post_url_fkey on human_post_labels is 'POST-TABLE MERGE P5: NOT VALID on purpose -- one legacy human label (2026-09-05, NOT_WEDDING) is on a profile url that was never a post (logged in ops.post_merge_exclusions); labels are append-only. Every new label is enforced.';`,
  `create or replace function staging.forbid_write_instagram_posts() returns trigger language plpgsql as $f$
   begin
     raise exception 'staging.instagram_posts is the read-only import record of the post-table merge (2026-09-23); the corpus is public.posts (Jeremy''s rows: origin = jeremy_beta, view v_jeremy_beta_posts)';
   end $f$;`,
  `drop trigger if exists instagram_posts_read_only on staging.instagram_posts;`,
  `create trigger instagram_posts_read_only before insert or update or delete on staging.instagram_posts
     for each statement execute function staging.forbid_write_instagram_posts();`,
  `drop trigger if exists instagram_posts_read_only_truncate on staging.instagram_posts;`,
  `create trigger instagram_posts_read_only_truncate before truncate on staging.instagram_posts
     for each statement execute function staging.forbid_write_instagram_posts();`,
  `comment on table staging.instagram_posts is 'READ-ONLY IMPORT RECORD (post-table merge, 2026-09-23). Jeremy''s beta rows, loaded verbatim 2026-08-22. Every real post here is in public.posts (staging_post_id = id, origin = jeremy_beta); the 10 profile urls are in ops.post_merge_exclusions. Writes are rejected by trigger. Read posts / v_ig_posts / v_jeremy_beta_posts instead.';`,
];

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
      console.log(`[p5] ${i + 1}/${STATEMENTS.length} ok`);
    }
    let fails = 0;
    const { rows } = await c.query(
      `select conname, convalidated from pg_constraint where conname = any($1::text[]) order by 1`,
      [FKS.map((f) => f.name)]
    );
    for (const f of FKS) {
      const r = rows.find((x) => x.conname === f.name);
      const ok = r && r.convalidated === f.validate;
      console.log(`  ${ok ? "ok  " : "FAIL"} ${f.name}: exists=${!!r} validated=${r?.convalidated} (want ${f.validate})`);
      if (!ok) fails++;
    }
    // The trigger must reject a write (probe inside a savepoint).
    await c.query("savepoint probe");
    let blocked = false;
    try {
      await c.query(`update staging.instagram_posts set caption_raw = caption_raw where id = (select min(id) from staging.instagram_posts)`);
    } catch (e: any) {
      blocked = /read-only import record/.test(e.message);
    }
    await c.query("rollback to savepoint probe");
    console.log(`  ${blocked ? "ok  " : "FAIL"} staging.instagram_posts rejects writes`);
    if (!blocked) fails++;
    // An FK must reject evidence for a url that is not a post.
    await c.query("savepoint probe2");
    let fkBlocks = false;
    try {
      await c.query(`insert into post_venue_verdicts (post_url, candidate_id, verdict, reviewed_by)
                     select 'https://www.instagram.com/p/__not_a_post__/', min(candidate_id), 'SKIP', 'p5-probe' from post_venue_verdicts`);
    } catch (e: any) {
      fkBlocks = e.code === "23503"; // foreign_key_violation only -- a not-null error must not count
      if (!fkBlocks) console.log(`  probe error was not an FK violation: ${e.code} ${e.message}`);
    }
    await c.query("rollback to savepoint probe2");
    console.log(`  ${fkBlocks ? "ok  " : "FAIL"} evidence for a non-post url is rejected`);
    if (!fkBlocks) fails++;

    if (apply && fails === 0) {
      await c.query("commit");
      console.log("[p5] COMMITTED");
    } else {
      await c.query("rollback");
      console.log(fails ? `[p5] ${fails} check(s) failed -- ROLLED BACK` : "[p5] dry-run -- ROLLED BACK");
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
