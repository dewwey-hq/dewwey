-- D055: author-anchored class batch 5 (same rule). 35 THIS_VENUE, 9 NOT_WEDDING, 1 OTHER_VENUE, 1 hand-merge.
begin;
drop table if exists sv;
create temp table sv(sc text, verdict text, corrected text, note text);
insert into sv(sc, verdict) values
('DW9kM_ZibHq','THIS_VENUE'),('DZ-3cbSGYUG','THIS_VENUE'),('DaldN42GVhk','THIS_VENUE'),('CvVx1mNP5m_','THIS_VENUE'),('Cv21Dn0vOEb','THIS_VENUE'),
('Cwxy0l3rhxr','THIS_VENUE'),('Cw6SmRwLiiw','THIS_VENUE'),('CyCTD6srK_L','THIS_VENUE'),('C18MMGVsmji','THIS_VENUE'),('C2I4wsyLwFy','THIS_VENUE'),
('C36SWW4rzz9','THIS_VENUE'),('C5UPsd-rYTO','THIS_VENUE'),('C5o-cebLi0P','THIS_VENUE'),('C6Z8a-hrLI8','THIS_VENUE'),('DGy-wRWv0Ud','THIS_VENUE'),
('DHrd_jvvw7y','THIS_VENUE'),('DPcCyrwkRDl','THIS_VENUE'),('DRIwG-SEdAT','THIS_VENUE'),('CouvAyiOJxA','THIS_VENUE'),('CpS243QO7Ri','THIS_VENUE'),
('CqbFFGLJ-Qh','THIS_VENUE'),('CsEOjpWLygt','THIS_VENUE'),('CtMZNA1r4eW','THIS_VENUE'),('Cu9tGDJre4R','THIS_VENUE'),('CxtUvOcOn1k','THIS_VENUE'),
('CyWZWXLOs0m','THIS_VENUE'),('CzpLJ66Lrp6','THIS_VENUE'),('C3qdQKBu1A9','THIS_VENUE'),('C4tUe0bOuud','THIS_VENUE'),('C5EYyDbu-8V','THIS_VENUE'),
('C5WQyJ5LdQI','THIS_VENUE'),('C74dHy2uZ2B','THIS_VENUE'),('C-bTWbhsyBr','THIS_VENUE'),('DUE3XGbjUDZ','THIS_VENUE'),('DZYqEUWDcmH','THIS_VENUE');
insert into sv(sc, verdict, note) values
('DXfAb1UCVvP','NOT_WEDDING','marketing: venue pitch'),('DXhoNwZCdpG','NOT_WEDDING','marketing: venue pitch'),
('C5uYCRLuBC7','NOT_WEDDING','other: museum exhibits'),('DVtWt2BlKOb','NOT_WEDDING','other: exhibition'),
('C201Jtpropn','NOT_WEDDING','marketing: pre-wedding events pitch'),('C_1g14rPnuD','NOT_WEDDING','marketing: rehearsal pitch'),
('DYfVOmPkReT','NOT_WEDDING','event: club talk'),
('DN1pAlo2hF7','NOT_WEDDING','marketing: catering pitch'),('DWU7SF_jQQG','NOT_WEDDING','marketing: rehearsal-dinner pitch');
insert into sv(sc, verdict, corrected, note) values
('DPmkkKgDlFf','OTHER_VENUE','cafebrauer','location tag Cafe Brauer; @tigerlilyevents is the in-house venue-sales/catering team');
insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, corrected_venue_account_id, reviewed_by, notes)
select cp.source_post_url, c.id, c.venue_account_id, sv.verdict,
  (select coalesce(al.canonical_account_id, a.id) from accounts a left join account_aliases al on al.alias_account_id=a.id where a.username = sv.corrected::citext),
  'fable-structured', coalesce(sv.note, 'venue-authored post naming the couple or a specific wedding''s vendor stack, hand-read by Fable on the user''s behalf (D055)')
from sv join jeremy_wedding_candidate_posts cp on cp.source_post_url = 'https://www.instagram.com/p/' || sv.sc || '/'
join jeremy_wedding_candidates c on c.id = cp.candidate_id and c.clustering_version = 'structural-v2'
where not exists (select 1 from post_venue_verdicts_current v where v.post_url = cp.source_post_url);
select count(*) as sv_rows from sv;
select count(*) as other_venue_unresolved from post_venue_verdicts_current where reviewed_by='fable-structured' and verdict='OTHER_VENUE' and corrected_venue_account_id is null;
drop table if exists hm;
create temp table hm(survivor bigint, absorbed bigint, couple text, reason text);
insert into hm values
(8203, 8497, '(unnamed; identical stack)', 'manual (Fable, D055 author batch-5 review): The Arbory''s own posts, identical stack (calliebrookeimages / kristin.e.johansson1 / coachhouseplants), no couple name');
insert into structural_candidate_merges (survivor_candidate_id, absorbed_candidate_id, venue_account_id, couple, post_urls, reason)
select hm.survivor, hm.absorbed, c.venue_account_id, hm.couple,
  (select array_agg(cp.source_post_url) from jeremy_wedding_candidate_posts cp where cp.candidate_id = hm.absorbed), hm.reason
from hm join jeremy_wedding_candidates c on c.id = hm.absorbed
where exists (select 1 from jeremy_wedding_candidates s where s.id = hm.survivor and s.venue_account_id = c.venue_account_id);
update jeremy_wedding_candidate_posts cp set candidate_id = hm.survivor from hm where cp.candidate_id = hm.absorbed;
update post_venue_verdicts v set candidate_id = hm.survivor from hm where v.candidate_id = hm.absorbed;
delete from jeremy_wedding_candidate_reconciliation r using hm where r.candidate_id = hm.absorbed;
delete from jeremy_wedding_candidates c using hm where c.id = hm.absorbed;
select 'merged' as what, count(*) from structural_candidate_merges where reason like 'manual (Fable, D055 author batch-5 review)%';
select verdict, count(*) from post_venue_verdicts_current where reviewed_by='fable-structured' group by 1 order by 1;
commit;
