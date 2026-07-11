"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Heart, X } from "lucide-react";
import { usePlacePhotos } from "@/app/hooks/use-place-photos";

export default function VenuePhotoCarousel({
  placeId,
  alt,
  aspectClass = "aspect-[20/19]",
  roundedClass = "rounded-[1.25rem]",
  showClose = false,
  saved = false,
  styleLabel,
  largeSaveAction = false,
  maxWidth = 900,
  photoCount = 5,
  onToggleSave,
  onClose,
  onInteract,
}: {
  placeId?: string;
  alt: string;
  aspectClass?: string;
  roundedClass?: string;
  showClose?: boolean;
  saved?: boolean;
  styleLabel?: string;
  largeSaveAction?: boolean;
  maxWidth?: number;
  photoCount?: number;
  onToggleSave?: () => void;
  onClose?: () => void;
  onInteract?: (e: React.MouseEvent) => void;
}) {
  const { urls, loading } = usePlacePhotos(placeId, { maxWidth, count: photoCount });
  const slides = urls;
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const hasMultiple = slides.length > 1;
  const current = slides[index] ?? null;

  const go = (delta: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasMultiple) return;
    setIndex((i) => (i + delta + slides.length) % slides.length);
  };

  return (
    <div
      className={`group relative overflow-hidden bg-gray-100 ${aspectClass} ${roundedClass}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onInteract}
    >
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={current} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-rose-100 to-pink-200">
          {loading ? (
            <span className="text-sm text-rose-300/80">Loading…</span>
          ) : (
            <span className="text-4xl text-rose-300">✦</span>
          )}
        </div>
      )}

      {hasMultiple && hovered ? (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => go(-1, e)}
            className="absolute left-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-gray-800 shadow-md transition-opacity hover:scale-105"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => go(1, e)}
            className="absolute right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-gray-800 shadow-md transition-opacity hover:scale-105"
          >
            <ChevronRight size={18} />
          </button>
        </>
      ) : null}

      {styleLabel ? (
        <span className="absolute left-3 top-3 z-10 max-w-[calc(100%-7rem)] truncate rounded-md bg-white/95 px-2 py-1 text-xs font-medium text-gray-800 shadow-sm">
          {styleLabel}
        </span>
      ) : null}

      {(onToggleSave || (showClose && onClose)) && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
          {onToggleSave ? (
            <button
              type="button"
              aria-label={saved ? "Unsave venue" : "Save venue"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleSave();
              }}
              className={`flex items-center justify-center rounded-full bg-white/90 shadow-sm transition-colors hover:bg-white ${
                largeSaveAction ? "h-9 w-9" : "h-8 w-8"
              }`}
            >
              <Heart
                size={largeSaveAction ? 20 : 16}
                className={saved ? "fill-rose-500 text-rose-500" : "text-gray-700"}
              />
            </button>
          ) : null}
          {showClose && onClose ? (
            <button
              type="button"
              aria-label="Close"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm transition-colors hover:bg-white"
            >
              <X size={16} className="text-gray-700" />
            </button>
          ) : null}
        </div>
      )}

      {hasMultiple ? (
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-4 bg-white" : "w-1.5 bg-white/60"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
