-- D055: the pull queries Fable used to read review classes on the user's behalf (saved so the next
-- session doesn't have to dig them out of a transcript). Run with psql -At -F ' || ' -o <file>.
-- 1) Strong class: credit-line anchor + a named couple + wedding language, Chicago-confirmed, unreviewed.
set statement_timeout='300s';
select c.id, regexp_replace(cp.source_post_url, '^https://www.instagram.com/p/([^/]+)/$', '\1') as sc, a.username, sp.post_timestamp::date,
  (select string_agg(e.role_raw||'->@'||e.handle, '; ' order by e.line_no) from stack_extraction_entries e where e.post_url=cp.source_post_url and e.stack_parser_version='stack-parser-ts-v9' and e.role='venue') as venue_credits,
  left(regexp_replace(sp.caption_raw, E'[\n\r]+',' ','g'), 230) as caption
from jeremy_wedding_candidate_posts cp join jeremy_wedding_candidates c on c.id=cp.candidate_id and c.clustering_version='structural-v2' and c.chicago_status='CHICAGO_CONFIRMED'
join accounts a on a.id=c.venue_account_id join staging.instagram_posts sp on sp.post_url=cp.source_post_url
where not exists (select 1 from post_venue_verdicts_current v where v.post_url=cp.source_post_url)
  and c.venue_anchor_source='credit_line' and sp.caption_raw ~ '[A-Z][a-z]+ *(&|\+|and) *[A-Z][a-z]+' and sp.caption_raw ~* '\y(wedding|married|newlywed|bride|groom)\y'
order by c.id limit 90;
-- 2) Author-anchored class (the venue's own posts), lowest-coverage venues first; add `and a.username not in (...)`
--    to skip venues whose remaining posts are photo-credit-only (left for the human).
select c.id, regexp_replace(cp.source_post_url, '^https://www.instagram.com/p/([^/]+)/$', '\1') as sc, a.username, sp.post_timestamp::date, sp.location_tag,
  (select count(*) from wedding_vendors wv where wv.account_id=c.venue_account_id and wv.role='venue') as venue_weddings,
  left(regexp_replace(sp.caption_raw, E'[\n\r]+',' ','g'), 260) as caption
from jeremy_wedding_candidate_posts cp join jeremy_wedding_candidates c on c.id=cp.candidate_id and c.clustering_version='structural-v2' and c.chicago_status='CHICAGO_CONFIRMED'
join accounts a on a.id=c.venue_account_id join staging.instagram_posts sp on sp.post_url=cp.source_post_url
where not exists (select 1 from post_venue_verdicts_current v where v.post_url=cp.source_post_url)
  and c.venue_anchor_source='author'
order by venue_weddings asc, c.id limit 90;
-- 3) Full captions for the ambiguous ones (the 230-char cut hides the couple line often enough to matter):
-- select split_part(p.post_url,'/',5), p.location_tag, left(regexp_replace(p.caption_raw, E'[\n\r]+',' ','g'), 900)
-- from staging.instagram_posts p where split_part(p.post_url,'/',5) in ('...');
