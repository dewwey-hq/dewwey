/**
 * Coverage-gap Track 2.3 (D050 follow-on, 2026-09-07): the ~27 known Chicago venue accounts
 * that have an account and real activity but have NEVER had a single `role='venue'` credit
 * extracted for themselves anywhere in the corpus. Investigation found this is a real parsing
 * gap, not a content gap -- several are highly active accounts (100-200+ own posts each:
 * glessnerhouse, biagioevents, trumphotels, leloftchicago, roofonthewit, maggianoslittleitaly,
 * raisedbarchicago) whose posts about their own real weddings never carry a formal "Venue:
 * @handle" credit line (a venue posting about itself often has no reason to self-tag), so
 * `venue_couple_signal_post_vendor_evidence` (which requires the post to already have SOME
 * stack_extraction_entries row before it ever checks the couple-signal regex) never surfaces
 * them at all -- there's nothing in `stack_extraction_entries` for these posts to start from.
 *
 * Sized live: 170 untouched own-profile posts across these venues match the existing
 * couple-signal regex (Mr./Mrs., "Couple:", "Bride:", or "Name & Name"). Hand-spot-checking two
 * accounts found real signal (a genuine "Melanie & Eusebio... unforgettable day at Biagio's")
 * mixed with heavy false-positive noise from the loose regex firing on ANY two-capitalized-word
 * pair (a museum's guest-lecturer names, a quinceañera post, generic self-marketing) -- a much
 * noisier hit rate than when this same regex is applied to vendor-tagged posts, because a
 * venue's own feed mixes many event types, not just weddings. Point of this queue is exactly
 * what `/label` is for: let a human quickly separate the real weddings from the noise, rather
 * than trying to further tighten a regex against content this varied.
 *
 * Usage (from apps/web):
 *   bun run scripts/classify/buildZeroCreditVenueQueue.ts --dry-run
 *   bun run scripts/classify/buildZeroCreditVenueQueue.ts
 */
import { getPool, closePool } from "../classify/db";

export const ZERO_CREDIT_VENUE_QUEUE_VERSION = "venue_zero_credit_v1";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();

  const { rows } = await pool.query<{ post_url: string; owner_username: string }>(
    `with zero_credit_venues as (
       select a.username
       from vendors v
       join accounts a on a.id = v.account_id
       -- D055 (2026-09-08): vendors.city defaults to 'Chicago' on every row
       -- (docs/jeremy-ddl.sql) -- only trust it as "known Chicago venue" evidence when
       -- discovery_source='google_places'.
       where v.category = 'venue' and v.city = 'Chicago' and v.discovery_source = 'google_places' and a.id < 27387
         and not exists (select 1 from weddings w where w.venue_id = a.id)
         and not exists (
           select 1 from stack_extraction_entries se
           where lower(se.handle) = lower(a.username::text) and se.role = 'venue'
             and se.stack_parser_version = 'stack-parser-ts-v5'
         )
     )
     select sp.post_url, sp.owner_username
     from staging.instagram_posts sp
     join zero_credit_venues zcv on lower(sp.owner_username) = lower(zcv.username)
     where sp.caption_raw ~ '(Mr\\.? *& *Mrs\\.?|Couple: *@|Bride: *@|[A-Z][a-z]+ *(&|\\+|and) *[A-Z][a-z]+)'
       and not exists (select 1 from golden_set gs where gs.post_url = sp.post_url)
     order by sp.owner_username, sp.post_url`
  );

  console.log(`[zero-credit-venue-queue] ${dryRun ? "DRY RUN — " : ""}pool=${rows.length} posts`);
  const byVenue = new Map<string, number>();
  for (const r of rows) byVenue.set(r.owner_username, (byVenue.get(r.owner_username) ?? 0) + 1);
  console.log(
    `[zero-credit-venue-queue] by venue: ${[...byVenue.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(", ")}`
  );

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
      [r.post_url, ZERO_CREDIT_VENUE_QUEUE_VERSION, r.owner_username, "staging", i + 1]
    );
    if (res.rowCount) inserted += res.rowCount;
  }
  console.log(`[zero-credit-venue-queue] inserted ${inserted} rows under queue_version=${ZERO_CREDIT_VENUE_QUEUE_VERSION}`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
