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
  Users,
  X,
} from "lucide-react";

export type VenueVendor = {
  place_id: string;
  name: string;
  category: string;
  rating: number | string | null;
  review_count: number | null;
  address: string | null;
  short_address: string | null;
  neighborhood: string | null;
  website: string | null;
  photos: string[] | null;
  price_level: number | null;
};

type VenueProfile = {
  style: string;
  capacity: number;
  startingPrice: number;
  vibe: string;
  included: string[];
  image: string;
};

type VenueCard = VenueVendor &
  VenueProfile & {
    displayRating: number;
    displayReviews: number;
    location: string;
    photoUrl: string;
  };

const API_PHOTO_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;

const STYLES = ["All", "Loft", "Garden", "Hotel", "Historic", "Rooftop", "Industrial"];
const BUDGETS = ["Any", "$", "$$", "$$$", "$$$$"];

const PROFILE_ROTATION: VenueProfile[] = [
  {
    style: "Loft",
    capacity: 150,
    startingPrice: 8500,
    vibe: "Bright loft with warm brick and a flexible reception floor.",
    included: ["Ceremony", "Reception", "BYO vendors"],
    image:
      "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=900&h=700&fit=crop&auto=format",
  },
  {
    style: "Garden",
    capacity: 120,
    startingPrice: 7200,
    vibe: "Soft greenery, patio cocktails, and an intimate dinner flow.",
    included: ["Outdoor space", "Getting-ready suite", "Tables"],
    image:
      "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=900&h=700&fit=crop&auto=format",
  },
  {
    style: "Hotel",
    capacity: 220,
    startingPrice: 12000,
    vibe: "Full-service hospitality with guest rooms steps away.",
    included: ["Catering", "Room block", "Planner"],
    image:
      "https://images.unsplash.com/photo-1519741497674-611481863552?w=900&h=700&fit=crop&auto=format",
  },
  {
    style: "Historic",
    capacity: 180,
    startingPrice: 9800,
    vibe: "Architectural details, candlelit dinner, and timeless photos.",
    included: ["Ceremony", "Security", "Coat check"],
    image:
      "https://images.unsplash.com/photo-1520854221256-17451cc331bf?w=900&h=700&fit=crop&auto=format",
  },
  {
    style: "Rooftop",
    capacity: 140,
    startingPrice: 10500,
    vibe: "Skyline views, sunset portraits, and modern cocktail energy.",
    included: ["Terrace", "Bar package", "Lounge"],
    image:
      "https://images.unsplash.com/photo-1505236858219-8359eb29e329?w=900&h=700&fit=crop&auto=format",
  },
  {
    style: "Industrial",
    capacity: 260,
    startingPrice: 11000,
    vibe: "Roomy warehouse character with polished modern finishes.",
    included: ["Parking", "AV", "Vendor kitchen"],
    image:
      "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=900&h=700&fit=crop&auto=format",
  },
];

const FALLBACK_VENUES: VenueVendor[] = [
  {
    place_id: "sample-ivy-room",
    name: "The Ivy Room",
    category: "venue",
    rating: 4.97,
    review_count: 142,
    address: "12 E Ohio St, Chicago, IL",
    short_address: "River North, Chicago",
    neighborhood: "River North",
    website: "https://www.ivyroomchicago.com/",
    photos: null,
    price_level: 3,
  },
  {
    place_id: "sample-loft-lucia",
    name: "Loft Lucia",
    category: "venue",
    rating: 4.9,
    review_count: 96,
    address: "7 N Carpenter St, Chicago, IL",
    short_address: "West Loop, Chicago",
    neighborhood: "West Loop",
    website: "https://loftlucia.com/",
    photos: null,
    price_level: 3,
  },
  {
    place_id: "sample-garden-house",
    name: "The Garden House",
    category: "venue",
    rating: 4.88,
    review_count: 71,
    address: "Lincoln Park, Chicago, IL",
    short_address: "Lincoln Park, Chicago",
    neighborhood: "Lincoln Park",
    website: null,
    photos: null,
    price_level: 2,
  },
  {
    place_id: "sample-atelier",
    name: "Atelier Fulton Market",
    category: "venue",
    rating: 4.95,
    review_count: 118,
    address: "Fulton Market, Chicago, IL",
    short_address: "Fulton Market, Chicago",
    neighborhood: "Fulton Market",
    website: null,
    photos: null,
    price_level: 4,
  },
  {
    place_id: "sample-lakeshore",
    name: "Lakeshore Terrace",
    category: "venue",
    rating: 4.86,
    review_count: 63,
    address: "Streeterville, Chicago, IL",
    short_address: "Streeterville, Chicago",
    neighborhood: "Streeterville",
    website: null,
    photos: null,
    price_level: 3,
  },
  {
    place_id: "sample-foundry",
    name: "The Foundry at Ashland",
    category: "venue",
    rating: 4.82,
    review_count: 54,
    address: "West Town, Chicago, IL",
    short_address: "West Town, Chicago",
    neighborhood: "West Town",
    website: null,
    photos: null,
    price_level: 2,
  },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeRating(value: number | string | null) {
  if (value == null) return 4.8;
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(parsed) ? parsed : 4.8;
}

function budgetLabel(priceLevel: number | null, startingPrice: number) {
  if (priceLevel != null) return "$".repeat(Math.max(1, priceLevel));
  if (startingPrice < 8000) return "$$";
  if (startingPrice < 11000) return "$$$";
  return "$$$$";
}

function photoUrlFor(venue: VenueVendor, fallbackImage: string) {
  const photoRef = venue.photos?.[0];
  if (!photoRef || !API_PHOTO_KEY) return fallbackImage;
  return `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=900&key=${API_PHOTO_KEY}`;
}

function buildVenueCards(venues: VenueVendor[]): VenueCard[] {
  const source = venues.length > 0 ? venues : FALLBACK_VENUES;

  return source.map((venue, index) => {
    const profile = PROFILE_ROTATION[index % PROFILE_ROTATION.length];

    return {
      ...venue,
      ...profile,
      displayRating: normalizeRating(venue.rating),
      displayReviews: venue.review_count ?? 40 + index * 17,
      location: venue.neighborhood ?? venue.short_address ?? venue.address ?? "Chicago",
      photoUrl: photoUrlFor(venue, profile.image),
    };
  });
}

export default function VenuesClient({ venues }: { venues: VenueVendor[] }) {
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState("All");
  const [budget, setBudget] = useState("Any");
  const [guestCount, setGuestCount] = useState(120);
  const [sortBy, setSortBy] = useState("recommended");
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());

  const venueCards = useMemo(() => buildVenueCards(venues), [venues]);

  const filteredVenues = useMemo(() => {
    const search = query.trim().toLowerCase();

    return venueCards
      .filter((venue) => {
        const matchesSearch =
          search.length === 0 ||
          venue.name.toLowerCase().includes(search) ||
          venue.location.toLowerCase().includes(search) ||
          venue.style.toLowerCase().includes(search);
        const matchesStyle = style === "All" || venue.style === style;
        const matchesBudget = budget === "Any" || budgetLabel(venue.price_level, venue.startingPrice) === budget;
        const matchesCapacity = venue.capacity >= guestCount;

        return matchesSearch && matchesStyle && matchesBudget && matchesCapacity;
      })
      .sort((a, b) => {
        if (sortBy === "rating") return b.displayRating - a.displayRating;
        if (sortBy === "capacity") return b.capacity - a.capacity;
        if (sortBy === "price") return a.startingPrice - b.startingPrice;
        return b.displayRating * 100 + b.displayReviews - (a.displayRating * 100 + a.displayReviews);
      });
  }, [budget, guestCount, query, sortBy, style, venueCards]);

  const comparedVenues = venueCards.filter((venue) => compareIds.has(venue.place_id));

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
                    onChange={(event) => setQuery(event.target.value)}
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
                    max={500}
                    value={guestCount}
                    onChange={(event) => setGuestCount(Number(event.target.value) || 0)}
                    className="mt-1 w-full bg-transparent text-sm font-medium text-gray-800 outline-none"
                  />
                </label>

                <label className="rounded-3xl bg-gray-50 px-5 py-3">
                  <span className="block text-[11px] font-medium uppercase tracking-widest text-gray-400">
                    Sort
                  </span>
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                    className="mt-1 w-full bg-transparent text-sm font-medium text-gray-800 outline-none"
                  >
                    <option value="recommended">Recommended</option>
                    <option value="rating">Highest rated</option>
                    <option value="capacity">Most space</option>
                    <option value="price">Lowest starting price</option>
                  </select>
                </label>

                <button className="rounded-3xl bg-rose-400 px-7 py-4 text-sm font-medium text-white transition-colors hover:bg-rose-500">
                  Browse venues
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-black/[0.06] bg-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <SlidersHorizontal size={16} />
              Refine your shortlist
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1">
              {STYLES.map((item) => (
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

        <section className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
          <div>
            <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm text-gray-400">{filteredVenues.length} venues match your search</p>
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
                    <div className="relative h-64 overflow-hidden bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={venue.photoUrl}
                        alt={venue.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
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
                        {venue.style}
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="mb-2 flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-medium leading-snug text-gray-900">{venue.name}</h3>
                          <p className="mt-1 flex items-center gap-1 text-sm text-gray-400">
                            <MapPin size={14} />
                            {venue.location}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 text-sm font-medium text-gray-800">
                          <Star size={14} className="fill-amber-400 text-amber-400" />
                          {venue.displayRating.toFixed(1)}
                        </div>
                      </div>

                      <p className="mb-4 line-clamp-2 text-sm leading-6 text-gray-500">{venue.vibe}</p>

                      <div className="mb-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-gray-50 p-3">
                          <p className="text-xs text-gray-400">Capacity</p>
                          <p className="mt-1 flex items-center gap-1 text-sm font-medium text-gray-800">
                            <Users size={14} />
                            Up to {venue.capacity}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-gray-50 p-3">
                          <p className="text-xs text-gray-400">Starts at</p>
                          <p className="mt-1 text-sm font-medium text-gray-800">
                            {formatCurrency(venue.startingPrice)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {venue.included.slice(0, 3).map((item) => (
                          <span key={item} className="rounded-full bg-[#fdf8f5] px-3 py-1 text-xs text-gray-600">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

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
                Pick up to three venues while browsing. Compare capacity, price, style, and what each space includes.
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
                        ["Style", venue.style],
                        ["Capacity", `${venue.capacity} guests`],
                        ["Starting price", formatCurrency(venue.startingPrice)],
                        ["Rating", `${venue.displayRating.toFixed(1)} (${venue.displayReviews})`],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4 border-t border-white/10 pt-3">
                          <dt className="text-gray-500">{label}</dt>
                          <dd className="text-right text-gray-200">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                      {venue.included.map((item) => (
                        <p key={item} className="flex items-center gap-2 text-sm text-gray-300">
                          <Check size={14} className="text-rose-300" />
                          {item}
                        </p>
                      ))}
                    </div>
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
