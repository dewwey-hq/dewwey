# Real Weddings — Portal & Lightbox Updates

Summary of the Instagram embed work for the venue detail modal (June 2025). Use this when finishing backend rollout or handing off to Claude Code.

---

## What shipped (frontend — live on `localhost:3000` after refresh)

### Portal grid (unchanged intent)
- 3-up carousel of wedding posts in the venue modal
- Uniform `4:5` cards with compact square embed previews
- Date footer on each card (e.g. "June 2026")
- Pager: `‹ 1 of 4 ›`
- **View weddings** opens the fullscreen lightbox

### Fullscreen lightbox (`WeddingPostLightbox`)
- Black backdrop, Airbnb-style top bar: **Close** · **N / total** · **Heart**
- White card with **media-only** Instagram embed (no duplicate caption)
- Left/right arrows to switch between wedding posts
- Keyboard: `Escape` closes lightbox; arrow keys navigate posts
- **Removed:** caption footer (date, hashtags, show more, View on Instagram)

### Embed sizing (the hard part)
Lightbox iframe height is computed from:
1. **Stored dimensions** (`media_width`, `media_height`) when API returns them — exact `height ÷ width`
2. **CDN URL heuristics** as fallback (square vs portrait vs landscape carousel crops)
3. **Viewport fit** — subtracts top bar (56px), padding (32px), then shrinks width until embed fits

---

## Instagram aspect ratios (reference)

All values are **height ÷ width** (matches IG embed `padding-bottom` %).

| Format | Pixels | Ratio | Embed padding |
|--------|--------|-------|---------------|
| Square | 1080×1080 | 1.00 | 100% |
| Portrait (4:5) | 1080×1350 | 1.25 | 125% |
| Portrait tall (3:4) | 1080×1440 | 1.333 | ~133% |
| Landscape (1.91:1) | 1080×566 | 0.524 | ~52% |
| Mixed carousel (~2:3) | varies | 0.667 | ~67% |

Constants live in `app/components/InstagramEmbed.tsx` → `INSTAGRAM_MEDIA_ASPECT`.

**Carousel rule:** first slide sets the frame for the whole post. Apify `dimensionsWidth` / `dimensionsHeight` on the parent post reflect that.

**CDN thumb traps:** scraped thumb URLs are often square crops of portrait/landscape masters. Heuristics use crop prefixes (`c170.0.683.683a`) and `p` vs `s` CDN size tokens when stored dimensions are missing.

---

## Files changed

| File | Role |
|------|------|
| `app/components/InstagramEmbed.tsx` | Aspect constants, URL heuristics, `computeLightboxEmbedLayout`, embed chrome math |
| `app/components/VenuesClient.tsx` | `RealWeddingsSection`, `WeddingEmbedGridCard`, `WeddingPostLightbox` |
| `lambdas/vendor-search/index.js` | Returns `post_type`, `media_width`, `media_height` on `realWeddings` |
| `scripts/scrape-instagram.js` | Saves dimensions from Apify on insert |
| `scripts/scrape-instagram-v2.js` | Same |
| `scripts/lib/apify-media-dimensions.js` | Shared helper: `dimensionsWidth` / `dimensionsHeight` / `childPosts[0]` |
| `scripts/migrations/005_instagram_posts_media_dimensions.sql` | Adds `media_width`, `media_height` columns |

---

## Backend still to do (for bulletproof sizing)

Frontend works today with URL heuristics. Stored dimensions need:

### 1. Run migration 005 on RDS

```bash
psql \
  -h wedding-app-prod-db.c8zk0w2mm2mu.us-east-1.rds.amazonaws.com \
  -U postgres \
  -d postgres \
  -f scripts/migrations/005_instagram_posts_media_dimensions.sql
```

### 2. Deploy `vendor-search` lambda

The detail endpoint must SELECT and return `media_width`, `media_height`:

```sql
SELECT ..., post_type, media_width, media_height
FROM instagram_posts
WHERE vendor_id = $1
```

Response shape per post:

```json
{
  "post_url": "https://www.instagram.com/p/.../",
  "media_width": 1080,
  "media_height": 1350,
  "post_type": "Sidecar",
  "images": ["..."],
  ...
}
```

### 3. Re-scrape (optional but recommended)

Existing rows have `NULL` dimensions until re-scraped. Scrapers only insert on `ON CONFLICT DO NOTHING` — duplicates won't backfill.

Options:
- Add an upsert/backfill script that `UPDATE`s `media_width` / `media_height` on conflict
- Or run a one-off backfill from Apify for venues already in DB

Apify fields used (`apify/instagram-scraper`):

- `item.dimensionsWidth`, `item.dimensionsHeight`
- Fallback: `item.childPosts[0]` for sidecar first slide

---

## Key functions (for debugging)

```ts
// Exact sizing when DB has dimensions
instagramMediaAspect({ mediaWidth: 1080, mediaHeight: 1350, ... }) // → 1.25

// Lightbox layout
computeLightboxEmbedLayout({
  viewportWidth,
  viewportHeight,
  footerHeightPx: 0,  // caption footer removed
  imageUrl,
  imageCount,
  mediaWidth,
  mediaHeight,
})
```

Iframe height formula (lightbox):

```
height = width × aspect + 54px header + (32px carousel dots if multi-slide) + 12px buffer
```

Portal compact mode always uses **square** media inside **4:5** cards regardless of real post shape.

---

## Test posts (Stan Mansion / known edge cases)

| Shortcode | Type | Notes |
|-----------|------|-------|
| `DZq7z51juBZ` | Portrait carousel | 125% embed — reference “looks good” |
| `DZp_iVfEcs9` | Square carousel | Was mis-sized as portrait |
| `DZr6y75AZyW` | Landscape carousel | ~67% embed — was mis-sized as square |
| `DZr6y75AZyW` | Landscape-ish | CDN square thumbs + horizontal crop offset |

Manual check: open `/venues` → venue modal → **View weddings** → click through posts above.

---

## Out of scope / not changed

- Portal carousel layout and card sizing
- Photo gallery lightbox (Google venue photos) — separate component
- Reels (`9:16`) — different embed type; not sized for wedding lightbox today
- `post_vendors` junction table — still planned, see ROADMAP.md

---

## Related docs

- `ROADMAP.md` — scrape pipeline v2 batching and future schema work
- `scripts/migrations/README.md` — migration index including 005
