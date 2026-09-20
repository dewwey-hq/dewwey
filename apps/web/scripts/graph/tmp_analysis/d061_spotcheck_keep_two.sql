-- D061 blind spot-check follow-up (2026-09-19 night). The user labeled two model-created weddings
-- NOT_WEDDING during the hidden-verdict pass, then on review decided to KEEP both weddings
-- (12321 thewellsley percussion post; 12319 thelibraryat190 seating-chart post for a named couple).
-- Verdicts are append-only and latest-wins, so the kept weddings need a superseding THIS_VENUE row
-- under the user's own reviewer id with the reason -- never a delete of the NOT_WEDDING row.
-- Run: psql "$DATABASE_URL" -X -f d061_spotcheck_keep_two.sql   (expect 2 rows)
insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, reviewed_by, notes)
select v.post_url, v.candidate_id, v.venue_account_id, 'THIS_VENUE', 'jeremy',
       'reconsidered after the D061 spot-check review (2026-09-19): wedding kept; supersedes the NOT_WEDDING label'
from post_venue_verdicts_current v
where v.post_url in ('https://www.instagram.com/p/DdcSZiPIrYW/', 'https://www.instagram.com/p/DdZWunYv_jq/')
  and v.reviewed_by = 'jeremy' and v.verdict = 'NOT_WEDDING'
returning post_url;
