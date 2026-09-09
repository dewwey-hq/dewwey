-- D055: strong-class batch 5 (final), hand-read by Fable on the user's behalf (approved). 36 THIS_VENUE,
-- 8 NOT_WEDDING, 1 OTHER_VENUE, 1 hand-merge. Left for the human (4): C35meo9Lrj1, DPMVDq0jVQH, DVrzxaRifzj, DWrO0d8jOVc.
begin;
drop table if exists sv;
create temp table sv(sc text, verdict text, corrected text, note text);
insert into sv(sc, verdict) values
('Dafsa6zihq3','THIS_VENUE'),('Daf-s79iefh','THIS_VENUE'),('DaiRO6XDUV1','THIS_VENUE'),('DaqykUgAta1','THIS_VENUE'),('Dbd-ZhiFqlc','THIS_VENUE'),
('DatdBUEEUQu','THIS_VENUE'),('Da0jcsGmS4F','THIS_VENUE'),('Da1MkGRib72','THIS_VENUE'),('Da3QFP3lUGD','THIS_VENUE'),('Da_xZ_TnGNv','THIS_VENUE'),
('DbDye5Cn6XQ','THIS_VENUE'),('DbEALwlGYNY','THIS_VENUE'),('Dbbid44FCl6','THIS_VENUE'),('DbWBus3kTqQ','THIS_VENUE'),('DbI5UqoDlgD','THIS_VENUE'),
('DbMcRVQlNaz','THIS_VENUE'),('DbRkxh_DIa7','THIS_VENUE'),('DbVnDGAjsBm','THIS_VENUE'),('DblPcbKxyC_','THIS_VENUE'),('DblpO2YEYW9','THIS_VENUE'),
('DbqoHx0mUdL','THIS_VENUE'),('DbtFfvsDkV9','THIS_VENUE'),('Db3YyWDkVR9','THIS_VENUE'),('Db55bpGFbRQ','THIS_VENUE'),('Db6nWsPmuK0','THIS_VENUE'),
('DcBsYRCRtle','THIS_VENUE'),('DcJmp10lLH1','THIS_VENUE'),('DcMov3CE7XC','THIS_VENUE'),('DcPnnNMjd6s','THIS_VENUE'),('DcRf_S7lHRj','THIS_VENUE'),
('DcRjkQIG3Gn','THIS_VENUE'),
-- confirmed from the full caption:
('DaYOkyGmUXT','THIS_VENUE'),('DbGk5QwE65i','THIS_VENUE'),('DbI23O0DsMY','THIS_VENUE'),('DbrN1SsH6qI','THIS_VENUE'),('DbtM60KjaZI','THIS_VENUE'),
('DcRMAdCHEFY','THIS_VENUE');
insert into sv(sc, verdict, note) values
('DYNLtUJE4f6','NOT_WEDDING','styled: content-creation + "Styling & Planning" + Madison rentals stack, no couple -- styled shoot at Gather'),
('DadjPBSE7vr','NOT_WEDDING','styled: identical styled-shoot stack as DYNLtUJE4f6'),
('DaiJEbKD5EG','NOT_WEDDING','marketing: planner milestones post'),
('DbGynRSDvdR','NOT_WEDDING','other: pre-wedding portrait session; "Prewedding Venue" only, wedding venue not named'),
('Da0TXAnlcNF','NOT_WEDDING','marketing: rental-company product debut'),
('DbYIDiGjhZX','NOT_WEDDING','marketing: RSVP etiquette tip'),
('Db_TUjamdUe','NOT_WEDDING','marketing: planner tips series'),
('DcBle_2gbjD','NOT_WEDDING','marketing: planner pitch, two venues credited, no wedding identified');
insert into sv(sc, verdict, corrected, note) values
('DarIXhgFNTF','OTHER_VENUE','cafebrauer','#cafebrauer; @tigerlilyevents is the in-house venue-sales/catering team');
insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, corrected_venue_account_id, reviewed_by, notes)
select cp.source_post_url, c.id, c.venue_account_id, sv.verdict,
  (select coalesce(al.canonical_account_id, a.id) from accounts a left join account_aliases al on al.alias_account_id=a.id where a.username = sv.corrected::citext),
  'fable-structured', coalesce(sv.note, 'strong class (credit-line + named couple + wedding language), hand-read by Fable on the user''s behalf (D055)')
from sv join jeremy_wedding_candidate_posts cp on cp.source_post_url = 'https://www.instagram.com/p/' || sv.sc || '/'
join jeremy_wedding_candidates c on c.id = cp.candidate_id and c.clustering_version = 'structural-v2'
where not exists (select 1 from post_venue_verdicts_current v where v.post_url = cp.source_post_url);
select count(*) as sv_rows from sv;
select count(*) as other_venue_unresolved from post_venue_verdicts_current where reviewed_by='fable-structured' and verdict='OTHER_VENUE' and corrected_venue_account_id is null;
drop table if exists hm;
create temp table hm(survivor bigint, absorbed bigint, couple text, reason text);
insert into hm values
(11513, 12145, 'kaelee+alex', 'manual (Fable, D055 batch-5 review): Gather, identical stack incl. "Officiant: Larry Buckman, Bride''s Grandfather" -- the absorbed post omits the couple line');
insert into structural_candidate_merges (survivor_candidate_id, absorbed_candidate_id, venue_account_id, couple, post_urls, reason)
select hm.survivor, hm.absorbed, c.venue_account_id, hm.couple,
  (select array_agg(cp.source_post_url) from jeremy_wedding_candidate_posts cp where cp.candidate_id = hm.absorbed), hm.reason
from hm join jeremy_wedding_candidates c on c.id = hm.absorbed
where exists (select 1 from jeremy_wedding_candidates s where s.id = hm.survivor and s.venue_account_id = c.venue_account_id);
update jeremy_wedding_candidate_posts cp set candidate_id = hm.survivor from hm where cp.candidate_id = hm.absorbed;
update post_venue_verdicts v set candidate_id = hm.survivor from hm where v.candidate_id = hm.absorbed;
delete from jeremy_wedding_candidate_reconciliation r using hm where r.candidate_id = hm.absorbed;
delete from jeremy_wedding_candidates c using hm where c.id = hm.absorbed;
select 'merged' as what, count(*) from structural_candidate_merges where reason like 'manual (Fable, D055 batch-5 review)%';
select verdict, count(*) from post_venue_verdicts_current where reviewed_by='fable-structured' group by 1 order by 1;
commit;
