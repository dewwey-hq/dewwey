/**
 * Applies the validated, high-confidence Jeremy evidence (D020's audited
 * 143-match tier, reconcile-v2) into Ben's live wedding_vendors — the first
 * write this workstream has ever made to Ben's serving graph.
 *
 * Safety properties:
 * - Scope: ONLY reconcile-v2 rows with match_confidence in the high bucket
 *   (0.75-0.85) — the tier D020 actually audited (91.6% exact-shared-URL,
 *   remainder manually reviewed, 0 confirmed false merges). Ambiguous and
 *   insufficient-evidence tiers are never touched.
 * - Additive only: `insert ... on conflict (wedding_id, account_id, role) do
 *   nothing` — a pre-existing wedding_vendors row (Ben's own crawler data)
 *   is NEVER modified, not even its n_confirmations. Only genuinely new
 *   (wedding_id, account_id, role) triples get written.
 * - Provenance: every row actually inserted is also logged into
 *   jeremy_wedding_vendors_ingested (candidate_id, reconciliation_version,
 *   timestamp) — wedding_vendors itself has no provenance column, so this
 *   is the durable record of what this workstream contributed and why.
 * - Durability caveat (documented, not solved here): Ben's phase_dedup()
 *   truncates weddings/wedding_posts/wedding_vendors with RESTART IDENTITY
 *   CASCADE on every run. If that ever runs again, everything this script
 *   wrote to wedding_vendors is wiped along with wedding_id's own identity.
 *   Recovery is NOT automatic — the durable source of truth stays the
 *   Jeremy evidence/candidate/reconciliation layer, never wedding_vendors
 *   itself. Re-apply by: rerun runJeremyWeddingReconciliation.ts (which
 *   re-matches against Ben's NEW weddings), then rerun this script again —
 *   both are idempotent and safe to run repeatedly.
 * - Whole-run transaction: --dry-run rolls back at the end, so the exact
 *   same code path (including conflict resolution) is exercised without
 *   committing anything.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyJeremyEvidenceToGraph.ts --dry-run
 *   bun run scripts/graph/applyJeremyEvidenceToGraph.ts
 */
import { getPool, closePool } from "../classify/db";

const RECONCILIATION_VERSION = "reconcile-v2";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const { rows: matches } = await client.query<{ candidate_id: number; matched_wedding_id: number }>(
      `select candidate_id, matched_wedding_id
       from jeremy_wedding_candidate_reconciliation
       where reconciliation_version = $1 and match_confidence between 0.75 and 0.85
       order by candidate_id`,
      [RECONCILIATION_VERSION]
    );
    console.log(`[apply-graph] ${dryRun ? "DRY RUN — " : ""}${matches.length} high-confidence candidates (reconciliation_version=${RECONCILIATION_VERSION})`);

    let attempted = 0;
    let inserted = 0;
    let alreadyExisted = 0;

    for (const m of matches) {
      const { rows: vendors } = await client.query<{ account_id: number; role: string; n_confirmations: number }>(
        `select account_id, role, n_confirmations from jeremy_wedding_candidate_vendors where candidate_id = $1`,
        [m.candidate_id]
      );

      for (const v of vendors) {
        attempted++;
        const { rows: insertedRows } = await client.query(
          `insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)
           values ($1, $2, $3::vendor_role, $4)
           on conflict (wedding_id, account_id, role) do nothing
           returning wedding_id`,
          [m.matched_wedding_id, v.account_id, v.role, v.n_confirmations]
        );

        if (insertedRows.length > 0) {
          inserted++;
          await client.query(
            `insert into jeremy_wedding_vendors_ingested
               (wedding_id, account_id, role, n_confirmations, candidate_id, reconciliation_version)
             values ($1, $2, $3::vendor_role, $4, $5, $6)
             on conflict (wedding_id, account_id, role, reconciliation_version) do nothing`,
            [m.matched_wedding_id, v.account_id, v.role, v.n_confirmations, m.candidate_id, RECONCILIATION_VERSION]
          );
        } else {
          alreadyExisted++;
        }
      }
    }

    console.log(`[apply-graph] attempted=${attempted} inserted=${inserted} already-existed=${alreadyExisted}`);

    if (!dryRun) {
      await client.query("refresh materialized view edges");
      console.log("[apply-graph] refreshed materialized view edges");
    }

    if (dryRun) {
      await client.query("rollback");
      console.log("[apply-graph] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("[apply-graph] COMMITTED");
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
