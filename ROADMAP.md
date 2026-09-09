# Roadmap

Check "Now" before starting a thread — two sessions colliding on the same
in-flight work is what this section prevents. Full history/reasoning for
anything below: `docs/decisions.md` (D001–D055 so far).

## Now

**Current status lives in `docs/STATE.md`** — one page, rewritten at the end of every session
(mission, live numbers, what's blocked on a human, next actions, landmines). This section only
lists the threads that aren't part of the active mission. Protocol for working across
sessions: `docs/engineering/working-across-sessions.md`.

- **Active mission: D055 "squeeze the 47k"** (2026-09-08 →). Phase 0 done, Phase 1 (human
  review at `/label/candidates` + batched creation) running — weddings 3,541 → 4,265 across
  three batches as of 2026-09-09. Phase 2 blocked on OpenRouter credit and Apify credits
  (2026-09-11). Full picture: `docs/STATE.md`; narrative: `docs/decisions.md` D055.
- Ben ↔ Jeremy merge conversation (`docs/merge-eval.md` is the case). Data
  import already done on Ben's authorization (2026-08-22); the conversation
  is now about the merge itself and rotating his RDS/API credentials.
- The dewwey.com domain story: point it at the Vercel project (linked
  2026-08-22), add a custom domain for R2 to replace the r2.dev URL, and
  check the Google Maps browser key's referrer allowlist covers the new
  domains (it may be restricted to Jeremy's old ones).
- Shipped 2026-09-05 → 09-07 and fully narrated in `docs/decisions.md`: D033–D042 (venue-less
  candidates, identity creation, non-wedding retirements), D043–D049 (v1 data completion,
  /label, beyond-INCLUDE mining, aliases, styled shoots), D050–D054 (venue-anchor bug, orphaned
  weddings, tail-end coverage, corpus mining as a standing process). Not restated here.

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
- **Wire an `is_wedding` gate into `pipeline.py`'s `phase_dedup()`** (D040-D042): 105 hand-
  labeled `venue_tagged` posts now live in `golden_set` (`source_note like
  'non_wedding_posts_%'`) — the first Ben-corpus slice, previously 100% own-profile. `role_shape_v1`
  (locked, low-recall by design) is the only rule shipped so far; with this larger labeled
  set a caption-based rule might now clear the precision bar that failed on the smaller
  tick-2 sample (0.80 tune / 0.667 heldout) — re-score against the full golden_set slice
  before trying, same eval discipline as D040 (tune/heldout, ≥98% precision, 0 false-
  EXCLUDEs on known-good). Whatever ships should gate the crawler itself, not just retire
  after the fact.

## Later

- Post media → R2: scrape each wedding post's images once, render our own
  carousel — removes IG embed chrome ("Add a comment") entirely.
- Graph explorer UI — the differentiator on top of the venue browse.
- Monthly recency crawl (Vercel cron or GitHub Actions).
- Venue photos → R2 at seed time (`vendors.photo_keys`). Needs a server-side
  Places key (~$7/1k photo fetches, est. $100–175 one-time).
- Use `golden_set`'s growing human-labeled corpus (1,710+ rows as of the
  human-labeling-ui session, spanning both `staging.instagram_posts` and
  `public.posts`) to look for what confirmed-WEDDING posts have in common
  and steer scraping/crawl strategy with it — candidate re-prioritization
  in `ops.crawl_frontier`, retuning `candidateScore.ts`'s formula now that
  there's a much bigger labeled set than it was built against, or informing
  the Google Places search strings in `pipeline.py`. Not scoped as a
  mission yet — a promising direction surfaced by the labeling data itself.
