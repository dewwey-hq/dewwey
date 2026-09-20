/**
 * D062 -- "why is this venue not on /venues, and what would actually fix it?"
 *
 * reportVenueCoverage.ts answers what IS listed (434 venues as of 2026-09-20) and names four
 * hidden classes. This script answers the next question, the one that kept getting re-derived by
 * hand: for every venue-ish account that is NOT listed, WHICH remedy applies? The answer is not
 * one thing, which is the whole finding -- crawling more feeds is the right move for a minority of
 * them and a waste for the rest.
 *
 * The bar is the user's (2026-09-20): a venue is "covered" at >= 1 documented wedding. That is
 * also `/venues`' own listing predicate, so "covered" and "listed" collapse to the same question
 * and the entire problem is the set of venue-ish accounts sitting outside it.
 *
 * The taxonomy, in the order a fix should be attempted (cheapest and most certain first):
 *
 *   merged_away     Already resolved into a canonical venue via account_aliases. Not a gap --
 *                   it is the same venue counted once. Listed so the catalog delta is explainable.
 *   geo_blocked     Has >= 1 wedding, so it clears the bar, but has no account_locations row (or
 *                   in_metro=false) and therefore cannot appear. Fix is geography, not acquisition.
 *   mis_anchored    A wedding points at this account but its top role is not venue/hotel -- a
 *                   florist or planner became the "venue". Fix is re-anchoring.
 *   chain_brand     A chain/umbrella handle standing in for a local property (@marriottbonvoy for
 *                   JW Marriott Chicago). Never list, never merge; the property needs its own row.
 *   not_a_venue     Carries a venue role but is not a wedding venue (@wix, @squarespace). Delist.
 *   dead_feed       Real venue, zero weddings, own tagged feed measured `dead` -- >= 20 posts
 *                   fetched, 0 stacks, 0 candidates. More tagged crawling will not help; the
 *                   remedy is the website or a credited vendor's own feed.
 *   never_crawled   Real venue, zero weddings, feed never pulled. The only class where a crawl is
 *                   the obviously right next step.
 *   no_identity     Zero weddings, never profile-scraped, no website and no Places row -- we do
 *                   not know enough about it to choose a remedy. Enrich first.
 *
 * Read-only: issues no writes, safe to run any time with no flags.
 *
 * Usage (from apps/web):
 *   bun run scripts/graph/reportVenueIdentityTaxonomy.ts
 *   bun run scripts/graph/reportVenueIdentityTaxonomy.ts --json-only
 *
 * Output: scripts/graph/tmp_analysis/venue_identity_taxonomy_<YYYY-MM-DD>.{md,json}
 */
import { writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";
import { isUmbrellaBrandUsername } from "./venueAliasSignals";

export type Bucket =
  | "merged_away"
  | "geo_blocked"
  | "mis_anchored"
  | "chain_brand"
  | "not_a_venue"
  | "dead_feed"
  | "never_crawled"
  | "no_identity";

export interface VenueRow {
  id: number;
  username: string;
  followers: number | null;
  weddings: number;
  isAlias: boolean;
  hasLocationRow: boolean;
  inMetro: boolean;
  topRoleIsVenueOrHotel: boolean;
  crawlStatus: string | null;
  postsFetched: number;
  hasWebsite: boolean;
  hasPlaces: boolean;
  scraped: boolean;
  biography: string | null;
}

/** A handle that is plainly not a wedding venue however it got a venue role. These are the
 * measured cases from the 2026-09-20 sweep -- website builders and national brands that reached a
 * venue role through credit-line parsing ("site by @squarespace"). Kept as an explicit list rather
 * than a heuristic: the cost of a wrong guess here is delisting a real venue. */
const NOT_A_VENUE_USERNAMES = new Set([
  "wix",
  "squarespace",
  "patelbrothers",
  "indochinoweddings",
  "herecomestheguide",
  "modernluxury",
  "theamericanlegion",
]);

/** Pure: assign one bucket to one venue row. Exported for DB-free unit tests -- every fact it
 * needs is already resolved by the caller, same split as venueAliasSignals.ts. Order matters:
 * the first matching rule wins, cheapest/most-certain remedy first. */
export function classifyVenue(row: VenueRow): Bucket {
  if (row.isAlias) return "merged_away";
  if (NOT_A_VENUE_USERNAMES.has(row.username.toLowerCase())) return "not_a_venue";
  // An umbrella handle with no weddings of its own is a chain standing in for a property. One
  // WITH weddings is left alone -- it is functioning as a venue in the graph whatever its name.
  if (row.weddings === 0 && isUmbrellaBrandUsername(row.username)) return "chain_brand";
  // Clears the >= 1 bar but cannot be listed. Geography, not acquisition.
  if (row.weddings >= 1 && (!row.hasLocationRow || !row.inMetro)) return "geo_blocked";
  if (row.weddings >= 1 && !row.topRoleIsVenueOrHotel) return "mis_anchored";
  if (row.weddings === 0) {
    if (row.crawlStatus === "dead") return "dead_feed";
    if (!row.scraped && !row.hasWebsite && !row.hasPlaces) return "no_identity";
    if (row.postsFetched === 0) return "never_crawled";
    return "no_identity";
  }
  // weddings >= 1, located, in metro, correctly roled -- this row is listed and not a gap.
  return "merged_away";
}

const SQL = `
  with venueish as (
    select distinct a.id
    from accounts a
    join v_account_role r on r.account_id = a.id and r.role in ('venue','hotel')
    union
    select distinct w.venue_id as id from weddings w where w.venue_id is not null
  )
  select
    a.id::int                                            as id,
    a.username::text                                     as username,
    a.followers                                          as followers,
    a.profile_scraped_at is not null                     as scraped,
    a.biography                                          as biography,
    (select count(*) from weddings w where w.venue_id = a.id)::int as weddings,
    exists (select 1 from account_aliases aa where aa.alias_account_id = a.id) as is_alias,
    exists (select 1 from account_locations al where al.account_id = a.id)     as has_location_row,
    coalesce((select al.in_metro from account_locations al where al.account_id = a.id), false) as in_metro,
    exists (select 1 from v_account_role r2 where r2.account_id = a.id and r2.role in ('venue','hotel')) as top_role_venue_or_hotel,
    (select t.status from ops.crawl_targets t
      where t.account_id = a.id and t.feed = 'tagged' order by t.id desc limit 1) as crawl_status,
    (select count(distinct o.post_id) from ops.post_observations o where o.seed_account_id = a.id)::int as posts_fetched,
    (a.external_url is not null and a.external_url <> '')                      as has_website,
    exists (select 1 from vendors v where v.account_id = a.id and v.discovery_source = 'google_places') as has_places
  from venueish u
  join accounts a on a.id = u.id
`;

const REMEDY: Record<Bucket, string> = {
  merged_away: "none -- same venue, counted once (or already listed)",
  geo_blocked: "backfill account_locations (Places / Jeremy staging address), then it lists",
  mis_anchored: "re-anchor the wedding to the real venue",
  chain_brand: "never list, never merge -- the local property needs its own account",
  not_a_venue: "delist: strip the venue role",
  dead_feed: "website or a credited vendor's own feed -- NOT more tagged crawling",
  never_crawled: "crawl the tagged feed",
  no_identity: "profile-scrape / website first, then re-classify",
};

async function main() {
  const jsonOnly = process.argv.includes("--json-only");
  const pool = getPool();
  const { rows } = await pool.query(SQL);

  const classified = rows.map((r: Record<string, unknown>) => {
    const row: VenueRow = {
      id: Number(r.id),
      username: String(r.username),
      followers: r.followers == null ? null : Number(r.followers),
      weddings: Number(r.weddings),
      isAlias: Boolean(r.is_alias),
      hasLocationRow: Boolean(r.has_location_row),
      inMetro: Boolean(r.in_metro),
      topRoleIsVenueOrHotel: Boolean(r.top_role_venue_or_hotel),
      crawlStatus: r.crawl_status == null ? null : String(r.crawl_status),
      postsFetched: Number(r.posts_fetched ?? 0),
      hasWebsite: Boolean(r.has_website),
      hasPlaces: Boolean(r.has_places),
      scraped: Boolean(r.scraped),
      biography: r.biography == null ? null : String(r.biography),
    };
    return { ...row, bucket: classifyVenue(row) };
  });

  const byBucket = new Map<Bucket, typeof classified>();
  for (const c of classified) {
    if (!byBucket.has(c.bucket)) byBucket.set(c.bucket, []);
    byBucket.get(c.bucket)!.push(c);
  }

  const order: Bucket[] = [
    "geo_blocked",
    "mis_anchored",
    "never_crawled",
    "dead_feed",
    "no_identity",
    "chain_brand",
    "not_a_venue",
    "merged_away",
  ];

  console.log(`[venue-identity-taxonomy] venue-ish accounts examined: ${classified.length}`);
  console.log(`[venue-identity-taxonomy] covered (>= 1 wedding): ${classified.filter((c) => c.weddings >= 1).length}`);
  console.log("");
  const lines: string[] = [
    `# Venue identity taxonomy -- why a venue is not listed (D062)`,
    ``,
    `Generated ${new Date().toISOString()}. Read-only.`,
    `Bar: a venue is covered at >= 1 documented wedding (user's call, 2026-09-20), which is also`,
    `\`/venues\`' own listing predicate.`,
    ``,
    `| bucket | accounts | weddings held | remedy |`,
    `|---|---|---|---|`,
  ];
  for (const b of order) {
    const rowsIn = byBucket.get(b) ?? [];
    const weddings = rowsIn.reduce((n, r) => n + r.weddings, 0);
    console.log(`  ${b.padEnd(14)} ${String(rowsIn.length).padStart(5)} accounts, ${String(weddings).padStart(5)} weddings  -- ${REMEDY[b]}`);
    lines.push(`| \`${b}\` | ${rowsIn.length} | ${weddings} | ${REMEDY[b]} |`);
  }

  // The actionable head of each bucket: biggest first, since a venue with weddings already held
  // or a big following is worth a human's attention before the long tail.
  for (const b of order) {
    const rowsIn = (byBucket.get(b) ?? [])
      .slice()
      .sort((x, y) => y.weddings - x.weddings || (y.followers ?? 0) - (x.followers ?? 0));
    if (rowsIn.length === 0) continue;
    lines.push(``, `## ${b} (${rowsIn.length}) -- ${REMEDY[b]}`, ``, `| handle | followers | weddings | crawl | website |`, `|---|---|---|---|---|`);
    for (const r of rowsIn.slice(0, 40)) {
      lines.push(
        `| @${r.username} | ${r.followers ?? "-"} | ${r.weddings} | ${r.crawlStatus ?? "-"} | ${r.hasWebsite ? "y" : "-"} |`
      );
    }
    if (rowsIn.length > 40) lines.push(`| _… ${rowsIn.length - 40} more, see the JSON_ | | | | |`);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `scripts/graph/tmp_analysis/venue_identity_taxonomy_${stamp}`;
  writeFileSync(`${base}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), counts: Object.fromEntries(order.map((b) => [b, (byBucket.get(b) ?? []).length])), rows: classified }, null, 2));
  if (!jsonOnly) writeFileSync(`${base}.md`, lines.join("\n") + "\n");
  console.log(`\n[venue-identity-taxonomy] wrote ${base}.json${jsonOnly ? "" : ` and ${base}.md`}`);
  await closePool();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
