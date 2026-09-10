import type { PoolClient } from "pg";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getPool } from "./db";
import { LABELED_BY } from "./labeling";
import { STRUCTURAL_CLUSTERING_VERSION } from "./structuralVersion";

// Post-per-screen human review (D055, 2026-09-08). Replaces the candidate-level
// lib/server/candidateReview.ts (0 decisions ever recorded -- per the user, after trying it,
// "this ui is confusing... lets design something better for labeling"). 4,743 posts across 4,355
// structural-v2 candidates is 1.09 posts/candidate, so candidate-level bundling saved almost
// nothing and created exactly the confusing case (a bundle mixing a real wedding with the venue's
// own marketing). Review is back at the POST level -- the flow already proven at /label -- but
// each post now carries its venue's context (chicago_status, documented-wedding count, anchor
// conflict) so the reviewer isn't reviewing blind, and the wedding is assembled server-side from
// per-post verdicts (see pipeline/schema.sql's `candidate_review_derived` view) rather than one
// bundled decision.
//
// READ ONLY against jeremy_wedding_candidates / jeremy_wedding_candidate_posts (a background
// clustering job may still be inserting into those two tables concurrently) -- every query here
// is a plain select except the post_venue_verdicts / human_post_labels inserts in
// recordPostVerdict(). Anti-anchoring rule (same as labeling.ts/candidateReview.ts): nothing here
// ever selects from candidate_scores, post_classification_runs, or any V3 decision -- the model's
// opinion must never reach the browser.

export { STRUCTURAL_CLUSTERING_VERSION };

export type PostVenueVerdict =
  | "THIS_VENUE"
  | "OTHER_VENUE"
  | "NOT_WEDDING"
  | "DUPLICATE"
  | "UNSURE"
  | "SKIP";

const VALID_VERDICTS: readonly PostVenueVerdict[] = [
  "THIS_VENUE",
  "OTHER_VENUE",
  "NOT_WEDDING",
  "DUPLICATE",
  "UNSURE",
  "SKIP",
];

export function isPostVenueVerdict(value: unknown): value is PostVenueVerdict {
  return typeof value === "string" && (VALID_VERDICTS as readonly string[]).includes(value);
}

// Maps a post-level verdict to the human_post_labels decision it implies, so a THIS_VENUE/
// OTHER_VENUE/DUPLICATE post flows into golden_set (via the existing syncHumanLabelsToGoldenSet.ts,
// unchanged) exactly like a post-level WEDDING label -- the venue correction/duplicate target
// itself lives on post_venue_verdicts (which has those columns), not on human_post_labels (which
// doesn't). SKIP writes no human_post_labels row, same as /label's Skip and the old candidate
// review's Skip.
const VERDICT_TO_POST_LABEL: Record<PostVenueVerdict, "WEDDING" | "NOT_WEDDING" | "UNSURE" | null> = {
  THIS_VENUE: "WEDDING",
  OTHER_VENUE: "WEDDING",
  DUPLICATE: "WEDDING",
  NOT_WEDDING: "NOT_WEDDING",
  UNSURE: "UNSURE",
  SKIP: null,
};

export const POST_VENUE_REVIEW_QUEUE_VERSION = "post_venue_review_v1";

export interface PostReviewPost {
  post_url: string;
  caption: string | null;
  posted_at: string | null;
  location_tag: string | null;
  owner_username: string | null;
  mentions: string[];
}

export interface PostReviewVenue {
  account_id: number | null;
  username: string | null;
  full_name: string | null;
  vendor_name: string | null;
  venue_anchor_source: string | null;
  venue_anchor_conflict: boolean;
  // D050/D055: the anchor's own credit-line label ("Reception", "Venue", ...) when
  // venue_anchor_source is 'credit_line' -- null for author/location_tag/inline_at/venue_hashtag
  // anchors, which have no credit-line label of their own; the UI falls back to a human-readable
  // form of venue_anchor_source itself in that case (see ANCHOR_SOURCE_LABEL in
  // PostVenueReviewClient.tsx).
  anchor_label: string | null;
  chicago_status: string | null;
  current_wedding_count: number;
  // D055: current_wedding_count bucketed into the same 4 tiers the queue now sorts by (0, 1-5,
  // 6-15, 16+) -- see COVERAGE_BUCKET_SQL/coverageBucketLabel above. Always derived from
  // current_wedding_count, never independently sourced, so the two can't disagree.
  coverage_bucket: CoverageBucket;
  // Split-handle nudge (scripts/graph/findVenueAliasCandidates.ts, re-runnable): T1/T2 alias
  // candidates on file for THIS venue username that aren't yet in account_aliases -- see
  // loadAliasHints below for how this is populated. Empty array (never null/undefined) when
  // there's no hint file, no candidate for this username, or every candidate for it is already
  // merged -- so the UI can render on plain `.length > 0` without a null check.
  alias_hints: AliasHint[];
}

export interface PostReviewGroup {
  candidate_id: number;
  index: number;
  size: number;
}

export interface PostReviewVendorCredit {
  role: string;
  username: string;
}

export interface PostReviewOtherVenueCredit {
  account_id: number;
  username: string;
  // The credit's own role_raw (e.g. "Ceremony", "Reception", "Venue") -- D050/D055, lets the UI
  // tell a real ceremony+reception pair (not a conflict) apart from two competing plain-"Venue"
  // credits (a real conflict). Null for a source (stack_extraction_entries) row with no role_raw.
  label: string | null;
}

export interface PostReviewDuplicateHint {
  matched_wedding_id: number;
  tier: "HIGH" | "AMBIGUOUS";
  date_delta_days: number | null;
  vendor_jaccard: number | null;
  venue_username: string | null;
  event_date_est: string | null;
}

// Phase 2 (D055): the Haiku reader's (scripts/classify/runExtract.ts, extractPrompt.ts) opinion on
// this post, read from the latest post_extraction_runs row for its post_url (see
// LATEST_EXTRACTION_CTE below) -- surfaced to the human as a badge, never auto-applied. Only
// THIS_VENUE/OTHER_VENUE/NOT_WEDDING/UNSURE are possible verdict values (ExtractVerdict in
// extractPrompt.ts); event_type/couple_names/evidence come from the extraction's jsonb `result`
// column, which this file has no compile-time link to (kept as plain strings here rather than
// importing scripts/classify/extractPrompt's types, so this lib/server module doesn't reach into
// scripts/).
export interface PostReviewModelInfo {
  verdict: string;
  event_type: string | null;
  confidence: number | null;
  evidence: string | null;
  couple_names: string | null;
  prompt_version: string;
}

export interface PostReviewQueueItem {
  post: PostReviewPost;
  venue: PostReviewVenue;
  group: PostReviewGroup;
  couple_guess: string | null;
  vendors: PostReviewVendorCredit[];
  other_venue_credits: PostReviewOtherVenueCredit[];
  duplicate_hint: PostReviewDuplicateHint | null;
  // D056: styled-shoot-vs-real-wedding phrase/credit signal (pipeline/schema.sql's
  // post_styled_shoot_signal view, D049/D056) computed inline on this post's own caption -- see
  // STYLED_SIGNAL_SQL below for why inline rather than a JOIN. 'LIKELY' or null, never a bare
  // boolean, so the UI's copy ("STYLED-SHOOT SIGNAL") reads the same vocabulary as the view.
  styled_signal: "LIKELY" | null;
  // Phase 2 (D055): the Haiku reader's opinion on this post, or null when no
  // post_extraction_runs row exists for it yet. See PostReviewModelInfo above.
  model: PostReviewModelInfo | null;
  // Set ONLY by getPostReviewItemsByPostUrls (the ?post=<shortcode> direct-open path) -- the
  // human reviewer's (LABELED_BY, 'jeremy') own latest verdict on this exact post, so the UI can
  // show "your current verdict: W" before they override it. Always undefined on items from
  // getPostReviewQueue/getSpotCheckQueue (those never serve a post the human already verdicted,
  // so it would always be null there anyway) -- undefined, not null, distinguishes "not computed"
  // from "computed and there isn't one".
  your_verdict?: PostVenueVerdict | null;
}

// D056: the same high-precision phrase/hashtag regex as pipeline/schema.sql's
// post_styled_shoot_signal view's phrase_or_hashtag_signal column (applied there via
// applyStyledShootSchema.ts) -- kept as ONE shared TS constant so the queue's inline check can
// never drift from the view's. Computed inline on sp.caption_raw here (not a JOIN to the view)
// because the view unions across the full ~50k-post corpus (staging + posts) on every row, while
// this queue query already has the post's own caption in scope per-row for free -- same "filter
// by post_url FIRST" performance discipline the rest of this file's doc comment describes.
//
// NOTE: every \\y/\\s below is deliberately DOUBLE-backslashed, exactly like
// applyStyledShootSchema.ts -- this string is itself a JS/Bun template literal, where a single
// backslash escape (e.g. \y) is silently stripped to the bare letter before it ever reaches
// Postgres, which would silently defeat the word-boundary anchors. See that file's own comment
// for the full story (and pipeline/schema.sql's comment for why "inspiration|inspo|bridal",
// "#weddinginspiration"/"#bridalinspo", and three of the original D049 hashtags were dropped, and
// why the bare Models:/Model: credit line is gated on co-occurring shoot/styled/editorial/session
// context -- all empirically required to keep this under golden_set's 1% false-positive bar).
function styledSignalSql(captionCol: string): string {
  return `(
    ${captionCol} ~* '(styled shoot|styled editorial|this styled|editorial shoot|stylized shoot|style.?d wedding)'
    or ${captionCol} ~* '#(styledshoot|stylizedshoot|editorialshoot|flatlaystyling)\\y'
    or ${captionCol} ~* '\\y(styled?|editorial|concept)\\s+(shoot|session|editorial)\\y'
    or (${captionCol} ~* '\\ymodels?\\s*[:|]' and ${captionCol} ~* '\\y(shoot|styled|editorial|session)\\y')
    or ${captionCol} ~* '#(styledshoot|styledshoots|stylizedshoot|editorialshoot|inspirationshoot|styledweddingshoot)\\y'
    or (${captionCol} ~* '\\ystyled by\\y' and ${captionCol} ~* '\\yshoot\\y')
  )`;
}

// D055: shared "not a real wedding event" caption exclusion -- same regex the queue's WHERE
// clause used inline before this change, pulled out so getPostReviewProgress's remaining-count
// CTE can never drift from what the queue itself actually excludes (same "one shared constant"
// discipline as styledSignalSql above). See the queue's own comment (still below) for the
// original story (user, mid-review: "filter out the posts that say bar or bat mitzvah").
function nonWeddingEventExclusionSql(captionCol: string): string {
  return `(
    ${captionCol} ~* '\\y(mitzvah|quincea|sweet\\s*16|birthday|corporate|baby shower|bridal shower|graduation|anniversary party|retirement|gala|networking|fundraiser|holiday party|prom|conference|expo|trade show|open house)\\y'
    and ${captionCol} !~* '\\y(wedding|bride|groom|newlywed|married)\\y'
  )`;
}

// D055: a candidate whose venue's documented-Chicago-wedding count (see venue_counts CTE) is 0
// only reviews as confusing without knowing how sparse that venue's coverage already is -- the
// queue's primary sort (after chicago_status) is now this bucket, ascending, so the reviewer
// clears zero-coverage venues first. Shared between the queue's ORDER BY (as inline SQL, see
// COVERAGE_BUCKET_SQL below) and the value attached to each returned item (coverageBucketLabel)
// so the two can never disagree about where a boundary falls.
const COVERAGE_BUCKET_SQL = `(
    case
      when coalesce(vc.n, 0) = 0 then 0
      when coalesce(vc.n, 0) between 1 and 5 then 1
      when coalesce(vc.n, 0) between 6 and 15 then 2
      else 3
    end
  )`;

// Phase 2 (D055): one row per post_url, the latest post_extraction_runs attempt regardless of
// prompt_version -- "latest" (order by created_at desc) is sufficient to prefer extract-v1.1 over
// extract-v1 on its own, since a newer prompt_version is by construction created later; no
// separate prompt_version tie-break needed. Shared between getPostReviewQueue and
// getPostReviewItemsByPostUrls (NOT getSpotCheckQueue -- that mode is deliberately unaffected, see
// its own doc comment) via string interpolation into each query's own `with` clause, same
// "one shared constant" discipline as styledSignalSql/COVERAGE_BUCKET_SQL above.
const LATEST_EXTRACTION_CTE = `
     latest_extraction as (
       select distinct on (post_url)
         post_url, verdict, confidence, prompt_version, result
       from post_extraction_runs
       order by post_url, created_at desc
     )`;

// Selected alongside every other candidate_posts column in getPostReviewQueue and
// getPostReviewItemsByPostUrls -- kept as one constant so the two queries' model columns can never
// drift apart. `result` carries event_type/evidence/couple_names (not denormalized onto
// post_extraction_runs itself), pulled out here with ->>.
const LATEST_EXTRACTION_SELECT_SQL = `
       le.verdict as model_verdict,
       le.confidence as model_confidence,
       le.prompt_version as model_prompt_version,
       le.result->>'event_type' as model_event_type,
       le.result->>'evidence' as model_evidence,
       le.result->>'couple_names' as model_couple_names,`;

export type CoverageBucket = "0" | "1-5" | "6-15" | "16+";

function coverageBucketLabel(n: number): CoverageBucket {
  if (n === 0) return "0";
  if (n <= 5) return "1-5";
  if (n <= 15) return "6-15";
  return "16+";
}

// ============================================================
// Alias hints (2026-09-10): "possible alias: @<other> (<signals>)" nudge under the venue line,
// sourced from scripts/graph/findVenueAliasCandidates.ts's re-runnable, report-only JSON (this
// file NEVER writes account_aliases -- see that script's own header comment). Surfaced so the
// human notices a split handle at the moment they're already looking at the venue, the way the
// user caught venutisrestaurant/venutis.banquets by hand.
// ============================================================

export interface AliasHint {
  other: string;
  signals: string[];
}

interface AliasCandidatePairRaw {
  alias?: unknown;
  canonical?: unknown;
  tier?: unknown;
  signals?: unknown;
}

interface AliasCandidatesFileRaw {
  pairs?: AliasCandidatePairRaw[];
}

// scripts/graph/tmp_analysis/, relative to the Next.js process's cwd (apps/web, same root the
// `bun run dev`/`bun run build` scripts are launched from) -- deliberately NOT
// `new URL(..., import.meta.url)` (the convention findVenueAliasCandidates.ts's OUT_DIR uses when
// run standalone via `bun run`): inside Next.js's own server bundling, a `new URL(relative,
// import.meta.url)` is statically rewritten into an asset import and fails to resolve a directory
// that doesn't exist at build time, so this file needs the runtime-only cwd-based path instead.
const ALIAS_HINTS_DIR = path.join(process.cwd(), "scripts/graph/tmp_analysis");
const ALIAS_HINTS_FILE_RE = /^alias_candidates_\d{4}-\d{2}-\d{2}\.json$/;
const ALIAS_HINTS_TTL_MS = 5 * 60 * 1000;

// Module-scope cache of the PARSED FILE only (not the account_aliases exclusion, which is a
// cheap, always-fresh DB query run on every loadAliasHints() call below) -- the file only changes
// when someone reruns findVenueAliasCandidates.ts by hand, so a 5-minute TTL is plenty and saves
// re-reading + re-parsing it on every queue page load.
let aliasHintsFileCache: { loadedAt: number; map: Map<string, AliasHint[]> } | null = null;

// Reads the newest alias_candidates_*.json in scripts/graph/tmp_analysis/ (newest by filename --
// the YYYY-MM-DD naming sorts lexically the same as chronologically) and returns a lowercased
// username -> hints map covering BOTH sides of every T1/T2 pair, so a lookup works regardless of
// which handle (the alias or the canonical) is the one currently anchoring a candidate. Tolerates
// a missing directory/file, an unreadable file, or malformed JSON -- returns an empty map rather
// than throwing, since this is a nice-to-have hint, never a blocker for the review queue itself.
function buildAliasHintsFileMap(): Map<string, AliasHint[]> {
  const map = new Map<string, AliasHint[]>();

  let files: string[];
  try {
    files = readdirSync(ALIAS_HINTS_DIR);
  } catch {
    return map;
  }
  const candidateFiles = files.filter((f) => ALIAS_HINTS_FILE_RE.test(f)).sort().reverse();
  if (candidateFiles.length === 0) return map;

  let parsed: AliasCandidatesFileRaw;
  try {
    const raw = readFileSync(path.join(ALIAS_HINTS_DIR, candidateFiles[0]), "utf8");
    parsed = JSON.parse(raw) as AliasCandidatesFileRaw;
  } catch {
    return map;
  }

  for (const p of parsed.pairs ?? []) {
    if (p.tier !== "T1" && p.tier !== "T2") continue;
    if (typeof p.alias !== "string" || typeof p.canonical !== "string") continue;
    const alias = p.alias.toLowerCase();
    const canonical = p.canonical.toLowerCase();
    if (!alias || !canonical) continue;
    const signals = Array.isArray(p.signals) ? (p.signals as string[]) : [];

    const push = (key: string, other: string) => {
      const list = map.get(key) ?? [];
      list.push({ other, signals });
      map.set(key, list);
    };
    push(alias, canonical);
    push(canonical, alias);
  }

  return map;
}

function getAliasHintsFileMap(): Map<string, AliasHint[]> {
  const now = Date.now();
  if (!aliasHintsFileCache || now - aliasHintsFileCache.loadedAt > ALIAS_HINTS_TTL_MS) {
    aliasHintsFileCache = { loadedAt: now, map: buildAliasHintsFileMap() };
  }
  return aliasHintsFileCache.map;
}

/**
 * Returns a lowercased-username -> AliasHint[] map for exactly the given `usernames`, built from
 * the cached alias-candidates file (see above) with any pair EXCLUDED where either handle is
 * already an `alias_account_id` in `account_aliases` -- i.e. already merged, so no hint is
 * useful. That exclusion is always a fresh, single query (one row per already-aliased username,
 * cheap and indexed), never cached, so a hint disappears the moment its pair is applied.
 *
 * Read-only: never touches account_aliases beyond this one select. Called from hydrateQueueRows
 * (shared by getPostReviewQueue / getPostReviewItemsByPostUrls / getSpotCheckQueue) so every mode
 * -- normal queue, spot-check, and ?post= direct-open -- surfaces the same hints.
 */
export async function loadAliasHints(usernames: (string | null)[]): Promise<Map<string, AliasHint[]>> {
  const result = new Map<string, AliasHint[]>();
  const lowerUsernames = [
    ...new Set(usernames.filter((u): u is string => !!u).map((u) => u.toLowerCase())),
  ];
  if (lowerUsernames.length === 0) return result;

  const fileMap = getAliasHintsFileMap();
  if (fileMap.size === 0) return result;

  const relevant = lowerUsernames.filter((u) => fileMap.has(u));
  if (relevant.length === 0) return result;

  const pool = getPool();
  const { rows } = await pool.query<{ username: string }>(
    `select a.username::text as username
     from account_aliases al
     join accounts a on a.id = al.alias_account_id`
  );
  const alreadyAliased = new Set(rows.map((r) => r.username.toLowerCase()));

  for (const username of relevant) {
    const hints = (fileMap.get(username) ?? []).filter(
      (h) => !alreadyAliased.has(username) && !alreadyAliased.has(h.other)
    );
    if (hints.length > 0) result.set(username, hints);
  }
  return result;
}

function arr(x: unknown): string[] {
  return Array.isArray(x) ? (x as string[]) : [];
}

// Same cheap couple-name hint as the old CandidateReviewClient's guessCouple() -- a regex, not
// extraction, never treated as ground truth. Deliberately NOT the schema's couple_guess column
// (structural_post_vendor_evidence's own couple_extract CTE + business-word veto): that view
// recomputes over the full 47k-post corpus, expensive to hit per page load, while this UI only
// ever needs ONE post's caption at a time.
const COUPLE_GUESS_RE = /([A-Z][a-z]+ *(?:&|\+|and) *[A-Z][a-z]+)/;

function guessCouple(caption: string | null): string | null {
  if (!caption) return null;
  const m = caption.match(COUPLE_GUESS_RE);
  return m ? m[1] : null;
}

/**
 * The post-per-screen review queue (D055). Ordering: candidate chicago_status CONFIRMED ->
 * AMBIGUOUS -> NOT_CONFIRMED, then the venue's current documented-Chicago-wedding count ascending
 * (computed ONCE in a CTE over wedding_vendors -- see venue_counts below -- not per row: the
 * candidate-level query this replaces recomputed a "latest" DISTINCT ON over the entire 451k-row
 * stack_extraction_entries table on every page load for its other-venue-credit lookup, which is
 * what made it take 6-26s live; this query and its batched follow-ups below all filter by
 * post_url/candidate_id FIRST, before any DISTINCT ON or aggregation, so nothing here scans a
 * corpus-sized table per request), then candidate id, then posts within a candidate by posted_at
 * asc/post_url (matches jeremy_wedding_candidate_posts' own natural ordering, so "Post i of k"
 * below is stable). group_index/group_size are computed via a window function over the FULL
 * candidate (not just this reviewer's remaining posts), so "Post 3 of 5" stays correct even after
 * posts 1-2 are already reviewed and no longer in the queue.
 */
export async function getPostReviewQueue(
  limit: number,
  opts: { reviewedBy?: string } = {}
): Promise<PostReviewQueueItem[]> {
  const reviewedBy = opts.reviewedBy ?? LABELED_BY;
  const pool = getPool();

  const { rows } = await pool.query(
    `with venue_counts as (
       select coalesce(al.canonical_account_id, wv.account_id) as venue_account_id,
              count(distinct wv.wedding_id) as n
       from wedding_vendors wv
       join weddings w on w.id = wv.wedding_id and w.is_chicago = true
       left join account_aliases al on al.alias_account_id = wv.account_id
       where wv.role = 'venue'
       group by 1
     ),
     candidate_posts as (
       select
         cp.source_post_url,
         cp.candidate_id,
         jwc.venue_account_id,
         jwc.chicago_status,
         jwc.venue_anchor_source,
         coalesce(jwc.venue_anchor_conflict, false) as venue_anchor_conflict,
         row_number() over (
           partition by cp.candidate_id
           order by sp.post_timestamp asc nulls last, cp.source_post_url asc
         ) as group_index,
         count(*) over (partition by cp.candidate_id) as group_size,
         sp.caption_raw as caption,
         sp.post_timestamp as posted_at,
         sp.location_tag,
         sp.owner_username,
         sp.mentions,
         ${styledSignalSql("sp.caption_raw")} as styled_signal_raw
       from jeremy_wedding_candidate_posts cp
       join jeremy_wedding_candidates jwc on jwc.id = cp.candidate_id
       join staging.instagram_posts sp on sp.post_url = cp.source_post_url
       where jwc.clustering_version = $1
     ),
     ${LATEST_EXTRACTION_CTE}
     select
       cpz.source_post_url, cpz.candidate_id, cpz.venue_account_id, cpz.chicago_status,
       cpz.venue_anchor_source, cpz.venue_anchor_conflict, cpz.group_index, cpz.group_size,
       cpz.caption, cpz.posted_at, cpz.location_tag, cpz.owner_username, cpz.mentions,
       cpz.styled_signal_raw,
       ${LATEST_EXTRACTION_SELECT_SQL}
       a.username::text as venue_username,
       a.full_name as venue_full_name,
       (select v.name from vendors v where v.account_id = cpz.venue_account_id limit 1) as vendor_name,
       coalesce(vc.n, 0) as current_wedding_count
     from candidate_posts cpz
     left join accounts a on a.id = cpz.venue_account_id
     left join venue_counts vc on vc.venue_account_id = cpz.venue_account_id
     left join latest_extraction le on le.post_url = cpz.source_post_url
     where not exists (
       -- Any reviewer's current verdict removes a post from the queue (D055): a bounded class of
       -- structurally unambiguous posts is cleared under reviewed_by='fable-structured' on the
       -- user's behalf, and those must not be served again. Progress/undo stay per-reviewer.
       select 1 from post_venue_verdicts_current pv
       where pv.post_url = cpz.source_post_url
     )
       -- $2 (reviewer) is no longer used by the exclusion above; keep it typed so pg can plan.
       and $2::text is not null
       -- D055: a candidate whose chicago_status is CHICAGO_NOT_CONFIRMED is a real wedding
       -- outside the Chicago metro (the venue itself resolved off-metro) -- the human should
       -- never see it in this queue. CHICAGO_AMBIGUOUS still shows, sorted after CONFIRMED below.
       and cpz.chicago_status <> 'CHICAGO_NOT_CONFIRMED'
       -- D055 (user, mid-review 2026-09-08: "filter out the posts that say bar or bat mitzvah"):
       -- a post naming a non-wedding event with NO wedding language is never served -- 43 of
       -- 4,743 queued posts at the time. Same rule now lives in the structural clustering
       -- eligibility; this keeps already-clustered posts out of the human's way. Posts that
       -- mention both (a venue's "weddings, galas, mitzvahs" marketing) still get reviewed.
       and not ${nonWeddingEventExclusionSql("cpz.caption")}
     order by
       case cpz.chicago_status
         when 'CHICAGO_CONFIRMED' then 0
         when 'CHICAGO_AMBIGUOUS' then 1
         else 2
       end,
       -- D055: primary sort within a chicago_status tier -- the venue's documented-wedding
       -- coverage bucket ascending (0, then 1-5, then 6-15, then 16+), computed from the same
       -- venue_counts CTE current_wedding_count already reads. Zero- and low-coverage venues
       -- surface first, since that's where the residue-mining payoff is (STATE.md's "metro
       -- Places venues by documented weddings" table).
       ${COVERAGE_BUCKET_SQL} asc,
       -- Phase 2 (D055): a post the Haiku reader already called NOT_WEDDING or UNSURE sorts after
       -- one it called THIS_VENUE/OTHER_VENUE (confident THIS_VENUE calls never reach this queue at
       -- all -- they're written straight to post_venue_verdicts under reviewed_by='haiku-extract-v1'
       -- and excluded by the "not exists post_venue_verdicts_current" clause above) and after one
       -- with no extraction row yet -- the human reviews likely-real-but-unconfident posts first,
       -- likely-junk last. le.verdict is null (no row) sorts with THIS_VENUE/OTHER_VENUE (false),
       -- not with NOT_WEDDING/UNSURE (true), since an unread post is not evidence of anything.
       (le.verdict in ('NOT_WEDDING', 'UNSURE')) asc,
       -- D056 (user, mid-review 2026-09-08): author-anchored posts confirm as a real wedding only
       -- 27% of the time vs. 72-75% for every other anchor source -- mostly the venue's own
       -- marketing, not a documented wedding -- so they're pushed to the back of the queue rather
       -- than reviewed at the same priority as a credit-line/location-tag/hashtag anchor.
       (cpz.venue_anchor_source = 'author') asc,
       -- D056: a post carrying the styled-shoot signal (Models credit or a styled/style-shoot
       -- phrase -- see styledSignalSql above) is pushed to the back too, same reasoning: it's
       -- more likely to resolve NOT_WEDDING/styled_shoot than a clean post, so clean posts get
       -- reviewed first.
       (cpz.styled_signal_raw) asc,
       coalesce(vc.n, 0) asc,
       cpz.candidate_id asc,
       cpz.posted_at asc nulls last,
       cpz.source_post_url asc
     limit $3`,
    [STRUCTURAL_CLUSTERING_VERSION, reviewedBy, limit]
  );

  return hydrateQueueRows(rows);
}

// Same implicit shape pool.query(...) without a generic always returned here before this was
// pulled out of getPostReviewQueue (rows come straight from that query's untyped result); see
// other lib/server/*.ts files for the same convention.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hydrateQueueRows(rows: any[]): Promise<PostReviewQueueItem[]> {
  const pool = getPool();
  if (rows.length === 0) return [];

  const postUrls = rows.map((r) => r.source_post_url as string);
  const candidateIds = [...new Set(rows.map((r) => r.candidate_id as number))];

  // Batched, not N+1: vendor credits / other-venue credits / duplicate hints for every post in
  // this page, three queries total, filtered by post_url/candidate_id FIRST (indexed) rather than
  // computing a corpus-wide "latest" first -- see the function doc comment above.
  const { rows: vendorRows } = await pool.query(
    `with latest as (
       select distinct on (post_url, line_no, handle)
         post_url, line_no, handle, role
       from stack_extraction_entries
       where post_url = any($1::text[])
       order by post_url, line_no, handle, extracted_at desc
     )
     select l.post_url, coalesce(al.canonical_account_id, a.id) as account_id,
            a.username::text as username, l.role
     from latest l
     join accounts a on a.username = l.handle::citext
     left join account_aliases al on al.alias_account_id = a.id
     where l.role not in ('other', 'venue')`,
    [postUrls]
  );

  const { rows: otherVenueRows } = await pool.query(
    `with latest as (
       select distinct on (post_url, line_no, handle)
         post_url, line_no, handle, role, role_raw
       from stack_extraction_entries
       where post_url = any($1::text[])
       order by post_url, line_no, handle, extracted_at desc
     )
     select l.post_url, coalesce(al.canonical_account_id, a.id) as account_id,
            a.username::text as username, l.role_raw
     from latest l
     join accounts a on a.username = l.handle::citext
     left join account_aliases al on al.alias_account_id = a.id
     where l.role = 'venue'`,
    [postUrls]
  );

  const { rows: reconRows } = await pool.query(
    `select r.candidate_id, r.matched_wedding_id, r.match_confidence, r.date_delta_days, r.vendor_jaccard,
            w.event_date_est::text as event_date_est, va.username::text as venue_username
     from jeremy_wedding_candidate_reconciliation r
     join weddings w on w.id = r.matched_wedding_id
     left join accounts va on va.id = w.venue_id
     where r.candidate_id = any($1::bigint[])
       and r.reconciliation_version = 'reconcile-v2'
       and r.matched_wedding_id is not null`,
    [candidateIds]
  );

  // Split-handle nudge (see loadAliasHints above) -- keyed by the SAME venue_username the UI
  // already displays (r.venue_username, from `a.username` joined on cpz.venue_account_id), so no
  // extra alias resolution is needed here.
  const aliasHintsByUsername = await loadAliasHints(rows.map((r) => r.venue_username as string | null));

  const vendorsByPost = new Map<string, PostReviewVendorCredit[]>();
  for (const r of vendorRows) {
    const list = vendorsByPost.get(r.post_url) ?? [];
    list.push({ role: r.role, username: r.username });
    vendorsByPost.set(r.post_url, list);
  }

  const otherVenuesByPost = new Map<string, Map<number, PostReviewOtherVenueCredit>>();
  for (const r of otherVenueRows) {
    const m = otherVenuesByPost.get(r.post_url) ?? new Map();
    m.set(r.account_id, { account_id: r.account_id, username: r.username, label: r.role_raw ?? null });
    otherVenuesByPost.set(r.post_url, m);
  }

  const reconByCandidate = new Map<number, PostReviewDuplicateHint>();
  for (const r of reconRows) {
    const confidence: number | null = r.match_confidence;
    reconByCandidate.set(r.candidate_id as number, {
      matched_wedding_id: r.matched_wedding_id,
      tier: confidence != null && confidence >= 0.75 ? "HIGH" : "AMBIGUOUS",
      date_delta_days: r.date_delta_days,
      vendor_jaccard: r.vendor_jaccard,
      venue_username: r.venue_username,
      event_date_est: r.event_date_est,
    });
  }

  return rows.map((r) => {
    const venueAccountId: number | null = r.venue_account_id;
    const postOtherVenues = otherVenuesByPost.get(r.source_post_url);
    const otherVenues = [...(postOtherVenues?.values() ?? [])].filter((v) => v.account_id !== venueAccountId);
    // D050/D055: the anchor's own role_raw only means anything when the anchor itself IS a
    // credit-line row (author/location_tag/inline_at/venue_hashtag anchors have no credit-line
    // label of their own -- the UI falls back to a human name for venue_anchor_source there).
    const anchorLabel =
      r.venue_anchor_source === "credit_line" && venueAccountId != null
        ? (postOtherVenues?.get(venueAccountId)?.label ?? null)
        : null;
    // Phase 2 (D055): present only on rows selected from queries that join latest_extraction
    // (getPostReviewQueue, getPostReviewItemsByPostUrls) -- r.model_verdict is simply undefined on
    // getSpotCheckQueue's rows (that query doesn't select it), which falls through to null here,
    // same as "no extraction row yet".
    const model: PostReviewModelInfo | null = r.model_verdict
      ? {
          verdict: r.model_verdict,
          event_type: r.model_event_type ?? null,
          confidence: r.model_confidence != null ? Number(r.model_confidence) : null,
          evidence: r.model_evidence ?? null,
          couple_names: r.model_couple_names ?? null,
          prompt_version: r.model_prompt_version,
        }
      : null;
    return {
      post: {
        post_url: r.source_post_url,
        caption: r.caption,
        posted_at: r.posted_at,
        location_tag: r.location_tag,
        owner_username: r.owner_username,
        mentions: arr(r.mentions),
      },
      venue: {
        account_id: venueAccountId,
        username: r.venue_username,
        full_name: r.venue_full_name,
        vendor_name: r.vendor_name,
        venue_anchor_source: r.venue_anchor_source,
        venue_anchor_conflict: r.venue_anchor_conflict,
        anchor_label: anchorLabel,
        chicago_status: r.chicago_status,
        current_wedding_count: Number(r.current_wedding_count),
        coverage_bucket: coverageBucketLabel(Number(r.current_wedding_count)),
        alias_hints: r.venue_username
          ? (aliasHintsByUsername.get((r.venue_username as string).toLowerCase()) ?? [])
          : [],
      },
      group: {
        candidate_id: r.candidate_id,
        index: Number(r.group_index),
        size: Number(r.group_size),
      },
      couple_guess: guessCouple(r.caption),
      vendors: vendorsByPost.get(r.source_post_url) ?? [],
      other_venue_credits: otherVenues,
      duplicate_hint: reconByCandidate.get(r.candidate_id) ?? null,
      styled_signal: r.styled_signal_raw ? ("LIKELY" as const) : null,
      model,
    };
  });
}

/**
 * Direct-open mode (?post=<shortcode>[,<shortcode>...] on /label/candidates and
 * /api/post-venue-review): serves EXACTLY the requested post_urls, in the order given,
 * REGARDLESS of whether any reviewer (including the human) already has a current verdict on
 * them -- this is how the human corrects an earlier verdict of their own. Unlike
 * getPostReviewQueue, this deliberately does NOT apply the "no existing verdict",
 * chicago_status<>CHICAGO_NOT_CONFIRMED, or non-wedding-event-caption filters: a correction list
 * is an explicit request for THESE posts, not a fresh slice of the eligibility-filtered queue.
 *
 * Silently drops any post_url that doesn't resolve to a jeremy_wedding_candidate_posts row (never
 * throws) -- the caller (the API route / page) reports requested vs. found counts itself.
 *
 * Each returned item's `your_verdict` is populated from the human reviewer's (LABELED_BY,
 * 'jeremy') own latest post_venue_verdicts row for that post_url, or null if they have none --
 * deliberately NOT any other reviewer's verdict (see the field's own doc comment on
 * PostReviewQueueItem).
 */
export async function getPostReviewItemsByPostUrls(postUrls: string[]): Promise<PostReviewQueueItem[]> {
  const pool = getPool();
  if (postUrls.length === 0) return [];

  const { rows } = await pool.query(
    `with venue_counts as (
       select coalesce(al.canonical_account_id, wv.account_id) as venue_account_id,
              count(distinct wv.wedding_id) as n
       from wedding_vendors wv
       join weddings w on w.id = wv.wedding_id and w.is_chicago = true
       left join account_aliases al on al.alias_account_id = wv.account_id
       where wv.role = 'venue'
       group by 1
     ),
     candidate_posts as (
       select
         cp.source_post_url,
         cp.candidate_id,
         jwc.venue_account_id,
         jwc.chicago_status,
         jwc.venue_anchor_source,
         coalesce(jwc.venue_anchor_conflict, false) as venue_anchor_conflict,
         row_number() over (
           partition by cp.candidate_id
           order by sp.post_timestamp asc nulls last, cp.source_post_url asc
         ) as group_index,
         count(*) over (partition by cp.candidate_id) as group_size,
         sp.caption_raw as caption,
         sp.post_timestamp as posted_at,
         sp.location_tag,
         sp.owner_username,
         sp.mentions,
         ${styledSignalSql("sp.caption_raw")} as styled_signal_raw
       from jeremy_wedding_candidate_posts cp
       join jeremy_wedding_candidates jwc on jwc.id = cp.candidate_id
       join staging.instagram_posts sp on sp.post_url = cp.source_post_url
       where cp.source_post_url = any($1::text[])
     ),
     ${LATEST_EXTRACTION_CTE}
     select
       cpz.source_post_url, cpz.candidate_id, cpz.venue_account_id, cpz.chicago_status,
       cpz.venue_anchor_source, cpz.venue_anchor_conflict, cpz.group_index, cpz.group_size,
       cpz.caption, cpz.posted_at, cpz.location_tag, cpz.owner_username, cpz.mentions,
       cpz.styled_signal_raw,
       ${LATEST_EXTRACTION_SELECT_SQL}
       a.username::text as venue_username,
       a.full_name as venue_full_name,
       (select v.name from vendors v where v.account_id = cpz.venue_account_id limit 1) as vendor_name,
       coalesce(vc.n, 0) as current_wedding_count
     from candidate_posts cpz
     left join accounts a on a.id = cpz.venue_account_id
     left join venue_counts vc on vc.venue_account_id = cpz.venue_account_id
     left join latest_extraction le on le.post_url = cpz.source_post_url`,
    [postUrls]
  );

  const items = await hydrateQueueRows(rows);

  const { rows: verdictRows } = await pool.query<{ post_url: string; verdict: string }>(
    `select distinct on (post_url) post_url, verdict
     from post_venue_verdicts
     where reviewed_by = $1 and post_url = any($2::text[])
     order by post_url, reviewed_at desc`,
    [LABELED_BY, postUrls]
  );
  const yourVerdictByUrl = new Map<string, PostVenueVerdict>(
    verdictRows
      .filter((r) => isPostVenueVerdict(r.verdict))
      .map((r) => [r.post_url, r.verdict as PostVenueVerdict])
  );

  const byUrl = new Map(items.map((it) => [it.post.post_url, it]));
  // Re-order to match the caller's requested order (the SQL's `any($1)` gives no ordering
  // guarantee), and drop any post_url that didn't resolve to a candidate row.
  return postUrls.reduce<PostReviewQueueItem[]>((acc, url) => {
    const item = byUrl.get(url);
    if (item) acc.push({ ...item, your_verdict: yourVerdictByUrl.get(url) ?? null });
    return acc;
  }, []);
}

/**
 * D055 spot-check mode ("?spotcheck=fable-structured&n=40"): a RANDOM sample of posts that
 * already carry a CURRENT verdict from `targetReviewer` (default 'fable-structured') and do NOT
 * yet carry any verdict from `humanReviewer` (default LABELED_BY, 'jeremy') -- an independent
 * blind check of the on-behalf class-clearing the user approved. Deliberately does NOT reuse
 * post_venue_verdicts_current for the "does targetReviewer have a verdict" half: that view is
 * `distinct on (post_url)` ACROSS ALL REVIEWERS (see pipeline/schema.sql), so once a post has
 * verdicts from two reviewers it only exposes the most recent one -- exactly the situation this
 * mode exists to create (a human verdict following a fable one). Instead this queries
 * post_venue_verdicts directly, taking the latest row PER (post_url, reviewed_by) itself, which
 * is correct regardless of what any other reviewer has done to the same post_url. This is a
 * deliberate workaround, not a view change -- the task that added this mode said to stop and
 * report rather than touch the view, and a workaround was possible, so the view is untouched.
 *
 * Also deliberately does NOT reapply the chicago_status / non-wedding-event exclusions
 * getPostReviewQueue now applies (D055 change 1) -- this mode audits whatever targetReviewer
 * actually decided, which may predate those exclusions, so narrowing the sample would bias the
 * audit toward the class of posts the normal queue happens to still serve today.
 *
 * The returned items deliberately carry NO trace of targetReviewer's verdict or notes (nothing
 * in the SELECT list even fetches them) -- the UI must stay blind. See
 * getSpotCheckAgreementReport() below for the reviewer-vs-reviewer comparison itself.
 */
export async function getSpotCheckQueue(
  n: number,
  opts: { targetReviewer?: string; humanReviewer?: string } = {}
): Promise<PostReviewQueueItem[]> {
  const targetReviewer = opts.targetReviewer ?? "fable-structured";
  const humanReviewer = opts.humanReviewer ?? LABELED_BY;
  const pool = getPool();

  const { rows } = await pool.query(
    `with venue_counts as (
       select coalesce(al.canonical_account_id, wv.account_id) as venue_account_id,
              count(distinct wv.wedding_id) as n
       from wedding_vendors wv
       join weddings w on w.id = wv.wedding_id and w.is_chicago = true
       left join account_aliases al on al.alias_account_id = wv.account_id
       where wv.role = 'venue'
       group by 1
     ),
     candidate_posts as (
       select
         cp.source_post_url,
         cp.candidate_id,
         jwc.venue_account_id,
         jwc.chicago_status,
         jwc.venue_anchor_source,
         coalesce(jwc.venue_anchor_conflict, false) as venue_anchor_conflict,
         row_number() over (
           partition by cp.candidate_id
           order by sp.post_timestamp asc nulls last, cp.source_post_url asc
         ) as group_index,
         count(*) over (partition by cp.candidate_id) as group_size,
         sp.caption_raw as caption,
         sp.post_timestamp as posted_at,
         sp.location_tag,
         sp.owner_username,
         sp.mentions,
         ${styledSignalSql("sp.caption_raw")} as styled_signal_raw
       from jeremy_wedding_candidate_posts cp
       join jeremy_wedding_candidates jwc on jwc.id = cp.candidate_id
       join staging.instagram_posts sp on sp.post_url = cp.source_post_url
       where jwc.clustering_version = $1
     ),
     target_current as (
       -- Latest verdict PER (post_url) scoped to targetReviewer only -- NOT the shared
       -- post_venue_verdicts_current view, see function doc comment above.
       select distinct on (post_url) post_url
       from post_venue_verdicts
       where reviewed_by = $2
       order by post_url, reviewed_at desc
     )
     select
       cpz.source_post_url, cpz.candidate_id, cpz.venue_account_id, cpz.chicago_status,
       cpz.venue_anchor_source, cpz.venue_anchor_conflict, cpz.group_index, cpz.group_size,
       cpz.caption, cpz.posted_at, cpz.location_tag, cpz.owner_username, cpz.mentions,
       cpz.styled_signal_raw,
       a.username::text as venue_username,
       a.full_name as venue_full_name,
       (select v.name from vendors v where v.account_id = cpz.venue_account_id limit 1) as vendor_name,
       coalesce(vc.n, 0) as current_wedding_count
     from candidate_posts cpz
     join target_current tc on tc.post_url = cpz.source_post_url
     left join accounts a on a.id = cpz.venue_account_id
     left join venue_counts vc on vc.venue_account_id = cpz.venue_account_id
     where not exists (
       -- The human reviewer specifically (not "any reviewer" -- that's the whole point of this
       -- mode: bypass the normal any-reviewer exclusion so a post fable already cleared is still
       -- eligible here, as long as the human hasn't personally weighed in on it yet).
       select 1 from post_venue_verdicts pv
       where pv.post_url = cpz.source_post_url and pv.reviewed_by = $3
     )
     -- Geography gate: an out-of-market (CHICAGO_AMBIGUOUS/CHICAGO_NOT_CONFIRMED) post never
     -- reaches the human spot-check queue -- spot-checking exists to audit whether the reviewer's
     -- venue/wedding call was right, not to re-litigate geography the review queue itself no
     -- longer serves by default (see selectCorpusMeta's --mode corpus confirmed-only default in
     -- runExtract.ts). A post PAIRED before this change (both reviewers already verdicted it)
     -- still surfaces in getSpotCheckAgreementReport below -- that function's by_chicago_status
     -- stratum keeps it visible there.
     and cpz.chicago_status = 'CHICAGO_CONFIRMED'
     -- D055 (user-caught 2026-09-09: "most of the 20+ I've been spot checking are from similar
     -- venues"): a uniform random draw over verdicts inherits the corpus run's coverage-first
     -- ordering, so one venue (Morton Arboretum, 52 of the pilot's 181 verdicts) dominated the
     -- sample. Stratify instead: one post per venue until every eligible venue has one (window
     -- rank), non-credit-line anchors interleaved ahead of credit-line within a rank, then random.
     order by row_number() over (partition by cpz.venue_account_id order by random()),
              (cpz.venue_anchor_source = 'credit_line') asc,
              random()
     limit $4`,
    [STRUCTURAL_CLUSTERING_VERSION, targetReviewer, humanReviewer, n]
  );

  return hydrateQueueRows(rows);
}

export interface SpotCheckConfusionCell {
  fable_verdict: string;
  human_verdict: string;
  n: number;
}

export interface SpotCheckAnchorAgreement {
  venue_anchor_source: string;
  total: number;
  agree: number;
  agreement_pct: number;
}

export interface SpotCheckReport {
  reviewer: string;
  human_reviewer: string;
  total_paired: number;
  agreement_pct: number | null;
  confusion: SpotCheckConfusionCell[];
  by_anchor_source: SpotCheckAnchorAgreement[];
  // D055: agreement by the target reviewer's own confidence band (haiku only; 'n/a' for fable/
  // human) and by venue (top 10 by paired count) -- so sample concentration is visible in the
  // panel itself, not just the headline number.
  by_confidence_band: SpotCheckStratumAgreement[];
  by_venue_top10: SpotCheckStratumAgreement[];
  // getSpotCheckQueue now excludes CHICAGO_AMBIGUOUS/CHICAGO_NOT_CONFIRMED posts (geography
  // gate), so this report -- which pairs whatever both reviewers already verdicted, including
  // posts paired before that change -- keeps the ambiguous-geography slice visible as its own
  // stratum rather than letting it quietly vanish into the CHICAGO_CONFIRMED-dominated headline.
  by_chicago_status: SpotCheckStratumAgreement[];
  // Plain-text rendering of the above, ready to drop into a <pre> block or a terminal.
  text: string;
}

export interface SpotCheckStratumAgreement {
  key: string;
  total: number;
  agree: number;
  agreement_pct: number;
}

function formatSpotCheckReportText(args: {
  reviewer: string;
  humanReviewer: string;
  total: number;
  agree: number;
  agreementPct: number | null;
  confusion: SpotCheckConfusionCell[];
  byAnchor: SpotCheckAnchorAgreement[];
  byBand: SpotCheckStratumAgreement[];
  byVenue: SpotCheckStratumAgreement[];
  byChicagoStatus: SpotCheckStratumAgreement[];
}): string {
  const { reviewer, humanReviewer, total, agree, agreementPct, confusion, byAnchor, byBand, byVenue, byChicagoStatus } = args;
  const lines: string[] = [];
  lines.push(`Spot-check agreement: ${reviewer} vs ${humanReviewer}`);
  lines.push(`Paired posts: ${total}  Agree: ${agree}  Agreement: ${agreementPct ?? "n/a"}%`);
  lines.push("");
  lines.push("Confusion (fable verdict x human verdict):");
  lines.push("fable_verdict".padEnd(14) + "human_verdict".padEnd(14) + "n");
  for (const c of confusion) {
    lines.push(c.fable_verdict.padEnd(14) + c.human_verdict.padEnd(14) + String(c.n));
  }
  lines.push("");
  lines.push("By venue_anchor_source:");
  lines.push("anchor_source".padEnd(16) + "total".padEnd(8) + "agree".padEnd(8) + "pct");
  for (const a of byAnchor) {
    lines.push(a.venue_anchor_source.padEnd(16) + String(a.total).padEnd(8) + String(a.agree).padEnd(8) + `${a.agreement_pct}%`);
  }
  const stratum = (title: string, rowsIn: SpotCheckStratumAgreement[]) => {
    lines.push("");
    lines.push(title);
    lines.push("key".padEnd(28) + "total".padEnd(8) + "agree".padEnd(8) + "pct");
    for (const r of rowsIn) {
      lines.push(r.key.slice(0, 27).padEnd(28) + String(r.total).padEnd(8) + String(r.agree).padEnd(8) + `${r.agreement_pct}%`);
    }
  };
  stratum("By reviewer confidence band:", byBand);
  stratum("By venue (top 10 by paired posts -- watch for concentration):", byVenue);
  stratum("By chicago_status (ambiguous/not-confirmed posts no longer reach spot-check, but pre-existing pairs stay visible here):", byChicagoStatus);
  return lines.join("\n");
}

/**
 * Read-only agreement report between targetReviewer (default 'fable-structured') and
 * humanReviewer (default LABELED_BY, 'jeremy') over posts BOTH have a current verdict on. Same
 * "query post_venue_verdicts directly, take latest per (post_url, reviewed_by) myself" approach
 * as getSpotCheckQueue above, for the same reason: post_venue_verdicts_current is not
 * reviewer-aware, so it cannot expose both reviewers' opinions on the same post at once.
 */
export async function getSpotCheckAgreementReport(
  reviewer: string,
  humanReviewer: string = LABELED_BY
): Promise<SpotCheckReport> {
  const pool = getPool();

  const { rows } = await pool.query<{
    fable_verdict: string;
    human_verdict: string;
    venue_anchor_source: string | null;
    confidence_band: string;
    venue_username: string | null;
    chicago_status: string | null;
    n: string;
  }>(
    `with target_current as (
       select distinct on (post_url) post_url, candidate_id, verdict,
              -- the haiku reader writes notes like 'extract-v1.1 conf=0.87: ...'; fable/human rows have none
              (regexp_match(coalesce(notes, ''), 'conf=([0-9.]+)'))[1]::real as target_confidence
       from post_venue_verdicts
       where reviewed_by = $1
       order by post_url, reviewed_at desc
     ),
     human_current as (
       select distinct on (post_url) post_url, verdict
       from post_venue_verdicts
       where reviewed_by = $2
       order by post_url, reviewed_at desc
     )
     select tc.verdict as fable_verdict, hc.verdict as human_verdict,
            jwc.venue_anchor_source,
            case when tc.target_confidence is null then 'n/a'
                 when tc.target_confidence >= 0.9 then '>=0.9' else '<0.9' end as confidence_band,
            a.username::text as venue_username,
            jwc.chicago_status,
            count(*) as n
     from target_current tc
     join human_current hc on hc.post_url = tc.post_url
     join jeremy_wedding_candidates jwc on jwc.id = tc.candidate_id
     left join accounts a on a.id = jwc.venue_account_id
     group by 1, 2, 3, 4, 5, 6
     order by 3, 1, 2`,
    [reviewer, humanReviewer]
  );

  let total = 0;
  let agree = 0;
  const confusionMap = new Map<string, SpotCheckConfusionCell>();
  const anchorMap = new Map<string, { total: number; agree: number }>();
  const bandMap = new Map<string, { total: number; agree: number }>();
  const venueMap = new Map<string, { total: number; agree: number }>();
  const chicagoStatusMap = new Map<string, { total: number; agree: number }>();
  const bump = (m: Map<string, { total: number; agree: number }>, key: string, n: number, isAgree: boolean) => {
    const entry = m.get(key) ?? { total: 0, agree: 0 };
    entry.total += n;
    if (isAgree) entry.agree += n;
    m.set(key, entry);
  };

  for (const r of rows) {
    const n = Number(r.n);
    total += n;
    const isAgree = r.fable_verdict === r.human_verdict;
    if (isAgree) agree += n;
    const ck = `${r.fable_verdict}|${r.human_verdict}`;
    const cell = confusionMap.get(ck) ?? { fable_verdict: r.fable_verdict, human_verdict: r.human_verdict, n: 0 };
    cell.n += n;
    confusionMap.set(ck, cell);
    bump(anchorMap, r.venue_anchor_source ?? "(none)", n, isAgree);
    bump(bandMap, r.confidence_band, n, isAgree);
    bump(venueMap, r.venue_username ?? "(none)", n, isAgree);
    bump(chicagoStatusMap, r.chicago_status ?? "(none)", n, isAgree);
  }
  const confusion = [...confusionMap.values()].sort((a, b) => b.n - a.n);
  const toRows = (m: Map<string, { total: number; agree: number }>) =>
    [...m.entries()]
      .map(([key, v]) => ({ key, total: v.total, agree: v.agree, agreement_pct: v.total > 0 ? Math.round((v.agree / v.total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.total - a.total);
  const byBand = toRows(bandMap);
  const byVenue = toRows(venueMap).slice(0, 10);
  const byChicagoStatus = toRows(chicagoStatusMap);

  const byAnchor: SpotCheckAnchorAgreement[] = [...anchorMap.entries()]
    .map(([venue_anchor_source, v]) => ({
      venue_anchor_source,
      total: v.total,
      agree: v.agree,
      agreement_pct: v.total > 0 ? Math.round((v.agree / v.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const agreementPct = total > 0 ? Math.round((agree / total) * 1000) / 10 : null;

  const text = formatSpotCheckReportText({
    reviewer,
    humanReviewer,
    total,
    agree,
    agreementPct,
    confusion,
    byAnchor,
    byBand,
    byVenue,
    byChicagoStatus,
  });

  return {
    reviewer,
    human_reviewer: humanReviewer,
    total_paired: total,
    agreement_pct: agreementPct,
    confusion,
    by_anchor_source: byAnchor,
    by_confidence_band: byBand,
    by_venue_top10: byVenue,
    by_chicago_status: byChicagoStatus,
    text,
  };
}

export async function getPostReviewProgress(
  opts: { reviewedBy?: string } = {}
): Promise<{
  posts_total: number;
  posts_reviewed: number;
  // D055: remaining (not-yet-any-reviewer-verdicted) posts within the queue's own eligibility
  // filter (chicago_status <> CHICAGO_NOT_CONFIRMED, non-wedding-event caption excluded), split
  // by chicago_status -- replaces the header's old raw corpus-wide posts_total (~4,743, which
  // never reflected what the queue would actually still serve).
  remaining_confirmed: number;
  remaining_ambiguous: number;
  candidates_total: number;
  candidates_complete: number;
  by_verdict: Record<string, number>;
}> {
  const reviewedBy = opts.reviewedBy ?? LABELED_BY;
  const pool = getPool();

  const { rows } = await pool.query<{
    posts_total: string;
    posts_reviewed: string;
    remaining_confirmed: string;
    remaining_ambiguous: string;
    candidates_total: string;
    candidates_complete: string;
  }>(
    `with cv as (
       select cp.source_post_url, jwc.chicago_status
       from jeremy_wedding_candidate_posts cp
       join jeremy_wedding_candidates jwc on jwc.id = cp.candidate_id
       join staging.instagram_posts sp on sp.post_url = cp.source_post_url
       where jwc.clustering_version = $1
         and jwc.chicago_status <> 'CHICAGO_NOT_CONFIRMED'
         and not ${nonWeddingEventExclusionSql("sp.caption_raw")}
     )
     select
       (select count(*) from cv) as posts_total,
       (select count(*) from cv
          where exists (
            select 1 from post_venue_verdicts_current pv
            where pv.post_url = cv.source_post_url and pv.reviewed_by = $2
          )) as posts_reviewed,
       (select count(*) from cv
          where chicago_status = 'CHICAGO_CONFIRMED'
            and not exists (
              select 1 from post_venue_verdicts_current pv where pv.post_url = cv.source_post_url
            )) as remaining_confirmed,
       (select count(*) from cv
          where chicago_status = 'CHICAGO_AMBIGUOUS'
            and not exists (
              select 1 from post_venue_verdicts_current pv where pv.post_url = cv.source_post_url
            )) as remaining_ambiguous,
       (select count(*) from jeremy_wedding_candidates where clustering_version = $1) as candidates_total,
       (select count(*) from candidate_review_derived crd
          join jeremy_wedding_candidates jwc on jwc.id = crd.candidate_id
          where jwc.clustering_version = $1 and crd.posts_decided = crd.posts_total) as candidates_complete`,
    [STRUCTURAL_CLUSTERING_VERSION, reviewedBy]
  );

  const { rows: verdictRows } = await pool.query<{ verdict: string; n: string }>(
    `select pv.verdict, count(*) as n
     from jeremy_wedding_candidate_posts cp
     join jeremy_wedding_candidates jwc on jwc.id = cp.candidate_id
     join post_venue_verdicts_current pv on pv.post_url = cp.source_post_url and pv.reviewed_by = $2
     where jwc.clustering_version = $1
     group by pv.verdict`,
    [STRUCTURAL_CLUSTERING_VERSION, reviewedBy]
  );

  const byVerdict: Record<string, number> = {};
  for (const r of verdictRows) byVerdict[r.verdict] = Number(r.n);

  return {
    posts_total: Number(rows[0].posts_total),
    posts_reviewed: Number(rows[0].posts_reviewed),
    remaining_confirmed: Number(rows[0].remaining_confirmed),
    remaining_ambiguous: Number(rows[0].remaining_ambiguous),
    candidates_total: Number(rows[0].candidates_total),
    candidates_complete: Number(rows[0].candidates_complete),
    by_verdict: byVerdict,
  };
}

// Shared by recordPostVerdict() and recordGroupVerdict(): the two inserts (post_venue_verdicts,
// then -- unless the verdict maps to null -- human_post_labels) that make up one post's verdict,
// run against an already-open transaction client. Pulled out so the group path reuses exactly
// this mapping rather than re-deriving it.
async function insertOneVerdict(
  client: PoolClient,
  args: {
    postUrl: string;
    candidateId: number;
    venueAccountId: number | null;
    verdict: PostVenueVerdict;
    correctedVenueAccountId: number | null;
    duplicateOfWeddingId: number | null;
    reviewedBy: string;
    clientMs: number | null;
    notes: string | null;
  }
): Promise<void> {
  const { postUrl, candidateId, venueAccountId, verdict, correctedVenueAccountId, duplicateOfWeddingId, reviewedBy, clientMs, notes } =
    args;

  await client.query(
    `insert into post_venue_verdicts
       (post_url, candidate_id, venue_account_id, verdict, corrected_venue_account_id, duplicate_of_wedding_id, reviewed_by, client_ms, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [postUrl, candidateId, venueAccountId, verdict, correctedVenueAccountId, duplicateOfWeddingId, reviewedBy, clientMs, notes]
  );

  const postLabel = VERDICT_TO_POST_LABEL[verdict];
  if (postLabel) {
    await client.query(
      `insert into human_post_labels (post_url, queue_version, decision, labeled_by, client_ms, notes)
       values ($1, $2, $3, $4, $5, $6)`,
      [postUrl, POST_VENUE_REVIEW_QUEUE_VERSION, postLabel, reviewedBy, clientMs, notes]
    );
  }
}

/**
 * Records ONE append-only post-level venue verdict, then (unless SKIP) writes ONE
 * human_post_labels row (queue_version='post_venue_review_v1') so golden_set sync
 * (syncHumanLabelsToGoldenSet.ts, unchanged) keeps working -- both writes happen in one
 * transaction, mirroring recordLabel()/recordCandidateDecision().
 *
 * Unlike the old recordCandidateDecision(), an unresolvable correctedVenueUsername does NOT
 * throw: OTHER_VENUE is still recorded with a null corrected_venue_account_id -- the reviewer's
 * verdict (real wedding, wrong venue) stands even if they didn't type a resolvable @handle.
 *
 * opts.notes (D055 addendum) is written verbatim to BOTH post_venue_verdicts.notes and
 * human_post_labels.notes, so it survives into golden_set.notes on the next
 * syncHumanLabelsToGoldenSet.ts run unchanged. Empty/whitespace-only notes should be normalized to
 * null by the caller (the API route does this) -- this function stores whatever it's given.
 */
export async function recordPostVerdict(
  postUrl: string,
  candidateId: number,
  verdict: PostVenueVerdict,
  opts: {
    correctedVenueUsername?: string | null;
    duplicateOfWeddingId?: number | null;
    reviewedBy?: string;
    clientMs?: number | null;
    notes?: string | null;
  } = {}
): Promise<void> {
  const reviewedBy = opts.reviewedBy ?? LABELED_BY;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows: candRows } = await client.query<{ venue_account_id: number | null }>(
      `select venue_account_id from jeremy_wedding_candidates where id = $1`,
      [candidateId]
    );
    if (candRows.length === 0) {
      throw new Error(`candidate_id ${candidateId} not found`);
    }
    const venueAccountId = candRows[0].venue_account_id;

    let correctedVenueAccountId: number | null = null;
    if (verdict === "OTHER_VENUE" && opts.correctedVenueUsername) {
      const { rows } = await client.query<{ id: number; canonical_account_id: number | null }>(
        `select a.id, al.canonical_account_id
         from accounts a
         left join account_aliases al on al.alias_account_id = a.id
         where a.username = $1::citext`,
        [opts.correctedVenueUsername]
      );
      // Deliberately not an error: the reviewer's verdict (real wedding, wrong venue) stands even
      // when the handle they typed doesn't resolve to a known account.
      if (rows.length > 0) {
        correctedVenueAccountId = rows[0].canonical_account_id ?? rows[0].id;
      }
    }

    const notes = opts.notes ?? null;

    await insertOneVerdict(client, {
      postUrl,
      candidateId,
      venueAccountId,
      verdict,
      correctedVenueAccountId,
      duplicateOfWeddingId: verdict === "DUPLICATE" ? opts.duplicateOfWeddingId ?? null : null,
      reviewedBy,
      clientMs: opts.clientMs ?? null,
      notes,
    });

    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export type GroupVerdict = Extract<PostVenueVerdict, "THIS_VENUE" | "NOT_WEDDING">;

const VALID_GROUP_VERDICTS: readonly GroupVerdict[] = ["THIS_VENUE", "NOT_WEDDING"];

export function isGroupVerdict(value: unknown): value is GroupVerdict {
  return typeof value === "string" && (VALID_GROUP_VERDICTS as readonly string[]).includes(value);
}

/**
 * Bulk sibling-post version of recordPostVerdict() (D055 addendum, "clear a whole group in one
 * keystroke"): for every post belonging to `candidateId` that this reviewer has NOT already
 * recorded a post_venue_verdicts_current row for, writes the SAME verdict + (unless the verdict
 * maps to null) human_post_labels row that recordPostVerdict() would write for it individually --
 * insertOneVerdict() above is the shared code path, so this can never drift from the single-post
 * mapping. One transaction for the whole group, so a partial write never lands.
 *
 * Deliberately narrower than recordPostVerdict(): only THIS_VENUE / NOT_WEDDING are allowed here
 * (OTHER_VENUE/DUPLICATE need a per-post handle or wedding id the reviewer hasn't seen for the
 * other posts in the group; UNSURE/SKIP don't need a bulk path). No corrected-venue or
 * duplicate-of-wedding resolution applies to either allowed verdict, so venue_account_id is looked
 * up once for the whole candidate and correctedVenueAccountId/duplicateOfWeddingId are always
 * null.
 */
export async function recordGroupVerdict(
  candidateId: number,
  verdict: GroupVerdict,
  opts: {
    reviewedBy?: string;
    notes?: string | null;
  } = {}
): Promise<{ written: number; post_urls: string[] }> {
  const reviewedBy = opts.reviewedBy ?? LABELED_BY;
  const notes = opts.notes ?? null;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows: candRows } = await client.query<{ venue_account_id: number | null }>(
      `select venue_account_id from jeremy_wedding_candidates where id = $1`,
      [candidateId]
    );
    if (candRows.length === 0) {
      throw new Error(`candidate_id ${candidateId} not found`);
    }
    const venueAccountId = candRows[0].venue_account_id;

    // Every post of this candidate that this reviewer hasn't already recorded a verdict for --
    // the same "no post_venue_verdicts_current row for this reviewer" test getPostReviewQueue()
    // uses, so this never re-verdicts a post the reviewer already handled individually (e.g. via
    // B/back, or before the group action was pressed).
    const { rows: postRows } = await client.query<{ source_post_url: string }>(
      `select cp.source_post_url
       from jeremy_wedding_candidate_posts cp
       where cp.candidate_id = $1
         and not exists (
           select 1 from post_venue_verdicts_current pv
           where pv.post_url = cp.source_post_url and pv.reviewed_by = $2
         )
       order by cp.source_post_url`,
      [candidateId, reviewedBy]
    );

    const postUrls = postRows.map((r) => r.source_post_url);
    for (const postUrl of postUrls) {
      await insertOneVerdict(client, {
        postUrl,
        candidateId,
        venueAccountId,
        verdict,
        correctedVenueAccountId: null,
        duplicateOfWeddingId: null,
        reviewedBy,
        clientMs: null,
        notes,
      });
    }

    await client.query("commit");
    return { written: postUrls.length, post_urls: postUrls };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
