/** Google Places photo resource name, e.g. places/ChIJ…/photos/AUacSh… */
const PLACE_PHOTO_NAME = /^places\/[^/]+\/photos\/[^/]+$/;

const MIN_WIDTH = 50;
const MAX_WIDTH = 1600;
const DEFAULT_WIDTH = 900;

export function isValidPlacePhotoName(name: string): boolean {
  return PLACE_PHOTO_NAME.test(name);
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

/** Client-safe URL — key stays on the server in /api/place-photo. */
export function placePhotoProxyUrl(photoRef: string, maxWidth = DEFAULT_WIDTH): string {
  const params = new URLSearchParams({
    name: photoRef,
    w: String(clampPhotoWidth(maxWidth)),
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
  | { ok: true; photoUri: string; photoName: string }
  | { ok: false; status: number };

export async function resolvePlacePhotoUri(
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
        return { ok: true, photoUri: result.photoUri, photoName: currentName };
      }
      if (result.status !== 404) continue;
    }

    if (attempt === 0) {
      const placeId = placeIdFromPhotoName(currentName);
      if (!placeId) break;

      const refreshed = await refreshPhotoName(placeId, keys);
      if (!refreshed || refreshed === currentName) break;
      currentName = refreshed;
      continue;
    }

    break;
  }

  return { ok: false, status: 404 };
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

async function refreshPhotoName(placeId: string, keys: string[]): Promise<string | null> {
  for (const apiKey of keys) {
    const upstream = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "photos",
      },
      next: { revalidate: 3600 },
    });

    if (!upstream.ok) continue;

    const data = (await upstream.json()) as { photos?: Array<{ name?: string }> };
    const freshName = data.photos?.[0]?.name;
    if (freshName && isValidPlacePhotoName(freshName)) {
      return freshName;
    }
  }

  return null;
}
