"use client";

import { Star } from "lucide-react";
import { formatCount } from "@/lib/format-address";
import { uiHeadingClassName } from "@/lib/typography";
import VenuePhotoCarousel from "./VenuePhotoCarousel";
import type { MapVenueCard } from "./venues-browse-types";

export default function MapVenuePopupCard({
  venue,
  saved,
  onToggleSave,
  onClose,
  onOpen,
}: {
  venue: MapVenueCard;
  saved: boolean;
  onToggleSave: () => void;
  onClose: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="w-[min(300px,calc(100vw-2rem))] cursor-pointer overflow-hidden rounded-2xl bg-white shadow-[0_8px_28px_rgba(0,0,0,0.18)] transition-colors hover:bg-gray-50/80"
    >
      <VenuePhotoCarousel
        placeId={venue.place_id ?? undefined}
        photoNames={venue.photos}
        alt={venue.name}
        aspectClass="aspect-[4/3]"
        roundedClass="rounded-t-2xl rounded-b-none"
        showClose
        saved={saved}
        largeSaveAction
        onToggleSave={onToggleSave}
        onClose={onClose}
      />
      <div className="rounded-b-2xl bg-white px-4 py-3.5 text-left">
        <div className="flex items-start justify-between gap-2">
          <h3 className={`min-w-0 flex-1 text-lg leading-snug text-gray-900 ${uiHeadingClassName}`}>
            {venue.name}
          </h3>
          {venue.displayRating > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-1 gap-y-0.5 text-sm font-medium text-gray-800">
              <Star size={14} className="fill-rose-400 text-rose-400" />
              <span>{venue.displayRating.toFixed(1)}</span>
              {venue.displayReviews > 0 ? (
                <span className="text-xs font-normal text-gray-400">
                  ({formatCount(venue.displayReviews)} reviews)
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="mt-1.5 text-sm text-gray-500">{venue.displayAddress}</p>
      </div>
    </div>
  );
}
