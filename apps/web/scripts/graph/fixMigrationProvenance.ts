/**
 * One-off provenance repair for D056 migration run 1 (batch d056-migration-1, 2026-09-11 00:57).
 *
 * The run's re-role diff compared v10 target roles against only the NON-venue existing rows, so
 * for every (wedding, account) that already held a venue-category row it also logged an
 * "insert" (old_role null, new_role venue|accommodations) that was a no-op at write time
 * (`on conflict do nothing`). The rows exist in vendor_role_migrations but were NOT created by
 * the batch -- and the printed revert (`delete ... where old_role is null and new_role is not
 * null`) would delete those pre-existing venue credits. Fixed in migrateVendorRolesV2.ts for
 * later runs; this script removes the bogus provenance rows for run 1 using the pre-migration
 * snapshot (scripts/graph/snapshots/2026-09-11T00-54-22-180Z-snapshot/wedding_vendors.csv.gz):
 * an "insert" provenance row is bogus when the same (wedding, account, role) existed in the
 * snapshot, or -- for new_role='accommodations' -- when the snapshot held a `hotel` row for the
 * pair (the hotel rule re-roled it in place and logged it separately).
 *
 * Dry-run by default; prints counts. --apply deletes the bogus rows inside one transaction.
 * Read-only otherwise. Usage (from apps/web):
 *   bun run scripts/graph/fixMigrationProvenance.ts [--apply]
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { getPool, closePool } from "../classify/db";

const SNAPSHOT = new URL("./snapshots/2026-09-11T00-54-22-180Z-snapshot/wedding_vendors.csv.gz", import.meta.url).pathname;
const BATCH = "d056-migration-1";

async function main() {
  const apply = process.argv.includes("--apply");
  const csv = gunzipSync(readFileSync(SNAPSHOT)).toString("utf8").split("\n");
  const header = csv[0].split(",");
  const iW = header.indexOf("wedding_id"), iA = header.indexOf("account_id"), iR = header.indexOf("role");
  const had = new Set<string>();
  const hadHotel = new Set<string>();
  for (const line of csv.slice(1)) {
    if (!line) continue;
    const c = line.split(",");
    const role = c[iR];
    const key = `${c[iW]}|${c[iA]}`;
    had.add(`${key}|${role === "photobooth" ? "photo_booth" : role === "jeweler" ? "jewelry" : role === "musician" ? "live_music" : role === "beauty_other" ? "beauty_services" : role}`);
    if (role === "hotel") hadHotel.add(key);
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`set statement_timeout = '300s'`);
    await client.query("begin");
    const { rows } = await client.query<{ id: string; wedding_id: string; account_id: string; new_role: string }>(
      `select id::text, wedding_id::text, account_id::text, new_role from vendor_role_migrations
       where batch_id = $1 and table_name = 'wedding_vendors' and old_role is null and new_role is not null`,
      [BATCH]
    );
    const bogus: string[] = [];
    const byRole = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.wedding_id}|${r.account_id}`;
      const preExisted = had.has(`${key}|${r.new_role}`) || (r.new_role === "accommodations" && hadHotel.has(key));
      if (preExisted) { bogus.push(r.id); byRole.set(r.new_role, (byRole.get(r.new_role) ?? 0) + 1); }
    }
    console.log(`[fix-provenance] ${BATCH}: ${rows.length} logged inserts, ${bogus.length} were no-ops (row pre-existed in the snapshot):`);
    for (const [role, n] of [...byRole.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${role}: ${n}`);
    if (apply) {
      const res = await client.query(`delete from vendor_role_migrations where id = any($1::bigint[])`, [bogus]);
      await client.query("commit");
      console.log(`[fix-provenance] COMMITTED: deleted ${res.rowCount} bogus provenance rows`);
    } else {
      await client.query("rollback");
      console.log(`[fix-provenance] DRY RUN -- nothing written`);
    }
  } catch (e) { await client.query("rollback").catch(() => {}); throw e; }
  finally { client.release(); await closePool(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
