/**
 * Backfill `account_locations` for venue/hotel-role accounts that have NO location row but DO
 * have a Google-Places-verified `vendors` row (discovery_source='google_places', lat/lng set)
 * inside the Chicago metro bounding box. Found 2026-09-10 by the coverage audit (D055 "count
 * honestly"): 30 such accounts carrying 276 documented weddings -- The Drake (57), The
 * Peninsula (31), Palmer House (28), InterContinental (25), Chicago History Museum (25), Field
 * Museum (19) -- were hidden from /venues only because nobody had copied the Places identity
 * layer into account_locations, which is the column /venues filters on.
 *
 * Evidence rule (D055, 2026-09-09): a `vendors` row is geography evidence ONLY when
 * discovery_source='google_places' (vendors.city defaults to 'Chicago' otherwise). Ben's
 * pipeline.py phase M2 wrote exactly these rows with source='google_maps', in_metro=true,
 * verified_at=now() -- this script is the same write, for accounts M2 never reached.
 *
 * Metro box: lat 41.2..42.5, lng -88.6..-87.4 (Chicago metro incl. the collar counties; the
 * same box used for the sizing query). Anything outside is skipped and listed, never written.
 * Additive only: `on conflict (account_id) do nothing`. Dry-run by default.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/backfillAccountLocationsFromPlaces.ts            # dry run
 *   bun run scripts/graph/backfillAccountLocationsFromPlaces.ts --apply
 */
import { getPool, closePool } from "../classify/db";

const BOX = { latMin: 41.2, latMax: 42.5, lngMin: -88.6, lngMax: -87.4 };

// Brand-level handles bridged to one property's Places row (D052 landmine): never a venue row.
const BRAND_HANDLES = new Set(["marriottbonvoy"]);

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`set statement_timeout = '300s'`);
    await client.query("begin");
    const { rows } = await client.query<{
      account_id: string; username: string; weddings: number; address: string | null;
      city: string | null; state: string | null; lat: number; lng: number; in_box: boolean;
    }>(
      `select a.id::text as account_id, a.username::text, coalesce(wc.n, 0)::int as weddings,
              v.address, v.city, v.state, v.lat::float8 as lat, v.lng::float8 as lng,
              (v.lat between $1 and $2 and v.lng between $3 and $4) as in_box
       from accounts a
       join v_account_role var on var.account_id = a.id and var.role in ('venue', 'hotel')
       left join account_locations al on al.account_id = a.id
       left join (select venue_id, count(*) as n from weddings group by venue_id) wc on wc.venue_id = a.id
       join lateral (
         select address, city, state, lat, lng from public.vendors v
         where v.account_id = a.id and v.discovery_source = 'google_places'
           and v.lat is not null and v.lng is not null
         order by id limit 1
       ) v on true
       where al.account_id is null
       order by weddings desc`,
      [BOX.latMin, BOX.latMax, BOX.lngMin, BOX.lngMax]
    );
    const inBox = rows.filter((r) => r.in_box && !BRAND_HANDLES.has(r.username));
    const brand = rows.filter((r) => BRAND_HANDLES.has(r.username));
    if (brand.length) console.log(`[places-locations] brand handles skipped: ${brand.map((r) => r.username).join(", ")}`);
    const outside = rows.filter((r) => !r.in_box);
    console.log(`[places-locations] candidates: ${rows.length} (in metro box ${inBox.length}, outside ${outside.length})`);
    for (const r of inBox) console.log(`  ${r.username} -- ${r.weddings} weddings -- ${r.address ?? "(no address)"}, ${r.city ?? "?"}`);
    if (outside.length) {
      console.log(`[places-locations] OUTSIDE the box, skipped:`);
      for (const r of outside) console.log(`  ${r.username} -- ${r.weddings} weddings -- ${r.city ?? "?"} (${r.lat}, ${r.lng})`);
    }
    let inserted = 0;
    if (apply) {
      for (const r of inBox) {
        const res = await client.query(
          `insert into account_locations (account_id, address, city, region, lat, lng, source, in_metro, verified_at)
           values ($1, $2, $3, $4, $5, $6, 'google_maps', true, now())
           on conflict (account_id) do nothing`,
          [r.account_id, r.address, r.city, r.state, r.lat, r.lng]
        );
        inserted += res.rowCount ?? 0;
      }
      await client.query("commit");
      console.log(`[places-locations] COMMITTED: inserted=${inserted}, weddings now countable=${inBox.reduce((s, r) => s + r.weddings, 0)}`);
    } else {
      await client.query("rollback");
      console.log(`[places-locations] DRY RUN -- would insert ${inBox.length} rows (${inBox.reduce((s, r) => s + r.weddings, 0)} weddings); nothing written`);
    }
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
