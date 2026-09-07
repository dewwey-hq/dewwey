/**
 * Runs the same stack parser as runStackParserBaseline.ts, but over
 * golden_set-confirmed (human) WEDDING posts that have never had extraction
 * run at all -- regardless of candidate_scores.score. This is the first
 * stage of the human-confirmed-evidence pipeline (see
 * docs/engineering/human-labeling/README.md): a post below the score>=12
 * cutoff, or one V3 EXCLUDEd/REVIEWed, has never once had this parser run
 * on it, purely because runStackParserBaseline.ts's own population query
 * gates on score>=12 -- not because the post isn't a real, human-confirmed
 * wedding.
 *
 * Writes into the SAME append-only stack_extraction_runs/
 * stack_extraction_entries tables runStackParserBaseline.ts uses -- no
 * schema change needed for this step. `decision` is recorded as
 * 'HUMAN_INCLUDE' (a new, self-describing value; the column is free text,
 * no CHECK constraint) so these rows stay distinguishable from V3's own
 * INCLUDE/EXCLUDE/REVIEW/UNCLASSIFIED values.
 *
 * Idempotent: only ever selects posts with zero existing
 * stack_extraction_entries rows, so a rerun after new labels land only
 * processes the newly-added ones.
 *
 * Usage (from apps/web): bun run scripts/graph/runStackParserOnGoldenSet.ts
 */
import { getPool, closePool } from "../classify/db";
import { parseCaption, STACK_PARSER_VERSION } from "./stackParser";

async function main() {
  const pool = getPool();
  const { rows } = await pool.query<{
    post_url: string;
    caption_raw: string | null;
    candidate_score: number | null;
  }>(
    `select sp.post_url, sp.caption_raw, cs.score as candidate_score
     from golden_set gs
     join staging.instagram_posts sp on sp.post_url = gs.post_url
     left join candidate_scores cs on cs.post_url = sp.post_url
       and cs.candidate_generation_version = 'candidate-score-v1'
     where gs.expected_decision = 'INCLUDE'
       and not exists (
         -- Checking stack_extraction_RUNS, not _entries: a post can have a
         -- legitimate prior run with has_stack=false (zero entries) --
         -- checking _entries alone would re-select it forever and silently
         -- overwrite its stack_extraction_runs.decision (originally the
         -- real V3 decision, if it scored >=12) with 'HUMAN_INCLUDE' via
         -- the upsert below. Confirmed live: this exact bug corrupted 60
         -- rows' decision column before this fix (repaired separately,
         -- recovered from post_classification_runs, which this script
         -- never touches).
         select 1 from stack_extraction_runs sr
         where sr.post_url = sp.post_url and sr.stack_parser_version = $1
       )`,
    [STACK_PARSER_VERSION]
  );
  console.log(`[stack-golden-set] version=${STACK_PARSER_VERSION} posts=${rows.length}`);

  let processed = 0;
  let withStack = 0;
  for (const row of rows) {
    const { stack, has_stack } = parseCaption(row.caption_raw);
    const distinctRoles = new Set(stack.map((s) => s.role)).size;
    if (has_stack) withStack++;

    await pool.query(
      `insert into stack_extraction_runs
         (post_url, stack_parser_version, decision, candidate_score, has_stack, distinct_role_count, entry_count)
       values ($1,$2,'HUMAN_INCLUDE',$3,$4,$5,$6)
       on conflict (post_url, stack_parser_version) do update set
         decision = excluded.decision, candidate_score = excluded.candidate_score,
         has_stack = excluded.has_stack, distinct_role_count = excluded.distinct_role_count,
         entry_count = excluded.entry_count, extracted_at = now()`,
      [row.post_url, STACK_PARSER_VERSION, row.candidate_score, has_stack, distinctRoles, stack.length]
    );

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
    if (processed % 100 === 0) console.log(`[stack-golden-set] ${processed}/${rows.length}`);
  }

  console.log(`[stack-golden-set] DONE -- processed ${processed} posts, ${withStack} had a parseable credit stack`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
