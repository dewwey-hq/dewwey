-- D055: strong-class (credit-line anchor + named couple + wedding language) batch 1, hand-read by
-- Fable on the user's behalf (approved). 64 THIS_VENUE, 5 NOT_WEDDING (marketing), 1 OTHER_VENUE.
-- 9 ambiguous posts deliberately left without a verdict for the human.
begin;
create temp table sv(sc text, verdict text, corrected text, note text);
insert into sv(sc, verdict) values
('CpJiI6nOXAV','THIS_VENUE'),('Cukx27_reCq','THIS_VENUE'),('CupUKqfv0wL','THIS_VENUE'),('CxGj-W-vxbA','THIS_VENUE'),('C1GM21XgaRs','THIS_VENUE'),
('C2x0_X-PBtu','THIS_VENUE'),('C3VKW-iPdwb','THIS_VENUE'),('C3bLkbJvT7_','THIS_VENUE'),('C3nVcDGLfbk','THIS_VENUE'),('C3spOPkRH4P','THIS_VENUE'),
('C4tgD0pPq3_','THIS_VENUE'),('C5CDUtaPvvG','THIS_VENUE'),('C5Y3WlFLbII','THIS_VENUE'),('C5eRGjsoFxp','THIS_VENUE'),('C5zQj6oAtwZ','THIS_VENUE'),
('C6CssEfrvMV','THIS_VENUE'),('C6H3lJoLs-1','THIS_VENUE'),('C6HM6tirPYy','THIS_VENUE'),('C6ylYBNLPUT','THIS_VENUE'),('C8CrVE0JhF4','THIS_VENUE'),
('DKubBPBRruU','THIS_VENUE'),('C8lSNzkyRCi','THIS_VENUE'),('C87woaLO5pT','THIS_VENUE'),('C89jVIkOC9N','THIS_VENUE'),('C9BeGZvv6P7','THIS_VENUE'),
('C9NJMiORawQ','THIS_VENUE'),('C9uCFjcvyEl','THIS_VENUE'),('C-ASVCROjd9','THIS_VENUE'),('C-FrGzDRwwd','THIS_VENUE'),('C-F2leKAOce','THIS_VENUE'),
('DGJsU4mAATj','THIS_VENUE'),('C-ImQxDOTVG','THIS_VENUE'),('C-g99e_u6Bf','THIS_VENUE'),('C-ieUSrO53l','THIS_VENUE'),('C-1NnZwSMAL','THIS_VENUE'),
('C-_FpiCx_NK','THIS_VENUE'),('C_yCpkSRKJq','THIS_VENUE'),('DAB26D7y3HY','THIS_VENUE'),('DAl9S69vc0X','THIS_VENUE'),('DApNjE4vSJN','THIS_VENUE'),
('DA4LTUGyeuG','THIS_VENUE'),('DBjo9U1uZxO','THIS_VENUE'),('DB95mvDu9C_','THIS_VENUE'),('DE6GgV1uLdE','THIS_VENUE'),('DCUNBtNs36i','THIS_VENUE'),
('DCdget2uZ6E','THIS_VENUE'),('DDIMr63SVdU','THIS_VENUE'),('DDVqcK2tKyk','THIS_VENUE'),('DDkP_YrRaPt','THIS_VENUE'),('DENlAsGvM09','THIS_VENUE'),
('DESoD_nM2mT','THIS_VENUE'),('DEYQZ96PchO','THIS_VENUE'),('DEaPza7x1mM','THIS_VENUE'),('DEowg4SOP1V','THIS_VENUE'),('DEvtVkLuKBG','THIS_VENUE'),
('DFLI1pVPNSN','THIS_VENUE'),('DFLaa09RnkZ','THIS_VENUE'),('DFyIn3TvrGG','THIS_VENUE'),('DF0eD-GRShQ','THIS_VENUE'),('DF6lnFgR7I3','THIS_VENUE'),
('DGO4MHGvQgJ','THIS_VENUE'),('DGRIVDuSXhM','THIS_VENUE'),('DGlwkcmSSPa','THIS_VENUE'),('DG1Iv6SzA3o','THIS_VENUE');
insert into sv(sc, verdict, note) values
('C2N9aa4vEJD','NOT_WEDDING','marketing: venue/team pitch, no specific wedding'),
('C4RdhfhrNE-','NOT_WEDDING','marketing: photographer advice post'),
('C7koKVDJvgA','NOT_WEDDING','marketing: HMUA booking pitch'),
('C8fdwB3vdWu','NOT_WEDDING','marketing: Google review repost'),
('DB6owhjRDYl','NOT_WEDDING','marketing: posing-guide lead magnet');
insert into sv(sc, verdict, corrected, note) values
('C_LP0_XREVh','OTHER_VENUE','celestechicago','Ceremony @holynamecathedral, Venue: @celestechicago -- anchor should be the reception venue');
insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, corrected_venue_account_id, reviewed_by, notes)
select cp.source_post_url, c.id, c.venue_account_id, sv.verdict,
  (select coalesce(al.canonical_account_id, a.id) from accounts a left join account_aliases al on al.alias_account_id=a.id where a.username = sv.corrected::citext),
  'fable-structured', coalesce(sv.note, 'strong class (credit-line + named couple + wedding language), hand-read by Fable on the user''s behalf (D055)')
from sv join jeremy_wedding_candidate_posts cp on cp.source_post_url = 'https://www.instagram.com/p/' || sv.sc || '/'
join jeremy_wedding_candidates c on c.id = cp.candidate_id and c.clustering_version = 'structural-v2'
where not exists (select 1 from post_venue_verdicts_current v where v.post_url = cp.source_post_url);
select verdict, count(*) from post_venue_verdicts_current where reviewed_by='fable-structured' group by 1 order by 1;
commit;
