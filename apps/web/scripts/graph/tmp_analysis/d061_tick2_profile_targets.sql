-- D061 tick 2 (2026-09-20): every account the month-1 ticks will target that has never had a profile
-- scrape (accounts.profile_scraped_at is null). Four sources, deduplicated:
--   a) metro venue accounts (role venue + in_metro) -- the listed + zero-wedding set (probe targets)
--   b) pending hop-0 frontier venues (queued since D050/D052, never crawled)
--   c) alias accounts (sibling handles) -- their bios name the family
--   d) tier A/B own-profile authors (>= 15% wedding-post yield in Jeremy's corpus; candidate vendor feeds)
-- Output: one account id per line, for runTick.ts --feed profile --account-ids.
with a as (
  select a.id from accounts a join v_account_role r on r.account_id=a.id and r.role='venue'
  join account_locations al on al.account_id=a.id and al.in_metro),
 b as (select f.account_id id from ops.crawl_frontier f where f.hops=0 and f.status='pending'),
 c as (select alias_account_id id from account_aliases),
 sp as (select sp.post_url, lower(sp.owner_username) u from staging.instagram_posts sp),
 j as (select url from posts where source='jeremy_evidence'),
 au as (select u, count(*) posts, count(j.url) wp from sp left join j on j.url=sp.post_url group by u having count(*)>=10),
 d as (select acc.id from au join accounts acc on acc.username::text=au.u where au.wp::numeric/au.posts >= 0.15),
 all_ids as (select id from a union select id from b union select id from c union select id from d)
select all_ids.id
from all_ids join accounts acc on acc.id=all_ids.id
where acc.profile_scraped_at is null and coalesce(acc.is_private,false)=false
order by all_ids.id;
