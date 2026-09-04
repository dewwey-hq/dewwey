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
  BedDouble,
  Camera,
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
  ArrowUpCircle,
  Sandwich,
  Church,
  SquarePlay,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { displayHeadingClassName, uiHeadingClassName } from "@/lib/typography";
import CategoryIcon from "@/app/components/CategoryIcon";
import { ResourceLightboxButton } from "../_shared/ResourceLightboxButton";
import { StickyActionBar } from "./StickyActionBar";
import { InquiryProvider, InquiryTriggerBox } from "./InquirySystem";
import { CostCalculator } from "./CostCalculator";
import { londonhouse } from "./data";

// LondonHouse's own YouTube channel video (see data.ts) — embeds via the standard
// youtube.com/embed/{id} player, same idea as Field Museum's Vimeo embed.
function youTubeEmbedUrl(watchUrl: string): string {
  const id = new URL(watchUrl).searchParams.get("v");
  return `https://www.youtube.com/embed/${id}?rel=0`;
}

export const metadata: Metadata = {
  title: `LondonHouse Chicago v2: venue concept preview | ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

// Per-item icons for What's Included, keyed by the short label (§2's restructured {label,
// detail} shape). "Coordinator" reuses Greenhouse Loft's exact icon for the same role; "Linens"
// reuses the Palette choice `galleria-marchetti-v4`'s own header comment already assumed this
// page used (§2's cross-venue icon/label consistency check).
const INCLUDED_ICONS: Record<string, LucideIcon> = {
  Tables: Table2,
  Chairs: Armchair,
  "Dance floor": Music,
  Stage: Mic2,
  Linens: Palette,
  "Wedding cake": Cake,
  Coordinator: UserCheck,
  "Banquet Captain": ClipboardCheck,
  "Complimentary suite": BedDouble,
  "Parent upgrades": ArrowUpCircle,
  "Room block": Tag,
};

const ADD_ON_ICONS: Record<string, LucideIcon> = {
  "Pre-reception snacks": Sandwich,
  "Late-night snacks": Sandwich,
  "Corkage fee": Wine,
  "On-site ceremony fee": Church,
};

// "setting" (not v1's "indoorOutdoor") matches the rest of the golden set (Greenhouse Loft,
// Geraghty, Marchetti v4) — golden-set-template.md §3.
const QUICK_FACT_ICONS = {
  guests: Users,
  setting: House,
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

function SectionHeading({
  title,
  subtitle,
  id,
  actions,
}: {
  title: string;
  subtitle?: string;
  id?: string;
  actions?: ReactNode;
}) {
  return (
    <div id={id} className="mb-4 flex flex-wrap items-start justify-between gap-3 scroll-mt-20">
      <div>
        <h2 className={`text-xl leading-snug text-gray-900 ${uiHeadingClassName}`}>{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

function Divider() {
  return <div className="my-6 border-t border-black/[0.06]" />;
}

export default function LondonHouseChicagoV2ConceptPage() {
  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="mx-auto mb-3 max-w-5xl px-4 text-center text-xs text-gray-500">
        Concept preview v2. Same underlying venue data as v1, brought up to
        golden-set-template.md&apos;s locked format (canonical section order, pill-style Policies
        rows, bare-row FAQs, per-item Add-ons cards, grouped What&apos;s Included, Food/Bar
        pills, a &quot;Taxes&quot; group in the calculator). Compare:{" "}
        <Link href="/concept/londonhouse-chicago" className="underline hover:text-gray-800">
          v1
        </Link>{" "}
        ·{" "}
        <Link href="/concept/galleria-marchetti-v4" className="underline hover:text-gray-800">
          Galleria Marchetti
        </Link>{" "}
        ·{" "}
        <Link href="/concept/greenhouse-loft" className="underline hover:text-gray-800">
          Greenhouse Loft
        </Link>{" "}
        ·{" "}
        <Link href="/concept/geraghty" className="underline hover:text-gray-800">
          Geraghty
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

            {/* About — the brochure stays here (§2's placement-by-topic exception: a document
                broad enough that no single later section is a clean topical match). The
                wedding video moved to Spaces below, since it's a "what does this look like"
                resource, not a broad consolidated document. */}
            <div>
              <SectionHeading
                title="About"
                actions={
                  // feedback 2026-08-27: resource links default to an in-page lightbox instead
                  // of a new tab (see ResourceLightboxButton). LondonHouse's own domain serves
                  // this PDF with no X-Frame-Options header (checked via curl 2026-08-27), so it
                  // embeds cleanly — unlike Marchetti's brochure, which is blocked.
                  <ResourceLightboxButton
                    label="Brochure"
                    icon={<FileText size={13} className="text-rose-400" />}
                    title="LondonHouse Chicago — Wedding Brochure"
                    embedSrc={londonhouse.brochureUrl}
                  />
                }
              />
              <p className="text-[15px] leading-[1.65] text-gray-600">{londonhouse.about}</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {londonhouse.quickFacts.map((f) => {
                const Icon = QUICK_FACT_ICONS[f.icon as keyof typeof QUICK_FACT_ICONS];
                return (
                  <span key={f.label} className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3.5 py-2 text-sm text-gray-700">
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
            <section id="photos">
              <SectionHeading title="Photos" />
              <div className="grid grid-cols-3 gap-2">
                {londonhouse.photos.map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt={londonhouse.name} className="aspect-square w-full rounded-xl object-cover" />
                ))}
              </div>
            </section>

            <Divider />

            <section id="spaces">
              <SectionHeading
                title="Spaces"
                actions={
                  <>
                    <ResourceLightboxButton
                      label="Floor plan"
                      icon={<FileText size={13} className="text-rose-400" />}
                      title="LondonHouse Chicago — Capacity Chart"
                      embedSrc={londonhouse.capacityChartUrl}
                    />
                    <ResourceLightboxButton
                      label="Video"
                      icon={<SquarePlay size={13} className="text-rose-400" />}
                      title="LondonHouse Wedding"
                      embedSrc={youTubeEmbedUrl(londonhouse.youtubeUrl)}
                      href={londonhouse.youtubeUrl}
                      openLabel="Watch on YouTube"
                      frame="video"
                    />
                  </>
                }
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

            {/* Food & Beverage — feedback 2026-08-27 (round 1): the old Food/Bar prose
                paragraphs were redundant with the package cards right below, so they're gone.
                Round 2 briefly split Food/Bar back into subsections with a BYO pill to surface
                the corkage-fee carve-out, but round 3 reverted that as too heavy for what's a
                minor caveat — back to one plain pill row (All-Inclusive, In-house), with the
                corkage nuance as a small caption underneath, same weight/format as
                horsDoeuvresNote below (not a full prose paragraph). */}
            <section id="food-beverage">
              <SectionHeading
                title="Food & Beverage"
                actions={
                  <ResourceLightboxButton
                    label="Wedding menu"
                    icon={<FileText size={13} className="text-rose-400" />}
                    title="LondonHouse Chicago — Wedding Menu"
                    embedSrc={londonhouse.weddingMenuUrl}
                  />
                }
              />

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3 py-1 text-xs font-medium text-gray-700">All-Inclusive</span>
                <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">In-house</span>
              </div>
              <p className="mt-2 text-xs text-gray-400">{londonhouse.pricing.corkageNote}</p>

              <div className="mt-6 grid gap-5 sm:grid-cols-3">
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

            {/* What's Included — regrouped into label+detail rows under small subcategories
                (§2, Greenhouse Loft's fix), instead of v1's three ungrouped flat lists of bare
                labels. See data.ts header for the label standardization this pass made. */}
            <section id="whats-included">
              <SectionHeading title="What's Included" subtitle="Bundled into every package, regardless of tier." />
              <div className="rounded-2xl border border-black/[0.06] p-5">
                <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                  {londonhouse.sharedIncludes.map((group) => (
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

            {/* Add-ons & extras — per-item cards (§2, Field Museum/Greenhouse Loft shape)
                instead of v1's mixed chip-row + prose-paragraph layout. Each of these is one
                discrete real thing, not a menu of tiers, so a card is the right shape per §2's
                axis-counting rule. The ceremony fee names its own condition ("On-site ceremony
                fee") rather than leaving it as a bare, unlabeled line item. */}
            <section id="add-ons">
              <SectionHeading title="Add-ons & extras" />
              <div className="grid gap-4 sm:grid-cols-2">
                {londonhouse.addOns.map((a) => {
                  const Icon = ADD_ON_ICONS[a.name] ?? Sparkles;
                  return (
                    <div key={a.name} className="flex items-start gap-3 rounded-2xl border border-black/[0.06] p-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fdf8f5]">
                        <Icon size={15} className="text-rose-400" />
                      </div>
                      <div>
                        <h4 className={`text-sm text-gray-900 ${uiHeadingClassName}`}>{a.name}</h4>
                        <p className="mt-0.5 text-base font-semibold text-gray-900">{a.price}</p>
                        <p className="mt-1 text-xs text-gray-500">{a.blurb}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <Divider />

            {/* Cost Estimate — moved above Policies (§1's canonical order; v1 had it below). */}
            <section id="calculator">
              <SectionHeading title="Cost Estimate" />
              <CostCalculator />
            </section>

            <Divider />

            {/* Policies — value shown as a small pill so the answer is scannable at a glance,
                with an optional smaller detail line below only where the pill alone doesn't
                cover a real nuance (§2, Greenhouse Loft's fix) — instead of v1's plain
                left/right text row. */}
            <section id="policies">
              <SectionHeading title="Policies" />
              <div className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06]">
                {londonhouse.policies.map((p) => (
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

            {/* FAQs — bare full-width rows with their own bottom rule and a right-side chevron
                (§2, Greenhouse Loft's fix), no outer bordered box — instead of v1's boxed-card-
                with-left-chevron look. */}
            <section id="faqs">
              <SectionHeading title="Frequently asked questions" />

              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Questions every couple asks</p>
              <div className="mb-6 border-t border-black/[0.08]">
                {londonhouse.standardFaqs.map((f) => (
                  <details key={f.question} className="group border-b border-black/[0.08] py-3">
                    <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-gray-900 ${uiHeadingClassName}`}>
                      {f.question}
                      <ChevronDown size={16} className="shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-2 text-sm leading-[1.6] text-gray-600">{f.answer}</p>
                  </details>
                ))}
              </div>

              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">From LondonHouse&apos;s site</p>
              <p className="mb-2 text-xs text-gray-400">{londonhouse.faqCoverageNote}</p>
              <div className="border-t border-black/[0.08]">
                {londonhouse.faqs.map((f) => (
                  <details key={f.question} className="group border-b border-black/[0.08] py-3">
                    <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-gray-900 ${uiHeadingClassName}`}>
                      {f.question}
                      <ChevronDown size={16} className="shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-2 text-sm leading-[1.6] text-gray-600">{f.answer}</p>
                    {f.answerNote && <p className="mt-1.5 text-xs italic text-amber-700">{f.answerNote}</p>}
                  </details>
                ))}
              </div>
            </section>

            <Divider />

            {/* Vendors section still omitted (§4): only one real named vendor exists
                (Bittersweet Bakery, wedding cake) — below the ≥2-real-names bar. Data stays in
                londonhouse.preferredVendors (data.ts) in case a future pass has more to show.

                Location — same embed/link pattern as the rest of the golden set: Google Maps
                embed by address, address line, "Open in Google Maps" link. */}
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
