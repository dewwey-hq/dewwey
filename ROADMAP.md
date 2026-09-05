# Roadmap

Check "Now" before starting a thread — two sessions colliding on the same
in-flight work is what this section prevents. Full history/reasoning for
anything below: `docs/decisions.md` (D001–D040 so far).

## Now

- Ben ↔ Jeremy merge conversation (`docs/merge-eval.md` is the case). Data
  import already done on Ben's authorization (2026-08-22); the conversation
  is now about the merge itself and rotating his RDS/API credentials.
- The dewwey.com domain story: point it at the Vercel project (linked
  2026-08-22), add a custom domain for R2 to replace the r2.dev URL, and
  check the Google Maps browser key's referrer allowlist covers the new
  domains (it may be restricted to Jeremy's old ones).
- **Done 2026-09-05**: PR #3 (`dewwey-hq/dewwey#3`, D026–D031, Cursor +
  two follow-up fixes) merged to `main` — two test bugs fixed first (a
  stale `wedding_vendors` row-count snapshot, a pool-lifecycle ordering
  bug that broke 2 new tests), 47/47 tests green, production deploy
  confirmed live (`/vendors/galleriamarchetti` returns 200, Feed tab
  renders).
- **Done 2026-09-05**: 369 venue-less Jeremy candidates — 131 got a
  correct venue anchor via Instagram `location_tag`, hand-verified,
  but 0 new `wedding_vendors` rows (the one safe match was fully
  redundant, the ambiguous tier repeated D030's false-merge pattern).
  D033, `docs/engineering/graph-strengthening/venueless-candidates.md`.
- Added `apps/web/scripts/graph/measureFeedCoverage.ts` — a re-runnable
  coverage metric. Reading as of 2026-09-05: of 4,033 `/feed` posts,
  only 63 distinct Ben weddings (4.6%) have a confirmed vendor credit.
- **Done 2026-09-05**: acted on the coverage gap above — reconciliation
  only ever matches a candidate to an *existing* Ben wedding, never
  creates one. Built identity-creation (first ever in this workstream),
  scoped to the 447 unmatched candidates with zero existing Ben weddings
  at their venue. Two duplicate checks (intra-batch + secondary-account)
  clean throughout. 15-candidate hand-read pilot **committed**: 15 new
  weddings (D035). `is_chicago` was hand-verified for those 15 — scoped
  the fix (D036) and shipped **Phase 1** (D037): 100 more weddings after
  a bio cross-check caught 2 mislabeled "venues." **Phase 2** (208
  candidates / 130 venue accounts with zero location signal) pivoted from
  the paid Google Places API to free `WebSearch` after the user asked
  whether it could do better (D038): 99/130 confirmed real Chicago-metro
  locations across 4 batches, duplicate checks clean, a new
  church-vs-reception-venue ambiguity pattern found and excluded (44 of
  169 candidates), **125 more weddings created** from the clean pool
  (D039). **Total from this workstream: 240 weddings created; 303 of
  1,624 documented weddings (18.7%, up from 4.6% at the start of this
  arc) now trace to `/feed`** (`measureFeedCoverage.ts`). Both missions
  (`jeremy-wedding-creation.md`, `is-chicago-for-new-venues.md`) are
  closed. D034-D039.
- **Done 2026-09-05**: non-wedding posts on serving-graph feeds (D040–D041)
  — 11 user-flagged concerts/galas/marketing posts, run as a `/loop`
  eval mission rather than a URL-delete. Confirmed *not* Jeremy
  wedding-creation: all 11 were Ben `venue_tagged` single-post "weddings"
  that `phase_dedup()` formed on a 3+ role credit stack, with no
  `is_wedding` gate. Locked one narrow rule (`role_shape_v1`: wedding's
  role set ⊆ {venue, band, musician}, 100% precision / 0 false-EXCLUDEs
  across tune, known-good, and heldout) plus a hand-labeled review list;
  retired 46 posts / 40 weddings (`weddings` 1,624→1,584, `wedding_vendors`
  14,918→14,664, `edges` 63,229→61,848). Rule locked into
  `graphStrengthening.test.ts`; the crawler-side `is_wedding` gap is
  documented in `pipeline.py` but not yet wired up (low recall by design).
  `docs/engineering/graph-strengthening/non-wedding-posts.md`.

## Shipped, on `main` (compressed — see `docs/decisions.md` for full detail)

- **Post classification V1** (D009–D015): `candidate-score-v1` prefilter + frozen V3 classifier
  → 4,033 INCLUDE posts, live as `v1_content_corpus`, reachable at `/feed`. ~42k posts
  (score <12) deliberately unclassified pending real usage signal.
- **Graph strengthening** (D016–D024): Ben's stack parser ported to TS; a durable Jeremy
  evidence/candidate/reconciliation layer built independent of Ben's unstable `weddings.id`
  (D019); the 143 high-confidence reconciliation matches audited (D020, 91.6% exact-URL, 0 false
  merges) and trusted without a reconciliation redesign; a reconciliation evidence floor shipped
  (D021, `reconcile-v2`); clustering order-dependence investigated and quantified but **not**
  fixed, pending a schema decision (D022); the validated 143-match tier ingested into Ben's
  `wedding_vendors` for the first time — 100 genuinely new rows, additive-only, fully
  provenance-logged, idempotent (D023). Merged via `dewwey-hq/dewwey#1` (D024). The 268-candidate
  **ambiguous reconciliation tier was audited and not ingested** (D030): 5/268 exact-URL vs
  91.6% in the 143, 4 GREEN / 109 YELLOW / 150 RED on handle-diff, 49 magnet weddings (the
  false-merge pattern D020 didn't find); dry-run of the 9 identity-safe candidates produced 11
  role-variant rows and zero new vendor identities, write skipped. The 369 never-reconciled
  candidates are the venue-less skip, intentional, not a missed run.
- **Vendor feed/browse undercount** (D026–D031): Case A applied `stack-parser-ts-v3` to Ben's
  own posts — 56 new `wedding_vendors` rows, `ulcchicago`/wedding 1352 venue credit restored
  (D027). Case B (orphaned-post attach) sized and declined (D031): 11 mechanical hits, confirmed
  false merges, zero honest new Feed credits; `galleriamarchetti` Feed 15 matches the evidence.
  Vendor detail Feed now paginates (was silently capped at 50). Mission:
  `docs/engineering/vendor-feed-gap/README.md`. Merged via `dewwey-hq/dewwey#3`
  (2026-09-05, after fixing two test bugs the PR introduced).

## Next — open missions, each independently pickable

- **1–2 vendor-role evidence gap**: posts with only 1-2 (not 3+) non-`other` roles produce
  evidence but never attach to an existing candidate even when they'd match one. Mission: extend
  `runJeremyWeddingClustering.ts` to attempt attachment for these posts against existing
  candidates only (never let them seed a brand-new candidate, to avoid new low-evidence
  singletons). End state: measured before/after candidate-vendor-count delta, regression tests,
  no change to 3+-role clustering behavior. **Ben-side analog (Case B) was sized and declined
  (D031)** — a general attach onto existing Ben weddings would have written false merges.
  The Jeremy-candidate version is still open and is a different write path (candidates this
  workstream owns, not `weddings`).
- **D022 clustering fix (optional, low-priority)**: `>=0.5` instead of `>0.5` in
  `runJeremyWeddingClustering.ts` — fully evaluated (D022, 12 fewer candidates, 0 false merges
  found) but never shipped because retroactively applying it needs a
  `jeremy_wedding_candidates.superseded_by_candidate_id` schema addition, which needs explicit
  authorization (an `ALTER TABLE` attempt was blocked by the session's own safety guardrail, not
  by database permissions). Mission, if authorized: implement per the plan already written in
  `docs/engineering/graph-strengthening/clustering-boundary-investigation.md` ("What a future fix
  would look like"). End state: same rigor as D021/D023 — dry-run, idempotency proof, before/after
  counts, no change to the 143 high-confidence tier's content.
- **Drop the `staging` schema**: previously blocked on the ambiguous-tier decision (now closed,
  D030, not ingested) and on the INCLUDE-subset re-parse (already done, D029). Still blocked on
  anything that reads `staging.instagram_posts` for the remaining ~43k unclassified posts, which
  is a choice not a gap. Do not drop until that dependency is explicitly retired.
- **Re-parse 47k staged captions through the stack parser** — **closed 2026-09-04 as a
  misunderstanding**: the 4,033 V1 INCLUDE posts were already parsed (D029); the remaining open
  work was the ambiguous-tier audit, now also closed (D030, not ingested). The remaining ~43,590
  posts (score <12 or non-INCLUDE) are still deliberately unparsed, per the V1 classification
  design — not a gap, a choice.
- **Google sign-in**: create the OAuth client in Google Cloud Console (redirect URI
  `https://ljcbslfdlfehgjrdnfco.supabase.co/auth/v1/callback`), paste ID/secret into Supabase
  Auth → Providers → Google. The button already ships.
- **TS port of the pipeline** (926 lines of Python) with OpenRouter swapped in for
  Anthropic-direct and `avatars.py` writing to R2.

## Later

- Post media → R2: scrape each wedding post's images once, render our own
  carousel — removes IG embed chrome ("Add a comment") entirely.
- Graph explorer UI — the differentiator on top of the venue browse.
- Monthly recency crawl (Vercel cron or GitHub Actions).
- Venue photos → R2 at seed time (`vendors.photo_keys`). Needs a server-side
  Places key (~$7/1k photo fetches, est. $100–175 one-time).
