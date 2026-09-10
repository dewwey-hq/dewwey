/**
 * One-off, idempotent apply of the Phase 2 reader schema addition
 * (see pipeline/schema.sql, `post_extraction_runs`) directly to Supabase.
 * Same pattern as applyHumanLabelingSchema.ts -- this repo has no
 * migrations mechanism, schema.sql is the single hand-maintained source,
 * applied by a script when ready. Safe to re-run: table/index are IF NOT
 * EXISTS, columns are ADD COLUMN IF NOT EXISTS.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/applyPostExtractionSchema.ts
 */
import { getPool, closePool } from "./db";

const STATEMENTS: string[] = [
  `create table if not exists post_extraction_runs (
     post_url               text not null,
     candidate_id           bigint,
     prompt_version         text not null,
     model                  text,
     result                 jsonb not null,
     confidence             real,
     verdict                text,
     corrected_venue_handle text,
     input_tokens           integer,
     output_tokens          integer,
     cost_usd               numeric,
     created_at             timestamptz not null default now(),
     primary key (post_url, prompt_version)
   );`,
  `create index if not exists idx_post_extraction_runs_candidate on post_extraction_runs(candidate_id);`,
  `create index if not exists idx_post_extraction_runs_verdict on post_extraction_runs(verdict);`,
  `comment on table post_extraction_runs is 'RAW (D055 Phase 2, extract-v1): one row per (post_url, prompt_version) LLM extraction attempt from runExtract.ts -- upserted on rerun under the SAME prompt_version (idempotent refresh), a NEW prompt_version inserts fresh rows. result is the full structured tool-call output (see extractPrompt.ts ExtractResult); verdict/confidence/corrected_venue_handle are denormalized copies of result fields for cheap querying/reporting. This is NOT a verdict -- writing a real post_venue_verdicts row (reviewed_by=''haiku-extract-v1'') happens separately in runExtract.ts --write-verdicts, gated on confidence/threshold/handle-resolution (see decideVerdictWrite in extractPrompt.ts).';`,
  // D055 Phase 2 pool-b (2026-09-09): runExtract.ts --mode pool-b reads posts that have NO
  // jeremy_wedding_candidates row at all (wedding-language caption, zero venue anchor of any
  // kind) -- there is no candidate_id to attach these runs to. candidate_id was already nullable
  // (no NOT NULL constraint) both here and live in Supabase -- verified 2026-09-09, nothing to
  // relax. `pool` is the new bit: null for every calibration/corpus/venue-calibration row (past
  // and future), 'pool-b' only for pool-b's rows, so downstream work can select pool-b's
  // discovery output back out without a prompt_version-based heuristic.
  `alter table post_extraction_runs add column if not exists pool text;`,
  `comment on column post_extraction_runs.pool is 'D055 pool-b (2026-09-09): null for calibration/corpus/venue-calibration rows; ''pool-b'' for runExtract.ts --mode pool-b rows (posts with candidate_id NULL -- wedding-language caption, no venue anchor, not already in jeremy_wedding_candidate_posts). Lets pool-b''s rows be selected back out of the shared table.';`,
  `create index if not exists idx_post_extraction_runs_pool on post_extraction_runs(pool) where pool is not null;`,
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
