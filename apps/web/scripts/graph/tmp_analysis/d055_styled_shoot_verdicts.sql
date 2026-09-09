-- D055 (2026-09-08): styled-shoot posts cleared on the user's behalf (explicit approval), under
-- reviewed_by='fable-structured' with reason styled_shoot. Tight rule only: a Models:/Hosts: credit
-- line, or an explicit "styled/style/editorial/concept shoot" phrase or hashtag. No human_post_labels
-- rows (golden set stays human-only). Run from apps/web:
--   psql "$DATABASE_URL" -f scripts/graph/tmp_analysis/d055_styled_shoot_verdicts.sql
begin;
insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, reviewed_by, notes)
select cp.source_post_url, c.id, c.venue_account_id, 'NOT_WEDDING', 'fable-structured',
  'styled_shoot: ' || case when sp.caption_raw ~* '\ymodels?\s*[:|]' then 'Models credit line'
                          when sp.caption_raw ~* '\yhosts?\s*[:|]' then 'Hosts credit line (workshop shoot)'
                          else 'explicit styled/editorial shoot phrase' end || ' -- cleared by Fable on the user''s behalf (D055)'
from jeremy_wedding_candidate_posts cp
join jeremy_wedding_candidates c on c.id=cp.candidate_id and c.clustering_version='structural-v2'
join staging.instagram_posts sp on sp.post_url=cp.source_post_url
where not exists (select 1 from post_venue_verdicts_current v where v.post_url=cp.source_post_url)
  and (sp.caption_raw ~* '\ymodels?\s*[:|]' or sp.caption_raw ~* '\yhosts?\s*[:|]'
       or sp.caption_raw ~* '\y(styled?|editorial|concept)\s+shoot\y'
       or sp.caption_raw ~* '#(styledshoot|styledshoots|stylizedshoot|editorialshoot)\y');
select reviewed_by, verdict, count(*) from post_venue_verdicts_current group by 1,2 order by 1,2;
commit;
