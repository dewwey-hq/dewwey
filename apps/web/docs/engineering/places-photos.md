# Google Places photos — cost-optimized ops

**Symptom (repeat bug):** Venue cards show broken images on **localhost**, while **dewwey.com** looks fine (or both break after photo names expire).

**Goal:** Keep pictures for quality, minimize Places/Maps spend so GCP credits go to higher-value work (e.g. Vertex enrichment).

Related keys (keep both — see also Vercel/Google Cloud notes in chat history):

| Env var | Role |
|---------|------|
| `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` | Browser key — Maps JS + **direct photo `<img>` URLs**. HTTP **referrer** restricted. |
| `GOOGLE_PLACES_SERVER_API_KEY` | Server key — Place Details / photo **name refresh** only. No referrer restriction. |

---

## Root causes (we’ve hit both)

### 1. Referrer restriction (localhost only)

Browser key allows `dewwey.com` but not local origins. Dev console / network shows:

`API_KEY_HTTP_REFERRER_BLOCKED` / “Requests from referer … are blocked”

**Fix:** In Google Cloud → Credentials → browser key → Application restrictions → HTTP referrers, add:

```text
https://dewwey.com/*
https://www.dewwey.com/*
http://localhost:3000/*
http://127.0.0.1:3000/*
```

Do **not** put the server key in `NEXT_PUBLIC_*`.

### 2. Stale photo resource names (localhost + prod)

We store Places (New) photo names like `places/{placeId}/photos/{id}` in `vendors.photos`. Those names **expire**. Media then returns:

`The photo resource in the request is invalid. Please retrieve it from Places API endpoints.`

**Fix:** Refresh names with the server key (occasional batch — not per page view):

```bash
npm run refresh-place-photos -- --category venue
npm run refresh-place-photos -- --vendor-id 20
npm run refresh-place-photos -- --limit 20
```

Cadence suggestion: after seed, and ~monthly (or when broken images show up in prod). ~1 Place Details call per vendor per refresh.

---

## Cost-optimized architecture (current)

```text
Browse / cards / map
  → 1 photo from vendors.photos[0]
  → <img src="https://places.googleapis.com/v1/{photoName}/media?…&key=BROWSER_KEY">
  → Google serves image (browser cache helps on repeat views)

Venue modal
  → up to 3 photos (same direct media URLs)

Ops (rare)
  → npm run refresh-place-photos
  → Place Details (photos field) with SERVER_KEY
  → UPDATE vendors.photos
```

**Do not** proxy every photo through `/api/venue-photo` on each view. That was billing Place Details Photos (and sometimes Place Details) on every card — June 2026 was ~6.2k photo SKUs (~$37 before promo credit). UI now builds direct media URLs via `placesPhotoUrl` / `usePlacePhotos`.

Each successful media request still bills **Place Details Photos** (~$7/1k after free tier). Fewer images on browse is the main dial. Self-hosting Google photos or scraping venue-site images has ToS/copyright issues — not the default path.

---

## Quality vs cost checklist

| Approach | Pictures? | Cost |
|----------|-----------|------|
| Direct browser media URLs + fresh DB names | Yes | Low (Google CDN after media; refresh rare) |
| Proxy every view via Next + server key | Yes | High (Places on every uncached view) |
| Host copies of all venue photos ourselves | Yes | Storage/egress; copyright/ToS care |
| Skip photos | No | Cheapest — below quality bar |

**Maps:** keep one Map JS load per map view; avoid recreating maps unnecessarily. Prefer the browser/referrer key only for Maps + photos — don’t use the unrestricted server key in client bundles.

---

## Debug checklist (next time images break)

1. Network tab on a broken `<img>` — 403 referrer vs 400 invalid photo?
2. If **403** → fix referrer list (include localhost if local).
3. If **400 invalid photo** → `npm run refresh-place-photos -- --category venue`.
4. Confirm `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` is the **browser** key (same one Maps uses), not the server key.
5. Confirm Vercel has the same browser key as local for `NEXT_PUBLIC_*`.

---

## Ops path (scripts)

| Script | npm | When |
|--------|-----|------|
| `scripts/refresh-place-photos.js` | `npm run refresh-place-photos` | Stale/broken photos; after bulk seed |
| `scripts/seed.js` | `npm run seed` | Initial Places ingest (also writes photo names) |

Code that builds photo URLs: `app/lib/places-photo.ts` (used by venue list/modal + homepage).
