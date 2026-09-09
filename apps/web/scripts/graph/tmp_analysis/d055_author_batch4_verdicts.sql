-- D055: author-anchored class batch 4 (same rule). 57 THIS_VENUE, 26 NOT_WEDDING; photo-only / unnamed posts left.
begin;
drop table if exists sv;
create temp table sv(sc text, verdict text, corrected text, note text);
insert into sv(sc, verdict) values
('C_jJSwBvrYm','THIS_VENUE'),('DElE2Jkv8V8','THIS_VENUE'),('DGeKm8PPGK4','THIS_VENUE'),('DGrrrUNR013','THIS_VENUE'),('DKnImNuPzPf','THIS_VENUE'),
('DNqna7CR2id','THIS_VENUE'),('DQuuHo-D1sc','THIS_VENUE'),('DTa8RZdj0DR','THIS_VENUE'),('DVRinm0oKNt','THIS_VENUE'),('DLrA4R-tvfX','THIS_VENUE'),
('C5jeB1uvUSL','THIS_VENUE'),('C7hvXw5PaxF','THIS_VENUE'),('DBkQLg6he-9','THIS_VENUE'),('DBxIKUcB-PY','THIS_VENUE'),('DQhN20UkRzL','THIS_VENUE'),
('DTLXxRsFZZX','THIS_VENUE'),('DO_NGBBD8-L','THIS_VENUE'),('DPWmCgGE0YV','THIS_VENUE'),('DQHoBzgE2u7','THIS_VENUE'),('DRC9JiaE4L8','THIS_VENUE'),
('DSGEVU0kvwA','THIS_VENUE'),('DUoBB9rEgBn','THIS_VENUE'),('DWmL8y9EgEm','THIS_VENUE'),('DXpIneUGdbU','THIS_VENUE'),('DXzbu2xk4N-','THIS_VENUE'),
('DKk2Il5PmAw','THIS_VENUE'),('DYpgd6rHHdM','THIS_VENUE'),('DZnTinUkTCt','THIS_VENUE'),('C94uJbCRRra','THIS_VENUE'),('C-LDK2YRJkQ','THIS_VENUE'),
('C--8cuBPkNe','THIS_VENUE'),('DAbgmvIPUSl','THIS_VENUE'),('DA6R5KCPi_s','THIS_VENUE'),('DCZhJFeP3De','THIS_VENUE'),('DCrI-dZxL8W','THIS_VENUE'),
('DDOFUaHs28U','THIS_VENUE'),('DDMnJh-RavX','THIS_VENUE'),('DE5oEu2vnYw','THIS_VENUE'),('DGTo8h_Ps6M','THIS_VENUE'),('DH_kL5wvw6a','THIS_VENUE'),
('DUJwfriDXCR','THIS_VENUE'),('DGiz_k5JOdX','THIS_VENUE'),('DHwm72sy0wu','THIS_VENUE'),('DWO_wudlcWB','THIS_VENUE'),('DXXRCoKlcEg','THIS_VENUE'),
('DXmudkhlTuk','THIS_VENUE'),('DKAVN-IRpwB','THIS_VENUE'),('DL55tDwRnKB','THIS_VENUE'),('DNy5n5vYjNs','THIS_VENUE');
insert into sv(sc, verdict, note) values
('DCmlcKAPkgS','NOT_WEDDING','event: GWA Recyclery'),
('C14xiheLjDP','NOT_WEDDING','marketing: wedding giveaway'),
('DL5Xgg9tAnb','NOT_WEDDING','marketing: tour pitch'),
('DSdq7-BEgfa','NOT_WEDDING','marketing: venue pitch'),('DXz565zAPIT','NOT_WEDDING','marketing: champagne-parade feature'),
('DAJPnQyvFKX','NOT_WEDDING','marketing: free-rental offer'),('DRUdK1KDapD','NOT_WEDDING','marketing: love letter to the venue'),
('DVPRrCelbuN','NOT_WEDDING','marketing: venue feature'),('DWUUpNNFkWF','NOT_WEDDING','marketing: book-2026 pitch'),('DWZl68ilRbG','NOT_WEDDING','marketing: venue feature'),
('DWhXH-8FckT','NOT_WEDDING','marketing: venue feature'),('DWmWZzFldhq','NOT_WEDDING','marketing: venue feature'),('DW1qh1DFZao','NOT_WEDDING','marketing: venue pitch'),
('DW6wrHtFUIZ','NOT_WEDDING','marketing: venue feature'),('DXKf8i7FZdf','NOT_WEDDING','marketing: venue feature'),('DXhUdIvlTXv','NOT_WEDDING','marketing: food-station feature'),
('DXcrU5_FT1P','NOT_WEDDING','marketing: venue intro'),('DXuSBk8lRbV','NOT_WEDDING','marketing: venue feature'),('DXzjgXjlYiC','NOT_WEDDING','marketing: venue feature'),
('DX7Ko3Klc18','NOT_WEDDING','marketing: cake feature'),('DYfW5nRlb5B','NOT_WEDDING','marketing: enhancements feature'),
('DLQs5u-Rn26','NOT_WEDDING','marketing: meet the team'),('DNZKi8pRWVt','NOT_WEDDING','marketing: behind the scenes'),('DRxquQ4kXvZ','NOT_WEDDING','marketing: wedding giveaway');
insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, corrected_venue_account_id, reviewed_by, notes)
select cp.source_post_url, c.id, c.venue_account_id, sv.verdict, null,
  'fable-structured', coalesce(sv.note, 'venue-authored post naming the couple or a specific wedding''s vendor stack, hand-read by Fable on the user''s behalf (D055)')
from sv join jeremy_wedding_candidate_posts cp on cp.source_post_url = 'https://www.instagram.com/p/' || sv.sc || '/'
join jeremy_wedding_candidates c on c.id = cp.candidate_id and c.clustering_version = 'structural-v2'
where not exists (select 1 from post_venue_verdicts_current v where v.post_url = cp.source_post_url);
select count(*) as sv_rows from sv;
select verdict, count(*) from post_venue_verdicts_current where reviewed_by='fable-structured' group by 1 order by 1;
commit;
