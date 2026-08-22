"use client";

import { useMemo } from "react";
import { placesPhotoUrl } from "@/app/lib/places-photo";

/**
 * Resolve venue photos for the UI.
 *
 * Prefer stored Places photo *names* → direct Google media URLs (browser key).
 * Avoids `/api/venue-photo` Place Details / skipHttpRedirect on every card render.
 * Each <img> load still bills Place Details Photos — keep `count` low on browse surfaces.
 */
export function usePlacePhotos(
  placeId: string | undefined,
  options: { maxWidth?: number; count?: number; photoNames?: string[] } = {},
) {
  const { maxWidth = 900, count = 1, photoNames } = options;
  const photoNamesKey = (photoNames ?? []).slice(0, count).join("|");

  const urls = useMemo(() => {
    if (!placeId) return [];
    const names = photoNamesKey ? photoNamesKey.split("|") : [];
    if (names.length === 0) return [];
    return names
      .map((name) => placesPhotoUrl(name, maxWidth))
      .filter((url): url is string => Boolean(url));
  }, [placeId, maxWidth, photoNamesKey]);

  return {
    urls,
    loading: false,
    error: Boolean(placeId) && (photoNames?.length ?? 0) > 0 && urls.length === 0,
  };
}
