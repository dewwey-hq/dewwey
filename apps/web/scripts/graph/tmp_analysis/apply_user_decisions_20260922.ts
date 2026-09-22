/**
 * ONE-OFF (2026-09-22, D066): apply the user's two outstanding judgment calls.
 *
 * DECISION 1 -- "dayof should usually be wedding documented and credible. that one was promotional.
 * exception to rule. so no change i dont think."
 *   So the RULE is unchanged: a day-of teaser that credits the venue and names the couple DOES count,
 *   which is what the reader already does (THIS_VENUE at 0.95). No prompt change.
 *   But `DbyHgNRRPb1` is an exception -- the user read the image as promotional / from the engagement
 *   session, and their NOT_WEDDING stands. Wedding 14456 was created from that post alone, so it is
 *   retired. @cantignygolf therefore drops 6 -> 5 and LOSES its 1-5 -> 6+ crossing. Accepted: the
 *   crossing was never real if the post is not a wedding.
 *
 * DECISION 2 -- "i thought the reception was named as the dinner where they went out to eat after."
 *   Correct. The full caption of `DcZjrRRm12a` names four places:
 *     "get dressed at Nobu ... portraits at the Garfield Park Conservatory, get married at the
 *      Alfred Caldwell Lily Pool, and then do dinner with our families at Avec"
 *   The candidate was anchored to @nobuchicago (where they got dressed). The dinner venue is
 *   @avecchicago (id 347, venue role, in metro, 0 weddings today). Recorded as the correction on the
 *   user's OTHER_VENUE verdict so creation can attach it.
 *   NOT resolved here: the CEREMONY was at the Alfred Caldwell Lily Pool, a Chicago Park District
 *   property with no account of its own. `weddings.ceremony_venue_id` exists for exactly this, but
 *   guessing @chicagoparks (12 weddings, a whole park district) would be the same over-merge that
 *   made @silverlake_cc an alias of @silverlake.cc. Left for the user.
 *
 * Dry-run by default; --commit to write. Prints before/after either way.
 */
import { getPool, closePool } from "../../classify/db";

const TEASER_POST = "https://www.instagram.com/p/DbyHgNRRPb1/";
const TEASER_WEDDING = 14456;
const CANTIGNY_GOLF = 5741;

const MULTI_VENUE_POST = "https://www.instagram.com/p/DcZjrRRm12a/";
const AVEC = 347;

async function snapshot(c: any, label: string) {
  const { rows: w } = await c.query(`select id, venue_id, is_chicago from weddings where id = $1`, [TEASER_WEDDING]);
  const { rows: cg } = await c.query(
    `select (select count(*) from weddings w where w.venue_id = $1 and w.is_chicago)::int n`,
    [CANTIGNY_GOLF]
  );
  const { rows: v } = await c.query(
    `select verdict, corrected_venue_account_id from post_venue_verdicts
     where post_url = $1 and reviewed_by = 'jeremy' order by reviewed_at desc limit 1`,
    [MULTI_VENUE_POST]
  );
  const { rows: av } = await c.query(
    `select (select count(*) from weddings w where w.venue_id = $1 and w.is_chicago)::int n`,
    [AVEC]
  );
  console.log(`\n--- ${label} ---`);
  console.log(`  wedding ${TEASER_WEDDING}: ${w.length ? `venue_id=${w[0].venue_id} is_chicago=${w[0].is_chicago}` : "GONE (retired)"}`);
  console.log(`  @cantignygolf chicago weddings: ${cg[0].n}`);
  console.log(`  DcZjrRRm12a latest human verdict: ${v[0]?.verdict} corrected_to=${v[0]?.corrected_venue_account_id ?? "(none)"}`);
  console.log(`  @avecchicago chicago weddings: ${av[0].n}`);
}

async function main() {
  const commit = process.argv.includes("--commit");
  const pool = getPool();
  const c = await pool.connect();
  try {
    await c.query("begin");
    await snapshot(c, "BEFORE");

    // --- Decision 2: record the corrected venue on the user's existing OTHER_VENUE verdict.
    // Append, never mutate -- post_venue_verdicts is an append-only log, latest row wins.
    const { rows: prior } = await c.query(
      `select candidate_id, venue_account_id from post_venue_verdicts
       where post_url = $1 and reviewed_by = 'jeremy' order by reviewed_at desc limit 1`,
      [MULTI_VENUE_POST]
    );
    await c.query(
      `insert into post_venue_verdicts
         (post_url, candidate_id, venue_account_id, verdict, corrected_venue_account_id, reviewed_by, reviewed_at, notes)
       values ($1, $2, $3, 'OTHER_VENUE', $4, 'jeremy', now(), $5)`,
      [
        MULTI_VENUE_POST,
        prior[0]?.candidate_id ?? null,
        prior[0]?.venue_account_id ?? null,
        AVEC,
        "D066: user named the dinner venue -- caption is a four-location micro-wedding (dressed at Nobu, " +
          "portraits at Garfield Park Conservatory, married at the Alfred Caldwell Lily Pool, dinner at Avec). " +
          "Corrected to @avecchicago. Ceremony venue (Lily Pool) has no account; ceremony_venue_id left unset.",
      ]
    );

    // --- Decision 1: retire the promotional teaser's wedding. Detach its posts first so no
    // wedding_posts row is orphaned, then the vendor credits, then the wedding.
    await c.query(`delete from jeremy_weddings_created where wedding_id = $1`, [TEASER_WEDDING]);
    await c.query(`delete from wedding_posts where wedding_id = $1`, [TEASER_WEDDING]);
    await c.query(`delete from wedding_vendors where wedding_id = $1`, [TEASER_WEDDING]);
    const del = await c.query(`delete from weddings where id = $1`, [TEASER_WEDDING]);
    console.log(`\n  retired ${del.rowCount} wedding(s)`);

    // And record WHY, so a future pass does not re-create it from the same post.
    await c.query(
      `insert into post_venue_verdicts
         (post_url, candidate_id, venue_account_id, verdict, reviewed_by, reviewed_at, notes)
       select $1, candidate_id, venue_account_id, 'NOT_WEDDING', 'jeremy', now(), $2
       from post_venue_verdicts where post_url = $1 order by reviewed_at desc limit 1`,
      [
        TEASER_POST,
        "D066: user confirmed -- day-of teasers DO normally count as documented weddings (no rule/prompt " +
          "change), but this one is promotional/engagement imagery and is the exception. Wedding 14456 retired; " +
          "@cantignygolf 6 -> 5, losing its 1-5 -> 6+ crossing, which was never real.",
      ]
    );

    await snapshot(c, "AFTER");

    if (commit) {
      await c.query("commit");
      console.log("\n  COMMITTED");
    } else {
      await c.query("rollback");
      console.log("\n  DRY RUN -- rolled back. Re-run with --commit.");
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
