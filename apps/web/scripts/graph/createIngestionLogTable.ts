/**
 * One-time DDL: creates jeremy_wedding_vendors_ingested, the durable
 * provenance log for graph ingestion (D023). A brand-new, additive table —
 * does NOT alter wedding_vendors or any other existing table's schema.
 *
 * wedding_id is deliberately NOT a foreign key, same reasoning as
 * jeremy_wedding_candidate_reconciliation.matched_wedding_id: Ben's
 * weddings.id is not stable across a future phase_dedup() truncate-rebuild
 * (RESTART IDENTITY CASCADE). reconciliation_version is part of the PK so a
 * future re-application (after a rebuild forces re-reconciliation under a
 * new version) produces distinguishable, non-colliding audit rows.
 *
 * Usage (from apps/web): bun run scripts/graph/createIngestionLogTable.ts
 */
import { getPool, closePool } from "../classify/db";

async function main() {
  const pool = getPool();
  await pool.query(`
    create table if not exists jeremy_wedding_vendors_ingested (
      wedding_id             bigint not null,
      account_id             bigint not null references accounts(id),
      role                   vendor_role not null,
      n_confirmations        integer not null,
      candidate_id           bigint not null references jeremy_wedding_candidates(id),
      reconciliation_version text not null,
      ingested_at            timestamptz not null default now(),
      primary key (wedding_id, account_id, role, reconciliation_version)
    )
  `);
  console.log("[create-ingestion-log] jeremy_wedding_vendors_ingested ready");
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
