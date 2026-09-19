-- D061 (candidate) Acquisition loop — yield baselines pulled 2026-09-19 (read-only).
-- What: the "learn from our data" numbers behind docs/engineering/acquisition-loop/README.md.
-- Why: every crawl target gets an expected-yield prior; these are the priors' sources.
-- Re-run any block with: psql "$DATABASE_URL" -X -f this_file.sql (each block is independent).

-- 1. Crawl nº1 (Ben, 2026-08-20) yield per hop-0 venue, by follower band.
with hop0 as (
  select f.account_id, a.username, f.posts_found, f.stacks_found, a.followers,
    (select count(distinct wp.wedding_id) from posts p join wedding_posts wp on wp.post_id=p.id
      where p.source='venue_tagged' and p.seed_username=a.username) w_crawl
  from ops.crawl_frontier f join accounts a on a.id=f.account_id where f.hops=0 and f.status='crawled')
select width_bucket(coalesce(followers,0), array[0,1000,3000,10000,30000,100000]) fb,
       min(followers) minf, max(followers) maxf, count(*) n,
       round(avg(posts_found)::numeric,1) posts, round(avg(stacks_found)::numeric,1) stacks,
       round(avg(w_crawl)::numeric,2) w_crawl
from hop0 group by 1 order by 1;

-- 2. Same, by accounts.venue_type (weddings per tagged post).
with hop0 as (
  select f.account_id, a.username, f.posts_found, a.venue_type,
    (select count(distinct wp.wedding_id) from posts p join wedding_posts wp on wp.post_id=p.id
      where p.source='venue_tagged' and p.seed_username=a.username) w_crawl
  from ops.crawl_frontier f join accounts a on a.id=f.account_id where f.hops=0 and f.status='crawled')
select coalesce(venue_type,'(null)') vt, count(*) n, round(avg(w_crawl)::numeric,2) w_crawl,
       round((sum(w_crawl)::numeric/nullif(sum(posts_found),0)),3) w_per_post
from hop0 group by 1 order by n desc;

-- 3. Same, by Google Places primary_type and review-count band.
with hop0 as (
  select a.username, f.posts_found,
    (select count(distinct wp.wedding_id) from posts p join wedding_posts wp on wp.post_id=p.id
      where p.source='venue_tagged' and p.seed_username=a.username) w_crawl,
    (select (v.raw->>'review_count')::int from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) reviews,
    (select v.raw->>'primary_type' from vendors v where v.account_id=a.id and v.discovery_source='google_places' limit 1) ptype
  from ops.crawl_frontier f join accounts a on a.id=f.account_id where f.hops=0 and f.status='crawled')
select coalesce(ptype,'(no places row)') ptype, count(*) n, round(avg(w_crawl)::numeric,2) w_crawl
from hop0 group by 1 having count(*)>=4 order by 3 desc;

-- 4. Yield concentration: how many crawled venues produced how many weddings.
with hop0 as (
  select a.username, f.posts_found,
    (select count(distinct wp.wedding_id) from posts p join wedding_posts wp on wp.post_id=p.id
      where p.source='venue_tagged' and p.seed_username=a.username) w_crawl
  from ops.crawl_frontier f join accounts a on a.id=f.account_id where f.hops=0 and f.status='crawled')
select width_bucket(w_crawl, array[0,1,3,6,10,15]) b, min(w_crawl), max(w_crawl), count(*) venues,
       sum(w_crawl) weddings, sum(posts_found) posts from hop0 group by 1 order by 1;

-- 5. Tagged-feed velocity (posts/month) for venues that hit the 25-post cap.
with hop0 as (
  select a.username, f.posts_found, extract(epoch from (max(p.posted_at)-min(p.posted_at)))/86400 span
  from ops.crawl_frontier f join accounts a on a.id=f.account_id
  join posts p on p.seed_username=a.username and p.source='venue_tagged'
  where f.hops=0 and f.status='crawled' group by 1,2 having f.posts_found>=20)
select count(*) venues,
  round(percentile_cont(0.25) within group (order by posts_found/nullif(span,0)*30)::numeric,1) p25,
  round(percentile_cont(0.5)  within group (order by posts_found/nullif(span,0)*30)::numeric,1) median,
  round(percentile_cont(0.75) within group (order by posts_found/nullif(span,0)*30)::numeric,1) p75
from hop0;

-- 6. Own-profile yield by author role (Jeremy's corpus -> posts that became wedding evidence).
with sp as (select sp.post_url, lower(sp.owner_username) u from staging.instagram_posts sp),
     j as (select p.url from posts p where p.source='jeremy_evidence')
select coalesce(r.role::text,'(untagged)') author_role, count(distinct sp.u) authors, count(*) posts,
       count(j.url) wedding_posts, round(count(j.url)::numeric/count(*),3) yield
from sp left join j on j.url=sp.post_url
left join accounts a on a.username::text=sp.u left join v_account_role r on r.account_id=a.id
group by 1 order by 3 desc limit 14;

-- 7. Own-profile yield tiers per author (>=10 posts) — the per-account prior table.
with sp as (select sp.post_url, lower(sp.owner_username) u, sp.post_timestamp from staging.instagram_posts sp),
     j as (select url from posts where source='jeremy_evidence'),
     au as (select u, count(*) posts, count(j.url) wp, count(j.url)::numeric/count(*) yield, max(post_timestamp) last_post
            from sp left join j on j.url=sp.post_url group by u having count(*)>=10)
select case when yield>=0.3 then 'A >=30%' when yield>=0.15 then 'B 15-30%' when yield>=0.05 then 'C 5-15%' else 'D <5%' end tier,
       count(*) authors, sum(posts) posts, sum(wp) wedding_posts, round(avg(posts)::numeric,0) avg_posts
from au group by 1 order by 1;

-- 8. Listed-venue coverage buckets vs crawl history (role=venue + in_metro; the page adds a >=1/2-wedding bar).
with listed as (
 select a.id, a.username, a.followers, (select count(*) from weddings w where w.venue_id=a.id) nw,
   (select status::text from ops.crawl_frontier f where f.account_id=a.id) crawl_status,
   exists (select 1 from vendors v where v.account_id=a.id and v.discovery_source='google_places') places
 from accounts a join v_account_role r on r.account_id=a.id and r.role='venue'
 join account_locations al on al.account_id=a.id and al.in_metro)
select case when nw=0 then '0' when nw<=5 then '1-5' when nw<=15 then '6-15' when nw<=49 then '16-49' else '50+' end bucket,
       count(*) n, sum(nw) weddings,
       count(*) filter (where crawl_status='crawled') crawled, count(*) filter (where crawl_status='pending') pending,
       count(*) filter (where crawl_status is null) not_in_frontier, count(*) filter (where places) places,
       count(*) filter (where followers is null) no_profile
from listed group by 1 order by 1;

-- 9. Who authors the wedding-yielding tagged posts (role of the poster).
select coalesce(r.role::text,'(untagged)') owner_role, count(*) posts, count(distinct wp.wedding_id) weddings
from posts p join wedding_posts wp on wp.post_id=p.id left join v_account_role r on r.account_id=p.owner_id
where p.source='venue_tagged' group by 1 order by 2 desc limit 10;

-- 10. (2026-09-19, found while pinning the pilot) Crawl nº1's hop-0 seeds were not all venues: Google Places
-- returned caterers/planners/DJs/florists for "wedding venue". Their TAGGED feeds out-yield venue feeds
-- (0.31-0.42 vs 0.14 weddings/post) AND land at thin venues: 164 weddings at 145 venues in the 1-5 bucket
-- from 2,099 posts (venue seeds: 94 at 68 venues from 4,288 posts). Vendor tagged feeds are a coverage lever.
with seeds as (select a.username, coalesce(r.role::text,'(none)') role from ops.crawl_frontier f
               join accounts a on a.id=f.account_id left join v_account_role r on r.account_id=a.id
               where f.hops=0 and f.status='crawled'),
 y as (select s.role, count(*) filter (where true) n from seeds s group by 1)
select coalesce(r.role::text,'(none)') role, count(*) n, sum(f.posts_found) posts, sum(yw.w) crawl_weddings,
       round(sum(yw.w)::numeric/nullif(sum(f.posts_found),0),2) w_per_post
from ops.crawl_frontier f join accounts a on a.id=f.account_id left join v_account_role r on r.account_id=a.id
join lateral (select count(distinct wp.wedding_id) w from posts p join wedding_posts wp on wp.post_id = p.id
              where p.source = 'venue_tagged' and p.seed_username = a.username) yw on true
where f.hops=0 and f.status='crawled' group by 1 order by 4 desc limit 10;

-- 10b. Where did each seed class's weddings land (venue's current wedding bucket)? Swap the role predicate.
with seeds as (select a.username, coalesce(r.role::text,'(none)') role from ops.crawl_frontier f
               join accounts a on a.id=f.account_id left join v_account_role r on r.account_id=a.id
               where f.hops=0 and f.status='crawled'),
 ws as (select distinct wp.wedding_id from posts p join wedding_posts wp on wp.post_id=p.id
        join seeds s on s.username=p.seed_username where p.source='venue_tagged' and s.role <> 'venue'),
 vb as (select w.id, w.venue_id, (select count(*) from weddings w2 where w2.venue_id=w.venue_id) n from weddings w)
select case when vb.venue_id is null then 'no venue' when vb.n<=5 then 'venue at 1-5' when vb.n<=15 then '6-15'
            when vb.n<=49 then '16-49' else '50+' end venue_bucket,
       count(distinct ws.wedding_id) weddings, count(distinct vb.venue_id) venues
from ws join vb on vb.id=ws.wedding_id group by 1 order by 1;
