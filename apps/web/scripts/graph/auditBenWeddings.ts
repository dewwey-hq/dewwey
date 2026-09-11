/**
 * D057 candidate ("go through Ben's posts and make sure they pass our bar for real credible
 * documented wedding too"): read-only audit of Ben's original crawl weddings -- every `weddings`
 * row with NO `jeremy_weddings_created` row (his phase_dedup rule: a post with >=3 distinct
 * vendor roles becomes a wedding; no model or human ever read the post for "is this a real
 * wedding"). 1,325 weddings, 1,602 posts via wedding_posts -> posts (source='venue_tagged',
 * NEVER in staging.instagram_posts).
 *
 * For each Ben wedding, joins:
 *   - its posts' pool='ben-weddings' rows in post_extraction_runs (runExtract.ts --mode
 *     ben-weddings -- the escalated row, when one exists for a post, is preferred over the
 *     first-pass Haiku row, same "effective result" precedence as that script's worker loop);
 *   - human_post_labels_current (WEDDING/NOT_WEDDING only -- UNSURE/UNVIEWABLE/SKIP are neither
 *     a keep nor a retire signal here);
 *   - wedding_vendors.role='venue' credit COUNT (>1 = more than one venue credited -- a roundup/
 *     partner-list signal);
 *   - wedding_participants presence, plus a couple-name regex over captions;
 *   - a wedding-word regex over captions (wedding/bride/groom/married/newlywed(s)/"tied the
 *     knot"/"Mr & Mrs" -- the same list the D057 plan's own measurement used).
 * ...then applies benWeddingAudit.ts's decideWedding() per wedding (pure, unit tested).
 *
 * Prints decision totals, retire reasons, and top venues by retire count; writes the full
 * per-wedding decision set to scripts/graph/tmp_analysis/d057_ben_audit_<batch-id>.json for
 * retireNonWeddingPosts.ts --from-audit to consume. With --spotcheck N, also writes a
 * venue-stratified CSV sample of N (wedding, post) rows drawn from the 'retire' decisions, for a
 * human spot-check before any retirement runs.
 *
 * SELECTs and file writes only -- never touches the database. Runs (and reports "0 read" for
 * extraction runs) even before runExtract.ts --mode ben-weddings has ever been run: with no
 * pool='ben-weddings' rows yet, every wedding falls back to the roundup/human-label/
 * venue-credit-count signals alone, which are all already in the graph today.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/auditBenWeddings.ts --batch-id d057-ben-audit-1
 *   bun run scripts/graph/auditBenWeddings.ts --batch-id d057-ben-audit-1 --spotcheck 30
 *   bun run scripts/graph/auditBenWeddings.ts --batch-id d057-ben-audit-1 --spotcheck 30 --write-sample scripts/graph/tmp_analysis/d057_sample.csv
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import { getPool, closePool } from "../classify/db";
import { EXTRACT_PROMPT_VERSION } from "../classify/extractPrompt";
import { decideWedding, type PostSignal, type PostVerdict, type WeddingDecision } from "./benWeddingAudit";

// Must match runExtract.ts's own ESCALATED_PROMPT_VERSION exactly (same post_extraction_runs
// table, same (post_url, prompt_version) PK shape). Duplicated here rather than imported --
// runExtract.ts calls main() unconditionally at module load (see its own top comment), so
// importing anything from it here would trigger a real CLI run as a side effect of import.
const ESCALATED_PROMPT_VERSION = `${EXTRACT_PROMPT_VERSION}+sonnet`;

// Same wedding-word list as the D057 plan's own "Context — what the data says" measurement
// table. \\y/\\. doubling is the same "SQL inside JS template literals eats \\y / \\s" landmine
// documented in runExtract.ts (COUPLE_RAW_MATCH_SQL et al.) -- every backslash below is doubled
// so Postgres actually receives \y / \.
const WEDDING_WORD_SQL = `\\y(wedding|bride|groom|married|newlywed|newlyweds|tied the knot|Mr\\.? *& *Mrs\\.?)\\y`;
// Couple-name-shaped regex, same qualification-only intent (and the same ~* case-insensitive
// usage) as runExtract.ts's POOL_B_COUPLE_QUALIFY_SQL -- a signal that SOME capitalized pair of
// names joined by &/+/and appears, not the couple_guess text shown to any model.
const COUPLE_SQL = `[A-Z][a-z]+ *(&|\\+|and) *[A-Z][a-z]+`;

interface Args {
  batchId: string;
  spotcheck: number | null;
  writeSample: string | null;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const batchId = get("--batch-id");
  if (!batchId) {
    throw new Error("--batch-id <id> is required, e.g. --batch-id d057-ben-audit-1");
  }
  const spotcheckRaw = get("--spotcheck");
  return {
    batchId,
    spotcheck: spotcheckRaw !== undefined ? Number(spotcheckRaw) : null,
    writeSample: get("--write-sample") ?? null,
  };
}

interface BenWedding {
  wedding_id: number;
  venue_id: number | null;
  venue_username: string | null;
}

interface PostRow {
  post_url: string;
  wedding_id: number;
  caption: string | null;
}

async function loadBenWeddings(pool: Pool): Promise<BenWedding[]> {
  const { rows } = await pool.query(
    `select w.id as wedding_id, w.venue_id, a.username::text as venue_username
     from weddings w
     left join accounts a on a.id = w.venue_id
     where not exists (select 1 from jeremy_weddings_created j where j.wedding_id = w.id)
     order by w.id asc`
  );
  return rows.map((r) => ({
    wedding_id: Number(r.wedding_id),
    venue_id: r.venue_id != null ? Number(r.venue_id) : null,
    venue_username: r.venue_username,
  }));
}

async function loadBenPosts(pool: Pool, weddingIds: number[]): Promise<PostRow[]> {
  if (weddingIds.length === 0) return [];
  const { rows } = await pool.query(
    `select p.url as post_url, wp.wedding_id, p.caption
     from wedding_posts wp
     join posts p on p.id = wp.post_id
     where wp.wedding_id = any($1::bigint[]) and p.source = 'venue_tagged'
     order by wp.wedding_id, p.url`,
    [weddingIds]
  );
  return rows.map((r) => ({ post_url: r.post_url, wedding_id: Number(r.wedding_id), caption: r.caption }));
}

interface RunInfo {
  verdict: PostVerdict | null;
  confidence: number | null;
  evidence: string | null;
  promptVersion: string;
}

/** post_extraction_runs rows for these post_urls under pool='ben-weddings' -- both the
 *  first-pass (EXTRACT_PROMPT_VERSION) and any escalated (ESCALATED_PROMPT_VERSION) row can
 *  exist per post_url; the escalated one wins, same "effective result" precedence as
 *  runExtract.ts's own worker loop. */
async function loadExtractionRuns(pool: Pool, postUrls: string[]): Promise<Map<string, RunInfo>> {
  const byUrl = new Map<string, RunInfo>();
  if (postUrls.length === 0) return byUrl;
  const { rows } = await pool.query(
    `select post_url, prompt_version, verdict, confidence, result->>'evidence' as evidence
     from post_extraction_runs
     where pool = 'ben-weddings' and post_url = any($1::text[])`,
    [postUrls]
  );
  for (const r of rows) {
    const existing = byUrl.get(r.post_url);
    const isEscalated = r.prompt_version === ESCALATED_PROMPT_VERSION;
    if (!existing || (isEscalated && existing.promptVersion !== ESCALATED_PROMPT_VERSION)) {
      byUrl.set(r.post_url, {
        verdict: r.verdict ?? null,
        confidence: r.confidence != null ? Number(r.confidence) : null,
        evidence: r.evidence ?? null,
        promptVersion: r.prompt_version,
      });
    }
  }
  return byUrl;
}

async function loadHumanLabels(pool: Pool, postUrls: string[]): Promise<Map<string, "WEDDING" | "NOT_WEDDING">> {
  const m = new Map<string, "WEDDING" | "NOT_WEDDING">();
  if (postUrls.length === 0) return m;
  const { rows } = await pool.query(
    `select post_url, decision from human_post_labels_current where post_url = any($1::text[])`,
    [postUrls]
  );
  for (const r of rows) {
    if (r.decision === "WEDDING" || r.decision === "NOT_WEDDING") m.set(r.post_url, r.decision);
  }
  return m;
}

async function loadVenueCreditCounts(pool: Pool, weddingIds: number[]): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  if (weddingIds.length === 0) return m;
  const { rows } = await pool.query(
    `select wedding_id, count(*)::int as n
     from wedding_vendors
     where role = 'venue' and wedding_id = any($1::bigint[])
     group by wedding_id`,
    [weddingIds]
  );
  for (const r of rows) m.set(Number(r.wedding_id), r.n);
  return m;
}

async function loadParticipantWeddingIds(pool: Pool, weddingIds: number[]): Promise<Set<number>> {
  if (weddingIds.length === 0) return new Set();
  const { rows } = await pool.query(
    `select distinct wedding_id from wedding_participants where wedding_id = any($1::bigint[])`,
    [weddingIds]
  );
  return new Set(rows.map((r) => Number(r.wedding_id)));
}

interface CaptionSignal {
  hasWeddingWord: boolean;
  hasCoupleRegex: boolean;
}

/** One grouped query, not per-wedding -- bool_or over each wedding's posts' captions. */
async function loadCaptionSignals(pool: Pool, weddingIds: number[]): Promise<Map<number, CaptionSignal>> {
  const m = new Map<number, CaptionSignal>();
  if (weddingIds.length === 0) return m;
  const { rows } = await pool.query(
    `select wp.wedding_id,
            bool_or(coalesce(p.caption ~* '${WEDDING_WORD_SQL}', false)) as has_wedding_word,
            bool_or(coalesce(p.caption ~* '${COUPLE_SQL}', false)) as has_couple_regex
     from wedding_posts wp
     join posts p on p.id = wp.post_id
     where wp.wedding_id = any($1::bigint[]) and p.source = 'venue_tagged'
     group by wp.wedding_id`,
    [weddingIds]
  );
  for (const r of rows) m.set(Number(r.wedding_id), { hasWeddingWord: r.has_wedding_word, hasCoupleRegex: r.has_couple_regex });
  return m;
}

interface AuditRow {
  wedding_id: number;
  decision: WeddingDecision;
  reason: string;
  venue: string | null;
  post_urls: string[];
}

interface RetireSampleRow {
  wedding_id: number;
  venue: string | null;
  post_url: string;
  caption_first_line: string;
  model_verdict: string | null;
  confidence: number | null;
  evidence: string | null;
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Round-robins across venues (alphabetical, deterministic) so a stratified sample doesn't get
 *  dominated by whichever venue happens to have the most retire decisions. */
function stratifiedSampleByVenue(rows: RetireSampleRow[], n: number): RetireSampleRow[] {
  const byVenue = new Map<string, RetireSampleRow[]>();
  for (const r of rows) {
    const key = r.venue ?? "(no venue)";
    const list = byVenue.get(key) ?? [];
    list.push(r);
    byVenue.set(key, list);
  }
  const venues = [...byVenue.keys()].sort();
  const out: RetireSampleRow[] = [];
  let i = 0;
  while (out.length < n && venues.some((v) => (byVenue.get(v)?.length ?? 0) > 0)) {
    const v = venues[i % venues.length];
    const list = byVenue.get(v)!;
    if (list.length > 0) out.push(list.shift()!);
    i++;
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const pool = getPool();

  const weddings = await loadBenWeddings(pool);
  console.log(`[d057-audit] Ben's crawl weddings (no jeremy_weddings_created row): ${weddings.length}`);

  const weddingIds = weddings.map((w) => w.wedding_id);
  const posts = await loadBenPosts(pool, weddingIds);
  console.log(`[d057-audit] their posts (source='venue_tagged'): ${posts.length}`);

  const postUrls = posts.map((p) => p.post_url);
  const [extractionRuns, humanLabels, venueCredits, participantWeddingIds, captionSignals] = await Promise.all([
    loadExtractionRuns(pool, postUrls),
    loadHumanLabels(pool, postUrls),
    loadVenueCreditCounts(pool, weddingIds),
    loadParticipantWeddingIds(pool, weddingIds),
    loadCaptionSignals(pool, weddingIds),
  ]);
  console.log(`[d057-audit] pool='ben-weddings' extraction runs read: ${extractionRuns.size} (of ${postUrls.length} posts)`);
  console.log(`[d057-audit] human post labels read: ${humanLabels.size}`);
  console.log(`[d057-audit] weddings with >=1 wedding_participants row: ${participantWeddingIds.size}`);

  const postsByWedding = new Map<number, PostRow[]>();
  for (const p of posts) {
    const list = postsByWedding.get(p.wedding_id) ?? [];
    list.push(p);
    postsByWedding.set(p.wedding_id, list);
  }

  const auditRows: AuditRow[] = [];
  const retireSampleRows: RetireSampleRow[] = [];

  for (const w of weddings) {
    const wPosts = postsByWedding.get(w.wedding_id) ?? [];
    const postSignals: PostSignal[] = wPosts.map((p) => {
      const run = extractionRuns.get(p.post_url);
      return {
        verdict: run?.verdict ?? null,
        confidence: run?.confidence ?? null,
        humanLabel: humanLabels.get(p.post_url) ?? null,
      };
    });
    const venueCreditCount = venueCredits.get(w.wedding_id) ?? 0;
    const sig = captionSignals.get(w.wedding_id) ?? { hasWeddingWord: false, hasCoupleRegex: false };
    const hasCoupleOrParticipant = sig.hasCoupleRegex || participantWeddingIds.has(w.wedding_id);

    const result = decideWedding({
      posts: postSignals,
      venueCreditCount,
      hasCoupleOrParticipant,
      hasWeddingWord: sig.hasWeddingWord,
    });

    auditRows.push({
      wedding_id: w.wedding_id,
      decision: result.decision,
      reason: result.reason,
      venue: w.venue_username,
      post_urls: wPosts.map((p) => p.post_url),
    });

    if (result.decision === "retire") {
      for (const p of wPosts) {
        const run = extractionRuns.get(p.post_url);
        retireSampleRows.push({
          wedding_id: w.wedding_id,
          venue: w.venue_username,
          post_url: p.post_url,
          caption_first_line: (p.caption ?? "").split("\n")[0].slice(0, 120),
          model_verdict: run?.verdict ?? null,
          confidence: run?.confidence ?? null,
          evidence: run?.evidence ?? null,
        });
      }
    }
  }

  // ---- Report ----
  const totals: Record<WeddingDecision, number> = { retire: 0, keep: 0, human: 0 };
  for (const r of auditRows) totals[r.decision]++;
  console.log(`\n[d057-audit] decision totals: retire=${totals.retire} keep=${totals.keep} human=${totals.human} (of ${auditRows.length})`);

  const reasonCounts = new Map<string, number>();
  for (const r of auditRows) {
    if (r.decision === "retire") reasonCounts.set(r.reason, (reasonCounts.get(r.reason) ?? 0) + 1);
  }
  console.log(`\n[d057-audit] retire reasons:`);
  for (const [reason, n] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}  ${reason}`);
  }

  const venueRetireCounts = new Map<string, number>();
  for (const r of auditRows) {
    if (r.decision !== "retire") continue;
    const v = r.venue ?? "(no venue)";
    venueRetireCounts.set(v, (venueRetireCounts.get(v) ?? 0) + 1);
  }
  console.log(`\n[d057-audit] top venues by retire count:`);
  for (const [venue, n] of [...venueRetireCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    console.log(`  ${n}  @${venue}`);
  }

  // ---- Write the decision set ----
  const outDir = path.join(process.cwd(), "scripts/graph/tmp_analysis");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `d057_ben_audit_${args.batchId}.json`);
  writeFileSync(
    outPath,
    JSON.stringify({ batch_id: args.batchId, generated_at: new Date().toISOString(), weddings: auditRows }, null, 2)
  );
  console.log(`\n[d057-audit] wrote ${auditRows.length} wedding decisions to ${outPath}`);

  // ---- Spot-check sample ----
  if (args.spotcheck != null) {
    const samplePath = args.writeSample ?? path.join(outDir, `d057_ben_audit_${args.batchId}_sample.csv`);
    const sample = stratifiedSampleByVenue(retireSampleRows, args.spotcheck);
    const header = "wedding_id,venue,post_url,caption_first_line,model_verdict,confidence,evidence";
    const csvRows = sample.map((r) =>
      [r.wedding_id, r.venue ?? "", r.post_url, r.caption_first_line, r.model_verdict ?? "", r.confidence ?? "", r.evidence ?? ""]
        .map(csvEscape)
        .join(",")
    );
    writeFileSync(samplePath, [header, ...csvRows].join("\n") + "\n");
    console.log(
      `\n[d057-audit] spot-check sample: ${sample.length} of ${retireSampleRows.length} retire-decision post rows -> ${samplePath}`
    );
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
