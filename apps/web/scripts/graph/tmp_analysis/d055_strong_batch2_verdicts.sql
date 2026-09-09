-- D055: strong-class (credit-line anchor + named couple + wedding language) batch 2, hand-read by
-- Fable on the user's behalf (approved). 79 THIS_VENUE, 8 NOT_WEDDING, 2 OTHER_VENUE.
-- 1 ambiguous post (DPMVDq0jVQH, drink-topper stack at @chicagoforte, possibly styled) left for the human.
begin;
drop table if exists sv; -- pooled backends can carry a leftover temp table
create temp table sv(sc text, verdict text, corrected text, note text);
insert into sv(sc, verdict) values
('DIJiGd5Jabb','THIS_VENUE'),('DIJ6GYKxpdJ','THIS_VENUE'),('DIg8obxNM32','THIS_VENUE'),('DI1IpIJslX-','THIS_VENUE'),('DJKlo5ARaIN','THIS_VENUE'),
('DJSGSZLvm8r','THIS_VENUE'),('DJnPPEkB9HP','THIS_VENUE'),('DJr-9wLvYOo','THIS_VENUE'),('DKGIVeXvd3e','THIS_VENUE'),('DKKNtIFRIAh','THIS_VENUE'),
('DKR4n-gRQjD','THIS_VENUE'),('DKcfAMXt5v0','THIS_VENUE'),('DKquOBDsA02','THIS_VENUE'),('DKvXJXJvvj8','THIS_VENUE'),('DK21jX1ym3x','THIS_VENUE'),
('DK_28R3M3_G','THIS_VENUE'),('DLTYk60MtCa','THIS_VENUE'),('DZ3uFKZExeg','THIS_VENUE'),('DLTuB0qAeT7','THIS_VENUE'),('DLpq1aKRx9N','THIS_VENUE'),
('DMJIOB0vgwT','THIS_VENUE'),('DMgq04HJUO5','THIS_VENUE'),('DMwfmF6iXgx','THIS_VENUE'),('DM0spVQRaft','THIS_VENUE'),('DND2nZhRBOa','THIS_VENUE'),
('DM3oqrqSlA2','THIS_VENUE'),('DNX3rZ0N_M0','THIS_VENUE'),('DN24wO9Wide','THIS_VENUE'),('DNiVYeQxOYD','THIS_VENUE'),('DN0uA0W3IOZ','THIS_VENUE'),
('DN3N1le3MCK','THIS_VENUE'),('DN3Ue1UQufV','THIS_VENUE'),('DOKFJZcEdd_','THIS_VENUE'),('DQpHa8NiTod','THIS_VENUE'),('DOLx4_xDrKy','THIS_VENUE'),
('DOW9NLoERmN','THIS_VENUE'),('DOepdXOjfJ-','THIS_VENUE'),('DOgR1E4jOr1','THIS_VENUE'),('DOoslbtj4qI','THIS_VENUE'),('DOrpMfOD7Or','THIS_VENUE'),
('DS5XU27E3eg','THIS_VENUE'),('DPAQiOwDMV5','THIS_VENUE'),('DPEwi2gE4ZB','THIS_VENUE'),('DPFG8DUEa3H','THIS_VENUE'),('DPNROGpDOOs','THIS_VENUE'),
('DPPNdTpjv2G','THIS_VENUE'),('DPPTe24khJI','THIS_VENUE'),('DPcM1Xsj121','THIS_VENUE'),('DQIak_pjutf','THIS_VENUE'),('DPhWV5YgEa5','THIS_VENUE'),
('DPjtvM8kmkD','THIS_VENUE'),('DPkBitXiZEL','THIS_VENUE'),('DPmUBMfEpMA','THIS_VENUE'),('DbLbJ7VxXI9','THIS_VENUE'),('DPpObWZka9D','THIS_VENUE'),
('DP_pj5VjaDW','THIS_VENUE'),('DQCllB_kYI2','THIS_VENUE'),('DQC_8OhDflB','THIS_VENUE'),('DQS_xDBCcq6','THIS_VENUE'),('DQaQnF0AWW0','THIS_VENUE'),
('DQcwlOakv0t','THIS_VENUE'),('DQnXgDUDjiy','THIS_VENUE'),('DQpnheqkTrH','THIS_VENUE'),('DQrgU4yAEKj','THIS_VENUE'),('DQr_stoEt9m','THIS_VENUE'),
('DVRlKGRgF1n','THIS_VENUE'),('DQt9xBlkUvc','THIS_VENUE'),('DQwdmprjT9f','THIS_VENUE'),
-- confirmed from the full caption (couple named further down or venue-authored stack):
('DHeohPxPpVD','THIS_VENUE'),('DHJWPLGxNeO','THIS_VENUE'),('DHMlGnKPtuc','THIS_VENUE'),('DK0n0GNsVrh','THIS_VENUE'),('DKqI9f1PEgp','THIS_VENUE'),
('DM7_tnOxNmM','THIS_VENUE'),('DMyPDlBv0Xd','THIS_VENUE'),('DNV20D6RN56','THIS_VENUE'),('DNx7-La3P0C','THIS_VENUE'),('DObUt8eDdR3','THIS_VENUE'),
('DOg5UEYjbG0','THIS_VENUE');
insert into sv(sc, verdict, note) values
('DI9nL6RORb0','NOT_WEDDING','marketing: bridal beauty-prep tips'),
('DJQN7DkxlAL','NOT_WEDDING','event: Emerge Event Collective industry gathering at the venue'),
('DJ5lyyqMkEx','NOT_WEDDING','event: Emerge Event Collective industry gathering at the venue'),
('DKN4iB6O7oU','NOT_WEDDING','marketing: summer beauty tips'),
('DL8k6axsr0H','NOT_WEDDING','other: engagement session at this venue; the wedding venue is not named'),
('DMEgg2nMLfT','NOT_WEDDING','other: multi-wedding roundup (3 couples, 3 venues) -- cannot anchor'),
('DOU00ttknXc','NOT_WEDDING','marketing: florist profile post'),
('DP6ijKLDOdF','NOT_WEDDING','marketing: floral-team pitch');
insert into sv(sc, verdict, corrected, note) values
('DLltK8kAnCU','OTHER_VENUE','cafebrauer','Venue: @tigerlilyevents is the in-house caterer/venue-sales team for Cafe Brauer & Lincoln Park Zoo; location tag is Cafe Brauer'),
('DO9KF5CAaQA','OTHER_VENUE','empireburgerbar','Ceremony at @mortonarb, "the celebration moved into Empire" -- reception anchors (D050), ceremony still credited; empireburgerbar (Naperville) needs an account_locations row');
insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, corrected_venue_account_id, reviewed_by, notes)
select cp.source_post_url, c.id, c.venue_account_id, sv.verdict,
  (select coalesce(al.canonical_account_id, a.id) from accounts a left join account_aliases al on al.alias_account_id=a.id where a.username = sv.corrected::citext),
  'fable-structured', coalesce(sv.note, 'strong class (credit-line + named couple + wedding language), hand-read by Fable on the user''s behalf (D055)')
from sv join jeremy_wedding_candidate_posts cp on cp.source_post_url = 'https://www.instagram.com/p/' || sv.sc || '/'
join jeremy_wedding_candidates c on c.id = cp.candidate_id and c.clustering_version = 'structural-v2'
where not exists (select 1 from post_venue_verdicts_current v where v.post_url = cp.source_post_url);
select count(*) as sv_rows, count(*) filter (where verdict='OTHER_VENUE' and corrected is not null) as other_with_handle from sv;
select verdict, count(*) from post_venue_verdicts_current where reviewed_by='fable-structured' group by 1 order by 1;
commit;
