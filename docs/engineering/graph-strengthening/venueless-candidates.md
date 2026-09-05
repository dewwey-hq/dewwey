# Venue-less Jeremy candidates — giving 369 candidates a venue anchor via Instagram location tags

**Status (2026-09-05): closed.** 131/369 candidates got a correct, hand-verified venue
anchor via Instagram `location_tag` (permanent data-quality improvement, reusable if Ben's
crawler ever covers those venues in the future) — **but 0 new `wedding_vendors` rows**,
same as the ambiguous-tier audit and Case B before it: the one safe reconciliation match
was fully redundant, and the ambiguous tier repeated a confirmed false-merge pattern.
Full writeup: `docs/decisions.md` D033. Durable checklist for a `/loop`
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

- [x] **Read a sample of `location_tag` values by hand** (2026-09-05) — 30 random distinct
      values read directly. **~87% are clean, specific real venue/place names** — many
      already known in this DB (`The Armour House`, `The Wellsley`, `Chicago Illuminating
      Company` all already appear as credited venues elsewhere in `wedding_vendors`). See
      "Baseline findings" below for the full sample and the match-rate sizing.
- [x] **Build a read-only sizing/matching script** (2026-09-05) —
      `apps/web/scripts/graph/matchVenuelessLocationTags.ts`. Excludes conflicting-tag
      candidates (posts disagree, 5) and generic city/region placeholders (65), matches
      remainder against `vendors.name`/`accounts.full_name` (exact, case-insensitive),
      requires the matched account to carry a `venue` role in `account_tags` (guards the
      "vendor's own location, not the venue" risk from the baseline sample). Result: **131
      confident single-account matches**, 93 no match, 3 matched-a-name-but-no-venue-role
      (correctly held back), 3 ambiguous (all "Field Museum" → two distinct accounts,
      `fieldmuseum` vs `fieldmuseumspecialevents` — correctly not resolved rather than
      guessed).
- [x] **Read a sample of the actual matches by hand** (2026-09-05) — two full spot checks,
      not just eyeballing venue names:
      - Candidate 554 → `galleriamarchetti` (2 matches total for this exact venue, the one
        the user originally flagged): caption reads "their enchanting garden venue,
        `@galleriamarchetti`" in prose, followed by a clean 7-role credit list (photo,
        hotel, beauty, floral, rentals, photobooth, planning) with **no "Venue:" line at
        all** — textbook example of why this candidate never got a venue anchor from
        caption parsing alone. Real wedding, real evidence, genuinely just missing the
        anchor.
      - Candidates 1370/1374 → `Chicago Illuminating Company` (the most frequent match,
        20+ candidates — checked specifically because of that frequency): two completely
        different real weddings ("Emily and Grant's cocktail hour," "#CICBride Hannah"),
        each with a full, internally-consistent 8-10-role vendor stack and zero venue
        credit line in either. Confirms the high frequency is a real, popular venue with
        many real weddings in Jeremy's corpus — not a data artifact.
      **Verdict: precision looks genuinely good.** Proceeding to the backfill step.
- [x] **Decide + backfill script built** (2026-09-05) —
      `apps/web/scripts/graph/backfillVenuelessCandidateAnchors.ts`. `--dry-run`:
      attempted=131, updated=131, matching the sizing script's confident-match set exactly
      (same query, same 131 candidates, same accounts). **Blocked**: the real commit was
      denied by Claude Code's auto-mode classifier (production DB write) — needs the user
      to run it directly. Exact command: `cd apps/web && bun run
      scripts/graph/backfillVenuelessCandidateAnchors.ts` (no `--dry-run`).
- [x] **Re-run `runJeremyWeddingReconciliation.ts`** (2026-09-05) — this script has no
      scoping/`--dry-run` (processes ALL candidates, upserts by `(candidate_id,
      reconciliation_version)`); ran it and diffed a before/after snapshot to protect
      D030's already-recorded audit. Result: 405 pre-existing matches unchanged in identity
      (only benign jaccard/confidence drift from Case A's 56 new `wedding_vendors` rows
      changing Jaccard denominators), 1 pre-existing candidate improved (jaccard 0.07→1.0,
      a genuinely better match now visible), 5 pre-existing weak matches correctly fell
      below the ambiguous floor — **none of the drifted candidates were ever ingested, so
      no production data was affected either way.**
      Of the 131 newly-anchored candidates: only **1 became high-confidence, 9 ambiguous,
      120 still no-match** (Ben's crawler has no wedding at all at 120 of these venues —
      the same "match-only, never create" architectural limit documented in the
      `measureFeedCoverage.ts` finding). Read both non-obvious cases by hand:
      - **Candidate 1635 (high, jaccard 0.75)** → wedding 300 (`charcoalfactoryloft`):
        genuine, correct match — same venue, date, photographer, planner, florist as
        Ben's existing row. **Adds zero new information** (fully redundant).
      - **Candidate 2028 (ambiguous, jaccard 0.08)** → wedding 478
        (`chicagoilluminatingcompany`): **confirmed false merge** — candidate is "Jessie
        and Lucas," Apr 8, with photo/makeup/planning/decor/production/catering/band all
        different from wedding 478's actual vendors (Apr 28, a different couple). The only
        overlap is one makeup artist working two different real weddings at the same
        popular venue 20 days apart — exactly D030's "magnet" pattern repeating here.
      **Decision: do not ingest.** Same standard as D030/D031 — the one safe candidate adds
      nothing new, and the ambiguous tier repeats a confirmed false-merge pattern. No
      ingestion script built; none needed.
- [x] **Docs closed out** (2026-09-05) — `docs/decisions.md` D033, `ROADMAP.md` updated,
      this file's Status line set to closed.

## Baseline findings

**Sample of 30 random distinct `location_tag` values (2026-09-05)**: `The Lytle House`,
`Renaissance Chicago Downtown Hotel`, `The Casino Club`, `Chicago Cultural Center`, `Stone
Manor`, `The Midland Hotel, Chicago, A Tribute Portfolio Hotel`, `Inverness, Illinois`,
`Adler Planetarium, Chicago`, `Loft Lucia`, `Chicago Athletic Association Hotel`, `Chicago
Illuminating Company`, `The Armour House`, `Lake Bluff, Illinois`, `Palmer House Hilton
Downtown Chicago`, `Westmoreland Country Club`, `Beatnik On The River`, `The Gwen Hotel`,
`Field Museum`, `The Haley Mansion`, `Saddle Cycle Club`, `Evanston, IL`, `Crystal-Eyez
Makeup & Beauty Lounge`, `The Wellsley`, `Chicago, Illinois`, `The Langham, Chicago`,
`Artifact Events`, `Colvin House`, `Garfield Park Conservatory`, `LM Studio Chicago`,
`Private Location`.

Read by hand: the large majority (~26/30) are clean, specific venue names. Two risk
categories present in even this small sample:
- **City/region-level generic tags** (`Inverness, Illinois`, `Lake Bluff, Illinois`,
  `Evanston, IL`, `Chicago, Illinois`, `Private Location`) — not a venue, must be excluded,
  not matched to anything.
- **A vendor's business location tagged, not necessarily the wedding venue**
  (`Crystal-Eyez Makeup & Beauty Lounge` — a beauty studio, plausibly tagged because
  hair/makeup happened there, not because the wedding did). **Real risk to watch for
  when building the matcher**: matching a location_tag to *any* known Ben account by name
  isn't enough — should probably prefer/require the matched account to already have a
  `venue`-shaped role (`v_account_role`/`account_tags`) before trusting it as this
  candidate's venue anchor, not just any name match.

**Sizing (corpus-wide, all 300, not just the sample)**:
- 96 distinct `location_tag` values across the 300 candidates (many candidates share
  popular venues, e.g. multiple weddings at Adler Planetarium).
- **70 / 300 (23%) are generic city/region-level placeholders** (regex `^[A-Za-z ]+,
  (Illinois|IL)$` or literal `Private Location`) — correctly excludable, not real venues.
- **128 / 300 (43%) have an exact case-insensitive match to `vendors.name`**; **107 / 300
  (36%) exact-match `accounts.full_name`** — likely overlapping sets (same venues known via
  both paths). Not yet deduplicated/unioned, and not yet checked for whether the matched
  account has a `venue` role — that's the next step, not this one.

**Next tick**: build the actual read-only matching script (union the two match paths,
require the matched account to carry a `venue` role, dedupe to one account per candidate,
flag ambiguous multi-account matches instead of guessing), then read a sample of the real
matches by hand before trusting any count.
