/**
 * Venue geography: the batched, evidence-carrying writer for `account_locations` (D062, extended
 * by D064). Idempotent, dry-run by default, WebSearch-verified per row.
 *
 * Why this exists: `/venues` lists a venue only when it has an `account_locations` row with
 * in_metro = true. Alias batch idn-20260920-alias-2 merged two events handles into canonicals that
 * had no such row, which moved 9 weddings from LISTED aliases onto UNLISTED canonicals -- correct
 * identity work that made the catalog worse until the geography caught up. That is the
 * `geo_blocked` bucket (117 accounts, 144 weddings) in reportVenueIdentityTaxonomy.ts biting in
 * miniature, and it is the reason geography is the first item in D062's next steps.
 *
 * Every row below carries its verified address and `source` names the batch, since
 * account_locations has no batch_id column.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/applyVenueGeography.ts --dry-run
 *   bun run scripts/graph/applyVenueGeography.ts --apply
 */
import { getPool, closePool } from "../classify/db";

const BATCH = "websearch:idn-20260921-geo-2";

/** D064: EXCLUSIONS ARE RECORDED, NOT JUST OMITTED -- the single highest-leverage change here.
 *
 * `backfillVenueLocationsViaWebSearch.ts` names the bug in its own Batch-11 comment: "offset-based
 * querying re-surfaces already-judged-excluded accounts since exclusion never writes an
 * account_locations row". Seven accounts below were SEARCHED AND JUDGED in earlier batches and the
 * verdict was thrown away, so every later session re-surfaces and re-judges them --
 * @lakelawnresort was still sitting at the top of tonight's candidate list having been resolved as
 * Delavan, WI weeks ago. Writing in_metro=false costs one row and ends that loop permanently.
 *
 * A false row here is worse than a missing one: it hides a real venue from /venues. So every entry
 * cites where the judgement came from, and anything genuinely unresolved is left out entirely
 * rather than guessed -- the standard backfillVenueLocationsViaWebSearch.ts's header sets. */
interface GeoExclusion {
  username: string;
  city: string;
  region: string;
  evidence: string;
}

interface GeoRow {
  username: string;
  address: string;
  city: string;
  region: string;
  /** Why we believe this is the Chicago metro, in one line. */
  evidence: string;
}

const ROWS: GeoRow[] = [
  // --- D062 batch 1 (idn-20260920-geo-1): venues whose weddings went invisible when their events
  // handle merged into them. Kept verbatim; already applied.
  {
    username: "itascacountryclub",
    address: "400 E Orchard St",
    city: "Itasca",
    region: "IL",
    evidence:
      "WebSearch: Itasca Country Club, 400 E Orchard St, Itasca IL 60143 (DuPage County, Chicago metro). Holds 7 weddings after icc.weddingsandevents merged in.",
  },
  {
    username: "whiteeaglegolfclub",
    address: "3400 Club Dr",
    city: "Naperville",
    region: "IL",
    evidence:
      "WebSearch: White Eagle Golf Club, 3400 Club Dr, Naperville IL 60564 (Will/DuPage, Chicago metro); whiteeaglegc.com. Holds 2 weddings after weddingswhiteeagle merged in.",
  },

  // --- D064 batch 2 (idn-20260921-geo-2): accounts that already hold >= 1 documented wedding and
  // clear the /venues listing predicate on every axis EXCEPT geography. Each is a well-known
  // Chicago venue whose account simply never got a location row.
  {
    username: "harrycarays",
    address: "33 W Kinzie St",
    city: "Chicago",
    region: "IL",
    evidence: "WebSearch: Harry Caray's Italian Steakhouse, 33 W Kinzie St, Chicago IL 60654 (River North); harrycarays.com, Choose Chicago. Holds 4 weddings.",
  },
  {
    username: "bokachicago",
    address: "1729 N Halsted St",
    city: "Chicago",
    region: "IL",
    evidence: "WebSearch: Boka, 1729 N Halsted St, Chicago IL 60614 (Lincoln Park); bokagrp.com, Michelin guide. Holds 3 weddings.",
  },
  {
    username: "thelasallechicago",
    address: "208 S LaSalle St",
    city: "Chicago",
    region: "IL",
    evidence: "WebSearch: The LaSalle Chicago, Autograph Collection, 208 S LaSalle St, Chicago IL 60604; thelasallechicago.com. Holds 2 weddings.",
  },
  {
    username: "allegrochicago",
    address: "171 W Randolph St",
    city: "Chicago",
    region: "IL",
    evidence: "WebSearch: The Allegro Royal Sonesta Hotel Chicago Loop, 171 W Randolph St, Chicago IL 60601; Choose Chicago. Holds 2 weddings.",
  },
  {
    username: "saltshedchicago",
    address: "1357 N Elston Ave",
    city: "Chicago",
    region: "IL",
    evidence: "WebSearch: The Salt Shed, 1357 N Elston Ave, Chicago IL 60642; saltshedchicago.com/contact. Holds 1 wedding.",
  },
  {
    username: "northpondchi",
    address: "2610 N Cannon Dr",
    city: "Chicago",
    region: "IL",
    evidence: "WebSearch: North Pond, 2610 N Cannon Dr, Chicago IL 60614 (Lincoln Park); northpondrestaurant.com. Holds 1 wedding.",
  },
  {
    username: "avecchicago",
    address: "615 W Randolph St",
    city: "Chicago",
    region: "IL",
    evidence: "WebSearch: avec, 615 W Randolph St, Chicago IL 60661 (West Loop); avecrestaurant.com. Holds 1 wedding.",
  },
];

/** D064: verdicts that were reached in earlier sessions and never written down. Sources are the
 * batch comments in backfillVenueLocationsViaWebSearch.ts (lines ~216 and ~335), where each was
 * searched and explicitly resolved as outside the metro. Persisting them stops the re-surfacing. */
const EXCLUSIONS: GeoExclusion[] = [
  { username: "lakelawnresort", city: "Delavan", region: "WI", evidence: "Judged in batch 6 of backfillVenueLocationsViaWebSearch.ts: 'lakelawnresort -- Delavan, WI, ~90min'. Never persisted, so it resurfaced at the top of the D064 candidate list." },
  { username: "epiphanyfarmsestate", city: "Downs", region: "IL", evidence: "Judged in batch 6: 'epiphanyfarmsestate -- Downs, IL, 2.5hrs south'. Real Illinois, well outside the metro." },
  { username: "verandahistoricinn", city: "Senoia", region: "GA", evidence: "Judged in batch 6: 'verandahistoricinn -- Senoia, GA'." },
  { username: "stonehavenweddings", city: "Section", region: "AL", evidence: "Judged in batch 10: 'stonehavenweddings (Section, AL)'." },
  { username: "wadehouseweddings", city: "Greenbush", region: "WI", evidence: "Inconclusive in batch 6, resolved in batch 10: 'wadehouseweddings (Greenbush, WI)'." },
  { username: "elmsmansion", city: "New Orleans", region: "LA", evidence: "Inconclusive in batch 6, resolved in batch 10: 'elmsmansion (New Orleans, LA)'." },
  { username: "chspourhouse", city: "Charleston", region: "SC", evidence: "Judged in batch 10: 'chspourhouse (Charleston, SC -- name coincidence only)'." },
  { username: "brooklynbotanic", city: "Brooklyn", region: "NY", evidence: "Brooklyn Botanic Garden. Listed among batch 10's 'none plausibly Chicago, skipped without a search burn'; holds a wedding in our graph, so the exclusion needs to be a row." },
  { username: "hyattregencyorlando", city: "Orlando", region: "FL", evidence: "Same batch-10 skip list; holds a wedding here, so record it." },
  { username: "carnegiehall", city: "New York", region: "NY", evidence: "Carnegie Hall, 881 7th Ave, New York NY. Surfaced repeatedly in the geo_blocked cohort; unambiguously not the Chicago metro." },
];

async function insertBatch<T extends { username: string; city: string; region: string; evidence: string }>(
  client: import("pg").PoolClient,
  rows: T[],
  inMetro: boolean,
  address: (r: T) => string | null
): Promise<number> {
  let inserted = 0;
  for (const r of rows) {
    const { rows: acc } = await client.query<{ id: string }>(
      `select id from accounts where username = $1::citext`,
      [r.username]
    );
    if (acc.length === 0) {
      console.log(`[venue-geo] SKIP ${r.username}: account not found`);
      continue;
    }
    const { rows: done } = await client.query(
      `insert into account_locations (account_id, address, city, region, source, in_metro, verified_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (account_id) do nothing
       returning account_id`,
      [acc[0].id, address(r), r.city, r.region, BATCH, inMetro]
    );
    if (done.length > 0) {
      inserted++;
      console.log(`[venue-geo] ${inMetro ? "METRO    " : "NOT-METRO"} ${r.username} -> ${r.city} ${r.region}`);
      console.log(`             ${r.evidence}`);
    } else {
      console.log(`[venue-geo] ${r.username} already has a location row, skipping`);
    }
  }
  return inserted;
}

async function main() {
  const dryRun = !process.argv.includes("--apply");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    console.log(`[venue-geo] batch ${BATCH}`);
    console.log(`[venue-geo] --- confirmed Chicago metro (in_metro=true) ---`);
    const metro = await insertBatch(client, ROWS, true, (r) => r.address);
    console.log(`[venue-geo] --- confirmed OUTSIDE the metro (in_metro=false) ---`);
    console.log(`[venue-geo]     recorded so they stop resurfacing in every later candidate list`);
    const notMetro = await insertBatch(client, EXCLUSIONS, false, () => null);
    console.log(`[venue-geo] ${dryRun ? "DRY RUN -- " : ""}metro=${metro} not_metro=${notMetro} total=${metro + notMetro}`);
    await client.query(dryRun ? "rollback" : "commit");
    console.log(dryRun ? "[venue-geo] DRY RUN -- rolled back" : "[venue-geo] COMMITTED");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
    await closePool();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
