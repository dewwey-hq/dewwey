/**
 * Baseline measurement only — runs the ported stack parser (stackParser.ts)
 * over the candidate pool (score>=12) and persists results to
 * stack_extraction_runs/stack_extraction_entries. Does NOT write to
 * accounts/post_mentions/weddings/wedding_vendors/edges — this is
 * measurement, not graph ingestion. See the graph-strengthening task's
 * Phase 1 (baseline before any implementation change).
 *
 * Usage (from apps/web): bun run scripts/graph/runStackParserBaseline.ts
 */
import { getPool, closePool } from "../classify/db";
import { parseCaption, STACK_PARSER_VERSION } from "./stackParser";

async function main() {
  const pool = getPool();
  const { rows } = await pool.query<{
    post_url: string;
    caption_raw: string | null;
    decision: string;
    candidate_score: number;
  }>(
    `select sp.post_url, sp.caption_raw,
       coalesce(
         (select pc.decision::text from post_classification_runs pc
          where pc.post_url = sp.post_url and pc.classifier_version = 'v3'
          order by pc.classified_at desc limit 1),
         'UNCLASSIFIED'
       ) as decision,
       cs.score as candidate_score
     from staging.instagram_posts sp
     join candidate_scores cs on cs.post_url = sp.post_url
       and cs.candidate_generation_version = 'candidate-score-v1' and cs.score >= 12`
  );
  console.log(`[stack-baseline] version=${STACK_PARSER_VERSION} posts=${rows.length}`);

  let processed = 0;
  for (const row of rows) {
    const { stack, has_stack } = parseCaption(row.caption_raw);
    const distinctRoles = new Set(stack.map((s) => s.role)).size;

    await pool.query(
      `insert into stack_extraction_runs
         (post_url, stack_parser_version, decision, candidate_score, has_stack, distinct_role_count, entry_count)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (post_url, stack_parser_version) do update set
         decision = excluded.decision, candidate_score = excluded.candidate_score,
         has_stack = excluded.has_stack, distinct_role_count = excluded.distinct_role_count,
         entry_count = excluded.entry_count, extracted_at = now()`,
      [row.post_url, STACK_PARSER_VERSION, row.decision, row.candidate_score, has_stack, distinctRoles, stack.length]
    );

    // Idempotent: clear this post's prior entries under this version before re-inserting.
    await pool.query(`delete from stack_extraction_entries where post_url=$1 and stack_parser_version=$2`, [
      row.post_url,
      STACK_PARSER_VERSION,
    ]);
    for (const e of stack) {
      await pool.query(
        `insert into stack_extraction_entries (post_url, stack_parser_version, role_raw, role, handle, line_no)
         values ($1,$2,$3,$4,$5,$6)`,
        [row.post_url, STACK_PARSER_VERSION, e.role_raw, e.role, e.handle, e.line_no]
      );
    }
    processed++;
    if (processed % 1000 === 0) console.log(`[stack-baseline] ${processed}/${rows.length}`);
  }

  console.log(`[stack-baseline] DONE — processed ${processed} posts`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
