-- D055: author-anchored class batch 3 (same rule). 63 THIS_VENUE, 20 NOT_WEDDING; photo-only / unnamed posts left.
begin;
drop table if exists sv;
create temp table sv(sc text, verdict text, corrected text, note text);
insert into sv(sc, verdict) values
('DIZHgwJxJWo','THIS_VENUE'),('DLGOzDOybf0','THIS_VENUE'),('DLapIhqyf9X','THIS_VENUE'),('DL-udklSL0Z','THIS_VENUE'),('DNOjSDPSKno','THIS_VENUE'),
('DRxnpDAkrr4','THIS_VENUE'),('C2Ngh-0sSG-','THIS_VENUE'),('C74pkKBvaPU','THIS_VENUE'),('C8KncYVPP1C','THIS_VENUE'),('C8XQbx5OnZJ','THIS_VENUE'),
('C9fqrpuP1bp','THIS_VENUE'),('C-ne_GjxJL8','THIS_VENUE'),('DFaeRnpRtX7','THIS_VENUE'),('DGyHXzMRppw','THIS_VENUE'),('DH6hsDpRV5d','THIS_VENUE'),
('DLDEjxHsnZP','THIS_VENUE'),('DNRIgzbJupO','THIS_VENUE'),('DPeebPmCVTB','THIS_VENUE'),('DHoUPjCRC_B','THIS_VENUE'),('DLaW5qTxUI1','THIS_VENUE'),
('DN8mx0xkdW1','THIS_VENUE'),('DObV5WXEUB7','THIS_VENUE'),('DO83Iy3kTlN','THIS_VENUE'),('DPWlMgYkQjY','THIS_VENUE'),('DP1iiS1EWm1','THIS_VENUE'),
('DSDU8BfEfcN','THIS_VENUE'),('DKuo1INRaHg','THIS_VENUE'),('DVJpigUEVBw','THIS_VENUE'),('DZDysjwxw_U','THIS_VENUE'),('DaL1iOPBAGf','THIS_VENUE'),
('DTIrWn1DWzl','THIS_VENUE'),('DND0n8ezqfG','THIS_VENUE'),('Cu9q1OBrnNq','THIS_VENUE'),('C2NyxNEPkBc','THIS_VENUE'),('C4tsUCmLqFn','THIS_VENUE'),
('C4OtTd_v5RW','THIS_VENUE'),('C2fmFxOPbhs','THIS_VENUE'),('C2u7rgcLg8d','THIS_VENUE'),('C3DWB0UroHZ','THIS_VENUE'),('C3GAXfMLDHV','THIS_VENUE'),
('C3lIW3WPXET','THIS_VENUE'),('C35vKTWvINB','THIS_VENUE'),('C4JDnIiu6y4','THIS_VENUE'),('C4bLoAAvlfN','THIS_VENUE'),('C4-nYpXrO7k','THIS_VENUE'),
('C6reVg2vJ0t','THIS_VENUE'),('C90aGhHPqWa','THIS_VENUE'),('DAWDSaHxHuM','THIS_VENUE'),('DHFWw2uxTCw','THIS_VENUE'),('DJU0m5SSCDw','THIS_VENUE'),
('DJl-kzAuuI8','THIS_VENUE'),('DOJFdz2jT9b','THIS_VENUE'),('C79ho5nMQt3','THIS_VENUE'),('CnCnC51rYYd','THIS_VENUE'),('Cyg25tIvlFv','THIS_VENUE'),
('C1sPDGWP2tL','THIS_VENUE'),('C15IRfrPZ-I','THIS_VENUE'),('C-0Yny3xTqo','THIS_VENUE');
insert into sv(sc, verdict, note) values
('Cm4hA7ps0uZ','NOT_WEDDING','marketing: new-venue announcement'),('Cm4hbbLDVKa','NOT_WEDDING','marketing: new-venue announcement'),
('DFgytY6R4bS','NOT_WEDDING','event: West Loop Wedding Walk'),('DFk1NEVxxBw','NOT_WEDDING','marketing: wedding giveaway'),
('DW_v632DUCH','NOT_WEDDING','marketing: hotel pitch'),('DWbqZG6lBph','NOT_WEDDING','marketing: hotel pitch'),
('DbJl8WZoHKw','NOT_WEDDING','event: Destination Asia festival'),
('DFx-bxVR9L8','NOT_WEDDING','marketing: awards'),('DMszz64xJaP','NOT_WEDDING','marketing: photo-location pitch'),('DR43gzCEdOw','NOT_WEDDING','marketing: vote-for-us'),
('DTDs0sYD5Aq','NOT_WEDDING','marketing: tour pitch'),('DTLgP2jj_j9','NOT_WEDDING','marketing: planning package'),('DUd0n8EETEH','NOT_WEDDING','marketing: book-2026 pitch'),
('DXhdqkSBiti','NOT_WEDDING','event: murder-mystery style "wedding attire" public event, not a real wedding'),
('DIyrajWp-sl','NOT_WEDDING','marketing: hotel award'),
('C3oASWIPeui','NOT_WEDDING','marketing: owner intro'),
('DIjbyeQz8wv','NOT_WEDDING','marketing: summer deal'),('DGgOC2Xz-PG','NOT_WEDDING','marketing: summer deal'),('DU6XrOXFLwD','NOT_WEDDING','marketing: 26%-off offer'),
('CsogOkvru12','NOT_WEDDING','event: corporate reception'),
('C--bL42xvWh','NOT_WEDDING','marketing: catering spread');
insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, corrected_venue_account_id, reviewed_by, notes)
select cp.source_post_url, c.id, c.venue_account_id, sv.verdict, null,
  'fable-structured', coalesce(sv.note, 'venue-authored post naming the couple or a specific wedding''s vendor stack, hand-read by Fable on the user''s behalf (D055)')
from sv join jeremy_wedding_candidate_posts cp on cp.source_post_url = 'https://www.instagram.com/p/' || sv.sc || '/'
join jeremy_wedding_candidates c on c.id = cp.candidate_id and c.clustering_version = 'structural-v2'
where not exists (select 1 from post_venue_verdicts_current v where v.post_url = cp.source_post_url);
select count(*) as sv_rows from sv;
select verdict, count(*) from post_venue_verdicts_current where reviewed_by='fable-structured' group by 1 order by 1;
commit;
