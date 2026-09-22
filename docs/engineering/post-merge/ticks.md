# Post-table merge — tick log

Mission: merge `staging.instagram_posts` into `public.posts` (CLAUDE.md thread 0). Plan of record:
`~/.claude/plans/read-thru-my-documentation-reflective-sundae.md` rev 3 (its rev-3 header wins over
the body). One row per tick, appended, never edited. Every tick re-runs the oracle:

```
cd apps/web && bun run scripts/graph/checkPostMergeParity.ts --baseline scripts/graph/snapshots/2026-09-22T22-43-25-093Z-pm-baseline
```

The baseline (rows in gitignored `snapshots/`, summary in
`apps/web/scripts/graph/tmp_analysis/pm_baseline_2026-09-22T22-43-25-093Z.json`) is written ONCE and
never rewritten; a diff is resolved by naming its cause.

**Writer lock:** OFF (starts at the P1 commit, ends at the P4-W3 commit). While ON: no acquisition
tick, parse, reader, creation or revert run.

| tick | phase | what | counts / parity | named causes | lock |
|---|---|---|---|---|---|
| 1 (2026-09-22 ~23:00 UTC) | P0 | Built `checkPostMergeParity.ts` (18 frozen outputs as full-row multisets + 3 captured sets + post-conditions; funnel SQL copied from `reportCorpusInventory.ts`). Wrote the one-time baseline `2026-09-22T22-43-25-093Z-pm-baseline`. Extended `snapshotGraphTables.ts` with `ops.post_observations`, `ops.crawl_runs`, `stack_extraction_runs`, `post_venue_verdicts`, `human_post_labels`, `jeremy_wedding_candidate_posts`. | Self-check: **0 frozen diffs, 0 failures** (393 s). Baseline: structural 62,139 rows · corpus urls 67,874 · legacy-unobserved 3,610 (0 in structural) · profile urls 10 · evidence orphans 0 across 15 url-keyed tables · posts 26,918 = distinct shortcode = distinct url · observations: 8,856 posts unobserved, 1,322 with zero `is_first`, 0 with several. | First self-check showed a false `v1_content_corpus` diff: captions contain newlines and the baseline file is newline-joined. **Fixed in the reader, not by re-baselining.** Continuation lines are regrouped and PROVEN against the row count + sha256 stored at write time; any mismatch throws. Findings for later ticks: (a) the DB is **971 MB** while CLAUDE.md says free tier (500 MB cap), so confirm the plan before P3; the merge adds about the size of staging. (b) Storage: to avoid holding every staging row twice, P1 will put the staging row in `raw` (`raw_format='jeremy_staging_v1'`) for staging-only and `jeremy_evidence` rows, and in `staging_raw` only where `raw` is an Apify payload (the 1,318). This is the same rev-3 semantics (staging precedence via `staging_post_id`) with no duplication. | OFF |
