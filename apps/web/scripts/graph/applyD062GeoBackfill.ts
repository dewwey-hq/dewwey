/**
 * D062 -- geography backfill for venues whose weddings became invisible when their events handle
 * was merged into them. Idempotent, dry-run by default, WebSearch-verified per row.
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
 *   bun run scripts/graph/applyD062GeoBackfill.ts --dry-run
 *   bun run scripts/graph/applyD062GeoBackfill.ts
 */
import { getPool, closePool } from "../classify/db";

const BATCH = "websearch:idn-20260920-geo-1";

interface GeoRow {
  username: string;
  address: string;
  city: string;
  region: string;
  /** Why we believe this is the Chicago metro, in one line. */
  evidence: string;
}

const ROWS: GeoRow[] = [
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
];

async function main() {
  const dryRun = !process.argv.includes("--apply");
  const pool = getPool();
  const client = await pool.connect();
  let inserted = 0;
  try {
    await client.query("begin");
    for (const r of ROWS) {
      const { rows: acc } = await client.query<{ id: string }>(
        `select id from accounts where username = $1::citext`,
        [r.username]
      );
      if (acc.length === 0) {
        console.log(`[d062-geo] SKIP ${r.username}: account not found`);
        continue;
      }
      const { rows: done } = await client.query(
        `insert into account_locations (account_id, address, city, region, source, in_metro, verified_at)
         values ($1, $2, $3, $4, $5, true, now())
         on conflict (account_id) do nothing
         returning account_id`,
        [acc[0].id, r.address, r.city, r.region, BATCH]
      );
      if (done.length > 0) {
        inserted++;
        console.log(`[d062-geo] ${r.username} -> ${r.address}, ${r.city} ${r.region} (in_metro=true)`);
        console.log(`           ${r.evidence}`);
      } else {
        console.log(`[d062-geo] ${r.username} already has a location row, skipping`);
      }
    }
    console.log(`[d062-geo] ${dryRun ? "DRY RUN -- " : ""}inserted=${inserted}`);
    await client.query(dryRun ? "rollback" : "commit");
    console.log(dryRun ? "[d062-geo] DRY RUN -- rolled back" : "[d062-geo] COMMITTED");
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
