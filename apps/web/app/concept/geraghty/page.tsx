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
  ChevronDown,
  Shirt,
  SquareParking,
  Bath,
  DoorOpen,
  Table2,
  Armchair,
  GlassWater,
  Sofa,
  Lightbulb,
  Speaker,
  Layers,
  UserCheck,
  Trees,
  Blinds,
  type LucideIcon,
} from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { displayHeadingClassName, uiHeadingClassName } from "@/lib/typography";
import CategoryIcon from "@/app/components/CategoryIcon";
import { StickyActionBar } from "./StickyActionBar";
import { InquiryProvider, InquiryTriggerBox, AskAboutPricingButton } from "./InquirySystem";
import { PageLightboxButton } from "./PageLightboxButton";
import { FloorPlanButton } from "./FloorPlanViewer";
import { RealWeddingDeck } from "./RealWeddingDeck";
import { VendorCategoryList } from "./VendorCategoryList";
import { geraghty } from "./data";

export const metadata: Metadata = {
  title: `The Geraghty: venue concept preview | ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

function InstagramGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
    </svg>
  );
}

const QUICK_FACT_ICONS: Record<string, LucideIcon> = {
  guests: Users,
  setting: House,
  catering: UtensilsCrossed,
  bar: Wine,
};

// Per-item icons for What's Included, keyed by the short label — see golden-set-template.md §2.
const INCLUDED_ICONS: Record<string, LucideIcon> = {
  "Coat check": Shirt,
  Parking: SquareParking,
  Restrooms: Bath,
  "Green Room": DoorOpen,
  Tables: Table2,
  Chairs: Armchair,
  Bars: GlassWater,
  Lounge: Sofa,
  Lighting: Lightbulb,
  Sound: Speaker,
  Staging: Layers,
  "Sales Manager": UserCheck,
  Décor: Trees,
  Drape: Blinds,
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

export default function GeraghtyPage() {
  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="mx-auto mb-3 max-w-5xl px-4 text-center text-xs text-gray-500">
        Concept preview: sixth golden-set venue, chosen to re-verify a documented bug (a stored
        floor plan that was a gala one, not one of the venue&apos;s real wedding-labeled plans)
        and built around a real, second Wedding Stack venue. See:{" "}
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
          <StickyActionBar name={geraghty.name} />

          <div className="px-5 py-6 sm:px-8">
            {/* Header */}
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-stretch gap-4">
                <CategoryIcon category="venue" primaryType="event_venue" large />
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-rose-500">{geraghty.categoryLabel}</p>
                  <h1 id="venue-name-heading" className={`text-2xl leading-tight text-gray-900 sm:text-3xl ${displayHeadingClassName}`}>{geraghty.name}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                    <span className="inline-flex items-center gap-1">
                      <Star size={14} className="fill-rose-400 text-rose-400" />
                      <span className="font-medium text-gray-800">{geraghty.rating}</span>
                      <span className="text-gray-400">({geraghty.reviewCount.toLocaleString()} reviews)</span>
                    </span>
                    <a href={geraghty.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800">
                      <ExternalLink size={13} />
                      Website
                    </a>
                    <a href={geraghty.instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-gray-500 hover:text-gray-800" aria-label="Instagram">
                      <InstagramGlyph size={14} />
                    </a>
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <MapPin size={13} />
                      {geraghty.address}
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
              <p className="text-[15px] leading-[1.65] text-gray-600">{geraghty.about}</p>
            </div>

            {/* Quick facts */}
            <div className="mt-4 flex flex-wrap gap-2">
              {geraghty.quickFacts.map((f) => {
                const Icon = QUICK_FACT_ICONS[f.icon];
                return (
                  <span key={f.label} className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3.5 py-2 text-sm text-gray-700" title={f.note}>
                    <Icon size={14} className="shrink-0 text-rose-400" />
                    {f.label}
                  </span>
                );
              })}
            </div>

            {/* Wedding stack — real, venue-tagged wedding posts from the project's own graph
                pipeline (6 confirmed real weddings, 9 posts). Sits right after Quick facts,
                before Photos, per the locked canonical order. See data.ts header for how these 6
                were separated from 7 real corporate/gala posts the pipeline's `weddings` table
                had also swept in under this venue. */}
            <div className="-mx-5 mt-6 bg-[#fdf8f5] px-5 py-6 sm:-mx-8 sm:px-8">
              <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-gray-400">Real weddings at The Geraghty</p>
              <RealWeddingDeck />
            </div>

            <Divider />

            {/* Photos */}
            <section id="photos">
              <SectionHeading title="Photos" />
              <div className="grid grid-cols-3 gap-2">
                {geraghty.photos.map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt={geraghty.name} className="aspect-square w-full rounded-xl object-cover" />
                ))}
              </div>
            </section>

            <Divider />

            {/* Space — genuinely one open room, reconfigured per event, not multiple bookable
                spaces. Floor-plan button surfaces specifically the 2 real WEDDING-labeled plans
                (not the venue's gala/corporate ones) — the whole reason this venue is in the
                golden set, see data.ts header. Virtual tour links out (no confirmed embeddable
                tour found — same class of gap as Diamond Garden/Field Museum). Pricing folded in
                here, not a separate section, since nothing real exists to show — same pattern as
                Field Museum. */}
            <section id="space">
              <SectionHeading title="The Space" />
              <div className="mx-auto max-w-2xl rounded-2xl border border-black/[0.06] p-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{geraghty.space.name}</h3>
                    <p className="text-sm text-gray-500">
                      {geraghty.space.sqFt.toLocaleString()} sq ft · {geraghty.space.ceilingHeight} ceilings
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <FloorPlanButton spaceName={geraghty.space.name} floorPlans={geraghty.space.floorPlans} />
                    <PageLightboxButton
                      label="Virtual tour"
                      icon={<Rotate3d size={13} className="text-rose-400" />}
                      url={geraghty.space.tourUrl}
                      title="The Geraghty Virtual Tour"
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
                  <div className="rounded-xl bg-gray-50 py-2.5">
                    <div className="font-semibold text-gray-300">—</div>
                    <div className="text-[11px] leading-tight text-gray-400">{geraghty.capacityLabels.seated}</div>
                  </div>
                  <div className="rounded-xl bg-[#fdf8f5] py-2.5">
                    <div className="font-semibold text-gray-900">{geraghty.space.capacity.receptionAfterparty}</div>
                    <div className="text-[11px] leading-tight text-gray-500">{geraghty.capacityLabels.receptionAfterparty}</div>
                  </div>
                  <div className="rounded-xl bg-gray-50 py-2.5">
                    <div className="font-semibold text-gray-300">—</div>
                    <div className="text-[11px] leading-tight text-gray-400">{geraghty.capacityLabels.cocktail}</div>
                  </div>
                </div>

                <p className="mt-3 text-sm leading-[1.6] text-gray-600">{geraghty.space.description}</p>

                <div className="mt-4 rounded-xl bg-gray-50 p-3.5">
                  <p className="text-sm text-gray-600">The Geraghty doesn&apos;t publish rental fees. Pricing is quoted upon request.</p>
                  <AskAboutPricingButton />
                </div>
              </div>
            </section>

            <Divider />

            {/* Food & Beverage — catering is a real "preferred list," genuinely unclear whether
                exclusive (see data.ts header); bar is unambiguously closed. No packages/pricing
                to show, same shape as Field Museum. */}
            <section id="food-beverage">
              <SectionHeading title="Food & Beverage" />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Food</p>
                  <p className="text-sm leading-[1.6] text-gray-600">{geraghty.foodAndBeverage.food}</p>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Beverage</p>
                  <p className="text-sm leading-[1.6] text-gray-600">{geraghty.foodAndBeverage.beverage}</p>
                </div>
              </div>
            </section>

            <Divider />

            {/* What's Included — real, substantial, and genuinely different in character from
                every prior venue's: production/AV-heavy, not just tables and chairs. Shown
                despite there being only one booking path (no packages to share it across) since
                the list itself is real and substantial — see data.ts header. Grouped into labeled
                subcategories with label+detail rows (2026-08-26, golden-set-template.md §2's
                locked format, first applied on Greenhouse Loft) instead of one flat 13-item list
                with a single repeated checkmark. */}
            <section id="whats-included">
              <SectionHeading title="What's Included" subtitle="Bundled into every booking." />
              <div className="rounded-2xl border border-black/[0.06] p-5">
                <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                  {geraghty.sharedIncludes.map((group) => (
                    <div key={group.category}>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">{group.category}</p>
                      <div className="space-y-2.5">
                        {group.items.map((inc) => {
                          const Icon = INCLUDED_ICONS[inc.label] ?? Sparkles;
                          return (
                            <div key={inc.label} className="flex items-start gap-2.5 text-sm text-gray-700">
                              <Icon size={16} className="mt-0.5 shrink-0 text-rose-400" />
                              <span>
                                <span className="font-medium text-gray-900">{inc.label}:</span> {inc.detail}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <Divider />

            {/* Policies — value shown as a small pill so the answer is scannable at a glance,
                with an optional smaller detail line below only where the pill alone doesn't cover
                a real nuance (2026-08-26, golden-set-template.md §2's locked format). */}
            <section id="policies">
              <SectionHeading title="Policies" />
              <div className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06]">
                {geraghty.policies.map((p) => (
                  <div key={p.label} className="flex items-start justify-between gap-4 px-4 py-3">
                    <span className={`text-sm ${uiHeadingClassName} text-gray-900`}>{p.label}</span>
                    <span className="flex max-w-[60%] flex-col items-end gap-1">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          p.stated ? "bg-[#fdf8f5] text-gray-700" : "bg-gray-100 italic text-gray-400"
                        }`}
                      >
                        {p.value}
                      </span>
                      {p.detail ? <span className="text-left text-xs text-gray-500">{p.detail}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <Divider />

            {/* FAQs — line-underneath-and-caret rows (2026-08-26, golden-set-template.md §2's
                locked format), deliberately distinct from Policies' bordered-pill look: a
                full-width row per question with its own bottom rule and a chevron on the right
                that rotates open, no outer box. */}
            <section id="faqs">
              <SectionHeading title="Frequently asked questions" />

              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Questions every couple asks</p>
              <div className="mb-6 border-t border-black/[0.08]">
                {geraghty.standardFaqs.map((f) => (
                  <details key={f.question} className="group border-b border-black/[0.08] py-3">
                    <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-gray-900 ${uiHeadingClassName}`}>
                      {f.question}
                      <ChevronDown size={16} className="shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-2 text-sm leading-[1.6] text-gray-600">{f.answer}</p>
                  </details>
                ))}
              </div>

              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">From The Geraghty&apos;s site</p>
              <div className="border-t border-black/[0.08]">
                {geraghty.faqs.map((f) => (
                  <details key={f.question} className="group border-b border-black/[0.08] py-3">
                    <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-gray-900 ${uiHeadingClassName}`}>
                      {f.question}
                      <ChevronDown size={16} className="shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-2 text-sm leading-[1.6] text-gray-600">{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>

            <Divider />

            {/* Vendors — three parts: (1) the venue's 2 exclusive built-in partners, shown
                separately since they're not a couple's choice; (2) real, category-bucketed
                vendors pulled from the real wedding stack above (couple's-choice categories
                only); (3) the venue's own published preferred-caterer list, flagging which 2
                names are independently confirmed by a real wedding tag. See data.ts header for
                why catering is shown as "preferred," not "required" — no source states either. */}
            <section id="vendors">
              <SectionHeading title="Vendors" subtitle="Real vendors credited at real weddings here, plus the venue's own built-in and preferred partners." />

              <div className="mb-6 rounded-2xl border border-black/[0.06] bg-[#fdf8f5] p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">Built-in partners (not a couple's choice)</p>
                <div className="flex flex-wrap gap-3">
                  {geraghty.builtInPartners.map((p) => (
                    <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-black/[0.06] bg-white px-3.5 py-2.5 hover:border-rose-200">
                      <span className="block text-sm font-medium text-gray-900">{p.name}</span>
                      <span className="block text-xs text-gray-400">{p.role}</span>
                    </a>
                  ))}
                </div>
              </div>

              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Seen at real weddings here</p>
              <VendorCategoryList />

              <div className="mt-6">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">The venue's own preferred-caterer list</p>
                <div className="flex flex-wrap gap-2">
                  {geraghty.preferredCaterers.map((c) => (
                    <a
                      key={c.name}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-rose-200"
                    >
                      {c.name}
                      {c.seenAtRealWeddings ? <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-500">seen at real weddings</span> : null}
                    </a>
                  ))}
                </div>
              </div>
            </section>

            <Divider />

            {/* Location */}
            <section id="location">
              <SectionHeading title="Location" />
              <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
                <iframe
                  title={`Map of ${geraghty.name}`}
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(geraghty.address)}&z=15&output=embed`}
                  className="h-52 w-full border-0 sm:h-60"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-start gap-1.5 text-sm text-gray-500">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-gray-400" />
                  {geraghty.address}
                </p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(geraghty.address)}`}
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
                Sourced from {geraghty.sourcePages.length} pages on{" "}
                <a href={geraghty.website} target="_blank" rel="noopener noreferrer" className="text-rose-500 hover:text-rose-600">
                  thegeraghty.com
                </a>{" "}
                (plus the project&apos;s own real wedding-graph data) · verified {geraghty.lastVerified}.
              </div>
              <div className="mt-2 flex flex-wrap gap-3">
                {geraghty.sourcePages.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="underline decoration-gray-300 hover:text-gray-700">
                    {url.replace("https://", "")}
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
