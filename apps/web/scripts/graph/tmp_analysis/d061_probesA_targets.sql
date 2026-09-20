-- D061 tick 3 "Probes A" (2026-09-20): listed metro venues at 1-5 documented weddings whose tagged feed
-- has never been crawled (crawl no.1, the pilot or the canary), plus known alias siblings of listed
-- venues. x 25 tagged posts each. Ordered by the same prior score as the canary (venue_type class,
-- follower band, Places reviews/type), so a --max-cost-usd cap truncates from the bottom.
-- Excluded: hotels / houses of worship / restaurants (0.02-0.11 weddings per post in crawl no.1),
-- private accounts, brand handles (already excluded by never having been listed).
with venue as (
  select a.id, a.username::text u, a.followers, a.venue_type,
    (select count(*) from weddings w where w.venue_id=a.id) nw,
    (select status::text from ops.crawl_frontier f where f.account_id=a.id) frontier_status,
    (select (v.raw->>'review_count')::int from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) reviews,
    (select v.raw->>'primary_type' from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) ptype,
    'listed' as why
  from accounts a join v_account_role r on r.account_id=a.id and r.role='venue'
  join account_locations al on al.account_id=a.id and al.in_metro
  where coalesce(a.is_private,false)=false),
 siblings as (
  select al.alias_account_id id, a.username::text u, a.followers, a.venue_type, 0 nw,
    (select status::text from ops.crawl_frontier f where f.account_id=al.alias_account_id) frontier_status,
    null::int reviews, null::text ptype, 'alias sibling of '||c.username::text as why
  from account_aliases al join accounts a on a.id=al.alias_account_id join accounts c on c.id=al.canonical_account_id
  where coalesce(a.is_private,false)=false
    and exists (select 1 from v_account_role r join account_locations l on l.account_id=r.account_id and l.in_metro where r.account_id=al.canonical_account_id and r.role='venue')),
 pool as (
  select * from venue where nw between 1 and 5
  union all
  select * from siblings)
select id, u, why, followers, venue_type, nw, reviews, ptype,
  (case when venue_type in ('farm_estate','event_space','park_outdoor','museum') then 2 when venue_type is null then 1 else 0 end
   + case when followers between 3000 and 10000 then 2 when followers between 1000 and 30000 then 1 else 0 end
   + case when reviews is null then 0 when reviews between 50 and 1000 then 1 else -1 end
   + case when ptype in ('event_venue','wedding_venue','banquet_hall') then 1 when ptype = 'hotel' then -2 else 0 end) prior_score
from pool
where coalesce(frontier_status,'') <> 'crawled'
  and coalesce(venue_type,'') not in ('hotel','house_of_worship','restaurant')
  and not exists (select 1 from ops.crawl_targets t where t.account_id=pool.id and t.feed='tagged' and t.tier <> 'profile')
order by prior_score desc, nw desc, coalesce(followers,0) desc;
