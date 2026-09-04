import type { Metadata } from "next";
import Link from "next/link";
import {
  MapPin,
  Star,
  ExternalLink,
  Users,
  Trees,
  UtensilsCrossed,
  Wine,
  Sparkles,
  FileText,
  Camera,
  Newspaper,
} from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { displayHeadingClassName, uiHeadingClassName } from "@/lib/typography";
import CategoryIcon from "@/app/components/CategoryIcon";
import { StickyActionBar } from "./StickyActionBar";
import { InquiryProvider, InquiryTriggerBox, AskAboutPricingButton } from "./InquirySystem";
import { VideoTourButton } from "./VideoTourButton";
import { fieldMuseum } from "./data";

export const metadata: Metadata = {
  title: `Field Museum: venue concept preview | ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

const QUICK_FACT_ICONS = {
  guests: Users,
  indoorOutdoor: Trees,
  catering: UtensilsCrossed,
  bar: Wine,
} as const;

function InstagramGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
    </svg>
  );
}

function SectionHeading({ title, subtitle, id }: { title: string; subtitle?: string; id?: string }) {
  return (
    <div id={id} className="mb-4 scroll-mt-20">
      <h2 className={`text-xl leading-snug text-gray-900 ${uiHeadingClassName}`}>{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
    </div>
  );
}

function Divider() {
  return <div className="my-6 border-t border-black/[0.06]" />;
}

// Vendor category icons + priority order, matching Marchetti v3's VendorCategoryList pattern
// (feedback 2026-08-15). "Lighting & AV" has no icon — music is reserved for actual DJ/music
// vendors (per feedback), and no other file in /public/icons/ is a real match for lighting, so
// this one just goes without rather than force-fitting something unrelated. Equipment Rentals
// uses padlock-key (the "you check it out, then return it" idea) — the closest available fit,
// not a literal rental-equipment icon either. Order follows the same shopping-priority logic as
// Marchetti/LondonHouse (D007): high-consideration categories first (catering, floral),
// logistics-only categories last (equipment, parking) — this already matched the real
// approvedVendors list's natural order, now made explicit/deliberate instead of just incidental
// Map insertion order.
const VENDOR_ICON_SRC: Record<string, string> = {
  Catering: "/icons/tray-plate-svgrepo-com.svg",
  "Floral & Decor": "/icons/bouquet-svgrepo-com.svg",
  "Equipment Rentals": "/icons/padlock-key-svgrepo-com.svg",
  Parking: "/icons/car-svgrepo-com.svg",
};
const VENDOR_CATEGORY_ORDER = ["Catering", "Floral & Decor", "Lighting & AV", "Equipment Rentals", "Parking"];

function VendorIcon({ category, size = 16 }: { category: string; size?: number }) {
  const src = VENDOR_ICON_SRC[category];
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} className="shrink-0" />;
}

export default function FieldMuseumPage() {
  const vendorsByCategory = new Map<string, { name: string; url: string }[]>();
  for (const v of fieldMuseum.approvedVendors) {
    if (!vendorsByCategory.has(v.category)) vendorsByCategory.set(v.category, []);
    vendorsByCategory.get(v.category)!.push({ name: v.name, url: v.url });
  }
  const orderedVendorCategories = VENDOR_CATEGORY_ORDER.filter((c) => vendorsByCategory.has(c));

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="mx-auto mb-3 max-w-5xl px-4 text-center text-xs text-gray-500">
        Concept preview: third golden-set venue, chosen to pressure-test the design against a
        different archetype (museum/landmark) and a real, restrictive-sounding vendor policy.
        See:{" "}
        <Link href="/concept/galleria-marchetti-v4" className="underline hover:text-gray-800">
          Galleria Marchetti
        </Link>{" "}
        ·{" "}
        <Link href="/concept/londonhouse-chicago" className="underline hover:text-gray-800">
          LondonHouse
        </Link>{" "}
        ·{" "}
        <Link href="/concept/diamond-garden-banquet-hall" className="underline hover:text-gray-800">
          Diamond Garden
        </Link>{" "}
        ·{" "}
        <Link href="/venues" className="underline hover:text-gray-800">
          Back to live venues
        </Link>
      </div>

      <div className="relative mx-auto max-w-5xl rounded-3xl bg-white shadow-xl">
        <InquiryProvider>
          <StickyActionBar name={fieldMuseum.name} />

          <div className="px-5 py-6 sm:px-8">
            {/* Header */}
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-stretch gap-4">
                <CategoryIcon category="venue" primaryType="museum" large />
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-rose-500">{fieldMuseum.categoryLabel}</p>
                  <h1 id="venue-name-heading" className={`text-2xl leading-tight text-gray-900 sm:text-3xl ${displayHeadingClassName}`}>{fieldMuseum.name}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                    <span className="inline-flex items-center gap-1">
                      <Star size={14} className="fill-rose-400 text-rose-400" />
                      <span className="font-medium text-gray-800">{fieldMuseum.rating}</span>
                      <span className="text-gray-400">({fieldMuseum.reviewCount.toLocaleString()} reviews)</span>
                    </span>
                    <a href={fieldMuseum.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800">
                      <ExternalLink size={13} />
                      Website
                    </a>
                    <a href={fieldMuseum.instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-gray-500 hover:text-gray-800" aria-label="Instagram">
                      <InstagramGlyph size={14} />
                    </a>
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <MapPin size={13} />
                      {fieldMuseum.address}
                    </span>
                  </div>
                </div>
              </div>
              <div className="w-full shrink-0 sm:w-64">
                <InquiryTriggerBox />
              </div>
            </div>

            <Divider />

            {/* About */}
            <div>
              <SectionHeading title="About" />
              <p className="text-[15px] leading-[1.65] text-gray-600">{fieldMuseum.about}</p>
            </div>

            {/* Quick facts */}
            <div className="mt-4 flex flex-wrap gap-2">
              {fieldMuseum.quickFacts.map((f) => {
                const Icon = QUICK_FACT_ICONS[f.icon as keyof typeof QUICK_FACT_ICONS];
                return (
                  <span key={f.label} className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3.5 py-2 text-sm text-gray-700" title={f.note}>
                    <Icon size={14} className="shrink-0 text-rose-400" />
                    {f.label}
                  </span>
                );
              })}
            </div>

            {/* No Real Weddings / Wedding Vendor Stacks section — @fieldmuseum is real and
                verified but it's the museum's general account, not a venue account that tags
                real wedding vendors. Nothing honest to show here (see data.ts header). */}

            <Divider />

            {/* Photos — moved here (between About and Spaces) per feedback 2026-08-15. */}
            <section id="photos">
              <SectionHeading title="Photos" />
              <div className="grid grid-cols-3 gap-2">
                {fieldMuseum.photos.map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt={fieldMuseum.name} className="aspect-square w-full rounded-xl object-cover" />
                ))}
              </div>
            </section>

            <Divider />

            {/* Spaces — real per-space capacity/sq-ft data, each figure sourced from that
                space's own subpage (not the general weddings page, which states none of this).
                Capacity is a single headline number per stat, matching Marchetti/LondonHouse's
                convention — any real nuance (e.g. East Atrium's atrium-only sub-figures) is
                folded into the description instead of a second line under the stat. Ceiling
                height moved out of the sq-ft line into the description, not shown next to sq
                ft. Every space has a real embedded video tour, opened in an in-page lightbox
                (VideoTourButton) rather than a new tab to vimeo.com or fieldmuseum.org —
                feedback 2026-08-15, same reasoning as Marchetti's FloorPlanButton. Pricing
                folded in here too, not a separate section — nothing real to show per space, but
                "ask about pricing" reads more naturally next to the spaces than as a
                disconnected callout further down. */}
            <section id="spaces">
              <SectionHeading title="Spaces" subtitle="Four spaces are featured for weddings specifically; the museum also has additional meeting/event spaces not shown here." />

              <div className="grid gap-5 sm:grid-cols-2">
                {fieldMuseum.spaces.map((space) => (
                  <div key={space.name} className="rounded-2xl border border-black/[0.06] p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{space.name}</h3>
                        <p className="text-sm text-gray-500">{space.sqFt} sq ft</p>
                      </div>
                      {space.hasVideo && space.videoId && <VideoTourButton spaceName={space.name} videoId={space.videoId} videoUrl={space.videoUrl} />}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
                      <div className="rounded-xl bg-[#fdf8f5] py-2">
                        <div className="font-semibold text-gray-900">{space.capacity.seated.toLocaleString()}</div>
                        <div className="text-[11px] leading-tight text-gray-500">{fieldMuseum.capacityLabels.seated}</div>
                      </div>
                      <div className="rounded-xl bg-[#fdf8f5] py-2">
                        <div className="font-semibold text-gray-900">{space.capacity.reception.toLocaleString()}</div>
                        <div className="text-[11px] leading-tight text-gray-500">{fieldMuseum.capacityLabels.reception}</div>
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-[1.6] text-gray-600">{space.description}</p>
                    {space.ceilingHeight ? <p className="mt-1.5 text-xs text-gray-400">Ceiling height: {space.ceilingHeight}</p> : null}
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-black/[0.06] bg-[#fdf8f5] p-5">
                <p className="text-sm leading-[1.6] text-gray-600">
                  Field Museum doesn&apos;t publish rental fees for any space. Pricing comes from a custom proposal.
                </p>
                <AskAboutPricingButton />
              </div>
            </section>

            <Divider />

            {/* Food & Beverage — split into Food and Beverage, each a direct sentence
                (feedback 2026-08-15), plus the two real downloadable PDFs found on the weddings
                page (previously missing from the page entirely). No packages/per-guest pricing
                to show, unlike Marchetti/LondonHouse — policy + resources only. */}
            <section id="food-beverage">
              <SectionHeading title="Food & Beverage" />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Food</p>
                  <p className="text-sm leading-[1.6] text-gray-600">{fieldMuseum.foodAndBeverage.food}</p>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Beverage</p>
                  <p className="text-sm leading-[1.6] text-gray-600">{fieldMuseum.foodAndBeverage.beverage}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {fieldMuseum.foodAndBeverage.beverageResources.map((r) => (
                      <a
                        key={r.url}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50"
                      >
                        <FileText size={13} className="text-rose-400" />
                        {r.label}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <Divider />

            {/* Add-ons — the one real add-on found (photography session), moved out of Pricing
                per feedback 2026-08-15: it reads as an add-on, not a pricing-section line item. */}
            <section id="add-ons">
              <SectionHeading title="Add-ons & extras" />
              <div className="grid gap-4 sm:grid-cols-3">
                {fieldMuseum.addOns.map((a) => (
                  <div key={a.name} className="rounded-2xl border border-black/[0.06] p-4">
                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#fdf8f5]">
                      <Camera size={15} className="text-rose-400" />
                    </div>
                    <h4 className={`text-sm text-gray-900 ${uiHeadingClassName}`}>{a.name}</h4>
                    <p className="mt-1 text-base font-semibold text-gray-900">{a.price}</p>
                    <p className="mt-1 text-xs text-gray-500">{a.blurb}</p>
                  </div>
                ))}
              </div>
            </section>

            <Divider />

            <Divider />

            {/* Policies — same canonical 12-row checklist as Marchetti/LondonHouse. Values are
                short, direct answers (feedback 2026-08-15) — fuller real quotes live in
                quickFacts' tooltips and the Food & Beverage text instead of repeating them
                here. Catering, Bar, Venue rental charge type, Parking, and Day-of coordinator
                are real, confirmed facts; the rest (including Payment schedule and
                Cancellation/rescheduling, reverted from an earlier pass — see data.ts) are
                honest gaps. */}
            <section id="policies">
              <SectionHeading title="Policies" />
              <div className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06]">
                {fieldMuseum.policies.map((p) => (
                  <div key={p.label} className="flex items-start justify-between gap-4 px-4 py-3">
                    <span className={`text-sm ${uiHeadingClassName} text-gray-900`}>{p.label}</span>
                    <span className={`text-right text-sm ${p.stated ? "text-gray-600" : "italic text-gray-400"}`}>{p.value}</span>
                  </div>
                ))}
              </div>
            </section>

            <Divider />

            {/* FAQs — standard questions and the venue's own real, on-site questions AND
                answers (confirmed by hand 2026-08-15), rendered identically to
                Marchetti/LondonHouse. */}
            <section id="faqs">
              <SectionHeading title="Frequently asked questions" />

              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Questions every couple asks</p>
              <div className="mb-6 divide-y divide-black/[0.06] rounded-xl border border-black/[0.06]">
                {fieldMuseum.standardFaqs.map((f) => (
                  <details key={f.question} className="group px-4 py-3">
                    <summary className={`cursor-pointer list-none text-sm text-gray-900 ${uiHeadingClassName}`}>
                      <span className="mr-2 inline-block text-gray-300 transition-transform group-open:rotate-90">›</span>
                      {f.question}
                    </summary>
                    <p className="mt-2 pl-4 text-sm leading-[1.6] text-gray-600">{f.answer}</p>
                  </details>
                ))}
              </div>

              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">From Field Museum&apos;s site</p>
              <div className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.06]">
                {fieldMuseum.faqs.map((f) => (
                  <details key={f.question} className="group px-4 py-3">
                    <summary className={`cursor-pointer list-none text-sm text-gray-900 ${uiHeadingClassName}`}>
                      <span className="mr-2 inline-block text-gray-300 transition-transform group-open:rotate-90">›</span>
                      {f.question}
                    </summary>
                    <p className="mt-2 pl-4 text-sm leading-[1.6] text-gray-600">{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>

            <Divider />

            {/* Featured Weddings — real, named external features (blog posts, photographer
                portfolios, press), not Instagram posts. The venue's own "A few of our favorite
                weddings" list, found on its weddings page. Quiet outbound links, matching
                Marchetti's "See this real wedding on Instagram" treatment — the primary value
                is verifiability, not something to render in-page. */}
            <section id="featured-weddings">
              <SectionHeading title="Featured Weddings" subtitle="The venue's own list of real weddings featured elsewhere: blog posts, photographer portfolios, and press." />
              <div className="space-y-2">
                {fieldMuseum.featuredWeddings.map((w) => (
                  <a
                    key={w.url}
                    href={w.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2.5 rounded-xl border border-black/[0.06] px-4 py-3 hover:border-rose-200"
                  >
                    <Newspaper size={15} className="mt-0.5 shrink-0 text-rose-400" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900">{w.title}</span>
                      <span className="block text-xs text-gray-400">{w.attribution}</span>
                    </span>
                  </a>
                ))}
              </div>
            </section>

            <Divider />

            {/* Vendors — titled to match Marchetti's section name (feedback 2026-08-15: keep
                the section name consistent across golden-set venues; the pill badge and intro
                text carry the "approved list" specifics instead). 13 real, named vendors across
                5 categories, the venue's own published list. Corrected on a second pass
                (2026-08-15): not "not stated whether required" — three independent real sources
                (weddings page, FAQ, this list's own page) all say "choose from our approved
                vendors," never mention an outside option. Direct wording, without asserting the
                literal word "required" the venue itself never uses (see data.ts header). Blue
                badge matches LondonHouse's "Preferred" badge styling — both are venue-published
                lists, a different kind of evidence than Marchetti's "seen at real weddings." */}
            <section id="vendors">
              <div className="mb-4 flex flex-wrap items-center gap-3 scroll-mt-20">
                <h2 className={`text-xl leading-snug text-gray-900 ${uiHeadingClassName}`}>Vendors</h2>
                <span className="inline-flex shrink-0 items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">Choose from this list</span>
              </div>
              <p className="mb-4 text-sm text-gray-500">The museum asks you to choose from their approved vendors. These vendors are knowledgeable about the museum space, receive special training on policies and procedures, and are fully licensed.</p>

              <div className="space-y-5">
                {orderedVendorCategories.map((category) => (
                  <div key={category}>
                    <div className="mb-2 flex items-center gap-2">
                      <VendorIcon category={category} />
                      <h3 className="text-sm font-medium text-gray-900">{category}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {vendorsByCategory.get(category)!.map((v) => (
                        <a
                          key={v.name}
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-rose-200"
                        >
                          {v.name}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-xs text-gray-400">{fieldMuseum.vendorsNote}</p>
            </section>

            <Divider />

            {/* Location — same embed/link pattern as Marchetti/LondonHouse and the real
                production VenueMap component (dewwey.com/venues). */}
            <section id="location">
              <SectionHeading title="Location" />
              <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
                <iframe
                  title={`Map of ${fieldMuseum.name}`}
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(fieldMuseum.address)}&z=15&output=embed`}
                  className="h-52 w-full border-0 sm:h-60"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-start gap-1.5 text-sm text-gray-500">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-gray-400" />
                  {fieldMuseum.address}
                </p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fieldMuseum.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-sm font-medium text-rose-500 transition-colors hover:text-rose-600"
                >
                  Open in Google Maps →
                </a>
              </div>
            </section>

            <Divider />

            {/* Grounding footer */}
            <section className="rounded-2xl bg-gray-50 p-5 text-sm text-gray-500">
              <div className="inline-flex items-center gap-1.5">
                <Sparkles size={14} className="text-rose-400" />
                Sourced from {fieldMuseum.sourcePages.length} pages on{" "}
                <a href={fieldMuseum.website} target="_blank" rel="noopener noreferrer" className="text-rose-500 hover:text-rose-600">
                  fieldmuseum.org
                </a>{" "}
                · verified {fieldMuseum.lastVerified}.
              </div>
              <div className="mt-2 flex flex-wrap gap-3">
                {fieldMuseum.sourcePages.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="underline decoration-gray-300 hover:text-gray-700">
                    {url.replace("https://www.", "")}
                  </a>
                ))}
              </div>
            </section>
          </div>
        </InquiryProvider>
      </div>
    </div>
  );
}
