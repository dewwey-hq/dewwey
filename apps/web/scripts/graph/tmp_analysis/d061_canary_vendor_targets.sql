-- PART 2 -- 5 vendor tagged feeds for the canary: Chicago planners / caterers / DJs / florists whose
-- OWN posts had a high wedding yield in Jeremy's corpus (tier A, >= 30%), metro-located, whose tagged
-- feed has never been crawled. Their tagged feeds out-yielded venue feeds 0.37 vs 0.14 in crawl no.1.
with sp as (select sp.post_url, lower(sp.owner_username) u from staging.instagram_posts sp),
 j as (select url from posts where source='jeremy_evidence'),
 au as (select u, count(*) posts, count(j.url) wp from sp left join j on j.url=sp.post_url group by u having count(*)>=10)
select a.id, a.username::text u, r.role::text role, au.posts, au.wp, round(au.wp::numeric/au.posts,2) yield, a.followers
from au join accounts a on a.username::text=au.u
join v_account_role r on r.account_id=a.id and r.role::text in ('planner','catering','dj','florist','officiant','photo_booth')
where au.wp::numeric/au.posts >= 0.3 and coalesce(a.is_private,false)=false
  and coalesce((select status::text from ops.crawl_frontier f where f.account_id=a.id),'') <> 'crawled'
  -- geography: vendors rarely have an account_locations row; Jeremy's vendor table (staging.vendors)
  -- is Chicago by construction, so membership there is the market signal for a vendor feed
  and (exists (select 1 from account_locations al where al.account_id=a.id and al.in_metro)
       or exists (select 1 from staging.vendors sv where lower(sv.instagram_handle)=a.username::text))
order by au.wp desc limit 8;
