/** Google Places photo resource name, e.g. places/ChIJ…/photos/AUacSh… */
const PLACE_PHOTO_NAME = /^places\/[^/]+\/photos\/[^/]+$/;
const PLACE_ID = /^[A-Za-z0-9_-]+$/;

const MIN_WIDTH = 50;
const MAX_WIDTH = 1600;
const DEFAULT_WIDTH = 900;

export function isValidPlacePhotoName(name: string): boolean {
  return PLACE_PHOTO_NAME.test(name);
}

export function isValidPlaceId(placeId: string): boolean {
  return PLACE_ID.test(placeId);
}

export function placeIdFromPhotoName(name: string): string | null {
  const match = name.match(/^places\/([^/]+)\/photos\//);
  return match?.[1] ?? null;
}

export function clampPhotoWidth(width: number | undefined): number {
  const parsed = width ?? DEFAULT_WIDTH;
  if (!Number.isFinite(parsed)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(parsed)));
}

export function clampPhotoIndex(index: number | undefined): number {
  const parsed = index ?? 0;
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(9, Math.round(parsed)));
}

/** Client-safe URL — resolves fresh photos from place_id on the server. */
export function placePhotoProxyUrl(
  placeId: string,
  maxWidth = DEFAULT_WIDTH,
  index = 0,
): string {
  const params = new URLSearchParams({
    place: placeId,
    w: String(clampPhotoWidth(maxWidth)),
    i: String(clampPhotoIndex(index)),
  });
  return `/api/place-photo?${params.toString()}`;
}

/** Prefer server-side keys before NEXT_PUBLIC browser-restricted keys. */
export function getGooglePlacesApiKeys(): string[] {
  const keys = [
    process.env.GOOGLE_PLACES_API_KEY,
    process.env.GOOGLE_MAPS_API_KEY,
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY,
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  ].filter((key): key is string => Boolean(key));

  return [...new Set(keys)];
}

export function getGooglePlacesApiKey(): string | undefined {
  return getGooglePlacesApiKeys()[0];
}

type PhotoUriResult =
  | { ok: true; photoUri: string }
  | { ok: false; status: number };

export async function resolvePlacePhotoUri(
  placeId: string,
  width: number,
  index: number,
): Promise<PhotoUriResult> {
  const keys = getGooglePlacesApiKeys();
  if (keys.length === 0) {
    return { ok: false, status: 503 };
  }

  for (const apiKey of keys) {
    const photoName = await fetchPhotoName(placeId, index, apiKey);
    if (!photoName) continue;

    const result = await fetchPhotoUri(photoName, width, apiKey);
    if (result.ok) {
      return { ok: true, photoUri: result.photoUri };
    }
  }

  return { ok: false, status: 404 };
}

/** Legacy fallback when only a cached photo resource name is available. */
export async function resolveCachedPhotoUri(
  photoName: string,
  width: number,
): Promise<PhotoUriResult> {
  const keys = getGooglePlacesApiKeys();
  if (keys.length === 0) {
    return { ok: false, status: 503 };
  }

  let currentName = photoName;

  for (let attempt = 0; attempt < 2; attempt++) {
    for (const apiKey of keys) {
      const result = await fetchPhotoUri(currentName, width, apiKey);
      if (result.ok) {
        return { ok: true, photoUri: result.photoUri };
      }
      if (result.status !== 404) continue;
    }

    if (attempt === 0) {
      const placeId = placeIdFromPhotoName(currentName);
      if (!placeId) break;

      for (const apiKey of keys) {
        const refreshed = await fetchPhotoName(placeId, 0, apiKey);
        if (refreshed && refreshed !== currentName) {
          currentName = refreshed;
          break;
        }
      }
      continue;
    }

    break;
  }

  return { ok: false, status: 404 };
}

async function fetchPhotoName(
  placeId: string,
  index: number,
  apiKey: string,
): Promise<string | null> {
  const upstream = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "photos",
    },
    next: { revalidate: 3600 },
  });

  if (!upstream.ok) return null;

  const data = (await upstream.json()) as { photos?: Array<{ name?: string }> };
  const photoName = data.photos?.[index]?.name ?? data.photos?.[0]?.name;
  if (!photoName || !isValidPlacePhotoName(photoName)) return null;
  return photoName;
}

async function fetchPhotoUri(
  photoName: string,
  width: number,
  apiKey: string,
): Promise<{ ok: true; photoUri: string } | { ok: false; status: number }> {
  const upstreamUrl = new URL(`https://places.googleapis.com/v1/${photoName}/media`);
  upstreamUrl.searchParams.set("maxWidthPx", String(width));
  upstreamUrl.searchParams.set("skipHttpRedirect", "true");

  const upstream = await fetch(upstreamUrl, {
    headers: { "X-Goog-Api-Key": apiKey },
    next: { revalidate: 3600 },
  });

  if (!upstream.ok) {
    return { ok: false, status: upstream.status };
  }

  const data = (await upstream.json()) as { photoUri?: string };
  if (!data.photoUri) {
    return { ok: false, status: 502 };
  }

  return { ok: true, photoUri: data.photoUri };
}
