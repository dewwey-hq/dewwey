/**
 * ACQUISITION LOOP (D061) -- rank crawl targets for a tier from priors, so a tick is one command.
 *
 * Sources per tier (docs/engineering/acquisition-loop/README.md §1-2):
 *   probe   metro venue accounts (role venue + in_metro) at 0-5 documented weddings whose tagged feed
 *           was never crawled (crawl no.1, pilot, canary, probes) -- coverage play
 *   alias   alias siblings of listed venues (account_aliases), never crawled
 *   vendor  Chicago planners / caterers / DJs / florists / officiants / photo booths whose OWN posts
 *           had a >= 0.3 wedding yield in Jeremy's corpus (tagged feeds out-yield venue feeds 0.37 vs 0.14)
 *   deepen  venues already crawled with a measured prior >= 0.2 (status promising), for a deeper pull
 *   probe6  (2026-09-20, remainder tick) metro venue accounts at 6-15 documented weddings never tagged-crawled
 *           -- documented from Jeremy's corpus / vendor feeds only, their own tagged feed is untouched
 *   discovered (2026-09-20) hop-1 `ops.crawl_frontier` rows still pending (co-tagged by crawl no.1's venues),
 *           venue role + in_metro, never crawled -- the "discovered venues" Ben's crawler queued but never ran
 * Prior per target = the LATEST ops.crawl_targets row for (account, feed) when one exists (measured by
 * measure.ts), else the lookup prior from features: venue_type class, follower band, Places reviews /
 * primary_type (venues) or role (vendors). Excluded always: status dead/excluded, private, brand
 * handles (never listed). Venue types are a prior, never an exclusion (low-types probe, 2026-09-20).
 *
 * Read-only. Prints the ranked table and writes the ids (one per line) to --ids-file for runTick.ts.
 *   bun run scripts/acquire/targets.ts --tier probe --limit 90 --ids-file /tmp/probesB.txt
 *   bun run scripts/acquire/targets.ts --tier vendor --limit 100 --ids-file /tmp/vendor.txt
 */
import { writeFileSync } from "node:fs";
import { getPool, closePool } from "../classify/db";

export type Tier = "probe" | "probe6" | "discovered" | "alias" | "vendor" | "deepen";

/** Pure: the README §1a lookup prior for a venue's tagged feed (weddings per post). */
export function venueLookupPrior(f: { venue_type: string | null; followers: number | null; reviews: number | null; ptype: string | null }): number {
  let p = 0.08;
  if (f.venue_type && ["farm_estate", "event_space", "park_outdoor", "museum"].includes(f.venue_type)) p += 0.06;
  else if (f.venue_type == null) p += 0.02;
  if (f.followers != null) {
    if (f.followers >= 3000 && f.followers <= 10000) p += 0.06;
    else if (f.followers >= 1000 && f.followers <= 30000) p += 0.03;
    else if (f.followers > 100000) p -= 0.05;
  }
  if (f.reviews != null) p += f.reviews >= 50 && f.reviews <= 1000 ? 0.02 : f.reviews > 1000 ? -0.04 : 0;
  if (f.ptype === "event_venue" || f.ptype === "wedding_venue" || f.ptype === "banquet_hall") p += 0.03;
  if (f.ptype === "hotel") p -= 0.06;
  return Math.max(0.01, Math.round(p * 1000) / 1000);
}

/** Pure: README §1a role priors for a non-venue vendor's tagged feed. */
export function vendorLookupPrior(role: string | null, ownYield: number | null): number {
  const byRole: Record<string, number> = { planner: 0.41, dj: 0.42, catering: 0.36, florist: 0.31, officiant: 0.36, photo_booth: 0.26, photographer: 0.23, videographer: 0.21 };
  const base = (role && byRole[role]) || 0.2;
  return ownYield != null ? Math.round(((base + ownYield) / 2) * 1000) / 1000 : base;
}

interface Row {
  id: number;
  username: string;
  why: string;
  followers: number | null;
  venue_type: string | null;
  reviews: number | null;
  ptype: string | null;
  role: string | null;
  own_yield: number | null;
  nw: number;
  measured_prior: number | null;
  measured_status: string | null;
}

const VENUE_POOL = `
  select a.id, a.username::text username, 'listed venue' why, a.followers, a.venue_type,
    (select (v.raw->>'review_count')::int from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) reviews,
    (select v.raw->>'primary_type' from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) ptype,
    null::text role, null::numeric own_yield,
    (select count(*) from weddings w where w.venue_id=a.id)::int nw
  from accounts a join v_account_role r on r.account_id=a.id and r.role='venue'
  join account_locations al on al.account_id=a.id and al.in_metro
  where coalesce(a.is_private,false)=false`;
  // 2026-09-20: hotels / restaurants / houses of worship are NOT excluded any more -- the 41 at 1-5
  // weddings the plan had skipped yielded 49 weddings from 984 posts (0.05/post, 7 venues into 6+).
  // venueLookupPrior still ranks them lower; the budget cap, not a type filter, decides the cut.

const ALIAS_POOL = `
  select a.id, a.username::text username, 'alias sibling of '||c.username::text why, a.followers, a.venue_type,
    null::int reviews, null::text ptype, null::text role, null::numeric own_yield, 0 nw
  from account_aliases x join accounts a on a.id=x.alias_account_id join accounts c on c.id=x.canonical_account_id
  where coalesce(a.is_private,false)=false
    and exists (select 1 from v_account_role r join account_locations l on l.account_id=r.account_id and l.in_metro
                where r.account_id=x.canonical_account_id and r.role='venue')`;

const DISCOVERED_POOL = `
  select a.id, a.username::text username, 'frontier hop-1 pending (co-tagged by crawl no.1)' why, a.followers, a.venue_type,
    (select (v.raw->>'review_count')::int from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) reviews,
    (select v.raw->>'primary_type' from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) ptype,
    null::text role, null::numeric own_yield,
    (select count(*) from weddings w where w.venue_id=a.id)::int nw
  from ops.crawl_frontier f join accounts a on a.id=f.account_id
  join v_account_role r on r.account_id=a.id and r.role='venue'
  join account_locations al on al.account_id=a.id and al.in_metro
  where f.hops=1 and f.status='pending' and coalesce(a.is_private,false)=false`;

const VENDOR_POOL = `
  with sp as (select sp.post_url, lower(sp.owner_username) u from staging.instagram_posts sp),
       j as (select url from posts where source='jeremy_evidence'),
       au as (select u, count(*) posts, count(j.url) wp from sp left join j on j.url=sp.post_url group by u having count(*)>=10)
  select a.id, a.username::text username, 'tier-A vendor ('||r.role::text||')' why, a.followers, null::text venue_type,
    null::int reviews, null::text ptype, r.role::text role, round(au.wp::numeric/au.posts,3) own_yield, 0 nw
  from au join accounts a on a.username::text=au.u
  join v_account_role r on r.account_id=a.id and r.role::text in ('planner','catering','dj','florist','officiant','photo_booth')
  where au.wp::numeric/au.posts >= 0.3 and coalesce(a.is_private,false)=false
    and (exists (select 1 from account_locations al where al.account_id=a.id and al.in_metro)
         or exists (select 1 from staging.vendors sv where lower(sv.instagram_handle)=a.username::text))`;

async function main() {
  const argv = process.argv.slice(2);
  const get = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
  const tier = get("--tier") as Tier | undefined;
  const limit = Number(get("--limit") ?? "50");
  const idsFile = get("--ids-file");
  if (!tier || !["probe", "probe6", "discovered", "alias", "vendor", "deepen"].includes(tier)) {
    console.error("Usage: bun run scripts/acquire/targets.ts --tier probe|probe6|discovered|alias|vendor|deepen [--limit N] [--ids-file path]");
    process.exit(2);
  }
  const pool = getPool();
  const poolSql = tier === "vendor" ? VENDOR_POOL : tier === "alias" ? ALIAS_POOL : tier === "discovered" ? DISCOVERED_POOL : VENUE_POOL;
  const { rows } = await pool.query<Row>(
    `with pool as (${poolSql}),
     latest as (
       select distinct on (account_id) account_id, prior_w_per_post, status, tier
       from ops.crawl_targets where feed='tagged' and tier <> 'profile' order by account_id, evaluated_at desc),
     crawled as (
       select account_id from ops.crawl_frontier where status='crawled'
       union select account_id from latest)
     select p.*, l.prior_w_per_post::float measured_prior, l.status measured_status
     from pool p left join latest l on l.account_id = p.id
     where ${tier === "deepen" ? "l.status = 'promising' and l.prior_w_per_post >= 0.2" : "not exists (select 1 from crawled c where c.account_id = p.id)"}
       ${tier === "probe" ? "and p.nw <= 5" : tier === "probe6" ? "and p.nw between 6 and 15" : ""}
       and coalesce(l.status,'') not in ('dead','excluded')`
  );
  const ranked = rows
    .map((r) => {
      const prior =
        r.measured_prior != null
          ? r.measured_prior
          : tier === "vendor"
            ? vendorLookupPrior(r.role, r.own_yield != null ? Number(r.own_yield) : null)
            : venueLookupPrior(r);
      return { ...r, prior };
    })
    .sort((a, b) => b.prior - a.prior || b.nw - a.nw || (b.followers ?? 0) - (a.followers ?? 0))
    .slice(0, limit);
  console.log(`[targets] tier=${tier} pool=${rows.length} selected=${ranked.length} (est. $${(ranked.length * 25 * 0.0023).toFixed(2)} at 25 posts each)`);
  console.log("  id | account | prior | src | followers | venue_type/role | weddings | why");
  for (const r of ranked) {
    console.log(
      `  ${r.id} | ${r.username} | ${r.prior.toFixed(3)} | ${r.measured_prior != null ? "measured:" + r.measured_status : "lookup"} | ${r.followers ?? "-"} | ${r.venue_type ?? r.role ?? "-"} | ${r.nw} | ${r.why}`
    );
  }
  if (idsFile) {
    writeFileSync(idsFile, ranked.map((r) => r.id).join("\n") + "\n");
    console.log(`[targets] wrote ${ranked.length} ids to ${idsFile}`);
  }
  await closePool();
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
