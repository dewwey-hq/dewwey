/**
 * One-off, idempotent apply of `post_venue_verdicts` (+ `post_venue_verdicts_current`,
 * `candidate_review_derived`) -- pipeline/schema.sql, D055 post-per-screen review, 2026-09-08.
 * Replaces the never-used `candidate_review_decisions` as the active review surface behind
 * /label/candidates: review moves from one decision per candidate to one verdict per POST (the
 * proven /label flow), and `candidate_review_derived` assembles the candidate-level decision
 * `createWeddingsFromJeremyEvidence.ts --from-confirmed-candidates` needs from those per-post
 * verdicts. Same append-only, latest-wins discipline as human_post_labels/candidate_review_decisions.
 * Purely additive -- CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / CREATE (OR REPLACE)
 * VIEW, safe to rerun. candidate_review_decisions itself is untouched (left in place, unused).
 *
 * Also applies the D055 addendum (2026-09-08): `post_venue_verdicts.notes` (optional reviewer
 * note, e.g. a structured N reason or a free note attached via the / key -- see schema.sql's tail
 * comment for the full WHY). ADD COLUMN IF NOT EXISTS, safe to rerun.
 *
 * Same dry-run/commit shape as applyCandidateReviewSchema.ts: everything runs inside one
 * transaction, rolled back under --dry-run, committed otherwise.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyPostVenueVerdictSchema.ts --dry-run
 *   bun run scripts/graph/applyPostVenueVerdictSchema.ts
 */
import { getPool, closePool } from "../classify/db";

const CREATE_TABLE = `
  create table if not exists post_venue_verdicts (
    id bigint generated always as identity primary key,
    post_url text not null,
    candidate_id bigint not null references jeremy_wedding_candidates(id),
    venue_account_id bigint references accounts(id),
    verdict text not null check (verdict in ('THIS_VENUE','OTHER_VENUE','NOT_WEDDING','DUPLICATE','UNSURE','SKIP')),
    corrected_venue_account_id bigint references accounts(id),
    duplicate_of_wedding_id bigint references weddings(id),
    reviewed_by text not null,
    client_ms integer,
    reviewed_at timestamptz not null default now()
  );`;

const CREATE_INDEXES = [
  `create index if not exists idx_post_venue_verdicts_candidate on post_venue_verdicts(candidate_id);`,
  `create index if not exists idx_post_venue_verdicts_post on post_venue_verdicts(post_url);`,
];

// D055 addendum (2026-09-08): optional reviewer notes -- see pipeline/schema.sql's tail comment
// for the full WHY. Additive, idempotent (add column if not exists), safe to rerun.
const ADD_NOTES_COLUMN = `
  alter table post_venue_verdicts add column if not exists notes text;`;
const COMMENT_NOTES_COLUMN = `
  comment on column post_venue_verdicts.notes is 'D055 addendum: optional reviewer note, e.g. a structured N reason (styled_shoot/marketing/other_event/other, optionally ": free text") or a free note attached via the / key. Carries through to human_post_labels.notes -> golden_set.notes on sync.';`;

// create or replace view is safe to rerun (and, unlike a table, doesn't need an existence guard).
const CREATE_CURRENT_VIEW = `
  create or replace view post_venue_verdicts_current as
    select distinct on (post_url) *
    from post_venue_verdicts
    order by post_url, reviewed_at desc;`;

const CREATE_DERIVED_VIEW = `
  create or replace view candidate_review_derived as
    select c.id as candidate_id,
      case when bool_or(v.verdict='THIS_VENUE') then 'CONFIRM'
           when bool_or(v.verdict='OTHER_VENUE') then 'WRONG_VENUE'
           when bool_or(v.verdict='DUPLICATE') then 'DUPLICATE'
           when bool_and(v.verdict='NOT_WEDDING') then 'NOT_WEDDING'
           else 'UNSURE' end as decision,
      (array_agg(v.corrected_venue_account_id) filter (where v.verdict='OTHER_VENUE'))[1] as corrected_venue_account_id,
      (array_agg(v.duplicate_of_wedding_id) filter (where v.verdict='DUPLICATE'))[1] as duplicate_of_wedding_id,
      array_agg(v.post_url) filter (where v.verdict='THIS_VENUE') as included_post_urls,
      array_agg(v.post_url) filter (where v.verdict='OTHER_VENUE') as other_venue_post_urls,
      count(*) filter (where v.verdict not in ('SKIP')) as posts_decided,
      (select count(*) from jeremy_wedding_candidate_posts cp where cp.candidate_id=c.id) as posts_total,
      max(v.reviewed_by) as reviewed_by, max(v.reviewed_at) as reviewed_at
    from jeremy_wedding_candidates c
    join post_venue_verdicts_current v on v.candidate_id=c.id
    group by c.id;`;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(CREATE_TABLE);
    for (const idx of CREATE_INDEXES) await client.query(idx);
    await client.query(ADD_NOTES_COLUMN);
    await client.query(COMMENT_NOTES_COLUMN);
    await client.query(CREATE_CURRENT_VIEW);
    await client.query(CREATE_DERIVED_VIEW);

    const { rows: countRows } = await client.query<{ n: string }>(
      `select count(*) as n from post_venue_verdicts`
    );
    const { rows: derivedRows } = await client.query<{ n: string }>(
      `select count(*) as n from candidate_review_derived`
    );
    const { rows: sanityRows } = await client.query<{ n: string }>(
      `select count(*) as n from candidate_review_decisions`
    );
    console.log(
      `[post-venue-verdict-schema] ${dryRun ? "DRY RUN — " : ""}post_venue_verdicts has ${countRows[0].n} row(s), ` +
        `candidate_review_derived resolves ${derivedRows[0].n} candidate(s), ` +
        `candidate_review_decisions (superseded, untouched) has ${sanityRows[0].n} row(s)`
    );

    if (dryRun) {
      await client.query("rollback");
      console.log("[post-venue-verdict-schema] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("[post-venue-verdict-schema] COMMITTED");
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
