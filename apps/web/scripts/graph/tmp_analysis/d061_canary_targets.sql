-- D061 canary (tick 2b, 2026-09-20): 20 probe venues from the top prior band + 5 vendor feeds, x 25
-- tagged posts each. Probe yield is the unknown the canary measures (Gate 1a: >= 0.03 weddings/post
-- in the top band, else re-rank before probes A spends ~$15).
--
-- PART 1 -- venue probes (run AFTER tick 2 profiles landed; needs followers). Top prior band per the
-- README priors: listed metro venue at 1-5 weddings, tagged feed never crawled, followers 1k-30k,
-- venue_type in the productive classes (or unknown), not a hotel/restaurant/church/brand handle,
-- Places review_count < 1000 when known. Ordered by a simple prior score, then wedding count desc.
with venue as (
  select a.id, a.username::text u, a.followers, a.venue_type,
    (select count(*) from weddings w where w.venue_id=a.id) nw,
    (select status::text from ops.crawl_frontier f where f.account_id=a.id) frontier_status,
    (select (v.raw->>'review_count')::int from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) reviews,
    (select v.raw->>'primary_type' from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) ptype
  from accounts a join v_account_role r on r.account_id=a.id and r.role='venue'
  join account_locations al on al.account_id=a.id and al.in_metro
  where coalesce(a.is_private,false)=false)
select id, u, followers, venue_type, nw, reviews, ptype,
  (case when venue_type in ('farm_estate','event_space','park_outdoor','museum') then 2 when venue_type is null then 1 else 0 end
   + case when followers between 3000 and 10000 then 2 when followers between 1000 and 30000 then 1 else 0 end
   + case when reviews is null then 0 when reviews between 50 and 1000 then 1 else -1 end
   + case when ptype in ('event_venue','wedding_venue') then 1 when ptype = 'hotel' then -2 else 0 end) prior_score
from venue
where nw between 1 and 5 and coalesce(frontier_status,'') <> 'crawled'
  and followers between 1000 and 30000
  and coalesce(venue_type,'') not in ('hotel','house_of_worship','restaurant')
  and not exists (select 1 from ops.crawl_targets t where t.account_id=venue.id and t.feed='tagged')
order by prior_score desc, nw desc, followers desc
limit 20;
