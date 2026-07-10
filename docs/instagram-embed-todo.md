# Instagram embed validation — future work

Track broken third-party embeds (e.g. Colvin House `DZnnI8xv6dZ`) and show preview/fallback instead of Instagram’s “link may be broken” chrome.

**Status:** Not started — revisit after map browse work.

**Cost at our scale:** $0 new services. Mostly dev time (~half day for Layers 1 + 3).

---

## Context

- Post may still open on [instagram.com](https://www.instagram.com) but **embed** (`/p/{id}/embed/`) can return `EmbedBrokenMedia`.
- Common causes: poster disabled embedding, post private/removed, per-post restriction — not a Dewy URL bug.
- We already have: `checkEmbedAvailable` (`app/lib/instagram-embed-check.ts`), `/api/instagram/embed-status`, session cache (`app/lib/instagram-embed-status-cache.ts`), preview image fallback (`InstagramEmbed` + scraped `image_url`).

**Gap today:** Uncached posts default to `embedAvailable: true`, so broken iframes flash before the check completes.

---

## Layer 1 — Check before iframe (quick win, ~1–2 hrs)

- [ ] Change prefetch default: uncached → `null` / loading, not `true` (`instagram-embed-status-cache.ts` line ~71)
- [ ] While checking: show scraped `image_url` or skeleton (not iframe)
- [ ] Mount iframe only when `embedAvailable === true`
- [ ] Keep batch prefetch on venue modal open (one POST per venue, not per card)
- [ ] Verify: Colvin House broken posts show preview + “View on Instagram”, not broken embed UI

**Performance:** Same batch check as today; often *less* work (fewer iframes). Session cache 24h unchanged.

---

## Layer 2 — Preview fallback

- [x] Already built — `InstagramEmbed` uses `previewImageUrl` when `embedAvailable === false`
- [ ] Spot-check posts with `image_url` null still get “View on Instagram” pill (no dead iframe)

---

## Layer 3 — Store flag at scrape time (~3–4 hrs)

- [ ] Migration: `embed_available boolean` on `instagram_posts` (nullable → backfill)
- [ ] In `scripts/scrape-instagram.js` (or v2): call `checkEmbedAvailable`, save on insert/update
- [ ] One-off backfill script for existing rows (~1k posts, run locally)
- [ ] Lambda detail API: return `embed_available` on each `realWeddings` post
- [ ] UI: prefer DB flag; skip live check when flag is set

**After backfill:** Zero Instagram HTTP on page view for known posts.

---

## Layer 4 — Content quality (later, optional)

- [ ] Filter non-wedding posts from “real weddings” (e.g. workshop promos scraped via location tag)
- [ ] Heuristics: require venue @mention, wedding hashtags, or manual review queue
- [ ] Optional LLM pass on caption (~$5–20 batch) — not required for embed fix

---

## Test posts (Colvin House, vendor id 104)

| Shortcode     | Embed   | Notes                          |
|---------------|---------|--------------------------------|
| `DZfewxpDxeX` | OK      | Venue feature post             |
| `DZnnI8xv6dZ` | Broken  | Workshop promo, not a wedding  |
| `DZKggGjR4AW` | OK      |                                |

---

## References

- `app/lib/instagram-embed-check.ts`
- `app/api/instagram/embed-status/route.ts`
- `app/components/InstagramEmbed.tsx`
- `docs/real-weddings-lightbox.md`
