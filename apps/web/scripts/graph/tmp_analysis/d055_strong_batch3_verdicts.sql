-- D055: strong-class (credit-line anchor + named couple + wedding language) batch 3, hand-read by
-- Fable on the user's behalf (approved). 77 THIS_VENUE, 6 NOT_WEDDING, 4 OTHER_VENUE.
-- Left for the human: C35meo9Lrj1 (pre-wedding teaser, wedding not yet documented), DPMVDq0jVQH (possible styled),
-- plus nothing else. Also 3 hand-merges of duplicate candidates (identical vendor stacks / same couple handles).
begin;
drop table if exists sv; -- pooled backends can carry a leftover temp table
create temp table sv(sc text, verdict text, corrected text, note text);
insert into sv(sc, verdict) values
('C04RrB4LGS3','THIS_VENUE'),('C2flJpLu06n','THIS_VENUE'),('C665hitvLXp','THIS_VENUE'),('C7NUCaYPfYW','THIS_VENUE'),('DH3iZP3gcXq','THIS_VENUE'),
('C7xI3ewP_32','THIS_VENUE'),('C8DQE_dve6w','THIS_VENUE'),('C-tMGB4ukrf','THIS_VENUE'),('DAjxle0vjMo','THIS_VENUE'),('DCkhP0avtfU','THIS_VENUE'),
('DD8LJhjOjYb','THIS_VENUE'),('DFa8FamSM88','THIS_VENUE'),('DQxedFXDt7p','THIS_VENUE'),('DQ7cbFTExSe','THIS_VENUE'),('DRDAsNpEdt7','THIS_VENUE'),
('DRFWj25kd2n','THIS_VENUE'),('DRLTtKtkW_p','THIS_VENUE'),('DTK_sl-jnkW','THIS_VENUE'),('DRMy0BFEScO','THIS_VENUE'),('DRQAxxukmzy','THIS_VENUE'),
('DRSvbZkkdm3','THIS_VENUE'),('DRXGi0Qjg3f','THIS_VENUE'),('DRcxkDGDTSv','THIS_VENUE'),('DRh4XDVDg19','THIS_VENUE'),('DRkwA0Kkr6n','THIS_VENUE'),
('DRu47rtjxrV','THIS_VENUE'),('DRxiOp0kkp5','THIS_VENUE'),('DWUUNkmDp9V','THIS_VENUE'),('DSFY1OdDkDT','THIS_VENUE'),('DSJV1qNjPFu','THIS_VENUE'),
('DS5gQRCiRpf','THIS_VENUE'),('DSXv8r3jQeM','THIS_VENUE'),('DSdF7tnkXp1','THIS_VENUE'),('DS0bztbj9BZ','THIS_VENUE'),('DTEFo_9jqt_','THIS_VENUE'),
('DTQd0n8jidi','THIS_VENUE'),('DTYGSaKkQOS','THIS_VENUE'),('DTizYKoD86U','THIS_VENUE'),('DTnlsrBjXua','THIS_VENUE'),('DTs2K71gf8o','THIS_VENUE'),
('DTysVNRiU7u','THIS_VENUE'),('DT0krKID1dF','THIS_VENUE'),('DT0rlnKj0ze','THIS_VENUE'),('DT0tSU-kY7O','THIS_VENUE'),('DT1W9A4EbYi','THIS_VENUE'),
('DT1c-mmkgsH','THIS_VENUE'),('DT3OfHGCXV3','THIS_VENUE'),('DUCKFlcjvVc','THIS_VENUE'),('DUGYpRQkZmO','THIS_VENUE'),('DUGwYGwkpLL','THIS_VENUE'),
('DUJmF9yAJfZ','THIS_VENUE'),('DULUSkBjqSY','THIS_VENUE'),('DUWBnmNjgqY','THIS_VENUE'),('DUYrBvAkdjA','THIS_VENUE'),('DUheGs5klIu','THIS_VENUE'),
('DUnh5zbDUc4','THIS_VENUE'),('DUvhocuD2h-','THIS_VENUE'),('DUyR_UHEUQ-','THIS_VENUE'),('DU9CwtsiiAk','THIS_VENUE'),('DVGtHVEj4Sd','THIS_VENUE'),
('DVG8TI7jmaK','THIS_VENUE'),('DVKZo0JEuuY','THIS_VENUE'),('DVU7Y5KILfq','THIS_VENUE'),('DVjL2Zakcmn','THIS_VENUE'),
-- confirmed from the full caption:
('C2YPrVYPTUS','THIS_VENUE'),('C9F4oBHPQWQ','THIS_VENUE'),('C-JW6T2vmdu','THIS_VENUE'),('C_bp1MQvN2b','THIS_VENUE'),('C_QhrfzRqT5','THIS_VENUE'),
('C-csq78t9wH','THIS_VENUE'),('C-la9qPO4r7','THIS_VENUE'),('DFebATZxUtC','THIS_VENUE'),('DGtcA-mPkNr','THIS_VENUE'),('DR2dQiPD8lV','THIS_VENUE'),
('DRNJd4LkmL1','THIS_VENUE'),('DTfz2puko9m','THIS_VENUE'),('DUTJaxUDpKE','THIS_VENUE');
insert into sv(sc, verdict, note) values
('C3EP365tP10','NOT_WEDDING','marketing: caterer dish photo'),
('DRBc9dqiQ6m','NOT_WEDDING','marketing: florist 15-years pitch'),
('DSDVtP8ERvD','NOT_WEDDING','marketing: venue pitch'),
('DT63QqRjJjM','NOT_WEDDING','event: engagement party (Gibsons Oak Brook), not the wedding'),
('DTbkCluD33n','NOT_WEDDING','styled: magazine editorial, "Female model / Male model" credited'),
('DUGiq7uEl8q','NOT_WEDDING','marketing: planner venue-highlight post'),
('DUoH0J-Do3-','NOT_WEDDING','marketing: photography pitch, no specific wedding');
insert into sv(sc, verdict, corrected, note) values
('DFfvMG-CJdY','OTHER_VENUE','cafebrauer','"Cafe Brauer never disappoints" -- @tigerlilyevents is the in-house venue-sales/catering team for Cafe Brauer & Lincoln Park Zoo'),
('DRQokDUjVQ_','OTHER_VENUE','chicagoilluminatingcompany','rehearsal dinner at Gibsons; "CIC couple Abby and Yoni" -- the wedding venue is Chicago Illuminating Company'),
('DSh9WsEibsH','OTHER_VENUE','lmstudiochi','location tag "LM Studio Chicago"; @lmcateringchi is the in-house caterer (own bio), the venue is LM Studio'),
('DTLbw3ED0NL','OTHER_VENUE','quadclub.uchicago','"Venue: @quadclub.uchicago @uchicago" -- the Quadrangle Club is the venue, @uchicago is the university'' main account');
insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, corrected_venue_account_id, reviewed_by, notes)
select cp.source_post_url, c.id, c.venue_account_id, sv.verdict,
  (select coalesce(al.canonical_account_id, a.id) from accounts a left join account_aliases al on al.alias_account_id=a.id where a.username = sv.corrected::citext),
  'fable-structured', coalesce(sv.note, 'strong class (credit-line + named couple + wedding language), hand-read by Fable on the user''s behalf (D055)')
from sv join jeremy_wedding_candidate_posts cp on cp.source_post_url = 'https://www.instagram.com/p/' || sv.sc || '/'
join jeremy_wedding_candidates c on c.id = cp.candidate_id and c.clustering_version = 'structural-v2'
where not exists (select 1 from post_venue_verdicts_current v where v.post_url = cp.source_post_url);
select count(*) as sv_rows, count(*) filter (where verdict='OTHER_VENUE' and corrected is not null) as other_with_handle from sv;
-- sanity: every OTHER_VENUE resolved a corrected account
select count(*) as other_venue_unresolved from post_venue_verdicts_current where reviewed_by='fable-structured' and verdict='OTHER_VENUE' and corrected_venue_account_id is null;

-- Hand-merges (same shape as mergeStructuralCandidatesByCouple.ts: log, move posts + verdicts, delete reconciliation, delete candidate last).
drop table if exists hm;
create temp table hm(survivor bigint, absorbed bigint, couple text, reason text);
insert into hm values
(8862, 8982, '(unnamed; identical stack)', 'manual (Fable, D055 batch-3 review): The Dalcy, identical 9-vendor stack (amandapevents_chi/photographybylauryn/anemonechicago/topher.films/vibemusiclive/annebargebridalatelier) posted twice by the venue, no couple name'),
(8769, 8330, '(unnamed; identical stack)', 'manual (Fable, D055 batch-3 review): The Langham, identical vendor stack (eventsbyshaunrajah/juliettanfloraldesign/george_kossieris/eatpistorescakes/biossat) on both florist posts, no couple name'),
(10951, 11038, 'adi+jessie', 'manual (Fable, D055 batch-3 review): Pendry Chicago, same couple handles (@jflat97 & @the._.singh) and identical vendor stack; couple only named on one post so the automatic merge missed it');
insert into structural_candidate_merges (survivor_candidate_id, absorbed_candidate_id, venue_account_id, couple, post_urls, reason)
select hm.survivor, hm.absorbed, c.venue_account_id, hm.couple,
  (select array_agg(cp.source_post_url) from jeremy_wedding_candidate_posts cp where cp.candidate_id = hm.absorbed), hm.reason
from hm join jeremy_wedding_candidates c on c.id = hm.absorbed
where exists (select 1 from jeremy_wedding_candidates s where s.id = hm.survivor and s.venue_account_id = c.venue_account_id);
update jeremy_wedding_candidate_posts cp set candidate_id = hm.survivor from hm where cp.candidate_id = hm.absorbed;
update post_venue_verdicts v set candidate_id = hm.survivor from hm where v.candidate_id = hm.absorbed;
delete from jeremy_wedding_candidate_reconciliation r using hm where r.candidate_id = hm.absorbed;
delete from jeremy_wedding_candidates c using hm where c.id = hm.absorbed;
select 'merged' as what, count(*) from structural_candidate_merges where reason like 'manual (Fable, D055 batch-3 review)%';
select verdict, count(*) from post_venue_verdicts_current where reviewed_by='fable-structured' group by 1 order by 1;
commit;
