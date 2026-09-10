/**
 * One-off, idempotent apply of `jeremy_wedding_post_attachments` -- pipeline/schema.sql, D055
 * (2026-09-09). Provenance table for `createWeddingsFromJeremyEvidence.ts --from-golden-legacy`'s
 * ATTACH sub-case: a golden_set INCLUDE post whose legacy-clustering-version candidate already
 * reconciled to an EXISTING wedding gets attached there, not created fresh -- `jeremy_weddings_
 * created` is reserved for weddings this script actually creates (see that table's own comment
 * and revertWeddingBatch.ts, which deletes wholesale off it), so attach-only rows get this
 * parallel table instead. See pipeline/schema.sql's own comment on the table for the full
 * reasoning and the by-hand revert procedure (revertWeddingBatch.ts is NOT extended to read this
 * table).
 *
 * Same dry-run/commit shape as applyPostVenueVerdictSchema.ts: everything runs inside one
 * transaction, rolled back under --dry-run, committed otherwise. Purely additive -- CREATE TABLE
 * IF NOT EXISTS / CREATE INDEX IF NOT EXISTS -- safe to rerun.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyWeddingPostAttachmentSchema.ts --dry-run
 *   bun run scripts/graph/applyWeddingPostAttachmentSchema.ts
 */
import { getPool, closePool } from "../classify/db";

const CREATE_TABLE = `
  create table if not exists jeremy_wedding_post_attachments (
    batch_id      text not null,
    wedding_id    bigint not null,
    post_id       bigint not null,
    candidate_id  bigint not null,
    attached_at   timestamptz not null default now(),
    primary key (batch_id, post_id)
  );`;

const COMMENT_TABLE = `
  comment on table jeremy_wedding_post_attachments is 'D055 (2026-09-09): provenance for createWeddingsFromJeremyEvidence.ts --from-golden-legacy''s ATTACH sub-case (post''s legacy candidate already reconciled to an existing wedding) -- distinct from jeremy_weddings_created, which is strictly "weddings this script created" and is what revertWeddingBatch.ts deletes wholesale. wedding_id/post_id/candidate_id are deliberately NOT foreign keys, same "not stable across a future rebuild, log the value not the reference" reasoning as jeremy_weddings_created.wedding_id and weddings_retired_batches.wedding_id. Reverting an attach batch is NOT handled by revertWeddingBatch.ts (out of scope) -- do it by hand: delete the wedding_posts row for each logged (wedding_id, post_id) pair, and the posts row too only if source=''jeremy_evidence'' and no other wedding_posts row references it; never delete the weddings row itself.';`;

const CREATE_INDEXES = [
  `create index if not exists idx_jeremy_wedding_post_attachments_batch on jeremy_wedding_post_attachments(batch_id);`,
  `create index if not exists idx_jeremy_wedding_post_attachments_wedding on jeremy_wedding_post_attachments(wedding_id);`,
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(CREATE_TABLE);
    await client.query(COMMENT_TABLE);
    for (const idx of CREATE_INDEXES) await client.query(idx);

    const { rows: countRows } = await client.query<{ n: string }>(
      `select count(*) as n from jeremy_wedding_post_attachments`
    );
    console.log(
      `[wedding-post-attachment-schema] ${dryRun ? "DRY RUN — " : ""}jeremy_wedding_post_attachments has ${countRows[0].n} row(s)`
    );

    if (dryRun) {
      await client.query("rollback");
      console.log("[wedding-post-attachment-schema] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("[wedding-post-attachment-schema] COMMITTED");
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
