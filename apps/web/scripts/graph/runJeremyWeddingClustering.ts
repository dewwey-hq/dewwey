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
 * Usage (from apps/web):
 *   bun run scripts/graph/runJeremyWeddingClustering.ts
 *   bun run scripts/graph/runJeremyWeddingClustering.ts --evidence-source human_confirmed
 *   bun run scripts/graph/runJeremyWeddingClustering.ts --evidence-source venue_couple_signal
 *   bun run scripts/graph/runJeremyWeddingClustering.ts --evidence-source venue_inline_mention
 */
import { getPool, closePool } from "../classify/db";
import { effectiveDate, daysBetween, jaccard } from "./clusteringUtils";

export const CLUSTERING_VERSION = "jeremy-cluster-v1";
export const HUMAN_CONFIRMED_CLUSTERING_VERSION = "human-confirmed-v1";
export const VENUE_COUPLE_SIGNAL_CLUSTERING_VERSION = "venue-couple-signal-v1";
export const VENUE_INLINE_MENTION_CLUSTERING_VERSION = "venue-inline-mention-v1";
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
}

interface CandidateState {
  id: number;
  venueAccountId: number | null;
  eventDateEst: Date | null;
  vendorKeys: Set<string>; // "accountId:role"
  postDates: Date[]; // effective dates of all attached posts, for recomputing the earliest
}

type EvidenceSource = "v3" | "human_confirmed" | "venue_couple_signal" | "venue_inline_mention";
const VALID_SOURCES: EvidenceSource[] = ["v3", "human_confirmed", "venue_couple_signal", "venue_inline_mention"];

function parseArgs() {
  const a = process.argv.slice(2);
  const evidenceSource = a.includes("--evidence-source")
    ? a[a.indexOf("--evidence-source") + 1]
    : "v3";
  if (!VALID_SOURCES.includes(evidenceSource as EvidenceSource)) {
    throw new Error(`--evidence-source must be one of ${VALID_SOURCES.join(", ")}, got "${evidenceSource}"`);
  }
  return { evidenceSource: evidenceSource as EvidenceSource };
}

const CLUSTERING_VERSION_BY_SOURCE: Record<EvidenceSource, string> = {
  v3: CLUSTERING_VERSION,
  human_confirmed: HUMAN_CONFIRMED_CLUSTERING_VERSION,
  venue_couple_signal: VENUE_COUPLE_SIGNAL_CLUSTERING_VERSION,
  venue_inline_mention: VENUE_INLINE_MENTION_CLUSTERING_VERSION,
};
const EVIDENCE_VIEW_BY_SOURCE: Record<EvidenceSource, string> = {
  v3: "jeremy_post_vendor_evidence",
  human_confirmed: "human_confirmed_post_vendor_evidence",
  venue_couple_signal: "venue_couple_signal_post_vendor_evidence",
  venue_inline_mention: "venue_inline_mention_post_vendor_evidence",
};

async function main() {
  const { evidenceSource } = parseArgs();
  const clusteringVersion = CLUSTERING_VERSION_BY_SOURCE[evidenceSource];
  const evidenceView = EVIDENCE_VIEW_BY_SOURCE[evidenceSource];
  const pool = getPool();

  // Fetch the (moderately expensive — a per-row lateral join) evidence view exactly ONCE.
  // Referencing it twice in a single SQL statement (once directly, once in a subquery) made
  // Postgres's planner re-evaluate it combinatorially and blow through the statement timeout
  // (verified directly: the equivalent SQL-only query timed out at 2 minutes even via psql;
  // fetching it once and doing the grouping in JS runs in under a second).
  const { rows: evidence } = await pool.query<EvidenceRow>(
    `select source_post_url, account_id, role from ${evidenceView}`
  );
  const evidenceByPost = new Map<string, EvidenceRow[]>();
  for (const e of evidence) {
    if (!evidenceByPost.has(e.source_post_url)) evidenceByPost.set(e.source_post_url, []);
    evidenceByPost.get(e.source_post_url)!.push(e);
  }
  const eligiblePostUrls = [...evidenceByPost.entries()]
    .filter(([, rows]) => new Set(rows.map((r) => r.role)).size >= 3)
    .map(([url]) => url);

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
          // Most human-confirmed/venue-couple-signal posts never had a V3 run -- source
          // posted_at directly from the corpus table instead. No event_date/
          // event_date_confidence available here (only V3 extracts those);
          // effectiveDate() falls back to posted_at cleanly.
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

  // Deterministic order: effective date ascending (nulls last), then post_url — required for
  // true idempotency (an unordered pass could let a borderline Jaccard case land differently).
  const sortable = dedupedPosts
    .filter((p) => !alreadyClusteredSet.has(p.source_post_url))
    .map((p) => ({ p, date: effectiveDate(p) }))
    .sort((a, b) => {
      if (a.date && b.date) return a.date.getTime() - b.date.getTime() || a.p.source_post_url.localeCompare(b.p.source_post_url);
      if (a.date) return -1;
      if (b.date) return 1;
      return a.p.source_post_url.localeCompare(b.p.source_post_url);
    });

  console.log(
    `[jeremy-cluster] evidence-source=${evidenceSource} version=${clusteringVersion} clustering-eligible=${eligiblePostUrls.length} already-clustered=${alreadyClusteredSet.size} to-process=${sortable.length}`
  );

  // Load existing candidates fresh (match-upsert target).
  const { rows: existingCandidates } = await pool.query<{
    id: number;
    venue_account_id: number | null;
    event_date_est: string | null;
  }>(`select id, venue_account_id, event_date_est::text as event_date_est from jeremy_wedding_candidates where clustering_version = $1`, [
    clusteringVersion,
  ]);
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
      },
    ])
  );

  let attached = 0;
  let created = 0;

  for (const { p, date } of sortable) {
    const postEvidence = evidenceByPost.get(p.source_post_url) ?? [];
    const vendorKeys = new Set(postEvidence.map((e) => `${e.account_id}:${e.role}`));
    const venueEvidence = postEvidence.find((e) => e.role === "venue");

    let matched: CandidateState | null = null;
    if (date) {
      for (const c of candidates.values()) {
        if (!c.eventDateEst) continue;
        if (daysBetween(date, c.eventDateEst) > DATE_WINDOW_DAYS) continue;
        if (jaccard(vendorKeys, c.vendorKeys) > JACCARD_THRESHOLD) {
          matched = c;
          break;
        }
      }
    }

    if (matched) {
      await pool.query(`insert into jeremy_wedding_candidate_posts (source_post_url, candidate_id) values ($1,$2)`, [
        p.source_post_url,
        matched.id,
      ]);
      matched.postDates.push(date!);
      const earliest = matched.postDates.reduce((a, b) => (a < b ? a : b));
      if (!matched.venueAccountId && venueEvidence) matched.venueAccountId = venueEvidence.account_id;
      matched.eventDateEst = earliest;
      for (const k of vendorKeys) matched.vendorKeys.add(k);
      await pool.query(
        `update jeremy_wedding_candidates set venue_account_id = coalesce(venue_account_id, $2), event_date_est = $3, updated_at = now() where id = $1`,
        [matched.id, matched.venueAccountId, earliest.toISOString().slice(0, 10)]
      );
      attached++;
    } else {
      const { rows: inserted } = await pool.query<{ id: number }>(
        `insert into jeremy_wedding_candidates (clustering_version, venue_account_id, event_date_est)
         values ($1,$2,$3) returning id`,
        [clusteringVersion, venueEvidence?.account_id ?? null, date ? date.toISOString().slice(0, 10) : null]
      );
      const id = inserted[0].id;
      await pool.query(`insert into jeremy_wedding_candidate_posts (source_post_url, candidate_id) values ($1,$2)`, [
        p.source_post_url,
        id,
      ]);
      candidates.set(id, {
        id,
        venueAccountId: venueEvidence?.account_id ?? null,
        eventDateEst: date,
        vendorKeys,
        postDates: date ? [date] : [],
      });
      created++;
    }
  }

  console.log(`[jeremy-cluster] attached ${attached} posts to existing candidates, created ${created} new candidates`);

  if (evidenceSource === "human_confirmed" || evidenceSource === "venue_couple_signal" || evidenceSource === "venue_inline_mention") {
    // Explicit tri-state Chicago check -- a human confirming "real wedding" (or a venue's own
    // couple-signal post) says nothing on its own about geography. Only
    // account_locations.in_metro=true OR vendors.city='Chicago' (real, verified signals) counts
    // as confirmed; an explicit in_metro=false is a real negative; anything else (no row, null,
    // no venue resolved at all) is AMBIGUOUS, never guessed either direction. vendors.city is
    // included here (unlike the human_confirmed-only version of this check) because this
    // evidence source's whole population is already scoped to vendors.city='Chicago' authors —
    // but the resolved venue_account_id can still differ from the author (a caption crediting a
    // different "Venue:" account), so this re-checks rather than assumes.
    const { rows: toCheck } = await pool.query<{ id: number; venue_account_id: number | null }>(
      `select id, venue_account_id from jeremy_wedding_candidates where clustering_version = $1`,
      [clusteringVersion]
    );
    const venueIds = toCheck.map((c) => c.venue_account_id).filter((id): id is number => id != null);
    const { rows: locations } = await pool.query<{ account_id: number; in_metro: boolean | null }>(
      `select account_id, in_metro from account_locations where account_id = any($1::bigint[])`,
      [venueIds]
    );
    const inMetroByAccount = new Map(locations.map((l) => [l.account_id, l.in_metro]));
    if (evidenceSource === "venue_couple_signal" || evidenceSource === "venue_inline_mention") {
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
      await pool.query(`update jeremy_wedding_candidates set chicago_status = $2 where id = $1`, [c.id, status]);
    }
    console.log(
      `[jeremy-cluster] chicago_status resolved for ${toCheck.length} ${evidenceSource} candidates: confirmed=${confirmed} not_confirmed=${notConfirmed} ambiguous=${ambiguous}`
    );
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
