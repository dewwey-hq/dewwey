import { getPool } from "./db";
import { LABELED_BY } from "./labeling";
import { STRUCTURAL_CLUSTERING_VERSION } from "./structuralVersion";

// Wedding-CANDIDATE-level human review (D055 Phase 1 step 8). Backs /label/candidates. Reads
// jeremy_wedding_candidates / jeremy_wedding_candidate_posts under clustering_version=
// 'structural-v1' -- READ ONLY, a background clustering job may still be inserting into those
// two tables concurrently, so every query here is a plain select, never a write. The only write
// surface in this file is candidate_review_decisions (append-only, see pipeline/schema.sql) and
// the human_post_labels rows recordCandidateDecision() fans out per post -- both additive,
// mirroring lib/server/labeling.ts's recordLabel().
//
// Anti-anchoring rule (same as labeling.ts): nothing here ever selects from candidate_scores,
// post_classification_runs, or any V3 decision -- the model's opinion must never reach the
// browser, so it can't anchor the reviewer's judgment even via devtools.

export { STRUCTURAL_CLUSTERING_VERSION };

export type CandidateDecision = "CONFIRM" | "WRONG_VENUE" | "NOT_WEDDING" | "DUPLICATE" | "UNSURE" | "SKIP";

const VALID_DECISIONS: readonly CandidateDecision[] = [
  "CONFIRM",
  "WRONG_VENUE",
  "NOT_WEDDING",
  "DUPLICATE",
  "UNSURE",
  "SKIP",
];

export function isCandidateDecision(value: unknown): value is CandidateDecision {
  return typeof value === "string" && (VALID_DECISIONS as readonly string[]).includes(value);
}

// Maps a candidate-level decision to the post-level human_post_labels decision it implies, so
// confirmed candidates flow into golden_set (via the existing syncHumanLabelsToGoldenSet.ts,
// unchanged) exactly the way a post-level WEDDING label would. DUPLICATE and WRONG_VENUE are
// still real, documented weddings -- just already-documented or at a different venue -- so both
// map to WEDDING; the venue correction itself lives on the decision row, not on
// human_post_labels (which has no venue column). SKIP produces no label rows at all, same as the
// post-level UI's Skip.
const DECISION_TO_POST_LABEL: Record<CandidateDecision, "WEDDING" | "NOT_WEDDING" | "UNSURE" | null> = {
  CONFIRM: "WEDDING",
  WRONG_VENUE: "WEDDING",
  NOT_WEDDING: "NOT_WEDDING",
  DUPLICATE: "WEDDING",
  UNSURE: "UNSURE",
  SKIP: null,
};

export const CANDIDATE_REVIEW_QUEUE_VERSION = "candidate_review_v1";

export interface CandidatePost {
  post_url: string;
  owner_username: string | null;
  caption: string | null;
  posted_at: string | null;
  location_tag: string | null;
  mentions: string[];
}

export interface CandidateVendor {
  role: string;
  username: string;
}

export interface OtherVenueCredit {
  account_id: number;
  username: string;
}

export interface DuplicateHint {
  matched_wedding_id: number;
  tier: "HIGH" | "AMBIGUOUS";
  date_delta_days: number | null;
  vendor_jaccard: number | null;
  venue_username: string | null;
  event_date_est: string | null;
}

export interface CandidateQueueItem {
  candidate_id: number;
  venue: {
    account_id: number | null;
    username: string | null;
    full_name: string | null;
    vendor_name: string | null;
    venue_anchor_source: string | null;
    venue_anchor_conflict: boolean;
    chicago_status: string | null;
    current_wedding_count: number;
  };
  event_date_est: string | null;
  posts: CandidatePost[];
  vendors: CandidateVendor[];
  couple_guess: string | null;
  duplicate_hint: DuplicateHint | null;
  other_venue_credits: OtherVenueCredit[];
}

function arr(x: unknown): string[] {
  return Array.isArray(x) ? (x as string[]) : [];
}

// First "Firstname & Firstname"/"Firstname and Firstname"/"Firstname + Firstname"-shaped match
// across a candidate's posts' captions, in post order -- a cheap couple-name hint for the
// reviewer, never treated as ground truth (it's regex, not extraction).
const COUPLE_GUESS_RE = /([A-Z][a-z]+ *(?:&|\+|and) *[A-Z][a-z]+)/;

function guessCouple(captions: (string | null)[]): string | null {
  for (const c of captions) {
    if (!c) continue;
    const m = c.match(COUPLE_GUESS_RE);
    if (m) return m[1];
  }
  return null;
}

/**
 * The candidate-level review queue, ordered per D055 step 8: CHICAGO_CONFIRMED candidates
 * first (most likely to be real, graph-ready Chicago weddings), then AMBIGUOUS, then
 * NOT_CONFIRMED (chicago_status is only ever null for a candidate whose venue never resolved --
 * shouldn't happen for structural-v1 given its eligibility floor requires a venue anchor, but
 * sorted last defensively rather than assumed away). Within a tier, the venue's current
 * documented-Chicago-wedding count ascending (0 first) -- reviewing candidates at
 * zero/low-coverage venues first is where a confirm buys the most new coverage. Then post count
 * desc (richer clusters first), then id for determinism.
 */
export async function getCandidateQueue(
  limit: number,
  opts: { reviewedBy?: string } = {}
): Promise<CandidateQueueItem[]> {
  const reviewedBy = opts.reviewedBy ?? LABELED_BY;
  const pool = getPool();

  const { rows: candidateRows } = await pool.query(
    `with venue_counts as (
       -- Alias-aware: two IG handles for the same real venue must count as one venue's weddings,
       -- not fragment the count across both (same account_aliases discipline used everywhere
       -- else in this pipeline).
       select coalesce(al.canonical_account_id, wv.account_id) as venue_account_id,
              count(distinct wv.wedding_id) as n
       from wedding_vendors wv
       join weddings w on w.id = wv.wedding_id and w.is_chicago = true
       left join account_aliases al on al.alias_account_id = wv.account_id
       where wv.role = 'venue'
       group by 1
     ),
     post_counts as (
       select candidate_id, count(*) as n
       from jeremy_wedding_candidate_posts
       group by candidate_id
     )
     select
       jwc.id as candidate_id,
       jwc.venue_account_id,
       jwc.event_date_est::text as event_date_est,
       jwc.venue_anchor_source,
       coalesce(jwc.venue_anchor_conflict, false) as venue_anchor_conflict,
       jwc.chicago_status,
       a.username::text as venue_username,
       a.full_name as venue_full_name,
       (select v.name from vendors v where v.account_id = jwc.venue_account_id limit 1) as vendor_name,
       coalesce(vc.n, 0) as current_wedding_count,
       coalesce(pc.n, 0) as post_count
     from jeremy_wedding_candidates jwc
     left join accounts a on a.id = jwc.venue_account_id
     left join venue_counts vc on vc.venue_account_id = jwc.venue_account_id
     left join post_counts pc on pc.candidate_id = jwc.id
     where jwc.clustering_version = $1
       and not exists (
         select 1 from candidate_review_decisions_current crd
         where crd.candidate_id = jwc.id and crd.reviewed_by = $2
       )
     order by
       case jwc.chicago_status
         when 'CHICAGO_CONFIRMED' then 0
         when 'CHICAGO_AMBIGUOUS' then 1
         when 'CHICAGO_NOT_CONFIRMED' then 2
         else 3
       end,
       coalesce(vc.n, 0) asc,
       coalesce(pc.n, 0) desc,
       jwc.id asc
     limit $3`,
    [STRUCTURAL_CLUSTERING_VERSION, reviewedBy, limit]
  );

  if (candidateRows.length === 0) return [];
  const candidateIds = candidateRows.map((r) => r.candidate_id as number);

  // Batched, not N+1: posts/vendors/reconciliation/other-venue-credits for every candidate in
  // this page, fetched in four queries total and grouped in JS.
  const { rows: postRows } = await pool.query(
    `select cp.candidate_id, sp.post_url, sp.owner_username, sp.caption_raw as caption,
            sp.post_timestamp as posted_at, sp.location_tag, sp.mentions
     from jeremy_wedding_candidate_posts cp
     join staging.instagram_posts sp on sp.post_url = cp.source_post_url
     where cp.candidate_id = any($1::bigint[])
     order by cp.candidate_id, sp.post_timestamp asc nulls last`,
    [candidateIds]
  );

  const { rows: vendorRows } = await pool.query(
    `select cp.candidate_id, spve.account_id, a.username::text as username, spve.role
     from jeremy_wedding_candidate_posts cp
     join structural_post_vendor_evidence spve on spve.source_post_url = cp.source_post_url
     join accounts a on a.id = spve.account_id
     where cp.candidate_id = any($1::bigint[]) and spve.role <> 'venue'`,
    [candidateIds]
  );

  // Any OTHER venue-role account credited on this candidate's posts, alias-resolved -- the
  // "VENUE CONFLICT" detail. Reads stack_extraction_entries directly (latest per
  // (post_url,line_no,handle), same resolution as every evidence view) rather than the
  // structural view, which only ever emits its ONE chosen anchor per post -- exactly the
  // disagreeing credits this needs to surface are the ones that view already discarded.
  const { rows: otherVenueRows } = await pool.query(
    `with latest as (
       select distinct on (post_url, line_no, handle)
         post_url, line_no, handle, role
       from stack_extraction_entries
       order by post_url, line_no, handle, extracted_at desc
     )
     select distinct cp.candidate_id, coalesce(al.canonical_account_id, a.id) as account_id,
            a.username::text as username
     from jeremy_wedding_candidate_posts cp
     join latest l on l.post_url = cp.source_post_url and l.role = 'venue'
     join accounts a on lower(a.username::text) = l.handle
     left join account_aliases al on al.alias_account_id = a.id
     where cp.candidate_id = any($1::bigint[])`,
    [candidateIds]
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

  const postsByCandidate = new Map<number, CandidatePost[]>();
  const captionsByCandidate = new Map<number, (string | null)[]>();
  for (const r of postRows) {
    const cid = r.candidate_id as number;
    if (!postsByCandidate.has(cid)) postsByCandidate.set(cid, []);
    if (!captionsByCandidate.has(cid)) captionsByCandidate.set(cid, []);
    postsByCandidate.get(cid)!.push({
      post_url: r.post_url,
      owner_username: r.owner_username,
      caption: r.caption,
      posted_at: r.posted_at,
      location_tag: r.location_tag,
      mentions: arr(r.mentions),
    });
    captionsByCandidate.get(cid)!.push(r.caption ?? null);
  }

  const vendorsByCandidate = new Map<number, Map<string, CandidateVendor>>();
  for (const r of vendorRows) {
    const cid = r.candidate_id as number;
    if (!vendorsByCandidate.has(cid)) vendorsByCandidate.set(cid, new Map());
    const key = `${r.account_id}:${r.role}`;
    vendorsByCandidate.get(cid)!.set(key, { role: r.role, username: r.username });
  }

  const otherVenuesByCandidate = new Map<number, Map<number, OtherVenueCredit>>();
  for (const r of otherVenueRows) {
    const cid = r.candidate_id as number;
    if (!otherVenuesByCandidate.has(cid)) otherVenuesByCandidate.set(cid, new Map());
    otherVenuesByCandidate.get(cid)!.set(r.account_id, { account_id: r.account_id, username: r.username });
  }

  const reconByCandidate = new Map<number, DuplicateHint>();
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

  return candidateRows.map((r) => {
    const cid = r.candidate_id as number;
    const venueAccountId: number | null = r.venue_account_id;
    const otherVenues = [...(otherVenuesByCandidate.get(cid)?.values() ?? [])].filter(
      (v) => v.account_id !== venueAccountId
    );
    return {
      candidate_id: cid,
      venue: {
        account_id: venueAccountId,
        username: r.venue_username,
        full_name: r.venue_full_name,
        vendor_name: r.vendor_name,
        venue_anchor_source: r.venue_anchor_source,
        venue_anchor_conflict: r.venue_anchor_conflict,
        chicago_status: r.chicago_status,
        current_wedding_count: Number(r.current_wedding_count),
      },
      event_date_est: r.event_date_est,
      posts: postsByCandidate.get(cid) ?? [],
      vendors: [...(vendorsByCandidate.get(cid)?.values() ?? [])],
      couple_guess: guessCouple(captionsByCandidate.get(cid) ?? []),
      duplicate_hint: reconByCandidate.get(cid) ?? null,
      other_venue_credits: otherVenues,
    };
  });
}

export async function getCandidateProgress(
  opts: { reviewedBy?: string } = {}
): Promise<{ total: number; reviewed: number; by_decision: Record<string, number> }> {
  const reviewedBy = opts.reviewedBy ?? LABELED_BY;
  const pool = getPool();

  const { rows: totalRows } = await pool.query<{ total: string }>(
    `select count(*) as total from jeremy_wedding_candidates where clustering_version = $1`,
    [STRUCTURAL_CLUSTERING_VERSION]
  );
  const { rows: decisionRows } = await pool.query<{ decision: string; n: string }>(
    `select crd.decision, count(*) as n
     from candidate_review_decisions_current crd
     join jeremy_wedding_candidates jwc on jwc.id = crd.candidate_id
     where jwc.clustering_version = $1 and crd.reviewed_by = $2
     group by crd.decision`,
    [STRUCTURAL_CLUSTERING_VERSION, reviewedBy]
  );

  const byDecision: Record<string, number> = {};
  let reviewed = 0;
  for (const r of decisionRows) {
    byDecision[r.decision] = Number(r.n);
    reviewed += Number(r.n);
  }

  return { total: Number(totalRows[0].total), reviewed, by_decision: byDecision };
}

/**
 * Records ONE append-only candidate review decision, then fans out a human_post_labels row
 * (queue_version='candidate_review_v1') for every post attached to the candidate -- this is the
 * ONLY reason confirmed candidates reach golden_set: syncHumanLabelsToGoldenSet.ts already reads
 * human_post_labels_current for ANY queue_version, unchanged. Both writes happen in one
 * transaction so a decision never exists without its post labels (or vice versa).
 */
export async function recordCandidateDecision(
  candidateId: number,
  decision: CandidateDecision,
  opts: {
    correctedVenueUsername?: string | null;
    duplicateOfWeddingId?: number | null;
    notes?: string | null;
    reviewedBy?: string;
    clientMs?: number | null;
  } = {}
): Promise<void> {
  const reviewedBy = opts.reviewedBy ?? LABELED_BY;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    let correctedVenueAccountId: number | null = null;
    if (opts.correctedVenueUsername) {
      const { rows } = await client.query<{ id: number; canonical_account_id: number | null }>(
        `select a.id, al.canonical_account_id
         from accounts a
         left join account_aliases al on al.alias_account_id = a.id
         where a.username = $1::citext`,
        [opts.correctedVenueUsername]
      );
      if (rows.length === 0) {
        throw new Error(`corrected_venue_username "${opts.correctedVenueUsername}" not found in accounts`);
      }
      correctedVenueAccountId = rows[0].canonical_account_id ?? rows[0].id;
    }

    await client.query(
      `insert into candidate_review_decisions
         (candidate_id, decision, corrected_venue_account_id, duplicate_of_wedding_id, notes, reviewed_by, client_ms)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        candidateId,
        decision,
        correctedVenueAccountId,
        opts.duplicateOfWeddingId ?? null,
        opts.notes ?? null,
        reviewedBy,
        opts.clientMs ?? null,
      ]
    );

    const postLabel = DECISION_TO_POST_LABEL[decision];
    if (postLabel) {
      const { rows: posts } = await client.query<{ source_post_url: string }>(
        `select source_post_url from jeremy_wedding_candidate_posts where candidate_id = $1`,
        [candidateId]
      );
      for (const p of posts) {
        await client.query(
          `insert into human_post_labels (post_url, queue_version, decision, labeled_by, client_ms, notes)
           values ($1, $2, $3, $4, $5, $6)`,
          [p.source_post_url, CANDIDATE_REVIEW_QUEUE_VERSION, postLabel, reviewedBy, opts.clientMs ?? null, opts.notes ?? null]
        );
      }
    }

    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
