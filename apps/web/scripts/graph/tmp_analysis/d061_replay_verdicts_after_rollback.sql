-- D061 pilot rollback rehearsal, second half (2026-09-19). After revertWeddingBatch.ts
-- --retire-verdicts superseded the pilot's 45 model verdicts with SKIP rows (reviewed_by
-- 'revert:acq-20260919-pilot-create-1'), re-creating the batch needs the model verdicts back.
-- Verdicts are append-only (post_venue_verdicts_current = latest per post_url), so this appends a
-- fresh THIS_VENUE row per post from the stored reader result -- the same rule
-- writeVerdictsFromExtractionRuns.ts applies (prompt_version extract-v1.2, THIS_VENUE, confidence
-- >= 0.8), which that script cannot do here because it skips posts that already have a current
-- verdict. No LLM call, no re-spend. Scope: only posts whose CURRENT verdict is the revert's SKIP.
--
-- Run: psql "$DATABASE_URL" -X -f d061_replay_verdicts_after_rollback.sql   (expect 45 rows)

insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, reviewed_by, notes)
select cur.post_url, cur.candidate_id, c.venue_account_id, 'THIS_VENUE', 'haiku-extract-v1',
       'replay of extract-v1.2 result after the D061 rollback rehearsal (revert:acq-20260919-pilot-create-1); confidence ' || x.confidence
from post_venue_verdicts_current cur
join post_extraction_runs x on x.post_url = cur.post_url  -- by post only: the run row's candidate_id is overwritten when a post sits in two candidates (unique key is post_url + prompt_version)
join jeremy_wedding_candidates c on c.id = cur.candidate_id
where cur.reviewed_by = 'revert:acq-20260919-pilot-create-1'
  and cur.verdict = 'SKIP'
  and x.prompt_version = 'extract-v1.2'
  and x.verdict = 'THIS_VENUE'
  and x.confidence >= 0.8
returning post_url;

-- Fallback (found on the rehearsal, 1 of 45): the retirement supersedes EVERY model verdict on the
-- reverted candidates' posts, including a non-THIS_VENUE one (here an OTHER_VENUE post inside a
-- two-post candidate). A SKIP row does not count as "decided" (candidate_review_derived), so the
-- candidate stays ineligible until the ORIGINAL verdict is restored verbatim from verdict history.
insert into post_venue_verdicts (post_url, candidate_id, venue_account_id, verdict, corrected_venue_account_id, reviewed_by, notes)
select cur.post_url, cur.candidate_id, prev.venue_account_id, prev.verdict, prev.corrected_venue_account_id, prev.reviewed_by,
       'replay from verdict history after the D061 rollback rehearsal (revert:acq-20260919-pilot-create-1); original reviewed_at ' || prev.reviewed_at
from post_venue_verdicts_current cur
join lateral (
  select venue_account_id, verdict, corrected_venue_account_id, reviewed_by, reviewed_at from post_venue_verdicts p
  where p.post_url = cur.post_url and p.candidate_id = cur.candidate_id
    and p.reviewed_by not like 'revert:%' and p.reviewed_at < cur.reviewed_at
  order by p.reviewed_at desc limit 1) prev on true
where cur.reviewed_by = 'revert:acq-20260919-pilot-create-1' and cur.verdict = 'SKIP'
returning post_url, verdict;
