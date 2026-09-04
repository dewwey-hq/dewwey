import type { Metadata } from "next";
import Link from "next/link";
import {
  MapPin,
  Star,
  ExternalLink,
  Users,
  House,
  UtensilsCrossed,
  Wine,
  BedDouble,
  Camera,
  Info,
  Sparkles,
  FileText,
  Tag,
  Table2,
  Armchair,
  Music,
  Mic2,
  Palette,
  Cake,
  UserCheck,
  ClipboardCheck,
  SquarePlay,
  type LucideIcon,
} from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { displayHeadingClassName, uiHeadingClassName } from "@/lib/typography";
import CategoryIcon from "@/app/components/CategoryIcon";
import { StickyActionBar } from "./StickyActionBar";
import { InquiryProvider, InquiryTriggerBox } from "./InquirySystem";
import { CostCalculator } from "./CostCalculator";
import { londonhouse } from "./data";

export const metadata: Metadata = {
  title: `LondonHouse Chicago: venue concept preview | ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

const INVENTORY_ICONS: Record<string, LucideIcon> = {
  Tables: Table2,
  "Hotel chairs": Armchair,
  "Dance floor": Music,
  "Stage for a band": Mic2,
  "BBJ linen (choice of 30 colors)": Palette,
  "Custom wedding cake from Bittersweet Bakery": Cake,
};

const SERVICE_ICONS: Record<string, LucideIcon> = {
  "Wedding coordinator": UserCheck,
  "Banquet Captain": ClipboardCheck,
};

const PERK_ICONS: Record<string, LucideIcon> = {
  "Complimentary suite": BedDouble,
  "Room block": Tag,
};

const QUICK_FACT_ICONS = {
  guests: Users,
  indoorOutdoor: House,
  catering: UtensilsCrossed,
  bar: Wine,
  hotel: BedDouble,
} as const;

function InstagramGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
    </svg>
  );
}

function SectionHeading({
  title,
  subtitle,
  id,
  resources,
}: {
  title: string;
  subtitle?: string;
  id?: string;
  resources?: { href: string; label: string; icon?: LucideIcon }[];
}) {
  return (
    <div id={id} className="mb-4 scroll-mt-20">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className={`text-xl leading-snug text-gray-900 ${uiHeadingClassName}`}>{title}</h2>
        {resources?.map((r) => (
          <ResourceLink key={r.label} href={r.href} label={r.label} icon={r.icon} />
        ))}
      </div>
      {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
    </div>
  );
}

function Divider() {
  return <div className="my-6 border-t border-black/[0.06]" />;
}

// "D2" from the swatch gallery: outline only, rectangular (not pill), rose border + rose
// text. Same icon, same size, everywhere now — only the label changes per resource.
function ResourceLink({ href, label, icon: Icon = FileText }: { href: string; label: string; icon?: LucideIcon }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3.5 py-2 text-sm font-medium text-rose-500 hover:bg-rose-50"
    >
      <Icon size={14} className="text-rose-400" />
      {label}
    </a>
  );
}

export default function LondonHouseChicagoConceptPage() {
  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="mx-auto mb-3 max-w-5xl px-4 text-center text-xs text-gray-500">
        Concept preview, second golden-set venue: hotel archetype, vs. Marchetti&apos;s loft/garden. Compare:{" "}
        <Link href="/concept/galleria-marchetti-v4" className="underline hover:text-gray-800">
          Galleria Marchetti
        </Link>{" "}
        ·{" "}
        <Link href="/concept/field-museum" className="underline hover:text-gray-800">
          Field Museum
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
          <StickyActionBar name={londonhouse.name} />

          <div className="px-5 py-6 sm:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-stretch gap-4">
                <CategoryIcon category="venue" primaryType="hotel" large />
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-rose-500">{londonhouse.categoryLabel}</p>
                  <h1 id="venue-name-heading" className={`text-2xl leading-tight text-gray-900 sm:text-3xl ${displayHeadingClassName}`}>{londonhouse.name}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                    <span className="inline-flex items-center gap-1" title={londonhouse.reviewCountNote}>
                      <Star size={14} className="fill-rose-400 text-rose-400" />
                      <span className="font-medium text-gray-800">{londonhouse.rating}</span>
                      <span className="text-gray-400">({londonhouse.reviewCount.toLocaleString()} reviews)</span>
                    </span>
                    <a href={londonhouse.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800">
                      <ExternalLink size={13} />
                      Website
                    </a>
                    <a href={londonhouse.instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-gray-500 hover:text-gray-800" aria-label="Instagram">
                      <InstagramGlyph size={14} />
                    </a>
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <MapPin size={13} />
                      {londonhouse.address}
                    </span>
                  </div>
                </div>
              </div>
              <div className="w-full shrink-0 sm:w-64">
                <InquiryTriggerBox />
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading
                title="About"
                resources={[
                  { href: londonhouse.brochureUrl, label: "Brochure" },
                  { href: londonhouse.youtubeUrl, label: "Video", icon: SquarePlay },
                ]}
              />
              <p className="text-[15px] leading-[1.65] text-gray-600">{londonhouse.about}</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {londonhouse.quickFacts.map((f) => {
                const Icon = QUICK_FACT_ICONS[f.icon as keyof typeof QUICK_FACT_ICONS];
                return (
                  <span key={f.label} className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3.5 py-2 text-sm text-gray-700" title={f.note}>
                    <Icon size={14} className="shrink-0 text-rose-400" />
                    {f.label}
                  </span>
                );
              })}
            </div>

            <Divider />

            {/* No real Instagram wedding posts for this venue (unlike Marchetti) — surface the
                real Google photos we do have up here instead, where users actually look for
                photos first, rather than burying them in an empty bottom section. */}
            <div className="grid grid-cols-3 gap-2">
              {londonhouse.photos.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={londonhouse.name} className="aspect-square w-full rounded-xl object-cover" />
              ))}
            </div>

            <Divider />

            <section id="spaces">
              <SectionHeading
                title="Spaces"
                resources={[{ href: londonhouse.capacityChartUrl, label: "Floor plan" }]}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                {londonhouse.spaces.map((space) => (
                  <div key={space.name} className="rounded-2xl border border-black/[0.06] p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{space.name}</h3>
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{space.level}</span>
                    </div>
                    <p className="text-sm text-gray-500">{space.sqFt.toLocaleString()} sq ft</p>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                      <div className="rounded-xl bg-[#fdf8f5] py-2">
                        <div className="font-semibold text-gray-900">{space.capacity.seatedDining}</div>
                        <div className="text-[11px] leading-tight text-gray-500">{londonhouse.capacityLabels.seatedDining}</div>
                      </div>
                      <div className="rounded-xl bg-gray-50 py-2">
                        <div className="font-semibold text-gray-300">—</div>
                        <div className="text-[11px] leading-tight text-gray-400">{londonhouse.capacityLabels.seatedWithDance}</div>
                      </div>
                      <div className="rounded-xl bg-[#fdf8f5] py-2">
                        <div className="font-semibold text-gray-900">{space.capacity.standingReception}</div>
                        <div className="text-[11px] leading-tight text-gray-500">{londonhouse.capacityLabels.standingReception}</div>
                      </div>
                    </div>
                    <p className="mt-1 flex items-center justify-end gap-1 text-right text-[11px] text-gray-400" title={space.capacitySourceNote}>
                      <Info size={11} />
                      two sources, see note
                    </p>

                    <p className="mt-3 text-sm leading-[1.6] text-gray-600">{space.description}</p>

                    <div className="mt-4 rounded-lg bg-[#fdf8f5] px-3 py-2 text-sm text-gray-700">
                      <span className="font-medium text-gray-900">Venue rental:</span> included in the per-guest package price, same rate regardless of room
                    </div>

                    <p className="mt-2 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">Includes:</span> {space.includesSummary}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <Camera size={18} className="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <p className={`text-sm text-amber-900 ${uiHeadingClassName}`}>
                    {londonhouse.notableSpot.name}: a photo spot, not a bookable room
                  </p>
                  <p className="mt-1 text-sm leading-[1.55] text-amber-900/90">{londonhouse.notableSpot.description}</p>
                </div>
              </div>
            </section>

            <Divider />

            <section id="food-beverage">
              <SectionHeading
                title="Food & Beverage Packages"
                subtitle="Per guest, plus fees below."
                resources={[{ href: londonhouse.weddingMenuUrl, label: "Wedding menu" }]}
              />
              <div className="grid gap-5 sm:grid-cols-3">
                {londonhouse.packages.map((pkg) => (
                  <div key={pkg.key} className="rounded-2xl border border-black/[0.06] p-5">
                    <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{pkg.name}</h3>
                    <p className="mt-1 text-2xl font-semibold text-gray-900">
                      ${pkg.perGuest}
                      <span className="text-sm font-normal text-gray-500"> /guest</span>
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{pkg.bar}</p>
                    <ul className="mt-3 space-y-1.5 text-sm text-gray-600">
                      {pkg.inclusions.map((inc) => (
                        <li key={inc} className="flex gap-2">
                          <span className="text-rose-400">·</span>
                          {inc}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-400">{londonhouse.horsDoeuvresNote}</p>

              <p className="mt-3 text-sm text-gray-600">
                <span className="font-medium text-gray-800">{londonhouse.pricing.serviceChargePercent}% service charge on food & beverage</span>, plus{" "}
                {londonhouse.pricing.salesTaxPercent}% sales tax.
              </p>
              <p className="mt-1.5 text-sm text-gray-600">
                <span className="font-medium text-gray-800">Food & beverage minimum:</span> {londonhouse.pricing.fbMinimum}
              </p>
            </section>

            <Divider />

            {/* Pulled out of Food & Beverage — none of this is actually about food/drink, it's
                venue-wide inclusions (physical + staffing) that happen to be bundled into
                every package. Filing it under F&B mislabeled it by association. */}
            <section id="whats-included">
              <SectionHeading title="What's Included" subtitle="Bundled into every package, regardless of tier." />
              <div className="rounded-2xl border border-black/[0.06] p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Physical items</p>
                <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
                  {londonhouse.includedInventory.map((item) => {
                    const Icon = INVENTORY_ICONS[item] ?? Sparkles;
                    return (
                      <div key={item} className="flex items-center gap-2.5 text-sm text-gray-700">
                        <Icon size={16} className="shrink-0 text-rose-400" />
                        {item}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-5 text-xs font-medium uppercase tracking-wide text-gray-400">Services</p>
                <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                  {londonhouse.includedServices.map((s) => {
                    const Icon = SERVICE_ICONS[s.name] ?? Sparkles;
                    return (
                      <div key={s.name} className="flex items-start gap-2.5 text-sm">
                        <Icon size={16} className="mt-0.5 shrink-0 text-rose-400" />
                        <div>
                          <p className="font-medium text-gray-800">{s.name}</p>
                          <p className="text-gray-500">{s.note}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-5 text-xs font-medium uppercase tracking-wide text-gray-400">Perks</p>
                <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                  {londonhouse.includedPerks.map((s) => {
                    const Icon = PERK_ICONS[s.name] ?? Sparkles;
                    return (
                      <div key={s.name} className="flex items-start gap-2.5 text-sm">
                        <Icon size={16} className="mt-0.5 shrink-0 text-rose-400" />
                        <div>
                          <p className="font-medium text-gray-800">{s.name}</p>
                          <p className="text-gray-500">{s.note}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <Divider />

            {/* Categorized per user brainstorm 2026-08-14: "add-ons" (want) and "situational
                fees" (watch out for) are different mental modes for the reader, so they get
                different visual treatment. No published space/rental add-ons for this venue
                (unlike Marchetti), so that group is correctly omitted rather than shown empty. */}
            <section id="add-ons">
              <SectionHeading title="Add-ons & extras" subtitle="Beyond the base package." />

              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Food & beverage</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {londonhouse.addOns.map((a) => (
                  <span key={a.name} className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-sm text-gray-700">
                    {a.name}: <span className="text-gray-400">{a.price}</span>
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-400">{londonhouse.addOnsNote}</p>

              <p className="mt-6 text-xs font-medium uppercase tracking-wide text-gray-400">Situational fees</p>
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-medium text-gray-800">Corkage fee:</span> {londonhouse.corkageFee}
              </p>
              <p className="mt-1.5 text-sm text-gray-600">
                <span className="font-medium text-gray-800">
                  Ceremony fee: ${londonhouse.pricing.ceremonyFee} (+{londonhouse.pricing.ceremonyFeeTaxPercent}% tax)
                </span>{" "}
                {londonhouse.pricing.ceremonyFeeNote}
              </p>
            </section>

            <Divider />

            <section id="policies">
              <SectionHeading title="Policies" />
              <div className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06]">
                {londonhouse.policies.map((p) => (
                  <div key={p.label} className="flex items-start justify-between gap-4 px-4 py-3">
                    <span className={`text-sm ${uiHeadingClassName} text-gray-900`}>{p.label}</span>
                    <span className={`text-right text-sm ${p.stated ? "text-gray-600" : "italic text-gray-400"}`}>{p.value}</span>
                  </div>
                ))}
              </div>
            </section>

            <Divider />

            <section id="calculator">
              <SectionHeading title="Cost Estimate" />
              <CostCalculator />
            </section>

            <Divider />

            <section id="faqs">
              <SectionHeading title="Frequently asked questions" />
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Questions every couple asks</p>
              <div className="mb-6 divide-y divide-black/[0.06] rounded-xl border border-black/[0.06]">
                {londonhouse.standardFaqs.map((f) => (
                  <details key={f.question} className="group px-4 py-3">
                    <summary className={`cursor-pointer list-none text-sm text-gray-900 ${uiHeadingClassName}`}>
                      <span className="mr-2 inline-block text-gray-300 transition-transform group-open:rotate-90">›</span>
                      {f.question}
                    </summary>
                    <p className="mt-2 pl-4 text-sm leading-[1.6] text-gray-600">{f.answer}</p>
                  </details>
                ))}
              </div>

              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">From LondonHouse&apos;s site</p>
              <p className="mb-2 text-xs text-gray-400">{londonhouse.faqCoverageNote}</p>
              <div className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.06]">
                {londonhouse.faqs.map((f) => (
                  <details key={f.question} className="group px-4 py-3">
                    <summary className={`cursor-pointer list-none text-sm text-gray-900 ${uiHeadingClassName}`}>
                      <span className="mr-2 inline-block text-gray-300 transition-transform group-open:rotate-90">›</span>
                      {f.question}
                    </summary>
                    <p className="mt-2 pl-4 text-sm leading-[1.6] text-gray-600">{f.answer}</p>
                    {f.answerNote && <p className="mt-1.5 pl-4 text-xs italic text-amber-700">{f.answerNote}</p>}
                  </details>
                ))}
              </div>
            </section>

            <Divider />

            {/* Vendors section omitted per user feedback 2026-08-15: only one real named
                vendor exists (Bittersweet Bakery, wedding cake) — the other three published
                categories (Music, Florals, AV) are all unnamed "ask directly" placeholders.
                A section that's 3/4 placeholder reads as thin rather than useful; the real
                cake relationship is still true, just not substantial enough on its own to
                justify a whole section. Data stays in londonhouse.preferredVendors (data.ts)
                in case a future venue page in this shape has more to show.

                Location — same embed/link pattern as Marchetti v3's Location section (and the
                real production VenueMap component on dewwey.com/venues): Google Maps embed by
                address (no lat/lng in this concept's data, same text-query fallback the real
                component uses when coordinates aren't available), address line, "Open in
                Google Maps" link. */}
            <section id="location">
              <SectionHeading title="Location" />
              <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
                <iframe
                  title={`Map of ${londonhouse.name}`}
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(londonhouse.address)}&z=15&output=embed`}
                  className="h-52 w-full border-0 sm:h-60"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-start gap-1.5 text-sm text-gray-500">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-gray-400" />
                  {londonhouse.address}
                </p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(londonhouse.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-sm font-medium text-rose-500 transition-colors hover:text-rose-600"
                >
                  Open in Google Maps →
                </a>
              </div>
            </section>

            <Divider />

            <section className="rounded-2xl bg-gray-50 p-5 text-sm text-gray-500">
              <div className="inline-flex items-center gap-1.5">
                <Sparkles size={14} className="text-rose-400" />
                Sourced from {londonhouse.sourcePages.length} pages/documents on{" "}
                <a href={londonhouse.website} target="_blank" rel="noopener noreferrer" className="text-rose-500 hover:text-rose-600">
                  londonhousechicago.com
                </a>{" "}
                · verified {londonhouse.lastVerified}.
              </div>
              <div className="mt-2 flex flex-wrap gap-3">
                {londonhouse.sourcePages.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="underline decoration-gray-300 hover:text-gray-700">
                    {url.replace("https://www.", "").replace("https://", "").replace("http://", "")}
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
