/**
 * One-off attach for candidate 2981 (Venuti's Banquets, "Mr & Mrs Gjerazi") -> wedding 1062,
 * the last of the original "18 hand-reviewed" human-confirmed-v1 candidates
 * (docs/engineering/human-labeling/human-confirmed-candidates-review.md) still unhandled.
 * A human already reviewed this exact match and recommended "attach" -- but automated
 * match_confidence is 0.4, below applyJeremyEvidenceToGraph.ts's 0.75-0.85 scope, so that
 * script's normal sweep never picks it up. Same insert pattern as that script (on conflict do
 * nothing, provenance-logged into jeremy_wedding_vendors_ingested).
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/attachStrayHumanConfirmedCandidate.ts --dry-run
 *   bun run scripts/graph/attachStrayHumanConfirmedCandidate.ts
 */
import { getPool, closePool } from "../classify/db";

const CANDIDATE_ID = 2981;
const WEDDING_ID = 1062;
const RECONCILIATION_VERSION = "reconcile-v2";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const { rows: vendors } = await client.query<{ account_id: number; role: string; n_confirmations: number }>(
      `select account_id, role, n_confirmations from jeremy_wedding_candidate_vendors where candidate_id = $1`,
      [CANDIDATE_ID]
    );
    console.log(`[attach-stray] ${dryRun ? "DRY RUN — " : ""}candidate=${CANDIDATE_ID} -> wedding=${WEDDING_ID}, ${vendors.length} vendor rows`);

    let inserted = 0;
    let alreadyExisted = 0;
    for (const v of vendors) {
      const { rows: insertedRows } = await client.query(
        `insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)
         values ($1, $2, $3::vendor_role, $4)
         on conflict (wedding_id, account_id, role) do nothing
         returning wedding_id`,
        [WEDDING_ID, v.account_id, v.role, v.n_confirmations]
      );
      if (insertedRows.length > 0) {
        inserted++;
        await client.query(
          `insert into jeremy_wedding_vendors_ingested
             (wedding_id, account_id, role, n_confirmations, candidate_id, reconciliation_version)
           values ($1, $2, $3::vendor_role, $4, $5, $6)
           on conflict (wedding_id, account_id, role, reconciliation_version) do nothing`,
          [WEDDING_ID, v.account_id, v.role, v.n_confirmations, CANDIDATE_ID, RECONCILIATION_VERSION]
        );
      } else {
        alreadyExisted++;
      }
    }
    console.log(`[attach-stray] inserted=${inserted} already-existed=${alreadyExisted}`);

    if (dryRun) {
      await client.query("rollback");
      console.log("[attach-stray] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("refresh materialized view edges");
      await client.query("commit");
      console.log("[attach-stray] COMMITTED");
    }
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
