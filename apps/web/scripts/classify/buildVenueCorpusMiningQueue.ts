/**
 * "Mine the 47k corpus for venues" queue (tail-end coverage mission, 2026-09-07 follow-on --
 * see docs/decisions.md D052/D053 and the tail-end-venue-coverage memory file).
 *
 * `venue_coverage_v3` (D047) already mines staging.instagram_posts for venues with <=5
 * documented weddings. This queue generalizes that same idea (own-profile posts +
 * vendor-credited "tagged" posts, both from staging.instagram_posts) to ALL 644 venue-role
 * accounts, not just the low-coverage ones -- sized live before building: of 149 venues with
 * unimported authored content, 108 already have SOME documented coverage and would still gain
 * more from this pass, not just the 41 currently invisible. Scoping to "zero-coverage only"
 * would leave most of the real opportunity on the table.
 *
 * Filter is tighter than v3's (a bare wedding-phrase-or-existing-stack-or-V3-decision check):
 * requires an actual stack-shaped credit line (a role label followed by `:`/`-`/`|`) AND a
 * specific wedding-event keyword AND the absence of an explicit non-wedding-event keyword
 * (quinceanera/birthday/corporate/baby or bridal shower/graduation). Sample-verified at high
 * precision before building this (58/58 and a 641-post sample both clean real wedding-credit
 * content) -- see the plan/decisions entry for the exact numbers.
 *
 * Deliberately excludes anything already in golden_set or already labeled (matches
 * buildVenueCoverageQueue.ts's own exclusion) -- ~24% of the raw qualifying pool turned out to
 * already be covered by venue_coverage_v3's own labeling, this only queues the genuinely new
 * remainder.
 *
 * bucket records both which pool a post came from (own/tagged) and whether its venue currently
 * has zero or some documented coverage, so a human's WEDDING/NOT_WEDDING verdict can later be
 * grouped to see which signal is most predictive -- same standing practice as every prior queue
 * this session.
 *
 * ROUND 2 (2026-09-07, same day): the user pushed back directly on round 1's precision --
 * "47k to 379 is too exclusionary... im okay looking at some potential junk in our 47k to drive
 * coverage... we want to have coverage." Round 1 required BOTH a stack-shaped credit line AND
 * an explicit wedding keyword; round 2 drops both requirements, keeping only the confirmed-
 * non-wedding-event exclusion, and scopes to the 70 accounts with <=5 documented Chicago
 * weddings (the same threshold `venue_coverage_v3`/D047 established as "low coverage") rather
 * than all 644 -- sized three options live before picking this one: fully unfiltered across all
 * 644 venues was ~12,500 posts (too much undifferentiated volume, mostly landing on venues that
 * don't need it); this middle option is ~4,670 (3,507 own + 1,163 tagged), 34 of the 70 venues
 * at zero coverage. Expect a materially lower WEDDING hit rate than round 1's tighter filter --
 * that's the accepted, explicit tradeoff, not a bug. Appends at continued `rank` values after
 * round 1's (idempotent via `on conflict do nothing`, so round 1's 379 rows and their ranks are
 * never touched by a re-run). bucket values are suffixed `_r2_low_coverage` to keep round 1 vs
 * round 2 precision comparable once labeling results come in.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/buildVenueCorpusMiningQueue.ts --dry-run
 *   bun run scripts/classify/buildVenueCorpusMiningQueue.ts
 */
import { getPool, closePool } from "./db";

export const VENUE_CORPUS_MINING_QUEUE_VERSION = "venue_corpus_mining_v1";

const STACK_SHAPE = "(venue|photographer|planner|florist|dj|videographer|caterer)\\s*[:|-]";
const WEDDING_KEYWORD = "\\y(wedding|bride|groom|reception|ceremony)\\y";
const NON_WEDDING_KEYWORD = "\\y(quincea|birthday|corporate|baby shower|bridal shower|graduation)\\y";
// Round 2's exclusion list is a bit broader than round 1's -- anniversary/retirement parties are
// real, common non-wedding event types that show up on a venue's own feed just as often as
// birthdays once the stack-shape/wedding-keyword filters that round 1 leaned on are dropped.
const ROUND2_NON_WEDDING_KEYWORD =
  "\\y(quincea|birthday|corporate|baby shower|bridal shower|graduation|anniversary party|retirement)\\y";
const ROUND2_MAX_WEDDINGS = 5;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();

  const { rows } = await pool.query<{
    post_url: string;
    bucket: string;
    n_weddings: number;
  }>(
    `with venue_accounts as (
       select distinct var.account_id, a.username,
         coalesce((
           select count(distinct wv.wedding_id) from wedding_vendors wv
           join weddings w on w.id = wv.wedding_id
           where wv.account_id = coalesce(aa.canonical_account_id, var.account_id) and w.is_chicago
         ), 0) as n_weddings
       from v_account_role var
       join accounts a on a.id = var.account_id
       left join account_aliases aa on aa.alias_account_id = var.account_id
       where var.role = 'venue'
         and not exists (select 1 from account_aliases where alias_account_id = var.account_id)
     ),
     own_posts as (
       select sp.post_url, va.n_weddings, 'own' as pool
       from staging.instagram_posts sp
       join venue_accounts va on lower(va.username::text) = lower(sp.owner_username)
     ),
     tagged_posts as (
       select e.source_post_url as post_url, va.n_weddings, 'tagged' as pool
       from jeremy_post_vendor_evidence e
       join venue_accounts va on va.account_id = e.account_id
       join staging.instagram_posts sp on sp.post_url = e.source_post_url
       where e.role = 'venue'
       union
       select e.source_post_url as post_url, va.n_weddings, 'tagged' as pool
       from human_confirmed_post_vendor_evidence e
       join venue_accounts va on va.account_id = e.account_id
       join staging.instagram_posts sp on sp.post_url = e.source_post_url
       where e.role = 'venue'
     ),
     all_posts as (
       select post_url, min(n_weddings) as n_weddings,
              min(pool) as pool -- 'own' < 'tagged' alphabetically; own-profile signal preferred when a post qualifies both ways
       from (select * from own_posts union all select * from tagged_posts) x
       group by post_url
     )
     select ap.post_url,
       ap.pool || '_' || (case when ap.n_weddings = 0 then 'zero_coverage' else 'has_coverage' end) as bucket,
       ap.n_weddings
     from all_posts ap
     join staging.instagram_posts sp on sp.post_url = ap.post_url
     where sp.caption_raw ~* '${STACK_SHAPE}'
       and sp.caption_raw ~* '${WEDDING_KEYWORD}'
       and sp.caption_raw !~* '${NON_WEDDING_KEYWORD}'
       and not exists (select 1 from golden_set gs where gs.post_url = ap.post_url)
       and not exists (select 1 from human_post_labels hpl where hpl.post_url = ap.post_url and hpl.labeled_by = 'jeremy')
       -- Bug found 2026-09-07 (user asked "did you check these are net new"): without this,
       -- 917 of 1,296 rows (71%) turned out to already exist in public.posts, every one of them
       -- already attached to a documented wedding via wedding_posts -- not new content, pure
       -- redundant re-labeling of weddings already on file. This exclusion was present in this
       -- session's own sizing queries but got dropped when the query was rewritten to mirror
       -- buildVenueCoverageQueue.ts's shape (which doesn't have it either -- unverified whether
       -- that queue has the same gap, see docs/decisions.md D053 addendum).
       and not exists (select 1 from posts p where p.url = ap.post_url)
     order by ap.n_weddings asc, ap.post_url asc`
  );

  console.log(`[venue-corpus-mining-queue] ${dryRun ? "DRY RUN — " : ""}pool=${rows.length} qualifying, unlabeled posts across all venue-role accounts`);
  const byBucket = new Map<string, number>();
  for (const r of rows) byBucket.set(r.bucket, (byBucket.get(r.bucket) ?? 0) + 1);
  console.log(`[venue-corpus-mining-queue] breakdown: ${[...byBucket.entries()].map(([b, c]) => `${b}:${c}`).join(", ")}`);

  if (dryRun) {
    await closePool();
    return;
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const res = await pool.query(
      `insert into label_queue (post_url, queue_version, bucket, source, rank)
       values ($1, $2, $3, 'staging', $4)
       on conflict (post_url, queue_version) do nothing`,
      [r.post_url, VENUE_CORPUS_MINING_QUEUE_VERSION, r.bucket, i + 1]
    );
    if (res.rowCount) inserted += res.rowCount;
  }
  console.log(`[venue-corpus-mining-queue] round 1: inserted ${inserted} rows under queue_version=${VENUE_CORPUS_MINING_QUEUE_VERSION}`);

  // ---- Round 2: loosened filter, scoped to low-coverage venues (see file doc comment) ----
  const { rows: round2Rows } = await pool.query<{
    post_url: string;
    bucket: string;
    n_weddings: number;
  }>(
    `with venue_accounts as (
       select distinct var.account_id, a.username,
         coalesce((
           select count(distinct wv.wedding_id) from wedding_vendors wv
           join weddings w on w.id = wv.wedding_id
           where wv.account_id = coalesce(aa.canonical_account_id, var.account_id) and w.is_chicago
         ), 0) as n_weddings
       from v_account_role var
       join accounts a on a.id = var.account_id
       left join account_aliases aa on aa.alias_account_id = var.account_id
       where var.role = 'venue'
         and not exists (select 1 from account_aliases where alias_account_id = var.account_id)
     ),
     low_coverage_venues as (
       select * from venue_accounts where n_weddings <= ${ROUND2_MAX_WEDDINGS}
     ),
     own_posts as (
       select sp.post_url, va.n_weddings, 'own' as pool
       from staging.instagram_posts sp
       join low_coverage_venues va on lower(va.username::text) = lower(sp.owner_username)
     ),
     tagged_posts as (
       select e.source_post_url as post_url, va.n_weddings, 'tagged' as pool
       from jeremy_post_vendor_evidence e
       join low_coverage_venues va on va.account_id = e.account_id
       join staging.instagram_posts sp on sp.post_url = e.source_post_url
       where e.role = 'venue'
       union
       select e.source_post_url as post_url, va.n_weddings, 'tagged' as pool
       from human_confirmed_post_vendor_evidence e
       join low_coverage_venues va on va.account_id = e.account_id
       join staging.instagram_posts sp on sp.post_url = e.source_post_url
       where e.role = 'venue'
     ),
     all_posts as (
       select post_url, min(n_weddings) as n_weddings, min(pool) as pool
       from (select * from own_posts union all select * from tagged_posts) x
       group by post_url
     )
     select ap.post_url,
       ap.pool || '_r2_low_coverage' as bucket,
       ap.n_weddings
     from all_posts ap
     join staging.instagram_posts sp on sp.post_url = ap.post_url
     where sp.caption_raw !~* '${ROUND2_NON_WEDDING_KEYWORD}'
       and not exists (select 1 from golden_set gs where gs.post_url = ap.post_url)
       and not exists (select 1 from human_post_labels hpl where hpl.post_url = ap.post_url and hpl.labeled_by = 'jeremy')
       and not exists (select 1 from posts p where p.url = ap.post_url)
     order by ap.n_weddings asc, ap.pool asc, ap.post_url asc`
  );

  console.log(`[venue-corpus-mining-queue] round 2: ${dryRun ? "DRY RUN — " : ""}pool=${round2Rows.length} qualifying posts across low-coverage (<=${ROUND2_MAX_WEDDINGS}) venues`);
  const byBucket2 = new Map<string, number>();
  for (const r of round2Rows) byBucket2.set(r.bucket, (byBucket2.get(r.bucket) ?? 0) + 1);
  console.log(`[venue-corpus-mining-queue] round 2 breakdown: ${[...byBucket2.entries()].map(([b, c]) => `${b}:${c}`).join(", ")}`);

  if (dryRun) {
    await closePool();
    return;
  }

  const { rows: maxRankRows } = await pool.query<{ max_rank: number | null }>(
    `select max(rank) as max_rank from label_queue where queue_version = $1`,
    [VENUE_CORPUS_MINING_QUEUE_VERSION]
  );
  let rank = (maxRankRows[0].max_rank ?? 0) + 1;
  let inserted2 = 0;
  for (const r of round2Rows) {
    const res = await pool.query(
      `insert into label_queue (post_url, queue_version, bucket, source, rank)
       values ($1, $2, $3, 'staging', $4)
       on conflict (post_url, queue_version) do nothing`,
      [r.post_url, VENUE_CORPUS_MINING_QUEUE_VERSION, r.bucket, rank]
    );
    if (res.rowCount) {
      inserted2 += res.rowCount;
      rank++;
    }
  }
  console.log(`[venue-corpus-mining-queue] round 2: inserted ${inserted2} rows under queue_version=${VENUE_CORPUS_MINING_QUEUE_VERSION}`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
