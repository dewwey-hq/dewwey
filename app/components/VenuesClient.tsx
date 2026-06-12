"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  Check,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type VenueVendor = {
  place_id: string;
  name: string;
  category: string;
  primary_type: string | null;
  rating: number | string | null;
  review_count: number | null;
  address: string | null;
  short_address: string | null;
  neighborhood: string | null;
  website: string | null;
  photos: string[] | null;
  price_level: number | null;
  editorial_summary: string | null;
};

type VenueCard = VenueVendor & {
  displayRating: number;
  displayReviews: number;
  location: string;
  photoUrl: string;
  styleLabel: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const API_PHOTO_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
const BUDGETS = ["Any", "$", "$$", "$$$", "$$$$"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrimaryType(type: string | null): string {
  if (!type) return "Venue";
  const MAP: Record<string, string> = {
    wedding_venue: "Wedding Venue",
    event_venue: "Event Space",
    historical_landmark: "Historic",
    banquet_hall: "Banquet Hall",
    hotel: "Hotel",
    restaurant: "Restaurant",
    park: "Park",
    art_gallery: "Art Gallery",
    museum: "Museum",
    country_club: "Country Club",
  };
  return MAP[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeRating(value: number | string | null): number {
  if (value == null) return 0;
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(parsed) ? parsed : 0;
}

function budgetLabel(priceLevel: number | null): string {
  if (priceLevel == null) return "";
  return "$".repeat(Math.max(1, Math.min(priceLevel, 4)));
}

function photoUrlFor(venue: VenueVendor): string | null {
  const photoRef = venue.photos?.[0];
  if (!photoRef || !API_PHOTO_KEY) return null;
  return `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=900&key=${API_PHOTO_KEY}`;
}

function buildVenueCards(venues: VenueVendor[]): VenueCard[] {
  return venues.map((venue) => ({
    ...venue,
    displayRating: normalizeRating(venue.rating),
    displayReviews: venue.review_count ?? 0,
    location: venue.neighborhood ?? venue.short_address ?? venue.address ?? "Chicago",
    photoUrl: photoUrlFor(venue) ?? "",
    styleLabel: formatPrimaryType(venue.primary_type),
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────

function Pagination({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  // Build page number list: always show first, last, and up to 2 around current
  const pages: (number | "…")[] = [];
  const delta = 2;
  const range: number[] = [];
  for (
    let i = Math.max(1, currentPage - delta);
    i <= Math.min(totalPages, currentPage + delta);
    i++
  ) {
    range.push(i);
  }
  if (range[0] > 1) {
    pages.push(1);
    if (range[0] > 2) pages.push("…");
  }
  pages.push(...range);
  if (range[range.length - 1] < totalPages) {
    if (range[range.length - 1] < totalPages - 1) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div className="mt-10 flex items-center justify-center gap-1">
      {currentPage > 1 && (
        <a
          href={`/venues?page=${currentPage - 1}`}
          className="rounded-full border border-black/[0.08] px-4 py-2 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
        >
          ← Prev
        </a>
      )}

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="px-2 text-sm text-gray-400">
            …
          </span>
        ) : (
          <a
            key={p}
            href={`/venues?page=${p}`}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              p === currentPage
                ? "bg-rose-400 text-white"
                : "border border-black/[0.08] text-gray-600 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            {p}
          </a>
        )
      )}

      {currentPage < totalPages && (
        <a
          href={`/venues?page=${currentPage + 1}`}
          className="rounded-full border border-black/[0.08] px-4 py-2 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
        >
          Next →
        </a>
      )}
    </div>
  );
}

export default function VenuesClient({
  venues,
  total,
  currentPage,
  pageSize,
}: {
  venues: VenueVendor[];
  total: number;
  currentPage: number;
  pageSize: number;
}) {
  const totalPages = Math.ceil(total / pageSize);
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState("All");
  const [budget, setBudget] = useState("Any");
  const [guestCount, setGuestCount] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState("recommended");
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());

  const venueCards = useMemo(() => buildVenueCards(venues), [venues]);

  const styleOptions = useMemo(() => {
    const types = new Set(venueCards.map((v) => v.styleLabel));
    return ["All", ...Array.from(types).sort()];
  }, [venueCards]);

  const filteredVenues = useMemo(() => {
    const search = query.trim().toLowerCase();

    return venueCards
      .filter((venue) => {
        const matchesSearch =
          search.length === 0 ||
          venue.name.toLowerCase().includes(search) ||
          venue.location.toLowerCase().includes(search) ||
          venue.styleLabel.toLowerCase().includes(search);
        const matchesStyle = style === "All" || venue.styleLabel === style;
        const matchesBudget =
          budget === "Any" || budgetLabel(venue.price_level) === budget;

        return matchesSearch && matchesStyle && matchesBudget;
      })
      .sort((a, b) => {
        if (sortBy === "rating") return b.displayRating - a.displayRating;
        return (
          b.displayRating * 100 + b.displayReviews -
          (a.displayRating * 100 + a.displayReviews)
        );
      });
  }, [budget, query, sortBy, style, venueCards]);

  const comparedVenues = venueCards.filter((v) => compareIds.has(v.place_id));

  const toggleCompare = (placeId: string) => {
    setCompareIds((current) => {
      const next = new Set(current);
      if (next.has(placeId)) {
        next.delete(placeId);
      } else if (next.size < 3) {
        next.add(placeId);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-white font-['Inter',sans-serif] text-gray-900">
      <header className="sticky top-0 z-50 border-b border-black/[0.08] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="text-2xl text-rose-400">✦</span>
            <span
              className="text-[17px] tracking-tight text-gray-900"
              style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500 }}
            >
              Dewy
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {[
              { label: "Venues", href: "/venues" },
              { label: "Catering", href: "#" },
              { label: "Florals", href: "#" },
              { label: "Photography", href: "#" },
              { label: "More", href: "#" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${
                  item.label === "Venues"
                    ? "bg-rose-50 text-rose-600"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <a
            href="#compare"
            className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
          >
            Compare {compareIds.size > 0 ? compareIds.size : ""}
          </a>
        </div>
      </header>

      <main>
        {/* ── Hero / search bar ── */}
        <section className="relative overflow-hidden bg-[#fdf8f5]">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute right-0 top-0 h-[540px] w-[540px] translate-x-1/3 -translate-y-1/3 rounded-full bg-rose-100/50 blur-[110px]" />
            <div className="absolute bottom-0 left-0 h-[360px] w-[360px] -translate-x-1/3 translate-y-1/3 rounded-full bg-amber-100/40 blur-[100px]" />
          </div>

          <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-16 sm:px-6 lg:px-8 lg:pb-16 lg:pt-20">
            <div className="max-w-3xl">
              <p className="mb-4 text-sm font-medium uppercase tracking-[0.22em] text-rose-500">
                Chicago venues
              </p>
              <h1
                className="mb-5 text-5xl leading-[1.05] tracking-tight text-gray-900 sm:text-6xl"
                style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500 }}
              >
                Find the room that feels like your wedding.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-gray-500">
                Browse Chicago spaces by guest count, style, budget, and vibe. Save the standouts and compare the details side by side.
              </p>
            </div>

            <div className="mt-10 rounded-[2rem] border border-black/[0.06] bg-white p-3 shadow-[0_16px_50px_rgba(15,23,42,0.10)]">
              <div className="grid gap-3 lg:grid-cols-[1.3fr_0.8fr_0.8fr_auto]">
                <label className="flex items-center gap-3 rounded-3xl bg-gray-50 px-5 py-4">
                  <Search size={18} className="text-gray-400" />
                  <span className="sr-only">Search venues</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search venues, neighborhoods, or styles"
                    className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
                  />
                </label>

                <label className="rounded-3xl bg-gray-50 px-5 py-3">
                  <span className="block text-[11px] font-medium uppercase tracking-widest text-gray-400">
                    Guests
                  </span>
                  <input
                    type="number"
                    min={20}
                    max={1000}
                    value={guestCount ?? ""}
                    onChange={(e) =>
                      setGuestCount(e.target.value === "" ? null : Number(e.target.value))
                    }
                    placeholder="Any"
                    className="mt-1 w-full bg-transparent text-sm font-medium text-gray-800 outline-none placeholder:font-normal placeholder:text-gray-400"
                  />
                </label>

                <label className="rounded-3xl bg-gray-50 px-5 py-3">
                  <span className="block text-[11px] font-medium uppercase tracking-widest text-gray-400">
                    Sort
                  </span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="mt-1 w-full bg-transparent text-sm font-medium text-gray-800 outline-none"
                  >
                    <option value="recommended">Recommended</option>
                    <option value="rating">Highest rated</option>
                  </select>
                </label>

                <button className="rounded-3xl bg-rose-400 px-7 py-4 text-sm font-medium text-white transition-colors hover:bg-rose-500">
                  Browse venues
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Filter pills ── */}
        <section className="border-b border-black/[0.06] bg-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <SlidersHorizontal size={16} />
              Refine your shortlist
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1">
              {styleOptions.map((item) => (
                <button
                  key={item}
                  onClick={() => setStyle(item)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                    style === item
                      ? "border-rose-200 bg-rose-50 text-rose-600"
                      : "border-black/[0.08] bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {item}
                </button>
              ))}

              <div className="mx-1 h-10 w-px shrink-0 bg-black/[0.08]" />

              {BUDGETS.map((item) => (
                <button
                  key={item}
                  onClick={() => setBudget(item)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                    budget === item
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-black/[0.08] bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── Venue grid + sidebar ── */}
        <section className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
          <div>
            <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm text-gray-400">
                  {filteredVenues.length} of {total} venues · page {currentPage} of {totalPages}
                </p>
                <h2
                  className="mt-1 text-3xl text-gray-900"
                  style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500 }}
                >
                  Chicago venue options
                </h2>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <ArrowUpDown size={15} />
                Compare favorites as you browse
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {filteredVenues.map((venue) => {

                const isComparing = compareIds.has(venue.place_id);
                const disabled = !isComparing && compareIds.size >= 3;

                return (
                  <article
                    key={venue.place_id}
                    className="group overflow-hidden rounded-[1.7rem] border border-black/[0.07] bg-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(15,23,42,0.10)]"
                  >
                    {/* Photo */}
                    <div className="relative h-64 overflow-hidden bg-gray-100">
                      {venue.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={venue.photoUrl}
                          alt={venue.name}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-rose-100 to-pink-200 flex items-center justify-center">
                          <span className="text-rose-300 text-5xl">✦</span>
                        </div>
                      )}
                      <button
                        onClick={() => toggleCompare(venue.place_id)}
                        disabled={disabled}
                        className={`absolute right-3 top-3 rounded-full px-3 py-2 text-xs font-medium shadow-sm backdrop-blur transition-colors ${
                          isComparing
                            ? "bg-rose-500 text-white"
                            : "bg-white/90 text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:text-gray-300"
                        }`}
                      >
                        {isComparing ? "Comparing" : "Compare"}
                      </button>
                      <div className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-700 backdrop-blur">
                        {venue.styleLabel}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-5">
                      <div className="mb-2 flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-medium leading-snug text-gray-900">{venue.name}</h3>
                          <p className="mt-1 flex items-center gap-1 text-sm text-gray-400">
                            <MapPin size={14} />
                            {venue.location}
                          </p>
                        </div>
                        {venue.displayRating > 0 && (
                          <div className="flex shrink-0 items-center gap-1 text-sm font-medium text-gray-800">
                            <Star size={14} className="fill-amber-400 text-amber-400" />
                            {venue.displayRating.toFixed(1)}
                            {venue.displayReviews > 0 && (
                              <span className="text-xs font-normal text-gray-400">({venue.displayReviews})</span>
                            )}
                          </div>
                        )}
                      </div>

                      {venue.editorial_summary && (
                        <p className="mb-4 line-clamp-2 text-sm leading-6 text-gray-500">
                          {venue.editorial_summary}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-black/[0.06]">
                        {venue.website ? (
                          <a
                            href={venue.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-rose-500 hover:text-rose-600 transition-colors"
                          >
                            Visit website →
                          </a>
                        ) : (
                          <span />
                        )}
                        <div className="flex items-center gap-3">
                          {budgetLabel(venue.price_level) && (
                            <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md">
                              {budgetLabel(venue.price_level)}
                            </span>
                          )}
                          <a
                            href={`mailto:hello@dewy.com?subject=Claim listing: ${encodeURIComponent(venue.name)}`}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            Claim this listing
                          </a>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <Pagination currentPage={currentPage} totalPages={totalPages} />
          </div>

          {/* ── Sidebar ── */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 overflow-hidden rounded-[2rem] border border-black/[0.07] bg-[#fdf8f5] p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-700">
                <Sparkles size={16} className="text-rose-400" />
                Planning view
              </div>
              <div className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                <div className="mb-4 h-44 rounded-[1.25rem] bg-[radial-gradient(circle_at_30%_30%,#fecdd3,transparent_24%),radial-gradient(circle_at_72%_55%,#fde68a,transparent_25%),linear-gradient(135deg,#f8fafc,#fdf2f8)]" />
                <p className="text-sm font-medium text-gray-900">Map preview</p>
                <p className="mt-1 text-sm leading-6 text-gray-500">
                  A map can sit here next, but this keeps the first pass clean while you compare venue cards.
                </p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-2xl text-gray-900">{venueCards.length}</p>
                  <p className="mt-1 text-xs text-gray-400">venues loaded</p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-2xl text-gray-900">{compareIds.size}</p>
                  <p className="mt-1 text-xs text-gray-400">comparing</p>
                </div>
              </div>
            </div>
          </aside>
        </section>

        {/* ── Compare section ── */}
        <section id="compare" className="border-t border-black/[0.06] bg-gray-950 px-4 py-12 text-white sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-rose-300">Compare</p>
                <h2
                  className="mt-2 text-3xl"
                  style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500 }}
                >
                  Your venue shortlist
                </h2>
              </div>
              <p className="max-w-lg text-sm leading-6 text-gray-400">
                Pick up to three venues while browsing. Compare style, rating, budget, and location.
              </p>
            </div>

            {comparedVenues.length === 0 ? (
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-6 text-sm text-gray-400">
                Tap Compare on any venue card to start a shortlist.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {comparedVenues.map((venue) => (
                  <div key={venue.place_id} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-white">{venue.name}</h3>
                        <p className="mt-1 text-sm text-gray-400">{venue.location}</p>
                      </div>
                      <button
                        onClick={() => toggleCompare(venue.place_id)}
                        className="rounded-full bg-white/10 p-1 text-gray-300 transition-colors hover:bg-white/15 hover:text-white"
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <dl className="space-y-3 text-sm">
                      {[
                        ["Style", venue.styleLabel],
                        ["Rating", venue.displayRating > 0 ? `${venue.displayRating.toFixed(1)}${venue.displayReviews > 0 ? ` (${venue.displayReviews})` : ""}` : "—"],
                        ["Budget", budgetLabel(venue.price_level) || "—"],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4 border-t border-white/10 pt-3">
                          <dt className="text-gray-500">{label}</dt>
                          <dd className="text-right text-gray-200">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {venue.website && (
                      <div className="mt-4 border-t border-white/10 pt-4">
                        <a
                          href={venue.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-rose-300 hover:text-rose-200 transition-colors"
                        >
                          <Check size={14} />
                          Visit website
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
