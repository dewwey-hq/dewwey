-- D061 (2026-09-20, user's call): register Ben's crawl no.1 posts at ZERO-wedding metro venues as a
-- provenance-logged legacy batch so they enter the structural chain. Why only these: the D031 attach
-- risk (a new post merging onto the wrong existing wedding) needs an existing wedding at the venue;
-- zero-wedding venues have none. Ben's regex saw 77 stacks / 65 wedding words in these 1,545 posts;
-- our chain (location tags, inline anchors, reader) never ran on them. Cost: $0 Apify.
-- Shape: one ops.crawl_runs row (actor 'legacy', cost 0, started_at = the original crawl date), one
-- crawl_targets row per venue (tier 'legacy'), one crawl_run_seeds row per venue, one
-- post_observations row per post (is_first true -- these ARE the first sightings).
-- Run: psql "$DATABASE_URL" -X -f d061_legacy_ben_zero_venues.sql
begin;
create temp table t_z as
select a.id account_id, a.username
from accounts a join v_account_role r on r.account_id=a.id and r.role='venue'
join account_locations al on al.account_id=a.id and al.in_metro
join ops.crawl_frontier f on f.account_id=a.id and f.status='crawled'
where (select count(*) from weddings w where w.venue_id=a.id)=0
  and exists (select 1 from posts p where p.seed_username=a.username and p.source='venue_tagged');

insert into ops.crawl_runs (batch_id, actor, feed, input, apify_run_id, dataset_id, status, items, cost_usd, pipeline_versions, started_at, finished_at, ingested_at, note)
select 'legacy-ben-crawl1-zero-venues', 'legacy:pipeline.py apify/instagram-tagged-scraper (crawl no.1, 2026-08-20)', 'tagged',
       jsonb_build_object('username', array_agg(username order by username), 'resultsLimit', 25), null, null, 'ingested',
       (select count(*) from posts p join t_z z on z.username=p.seed_username where p.source='venue_tagged'), 0,
       null, '2026-08-20 00:00+00', '2026-08-20 00:00+00', now(),
       'D061 legacy registration of Ben''s crawl no.1 posts at zero-wedding metro venues (user''s call 2026-09-20); $0; see d061_legacy_ben_zero_venues.sql'
from t_z;

insert into ops.crawl_targets (account_id, canonical_account_id, feed, tier, prior_w_per_post, prior_n, status, features, last_run_id, note)
select z.account_id, coalesce(al.canonical_account_id, z.account_id), 'tagged', 'legacy', 0.05, 0, 'unknown', '{}'::jsonb,
       (select id from ops.crawl_runs where batch_id='legacy-ben-crawl1-zero-venues'), 'legacy-ben-crawl1-zero-venues'
from t_z z left join account_aliases al on al.alias_account_id=z.account_id;

insert into ops.crawl_run_seeds (run_id, account_id, target_id, requested, fetched, new_posts, already_had)
select r.id, z.account_id, t.id, 25,
       (select count(*) from posts p where p.seed_username=z.username and p.source='venue_tagged'),
       (select count(*) from posts p where p.seed_username=z.username and p.source='venue_tagged'), 0
from t_z z join ops.crawl_runs r on r.batch_id='legacy-ben-crawl1-zero-venues'
join ops.crawl_targets t on t.account_id=z.account_id and t.note='legacy-ben-crawl1-zero-venues';

insert into ops.post_observations (run_id, post_id, seed_account_id, target_id, observed_at, is_first, caption_sha256, caption_changed)
select r.id, p.id, z.account_id, t.id, p.scraped_at, true, encode(sha256(convert_to(coalesce(p.caption,''), 'UTF8')), 'hex'), false
from posts p join t_z z on z.username=p.seed_username
join ops.crawl_runs r on r.batch_id='legacy-ben-crawl1-zero-venues'
join ops.crawl_targets t on t.account_id=z.account_id and t.note='legacy-ben-crawl1-zero-venues'
where p.source='venue_tagged'
  and not exists (select 1 from ops.post_observations o where o.post_id=p.id)
on conflict (run_id, post_id) do nothing;

select (select count(*) from t_z) venues, (select count(*) from ops.post_observations o join ops.crawl_runs r on r.id=o.run_id where r.batch_id='legacy-ben-crawl1-zero-venues') registered_posts;
drop table t_z;
commit;
