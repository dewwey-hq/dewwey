"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, Star, MapPin, Menu, X } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { siteContainerClass, SITE_HEADER_HEIGHT_CLASS } from "@/lib/site-layout";
import { displayHeadingClassName, uiHeadingClassName } from "@/lib/typography";
import { SiteNavLinks, SiteNavMobileLinks } from "./SiteNavLinks";
import { SiteBrand } from "./SiteBrand";
import { useNavIconsVisible } from "@/lib/hooks/use-nav-icons-visible";
import { VenuePlacePhoto } from "./VenuePlacePhoto";
import { AddToTeamButton } from "./team/AddToTeamButton";
import { AuthButton } from "./team/AuthButton";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Vendor = {
  id: number;
  username: string;
  avatar_url?: string | null;
  n_weddings?: number;
  place_id: string | null;
  name: string;
  category: string;
  rating: number | null;
  review_count: number | null;
  address: string | null;
  short_address: string | null;
  phone: string | null;
  website: string | null;
  photos: string[] | null;
  price_level: number | null;
  featured: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ["All Vendors", "Venues", "Catering", "Florals", "Photography", "DJ & Music", "Hair & Makeup"];

/** Where each category actually goes. */
const CATEGORY_HREFS: Record<string, string> = {
  "All Vendors": "/vendors",
  Venues: "/venues",
  Catering: "/vendors?role=catering",
  Florals: "/vendors?role=florist",
  Photography: "/vendors?role=photographer",
  "DJ & Music": "/vendors?role=dj",
  "Hair & Makeup": "/vendors?role=hair",
};

function searchHref(category: string, q: string): string {
  const base = CATEGORY_HREFS[category] ?? "/vendors";
  if (!q.trim()) return base;
  return `${base}${base.includes("?") ? "&" : "?"}q=${encodeURIComponent(q.trim())}`;
}

const VENDOR_CATEGORIES = [
  { label: "Venues",        src: "/icons/wedding-location-svgrepo-com.svg",        roles: ["venue"] },
  { label: "Catering",      src: "/icons/tray-plate-svgrepo-com.svg",              roles: ["catering", "cake"] },
  { label: "Florals",       src: "/icons/bouquet-svgrepo-com.svg",                 roles: ["florist"] },
  { label: "Photography",   src: "/icons/photo-camera-photograph-svgrepo-com.svg", roles: ["photographer"] },
  { label: "DJ & Music",    src: "/icons/music-svgrepo-com.svg",                   roles: ["dj", "band", "musician"] },
  { label: "Hair & Makeup", src: "/icons/make-up-svgrepo-com.svg",                 roles: ["hair", "makeup"] },
];

const BADGE_COLORS: Record<string, string> = {
  venue:        "bg-rose-50 text-rose-700",
  florist:      "bg-emerald-50 text-emerald-700",
  caterer:      "bg-orange-50 text-orange-700",
  photographer: "bg-amber-50 text-amber-700",
  dj_music:     "bg-purple-50 text-purple-700",
  hair_makeup:  "bg-pink-50 text-pink-700",
};

const CATEGORY_LABELS: Record<string, string> = {
  venue:        "Venue",
  florist:      "Florals",
  caterer:      "Catering",
  photographer: "Photography",
  dj_music:     "DJ & Music",
  hair_makeup:  "Hair & Makeup",
};

const PRICE_LABELS: Record<number, string> = { 0: "Free", 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomepageClient({
  featuredVendors,
  stats,
  roleCounts,
}: {
  featuredVendors: Vendor[];
  stats: { chicago_weddings: number; credited_vendors: number; collaborations: number };
  roleCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All Vendors");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const navIconsVisible = useNavIconsVisible();


  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── NAV ── */}
      <header className="sticky top-0 z-50 bg-white border-b border-black/[0.08]">
        <div className={siteContainerClass}>
          <div className={`flex ${SITE_HEADER_HEIGHT_CLASS} items-stretch justify-between`}>

            {/* Logo */}
            <SiteBrand href="/" className="self-center" />

            <SiteNavLinks showIcons={navIconsVisible} />

            {/* Right actions */}
            <div className="hidden shrink-0 items-center gap-3 self-center md:flex">
              <a href="mailto:hello@dewwey.com?subject=List%20my%20business%20on%20Dewwey" className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors">
                List your business
              </a>
              <AuthButton />
            </div>

            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-black/[0.06] bg-white">
            <div className={`${siteContainerClass} py-4`}>
              <SiteNavMobileLinks />
              <div className="mt-2 flex flex-col gap-1 border-t border-black/[0.06] pt-2">
              {[
                { label: "List your business", href: "#" },
                { label: "Sign In", href: "#" },
              ].map((link) => (
                <a key={link.label} href={link.href} className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                  {link.label}
                </a>
              ))}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden bg-[#fdf8f5]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-rose-100/40 blur-[120px] translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-amber-100/30 blur-[100px] -translate-x-1/3 translate-y-1/3" />
        </div>

        <div className={`relative ${siteContainerClass} pt-20 pb-24 text-center`}>
          <p className="mb-4 text-sm font-medium tracking-widest text-rose-500 uppercase">
            Chicago&apos;s Wedding Marketplace
          </p>
          <h1 className={`mb-5 text-5xl leading-[1.1] tracking-tight text-gray-900 sm:text-6xl lg:text-7xl ${displayHeadingClassName}`}>
            Plan Your Perfect
            <br />
            <span className="italic text-rose-400">Chicago</span> Wedding
          </h1>
          <p className="text-gray-500 text-lg max-w-xl mx-auto mb-10" style={{ fontWeight: 400 }}>
            Real Chicago weddings and the vendor teams behind them — reconstructed from the credits vendors post, not paid listings.
          </p>

          {/* Search bar */}
          <div className="max-w-2xl mx-auto">
            <form
              onSubmit={(e) => { e.preventDefault(); router.push(searchHref(selectedCategory, searchQuery)); }}
              className="flex items-center bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.10)] border border-black/[0.06] overflow-hidden"
            >

              {/* Category dropdown */}
              <div className="relative shrink-0">
                <button
                  className="flex items-center gap-1.5 px-5 py-4 text-sm text-gray-700 border-r border-black/[0.08] hover:bg-gray-50 transition-colors whitespace-nowrap"
                  onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                >
                  {selectedCategory}
                  <ChevronDown size={15} className="text-gray-400" />
                </button>
                {categoryDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-52 bg-white border border-black/[0.08] rounded-xl shadow-lg z-20 py-1.5">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        onClick={() => { setSelectedCategory(cat); setCategoryDropdownOpen(false); }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Text input */}
              <input
                type="text"
                placeholder="Search by vendor name or neighborhood…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-4 py-4 text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent"
              />

              {/* Search button */}
              <button type="submit" className="shrink-0 m-2 px-6 py-3 bg-rose-400 hover:bg-rose-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
                <Search size={15} />
                Search
              </button>
            </form>

            <p className="text-xs text-gray-400 mt-3">
              Popular:{" "}
              <Link href="/venues?q=River%20North" className="text-gray-500 hover:text-gray-700 transition-colors">River North Venues</Link>
              {" · "}
              <Link href="/vendors?role=photographer" className="text-gray-500 hover:text-gray-700 transition-colors">Wedding Photographers</Link>
              {" · "}
              <Link href="/vendors?role=florist" className="text-gray-500 hover:text-gray-700 transition-colors">Floral Design</Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── CATEGORY CARDS ── */}
      <section className={`${siteContainerClass} py-20`}>
        <div className="mb-10">
          <h2 className={`mb-2 text-3xl text-gray-900 ${displayHeadingClassName}`}>
            Browse by Category
          </h2>
          <p className="text-gray-500 text-sm">Everything you need for your Chicago wedding, all in one place.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {VENDOR_CATEGORIES.map(({ label, src, roles }) => (
            <a
              key={label}
              href={CATEGORY_HREFS[label] ?? "/vendors"}
              className="group flex flex-col items-center gap-3 p-5 rounded-2xl border border-black/[0.07] bg-white hover:border-rose-200 hover:shadow-[0_4px_20px_rgba(244,63,94,0.08)] transition-all duration-200 text-center"
            >
              <div className="w-12 h-12 rounded-xl bg-[#fdf8f5] group-hover:bg-rose-50 transition-colors flex items-center justify-center">
                <Image src={src} alt={label} width={28} height={28} className="object-contain" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-800 group-hover:text-gray-900 transition-colors">{label}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {roles.reduce((n, r) => n + (roleCounts[r] ?? 0), 0).toLocaleString()} credited
                </div>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ── FEATURED VENDORS ── */}
      <section className="bg-[#fdf8f5] py-20">
        <div className={siteContainerClass}>
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className={`mb-2 text-3xl text-gray-900 ${displayHeadingClassName}`}>
                Featured Vendors
              </h2>
              <p className="text-gray-500 text-sm">Highly-rated vendors loved by Chicago couples.</p>
            </div>
            <Link href="/vendors" className="hidden sm:block text-sm text-rose-500 hover:text-rose-600 font-medium transition-colors">
              View all →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredVendors.map((vendor) => {
              const badgeColor = BADGE_COLORS[vendor.category] ?? "bg-gray-50 text-gray-700";
              const badgeLabel = CATEGORY_LABELS[vendor.category] ?? vendor.category;
              const priceLabel = vendor.price_level != null ? PRICE_LABELS[vendor.price_level] : null;
              const location = vendor.short_address ?? vendor.address ?? "Chicago";

              return (
                <div
                  key={vendor.username}
                  className="bg-white rounded-2xl overflow-hidden border border-black/[0.06] hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] transition-all duration-300 group"
                >
                  {/* Photo */}
                  <div className="relative overflow-hidden h-56 bg-gray-100">
                    <Link href={`/vendors/${encodeURIComponent(vendor.username)}`} className="block h-full w-full">
                      <VenuePlacePhoto
                        placeId={vendor.place_id ?? undefined}
                        photoNames={vendor.photos}
                        alt={vendor.name ?? "Vendor photo"}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </Link>

                    {/* Add to team */}
                    <span className="absolute top-3 right-3 rounded-full bg-white/90 p-1.5 shadow-sm backdrop-blur-sm">
                      <AddToTeamButton
                        accountId={vendor.id}
                        username={vendor.username}
                        name={vendor.name}
                        role={vendor.category}
                        avatarUrl={vendor.avatar_url ?? null}
                      />
                    </span>

                    {/* Category badge */}
                    <span className={`absolute top-3 left-3 text-xs font-medium px-2.5 py-1 rounded-full ${badgeColor}`}>
                      {badgeLabel}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <Link href={`/vendors/${encodeURIComponent(vendor.username)}`} className="text-[15px] font-medium text-gray-900 leading-snug hover:text-rose-600">{vendor.name}</Link>
                      {vendor.rating != null && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Star size={13} className="fill-amber-400 text-amber-400" />
                          <span className="text-sm font-medium text-gray-800">{vendor.rating}</span>
                          {vendor.review_count != null && (
                            <span className="text-xs text-gray-400">({vendor.review_count})</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-xs text-gray-400 mb-3">
                      <MapPin size={12} />
                      {location}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-black/[0.06]">
                      {vendor.website ? (
                        <a
                          href={vendor.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-rose-500 hover:text-rose-600 transition-colors"
                        >
                          Visit website →
                        </a>
                      ) : (
                        <span />
                      )}
                      {priceLabel && (
                        <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md">
                          {priceLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 text-center sm:hidden">
            <Link href="/vendors" className="text-sm text-rose-500 font-medium">View all vendors →</Link>
          </div>
        </div>
      </section>

      {/* ── TRUST BAR ── */}
      <section className="border-y border-black/[0.06] py-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          {[
            { stat: stats.credited_vendors.toLocaleString(), label: "Vendors credited on real Chicago weddings" },
            { stat: stats.chicago_weddings.toLocaleString(), label: "Chicago weddings documented" },
            { stat: stats.collaborations.toLocaleString(), label: "Vendor collaborations mapped" },
          ].map(({ stat, label }) => (
            <div key={stat}>
              <div className={`mb-1 text-3xl text-gray-900 ${displayHeadingClassName}`}>{stat}</div>
              <div className="text-sm text-gray-500">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-gray-900 text-gray-400 py-16">
        <div className={siteContainerClass}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-rose-400 text-xl">✦</span>
                <span className={`text-[16px] text-white ${uiHeadingClassName}`}>{BRAND_NAME}</span>
              </div>
              <p className="text-sm leading-relaxed text-gray-500">
                Chicago&apos;s most trusted wedding vendor marketplace. Find, compare, and book with confidence.
              </p>
            </div>

            {[
              { heading: "Explore", links: [
                { label: "Weddings", href: "/weddings" },
                { label: "Venues", href: "/venues" },
                { label: "Vendors", href: "/vendors" },
              ] },
              { heading: "Vendors", links: [
                { label: "Catering", href: "/vendors?role=catering" },
                { label: "Florals", href: "/vendors?role=florist" },
                { label: "Photography", href: "/vendors?role=photographer" },
                { label: "DJ & Music", href: "/vendors?role=dj" },
                { label: "Hair & Makeup", href: "/vendors?role=hair" },
              ] },
              { heading: "Company", links: [
                { label: "Contact", href: "mailto:hello@dewwey.com" },
              ] },
            ].map(({ heading, links }) => (
              <div key={heading}>
                <h4 className="text-white text-sm font-medium mb-4">{heading}</h4>
                <ul className="space-y-2">
                  {links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">{link.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
            <span>© 2026 {BRAND_NAME}. All rights reserved.</span>
            <span>Made with ♥ in Chicago, IL</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
