"use client";

import VenueRating from "./VenueRating";
import { uiHeadingClassName } from "@/app/lib/typography";
import VenuePhotoCarousel from "./VenuePhotoCarousel";
import type { MapVenueCard } from "./venues-browse-types";

/** Preview selection border: "rose" (light) | "black" | "gray" */
const SELECTED_BORDER = "rose" as const;

const SELECTED_CHROME = {
  black: {
    ring: "ring-2 ring-gray-900",
    shadow: "shadow-[0_10px_32px_rgba(15,23,42,0.14)]",
    accent: "bg-gray-900",
  },
  rose: {
    ring: "ring-2 ring-rose-300",
    shadow: "shadow-[0_10px_32px_rgba(251,113,133,0.16)]",
    accent: "bg-rose-400",
  },
  gray: {
    ring: "ring-2 ring-gray-300",
    shadow: "shadow-[0_10px_32px_rgba(15,23,42,0.10)]",
    accent: "bg-gray-400",
  },
} as const;

const selectedChrome = SELECTED_CHROME[SELECTED_BORDER];

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
      aria-current={active ? "true" : undefined}
      className={`cursor-pointer overflow-hidden rounded-xl bg-white transition-all duration-200 ${
        active
          ? `${selectedChrome.shadow} ${selectedChrome.ring}`
          : "hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)]"
      }`}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      onClick={() => {
        onSelect();
        onOpen();
      }}
    >
      <div className="relative">
        <VenuePhotoCarousel
          placeId={venue.place_id}
          alt={venue.name}
          aspectClass="aspect-[3/2]"
          roundedClass="rounded-none"
          saved={saved}
          largeSaveAction
          onToggleSave={onToggleSave}
        />
        {active ? (
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-y-3 left-0 w-1 rounded-r-full ${selectedChrome.accent}`}
          />
        ) : null}
      </div>
      <div className="px-3 pt-2.5 pb-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3
              className={`text-[17px] leading-snug ${uiHeadingClassName} ${
                active ? "text-gray-950" : "text-gray-900"
              }`}
            >
              {venue.name}
            </h3>
            <p
              className={`mt-1 text-sm ${
                active ? "text-gray-600" : "text-gray-500"
              }`}
            >
              {venue.displayAddress}
            </p>
          </div>
          <VenueRating
            rating={venue.displayRating}
            reviews={venue.displayReviews}
            showReviewLabel
          />
        </div>
      </div>
    </div>
  );
}
