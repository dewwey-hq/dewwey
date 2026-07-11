"use client";

import { useEffect, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";

const CACHE_TTL_MS = 60 * 60 * 1000;
const photoCache = new Map<string, { urls: string[]; ts: number }>();

function cacheKey(placeId: string, maxWidth: number, count: number) {
  return `${placeId}:${maxWidth}:${count}`;
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
        const place = new placesLib.Place({ id: placeId });
        await place.fetchFields({ fields: ["photos"] });
        if (cancelled) return;

        const resolved = (place.photos ?? [])
          .slice(0, count)
          .map((photo) => photo.getURI({ maxWidth }));

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
