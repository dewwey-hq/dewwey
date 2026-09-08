/**
 * Coverage-gap Track 2.2 (D050 follow-on, 2026-09-07), second half. After
 * bridgeUnmatchedVenueAccounts.ts linked every known Chicago venue whose Google-Places
 * `instagram_handle` already matched an existing `accounts` row, the remainder have a known
 * handle (from Places data, or freshly WebSearch-verified this session) but ZERO posts anywhere
 * in our corpus -- structurally impossible to ever get a documented wedding without a real crawl
 * of their tagged feed, which this sandbox cannot run (no Apify access).
 *
 * Creates a bare placeholder `accounts` row (username only -- first_seen_at defaults to now(),
 * everything else genuinely unknown until a real profile/feed scrape happens) for each, links
 * `vendors.account_id`, and queues it in `ops.crawl_frontier` at priority 1 for whenever the
 * real pipeline next runs. Purely additive: never touches an existing accounts/vendors row
 * beyond setting a currently-NULL account_id, never queues a duplicate (checks for an existing
 * account first).
 *
 * VENUE_HANDLES below were independently WebSearch-verified this session (not guessed) --
 * ambiguous or unconfirmed cases (Gala Banquet Hall, Woman's Athletic Club, Wrigley Field --
 * a search for "Wrigley Field wedding instagram" surfaced Wrigley MANSION in Phoenix, AZ, a
 * different venue entirely, so left unresolved rather than risk a wrong handle -- The Chicago
 * Club, Stardust Banquet Hall's two ambiguous candidate handles) are deliberately excluded, not
 * guessed. The Shapiro Ballroom is excluded outright -- permanently closed since 2020, confirmed
 * via WebSearch, not worth queuing.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/queueUnseenVenuesForCrawl.ts --dry-run
 *   bun run scripts/graph/queueUnseenVenuesForCrawl.ts
 */
import { getPool, closePool } from "../classify/db";

// vendor.id -> WebSearch-verified handle, for the 3 venues that had NO instagram_handle on file
// at all until this session's WebSearch pass.
const NEWLY_FOUND_HANDLES: Record<number, string> = {
  20: "thelonghallchicago",
  35: "diamondgardenbanquet",
  1111: "thefortnightlyofchicago",
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();

  for (const [vendorId, handle] of Object.entries(NEWLY_FOUND_HANDLES)) {
    if (!dryRun) {
      await pool.query(`update vendors set instagram_handle = $2 where id = $1 and instagram_handle is null`, [
        Number(vendorId),
        handle,
      ]);
    }
  }

  // Every known Chicago venue with a handle but still no linked account, after the direct-match
  // bridge already ran (includes the 3 just backfilled above).
  const { rows } = await pool.query<{ vendor_id: number; name: string; handle: string }>(
    `select v.id as vendor_id, v.name, v.instagram_handle::text as handle
     from vendors v
     where v.category = 'venue' and v.city = 'Chicago'
       and v.account_id is null and v.instagram_handle is not null`
  );

  console.log(`[queue-unseen-venues] ${dryRun ? "DRY RUN — " : ""}found ${rows.length} known-handle, no-account venues`);

  let queued = 0;
  for (const r of rows) {
    if (dryRun) {
      console.log(`[queue-unseen-venues] would create account + queue: ${r.name} (@${r.handle})`);
      queued++;
      continue;
    }
    const { rows: inserted } = await pool.query<{ id: number }>(
      `insert into accounts (username) values ($1)
       on conflict (username) do update set username = excluded.username
       returning id`,
      [r.handle]
    );
    const accountId = inserted[0].id;
    await pool.query(
      `update vendors set account_id = $2, account_matched_by = 'handle_exact', updated_at = now() where id = $1`,
      [r.vendor_id, accountId]
    );
    await pool.query(
      `insert into ops.crawl_frontier (account_id, priority, status, note)
       values ($1, 1, 'pending', $2)
       on conflict (account_id) do nothing`,
      [accountId, `coverage-gap Track 2.2, D050, 2026-09-07 -- known Chicago venue (${r.name}), zero posts in corpus, queued for tagged-feed crawl`]
    );
    console.log(`[queue-unseen-venues] vendor=${r.vendor_id} (${r.name}) -> new account=${accountId} (@${r.handle}), queued`);
    queued++;
  }

  console.log(`[queue-unseen-venues] ${dryRun ? "DRY RUN — " : ""}total queued=${queued}`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
