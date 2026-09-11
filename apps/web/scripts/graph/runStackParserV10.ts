/**
 * D056 stage 1: runs parseCaptionV2 (stackParser.ts's v10 export, STACK_PARSER_V2_VERSION =
 * "stack-parser-ts-v10") over the corpus and persists results to
 * stack_extraction_entries_v2/stack_extraction_runs_v2 (applied by
 * applyStackEntriesV2Schema.ts). Additive re-parse: writes ONLY the new v2 tables, never touches
 * stack_extraction_entries/stack_extraction_runs (v1-v9) or anything else. See docs/decisions.md
 * D056.
 *
 * Same corpus-walk and venue-handle-preload shape as runStackParserBaseline.ts:
 *   --ungated: walk the WHOLE corpus (staging.instagram_posts with a non-empty caption), not just
 *     the score>=12 candidate pool. Either way, a post already present in stack_extraction_runs_v2
 *     under this parser_version is skipped (resumable across runs / --limit batches).
 *   --limit N: cap the number of posts pulled this run (for a pilot -- see the task's "run the v10
 *     parser with --limit 300").
 *   --dry-run: parse and count, write nothing.
 *
 * D056 stage-1 follow-up (2026-09-10, user-caught parseCaptionV2 fix -- see stackParser.ts's
 * matchLineV2/LABEL_CHARS_V2 comments): a TARGETED re-parse mode for posts whose caption matches a
 * given pattern, instead of a full ungated corpus re-walk (the default resumable walk above SKIPS
 * any post already in stack_extraction_runs_v2 under v10, which is exactly wrong for refreshing
 * posts the old, buggy parseCaptionV2 already parsed once).
 *   --refresh-matching <posix regex>: select posts whose caption_raw matches the regex (Postgres
 *     `~`, case-sensitive POSIX ARE), DELETE their existing v10 rows from
 *     stack_extraction_entries_v2/stack_extraction_runs_v2, and re-parse+rewrite them with the
 *     current parseCaptionV2. Prints post count and total credits before/after. Combine with
 *     --dry-run to see the match count and before/after credit counts without writing anything --
 *     --ungated/plain --limit N (still honored, as a cap on the matched set) are irrelevant.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/runStackParserV10.ts --dry-run --limit 300
 *   bun run scripts/graph/runStackParserV10.ts --limit 300
 *   bun run scripts/graph/runStackParserV10.ts --ungated
 *   bun run scripts/graph/runStackParserV10.ts --refresh-matching '<posix regex>' --dry-run
 */
import type { Pool } from "pg";
import { getPool, closePool } from "../classify/db";
import { parseCaptionV2, STACK_PARSER_V2_VERSION, type CreditV2, type ParticipantV2 } from "./stackParser";

interface RunRow {
  post_url: string;
  has_stack: boolean;
  n_credits: number;
  non_wedding_event_title: string | null;
}
interface EntryRow {
  post_url: string;
  line_no: number;
  label_raw: string;
  handle: string;
  role: string;
  event_context: string;
  source: string;
  rule_id: string | null;
}

/** Same delete-then-insert-per-post-under-this-version write, shared by the main corpus walk and
 * --refresh-matching below -- runs upserts (on conflict do update, post_url+parser_version is its
 * primary key), entries are delete-then-insert (no natural per-row conflict target). */
async function writeBatch(pool: Pool, runs: RunRow[], entryRows: EntryRow[]): Promise<void> {
  if (runs.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local statement_timeout='300s'`);
    await client.query(
      `insert into stack_extraction_runs_v2 (post_url, parser_version, has_stack, n_credits, non_wedding_event_title)
       select u.post_url, $1, u.has_stack, u.n_credits, u.non_wedding_event_title
       from unnest($2::text[], $3::boolean[], $4::int[], $5::text[])
         as u(post_url, has_stack, n_credits, non_wedding_event_title)
       on conflict (post_url, parser_version) do update set
         has_stack = excluded.has_stack, n_credits = excluded.n_credits,
         non_wedding_event_title = excluded.non_wedding_event_title, parsed_at = now()`,
      [
        STACK_PARSER_V2_VERSION,
        runs.map((r) => r.post_url),
        runs.map((r) => r.has_stack),
        runs.map((r) => r.n_credits),
        runs.map((r) => r.non_wedding_event_title),
      ]
    );
    await client.query(`delete from stack_extraction_entries_v2 where parser_version = $1 and post_url = any($2::text[])`, [
      STACK_PARSER_V2_VERSION,
      runs.map((r) => r.post_url),
    ]);
    if (entryRows.length > 0) {
      await client.query(
        `insert into stack_extraction_entries_v2
           (post_url, parser_version, line_no, label_raw, handle, role, event_context, source, rule_id)
         select u.post_url, $1, u.line_no, u.label_raw, u.handle, u.role, u.event_context, u.source, u.rule_id
         from unnest($2::text[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[])
           as u(post_url, line_no, label_raw, handle, role, event_context, source, rule_id)`,
        [
          STACK_PARSER_V2_VERSION,
          entryRows.map((e) => e.post_url),
          entryRows.map((e) => e.line_no),
          entryRows.map((e) => e.label_raw),
          entryRows.map((e) => e.handle),
          entryRows.map((e) => e.role),
          entryRows.map((e) => e.event_context),
          entryRows.map((e) => e.source),
          entryRows.map((e) => e.rule_id),
        ]
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/** Turn one parseCaptionV2() result into its RunRow + EntryRow[] (participants get the
 * 'participant:<role>' role prefix, same convention as the main loop below). */
function toRows(postUrl: string, parsed: ReturnType<typeof parseCaptionV2>): { run: RunRow; entries: EntryRow[] } {
  const { credits, participants, nonWeddingEventTitle, hasStack } = parsed;
  const entries: EntryRow[] = [];
  for (const c of credits as CreditV2[]) {
    entries.push({
      post_url: postUrl,
      line_no: c.line_no,
      label_raw: c.label_raw,
      handle: c.handle,
      role: c.role,
      event_context: c.event_context,
      source: c.source,
      rule_id: c.rule_id,
    });
  }
  for (const p of participants as ParticipantV2[]) {
    entries.push({
      post_url: postUrl,
      line_no: p.line_no,
      label_raw: p.label_raw,
      handle: p.handle,
      role: `participant:${p.participant}`,
      event_context: "wedding_day",
      source: p.source,
      rule_id: null,
    });
  }
  return { run: { post_url: postUrl, has_stack: hasStack, n_credits: credits.length, non_wedding_event_title: nonWeddingEventTitle }, entries };
}

async function runRefreshMatching(pool: Pool, pattern: string, dryRun: boolean, limit: number | undefined, venueHandles: Set<string>) {
  const { rows } = await pool.query<{ post_url: string; caption_raw: string | null }>(
    `select sp.post_url, sp.caption_raw
     from staging.instagram_posts sp
     where sp.caption_raw is not null and sp.caption_raw <> ''
       and sp.caption_raw ~ $1
     order by sp.post_url
     ${limit ? `limit ${Math.trunc(limit)}` : ""}`,
    [pattern]
  );
  console.log(`[stack-v10-refresh] pattern matched ${rows.length} post(s)${limit ? ` (capped at --limit ${limit})` : ""}`);

  const { rows: beforeRows } = await pool.query<{ post_url: string; n_credits: number }>(
    `select post_url, n_credits from stack_extraction_runs_v2
     where parser_version = $1 and post_url = any($2::text[])`,
    [STACK_PARSER_V2_VERSION, rows.map((r) => r.post_url)]
  );
  const beforeByPost = new Map(beforeRows.map((r) => [r.post_url, r.n_credits]));

  let creditsBefore = 0;
  let creditsAfter = 0;
  const samples: { post_url: string; before: number; after: number }[] = [];

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const runs: RunRow[] = [];
    const entryRows: EntryRow[] = [];
    for (const row of chunk) {
      const before = beforeByPost.get(row.post_url) ?? 0;
      const parsed = parseCaptionV2(row.caption_raw, { venueHandles });
      const { run, entries } = toRows(row.post_url, parsed);
      creditsBefore += before;
      creditsAfter += run.n_credits;
      if (samples.length < 20) samples.push({ post_url: row.post_url, before, after: run.n_credits });
      runs.push(run);
      entryRows.push(...entries);
    }
    if (!dryRun) await writeBatch(pool, runs, entryRows);
  }

  console.log(`\n[stack-v10-refresh] ${dryRun ? "DRY RUN " : ""}DONE -- posts=${rows.length}`);
  console.log(`[stack-v10-refresh] credits before: ${creditsBefore}`);
  console.log(`[stack-v10-refresh] credits after:  ${creditsAfter}`);
  console.log(`[stack-v10-refresh] delta:          ${creditsAfter - creditsBefore >= 0 ? "+" : ""}${creditsAfter - creditsBefore}`);
  console.log(`\n[stack-v10-refresh] sample (up to 20 posts, before -> after):`);
  for (const s of samples) console.log(`  ${s.post_url}  ${s.before} -> ${s.after}`);
}

async function main() {
  const args = process.argv.slice(2);
  const ungated = args.includes("--ungated");
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit"));
  const limit = limitArg
    ? Number(limitArg.includes("=") ? limitArg.split("=")[1] : args[args.indexOf(limitArg) + 1])
    : undefined;
  const refreshIdx = args.indexOf("--refresh-matching");
  const refreshPattern = refreshIdx >= 0 ? args[refreshIdx + 1] : undefined;

  const pool = getPool();
  await pool.query(`set statement_timeout='300s'`);

  // Same venue-handle preload as runStackParserBaseline.ts -- venue_hashtag needs a lookup list of
  // known venue account usernames, built once and reused for every parseCaptionV2() call.
  const { rows: venueHandleRows } = await pool.query<{ username: string }>(
    `select lower(a.username::text) as username
     from accounts a
     where exists (select 1 from v_account_role r where r.account_id = a.id and r.role = 'venue')
        or exists (select 1 from vendors v where v.account_id = a.id and v.category = 'venue')`
  );
  const venueHandles = new Set(venueHandleRows.map((r) => r.username));
  console.log(`[stack-v10] loaded ${venueHandles.size} known venue handles for venue_hashtag`);

  if (refreshPattern !== undefined) {
    console.log(`[stack-v10-refresh] version=${STACK_PARSER_V2_VERSION} ${dryRun ? "DRY RUN " : ""}pattern=${JSON.stringify(refreshPattern)}`);
    await runRefreshMatching(pool, refreshPattern, dryRun, limit, venueHandles);
    await closePool();
    return;
  }

  const { rows } = await pool.query<{ post_url: string; caption_raw: string | null }>(
    `select sp.post_url, sp.caption_raw
     from staging.instagram_posts sp
     ${ungated ? "" : "join candidate_scores cs on cs.post_url = sp.post_url and cs.candidate_generation_version = 'candidate-score-v1' and cs.score >= 12"}
     where sp.caption_raw is not null and sp.caption_raw <> ''
       and not exists (
         select 1 from stack_extraction_runs_v2 sr
         where sr.post_url = sp.post_url and sr.parser_version = $1
       )
     order by sp.post_url
     ${limit ? `limit ${Math.trunc(limit)}` : ""}`,
    [STACK_PARSER_V2_VERSION]
  );
  console.log(
    `[stack-v10] version=${STACK_PARSER_V2_VERSION} mode=${ungated ? "ungated" : "score>=12"} ${dryRun ? "DRY RUN " : ""}posts=${rows.length}`
  );

  let processed = 0;
  let withStack = 0;
  let creditsTotal = 0;
  let participantsTotal = 0;
  let nonWeddingCount = 0;
  const nonWeddingSamples: { post_url: string; title: string }[] = [];
  const creditsByRole = new Map<string, number>();
  const participantsByRole = new Map<string, number>();
  const creditsBySource = new Map<string, number>();
  const emojiByMarker = new Map<string, number>();
  const emojiSample: { post_url: string; emoji: string; handle: string; role: string }[] = [];

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const runs: { post_url: string; has_stack: boolean; n_credits: number; non_wedding_event_title: string | null }[] = [];
    const entryRows: {
      post_url: string;
      line_no: number;
      label_raw: string;
      handle: string;
      role: string;
      event_context: string;
      source: string;
      rule_id: string | null;
    }[] = [];

    for (const row of chunk) {
      const { credits, participants, nonWeddingEventTitle, hasStack } = parseCaptionV2(row.caption_raw, { venueHandles });
      processed++;
      if (hasStack) withStack++;
      creditsTotal += credits.length;
      participantsTotal += participants.length;
      if (nonWeddingEventTitle) {
        nonWeddingCount++;
        if (nonWeddingSamples.length < 10) nonWeddingSamples.push({ post_url: row.post_url, title: nonWeddingEventTitle });
      }

      for (const c of credits as CreditV2[]) {
        creditsByRole.set(c.role, (creditsByRole.get(c.role) ?? 0) + 1);
        creditsBySource.set(c.source, (creditsBySource.get(c.source) ?? 0) + 1);
        if (c.source === "emoji_line") {
          emojiByMarker.set(c.label_raw, (emojiByMarker.get(c.label_raw) ?? 0) + 1);
          if (emojiSample.length < 20) {
            emojiSample.push({ post_url: row.post_url, emoji: c.label_raw, handle: c.handle, role: c.role });
          }
        }
        entryRows.push({
          post_url: row.post_url,
          line_no: c.line_no,
          label_raw: c.label_raw,
          handle: c.handle,
          role: c.role,
          event_context: c.event_context,
          source: c.source,
          rule_id: c.rule_id,
        });
      }
      for (const p of participants as ParticipantV2[]) {
        participantsByRole.set(p.participant, (participantsByRole.get(p.participant) ?? 0) + 1);
        entryRows.push({
          post_url: row.post_url,
          line_no: p.line_no,
          label_raw: p.label_raw,
          handle: p.handle,
          role: `participant:${p.participant}`,
          event_context: "wedding_day",
          source: p.source,
          rule_id: null,
        });
      }

      runs.push({
        post_url: row.post_url,
        has_stack: hasStack,
        n_credits: credits.length,
        non_wedding_event_title: nonWeddingEventTitle,
      });
    }

    if (!dryRun) await writeBatch(pool, runs, entryRows);
    console.log(`[stack-v10] ${processed}/${rows.length}`);
  }

  // ---- Report ----
  console.log(`\n[stack-v10] ${dryRun ? "DRY RUN " : ""}DONE`);
  console.log(`[stack-v10] posts parsed: ${processed}`);
  console.log(`[stack-v10] with stack (>=1 credit line): ${withStack}`);
  console.log(`[stack-v10] credits total: ${creditsTotal}`);
  console.log(`[stack-v10] participants total: ${participantsTotal}`);

  const topN = (m: Map<string, number>, n: number) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);

  console.log(`\n[stack-v10] credits by role (top 30):`);
  for (const [role, n] of topN(creditsByRole, 30)) console.log(`  ${role}: ${n}`);
  const otherN = creditsByRole.get("other") ?? 0;
  console.log(`[stack-v10] 'other' share: ${creditsTotal > 0 ? ((otherN / creditsTotal) * 100).toFixed(1) : "0.0"}% (${otherN}/${creditsTotal})`);

  console.log(`\n[stack-v10] participants by role:`);
  for (const [role, n] of topN(participantsByRole, participantsByRole.size)) console.log(`  ${role}: ${n}`);

  console.log(`\n[stack-v10] credits by source:`);
  for (const [source, n] of topN(creditsBySource, creditsBySource.size)) console.log(`  ${source}: ${n}`);

  console.log(`\n[stack-v10] emoji_line credits by marker (top 15):`);
  for (const [marker, n] of topN(emojiByMarker, 15)) console.log(`  ${JSON.stringify(marker)}: ${n}`);

  console.log(`\n[stack-v10] non-wedding-event titles found: ${nonWeddingCount}`);
  for (const s of nonWeddingSamples) console.log(`  ${s.post_url}  ${JSON.stringify(s.title)}`);

  console.log(`\n[stack-v10] emoji-line credit sample (up to 20, for a precision eye-check):`);
  for (const s of emojiSample) console.log(`  ${s.post_url}  ${JSON.stringify(s.emoji)} -> @${s.handle} (${s.role})`);

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
