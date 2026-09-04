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
- Re-parse Jeremy's 47k staged captions through the stack parser
  (`wedding_score` filter, `source='own_profile'`), refresh `edges`, then
  drop the `staging` schema.

## Later

- Post media → R2: scrape each wedding post's images once, render our own
  carousel — removes IG embed chrome ("Add a comment") entirely.
- Graph explorer UI — the differentiator on top of the venue browse.
- Monthly recency crawl (Vercel cron or GitHub Actions).
- Venue photos → R2 at seed time (`vendors.photo_keys`). Needs a server-side
  Places key (~$7/1k photo fetches, est. $100–175 one-time).
