/**
 * One-off, idempotent bridge of verified real Chicago venues (Google-Places-sourced
 * `vendors` rows, `category='venue'`) to their real Instagram account, where the venue
 * had zero account bridge at all (tail-end coverage mission, 2026-09-07 -- see
 * docs/decisions.md and the tail-end-coverage memory file).
 *
 * Each candidate below was individually verified before being listed here -- never on
 * name-similarity alone:
 *   - cotillion_banquets: found via a direct Instagram link in the venue's own website
 *     footer (cotillionbanquets.com).
 *   - georgiosbanquets / orlandchateau: found via WebSearch, cross-checked against the
 *     account's own bio/description (location, "weddings", venue name) matching the
 *     Places-sourced vendor row -- not just a name match.
 * Other 7 candidates in the same verified-Places pool (Wrigley Field, The Chicago Club,
 * Woman's Athletic Club, Stardust Banquet Hall, Gala Banquet Hall, The Armour House, The
 * Shapiro Ballroom) were investigated and deliberately excluded -- see decisions.md for why
 * each one was a no (ambiguous/wrong-venue handle, no handle found, already covered under a
 * different account, or permanently closed).
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/bridgeVerifiedVenueAccounts.ts --dry-run
 *   bun run scripts/graph/bridgeVerifiedVenueAccounts.ts
 */
import { getPool, closePool } from "../classify/db";

interface BridgeRow {
  vendorId: number;
  vendorName: string;
  username: string;
  note: string;
}

const BRIDGES: BridgeRow[] = [
  {
    vendorId: 541,
    vendorName: "Cotillion Banquets",
    username: "cotillion_banquets",
    note: "Instagram link found in cotillionbanquets.com's own footer, 2026-09-07",
  },
  {
    vendorId: 1133,
    vendorName: "Orland Chateau",
    username: "orlandchateau",
    note: "WebSearch-confirmed: exact-name Instagram account, Orland Park IL banquet hall, 2026-09-07",
  },
  {
    vendorId: 1228,
    vendorName: "Georgios Banquets, Quality Inn & Suites Conference Centre",
    username: "georgiosbanquets",
    note: "WebSearch-confirmed: @georgiosbanquets bio names Orland Park IL weddings/events, 2026-09-07",
  },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    let bridged = 0;
    for (const row of BRIDGES) {
      const { rows: vendorRows } = await client.query<{ id: number; name: string; account_id: number | null }>(
        `select id, name, account_id from vendors where id = $1`,
        [row.vendorId]
      );
      if (vendorRows.length === 0) {
        console.log(`[bridge] SKIP vendor ${row.vendorId} (${row.vendorName}): not found`);
        continue;
      }
      if (vendorRows[0].name !== row.vendorName) {
        console.log(`[bridge] SKIP vendor ${row.vendorId}: name mismatch, expected "${row.vendorName}" got "${vendorRows[0].name}"`);
        continue;
      }
      if (vendorRows[0].account_id !== null) {
        console.log(`[bridge] SKIP vendor ${row.vendorId} (${row.vendorName}): already bridged to account ${vendorRows[0].account_id}`);
        continue;
      }

      const { rows: acctRows } = await client.query<{ id: number }>(
        `insert into accounts (username)
         values ($1::citext)
         on conflict (username) do update set username = excluded.username
         returning id`,
        [row.username]
      );
      const accountId = acctRows[0].id;

      await client.query(
        `update vendors set account_id = $1, account_matched_by = 'verified_website_search' where id = $2`,
        [accountId, row.vendorId]
      );

      await client.query(
        `insert into crawl_frontier (account_id, hops, priority, status, note)
         values ($1, 0, 0.8, 'pending', $2)
         on conflict (account_id) do nothing`,
        [accountId, `tail-end coverage bridge, 2026-09-07 -- verified real venue (${row.vendorName}), zero posts in corpus, queued for tagged-feed crawl`]
      );

      bridged++;
      console.log(`[bridge] vendor ${row.vendorId} (${row.vendorName}) -> account ${accountId} (@${row.username})`);
    }
    console.log(`[bridge] ${dryRun ? "DRY RUN — " : ""}bridged=${bridged}`);

    if (dryRun) {
      await client.query("rollback");
      console.log("[bridge] DRY RUN — rolled back, no changes committed");
    } else {
      await client.query("commit");
      console.log("[bridge] COMMITTED");
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
