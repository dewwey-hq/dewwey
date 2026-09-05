# is_chicago for newly-discovered venue accounts — closing the gap that blocked scaling past the D035 pilot

**Status (2026-09-05): Phase 1 committed. Phase 2 fully worked through: all 130 web-search
lookups done (99 confirmed), duplicate checks + a new church/venue-ambiguity filter applied
(125 of 169 candidates clean), creation dry-run verified (125 weddings, 144 posts, 1,335
vendor rows). Nothing committed yet — both the location backfill (99 rows) and the
creation (125 weddings) are dry-run-verified only, awaiting the user's review and the
`!`-prefixed commands below.** Durable checklist — read this file first every wake-up,
verify current state before checking anything off. Full narrative: `docs/decisions.md`
D036 (kickoff), D037 (Phase 1 committed), D038 (WebSearch pivot), D039 (Phase 2 complete,
dry-run ready).

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

## Phase 2 — the 208 (130 distinct venue accounts) with zero signal

**Revised 2026-09-05**: originally scoped as a paid Google Places API lookup (~$2-4 for 130
distinct venues). User asked whether free web search could do this better — tested directly
before committing to either path:

```
WebSearch("\"goebbertevents\" instagram Chicago wedding venue")
-> "The Venue at Goebbert's... rustic farm wedding venue located in Pingree Grove, IL
   (Chicago area)... 9,600 sq ft... seats up to 500" [instagram.com, goebbertevents.com,
   a wedding photographer's blog post about a real wedding there]

WebSearch("\"saddleandcycleclub\" instagram Chicago")
-> "Chicago's historic private club... 900 West Foster Avenue, Chicago, IL 60640...
   member-sponsored private events... weddings, galas" [saddleandcycle.com, Yelp, LinkedIn]
```

**Free web search wins on both cost and quality** — it returned an exact address and
confirmed wedding-hosting activity, which the Places API alone (address only) wouldn't have.
**Decision: use `WebSearch` instead of the Places API for Phase 2.** No real-money gate
applies to this path (it's a normal tool call, not an external paid service) — proceeding
without a separate cost sign-off, same DB-write discipline as every other phase still
applies (additive, dry-run, hand-read sample, idempotent).

Method: for each of the 130 distinct venue accounts (208 candidates share these), search
`"<username>" instagram Chicago [wedding venue]`, read the results, and record a judgment:
confirmed-Chicago-metro (with the source cited), confirmed-not-Chicago, or inconclusive
(leave unresolved rather than guess). Backfill `account_locations` (address/city/region/
in_metro/source/verified_at — `lat`/`lng` left null, web search doesn't geocode) for
confirmed cases only. Pace across multiple `/loop` ticks (~15-20 lookups per tick, not all
130 in one shot) so each result stays genuinely reviewed, not rubber-stamped.
After backfilling, this pool re-enters the exact same pipeline Phase 1 used: re-run both
duplicate checks scoped to the newly-resolved candidates, hand-read a proportionate sample,
extend the venue-role filter check, dry-run creation, commit with the user's review.

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

- [x] **Extend the `is_chicago` determination** (2026-09-05) — updated
      `createWeddingsFromJeremyEvidence.ts` to query `vendors.city='Chicago'` live per
      candidate instead of the D035 pilot's hardcoded `true` (kept as a fallback only for
      the original 15 pilot IDs, which were hand-verified without depending on this field).
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
- [x] **Re-run both duplicate checks once more** (2026-09-05), scoped to the filtered 102 —
      added the account_tags venue-role filter into both scripts' `--phase1` mode (not a
      one-off query). **102 confirmed, 0/102 flagged on both** (19 venues with 2+
      candidates, 301 within-venue pairs, 0 suspected duplicates; 0/102 secondary-account
      matches to an existing Ben wedding).
      **Two more confirmed mislabels found via a targeted bio cross-check** (the
      `account_tags` filter alone wasn't sufficient — both had a *stray* venue-shaped tag):
      - 2455 (`hangoutlighting`) — already known from the hand-read pilot, a lighting rental
        company with a spurious manual `venue` tag (confidence 0.8, evidence_count 1).
      - 2469 (`blueplatechicago`) — a catering company whose own bio literally reads
        "Venue: @alliumchicago," naming a different account as the real venue.
      Checked systematically (bio text search for a venue-redirect pattern) across all 102,
      not just these two — no other matches. **Final Phase 1 batch: 100 candidates.**
- [x] **Dry-run the creation for the clean 100** (2026-09-05) — 100 weddings, 112 posts
      (2 multi-post candidates), 945 `wedding_vendors` rows. Spot-checked the thinnest
      result (candidate 695, 3 vendors — the clustering minimum) by hand: genuine real
      wedding, just a short caption. D035's original 15 correctly skip as already-created.
- [x] **Committed** (2026-09-05) — user reviewed the summary and ran the script directly.
      100 weddings created (ids 1530-1629), 112 posts imported, 945 `wedding_vendors` rows,
      `edges` refreshed. Idempotency verified live (re-run: 0 new inserts, all 100 correctly
      skipped). Spot-checked wedding 1558 (`venuesix10`): `is_chicago=true`, renders on its
      vendor page.
- [x] **Decide on Phase 2** (2026-09-05) — pivoted from paid Places API to free `WebSearch`
      after the user asked whether it could do better; tested on 2 real accounts, confirmed
      it returns richer results (exact address + wedding-hosting confirmation, not just a
      city string) at zero real-money cost. See "Phase 2" section above for the method.
- [x] **Run Phase 2 web-search lookups** (2026-09-05) — all 130 distinct venue accounts
      attempted across 4 batches (22, 20, 45, 43 — later batches parallelized far more
      aggressively per the user's own prompt mid-run). **99 confirmed** (76%), added to
      `backfillVenueLocationsViaWebSearch.ts`'s `CONFIRMED_LOCATIONS`, dry-run verified
      (99/99 clean inserts, 0 conflicts). **22 inconclusive** (handle didn't resolve to a
      single confident account, or no location signal at all) — left unresolved, listed in
      Baseline findings below, not retried. **2 confirmed NOT Chicago-metro** (the venue is
      real but nowhere near Chicago) — `stjames1868` (Milwaukee, WI, ~90min away) and
      `williams.orchard` (LaPorte, IN, ~90min away) — excluded from the backfill entirely,
      also listed below so they're not silently re-attempted. The DB write itself is not
      yet committed — hit the same auto-mode classifier as every other write this session:
      ```
      cd apps/web && bun run scripts/graph/backfillVenueLocationsViaWebSearch.ts
      ```
- [x] **Re-run the Phase 1 pipeline** (2026-09-05) against the 99 confirmed accounts,
      scoped by an explicit account-ID list (not `account_locations.source='websearch'`,
      since that write hasn't landed in the DB yet — see checklist item above). Added a
      `--phase2` mode to both `checkIntraBatchDuplicates.ts` and
      `checkExistingDuplicatesForCreation.ts`. **169 candidates in scope, 0/169 flagged on
      both duplicate checks** (30 venues with 2+ candidates, 178 within-venue pairs, 0
      suspected intra-batch duplicates; 0/169 secondary-account matches to an existing Ben
      wedding). Bio-redirect check (Phase 1's `"Venue: @other_account"` pattern): 0 matches
      across all 99 accounts.
      **New risk category found in the 15-candidate hand-read sample** (see Baseline
      findings below): a ceremony-church-vs-reception-venue double-credit pattern, distinct
      from Phase 1's clean mislabels. Systematic check found **44 of 169 candidates (26%)**
      have 2+ accounts tagged `role='venue'` in `jeremy_wedding_candidate_vendors` — mostly
      a church credited alongside an unrelated reception venue, where the candidate's
      resolved `venue_account_id` sometimes picks the church even when the caption itself
      names a different, more specific "Venue:" credit (verified by reading the raw
      captions for 2 of the 44). This is genuinely ambiguous, not a confirmed mislabel like
      Phase 1's lighting-company/musician cases (some of the 44 are actually harmless —
      same physical venue under two account handles, e.g. `floatingworldgallery`/
      `floatingworldevents` — but distinguishing those from real church/venue conflicts
      one-by-one wasn't done given the volume; conservative exclusion covers both cases
      safely). **All 44 excluded from this batch** rather than guessing which of two
      legitimate accounts is "the" venue — full candidate ID list in
      `apps/web/scripts/graph/createWeddingsFromJeremyEvidence.ts`'s `PHASE2_CANDIDATE_IDS`
      comment. **Clean batch: 125 candidates.**
      **Dry-run creation** (2026-09-05): 125 new weddings, 144 posts imported (10
      multi-post candidates), 1,335 `wedding_vendors` rows. All 115 previously-created
      weddings (D035+Phase1) correctly skip via `jeremy_weddings_created` (idempotency
      holds). Spot-checked the thinnest result (candidate 1329, 4 vendors): genuine real
      wedding, short caption, `Venue: @rpmeventsandcatering` correctly resolved with no
      double-venue-tag ambiguity. `is_chicago` is set `true` for all 125 — the WebSearch
      confirmation IS the Chicago-metro determination for this batch (parallel to how
      D035's pilot forced `true` for its hand-verified 15, regardless of literal
      `vendors.city` string — some Phase 2 locations are suburbs like Oak Brook, Naperville,
      Kildeer, consistent with "Chicago metro," not literal city-limits, being the actual
      `is_chicago` semantics this whole workstream has used since D035).
      **Not yet committed** — awaiting the user's review of this summary and the
      `account_locations` backfill landing first (creation depends on nothing from that
      table directly, since `is_chicago` here is hardcoded off the same confirmed-account
      list, but conceptually the location backfill should land first for consistency).
- [x] **Docs closed out for Phase 1** (2026-09-05) — `docs/decisions.md` D037,
      `ROADMAP.md` updated, this file's
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

**Phase 2 web-search results (2026-09-05, all 130 accounts attempted)**:

99 confirmed as real Chicago-metro locations (address/city/region cited per-entry in
`backfillVenueLocationsViaWebSearch.ts`'s `source` field — a mix of exact street addresses
and city-only confirmations, per what the search actually returned; nothing guessed).
Several confirmed locations are outside Chicago proper but within the metro (e.g. Geneva,
Mokena, Oswego, LaGrange-adjacent suburbs) — consistent with how Phase 1's `vendors.city`
signal and D035's pilot both already treated genuine Chicagoland suburbs as in-scope, not
just the city limits.

**22 inconclusive — left unresolved, not guessed**:
`hyattchicago`, `arrowheadwheaton` (handle resolved to a different-but-similar account, not
a confident exact match), `alyssabudayyeh`, `ariella.e`, `austinjamescreative` (no location
signal in results), `bryn.mawrcc`, `cafebauer` (search only returned the differently-spelled
`cafebrauer`), `chicagoilluminating` (resolved to `chicagoilluminatingcompany`, a plausible
but unconfirmed handle variant), `loewschicago` (resolved to `loewschicagohotel`),
`loftluciagallery` (resolved to `loftlucia`), `madhauscollective`, `mswparish`, `ndbasilica`,
`nickpodraza` (a photographer, not a venue — no address), `small.but.mighty15`,
`stbenschicago`, `stjamesah`, `stonemanorweddings`, `stsvo`, `we.are.nsci` (a synagogue with
no location given in results). Each of these is a case where guessing would have been easy
but the evidence didn't actually support a specific address/city — correctly left open per
the mission's own "leave inconclusive ones unresolved rather than guess" rule.

**2 confirmed NOT Chicago-metro — excluded, not retried**:
- `stjames1868` — a real, well-documented wedding venue, but in Milwaukee, WI (~90 min from
  Chicago), not the Chicago metro area this corpus is scoped to.
- `williams.orchard` — a real wedding venue, but in LaPorte, IN (~90 min from Chicago),
  same exclusion reason.

**Next tick**: commit the Phase 2 backfill (99 rows, command above), then re-run both
duplicate checks + the venue-role filter scoped to `account_locations.source='websearch'`,
hand-read a proportionate sample, dry-run creation, present to the user for review.
