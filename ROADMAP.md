# Roadmap

Check "Now" before starting a thread — two sessions colliding on the same
in-flight work is what this section prevents. History: `docs/decisions.md`.

## Now

- Link Vercel: this repo, root directory `apps/web`, Ben's account. Then the
  dewwey.com domain story (and a custom domain to replace the r2.dev URL).
- Ben ↔ Jeremy merge conversation (`docs/merge-eval.md` is the case). Data
  import already done on Ben's authorization (2026-08-22); the conversation
  is now about the merge itself and rotating his RDS/API credentials.

## Next

- TS port of the pipeline (926 lines of Python) with OpenRouter swapped in for
  Anthropic-direct and `avatars.py` writing to R2.
- Re-parse Jeremy's 47k staged captions through the stack parser
  (`wedding_score` filter, `source='own_profile'`), refresh `edges`, then
  drop the `staging` schema.

## Later

- Graph explorer UI — the differentiator on top of the venue browse.
- Monthly recency crawl (Vercel cron or GitHub Actions).
- Venue photos → R2 at seed time (`vendors.photo_keys`).
