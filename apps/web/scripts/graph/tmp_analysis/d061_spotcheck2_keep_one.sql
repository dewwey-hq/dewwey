-- D061 probes A spot-check follow-up (2026-09-20): the user labeled wedding 12866 (Sable Creek Homestead,
-- "sweetest couple... bride & groom big day... sneak peek") NOT_WEDDING during the hidden-verdict pass,
-- then on review chose to KEEP it (likely a mis-key). Append a superseding THIS_VENUE row under the
-- user's reviewer id -- never delete the NOT_WEDDING row. (Wedding 12804, Chicago Forte promo, was
-- retired via retireNonWeddingPosts.ts --from-audit, batch acq-20260919-probesA-spotcheck-retire-1.)
insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, reviewed_by, notes)
select v.post_url, v.candidate_id, v.venue_account_id, 'THIS_VENUE', 'jeremy',
       'reconsidered after the probes A spot-check review (2026-09-20): wedding 12866 kept; supersedes the NOT_WEDDING label'
from post_venue_verdicts_current v
where v.post_url = 'https://www.instagram.com/p/DZiHk-ngp0L/' and v.reviewed_by = 'jeremy' and v.verdict = 'NOT_WEDDING'
returning post_url;
