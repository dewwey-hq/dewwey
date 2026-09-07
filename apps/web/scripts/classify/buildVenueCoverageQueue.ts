/**
 * Replaces the general stratified-sample `/label` queue with a targeted campaign: posts
 * connected to KNOWN Chicago venues that have the LEAST documented-wedding coverage today
 * (0-5 `weddings` rows), so continued human labeling directly fills in the gaps the "v1 data
 * completion, venues-first" mission (D047) couldn't close automatically -- the explicit ask
 * ("I'd like more coverage for the venues at the bottom with only a few weddings or none...
 * use me to help label those").
 *
 * v2 (this version) adds a PROMISE filter after v1 shipped without one and wasted review time on
 * obviously-irrelevant content (cocktail hours, birthday parties, generic venue marketing) --
 * the user's own correction: "it'd be a waste of human time to just have me go through a bunch
 * of birthday posts or cocktail party... we should have this queue be an actual attempt of
 * maybe real weddings or stuff that looks promising." Deliberately NOT gated on already having
 * a high candidate_score or V3 INCLUDE or a couple-name pattern -- these venues are
 * low-coverage largely BECAUSE their content never scored well automatically, so requiring the
 * same bar again would just re-exclude exactly the posts human judgment exists to catch (the
 * user's own point: "these are low coverage first so likely they're in this situation because
 * they don't pass the first bar we set"). Instead a LOW floor: keep a post if it has ANY of --
 * (a) the caption mentions "wedding" anywhere, (b) it has a parseable vendor-credit-stack
 * (any stack_extraction_entries row, regardless of role count or couple name), or (c) V3 already
 * said INCLUDE or REVIEW (not a strict INCLUDE-only bar). Cuts the raw per-venue-feed pool
 * (4,047 posts) down to 544 -- still broad enough to catch real weddings light on explicit
 * signal, narrow enough to drop the clearly-irrelevant tail.
 *
 * Pulls from BOTH connection types: the venue posted it themselves (own_profile,
 * staging.instagram_posts) OR another vendor tagged/credited them (jeremy_post_vendor_evidence /
 * human_confirmed_post_vendor_evidence, role='venue' -- covers both staging and public.posts
 * sources). Ordered by the venue's current documented-wedding count ascending (0 first).
 *
 * A new queue_version ('venue_coverage_v2') -- v1's 4,077 rows are left in place, not deleted
 * (this project's standing reversible-over-destructive preference), just superseded by
 * CURRENT_QUEUE_VERSION in labeling.ts pointing here instead.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/buildVenueCoverageQueue.ts --dry-run
 *   bun run scripts/classify/buildVenueCoverageQueue.ts
 */
import { getPool, closePool } from "../classify/db";

export const VENUE_COVERAGE_QUEUE_VERSION = "venue_coverage_v3";
const MAX_WEDDINGS_FOR_INCLUSION = 5;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();

  const { rows } = await pool.query<{
    post_url: string;
    n_weddings: number;
    source: "staging" | "public";
  }>(
    `with venue_accounts as (
       select v.account_id, a.username,
         coalesce((select count(distinct wedding_id) from wedding_vendors wv where wv.account_id = v.account_id), 0) as n_weddings
       from vendors v
       join accounts a on a.id = v.account_id
       where v.city = 'Chicago' and v.category = 'venue' and v.account_id is not null
         and coalesce((select count(distinct wedding_id) from wedding_vendors wv where wv.account_id = v.account_id), 0) <= $1
     ),
     own_posts as (
       select sp.post_url, va.n_weddings, sp.caption_raw
       from staging.instagram_posts sp
       join venue_accounts va on lower(va.username::text) = lower(sp.owner_username)
     ),
     tagged_posts as (
       select e.source_post_url as post_url, va.n_weddings, sp.caption_raw
       from jeremy_post_vendor_evidence e
       join venue_accounts va on va.account_id = e.account_id
       join staging.instagram_posts sp on sp.post_url = e.source_post_url
       where e.role = 'venue'
       union
       select e.source_post_url as post_url, va.n_weddings, sp.caption_raw
       from human_confirmed_post_vendor_evidence e
       join venue_accounts va on va.account_id = e.account_id
       join staging.instagram_posts sp on sp.post_url = e.source_post_url
       where e.role = 'venue'
     ),
     all_posts as (
       select post_url, min(n_weddings) as n_weddings, max(caption_raw) as caption_raw from (
         select * from own_posts union all select * from tagged_posts
       ) x
       group by post_url
     )
     select ap.post_url, ap.n_weddings,
       case when exists (select 1 from staging.instagram_posts sp where sp.post_url = ap.post_url)
            then 'staging' else 'public' end as source
     from all_posts ap
     left join post_classifications_current pcc on pcc.post_url = ap.post_url
     where not exists (select 1 from golden_set gs where gs.post_url = ap.post_url)
       and not exists (select 1 from human_post_labels hpl where hpl.post_url = ap.post_url and hpl.labeled_by = 'jeremy')
       and (
         -- v3: tightened from v2's bare "ilike '%wedding%'" after it let through generic
         -- multi-purpose-space marketing ("birthday party, shower, or wedding event",
         -- "#chicagoweddingvenue" hashtag) with no actual wedding described. Requires a phrase
         -- that implies a SPECIFIC event (own possessive, day/weekend/ceremony/reception
         -- language, or an explicit bride/groom/Mr&Mrs reference) instead of a bare keyword.
         ap.caption_raw ~* '(wedding day|.s wedding|their wedding|wedding at |wedding weekend|wedding celebration|wedding reception|wedding ceremony|congrat.*wedding|bride|groom|mr\.? *& *mrs\.?)'
         or exists (select 1 from stack_extraction_entries se where se.post_url = ap.post_url)
         or pcc.decision in ('INCLUDE', 'REVIEW')
       )
     order by ap.n_weddings asc, ap.post_url asc`,
    [MAX_WEDDINGS_FOR_INCLUSION]
  );

  console.log(`[venue-coverage-queue] ${dryRun ? "DRY RUN — " : ""}pool=${rows.length} promising posts across low-coverage venues (<=${MAX_WEDDINGS_FOR_INCLUSION} weddings)`);
  const byWeddingCount = new Map<number, number>();
  for (const r of rows) byWeddingCount.set(r.n_weddings, (byWeddingCount.get(r.n_weddings) ?? 0) + 1);
  console.log(`[venue-coverage-queue] breakdown by current wedding count: ${[...byWeddingCount.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}:${c}`).join(", ")}`);

  if (dryRun) {
    await closePool();
    return;
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const res = await pool.query(
      `insert into label_queue (post_url, queue_version, bucket, source, rank)
       values ($1, $2, $3, $4, $5)
       on conflict (post_url, queue_version) do nothing`,
      [r.post_url, VENUE_COVERAGE_QUEUE_VERSION, `n_weddings_${r.n_weddings}`, r.source, i + 1]
    );
    if (res.rowCount) inserted += res.rowCount;
  }
  console.log(`[venue-coverage-queue] inserted ${inserted} rows under queue_version=${VENUE_COVERAGE_QUEUE_VERSION}`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
