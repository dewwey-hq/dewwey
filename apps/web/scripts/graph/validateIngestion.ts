/**
 * Post-ingestion validation for the D023 graph write. Read-only.
 */
import { getPool, closePool } from "../classify/db";

async function main() {
  const pool = getPool();

  const { rows: logCount } = await pool.query(`select count(*) as n from jeremy_wedding_vendors_ingested`);
  console.log("jeremy_wedding_vendors_ingested rows:", logCount[0].n);

  const { rows: newRowsCount } = await pool.query(`
    select count(*) as n from wedding_vendors wv
    join jeremy_wedding_vendors_ingested log
      on log.wedding_id = wv.wedding_id and log.account_id = wv.account_id and log.role = wv.role
  `);
  console.log("wedding_vendors rows matching the ingestion log:", newRowsCount[0].n);

  const { rows: preExistingCount } = await pool.query(`
    select count(*) as n from wedding_vendors wv
    where not exists (
      select 1 from jeremy_wedding_vendors_ingested log
      where log.wedding_id = wv.wedding_id and log.account_id = wv.account_id and log.role = wv.role
    )
  `);
  console.log("wedding_vendors rows NOT touched by ingestion (should be 12310):", preExistingCount[0].n);

  // Every newly-ingested row's n_confirmations should be >= 1 and match what was logged
  const { rows: mismatched } = await pool.query(`
    select count(*) as n from wedding_vendors wv
    join jeremy_wedding_vendors_ingested log
      on log.wedding_id = wv.wedding_id and log.account_id = wv.account_id and log.role = wv.role
    where wv.n_confirmations != log.n_confirmations
  `);
  console.log("mismatched n_confirmations between wedding_vendors and the log (should be 0):", mismatched[0].n);

  // sanity: role distribution of newly-ingested rows
  const { rows: roleDist } = await pool.query(`
    select role, count(*) as n from jeremy_wedding_vendors_ingested group by role order by n desc
  `);
  console.log("role distribution of the 100 newly-ingested rows:", roleDist);

  // sanity: how many distinct weddings gained at least one new vendor
  const { rows: weddingsAffected } = await pool.query(`
    select count(distinct wedding_id) as n from jeremy_wedding_vendors_ingested
  `);
  console.log("distinct Ben weddings that gained >=1 new vendor:", weddingsAffected[0].n);

  // Ben's other tables completely untouched
  const { rows: benTables } = await pool.query(`
    select
      (select count(*) from weddings) as weddings,
      (select count(*) from wedding_posts) as wedding_posts,
      (select count(*) from accounts) as accounts
  `);
  console.log("weddings/wedding_posts/accounts (should be 1384/1668/14330):", benTables[0]);

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
