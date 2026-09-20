[serve-venue-details] mode: APPLY (real write)
[serve-venue-details] batch_id: vd-serve-f1, prompt_version: venue-details-v3.5, reason: extract
[serve-venue-details] candidate accounts: 27
  account 280: run 106 (repair) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 10)
  account 194: run 71 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 11)
  account 551: run 70 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 12)
  account 525: run 72 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 13)
  account 687: run 73 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 14)
  account 3970: run 108 (repair) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 15)
  account 529: run 112 (repair) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 16)
  account 1329: run 76 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=false, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 17)
  account 8023: run 77 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 18)
  account 482: run 79 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 19)
  account 560: run 78 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=false, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 20)
  account 592: run 82 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 21)
  account 4420: run 80 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 22)
  account 524: run 81 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=false, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 23)
  account 577: run 84 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 24)
  account 520: run 111 (repair) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=false, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 25)
  account 595: run 85 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 26)
  account 263: run 86 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 27)
  account 591: run 87 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=false, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 28)
  account 521: run 88 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 29)
  account 484: run 109 (repair) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 30)
  account 1461: run 92 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 31)
  account 3300: run 107 (repair) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 32)
  account 129: run 93 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=false, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 33)
  account 509: run 110 (repair) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=false, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 34)
  account 540: run 95 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=false, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 35)
  account 1660: run 96 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=false, needs_review=false
      first paths: /
      APPLIED -- version 1 (id 36)

[serve-venue-details] done. served=27 skipped=0
[serve-venue-details] to revert this batch: bun run scripts/venue-details/rollbackVenueDetails.ts --batch-id vd-serve-f1 --apply
