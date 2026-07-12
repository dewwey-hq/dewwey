"use client";

import { useEffect, useState } from "react";
import {
  PLACE_PHOTO_URI_CACHE_SECONDS,
  placePhotoStorageKey,
  readPlacePhotoUriCache,
  writePlacePhotoUriCache,
} from "@/app/lib/place-photo-cache";

const CACHE_TTL_MS = PLACE_PHOTO_URI_CACHE_SECONDS * 1000;
const photoCache = new Map<string, { urls: string[]; ts: number }>();

function cacheKey(
  placeId: string,
  maxWidth: number,
  count: number,
  photoNames?: string[],
) {
  const namesKey = photoNames?.length ? photoNames.slice(0, count).join("|") : "";
  return `${placeId}:${maxWidth}:${count}:${namesKey}`;
}

export function usePlacePhotos(
  placeId: string | undefined,
  options: { maxWidth?: number; count?: number; photoNames?: string[] } = {},
) {
  const { maxWidth = 900, count = 5, photoNames } = options;
  const photoNamesKey = (photoNames ?? []).slice(0, count).join("|");
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(placeId));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!placeId) {
      setUrls([]);
      setLoading(false);
      return;
    }

    const key = cacheKey(placeId, maxWidth, count, photoNames);
    const storageKey = placePhotoStorageKey(placeId, maxWidth, count, photoNamesKey);

    const cached = photoCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setUrls(cached.urls);
      setLoading(false);
      setError(false);
      return;
    }

    const stored = readPlacePhotoUriCache(storageKey);
    if (stored?.length) {
      photoCache.set(key, { urls: stored, ts: Date.now() });
      setUrls(stored);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    void (async () => {
      try {
        const params = new URLSearchParams({
          place: placeId,
          w: String(maxWidth),
          count: String(count),
          format: "json",
        });
        for (const name of (photoNames ?? []).slice(0, count)) {
          params.append("name", name);
        }

        const response = await fetch(`/api/venue-photo?${params.toString()}`);
        if (!response.ok) throw new Error("Photos unavailable");

        const data = (await response.json()) as { urls?: string[] };
        const resolved = (data.urls ?? []).filter(Boolean);

        if (cancelled) return;
        if (resolved.length === 0) throw new Error("No photos returned");

        photoCache.set(key, { urls: resolved, ts: Date.now() });
        writePlacePhotoUriCache(storageKey, resolved);
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
  }, [placeId, maxWidth, count, photoNamesKey]);

  return { urls, loading, error };
}
