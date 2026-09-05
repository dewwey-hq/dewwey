/**
 * Creation script for the Jeremy wedding-creation mission
 * (docs/engineering/graph-strengthening/jeremy-wedding-creation.md) — the first script in
 * this whole workstream that creates a NEW `weddings` row rather than matching evidence to
 * one Ben's crawler already found.
 *
 * Scope: a fixed, hand-verified pilot list of candidate IDs (the same 15 read end-to-end
 * by hand and cross-checked against Ben's existing graph for duplicates — see the mission
 * doc's pilot section). Deliberately NOT parameterized to "all 447" — this mission's own
 * constraint is "pilot small before any larger batch," enforced here by hardcoding the
 * list rather than accepting a --limit flag that could be bumped up carelessly later.
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
const PILOT_CANDIDATE_IDS = [158, 351, 396, 540, 624, 662, 701, 1158, 1222, 1253, 1363, 1650, 2250, 2756, 2804];

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

    for (const candidateId of PILOT_CANDIDATE_IDS) {
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

      // account_locations has NO row at all for 14 of these 15 venue accounts (checked
      // live, 2026-09-05) -- Ben's location enrichment only ever ran on accounts his own
      // pipeline touched, never on venues discovered purely through Jeremy's evidence.
      // Falling back to that table's own coalesce-to-false would silently mark these real
      // Chicago weddings as non-Chicago, hiding them from /weddings and the /vendors browse
      // list (both require is_chicago=true) even though detail pages would still work.
      // For THIS pilot specifically, every one of the 15 candidates was read end-to-end by
      // hand (mission doc, "Pilot" section) and confirmed unambiguously Chicago (explicit
      // #chicagowedding tags, or a named Chicago venue/landmark in the caption itself) --
      // is_chicago=true here is a verified judgment call, not a default. This does NOT
      // scale to the remaining ~432 candidates without a real fix (e.g. geocoding new
      // venue accounts into account_locations) -- see the mission doc's open questions.
      const isChicago = true;

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
