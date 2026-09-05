/**
 * Phase 2 of the is-chicago-for-new-venues mission
 * (docs/engineering/graph-strengthening/is-chicago-for-new-venues.md): backfills
 * `account_locations` for venue accounts discovered only through Jeremy's evidence, using
 * free `WebSearch` results instead of the originally-scoped paid Google Places API (D038 —
 * tested both on real accounts, WebSearch returned richer confirmation, exact address, and
 * explicit wedding-hosting corroboration, at zero real-money cost).
 *
 * Each entry below was individually searched (`"<username>" instagram Chicago [wedding
 * venue]`), read, and judged — not a blind city-name-contains-"chicago" heuristic. Only
 * CONFIRMED-Chicago-metro results are included; inconclusive searches (no match, ambiguous
 * multi-city chains) are left out entirely rather than guessed. A confirmed Chicago
 * *location* does not by itself mean "this is a legitimate wedding venue" — two entries
 * here (figdrinks, murphysbleachers) are real Chicago businesses but not primarily event
 * venues (a catering/bar company, a sports bar); that distinction is a separate concern the
 * existing account_tags venue-role filter (Phase 1) already handles downstream — this
 * script's only job is "is this account's address genuinely in the Chicago metro," which is
 * true for both.
 *
 * Additive only: `on conflict (account_id) do nothing` — account_locations' PK is
 * account_id, so this never overwrites an existing row (there shouldn't be one for this
 * cohort, but the guarantee holds either way). `--dry-run` first, transaction-wrapped.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/backfillVenueLocationsViaWebSearch.ts --dry-run
 *   bun run scripts/graph/backfillVenueLocationsViaWebSearch.ts
 */
import { getPool, closePool } from "../classify/db";

interface ConfirmedLocation {
  accountId: number;
  username: string;
  address: string | null;
  city: string;
  region: string;
  source: string;
}

// Batch 1 (2026-09-05) — 13 of 19 searched confirmed as real Chicago-metro places.
const CONFIRMED_LOCATIONS: ConfirmedLocation[] = [
  { accountId: 1438, username: "beatnikontheriver", address: "180 N Upper Wacker Dr", city: "Chicago", region: "IL", source: "web:beatnikontheriver.com, Yelp" },
  { accountId: 2857, username: "marshallslanding", address: "222 W Merchandise Mart Plaza", city: "Chicago", region: "IL", source: "web:marshallslanding.com, The Knot" },
  { accountId: 4208, username: "eaglewoodresort", address: null, city: "Itasca", region: "IL", source: "web:eaglewoodresort.com" },
  { accountId: 6059, username: "stjosaphatparish", address: "2311 N Southport Ave", city: "Chicago", region: "IL", source: "web:stjosaphatparish.org" },
  { accountId: 7033, username: "figdrinks", address: "1850 S Blue Island Ave", city: "Chicago", region: "IL", source: "web:voyagechicago.com (FIG Catering, Pilsen)" },
  { accountId: 7893, username: "icsjparish", address: null, city: "Chicago", region: "IL", source: "web:icsjparish.org (Near North Side)" },
  { accountId: 8024, username: "thegrovecountryclub", address: null, city: "Long Grove", region: "IL", source: "web:eventective.com, chicagoeventvenues.com" },
  { accountId: 8478, username: "murphysbleachers", address: "3655 N Sheffield Ave", city: "Chicago", region: "IL", source: "web:murphysbleachers.com (Wrigleyville)" },
  { accountId: 8791, username: "holyfamilycci", address: null, city: "Inverness", region: "IL", source: "web:instagram bio redirect to Holy Family Inverness" },
  { accountId: 9829, username: "stalphonsuschicago", address: null, city: "Chicago", region: "IL", source: "web:stalphonsuschicago.org (Lakeview)" },
  { accountId: 11283, username: "oakbrookhillsresort", address: "3500 Midwest Rd", city: "Oak Brook", region: "IL", source: "web:oakbrookhillsresort.com" },
  { accountId: 19471, username: "goebbertevents", address: null, city: "Pingree Grove", region: "IL", source: "web:goebbertevents.com, melissadiep.net" },
  { accountId: 20812, username: "saddleandcycleclub", address: "900 W Foster Ave", city: "Chicago", region: "IL", source: "web:saddleandcycle.com, Yelp" },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    let attempted = 0;
    let inserted = 0;

    for (const loc of CONFIRMED_LOCATIONS) {
      attempted++;
      const { rows } = await client.query(
        `insert into account_locations (account_id, address, city, region, in_metro, source, verified_at)
         values ($1, $2, $3, $4, true, 'websearch', now())
         on conflict (account_id) do nothing
         returning account_id`,
        [loc.accountId, loc.address, loc.city, loc.region]
      );
      if (rows.length > 0) {
        inserted++;
        console.log(`[backfill-locations] @${loc.username} -> ${loc.city}, ${loc.region} (${loc.source})`);
      } else {
        console.log(`[backfill-locations] @${loc.username} already has a location row, skipping`);
      }
    }

    console.log(`[backfill-locations] ${dryRun ? "DRY RUN — " : ""}attempted=${attempted} inserted=${inserted}`);

    if (dryRun) {
      await client.query("rollback");
      console.log("[backfill-locations] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("[backfill-locations] COMMITTED");
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
