/**
 * Phase 2 reader (D055 "squeeze the 47k", Phase 1 re-plan step 3): Haiku 4.5
 * via OpenRouter reads structural-v2 candidate posts, one question per post
 * -- "is this post documenting a real wedding at the candidate's anchored
 * venue?" -- via extractPrompt.ts's prompt/schema and ./openrouter.ts's
 * callTool (same tool-call plumbing as llmClassifier.ts/runClassify.ts;
 * MODEL_CHEAP is imported from llmClassifier.ts, not redefined here, so
 * there's exactly one place that names the Haiku 4.5 model id).
 *
 * Two modes:
 *   calibration -- posts with a current human ('jeremy') THIS_VENUE/
 *     OTHER_VENUE/NOT_WEDDING verdict. Never writes post_venue_verdicts
 *     (that would overwrite the ground truth being calibrated against).
 *     Prints a confusion matrix + W-precision/recall at several confidence
 *     thresholds, overall and by venue_anchor_source, plus total cost.
 *   corpus -- unreviewed posts (no current verdict by anyone) on
 *     CHICAGO_CONFIRMED/CHICAGO_AMBIGUOUS structural-v2 candidates,
 *     confirmed-first, coverage-ascending (same ordering discipline as
 *     lib/server/postVenueReview.ts's getPostReviewQueue). With
 *     --write-verdicts, THIS_VENUE/NOT_WEDDING calls >= --threshold and
 *     resolvable OTHER_VENUE calls get a post_venue_verdicts row under
 *     reviewed_by='haiku-extract-v1'; UNSURE is never written (see
 *     decideVerdictWrite in extractPrompt.ts).
 *
 * Every post's input is built via batched, post_url-scoped queries (never
 * the corpus-wide structural_post_vendor_evidence view per post -- see that
 * view's own comment and docs/STATE.md's landmines section) -- couple_guess
 * / has_non_wedding_event_keyword are recomputed here with the SAME regexes
 * as that view's couple_extract CTE, scoped to just this batch's post_urls.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/runExtract.ts --mode calibration --limit 20 --dry-run
 *   bun run scripts/classify/runExtract.ts --mode calibration --limit 500
 *   bun run scripts/classify/runExtract.ts --mode corpus --limit 500 --threshold 0.8 --write-verdicts
 */
import type { Pool } from "pg";
import { getPool, closePool } from "./db";
import { MODEL_CHEAP } from "./llmClassifier";
import { callTool, OpenRouterError } from "./openrouter";
import {
  EXTRACT_PROMPT_VERSION,
  EXTRACT_SYSTEM_PROMPT,
  EXTRACT_TOOL_NAME,
  EXTRACT_TOOL_DESCRIPTION,
  EXTRACT_PARAMETERS,
  EXTRACT_VERDICTS,
  buildExtractUserPrompt,
  validateExtractResult,
  decideVerdictWrite,
  normalizeHandle,
  truncateBio,
  type ExtractPostContext,
  type ExtractResult,
  type ExtractVerdict,
  type StackEntry,
} from "./extractPrompt";

// Pinned exact version, NOT "latest across all versions" -- the spec calls
// for the stack as parsed by this specific parser generation (verified live
// 2026-09-09: 89,337 stack_extraction_entries rows at this version).
const STACK_PARSER_VERSION = "stack-parser-ts-v9";
const STRUCTURAL_CLUSTERING_VERSION = "structural-v2";

interface Args {
  mode: "calibration" | "corpus";
  limit: number;
  dryRun: boolean;
  threshold: number;
  writeVerdicts: boolean;
  concurrency: number;
  maxCostUsd: number;
  force: boolean;
  /** --only-this-venue: write only THIS_VENUE verdicts (calibration 2026-09-09: the model's
   *  NOT_WEDDING (68%) and OTHER_VENUE (~20%) calls do not clear the 90% gate; W does at >=0.8). */
  onlyThisVenue: boolean;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const mode = get("--mode");
  if (mode !== "calibration" && mode !== "corpus") {
    throw new Error(`--mode calibration|corpus is required (got ${mode ?? "(none)"})`);
  }
  return {
    mode,
    limit: Number(get("--limit") ?? 50),
    dryRun: a.includes("--dry-run"),
    threshold: Number(get("--threshold") ?? 0.8),
    writeVerdicts: a.includes("--write-verdicts"),
    concurrency: Number(get("--concurrency") ?? 4),
    maxCostUsd: Number(get("--max-cost-usd") ?? 10),
    force: a.includes("--force"),
    onlyThisVenue: a.includes("--only-this-venue"),
  };
}

interface PostMeta {
  post_url: string;
  candidate_id: number;
  venue_account_id: number | null;
  venue_anchor_source: string | null;
  human_verdict: "THIS_VENUE" | "OTHER_VENUE" | "NOT_WEDDING" | null;
}

/** Calibration set: posts with a current 'jeremy' verdict in the three
 * decided classes. Excludes posts already extracted under this
 * prompt_version unless --force (resumable). */
async function selectCalibrationMeta(pool: Pool, limit: number, force: boolean): Promise<PostMeta[]> {
  const { rows } = await pool.query(
    `select pv.post_url, pv.candidate_id, jwc.venue_account_id, jwc.venue_anchor_source,
            pv.verdict as human_verdict
     from post_venue_verdicts_current pv
     join jeremy_wedding_candidates jwc on jwc.id = pv.candidate_id
     where pv.reviewed_by = 'jeremy'
       and pv.verdict in ('THIS_VENUE','OTHER_VENUE','NOT_WEDDING')
       and ($2::boolean or not exists (
         select 1 from post_extraction_runs per
         where per.post_url = pv.post_url and per.prompt_version = $3
       ))
     order by pv.reviewed_at asc
     limit $1`,
    [limit, force, EXTRACT_PROMPT_VERSION]
  );
  return rows.map((r) => ({
    post_url: r.post_url,
    candidate_id: Number(r.candidate_id),
    // pg returns bigint columns as strings -- normalize to number here so
    // downstream Map<number, ...> lookups (fetchExtractContexts' venueById)
    // actually hit instead of silently missing on a "729" !== 729 mismatch.
    venue_account_id: r.venue_account_id != null ? Number(r.venue_account_id) : null,
    venue_anchor_source: r.venue_anchor_source,
    human_verdict: r.human_verdict,
  }));
}

/** Corpus set: unreviewed posts (no current verdict by anyone) on
 * CHICAGO_CONFIRMED/CHICAGO_AMBIGUOUS structural-v2 candidates, confirmed
 * first, then venue coverage (documented Chicago weddings) ascending -- same
 * ordering discipline as lib/server/postVenueReview.ts's getPostReviewQueue.
 * Excludes posts already extracted under this prompt_version unless
 * --force. */
async function selectCorpusMeta(pool: Pool, limit: number, force: boolean): Promise<PostMeta[]> {
  const { rows } = await pool.query(
    `with venue_counts as (
       select coalesce(al.canonical_account_id, wv.account_id) as venue_account_id,
              count(distinct wv.wedding_id) as n
       from wedding_vendors wv
       join weddings w on w.id = wv.wedding_id and w.is_chicago = true
       left join account_aliases al on al.alias_account_id = wv.account_id
       where wv.role = 'venue'
       group by 1
     )
     select cp.source_post_url as post_url, cp.candidate_id, jwc.venue_account_id, jwc.venue_anchor_source,
            null::text as human_verdict
     from jeremy_wedding_candidate_posts cp
     join jeremy_wedding_candidates jwc on jwc.id = cp.candidate_id
     left join venue_counts vc on vc.venue_account_id = jwc.venue_account_id
     where jwc.clustering_version = $4
       and jwc.chicago_status in ('CHICAGO_CONFIRMED','CHICAGO_AMBIGUOUS')
       and not exists (
         select 1 from post_venue_verdicts_current pv where pv.post_url = cp.source_post_url
       )
       and ($2::boolean or not exists (
         select 1 from post_extraction_runs per
         where per.post_url = cp.source_post_url and per.prompt_version = $3
       ))
     order by
       case jwc.chicago_status when 'CHICAGO_CONFIRMED' then 0 when 'CHICAGO_AMBIGUOUS' then 1 else 2 end,
       coalesce(vc.n, 0) asc,
       cp.candidate_id asc,
       cp.source_post_url asc
     limit $1`,
    [limit, force, EXTRACT_PROMPT_VERSION, STRUCTURAL_CLUSTERING_VERSION]
  );
  return rows.map((r) => ({
    post_url: r.post_url,
    candidate_id: Number(r.candidate_id),
    venue_account_id: r.venue_account_id != null ? Number(r.venue_account_id) : null,
    venue_anchor_source: r.venue_anchor_source,
    human_verdict: null,
  }));
}

// D055 landmine: "SQL inside JS template literals eats \y / \s" -- every
// backslash below is doubled so Postgres actually receives \y / \. / \+,
// same discipline as postVenueReview.ts's styledSignalSql and the bar/
// mitzvah filter it documents.
const COUPLE_RAW_MATCH_SQL = `(Mr\\.? *& *Mrs\\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\\+|and) *[A-Z][a-z]+)`;
const COUPLE_BUSINESS_WORD_VETO_SQL = `\\y(Events|Event|Catering|Photography|Photo|Films|Film|Designs|Design|Florals|Floral|Flowers|Banquets|Banquet|Studio|Studios|Co|Company|Weddings|Wedding|Hall|Room|Bar|Grill|Rentals|Decor|Beauty|Hair|Makeup|Music|Sound|Booth|Bridal|Boutique|Group|Team|Cakes|Bakery|Planning|Entertainment|Lounge|Rooftop|Club|Hotel|Venue)\\y`;
const NON_WEDDING_EVENT_KEYWORD_SQL = `\\y(mitzvah|quincea|sweet\\s*16|birthday|corporate|baby shower|bridal shower|graduation|anniversary party|retirement|gala|networking|fundraiser|holiday party|prom|conference|expo|trade show|open house)\\y`;

/** Batched, post_url-scoped context fetch for one batch of posts -- exactly
 * the "scope by post_url FIRST" discipline the mission requires (never the
 * corpus-wide structural_post_vendor_evidence view per post). Three queries
 * total (post/couple fields, venue accounts, credit stack), not N+1. */
async function fetchExtractContexts(pool: Pool, metaRows: PostMeta[]): Promise<ExtractPostContext[]> {
  if (metaRows.length === 0) return [];
  const postUrls = metaRows.map((m) => m.post_url);
  const venueAccountIds = [...new Set(metaRows.map((m) => m.venue_account_id).filter((id): id is number => id != null))];

  const [{ rows: postRows }, { rows: venueRows }, { rows: stackRows }] = await Promise.all([
    pool.query(
      `select
         sp.post_url, sp.caption_raw, sp.location_tag, sp.owner_username, sp.post_timestamp,
         (case
            when cx.raw_match is not null and cx.raw_match !~* '${COUPLE_BUSINESS_WORD_VETO_SQL}'
            then lower(cx.raw_match) else null
          end) as couple_guess,
         coalesce(sp.caption_raw ~* '${NON_WEDDING_EVENT_KEYWORD_SQL}', false) as has_non_wedding_event_keyword
       from staging.instagram_posts sp
       left join lateral (
         select substring(sp.caption_raw from '${COUPLE_RAW_MATCH_SQL}') as raw_match
       ) cx on true
       where sp.post_url = any($1::text[])`,
      [postUrls]
    ),
    venueAccountIds.length
      ? pool.query(
          `select id as account_id, username::text as username, full_name, biography
           from accounts where id = any($1::bigint[])`,
          [venueAccountIds]
        )
      : Promise.resolve({ rows: [] }),
    pool.query(
      `select post_url, role_raw, role, handle, line_no
       from stack_extraction_entries
       where post_url = any($1::text[]) and stack_parser_version = $2
       order by post_url, line_no asc`,
      [postUrls, STACK_PARSER_VERSION]
    ),
  ]);

  const postByUrl = new Map<string, (typeof postRows)[number]>();
  for (const r of postRows) postByUrl.set(r.post_url, r);

  const venueById = new Map<number, (typeof venueRows)[number]>();
  for (const r of venueRows) venueById.set(Number(r.account_id), r);

  const stackByUrl = new Map<string, StackEntry[]>();
  for (const r of stackRows) {
    const list = stackByUrl.get(r.post_url) ?? [];
    list.push({ role_raw: r.role_raw, role: r.role, handle: r.handle });
    stackByUrl.set(r.post_url, list);
  }

  return metaRows.map((m) => {
    const p = postByUrl.get(m.post_url);
    const v = m.venue_account_id != null ? venueById.get(m.venue_account_id) : undefined;
    return {
      post_url: m.post_url,
      caption_raw: p?.caption_raw ?? null,
      location_tag: p?.location_tag ?? null,
      owner_username: p?.owner_username ?? null,
      post_timestamp: p?.post_timestamp ?? null,
      candidate_id: m.candidate_id,
      venue_anchor_source: m.venue_anchor_source,
      venue_username: v?.username ?? null,
      venue_full_name: v?.full_name ?? null,
      venue_biography: truncateBio(v?.biography ?? null),
      stack: stackByUrl.get(m.post_url) ?? [],
      couple_guess: p?.couple_guess ?? null,
      has_non_wedding_event_keyword: Boolean(p?.has_non_wedding_event_keyword),
    };
  });
}

/** account_aliases-aware handle -> canonical account_id resolver, loaded
 * once per run (one query, ~11k accounts) -- same shape as source.ts's
 * loadKnownVendors, reused by decideVerdictWrite for OTHER_VENUE handles. */
async function loadHandleResolver(pool: Pool): Promise<Map<string, number>> {
  const { rows } = await pool.query(
    `select lower(a.username::text) as username, coalesce(al.canonical_account_id, a.id) as account_id
     from accounts a
     left join account_aliases al on al.alias_account_id = a.id`
  );
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.username, Number(r.account_id));
  return m;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ExtractRunResult {
  ctx: ExtractPostContext;
  result: ExtractResult;
  model: string;
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
}

/** openrouter.ts's callTool already retries 429 internally with backoff
 * (its own rate-limit story); it does NOT retry 5xx (throws immediately).
 * This thin wrapper adds backoff for 5xx and any other transient
 * OpenRouterError, without touching the shared client other callers
 * (llmClassifier.ts) depend on. */
async function callExtractWithRetry(ctx: ExtractPostContext, maxAttempts = 4): Promise<ExtractRunResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { args, model, costUsd, inputTokens, outputTokens } = await callTool<ExtractResult>({
        model: MODEL_CHEAP,
        system: EXTRACT_SYSTEM_PROMPT,
        user: buildExtractUserPrompt(ctx),
        toolName: EXTRACT_TOOL_NAME,
        toolDescription: EXTRACT_TOOL_DESCRIPTION,
        parameters: EXTRACT_PARAMETERS,
      });
      validateExtractResult(args);
      return { ctx, result: args, model, costUsd, inputTokens, outputTokens };
    } catch (e) {
      lastErr = e;
      const status = e instanceof OpenRouterError ? e.status : undefined;
      const retryable = status !== undefined && (status >= 500 || status === 429);
      if (!retryable || attempt >= maxAttempts) throw e;
      await sleep(attempt * 2000);
    }
  }
  throw lastErr;
}

async function saveExtractionRun(pool: Pool, r: ExtractRunResult): Promise<void> {
  await pool.query(
    `insert into post_extraction_runs
       (post_url, candidate_id, prompt_version, model, result, confidence, verdict,
        corrected_venue_handle, input_tokens, output_tokens, cost_usd)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (post_url, prompt_version) do update set
       candidate_id = excluded.candidate_id,
       model = excluded.model,
       result = excluded.result,
       confidence = excluded.confidence,
       verdict = excluded.verdict,
       corrected_venue_handle = excluded.corrected_venue_handle,
       input_tokens = excluded.input_tokens,
       output_tokens = excluded.output_tokens,
       cost_usd = excluded.cost_usd,
       created_at = now()`,
    [
      r.ctx.post_url,
      r.ctx.candidate_id,
      EXTRACT_PROMPT_VERSION,
      r.model,
      JSON.stringify(r.result),
      r.result.confidence,
      r.result.verdict,
      r.result.corrected_venue_handle,
      r.inputTokens,
      r.outputTokens,
      r.costUsd,
    ]
  );
}

async function writeVerdictIfEligible(
  pool: Pool,
  meta: PostMeta,
  r: ExtractRunResult,
  threshold: number,
  resolver: Map<string, number>,
  onlyThisVenue = false
): Promise<{ written: boolean; skipReason?: string }> {
  const decision = decideVerdictWrite(r.result, threshold, (handle) => resolver.get(normalizeHandle(handle)) ?? null);
  if (!decision.shouldWrite) return { written: false, skipReason: decision.skipReason };
  if (onlyThisVenue && decision.verdict !== "THIS_VENUE") return { written: false, skipReason: "only_this_venue" };

  await pool.query(
    `insert into post_venue_verdicts
       (post_url, candidate_id, venue_account_id, verdict, corrected_venue_account_id, reviewed_by, notes)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      r.ctx.post_url,
      meta.candidate_id,
      meta.venue_account_id,
      decision.verdict,
      decision.correctedVenueAccountId ?? null,
      "haiku-extract-v1",
      `${EXTRACT_PROMPT_VERSION} conf=${r.result.confidence.toFixed(2)}: ${r.result.evidence}`,
    ]
  );
  return { written: true };
}

// --- calibration agreement report -----------------------------------------

const THRESHOLDS = [0.5, 0.7, 0.8, 0.9];

interface CalibrationRecord {
  humanVerdict: "THIS_VENUE" | "OTHER_VENUE" | "NOT_WEDDING";
  modelVerdict: ExtractVerdict;
  confidence: number;
  venueAnchorSource: string | null;
}

function computeAgreement(records: CalibrationRecord[], subset: CalibrationRecord[] = records) {
  const humanClasses = ["THIS_VENUE", "OTHER_VENUE", "NOT_WEDDING"] as const;
  const matrix: Record<string, Record<string, number>> = {};
  for (const m of EXTRACT_VERDICTS) {
    matrix[m] = {};
    for (const h of humanClasses) matrix[m][h] = 0;
  }
  for (const r of subset) matrix[r.modelVerdict][r.humanVerdict]++;

  const humanThisVenue = subset.filter((r) => r.humanVerdict === "THIS_VENUE");
  const byThreshold = THRESHOLDS.map((t) => {
    const modelSaysThisVenue = subset.filter((r) => r.modelVerdict === "THIS_VENUE" && r.confidence >= t);
    const correct = modelSaysThisVenue.filter((r) => r.humanVerdict === "THIS_VENUE").length;
    const recalled = humanThisVenue.filter((r) => r.modelVerdict === "THIS_VENUE" && r.confidence >= t).length;
    return {
      threshold: t,
      w_precision: modelSaysThisVenue.length ? correct / modelSaysThisVenue.length : null,
      w_precision_n: modelSaysThisVenue.length,
      recall: humanThisVenue.length ? recalled / humanThisVenue.length : null,
      recall_n: humanThisVenue.length,
    };
  });

  return { n: subset.length, confusion_matrix: matrix, by_threshold: byThreshold };
}

function printAgreementReport(records: CalibrationRecord[], totalCost: number) {
  console.log(`\n=== Calibration agreement report (extract-v1, n=${records.length}) ===`);
  const overall = computeAgreement(records);
  console.log(`\n--- Confusion matrix (rows=model verdict, cols=human verdict) ---`);
  console.log(`               THIS_VENUE  OTHER_VENUE  NOT_WEDDING`);
  for (const m of EXTRACT_VERDICTS) {
    const row = overall.confusion_matrix[m];
    console.log(`  ${m.padEnd(12)} ${String(row.THIS_VENUE).padEnd(12)} ${String(row.OTHER_VENUE).padEnd(12)} ${String(row.NOT_WEDDING).padEnd(12)}`);
  }
  console.log(`\n--- W-precision / recall of human THIS_VENUE, by confidence threshold ---`);
  for (const t of overall.by_threshold) {
    console.log(
      `  t=${t.threshold}  W-precision=${t.w_precision?.toFixed(3) ?? "n/a"} (n=${t.w_precision_n})  recall=${t.recall?.toFixed(3) ?? "n/a"} (of ${t.recall_n} human THIS_VENUE)`
    );
  }

  const anchorSources = [...new Set(records.map((r) => r.venueAnchorSource ?? "(null)"))].sort();
  console.log(`\n--- Same, by candidate venue_anchor_source ---`);
  for (const anchor of anchorSources) {
    const subset = records.filter((r) => (r.venueAnchorSource ?? "(null)") === anchor);
    const agg = computeAgreement(records, subset);
    console.log(`  [${anchor}] n=${agg.n}`);
    for (const t of agg.by_threshold) {
      console.log(
        `    t=${t.threshold}  W-precision=${t.w_precision?.toFixed(3) ?? "n/a"} (n=${t.w_precision_n})  recall=${t.recall?.toFixed(3) ?? "n/a"} (of ${t.recall_n} human THIS_VENUE)`
      );
    }
  }
  console.log(`\n--- Total cost this run: $${totalCost.toFixed(4)} ---`);
}

// --- main -------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  const pool = getPool();

  if (args.writeVerdicts && args.mode !== "corpus") {
    throw new Error("--write-verdicts is only valid with --mode corpus (calibration never writes verdicts)");
  }

  console.log(
    `[extract] mode=${args.mode} limit=${args.limit} threshold=${args.threshold} dryRun=${args.dryRun} ` +
      `writeVerdicts=${args.writeVerdicts} concurrency=${args.concurrency} maxCostUsd=${args.maxCostUsd} force=${args.force}`
  );

  const metaRows = args.mode === "calibration" ? await selectCalibrationMeta(pool, args.limit, args.force) : await selectCorpusMeta(pool, args.limit, args.force);
  console.log(`[extract] selected ${metaRows.length} posts`);
  if (metaRows.length === 0) {
    console.log("[extract] nothing to do (all posts already extracted for this prompt_version, or the queue is empty)");
    await closePool();
    return;
  }

  const contexts = await fetchExtractContexts(pool, metaRows);
  const metaByUrl = new Map(metaRows.map((m) => [m.post_url, m]));

  if (args.dryRun) {
    console.log(`[extract] --dry-run: printing up to 3 prompts, no LLM calls, no writes`);
    for (const ctx of contexts.slice(0, 3)) {
      console.log(`\n=== SYSTEM PROMPT (${EXTRACT_PROMPT_VERSION}) ===\n${EXTRACT_SYSTEM_PROMPT}`);
      console.log(`\n=== USER PROMPT: ${ctx.post_url} ===\n${buildExtractUserPrompt(ctx)}`);
    }
    await closePool();
    return;
  }

  const resolver = args.writeVerdicts ? await loadHandleResolver(pool) : new Map<string, number>();

  const spendState = { total: 0 };
  let processed = 0;
  let errored = 0;
  let consecutiveFailures = 0;
  let aborted = false;
  const verdictCounts: Record<string, number> = {};
  const writeCounts: Record<string, number> = {};
  const calibrationRecords: CalibrationRecord[] = [];

  const queue = [...contexts];
  const workers = Array.from({ length: args.concurrency }, () =>
    (async () => {
      while (queue.length) {
        if (spendState.total >= args.maxCostUsd) {
          console.log(`[extract] hit --max-cost-usd ${args.maxCostUsd}, stopping`);
          queue.length = 0;
          return;
        }
        const ctx = queue.shift();
        if (!ctx) return;
        const meta = metaByUrl.get(ctx.post_url)!;

        try {
          const run = await callExtractWithRetry(ctx);
          spendState.total += run.costUsd ?? 0;
          await saveExtractionRun(pool, run);
          verdictCounts[run.result.verdict] = (verdictCounts[run.result.verdict] ?? 0) + 1;

          if (args.mode === "calibration" && meta.human_verdict) {
            calibrationRecords.push({
              humanVerdict: meta.human_verdict,
              modelVerdict: run.result.verdict,
              confidence: run.result.confidence,
              venueAnchorSource: meta.venue_anchor_source,
            });
          }

          if (args.writeVerdicts) {
            const { written, skipReason } = await writeVerdictIfEligible(pool, meta, run, args.threshold, resolver, args.onlyThisVenue);
            const key = written ? "written" : `skipped_${skipReason}`;
            writeCounts[key] = (writeCounts[key] ?? 0) + 1;
          }

          processed++;
          consecutiveFailures = 0;
          if (processed % 50 === 0) {
            console.log(`[extract] processed=${processed}/${contexts.length} running_cost=$${spendState.total.toFixed(4)}`);
          }
        } catch (e) {
          errored++;
          consecutiveFailures++;
          const msg = e instanceof OpenRouterError ? `${e.status} ${e.body.slice(0, 200)}` : String(e);
          console.error(`[extract] ERROR ${ctx.post_url}: ${msg}`);
          if (consecutiveFailures >= 5) {
            console.error(`[extract] 5 consecutive failures — aborting run (likely API/credits issue)`);
            aborted = true;
            queue.length = 0;
            return;
          }
        }
      }
    })()
  );
  await Promise.all(workers);

  console.log("[extract] DONE" + (aborted ? " (ABORTED EARLY)" : ""));
  console.log(`  processed: ${processed}, errored: ${errored}, of ${contexts.length} selected`);
  console.log(`  verdict counts:`, verdictCounts);
  if (args.writeVerdicts) console.log(`  verdict-write outcomes:`, writeCounts);
  console.log(`  total cost this run: $${spendState.total.toFixed(4)}`);

  if (args.mode === "calibration") {
    printAgreementReport(calibrationRecords, spendState.total);
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
