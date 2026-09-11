/**
 * D056 coverage-audit follow-up: `accounts.venue_type` exists but is null for every row (0 of
 * 1,041 venue-shaped accounts as of this writing). This script backfills it with a coarse,
 * ordered-keyword classification so venue-shaped accounts can be grouped/filtered by type.
 *
 * Universe: accounts whose `v_account_role.role` is venue/hotel/accommodations OR that are
 * `weddings.venue_id` on >=1 wedding (an account can clear the bar either way -- e.g. an
 * account with zero wedding_vendors credits but that anchors a wedding via venue_id still
 * counts, same "venue-shaped" spirit as reanchorWeddings.ts's bucket (ii)).
 *
 * Classification: `classifyVenueType` (weddingMaintenance.ts, unit-tested there) runs an
 * ORDERED list of keyword-regex rules (house_of_worship, hotel, country_club, museum,
 * park_outdoor, farm_estate, restaurant, event_space, else `other`) -- first matching category
 * wins, over `lower(username || ' ' || full_name || ' ' || biography || ' ' || category)`.
 *
 * Deviation from the spec worth flagging explicitly: the spec's classification-text formula
 * names `vendors.primary_type`, but `public.vendors` has no `primary_type` column (checked
 * live: id, place_id, name, category, website, phone, address, neighborhood, city, state, zip,
 * lat, lng, rating, review_count, price_level, instagram_handle, account_id, account_matched_by,
 * photo_keys, discovery_source, raw, created_at, updated_at -- and `raw` jsonb has no
 * `primaryType`/`primary_type` key either, only `category`/`place_types`). This script uses
 * `vendors.category` alone (already the other half of the spec's formula) and omits
 * `primary_type` rather than referencing a column that doesn't exist.
 *
 * Writes ONLY where `accounts.venue_type is null` (every row, today -- but re-runnable without
 * clobbering a value a human or a later pass sets by hand). Provenance: one
 * `vendor_role_migrations` row per write (table_name='accounts.venue_type', account_id,
 * old_role=null, new_role=the classified type, note='seed-venue-type: matched "<keyword>"' or
 * '... no keyword matched (other)').
 *
 * Same dry-run-by-default, transaction-wrapped shape as the rest of scripts/graph.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/seedVenueTypes.ts --batch-id d056-venue-type-1              # dry run (default)
 *   bun run scripts/graph/seedVenueTypes.ts --batch-id d056-venue-type-1 --dry-run    # same, explicit
 *   bun run scripts/graph/seedVenueTypes.ts --batch-id d056-venue-type-1 --apply      # real write, human only
 */
import { getPool, closePool } from "../classify/db";
import { classifyVenueType } from "./weddingMaintenance";

function parseArgs() {
  const argv = process.argv.slice(2);
  const batchIdx = argv.indexOf("--batch-id");
  const batchId = batchIdx !== -1 ? argv[batchIdx + 1] : undefined;
  const apply = argv.includes("--apply");
  if (!batchId || batchId.startsWith("--")) {
    console.error(
      "[seed-venue-types] --batch-id <id> is required.\n" +
        "Usage: bun run scripts/graph/seedVenueTypes.ts --batch-id <id> [--apply]\n" +
        "Default (no --apply) is a dry run."
    );
    process.exit(1);
  }
  return { batchId, apply };
}

interface UniverseRow {
  id: string;
  username: string;
  full_name: string | null;
  biography: string | null;
  category: string | null;
  venue_type: string | null;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function main() {
  const { batchId, apply } = parseArgs();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query(`set statement_timeout = '300s'`);
    await client.query("begin");
    console.log(`[seed-venue-types] mode: ${apply ? "APPLY (real write)" : "DRY RUN (will roll back)"}`);
    console.log(`[seed-venue-types] batch_id: ${batchId}`);

    const { rows: universe } = await client.query<UniverseRow>(
      `select a.id::text, a.username::text, a.full_name, a.biography, v.category, a.venue_type
       from accounts a
       left join lateral (
         select category from vendors where vendors.account_id = a.id limit 1
       ) v on true
       where a.venue_type is null
         and (
           exists (select 1 from v_account_role r where r.account_id = a.id and r.role in ('venue', 'hotel', 'accommodations'))
           or exists (select 1 from weddings w where w.venue_id = a.id)
         )`
    );
    console.log(`[seed-venue-types] universe (venue-shaped, venue_type currently null): ${universe.length}`);

    const distribution: Record<string, number> = {};
    const classified: Array<{ row: UniverseRow; type: string; matchedKeyword: string | null }> = [];

    for (const row of universe) {
      const text = [row.username, row.full_name ?? "", row.biography ?? "", row.category ?? ""].join(" ");
      const { type, matchedKeyword } = classifyVenueType(text);
      distribution[type] = (distribution[type] ?? 0) + 1;
      classified.push({ row, type, matchedKeyword });

      if (apply) {
        await client.query(`update accounts set venue_type = $1 where id = $2 and venue_type is null`, [type, row.id]);
        const note = matchedKeyword ? `seed-venue-type: matched "${matchedKeyword}"` : "seed-venue-type: no keyword matched (other)";
        await client.query(
          `insert into vendor_role_migrations
             (batch_id, table_name, wedding_id, account_id, old_role, new_role, old_venue_id, new_venue_id, note)
           values ($1, 'accounts.venue_type', null, $2, null, $3, null, null, $4)`,
          [batchId, row.id, type, note]
        );
      }
    }

    // ------------------------------------------------------------
    // Report: distribution, a 40-account random sample, and the 20 most common 'other' names.
    // ------------------------------------------------------------
    console.log(`\n[seed-venue-types] distribution:`);
    for (const [type, count] of Object.entries(distribution).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }

    const sample = shuffle(classified).slice(0, 40);
    console.log(`\n[seed-venue-types] random sample (${sample.length} of ${classified.length}):`);
    for (const { row, type, matchedKeyword } of sample.sort((a, b) => a.row.username.localeCompare(b.row.username))) {
      console.log(`  @${row.username}: ${type}  (matched: ${matchedKeyword ?? "-"})`);
    }

    const otherNameCounts = new Map<string, number>();
    for (const { row, type } of classified) {
      if (type !== "other") continue;
      const name = row.full_name?.trim() || row.username;
      otherNameCounts.set(name, (otherNameCounts.get(name) ?? 0) + 1);
    }
    const topOtherNames = [...otherNameCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    console.log(`\n[seed-venue-types] top 20 most common 'other' full_names (for extending the rules):`);
    for (const [name, count] of topOtherNames) {
      console.log(`  ${name}: ${count}`);
    }

    if (apply) {
      console.log(
        `\n[seed-venue-types] to revert this batch by hand (human only):\n` +
          `  begin;\n` +
          `  update accounts a set venue_type = null\n` +
          `    from vendor_role_migrations r\n` +
          `    where r.batch_id = '${batchId}' and r.table_name = 'accounts.venue_type' and a.id = r.account_id\n` +
          `    and a.venue_type = r.new_role;\n` +
          `  delete from vendor_role_migrations where batch_id = '${batchId}' and table_name = 'accounts.venue_type';\n` +
          `  commit;\n` +
          `  -- the 'a.venue_type = r.new_role' guard skips any row a human or later pass has since\n` +
          `  -- changed, same caution as leaving a value alone on the write side.`
      );
      await client.query("commit");
      console.log("\n[seed-venue-types] COMMITTED");
    } else {
      await client.query("rollback");
      console.log("\n[seed-venue-types] DRY RUN -- rolled back, no changes committed");
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
