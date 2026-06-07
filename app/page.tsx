import { Button } from "@/components/ui/button";
import {
  Search,
  Building2,
  UtensilsCrossed,
  Flower2,
  Camera,
  Music2,
  Sparkles,
  Star,
  MapPin,
  Heart,
} from "lucide-react";

const categories = [
  { icon: Building2, label: "Venues", count: "240+ venues" },
  { icon: UtensilsCrossed, label: "Catering", count: "180+ caterers" },
  { icon: Flower2, label: "Florals", count: "120+ florists" },
  { icon: Camera, label: "Photography", count: "310+ photographers" },
  { icon: Music2, label: "DJ / Music", count: "95+ artists" },
  { icon: Sparkles, label: "Hair & Makeup", count: "210+ artists" },
];

const vendors = [
  {
    name: "The Ivy Room",
    category: "Venue",
    rating: 4.9,
    reviews: 128,
    price: "$$$",
    location: "River North, Chicago",
    gradient: "from-rose-200 to-pink-300",
    tag: "Most Popular",
  },
  {
    name: "Bella Cucina Catering",
    category: "Catering",
    rating: 4.8,
    reviews: 94,
    price: "$$",
    location: "West Loop, Chicago",
    gradient: "from-amber-100 to-orange-200",
    tag: "Top Rated",
  },
  {
    name: "Petal & Bloom Studio",
    category: "Florals",
    rating: 5.0,
    reviews: 61,
    price: "$$$",
    location: "Lincoln Park, Chicago",
    gradient: "from-emerald-100 to-teal-200",
    tag: "Editor's Pick",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white font-sans">
      {/* ── Navigation ── */}
      <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-rose-500">
              <Heart className="size-4 fill-white text-white" />
            </div>
            <span className="text-xl font-semibold tracking-tight text-zinc-900">
              Aisle
            </span>
          </div>

          {/* Nav links */}
          <nav className="hidden items-center gap-1 md:flex">
            {["Venues", "Catering", "Flowers", "Photography", "More"].map(
              (link) => (
                <a
                  key={link}
                  href="#"
                  className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-rose-50 hover:text-rose-600"
                >
                  {link}
                </a>
              )
            )}
          </nav>

          {/* Auth */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
              Sign in
            </Button>
            <Button
              size="sm"
              className="bg-rose-500 text-white hover:bg-rose-600"
            >
              Get started
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-rose-50/60 to-white px-6 pb-20 pt-20 text-center">
        {/* Subtle decorative blobs */}
        <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-rose-100/40 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-10 size-80 rounded-full bg-pink-100/30 blur-3xl" />

        <div className="relative mx-auto max-w-3xl">
          <span className="mb-4 inline-block rounded-full bg-rose-100 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-rose-600">
            Chicago&apos;s Wedding Marketplace
          </span>
          <h1 className="mt-3 text-5xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-6xl">
            Find every vendor for{" "}
            <span className="text-rose-500">your perfect day</span>
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-zinc-500">
            Browse thousands of trusted Chicago wedding vendors — venues,
            caterers, photographers, and more — all in one beautiful place.
          </p>

          {/* Search bar */}
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:gap-0">
            <div className="relative flex-1">
              <select
                className="h-14 w-full appearance-none rounded-xl border border-zinc-200 bg-white pl-4 pr-10 text-sm text-zinc-700 shadow-sm outline-none transition-colors focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20 sm:rounded-r-none sm:border-r-0"
                defaultValue=""
              >
                <option value="" disabled>
                  Category
                </option>
                <option>Venues</option>
                <option>Catering</option>
                <option>Florals</option>
                <option>Photography</option>
                <option>DJ / Music</option>
                <option>Hair &amp; Makeup</option>
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                <svg
                  className="size-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m19 9-7 7-7-7"
                  />
                </svg>
              </div>
            </div>

            <div className="relative flex-[2]">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search vendors, styles, or neighborhoods…"
                className="h-14 w-full border border-zinc-200 bg-white pl-10 pr-4 text-sm text-zinc-700 shadow-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20 sm:rounded-none sm:border-x-0"
              />
            </div>

            <button className="flex h-14 items-center justify-center gap-2 rounded-xl bg-rose-500 px-8 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-600 sm:rounded-l-none sm:rounded-r-xl">
              <Search className="size-4" />
              Search
            </button>
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            Popular:{" "}
            {["Rooftop venues", "Outdoor florals", "Brunch receptions"].map(
              (tag, i) => (
                <span key={tag}>
                  <a href="#" className="text-rose-400 hover:underline">
                    {tag}
                  </a>
                  {i < 2 && <span className="mx-1 text-zinc-300">·</span>}
                </span>
              )
            )}
          </p>
        </div>
      </section>

      {/* ── Categories ── */}
      <section className="bg-white px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900">
              Browse by category
            </h2>
            <p className="mt-2 text-zinc-500">
              Everything you need, all in one place
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map(({ icon: Icon, label, count }) => (
              <a
                key={label}
                href="#"
                className="group flex flex-col items-center gap-3 rounded-2xl border border-zinc-100 bg-white p-6 text-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md"
              >
                <div className="flex size-14 items-center justify-center rounded-full bg-rose-50 transition-colors group-hover:bg-rose-100">
                  <Icon className="size-6 text-rose-500" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-900">
                    {label}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-400">{count}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured Vendors ── */}
      <section className="bg-zinc-50/50 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-zinc-900">
                Featured vendors
              </h2>
              <p className="mt-2 text-zinc-500">
                Hand-picked Chicago favorites our couples love
              </p>
            </div>
            <a
              href="#"
              className="text-sm font-medium text-rose-500 hover:underline"
            >
              View all vendors →
            </a>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map((v) => (
              <a
                key={v.name}
                href="#"
                className="group overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              >
                {/* Photo placeholder */}
                <div
                  className={`relative h-52 bg-gradient-to-br ${v.gradient} flex items-end p-4`}
                >
                  <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-zinc-700 backdrop-blur-sm">
                    {v.tag}
                  </span>
                  <button
                    className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full bg-white/80 text-rose-400 transition-colors hover:bg-white hover:text-rose-500"
                    aria-label="Save vendor"
                  >
                    <Heart className="size-4" />
                  </button>
                </div>

                {/* Card body */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-zinc-900 group-hover:text-rose-600 transition-colors">
                        {v.name}
                      </h3>
                      <span className="mt-1 inline-block rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-600">
                        {v.category}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-zinc-900">
                        {v.price}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
                    <div className="flex items-center gap-1">
                      <Star className="size-4 fill-amber-400 text-amber-400" />
                      <span className="font-medium text-zinc-700">
                        {v.rating}
                      </span>
                      <span>({v.reviews} reviews)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="size-3.5 text-zinc-400" />
                      <span>{v.location}</span>
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-100 bg-white px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-full bg-rose-500">
              <Heart className="size-3 fill-white text-white" />
            </div>
            <span className="text-sm font-semibold text-zinc-700">Aisle</span>
          </div>
          <p className="text-sm text-zinc-400">
            © 2026 Aisle, Inc. All rights reserved.
          </p>
          <div className="flex gap-4 text-sm text-zinc-400">
            <a href="#" className="hover:text-zinc-600">
              Privacy
            </a>
            <a href="#" className="hover:text-zinc-600">
              Terms
            </a>
            <a href="#" className="hover:text-zinc-600">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
