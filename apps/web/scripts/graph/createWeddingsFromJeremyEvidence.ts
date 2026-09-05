/**
 * Creation script for the Jeremy wedding-creation mission
 * (docs/engineering/graph-strengthening/jeremy-wedding-creation.md) — the first script in
 * this whole workstream that creates a NEW `weddings` row rather than matching evidence to
 * one Ben's crawler already found.
 *
 * Scope: fixed, hand-verified candidate ID lists (D035's original 15-candidate pilot, plus
 * D036 Phase 1's 100 — see `docs/engineering/graph-strengthening/jeremy-wedding-creation.md`
 * and `is-chicago-for-new-venues.md`). Deliberately NOT parameterized to a `--limit` flag —
 * every batch this script processes must be individually duplicate-checked and hand-read
 * first; hardcoding forces a deliberate edit to grow the list, not a number bump.
 *
 * A real schema wrinkle surfaced building this: `wedding_posts.post_id` is a NOT NULL FK
 * to Ben's own `posts` table, but Jeremy's captions live in `staging.instagram_posts` — a
 * different table entirely. Prior missions (D023/D030/D033) never needed to bridge this,
 * because they only added `wedding_vendors` rows to EXISTING weddings that already had
 * their own Ben-crawled `wedding_posts`. Creating a wedding from Jeremy evidence alone
 * means importing the underlying post(s) into `posts` for the first time, tagged
 * `source='jeremy_evidence'` (a new, self-explanatory value — no CHECK constraint exists
 * on this column, confirmed before choosing it) so they stay distinguishable from Ben's
 * own crawl. `posts.shortcode` has a UNIQUE constraint, extracted from the Instagram URL —
 * this is what makes re-running this script idempotent (`on conflict (shortcode) do
 * nothing`), not a separate flag.
 *
 * Safety properties (same bar as every prior mission, D023 onward):
 * - Additive only; every insert is `on conflict do nothing`.
 * - Provenance: every created wedding is logged in a new `jeremy_weddings_created` table
 *   (candidate_id, wedding_id, created_at) — `wedding_id` deliberately NOT a foreign key,
 *   same reasoning as `jeremy_wedding_vendors_ingested` (Ben's `weddings.id` isn't stable
 *   across a future `phase_dedup()` rebuild, which this mission's doc says must never be
 *   re-run against Supabase anyway).
 * - Whole-run transaction; `--dry-run` rolls back at the end, same code path.
 * - Already cleared, before this script runs at all: an intra-batch duplicate check
 *   (checkIntraBatchDuplicates.ts) and a secondary-account duplicate check against Ben's
 *   EXISTING weddings (checkExistingDuplicatesForCreation.ts) — both clean for all 447,
 *   this pilot's 15 included.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/createWeddingsFromJeremyEvidence.ts --dry-run
 *   bun run scripts/graph/createWeddingsFromJeremyEvidence.ts
 */
import { getPool, closePool } from "../classify/db";

// The 15 candidates read end-to-end by hand (mission doc, "Pilot" section, 2026-09-05) —
// all confirmed genuinely real, distinct weddings; the two multi-venue risk cases in this
// set (158, 662) were individually cross-checked against Ben's existing graph and cleared.
// Already created (D035) -- kept here so a re-run stays a no-op via jeremy_weddings_created,
// not because this list needs to grow; new batches get their own array below.
const D035_PILOT_CANDIDATE_IDS = [158, 351, 396, 540, 624, 662, 701, 1158, 1222, 1253, 1363, 1650, 2250, 2756, 2804];

// is-chicago-for-new-venues mission (D036), Phase 1: candidates whose venue resolves via
// existing vendors.city='Chicago' data AND has a corroborating account_tags role in
// venue/hotel/catering/rentals. Both duplicate checks clean (checkIntraBatchDuplicates.ts
// --phase1, checkExistingDuplicatesForCreation.ts --phase1), 15-candidate hand-read sample
// all genuine real weddings. 102 passed the filter; 2 explicitly excluded after further
// verification (2026-09-05):
// - 2455 (hangoutlighting): a lighting RENTAL company ("Mix, match, & customize...
//   lighting made easy" -- its own bio), not a venue, despite having a stray manual
//   account_tags 'venue' row (confidence 0.8, evidence_count 1 -- likely a pre-existing
//   data error, not corroborating evidence).
// - 2469 (blueplatechicago): a catering company whose OWN bio explicitly reads
//   "Venue: @alliumchicago" -- it names a DIFFERENT account as the real venue.
const PHASE1_CANDIDATE_IDS = [
  31, 37, 44, 55, 57, 61, 80, 94, 153, 161, 162, 166, 199, 210, 231, 278, 306, 317, 326, 377,
  380, 448, 475, 488, 503, 538, 544, 559, 587, 606, 637, 667, 695, 734, 750, 829, 837, 876,
  883, 903, 916, 919, 958, 986, 1011, 1085, 1116, 1128, 1136, 1202, 1230, 1238, 1259, 1325,
  1410, 1421, 1455, 1477, 1487, 1556, 1585, 1594, 1606, 1616, 1632, 1661, 1712, 1718, 1769,
  1776, 1787, 1792, 1956, 1962, 2005, 2046, 2059, 2089, 2103, 2114, 2124, 2129, 2138, 2254,
  2297, 2324, 2355, 2364, 2475, 2551, 2585, 2590, 2605, 2628, 2659, 2660, 2830, 2837, 2840,
  2872,
];

// is-chicago-for-new-venues mission (D038/D039), Phase 2: candidates whose venue account had
// ZERO location signal in Ben's own data, resolved instead via free WebSearch (D038 pivot
// from the paid Places API). 130 distinct venue accounts attempted; 99 confirmed real
// Chicago-metro locations (backfillVenueLocationsViaWebSearch.ts). Both duplicate checks
// clean (--phase2 mode, 0/169 flagged either check). A NEW risk category surfaced in the
// 15-candidate hand-read sample (2026-09-05): 44 of the 169 candidates have TWO+ accounts
// tagged role='venue' -- typically a ceremony church credited alongside a separate,
// unrelated reception venue (e.g. candidate 1296: resolved venue_account_id was
// `assumption_church_chicago`, but the underlying caption's actual "Venue:" credit was
// `@thewellsley`, a different business entirely; candidate 2271 similarly resolved to the
// church despite an explicit "Venue: @therookerybuilding" in the same caption). This is
// genuinely ambiguous -- not a clean mislabel like Phase 1's lighting-company/musician cases
// -- so all 44 are excluded from this batch rather than guessing which of two legitimate
// accounts is "the" venue (docs/engineering/graph-strengthening/is-chicago-for-new-venues.md
// has the full 44-candidate list and reasoning). The remaining 125 are the clean batch here.
const PHASE2_ACCOUNT_IDS = [
  1438, 2857, 4208, 6059, 7033, 7893, 8024, 8478, 8791, 9829, 11283, 19471, 20812, 3088, 4641,
  18240, 18283, 18370, 18466, 18489, 18490, 18508, 18543, 18606, 18621, 18631, 18676, 18712,
  18759, 18793, 18849, 18863, 18865, 18869, 18877, 18892, 18940, 18945, 18975, 19183, 19194,
  19224, 19260, 19286, 19288, 19292, 19310, 19353, 19354, 19446, 19482, 19535, 19539, 19603,
  19612, 19628, 19637, 19704, 19812, 19890, 19931, 20346, 20377, 20504, 20545, 20574, 20581,
  20593, 20679, 20680, 20694, 20755, 20792, 20805, 20819, 20911, 20978, 20979, 21019, 21020,
  21147, 21161, 21169, 21174, 21178, 21185, 21186, 21192, 21195, 21196, 21197, 21286, 21305,
  21307, 21319, 21342, 21343, 21348, 21416,
];
const PHASE2_CANDIDATE_IDS = [
  52, 102, 126, 129, 140, 1129, 188, 206, 232, 239, 244, 296, 305, 342, 357, 419, 435, 472,
  485, 516, 534, 535, 551, 619, 650, 720, 725, 749, 814, 1134, 851, 899, 901, 952, 1004, 1010,
  1061, 1092, 1099, 1124, 1150, 1198, 1204, 1212, 1243, 1286, 1329, 1345, 1352, 1382, 1388,
  1413, 1425, 1429, 1447, 1461, 1480, 1488, 1553, 1642, 1747, 1767, 1784, 1810, 1811, 1831,
  1834, 1843, 1893, 1915, 1909, 1968, 1976, 2021, 2031, 2036, 2066, 2071, 2118, 2141, 2158,
  2163, 2230, 2249, 2304, 2333, 2338, 2384, 2397, 2332, 2409, 2416, 2421, 2434, 2443, 2459,
  2470, 2471, 2473, 2490, 2524, 2570, 2558, 2589, 2616, 2619, 2623, 2640, 2643, 2607, 2678,
  2685, 2691, 2677, 2707, 2723, 2725, 2744, 2761, 2764, 2775, 2816, 2824, 2838, 2849,
];

const CANDIDATE_IDS = [...D035_PILOT_CANDIDATE_IDS, ...PHASE1_CANDIDATE_IDS, ...PHASE2_CANDIDATE_IDS];

function shortcodeFromUrl(url: string): string | null {
  const m = url.match(/\/p\/([^/]+)/);
  return m ? m[1] : null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    await client.query(`
      create table if not exists jeremy_weddings_created (
        candidate_id bigint not null,
        wedding_id   bigint not null,
        created_at   timestamptz not null default now(),
        primary key (candidate_id)
      )
    `);

    let weddingsCreated = 0;
    let postsImported = 0;
    let vendorsInserted = 0;

    for (const candidateId of CANDIDATE_IDS) {
      const { rows: candRows } = await client.query<{
        venue_account_id: number;
        event_date_est: string | null;
      }>(`select venue_account_id::int, event_date_est::text from jeremy_wedding_candidates where id = $1`, [
        candidateId,
      ]);
      if (candRows.length === 0) continue;
      const { venue_account_id: venueAccountId, event_date_est: eventDate } = candRows[0];

      const { rows: existingCreated } = await client.query(
        `select wedding_id from jeremy_weddings_created where candidate_id = $1`,
        [candidateId]
      );
      if (existingCreated.length > 0) {
        console.log(`[create-weddings] candidate=${candidateId} already created as wedding=${existingCreated[0].wedding_id}, skipping`);
        continue;
      }

      // account_locations has no row at all for most venue accounts discovered only
      // through Jeremy's evidence (D035 finding) -- falling back to that table's own
      // coalesce-to-false would silently mark real Chicago weddings as non-Chicago, hiding
      // them from /weddings and the /vendors browse list. D036's Phase 1 fix: trust the
      // Places-linked vendors.city field (real, varied geocoded data, confirmed 2026-09-05
      // not a static default) for candidates scoped that way. D035's original 15 were
      // hand-verified directly (no vendors.city dependency) -- OR here covers both without
      // re-deriving which path each candidate came from.
      const { rows: cityRows } = await client.query<{ is_chicago: boolean }>(
        `select exists(select 1 from vendors v where v.account_id = $1 and v.city = 'Chicago') as is_chicago`,
        [venueAccountId]
      );
      const isChicago =
        cityRows[0].is_chicago ||
        D035_PILOT_CANDIDATE_IDS.includes(candidateId) ||
        PHASE2_ACCOUNT_IDS.includes(venueAccountId);

      const { rows: weddingRows } = await client.query<{ id: number }>(
        `insert into weddings (venue_id, event_date_est, is_chicago) values ($1, $2, $3) returning id`,
        [venueAccountId, eventDate, isChicago]
      );
      const weddingId = weddingRows[0].id;
      weddingsCreated++;

      const { rows: posts } = await client.query<{
        post_url: string;
        caption_raw: string | null;
        post_timestamp: string;
        owner_username: string;
        likes_count: number | null;
      }>(
        `select ip.post_url, ip.caption_raw, ip.post_timestamp::text, ip.owner_username, ip.likes_count
         from jeremy_wedding_candidate_posts cp
         join staging.instagram_posts ip on ip.post_url = cp.source_post_url
         where cp.candidate_id = $1`,
        [candidateId]
      );

      for (const p of posts) {
        const shortcode = shortcodeFromUrl(p.post_url);
        if (!shortcode) continue;

        const { rows: ownerRows } = await client.query<{ id: number }>(
          `insert into accounts (username) values ($1)
           on conflict (username) do update set username = excluded.username
           returning id`,
          [p.owner_username.toLowerCase()]
        );
        const ownerId = ownerRows[0].id;

        const { rows: postRows } = await client.query<{ id: number }>(
          `insert into posts (shortcode, url, owner_id, caption, posted_at, likes_count, source, raw)
           values ($1, $2, $3, $4, $5, $6, 'jeremy_evidence', $7)
           on conflict (shortcode) do nothing
           returning id`,
          [shortcode, p.post_url, ownerId, p.caption_raw, p.post_timestamp, p.likes_count, JSON.stringify(p)]
        );
        if (postRows.length === 0) continue;
        postsImported++;
        const postId = postRows[0].id;

        await client.query(`insert into wedding_posts (wedding_id, post_id) values ($1, $2) on conflict (post_id) do nothing`, [
          weddingId,
          postId,
        ]);
      }

      const { rows: candVendors } = await client.query<{ account_id: number; role: string }>(
        `select account_id::int, role from jeremy_wedding_candidate_vendors where candidate_id = $1`,
        [candidateId]
      );
      for (const v of candVendors) {
        const { rows: inserted } = await client.query(
          `insert into wedding_vendors (wedding_id, account_id, role, n_confirmations)
           values ($1, $2, $3::vendor_role, 1)
           on conflict (wedding_id, account_id, role) do nothing
           returning wedding_id`,
          [weddingId, v.account_id, v.role]
        );
        if (inserted.length > 0) vendorsInserted++;
      }

      await client.query(
        `insert into jeremy_weddings_created (candidate_id, wedding_id) values ($1, $2) on conflict (candidate_id) do nothing`,
        [candidateId, weddingId]
      );

      console.log(`[create-weddings] candidate=${candidateId} -> wedding=${weddingId} posts=${posts.length} vendors=${candVendors.length}`);
    }

    console.log(
      `[create-weddings] ${dryRun ? "DRY RUN — " : ""}weddings_created=${weddingsCreated} posts_imported=${postsImported} vendors_inserted=${vendorsInserted}`
    );

    if (!dryRun) {
      await client.query("refresh materialized view edges");
      console.log("[create-weddings] refreshed materialized view edges");
    }

    if (dryRun) {
      await client.query("rollback");
      console.log("[create-weddings] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("[create-weddings] COMMITTED");
    }
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
