# Place photo CDN cache — automation (future work)

Automate the monthly `npm run refresh-all-photos` pass so nobody has to remember to run it, and Google's photo resource names/CDN URLs never go stale unattended.

**Status:** Caching architecture is live (`vendors.photo_cdn_urls`, see `docs/engineering/places-photos.md`). The refresh itself is still manual.

**Cost at our scale:** $0 new infra either way (GitHub Actions free tier or Vercel Cron both cover this). ~1–2 hrs dev time.

---

## Context

- `scripts/cache-venue-photos.js` resolves Places photo names → CDN URLs (`lh3.googleusercontent.com`), stored in `vendors.photo_cdn_urls` / `photo_cdn_cached_at`.
- Google's caching policy allows up to 30 days before a refresh is required.
- `scripts/refresh-place-photos.js` (Cursor) refreshes stale photo *names* when Places expires them; `cache-venue-photos.js` also self-heals stale names inline as a fallback.
- Today: `npm run refresh-all-photos` runs both, but only if a human remembers to run it.

---

## Options

- [ ] **GitHub Actions cron** — `.github/workflows/refresh-photos.yml`, scheduled monthly (`cron: '0 6 1 * *'`), runs `npm run refresh-all-photos` with DB + Google API secrets from repo secrets. Simplest, free, no new infra.
- [ ] **Vercel Cron** — add a `/api/cron/refresh-photos` route + `vercel.json` cron entry. Keeps it inside the same deploy; needs the route to run as long as the batch takes (or split into small batches across multiple invocations if it risks the serverless timeout).
- [ ] **External scheduler (Claude cron / cron-job.org / etc.)** — hits a protected API route or triggers a script externally. Lowest lift if we don't want to touch CI config.

**Recommendation (pick one when picking this up):** GitHub Actions — repo already has CI-adjacent tooling, no serverless timeout risk since it runs as a normal Node process, and secrets management is already familiar (same pattern as any other repo secret).

---

## Implementation sketch (GitHub Actions path)

- [ ] Add repo secrets: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `GOOGLE_PLACES_SERVER_API_KEY`
- [ ] `.github/workflows/refresh-photos.yml`:
  ```yaml
  on:
    schedule:
      - cron: '0 6 1 * *'   # 1st of month, 6am UTC
    workflow_dispatch: {}    # allow manual trigger from GitHub UI
  jobs:
    refresh:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: 20 }
        - run: npm ci
        - run: npm run refresh-all-photos
          env:
            DB_HOST: ${{ secrets.DB_HOST }}
            DB_PORT: ${{ secrets.DB_PORT }}
            DB_NAME: ${{ secrets.DB_NAME }}
            DB_USER: ${{ secrets.DB_USER }}
            DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
            GOOGLE_PLACES_SERVER_API_KEY: ${{ secrets.GOOGLE_PLACES_SERVER_API_KEY }}
  ```
- [ ] Verify a manual `workflow_dispatch` run completes and updates `photo_cdn_cached_at` for all vendors
- [ ] Add a Slack/email failure notification (optional) — GitHub Actions emails on failure by default if notifications are on

---

## Verify after automating

- [ ] Confirm cron actually fires (check Actions tab after first scheduled run)
- [ ] Spot-check a few vendors' `photo_cdn_cached_at` advance after the run
- [ ] Confirm no manual step is needed going forward

---

## References

- `docs/engineering/places-photos.md` — architecture, cost breakdown, debug checklist
- `scripts/cache-venue-photos.js`
- `scripts/refresh-place-photos.js`
- `app/hooks/use-place-photos.ts`
