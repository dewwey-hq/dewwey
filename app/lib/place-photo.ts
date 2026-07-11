/** Google Places photo resource name, e.g. places/ChIJ…/photos/AUacSh… */
const PLACE_PHOTO_NAME = /^places\/[^/]+\/photos\/[^/]+$/;

const MIN_WIDTH = 50;
const MAX_WIDTH = 1600;
const DEFAULT_WIDTH = 900;

export function isValidPlacePhotoName(name: string): boolean {
  return PLACE_PHOTO_NAME.test(name);
}

export function clampPhotoWidth(width: number | undefined): number {
  const parsed = width ?? DEFAULT_WIDTH;
  if (!Number.isFinite(parsed)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(parsed)));
}

/** Client-safe URL — key stays on the server in /api/place-photo. */
export function placePhotoProxyUrl(photoRef: string, maxWidth = DEFAULT_WIDTH): string {
  const params = new URLSearchParams({
    name: photoRef,
    w: String(clampPhotoWidth(maxWidth)),
  });
  return `/api/place-photo?${params.toString()}`;
}

export function getGooglePlacesApiKey(): string | undefined {
  return (
    process.env.GOOGLE_PLACES_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ??
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  );
}
