import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  MapPin,
  Star,
  ExternalLink,
  Users,
  House,
  UtensilsCrossed,
  Wine,
  Sparkles,
  Rotate3d,
  Video,
  FileText,
  BedDouble,
  Church,
  Armchair,
  Music,
  SquareParking,
  Accessibility,
  type LucideIcon,
} from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { displayHeadingClassName, uiHeadingClassName } from "@/lib/typography";
import CategoryIcon from "@/app/components/CategoryIcon";
import { StickyActionBar } from "./StickyActionBar";
import { InquiryProvider, InquiryTriggerBox } from "./InquirySystem";
import { CostCalculator } from "./CostCalculator";
import { PageLightboxButton } from "./PageLightboxButton";
import { diamondGarden } from "./data";

export const metadata: Metadata = {
  title: `Diamond Garden Banquet Hall: venue concept preview | ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

const QUICK_FACT_ICONS = {
  guests: Users,
  setting: House,
  catering: UtensilsCrossed,
  bar: Wine,
} as const;

// Matches LondonHouse's per-item icon convention for What's Included, instead of one repeated
// Check icon for every row (feedback 2026-08-16: "use the londonhouse example with icons").
const INCLUDED_ICONS: Record<string, LucideIcon> = {
  "Private bridal suite": BedDouble,
  "Ceremony at no extra charge (within your rental hours)": Church,
  "New silver Chiavari chairs": Armchair,
  "Spacious dance floor": Music,
  "2 parking lots, 75+ spaces": SquareParking,
  "Handicap accessible": Accessibility,
};

function SectionHeading({ title, subtitle, id, actions }: { title: string; subtitle?: string; id?: string; actions?: ReactNode }) {
  return (
    <div id={id} className="mb-4 flex items-start justify-between gap-3 scroll-mt-20">
      <div>
        <h2 className={`text-xl leading-snug text-gray-900 ${uiHeadingClassName}`}>{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

function Divider() {
  return <div className="my-6 border-t border-black/[0.06]" />;
}

export default function DiamondGardenBanquetHallPage() {
  const { complete, hallOnly } = diamondGarden.packages;

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="mx-auto mb-3 max-w-5xl px-4 text-center text-xs text-gray-500">
        Concept preview: fourth golden-set venue, chosen for a new archetype (banquet hall) and to
        fill the one gap left in the vendor-policy spectrum: a genuinely open policy, not a
        restrictive one. See:{" "}
        <Link href="/concept/galleria-marchetti-v4" className="underline hover:text-gray-800">
          Galleria Marchetti
        </Link>{" "}
        ·{" "}
        <Link href="/concept/londonhouse-chicago" className="underline hover:text-gray-800">
          LondonHouse
        </Link>{" "}
        ·{" "}
        <Link href="/concept/field-museum" className="underline hover:text-gray-800">
          Field Museum
        </Link>{" "}
        ·{" "}
        <Link href="/venues" className="underline hover:text-gray-800">
          Back to live venues
        </Link>
      </div>

      <div className="relative mx-auto max-w-5xl rounded-3xl bg-white shadow-xl">
        <InquiryProvider>
          <StickyActionBar name={diamondGarden.name} />

          <div className="px-5 py-6 sm:px-8">
            {/* Header — no Instagram link: the venue's own site nav has one, but it points to
                the same URL as its Facebook link (a real bug on their end), so there's no real
                account to show rather than guessing a handle. */}
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-stretch gap-4">
                <CategoryIcon category="venue" primaryType="banquet_hall" large />
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-rose-500">{diamondGarden.categoryLabel}</p>
                  <h1 id="venue-name-heading" className={`text-2xl leading-tight text-gray-900 sm:text-3xl ${displayHeadingClassName}`}>{diamondGarden.name}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                    <span className="inline-flex items-center gap-1">
                      <Star size={14} className="fill-rose-400 text-rose-400" />
                      <span className="font-medium text-gray-800">{diamondGarden.rating}</span>
                      <span className="text-gray-400">({diamondGarden.reviewCount.toLocaleString()} reviews)</span>
                    </span>
                    <a href={diamondGarden.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800">
                      <ExternalLink size={13} />
                      Website
                    </a>
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <MapPin size={13} />
                      {diamondGarden.address}
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
              <p className="text-[15px] leading-[1.65] text-gray-600">{diamondGarden.about}</p>
            </div>

            {/* Quick facts */}
            <div className="mt-4 flex flex-wrap gap-2">
              {diamondGarden.quickFacts.map((f) => {
                const Icon = QUICK_FACT_ICONS[f.icon as keyof typeof QUICK_FACT_ICONS];
                return (
                  <span key={f.label} className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3.5 py-2 text-sm text-gray-700" title={f.note}>
                    <Icon size={14} className="shrink-0 text-rose-400" />
                    {f.label}
                  </span>
                );
              })}
            </div>

            {/* No Real Weddings / Vendor Stacks section — no real Instagram account exists for
                this venue (see header note). No Vendors section either — genuinely zero named
                vendors: the whole pitch is "bring anyone," so there's no list to show. */}

            <Divider />

            {/* Photos — bumped up here (feedback 2026-08-16: "since there's no instagram posts
                to embed we should bump the pictures underneath about and the space"), matching
                Field Museum's placement right after Quick facts. */}
            <section id="photos">
              <SectionHeading title="Photos" />
              <div className="grid grid-cols-3 gap-2">
                {diamondGarden.photos.map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt={diamondGarden.name} className="aspect-square w-full rounded-xl object-cover" />
                ))}
              </div>
            </section>

            <Divider />

            {/* Space — genuinely one room (confirmed directly: "Yes, we only have one room"),
                not multiple bookable spaces the way the DB's crawled facts suggest. Card widened
                and centered (~65% of the content width, not full width) instead of stretching
                edge-to-edge, since there's only one to show. Header row matches Field
                Museum/LondonHouse's per-space convention: name + sq ft stacked on the left,
                tour/video buttons right-aligned on the same row. Sq ft shown inline as "— sq ft
                (not stated)", same honesty as before, visible without needing the tooltip.
                "Virtual tour" uses Rotate3d (wanted a different icon than PlayCircle, which reads
                as video playback — reserved for "Wedding videos" instead). Tour/video buttons
                link out (same reasoning as Field Museum's video tours — no confirmed direct embed
                URL for either). Pricing intentionally lives in its own Pricing section below, not
                here. Capacity: three tiles for the same shape as every other golden-set venue
                (feedback 2026-08-16), but only "Seated (w/ dance floor)" carries a real number —
                the venue never actually labels any figure "seated," "cocktail," or "standing"
                anywhere; 268 is just the homepage's own general "up to 268 guests" claim, and the
                room has one fixed layout (dance floor permanently in place), so that's the one
                real stat. "Seated" and "Cocktail (standing)" shown unstated, same greyed "—"
                treatment as LondonHouse's own null capacity values, rather than reusing 268 under
                labels the venue never actually used. */}
            <section id="space">
              <SectionHeading title="The Space" />
              <div className="mx-auto max-w-2xl rounded-2xl border border-black/[0.06] p-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{diamondGarden.space.name}</h3>
                    <p className="text-sm text-gray-500">
                      {diamondGarden.space.sqFt ? (
                        `${diamondGarden.space.sqFt.toLocaleString()} sq ft`
                      ) : (
                        <span className="italic text-gray-400">— sq ft (not stated)</span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <PageLightboxButton
                      label="Virtual tour"
                      icon={<Rotate3d size={13} className="text-rose-400" />}
                      url={diamondGarden.space.tourUrl}
                      title="Diamond Garden — Virtual Tour"
                    />
                    <PageLightboxButton
                      label="Wedding videos"
                      icon={<Video size={13} className="text-gray-500" />}
                      url={diamondGarden.space.videosUrl}
                      title="Diamond Garden — Wedding Videos"
                      variant="secondary"
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
                  <div className="rounded-xl bg-gray-50 py-2.5">
                    <div className="font-semibold text-gray-300">—</div>
                    <div className="text-[11px] leading-tight text-gray-400">{diamondGarden.capacityLabels.seated}</div>
                  </div>
                  <div className="rounded-xl bg-[#fdf8f5] py-2.5">
                    <div className="font-semibold text-gray-900">{diamondGarden.space.capacity.seatedWithDance}</div>
                    <div className="text-[11px] leading-tight text-gray-500">{diamondGarden.capacityLabels.seatedWithDance}</div>
                  </div>
                  <div className="rounded-xl bg-gray-50 py-2.5">
                    <div className="font-semibold text-gray-300">—</div>
                    <div className="text-[11px] leading-tight text-gray-400">{diamondGarden.capacityLabels.cocktail}</div>
                  </div>
                </div>

                <p className="mt-3 text-sm leading-[1.6] text-gray-600">{diamondGarden.space.description}</p>
              </div>
            </section>

            <Divider />

            {/* Food & Beverage — restructured (feedback 2026-08-16) from two path-priced cards
                into substance-based Food/Bar prose, matching Field Museum's format. The
                booking-path breakdown with real numbers lives entirely in Pricing below; this
                section only answers "what are my food and bar choices." Bar packages are a real
                table instead of cards, reordered low-to-high. Pills: Bring Your Own (BYO), À la
                carte, All-Inclusive under both Food and Bar. All 4 real menu/bar-packages PDF
                links now live in the section heading's own action row (feedback 2026-08-17:
                "looks a little weird having them by food and then below them are the pills"),
                instead of split between the Food and Bar sub-headers. BYO written as a plain
                sentence, not a bold label. Bar's All-Inclusive sentence now names Standard Bar
                explicitly (feedback 2026-08-17), not just the champagne toast, since All-Inclusive
                genuinely includes both. Under Bar: table first, then the key facts below it —
                Food & beverage minimum, what's not included — matching LondonHouse's own "Food &
                beverage minimum:" bold-label pattern; this venue has no flat dollar minimum (a
                real difference from LondonHouse, not a gap), so that's stated plainly instead of
                copying the pattern where it doesn't fit. */}
            <section id="food-beverage">
              <SectionHeading
                title="Food & Beverage"
                actions={
                  <>
                    {diamondGarden.menuResources.map((r) => (
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
                  </>
                }
              />

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Food</p>
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3 py-1 text-xs font-medium text-gray-700">Bring Your Own (BYO)</span>
                  <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3 py-1 text-xs font-medium text-gray-700">À la carte</span>
                  <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3 py-1 text-xs font-medium text-gray-700">All-Inclusive</span>
                </div>
                <p className="text-sm leading-[1.6] text-gray-600">
                  This venue offers tiered food packages across three cuisines: American &amp; Italian, Mexican, and Puerto Rican. With {complete.name}, you&apos;ll receive buffet or plated service, wedding cake, and coffee service.
                </p>
                <p className="mt-2 text-sm leading-[1.6] text-gray-600">
                  For BYO, the venue provides a kitchen area with food warmers, a refrigerator, and a microwave.
                </p>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm text-gray-600">
                    <thead>
                      <tr className="text-xs text-gray-400">
                        <th className="pb-2 text-left font-normal">Package</th>
                        <th className="pb-2 pr-6 text-left font-normal">Includes</th>
                        <th className="pb-2 pr-6 text-left font-normal">Cost</th>
                        <th className="pb-2 text-left font-normal">Extras</th>
                      </tr>
                    </thead>
                    <tbody className="align-top">
                      {diamondGarden.foodMenus.map((m) => (
                        <tr key={m.cuisine} className="border-t border-black/[0.06]">
                          <td className="py-2 pr-3 font-medium text-gray-900">{m.cuisine}</td>
                          <td className="py-2 pr-6 text-xs text-gray-500">{m.includes}</td>
                          <td className="py-2 pr-6 text-xs text-gray-500">{m.cost}</td>
                          <td className="py-2 space-y-1 text-xs text-gray-500">
                            {m.extras.map((e) => (
                              <p key={e.label}>
                                <span className="font-medium text-gray-700">{e.label}:</span> {e.value}
                              </p>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="mb-1.5 mt-5 text-xs font-medium uppercase tracking-wide text-gray-400">Bar</p>
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3 py-1 text-xs font-medium text-gray-700">Bring Your Own (BYO)</span>
                  <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3 py-1 text-xs font-medium text-gray-700">À la carte</span>
                  <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3 py-1 text-xs font-medium text-gray-700">All-Inclusive</span>
                </div>
                <p className="text-sm leading-[1.6] text-gray-600">
                  Bar packages allow either open bar, where you cover the cost upfront so guests drink free, or cash bar, where guests pay for their own drinks. {complete.name} includes Standard Bar for 4.5 hours and a champagne toast for the bridal party.
                </p>
                <p className="mt-2 text-sm leading-[1.6] text-gray-600">
                  For BYO, you&apos;re responsible for servicing your guests.
                </p>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm text-gray-600">
                    <thead>
                      <tr className="text-xs text-gray-400">
                        <th className="pb-2 text-left font-normal">Package</th>
                        <th className="pb-2 pr-6 text-left font-normal">Includes</th>
                        <th className="pb-2 text-right font-normal">Cost (4 or 5 hours)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diamondGarden.barPackages.map((b) => (
                        <tr key={b.name} className="border-t border-black/[0.05] align-top">
                          <td className="py-2 pr-3 font-medium text-gray-900">{b.name}</td>
                          <td className="py-2 pr-6 text-xs text-gray-500">
                            {b.includes}
                            {b.note ? <span className="block text-gray-400">{b.note}</span> : null}
                          </td>
                          <td className="py-2 text-right">{money(b.price4hr)} - {money(b.price5hr)}/guest</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="mt-3 text-sm text-gray-600">
                  <span className="font-medium text-gray-800">Food &amp; beverage minimum:</span> no flat dollar figure. {complete.name} requires {complete.minGuests.general} guests ({complete.minGuests.friday} Fridays, {complete.minGuests.sunday} Sundays), and bar packages above require {diamondGarden.barPackagesMinGuests} guests per tier. Tiered food packages have their own 100-guest minimum (see Add-ons &amp; extras).
                </p>
                <p className="mt-1.5 text-sm text-gray-600">
                  <span className="font-medium text-gray-800">Not included in package price:</span> {diamondGarden.barPackagesNote}
                </p>
              </div>
            </section>

            <Divider />

            {/* What's Included — venue-wide facts true regardless of which package you book,
                pulled out into their own section same as LondonHouse's "What's Included"
                (feedback 2026-08-15: match the other pages' format, don't bury this inside a
                package card). Ordered before Pricing to match the confirmed canonical section
                shape: About, Photos, Space, Food & Beverage, What's Included, Pricing, Add-ons,
                Cost Estimate, Policies, FAQs, Vendors, Location. Subtitle standardized to
                LondonHouse's own phrasing (feedback 2026-08-16: "bundled into every booking,
                regardless of tier or something clear concise and simple"), adapted from "tier" to
                "path" since this venue has booking paths, not package tiers. Per-item icons
                (INCLUDED_ICONS) instead of one repeated Check icon, same convention as
                LondonHouse. */}
            <section id="whats-included">
              <SectionHeading title="What's Included" subtitle="Bundled into every booking, regardless of path." />
              <div className="rounded-2xl border border-black/[0.06] p-5">
                <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {diamondGarden.sharedIncludes.map((inc) => {
                    const Icon = INCLUDED_ICONS[inc] ?? Sparkles;
                    return (
                      <div key={inc} className="flex items-center gap-2.5 text-sm text-gray-700">
                        <Icon size={16} className="shrink-0 text-rose-400" />
                        {inc}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <Divider />

            {/* Pricing — "what we know," deliberately separate from the Cost Estimate calculator
                below (feedback 2026-08-16: "pricing is what we know/pricing info and cost
                estimate is guiding by users... i dont want to give appearance of a quote").
                Relocated here from the Space section — this venue is one room but two full,
                independent pricing paths, which was never really a "space" fact. Now three real
                options, not two (feedback 2026-08-16) — the venue's own /build-your-own-package
                page only names two ("All-Inclusive/Complete Package" and "Hall Rental Only —
                DIY," confirmed directly, no third named/priced tier exists there), but Hall
                Rental Only can genuinely be paired with individually chosen food packages, bar
                packages, and add-ons instead of either fully bring-your-own or fully
                All-Inclusive — a real middle path, just not one the venue prices as a fixed
                total the way the other two are. Shown as a card with no number (honest about
                there being nothing fixed to show) rather than inventing an estimate. Hall Rental
                Only's and All-Inclusive's real inclusions moved into their cards here (out of
                Food & Beverage, which is now organized by food/bar substance instead of booking
                path). Day/season tables moved directly into each card (feedback 2026-08-17)
                instead of sitting in a separate grid below all three — Custom stays without one
                since there's no fixed pricing to show. The two season definitions are identical
                between Hall Rental Only and All-Inclusive, so stated once at the section level
                instead of repeated per card. All-Inclusive's guest minimum and Hall Rental Only's
                required-staff note both moved to the bottom of their cards (feedback 2026-08-17)
                in the same bold-label style as Food & Beverage's "Not included in package price,"
                instead of small text under the headline price. Subtitle removed (redundant with
                the Cost Estimate section right below). Headline prices shown as real ranges
                (off-season weekday through peak season Saturday) instead of one off-season
                weekday figure, since the card only ever showed the cheapest number before. Card
                titles renamed (feedback 2026-08-17) to plain-English "Venue-only" / "Venue + à la
                carte" / "All-Inclusive" — the real venue name ("Hall Rental Only") kept as a
                small subtitle under the first two so the real term isn't lost, just not leading. */}
            <section id="pricing">
              <SectionHeading title="Pricing" />
              <p className="text-sm leading-[1.6] text-gray-600">
                Three real ways to book: the venue alone with your own vendors, that same rental plus your own picks from the venue&apos;s food, bar, and add-on menus, or one all-in per-guest price with everything handled.
              </p>

              <div className="mt-4 grid gap-5 sm:grid-cols-3">
                <div className="rounded-2xl border border-black/[0.06] p-5">
                  <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>Venue-only</h3>
                  <p className="text-xs text-gray-400">{hallOnly.name}</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {money(hallOnly.pricing.offSeason.weekday)} - {money(hallOnly.pricing.peakSeason.saturday)}
                    <span className="text-sm font-normal text-gray-500"> flat</span>
                  </p>
                  <ul className="mt-3 space-y-1.5 text-sm text-gray-600">
                    {hallOnly.inclusions.map((inc) => (
                      <li key={inc} className="flex gap-2">
                        <span className="text-rose-400">·</span>
                        {inc}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs text-gray-600">
                      <thead>
                        <tr className="text-gray-400">
                          <th className="pb-1.5 text-left font-normal">Season</th>
                          <th className="pb-1.5 text-right font-normal">Weekday</th>
                          <th className="pb-1.5 text-right font-normal">Fri/Sun</th>
                          <th className="pb-1.5 text-right font-normal">Sat</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-black/[0.05]">
                          <td className="py-1">Off-season</td>
                          <td className="py-1 text-right">{money(hallOnly.pricing.offSeason.weekday)}</td>
                          <td className="py-1 text-right">{money(hallOnly.pricing.offSeason.fridaySunday)}</td>
                          <td className="py-1 text-right">{money(hallOnly.pricing.offSeason.saturday)}</td>
                        </tr>
                        <tr className="border-t border-black/[0.05]">
                          <td className="py-1">Peak season</td>
                          <td className="py-1 text-right">{money(hallOnly.pricing.peakSeason.weekday)}</td>
                          <td className="py-1 text-right">{money(hallOnly.pricing.peakSeason.fridaySunday)}</td>
                          <td className="py-1 text-right">{money(hallOnly.pricing.peakSeason.saturday)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-3 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">Plus required staff:</span> {money(hallOnly.requiredAddOns.pricePerRole)} each for a bartender per {hallOnly.requiredAddOns.bartenderPerGuests} guests, {hallOnly.requiredAddOns.otherRoles.join(", ").toLowerCase()}
                  </p>
                </div>

                <div className="rounded-2xl border border-black/[0.06] bg-[#fdf8f5] p-5">
                  <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>Venue + à la carte</h3>
                  <p className="text-xs text-gray-400">{hallOnly.name} + your pick of add-ons</p>
                  <p className="mt-3 text-sm leading-[1.6] text-gray-600">
                    Start from the Venue-only price above, then pick your own food packages, bar packages, and add-ons individually. Each is priced in Food &amp; Beverage and Add-ons &amp; extras below.
                  </p>
                </div>

                <div className="rounded-2xl border border-black/[0.06] p-5">
                  <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{complete.name}</h3>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {money(complete.pricing.offSeason.weekdayFriSun)} - {money(complete.pricing.peakSeason.saturday)}
                    <span className="text-sm font-normal text-gray-500"> /guest</span>
                  </p>
                  <div className="mt-3 space-y-3 text-sm text-gray-600">
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Food</p>
                      <ul className="space-y-1.5">
                        {complete.inclusionGroups.food.map((inc) => (
                          <li key={inc} className="flex gap-2">
                            <span className="text-rose-400">·</span>
                            {inc}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Bar</p>
                      <ul className="space-y-1.5">
                        {complete.inclusionGroups.bar.map((inc) => (
                          <li key={inc} className="flex gap-2">
                            <span className="text-rose-400">·</span>
                            {inc}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Setup &amp; staff</p>
                      <ul className="space-y-1.5">
                        {complete.inclusionGroups.setup.map((inc) => (
                          <li key={inc} className="flex gap-2">
                            <span className="text-rose-400">·</span>
                            {inc}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs text-gray-600">
                      <thead>
                        <tr className="text-gray-400">
                          <th className="pb-1.5 text-left font-normal">Season</th>
                          <th className="pb-1.5 text-right font-normal">Wkdy/Fri/Sun</th>
                          <th className="pb-1.5 text-right font-normal">Sat</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-black/[0.05]">
                          <td className="py-1">Off-season</td>
                          <td className="py-1 text-right">{money(complete.pricing.offSeason.weekdayFriSun)}</td>
                          <td className="py-1 text-right">{money(complete.pricing.offSeason.saturday)}</td>
                        </tr>
                        <tr className="border-t border-black/[0.05]">
                          <td className="py-1">Peak season</td>
                          <td className="py-1 text-right">{money(complete.pricing.peakSeason.weekdayFriSun)}</td>
                          <td className="py-1 text-right">{money(complete.pricing.peakSeason.saturday)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-3 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">Guest minimum:</span> {complete.minGuests.friday} Friday, {complete.minGuests.general} Saturday, {complete.minGuests.sunday} Sunday
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm text-gray-600">
                <span className="font-medium text-gray-800">Season:</span> off-season is {hallOnly.pricing.offSeason.months}; peak season is {hallOnly.pricing.peakSeason.months}.
              </p>
            </section>

            <Divider />

            {/* Add-ons & extras — rebuilt (2026-08-17) from the venue's own "Rental Add-Ons
                2024" PDF, read directly and linked below. Consolidated to 5 categories (feedback
                2026-08-17: "food and beverage add-ons, decoration add-ons, extra hours, staffing
                and service add-ons, lighting and video add-ons"), condensed with example items or
                a real table per category, not an exhaustive transcription — the source has 60+
                real line items across 2 pages. Food & beverage and Staffing & service render as
                real tables since their content is genuinely two-column (item, cost). */}
            <section id="add-ons">
              <SectionHeading title="Add-ons & extras" subtitle="Beyond the base packages." />
              <div className="mb-4 flex flex-wrap gap-2">
                {diamondGarden.addOnsResources.map((r) => (
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
              <div className="grid gap-4 sm:grid-cols-2">
                {diamondGarden.addOns.map((a) => (
                  <div key={a.category} className="rounded-2xl border border-black/[0.06] p-4">
                    <h4 className={`text-sm text-gray-900 ${uiHeadingClassName}`}>{a.category}</h4>
                    <p className="mt-1 text-xs text-gray-500">{a.blurb}</p>
                    {"items" in a && a.items ? (
                      <table className="mt-2 w-full text-xs text-gray-600">
                        <tbody>
                          {a.items.map((it) => (
                            <tr key={it.label} className="border-t border-black/[0.05] first:border-t-0">
                              <td className="py-1 pr-2">{it.label}</td>
                              <td className="py-1 text-right font-medium text-gray-700">{it.cost}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <ul className="mt-2 space-y-1 text-xs text-gray-600">
                        {a.examples.map((ex) => (
                          <li key={ex} className="flex gap-1.5">
                            <span className="text-rose-400">·</span>
                            {ex}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <Divider />

            {/* Cost Estimate */}
            <section id="calculator">
              <SectionHeading title="Cost Estimate" />
              <CostCalculator />
            </section>

            <Divider />

            {/* Policies */}
            <section id="policies">
              <SectionHeading title="Policies" />
              <div className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06]">
                {diamondGarden.policies.map((p) => (
                  <div key={p.label} className="flex items-start justify-between gap-4 px-4 py-3">
                    <span className={`text-sm ${uiHeadingClassName} text-gray-900`}>{p.label}</span>
                    <span className={`text-right text-sm ${p.stated ? "text-gray-600" : "italic text-gray-400"}`}>{p.value}</span>
                  </div>
                ))}
              </div>
            </section>

            <Divider />

            {/* FAQs — standard questions kept brief since the venue's own real FAQ (25
                questions) already covers the same ground in far more depth. */}
            <section id="faqs">
              <SectionHeading title="Frequently asked questions" />

              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Questions every couple asks</p>
              <div className="mb-6 divide-y divide-black/[0.06] rounded-xl border border-black/[0.06]">
                {diamondGarden.standardFaqs.map((f) => (
                  <details key={f.question} className="group px-4 py-3">
                    <summary className={`cursor-pointer list-none text-sm text-gray-900 ${uiHeadingClassName}`}>
                      <span className="mr-2 inline-block text-gray-300 transition-transform group-open:rotate-90">›</span>
                      {f.question}
                    </summary>
                    <p className="mt-2 pl-4 text-sm leading-[1.6] text-gray-600">{f.answer}</p>
                  </details>
                ))}
              </div>

              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">From Diamond Garden&apos;s site</p>
              <div className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.06]">
                {diamondGarden.faqs.map((f) => (
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

            {/* Location */}
            <section id="location">
              <SectionHeading title="Location" />
              <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
                <iframe
                  title={`Map of ${diamondGarden.name}`}
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(diamondGarden.address)}&z=15&output=embed`}
                  className="h-52 w-full border-0 sm:h-60"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-start gap-1.5 text-sm text-gray-500">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-gray-400" />
                  {diamondGarden.address}
                </p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(diamondGarden.address)}`}
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
                Sourced from {diamondGarden.sourcePages.length} pages on{" "}
                <a href={diamondGarden.website} target="_blank" rel="noopener noreferrer" className="text-rose-500 hover:text-rose-600">
                  diamondgardenhall.com
                </a>{" "}
                · verified {diamondGarden.lastVerified}.
              </div>
              <div className="mt-2 flex flex-wrap gap-3">
                {diamondGarden.sourcePages.map((url) => (
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
