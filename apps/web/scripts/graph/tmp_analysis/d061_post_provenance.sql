-- D061 provenance drill (read-only). For one wedding (or one post), answer: which acquisition tick
-- paid for it, which Apify run and seed fetched it, which target prior justified the spend, which
-- parser / prompt / clustering / reconciliation versions processed it, which candidate and creation
-- batch produced the wedding, and the three clocks (Instagram post time, our fetch time, our
-- decision time). Promote to a view only if a second consumer appears (plan rev 2).
--
-- Usage: psql "$DATABASE_URL" -X -v wedding_id=<id> -f d061_post_provenance.sql
--        psql "$DATABASE_URL" -X -v shortcode='<sc>' -f d061_post_provenance.sql   (edit the where below)

select
  w.id                                   as wedding_id,
  w.venue_id, va.username                as venue_username,
  p.id                                   as post_id,
  p.shortcode, p.url                     as post_url,
  p.source                               as post_source,
  p.posted_at                            as clock_instagram,
  o.observed_at                          as clock_fetched,
  jwc.created_at                         as clock_decided,
  r.batch_id                             as acquisition_batch,
  r.id                                   as run_id, r.apify_run_id, r.dataset_id, r.actor, r.feed,
  r.cost_usd                             as run_cost_usd,
  sa.username                            as seed_username,
  t.tier, t.prior_w_per_post, t.prior_n, t.status as target_status_at_pick,
  r.pipeline_versions,
  ser.stack_parser_version,
  per.prompt_version, per.model          as reader_model, per.confidence as reader_confidence,
  jwc.candidate_id, c.clustering_version,
  jwc.batch_id                           as creation_batch,
  cd.decision                            as creation_decision, cd.match_confidence, cd.matched_wedding_id
from weddings w
join wedding_posts wp            on wp.wedding_id = w.id
join posts p                     on p.id = wp.post_id
left join accounts va            on va.id = w.venue_id
left join ops.post_observations o on o.post_id = p.id and o.is_first
left join ops.crawl_runs r       on r.id = o.run_id
left join accounts sa            on sa.id = o.seed_account_id
left join ops.crawl_targets t    on t.id = o.target_id
left join lateral (select stack_parser_version from stack_extraction_runs s where s.post_url = p.url
                   order by s.created_at desc nulls last limit 1) ser on true
left join lateral (select prompt_version, model, confidence from post_extraction_runs x where x.post_url = p.url
                   order by x.created_at desc nulls last limit 1) per on true
left join jeremy_weddings_created jwc on jwc.wedding_id = w.id
left join jeremy_wedding_candidates c on c.id = jwc.candidate_id
left join ops.creation_decisions cd   on cd.candidate_id = jwc.candidate_id and cd.batch_id = jwc.batch_id
where w.id = :wedding_id
order by o.observed_at nulls last, p.posted_at;
