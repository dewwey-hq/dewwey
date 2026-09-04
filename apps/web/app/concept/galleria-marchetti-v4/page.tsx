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
  AirVent,
  Palette,
  BedDouble,
  Martini,
  ChefHat,
  Moon,
  Sparkles,
  ChevronDown,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { displayHeadingClassName, uiHeadingClassName } from "@/lib/typography";
import CategoryIcon from "@/app/components/CategoryIcon";
import { RealWeddingDeck } from "./RealWeddingDeck";
import { VendorCategoryList } from "./VendorCategoryList";
import { StickyActionBar } from "./StickyActionBar";
import { InquiryProvider, InquiryTriggerBox } from "./InquirySystem";
import { CostCalculator } from "./CostCalculator";
import { FloorPlanButton } from "./FloorPlanViewer";
import { marchetti } from "./data";

export const metadata: Metadata = {
  title: `Galleria Marchetti v4: venue concept preview | ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

function money(n: number): string {
  return `$${n.toLocaleString()}`;
}

// "setting" (not v3's "indoorOutdoor") and the House glyph match the rest of the golden set
// (Greenhouse Loft, Geraghty) — golden-set-template.md §3. No 5th "climate" pill in v4 (see
// data.ts's quickFacts comment) — Heating & A/C moved to What's Included instead.
const QUICK_FACT_ICONS = {
  guests: Users,
  setting: House,
  catering: UtensilsCrossed,
  bar: Wine,
} as const;

// Per-item icons for What's Included, keyed by the short label — falls back to a generic
// sparkle icon (golden-set-template.md §2) rather than forcing a literal icon for everything.
// All three icons matched to precedent (feedback 2026-08-26: keep icons consistent venue to
// venue): AirVent for "Heating & A/C" is Greenhouse Loft's exact icon (Thermometer was this
// page's own invention); Palette for "Linens" matches LondonHouse's icon for its own linen
// inclusion; BedDouble for "Bridal suite" is Greenhouse Loft's exact icon for its own item of
// the same name.
const INCLUDED_ICONS: Record<string, LucideIcon> = {
  "Heating & A/C": AirVent,
  Linens: Palette,
  "Bridal suite": BedDouble,
};

// Icons for the Food & beverage experience cards (2026-08-26, feedback: "align those better to
// traditional formatting" — matching the icon-in-a-circle treatment used everywhere else on this
// page, e.g. What's Included). Picked for direct semantic fit: Martini for an aperitivo hour,
// ChefHat for chef-attended stations, Moon for late-night.
const EXPERIENCE_ICONS: Record<string, LucideIcon> = {
  "Garden Aperitivo Hour": Martini,
  "Chef Experiences": ChefHat,
  "Late Night Experiences": Moon,
};

// Inlined (not next/image) so `currentColor` inherits the surrounding text color — an
// externally-referenced <img>/next/image SVG can't pick up currentColor from the page,
// which is why this rendered solid black/"thick" next to the thin gray lucide icons before.
function InstagramGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
    </svg>
  );
}

// `actions` slot (not v3's `resources` array) matches the current SectionHeading shape used by
// Greenhouse Loft/Geraghty — Marchetti has no PDF/resource links to put there, but keeping the
// same signature avoids a bespoke component shape for this one page.
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

export default function GalleriaMarchettiV4Page() {
  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="mx-auto mb-3 max-w-5xl px-4 text-center text-xs text-gray-500">
        Concept preview v4. Same underlying venue data as v3, brought up to
        golden-set-template.md&apos;s locked format (canonical section order, pill-style Policies
        rows, bare-row FAQs, fixed vendor-category icons, two newly-sourced Policies facts).
        Compare:{" "}
        <Link href="/concept/galleria-marchetti-v3" className="underline hover:text-gray-800">
          v3
        </Link>{" "}
        ·{" "}
        <Link href="/concept/galleria-marchetti-v2" className="underline hover:text-gray-800">
          v2
        </Link>{" "}
        ·{" "}
        <Link href="/concept/galleria-marchetti" className="underline hover:text-gray-800">
          v1
        </Link>{" "}
        ·{" "}
        <Link href="/concept/geraghty" className="underline hover:text-gray-800">
          Geraghty
        </Link>{" "}
        ·{" "}
        <Link href="/concept/greenhouse-loft" className="underline hover:text-gray-800">
          Greenhouse Loft
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

      {/* Modal-chrome card — mimics the real venue popup, just wider, since this route can't
          literally overlay /venues without wiring into VenuesClient's client state. */}
      <div className="relative mx-auto max-w-5xl rounded-3xl bg-white shadow-xl">
        {/* overflow-hidden was here before (to clip corners) but `overflow` on any ancestor
            breaks `position: sticky` in browsers, which is why the bar wasn't sticking. */}
        {/* Shared modal instance — both the header trigger box and the sticky-bar CTA open
            the same overlay, instead of the real app's in-place-expanding panel (which is
            what caused the layout jump/weird spacing next to the header). */}
        <InquiryProvider>
        <StickyActionBar name={marchetti.name} />

        <div className="px-5 py-6 sm:px-8">
          {/* Header — matches the real modal's hero: colorful category icon to the left,
              text stacked to the right. Inquiry panel sits alongside it (Airbnb's
              price-card-next-to-photos pattern) so the primary action is visible on first
              load, no scrolling required — the sticky bar below just keeps it reachable
              once this row scrolls out of view. */}
          {/* Centering the whole (natural-height) icon+text block on the outer row — not
              stretching it — so it balances against the taller inquiry box beside it without
              inflating the icon's own size (self-stretch on the icon was the bug last time:
              stretching the row stretched the icon box taller too, not just the text). */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-stretch gap-4">
              <CategoryIcon category="venue" primaryType="event_venue" large />
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-rose-500">{marchetti.categoryLabel}</p>
                <h1 id="venue-name-heading" className={`text-2xl leading-tight text-gray-900 sm:text-3xl ${displayHeadingClassName}`}>{marchetti.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                  <span className="inline-flex items-center gap-1">
                    <Star size={14} className="fill-rose-400 text-rose-400" />
                    <span className="font-medium text-gray-800">{marchetti.rating}</span>
                    <span className="text-gray-400">({marchetti.reviewCount} reviews)</span>
                  </span>
                  <a href={marchetti.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800">
                    <ExternalLink size={13} />
                    Website
                  </a>
                  <a href={marchetti.instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-gray-500 hover:text-gray-800" aria-label="Instagram">
                    <InstagramGlyph size={14} />
                  </a>
                  <span className="inline-flex items-center gap-1 text-gray-500">
                    <MapPin size={13} />
                    {marchetti.address}
                  </span>
                </div>
              </div>
            </div>
            <div className="w-full shrink-0 sm:w-64">
              <InquiryTriggerBox />
            </div>
          </div>

          <Divider />

          {/* About — same section-heading treatment as Spaces, Policies, etc. Brochure button
              moved here from Food & Beverage (feedback 2026-08-26: "maybe we put the wedding
              brochure in about section") — it's the first section on the page, so this is where
              a reader can grab the whole document before diving into any one topic, rather than
              only discovering it once they scroll to Food & Beverage.

              Stays a plain new-tab link, not the shared in-page lightbox the rest of the golden
              set is converting resource links to (feedback 2026-08-27, applied first on
              LondonHouse/Greenhouse Loft): framerusercontent.com serves this PDF with
              `x-frame-options: DENY` (checked via `curl -I`, 2026-08-27), so it can't be framed
              at all — same class of embeddability gap as Field Museum's bot-walled Vimeo and
              Diamond Garden's Access-Denied Wix tour (see golden-set-template.md §2). */}
          <div>
            <SectionHeading
              title="About"
              actions={
                <a
                  href={marchetti.brochureUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50"
                >
                  <FileText size={13} className="text-rose-400" />
                  Brochure
                </a>
              }
            />
            <p className="text-[15px] leading-[1.65] text-gray-600">{marchetti.about}</p>
          </div>

          {/* Quick facts — Guests, Indoor & Outdoor, Catering & Bar, Heating & A/C */}
          <div className="mt-4 flex flex-wrap gap-2">
            {marchetti.quickFacts.map((f) => {
              const Icon = QUICK_FACT_ICONS[f.icon as keyof typeof QUICK_FACT_ICONS];
              return (
                <span key={f.label} className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3.5 py-2 text-sm text-gray-700" title={f.note}>
                  <Icon size={14} className="shrink-0 text-rose-400" />
                  {f.label}
                </span>
              );
            })}
          </div>

          {/* Real weddings — same StackCard/weddingStacks deck as the Vendors section below,
              in place of the live app's grid-of-thumbnails carousel. "View fullscreen" opens
              the real production lightbox (WeddingPostLightbox), so full swipe/keyboard/
              caption functionality is unchanged from what the live app offers.
              Tinted band (the app's existing #fdf8f5 accent, already used for quick-fact pills
              and stat boxes — big background fills use this tone elsewhere, rose is reserved
              for small accents, so a rose band would've been a new pattern) so the white cards
              have something to pop against, rather than sitting on the same white page
              background as everything else. No divider lines above/below — the band itself is
              the section boundary, margin-only spacing on both sides. */}
          <div className="my-6 rounded-2xl bg-[#fdf8f5] px-3 py-3 sm:px-4">
            <RealWeddingDeck />
          </div>

          {/* Photos — moved here from the bottom of the page (v4, 2026-08-26): the locked
              canonical order (golden-set-template.md §1) puts Photos right after the wedding
              stack and before Space(s) whenever a venue has real IG wedding content, same as
              Geraghty. v3 had this section after FAQs/Vendors, which was drift from when it was
              built, not an intentional deviation. */}
          <section id="photos">
            <SectionHeading title="Photos" />
            <div className="grid grid-cols-3 gap-2">
              {marchetti.photos.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={marchetti.name} className="aspect-square w-full rounded-xl object-cover" />
              ))}
            </div>
          </section>

          <Divider />

          {/* Spaces — floor plans stay at the space-card level (per-space lightbox), not a
              section-heading resource link, since each space has its own distinct floor plan
              images rather than one shared PDF. */}
          <section id="spaces" className="mt-6">
            <SectionHeading title="Spaces" />
            <p className="mb-5 text-sm text-gray-500">
              Prefer the whole venue? Book both spaces together:{" "}
              {marchetti.entireVenueFees.map((f, i) => (
                <span key={f.day}>
                  {i > 0 ? " · " : ""}
                  {f.day} {money(f.amount)}
                </span>
              ))}
              .
            </p>

            <div className="grid gap-5 sm:grid-cols-2">
              {marchetti.spaces.map((space) => (
                <div key={space.name} className="rounded-2xl border border-black/[0.06] p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{space.name}</h3>
                      <p className="text-sm text-gray-500">
                        {space.sqFt.toLocaleString()} sq ft
                        <span className="text-gray-300"> · </span>
                        {space.structureLabel}
                      </p>
                    </div>
                    <FloorPlanButton spaceName={space.name} floorPlans={space.floorPlans} />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="rounded-xl bg-[#fdf8f5] py-2">
                      <div className="font-semibold text-gray-900">{space.capacity.seatedDining}</div>
                      <div className="text-[11px] leading-tight text-gray-500">{marchetti.capacityLabels.seatedDining}</div>
                    </div>
                    <div className="rounded-xl bg-[#fdf8f5] py-2">
                      <div className="font-semibold text-gray-900">{space.capacity.seatedWithDance}</div>
                      <div className="text-[11px] leading-tight text-gray-500">{marchetti.capacityLabels.seatedWithDance}</div>
                    </div>
                    <div className="rounded-xl bg-[#fdf8f5] py-2">
                      <div className="font-semibold text-gray-900">{space.capacity.standingReception}</div>
                      <div className="text-[11px] leading-tight text-gray-500">{marchetti.capacityLabels.standingReception}</div>
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-[1.6] text-gray-600">{space.description}</p>

                  <table className="mt-4 w-full text-sm text-gray-600">
                    <tbody>
                      {space.fees.map((fee) => (
                        <tr key={fee.day} className="border-t border-black/[0.04]">
                          <td className="py-1.5">{fee.day} rental</td>
                          <td className="py-1.5 text-right font-medium text-gray-900">{money(fee.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <p className="mt-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">Includes:</span> {space.includesSummary}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <Divider />

          {/* Food & Beverage — v1-style cards. Food/Bar pill added 2026-08-26 (follow-up to
              this v4 pass): §3 requires it on every venue and this page never rendered one —
              the quickFacts catering/bar notes already state "No outside caterer option" and
              "Bar in-house" with no BYO/à la carte mentioned anywhere, so it correctly shows a
              single All-Inclusive pill. Pill-only, no Food/Bar subheaders or prose (feedback
              2026-08-26: "no need to do food, bar and the new lines... redundant. concise clear
              simple intuitive") — Food and Bar share the identical value here and the package
              cards immediately below already carry the real per-tier bar detail, so a labeled
              breakdown with its own paragraph per side would just restate the same fact twice.
              Contrast with Greenhouse Loft's Food/Bar split, which is worth keeping: its two
              sides carry genuinely different real facts (a linked composting-guidelines PDF for
              catering, physical bar-space specifics for BYOB), not just the same pill restated. */}
          <section id="food-beverage">
            <SectionHeading title="Food & Beverage Packages" subtitle="Per-guest, on top of the venue rental fee above." />

            <div className="mb-1 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3 py-1 text-xs font-medium text-gray-700">All-Inclusive</span>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-3">
              {marchetti.packages.map((pkg) => (
                <div key={pkg.key} className="rounded-2xl border border-black/[0.06] p-5">
                  <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{pkg.name}</h3>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    ${pkg.perGuest}
                    <span className="text-sm font-normal text-gray-500"> /guest</span>
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{pkg.bar}</p>
                  <p className="text-[11px] text-gray-400">{pkg.barExamples}</p>
                  {pkg.inheritsFrom && <p className="mt-3 text-xs font-medium italic text-gray-400">Everything in {pkg.inheritsFrom}, plus:</p>}
                  <ul className={`space-y-1.5 text-sm text-gray-600 ${pkg.inheritsFrom ? "mt-1.5" : "mt-3"}`}>
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
            <p className="mt-3 text-sm text-gray-600">
              <span className="font-medium text-gray-800">{marchetti.additionalCosts.productionFeePercent}% service charge on food & beverage</span>, plus{" "}
              {marchetti.additionalCosts.salesTaxPercent}% sales tax.
            </p>
            {/* Bar Collections note moved below the cards (2026-08-26, feedback: "feels like a
                note underneath not on top/above the bar packages") — reads as a footnote on the
                bar names already shown per card, not a lead-in the reader has to get through
                before reaching the actual packages. */}
            <p className="mt-1.5 text-xs text-gray-400">{marchetti.barCollectionsNote}</p>
          </section>

          <Divider />

          {/* What's Included — added v4 (feedback 2026-08-26). Deliberately bare: only Heating &
              A/C (real for both spaces, moved here from the old 5th quickFacts pill — see
              data.ts) and floor-length linens (a real Argento inclusion that Oro/Platino also
              get, via "everything in Argento" — pulled out of that package card into its own
              section since it's genuinely shared, not package-specific). Flat list, no
              subcategory grouping — golden-set-template.md §2's grouping is for volume (6-8+
              items), not a mandatory shape for 2. */}
          <section id="whats-included">
            <SectionHeading title="What's Included" subtitle="Bundled into every package." />
            <div className="rounded-2xl border border-black/[0.06] p-5">
              <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                {marchetti.sharedIncludes.map((inc) => {
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
          </section>

          <Divider />

          {/* Add-ons — real experiences menu, condensed with example items. Categorized per
              user brainstorm 2026-08-14: "add-ons" (want) and "situational fees" (watch out
              for) are different mental modes for the reader. No situational fees known for
              this venue (unlike LondonHouse's corkage/ceremony fees), so that group is
              correctly omitted rather than shown empty. Production fee lives in Food &
              Beverage above — it's a food/bar cost, not something added on top of the base
              package. */}
          <section id="add-ons">
            <SectionHeading title="Add-ons & extras" subtitle="Beyond the base package." />

            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Food & beverage</p>
            {/* Icon-card treatment added (2026-08-26, feedback: "align those better to
                traditional formatting") — same icon-in-a-circle language as What's Included
                and Greenhouse Loft's own add-on cards, in place of the plain text-only card this
                had before. Each category keeps its own tier list (2 real price points per
                category, not 1), so the price line stays a small table-like list inside the
                card rather than one headline price the way a single-price add-on would show it. */}
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              {marchetti.experiences.map((exp) => {
                const Icon = EXPERIENCE_ICONS[exp.category] ?? Sparkles;
                return (
                  <div key={exp.category} className="flex items-start gap-3 rounded-2xl border border-black/[0.06] p-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fdf8f5]">
                      <Icon size={15} className="text-rose-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className={`text-sm text-gray-900 ${uiHeadingClassName}`}>{exp.category}</h4>
                      <p className="mt-0.5 text-base font-semibold text-gray-900">{exp.priceRange}</p>
                      {/* Extra top margin (2026-08-26, feedback: "add an enter or like line
                          above the elevate and price") gives the price its own line before the
                          blurb starts, instead of reading as one run-on block. Tiers condensed
                          to one bulleted line each (feedback: "signature moment (aperol/
                          limoncello spritz bar): $12/guest" — name, examples, price together)
                          instead of a name+price line with examples wrapped underneath. */}
                      <p className="mt-2.5 text-xs text-gray-500">{exp.blurb}</p>
                      <ul className="mt-2 list-disc space-y-1.5 pl-3.5 text-xs text-gray-600 marker:text-rose-300">
                        {exp.tiers.map((t) => (
                          <li key={t.name}>
                            <span className="font-medium text-gray-800">{t.name}</span>: {t.price} <span className="text-gray-400">({t.examples.join(", ")})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reverted to the original table (2026-08-26, feedback: "the space and rentals
                should be reverted... the table was best way of showing that") after a same-day
                detour through Greenhouse Loft's icon-card format. The category cell is
                row-spanned across its variants — real line items (dance floor color, bistro
                lights with/without greenery, Pavilion's swag-count options) read cleaner as
                scannable rows than as prose inside a card. A collapsed price range like
                "$1,400–$4,400" was actively misleading (it skipped two real price points), which
                is why this has an explicit variant column instead. */}
            <p className="mt-6 text-xs font-medium uppercase tracking-wide text-gray-400">Space & rentals</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm text-gray-600">
                <thead>
                  <tr className="text-xs text-gray-400">
                    <th className="pb-2 text-left font-normal">Rental</th>
                    <th className="pb-2 text-left font-normal">Option</th>
                    <th className="pb-2 text-right font-normal">La Pergola</th>
                    <th className="pb-2 text-right font-normal">The Pavilion</th>
                  </tr>
                </thead>
                <tbody>
                  {marchetti.enhancements.flatMap((e) =>
                    e.variants.map((v, i) => (
                      <tr key={`${e.category}-${v.name ?? "flat"}`} className="border-t border-black/[0.05]">
                        {i === 0 && (
                          <td className="py-2 align-top font-medium text-gray-800" rowSpan={e.variants.length}>
                            {e.category}
                            {e.note && <div className="mt-0.5 text-xs font-normal text-gray-400">{e.note}</div>}
                          </td>
                        )}
                        <td className="py-2">{v.name ?? "Flat rate"}</td>
                        <td className="py-2 text-right">{v.pergola}</td>
                        <td className="py-2 text-right">{v.pavilion}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <Divider />

          {/* Cost Estimate — grouped into Venue / Food & Beverage subtotals */}
          <section id="calculator">
            <SectionHeading title="Cost Estimate" />
            <CostCalculator />
          </section>

          <Divider />

          {/* Policies — 13-row canonical checklist (golden-set-template.md §2), each value shown
              as a pill so the answer is scannable at a glance, with an optional detail line only
              where the pill alone doesn't cover a real nuance. v3 rendered these as plain
              left/right text; this is the locked format first applied on Greenhouse Loft and
              confirmed again on Geraghty. Parking and Payment schedule are new real facts this
              pass (see data.ts header) — everything else is unchanged from v3. */}
          <section id="policies">
            <SectionHeading title="Policies" />
            <div className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06]">
              {marchetti.policies.map((p) => (
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

          {/* FAQs — full-width rows with their own bottom rule and a right-side chevron that
              rotates open, no outer bordered box (golden-set-template.md §2's locked format,
              deliberately distinct from Policies' bordered-pill look). v3 used a boxed card with
              a left-side chevron; this replaces it. */}
          <section id="faqs">
            <SectionHeading title="Frequently asked questions" />

            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Questions every couple asks</p>
            <div className="mb-6 border-t border-black/[0.08]">
              {marchetti.standardFaqs.map((f) => (
                <details key={f.question} className="group border-b border-black/[0.08] py-3">
                  <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-gray-900 ${uiHeadingClassName}`}>
                    {f.question}
                    <ChevronDown size={16} className="shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-2 text-sm leading-[1.6] text-gray-600">{f.answer}</p>
                </details>
              ))}
            </div>

            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">From Galleria Marchetti&apos;s site</p>
            <div className="border-t border-black/[0.08]">
              {marchetti.faqs.map((f) => (
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

          {/* Restructured per user feedback 2026-08-15: the real wedding stacks now live at
              the top of the page, so a second identical deck here was pure duplication. This
              section shifted purpose to a flat by-category directory — not "who worked
              together," just "who are the real options," combining weddingStacks' vendors and
              soloVendorCredits into one list per category (VendorCategoryList). Marchetti
              publishes no preferred/required vendor list at all (checked directly), so a
              "Preferred"/"Required" pill would invent a status that doesn't exist — the badge
              reads "Seen at real weddings" instead. */}
          <section id="vendors">
            <div className="mb-4 flex flex-wrap items-center gap-3 scroll-mt-20">
              <h2 className={`text-xl leading-snug text-gray-900 ${uiHeadingClassName}`}>Vendors</h2>
              <span className="inline-flex shrink-0 items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-500">
                Seen at real weddings
              </span>
            </div>
            <p className="mb-4 text-sm text-gray-500">Real vendors tagged in social media posts at this venue, not a curated list.</p>

            <VendorCategoryList />

            <p className="mt-5 text-xs text-gray-400">{marchetti.vendorsNote}</p>
          </section>

          <Divider />

          {/* Location — same embed/link pattern as the real production VenueMap component
              (dewwey.com/venues): Google Maps embed by address (no lat/lng in this concept's
              data, same text-query fallback the real component uses when coordinates aren't
              available), address line, "Open in Google Maps" link. */}
          <section id="location">
            <SectionHeading title="Location" />
            <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
              <iframe
                title={`Map of ${marchetti.name}`}
                src={`https://maps.google.com/maps?q=${encodeURIComponent(marchetti.address)}&z=15&output=embed`}
                className="h-52 w-full border-0 sm:h-60"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-start gap-1.5 text-sm text-gray-500">
                <MapPin size={15} className="mt-0.5 shrink-0 text-gray-400" />
                {marchetti.address}
              </p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(marchetti.address)}`}
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
              Sourced from {marchetti.sourcePages.length} pages on{" "}
              <a href={marchetti.website} target="_blank" rel="noopener noreferrer" className="text-rose-500 hover:text-rose-600">
                galleriamarchetti.com
              </a>{" "}
              · verified {marchetti.lastVerified}.
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {marchetti.sourcePages.map((url) => (
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
