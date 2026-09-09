-- D055: author-anchored class batch 2 (same rule as batch 1). 36 THIS_VENUE, 9 NOT_WEDDING, 3 hand-merges
-- (same couple handles on the same venue's own posts). Photo-credit-only venue posts left for the human (45).
begin;
drop table if exists sv;
create temp table sv(sc text, verdict text, corrected text, note text);
insert into sv(sc, verdict) values
('DUg_KKNEcMs','THIS_VENUE'),('DUuCZp1kSVU','THIS_VENUE'),('DWPJUYXkWDr','THIS_VENUE'),('DXuc4OfEVMF','THIS_VENUE'),('DYI4QGFkVVQ','THIS_VENUE'),
('Datd6Q-keLH','THIS_VENUE'),('DbBi332EX-7','THIS_VENUE'),('DbYb0RvkTAy','THIS_VENUE'),('DCrzHyIPssg','THIS_VENUE'),('DOyppynEsuC','THIS_VENUE'),
('DMiY7YmsBEE','THIS_VENUE'),('DOWg2l2EtTZ','THIS_VENUE'),('DQ5Hi7CEo2H','THIS_VENUE'),('DRAgWcxklqw','THIS_VENUE'),('DUmBja9jqzd','THIS_VENUE'),
('CnNmXF1pfXY','THIS_VENUE'),('CnSNLPzoLOU','THIS_VENUE'),('CnhonnEI2kn','THIS_VENUE'),('Coqeqo-InuO','THIS_VENUE'),('Cnzssf9tprT','THIS_VENUE'),
('Coc6XgVsPiR','THIS_VENUE'),('CtFFiKQIb_r','THIS_VENUE'),('CqOdRwSI02T','THIS_VENUE'),('CqbrjU7oO4m','THIS_VENUE'),('CrGzh0Yt5wm','THIS_VENUE'),
('Cq3cB7UNnyd','THIS_VENUE'),('CsHfxgZoByM','THIS_VENUE'),('CsRdr2hpoYF','THIS_VENUE'),('CtUyfBxNC3E','THIS_VENUE'),('CwltKlMJydF','THIS_VENUE'),
('CyZvd8Tovxq','THIS_VENUE'),('C4wPS3kxZpQ','THIS_VENUE'),('C2BJYtytpkr','THIS_VENUE'),('C3JJwYFPW6G','THIS_VENUE'),('C38v-oso8EE','THIS_VENUE'),
('Co-U9AmI1l2','THIS_VENUE');
insert into sv(sc, verdict, note) values
('DU6Sh-MErLY','NOT_WEDDING','marketing: 26%-off booking offer'),
('Cn44a8To-VS','NOT_WEDDING','marketing: cake-style tip'),
('Cnr_WGtNvXm','NOT_WEDDING','marketing: centerpiece tip'),
('CoVToy2ISYD','NOT_WEDDING','marketing: centerpiece tip'),
('CqqldKMoe2l','NOT_WEDDING','marketing: patio pitch'),
('CrYuJtQNfmt','NOT_WEDDING','marketing: centerpiece tip'),
('C3WHp8FL6ku','NOT_WEDDING','marketing: Valentine''s multi-photographer thank-you'),
('C7Xgn9VPNb-','NOT_WEDDING','marketing: contact-us pitch'),
('DYFkwRZmAoX','NOT_WEDDING','marketing: first-dance photo tip');
insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, corrected_venue_account_id, reviewed_by, notes)
select cp.source_post_url, c.id, c.venue_account_id, sv.verdict, null,
  'fable-structured', coalesce(sv.note, 'venue-authored post naming the couple or a specific wedding''s vendor stack, hand-read by Fable on the user''s behalf (D055)')
from sv join jeremy_wedding_candidate_posts cp on cp.source_post_url = 'https://www.instagram.com/p/' || sv.sc || '/'
join jeremy_wedding_candidates c on c.id = cp.candidate_id and c.clustering_version = 'structural-v2'
where not exists (select 1 from post_venue_verdicts_current v where v.post_url = cp.source_post_url);
select count(*) as sv_rows from sv;
drop table if exists hm;
create temp table hm(survivor bigint, absorbed bigint, couple text, reason text);
insert into hm values
(8176, 8182, 'danifitt_21+treehuggerrr77', 'manual (Fable, D055 author batch-2 review): Salvatore''s own posts, same bride handles (@danifitt_21 @treehuggerrr77), same photographer'),
(8178, 8181, 'carmen+george', 'manual (Fable, D055 author batch-2 review): Salvatore''s own posts, same couple handles (@foodifyme @kennylogsin), same photographer'),
(8178, 8212, 'carmen+george', 'manual (Fable, D055 author batch-2 review): Salvatore''s own posts, same couple handles (@foodifyme @kennylogsin), same photographer');
insert into structural_candidate_merges (survivor_candidate_id, absorbed_candidate_id, venue_account_id, couple, post_urls, reason)
select hm.survivor, hm.absorbed, c.venue_account_id, hm.couple,
  (select array_agg(cp.source_post_url) from jeremy_wedding_candidate_posts cp where cp.candidate_id = hm.absorbed), hm.reason
from hm join jeremy_wedding_candidates c on c.id = hm.absorbed
where exists (select 1 from jeremy_wedding_candidates s where s.id = hm.survivor and s.venue_account_id = c.venue_account_id);
update jeremy_wedding_candidate_posts cp set candidate_id = hm.survivor from hm where cp.candidate_id = hm.absorbed;
update post_venue_verdicts v set candidate_id = hm.survivor from hm where v.candidate_id = hm.absorbed;
delete from jeremy_wedding_candidate_reconciliation r using hm where r.candidate_id = hm.absorbed;
delete from jeremy_wedding_candidates c using hm where c.id = hm.absorbed;
select 'merged' as what, count(*) from structural_candidate_merges where reason like 'manual (Fable, D055 author batch-2 review)%';
select verdict, count(*) from post_venue_verdicts_current where reviewed_by='fable-structured' group by 1 order by 1;
commit;
