# Roadmap

Check "Now" before starting a thread — two sessions colliding on the same
in-flight work is what this section prevents. History: `docs/decisions.md`.

## Now

- Post classification (`docs/engineering/post-classification/`, D009–D015): **V1 shipped**,
  not via a full-corpus run. V3 is frozen (pooled precision 0.941). Full-corpus V3 (~$470)
  was judged too expensive for a first slice, so a zero-LLM-cost deterministic candidate
  score (`candidate-score-v1`) shrank the 47,623-post corpus to a 5,225-post high-signal
  pool first — see `candidate-generation-analysis.md` for the evidence. That pool ran
  through frozen V3 for $116.94 (vs. ~$470 full-corpus), yielding **4,033 INCLUDE posts**,
  now live in Supabase as the `v1_content_corpus` view and reachable in the app at `/feed`.
  Remaining ~42k posts (score <12) are NOT classified — deliberately deferred pending real
  product/user feedback, not a blocker. The 240-post manual audit from D013 is deprioritized,
  not run. **All of this is on local branch `post-classification-v1-corpus` (2 commits on top
  of main@d35dfd2) — NOT pushed, no PR yet.** Push failed: the `jhoffen` GitHub account has
  READ-only access to `dewwey-hq/dewwey` (see D015). Needs write access granted (or someone
  else to push) before this can go up as a PR — check that before starting related work, and
  don't assume this landed on `main` without checking. This is also most of the work for the
  "re-parse 47k staged captions" item below — its output (which own-profile posts are
  credible) is the ingest filter that item needs.
- Graph strengthening (`docs/engineering/graph-strengthening/`, D016–D019): stack parser ported
  to TS, two iterations eval-tested (96.8% precision / 92.4% recall / 83.2% role accuracy against
  real ground truth). **Evidence + candidate layer is now implemented and live**:
  `jeremy_post_vendor_evidence` (a view — 32,633 rows, 4,982 unique vendors), `jeremy_wedding_candidates`
  (2,872 candidates from 3,273 clustering-eligible posts), `jeremy_wedding_candidate_reconciliation`
  (143 high-confidence / 268 ambiguous / 2,092 no-match vs. Ben's current weddings). Idempotency
  verified live (reran both scripts, zero new/changed rows). 20 regression tests passing
  (`apps/web/scripts/graph/graphStrengthening.test.ts`). **`weddings`/`wedding_posts`/
  `wedding_vendors`/`edges`/`phase_dedup()` remain completely untouched** — verified live, exact
  same counts as before this work; `accounts` grew by exactly 3,287 (new vendor handles, the only
  sanctioned change). A pre-implementation architectural review (D019) found and fixed real
  problems in the first design (evidence identity was wrong, an unnecessary table, a durability
  risk from depending on `staging.instagram_posts` — see D019 for detail).
  **Reconciliation audit closed (D020)**: the 143 high-confidence matches were analyzed (not
  manually audited — see `docs/engineering/graph-strengthening/reconciliation-audit-143.md`)
  — 131/143 (91.6%) have an exact shared Instagram post URL between the Jeremy candidate and the
  Ben wedding (deterministic-strength evidence), the remaining 12 were reviewed and came back
  11 GREEN / 1 YELLOW / 0 RED with zero false-merge patterns. **Decision: trusted on automated
  evidence, no reconciliation redesign justified.**
  **Follow-up A shipped (D021, `reconcile-v2`)**: reconciliation now has an evidence floor —
  candidates matching neither the high nor ambiguous threshold get `matched_wedding_id = null`
  instead of the closest-available (however weak) venue-mate. High (143) and ambiguous (268)
  tiers verified byte-identical to `reconcile-v1`; distinct Ben weddings matched dropped 494→283,
  many-to-one collisions 322→79, the previously-flagged 58-way collision (wedding 1290) is now 7
  (all high/ambiguous). `reconcile-v1` preserved untouched (versioned, not overwritten).
  **Follow-up B still open**: order-dependent greedy clustering can under-merge same-wedding
  posts into separate candidates (concrete case: wedding 468, candidates 2105/2116) — confirmed
  this does not cause reconciliation false merges, just redundant candidates, but is still worth
  fixing. Separate future experiment, not attempted yet.
  **Known gap, not yet fixed**: posts with 1-2 (not 3+) vendor roles contribute evidence but
  aren't currently attached to any candidate even when they'd match one that already exists —
  fast, well-scoped next addition. **Not yet done, deliberately deferred**: merging
  confidently-reconciled candidates into Ben's live serving graph (needs a decision on whether to
  invest in making `weddings.id` stable first, informed by this real data rather than a
  prerequisite guess).
- The dewwey.com domain story: point it at the Vercel project (linked
  2026-08-22), add a custom domain for R2 to replace the r2.dev URL, and
  check the Google Maps browser key's referrer allowlist covers the new
  domains (it may be restricted to Jeremy's old ones).
- Ben ↔ Jeremy merge conversation (`docs/merge-eval.md` is the case). Data
  import already done on Ben's authorization (2026-08-22); the conversation
  is now about the merge itself and rotating his RDS/API credentials.

## Next

- Google sign-in: create the OAuth client in Google Cloud Console (redirect URI
  `https://ljcbslfdlfehgjrdnfco.supabase.co/auth/v1/callback`), paste ID/secret
  into Supabase Auth → Providers → Google. The button already ships.

- TS port of the pipeline (926 lines of Python) with OpenRouter swapped in for
  Anthropic-direct and `avatars.py` writing to R2.
- Ingest graph-strengthening's extracted vendor relationships into
  `weddings`/`wedding_vendors`/`edges` (see "Now" above — extraction is built and evaluated,
  ingestion is not), then drop the `staging` schema.

## Later

- Post media → R2: scrape each wedding post's images once, render our own
  carousel — removes IG embed chrome ("Add a comment") entirely.
- Graph explorer UI — the differentiator on top of the venue browse.
- Monthly recency crawl (Vercel cron or GitHub Actions).
- Venue photos → R2 at seed time (`vendors.photo_keys`). Needs a server-side
  Places key (~$7/1k photo fetches, est. $100–175 one-time).
