-- D055: author-anchored (venue-authored) class batch 1, hand-read by Fable on the user's behalf (approved).
-- Rule for this class (the user's own confirm rate on it was ~27%): THIS_VENUE only when the venue names the
-- couple or posts a >=3-vendor stack for a specific wedding; NOT_WEDDING for pitches/packages/tours/exhibits/
-- non-wedding events; a venue's "Photos by @x" of an unnamed wedding is LEFT for the human.
-- 31 THIS_VENUE, 37 NOT_WEDDING, 22 left.
begin;
drop table if exists sv;
create temp table sv(sc text, verdict text, corrected text, note text);
insert into sv(sc, verdict) values
('DVTqACMlk1j','THIS_VENUE'),('C-dc5-FvGcr','THIS_VENUE'),('DZNh6eGDv9l','THIS_VENUE'),('DI7sX8rubC-','THIS_VENUE'),('DbX9RZYiFHw','THIS_VENUE'),
('Dbd6qW2lOrM','THIS_VENUE'),('Dbfyg_uDlWt','THIS_VENUE'),('DbzMnF4FL-Z','THIS_VENUE'),('DcFXLVnjk4y','THIS_VENUE'),('DJ1w96fR1ij','THIS_VENUE'),
('DWNAsvREdFj','THIS_VENUE'),('DZftd7-Ec72','THIS_VENUE'),('CyZyxTrL-Tw','THIS_VENUE'),('C4vzyIUIPQ7','THIS_VENUE'),('C_QmcIlOGjl','THIS_VENUE'),
('DMxihOWOQWt','THIS_VENUE'),('DNV0FPeujxC','THIS_VENUE'),('DP7XoAekRS_','THIS_VENUE'),('Da6gmgIjg_j','THIS_VENUE'),('Db6wipIDAyi','THIS_VENUE'),
('C59AsenRAct','THIS_VENUE'),('DR0JTrdDwb5','THIS_VENUE'),('DSEKjzWjfor','THIS_VENUE'),('DcPNhnUmrA3','THIS_VENUE'),('DZYqzNfgDyr','THIS_VENUE'),
('C-VJk1bRUeG','THIS_VENUE'),('DCqB4UsxWJ6','THIS_VENUE'),('DKZe-lBRo-W','THIS_VENUE'),('DMeT-LjxULx','THIS_VENUE'),('DUO_h1ckb-s','THIS_VENUE'),
('DR_4rMBEk5V','THIS_VENUE');
insert into sv(sc, verdict, note) values
('DKsEW_qO6ED','NOT_WEDDING','event: museum gala'),
('DV6Y2tbjhUG','NOT_WEDDING','marketing: minimony package'),
('DZ-XMEyiXqH','NOT_WEDDING','marketing: venue pitch'),('DblN8n3AG2z','NOT_WEDDING','marketing: venue pitch'),('Db8aXCAm2QS','NOT_WEDDING','marketing: venue pitch'),
('DUGddcJleFS','NOT_WEDDING','event: concert'),('DXXflXQkqi6','NOT_WEDDING','event: concert'),
('DYknTgPn73R','NOT_WEDDING','marketing: private-event space pitch'),
('DbYnxz6kQ0H','NOT_WEDDING','marketing: venue musing, no wedding identified'),
('DUtzu1wDHBi','NOT_WEDDING','other: member love story; married in Tuscany, not at this venue'),
('C7hesiGBAdX','NOT_WEDDING','marketing: ceremony-seating pitch'),
('DVhamVAjEwG','NOT_WEDDING','marketing: awards recap'),
('DVBte16Eihg','NOT_WEDDING','other: museum collection post'),
('DJc19naPBqo','NOT_WEDDING','marketing: bridesmaid hotel package'),
('DUHVJMygbhb','NOT_WEDDING','event: calligraphy class'),
('DYcayRpHBAX','NOT_WEDDING','other: museum exhibition'),
('Da1OeJOJCsT','NOT_WEDDING','marketing: venue pitch'),
('DIjXhMhxFYi','NOT_WEDDING','event: Wedding Recyclery'),
('DGEUs0RxO7D','NOT_WEDDING','marketing: proposal pitch'),
('DFqJy30R1tV','NOT_WEDDING','marketing: book-your-date'),
('DIJ8x2DJ9yY','NOT_WEDDING','marketing: venue pitch'),('DMVcrE4u4GV','NOT_WEDDING','marketing: venue pitch'),('DWby8oPFMAj','NOT_WEDDING','marketing: venue pitch'),
('C7PrzEuPzRC','NOT_WEDDING','marketing: venue pitch'),('C7pMrEExHrq','NOT_WEDDING','marketing: book-your-wedding'),('DK0N6GMsVX6','NOT_WEDDING','marketing: throwback pitch'),
('DOOd3nyDnwz','NOT_WEDDING','marketing: inquire-today pitch'),('DP7PtLeCbgz','NOT_WEDDING','marketing: schedule-a-tour pitch'),('DTDs9JpExFA','NOT_WEDDING','marketing: weddings-and-mitzvahs pitch'),
('DN1GAOg5GXp','NOT_WEDDING','marketing: hypothetical Taylor & Travis wedding'),('DUUKBtqANOR','NOT_WEDDING','marketing: brand post'),('DUZPHpHAFEV','NOT_WEDDING','marketing: venue tour'),
('DDkTVXeTidw','NOT_WEDDING','marketing: catering package'),
('C90JRsps7NR','NOT_WEDDING','marketing: say-I-do-with-us pitch'),
('DFqQKYly8nZ','NOT_WEDDING','marketing: catering stations'),('DGgisbOTBrr','NOT_WEDDING','marketing: summer special'),('DJxADXNu1Kf','NOT_WEDDING','marketing: rooftop pitch');
insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, corrected_venue_account_id, reviewed_by, notes)
select cp.source_post_url, c.id, c.venue_account_id, sv.verdict, null,
  'fable-structured', coalesce(sv.note, 'venue-authored post naming the couple or a specific wedding''s vendor stack, hand-read by Fable on the user''s behalf (D055)')
from sv join jeremy_wedding_candidate_posts cp on cp.source_post_url = 'https://www.instagram.com/p/' || sv.sc || '/'
join jeremy_wedding_candidates c on c.id = cp.candidate_id and c.clustering_version = 'structural-v2'
where not exists (select 1 from post_venue_verdicts_current v where v.post_url = cp.source_post_url);
select count(*) as sv_rows from sv;
select verdict, count(*) from post_venue_verdicts_current where reviewed_by='fable-structured' group by 1 order by 1;
commit;
