/**
 * Clusters Jeremy-sourced evidence (jeremy_post_vendor_evidence) into
 * jeremy_wedding_candidates — same conceptual algorithm as Ben's
 * phase_dedup() (Jaccard vendor-set overlap + date proximity), but as
 * match-upsert against a table this workstream owns (never truncated),
 * instead of truncate-rebuild. See docs/engineering/graph-strengthening/
 * ingestion-design.md for the full reasoning.
 *
 * Idempotent: a post already in jeremy_wedding_candidate_posts is skipped
 * entirely on rerun — already-clustered posts are never reconsidered in V1
 * (a named non-goal, not an oversight).
 *
 * Usage (from apps/web): bun run scripts/graph/runJeremyWeddingClustering.ts
 */
import { getPool, closePool } from "../classify/db";
import { effectiveDate, daysBetween, jaccard } from "./clusteringUtils";

export const CLUSTERING_VERSION = "jeremy-cluster-v1";
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

async function main() {
  const pool = getPool();

  // Fetch the (moderately expensive — a per-row lateral join) evidence view exactly ONCE.
  // Referencing it twice in a single SQL statement (once directly, once in a subquery) made
  // Postgres's planner re-evaluate it combinatorially and blow through the statement timeout
  // (verified directly: the equivalent SQL-only query timed out at 2 minutes even via psql;
  // fetching it once and doing the grouping in JS runs in under a second).
  const { rows: evidence } = await pool.query<EvidenceRow>(
    `select source_post_url, account_id, role from jeremy_post_vendor_evidence`
  );
  const evidenceByPost = new Map<string, EvidenceRow[]>();
  for (const e of evidence) {
    if (!evidenceByPost.has(e.source_post_url)) evidenceByPost.set(e.source_post_url, []);
    evidenceByPost.get(e.source_post_url)!.push(e);
  }
  const eligiblePostUrls = [...evidenceByPost.entries()]
    .filter(([, rows]) => new Set(rows.map((r) => r.role)).size >= 3)
    .map(([url]) => url);

  const { rows: posts } = await pool.query<PostRow>(
    `select post_url as source_post_url, posted_at::text as posted_at, event_date, event_date_confidence
     from post_classification_runs
     where classifier_version = 'v3' and post_url = any($1::text[])
     order by post_url, classified_at desc`,
    [eligiblePostUrls]
  );
  // distinct on post_url, keeping the latest classified_at row (query above is pre-sorted for this)
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
    `[jeremy-cluster] version=${CLUSTERING_VERSION} clustering-eligible=${eligiblePostUrls.length} already-clustered=${alreadyClusteredSet.size} to-process=${sortable.length}`
  );

  // Load existing candidates fresh (match-upsert target).
  const { rows: existingCandidates } = await pool.query<{
    id: number;
    venue_account_id: number | null;
    event_date_est: string | null;
  }>(`select id, venue_account_id, event_date_est::text as event_date_est from jeremy_wedding_candidates where clustering_version = $1`, [
    CLUSTERING_VERSION,
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
        [CLUSTERING_VERSION, venueEvidence?.account_id ?? null, date ? date.toISOString().slice(0, 10) : null]
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

  console.log(`[jeremy-cluster] DONE — attached ${attached} posts to existing candidates, created ${created} new candidates`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
