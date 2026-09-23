/**
 * POST-TABLE MERGE follow-up (tick 17, 2026-09-23): deterministic venue pick in inline_venue and
 * hashtag_venue.
 *
 * Found by the final parity run: structural_post_vendor_evidence moved -2/+2 with nothing written.
 * DVjIaQwFrNi has @thedrakechicago AND @loyolachicago as inline_at venues on line 0; DVoVY_3kwts has
 * @southloopfarmersmarket AND @shopwatertowerplace on line 2. Both CTEs pick with
 * `DISTINCT ON (post_url) ORDER BY post_url, line_no` -- no tie-break -- so the winner depends on the
 * plan (which moves with table statistics). Same class as the credit_line_venue tie fixed in P3.
 * Fix: `, account_id` as the final sort key (lowest account id wins), in the view AND the batch function.
 *
 * Gate (in the transaction, before COMMIT): every frozen-output row that differs from baseline +
 * pm_accepted_w1 must be half of a pair identical except account_id, whose two accounts are both
 * venue-role entries on that post's line with the same source (inline_at / venue_hashtag).
 *
 * Usage (from apps/web): --dry-run | --apply
 */
import { readFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";
import { FROZEN, baselineLoader, fetchLines, multisetDiff } from "./checkPostMergeParity";

const BASELINE = new URL("./snapshots/2026-09-22T22-43-25-093Z-pm-baseline", import.meta.url).pathname;
const ACCEPTED = new URL("./tmp_analysis/pm_accepted_w1/accepted.json", import.meta.url).pathname;

function patch(def: string, kind: "view" | "function"): string {
  let out = def;
  for (const cte of ["inline_venue", "hashtag_venue"]) {
    const re =
      kind === "view"
        ? new RegExp(`(${cte} AS \\([\\s\\S]*?ORDER BY u_1\\.post_url, l\\.line_no)(\\s*\\))`)
        : new RegExp(`(${cte} as \\([\\s\\S]*?order by u\\.post_url, l\\.line_no(?: asc)?)(\\s*\\))`);
    if (!re.test(out)) throw new Error(`${kind}: ${cte} ORDER BY not found -- refusing to guess`);
    out = out.replace(re, kind === "view" ? `$1, (COALESCE(al.canonical_account_id, a.id))$2` : `$1, coalesce(al.canonical_account_id, a.id)$2`);
  }
  return out;
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply && !process.argv.includes("--dry-run")) throw new Error("need --dry-run or --apply");
  const c = await getPool().connect();
  try {
    await c.query("begin");
    await c.query("set local statement_timeout = '1800s'");
    const sv = (await c.query(`select pg_get_viewdef('structural_post_vendor_evidence'::regclass, true) d`)).rows[0].d as string;
    const sf = (await c.query(`select pg_get_functiondef('structural_post_vendor_evidence_for_batch'::regproc) d`)).rows[0].d as string;
    await c.query(`create or replace view structural_post_vendor_evidence as ${patch(sv, "view")}`);
    await c.query(patch(sf, "function"));
    console.log("[tie] view + function patched");

    const load = baselineLoader(BASELINE);
    const accepted = JSON.parse(readFileSync(ACCEPTED, "utf8")).diffs as Record<string, { minus: string[]; plus: string[] }>;
    let unexplained = 0;
    const newDiffs: Record<string, string> = {};
    for (const f of FROZEN) {
      let base = load(f.name);
      const acc = accepted[f.name];
      if (acc) base = [...multisetDiff(base, acc.minus).onlyA, ...acc.plus];
      const { onlyA, onlyB } = multisetDiff(base, await fetchLines(c, f.sql));
      if (!onlyA.length && !onlyB.length) continue;
      newDiffs[f.name] = `${onlyA.length}/${onlyB.length}`;
      const fields = (r: string) => r.slice(1, -1).split(",");
      const key = (r: string) => { const x = fields(r); x[1] = "*"; return x.join(","); };
      const plus = new Map(onlyB.map((r) => [key(r), r]));
      let paired = 0;
      for (const r of onlyA) {
        const twin = plus.get(key(r));
        const x = fields(r);
        if (!twin || !["inline_at", "venue_hashtag"].includes(x[5])) continue;
        // both accounts must be venue entries on this post's line with this source
        const ok = (await c.query(
          `select count(distinct coalesce(al.canonical_account_id, a.id))::int n
           from stack_extraction_entries e join accounts a on lower(a.username::text) = e.handle
           left join account_aliases al on al.alias_account_id = a.id
           where e.post_url = $1 and e.line_no = $2 and e.role = 'venue' and e.source = $3
             and coalesce(al.canonical_account_id, a.id) = any($4::bigint[])`,
          [x[0], Number(x[4]), x[5], [x[1], fields(twin)[1]]]
        )).rows[0].n === 2;
        if (ok) paired++;
      }
      const bad = onlyA.length + onlyB.length - 2 * paired;
      unexplained += bad;
      console.log(`  DIFF ${f.name}: -${onlyA.length} +${onlyB.length}, proven tie pairs ${paired}, unexplained ${bad}`);
    }
    console.log(`[tie] new diffs vs baseline+w1: ${JSON.stringify(newDiffs)}; unexplained rows: ${unexplained}`);
    if (apply && unexplained === 0) {
      await c.query("commit");
      console.log("[tie] COMMITTED");
    } else {
      await c.query("rollback");
      console.log(apply ? "[tie] REFUSED -- ROLLED BACK" : "[tie] dry-run -- ROLLED BACK");
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
