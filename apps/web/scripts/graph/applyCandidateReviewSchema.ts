/**
 * One-off, idempotent apply of `candidate_review_decisions` (pipeline/schema.sql, D055 Phase 1
 * step 8, 2026-09-08) -- the append-only, latest-wins decision log behind the new
 * wedding-CANDIDATE-level review UI (/label/candidates). Same shape/discipline as
 * `human_post_labels`/`human_post_labels_current`: every review action is a new row, never an
 * update; `candidate_review_decisions_current` (a DISTINCT ON view) resolves to the latest
 * decision per candidate. Purely additive -- CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT
 * EXISTS / CREATE VIEW, safe to rerun.
 *
 * Same dry-run/commit shape as applyAccountAliasesSchema.ts: everything runs inside one
 * transaction, rolled back under --dry-run, committed otherwise.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyCandidateReviewSchema.ts --dry-run
 *   bun run scripts/graph/applyCandidateReviewSchema.ts
 */
import { getPool, closePool } from "../classify/db";

const CREATE_TABLE = `
  create table if not exists candidate_review_decisions (
    id bigint generated always as identity primary key,
    candidate_id bigint not null references jeremy_wedding_candidates(id),
    decision text not null check (decision in ('CONFIRM','WRONG_VENUE','NOT_WEDDING','DUPLICATE','UNSURE','SKIP')),
    corrected_venue_account_id bigint references accounts(id),
    duplicate_of_wedding_id bigint references weddings(id),
    notes text,
    reviewed_by text not null,
    client_ms integer,
    reviewed_at timestamptz not null default now()
  );`;

const CREATE_INDEX = `
  create index if not exists idx_candidate_review_decisions_candidate
    on candidate_review_decisions(candidate_id);`;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(CREATE_TABLE);
    await client.query(CREATE_INDEX);
    // Postgres has no `create view if not exists` -- guard by hand so a rerun is still a no-op.
    const { rows: existingView } = await client.query<{ exists: boolean }>(
      `select exists (select 1 from pg_views where viewname = 'candidate_review_decisions_current') as exists`
    );
    if (!existingView[0].exists) {
      await client.query(
        `create view candidate_review_decisions_current as
         select distinct on (candidate_id) *
         from candidate_review_decisions
         order by candidate_id, reviewed_at desc;`
      );
    }

    const { rows } = await client.query<{ n: string }>(
      `select count(*) as n from candidate_review_decisions`
    );
    console.log(
      `[candidate-review-schema] ${dryRun ? "DRY RUN — " : ""}candidate_review_decisions has ${rows[0].n} row(s)`
    );

    if (dryRun) {
      await client.query("rollback");
      console.log("[candidate-review-schema] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("[candidate-review-schema] COMMITTED");
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
