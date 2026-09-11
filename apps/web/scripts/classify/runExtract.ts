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
 *   corpus -- unreviewed posts (no current verdict by anyone) on candidates
 *     from --clustering-version (default structural-v2), restricted to
 *     chicago_status='CHICAGO_CONFIRMED' unless --include-ambiguous restores
 *     CHICAGO_AMBIGUOUS too, confirmed-first, coverage-ascending (same
 *     ordering discipline as lib/server/postVenueReview.ts's
 *     getPostReviewQueue). With --write-verdicts, THIS_VENUE/NOT_WEDDING
 *     calls >= --threshold and resolvable OTHER_VENUE calls get a
 *     post_venue_verdicts row under reviewed_by='haiku-extract-v1'; UNSURE
 *     is never written (see decideVerdictWrite in extractPrompt.ts).
 *
 * Escalation (--escalate-band lo-hi, --escalate-model): a first-pass (Haiku)
 * result that is UNSURE, or whose confidence falls inside the band, gets a
 * second call to the stronger model with the SAME prompt/tool (see
 * escalation.ts's shouldEscalate). Both results are stored in
 * post_extraction_runs -- Haiku under EXTRACT_PROMPT_VERSION, the escalated
 * call under ESCALATED_PROMPT_VERSION ('extract-v1.2+sonnet') -- and the
 * Sonnet result (when it exists) is what verdict counts, the calibration
 * report, and the verdict-write decision all use.
 *
 * A model reply with an out-of-enum verdict (observed: 'PRE_WEDDING', a real
 * event_type value written into the wrong field) is retried once with an
 * appended instruction naming the exact allowed enum before being counted as
 * an error -- see callExtractWithVerdictRetry below.
 *
 * Third mode, venue-calibration -- the gate for extract-v1.2's four new venue-discovery fields
 * (venue_name, venue_handle_guess, location_claim, chicago_metro): posts that are already part of
 * a DOCUMENTED wedding with a known venue (staging.instagram_posts -> posts -> wedding_posts ->
 * weddings.venue_id not null), preferring weddings this workstream itself created
 * (jeremy_weddings_created), random order. The venue is HIDDEN from the model (venue_username/
 * full_name/biography null, venue_anchor_source='hidden-for-calibration', every role='venue'
 * credit-stack entry removed) -- the question is whether the model can find the right venue on
 * its own. Stored under VENUECAL_PROMPT_VERSION ('extract-v1.2-venuecal', a separate PK space);
 * never writes post_venue_verdicts, never escalates. Prints a venue-attribution report (see
 * printVenueCalibrationReport): handle_match/name_match/no_match/model_null counts and overall
 * match rate, the same split by what the ORIGINAL post's caption actually gave (an @handle for
 * the venue / the venue's bare name / neither), plus the chicago_metro distribution and the
 * location_claim non-null rate. Name/handle matching lives in venueAttribution.ts (pure, unit
 * tested, no DB).
 *
 * Every post's input is built via batched, post_url-scoped queries (never
 * the corpus-wide structural_post_vendor_evidence view per post -- see that
 * view's own comment and docs/STATE.md's landmines section) -- couple_guess
 * / has_non_wedding_event_keyword are recomputed here with the SAME regexes
 * as that view's couple_extract CTE, scoped to just this batch's post_urls.
 *
 * Fourth mode, pool-b -- POOL B (measured 2026-09-09): posts in staging.instagram_posts that are
 * wedding-language but have NO venue anchor at all (no venue-role stack_extraction_entries row,
 * no location_tag_venue_map hit, owner not a known venue account) and aren't already covered --
 * not documented (no posts/wedding_posts row), not already in any jeremy_wedding_candidate_posts.
 * See selectPoolBMeta for the exact criteria (wedding-language caption, not the non-wedding-event
 * keyword list, plus a credit/couple/mention strength signal) and its two named exclusion CTEs
 * (non-metro location_tag, owner account_locations.in_metro=false). The venue is null in the
 * prompt (venue_anchor_source='none-pool-b') -- the point is discovering venue_name/
 * venue_handle_guess/location_claim/chicago_metro from scratch, same v1.2 fields venue-
 * calibration gates, but on posts with no candidate at all. Stored under EXTRACT_PROMPT_VERSION
 * with candidate_id NULL and pool='pool-b' (see applyPostExtractionSchema.ts) -- NEVER writes
 * post_venue_verdicts (no candidate to verdict against). Supports --escalate-band (same
 * shouldEscalate semantics as corpus mode -- band applies to confidence regardless of verdict
 * already, nothing mode-specific needed there) and --max-cost-usd, resumable via the same
 * not-already-extracted-under-this-prompt_version discipline. Ends in a discovery report (verdict
 * counts, chicago_metro distribution, venue_handle_guess resolution rate, venue_name-only count,
 * top 30 normalized venue_name values with their most common location_claim) -- see
 * printPoolBDiscoveryReport. Does NOT build the resolver that turns these into real venues --
 * that is separate, later work.
 *
 * Fifth mode, ben-weddings -- D057 candidate ("go through Ben's posts and make sure they pass
 * our bar for real credible documented wedding too"): Ben's original crawl produced 1,325
 * `weddings` rows with NO `jeremy_weddings_created` row (his phase_dedup rule -- a post with >=3
 * distinct vendor roles becomes a wedding; no model or human ever read those posts), 1,602 posts
 * total via `wedding_posts` -> `posts` (source='venue_tagged', NEVER in staging.instagram_posts).
 * Reads each post the same "is this a real wedding at the anchored venue" question as corpus
 * mode, anchored to `weddings.venue_id` instead of a jeremy_wedding_candidates row --
 * venue_anchor_source is the literal 'ben_crawl', candidate_id is always NULL (see
 * fetchBenWeddingsContexts). Same EXTRACT_SYSTEM_PROMPT, same --escalate-band/--escalate-model/
 * --max-cost-usd discipline as every other mode. Stored under EXTRACT_PROMPT_VERSION (or
 * ESCALATED_PROMPT_VERSION) with pool='ben-weddings' -- resumable via the same
 * not-already-extracted-under-this-prompt_version-and-pool discipline. Does NOT write
 * post_venue_verdicts (there is no jeremy_wedding_candidates row to verdict against; the D057
 * audit script, auditBenWeddings.ts, makes the retire/keep/human call per wedding from these
 * runs). Credit stack comes from stack_extraction_entries_v2 (STACK_PARSER_V2_VERSION) --
 * runStackParserV10.ts --source ben is this mode's sibling, parsing Ben's posts into that same
 * table. location_tag is always null: unlike staging.instagram_posts, `posts` has no
 * location_tag column for Ben's crawl.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/runExtract.ts --mode calibration --limit 20 --dry-run
 *   bun run scripts/classify/runExtract.ts --mode calibration --limit 500
 *   bun run scripts/classify/runExtract.ts --mode corpus --limit 500 --threshold 0.8 --write-verdicts
 *   bun run scripts/classify/runExtract.ts --mode corpus --limit 500 --write-verdicts --include-ambiguous
 *   bun run scripts/classify/runExtract.ts --mode corpus --limit 500 --clustering-version structural-v3-a1 --write-verdicts
 *   bun run scripts/classify/runExtract.ts --mode corpus --limit 500 --write-verdicts --escalate-band 0.5-0.8 --escalate-model anthropic/claude-sonnet-5
 *   bun run scripts/classify/runExtract.ts --mode venue-calibration --limit 5 --dry-run
 *   bun run scripts/classify/runExtract.ts --mode venue-calibration --limit 200
 *   bun run scripts/classify/runExtract.ts --mode pool-b --limit 5 --dry-run
 *   bun run scripts/classify/runExtract.ts --mode pool-b --limit 500 --max-cost-usd 5
 *   bun run scripts/classify/runExtract.ts --mode pool-b --limit 500 --escalate-band 0.5-0.8 --escalate-model anthropic/claude-sonnet-5
 *   bun run scripts/classify/runExtract.ts --mode ben-weddings --limit 20 --dry-run
 *   bun run scripts/classify/runExtract.ts --mode ben-weddings --limit 1602 --max-cost-usd 10
 *   bun run scripts/classify/runExtract.ts --mode ben-weddings --limit 500 --escalate-band 0.5-0.8
 */
import type { Pool } from "pg";
import { getPool, closePool } from "./db";
import { MODEL_CHEAP, MODEL_EXPENSIVE } from "./llmClassifier";
import { callTool, OpenRouterError } from "./openrouter";
import { parseEscalateBand, shouldEscalate, type EscalateBand } from "./escalation";
import {
  normalizeVenueName,
  classifyVenueAttribution,
  classifyCaptionVenueSignal,
  type VenueAttributionResult,
  type CaptionVenueSignal,
} from "./venueAttribution";
import { STRUCTURAL_CLUSTERING_VERSION as DEFAULT_STRUCTURAL_CLUSTERING_VERSION } from "../../lib/server/structuralVersion";
import { STACK_PARSER_V2_VERSION } from "../graph/stackParser";
import {
  EXTRACT_PROMPT_VERSION,
  EXTRACT_SYSTEM_PROMPT,
  EXTRACT_SYSTEM_PROMPT_POOL_B,
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

// Escalated (Sonnet) extraction runs are stored under a DIFFERENT prompt_version in the SAME
// post_extraction_runs table (same PK shape, (post_url, prompt_version)) -- so the Haiku row
// under EXTRACT_PROMPT_VERSION is never overwritten, and both are independently queryable.
const ESCALATED_PROMPT_VERSION = `${EXTRACT_PROMPT_VERSION}+sonnet`;

// --mode venue-calibration: a SEPARATE prompt_version/PK space in the same post_extraction_runs
// table -- gates the v1.2 venue-discovery fields, never mixed with corpus/calibration rows.
const VENUECAL_PROMPT_VERSION = `${EXTRACT_PROMPT_VERSION}-venuecal`;

interface Args {
  mode: "calibration" | "corpus" | "venue-calibration" | "pool-b" | "ben-weddings";
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
  /** --clustering-version <v> (default structural-v2, lib/server/structuralVersion.ts): which
   *  jeremy_wedding_candidates.clustering_version --mode corpus draws from. Lets a later run
   *  target e.g. 'structural-v3-a1' candidates another agent is creating, without a code change. */
  clusteringVersion: string;
  /** --include-ambiguous: --mode corpus normally selects ONLY chicago_status='CHICAGO_CONFIRMED'
   *  candidates; this flag restores the prior CHICAGO_CONFIRMED+CHICAGO_AMBIGUOUS pool. */
  includeAmbiguous: boolean;
  /** --escalate-band lo-hi (e.g. "0.5-0.8"): a first-pass (Haiku) result that is UNSURE, or whose
   *  confidence falls inside this band, gets a second call to --escalate-model. null (the
   *  default, no flag given) disables escalation entirely. */
  escalateBand: EscalateBand | null;
  /** --escalate-model <id> (default anthropic/claude-sonnet-5, llmClassifier.ts's MODEL_EXPENSIVE
   *  -- the project's existing upper-tier OpenRouter model id, same one runClassify.ts's tiered
   *  classifier already escalates to). */
  escalateModel: string;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const mode = get("--mode");
  if (
    mode !== "calibration" &&
    mode !== "corpus" &&
    mode !== "venue-calibration" &&
    mode !== "pool-b" &&
    mode !== "ben-weddings"
  ) {
    throw new Error(`--mode calibration|corpus|venue-calibration|pool-b|ben-weddings is required (got ${mode ?? "(none)"})`);
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
    clusteringVersion: get("--clustering-version") ?? DEFAULT_STRUCTURAL_CLUSTERING_VERSION,
    includeAmbiguous: a.includes("--include-ambiguous"),
    escalateBand: parseEscalateBand(get("--escalate-band")),
    escalateModel: get("--escalate-model") ?? MODEL_EXPENSIVE,
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

/** Corpus set: unreviewed posts (no current verdict by anyone) on candidates from
 * `clusteringVersion`, restricted to chicago_status='CHICAGO_CONFIRMED' by default (or
 * CHICAGO_CONFIRMED+CHICAGO_AMBIGUOUS when includeAmbiguous is set), confirmed first, then venue
 * coverage (documented Chicago weddings) ascending -- same ordering discipline as
 * lib/server/postVenueReview.ts's getPostReviewQueue. Excludes posts already extracted under
 * this prompt_version unless --force. */
async function selectCorpusMeta(
  pool: Pool,
  limit: number,
  force: boolean,
  clusteringVersion: string,
  includeAmbiguous: boolean
): Promise<PostMeta[]> {
  const chicagoStatuses = includeAmbiguous ? ["CHICAGO_CONFIRMED", "CHICAGO_AMBIGUOUS"] : ["CHICAGO_CONFIRMED"];
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
       and jwc.chicago_status = any($5::text[])
       and not exists (
         select 1 from post_venue_verdicts_current pv where pv.post_url = cp.source_post_url
       )
       and ($2::boolean or not exists (
         select 1 from post_extraction_runs per
         where per.post_url = cp.source_post_url and per.prompt_version = $3
           -- a pool-b venue-discovery read (no anchor shown) does not count as an anchored read
           and coalesce(per.pool, '') <> 'pool-b'
       ))
     order by
       case jwc.chicago_status when 'CHICAGO_CONFIRMED' then 0 when 'CHICAGO_AMBIGUOUS' then 1 else 2 end,
       coalesce(vc.n, 0) asc,
       cp.candidate_id asc,
       cp.source_post_url asc
     limit $1`,
    [limit, force, EXTRACT_PROMPT_VERSION, clusteringVersion, chicagoStatuses]
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

// --- pool-b (D055 Phase 2, 2026-09-09) --------------------------------------

// Condition (4) of the POOL B spec: the caption must contain plain wedding language. Deliberately
// simpler/broader than couple/credit-stack signals -- this is the gate that makes a post ELIGIBLE
// for consideration at all, not the strength signal that decides it's WORTH reading (that's
// n_credits/has_couple/n_mentions below). Same \\y / \\. doubling discipline as the consts above
// (D055 landmine: SQL inside JS template literals eats \\y / \\s).
const WEDDING_LANGUAGE_SQL = `\\y(wedding|married|newlywed|bride|groom|elope|elopement|vows|mr\\.? *& *mrs)\\y`;

// Condition (6)'s couple-regex qualifier, exactly as specified -- deliberately NOT the same as
// COUPLE_RAW_MATCH_SQL above (no Mr./Mrs./"Couple:"/"Bride:" alternatives, no business-word veto):
// this is a qualification signal (does ANY couple-shaped pair of capitalized names appear at
// all), not the couple_guess value shown to the model (which still uses COUPLE_RAW_MATCH_SQL +
// the veto, via fetchPoolBContexts below, same as every other mode).
const POOL_B_COUPLE_QUALIFY_SQL = `[A-Z][a-z]+ *(&|\\+|and) *[A-Z][a-z]+`;

// Exclusion 1 of 2 (POOL B spec): a location_tag naming a place clearly outside the Chicago
// metro -- exact (case-insensitive) matches plus a few state-name suffixes. Kept as plain arrays
// (not baked into SQL) so the list is easy to read/extend without touching the query string.
const NON_METRO_LOCATION_TAGS_EXACT = [
  "Milwaukee, Wisconsin", "Lake Geneva, Wisconsin", "Grand Rapids, Michigan",
  "Kansas City, Missouri", "St. Louis, Missouri", "Saint Augustine, Florida",
  "Detroit, Michigan", "Holland, Michigan", "San Diego, California",
  "Salt Lake City, Utah", "Los Angeles, California", "Orange County, California",
  "New York, New York", "New York City", "Madison, Wisconsin", "Houston, Texas",
  "Atlanta, Georgia", "Santa Barbara, California", "Santa Ynez, California",
  "Bloomington, Illinois", "Milwaukee Art Museum", "Villa Terrace Museum & Gardens",
  "St. James 1868 Event Venue", "Stonepine Estate",
].map((s) => s.toLowerCase());

const NON_METRO_LOCATION_TAG_SUFFIXES = [
  ", Wisconsin", ", Michigan", ", Missouri", ", California", ", Texas", ", Florida",
  ", Utah", ", Georgia", ", Ohio", ", Minnesota", ", Iowa", ", Colorado", ", Arizona",
  ", Nevada", ", Tennessee", ", North Carolina", ", South Carolina",
];

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

interface PoolBRow {
  post_url: string;
  location_tag: string | null;
  owner_username: string | null;
  n_credits: number;
  has_couple: boolean;
  n_mentions: number;
  excluded_by_location: boolean;
  excluded_by_owner: boolean;
  already_extracted: boolean;
}

interface PoolBSelection {
  rows: PoolBRow[];
  qualifiedCount: number;
  locationExcludedCount: number;
  ownerExcludedCount: number;
  finalPoolCount: number;
  selected: PoolBRow[];
}

/** POOL B (measured 2026-09-09, D055 Phase 2): one query returns every post satisfying the core
 * criteria (documented/candidate/anchor/wedding-language/non-wedding-keyword/strength-signal),
 * each row flagged with whether it would be removed by either of the two named exclusion CTEs
 * (location_tag non-metro, owner account_locations.in_metro=false) plus whether it's already been
 * extracted under EXTRACT_PROMPT_VERSION (resumability). Flags -- not a pre-filtered row set --
 * so the caller can report exactly how many each exclusion removed (the spec's ask) from a single
 * round trip, then apply --force/--limit/ordering in JS. */
async function selectPoolBMeta(pool: Pool, limit: number, force: boolean): Promise<PoolBSelection> {
  const { rows } = await pool.query<PoolBRow>(
    `with base as (
       select sp.post_url, sp.caption_raw, sp.location_tag, sp.owner_username, sp.mentions
       from staging.instagram_posts sp
       where sp.caption_raw ~* '${WEDDING_LANGUAGE_SQL}'
         and coalesce(sp.caption_raw !~* '${NON_WEDDING_EVENT_KEYWORD_SQL}', true)
         -- (1) not documented: no posts+wedding_posts row for this post_url
         and not exists (
           select 1 from wedding_posts wp join posts p on p.id = wp.post_id where p.url = sp.post_url
         )
         -- (2) not already in any jeremy_wedding_candidate_posts
         and not exists (
           select 1 from jeremy_wedding_candidate_posts cp where cp.source_post_url = sp.post_url
         )
         -- (3) no venue anchor at all: no venue-role stack credit, no location_tag_venue_map
         -- hit, owner not a known vendors.category='venue' account
         and not exists (
           select 1 from stack_extraction_entries se
           where se.post_url = sp.post_url and se.role = 'venue' and se.stack_parser_version = $1
         )
         and not exists (
           select 1 from location_tag_venue_map ltm where ltm.location_tag = sp.location_tag
         )
         and not exists (
           select 1 from accounts a
           join vendors v on v.account_id = a.id and v.category = 'venue'
           where lower(a.username::text) = lower(sp.owner_username)
         )
     ),
     scored as (
       select
         b.post_url, b.location_tag, b.owner_username,
         (select count(*) from stack_extraction_entries se2
          where se2.post_url = b.post_url and se2.stack_parser_version = $1
            and se2.role not in ('venue','other')) as n_credits,
         (b.caption_raw ~* '${POOL_B_COUPLE_QUALIFY_SQL}') as has_couple,
         coalesce(jsonb_array_length(b.mentions), 0) as n_mentions
       from base b
     ),
     -- (6) strength signal: >=3 non-venue credits, OR the couple regex, OR >=3 @mentions
     qualified as (
       select * from scored where n_credits >= 3 or has_couple or n_mentions >= 3
     )
     select
       q.post_url, q.location_tag, q.owner_username, q.n_credits, q.has_couple, q.n_mentions,
       -- exclusion 1/2: location_tag names a place clearly outside the Chicago metro
       (
         lower(coalesce(q.location_tag, '')) = any($2::text[])
         or exists (
           select 1 from unnest($3::text[]) as sfx(s)
           where lower(coalesce(q.location_tag, '')) like '%' || lower(sfx.s)
         )
       ) as excluded_by_location,
       -- exclusion 2/2: the posting account is pinned to a non-metro location
       exists (
         select 1 from accounts a
         join account_locations al on al.account_id = a.id
         where lower(a.username::text) = lower(q.owner_username) and al.in_metro = false
       ) as excluded_by_owner,
       exists (
         select 1 from post_extraction_runs per
         where per.post_url = q.post_url and per.prompt_version = $4
       ) as already_extracted
     from qualified q`,
    [STACK_PARSER_VERSION, NON_METRO_LOCATION_TAGS_EXACT, NON_METRO_LOCATION_TAG_SUFFIXES, EXTRACT_PROMPT_VERSION]
  );

  const qualifiedCount = rows.length;
  const afterLocation = rows.filter((r) => !r.excluded_by_location);
  const locationExcludedCount = qualifiedCount - afterLocation.length;
  const afterOwner = afterLocation.filter((r) => !r.excluded_by_owner);
  const ownerExcludedCount = afterLocation.length - afterOwner.length;
  const finalPool = afterOwner;

  // Order (spec): >=3 credits first, then couple regex, then mentions -- a row can satisfy more
  // than one; it sorts by the HIGHEST-priority criterion it satisfies.
  // Tiers (coordinator, 2026-09-10): the bare couple regex is loose ("Ceremony and Reception"
  // matches it), so couple-only posts with no tagged vendor sort LAST and a --limit can cut them.
  const tier = (r: PoolBRow): number =>
    r.n_credits >= 3 ? 0 : r.n_mentions >= 3 ? 1 : r.has_couple && r.n_mentions >= 1 ? 2 : 3;
  const eligible = (force ? finalPool : finalPool.filter((r) => !r.already_extracted)).slice();
  eligible.sort((a, b) => tier(a) - tier(b) || a.post_url.localeCompare(b.post_url));

  return {
    rows,
    qualifiedCount,
    locationExcludedCount,
    ownerExcludedCount,
    finalPoolCount: finalPool.length,
    selected: eligible.slice(0, limit),
  };
}

/** Batched, post_url-scoped context fetch for pool-b (same discipline as fetchExtractContexts) --
 * venue fields are always null (venue_anchor_source='none-pool-b': by construction pool-b posts
 * have no venue anchor at all, so there is nothing to hide or show), the full credit stack is
 * included (no role='venue' rows exist to filter out), and has_non_wedding_event_keyword is
 * hardcoded false (guaranteed by selectPoolBMeta's own filter, not recomputed). */
async function fetchPoolBContexts(pool: Pool, postUrls: string[]): Promise<ExtractPostContext[]> {
  if (postUrls.length === 0) return [];

  const [{ rows: postRows }, { rows: stackRows }] = await Promise.all([
    pool.query(
      `select
         sp.post_url, sp.caption_raw, sp.location_tag, sp.owner_username, sp.post_timestamp,
         (case
            when cx.raw_match is not null and cx.raw_match !~* '${COUPLE_BUSINESS_WORD_VETO_SQL}'
            then lower(cx.raw_match) else null
          end) as couple_guess
       from staging.instagram_posts sp
       left join lateral (
         select substring(sp.caption_raw from '${COUPLE_RAW_MATCH_SQL}') as raw_match
       ) cx on true
       where sp.post_url = any($1::text[])`,
      [postUrls]
    ),
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

  const stackByUrl = new Map<string, StackEntry[]>();
  for (const r of stackRows) {
    const list = stackByUrl.get(r.post_url) ?? [];
    list.push({ role_raw: r.role_raw, role: r.role, handle: r.handle });
    stackByUrl.set(r.post_url, list);
  }

  return postUrls.map((url) => {
    const p = postByUrl.get(url);
    return {
      post_url: url,
      caption_raw: p?.caption_raw ?? null,
      location_tag: p?.location_tag ?? null,
      owner_username: p?.owner_username ?? null,
      post_timestamp: p?.post_timestamp ?? null,
      // Stand-in only (same pattern as venue-calibration's wedding_id stand-in): pool-b has no
      // jeremy_wedding_candidates row at all, so there is no real candidate_id. Never treated as
      // one -- saveExtractionRun is called with an explicit candidateId:null override below, and
      // pool-b never calls writeVerdictIfEligible (whose candidate_id IS a real FK).
      candidate_id: 0,
      venue_anchor_source: "none-pool-b",
      venue_username: null,
      venue_full_name: null,
      venue_biography: null,
      stack: stackByUrl.get(url) ?? [],
      couple_guess: p?.couple_guess ?? null,
      has_non_wedding_event_keyword: false,
    };
  });
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

const BAD_VERDICT_RETRY_INSTRUCTION =
  `IMPORTANT: your previous reply used an invalid verdict value. verdict must be one of ` +
  `THIS_VENUE|OTHER_VENUE|NOT_WEDDING|UNSURE -- resubmit with a valid verdict.`;

/** One tool call against `model`, with the shared cached system prompt (see openrouter.ts's
 * cacheSystemPrompt). `extraInstruction`, when given, is appended to the user prompt only -- the
 * system block (and its cache breakpoint) stays byte-identical across a verdict retry, so the
 * retry can still hit cache. */
async function callExtractOnce(
  ctx: ExtractPostContext,
  model: string,
  extraInstruction?: string,
  systemPrompt: string = EXTRACT_SYSTEM_PROMPT
): Promise<{ args: ExtractResult; model: string; costUsd: number | null; inputTokens: number; outputTokens: number }> {
  const user = extraInstruction ? `${buildExtractUserPrompt(ctx)}\n\n${extraInstruction}` : buildExtractUserPrompt(ctx);
  const { args, model: respModel, costUsd, inputTokens, outputTokens } = await callTool<ExtractResult>({
    model,
    system: systemPrompt,
    user,
    toolName: EXTRACT_TOOL_NAME,
    toolDescription: EXTRACT_TOOL_DESCRIPTION,
    parameters: EXTRACT_PARAMETERS,
    cacheSystemPrompt: true,
  });
  return { args, model: respModel, costUsd, inputTokens, outputTokens };
}

/** Validates the model's reply; on an out-of-enum verdict specifically (the observed
 * 'PRE_WEDDING' -- a real event_type value the model sometimes writes into the verdict field by
 * mistake), retries ONCE with an appended user-prompt instruction naming the exact allowed enum
 * before counting it as an error. Any other validation failure (bad event_type, out-of-range
 * confidence, non-string evidence, ...) is NOT retried here -- it propagates immediately, same as
 * before this change. Cost/tokens from both calls are summed into the returned run so spend
 * accounting isn't silently short when a retry fires. */
async function callExtractWithVerdictRetry(ctx: ExtractPostContext, model: string, systemPrompt: string = EXTRACT_SYSTEM_PROMPT): Promise<ExtractRunResult> {
  const first = await callExtractOnce(ctx, model, undefined, systemPrompt);
  try {
    validateExtractResult(first.args);
    return { ctx, result: first.args, model: first.model, costUsd: first.costUsd, inputTokens: first.inputTokens, outputTokens: first.outputTokens };
  } catch (e) {
    if (!(e instanceof Error) || !/bad verdict/i.test(e.message)) throw e;
    const retry = await callExtractOnce(ctx, model, BAD_VERDICT_RETRY_INSTRUCTION, systemPrompt);
    validateExtractResult(retry.args); // still bad -> throws, counted as an error same as before
    return {
      ctx,
      result: retry.args,
      model: retry.model,
      costUsd: (first.costUsd ?? 0) + (retry.costUsd ?? 0),
      inputTokens: first.inputTokens + retry.inputTokens,
      outputTokens: first.outputTokens + retry.outputTokens,
    };
  }
}

/** openrouter.ts's callTool already retries 429 internally with backoff
 * (its own rate-limit story); it does NOT retry 5xx (throws immediately).
 * This thin wrapper adds backoff for 5xx and any other transient
 * OpenRouterError, without touching the shared client other callers
 * (llmClassifier.ts) depend on. */
async function callExtractWithRetry(ctx: ExtractPostContext, model: string, maxAttempts = 4, systemPrompt: string = EXTRACT_SYSTEM_PROMPT): Promise<ExtractRunResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callExtractWithVerdictRetry(ctx, model, systemPrompt);
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

/** promptVersion is a parameter (not always EXTRACT_PROMPT_VERSION) so an escalated Sonnet run
 * can be stored under ESCALATED_PROMPT_VERSION ('extract-v1.2+sonnet') -- a distinct row in the
 * same table, same (post_url, prompt_version) PK shape, never colliding with the Haiku row.
 *
 * `opts.candidateId`, when explicitly provided (including null), OVERRIDES r.ctx.candidate_id --
 * pool-b uses this to write a real NULL regardless of the stand-in number its context carries
 * (see fetchPoolBContexts). `opts.poolTag` writes the `pool` column (D055 pool-b addendum, see
 * applyPostExtractionSchema.ts) -- omitted/undefined means null, same as every pre-pool-b row. */
async function saveExtractionRun(
  pool: Pool,
  r: ExtractRunResult,
  promptVersion: string,
  opts: { candidateId?: number | null; poolTag?: string | null } = {}
): Promise<void> {
  const candidateId = "candidateId" in opts ? opts.candidateId ?? null : r.ctx.candidate_id;
  const poolTag = opts.poolTag ?? null;
  await pool.query(
    `insert into post_extraction_runs
       (post_url, candidate_id, prompt_version, model, result, confidence, verdict,
        corrected_venue_handle, input_tokens, output_tokens, cost_usd, pool)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
       pool = excluded.pool,
       created_at = now()`,
    [
      r.ctx.post_url,
      candidateId,
      promptVersion,
      r.model,
      JSON.stringify(r.result),
      r.result.confidence,
      r.result.verdict,
      r.result.corrected_venue_handle,
      r.inputTokens,
      r.outputTokens,
      r.costUsd,
      poolTag,
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

// --- venue-calibration mode (extract-v1.2 venue-discovery field gate) -----

interface VenueCalMeta {
  post_url: string;
  wedding_id: number;
  venue_account_id: number;
}

/** venue-calibration set: posts that are already part of a DOCUMENTED wedding with a known venue
 * -- staging.instagram_posts joined (by shortcode, extracted from its own post_url the same way
 * every other shortcode()-based script in scripts/graph/ does) to posts, to wedding_posts, to
 * weddings.venue_id not null -- preferring weddings THIS WORKSTREAM created (a
 * jeremy_weddings_created row), random order otherwise. A separate prompt_version/PK space
 * (VENUECAL_PROMPT_VERSION) from corpus/calibration rows; excludes posts already extracted under
 * it unless --force (resumable, same discipline as the other two modes). */
async function selectVenueCalibrationMeta(pool: Pool, limit: number, force: boolean): Promise<VenueCalMeta[]> {
  const { rows } = await pool.query(
    `with candidates as (
       select distinct sp.post_url, w.id as wedding_id, w.venue_id as venue_account_id,
              exists (
                select 1 from jeremy_weddings_created jwc where jwc.wedding_id = w.id
              ) as workstream_created
       from staging.instagram_posts sp
       join posts p on p.shortcode = substring(sp.post_url from '/p/([^/]+)')
       join wedding_posts wp on wp.post_id = p.id
       join weddings w on w.id = wp.wedding_id
       where w.venue_id is not null
         and ($2::boolean or not exists (
           select 1 from post_extraction_runs per
           where per.post_url = sp.post_url and per.prompt_version = $3
         ))
     )
     select post_url, wedding_id, venue_account_id
     from candidates
     order by workstream_created desc, random()
     limit $1`,
    [limit, force, VENUECAL_PROMPT_VERSION]
  );
  return rows.map((r) => ({
    post_url: r.post_url,
    wedding_id: Number(r.wedding_id),
    venue_account_id: Number(r.venue_account_id),
  }));
}

interface VenueCalIdentity {
  fullName: string | null;
  vendorName: string | null;
  locationTags: string[];
}

interface VenueCalSignalSource {
  mentions: string[];
  /** The post's role='venue' credit-stack handle(s) -- the ones HIDDEN from the model below.
   *  Kept for the venue-attribution report's caption-signal split, never shown to the model. */
  removedVenueStackHandles: string[];
}

interface VenueCalBundle {
  contexts: ExtractPostContext[];
  signalSourceByUrl: Map<string, VenueCalSignalSource>;
  identityByAccountId: Map<number, VenueCalIdentity>;
}

/** Batched, post_url-scoped (same discipline as fetchExtractContexts) -- builds the HIDDEN-VENUE
 * prompt context: venue_username/full_name/biography are null, venue_anchor_source is the literal
 * string 'hidden-for-calibration', and every role='venue' stack_extraction_entries row is
 * excluded from the stack shown to the model (non-venue credits, caption, and location tag stay).
 * Also returns the data the report needs but the MODEL never sees: the post's raw @mentions, the
 * removed venue-stack handle(s), and the actual venue's name variants (accounts.full_name,
 * vendors.name, location_tag_venue_map tags). */
async function fetchVenueCalContexts(pool: Pool, metaRows: VenueCalMeta[]): Promise<VenueCalBundle> {
  if (metaRows.length === 0) return { contexts: [], signalSourceByUrl: new Map(), identityByAccountId: new Map() };
  const postUrls = metaRows.map((m) => m.post_url);
  const venueAccountIds = [...new Set(metaRows.map((m) => m.venue_account_id))];

  const [{ rows: postRows }, { rows: stackRows }, { rows: identityRows }] = await Promise.all([
    pool.query(
      `select
         sp.post_url, sp.caption_raw, sp.location_tag, sp.owner_username, sp.post_timestamp, sp.mentions,
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
    pool.query(
      `select post_url, role_raw, role, handle, line_no
       from stack_extraction_entries
       where post_url = any($1::text[]) and stack_parser_version = $2
       order by post_url, line_no asc`,
      [postUrls, STACK_PARSER_VERSION]
    ),
    pool.query(
      `select a.id as account_id, a.full_name,
              (select v.name from vendors v where v.account_id = a.id limit 1) as vendor_name,
              coalesce(
                (select array_agg(ltm.location_tag) from location_tag_venue_map ltm where ltm.venue_account_id = a.id),
                '{}'
              ) as location_tags
       from accounts a
       where a.id = any($1::bigint[])`,
      [venueAccountIds]
    ),
  ]);

  const postByUrl = new Map<string, (typeof postRows)[number]>();
  for (const r of postRows) postByUrl.set(r.post_url, r);

  const nonVenueStackByUrl = new Map<string, StackEntry[]>();
  const venueStackHandlesByUrl = new Map<string, string[]>();
  for (const r of stackRows) {
    if (r.role === "venue") {
      const list = venueStackHandlesByUrl.get(r.post_url) ?? [];
      list.push(r.handle);
      venueStackHandlesByUrl.set(r.post_url, list);
    } else {
      const list = nonVenueStackByUrl.get(r.post_url) ?? [];
      list.push({ role_raw: r.role_raw, role: r.role, handle: r.handle });
      nonVenueStackByUrl.set(r.post_url, list);
    }
  }

  const identityByAccountId = new Map<number, VenueCalIdentity>();
  for (const r of identityRows) {
    identityByAccountId.set(Number(r.account_id), {
      fullName: r.full_name ?? null,
      vendorName: r.vendor_name ?? null,
      locationTags: Array.isArray(r.location_tags) ? r.location_tags : [],
    });
  }

  const signalSourceByUrl = new Map<string, VenueCalSignalSource>();
  const contexts: ExtractPostContext[] = metaRows.map((m) => {
    const p = postByUrl.get(m.post_url);
    signalSourceByUrl.set(m.post_url, {
      mentions: Array.isArray(p?.mentions) ? p.mentions : [],
      removedVenueStackHandles: venueStackHandlesByUrl.get(m.post_url) ?? [],
    });
    return {
      post_url: m.post_url,
      caption_raw: p?.caption_raw ?? null,
      location_tag: p?.location_tag ?? null,
      owner_username: p?.owner_username ?? null,
      post_timestamp: p?.post_timestamp ?? null,
      // Stand-in for candidate_id: this mode has no jeremy_wedding_candidates row at all (the
      // post already belongs to a DOCUMENTED wedding) -- wedding_id is stored here purely so
      // post_extraction_runs.candidate_id (nullable, no FK) carries some provenance. Never
      // treated as a real candidate id: venue-calibration never writes post_venue_verdicts
      // (whose candidate_id IS a real FK to jeremy_wedding_candidates), so nothing depends on it.
      candidate_id: m.wedding_id,
      venue_anchor_source: "hidden-for-calibration",
      venue_username: null,
      venue_full_name: null,
      venue_biography: null,
      stack: nonVenueStackByUrl.get(m.post_url) ?? [],
      couple_guess: p?.couple_guess ?? null,
      has_non_wedding_event_keyword: Boolean(p?.has_non_wedding_event_keyword),
    };
  });

  return { contexts, signalSourceByUrl, identityByAccountId };
}

interface VenueCalRecord {
  postUrl: string;
  attribution: VenueAttributionResult;
  captionSignal: CaptionVenueSignal;
  chicagoMetro: ExtractResult["chicago_metro"];
  locationClaimPresent: boolean;
}

function printVenueCalibrationReport(records: VenueCalRecord[], totalCost: number) {
  const n = records.length;
  console.log(`\n=== Venue-attribution report (${VENUECAL_PROMPT_VERSION}, n=${n}) ===`);
  if (n === 0) {
    console.log("(no posts processed)");
    return;
  }

  const printBucket = (label: string, subset: VenueCalRecord[]) => {
    if (subset.length === 0) {
      console.log(`  [${label}] n=0`);
      return;
    }
    const handle = subset.filter((r) => r.attribution.match === "handle_match").length;
    const name = subset.filter((r) => r.attribution.match === "name_match").length;
    const no = subset.filter((r) => r.attribution.match === "no_match").length;
    const modelNull = subset.filter((r) => r.attribution.match === "model_null").length;
    const rate = (handle + name) / subset.length;
    console.log(
      `  [${label}] n=${subset.length}  handle_match=${handle} name_match=${name} no_match=${no} model_null=${modelNull}  match_rate=${rate.toFixed(3)}`
    );
  };

  console.log(`\n--- Overall (match rate = (handle_match + name_match) / n) ---`);
  printBucket("all", records);

  console.log(`\n--- By caption venue signal (what the ORIGINAL post gave; the handle was hidden from the model either way) ---`);
  for (const signal of ["handle", "name_only", "neither"] as const) {
    printBucket(signal, records.filter((r) => r.captionSignal === signal));
  }

  const metroCounts: Record<string, number> = { yes: 0, no: 0, unknown: 0 };
  for (const r of records) metroCounts[r.chicagoMetro] = (metroCounts[r.chicagoMetro] ?? 0) + 1;
  console.log(`\n--- chicago_metro distribution ---`);
  console.log(`  yes: ${metroCounts.yes}  no: ${metroCounts.no}  unknown: ${metroCounts.unknown}`);

  const withClaim = records.filter((r) => r.locationClaimPresent).length;
  console.log(`\n--- location_claim non-null rate: ${(withClaim / n).toFixed(3)} (${withClaim}/${n}) ---`);

  console.log(`\n--- Total cost this run: $${totalCost.toFixed(4)} ---`);
}

/** Self-contained (does not touch selectCorpusMeta/selectCalibrationMeta/fetchExtractContexts or
 * the corpus/calibration worker loop below) so the other two modes are unaffected by this one.
 * Never calls writeVerdictIfEligible -- venue-calibration never writes post_venue_verdicts, and
 * never escalates (--escalate-band is meaningless here; the point is measuring the FIRST-pass
 * model's venue-discovery ability with the venue hidden, one call per post). */
async function runVenueCalibration(pool: Pool, args: Args): Promise<void> {
  const metaRows = await selectVenueCalibrationMeta(pool, args.limit, args.force);
  console.log(`[extract] selected ${metaRows.length} posts (venue-calibration)`);
  if (metaRows.length === 0) {
    console.log(
      "[extract] nothing to do (all posts already extracted under this prompt_version, or no documented weddings with a venue remain)"
    );
    return;
  }

  const { contexts, signalSourceByUrl, identityByAccountId } = await fetchVenueCalContexts(pool, metaRows);
  const metaByUrl = new Map(metaRows.map((m) => [m.post_url, m]));

  if (args.dryRun) {
    console.log(`[extract] --dry-run (venue-calibration): printing up to 3 HIDDEN-VENUE prompts, no LLM calls, no writes`);
    for (const ctx of contexts.slice(0, 3)) {
      console.log(`\n=== SYSTEM PROMPT (mode=venue-calibration) ===\n${EXTRACT_SYSTEM_PROMPT}`);
      console.log(`\n=== USER PROMPT: ${ctx.post_url} (venue HIDDEN) ===\n${buildExtractUserPrompt(ctx)}`);
    }
    return;
  }

  const resolver = await loadHandleResolver(pool);
  const resolveHandle = (handle: string): number | null => resolver.get(normalizeHandle(handle)) ?? null;

  const spendState = { total: 0 };
  let processed = 0;
  let errored = 0;
  let consecutiveFailures = 0;
  let aborted = false;
  const records: VenueCalRecord[] = [];

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
          const run = await callExtractWithRetry(ctx, MODEL_CHEAP);
          spendState.total += run.costUsd ?? 0;
          await saveExtractionRun(pool, run, VENUECAL_PROMPT_VERSION);

          const identity = identityByAccountId.get(meta.venue_account_id) ?? {
            fullName: null,
            vendorName: null,
            locationTags: [],
          };
          const signalSource = signalSourceByUrl.get(ctx.post_url) ?? { mentions: [], removedVenueStackHandles: [] };
          const actualNameVariants = [identity.fullName, identity.vendorName, ...identity.locationTags].filter(
            (v): v is string => Boolean(v)
          );

          const modelHandleAccountId = run.result.venue_handle_guess ? resolveHandle(run.result.venue_handle_guess) : null;
          const attribution = classifyVenueAttribution({
            modelVenueHandleGuess: run.result.venue_handle_guess,
            modelHandleAccountId,
            modelVenueName: run.result.venue_name,
            actualVenueAccountId: meta.venue_account_id,
            actualNameVariants,
          });

          const captionSignal = classifyCaptionVenueSignal({
            mentionAccountIds: signalSource.mentions.map(resolveHandle),
            removedVenueStackAccountIds: signalSource.removedVenueStackHandles.map(resolveHandle),
            actualVenueAccountId: meta.venue_account_id,
            captionNameNormalized: normalizeVenueName(ctx.caption_raw),
            actualNameVariants,
          });

          records.push({
            postUrl: ctx.post_url,
            attribution,
            captionSignal,
            chicagoMetro: run.result.chicago_metro,
            locationClaimPresent: Boolean(run.result.location_claim && run.result.location_claim.trim().length > 0),
          });

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
  console.log(`  total cost this run: $${spendState.total.toFixed(4)}`);

  printVenueCalibrationReport(records, spendState.total);
}

// --- pool-b mode (D055 Phase 2, discovery on posts with no candidate at all) -----

interface PoolBRecord {
  postUrl: string;
  result: ExtractResult;
}

function printPoolBDiscoveryReport(records: PoolBRecord[], resolver: Map<string, number>, totalCost: number) {
  const n = records.length;
  console.log(`\n=== Pool-B discovery report (${EXTRACT_PROMPT_VERSION}, pool=pool-b, n=${n}) ===`);
  if (n === 0) {
    console.log("(no posts processed)");
    return;
  }

  const verdictCounts: Record<string, number> = {};
  for (const r of records) verdictCounts[r.result.verdict] = (verdictCounts[r.result.verdict] ?? 0) + 1;
  console.log(`\n--- Verdict counts ---`);
  for (const v of EXTRACT_VERDICTS) console.log(`  ${v}: ${verdictCounts[v] ?? 0}`);

  const metroCounts: Record<string, number> = { yes: 0, no: 0, unknown: 0 };
  for (const r of records) metroCounts[r.result.chicago_metro] = (metroCounts[r.result.chicago_metro] ?? 0) + 1;
  console.log(`\n--- chicago_metro distribution ---`);
  console.log(`  yes: ${metroCounts.yes}  no: ${metroCounts.no}  unknown: ${metroCounts.unknown}`);

  const withHandle = records.filter((r) => r.result.venue_handle_guess);
  const resolved = withHandle.filter((r) => resolver.get(normalizeHandle(r.result.venue_handle_guess!)) != null);
  console.log(`\n--- venue_handle_guess ---`);
  console.log(
    `  non-null: ${withHandle.length}  resolves to an existing account (alias-aware): ${resolved.length}  ` +
      `does not resolve: ${withHandle.length - resolved.length}`
  );

  const nameOnly = records.filter((r) => r.result.venue_name && !r.result.venue_handle_guess);
  console.log(`\n--- venue_name given, no handle (name only): ${nameOnly.length} ---`);

  const byNorm = new Map<string, { count: number; claims: Map<string, number> }>();
  for (const r of records) {
    if (!r.result.venue_name) continue;
    const norm = normalizeVenueName(r.result.venue_name);
    if (!norm) continue;
    const entry = byNorm.get(norm) ?? { count: 0, claims: new Map<string, number>() };
    entry.count++;
    const claim = r.result.location_claim?.trim() || "(none)";
    entry.claims.set(claim, (entry.claims.get(claim) ?? 0) + 1);
    byNorm.set(norm, entry);
  }
  const top30 = [...byNorm.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 30);
  console.log(`\n--- Top 30 venue_name values by post count (normalized: lowercase, strip punctuation, drop 'the') ---`);
  for (const [norm, entry] of top30) {
    const topClaim = [...entry.claims.entries()].sort((a, b) => b[1] - a[1])[0];
    console.log(`  ${norm.padEnd(40)} n=${entry.count}  most common location_claim=${topClaim[0]} (${topClaim[1]})`);
  }

  console.log(`\n--- Total cost this run: $${totalCost.toFixed(4)} ---`);
}

/** Self-contained (does not touch selectCorpusMeta/selectCalibrationMeta/fetchExtractContexts or
 * the corpus/calibration worker loop) so the other modes are unaffected by this one. NEVER calls
 * writeVerdictIfEligible -- pool-b posts have no candidate_id, so there is nothing to write a
 * post_venue_verdicts row against. saveExtractionRun is called with an explicit
 * {candidateId:null, poolTag:'pool-b'} override on every write (first-pass AND any escalated
 * pass) so the DB always sees a real NULL, never the ctx stand-in. */
async function runPoolB(pool: Pool, args: Args): Promise<void> {
  const selection = await selectPoolBMeta(pool, args.limit, args.force);
  console.log(
    `[extract] pool-b: qualified (pre-exclusion)=${selection.qualifiedCount}  ` +
      `excluded_by_location_tag=${selection.locationExcludedCount}  ` +
      `excluded_by_owner_not_metro=${selection.ownerExcludedCount}  ` +
      `final pool=${selection.finalPoolCount}  selected (post --force/--limit)=${selection.selected.length}`
  );
  if (selection.selected.length === 0) {
    console.log("[extract] nothing to do (all qualifying posts already extracted under this prompt_version, or the pool is empty)");
    return;
  }

  const postUrls = selection.selected.map((r) => r.post_url);
  const contexts = await fetchPoolBContexts(pool, postUrls);

  if (args.dryRun) {
    console.log(`[extract] --dry-run (pool-b): printing up to 2 prompts, no LLM calls, no writes`);
    for (const ctx of contexts.slice(0, 2)) {
      console.log(`\n=== SYSTEM PROMPT (mode=pool-b, ${EXTRACT_PROMPT_VERSION}) ===\n${EXTRACT_SYSTEM_PROMPT_POOL_B}`);
      console.log(`\n=== USER PROMPT: ${ctx.post_url} (venue_anchor_source=none-pool-b, candidate_id=NULL) ===\n${buildExtractUserPrompt(ctx)}`);
    }
    return;
  }

  const resolver = await loadHandleResolver(pool);

  const spendState = { total: 0 };
  let processed = 0;
  let errored = 0;
  let consecutiveFailures = 0;
  let aborted = false;
  let escalatedCount = 0;
  let escalatedCostTotal = 0;
  const records: PoolBRecord[] = [];

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

        try {
          const run = await callExtractWithRetry(ctx, MODEL_CHEAP, 4, EXTRACT_SYSTEM_PROMPT_POOL_B);
          spendState.total += run.costUsd ?? 0;
          await saveExtractionRun(pool, run, EXTRACT_PROMPT_VERSION, { candidateId: null, poolTag: "pool-b" });

          let effective = run;
          if (shouldEscalate(run.result, args.escalateBand)) {
            const escalateRun = await callExtractWithRetry(ctx, args.escalateModel, 4, EXTRACT_SYSTEM_PROMPT_POOL_B);
            spendState.total += escalateRun.costUsd ?? 0;
            escalatedCostTotal += escalateRun.costUsd ?? 0;
            escalatedCount++;
            await saveExtractionRun(pool, escalateRun, ESCALATED_PROMPT_VERSION, { candidateId: null, poolTag: "pool-b" });
            effective = escalateRun;
          }

          records.push({ postUrl: ctx.post_url, result: effective.result });

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
  console.log(`  escalated: ${escalatedCount} of ${processed} (cost $${escalatedCostTotal.toFixed(4)})`);
  console.log(`  total cost this run (Haiku + escalation): $${spendState.total.toFixed(4)}`);

  printPoolBDiscoveryReport(records, resolver, spendState.total);
}

// --- ben-weddings mode (D057, Ben's crawl audit) -----------------------------

interface BenWeddingMeta {
  post_url: string;
  wedding_id: number;
  venue_account_id: number | null;
}

/** Ben's original crawl: every `weddings` row with NO `jeremy_weddings_created` row (his
 *  phase_dedup rule -- a post with >=3 distinct vendor roles becomes a wedding; no model or
 *  human ever read the post). 1,602 posts total via wedding_posts -> posts (source=
 *  'venue_tagged', never in staging.instagram_posts). Resumable: skips a post that already has a
 *  pool='ben-weddings' row under EXTRACT_PROMPT_VERSION, unless --force. */
async function selectBenWeddingsMeta(pool: Pool, limit: number, force: boolean): Promise<BenWeddingMeta[]> {
  const { rows } = await pool.query(
    `select p.url as post_url, w.id as wedding_id, w.venue_id as venue_account_id
     from weddings w
     join wedding_posts wp on wp.wedding_id = w.id
     join posts p on p.id = wp.post_id
     where not exists (select 1 from jeremy_weddings_created j where j.wedding_id = w.id)
       and p.source = 'venue_tagged'
       and ($2::boolean or not exists (
         select 1 from post_extraction_runs per
         where per.post_url = p.url and per.prompt_version = $3 and per.pool = 'ben-weddings'
       ))
     order by w.id asc, p.url asc
     limit $1`,
    [limit, force, EXTRACT_PROMPT_VERSION]
  );
  return rows.map((r) => ({
    post_url: r.post_url,
    wedding_id: Number(r.wedding_id),
    venue_account_id: r.venue_account_id != null ? Number(r.venue_account_id) : null,
  }));
}

/** Batched, post_url-scoped context fetch (same discipline as fetchExtractContexts) -- caption
 *  from `posts.caption` (Ben's crawl posts are never in staging.instagram_posts), credit stack
 *  from stack_extraction_entries_v2 (STACK_PARSER_V2_VERSION -- this mode's sibling,
 *  runStackParserV10.ts --source ben, is what populates it for these posts; empty until that has
 *  actually run for a given post, same as any not-yet-parsed post elsewhere). Participant rows
 *  (role like 'participant:%') are excluded from the credit stack shown to the model -- same
 *  concept split as toRows() in runStackParserV10.ts, StackEntry means vendor credits only.
 *  venue_anchor_source is the literal 'ben_crawl' -- the venue comes straight off the wedding
 *  row, not a jeremy_wedding_candidates anchor. */
async function fetchBenWeddingsContexts(pool: Pool, metaRows: BenWeddingMeta[]): Promise<ExtractPostContext[]> {
  if (metaRows.length === 0) return [];
  const postUrls = metaRows.map((m) => m.post_url);
  const venueAccountIds = [...new Set(metaRows.map((m) => m.venue_account_id).filter((id): id is number => id != null))];

  const [{ rows: postRows }, { rows: venueRows }, { rows: stackRows }] = await Promise.all([
    pool.query(
      `select
         p.url as post_url, p.caption as caption_raw, a.username::text as owner_username, p.posted_at::text as post_timestamp,
         (case
            when cx.raw_match is not null and cx.raw_match !~* '${COUPLE_BUSINESS_WORD_VETO_SQL}'
            then lower(cx.raw_match) else null
          end) as couple_guess,
         coalesce(p.caption ~* '${NON_WEDDING_EVENT_KEYWORD_SQL}', false) as has_non_wedding_event_keyword
       from posts p
       join accounts a on a.id = p.owner_id
       left join lateral (
         select substring(p.caption from '${COUPLE_RAW_MATCH_SQL}') as raw_match
       ) cx on true
       where p.url = any($1::text[])`,
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
      `select post_url, label_raw as role_raw, role, handle, line_no
       from stack_extraction_entries_v2
       where post_url = any($1::text[]) and parser_version = $2 and role not like 'participant:%'
       order by post_url, line_no asc`,
      [postUrls, STACK_PARSER_V2_VERSION]
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
      location_tag: null,
      owner_username: p?.owner_username ?? null,
      post_timestamp: p?.post_timestamp ?? null,
      // Stand-in only (same pattern as pool-b/venue-calibration): ben-weddings has no
      // jeremy_wedding_candidates row at all -- wedding_id carries provenance, never treated as
      // a real candidate_id. saveExtractionRun is always called below with an explicit
      // {candidateId: null, poolTag: 'ben-weddings'} override.
      candidate_id: m.wedding_id,
      venue_anchor_source: "ben_crawl",
      venue_username: v?.username ?? null,
      venue_full_name: v?.full_name ?? null,
      venue_biography: truncateBio(v?.biography ?? null),
      stack: stackByUrl.get(m.post_url) ?? [],
      couple_guess: p?.couple_guess ?? null,
      has_non_wedding_event_keyword: Boolean(p?.has_non_wedding_event_keyword),
    };
  });
}

/** Self-contained (does not touch selectCorpusMeta/selectCalibrationMeta/fetchExtractContexts or
 *  the corpus/calibration worker loop below), same shape as runPoolB. NEVER calls
 *  writeVerdictIfEligible -- ben-weddings posts have no candidate_id, so there is nothing to
 *  write a post_venue_verdicts row against (the D057 audit script, auditBenWeddings.ts, makes
 *  the retire/keep/human call per wedding by reading these runs back out). saveExtractionRun is
 *  called with an explicit {candidateId:null, poolTag:'ben-weddings'} override on every write
 *  (first-pass AND any escalated pass). */
async function runBenWeddings(pool: Pool, args: Args): Promise<void> {
  const metaRows = await selectBenWeddingsMeta(pool, args.limit, args.force);
  console.log(`[extract] selected ${metaRows.length} posts (ben-weddings)`);
  if (metaRows.length === 0) {
    console.log(
      "[extract] nothing to do (all of Ben's posts already extracted under this prompt_version/pool, or the queue is empty)"
    );
    return;
  }

  const contexts = await fetchBenWeddingsContexts(pool, metaRows);

  if (args.dryRun) {
    console.log(`[extract] --dry-run (ben-weddings): printing up to 3 prompts, no LLM calls, no writes`);
    for (const ctx of contexts.slice(0, 3)) {
      console.log(`\n=== SYSTEM PROMPT (mode=ben-weddings, ${EXTRACT_PROMPT_VERSION}) ===\n${EXTRACT_SYSTEM_PROMPT}`);
      console.log(
        `\n=== USER PROMPT: ${ctx.post_url} (venue_anchor_source=ben_crawl, wedding_id=${ctx.candidate_id}, candidate_id=NULL) ===\n${buildExtractUserPrompt(ctx)}`
      );
    }
    return;
  }

  const spendState = { total: 0 };
  let processed = 0;
  let errored = 0;
  let consecutiveFailures = 0;
  let aborted = false;
  let escalatedCount = 0;
  let escalatedCostTotal = 0;
  const verdictCounts: Record<string, number> = {};

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

        try {
          const run = await callExtractWithRetry(ctx, MODEL_CHEAP);
          spendState.total += run.costUsd ?? 0;
          await saveExtractionRun(pool, run, EXTRACT_PROMPT_VERSION, { candidateId: null, poolTag: "ben-weddings" });

          let effective = run;
          if (shouldEscalate(run.result, args.escalateBand)) {
            const escalateRun = await callExtractWithRetry(ctx, args.escalateModel);
            spendState.total += escalateRun.costUsd ?? 0;
            escalatedCostTotal += escalateRun.costUsd ?? 0;
            escalatedCount++;
            await saveExtractionRun(pool, escalateRun, ESCALATED_PROMPT_VERSION, { candidateId: null, poolTag: "ben-weddings" });
            effective = escalateRun;
          }

          verdictCounts[effective.result.verdict] = (verdictCounts[effective.result.verdict] ?? 0) + 1;

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
  console.log(`  verdict counts (post-escalation, i.e. the effective result actually used):`, verdictCounts);
  console.log(`  escalated: ${escalatedCount} of ${processed} (cost $${escalatedCostTotal.toFixed(4)})`);
  console.log(`  total cost this run (Haiku + escalation): $${spendState.total.toFixed(4)}`);
}

// --- main -------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  const pool = getPool();

  if (args.writeVerdicts && args.mode !== "corpus") {
    throw new Error(
      "--write-verdicts is only valid with --mode corpus (calibration/venue-calibration/pool-b/ben-weddings never write verdicts)"
    );
  }

  console.log(
    `[extract] mode=${args.mode} limit=${args.limit} threshold=${args.threshold} dryRun=${args.dryRun} ` +
      `writeVerdicts=${args.writeVerdicts} concurrency=${args.concurrency} maxCostUsd=${args.maxCostUsd} force=${args.force} ` +
      `clusteringVersion=${args.clusteringVersion} includeAmbiguous=${args.includeAmbiguous} ` +
      `escalateBand=${args.escalateBand ? `${args.escalateBand.lo}-${args.escalateBand.hi}` : "(disabled)"} escalateModel=${args.escalateModel}`
  );

  if (args.mode === "venue-calibration") {
    await runVenueCalibration(pool, args);
    await closePool();
    return;
  }

  if (args.mode === "pool-b") {
    await runPoolB(pool, args);
    await closePool();
    return;
  }

  if (args.mode === "ben-weddings") {
    await runBenWeddings(pool, args);
    await closePool();
    return;
  }

  const metaRows =
    args.mode === "calibration"
      ? await selectCalibrationMeta(pool, args.limit, args.force)
      : await selectCorpusMeta(pool, args.limit, args.force, args.clusteringVersion, args.includeAmbiguous);
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
  let escalatedCount = 0;
  let escalatedCostTotal = 0;
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
          const run = await callExtractWithRetry(ctx, MODEL_CHEAP);
          spendState.total += run.costUsd ?? 0;
          await saveExtractionRun(pool, run, EXTRACT_PROMPT_VERSION);

          // Escalation: a Haiku result that's UNSURE or whose confidence falls inside
          // --escalate-band gets a second call to --escalate-model with the SAME prompt/tool,
          // stored as its own row under ESCALATED_PROMPT_VERSION. The Sonnet result (when it
          // exists) is what verdictCounts/calibrationRecords/the verdict-write decision use --
          // "effective" below.
          let effective = run;
          if (shouldEscalate(run.result, args.escalateBand)) {
            const escalateRun = await callExtractWithRetry(ctx, args.escalateModel);
            spendState.total += escalateRun.costUsd ?? 0;
            escalatedCostTotal += escalateRun.costUsd ?? 0;
            escalatedCount++;
            await saveExtractionRun(pool, escalateRun, ESCALATED_PROMPT_VERSION);
            effective = escalateRun;
          }

          verdictCounts[effective.result.verdict] = (verdictCounts[effective.result.verdict] ?? 0) + 1;

          if (args.mode === "calibration" && meta.human_verdict) {
            calibrationRecords.push({
              humanVerdict: meta.human_verdict,
              modelVerdict: effective.result.verdict,
              confidence: effective.result.confidence,
              venueAnchorSource: meta.venue_anchor_source,
            });
          }

          if (args.writeVerdicts) {
            const { written, skipReason } = await writeVerdictIfEligible(pool, meta, effective, args.threshold, resolver, args.onlyThisVenue);
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
  console.log(`  verdict counts (post-escalation, i.e. the effective result actually used):`, verdictCounts);
  if (args.writeVerdicts) console.log(`  verdict-write outcomes:`, writeCounts);
  console.log(`  escalated: ${escalatedCount} of ${processed} (cost $${escalatedCostTotal.toFixed(4)})`);
  console.log(`  total cost this run (Haiku + escalation): $${spendState.total.toFixed(4)}`);

  if (args.mode === "calibration") {
    printAgreementReport(calibrationRecords, spendState.total);
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
