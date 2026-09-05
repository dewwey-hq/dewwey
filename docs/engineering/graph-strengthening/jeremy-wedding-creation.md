# Creating new weddings from unmatched Jeremy evidence — the first identity-creation mission

**Status (2026-09-05): kicked off, not yet started.** Durable checklist for a `/loop`
mission — read this file first every wake-up, verify current state before checking
anything off. Full narrative: `docs/decisions.md` D034 (kickoff).

## Why this is different from everything else this workstream has done

Every prior mission (D023, D030, D031, D033) only ever **matched** Jeremy evidence to a
wedding Ben's own crawler already found. `runJeremyWeddingReconciliation.ts` has no
`INSERT INTO weddings` — confirmed by reading it directly. That's why
`measureFeedCoverage.ts` shows only 63 of 1,384 documented weddings (4.6%) have any
Jeremy-sourced credit, and why 2,212 of 2,503 venue-anchored candidates (88%) sit
permanently unmatched: most of them aren't wrong, Ben's crawler just never happened to
find that specific wedding.

User's call (2026-09-05, asked directly and decided): stop treating "match-only" as
permanent. Build the mechanism to **create** a new `weddings` row from strong, unmatched
Jeremy evidence when we're genuinely confident it's a real, distinct wedding — not
something Ben already has under a name/date that just didn't match.

**This is a real escalation in risk, not a formality.** Matching only risks conflating two
real weddings that both already exist. Creating risks that plus two new failure modes that
don't exist in a match-only world:
1. **Duplicate creation** — inserting a new wedding for something Ben's crawler *does*
   have, just under weak enough matching evidence that reconciliation missed it. This
   fragments the graph (the same real wedding now has two disconnected records) instead of
   enriching it.
2. **Intra-Jeremy duplicates** — two Jeremy candidates that are the same real wedding but
   never clustered together (the exact mechanism D022 already found and quantified — a
   real, unfixed clustering-order bug). Creating a wedding per un-clustered candidate would
   create two new weddings for one real event.
Every prior mission this session found concrete instances of exactly this class of error
(D030's magnet pattern, D031's two confirmed false merges, D033 repeating D030's pattern at
the same venue) at the *matching* step alone. Treat that as the base rate to beat here, not
evidence that this is safe by default.

## Sizing, checked live before scoping (2026-09-05, re-verify if stale)

Of 2,212 candidates with `matched_wedding_id IS NULL` (all already have 3+ named vendor
roles and a resolved date — clustering already enforced that; evidence *quality* isn't the
gating question here, duplicate risk is):

| subset | count | duplicate risk |
|---|---|---|
| Venue has **zero** existing Ben weddings at all | **447** | Lowest — nothing to be a near-miss duplicate of at that specific venue |
| Venue has **some** existing Ben weddings, this one just didn't match | 1,765 | Higher — could be a real new wedding at a popular venue, or a weak match that should have hit |

**Start with the 447.** The 1,765 "near-miss" pool needs a materially better duplicate
check (was this candidate actually just a bad Jaccard/date miss against an existing Ben
wedding at the same venue?) before it's safe to touch — treat as a later phase, not part of
this mission's initial scope.

## Constraints (non-negotiable, given the risk class)

- **Pilot small, read every single one by hand, before batch-creating anything.** Given
  this is identity creation (not just a credit or an anchor), the bar is higher than any
  prior mission's "read a sample." Start with 10-20 candidates end-to-end, by hand, before
  considering a larger batch.
- **Check for intra-batch duplicates before creating anything.** Before inserting, run a
  Jaccard/date comparison *among the 447 candidates themselves* (not just against Ben's
  existing weddings) — two candidates that look like the same wedding must not become two
  new rows. Mirror `phase_dedup()`'s own logic (Jaccard > 0.5 within 21 days) as the
  starting comparison, since that's the same rule Ben's own pipeline uses to decide "is
  this the same wedding."
- **Provenance, unambiguous and separable.** New weddings created this way must be
  clearly, permanently marked as Jeremy-sourced-created (a new table, e.g.
  `jeremy_weddings_created`, mirroring `jeremy_wedding_vendors_ingested`'s shape) so they
  can be audited, and if a problem is found later, identified and removed without guessing
  which rows in `weddings` came from where.
- **Additive only, `--dry-run` first, transaction-wrapped, idempotency verified live** —
  same bar every prior mission held to, no exception for this one.
- **A valid, complete outcome is a small pilot, not the full 447 (or 2,212).** If the pilot
  finds real duplicate or false-content risk at a meaningful rate, that's the answer —
  slow down and redesign the duplicate check, don't push through to hit a number. This
  mirrors D030/D031/D033's own "don't force it" standard, applied to a higher-stakes write.
- Real DB writes will likely hit Claude Code's auto-mode classifier — stop and hand the
  user the exact command with a `!` prefix when that happens; not a stopping condition for
  the loop.

## Checklist (work top to bottom; check off only after live re-verification)

- [x] **Intra-batch duplicate check on the 447** (2026-09-05) —
      `apps/web/scripts/graph/checkIntraBatchDuplicates.ts`. 447 confirmed in scope, 73
      venues have 2+ in-scope candidates (plausible — genuinely new-to-Ben venues can have
      multiple real weddings), 1,249 within-venue pairs checked. **0 suspected duplicates**
      (jaccard > 0.5 within 21 days, mirroring `phase_dedup()`'s own rule). Clean.
- [x] **Pilot: read 15 candidates end-to-end by hand** (2026-09-05) — candidates 158, 351,
      396, 540, 624, 662, 701, 1158, 1222, 1250s/1253, 1363, 1650, 2250, 2756, 2804. **All
      15 are genuinely real, distinct, well-documented weddings** — coherent named couples,
      rich internally-consistent vendor stacks (8-17 credits each), no thin/suspicious
      content. Two are press/blog reposts (Modern Luxury Weddings, Style Me Pretty) rather
      than a vendor's own post — still describe real, specific, identifiable weddings, not
      a concern on their own.
      **Real risk pattern found and stress-tested, not just noted**: several candidates
      mention a SECOND location alongside the resolved venue anchor — a ceremony church vs.
      reception hotel (candidates 158, 624), a "prep location" hotel (540, 1363), a venue +
      its management company (396). This matters because the clustering algorithm's chosen
      `venue_account_id` isn't always the account Ben's own crawler would anchor on, so a
      secondary-mentioned account *could* already have an existing Ben wedding this
      candidate should have matched instead of needing creation. Checked the two most
      concrete cases directly:
      - Candidate 158 ("Ellie & John," 2024-05-12) also credits "Reception:
        `@thedrakechicago`" — Drake Hotel has 3 existing Ben weddings, but all in 2026 with
        zero vendor overlap. Not a duplicate.
      - Candidate 662 (Field Museum wedding, 2025-03-04) is anchored at
        `fieldmuseumspecialevents` (zero Ben weddings) but the sibling account `fieldmuseum`
        has 2 existing Ben weddings (2026-05-22, 2026-08-18 — one of which correctly credits
        *both* accounts as venue, confirming Ben's graph already handles this sibling
        relationship). Different years, only one shared vendor (`ecbg_studio`, an extremely
        common cake vendor seen across dozens of unrelated weddings this session). Not a
        duplicate.
      **Both checked out safe, but the pattern is real and needs a systematic check, not
      per-case luck** — see the refined creation-script requirement below.
- [ ] **Build the creation script** — mirror `applyJeremyEvidenceToGraph.ts`'s shape:
      `INSERT INTO weddings (venue_id, event_date_est, is_chicago)` for the pilot batch
      only, then `INSERT INTO wedding_posts` / `wedding_vendors` for that new wedding's
      evidence, logged into the new `jeremy_weddings_created` provenance table.
      `--dry-run` first, read the full result by hand, idempotency verified live.
      **Refined requirement from the pilot (2026-09-05)**: before creating each candidate,
      check not just "does the resolved `venue_account_id` have zero existing Ben
      weddings" but also cross-reference the candidate's OTHER extracted vendor accounts
      (any of them, not just role='venue') against Ben's `weddings`/`wedding_vendors` by
      date+Jaccard, the same rule `checkIntraBatchDuplicates.ts` already uses — a secondary
      account mentioned in the caption (a reception venue when the anchor is the ceremony
      church, a sibling venue brand) could reveal an existing Ben wedding this candidate
      should match instead of needing creation. Build this as an extension of the existing
      duplicate-check script, not a one-off per-candidate manual check.
- [ ] **Decide on scope beyond the pilot** — if the pilot's duplicate/quality checks come
      back clean, decide how much of the remaining 447 (and later, the 1,765) to bring in,
      and under what continuing verification cadence (spot-checks per batch, not just the
      first one). If not clean, redesign the duplicate check before going further.
- [ ] **Docs closed out** — `docs/decisions.md` entry, `ROADMAP.md` updated, this file's
      Status line set to closed or "ongoing, phase N complete."

## Baseline findings

*(not yet filled in — the loop's first step)*

## Deliberately not touched this mission

- The 1,765 "near-miss" candidates (venue has some Ben weddings already) — meaningfully
  higher duplicate risk, needs its own, stricter design once the 447 pilot proves the
  mechanism out.
- The 2,092→now-2,212 count includes candidates whose venue anchor itself might later
  prove wrong (rare, but not zero after D033's work) — not re-auditing venue anchors here,
  trusting D033's hand-verified matches.
