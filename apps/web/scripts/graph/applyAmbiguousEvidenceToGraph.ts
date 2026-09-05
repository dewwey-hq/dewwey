/**
 * Applies the audited-safe slice of the ambiguous Jeremy reconciliation
 * tier into Ben's live wedding_vendors. Same safety pattern as
 * applyJeremyEvidenceToGraph.ts (D023); different scope.
 *
 * Scope: ONLY the 9 candidates this audit judged safe —
 *   5 exact-shared-post-URL (auto-confirmed, D020 rule)
 *   4 GREEN remainder (handle-diff, date ≤ 14d, strong overlap)
 * The other 259 of the 268 (109 YELLOW + 150 RED) are never touched.
 * Cannot use a confidence-band filter: every ambiguous row is 0.4.
 *
 * Safety properties (copied from D023, not relaxed):
 * - Additive only: `insert ... on conflict (wedding_id, account_id, role) do
 *   nothing` — a pre-existing wedding_vendors row is NEVER modified.
 * - Provenance: every row actually inserted is logged into
 *   jeremy_wedding_vendors_ingested (reuse the D023 table; candidate_id
 *   distinguishes this write from the 143-tier write).
 * - Whole-run transaction: --dry-run rolls back at the end.
 * - Per-row logging: every attempted insert is printed so the dry-run can
 *   be read in full by hand (Case A's lesson — a count hides precision bugs).
 *
 * D030 (2026-09-04): **do not run the live write.** User reviewed the dry-run
 * (11 INSERT / 69 SKIP, all role-variants of accounts already on those
 * weddings) and declined. This file is the audit artifact + the exact
 * allowlist; keep it, but do not reverse D030 without a new decision.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyAmbiguousEvidenceToGraph.ts --dry-run
 *   bun run scripts/graph/applyAmbiguousEvidenceToGraph.ts   # declined — D030
 */
import { getPool, closePool } from "../classify/db";

const RECONCILIATION_VERSION = "reconcile-v2";

// Exact-URL: 925, 2670, 2713, 2715, 2823. GREEN remainder: 341, 1819, 2277, 2860.
const SAFE_CANDIDATE_IDS = [341, 925, 1819, 2277, 2670, 2713, 2715, 2823, 2860];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const { rows: matches } = await client.query<{
      candidate_id: string | number;
      matched_wedding_id: string | number;
    }>(
      `select candidate_id, matched_wedding_id
       from jeremy_wedding_candidate_reconciliation
       where reconciliation_version = $1
         and matched_wedding_id is not null
         and candidate_id = any($2::bigint[])
       order by candidate_id`,
      [RECONCILIATION_VERSION, SAFE_CANDIDATE_IDS]
    );
    console.log(
      `[apply-ambiguous] ${dryRun ? "DRY RUN — " : ""}${matches.length} audited-safe candidates (reconciliation_version=${RECONCILIATION_VERSION}; allowlist=${SAFE_CANDIDATE_IDS.length})`
    );
    if (matches.length !== SAFE_CANDIDATE_IDS.length) {
      console.log(
        `[apply-ambiguous] WARNING: expected ${SAFE_CANDIDATE_IDS.length} matches, got ${matches.length}`
      );
    }

    let attempted = 0;
    let inserted = 0;
    let alreadyExisted = 0;

    for (const m of matches) {
      const candidateId = Number(m.candidate_id);
      const weddingId = Number(m.matched_wedding_id);
      const { rows: vendors } = await client.query<{
        account_id: string | number;
        role: string;
        n_confirmations: number;
        username: string;
      }>(
        `select cv.account_id, cv.role, cv.n_confirmations, a.username
         from jeremy_wedding_candidate_vendors cv
         join accounts a on a.id = cv.account_id
         where cv.candidate_id = $1
         order by cv.role, a.username`,
        [candidateId]
      );

      for (const v of vendors) {
        attempted++;
        const accountId = Number(v.account_id);
        const { rows: insertedRows } = await client.query(
          `insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)
           values ($1, $2, $3::vendor_role, $4)
           on conflict (wedding_id, account_id, role) do nothing
           returning wedding_id`,
          [weddingId, accountId, v.role, v.n_confirmations]
        );

        if (insertedRows.length > 0) {
          inserted++;
          await client.query(
            `insert into jeremy_wedding_vendors_ingested
               (wedding_id, account_id, role, n_confirmations, candidate_id, reconciliation_version)
             values ($1, $2, $3::vendor_role, $4, $5, $6)
             on conflict (wedding_id, account_id, role, reconciliation_version) do nothing`,
            [weddingId, accountId, v.role, v.n_confirmations, candidateId, RECONCILIATION_VERSION]
          );
          console.log(
            `[apply-ambiguous]   INSERT wedding=${weddingId} cand=${candidateId} @${v.username} role=${v.role} n_confirmations=${v.n_confirmations}`
          );
        } else {
          alreadyExisted++;
          console.log(
            `[apply-ambiguous]   SKIP  wedding=${weddingId} cand=${candidateId} @${v.username} role=${v.role} (already in wedding_vendors)`
          );
        }
      }
    }

    console.log(`[apply-ambiguous] attempted=${attempted} inserted=${inserted} already-existed=${alreadyExisted}`);

    if (!dryRun) {
      await client.query("refresh materialized view edges");
      console.log("[apply-ambiguous] refreshed materialized view edges");
    }

    if (dryRun) {
      await client.query("rollback");
      console.log("[apply-ambiguous] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("[apply-ambiguous] COMMITTED");
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
