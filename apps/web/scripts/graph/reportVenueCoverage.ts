/**
 * The honest coverage table over what `/venues` actually lists -- a standing metric,
 * re-runnable after every D055-style batch (docs coverage-audit plan item 6). Read-only:
 * issues no writes at all, so it's safe to run any time with no flags.
 *
 * "Listed" (Universe A) uses the EXACT same predicate `/venues` does
 * (`searchVendors` in lib/server/vendors.ts, CARD_JOINS + `AND al.in_metro`):
 * top role venue/hotel/accommodations AND >=1 documented wedding anchored on the account (bar set
 * by the user 2026-09-11) AND `account_locations.in_metro`. Weddings per account is
 * `count(*) from weddings where venue_id = account` -- that's literally what the page shows
 * (`wc.n_weddings` in CARD_SELECT); no alias-resolving through account_aliases, because the
 * page itself doesn't either.
 *
 * The four hidden classes answer "why isn't a documented venue showing up, or why is a
 * wedding pointing somewhere wrong":
 *   B: top role is venue but the account has no account_locations row at all.
 *   C: top role is venue, has a location row, but in_metro=false.
 *   D: top role is hotel but the account IS venue_id of >=1 wedding (product question:
 *      hotels don't currently appear under /venues' category=venue filter at all).
 *   E: a wedding's venue_id account's top role is neither venue nor hotel -- mis-anchored
 *      (a florist, planner, etc. ended up as the "venue"), INCLUDING accounts with no
 *      account_tags row at all (top role shown as "(none)") -- a wedding pointing at a
 *      completely untagged account is exactly as mis-anchored as one pointing at a florist.
 *
 * Read-only, so "transaction-wrapped" here just means a read-only transaction with the house
 * statement_timeout -- there's nothing to commit or roll back, but it keeps every query in
 * this report internally consistent against one snapshot instead of drifting mid-run.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/reportVenueCoverage.ts             # markdown + stdout
 *   bun run scripts/graph/reportVenueCoverage.ts --json      # also writes the per-venue rows as JSON
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";

const OUT_DIR = new URL("./tmp_analysis/", import.meta.url).pathname;
const TOP_N = 15;

interface VenueRow {
  id: string;
  username: string;
  weddings: number;
}
interface MisanchoredRow extends VenueRow {
  topRole: string;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function bucketCounts(weddings: number[]) {
  const buckets = { "0": 0, "1-5": 0, "6-15": 0, "16-49": 0, "50+": 0 };
  for (const n of weddings) {
    if (n === 0) buckets["0"]++;
    else if (n <= 5) buckets["1-5"]++;
    else if (n <= 15) buckets["6-15"]++;
    else if (n <= 49) buckets["16-49"]++;
    else buckets["50+"]++;
  }
  return buckets;
}

function topShare(sortedDesc: number[], n: number, total: number): string {
  if (total === 0) return "n/a (0 total weddings)";
  const sum = sortedDesc.slice(0, n).reduce((a, b) => a + b, 0);
  return `${sum} / ${total} (${((sum / total) * 100).toFixed(1)}%)`;
}

function renderVenueList(rows: VenueRow[]): string {
  if (rows.length === 0) return "(none)";
  return rows.map((r) => `- ${r.username} -- ${r.weddings} weddings`).join("\n");
}

function renderMisanchoredList(rows: MisanchoredRow[]): string {
  if (rows.length === 0) return "(none)";
  return rows.map((r) => `- ${r.username} -- top role: ${r.topRole} -- ${r.weddings} weddings`).join("\n");
}

async function main() {
  const wantJson = process.argv.includes("--json");
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query(`set statement_timeout = '300s'`);
    await client.query("begin");

    // ------------------------------------------------------------
    // Universe A: listed venues, identical predicate to searchVendors.
    // ------------------------------------------------------------
    const { rows: listedRaw } = await client.query<{ id: string; username: string; weddings: number }>(
      `select a.id::text, a.username::text, coalesce(wc.n_weddings, 0)::int as weddings
       from accounts a
       join v_account_role var on var.account_id = a.id
       left join account_locations al on al.account_id = a.id
       left join (
         select venue_id, count(*) as n_weddings from weddings where venue_id is not null group by venue_id
       ) wc on wc.venue_id = a.id
       -- Same predicate as searchVendors(category='venue'), including the 2026-09-10 product
       -- rule: a hotel-top account lists under venues when it hosted >=1 documented wedding.
       where al.in_metro
         and (var.role::text in ('venue', 'hotel', 'accommodations') and coalesce(wc.n_weddings, 0) > 0)
         and not exists (select 1 from account_aliases x where x.alias_account_id = a.id)`
    );
    const listed: VenueRow[] = listedRaw.map((r) => ({ id: r.id, username: r.username, weddings: r.weddings }));
    const weddingCounts = listed.map((r) => r.weddings).sort((a, b) => a - b);
    const weddingCountsDesc = [...weddingCounts].reverse();
    const totalWeddings = weddingCounts.reduce((a, b) => a + b, 0);

    // ------------------------------------------------------------
    // Hidden B / C: venue-top accounts, no account_locations row / in_metro=false.
    // ------------------------------------------------------------
    const { rows: hiddenNoLocationRaw } = await client.query<{ id: string; username: string; weddings: number }>(
      `select a.id::text, a.username::text, coalesce(wc.n_weddings, 0)::int as weddings
       from accounts a
       join v_account_role var on var.account_id = a.id and var.role = 'venue'
       left join account_locations al on al.account_id = a.id
       left join (
         select venue_id, count(*) as n_weddings from weddings where venue_id is not null group by venue_id
       ) wc on wc.venue_id = a.id
       where al.account_id is null`
    );
    const { rows: hiddenNotInMetroRaw } = await client.query<{ id: string; username: string; weddings: number }>(
      `select a.id::text, a.username::text, coalesce(wc.n_weddings, 0)::int as weddings
       from accounts a
       join v_account_role var on var.account_id = a.id and var.role = 'venue'
       join account_locations al on al.account_id = a.id
       left join (
         select venue_id, count(*) as n_weddings from weddings where venue_id is not null group by venue_id
       ) wc on wc.venue_id = a.id
       where al.in_metro = false`
    );
    const hiddenNoLocation: VenueRow[] = hiddenNoLocationRaw
      .map((r) => ({ id: r.id, username: r.username, weddings: r.weddings }))
      .sort((a, b) => b.weddings - a.weddings);
    const hiddenNotInMetro: VenueRow[] = hiddenNotInMetroRaw
      .map((r) => ({ id: r.id, username: r.username, weddings: r.weddings }))
      .sort((a, b) => b.weddings - a.weddings);

    // ------------------------------------------------------------
    // Hidden D: top role hotel, but venue_id of >=1 wedding.
    // ------------------------------------------------------------
    const { rows: hotelTopRaw } = await client.query<{ id: string; username: string; weddings: number }>(
      `select a.id::text, a.username::text, count(w.id)::int as weddings
       from accounts a
       join v_account_role var on var.account_id = a.id and var.role = 'hotel'
       join weddings w on w.venue_id = a.id
       group by a.id, a.username`
    );
    const hotelTop: VenueRow[] = hotelTopRaw
      .map((r) => ({ id: r.id, username: r.username, weddings: r.weddings }))
      .sort((a, b) => b.weddings - a.weddings);

    // ------------------------------------------------------------
    // Hidden E: weddings whose venue_id account's top role is neither venue nor hotel
    // (including accounts with no v_account_role row at all -- top_role '(none)').
    // ------------------------------------------------------------
    const { rows: misanchoredRaw } = await client.query<{ id: string; username: string; top_role: string | null; weddings: number }>(
      `select a.id::text, a.username::text, var.role::text as top_role, count(w.id)::int as weddings
       from weddings w
       join accounts a on a.id = w.venue_id
       left join v_account_role var on var.account_id = a.id
       where var.role is distinct from 'venue' and var.role is distinct from 'hotel'
       group by a.id, a.username, var.role`
    );
    const misanchored: MisanchoredRow[] = misanchoredRaw
      .map((r) => ({ id: r.id, username: r.username, topRole: r.top_role ?? "(none)", weddings: r.weddings }))
      .sort((a, b) => b.weddings - a.weddings);

    await client.query("commit"); // nothing written; closes the read-only snapshot cleanly

    // ------------------------------------------------------------
    // Stats.
    // ------------------------------------------------------------
    const buckets = bucketCounts(weddingCounts);
    const med = median(weddingCounts);
    const top50Share = topShare(weddingCountsDesc, 50, totalWeddings);
    const top100Share = topShare(weddingCountsDesc, 100, totalWeddings);

    console.log(`\n[venue-coverage] Universe A (listed on /venues): ${listed.length} venues, ${totalWeddings} weddings total`);
    console.log(`[venue-coverage] buckets: 0=${buckets["0"]} 1-5=${buckets["1-5"]} 6-15=${buckets["6-15"]} 16-49=${buckets["16-49"]} 50+=${buckets["50+"]}`);
    console.log(`[venue-coverage] median weddings/venue: ${med}`);
    console.log(`[venue-coverage] top 50 share: ${top50Share}`);
    console.log(`[venue-coverage] top 100 share: ${top100Share}`);

    console.log(`\n[venue-coverage] hidden B (venue-top, no account_locations row): ${hiddenNoLocation.length} accounts, ${hiddenNoLocation.reduce((a, r) => a + r.weddings, 0)} weddings`);
    console.log(`[venue-coverage] hidden C (venue-top, in_metro=false): ${hiddenNotInMetro.length} accounts, ${hiddenNotInMetro.reduce((a, r) => a + r.weddings, 0)} weddings`);
    console.log(`[venue-coverage] hidden D (hotel-top, venue_id of >=1 wedding): ${hotelTop.length} accounts, ${hotelTop.reduce((a, r) => a + r.weddings, 0)} weddings`);
    console.log(`[venue-coverage] hidden E (mis-anchored -- venue_id account's top role isn't venue/hotel): ${misanchored.length} accounts, ${misanchored.reduce((a, r) => a + r.weddings, 0)} weddings`);

    // ------------------------------------------------------------
    // Output files.
    // ------------------------------------------------------------
    const today = new Date().toISOString().slice(0, 10);
    mkdirSync(OUT_DIR, { recursive: true });
    const mdPath = `${OUT_DIR}venue_coverage_${today}.md`;

    const md = `# Venue coverage report (${today})

Universe A ("listed"): \`v_account_role.role = 'venue'\` AND \`account_locations.in_metro\` --
identical predicate to \`searchVendors\` (lib/server/vendors.ts), what \`/venues\` actually shows.
Weddings per account = \`count(*) from weddings where venue_id = account\` (no alias-resolving --
the page doesn't either).

## Universe A summary

- Listed venues: **${listed.length}**
- Total weddings (anchored to a listed venue): **${totalWeddings}**
- Buckets: 0=${buckets["0"]}  1-5=${buckets["1-5"]}  6-15=${buckets["6-15"]}  16-49=${buckets["16-49"]}  50+=${buckets["50+"]}
- Median weddings/venue: **${med}**
- Top 50 share: ${top50Share}
- Top 100 share: ${top100Share}

## Hidden B -- venue-top, no account_locations row at all (${hiddenNoLocation.length} accounts, ${hiddenNoLocation.reduce((a, r) => a + r.weddings, 0)} weddings)

Top ${TOP_N} by weddings:
${renderVenueList(hiddenNoLocation.slice(0, TOP_N))}

## Hidden C -- venue-top, has a location row but in_metro=false (${hiddenNotInMetro.length} accounts, ${hiddenNotInMetro.reduce((a, r) => a + r.weddings, 0)} weddings)

Top ${TOP_N} by weddings:
${renderVenueList(hiddenNotInMetro.slice(0, TOP_N))}

## Hidden D -- top role is hotel, but is venue_id of >=1 wedding (${hotelTop.length} accounts, ${hotelTop.reduce((a, r) => a + r.weddings, 0)} weddings)

Product question: hotels don't currently appear under /venues' category=venue filter.

Top ${TOP_N} by weddings:
${renderVenueList(hotelTop.slice(0, TOP_N))}

## Hidden E -- mis-anchored: venue_id account's top role is neither venue nor hotel (${misanchored.length} accounts, ${misanchored.reduce((a, r) => a + r.weddings, 0)} weddings)

Includes accounts with no account_tags row at all (top role shown as "(none)").

Top ${TOP_N} by weddings:
${renderMisanchoredList(misanchored.slice(0, TOP_N))}
`;
    writeFileSync(mdPath, md);
    console.log(`\n[venue-coverage] wrote ${mdPath}`);

    if (wantJson) {
      const jsonPath = `${OUT_DIR}venue_coverage_${today}.json`;
      writeFileSync(
        jsonPath,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            listed,
            hiddenNoLocation,
            hiddenNotInMetro,
            hotelTop,
            misanchored,
          },
          null,
          2
        )
      );
      console.log(`[venue-coverage] wrote ${jsonPath}`);
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
