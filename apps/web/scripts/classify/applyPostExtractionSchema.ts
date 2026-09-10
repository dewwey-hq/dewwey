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
