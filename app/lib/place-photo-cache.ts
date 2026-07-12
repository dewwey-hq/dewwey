/** Resolved Google CDN photo URLs — safe to cache temporarily (not photo resource names). */
export const PLACE_PHOTO_URI_CACHE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const PLACE_PHOTO_URI_CACHE_CONTROL =
  `public, max-age=${PLACE_PHOTO_URI_CACHE_SECONDS}, stale-while-revalidate=86400`;

const STORAGE_PREFIX = "dewwey:place-photo-uri:";

export function placePhotoStorageKey(
  placeId: string,
  maxWidth: number,
  count: number,
  photoNamesKey: string,
): string {
  return `${STORAGE_PREFIX}${placeId}:${maxWidth}:${count}:${photoNamesKey}`;
}

export function readPlacePhotoUriCache(key: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { urls?: string[]; ts?: number };
    if (!parsed.urls?.length || !parsed.ts) return null;
    if (Date.now() - parsed.ts > PLACE_PHOTO_URI_CACHE_SECONDS * 1000) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.urls.filter(Boolean);
  } catch {
    return null;
  }
}

export function writePlacePhotoUriCache(key: string, urls: string[]): void {
  if (typeof window === "undefined" || urls.length === 0) return;
  try {
    localStorage.setItem(key, JSON.stringify({ urls, ts: Date.now() }));
  } catch {
    // Quota exceeded or private mode — ignore.
  }
}
