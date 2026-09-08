import { getPool } from "./db";

// Human-labeling UI (/label) data layer. See pipeline/schema.sql's "Human
// post labeling" section and apps/web/scripts/classify/buildLabelingQueue.ts
// for how label_queue gets built, and syncHumanLabelsToGoldenSet.ts for how
// human_post_labels eventually feeds golden_set.

// v2: widened from v1 (which was staging.instagram_posts only) to span
// public.posts too, per an explicit ask not to narrow to one corpus —
// "give me everything ... including the ones we are showing and the ones
// that are excluded ... so we receive value all over our funnel."
//
// venue_coverage_v2 (2026-09-06, D047 follow-on, buildVenueCoverageQueue.ts): replaces the
// general-sample "v2" queue as the active one per an explicit ask to stop stratified sampling
// and target labeling directly at coverage gaps — "give me the existing venues and posts from
// their feed or that they were tagged in, prioritizing ones with low coverage... I'd like more
// coverage for the venues at the bottom with only a few weddings or none." Posts (own-profile OR
// tagged-as-venue) connected to the 116 known Chicago venues with <=5 documented weddings,
// ordered by that venue's current wedding count ascending. v2 (this queue's own predecessor,
// `venue_coverage_v1`) shipped without a promise filter and wasted review time on obviously
// irrelevant content (birthday parties, cocktail hours, generic marketing) — corrected per the
// user's own feedback into a low-floor promise filter (caption mentions "wedding" OR has a
// parseable vendor-credit stack OR V3 said INCLUDE/REVIEW), deliberately NOT requiring the
// same high-score/couple-name bar these posts already failed to clear once (that's why their
// venue is low-coverage in the first place — requiring it again would re-exclude exactly what
// human judgment is for). 544 posts, 84 at zero-documented-weddings venues. Both the general
// "v2" queue (2,081 rows) and the promise-less `venue_coverage_v1` (4,077 rows) are left in
// place, not deleted — switch back by reverting this one constant.
// v3: tightened the "mentions wedding" signal after v2 let through generic multi-purpose-space
// marketing (see buildVenueCoverageQueue.ts's own comment for the exact examples/fix). 380 posts.
// venue_coverage_v3 is now fully labeled (user finished it, D047 follow-on, 2026-09-06) --
// superseded by beyond_include_v1 (buildBeyondIncludeQueue.ts): the venues-first sweep and
// every evidence source built this session only ever looked at posts V3 scored INCLUDE. This
// queue targets three specific pools that never got that treatment (V3 REVIEW never reviewed,
// V3 EXCLUDE but has a real 3+-role vendor stack, and score-6-11 posts V3 never even ran on but
// that have a stack) -- sized live, not guessed: 833 posts (515/284/34 across the three pools).
// Each row's `bucket` records which pool it came from so labeling results can later be grouped
// by pool to see which automated signal is actually predictive, not just to harvest weddings
// one at a time. venue_coverage_v3's 380 rows are left in place, not deleted.
// styled_shoot_v1 (D049, 2026-09-07, buildStyledShootQueue.ts): switched over at the user's
// explicit ask, with ~600 of beyond_include_v1's 833 still unlabeled -- deliberate, not a
// completion signal. Small and deliberate (80 posts: 7 LIKELY, 73 POSSIBLE), sized from
// post_styled_shoot_signal (pipeline/schema.sql) -- posts with a real 3+-role vendor stack AND a
// LIKELY/POSSIBLE styled-shoot signal, not already in golden_set/jeremy_wedding_candidate_posts/
// human_post_labels. Point is ground-truth-building for the styled-vs-real signal design (see
// docs/decisions.md D049), not volume harvesting -- the corpus doesn't have a large untapped pool
// here. beyond_include_v1's 833 rows are left in place, not deleted -- switch back by reverting
// this one constant once styled_shoot_v1 is done.
// Switched back to beyond_include_v1 (2026-09-07, same day): styled_shoot_v1 finished (80/80,
// synced, 7 weddings created -- D049). A styled_shoot_v1 round-2 pool doesn't exist yet
// (buildStyledShootQueue.ts --dry-run returned 0 new posts a few hours later -- nothing new
// accumulated) -- user asked for more to label in parallel while a separate coverage-gap mission
// runs, and beyond_include_v1 still has 486 real unlabeled rows sitting there. Switch to
// styled_shoot_v1 again if/when a round-2 pool is actually sized and non-empty.
// Switched to venue_corpus_mining_v1 (2026-09-07, same day, buildVenueCorpusMiningQueue.ts):
// beyond_include_v1 is now fully complete (833/833, D051 addendum). New queue generalizes
// venue_coverage_v3's (D047) own-profile + vendor-tagged staging.instagram_posts mining from
// just <=5-wedding venues to ALL 644 venue-role accounts -- the "use the 47k corpus" standing
// process (D052/D053, see tail_end_venue_coverage memory). 1,296 qualifying posts, already
// excludes anything in golden_set/human_post_labels (including venue_coverage_v3's own prior
// labels). beyond_include_v1's rows stay in place, not deleted.
export const CURRENT_QUEUE_VERSION = "venue_corpus_mining_v1";
// Single fixed labeler, no auth anywhere in this app today (see
// CLAUDE.md — the old password gate was deliberately deleted). Revisit if a
// second labeler is ever needed.
export const LABELED_BY = "jeremy";

export type HumanLabelDecision = "WEDDING" | "NOT_WEDDING" | "UNSURE" | "UNVIEWABLE" | "SKIP";

const VALID_DECISIONS: readonly HumanLabelDecision[] = [
  "WEDDING",
  "NOT_WEDDING",
  "UNSURE",
  "UNVIEWABLE",
  "SKIP",
];

export function isHumanLabelDecision(value: unknown): value is HumanLabelDecision {
  return typeof value === "string" && (VALID_DECISIONS as readonly string[]).includes(value);
}

export type QueueSource = "staging" | "public";

export interface QueueItem {
  post_url: string;
  bucket: string;
  rank: number;
  source: QueueSource;
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  location_tag: string | null;
  posted_at: string | null;
  likes_count: number | null;
  owner_username: string | null;
  image_url: string | null;
  images: string[] | null;
}

function arr(x: unknown): string[] {
  return Array.isArray(x) ? (x as string[]) : [];
}

// public.posts has no separate hashtags column (unlike
// staging.instagram_posts) -- the caption text already contains them
// inline, so extract for display parity rather than adding a schema
// column just for this cosmetic purpose.
function extractHashtags(caption: string | null): string[] {
  if (!caption) return [];
  return [...caption.matchAll(/#(\w+)/g)].map((m) => m[1]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toQueueItem(row: any): QueueItem {
  const caption: string | null = row.caption ?? null;
  const hashtags = arr(row.hashtags);
  return {
    post_url: row.post_url,
    bucket: row.bucket,
    rank: row.rank,
    source: row.source,
    caption,
    hashtags: hashtags.length > 0 ? hashtags : row.source === "public" ? extractHashtags(caption) : hashtags,
    mentions: arr(row.mentions),
    location_tag: row.location_tag,
    posted_at: row.posted_at,
    likes_count: row.likes_count,
    owner_username: row.owner_username,
    image_url: row.image_url,
    images: row.images ?? null,
  };
}

/**
 * The single source of truth for "what's next" — computed entirely
 * server-side so a page refresh needs zero client state to resume
 * correctly. Deliberately selects nothing from candidate_scores or
 * post_classification_runs: the model's opinion must never reach the
 * browser, so it can't anchor Jeremy's judgment even via devtools.
 */
export async function getQueueBatch(
  limit: number,
  opts: { queueVersion?: string; labeledBy?: string } = {}
): Promise<QueueItem[]> {
  const queueVersion = opts.queueVersion ?? CURRENT_QUEUE_VERSION;
  const labeledBy = opts.labeledBy ?? LABELED_BY;
  // Resolves each queued post from whichever corpus it came from
  // (lq.source) -- staging.instagram_posts (Jeremy's own-profile scrape)
  // or public.posts (Ben's venue_tagged crawl, joined to accounts for the
  // username public.posts doesn't store directly). See
  // buildLabelingQueue.ts's doc comment for why both corpora are sampled.
  const { rows } = await getPool().query(
    `select lq.post_url, lq.bucket, lq.rank, lq.source,
            coalesce(sp.caption_raw, p.caption) as caption,
            sp.hashtags, sp.mentions, sp.location_tag,
            coalesce(sp.post_timestamp, p.posted_at) as posted_at,
            coalesce(sp.likes_count, p.likes_count) as likes_count,
            coalesce(sp.owner_username, a.username::text) as owner_username,
            sp.image_url, sp.images
     from label_queue lq
     left join staging.instagram_posts sp on lq.source = 'staging' and sp.post_url = lq.post_url
     left join posts p on lq.source = 'public' and p.url = lq.post_url
     left join accounts a on lq.source = 'public' and a.id = p.owner_id
     where lq.queue_version = $1
       and not exists (
         select 1 from human_post_labels hpl
         where hpl.post_url = lq.post_url and hpl.labeled_by = $2
       )
     order by lq.rank
     limit $3`,
    [queueVersion, labeledBy, limit]
  );
  return rows.map(toQueueItem);
}

export async function getQueueProgress(
  opts: { queueVersion?: string; labeledBy?: string } = {}
): Promise<{ total: number; labeled: number }> {
  const queueVersion = opts.queueVersion ?? CURRENT_QUEUE_VERSION;
  const labeledBy = opts.labeledBy ?? LABELED_BY;
  const { rows } = await getPool().query<{ total: string; labeled: string }>(
    `select
       (select count(*) from label_queue where queue_version = $1) as total,
       (select count(*) from label_queue lq
          where lq.queue_version = $1
            and exists (
              select 1 from human_post_labels hpl
              where hpl.post_url = lq.post_url and hpl.labeled_by = $2
            )) as labeled`,
    [queueVersion, labeledBy]
  );
  return { total: Number(rows[0].total), labeled: Number(rows[0].labeled) };
}

/**
 * Records ONE append-only labeling observation. Never updates/overwrites a
 * prior row — relabeling the same post_url just inserts another row;
 * human_post_labels_current (a DISTINCT ON view) resolves to the latest.
 */
export async function recordLabel(
  post_url: string,
  decision: HumanLabelDecision,
  opts: { queueVersion?: string; labeledBy?: string; clientMs?: number | null; notes?: string | null } = {}
): Promise<void> {
  const queueVersion = opts.queueVersion ?? CURRENT_QUEUE_VERSION;
  const labeledBy = opts.labeledBy ?? LABELED_BY;
  await getPool().query(
    `insert into human_post_labels (post_url, queue_version, decision, labeled_by, client_ms, notes)
     values ($1, $2, $3, $4, $5, $6)`,
    [post_url, queueVersion, decision, labeledBy, opts.clientMs ?? null, opts.notes ?? null]
  );
}
