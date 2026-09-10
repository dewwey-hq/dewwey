/**
 * D055 post-hoc merge pass (2026-09-08) -- the user, mid-review at /label/candidates: "im seeing
 * a lot of duplicates." Sized: 564 of 4,743 queued structural-v2 posts are the same couple name
 * at the same venue, split across 213+ separate `jeremy_wedding_candidates` rows. Root cause:
 * runJeremyWeddingClustering.ts clusters on vendor-set Jaccard > 0.5 within 21 days -- different
 * vendors' posts about the SAME wedding (a photographer's post crediting only the photographer +
 * venue, a florist's post crediting only the florist + venue) often share too few credited
 * handles to Jaccard-match each other, even though the couple-name veto (D055 structural-v2, see
 * runJeremyWeddingClustering.ts) proves they're the same event. That veto only SPLITS mismatches
 * within a clustering pass; nothing MERGES same-couple candidates that clustering never even
 * compared. This script is the merge half.
 *
 * Population: every `jeremy_wedding_candidates` row with clustering_version=
 * STRUCTURAL_CLUSTERING_VERSION ("structural-v2", lib/server/structuralVersion.ts).
 *
 * COUPLE KEY (revised after first dry-run, 2026-09-08): the first pass used exact `couple_guess`
 * string equality, which badly undercounted duplicates -- the same couple's name gets extracted
 * slightly differently across posts ("Elena & Joe" vs "Elena and Joe"). This pass normalizes:
 * lowercase (already true of couple_guess) -> split on the connector (&, +, "and") -> strip
 * non-letters from each side -> drop the pair if either name is < 3 letters -> sort the two names
 * -> join with '+'. Applied identically to every post on every side (survivor and absorbed).
 *
 * The connector split uses `\band\b` (word-boundary "and"), NOT an unanchored split on the
 * literal substring "and" -- verified live against this DB's actual 4,347 distinct couple_guess
 * values that an unanchored split corrupts or destroys 246 of them (5.7%), because "and" is a
 * substring of extremely common wedding-couple first names: Alexander, Andrew, Andrea, Amanda,
 * Sandra/Sandro, Cassandra, Xander, Alexandra. Examples (unanchored split -> word-boundary
 * split): "alexander & grace" -> null vs ["alexander","grace"]; "andrea and michael" ->
 * ["rea","michael"] vs ["andrea","michael"]; "amanda + vinny" -> null vs ["amanda","vinny"]. A
 * literal unanchored split would have silently dropped or mangled these real couples -- judged
 * not worth trading for slightly closer alignment to a hypothetical instance of the same problem
 * ("Highland Loft" self-splitting on the embedded "and" in "Highland" -- see below), which the
 * business-word veto already catches through a different path anyway.
 *
 * BUSINESS-WORD VETO (new, independent of structural_post_vendor_evidence's own has_couple_signal
 * filter -- that view is out of scope for this script, per the mission's instructions not to
 * relitigate it): a normalized pair is rejected if EITHER name is in BUSINESS_WORDS (below) OR
 * appears as a substring of the candidate's own venue's `accounts.username` or (first, by id)
 * `vendors.name`. Caught live: "Cake + Sweets:" (a credit-line LABEL, not a couple -- the view's
 * own regex has no way to distinguish a labeled two-word credit tag from a real "X & Y" couple
 * pair) and "Highland Loft" (self-matched because the extraction regex's "and" alternative found
 * the substring "and" embedded inside the single word "Highland" itself, with the word-boundary
 * requirement inapplicable to how THAT regex is written -- see applyStructuralEvidenceSchema.ts /
 * pipeline/schema.sql's couple_extract CTE; this script's own \band\b safeguard only protects ITS
 * OWN normalization split, not the upstream extraction). Both are business/venue-name leaks
 * through the same regex; the veto catches "cake"+"sweets" via the word list and "highl"+"loft"
 * via "loft" (word list) and via "highl" being a substring of @highlandlofteventvenue (venue
 * substring check) -- either check alone would have caught this one, both fire.
 *
 * For each candidate, derives:
 *   - couple: the most common normalized (post-veto) couple key among its attached posts'
 *     couple_guess values (structural_post_vendor_evidence, DISTINCT per post_url -- couple_guess
 *     is constant per post across that view's multiple evidence rows, verified live before
 *     writing this script). Ties broken lexicographically (smallest wins) for determinism.
 *   - d = (min, max) of the SAME view's `event_date` (staging.instagram_posts.post_timestamp
 *     under the hood) across its posts -- the same value runJeremyWeddingClustering.ts's
 *     effectiveDate() resolves to for this evidence source (event_date/event_date_confidence are
 *     always null for structural, so effectiveDate falls back to posted_at, which IS this
 *     column).
 *
 * Merge groups: candidates sharing the SAME venue_account_id (non-null) AND the SAME normalized
 * couple key (non-null) whose combined date span -- max(d) across the group minus min(d) across
 * the group, i.e. the span of the UNION of all members' post dates, not a per-candidate span --
 * is <= 60 days. A group of size 1 is not a merge. Within a group the survivor is the lowest
 * candidate id; every other member is absorbed. Two safety gates, both skip the WHOLE group
 * (never a partial merge):
 *   - date-span > 60 days: rejected outright (counted, not silently dropped).
 *   - any member already has a `jeremy_weddings_created` row (graph creation already happened
 *     off that candidate): skipped, printed with which candidate(s) blocked it -- merging
 *     candidate identity out from under an already-created wedding would orphan that wedding's
 *     provenance trail (jeremy_weddings_created.candidate_id, jeremy_wedding_vendors_ingested).
 *
 * Execute-mode writes (one transaction for the WHOLE run -- see JUDGMENT CALLS in the mission
 * report -- matching revertWeddingBatch.ts's "everything in one transaction" convention for a
 * batch operation):
 *   1. One `structural_candidate_merges` row per absorbed candidate (provenance log, mirrors
 *      weddings_retired_batches' log-before-delete shape).
 *   2. Reassign `jeremy_wedding_candidate_posts.candidate_id` (absorbed -> survivor).
 *   3. Reassign `post_venue_verdicts.candidate_id` (absorbed -> survivor) -- the user is
 *      reviewing live at /label/candidates while this runs; a reviewer may already have a
 *      verdict recorded against an absorbed candidate's post, and that verdict must follow the
 *      post to the survivor, not be orphaned or silently dropped.
 *   4. Delete the absorbed candidate's `jeremy_wedding_candidate_reconciliation` rows, then the
 *      `jeremy_wedding_candidates` row itself (FK-safe order: reassign every referencing row
 *      first, delete reconciliation rows, delete the candidate last).
 *   5. Recompute the survivor's `event_date_est` as MIN over the combined (survivor + absorbed)
 *      post dates -- matches runJeremyWeddingClustering.ts's own `matched.eventDateEst =
 *      earliest` (the earliest/min date, not a median). `venue_anchor_conflict` becomes true if
 *      the survivor's own value OR any absorbed member's value was true (sticky, never cleared,
 *      same discipline as the clustering script). `venue_anchor_source` is left untouched on the
 *      survivor (spec: "keep the survivor's venue_anchor_source").
 *
 * --dry-run (default): computes everything above, writes nothing at all -- not even the
 * `structural_candidate_merges` table's `create table if not exists` runs under dry-run, same
 * "zero write statements reach the database" discipline as runJeremyWeddingClustering.ts's own
 * --dry-run. Prints the full report (see printReport() below) instead, plus a comparison against
 * the literal-string-equality approach this replaces.
 *
 * --execute: required to actually write. Prints the exact reconciliation re-run command at the
 * end (does not run it).
 *
 * --clustering-version <value> (D055 Stage 2, pool A1, 2026-09-09): overrides
 * STRUCTURAL_CLUSTERING_VERSION so this same merge pass can run against a DIFFERENT structural
 * provenance pool (e.g. "structural-v3-a1", runJeremyWeddingClustering.ts's relaxed-eligibility
 * pool) instead of "structural-v2" -- every query/table reference below that previously hardcoded
 * STRUCTURAL_CLUSTERING_VERSION now uses this resolved value, so running against a non-default
 * pool touches only that pool's candidates. Defaults to STRUCTURAL_CLUSTERING_VERSION unchanged.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/mergeStructuralCandidatesByCouple.ts              # dry run (default)
 *   bun run scripts/graph/mergeStructuralCandidatesByCouple.ts --dry-run    # same, explicit
 *   bun run scripts/graph/mergeStructuralCandidatesByCouple.ts --execute    # real write, human only
 *   bun run scripts/graph/mergeStructuralCandidatesByCouple.ts --clustering-version structural-v3-a1 --execute
 */
import { getPool, closePool } from "../classify/db";
import { STRUCTURAL_CLUSTERING_VERSION } from "../../lib/server/structuralVersion";

// 400, not 60 (D055, 2026-09-08): the 60-day window rejected 125 of 210 same-venue+same-couple
// groups. Wedding content about ONE wedding is posted over many months -- sneak peek, full
// gallery weeks later, blog/feature months later, "one year ago" anniversary posts -- so the
// same normalized couple at the same venue within ~a year is one wedding far more often than
// two couples who happen to share both first names. Groups spanning >400 days (two wedding
// seasons) stay split. event_date_est takes the EARLIEST post, which is closest to the day.
const DATE_SPAN_LIMIT_DAYS = 400;

// Generic venue/vendor/business vocabulary that the couple-extraction regex's "[A-Z][a-z]+
// (&|+|and) [A-Z][a-z]+" pattern can false-positive on (a labeled two-word credit tag like "Cake
// + Sweets:", or a venue/business name whose own words happen to straddle an embedded "and" --
// "Highland Loft"). Independent of structural_post_vendor_evidence's own business-word filter
// (that view is out of scope here) -- this is a second, script-local veto applied to the
// NORMALIZED pair, not the raw string.
const BUSINESS_WORDS = new Set([
  "caterer", "caterers", "reception", "ceremony", "cocktail", "cocktails", "dinner", "brunch", "planner",
  "coordinator", "florist", "photographer", "videographer", "officiant", "bride", "groom", "couple",
  "events", "event", "catering", "photography", "photo", "photos", "films", "film", "designs",
  "design", "florals", "floral", "flowers", "banquets", "banquet", "studio", "studios", "co",
  "company", "weddings", "wedding", "hall", "room", "bar", "grill", "rentals", "decor", "beauty",
  "hair", "makeup", "music", "sound", "booth", "bridal", "boutique", "group", "team", "cakes",
  "cake", "sweets", "bakery", "planning", "entertainment", "lounge", "rooftop", "club", "hotel",
  "venue", "loft", "lofts", "house", "garden", "gardens", "estate", "farm", "farms", "vineyard",
  "winery", "ballroom", "chapel", "church", "park", "resort", "inn", "suites", "center", "centre",
  "collective", "creative", "media", "productions", "dj", "band", "bride", "groom", "mr", "mrs",
  "love", "day", "night", "first", "last", "forever", "chicago", "illinois",
]);

// Word-boundary-anchored connector split (see the header comment's COUPLE KEY section for why
// this is \band\b rather than an unanchored /and/ -- the latter corrupts/destroys ~5.7% of this
// DB's real couple_guess values by matching "and" embedded inside common names like Alexander,
// Andrew, Andrea, Amanda, Sandra, Cassandra, Xander).
const CONNECTOR_SPLIT = /\s*&\s*|\s*\+\s*|\band\b/;

interface CandidateRow {
  id: number;
  venue_account_id: number | null;
  event_date_est: string | null;
  venue_anchor_source: string | null;
  venue_anchor_conflict: boolean | null;
}

interface CandidatePostRow {
  candidate_id: number;
  source_post_url: string;
}

interface EvidenceRow {
  source_post_url: string;
  couple_guess: string | null;
  event_date: string | null;
}

interface VenueIdentity {
  username: string | null;
  vendorName: string | null;
}

interface DerivedCandidate {
  id: number;
  venueAccountId: number | null;
  couple: string | null; // normalized key, post-veto -- see normalizeAndVetoCouple()
  literalCouple: string | null; // old exact-string mode, kept only for the before/after comparison
  minDate: Date | null;
  maxDate: Date | null;
  anchorSource: string | null;
  anchorConflict: boolean;
  postUrls: string[];
}

interface MergeGroup {
  key: string;
  venueAccountId: number;
  couple: string;
  members: DerivedCandidate[];
  survivor: DerivedCandidate;
  absorbed: DerivedCandidate[];
  spanDays: number;
  distinctAnchorSources: Set<string | null>;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

/** Most common non-null value; ties broken lexicographically (smallest) for determinism. */
function mode<T extends string>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const max = Math.max(...counts.values());
  const winners = [...counts.entries()].filter(([, n]) => n === max).map(([k]) => k);
  winners.sort();
  return winners[0];
}

/** Step 1 of normalization: connector-split + strip non-letters + length filter. Returns the
 * unsorted [nameA, nameB] pair, or null if the raw string isn't a valid two-name pattern. */
function extractNamePair(raw: string): [string, string] | null {
  const parts = raw
    .split(CONNECTOR_SPLIT)
    .map((p) => p.replace(/[^a-z]/g, ""))
    .filter((p) => p.length > 0);
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (a.length < 3 || b.length < 3) return null;
  return [a, b];
}

/** Step 2: business-word / venue-identity veto on an already-extracted pair. */
function isVetoedName(name: string, venue: VenueIdentity): boolean {
  if (BUSINESS_WORDS.has(name)) return true;
  if (venue.username && venue.username.toLowerCase().includes(name)) return true;
  if (venue.vendorName && venue.vendorName.toLowerCase().includes(name)) return true;
  return false;
}

/** Full pipeline: raw couple_guess -> normalized "a+b" key (sorted), or null if invalid/vetoed. */
function normalizeAndVetoCouple(raw: string, venue: VenueIdentity, onVetoed: () => void): string | null {
  const pair = extractNamePair(raw);
  if (!pair) return null;
  const [a, b] = pair;
  if (isVetoedName(a, venue) || isVetoedName(b, venue)) {
    onVetoed();
    return null;
  }
  return [a, b].sort().join("+");
}

function histogram(counts: number[]): Record<string, number> {
  const buckets: Record<string, number> = { "1": 0, "2": 0, "3-5": 0, "6-10": 0, "11+": 0 };
  for (const n of counts) {
    if (n === 1) buckets["1"]++;
    else if (n === 2) buckets["2"]++;
    else if (n >= 3 && n <= 5) buckets["3-5"]++;
    else if (n >= 6 && n <= 10) buckets["6-10"]++;
    else buckets["11+"]++;
  }
  return buckets;
}

/** Builds merge groups from already-derived candidates, applying the 60-day span gate and the
 * jeremy_weddings_created gate. Shared between the normalized run and the literal-comparison run
 * so both are held to the exact same gating logic. */
function buildMergeGroups(
  derived: DerivedCandidate[],
  coupleOf: (c: DerivedCandidate) => string | null,
  createdSet: Set<number>
): { groups: MergeGroup[]; rejectedDateSpan: number; skippedAlreadyCreated: { key: string; blockedBy: number[] }[] } {
  const raw = new Map<string, DerivedCandidate[]>();
  for (const c of derived) {
    const couple = coupleOf(c);
    if (c.venueAccountId == null || couple == null) continue;
    const key = `${c.venueAccountId}::${couple}`;
    if (!raw.has(key)) raw.set(key, []);
    raw.get(key)!.push(c);
  }

  const groups: MergeGroup[] = [];
  let rejectedDateSpan = 0;
  const skippedAlreadyCreated: { key: string; blockedBy: number[] }[] = [];

  for (const [key, members] of raw) {
    if (members.length < 2) continue;

    const groupCouple = coupleOf(members[0])!;
    for (const m of members) {
      if (coupleOf(m) !== groupCouple) {
        throw new Error(
          `INVARIANT VIOLATION: group ${key} contains members with different couple values (${m.id}) -- should be impossible by construction.`
        );
      }
    }

    const allDates = members.flatMap((m) => [m.minDate, m.maxDate]).filter((d): d is Date => d != null);
    const spanDays = allDates.length
      ? daysBetween(
          new Date(Math.min(...allDates.map((d) => d.getTime()))),
          new Date(Math.max(...allDates.map((d) => d.getTime())))
        )
      : 0;
    if (spanDays > DATE_SPAN_LIMIT_DAYS) {
      rejectedDateSpan++;
      continue;
    }

    const blockedBy = members.filter((m) => createdSet.has(m.id)).map((m) => m.id);
    if (blockedBy.length > 0) {
      skippedAlreadyCreated.push({ key, blockedBy });
      continue;
    }

    const survivor = members.reduce((a, b) => (a.id < b.id ? a : b));
    const absorbed = members.filter((m) => m.id !== survivor.id);
    groups.push({
      key,
      venueAccountId: survivor.venueAccountId!,
      couple: groupCouple,
      members,
      survivor,
      absorbed,
      spanDays: Math.round(spanDays),
      distinctAnchorSources: new Set(members.map((m) => m.anchorSource)),
    });
  }

  return { groups, rejectedDateSpan, skippedAlreadyCreated };
}

async function loadDerivedCandidates(
  pool: ReturnType<typeof getPool>,
  clusteringVersion: string
): Promise<{
  derived: DerivedCandidate[];
  vetoedCount: number;
}> {
  const { rows: candidates } = await pool.query<CandidateRow>(
    `select id, venue_account_id, event_date_est::text as event_date_est, venue_anchor_source, venue_anchor_conflict
     from jeremy_wedding_candidates where clustering_version = $1`,
    [clusteringVersion]
  );
  const { rows: candidatePosts } = await pool.query<CandidatePostRow>(
    `select cp.candidate_id, cp.source_post_url
     from jeremy_wedding_candidate_posts cp
     join jeremy_wedding_candidates c on c.id = cp.candidate_id
     where c.clustering_version = $1`,
    [clusteringVersion]
  );
  // DISTINCT per post_url -- couple_guess/event_date are constant per post across the view's
  // multiple evidence rows (one venue-anchor row + N non-venue credit rows), verified live
  // against the current DB before writing this script (0 posts with >1 distinct value either
  // column). Fetched once for the whole run, same "evaluate the view exactly once" discipline as
  // runJeremyWeddingClustering.ts (a repeated reference in one SQL statement made Postgres's
  // planner re-evaluate it combinatorially and blow the statement timeout there).
  const { rows: evidence } = await pool.query<EvidenceRow>(
    `select distinct source_post_url, couple_guess, event_date::text as event_date from structural_post_vendor_evidence`
  );
  const evidenceByUrl = new Map(evidence.map((e) => [e.source_post_url, e]));

  const postsByCandidate = new Map<number, string[]>();
  for (const cp of candidatePosts) {
    if (!postsByCandidate.has(cp.candidate_id)) postsByCandidate.set(cp.candidate_id, []);
    postsByCandidate.get(cp.candidate_id)!.push(cp.source_post_url);
  }

  // Venue identity (username + first-by-id vendors.name) for every venue_account_id in play, for
  // the substring half of the business-word veto. `vendors.account_id` is not unique (confirmed
  // elsewhere in this codebase, e.g. human_confirmed_post_geography) -- same defensive
  // order-by-id-limit-1 pattern used there.
  const venueIds = [...new Set(candidates.map((c) => c.venue_account_id).filter((id): id is number => id != null))];
  const { rows: accountRows } = venueIds.length
    ? await pool.query<{ id: number; username: string }>(`select id, username from accounts where id = any($1::bigint[])`, [venueIds])
    : { rows: [] as { id: number; username: string }[] };
  const { rows: vendorRows } = venueIds.length
    ? await pool.query<{ account_id: number; name: string }>(
        `select distinct on (account_id) account_id, name from vendors where account_id = any($1::bigint[]) order by account_id, id`,
        [venueIds]
      )
    : { rows: [] as { account_id: number; name: string }[] };
  const usernameByVenueId = new Map(accountRows.map((r) => [r.id, r.username]));
  const vendorNameByVenueId = new Map(vendorRows.map((r) => [r.account_id, r.name]));

  let vetoedCount = 0;

  const derived = candidates.map((c) => {
    const urls = postsByCandidate.get(c.id) ?? [];
    const dates = urls
      .map((u) => evidenceByUrl.get(u)?.event_date)
      .filter((d): d is string => d != null)
      .map((d) => new Date(d));
    const rawCouples = urls
      .map((u) => evidenceByUrl.get(u)?.couple_guess)
      .filter((c2): c2 is string => c2 != null);

    const venue: VenueIdentity = {
      username: c.venue_account_id != null ? usernameByVenueId.get(c.venue_account_id) ?? null : null,
      vendorName: c.venue_account_id != null ? vendorNameByVenueId.get(c.venue_account_id) ?? null : null,
    };

    const normalizedCouples = rawCouples
      .map((raw) => normalizeAndVetoCouple(raw, venue, () => vetoedCount++))
      .filter((k): k is string => k != null);

    return {
      id: c.id,
      venueAccountId: c.venue_account_id,
      couple: mode(normalizedCouples),
      literalCouple: mode(rawCouples),
      minDate: dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null,
      maxDate: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null,
      anchorSource: c.venue_anchor_source,
      anchorConflict: c.venue_anchor_conflict ?? false,
      postUrls: urls,
    };
  });

  return { derived, vetoedCount };
}

async function main() {
  const argv = process.argv.slice(2);
  const execute = argv.includes("--execute");
  // Defaults to STRUCTURAL_CLUSTERING_VERSION ("structural-v2") unchanged; override to run this
  // same merge pass against a different structural provenance pool (e.g. pool A1's
  // "structural-v3-a1") without touching structural-v2's candidates -- see header comment.
  const clusteringVersion = argv.includes("--clustering-version")
    ? argv[argv.indexOf("--clustering-version") + 1]
    : STRUCTURAL_CLUSTERING_VERSION;
  const pool = getPool();

  const { derived, vetoedCount } = await loadDerivedCandidates(pool, clusteringVersion);
  const distributionBefore = histogram(derived.map((c) => c.postUrls.length));

  const { rows: createdRows } = await pool.query<{ candidate_id: number }>(
    `select candidate_id from jeremy_weddings_created`
  );
  const createdSet = new Set(createdRows.map((r) => r.candidate_id));

  const { rows: verdictRows } = await pool.query<{ candidate_id: number; count: string }>(
    `select v.candidate_id, count(*)::text as count
     from post_venue_verdicts v
     join jeremy_wedding_candidates c on c.id = v.candidate_id
     where c.clustering_version = $1
     group by v.candidate_id`,
    [clusteringVersion]
  );
  const verdictCountByCandidate = new Map(verdictRows.map((r) => [r.candidate_id, Number(r.count)]));

  // The NORMALIZED (real) plan.
  const { groups: mergeGroups, rejectedDateSpan: groupsRejectedDateSpan, skippedAlreadyCreated: groupsSkippedAlreadyCreated } =
    buildMergeGroups(derived, (c) => c.couple, createdSet);

  // The LITERAL (old, exact-string) plan, held to the exact same gates -- comparison only, never
  // executed, never written anywhere.
  const { groups: literalGroups } = buildMergeGroups(derived, (c) => c.literalCouple, createdSet);
  const literalCandidatesAbsorbed = literalGroups.reduce((n, g) => n + g.absorbed.length, 0);
  const literalPostsMoved = literalGroups.reduce((n, g) => n + g.absorbed.reduce((m, a) => m + a.postUrls.length, 0), 0);

  const candidatesAbsorbed = mergeGroups.reduce((n, g) => n + g.absorbed.length, 0);
  const postsMoved = mergeGroups.reduce((n, g) => n + g.absorbed.reduce((m, a) => m + a.postUrls.length, 0), 0);
  const verdictsMoved = mergeGroups.reduce(
    (n, g) => n + g.absorbed.reduce((m, a) => m + (verdictCountByCandidate.get(a.id) ?? 0), 0),
    0
  );
  const groupsWithDifferingAnchorSource = mergeGroups.filter((g) => g.distinctAnchorSources.size > 1).length;

  // Distribution AFTER: same per-candidate post counts, but every absorbed candidate's posts are
  // folded into its survivor's count, and absorbed candidates themselves disappear from the
  // population -- computed purely in-memory (dry-run never touches the DB for this).
  const absorbedToSurvivor = new Map<number, number>();
  for (const g of mergeGroups) for (const a of g.absorbed) absorbedToSurvivor.set(a.id, g.survivor.id);
  const postCountAfterByCandidate = new Map<number, number>();
  for (const c of derived) {
    if (absorbedToSurvivor.has(c.id)) continue; // folded into its survivor below
    postCountAfterByCandidate.set(c.id, c.postUrls.length);
  }
  for (const g of mergeGroups) {
    const current = postCountAfterByCandidate.get(g.survivor.id) ?? g.survivor.postUrls.length;
    const absorbedPosts = g.absorbed.reduce((n, a) => n + a.postUrls.length, 0);
    postCountAfterByCandidate.set(g.survivor.id, current + absorbedPosts);
  }
  const distributionAfter = histogram([...postCountAfterByCandidate.values()]);

  // Venue usernames for the top-15 printout.
  const venueIds = [...new Set(mergeGroups.map((g) => g.venueAccountId))];
  const { rows: venueRows } = venueIds.length
    ? await pool.query<{ id: number; username: string }>(`select id, username from accounts where id = any($1::bigint[])`, [venueIds])
    : { rows: [] as { id: number; username: string }[] };
  const usernameByVenueId = new Map(venueRows.map((r) => [r.id, r.username]));

  console.log(
    `[merge-structural-couple] ${execute ? "EXECUTE" : "DRY RUN"} -- clustering_version=${clusteringVersion} candidates=${derived.length}`
  );
  console.log(
    `[merge-structural-couple] NORMALIZED plan: groups=${mergeGroups.length} candidates-absorbed=${candidatesAbsorbed} posts-moved=${postsMoved} verdicts-moved=${verdictsMoved}`
  );
  console.log(
    `[merge-structural-couple] LITERAL (old, exact-string) plan for comparison: groups=${literalGroups.length} candidates-absorbed=${literalCandidatesAbsorbed} posts-moved=${literalPostsMoved}`
  );
  console.log(
    `[merge-structural-couple] normalization recovers: +${mergeGroups.length - literalGroups.length} groups, +${
      candidatesAbsorbed - literalCandidatesAbsorbed
    } candidates absorbed, +${postsMoved - literalPostsMoved} posts moved (vs literal string equality)`
  );
  console.log(`[merge-structural-couple] couple pairs rejected by the business-word/venue-substring veto=${vetoedCount}`);
  console.log(
    `[merge-structural-couple] groups rejected (date span > ${DATE_SPAN_LIMIT_DAYS}d)=${groupsRejectedDateSpan}, groups skipped (member already in jeremy_weddings_created)=${groupsSkippedAlreadyCreated.length}`
  );
  for (const g of groupsSkippedAlreadyCreated) {
    console.log(`  skipped ${g.key}: blocked by already-created candidate(s) [${g.blockedBy.join(", ")}]`);
  }
  console.log(
    `[merge-structural-couple] groups whose members disagree on venue_anchor_source=${groupsWithDifferingAnchorSource} (informational)`
  );

  const top15 = [...mergeGroups]
    .sort((a, b) => {
      const postsA = a.members.reduce((n, m) => n + m.postUrls.length, 0);
      const postsB = b.members.reduce((n, m) => n + m.postUrls.length, 0);
      return postsB - postsA;
    })
    .slice(0, 15);
  console.log(`[merge-structural-couple] top ${top15.length} largest merge groups (by post count):`);
  for (const g of top15) {
    const posts = g.members.reduce((n, m) => n + m.postUrls.length, 0);
    const venueUsername = usernameByVenueId.get(g.venueAccountId) ?? `account_id:${g.venueAccountId}`;
    console.log(
      `  venue=@${venueUsername} couple="${g.couple}" members=${g.members.length} posts=${posts} span_days=${g.spanDays} survivor=${g.survivor.id} absorbed=[${g.absorbed
        .map((a) => a.id)
        .join(", ")}]`
    );
  }

  console.log(`[merge-structural-couple] posts-per-candidate distribution, ${clusteringVersion}, BEFORE: ${JSON.stringify(distributionBefore)}`);
  console.log(`[merge-structural-couple] posts-per-candidate distribution, ${clusteringVersion}, AFTER (hypothetical): ${JSON.stringify(distributionAfter)}`);

  if (!execute) {
    console.log("[merge-structural-couple] DRY RUN -- no statement that writes to the database was executed");
    await closePool();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query(`
      create table if not exists structural_candidate_merges (
        id                    bigint generated always as identity primary key,
        survivor_candidate_id bigint not null,
        absorbed_candidate_id bigint not null,
        venue_account_id      bigint not null,
        couple                text not null,
        post_urls             text[] not null,
        reason                text not null,
        merged_at             timestamptz not null default now()
      )
    `);

    for (const g of mergeGroups) {
      const reason = `${clusteringVersion} same-venue+couple merge: venue_account_id=${g.venueAccountId} normalized_couple="${g.couple}" group span=${g.spanDays}d (<= ${DATE_SPAN_LIMIT_DAYS}d), survivor=${g.survivor.id}, ${g.members.length} candidates merged`;

      for (const absorbed of g.absorbed) {
        await client.query(
          `insert into structural_candidate_merges
             (survivor_candidate_id, absorbed_candidate_id, venue_account_id, couple, post_urls, reason)
           values ($1, $2, $3, $4, $5, $6)`,
          [g.survivor.id, absorbed.id, g.venueAccountId, g.couple, absorbed.postUrls, reason]
        );
      }

      const absorbedIds = g.absorbed.map((a) => a.id);

      await client.query(
        `update jeremy_wedding_candidate_posts set candidate_id = $1 where candidate_id = any($2::bigint[])`,
        [g.survivor.id, absorbedIds]
      );
      // A reviewer may already have verdicts on absorbed posts (the user is reviewing live at
      // /label/candidates) -- they must follow the post to the survivor, never be orphaned.
      await client.query(
        `update post_venue_verdicts set candidate_id = $1 where candidate_id = any($2::bigint[])`,
        [g.survivor.id, absorbedIds]
      );
      await client.query(`delete from jeremy_wedding_candidate_reconciliation where candidate_id = any($1::bigint[])`, [absorbedIds]);
      await client.query(`delete from jeremy_wedding_candidates where id = any($1::bigint[])`, [absorbedIds]);

      const combinedDates = g.members.flatMap((m) => [m.minDate, m.maxDate]).filter((d): d is Date => d != null);
      const newEventDateEst = combinedDates.length
        ? new Date(Math.min(...combinedDates.map((d) => d.getTime()))).toISOString().slice(0, 10)
        : null;
      const newAnchorConflict = g.members.some((m) => m.anchorConflict);

      await client.query(
        `update jeremy_wedding_candidates
         set event_date_est = coalesce($2, event_date_est), venue_anchor_conflict = $3, updated_at = now()
         where id = $1`,
        [g.survivor.id, newEventDateEst, newAnchorConflict]
      );
    }

    await client.query("commit");
    console.log(`[merge-structural-couple] COMMITTED -- ${mergeGroups.length} groups merged, ${candidatesAbsorbed} candidates absorbed`);
    console.log(
      "[merge-structural-couple] Re-run reconciliation now that candidate identities changed: bun run scripts/graph/runJeremyWeddingReconciliation.ts"
    );
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
