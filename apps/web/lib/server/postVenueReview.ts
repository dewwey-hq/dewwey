import type { PoolClient } from "pg";
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
  chicago_status: string | null;
  current_wedding_count: number;
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
}

export interface PostReviewDuplicateHint {
  matched_wedding_id: number;
  tier: "HIGH" | "AMBIGUOUS";
  date_delta_days: number | null;
  vendor_jaccard: number | null;
  venue_username: string | null;
  event_date_est: string | null;
}

export interface PostReviewQueueItem {
  post: PostReviewPost;
  venue: PostReviewVenue;
  group: PostReviewGroup;
  couple_guess: string | null;
  vendors: PostReviewVendorCredit[];
  other_venue_credits: PostReviewOtherVenueCredit[];
  duplicate_hint: PostReviewDuplicateHint | null;
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
         sp.mentions
       from jeremy_wedding_candidate_posts cp
       join jeremy_wedding_candidates jwc on jwc.id = cp.candidate_id
       join staging.instagram_posts sp on sp.post_url = cp.source_post_url
       where jwc.clustering_version = $1
     )
     select
       cpz.source_post_url, cpz.candidate_id, cpz.venue_account_id, cpz.chicago_status,
       cpz.venue_anchor_source, cpz.venue_anchor_conflict, cpz.group_index, cpz.group_size,
       cpz.caption, cpz.posted_at, cpz.location_tag, cpz.owner_username, cpz.mentions,
       a.username::text as venue_username,
       a.full_name as venue_full_name,
       (select v.name from vendors v where v.account_id = cpz.venue_account_id limit 1) as vendor_name,
       coalesce(vc.n, 0) as current_wedding_count
     from candidate_posts cpz
     left join accounts a on a.id = cpz.venue_account_id
     left join venue_counts vc on vc.venue_account_id = cpz.venue_account_id
     where not exists (
       select 1 from post_venue_verdicts_current pv
       where pv.post_url = cpz.source_post_url and pv.reviewed_by = $2
     )
       -- D055 (user, mid-review 2026-09-08: "filter out the posts that say bar or bat mitzvah"):
       -- a post naming a non-wedding event with NO wedding language is never served -- 43 of
       -- 4,743 queued posts at the time. Same rule now lives in the structural clustering
       -- eligibility; this keeps already-clustered posts out of the human's way. Posts that
       -- mention both (a venue's "weddings, galas, mitzvahs" marketing) still get reviewed.
       and not (
         cpz.caption ~* '\\y(mitzvah|quincea|sweet\\s*16|birthday|corporate|baby shower|bridal shower|graduation|anniversary party|retirement|gala|networking|fundraiser|holiday party|prom|conference|expo|trade show|open house)\\y'
         and cpz.caption !~* '\\y(wedding|bride|groom|newlywed|married)\\y'
       )
     order by
       case cpz.chicago_status
         when 'CHICAGO_CONFIRMED' then 0
         when 'CHICAGO_AMBIGUOUS' then 1
         when 'CHICAGO_NOT_CONFIRMED' then 2
         else 3
       end,
       coalesce(vc.n, 0) asc,
       cpz.candidate_id asc,
       cpz.posted_at asc nulls last,
       cpz.source_post_url asc
     limit $3`,
    [STRUCTURAL_CLUSTERING_VERSION, reviewedBy, limit]
  );

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
         post_url, line_no, handle, role
       from stack_extraction_entries
       where post_url = any($1::text[])
       order by post_url, line_no, handle, extracted_at desc
     )
     select l.post_url, coalesce(al.canonical_account_id, a.id) as account_id,
            a.username::text as username
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

  const vendorsByPost = new Map<string, PostReviewVendorCredit[]>();
  for (const r of vendorRows) {
    const list = vendorsByPost.get(r.post_url) ?? [];
    list.push({ role: r.role, username: r.username });
    vendorsByPost.set(r.post_url, list);
  }

  const otherVenuesByPost = new Map<string, Map<number, PostReviewOtherVenueCredit>>();
  for (const r of otherVenueRows) {
    const m = otherVenuesByPost.get(r.post_url) ?? new Map();
    m.set(r.account_id, { account_id: r.account_id, username: r.username });
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
    const otherVenues = [...(otherVenuesByPost.get(r.source_post_url)?.values() ?? [])].filter(
      (v) => v.account_id !== venueAccountId
    );
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
        chicago_status: r.chicago_status,
        current_wedding_count: Number(r.current_wedding_count),
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
    };
  });
}

export async function getPostReviewProgress(
  opts: { reviewedBy?: string } = {}
): Promise<{
  posts_total: number;
  posts_reviewed: number;
  candidates_total: number;
  candidates_complete: number;
  by_verdict: Record<string, number>;
}> {
  const reviewedBy = opts.reviewedBy ?? LABELED_BY;
  const pool = getPool();

  const { rows } = await pool.query<{
    posts_total: string;
    posts_reviewed: string;
    candidates_total: string;
    candidates_complete: string;
  }>(
    `with cv as (
       select cp.source_post_url
       from jeremy_wedding_candidate_posts cp
       join jeremy_wedding_candidates jwc on jwc.id = cp.candidate_id
       where jwc.clustering_version = $1
     )
     select
       (select count(*) from cv) as posts_total,
       (select count(*) from cv
          where exists (
            select 1 from post_venue_verdicts_current pv
            where pv.post_url = cv.source_post_url and pv.reviewed_by = $2
          )) as posts_reviewed,
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
