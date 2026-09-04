# Roadmap

Check "Now" before starting a thread — two sessions colliding on the same
in-flight work is what this section prevents. Full history/reasoning for
anything below: `docs/decisions.md` (D001–D024 so far).

## Now

- Ben ↔ Jeremy merge conversation (`docs/merge-eval.md` is the case). Data
  import already done on Ben's authorization (2026-08-22); the conversation
  is now about the merge itself and rotating his RDS/API credentials.
- The dewwey.com domain story: point it at the Vercel project (linked
  2026-08-22), add a custom domain for R2 to replace the r2.dev URL, and
  check the Google Maps browser key's referrer allowlist covers the new
  domains (it may be restricted to Jeremy's old ones).
- **Not yet done**: nobody has visually confirmed production (main just
  merged PR #1 — 2026-09-04, `dewwey-hq/dewwey#1`) actually serves `/feed`
  and the newly-ingested vendor data correctly post-deploy. Worth a quick
  manual check before assuming it's live and correct for real users.

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
  provenance-logged, idempotent (D023). Merged via `dewwey-hq/dewwey#1` (D024).

## Next — open missions, each independently pickable

- **Ambiguous reconciliation tier (268 candidates)**: decide whether/how to bring these into
  `wedding_vendors`. Mission: they were never audited the way the 143 were (D020 scope was
  strictly the high-confidence tier) — either build an equivalent audit for this tier first, or
  make an explicit, recorded decision to leave it un-ingested. End state: a decision recorded in
  `docs/decisions.md`, and if ingested, the same additive/provenance/idempotency bar D023 set.
- **1–2 vendor-role evidence gap**: posts with only 1-2 (not 3+) non-`other` roles produce
  evidence but never attach to an existing candidate even when they'd match one. Mission: extend
  `runJeremyWeddingClustering.ts` to attempt attachment for these posts against existing
  candidates only (never let them seed a brand-new candidate, to avoid new low-evidence
  singletons). End state: measured before/after candidate-vendor-count delta, regression tests,
  no change to 3+-role clustering behavior.
- **D022 clustering fix (optional, low-priority)**: `>=0.5` instead of `>0.5` in
  `runJeremyWeddingClustering.ts` — fully evaluated (D022, 12 fewer candidates, 0 false merges
  found) but never shipped because retroactively applying it needs a
  `jeremy_wedding_candidates.superseded_by_candidate_id` schema addition, which needs explicit
  authorization (an `ALTER TABLE` attempt was blocked by the session's own safety guardrail, not
  by database permissions). Mission, if authorized: implement per the plan already written in
  `docs/engineering/graph-strengthening/clustering-boundary-investigation.md` ("What a future fix
  would look like"). End state: same rigor as D021/D023 — dry-run, idempotency proof, before/after
  counts, no change to the 143 high-confidence tier's content.
- **Drop the `staging` schema**: blocked on (a) the ambiguous-tier decision above, and (b) the
  47k-caption re-parse below, since both currently read `staging.instagram_posts` indirectly via
  `v1_content_corpus`/`v1_content_corpus`-adjacent views. Do not drop until both are resolved.
- **Re-parse 47k staged captions through the stack parser**: post-classification V1's output
  (which own-profile posts are credible) is the ingest filter this needs — the filter exists now,
  the re-parse itself hasn't been run.
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
