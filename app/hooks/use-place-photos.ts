"use client";

import { useEffect, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";

const CACHE_TTL_MS = 60 * 60 * 1000;
const photoCache = new Map<string, { urls: string[]; ts: number }>();

function cacheKey(placeId: string, maxWidth: number, count: number) {
  return `${placeId}:${maxWidth}:${count}`;
}

async function fetchPhotosLegacy(
  placesLib: google.maps.PlacesLibrary,
  placeId: string,
  maxWidth: number,
  count: number,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const div = document.createElement("div");
    const service = new placesLib.PlacesService(div);
    service.getDetails({ placeId, fields: ["photos"] }, (place, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.photos?.length) {
        reject(new Error(`PlacesService status: ${status}`));
        return;
      }
      resolve(
        place.photos.slice(0, count).map((photo) => photo.getUrl({ maxWidth })),
      );
    });
  });
}

async function fetchPhotosModern(
  placesLib: google.maps.PlacesLibrary,
  placeId: string,
  maxWidth: number,
  count: number,
): Promise<string[]> {
  const place = new placesLib.Place({ id: placeId });
  await place.fetchFields({ fields: ["photos"] });
  return (place.photos ?? [])
    .slice(0, count)
    .map((photo) => photo.getURI({ maxWidth }));
}

export function usePlacePhotos(
  placeId: string | undefined,
  options: { maxWidth?: number; count?: number } = {},
) {
  const { maxWidth = 900, count = 5 } = options;
  const placesLib = useMapsLibrary("places");
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(placeId));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!placeId) {
      setUrls([]);
      setLoading(false);
      return;
    }

    if (!placesLib) return;

    const key = cacheKey(placeId, maxWidth, count);
    const cached = photoCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setUrls(cached.urls);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    void (async () => {
      try {
        let resolved: string[] = [];
        try {
          resolved = await fetchPhotosModern(placesLib, placeId, maxWidth, count);
        } catch {
          resolved = await fetchPhotosLegacy(placesLib, placeId, maxWidth, count);
        }

        if (cancelled) return;
        if (resolved.length === 0) throw new Error("No photos returned");

        photoCache.set(key, { urls: resolved, ts: Date.now() });
        setUrls(resolved);
      } catch {
        if (!cancelled) {
          setUrls([]);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [placeId, placesLib, maxWidth, count]);

  return { urls, loading, error };
}
