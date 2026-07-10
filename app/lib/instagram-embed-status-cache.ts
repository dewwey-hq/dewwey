"use client";

const CACHE_KEY = "ig-embed-status-v2";
const TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = { available: boolean; at: number };

let memory = new Map<string, CacheEntry>();
let hydrated = false;

function hydrateFromSession() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    const now = Date.now();
    for (const [url, entry] of Object.entries(parsed)) {
      if (now - entry.at < TTL_MS) memory.set(url, entry);
    }
  } catch {
    // ignore storage errors
  }
}

function persistToSession() {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch {
    // ignore storage errors
  }
}

export function getCachedEmbedStatus(postUrl: string): boolean | undefined {
  hydrateFromSession();
  const entry = memory.get(postUrl);
  if (!entry || Date.now() - entry.at >= TTL_MS) return undefined;
  return entry.available;
}

export function setCachedEmbedStatus(postUrl: string, available: boolean) {
  hydrateFromSession();
  memory.set(postUrl, { available, at: Date.now() });
  persistToSession();
}

export async function prefetchEmbedStatuses(
  postUrls: string[],
): Promise<Map<string, boolean | undefined>> {
  hydrateFromSession();
  const unique = [...new Set(postUrls.filter(Boolean))];
  const uncached = unique.filter((url) => getCachedEmbedStatus(url) === undefined);

  if (uncached.length > 0) {
    try {
      const res = await fetch("/api/instagram/embed-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postUrls: uncached }),
      });
      if (res.ok) {
        const data = (await res.json()) as { results?: Record<string, boolean> };
        for (const [url, available] of Object.entries(data.results ?? {})) {
          setCachedEmbedStatus(url, Boolean(available));
        }
      }
    } catch {
      // components run per-post checks; do not assume embed works
    }
  }

  return new Map(unique.map((url) => [url, getCachedEmbedStatus(url)]));
}

export function embedStatusFromCache(postUrls: string[]): Map<string, boolean | undefined> {
  hydrateFromSession();
  const unique = [...new Set(postUrls.filter(Boolean))];
  return new Map(unique.map((url) => [url, getCachedEmbedStatus(url)]));
}
