/**
 * ONE-OFF FIX (2026-09-21, D066): @silverlake_cc (Silver Lake CC, Stow OHIO) was recorded as an
 * alias of @silverlake.cc (Silver Lake CC, Orland Park IL). Two real, different country clubs that
 * share a name.
 *
 * Found by the user reading a served wedding: "Congratulations Kristen and Josh on their big day at
 * @silverlake_cc in Stow, Ohio." — "this one is not the right silverlake."
 *
 * ROOT CAUSE: the alias was written 2026-09-10 in "round 7a" on the rule
 * "underscore/dot handle variant + same full_name", with NO geography check —
 * `account_aliases.evidence`, `source` and `verified_by` are all null on the row. @silverlake_cc has
 * no `account_locations` row at all (in_metro is null), so nothing ever confirmed it was in Chicago.
 * D065 then AMPLIFIED it: because the alias existed, @silverlake_cc became a crawl target as an
 * alias sibling, we paid Apify for an Ohio venue's tagged feed, and its weddings were attributed to
 * the Chicago club.
 *
 * TWO CHANGES, both minimal:
 *   1. Delete the alias row. Ohio is not Chicago; nothing else about either account changes.
 *   2. Re-point wedding 12927 from the Chicago account to the Ohio one and set is_chicago = false.
 *      It is NOT retired — it is a real wedding, just not a Chicago one, and the project's rule is
 *      "a wedding is Chicago iff its venue is" (CLAUDE.md). Retiring it would delete a true fact;
 *      re-pointing it makes the fact correct and removes it from Chicago coverage, which is what the
 *      user's correction actually means.
 *
 * Deliberately NOT touched: the three corpus-sourced weddings at @silverlake.cc (7423, 7452, 7546)
 * name no city, and two of them look like the same couples as crawl-sourced ones ("Maggie and Jay"
 * vs "Maggie + Jayson"; "Frank & Nicki" vs "Bride Nicki ... in Orland Park"). That is a possible
 * DUPLICATE-wedding question, a different bug from this one, and guessing at it here would be the
 * same overreach that created the alias.
 *
 * Dry-run by default; --commit to write. Prints before/after either way.
 *   bun run scripts/graph/tmp_analysis/fix_silverlake_alias.ts
 *   bun run scripts/graph/tmp_analysis/fix_silverlake_alias.ts --commit
 */
import { getPool, closePool } from "../../classify/db";

const CHICAGO_ID = 34248; // @silverlake.cc  -- Orland Park, IL
const OHIO_ID = 34247; // @silverlake_cc  -- Stow, OH
const WEDDING_ID = 12927; // "Kristen and Josh ... at @silverlake_cc in Stow, Ohio"

async function snapshot(c: any, label: string) {
  const { rows } = await c.query(
    `select a.id, a.username::text username,
            (select count(*) from weddings w where w.venue_id = a.id) weddings,
            (select count(*) from weddings w where w.venue_id = a.id and w.is_chicago) chicago,
            (select count(*) from account_aliases al where al.alias_account_id = a.id) is_alias
     from accounts a where a.id = any($1::bigint[]) order by a.id`,
    [[OHIO_ID, CHICAGO_ID]]
  );
  const { rows: w } = await c.query(
    `select id, venue_id, is_chicago from weddings where id = $1`,
    [WEDDING_ID]
  );
  console.log(`\n--- ${label} ---`);
  for (const r of rows) {
    console.log(`  @${r.username} (id ${r.id}): weddings=${r.weddings} chicago=${r.chicago} is_alias=${r.is_alias}`);
  }
  console.log(`  wedding ${WEDDING_ID}: venue_id=${w[0]?.venue_id} is_chicago=${w[0]?.is_chicago}`);
}

async function main() {
  const commit = process.argv.includes("--commit");
  const pool = getPool();
  const c = await pool.connect();
  try {
    await c.query("begin");
    await snapshot(c, "BEFORE");

    const del = await c.query(`delete from account_aliases where alias_account_id = $1 and canonical_account_id = $2`, [
      OHIO_ID,
      CHICAGO_ID,
    ]);
    console.log(`\n  deleted ${del.rowCount} alias row(s)`);

    // Re-point the wedding AND its venue-role credit, so wedding_vendors (which the creation
    // script's coverage delta counts) does not keep pointing at the Chicago club.
    const upW = await c.query(`update weddings set venue_id = $1, is_chicago = false where id = $2`, [OHIO_ID, WEDDING_ID]);
    const upV = await c.query(
      `update wedding_vendors set account_id = $1 where wedding_id = $2 and role = 'venue' and account_id = $3`,
      [OHIO_ID, WEDDING_ID, CHICAGO_ID]
    );
    console.log(`  re-pointed ${upW.rowCount} wedding row(s), ${upV.rowCount} venue-credit row(s)`);

    await snapshot(c, "AFTER");

    if (commit) {
      await c.query("commit");
      console.log("\n  COMMITTED");
    } else {
      await c.query("rollback");
      console.log("\n  DRY RUN -- rolled back, nothing written. Re-run with --commit.");
    }
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
