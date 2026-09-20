-- D061 reader v1.3 eval set (2026-09-20). Human-labeled posts from the two blind spot-checks (pilot,
-- probes A): every disagreement (the recall misses and the OTHER_VENUE inversions, plus the two human
-- NOT_WEDDING on model THIS_VENUE) and a stratified sample of agreements to guard precision.
-- Columns: post_url, human verdict, model v1.2 verdict + confidence, class (disagree|agree_this|agree_not|agree_other).
with sc as (
  select p.url from ops.post_observations o join ops.crawl_runs r on r.id=o.run_id join posts p on p.id=o.post_id
  where o.is_first and r.batch_id in ('acq-20260919-pilot','acq-20260919-probesA')),
 pairs as (
  select sc.url,
    (select v.verdict from post_venue_verdicts v where v.post_url=sc.url and v.reviewed_by='jeremy' order by v.reviewed_at desc limit 1) human,
    (select v.verdict from post_venue_verdicts v where v.post_url=sc.url and v.reviewed_by like 'haiku%' order by v.reviewed_at asc limit 1) model,
    (select x.confidence from post_extraction_runs x where x.post_url=sc.url and x.prompt_version='extract-v1.2' limit 1) conf
  from sc),
 labeled as (select * from pairs where human is not null and model is not null),
 dis as (select url, human, model, conf, 'disagree' cls from labeled where human <> model),
 agr as (
   select url, human, model, conf, case when human='THIS_VENUE' then 'agree_this' when human='NOT_WEDDING' then 'agree_not' else 'agree_other' end cls,
          row_number() over (partition by human order by md5(url)) rn
   from labeled where human = model)
select url, human, model, conf, cls from dis
union all select url, human, model, conf, cls from agr where (cls='agree_this' and rn<=40) or (cls='agree_not' and rn<=20) or (cls='agree_other' and rn<=10)
order by cls, url;
