/**
 * Clusters vendor-credit evidence into jeremy_wedding_candidates — same
 * conceptual algorithm as Ben's phase_dedup() (Jaccard vendor-set overlap +
 * date proximity), but as match-upsert against a table this workstream owns
 * (never truncated), instead of truncate-rebuild. See
 * docs/engineering/graph-strengthening/ingestion-design.md for the full
 * reasoning.
 *
 * Idempotent: a post already in jeremy_wedding_candidate_posts is skipped
 * entirely on rerun — already-clustered posts are never reconsidered in V1
 * (a named non-goal, not an oversight).
 *
 * --evidence-source v3 (default, unchanged behavior) reads
 * jeremy_post_vendor_evidence (candidate_score>=12 + V3 INCLUDE), writes
 * under clustering_version='jeremy-cluster-v1'.
 *
 * --evidence-source human_confirmed reads human_confirmed_post_vendor_evidence
 * (golden_set-confirmed WEDDING posts) instead, writes under a DIFFERENT
 * clustering_version ('human-confirmed-v1') so the two populations' candidates
 * never mix — deliberately not a merged/unioned evidence pool, per the
 * project's provenance-separation rule (docs/engineering/human-labeling/README.md).
 * Most human-confirmed posts never had a V3 run at all, so date/event-date
 * evidence is sourced from staging.instagram_posts.post_timestamp directly
 * rather than post_classification_runs (event_date/event_date_confidence,
 * which only V3 extracts, are left null for this source — effectiveDate()
 * already falls back to posted_at cleanly). After clustering, resolves each
 * human-confirmed candidate's chicago_status (CHICAGO_CONFIRMED/
 * CHICAGO_NOT_CONFIRMED/CHICAGO_AMBIGUOUS) from account_locations.in_metro —
 * an explicit tri-state, never silently inferred, never left to default to
 * either extreme.
 *
 * --evidence-source venue_couple_signal reads
 * venue_couple_signal_post_vendor_evidence (D047 follow-on, 2026-09-06):
 * posts authored by a KNOWN Chicago venue vendor whose caption matches an
 * explicit couple-name pattern, independent of V3/golden_set. Writes under
 * clustering_version='venue-couple-signal-v1' — a third, separate
 * provenance pool, same non-mixing rule as human_confirmed. Date evidence
 * from staging.instagram_posts.post_timestamp (same reason as
 * human_confirmed). chicago_status is resolved the same tri-state way as
 * human_confirmed (vendors.city/account_locations.in_metro) — deliberately
 * NOT hardcoded true, even though every source post's author is already a
 * known Chicago venue: the resolved venue_account_id can differ from the
 * author (e.g. a caption crediting a different account as "Venue:"), so
 * this stays a real, re-checked signal rather than an inherited assumption.
 *
 * --evidence-source venue_inline_mention reads
 * venue_inline_mention_post_vendor_evidence (D047 follow-on, 2026-09-06): posts (any author)
 * that inline-mention an already-known Chicago venue handle without a labeled "Venue:" line,
 * plus a promise-filter (same regex as venue_coverage_v3's /label queue), plus the post's own
 * already-parsed non-venue vendor credits unioned in. Writes under
 * clustering_version='venue-inline-mention-v1' — a fourth, separate provenance pool. Date
 * evidence and chicago_status resolution follow the same pattern as venue_couple_signal (trust
 * vendors.city='Chicago' as a real signal, since this source's venue_account_id is always
 * resolved from that same table by construction).
 *
 * --evidence-source structural reads structural_post_vendor_evidence (D055 "squeeze the 47k"
 * Phase 0, 2026-09-08): posts venue-anchored from credit-line, author-is-known-venue, or IG
 * location-tag (not just a labeled "Venue:" credit line) — a fifth, separate provenance pool,
 * clustering_version=STRUCTURAL_CLUSTERING_VERSION ("structural-v2" — v1 was the Phase 0 sizing
 * run; see lib/server/structuralVersion.ts). Eligibility for THIS source only is NOT the generic
 * >=3-distinct-role rule below, and is itself anchor-source-dependent (D055 structural-v2
 * precision fix, 2026-09-08 — a hand-read of 12 CHICAGO_CONFIRMED low-coverage-venue candidates
 * found 3/12 were venue-authored marketing posts with one vendor credit and no wedding language):
 * a post qualifies iff it has a venue-anchor row AND, when that anchor is a labeled "Venue:"
 * credit line, at least one non-venue evidence row OR (has_wedding_keyword AND has_couple_signal)
 * — unchanged from v1, a labeled credit line is itself wedding-shaped; but when the anchor is
 * author/location_tag/inline_at/venue_hashtag (which only say WHERE, not that it's a wedding),
 * has_wedding_keyword is now REQUIRED, plus at least one non-venue evidence row OR
 * has_couple_signal. has_couple_signal (and the new has_couple_signal-derived couple_guess) also
 * got a precision fix in the view itself: the couple-name-pair regex alternative excludes matches
 * where either captured word is a business word (e.g. "Lido Banquets & Events" no longer reads as
 * a couple). Date evidence is the view's own `event_date` (staging.instagram_posts.post_timestamp
 * under the hood — same as human_confirmed/venue_couple_signal/venue_inline_mention, no V3 event
 * extraction available for this population either). chicago_status resolves exactly like the
 * venue_couple_signal/venue_inline_mention branch. Also persists venue_anchor_source and
 * venue_anchor_conflict onto the candidate (jeremy_wedding_candidates columns added by
 * applyStructuralEvidenceSchema.ts) — coalesced (first post's anchor wins, never silently
 * overwritten) with venue_anchor_conflict set (sticky, never cleared) the moment two attached
 * posts disagree on the venue anchor (different resolved account OR different anchor source) —
 * a human-visible flag, same "never silently pick a side" instinct as the credit_line double-
 * venue-tag conflict inside the view itself (D050/D051). Additionally, the match-upsert loop
 * below applies a couple-name merge veto for this source (D055 structural-v2, hand-read: 1/12
 * candidates merged two different couples' weddings; 228/4,646 v1 candidates, ~5%, contain >=2
 * distinct couple names) — when both the incoming post and a would-be-matched candidate have a
 * non-null couple_guess and they differ, that specific match is skipped (not vetoed globally —
 * another candidate may still match, or the post starts its own new candidate).
 *
 * --dry-run (any source): runs the exact same match-upsert logic, but every statement that would
 * write to jeremy_wedding_candidates/jeremy_wedding_candidate_posts is skipped outright (not
 * issued-then-rolled-back — no write statement reaches the database at all under --dry-run).
 * Newly "created" candidates get a synthetic negative in-memory id so later posts in the same
 * pass can still Jaccard-match against them, same as a real run. Computes eligibility + would-be
 * attached/created/chicago_status counts (plus, for structural, an eligible-by-anchor-source
 * breakdown and the couple-veto count). Added for D055 Phase 0 sizing, where a live run is
 * explicitly out of scope while the ungated parser run is still in flight.
 *
 * --ignore-existing-candidates (dry-run only, structural sizing escape hatch): source_post_url
 * is a global primary key on jeremy_wedding_candidate_posts, so a post already attached to a
 * structural-v1 candidate is invisible to a structural-v2 dry-run's to-process count until v1's
 * candidates are deleted. This flag ignores that skip so v2 can be sized honestly BEFORE v1 is
 * deleted. Refused outright (not silently ignored) without --dry-run, since it would otherwise
 * let a real run re-attach posts a real candidate already owns.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/runJeremyWeddingClustering.ts
 *   bun run scripts/graph/runJeremyWeddingClustering.ts --evidence-source human_confirmed
 *   bun run scripts/graph/runJeremyWeddingClustering.ts --evidence-source venue_couple_signal
 *   bun run scripts/graph/runJeremyWeddingClustering.ts --evidence-source venue_inline_mention
 *   bun run scripts/graph/runJeremyWeddingClustering.ts --evidence-source structural --dry-run
 *   bun run scripts/graph/runJeremyWeddingClustering.ts --evidence-source structural --dry-run --ignore-existing-candidates
 */
import { getPool, closePool } from "../classify/db";
import { effectiveDate, daysBetween, jaccard } from "./clusteringUtils";
// Single source of truth for the structural evidence-source's version, shared with
// lib/server/candidateReview.ts -- see that module's header for why it lives in lib/server
// rather than here (lib/server can't import a scripts/ file into the app's checked/bundled
// graph). Re-exported so existing importers of CLUSTERING_VERSION-family constants from this
// script (e.g. reportHumanConfirmedGraphValue.ts) keep working unchanged.
import { STRUCTURAL_CLUSTERING_VERSION } from "../../lib/server/structuralVersion";

export const CLUSTERING_VERSION = "jeremy-cluster-v1";
export const HUMAN_CONFIRMED_CLUSTERING_VERSION = "human-confirmed-v1";
export const VENUE_COUPLE_SIGNAL_CLUSTERING_VERSION = "venue-couple-signal-v1";
export const VENUE_INLINE_MENTION_CLUSTERING_VERSION = "venue-inline-mention-v1";
// v1 ("structural-v1") was the D055 Phase 0 sizing run. Bumped to structural-v2 (defined in
// lib/server/structuralVersion.ts) for the eligibility/couple-regex/merge-veto precision fixes
// below -- a real behavior change, so a new version rather than a silent rewrite of v1's
// candidates (v1's candidates must be explicitly deleted before a real v2 run).
export { STRUCTURAL_CLUSTERING_VERSION };
const DATE_WINDOW_DAYS = 21;
const JACCARD_THRESHOLD = 0.5;

interface PostRow {
  source_post_url: string;
  posted_at: string | null;
  event_date: string | null;
  event_date_confidence: number | null;
}

interface EvidenceRow {
  source_post_url: string;
  account_id: number;
  role: string;
  venue_anchor_source: string | null;
  venue_anchor_conflict: boolean | null;
  has_couple_signal: boolean | null;
  has_wedding_keyword: boolean | null;
  couple_guess: string | null;
  has_non_wedding_event_keyword: boolean | null;
}

interface CandidateState {
  id: number;
  venueAccountId: number | null;
  eventDateEst: Date | null;
  vendorKeys: Set<string>; // "accountId:role"
  postDates: Date[]; // effective dates of all attached posts, for recomputing the earliest
  venueAnchorSource: string | null;
  venueAnchorConflict: boolean;
  // structural only (always null for other sources, so the merge-veto below is a no-op there).
  // First post's guess wins, same never-silently-overwritten discipline as venueAccountId --
  // a LATER post disagreeing doesn't overwrite the candidate's guess, it vetoes the merge
  // entirely (see the matching loop).
  coupleGuess: string | null;
}

type EvidenceSource = "v3" | "human_confirmed" | "venue_couple_signal" | "venue_inline_mention" | "structural";
const VALID_SOURCES: EvidenceSource[] = [
  "v3",
  "human_confirmed",
  "venue_couple_signal",
  "venue_inline_mention",
  "structural",
];

function parseArgs() {
  const a = process.argv.slice(2);
  const evidenceSource = a.includes("--evidence-source")
    ? a[a.indexOf("--evidence-source") + 1]
    : "v3";
  if (!VALID_SOURCES.includes(evidenceSource as EvidenceSource)) {
    throw new Error(`--evidence-source must be one of ${VALID_SOURCES.join(", ")}, got "${evidenceSource}"`);
  }
  const dryRun = a.includes("--dry-run");
  // Sizing-only escape hatch (D055 structural-v2): a post already attached to a v1
  // structural candidate is globally excluded from jeremy_wedding_candidate_posts, so a normal
  // dry-run of structural-v2 reports ~0 to-process until v1's candidates are deleted. This flag
  // ignores that skip so the real v2 numbers can be sized BEFORE v1 is deleted. It must never
  // touch a real (non-dry-run) pass -- refuse outright rather than silently no-op.
  const ignoreExistingCandidates = a.includes("--ignore-existing-candidates");
  if (ignoreExistingCandidates && !dryRun) {
    throw new Error("--ignore-existing-candidates is dry-run only -- pass --dry-run too");
  }
  return { evidenceSource: evidenceSource as EvidenceSource, dryRun, ignoreExistingCandidates };
}

const CLUSTERING_VERSION_BY_SOURCE: Record<EvidenceSource, string> = {
  v3: CLUSTERING_VERSION,
  human_confirmed: HUMAN_CONFIRMED_CLUSTERING_VERSION,
  venue_couple_signal: VENUE_COUPLE_SIGNAL_CLUSTERING_VERSION,
  venue_inline_mention: VENUE_INLINE_MENTION_CLUSTERING_VERSION,
  structural: STRUCTURAL_CLUSTERING_VERSION,
};
const EVIDENCE_VIEW_BY_SOURCE: Record<EvidenceSource, string> = {
  v3: "jeremy_post_vendor_evidence",
  human_confirmed: "human_confirmed_post_vendor_evidence",
  venue_couple_signal: "venue_couple_signal_post_vendor_evidence",
  venue_inline_mention: "venue_inline_mention_post_vendor_evidence",
  structural: "structural_post_vendor_evidence",
};

async function main() {
  const { evidenceSource, dryRun, ignoreExistingCandidates } = parseArgs();
  const clusteringVersion = CLUSTERING_VERSION_BY_SOURCE[evidenceSource];
  const evidenceView = EVIDENCE_VIEW_BY_SOURCE[evidenceSource];
  const pool = getPool();

  // Fetch the (moderately expensive — a per-row lateral join) evidence view exactly ONCE.
  // Referencing it twice in a single SQL statement (once directly, once in a subquery) made
  // Postgres's planner re-evaluate it combinatorially and blow through the statement timeout
  // (verified directly: the equivalent SQL-only query timed out at 2 minutes even via psql;
  // fetching it once and doing the grouping in JS runs in under a second). structural also pulls
  // venue_anchor_source/venue_anchor_conflict/has_couple_signal/has_wedding_keyword -- the other
  // four views don't have those columns, so the select list is source-specific.
  const evidenceColumns =
    evidenceSource === "structural"
      ? "source_post_url, account_id, role, venue_anchor_source, venue_anchor_conflict, has_couple_signal, has_wedding_keyword, couple_guess, has_non_wedding_event_keyword"
      : "source_post_url, account_id, role, null as venue_anchor_source, null as venue_anchor_conflict, null as has_couple_signal, null as has_wedding_keyword, null as couple_guess, null as has_non_wedding_event_keyword";
  const { rows: evidence } = await pool.query<EvidenceRow>(`select ${evidenceColumns} from ${evidenceView}`);
  const evidenceByPost = new Map<string, EvidenceRow[]>();
  for (const e of evidence) {
    if (!evidenceByPost.has(e.source_post_url)) evidenceByPost.set(e.source_post_url, []);
    evidenceByPost.get(e.source_post_url)!.push(e);
  }
  // Eligibility is source-specific: every other source keeps the original >=3-distinct-role
  // floor. structural instead requires a venue anchor (the whole point of this source), plus
  // supporting evidence whose bar depends on how strong that anchor is (D055 structural-v2
  // precision fix, hand-read on 12 CHICAGO_CONFIRMED candidates at low-coverage venues: 3/12
  // were venue-authored marketing posts -- "Book now!", "Thursday Therapy" -- credited with one
  // vendor and no wedding language at all):
  //   - venue_anchor_source = 'credit_line': unchanged from v1. A labeled "Venue:" line is
  //     itself wedding-shaped, so a real non-venue credit OR (wedding language AND a named
  //     couple) is enough.
  //   - venue_anchor_source in (author, location_tag, inline_at, venue_hashtag): these only say
  //     WHERE a post was taken/tagged, not that it's a wedding at all -- require explicit
  //     wedding-language (has_wedding_keyword) AND (a real non-venue credit OR a named couple).
  // Deliberately NOT >=3 roles here: that floor is exactly what structural_post_vendor_evidence
  // exists to route around.
  // D055 addendum (2026-09-08, user mid-review: "consider filtering out the posts that say bar
  // or bat mitzvah. that's almost always not a wedding"): a post naming a non-wedding event with
  // no wedding language at all is excluded regardless of anchor source -- this fires BEFORE the
  // anchor-source-dependent rules below, not as an alternative bar within them.
  let nonWeddingEventExcludedCount = 0;
  const eligiblePostUrls =
    evidenceSource === "structural"
      ? [...evidenceByPost.entries()]
          .filter(([, rows]) => {
            const hasWeddingKeyword = rows.some((r) => r.has_wedding_keyword);
            const hasNonWeddingEventKeyword = rows.some((r) => r.has_non_wedding_event_keyword);
            if (hasNonWeddingEventKeyword && !hasWeddingKeyword) {
              nonWeddingEventExcludedCount++;
              return false;
            }
            const anchorRow = rows.find((r) => r.role === "venue" && r.venue_anchor_source != null);
            if (!anchorRow) return false;
            const hasNonVenueEvidence = rows.some((r) => r.role !== "venue");
            const hasCoupleSignal = rows.some((r) => r.has_couple_signal);
            if (anchorRow.venue_anchor_source === "credit_line") {
              return hasNonVenueEvidence || (hasWeddingKeyword && hasCoupleSignal);
            }
            return hasWeddingKeyword && (hasNonVenueEvidence || hasCoupleSignal);
          })
          .map(([url]) => url)
      : [...evidenceByPost.entries()]
          .filter(([, rows]) => new Set(rows.map((r) => r.role)).size >= 3)
          .map(([url]) => url);

  // Cheap breakdown for --dry-run sizing (D055 structural-v2): eligible-post count by which
  // anchor source qualified it, so a sizing run can see whether the precision fix is pulling
  // weight disproportionately off one anchor tier.
  if (evidenceSource === "structural") {
    const eligibleByAnchorSource: Record<string, number> = {};
    for (const url of eligiblePostUrls) {
      const rows = evidenceByPost.get(url) ?? [];
      const anchorRow = rows.find((r) => r.role === "venue" && r.venue_anchor_source != null);
      const src = anchorRow?.venue_anchor_source ?? "unknown";
      eligibleByAnchorSource[src] = (eligibleByAnchorSource[src] ?? 0) + 1;
    }
    console.log(`[jeremy-cluster] structural eligible-by-anchor-source: ${JSON.stringify(eligibleByAnchorSource)}`);
  }

  const posts: PostRow[] =
    evidenceSource === "v3"
      ? await (async () => {
          const { rows } = await pool.query<PostRow>(
            `select post_url as source_post_url, posted_at::text as posted_at, event_date, event_date_confidence
             from post_classification_runs
             where classifier_version = 'v3' and post_url = any($1::text[])
             order by post_url, classified_at desc`,
            [eligiblePostUrls]
          );
          return rows;
        })()
      : await (async () => {
          // Most human-confirmed/venue-couple-signal/venue-inline-mention/structural posts never
          // had a V3 run -- source posted_at directly from the corpus table instead. No
          // event_date/event_date_confidence available here (only V3 extracts those);
          // effectiveDate() falls back to posted_at cleanly. This is the same
          // staging.instagram_posts.post_timestamp the structural view's own `event_date` column
          // is built from, so re-deriving it here (rather than selecting it off the view) is
          // redundant work, not a different number.
          const { rows } = await pool.query<PostRow>(
            `select post_url as source_post_url, post_timestamp::text as posted_at,
                    null::text as event_date, null::real as event_date_confidence
             from staging.instagram_posts
             where post_url = any($1::text[])`,
            [eligiblePostUrls]
          );
          return rows;
        })();
  // distinct on post_url, keeping the latest classified_at row (v3 query above is pre-sorted for this)
  const seenPost = new Set<string>();
  const dedupedPosts = posts.filter((p) => (seenPost.has(p.source_post_url) ? false : (seenPost.add(p.source_post_url), true)));

  const { rows: alreadyClustered } = await pool.query<{ source_post_url: string }>(
    `select source_post_url from jeremy_wedding_candidate_posts`
  );
  const alreadyClusteredSet = new Set(alreadyClustered.map((r) => r.source_post_url));
  // --ignore-existing-candidates (dry-run only, see parseArgs): for structural-v2 sizing before
  // v1's candidates are deleted, don't let v1's already-claimed posts (source_post_url is a
  // global PK across every evidence source/version) suppress the "real" v2 to-process count.
  // The real alreadyClusteredSet is still fetched/logged above for visibility either way.
  const effectiveAlreadyClusteredSet = ignoreExistingCandidates ? new Set<string>() : alreadyClusteredSet;

  // Deterministic order: effective date ascending (nulls last), then post_url — required for
  // true idempotency (an unordered pass could let a borderline Jaccard case land differently).
  const sortable = dedupedPosts
    .filter((p) => !effectiveAlreadyClusteredSet.has(p.source_post_url))
    .map((p) => ({ p, date: effectiveDate(p) }))
    .sort((a, b) => {
      if (a.date && b.date) return a.date.getTime() - b.date.getTime() || a.p.source_post_url.localeCompare(b.p.source_post_url);
      if (a.date) return -1;
      if (b.date) return 1;
      return a.p.source_post_url.localeCompare(b.p.source_post_url);
    });

  console.log(
    `[jeremy-cluster] ${dryRun ? "DRY RUN — " : ""}evidence-source=${evidenceSource} version=${clusteringVersion} clustering-eligible=${eligiblePostUrls.length} already-clustered=${alreadyClusteredSet.size}${ignoreExistingCandidates ? " (IGNORED for to-process via --ignore-existing-candidates)" : ""} to-process=${sortable.length}${
      evidenceSource === "structural" ? ` non-wedding-event-excluded=${nonWeddingEventExcludedCount}` : ""
    }`
  );

  // Load existing candidates fresh (match-upsert target).
  const { rows: existingCandidates } = await pool.query<{
    id: number;
    venue_account_id: number | null;
    event_date_est: string | null;
    venue_anchor_source: string | null;
    venue_anchor_conflict: boolean | null;
  }>(
    `select id, venue_account_id, event_date_est::text as event_date_est, venue_anchor_source, venue_anchor_conflict
     from jeremy_wedding_candidates where clustering_version = $1`,
    [clusteringVersion]
  );
  const { rows: existingVendors } = await pool.query<{ candidate_id: number; account_id: number; role: string }>(
    `select candidate_id, account_id, role from jeremy_wedding_candidate_vendors`
  );
  const vendorsByCandidate = new Map<number, Set<string>>();
  for (const v of existingVendors) {
    if (!vendorsByCandidate.has(v.candidate_id)) vendorsByCandidate.set(v.candidate_id, new Set());
    vendorsByCandidate.get(v.candidate_id)!.add(`${v.account_id}:${v.role}`);
  }
  const candidates = new Map<number, CandidateState>(
    existingCandidates.map((c) => [
      c.id,
      {
        id: c.id,
        venueAccountId: c.venue_account_id,
        eventDateEst: c.event_date_est ? new Date(c.event_date_est) : null,
        vendorKeys: vendorsByCandidate.get(c.id) ?? new Set(),
        postDates: [],
        venueAnchorSource: c.venue_anchor_source,
        venueAnchorConflict: c.venue_anchor_conflict ?? false,
        // Not persisted on jeremy_wedding_candidates (in-memory-only veto input, see
        // CandidateState) -- an existing candidate loaded fresh from the DB has no recorded
        // guess, so its first newly-attached post in THIS pass sets it, same as a brand new
        // candidate. This can't un-veto a real mismatch: the veto only fires when BOTH sides
        // have a guess, so "unknown" here just means this candidate's first post in this pass
        // decides it, exactly like a from-scratch candidate would.
        coupleGuess: null,
      },
    ])
  );

  let attached = 0;
  let created = 0;
  // Counts merges the Jaccard/date match found but the couple-name guess vetoed -- i.e. both
  // sides named an explicit couple and they disagreed (D055 structural-v2 precision fix,
  // hand-read: 1 candidate merged two different couples' weddings at the same venue within the
  // date window; 228/4,646 v1 candidates, ~5%, contain >=2 distinct couple names). Meaningless
  // for non-structural sources (their evidence rows' couple_guess is always null, so the
  // condition below never fires), stays 0 there.
  let coupleVetoCount = 0;
  // Only used under --dry-run, as synthetic in-memory-only candidate ids (negative, so they can
  // never collide with a real `generated always as identity` id) -- --dry-run must never send a
  // write statement to the database at all (not even inside a rolled-back transaction), so a
  // newly "created" candidate has no real id to hand out; this fakes one purely so later posts in
  // the same dry-run pass can still Jaccard-match against it in memory, same as a real run.
  let nextDryRunId = -1;

  for (const { p, date } of sortable) {
    const postEvidence = evidenceByPost.get(p.source_post_url) ?? [];
    const vendorKeys = new Set(postEvidence.map((e) => `${e.account_id}:${e.role}`));
    const venueEvidence = postEvidence.find((e) => e.role === "venue");
    const postCoupleGuess = postEvidence.find((e) => e.couple_guess != null)?.couple_guess ?? null;

    let matched: CandidateState | null = null;
    if (date) {
      for (const c of candidates.values()) {
        if (!c.eventDateEst) continue;
        if (daysBetween(date, c.eventDateEst) > DATE_WINDOW_DAYS) continue;
        if (jaccard(vendorKeys, c.vendorKeys) > JACCARD_THRESHOLD) {
          // Couple-name merge veto (D055 structural-v2): only fires when BOTH sides have a
          // guess and they differ -- a post/candidate with no guess merges exactly as before.
          // Vetoes THIS candidate only (continue, not break) -- a Jaccard/date match on vendors
          // alone doesn't mean every same-vendor-set candidate is the same wedding, so another
          // candidate later in iteration order is still free to match. If none do, the post
          // starts its own new candidate (the else branch below), same as any other unmatched
          // post.
          if (postCoupleGuess && c.coupleGuess && postCoupleGuess !== c.coupleGuess) {
            coupleVetoCount++;
            continue;
          }
          matched = c;
          break;
        }
      }
    }

    if (matched) {
      if (!dryRun) {
        await pool.query(`insert into jeremy_wedding_candidate_posts (source_post_url, candidate_id) values ($1,$2)`, [
          p.source_post_url,
          matched.id,
        ]);
      }
      matched.postDates.push(date!);
      const earliest = matched.postDates.reduce((a, b) => (a < b ? a : b));
      if (!matched.venueAccountId && venueEvidence) matched.venueAccountId = venueEvidence.account_id;
      // Anchor provenance for structural only (other sources' evidence rows never carry
      // venue_anchor_source, so this is a no-op for them): first post's anchor wins, never
      // silently overwritten (same coalesce discipline as venue_account_id itself). If a
      // later-attached post disagrees -- a different resolved venue account, or the same account
      // but a different anchor source -- flip venue_anchor_conflict permanently on, same "never
      // silently pick a side, always surface it" instinct as the credit-line double-venue-tag
      // conflict inside the view itself (D050/D051).
      if (venueEvidence?.venue_anchor_source) {
        if (!matched.venueAnchorSource) {
          matched.venueAnchorSource = venueEvidence.venue_anchor_source;
        } else if (
          venueEvidence.account_id !== matched.venueAccountId ||
          venueEvidence.venue_anchor_source !== matched.venueAnchorSource
        ) {
          matched.venueAnchorConflict = true;
        }
        if (venueEvidence.venue_anchor_conflict) matched.venueAnchorConflict = true;
      }
      matched.eventDateEst = earliest;
      for (const k of vendorKeys) matched.vendorKeys.add(k);
      // Couple guess: first (non-null) wins, never silently overwritten -- same coalesce
      // discipline as venueAccountId/venueAnchorSource above. A later post disagreeing never
      // reaches here (it would have vetoed this match above), so this is purely "record it the
      // first time we see one."
      if (!matched.coupleGuess && postCoupleGuess) matched.coupleGuess = postCoupleGuess;
      if (!dryRun) {
        await pool.query(
          `update jeremy_wedding_candidates
           set venue_account_id = coalesce(venue_account_id, $2), event_date_est = $3,
               venue_anchor_source = coalesce(venue_anchor_source, $4), venue_anchor_conflict = $5,
               updated_at = now()
           where id = $1`,
          [matched.id, matched.venueAccountId, earliest.toISOString().slice(0, 10), matched.venueAnchorSource, matched.venueAnchorConflict]
        );
      }
      attached++;
    } else {
      const initialAnchorConflict = venueEvidence?.venue_anchor_conflict ?? false;
      let id: number;
      if (!dryRun) {
        const { rows: inserted } = await pool.query<{ id: number }>(
          `insert into jeremy_wedding_candidates (clustering_version, venue_account_id, event_date_est, venue_anchor_source, venue_anchor_conflict)
           values ($1,$2,$3,$4,$5) returning id`,
          [
            clusteringVersion,
            venueEvidence?.account_id ?? null,
            date ? date.toISOString().slice(0, 10) : null,
            venueEvidence?.venue_anchor_source ?? null,
            initialAnchorConflict,
          ]
        );
        id = inserted[0].id;
        await pool.query(`insert into jeremy_wedding_candidate_posts (source_post_url, candidate_id) values ($1,$2)`, [
          p.source_post_url,
          id,
        ]);
      } else {
        id = nextDryRunId--;
      }
      candidates.set(id, {
        id,
        venueAccountId: venueEvidence?.account_id ?? null,
        eventDateEst: date,
        vendorKeys,
        postDates: date ? [date] : [],
        venueAnchorSource: venueEvidence?.venue_anchor_source ?? null,
        venueAnchorConflict: initialAnchorConflict,
        coupleGuess: postCoupleGuess,
      });
      created++;
    }
  }

  console.log(
    `[jeremy-cluster] ${dryRun ? "DRY RUN — " : ""}attached ${attached} posts to existing candidates, created ${created} new candidates${
      evidenceSource === "structural" ? `, couple-name-mismatch merges blocked=${coupleVetoCount}` : ""
    }`
  );

  if (
    evidenceSource === "human_confirmed" ||
    evidenceSource === "venue_couple_signal" ||
    evidenceSource === "venue_inline_mention" ||
    evidenceSource === "structural"
  ) {
    // Explicit tri-state Chicago check -- a human confirming "real wedding" (or a venue's own
    // couple-signal post) says nothing on its own about geography. Only
    // account_locations.in_metro=true OR vendors.city='Chicago' (real, verified signals) counts
    // as confirmed; an explicit in_metro=false is a real negative; anything else (no row, null,
    // no venue resolved at all) is AMBIGUOUS, never guessed either direction. vendors.city is
    // included here (unlike the human_confirmed-only version of this check) because
    // venue_couple_signal/venue_inline_mention/structural all resolve venue_account_id via paths
    // (author-is-a-known-venue, credit line, location tag) that make vendors.city a real signal
    // -- but the resolved venue_account_id can still differ from the post's author (a caption
    // crediting a different "Venue:" account), so this re-checks rather than assumes.
    //
    // Reads venue ids off the in-memory `candidates` map, not a fresh `select ... from
    // jeremy_wedding_candidates` -- that map already holds every existing candidate for this
    // clustering_version PLUS every candidate touched or created in this pass (with synthetic
    // negative ids under --dry-run), so this resolves chicago_status for the accurate "as of
    // this run" population in both modes, without a second round-trip that --dry-run would see
    // as still-unwritten anyway.
    const toCheck = [...candidates.values()].map((c) => ({ id: c.id, venue_account_id: c.venueAccountId }));
    const venueIds = toCheck.map((c) => c.venue_account_id).filter((id): id is number => id != null);
    const { rows: locations } = await pool.query<{ account_id: number; in_metro: boolean | null }>(
      `select account_id, in_metro from account_locations where account_id = any($1::bigint[])`,
      [venueIds]
    );
    const inMetroByAccount = new Map(locations.map((l) => [l.account_id, l.in_metro]));
    if (
      evidenceSource === "venue_couple_signal" ||
      evidenceSource === "venue_inline_mention" ||
      evidenceSource === "structural"
    ) {
      const { rows: cityRows } = await pool.query<{ account_id: number }>(
        `select distinct account_id from vendors where account_id = any($1::bigint[]) and city = 'Chicago'`,
        [venueIds]
      );
      for (const r of cityRows) if (!inMetroByAccount.has(r.account_id)) inMetroByAccount.set(r.account_id, true);
    }

    let confirmed = 0;
    let notConfirmed = 0;
    let ambiguous = 0;
    for (const c of toCheck) {
      if (c.venue_account_id == null) continue; // no venue resolved yet -- leave chicago_status null, not applicable
      const inMetro = inMetroByAccount.get(c.venue_account_id);
      const status = inMetro === true ? "CHICAGO_CONFIRMED" : inMetro === false ? "CHICAGO_NOT_CONFIRMED" : "CHICAGO_AMBIGUOUS";
      if (status === "CHICAGO_CONFIRMED") confirmed++;
      else if (status === "CHICAGO_NOT_CONFIRMED") notConfirmed++;
      else ambiguous++;
      if (!dryRun) {
        await pool.query(`update jeremy_wedding_candidates set chicago_status = $2 where id = $1`, [c.id, status]);
      }
    }
    console.log(
      `[jeremy-cluster] ${dryRun ? "DRY RUN — " : ""}chicago_status resolved for ${toCheck.length} ${evidenceSource} candidates: confirmed=${confirmed} not_confirmed=${notConfirmed} ambiguous=${ambiguous}`
    );
  }

  if (dryRun) {
    console.log("[jeremy-cluster] DRY RUN — no statement that writes to the database was executed");
  }

  await closePool();
}

// Guarded so HUMAN_CONFIRMED_CLUSTERING_VERSION/CLUSTERING_VERSION can be
// imported (e.g. by reportHumanConfirmedGraphValue.ts) without re-triggering
// a live clustering run as a side effect of the import.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
