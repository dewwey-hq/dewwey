/**
 * Build a direct Google Places (New) photo media URL for the browser.
 * Uses NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (the one referrer-restricted browser key).
 *
 * Cost: each successful media load bills Place Details Photos. Prefer 1 photo
 * on browse cards.
 */
export function placesPhotoUrl(
  photoRef: string | null | undefined,
  maxWidth = 800,
): string | null {
  if (!photoRef) return null;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const w = Math.min(4800, Math.max(1, Math.round(maxWidth)));
  return `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=${w}&key=${key}`;
}
