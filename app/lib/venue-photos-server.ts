const PLACE_ID = /^[A-Za-z0-9_-]+$/;
const PLACE_PHOTO_NAME = /^places\/[^/]+\/photos\/[^/]+$/;

const MIN_WIDTH = 50;
const MAX_WIDTH = 1600;
const DEFAULT_WIDTH = 900;

export function isValidPlaceId(placeId: string): boolean {
  return PLACE_ID.test(placeId);
}

export function isValidPlacePhotoName(name: string): boolean {
  return PLACE_PHOTO_NAME.test(name);
}

export function clampPhotoWidth(width: number | undefined): number {
  const parsed = width ?? DEFAULT_WIDTH;
  if (!Number.isFinite(parsed)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(parsed)));
}

export function clampPhotoCount(count: number | undefined): number {
  const parsed = count ?? 5;
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(10, Math.round(parsed)));
}

export function clampPhotoIndex(index: number | undefined): number {
  const parsed = index ?? 0;
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(9, Math.round(parsed)));
}

/** Server-side keys only — avoids browser-referrer restricted keys. */
export function getServerGoogleApiKeys(): string[] {
  const keys = [
    process.env.GOOGLE_MAPS_API_KEY,
    process.env.GOOGLE_PLACES_API_KEY,
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY,
  ].filter((key): key is string => Boolean(key));

  return [...new Set(keys)];
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
): Promise<string | null> {
  const upstreamUrl = new URL(`https://places.googleapis.com/v1/${photoName}/media`);
  upstreamUrl.searchParams.set("maxWidthPx", String(width));
  upstreamUrl.searchParams.set("skipHttpRedirect", "true");

  const upstream = await fetch(upstreamUrl, {
    headers: { "X-Goog-Api-Key": apiKey },
    next: { revalidate: 3600 },
  });

  if (!upstream.ok) return null;

  const data = (await upstream.json()) as { photoUri?: string };
  return data.photoUri ?? null;
}

export async function resolvePhotoNamesToUris(
  photoNames: string[],
  width: number,
): Promise<string[]> {
  const keys = getServerGoogleApiKeys();
  if (keys.length === 0) return [];

  const validNames = photoNames.filter(isValidPlacePhotoName);
  if (validNames.length === 0) return [];

  for (const apiKey of keys) {
    const urls: string[] = [];
    for (const photoName of validNames) {
      const uri = await fetchPhotoUri(photoName, width, apiKey);
      if (uri) urls.push(uri);
    }
    if (urls.length > 0) return urls;
  }

  return [];
}

export async function resolveVenuePhotoUris(
  placeId: string,
  width: number,
  count: number,
  photoNames?: string[],
): Promise<string[]> {
  const cachedNames = (photoNames ?? [])
    .slice(0, count)
    .filter(isValidPlacePhotoName);

  if (cachedNames.length > 0) {
    const fromCache = await resolvePhotoNamesToUris(cachedNames, width);
    if (fromCache.length > 0) return fromCache;
  }

  const keys = getServerGoogleApiKeys();
  if (keys.length === 0) return [];

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
    const resolvedNames = (data.photos ?? [])
      .slice(0, count)
      .map((photo) => photo.name)
      .filter((name): name is string => Boolean(name && isValidPlacePhotoName(name)));

    const urls: string[] = [];
    for (const photoName of resolvedNames) {
      const uri = await fetchPhotoUri(photoName, width, apiKey);
      if (uri) urls.push(uri);
    }

    if (urls.length > 0) return urls;
  }

  return [];
}

export async function resolveVenuePhotoUri(
  placeId: string,
  width: number,
  index: number,
): Promise<string | null> {
  const keys = getServerGoogleApiKeys();
  if (keys.length === 0) return null;

  for (const apiKey of keys) {
    const photoName = await fetchPhotoName(placeId, index, apiKey);
    if (!photoName) continue;

    const uri = await fetchPhotoUri(photoName, width, apiKey);
    if (uri) return uri;
  }

  return null;
}
