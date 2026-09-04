/**
 * Read-only precondition checks before ingesting the 143 high-confidence
 * Jeremy candidates into Ben's wedding_vendors. Never writes.
 */
import { getPool, closePool } from "../classify/db";

async function main() {
  const pool = getPool();

  const { rows: roles } = await pool.query(`
    select distinct cv.role
    from jeremy_wedding_candidate_vendors cv
    join jeremy_wedding_candidate_reconciliation r on r.candidate_id = cv.candidate_id
    where r.reconciliation_version = 'reconcile-v2' and r.match_confidence between 0.75 and 0.85
    order by cv.role
  `);
  console.log("distinct roles among the 143's vendor sets:", roles.map((r) => r.role));

  const { rows: bad } = await pool.query(`
    select cv.role, count(*) as n from jeremy_wedding_candidate_vendors cv
    join jeremy_wedding_candidate_reconciliation r on r.candidate_id = cv.candidate_id
    where r.reconciliation_version = 'reconcile-v2' and r.match_confidence between 0.75 and 0.85
      and cv.role not in (select unnest(enum_range(null::vendor_role))::text)
    group by cv.role
  `);
  console.log("roles NOT in vendor_role enum (would fail a cast):", bad);

  const { rows: nullAccount } = await pool.query(`
    select count(*) as n from jeremy_wedding_candidate_vendors cv
    join jeremy_wedding_candidate_reconciliation r on r.candidate_id = cv.candidate_id
    where r.reconciliation_version = 'reconcile-v2' and r.match_confidence between 0.75 and 0.85
      and cv.account_id is null
  `);
  console.log("rows with null account_id:", nullAccount[0].n);

  const { rows: totalRows } = await pool.query(`
    select count(*) as n from jeremy_wedding_candidate_vendors cv
    join jeremy_wedding_candidate_reconciliation r on r.candidate_id = cv.candidate_id
    where r.reconciliation_version = 'reconcile-v2' and r.match_confidence between 0.75 and 0.85
  `);
  console.log("total candidate-vendor rows across the 143:", totalRows[0].n);

  const { rows: distinctWeddings } = await pool.query(`
    select count(distinct matched_wedding_id) as n from jeremy_wedding_candidate_reconciliation
    where reconciliation_version = 'reconcile-v2' and match_confidence between 0.75 and 0.85
  `);
  console.log("distinct Ben weddings among the 143:", distinctWeddings[0].n);

  // how many of these (wedding_id, account_id, role) triples ALREADY exist in wedding_vendors
  // (would be a no-op insert) vs are genuinely new
  const { rows: overlap } = await pool.query(`
    select
      count(*) filter (where wv.wedding_id is not null) as already_exists,
      count(*) filter (where wv.wedding_id is null) as genuinely_new
    from jeremy_wedding_candidate_vendors cv
    join jeremy_wedding_candidate_reconciliation r on r.candidate_id = cv.candidate_id
    left join wedding_vendors wv
      on wv.wedding_id = r.matched_wedding_id and wv.account_id = cv.account_id and wv.role::text = cv.role
    where r.reconciliation_version = 'reconcile-v2' and r.match_confidence between 0.75 and 0.85
  `);
  console.log("already in wedding_vendors:", overlap[0].already_exists, " / genuinely new:", overlap[0].genuinely_new);

  // sanity: does the existing schema have any provenance/source column on wedding_vendors?
  const { rows: cols } = await pool.query(`
    select column_name from information_schema.columns where table_name = 'wedding_vendors' order by ordinal_position
  `);
  console.log("wedding_vendors columns:", cols.map((c) => c.column_name));

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
