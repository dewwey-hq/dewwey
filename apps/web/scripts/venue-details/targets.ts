/**
 * VenueDetails v3 fill loop (D060 Phase 3) -- the fill population, in tick order, one command.
 * Same shape as `scripts/acquire/targets.ts`: read-only, prints a ranked table, optionally writes
 * one account_id per line to `--ids-file` for `runTick.ts`.
 *
 * Population = `listedVenueAccountIds` (universe.ts, the live `/venues` browse predicate) INTERSECT
 * `venue_websites` rows with `status = 'verified'`, MINUS accounts that already have a
 * `venue_details` row (already served). No extra alias join is needed here:
 * `discoverWebsites.ts` always writes `venue_websites.account_id` as the CANONICAL account id
 * (its candidates come from `listedVenueAccountIds`, which is canonical-only by construction --
 * see universe.ts's docstring), so a plain `account_id = any(listed)` join already covers alias
 * siblings' websites under the canonical id.
 *
 * Order: wedding count desc, then rows with a `wedding_url` first, then account_id asc (plan:
 * "Order: wedding count desc ..., then rows with wedding_url first, then account_id").
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/targets.ts --band 20+ --limit 30 --ids-file scripts/graph/tmp_analysis/vd_f1.ids
 *   bun run scripts/venue-details/targets.ts --limit 5
 *   bun run scripts/venue-details/targets.ts --band 6-19 --json
 */
import { writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";
import { listedVenueAccountIds } from "./universe";

export type Band = "20+" | "6-19" | "1-5" | "all";
const BANDS: Band[] = ["20+", "6-19", "1-5", "all"];

interface Args {
  band: Band;
  limit: number;
  idsFile: string | null;
  json: boolean;
}

function usage(): never {
  console.error("[targets] Usage: bun run scripts/venue-details/targets.ts [--band 20+|6-19|1-5|all] [--limit N] [--ids-file <path>] [--json]");
  process.exit(1);
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const bandRaw = get("--band") ?? "all";
  if (!BANDS.includes(bandRaw as Band)) usage();
  return {
    band: bandRaw as Band,
    limit: Number(get("--limit") ?? "30"),
    idsFile: get("--ids-file") ?? null,
    json: a.includes("--json"),
  };
}

/** Pure: which wedding-count band a venue falls in (every listed venue has >= 1 documented
 * wedding -- `universe.ts`'s predicate requires it -- so this always resolves to one of the three
 * real bands). Exported for unit testing. */
export function bandOf(weddings: number): Band {
  if (weddings >= 20) return "20+";
  if (weddings >= 6) return "6-19";
  return "1-5";
}

/** Pure: does a venue's band match the requested `--band` filter. Exported for unit testing. */
export function bandMatches(filter: Band, weddings: number): boolean {
  return filter === "all" || bandOf(weddings) === filter;
}

export interface TargetRow {
  accountId: number;
  username: string;
  weddings: number;
  website: string | null;
  hasWeddingUrl: boolean;
  band: Band;
}

/** Pure: the plan's tick order (wedding count desc, wedding_url-found first, account_id asc),
 * applied after band filtering. Exported for unit testing. */
export function rankTargets(rows: TargetRow[], filterBand: Band, limit: number): TargetRow[] {
  return rows
    .filter((r) => bandMatches(filterBand, r.weddings))
    .sort((a, b) => b.weddings - a.weddings || Number(b.hasWeddingUrl) - Number(a.hasWeddingUrl) || a.accountId - b.accountId)
    .slice(0, limit);
}

interface QueryRow {
  id: string;
  username: string;
  weddings: number;
  website: string | null;
  wedding_url: string | null;
}

async function loadCandidates(listedIds: number[]): Promise<TargetRow[]> {
  if (listedIds.length === 0) return [];
  const pool = getPool();
  const { rows } = await pool.query<QueryRow>(
    `select a.id::text as id, a.username::text as username,
            coalesce(wc.n_weddings, 0)::int as weddings,
            vw.url as website, vw.wedding_url as wedding_url
     from accounts a
     join venue_websites vw on vw.account_id = a.id and vw.status = 'verified'
     left join (select venue_id, count(*) as n_weddings from weddings group by venue_id) wc on wc.venue_id = a.id
     where a.id = any($1::bigint[])
       and not exists (select 1 from venue_details vd where vd.account_id = a.id)`,
    [listedIds]
  );
  return rows.map((r) => ({
    accountId: Number(r.id),
    username: r.username,
    weddings: r.weddings,
    website: r.website,
    hasWeddingUrl: r.wedding_url != null,
    band: bandOf(r.weddings),
  }));
}

async function main() {
  const args = parseArgs();
  const pool = getPool();

  const listedIds = await listedVenueAccountIds(pool);
  const candidates = await loadCandidates(listedIds);
  const ranked = rankTargets(candidates, args.band, args.limit);

  if (args.json) {
    console.log(JSON.stringify(ranked, null, 2));
  } else {
    console.log(`[targets] listed=${listedIds.length} verified-website-unserved=${candidates.length} band=${args.band} selected=${ranked.length}`);
    console.log("  account_id | username | weddings | website | wedding_url? | band");
    for (const r of ranked) {
      console.log(`  ${r.accountId} | ${r.username} | ${r.weddings} | ${r.website ?? "-"} | ${r.hasWeddingUrl ? "yes" : "no"} | ${r.band}`);
    }
  }

  if (args.idsFile) {
    writeFileSync(args.idsFile, ranked.map((r) => r.accountId).join("\n") + "\n");
    console.log(`[targets] wrote ${ranked.length} ids to ${args.idsFile}`);
  }

  await closePool();
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
