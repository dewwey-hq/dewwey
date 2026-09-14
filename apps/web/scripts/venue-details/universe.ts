/**
 * Shared "listed venue" universe for every venue-details script. Replicates the `/venues`
 * browse predicate from `apps/web/lib/server/vendors.ts` (`searchVendors`, category='venue'
 * branch) so discovery/crawl/report/funnel scripts never drift from what a couple can
 * actually see. Per the plan's "Open assumptions": "Listing universe = the live result of the
 * searchVendors predicate at run time (reported in the funnel, never a remembered count)."
 *
 * Alias-aware (D060 spec resolution "Alias resolution"): `account_aliases` maps
 * alias_account_id -> canonical_account_id. searchVendors already excludes alias rows from
 * the listing itself (`NOT EXISTS (... account_aliases ...)`), so `listedVenueAccountIds`'s
 * output is canonical ids by construction. `accountAliasSet` is exposed separately so callers
 * (discoverWebsites.ts) can join vendors/venue_enrichment/accounts rows attached to a venue's
 * ALIAS accounts too -- the plan's load-bearing example is fieldmuseumspecialevents (alias)
 * -> fieldmuseum (canonical 1131), where the Places `vendors` row links to the alias handle.
 */
import type { Pool } from "pg";

/** Canonical account ids currently shown on the /venues browse (searchVendors' category='venue'
 * predicate, replicated verbatim). Always call this live -- never cache/hardcode the count. */
export async function listedVenueAccountIds(pool: Pool): Promise<number[]> {
  const { rows } = await pool.query<{ id: string }>(
    `select a.id::text as id
     from accounts a
     join v_account_role var on var.account_id = a.id
     left join account_locations al on al.account_id = a.id
     left join (
       select venue_id, count(*) as n_weddings
       from weddings
       group by venue_id
     ) wc on wc.venue_id = a.id
     where (
         -- Product rule (searchVendors, 2026-09-11): a venue lists when it is the venue of
         -- >=2 documented weddings, or 1 with a known venue type.
         (var.role = 'venue'
           and (coalesce(wc.n_weddings, 0) >= 2
                or (coalesce(wc.n_weddings, 0) = 1 and a.venue_type is not null and a.venue_type <> 'other')))
         -- A hotel/accommodations account lists under "venue" once it's been used as one.
         or (var.role::text in ('hotel', 'accommodations') and coalesce(wc.n_weddings, 0) > 0)
       )
       -- An alias handle is the same business as its canonical account and never shows as a
       -- second card (D055 count-honestly, 2026-09-10) -- this also means every id returned
       -- below is a canonical id by construction.
       and not exists (select 1 from account_aliases x where x.alias_account_id = a.id)
       and al.in_metro`
  );
  return rows.map((r) => Number(r.id));
}

/** Every account id that is "the same business" as `canonicalId`: itself plus every
 * account_aliases row pointing at it. Used to join vendors/venue_enrichment/accounts rows
 * attached to an alias handle (D060 spec resolution: "crawl/serve/lookup resolve
 * account_aliases to the canonical account first, same as getVendorProfile"). */
export async function accountAliasSet(pool: Pool, canonicalId: number): Promise<number[]> {
  const { rows } = await pool.query<{ alias_account_id: string }>(
    `select alias_account_id::text from account_aliases where canonical_account_id = $1`,
    [canonicalId]
  );
  return [canonicalId, ...rows.map((r) => Number(r.alias_account_id))];
}
