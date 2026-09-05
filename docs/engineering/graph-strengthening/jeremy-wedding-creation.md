# Creating new weddings from unmatched Jeremy evidence — the first identity-creation mission

**Status (2026-09-05): pilot complete and committed, scope-beyond-pilot still open.**
15 new weddings created from Jeremy evidence (the first identity-creation write this
workstream has ever made), hand-verified, duplicate-checked two ways, idempotency
confirmed live. Scaling past this pilot is blocked on a real `is_chicago` fix (see Open
questions) — not just re-running the same script with more IDs. Durable checklist for a
`/loop` mission — read this file first every wake-up, verify current state before checking
anything off. Full narrative: `docs/decisions.md` D034 (kickoff), D035 (pilot committed).

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
- [x] **Secondary-account duplicate check** (2026-09-05) —
      `apps/web/scripts/graph/checkExistingDuplicatesForCreation.ts`. For all 447, compares
      each candidate's FULL vendor set (every extracted account/role, not just the resolved
      venue anchor) against every Ben wedding sharing at least one vendor account, same
      jaccard>0.5-within-21-days rule. **Result: 0 of 447 flagged** — the multi-venue risk
      pattern found in the pilot (church/reception, sibling venue brands) does not produce
      any false positives at scale, matching the two hand-checked instances.
- [x] **Build the creation script** (2026-09-05) —
      `apps/web/scripts/graph/createWeddingsFromJeremyEvidence.ts`. Deliberately hardcodes
      the 15 hand-verified pilot candidate IDs rather than accepting a `--limit` flag, so
      scaling up requires deliberately editing the list, not bumping a number.
      **Real schema wrinkle found and solved**: `wedding_posts.post_id` is a NOT NULL FK to
      Ben's own `posts` table — Jeremy's captions live in `staging.instagram_posts`, a
      different table. No prior mission needed to bridge this (they only added credits to
      weddings that already had Ben-crawled posts). Solved by importing the underlying
      post(s) into `posts` with `source='jeremy_evidence'` (a new, self-explanatory value,
      no CHECK constraint exists — confirmed before choosing it), upserting the owner
      account, keyed on `posts.shortcode`'s existing UNIQUE constraint (extracted from the
      Instagram URL) for natural idempotency.
      **Second real gap found and solved**: `account_locations` has NO row at all for 14 of
      the 15 pilot venue accounts (Ben's location enrichment never ran on venues discovered
      only through Jeremy's evidence) — the naive fallback would have silently set
      `is_chicago=false` for real Chicago weddings, hiding them from `/weddings` and the
      `/vendors` browse list. 9 of 15 resolve via the Places-linked `vendors.city='Chicago'`
      field; the other 6 don't, but every one of the 15 was independently confirmed Chicago
      during the hand-read pilot (explicit `#chicagowedding` tags or a named Chicago
      landmark in the caption). Set `is_chicago=true` for this pilot as a **verified
      judgment call, not a default** — flagged as **not scaling** to the remaining ~432
      candidates without a real fix (geocoding new venue accounts into
      `account_locations`), see Open questions below.
      **`--dry-run` result (final)**: 15 weddings, 17 posts imported (matches multi-post
      candidates 351×2, 662×3, rest ×1), 172 `wedding_vendors` rows.
- [x] **Committed** (2026-09-05) — user reviewed the summary and ran the script directly.
      15 weddings created (IDs 1415-1429), 17 posts imported, 172 `wedding_vendors` rows,
      `edges` refreshed. Idempotency verified live immediately after (re-run: all 15
      "already created, skipping", 0 new inserts). Spot-checked wedding 1417
      (`amazingspacechicago`): `is_chicago=true`, 1 linked post, renders on
      `/vendors/amazingspacechicago` locally.
- [ ] **Decide on scope beyond the pilot** — the `is_chicago` gap (see Open questions) needs
      a real fix (geocoding new venue accounts into `account_locations`, or requiring
      `vendors.city` presence as a precondition) before any larger batch — hand-verifying
      is_chicago per candidate does not scale to 432 more. Once that exists, re-run the two
      duplicate checks against the remaining 432 (already built, just re-target) and repeat
      a hand-read pilot at whatever the next batch size is, not skip straight to bulk.
- [x] **Docs closed out for phase 1 (this 15-wedding pilot)** (2026-09-05) —
      `docs/decisions.md` D035, `ROADMAP.md` updated. Status line below reflects
      pilot-complete, not fully closed — scope-beyond-pilot is still open.

## Baseline findings

*(not yet filled in — the loop's first step)*

## Open questions, not resolved here

- **`is_chicago` for new venue accounts beyond this pilot.** `account_locations` has no
  row for 14/15 pilot venues; 9/15 resolve via `vendors.city='Chicago'`, the rest were
  confirmed only by hand-reading the caption. Scaling past a hand-verified pilot needs a
  real mechanism (geocoding, or requiring `vendors.city` presence as a precondition for
  automated creation) rather than manual verification per candidate.

## Deliberately not touched this mission

- The 1,765 "near-miss" candidates (venue has some Ben weddings already) — meaningfully
  higher duplicate risk, needs its own, stricter design once the 447 pilot proves the
  mechanism out.
- The 2,092→now-2,212 count includes candidates whose venue anchor itself might later
  prove wrong (rare, but not zero after D033's work) — not re-auditing venue anchors here,
  trusting D033's hand-verified matches.
