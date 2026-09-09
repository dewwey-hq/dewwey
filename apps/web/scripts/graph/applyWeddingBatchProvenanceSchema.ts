/**
 * One-off, idempotent apply of the D055 batch-provenance/reversibility schema
 * (pipeline/schema.sql, appended 2026-09-08): `jeremy_weddings_created.batch_id` +
 * its index, and the new `weddings_retired_batches` table (mirrors
 * `orphaned_weddings_retired`'s provenance-on-delete shape). See pipeline/schema.sql
 * for the full WHY comment -- this script just applies exactly that SQL.
 *
 * Same dry-run/commit shape as applyAccountAliasesSchema.ts: --dry-run prints the SQL
 * and rolls back inside a transaction (so it also validates against the live DB, not
 * just a string print); with no flag it applies for real inside a transaction.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyWeddingBatchProvenanceSchema.ts --dry-run
 *   bun run scripts/graph/applyWeddingBatchProvenanceSchema.ts
 */
import { getPool, closePool } from "../classify/db";

const STATEMENTS: { label: string; sql: string }[] = [
  {
    label: "alter jeremy_weddings_created add column batch_id",
    sql: `alter table jeremy_weddings_created add column if not exists batch_id text`,
  },
  {
    label: "comment on jeremy_weddings_created.batch_id",
    sql: `comment on column jeremy_weddings_created.batch_id is 'D055: which createWeddingsFromJeremyEvidence.ts invocation created this row (required on every run from 2026-09-08 onward; suggested format d055-<source>-<YYYY-MM-DD>-<n>). NULL on rows created before batch identity existed. Lets revertWeddingBatch.ts undo one creation run as a unit.'`,
  },
  {
    label: "index jeremy_weddings_created(batch_id)",
    sql: `create index if not exists idx_jeremy_weddings_created_batch_id on jeremy_weddings_created(batch_id)`,
  },
  {
    label: "create table weddings_retired_batches",
    sql: `create table if not exists weddings_retired_batches (
      id                     bigint generated always as identity primary key,
      batch_id               text not null,
      wedding_id             bigint not null,
      venue_id               bigint,
      event_date_est         date,
      is_chicago             boolean,
      wedding_created_at     timestamptz,
      candidate_id           bigint,
      post_ids               bigint[],
      vendor_account_ids     bigint[],
      removed_posts_imported bigint[],
      reason                 text not null,
      retired_at             timestamptz not null default now()
    )`,
  },
  {
    label: "comment on table weddings_retired_batches",
    sql: `comment on table weddings_retired_batches is 'D055: one row per wedding removed by revertWeddingBatch.ts, mirroring orphaned_weddings_retired''s provenance-on-delete shape. removed_posts_imported is the subset of post_ids whose posts row (source=jeremy_evidence) was deleted because no other wedding_posts row referenced it after this wedding was removed.'`,
  },
  {
    label: "index weddings_retired_batches(batch_id)",
    sql: `create index if not exists idx_weddings_retired_batches_batch_id on weddings_retired_batches(batch_id)`,
  },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    console.log(`[wedding-batch-provenance-schema] mode: ${dryRun ? "DRY RUN (will roll back)" : "APPLY (will commit)"}`);
    for (const { label, sql } of STATEMENTS) {
      console.log(`\n[wedding-batch-provenance-schema] -- ${label} --\n${sql};`);
      await client.query(sql);
    }

    const { rows: colCheck } = await client.query(`
      select column_name, data_type from information_schema.columns
      where table_name = 'jeremy_weddings_created' and column_name = 'batch_id'
    `);
    const { rows: tableCheck } = await client.query(`
      select count(*)::int as n from weddings_retired_batches
    `);
    console.log("\n[wedding-batch-provenance-schema] verification (within transaction):");
    console.log("  jeremy_weddings_created.batch_id column:", colCheck);
    console.log("  weddings_retired_batches row count:", tableCheck[0].n);

    if (dryRun) {
      await client.query("rollback");
      console.log("\n[wedding-batch-provenance-schema] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("\n[wedding-batch-provenance-schema] COMMITTED");
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
