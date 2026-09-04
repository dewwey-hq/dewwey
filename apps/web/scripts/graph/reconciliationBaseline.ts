/**
 * Read-only baseline/comparison report for jeremy_wedding_candidate_reconciliation.
 * Pass a reconciliation_version to report on (defaults to reconcile-v1).
 * Usage: bun run scripts/graph/reconciliationBaseline.ts [version]
 */
import { getPool, closePool } from "../classify/db";

async function main() {
  const version = process.argv[2] ?? "reconcile-v1";
  const pool = getPool();

  const { rows: totalRows } = await pool.query(
    `select count(*) as n from jeremy_wedding_candidate_reconciliation where reconciliation_version = $1`,
    [version]
  );
  const total = Number(totalRows[0].n);

  const { rows: bucketRows } = await pool.query(
    `select
       count(*) filter (where match_confidence between 0.75 and 0.85) as high,
       count(*) filter (where match_confidence between 0.35 and 0.45) as ambiguous,
       count(*) filter (where match_confidence between 0.05 and 0.15 and matched_wedding_id is not null) as weak_matched,
       count(*) filter (where match_confidence between 0.05 and 0.15 and matched_wedding_id is null) as weak_unmatched,
       count(*) filter (where matched_wedding_id is null and venue_match = false) as no_venue,
       count(*) filter (where matched_wedding_id is not null) as any_matched
     from jeremy_wedding_candidate_reconciliation where reconciliation_version = $1`,
    [version]
  );
  const b = bucketRows[0];

  const { rows: distinctWeddings } = await pool.query(
    `select count(distinct matched_wedding_id) as n from jeremy_wedding_candidate_reconciliation
     where reconciliation_version = $1 and matched_wedding_id is not null`,
    [version]
  );

  // fragmentation: candidates per matched Ben wedding, by tier
  const { rows: fragRows } = await pool.query(
    `select matched_wedding_id, count(*) as n_candidates,
       count(*) filter (where match_confidence between 0.75 and 0.85) as n_high,
       count(*) filter (where match_confidence between 0.35 and 0.45) as n_ambiguous,
       count(*) filter (where match_confidence between 0.05 and 0.15) as n_weak
     from jeremy_wedding_candidate_reconciliation
     where reconciliation_version = $1 and matched_wedding_id is not null
     group by matched_wedding_id
     having count(*) > 1
     order by count(*) desc`,
    [version]
  );

  console.log(`\n=== reconciliation_version = ${version} ===`);
  console.log(`total reconciled rows: ${total}`);
  console.log(`  high (0.8):            ${b.high}`);
  console.log(`  ambiguous (0.4):        ${b.ambiguous}`);
  console.log(`  weak, matched (0.1):    ${b.weak_matched}`);
  console.log(`  weak, unmatched (0.1):  ${b.weak_unmatched}`);
  console.log(`  no venue at all (null): ${b.no_venue}`);
  console.log(`  TOTAL any matched_wedding_id set: ${b.any_matched}`);
  console.log(`distinct Ben weddings matched: ${distinctWeddings[0].n}`);
  console.log(`Ben weddings matched by >1 candidate (many-to-one): ${fragRows.length}`);
  const top = fragRows.slice(0, 10);
  for (const r of top) {
    console.log(
      `  wedding ${r.matched_wedding_id}: ${r.n_candidates} candidates (high=${r.n_high} ambiguous=${r.n_ambiguous} weak=${r.n_weak})`
    );
  }
  if (fragRows.length > 10) console.log(`  ... and ${fragRows.length - 10} more`);

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
