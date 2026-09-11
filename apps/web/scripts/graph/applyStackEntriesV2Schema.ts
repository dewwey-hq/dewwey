/**
 * One-off, idempotent apply of the D056 stage-1 parser-v10 tables (pipeline/schema.sql) directly
 * to Supabase: stack_extraction_entries_v2 / stack_extraction_runs_v2. Purely ADDITIVE -- these
 * are new tables alongside the existing stack_extraction_entries/stack_extraction_runs (v1-v9,
 * see stackParser.ts's STACK_PARSER_VERSION), which are never touched. Same "300s statement
 * timeout, batch inserts, additive re-parse" discipline the D056 stage-1 task set for this whole
 * piece -- see docs/decisions.md D056 and runStackParserV10.ts (the writer).
 *
 * role on stack_extraction_entries_v2 holds either a VENDOR_ROLES slug (scripts/graph/
 * vendorRoleRules.ts, e.g. 'photographer', 'other', 'noise') or 'participant:<role>' for a row
 * that came from a participant label (bride/groom/couple/...) -- see runStackParserV10.ts for how
 * ParsedStackV2's `participants` array gets that prefix at write time. Kept as one column (not a
 * separate table) so a single index on `role` covers both without a UNION.
 *
 * `create table if not exists` makes a rerun a no-op, same idempotency bar as every other apply
 * script in this directory.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyStackEntriesV2Schema.ts              # same as --dry-run
 *   bun run scripts/graph/applyStackEntriesV2Schema.ts --dry-run    # prints SQL, no write
 *   bun run scripts/graph/applyStackEntriesV2Schema.ts --apply      # actually runs it
 */
import { getPool, closePool } from "../classify/db";

const STATEMENTS: string[] = [
  `create table if not exists stack_extraction_entries_v2 (
     post_url       text not null,
     parser_version text not null,
     line_no        int not null,
     label_raw      text not null,
     handle         text not null,
     role           text not null,
     event_context  text not null default 'wedding_day',
     source         text not null,
     rule_id        text,
     extracted_at   timestamptz default now()
   );`,
  `comment on table stack_extraction_entries_v2 is 'D056 stage 1 (parser v10, stack-parser-ts-v10): one row per (post, credit-line, role, handle) using the D056 two-level taxonomy (vendorRoleRules.ts classifyLabel()), NOT the v1-v9 23-value normRole() map. role is a VENDOR_ROLES slug or participant:<role> for a participant-label row (bride/groom/couple/host_family/model/muse -- never a vendor). event_context is the phase (wedding_day/ceremony/reception/getting_ready/rehearsal_dinner/...). source is credit_line/inline_at/venue_hashtag/emoji_line. Additive alongside stack_extraction_entries (v1-v9) -- that table is never modified. See docs/decisions.md D056, scripts/graph/runStackParserV10.ts.';`,
  `create index if not exists idx_stack_extraction_entries_v2_post_version on stack_extraction_entries_v2 (post_url, parser_version);`,
  `create index if not exists idx_stack_extraction_entries_v2_handle on stack_extraction_entries_v2 (handle);`,
  `create index if not exists idx_stack_extraction_entries_v2_role on stack_extraction_entries_v2 (role);`,
  `create table if not exists stack_extraction_runs_v2 (
     post_url               text not null,
     parser_version         text not null,
     has_stack              boolean not null,
     n_credits              int not null,
     non_wedding_event_title text,
     parsed_at              timestamptz default now(),
     primary key (post_url, parser_version)
   );`,
  `comment on table stack_extraction_runs_v2 is 'D056 stage 1 (parser v10): one row per (post, parser_version) -- has_stack mirrors v9''s >=1-credit-line notion (NOT v9''s >=3-distinct-role has_stack), n_credits is stack_extraction_entries_v2''s row count for this post+version, non_wedding_event_title is set when the caption reads as a non-wedding event (baby/bridal shower, birthday, ...) with no wedding-recap signal alongside it -- flagged, not dropped. Written by runStackParserV10.ts, resumable (skips post_urls already present under the running parser_version). See docs/decisions.md D056.';`,
];

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = getPool();

  if (!apply) {
    console.log(`[apply-stack-entries-v2] DRY RUN (pass --apply to execute) -- ${STATEMENTS.length} statement(s):\n`);
    for (const [i, sql] of STATEMENTS.entries()) {
      console.log(`-- statement ${i + 1}/${STATEMENTS.length}\n${sql}\n`);
    }
    await closePool();
    return;
  }

  await pool.query(`set statement_timeout='300s'`);
  for (const [i, sql] of STATEMENTS.entries()) {
    await pool.query(sql);
    console.log(`[apply-stack-entries-v2] statement ${i + 1}/${STATEMENTS.length} ok`);
  }
  const { rows: entryRows } = await pool.query<{ n: string }>(`select count(*) as n from stack_extraction_entries_v2`);
  const { rows: runRows } = await pool.query<{ n: string }>(`select count(*) as n from stack_extraction_runs_v2`);
  console.log(`[apply-stack-entries-v2] stack_extraction_entries_v2: ${entryRows[0].n} rows, stack_extraction_runs_v2: ${runRows[0].n} rows`);
  console.log("[apply-stack-entries-v2] done");
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
