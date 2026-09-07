/**
 * One-off, idempotent apply of the human-confirmed-evidence schema addition
 * (see pipeline/schema.sql, "Human-confirmed-evidence" section and the
 * chicago_status column on jeremy_wedding_candidates) directly to Supabase.
 * Safe to re-run: CREATE VIEW / CREATE OR REPLACE VIEW, and the ALTER TABLE
 * ADD COLUMN IF NOT EXISTS.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyHumanConfirmedEvidenceSchema.ts
 */
import { getPool, closePool } from "../classify/db";

const STATEMENTS: string[] = [
  `create or replace view human_confirmed_post_vendor_evidence as
   select
     latest.source_post_url,
     a.id as account_id,
     latest.role,
     latest.role_raw,
     latest.line_no,
     latest.parser_version,
     cs.score as candidate_score,
     cs.candidate_generation_version
   from (
     select distinct on (post_url, line_no, handle)
       post_url as source_post_url, line_no, handle, role, role_raw, stack_parser_version as parser_version
     from stack_extraction_entries
     order by post_url, line_no, handle, extracted_at desc
   ) latest
   join accounts a on lower(a.username::text) = latest.handle
   left join candidate_scores cs on cs.post_url = latest.source_post_url
     and cs.candidate_generation_version = 'candidate-score-v1'
   where latest.role <> 'other'
     and exists (
       select 1 from golden_set gs
       where gs.post_url = latest.source_post_url and gs.expected_decision = 'INCLUDE'
     );`,
  `alter table jeremy_wedding_candidates
     add column if not exists chicago_status text
     check (chicago_status in ('CHICAGO_CONFIRMED','CHICAGO_NOT_CONFIRMED','CHICAGO_AMBIGUOUS'));`,
  `create or replace view jeremy_wedding_candidate_vendors as
   select
     cp.candidate_id, e.account_id, e.role,
     count(distinct e.source_post_url) as n_confirmations,
     array_agg(distinct e.source_post_url) as source_post_urls
   from jeremy_wedding_candidate_posts cp
   join jeremy_post_vendor_evidence e on e.source_post_url = cp.source_post_url
   group by cp.candidate_id, e.account_id, e.role
   union all
   select
     cp.candidate_id, e.account_id, e.role,
     count(distinct e.source_post_url) as n_confirmations,
     array_agg(distinct e.source_post_url) as source_post_urls
   from jeremy_wedding_candidate_posts cp
   join human_confirmed_post_vendor_evidence e on e.source_post_url = cp.source_post_url
   where not exists (
     select 1 from jeremy_post_vendor_evidence jpve where jpve.source_post_url = cp.source_post_url
   )
   group by cp.candidate_id, e.account_id, e.role;`,
  `comment on view human_confirmed_post_vendor_evidence is 'DERIVED: vendor-credit evidence from golden_set-confirmed (human) WEDDING posts, independent of candidate_scores/V3 -- deliberately separate from jeremy_post_vendor_evidence, not unioned';`,
  `comment on column jeremy_wedding_candidates.chicago_status is 'Explicit tri-state (CHICAGO_CONFIRMED|CHICAGO_NOT_CONFIRMED|CHICAGO_AMBIGUOUS), only populated for human-confirmed-sourced candidates; null = resolved upstream by V3 already';`,
];

async function main() {
  const pool = getPool();
  for (const [i, sql] of STATEMENTS.entries()) {
    await pool.query(sql);
    console.log(`[apply-schema] statement ${i + 1}/${STATEMENTS.length} ok`);
  }
  console.log("[apply-schema] done");
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
