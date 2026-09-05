# is_chicago for newly-discovered venue accounts — closing the gap that blocked scaling past the D035 pilot

**Status (2026-09-05): kicked off. Phase 1 in progress, Phase 2 needs explicit go-ahead
(real cost, external API).** Durable checklist — read this file first every wake-up,
verify current state before checking anything off. Full narrative: `docs/decisions.md`
D036 (kickoff).

## Why this exists

D035 created 15 new weddings from Jeremy evidence — the first identity-creation write this
workstream has made — but had to hand-verify `is_chicago` for 14 of 15 venue accounts,
because `account_locations` (Ben's own location enrichment) has never run on venues
discovered only through Jeremy's evidence. Hand-verification doesn't scale to the remaining
candidates. This mission closes that gap properly.

## Sizing, checked live before scoping (2026-09-05)

Of the 447 candidates originally scoped for creation (D034), 15 are now created (D035) and
76 more became reachable via normal reconciliation as a side effect (they shared a venue
with one of the 15, which now has a Ben wedding to match against — a good side effect, not
part of this mission). That leaves **356** still needing `is_chicago` resolved before any
further creation:

| signal | count | trust level |
|---|---|---|
| `vendors.city = 'Chicago'` (Places-linked, Ben's own data) | **136 (38%)** | High — confirmed this is real, varied geocoded data (4,925 total rows say "Chicago," others say "Milwaukee," "Atlanta," "Lake Geneva, Wisconsin," etc. — not a static default) |
| `account_locations` row already exists | 69 | High (this is the table D035 found mostly empty; some of these may overlap with the row above) |
| **No signal at all** (neither table has a row) | **208 (58%)** | None — needs real geocoding or continued hand-verification |

## Phase 1 — the 136 with existing `vendors.city='Chicago'` data (safe, no new infra)

This uses data Ben's own pipeline already collected and trusts elsewhere in this codebase
(`vendors` is the Places-identity layer, `city` is real geocoded output, not a guess). No
new external calls, no new cost — extend the creation script's `is_chicago` determination
to check `vendors.city='Chicago'` automatically instead of requiring hand-verification for
this subset.

**Still required, same discipline as D035**: re-run both duplicate checks
(`checkIntraBatchDuplicates.ts`, `checkExistingDuplicatesForCreation.ts`) against this
larger pool before creating anything — a bigger batch changes the intra-batch collision
surface. Hand-read a sample (not all 136 — D035's 15 already validated the underlying
evidence-quality bar; a smaller confirmatory sample, e.g. 15-20, is proportionate here)
before committing.

## Phase 2 — the 208 with zero signal (needs explicit go-ahead, real cost)

No existing trustworthy data resolves these. Two paths, not decided here:
1. **Geocode via the Google Places API** (`GOOGLE_MAPS_API_KEY`/browser key already used by
   `phase_m2` in `pipeline/pipeline.py` for exactly this kind of venue lookup) — search each
   venue's name, confirm it resolves to a real Chicago-metro place, backfill
   `account_locations`/`vendors` properly. This is the *right* long-term fix (also benefits
   every future mission touching these accounts, not just this one) but costs real money
   (Places Text Search is roughly $0.017-0.032/request — ~208 lookups is a few dollars, cheap
   in absolute terms but still a real external paid call) and is an "outward-facing" action
   this repo's own working agreement says to confirm before doing.
2. **Continued hand-verification in small batches** — doesn't scale, but zero cost/infra.
   Reasonable if the 208 turn out to be a low priority relative to other work.
**Do not start Phase 2 without the user's explicit go-ahead on the actual API calls** —
scope it, estimate cost precisely, then ask.

## Constraints (same bar as D030/D031/D033/D035)

- Additive only, `--dry-run` first, transaction-wrapped, idempotency verified live.
- Re-verify duplicate-check results fresh for whatever candidate pool is actually being
  created in each phase — don't reuse D035's 447-scoped results for a different pool.
- Hand-read a proportionate sample before trusting any batch, not just the first one ever.
- A valid, complete outcome for Phase 2 is "geocoding cost isn't worth it right now, stay
  at Phase 1's ceiling" — don't spend real money to hit a number.
- Real DB writes will likely hit Claude Code's auto-mode classifier — stop and hand the
  user the exact command with a `!` prefix; not a stopping condition for the loop. Any
  Google Places API spend is a SEPARATE gate — confirm with the user before making the
  first call, not just before the DB write.

## Checklist (work top to bottom; check off only after live re-verification)

- [ ] **Extend the `is_chicago` determination** to trust `vendors.city='Chicago'`
      automatically — update `createWeddingsFromJeremyEvidence.ts` (or a small shared
      helper both it and future scripts can use).
- [x] **Re-run both duplicate checks** (2026-09-05) against the 136-candidate Phase 1 pool
      — added a `--phase1` flag to both `checkIntraBatchDuplicates.ts` and
      `checkExistingDuplicatesForCreation.ts` (scopes to `vendors.city='Chicago'`, same
      "explicit, re-checkable" pattern as the rest of this mission) rather than a one-off
      query. **136 confirmed in scope (re-verified live, matches D036's sizing), 0/136
      flagged on both checks** — 22 venues have 2+ candidates (461 within-venue pairs, 0
      suspected duplicates), 0/136 flagged for a secondary-account match to an existing Ben
      wedding.
- [x] **Hand-read a proportionate sample** (2026-09-05, 15 of the 136) — all describe
      genuine real weddings, but surfaced a new risk category (see Baseline findings):
      `venue_account_id` can itself resolve to a non-venue vendor (a lighting company, a
      musician, a wedding planner mislabeled as venue in the source caption). Generalized
      into a systematic filter (require a corroborating `account_tags` role in
      venue/hotel/catering/rentals) applied to all 136, not just the ones found by hand:
      **102 pass, 28 excluded (confirmed mislabel pattern), 6 excluded conservatively
      (no signal either way)**.
- [ ] **Re-run both duplicate checks once more**, scoped to the filtered 102 (not the
      original 136 — the pool changed).
- [ ] **Dry-run the creation for the clean 102** (or whatever remains after the duplicate
      re-check), read the full result by hand, idempotency verified live, then commit (with
      the user's explicit review, same as D035).
- [ ] **Decide on Phase 2**: present the geocoding cost estimate and the do-nothing
      alternative to the user; do not call the Places API without explicit go-ahead.
- [ ] **Docs closed out** — `docs/decisions.md` entry, `ROADMAP.md` updated, this file's
      Status line set to reflect what actually shipped.

## Baseline findings

**Hand-read pilot, 15 candidates from the 136 (2026-09-05)**: all describe genuine,
coherent real weddings. But this pilot caught a **new risk category** D035's pilot didn't
encounter: the candidate clustering's own `venue_account_id` can itself be wrong —
resolving to a non-venue vendor entirely, not just a "vendor's own location tagged"
ambiguity (that was the location_tag mission's risk). Two confirmed cases, two different
root causes:
- **Candidate 2455**: `venue_account_id` = `hangoutlighting`, a lighting *rental* company
  ("Mix, match, & customize... lighting made easy" — its own bio). Not a venue.
- **Candidate 2411**: `venue_account_id` = `cloudgatequartet`, a musician credited under
  "Ceremony/Cocktail music" in the very same caption — which *also* clearly labels the real
  venue: "Venue/Catering - @thedrakeoakbrook". A clustering/extraction bug picked the wrong
  account, despite the correct one being right there.
- **Candidate 2542** (found via the systematic filter below, confirmed by reading the
  caption): `venue_account_id` = `ravisloeweddings`, credited "Venue: @ravisloeweddings" in
  the source caption itself — but everything else in the post (a bridal salon's styling
  content, "Discover your dream gown at Frontroom Couture Naperville") indicates this is a
  wedding *planner*, mislabeled as venue by whoever wrote the original caption. A source
  content error, not a parsing bug — same symptom, different cause.

**Generalized into a systematic filter, applied to all 136** (not just re-checking the 3
found by hand): does the candidate's `venue_account_id` have an `account_tags` row with
role in (`venue`,`hotel`,`catering`,`rentals`) — real venues are legitimately often *also*
tagged hotel/catering/rentals (e.g. a hotel or restaurant-group venue), so this isn't
requiring an exact `venue` tag, just *some* venue-shaped evidence.

| | count |
|---|---|
| Has a venue-shaped role tag (safe) | **102** |
| Has *only* non-venue roles (planner/dj/musician/etc — the mislabel pattern) | **28** |
| No role tags at all (no corroborating signal either way) | 6 |

**Decision: proceed with the 102 that have corroborating evidence.** The 28 with only
non-venue roles are excluded (confirmed-risk pattern, 2 of them hand-verified as genuine
mislabels). The 6 with no signal at all are excluded conservatively for this pass — no
positive evidence either way, small enough to leave for a later, separate look rather than
block or force a decision on them now.

**Next tick**: re-run both duplicate checks scoped to the 102, then dry-run creation.
