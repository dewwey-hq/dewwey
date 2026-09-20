-- D061 reader v1.3 scoring against the human labels of the 79-post eval set (d061_reader_v13_evalset.txt).
-- Run: psql "$DATABASE_URL" -X -f d061_reader_v13_score.sql   (uses \copy, so run from the repo root)
create temp table ev (url text, human text, model12 text, conf12 text, cls text);
\copy ev from 'apps/web/scripts/graph/tmp_analysis/d061_reader_v13_evalset.txt' with (format csv, delimiter '|')
-- extract-v1.3 folds an OTHER_VENUE whose handle is the anchored venue's own alias family into THIS_VENUE
-- (decideVerdictWrite); mirror it here so the eval scores what would be written.
create temp view v13 as
  select r.post_url,
    case when r.verdict='OTHER_VENUE' and exists (
           select 1 from post_extraction_runs r2
           join jeremy_wedding_candidates c on c.id = r.candidate_id
           join accounts a on lower(a.username::text) = lower(regexp_replace(r.corrected_venue_handle,'^@',''))
           left join account_aliases al on al.alias_account_id = a.id
           left join account_aliases alc on alc.alias_account_id = c.venue_account_id
           where r2.post_url = r.post_url and r2.prompt_version = r.prompt_version
             and coalesce(al.canonical_account_id, a.id) = coalesce(alc.canonical_account_id, c.venue_account_id))
         then 'THIS_VENUE' else r.verdict end verdict,
    r.confidence
  from post_extraction_runs r where r.prompt_version='extract-v1.3';
with j as (select ev.*, v13.verdict model13, v13.confidence conf13,
        case when v13.confidence >= 0.8 and v13.verdict in ('THIS_VENUE','NOT_WEDDING','OTHER_VENUE') then 'writes '||v13.verdict else 'no write' end action13
        from ev left join v13 on v13.post_url=ev.url)
select cls, human, model12 as v12, model13 as v13, action13, count(*) from j group by 1,2,3,4,5 order by 1,2,3,4;
with v12 as (select post_url, verdict, confidence from post_extraction_runs where prompt_version='extract-v1.2')
select
  'v1.3 THIS_VENUE precision @>=0.8' metric, count(*) filter (where v13.verdict='THIS_VENUE' and v13.confidence>=0.8 and ev.human='THIS_VENUE') hit, count(*) filter (where v13.verdict='THIS_VENUE' and v13.confidence>=0.8) total
from ev join v13 on v13.post_url=ev.url
union all select 'v1.3 recall of human THIS_VENUE (written)', count(*) filter (where ev.human='THIS_VENUE' and v13.verdict='THIS_VENUE' and v13.confidence>=0.8), count(*) filter (where ev.human='THIS_VENUE') from ev join v13 on v13.post_url=ev.url
union all select 'v1.2 THIS_VENUE precision @>=0.8 (same set)', count(*) filter (where v12.verdict='THIS_VENUE' and v12.confidence>=0.8 and ev.human='THIS_VENUE'), count(*) filter (where v12.verdict='THIS_VENUE' and v12.confidence>=0.8) from ev join v12 on v12.post_url=ev.url
union all select 'v1.2 recall of human THIS_VENUE (written)', count(*) filter (where ev.human='THIS_VENUE' and v12.verdict='THIS_VENUE' and v12.confidence>=0.8), count(*) filter (where ev.human='THIS_VENUE') from ev join v12 on v12.post_url=ev.url
union all select 'v1.3 false THIS_VENUE on human NOT_WEDDING (written)', count(*) filter (where ev.human='NOT_WEDDING' and v13.verdict='THIS_VENUE' and v13.confidence>=0.8), count(*) filter (where ev.human='NOT_WEDDING') from ev join v13 on v13.post_url=ev.url;
