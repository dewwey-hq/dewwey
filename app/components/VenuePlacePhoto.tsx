"use client";

import { usePlacePhotos } from "@/app/hooks/use-place-photos";

export function VenuePlacePhoto({
  placeId,
  alt,
  className = "h-full w-full object-cover",
  maxWidth = 900,
  index = 0,
  loadingClassName,
  fallbackClassName = "flex h-full w-full items-center justify-center bg-gradient-to-br from-rose-100 to-pink-200",
}: {
  placeId?: string;
  alt: string;
  className?: string;
  maxWidth?: number;
  index?: number;
  loadingClassName?: string;
  fallbackClassName?: string;
}) {
  const { urls, loading } = usePlacePhotos(placeId, { maxWidth, count: index + 1 });
  const src = urls[index] ?? urls[0] ?? null;

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} />;
  }

  return (
    <div className={loadingClassName ?? fallbackClassName}>
      {loading ? (
        <span className="text-sm text-rose-300/80">Loading…</span>
      ) : (
        <span className="text-4xl text-rose-300">✦</span>
      )}
    </div>
  );
}
