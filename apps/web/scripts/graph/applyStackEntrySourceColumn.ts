/**
 * One-off, idempotent apply of `stack_extraction_entries.source` (pipeline/schema.sql, D055,
 * 2026-09-08 -- Phase 0 step 2). Additive column with a default ('credit_line'), so this is safe
 * to run against the live table -- every existing row backfills correctly with no re-parse, and
 * stackParser.ts v8 / runStackParserBaseline.ts start writing real 'inline_at'/'venue_hashtag'
 * values on the next (ungated, real, not dry-run) parser run.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyStackEntrySourceColumn.ts --dry-run
 *   bun run scripts/graph/applyStackEntrySourceColumn.ts
 */
import { getPool, closePool } from "../classify/db";

const ALTER = `alter table stack_extraction_entries add column if not exists source text not null default 'credit_line';`;
const COMMENT = `comment on column stack_extraction_entries.source is 'D055: which pattern produced this entry -- credit_line (labeled "Label: @handle" line, v1-v7 behavior), inline_at (v8, caption-prose "at @handle"), or venue_hashtag (v8, known-venue "#handlewedding"-shaped hashtag). Lets precision be measured per pattern before it is trusted like a labeled credit.';`;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows: before } = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'stack_extraction_entries' and column_name = 'source'`
    );
    console.log(`[stack-entry-source-column] source column already exists: ${before.length > 0}`);

    await client.query(ALTER);
    await client.query(COMMENT);

    const { rows: after } = await client.query<{ column_name: string; data_type: string; column_default: string | null; is_nullable: string }>(
      `select column_name, data_type, column_default, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'stack_extraction_entries' and column_name = 'source'`
    );
    console.log(`[stack-entry-source-column] after apply:`, after[0]);

    const { rows: counts } = await client.query<{ source: string; n: string }>(
      `select source, count(*) as n from stack_extraction_entries group by source order by source`
    );
    console.log(`[stack-entry-source-column] current row counts by source:`, counts);

    if (dryRun) {
      await client.query("rollback");
      console.log("[stack-entry-source-column] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("[stack-entry-source-column] COMMITTED");
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
