import type { ReactNode } from "react";
import {
  MapPin,
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
import { uiHeadingClassName } from "@/lib/typography";
import { RealWeddingDeck } from "@/app/concept/galleria-marchetti-v4/RealWeddingDeck";
import { VendorCategoryList } from "@/app/concept/galleria-marchetti-v4/VendorCategoryList";
import { CostCalculator } from "@/app/concept/galleria-marchetti-v4/CostCalculator";
import { FloorPlanButton } from "@/app/concept/galleria-marchetti-v4/FloorPlanViewer";
import { marchetti } from "@/app/concept/galleria-marchetti-v4/data";

/**
 * Details tab content for the /vendors/galleriamarchetti v5 concept — the "About section and
 * beyond" body from the galleria-marchetti-v4 full-page mockup, ported to sit inside the real
 * vendor page's Details tab instead of its own standalone hero/modal-chrome page. The v4 hero
 * (category icon, name, rating, website/IG links, sticky action bar, inquiry modal) is dropped
 * here on purpose — the real vendor page above this tab already renders that same information
 * (name, @handle, followers, website, bio, Add to team) from live profile data, so repeating it
 * inside the tab would just be a second, conflicting copy of the same facts.
 */

const QUICK_FACT_ICONS = {
  guests: Users,
  setting: House,
  catering: UtensilsCrossed,
  bar: Wine,
} as const;

const INCLUDED_ICONS: Record<string, LucideIcon> = {
  "Heating & A/C": AirVent,
  Linens: Palette,
  "Bridal suite": BedDouble,
};

const EXPERIENCE_ICONS: Record<string, LucideIcon> = {
  "Garden Aperitivo Hour": Martini,
  "Chef Experiences": ChefHat,
  "Late Night Experiences": Moon,
};

function money(n: number): string {
  return `$${n.toLocaleString()}`;
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

export function DetailsContent() {
  return (
    <div>
      {/* About */}
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

      {/* Quick facts */}
      <div className="mt-4 flex flex-wrap gap-2">
        {marchetti.quickFacts.map((f) => {
          const Icon = QUICK_FACT_ICONS[f.icon as keyof typeof QUICK_FACT_ICONS];
          return (
            <span
              key={f.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3.5 py-2 text-sm text-gray-700"
              title={f.note}
            >
              <Icon size={14} className="shrink-0 text-rose-400" />
              {f.label}
            </span>
          );
        })}
      </div>

      {/* Real weddings */}
      <div className="my-6 rounded-2xl bg-[#fdf8f5] px-3 py-3 sm:px-4">
        <RealWeddingDeck />
      </div>

      {/* Photos */}
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

      {/* Spaces */}
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

      {/* Food & Beverage */}
      <section id="food-beverage">
        <SectionHeading title="Food & Beverage Packages" subtitle="Per-guest, on top of the venue rental fee above." />

        <div className="mb-1 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3 py-1 text-xs font-medium text-gray-700">
            All-Inclusive
          </span>
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
              {pkg.inheritsFrom && (
                <p className="mt-3 text-xs font-medium italic text-gray-400">Everything in {pkg.inheritsFrom}, plus:</p>
              )}
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
          <span className="font-medium text-gray-800">{marchetti.additionalCosts.productionFeePercent}% service charge on food & beverage</span>,
          plus {marchetti.additionalCosts.salesTaxPercent}% sales tax.
        </p>
        <p className="mt-1.5 text-xs text-gray-400">{marchetti.barCollectionsNote}</p>
      </section>

      <Divider />

      {/* What's Included */}
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

      {/* Add-ons */}
      <section id="add-ons">
        <SectionHeading title="Add-ons & extras" subtitle="Beyond the base package." />

        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Food & beverage</p>
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
                  <p className="mt-2.5 text-xs text-gray-500">{exp.blurb}</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-3.5 text-xs text-gray-600 marker:text-rose-300">
                    {exp.tiers.map((t) => (
                      <li key={t.name}>
                        <span className="font-medium text-gray-800">{t.name}</span>: {t.price}{" "}
                        <span className="text-gray-400">({t.examples.join(", ")})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

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

      {/* FAQs */}
      <section id="faqs">
        <SectionHeading title="Frequently asked questions" />

        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Questions every couple asks</p>
        <div className="mb-6 border-t border-black/[0.08]">
          {marchetti.standardFaqs.map((f) => (
            <details key={f.question} className="group border-b border-black/[0.08] py-3">
              <summary
                className={`flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-gray-900 ${uiHeadingClassName}`}
              >
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
              <summary
                className={`flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-gray-900 ${uiHeadingClassName}`}
              >
                {f.question}
                <ChevronDown size={16} className="shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm leading-[1.6] text-gray-600">{f.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <Divider />

      {/* Vendors */}
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

      {/* Location */}
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
  );
}
