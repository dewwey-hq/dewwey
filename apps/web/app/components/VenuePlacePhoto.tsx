"use client";

import { usePlacePhotos } from "@/lib/hooks/use-place-photos";

export function VenuePlacePhoto({
  placeId,
  photoNames,
  alt,
  className = "h-full w-full object-cover",
  maxWidth = 900,
  index = 0,
  loadingClassName,
  fallbackClassName = "flex h-full w-full items-center justify-center bg-black/[0.04]",
}: {
  placeId?: string;
  photoNames?: string[] | null;
  alt: string;
  className?: string;
  maxWidth?: number;
  index?: number;
  loadingClassName?: string;
  fallbackClassName?: string;
}) {
  const { urls, loading } = usePlacePhotos(placeId, {
    maxWidth,
    count: index + 1,
    photoNames: photoNames ?? undefined,
  });
  const src = urls[index] ?? urls[0] ?? null;

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" decoding="async" className={className} />;
  }

  return (
    <div className={loadingClassName ?? fallbackClassName}>
      {loading ? (
        <span className="text-sm text-black/[0.35]">Loading…</span>
      ) : (
        <span className="text-4xl text-rose-300">✦</span>
      )}
    </div>
  );
}
