"use client";

import { Star } from "lucide-react";
import { formatCount } from "@/app/lib/format-address";
import VenuePhotoCarousel from "./VenuePhotoCarousel";
import type { MapVenueCard } from "./venues-browse-types";

const playfair = { fontFamily: "'Playfair Display', serif", fontWeight: 500 } as const;

export default function VenueMapBrowseCard({
  venue,
  saved,
  active,
  onSelect,
  onToggleSave,
  onOpen,
  onHover,
  onHoverEnd,
  listRef,
}: {
  venue: MapVenueCard;
  saved: boolean;
  active: boolean;
  onSelect: () => void;
  onToggleSave: () => void;
  onOpen: () => void;
  onHover?: () => void;
  onHoverEnd?: () => void;
  listRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={listRef}
      className="cursor-pointer rounded-[1.25rem]"
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      onClick={() => {
        onSelect();
        onOpen();
      }}
    >
      <VenuePhotoCarousel
        photos={venue.photoUrls}
        alt={venue.name}
        saved={saved}
        styleLabel={venue.styleLabel || undefined}
        onToggleSave={onToggleSave}
      />
      <div
        className={`pt-2.5 transition-colors duration-200 ${
          active ? "mt-2.5 rounded-xl bg-[#fdf8f5] px-3 py-2.5 ring-1 ring-black/[0.06]" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 text-lg font-medium leading-snug text-gray-900" style={playfair}>
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
