"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MagnifyingGlass,
  CaretDown,
  Star,
  MapPin,
  List,
  X,
  Heart,
} from "@phosphor-icons/react";
import { BRAND_NAME } from "@/lib/brand";
import { siteContainerClass, SITE_HEADER_HEIGHT_CLASS } from "@/lib/site-layout";
import { displayHeadingClassName, uiHeadingClassName } from "@/lib/typography";
import { DEFAULT_SLOTS, SLOT_ROLES, type TeamEntry } from "@/lib/team";
import { SLOT_ICONS, slotHref, vendorsHref, weddingCountLabel, type Slot } from "@/lib/slots";
import { roleLabel } from "@/lib/roles";
import { formatCount } from "@/lib/format-address";
import { formatEventDate } from "@/lib/format-date";
import type { WeddingStack } from "@/lib/server/graph";
import { SiteNavLinks, SiteNavMobileLinks } from "./SiteNavLinks";
import { SiteBrand } from "./SiteBrand";
import { useNavIconsVisible } from "@/lib/hooks/use-nav-icons-visible";
import { VenuePlacePhoto } from "./VenuePlacePhoto";
import { Avatar } from "./Avatar";
import { AddToTeamButton } from "./team/AddToTeamButton";
import { AuthButton } from "./team/AuthButton";
import { useTeam } from "./team/TeamProvider";

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

const SEARCH_CATEGORIES = ["All Vendors", ...DEFAULT_SLOTS];

function searchHref(category: string, q: string): string {
  const slot = (DEFAULT_SLOTS as readonly string[]).includes(category) ? category : null;
  return vendorsHref({ slot, q: q.trim() || null });
}

const PRICE_LABELS: Record<number, string> = { 0: "Free", 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };

// ── Hero stack ────────────────────────────────────────────────────────────────

function HeroStack({ stack, totalWeddings }: { stack: WeddingStack; totalWeddings: number }) {
  const shown = stack.vendors.slice(0, 7);
  const extra = stack.vendors.length - shown.length;
  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white shadow-[0_10px_40px_rgba(0,0,0,0.08)]">
      <div className="flex items-center gap-2 border-b border-black/[0.06] px-5 py-3.5">
        <h3 className="text-sm font-medium text-gray-900">{formatEventDate(stack.event_date_est)}</h3>
        {stack.n_posts > 1 && (
          <span
            className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"
            title={`${stack.n_posts} vendors independently posted this wedding`}
          >
            ✓ {stack.n_posts} posts
          </span>
        )}
      </div>
      <ul className="divide-y divide-black/[0.04] px-5 py-1">
        {shown.map((v) => (
          <li key={`${v.username}-${v.role}`} className="flex items-center gap-2 py-2">
            <span className="w-20 shrink-0 text-xs font-medium text-gray-600">{roleLabel(v.role)}</span>
            <Link
              href={`/vendors/${encodeURIComponent(v.username)}`}
              className="flex min-w-0 items-center gap-2 text-gray-900 hover:text-gray-600"
            >
              <Avatar src={v.avatar_url} name={v.name} size={24} className="text-[10px]" />
              <span className="truncate text-sm">{v.name}</span>
            </Link>
            <span className="ml-auto">
              <AddToTeamButton
                accountId={v.accountId}
                username={v.username}
                name={v.name}
                role={v.role}
                avatarUrl={v.avatar_url}
              />
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/weddings"
        className="block border-t border-black/[0.06] px-5 py-3 text-sm text-gray-600 transition-colors hover:text-gray-900"
      >
        {extra > 0 ? `+${extra} more credits · ` : ""}
        One of {weddingCountLabel(totalWeddings)} →
      </Link>
    </div>
  );
}

// ── Slot card ─────────────────────────────────────────────────────────────────

function SlotCard({
  slot,
  count,
  entries,
}: {
  slot: Slot;
  count: number;
  entries: TeamEntry[];
}) {
  const pick = entries[0];
  const SlotIcon = SLOT_ICONS[slot];

  return (
    <Link
      href={slotHref(slot)}
      className="group flex items-center gap-4 rounded-xl border border-black/[0.07] bg-white p-4 transition-colors hover:border-black/[0.18]"
    >
      {pick ? (
        <Avatar src={pick.avatarUrl ?? null} name={pick.name} size={40} className="shrink-0 text-sm" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] text-gray-700">
          <SlotIcon size={22} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[15px] font-medium text-gray-900">
          {slot}
          {pick && <Heart size={12} weight="fill" className="shrink-0 text-rose-500" />}
        </span>
        <span className="block truncate text-sm text-black/[0.55]">
          {pick
            ? `${pick.name}${entries.length > 1 ? ` +${entries.length - 1}` : ""}`
            : `${count.toLocaleString()} credited`}
        </span>
      </span>
      <span className="text-black/[0.30] transition-colors group-hover:text-gray-900">→</span>
    </Link>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomepageClient({
  featuredVendors,
  stats,
  roleCounts,
  heroStack,
}: {
  featuredVendors: Vendor[];
  stats: { chicago_weddings: number; credited_vendors: number; collaborations: number };
  roleCounts: Record<string, number>;
  heroStack: WeddingStack | null;
}) {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All Vendors");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const navIconsVisible = useNavIconsVisible();
  const { team } = useTeam();

  const slotCount = (slot: string) =>
    (SLOT_ROLES[slot] ?? []).reduce((n, r) => n + (roleCounts[r] ?? 0), 0);

  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── NAV ── */}
      <header className="sticky top-0 z-50 bg-white border-b border-black/[0.08]">
        <div className={siteContainerClass}>
          <div className={`flex ${SITE_HEADER_HEIGHT_CLASS} items-stretch justify-between`}>

            {/* Logo */}
            <div className="flex flex-1 items-center justify-start">
              <SiteBrand href="/" />
            </div>

            <SiteNavLinks showIcons={navIconsVisible} />

            {/* Right actions */}
            <div className="hidden flex-1 shrink-0 items-center justify-end self-center md:flex">
              <AuthButton />
            </div>

            {/* Mobile menu toggle */}
            <button
              className="md:hidden self-center p-2 rounded-lg text-gray-600 hover:bg-black/[0.05] transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={20} /> : <List size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-black/[0.06] bg-white">
            <div className={`${siteContainerClass} py-4`}>
              <SiteNavMobileLinks />
              <div className="mt-2 flex flex-col gap-1 border-t border-black/[0.06] pt-2">
                <a href="/login" className="px-3 py-2 text-sm text-gray-700 hover:bg-black/[0.04] rounded-lg transition-colors">
                  Sign in
                </a>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden bg-[#fdf8f5]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-rose-100/40 blur-[120px] translate-x-1/3 -translate-y-1/3" />
        </div>

        <div className={`relative ${siteContainerClass} pt-16 pb-20 lg:pt-20 lg:pb-24`}>
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <h1 className={`mb-5 text-4xl leading-[1.1] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl ${displayHeadingClassName}`}>
                Assemble your Chicago wedding{" "}
                <span className="italic text-rose-400">dream team</span>
              </h1>
              <p className="mb-8 max-w-xl text-lg text-gray-600">
                Real weddings and the vendor teams behind them, reconstructed from
                the credits vendors post. Not paid listings.
              </p>

              {/* Search bar */}
              <div className="max-w-xl">
                <form
                  onSubmit={(e) => { e.preventDefault(); router.push(searchHref(selectedCategory, searchQuery)); }}
                  className="rounded-2xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.10)] border border-black/[0.06]"
                >
                  <div className="flex flex-col sm:flex-row sm:items-stretch">
                    <div className="flex min-w-0 flex-1 items-stretch border-b border-black/[0.08] sm:border-b-0">
                      {/* Category dropdown */}
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          className="flex h-full items-center gap-1.5 rounded-tl-2xl px-4 py-4 text-sm text-gray-700 border-r border-black/[0.08] hover:bg-black/[0.04] transition-colors whitespace-nowrap sm:rounded-l-2xl"
                          onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                        >
                          {selectedCategory}
                          <CaretDown size={13} className="text-black/[0.45]" />
                        </button>
                        {categoryDropdownOpen && (
                          <div className="absolute top-full left-0 mt-2 w-52 bg-white border border-black/[0.08] rounded-xl shadow-lg z-20 py-1.5">
                            {SEARCH_CATEGORIES.map((cat) => (
                              <button
                                type="button"
                                key={cat}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-black/[0.04] transition-colors"
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
                        placeholder="Vendor name or neighborhood…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="min-w-0 flex-1 px-4 py-4 text-sm text-gray-800 placeholder:text-black/[0.40] outline-none bg-transparent"
                      />
                    </div>

                    {/* Search button */}
                    <button type="submit" className="m-2 shrink-0 px-6 py-3 bg-rose-400 hover:bg-rose-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
                      <MagnifyingGlass size={15} />
                      Search
                    </button>
                  </div>
                </form>

                <p className="text-xs text-black/[0.45] mt-3">
                  Popular:{" "}
                  <Link href={vendorsHref({ slot: "Venue", q: "River North" })} className="text-gray-600 hover:text-gray-900 transition-colors">River North Venues</Link>
                  {" · "}
                  <Link href={slotHref("Photography")} className="text-gray-600 hover:text-gray-900 transition-colors">Wedding Photographers</Link>
                  {" · "}
                  <Link href={slotHref("Florals")} className="text-gray-600 hover:text-gray-900 transition-colors">Floral Design</Link>
                </p>
              </div>
            </div>


            {heroStack && (
              <div className="hidden lg:block">
                <HeroStack stack={heroStack} totalWeddings={stats.chicago_weddings} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── TEAM SLOTS ── */}
      <section className={`${siteContainerClass} py-20`}>
        <div className="mb-10">
          <h2 className={`mb-2 text-3xl text-gray-900 ${displayHeadingClassName}`}>
            Your team, slot by slot
          </h2>
          <p className="text-gray-600 text-[15px]">
            Nine slots every wedding fills. Tap one to browse vendors ranked by documented work.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEFAULT_SLOTS.map((slot) => (
            <SlotCard
              key={slot}
              slot={slot}
              count={slotCount(slot)}
              entries={team.entries.filter((e) => e.slot === slot)}
            />
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="border-y border-black/[0.06] bg-black/[0.02] py-20">
        <div className={siteContainerClass}>
          <h2 className={`mb-12 text-3xl text-gray-900 ${displayHeadingClassName}`}>
            How {BRAND_NAME} works
          </h2>
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
            {[
              {
                stat: stats.credited_vendors.toLocaleString(),
                title: "Vendors credit their team",
                body: "After every wedding, vendors tag who they worked with. Each one here is credited on real work.",
              },
              {
                stat: stats.chicago_weddings.toLocaleString(),
                title: "We reconstruct the wedding",
                body: "Those credits become a documented Chicago wedding: the venue, the date, and the full team.",
              },
              {
                stat: stats.collaborations.toLocaleString(),
                title: "You see who works together",
                body: "Collaborations mapped across the city, so you can book a team that already clicks.",
              },
            ].map(({ stat, title, body }) => (
              <div key={title}>
                <div className={`text-4xl text-gray-900 ${displayHeadingClassName}`}>{stat}</div>
                <div className="mt-2 text-[15px] font-medium text-gray-900">{title}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURED VENDORS ── */}
      <section className="py-20">
        <div className={siteContainerClass}>
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className={`mb-2 text-3xl text-gray-900 ${displayHeadingClassName}`}>
                Featured vendors
              </h2>
              <p className="text-gray-600 text-[15px]">Highly rated vendors loved by Chicago couples.</p>
            </div>
            <Link href="/vendors" className="hidden sm:block text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              View all →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredVendors.map((vendor) => {
              const badgeLabel = roleLabel(vendor.category);
              const priceLabel = vendor.price_level != null ? PRICE_LABELS[vendor.price_level] : null;
              const location = vendor.short_address ?? vendor.address ?? "Chicago";

              return (
                <div
                  key={vendor.username}
                  className="bg-white rounded-2xl overflow-hidden border border-black/[0.07] hover:border-black/[0.18] transition-colors group"
                >
                  {/* Photo */}
                  <div className="relative overflow-hidden h-56 bg-black/[0.04]">
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
                    <span className="absolute top-3 left-3 text-xs font-medium px-2.5 py-1 rounded-full bg-white/90 text-gray-800 backdrop-blur-sm">
                      {badgeLabel}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <Link href={`/vendors/${encodeURIComponent(vendor.username)}`} className="text-[15px] font-medium text-gray-900 leading-snug hover:text-gray-600">{vendor.name}</Link>
                      {vendor.rating != null && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Star size={13} weight="fill" className="text-amber-400" />
                          <span className="text-sm font-medium text-gray-800">{vendor.rating}</span>
                          {vendor.review_count != null && (
                            <span className="text-xs text-black/[0.55]">({formatCount(vendor.review_count)})</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-xs text-black/[0.55] mb-3">
                      <MapPin size={12} />
                      {location}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-black/[0.06]">
                      {vendor.website ? (
                        <a
                          href={vendor.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                        >
                          Visit website →
                        </a>
                      ) : (
                        <span />
                      )}
                      {priceLabel && (
                        <span className="text-xs font-medium text-gray-600 bg-black/[0.04] px-2 py-1 rounded-md">
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
            <Link href="/vendors" className="text-sm font-medium text-gray-600 hover:text-gray-900">View all vendors →</Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-black/[0.08] bg-white py-16 text-gray-600">
        <div className={siteContainerClass}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2">
                <span className="text-rose-400 text-xl">✦</span>
                <span className={`text-[16px] text-gray-900 ${uiHeadingClassName}`}>{BRAND_NAME}</span>
              </div>
            </div>

            {[
              { heading: "Explore", links: [
                { label: "Weddings", href: "/weddings" },
                { label: "Venues", href: slotHref("Venue") },
                { label: "Vendors", href: "/vendors" },
              ] },
              { heading: "Vendors", links: DEFAULT_SLOTS.filter((s) => s !== "Venue").map(
                (s) => ({ label: s as string, href: slotHref(s) }),
              ) },
              { heading: "Company", links: [
                { label: "Contact", href: "mailto:hello@dewwey.com" },
              ] },
            ].map(({ heading, links }) => (
              <div key={heading}>
                <h4 className="text-gray-900 text-sm font-medium mb-4">{heading}</h4>
                <ul className="space-y-2">
                  {links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="text-sm transition-colors hover:text-gray-900">{link.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="pt-8 border-t border-black/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-black/[0.45]">
            <span>© 2026 {BRAND_NAME}. All rights reserved.</span>
            <span>Made with ♥ in Chicago, IL</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
