/**
 * Baseline measurement only — runs the ported stack parser (stackParser.ts)
 * over the candidate pool (score>=12) and persists results to
 * stack_extraction_runs/stack_extraction_entries. Does NOT write to
 * accounts/post_mentions/weddings/wedding_vendors/edges — this is
 * measurement, not graph ingestion. See the graph-strengthening task's
 * Phase 1 (baseline before any implementation change).
 *
 * Usage (from apps/web): bun run scripts/graph/runStackParserBaseline.ts
 *
 * --ungated (D055, 2026-09-08): run over the WHOLE corpus, not just score>=12. The score gate
 *   was a V3 cost-control device, not a parser constraint -- measured against golden_set it has
 *   35% recall on real weddings, and a SQL approximation of this parser on the 42k posts it was
 *   never allowed to touch found ~3,800 full (>=3-role) credit stacks, 804 of them crediting a
 *   venue already in the graph. Ungated mode skips any post that already has a
 *   stack_extraction_runs row under this parser version (so the 7.1k score>=12 posts and the
 *   golden-set posts written by runStackParserOnGoldenSet.ts with decision='HUMAN_INCLUDE' are
 *   never overwritten -- the same corruption runStackParserOnGoldenSet.ts documents).
 * --dry-run: parse and count, write nothing.
 *
 * v8 (D055, 2026-09-08): stackParser.ts now emits venue credits from two additional patterns
 * (inline_at, venue_hashtag) alongside the original credit_line lines, each entry tagged with its
 * `source`. venue_hashtag needs a lookup list of known venue account usernames, loaded once here
 * (not per-caption) and passed to every parseCaption() call.
 */
import { getPool, closePool } from "../classify/db";
import { parseCaption, STACK_PARSER_VERSION } from "./stackParser";

async function main() {
  const ungated = process.argv.includes("--ungated");
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();

  // v8 (D055): known venue account usernames (lowercased), for the venue_hashtag pattern. Built
  // once, reused for every parseCaption() call below -- stackParser.ts's buildVenueHashtagRegex
  // caches the compiled regex per-Set, so this also only gets compiled once.
  const { rows: venueHandleRows } = await pool.query<{ username: string }>(
    `select lower(a.username::text) as username
     from accounts a
     where exists (select 1 from v_account_role r where r.account_id = a.id and r.role = 'venue')
        or exists (select 1 from vendors v where v.account_id = a.id and v.category = 'venue')`
  );
  const venueHandles = new Set(venueHandleRows.map((r) => r.username));
  console.log(`[stack-baseline] loaded ${venueHandles.size} known venue handles for venue_hashtag`);

  const { rows } = await pool.query<{
    post_url: string;
    caption_raw: string | null;
    decision: string;
    candidate_score: number | null;
  }>(
    ungated
      ? `select sp.post_url, sp.caption_raw,
           coalesce(
             (select pc.decision::text from post_classification_runs pc
              where pc.post_url = sp.post_url and pc.classifier_version = 'v3'
              order by pc.classified_at desc limit 1),
             'UNCLASSIFIED'
           ) as decision,
           cs.score as candidate_score
         from staging.instagram_posts sp
         left join candidate_scores cs on cs.post_url = sp.post_url
           and cs.candidate_generation_version = 'candidate-score-v1'
         where sp.caption_raw is not null and sp.caption_raw <> ''
           and not exists (
             select 1 from stack_extraction_runs sr
             where sr.post_url = sp.post_url and sr.stack_parser_version = $1
           )`
      : `select sp.post_url, sp.caption_raw,
           coalesce(
             (select pc.decision::text from post_classification_runs pc
              where pc.post_url = sp.post_url and pc.classifier_version = 'v3'
              order by pc.classified_at desc limit 1),
             'UNCLASSIFIED'
           ) as decision,
           cs.score as candidate_score
         from staging.instagram_posts sp
         join candidate_scores cs on cs.post_url = sp.post_url
           and cs.candidate_generation_version = 'candidate-score-v1' and cs.score >= 12
           and $1 = $1`,
    [STACK_PARSER_VERSION]
  );
  console.log(`[stack-baseline] version=${STACK_PARSER_VERSION} mode=${ungated ? "ungated" : "score>=12"} ${dryRun ? "DRY RUN " : ""}posts=${rows.length}`);

  let processed = 0;
  let withStack = 0;
  let withVenue = 0;
  // v8 (D055): venue-entry counts broken down by source, so per-pattern precision can be measured
  // before anything downstream trusts inline_at/venue_hashtag the same as a labeled credit line.
  const venueBySource: Record<string, number> = { credit_line: 0, inline_at: 0, venue_hashtag: 0 };
  // Batched writes (D055): the original per-post loop did 2 + N round-trips per post, which at
  // Supabase latency was ~3 hours for the 41k ungated pool. Same three statements, now per
  // 500-post chunk via unnest -- identical resulting rows, same idempotency (delete-then-insert
  // per post under this version), one transaction per chunk.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const runs: { post_url: string; decision: string; candidate_score: number | null; has_stack: boolean; distinct: number; entries: number }[] = [];
    const entries: { post_url: string; role_raw: string; role: string; handle: string; line_no: number; source: string }[] = [];
    for (const row of chunk) {
      const { stack, has_stack } = parseCaption(row.caption_raw, { venueHandles });
      const distinctRoles = new Set(stack.map((s) => s.role)).size;
      if (has_stack) withStack++;
      if (stack.some((s) => s.role === "venue")) withVenue++;
      for (const s of stack) {
        if (s.role === "venue") venueBySource[s.source] = (venueBySource[s.source] ?? 0) + 1;
      }
      runs.push({ post_url: row.post_url, decision: row.decision, candidate_score: row.candidate_score, has_stack, distinct: distinctRoles, entries: stack.length });
      for (const e of stack) entries.push({ post_url: row.post_url, role_raw: e.role_raw, role: e.role, handle: e.handle, line_no: e.line_no, source: e.source });
      processed++;
    }
    if (dryRun) continue;

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into stack_extraction_runs
           (post_url, stack_parser_version, decision, candidate_score, has_stack, distinct_role_count, entry_count)
         select u.post_url, $1, u.decision, u.candidate_score, u.has_stack, u.distinct_role_count, u.entry_count
         from unnest($2::text[], $3::text[], $4::int[], $5::boolean[], $6::int[], $7::int[])
           as u(post_url, decision, candidate_score, has_stack, distinct_role_count, entry_count)
         on conflict (post_url, stack_parser_version) do update set
           decision = excluded.decision, candidate_score = excluded.candidate_score,
           has_stack = excluded.has_stack, distinct_role_count = excluded.distinct_role_count,
           entry_count = excluded.entry_count, extracted_at = now()`,
        [STACK_PARSER_VERSION, runs.map((r) => r.post_url), runs.map((r) => r.decision), runs.map((r) => r.candidate_score),
         runs.map((r) => r.has_stack), runs.map((r) => r.distinct), runs.map((r) => r.entries)]
      );
      await client.query(`delete from stack_extraction_entries where stack_parser_version = $1 and post_url = any($2::text[])`, [
        STACK_PARSER_VERSION,
        runs.map((r) => r.post_url),
      ]);
      if (entries.length > 0) {
        await client.query(
          `insert into stack_extraction_entries (post_url, stack_parser_version, role_raw, role, handle, line_no, source)
           select u.post_url, $1, u.role_raw, u.role, u.handle, u.line_no, u.source
           from unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::text[])
             as u(post_url, role_raw, role, handle, line_no, source)`,
          [STACK_PARSER_VERSION, entries.map((e) => e.post_url), entries.map((e) => e.role_raw), entries.map((e) => e.role),
           entries.map((e) => e.handle), entries.map((e) => e.line_no), entries.map((e) => e.source)]
        );
      }
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
    console.log(`[stack-baseline] ${processed}/${rows.length}`);
  }

  console.log(
    `[stack-baseline] ${dryRun ? "DRY RUN " : ""}DONE — processed ${processed} posts, has_stack(>=3 roles)=${withStack}, with_venue_credit=${withVenue}`
  );
  console.log(
    `[stack-baseline] venue entries by source: credit_line=${venueBySource.credit_line} inline_at=${venueBySource.inline_at} venue_hashtag=${venueBySource.venue_hashtag}`
  );
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
