-- D055: strong-class batch 4, hand-read by Fable on the user's behalf (approved). 78 THIS_VENUE, 5 NOT_WEDDING,
-- 2 OTHER_VENUE, 1 hand-merge. Left for the human (5): C35meo9Lrj1 (pre-wedding teaser), DPMVDq0jVQH (possible
-- styled), DVrzxaRifzj (unnamed Cuneo wedding-film musing), DWrO0d8jOVc (photography musing, couple not visible),
-- DYNLtUJE4f6 (Gather stack with content-creation/styling credits, no couple -- possibly styled).
begin;
drop table if exists sv;
create temp table sv(sc text, verdict text, corrected text, note text);
insert into sv(sc, verdict) values
('DVkCQ8OiW-x','THIS_VENUE'),('DVzU63pkXsF','THIS_VENUE'),('DV6MqaTjE9W','THIS_VENUE'),('DV6-BUmEY3d','THIS_VENUE'),('DV8-Bd5DcBF','THIS_VENUE'),
('DWExzNVESg6','THIS_VENUE'),('DWE_qJ5mIKf','THIS_VENUE'),('DWHIEf-hmA-','THIS_VENUE'),('DWKOXZGCGEa','THIS_VENUE'),('DWXwb8QDq1H','THIS_VENUE'),
('DWZ3WTyD-X8','THIS_VENUE'),('DWkVDtADC5F','THIS_VENUE'),('DWy4Z2vgOxs','THIS_VENUE'),('DWy7J9tgOMk','THIS_VENUE'),('DWzVgx6DNLx','THIS_VENUE'),
('DW728YJEsdD','THIS_VENUE'),('DXJ6buwgD7-','THIS_VENUE'),('DXcCQJxDmjX','THIS_VENUE'),('DXcPTB2kTp_','THIS_VENUE'),('DXcP6DgkbSl','THIS_VENUE'),
('DXdBmA7kjvq','THIS_VENUE'),('DXeuuC-jh9q','THIS_VENUE'),('DXsstL1jq8Q','THIS_VENUE'),('DXwoh7PlUCH','THIS_VENUE'),('DZIaEHeHEUh','THIS_VENUE'),
('DYPwk1joH4G','THIS_VENUE'),('DZ-ewFlk74W','THIS_VENUE'),('DYzztLMHHKf','THIS_VENUE'),('DXw3DGwE2gw','THIS_VENUE'),('DYATv5cmWmG','THIS_VENUE'),
('DYFvA_bEWIB','THIS_VENUE'),('DYFvSQ2EbIa','THIS_VENUE'),('DYdEk4Yy2Ek','THIS_VENUE'),('DYkNLRnkdcd','THIS_VENUE'),('DYkgGYgEu6W','THIS_VENUE'),
('DYpaatFESIn','THIS_VENUE'),('DYzzp_nnJe8','THIS_VENUE'),('DY2GT3AgA2y','THIS_VENUE'),('DY4htKflpqB','THIS_VENUE'),('DY49RvwDiCb','THIS_VENUE'),
('DY61UErDvDx','THIS_VENUE'),('DZLCuTKRcU2','THIS_VENUE'),('DZDdsAdO67b','THIS_VENUE'),('DZFkOaQjWFo','THIS_VENUE'),('DZF1ONBoIh5','THIS_VENUE'),
('DZGVh_9EYrh','THIS_VENUE'),('DZJF5CQmY0p','THIS_VENUE'),('DZQzL6lhTQA','THIS_VENUE'),('DZTAN_6FtS-','THIS_VENUE'),('DZdUD0vlp4a','THIS_VENUE'),
('DZdizSXA-EX','THIS_VENUE'),('DZm1iKQDMUH','THIS_VENUE'),('DZqT2tlIDTQ','THIS_VENUE'),('DZsSTn7EQSf','THIS_VENUE'),('DZsl-HQnKKX','THIS_VENUE'),
('DZxGClKHKis','THIS_VENUE'),('DZsjuWeh8VF','THIS_VENUE'),('DZv1_6RHOuf','THIS_VENUE'),('DZ5JO9XgPS2','THIS_VENUE'),('DZ5Kd6GHDVi','THIS_VENUE'),
('DaBDe-6ExiA','THIS_VENUE'),('DaGWxqUk4Fv','THIS_VENUE'),('DaJb6SIHerH','THIS_VENUE'),('DaL0j22D6e6','THIS_VENUE'),
-- confirmed from the full caption:
('DaTE_IfE9PR','THIS_VENUE'),('DVvk4kZIDPQ','THIS_VENUE'),('DVwTacqEYdu','THIS_VENUE'),('DW45AvRkUnw','THIS_VENUE'),('DWABsMCAX3s','THIS_VENUE'),
('DWJpZJQijIm','THIS_VENUE'),('DWRKEAMFf5W','THIS_VENUE'),('DXssnHVmVYF','THIS_VENUE'),('DYcat2wlpSy','THIS_VENUE'),('DZdAW7hkwhx','THIS_VENUE'),
('DZp4XDRnGLE','THIS_VENUE'),('DZLFvGZMDDI','THIS_VENUE'),('DZqmg5XFPwQ','THIS_VENUE'),('DZyB3IspAKH','THIS_VENUE');
insert into sv(sc, verdict, note) values
('DY5OvryFv0u','NOT_WEDDING','other: two-wedding anniversary recap (Jacob & Skylar / Jared & Aliya) -- cannot anchor either'),
('DZ723k-nzCD','NOT_WEDDING','marketing: stationery pitch'),
('DZ755tAAK8k','NOT_WEDDING','marketing: stationery pitch'),
('DaS2K9Ulhcy','NOT_WEDDING','marketing: venue pitch'),
('DZBBGLniWqn','NOT_WEDDING','marketing: keyword-stuffed photographer post, no wedding identified');
insert into sv(sc, verdict, corrected, note) values
('DXNieYUkpQc','OTHER_VENUE','southshoreccac','"under the chandeliers of the South Shore Cultural Center" -- @chicagoparks is the Park District, not the venue'),
('DZghuepCJfk','OTHER_VENUE','cafebrauer','"wedding at Cafe Brauer" -- @tigerlilyevents is the in-house venue-sales/catering team');
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
(11720, 11787, 'shane+matt', 'manual (Fable, D055 batch-4 review): The Haight, identical vendor stack (officiant Cole Rakow / planner Bailey Valentine / sbblooms / marissakwebbphoto / caputosbakery) -- the absorbed post omits the couple line');
insert into structural_candidate_merges (survivor_candidate_id, absorbed_candidate_id, venue_account_id, couple, post_urls, reason)
select hm.survivor, hm.absorbed, c.venue_account_id, hm.couple,
  (select array_agg(cp.source_post_url) from jeremy_wedding_candidate_posts cp where cp.candidate_id = hm.absorbed), hm.reason
from hm join jeremy_wedding_candidates c on c.id = hm.absorbed
where exists (select 1 from jeremy_wedding_candidates s where s.id = hm.survivor and s.venue_account_id = c.venue_account_id);
update jeremy_wedding_candidate_posts cp set candidate_id = hm.survivor from hm where cp.candidate_id = hm.absorbed;
update post_venue_verdicts v set candidate_id = hm.survivor from hm where v.candidate_id = hm.absorbed;
delete from jeremy_wedding_candidate_reconciliation r using hm where r.candidate_id = hm.absorbed;
delete from jeremy_wedding_candidates c using hm where c.id = hm.absorbed;
select 'merged' as what, count(*) from structural_candidate_merges where reason like 'manual (Fable, D055 batch-4 review)%';
select verdict, count(*) from post_venue_verdicts_current where reviewed_by='fable-structured' group by 1 order by 1;
commit;
