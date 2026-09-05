# Venue-less Jeremy candidates — giving 369 candidates a venue anchor via Instagram location tags

**Status (2026-09-05): kicked off, not yet started.** Durable checklist for a `/loop`
mission — read this file first every wake-up, verify current state before checking
anything off. Full narrative: `docs/decisions.md` D032 (kickoff), D030 (why these 369 exist
and were excluded), `docs/engineering/graph-strengthening/ambiguous-tier-audit-handoff.md`
(the sibling audit this follows the same rigor as).

## Goal, restated

`jeremy_wedding_candidates.venue_account_id IS NULL` for exactly 369 candidates —
`runJeremyWeddingReconciliation.ts` skips them entirely because venue is the matching
anchor (confirmed, D030: `if (c.venue_account_id == null) continue`). D030 also confirmed
these aren't a parsing failure to fix — zero of them have a `role='venue'` extraction even
in raw `stack_extraction_entries` (before any filtering), meaning the underlying captions
genuinely never credited a venue by `@handle`. D030 explicitly flagged this as "no
reconciliation of this bucket without a venue-extraction follow-up, which is out of scope
[of that audit]." **This is that follow-up.**

Checked live before committing to this approach (2026-09-04, do not re-derive, re-verify
if it's been a while): joining these 369 to their underlying `staging.instagram_posts` via
`jeremy_wedding_candidate_posts.source_post_url`,

- **300 / 369 (81%) have a non-empty Instagram `location_tag`** — an independent signal
  from caption parsing (Instagram's own place-tagging feature, not text in the caption).
- 130 / 369 have an owning `staging.vendors.category ILIKE '%venue%'` (the post's own
  author is a venue account) — a weaker, secondary signal; CLAUDE.md already notes
  own-profile posts have a low (~29%) genuine-wedding hit rate, so this alone isn't
  sufficient corroboration of anything.

Goal: if `location_tag` values are clean enough to match against Ben's known venue
accounts with real confidence, backfill `venue_account_id` for the confidently-matched
subset, then let them flow through the **existing, already-trusted**
`runJeremyWeddingReconciliation.ts` unchanged — this mission solves the venue-anchor
problem only, not the reconciliation-decision problem (that's proven code, reuse it).

## Constraints (same bar every prior iteration of this workstream has held to)

- **Read a sample of the actual `location_tag` values by hand before designing any
  matching logic.** Don't assume they're clean venue names — Instagram location tags can
  be city-level ("Chicago, Illinois"), a chain/generic tag, or genuinely the venue. The
  match approach depends entirely on what's actually there.
- **This corpus has a proven false-merge risk** (D030's "magnet" pattern: same venue,
  reused vendors, wrong actual wedding). A location-tag match assigns identity
  (`venue_account_id`), which is even more load-bearing than a role credit — a wrong
  venue match here would feed a wrong wedding into reconciliation with false confidence.
  Err conservative: only backfill matches with real confidence (e.g. an exact or
  near-exact name match to exactly one Ben account, not a fuzzy multi-candidate guess).
- **Additive, surgical, non-destructive.** Backfilling `venue_account_id` only ever
  happens `WHERE venue_account_id IS NULL` — never overwrite an existing value (there
  shouldn't be one for this cohort, but check, don't assume). `--dry-run` first, read the
  full result by hand, idempotency verified live before considering it done.
- **Separate the two problems.** This mission ends at "candidate now has a
  `venue_account_id`." Whether that candidate then gets ingested into `wedding_vendors` is
  `runJeremyWeddingReconciliation.ts`'s existing job — re-run it for just the
  newly-anchored subset, don't reimplement its decision logic here.
- **A valid, complete outcome is "the location tags aren't clean enough to match
  confidently."** Same standard D030/D031 already set — don't force a number.
- Real DB writes will likely hit Claude Code's auto-mode classifier (same as every prior
  production write this workstream has made) — stop and hand the user the exact command
  with a `!` prefix when that happens; it's not a stopping condition for the loop itself.

## Checklist (work top to bottom; check off only after live re-verification)

- [ ] **Read a sample of `location_tag` values by hand** (~20-30, from the 300) — report
      here what they actually look like (clean venue names? addresses? generic city tags?
      a mix?) before deciding on a matching strategy.
- [ ] **Build a read-only sizing/matching script** (mirror `sizeCaseBAttachOpportunity.ts` —
      no writes), matching `location_tag` against `accounts.full_name` / `vendors.name` /
      `vendors.address` for the venue-role accounts Ben already knows. Report: how many of
      the 300 resolve to exactly one confident match, how many are ambiguous, how many
      match nothing.
- [ ] **Read a sample of the actual matches by hand** — confirm they're correct, not just
      plausible-looking. This is the step that caught real problems in every prior
      iteration (Case A, the ambiguous-tier audit, Case B) — don't skip it here.
- [ ] **Decide**: if precision looks genuinely good, build the backfill script
      (`UPDATE jeremy_wedding_candidates SET venue_account_id = $1 WHERE id = $2 AND
      venue_account_id IS NULL`, `--dry-run` first, idempotency verified). If not, record
      that explicitly as the outcome.
- [ ] **Re-run `runJeremyWeddingReconciliation.ts`** for the newly-anchored candidates only,
      then apply the same ingestion bar (`applyJeremyEvidenceToGraph.ts`/
      `applyAmbiguousEvidenceToGraph.ts`'s pattern) to whatever it decides is safe.
- [ ] **Docs closed out**: `docs/decisions.md` entry, `ROADMAP.md` updated, this file's
      Status line set to closed either way.

## Baseline findings

*(not yet filled in — the loop's first step)*
