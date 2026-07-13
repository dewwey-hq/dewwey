/**
 * Build a direct Google Places (New) photo media URL for the browser.
 * Uses NEXT_PUBLIC_GOOGLE_PLACES_API_KEY (referrer-restricted browser key).
 *
 * Cost note: the browser loads images from Google’s CDN after one media request.
 * Do NOT proxy every view through our API — that burns Places quota on every card render.
 * Keep photo resource names fresh via `npm run refresh-place-photos` (see docs/places-photos.md).
 */
export function placesPhotoUrl(
  photoRef: string | null | undefined,
  maxWidth = 800,
): string | null {
  if (!photoRef) return null;
  const key = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  const w = Math.min(4800, Math.max(1, Math.round(maxWidth)));
  return `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=${w}&key=${key}`;
}
