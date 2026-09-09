-- D055 (2026-09-08): hand-read verdicts on the 59 ceremony+reception posts, applied on the user's
-- behalf under reviewed_by='fable-structured' (no human_post_labels rows -- the golden set stays
-- human-only), plus geography for the 17 venues that were still CHICAGO_AMBIGUOUS.
-- Run from apps/web:  psql "$DATABASE_URL" -f scripts/graph/tmp_analysis/d055_ceremony_reception_verdicts.sql
begin;
create temp table g3(username text, in_metro boolean, note text);
insert into g3 values ('weddingswhiteeagle',true,'White Eagle Golf Club, Naperville IL'),('thefairlie',true,'Fairlie, Chicago West Loop'),('georgiosbanquets',true,'Orland Park IL (bridged D052)'),('sofitelchicago',true,'Sofitel Chicago'),('herringtoninnandspa',true,'Herrington Inn, Geneva IL'),
('longviewgallery',false,'Washington DC'),('happyhollowomaha',false,'Omaha NE'),('champaigncountryclub',false,'Champaign IL (downstate)'),('themorrisinn',false,'Notre Dame IN'),('gatewayhotelames',false,'Ames IA'),('marcus.center',false,'Milwaukee WI'),('saintrestaurantstaug',false,'St Augustine FL'),('grandhyattatlanta',false,'Atlanta GA'),('thecountrycluboforlando',false,'Orlando FL'),('uskcevents',false,'Kansas City'),('ndhospitality',false,'Notre Dame IN'),('fatbottombrews',false,'Nashville TN');
insert into account_locations (account_id, address, source, in_metro, verified_at)
select a.id, 'D055 ceremony+reception hand-read (Fable): ' || g.note, 'manual', g.in_metro, now() from g3 g join accounts a on a.username=g.username::citext
on conflict (account_id) do update set in_metro=excluded.in_metro, address=excluded.address, verified_at=now();
update jeremy_wedding_candidates c set chicago_status = case when al.in_metro then 'CHICAGO_CONFIRMED' else 'CHICAGO_NOT_CONFIRMED' end, updated_at=now()
from account_locations al, accounts a, g3 g where al.account_id=c.venue_account_id and a.id=al.account_id and a.username=g.username::citext and c.clustering_version='structural-v2' and c.chicago_status='CHICAGO_AMBIGUOUS';
insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, reviewed_by, notes)
select cp.source_post_url, c.id, c.venue_account_id,
  case when cp.source_post_url in ('https://www.instagram.com/p/DPeUaLqje8R/','https://www.instagram.com/p/DWjtlrNCbgb/') then 'NOT_WEDDING' else 'THIS_VENUE' end,
  'fable-structured',
  case when cp.source_post_url in ('https://www.instagram.com/p/DPeUaLqje8R/','https://www.instagram.com/p/DWjtlrNCbgb/') then 'marketing: venue/HMUA promo with a vendor list, no specific wedding' else 'ceremony+reception credit pair, hand-read by Fable on the user''s behalf (D055)' end
from jeremy_wedding_candidate_posts cp join jeremy_wedding_candidates c on c.id=cp.candidate_id and c.clustering_version='structural-v2'
where exists (select 1 from stack_extraction_entries e where e.post_url=cp.source_post_url and e.stack_parser_version='stack-parser-ts-v8' and e.role='venue' and e.role_raw ~* 'ceremony|church|parish|chapel|cathedral')
  and exists (select 1 from stack_extraction_entries e where e.post_url=cp.source_post_url and e.stack_parser_version='stack-parser-ts-v8' and e.role='venue' and e.role_raw ~* 'reception')
  and not exists (select 1 from post_venue_verdicts_current v where v.post_url=cp.source_post_url);
select reviewed_by, verdict, count(*) from post_venue_verdicts_current group by 1,2 order by 1,2;
commit;
