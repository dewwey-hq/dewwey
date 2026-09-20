[serve-venue-details] mode: DRY RUN (no write)
[serve-venue-details] batch_id: vd-serve-c5, prompt_version: venue-details-v3.4, reason: extract
[serve-venue-details] candidate accounts: 6
  account 31: run 48 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      [dry-run] revert plan: bun run scripts/venue-details/rollbackVenueDetails.ts --account-id 31 --to-version 0 --note "revert vd-serve" --apply
  account 477: run 49 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      [dry-run] revert plan: bun run scripts/venue-details/rollbackVenueDetails.ts --account-id 477 --to-version 0 --note "revert vd-serve" --apply
  account 27389: run 51 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      [dry-run] revert plan: bun run scripts/venue-details/rollbackVenueDetails.ts --account-id 27389 --to-version 0 --note "revert vd-serve" --apply
  account 2785: run 50 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      [dry-run] revert plan: bun run scripts/venue-details/rollbackVenueDetails.ts --account-id 2785 --to-version 0 --note "revert vd-serve" --apply
  account 1131: run 53 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      [dry-run] revert plan: bun run scripts/venue-details/rollbackVenueDetails.ts --account-id 1131 --to-version 0 --note "revert vd-serve" --apply
  account 507: run 52 (extract) -> version 1, changes: 1 (added 1, changed 0, removed 0), compare_ready=true, needs_review=false
      first paths: /
      [dry-run] revert plan: bun run scripts/venue-details/rollbackVenueDetails.ts --account-id 507 --to-version 0 --note "revert vd-serve" --apply

[serve-venue-details] done. served=0 skipped=0
