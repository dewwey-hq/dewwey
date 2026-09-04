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
  Leaf,
  Sparkles,
  Rotate3d,
  Images,
  FileText,
  UserCheck,
  Music,
  Camera,
  Projector,
  SquareParking,
  Lamp,
  ShieldCheck,
  Shirt,
  Blinds,
  BedDouble,
  Table2,
  Armchair,
  GlassWater,
  CalendarClock,
  ChevronDown,
  Video,
  Broom,
  Accessibility,
  AirVent,
  type LucideIcon,
} from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { displayHeadingClassName, uiHeadingClassName } from "@/lib/typography";
import CategoryIcon from "@/app/components/CategoryIcon";
import { StickyActionBar } from "./StickyActionBar";
import { InquiryProvider, InquiryTriggerBox } from "./InquirySystem";
import { CostCalculator } from "./CostCalculator";
import { PageLightboxButton } from "./PageLightboxButton";
import { FloorPlansButton } from "./FloorPlansButton";
import { ResourceLightboxButton } from "../_shared/ResourceLightboxButton";
import { greenhouseLoft } from "./data";

export const metadata: Metadata = {
  title: `Greenhouse Loft: venue concept preview | ${BRAND_NAME}`,
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
  sustainability: Leaf,
} as const;

// Per-item icons for What's Included, keyed by the short label (see data.ts's restructured
// {label, detail} shape) — fallback to a generic icon rather than one repeated checkmark.
const INCLUDED_ICONS: Record<string, LucideIcon> = {
  "Exclusively yours": House,
  Coordinator: UserCheck,
  Tables: Table2,
  Chairs: Armchair,
  "Bar space": GlassWater,
  DJ: Music,
  Photobooth: Camera,
  Videography: Video,
  "Bridal suite": BedDouble,
  "Sound & AV": Projector,
  Parking: SquareParking,
  "Candle treatment": Lamp,
  Security: ShieldCheck,
  "Coat check": Shirt,
  Décor: Blinds,
  Accessibility: Accessibility,
  "Heating & A/C": AirVent,
};

const ADD_ON_ICONS: Record<string, LucideIcon> = {
  "Additional Parking": SquareParking,
  Rehearsal: CalendarClock,
  "Cleaning Fee": Broom,
};

function SectionHeading({
  title,
  subtitle,
  id,
  actions,
  icon,
}: {
  title: string;
  subtitle?: string;
  id?: string;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div id={id} className="mb-4 flex items-start justify-between gap-3 scroll-mt-20">
      <div className="flex items-center gap-2.5">
        {icon}
        <div>
          <h2 className={`text-xl leading-snug text-gray-900 ${uiHeadingClassName}`}>{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

function Divider() {
  return <div className="my-6 border-t border-black/[0.06]" />;
}

export default function GreenhouseLoftPage() {
  const { space, pricing } = greenhouseLoft;

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="mx-auto mb-3 max-w-5xl px-4 text-center text-xs text-gray-500">
        Concept preview: fifth golden-set venue, chosen for a new archetype: a plain, single-
        rental Chicago event loft, deliberately ordinary rather than a grand or unusual space. See:{" "}
        <Link href="/concept/diamond-garden-banquet-hall" className="underline hover:text-gray-800">
          Diamond Garden
        </Link>{" "}
        ·{" "}
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
          <StickyActionBar name={greenhouseLoft.name} />

          <div className="px-5 py-6 sm:px-8">
            {/* Header */}
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-stretch gap-4">
                <CategoryIcon category="venue" primaryType="event_venue" large />
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-rose-500">{greenhouseLoft.categoryLabel}</p>
                  <h1 id="venue-name-heading" className={`text-2xl leading-tight text-gray-900 sm:text-3xl ${displayHeadingClassName}`}>{greenhouseLoft.name}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                    <span className="inline-flex items-center gap-1">
                      <Star size={14} className="fill-rose-400 text-rose-400" />
                      <span className="font-medium text-gray-800">{greenhouseLoft.rating}</span>
                      <span className="text-gray-400">({greenhouseLoft.reviewCount.toLocaleString()} reviews)</span>
                    </span>
                    <a href={greenhouseLoft.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800">
                      <ExternalLink size={13} />
                      Website
                    </a>
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <MapPin size={13} />
                      {greenhouseLoft.address}
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
              <p className="text-[15px] leading-[1.65] text-gray-600">{greenhouseLoft.about}</p>
            </div>

            {/* Quick facts */}
            <div className="mt-4 flex flex-wrap gap-2">
              {greenhouseLoft.quickFacts.map((f) => {
                const Icon = QUICK_FACT_ICONS[f.icon as keyof typeof QUICK_FACT_ICONS];
                return (
                  <span key={f.label} className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3.5 py-2 text-sm text-gray-700" title={f.note}>
                    <Icon size={14} className="shrink-0 text-rose-400" />
                    {f.label}
                  </span>
                );
              })}
            </div>

            {/* No Real Weddings / Vendor Stacks section — this venue's Instagram account
                (@greenhouseloft) exists in the graph but has zero real posts and zero
                wedding_posts rows, confirmed directly against the DB. No Vendors section either
                — the venue publishes no preferred/approved vendor list at all ("Do you take
                commissions from other vendors? Absolutely not."). */}

            <Divider />

            {/* Photos — bumped up here, same as Diamond Garden's no-stack placement, since
                there's no real wedding-stack content to occupy the slot above it. */}
            <section id="photos">
              <SectionHeading title="Photos" />
              <div className="grid grid-cols-3 gap-2">
                {greenhouseLoft.photos.map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt={greenhouseLoft.name} className="aspect-square w-full rounded-xl object-cover" />
                ))}
              </div>
            </section>

            <Divider />

            {/* Differentiator spotlight — new section type (feedback 2026-08-24), not a category
                every future venue gets by default: only include it when the venue's own site
                actually demonstrates something truly unique or notable, with real specifics to
                back it up. Greenhouse Loft's own /sustainability-1 page does exactly that, backing
                up its tagline with real numbers most of which weren't shown anywhere else on this
                page before now. Placed under Photos (feedback 2026-08-25, moved from right after
                Quick facts) rather than in the wedding-stack's top-of-page slot. One compact card:
                Highlights leads (feedback 2026-08-25: the more immediately compelling, photo-
                friendly facts), then a vertical divider, then Reduce/Reuse/Recycle grouped
                together — two logical groups, not 4 equal-looking columns. LEED Platinum lives as
                a Highlights bullet, not a separate pill (feedback 2026-08-25: a standalone pill
                here just duplicated the quick-facts pill above it). No link out to the source page
                itself (feedback 2026-08-25: "not like a core resource") — every real fact from it
                is already surfaced here. See
                golden-set-template.md §4. Visually distinguished from every other card section on
                this page (feedback 2026-08-26: the section read as a differentiator in content but
                not in design, blending into the same white-card-with-rose-dot look as Space/What's
                Included). Given a soft green tint, an emerald leaf badge in its own heading (see
                `icon` on SectionHeading, added for this section only), and the venue's own tagline
                pulled up top as the section's visual anchor — using the tagline rather than
                repeating "LEED Platinum certified" verbatim, since that fact is already the
                5th quick-fact pill above and restating it here would be the exact duplication
                feedback 2026-08-25 called out; LEED Platinum stays a Highlights bullet only.
                Bullet dots switch from the page's rose accent to emerald to carry the color story
                through, without adding any new UI pattern (still plain dot-bullet lists) per the
                simple/concise design bar. */}
            <section id="sustainability">
              <SectionHeading
                title={greenhouseLoft.differentiator.title}
                icon={
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <Leaf size={16} className="text-emerald-600" />
                  </span>
                }
              />
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
                <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                  <Leaf size={12} className="text-emerald-500" />
                  Chicago&apos;s most sustainable event venue
                </span>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_1px_3fr]">
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-emerald-700/70">Highlights</p>
                    <ul className="space-y-1 text-sm text-gray-700">
                      {greenhouseLoft.differentiator.highlights.map((item) => (
                        <li key={item} className="flex gap-1.5">
                          <span className="shrink-0 text-emerald-500">·</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="hidden bg-emerald-200/60 sm:block" />
                  <div className="grid grid-cols-3 gap-x-5 border-t border-emerald-200/60 pt-4 sm:border-t-0 sm:pt-0">
                    {(["reduce", "reuse", "recycle"] as const).map((key) => (
                      <div key={key}>
                        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-emerald-700/70">{key}</p>
                        <ul className="space-y-1 text-sm text-gray-700">
                          {greenhouseLoft.differentiator[key].map((item) => (
                            <li key={item} className="flex gap-1.5">
                              <span className="shrink-0 text-emerald-500">·</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <Divider />

            {/* Space — genuinely one rental spanning three named areas (Loft, Skygarden, Art
                Gallery), not separately bookable spaces — see data.ts header comment. The real
                2026-2027 rate grid lives here rather than in a standalone Pricing section, since
                this venue has exactly one real pricing path (golden-set-template.md §4: a
                standalone Pricing section only applies when 2+ genuinely distinct paths exist —
                Diamond Garden is still the only venue with that). Tour/gallery/floor-plan buttons
                link out (no confirmed direct embed for the venue's own third-party 360° tour
                widget — see data.ts header comment; floor plans moved here from Add-ons per
                feedback 2026-08-24, since they're about the space itself). Sq ft shown as one
                Indoor/Outdoor headline (feedback 2026-08-24: that's what a couple actually wants
                to know quickly, not a 3-way area breakdown), with the Art Gallery named in the
                "Includes:" line below instead — same pattern as Marchetti's "Includes: Il
                Cortile (courtyard), the tented ballroom, and the Montecatini Room (3,000 sq ft)."
                Capacity: three tiles, all three carrying real, distinctly-labeled numbers from
                the venue's own site, one consistent cocktail figure (200) throughout the page. */}
            <section id="space">
              <SectionHeading title="The Space" />
              <div className="mx-auto max-w-2xl rounded-2xl border border-black/[0.06] p-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{space.name}</h3>
                    <p className="text-sm text-gray-500">Indoor: {space.sqFtIndoor.toLocaleString()} sq ft</p>
                    <p className="text-sm text-gray-500">Outdoor: {space.sqFtOutdoor.toLocaleString()} sq ft</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <PageLightboxButton
                      label="Virtual tour"
                      icon={<Rotate3d size={13} className="text-rose-400" />}
                      url={space.tourUrl}
                      title="Greenhouse Loft Virtual Tour"
                    />
                    <PageLightboxButton
                      label="Real weddings"
                      icon={<Images size={13} className="text-gray-500" />}
                      url={space.galleryUrl}
                      title="Greenhouse Loft Event Gallery"
                      variant="secondary"
                    />
                    <FloorPlansButton resources={greenhouseLoft.floorPlanResources} />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
                  <div className="rounded-xl bg-[#fdf8f5] py-2.5">
                    <div className="font-semibold text-gray-900">{space.capacity.seatedDj}</div>
                    <div className="text-[11px] leading-tight text-gray-500">{greenhouseLoft.capacityLabels.seatedDj}</div>
                  </div>
                  <div className="rounded-xl bg-[#fdf8f5] py-2.5">
                    <div className="font-semibold text-gray-900">{space.capacity.seatedBand}</div>
                    <div className="text-[11px] leading-tight text-gray-500">{greenhouseLoft.capacityLabels.seatedBand}</div>
                  </div>
                  <div className="rounded-xl bg-[#fdf8f5] py-2.5">
                    <div className="font-semibold text-gray-900">{space.capacity.cocktail}</div>
                    <div className="text-[11px] leading-tight text-gray-500">{greenhouseLoft.capacityLabels.cocktail}</div>
                  </div>
                </div>

                <p className="mt-3 text-sm leading-[1.6] text-gray-600">{space.description}</p>

                <div className="mt-4 rounded-lg bg-[#fdf8f5] p-3 text-sm text-gray-700">
                  <p className={`mb-2 font-medium text-gray-900 ${uiHeadingClassName}`}>Rental rate</p>
                  <table className="w-full text-xs text-gray-600">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="pb-1.5 text-left font-normal">Season</th>
                        <th className="pb-1.5 text-right font-normal">Friday</th>
                        <th className="pb-1.5 text-right font-normal">Saturday</th>
                        <th className="pb-1.5 text-right font-normal">Sunday</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-black/[0.06]">
                        <td className="py-1.5">Off-season ({pricing.offSeason.months})</td>
                        <td className="py-1.5 text-right">{money(pricing.offSeason.friday)}</td>
                        <td className="py-1.5 text-right">{money(pricing.offSeason.saturday)}</td>
                        <td className="py-1.5 text-right">{money(pricing.offSeason.sunday)}</td>
                      </tr>
                      <tr className="border-t border-black/[0.06]">
                        <td className="py-1.5">Peak season ({pricing.peakSeason.months})</td>
                        <td className="py-1.5 text-right">{money(pricing.peakSeason.friday)}</td>
                        <td className="py-1.5 text-right">{money(pricing.peakSeason.saturday)}</td>
                        <td className="py-1.5 text-right">{money(pricing.peakSeason.sunday)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="mt-2.5 space-y-1 text-xs text-gray-500">
                    <p>
                      <span className="font-medium text-gray-700">Access:</span> {pricing.access}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">Event hours:</span> {pricing.eventHours}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">Holiday rates:</span> {pricing.holidayRates}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm text-gray-600">
                  <span className="font-medium text-gray-800">Includes:</span>{" "}
                  {space.areas.map((a, i) => (
                    <span key={a.name}>
                      {i > 0 && (i === space.areas.length - 1 ? ", and " : ", ")}
                      {a.name}
                      {a.sqFt ? ` (${a.sqFt.toLocaleString()} sq ft, ${a.note})` : a.note ? ` (${a.note})` : ""}
                    </span>
                  ))}
                  .
                </p>
              </div>
            </section>

            <Divider />

            {/* Food & Beverage — both catering and bar are single-pill BYO, a real, confirmed
                finding (checked the FAQ, amenities page, and homepage directly for all three
                pill types before concluding neither à la carte nor all-inclusive apply). Prose
                written plainly in Dewwey's own voice, not as attributed quotes (feedback
                2026-08-25: quoting the venue directly read as "messy" — the point is to showcase
                the venue's real facts and reasoning, not frame them as "in their own words").
                Catering guidelines PDF linked in the section heading's own actions slot, matching
                Diamond Garden's PDF-link convention. F&B minimum dropped from here entirely
                (feedback 2026-08-24: "is silly it doesn't apply") — it's still in the Policies
                checklist below, which is the one section required to show every row. */}
            <section id="food-beverage">
              <SectionHeading
                title="Food & Beverage"
                actions={
                  // feedback 2026-08-27: resource links default to an in-page lightbox instead
                  // of a new tab. Squarespace serves this PDF with no X-Frame-Options (checked
                  // 2026-08-27), so it embeds cleanly.
                  <ResourceLightboxButton
                    label="Catering guidelines"
                    icon={<FileText size={13} className="text-rose-400" />}
                    title="Greenhouse Loft — Catering & Composting Guidelines"
                    embedSrc={greenhouseLoft.cateringGuidelinesUrl}
                  />
                }
              />

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Food</p>
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3 py-1 text-xs font-medium text-gray-700">Bring Your Own (BYO)</span>
                </div>
                <p className="text-sm leading-[1.6] text-gray-600">
                  Greenhouse Loft offers an open catering list, so you can bring the caterer of your choice, as long as they&apos;re licensed and insured. It works with them to meet its own standard for responsible, sustainable catering, following the guidelines linked above.
                </p>
              </div>

              <div>
                <p className="mb-1.5 mt-5 text-xs font-medium uppercase tracking-wide text-gray-400">Bar</p>
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3 py-1 text-xs font-medium text-gray-700">Bring Your Own (BYO)</span>
                </div>
                <p className="text-sm leading-[1.6] text-gray-600">
                  Greenhouse Loft is BYOB, giving you the choice and flexibility to build your own bar and keep costs down. The space includes a bar &mdash; a 25&apos; permanent bar plus mobile bars for the outdoor space and art gallery &mdash; but not alcohol or bartending.
                </p>
              </div>
            </section>

            <Divider />

            {/* What's Included — the richest section on this page, deliberately. Every real fact
                from the homepage's own "included amenities" block is present, fixing the
                documented quality-rubric.md gap (DJ services, photobooth, parking count, candle
                treatment, security, dedicated venue manager were all previously missed — see
                data.ts). Rendered as short label + detail (a plain sentence like "10 28'' custom
                cocktail tables" doesn't make clear at a glance that it's about tables — leading
                with a bold "Tables:" label fixes that), grouped into 5 categories (feedback
                2026-08-24: a flat 15-item grid had started to blur together) with small uppercase
                micro-labels, matching the Food & Beverage section's "Food"/"Bar" sub-headers. */}
            <section id="whats-included">
              <SectionHeading title="What's Included" subtitle="Bundled into the one flat rental fee." />
              <div className="rounded-2xl border border-black/[0.06] p-5">
                <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                  {greenhouseLoft.sharedIncludes.map((group) => (
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

            {/* Add-ons & extras — genuinely thin, a real finding about this venue's shape (see
                data.ts header comment): almost everything is bundled into the one flat fee rather
                than sold piecemeal. Floor plan PDFs moved to the Space section (feedback
                2026-08-24) — nothing left to put in this section's actions slot. Subtitle removed
                (feedback 2026-08-25: it read like a note to a colleague, not to a couple). Card
                layout now matches Field Museum's Add-ons pattern (feedback 2026-08-25) — icon,
                name, price, then description — instead of a category+table shape built for more
                line items than this venue actually has. */}
            <section id="add-ons">
              <SectionHeading title="Add-ons & extras" />
              <div className="grid gap-4 sm:grid-cols-2">
                {greenhouseLoft.addOns.map((a) => {
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

            {/* Cost Estimate */}
            <section id="calculator">
              <SectionHeading title="Cost Estimate" />
              <CostCalculator />
            </section>

            <Divider />

            {/* Policies — value shown as a small pill so the answer is scannable at a glance
                (feedback 2026-08-25: "a user looks at catering and quickly understands the
                policy... today this is too much"), with an optional smaller detail line below
                only where the pill alone doesn't cover a real nuance — trimmed several rows'
                detail entirely in data.ts where it just restated the pill. Real service agreement
                PDF linked here (feedback 2026-08-25/26), not in Space — it's entirely contract
                terms (cancellation, insurance, rules, fees), the same ground this section already
                covers, not a "what does the room look like" resource.
                (2026-08-26: tried a card-grid layout instead — reverted per direct feedback,
                "not as easy to find what you want if you're a viewer as how it was before.") */}
            <section id="policies">
              <SectionHeading
                title="Policies"
                actions={
                  // feedback 2026-08-27: same lightbox conversion as Food & Beverage's Catering
                  // guidelines button — Squarespace/static1.squarespace.com serves this PDF with
                  // no X-Frame-Options either (checked 2026-08-27).
                  <ResourceLightboxButton
                    label="Service agreement"
                    icon={<FileText size={13} className="text-rose-400" />}
                    title="Greenhouse Loft — Venue and Event Services Agreement"
                    embedSrc={greenhouseLoft.serviceAgreementUrl}
                  />
                }
              />
              <div className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06]">
                {greenhouseLoft.policies.map((p) => (
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

            {/* FAQs — standard questions kept brief since the venue's own real FAQ (25
                questions) already covers the same ground in far more depth. */}
            {/* FAQs — line-underneath-and-caret rows (feedback 2026-08-25: "how Clay formats,"
                too similar to Policies as boxed rows before) instead of a bordered card with
                divider lines: each question is a full-width row with its own bottom rule and a
                chevron on the right that rotates open, no outer box. */}
            <section id="faqs">
              <SectionHeading title="Frequently asked questions" />

              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Questions every couple asks</p>
              <div className="mb-6 border-t border-black/[0.08]">
                {greenhouseLoft.standardFaqs.map((f) => (
                  <details key={f.question} className="group border-b border-black/[0.08] py-3">
                    <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-gray-900 ${uiHeadingClassName}`}>
                      {f.question}
                      <ChevronDown size={16} className="shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-2 text-sm leading-[1.6] text-gray-600">{f.answer}</p>
                  </details>
                ))}
              </div>

              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">From Greenhouse Loft&apos;s site</p>
              <div className="border-t border-black/[0.08]">
                {greenhouseLoft.faqs.map((f) => (
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

            {/* Location */}
            <section id="location">
              <SectionHeading title="Location" />
              <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
                <iframe
                  title={`Map of ${greenhouseLoft.name}`}
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(greenhouseLoft.address)}&z=15&output=embed`}
                  className="h-52 w-full border-0 sm:h-60"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-start gap-1.5 text-sm text-gray-500">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-gray-400" />
                  {greenhouseLoft.address}
                </p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(greenhouseLoft.address)}`}
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
                Sourced from {greenhouseLoft.sourcePages.length} pages on{" "}
                <a href={greenhouseLoft.website} target="_blank" rel="noopener noreferrer" className="text-rose-500 hover:text-rose-600">
                  greenhouseloft.com
                </a>{" "}
                · verified {greenhouseLoft.lastVerified}.
              </div>
              <div className="mt-2 flex flex-wrap gap-3">
                {greenhouseLoft.sourcePages.map((url) => (
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
