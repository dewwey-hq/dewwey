/**
 * The one generic renderer for a VenueDetailsV3 document (D060 Phase 1b) — replaces the six
 * hand-built concept pages (`app/concept/*`) with a single component driven entirely by the
 * schema (`lib/venueDetails/types.ts`) and its pure derivations (`lib/venueDetails/derive.ts`).
 * Section order, formats and voice rules are locked by
 * `docs/engineering/venue-enrichment/golden-set-template.md` — read that doc before changing
 * anything here. Server-compatible: only `FaqList` and `CostEstimate` are client components.
 *
 * Every section that has no data is omitted except Policies (always 13 rows) and Quick facts.
 * Unknown renders as the honest grey state, never invented.
 */

import type { ReactNode } from "react";
import {
  Accessibility,
  AirVent,
  Armchair,
  BedDouble,
  Blinds,
  Camera,
  Church,
  FileText,
  GlassWater,
  House,
  Images,
  Lamp,
  LayoutGrid,
  MapPin,
  Music,
  Projector,
  Rotate3d,
  Shirt,
  ShieldCheck,
  Sparkles,
  SquareParking,
  Table2,
  UserCheck,
  Users,
  UtensilsCrossed,
  Video,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { uiHeadingClassName } from "@/lib/typography";
import { addOnAxes, deriveStandardFaqs, fbPills, policyRows, quickFacts } from "@/lib/venueDetails/derive";
import type {
  AddOn,
  InclusionItem,
  PricingPath,
  Resource,
  ResourceKind,
  Space,
  VendorList,
  VenueDetailsV3,
} from "@/lib/venueDetails/types";
import * as fmt from "./format";
import { FactSource } from "./FactSource";
import { ResourceButton } from "./ResourceButton";
import { ResourceMenuButton } from "./ResourceMenuButton";
import { FaqList } from "./FaqList";
import { CostEstimate } from "./CostEstimate";

export interface VenueDetailsViewProps {
  venue: VenueDetailsV3;
  /** The wedding-stack slot (real IG content) — rendered in the tinted band when provided. */
  feed?: ReactNode;
  /** A photo grid — the section is skipped entirely when absent. */
  photos?: ReactNode;
  /** No address lives on VenueDetailsV3; Location is skipped when this isn't passed in. */
  address?: string;
  /** A `venue_details_versions` row's own `created_at` for the current `provenance.version_no` —
   * no such timestamp lives on `VenueDetailsV3` itself (see the footer's own comment), so the
   * caller threads it in once that table exists. Rendered only when both this and
   * `venue.provenance` are present; the lab page passes nothing for fixtures. */
  lastChangedAt?: string;
}

// ---------------------------------------------------------------------------
// Small shared UI bits
// ---------------------------------------------------------------------------

function SectionHeading({ title, subtitle, id, actions, icon }: { title: string; subtitle?: string; id?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div id={id} className="mb-4 flex flex-wrap items-start justify-between gap-3 scroll-mt-20">
      <div className="flex items-center gap-2.5">
        {icon}
        <div>
          <h2 className={`text-xl leading-snug text-gray-900 ${uiHeadingClassName}`}>{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap justify-end gap-2">{actions}</div> : null}
    </div>
  );
}

function Divider() {
  return <div className="my-6 border-t border-black/[0.06]" />;
}

function PillSpan({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3 py-1 text-xs font-medium text-gray-700">{children}</span>;
}

const QUICK_FACT_ICONS: Record<string, LucideIcon> = {
  guests: Users,
  setting: House,
  catering: UtensilsCrossed,
  bar: Wine,
  sparkle: Sparkles,
};

const RESOURCE_ICONS: Record<ResourceKind, LucideIcon> = {
  brochure: FileText,
  menu: FileText,
  bar_menu: FileText,
  capacity_sheet: FileText,
  floor_plan: LayoutGrid,
  contract: FileText,
  catering_guidelines: FileText,
  video: Video,
  virtual_tour: Rotate3d,
  gallery: Images,
  vendor_list: Users,
  other: FileText,
};

const INCLUSION_ICONS: Partial<Record<InclusionItem["label"], LucideIcon>> = {
  "Exclusively yours": House,
  "Bridal suite": BedDouble,
  "Bar space": GlassWater,
  Parking: SquareParking,
  "Coat check": Shirt,
  Accessibility: Accessibility,
  "Heating & A/C": AirVent,
  Tables: Table2,
  Chairs: Armchair,
  Linens: Blinds,
  "Dance floor": Music,
  DJ: Music,
  "Sound & AV": Projector,
  Photobooth: Camera,
  Videography: Video,
  Coordinator: UserCheck,
  Security: ShieldCheck,
  "Candle treatment": Lamp,
  Ceremony: Church,
  Décor: Blinds,
};

const RELATIONSHIP_LABEL: Record<VendorList["relationship"], string> = {
  preferred: "Preferred",
  approved_required: "Approved / required",
  in_house_partner: "In-house partner",
  recommended: "Recommended",
};

/** A section heading's (or F&B micro-header's) action row: one button per resource, unless
 * that's more than `MAX_INLINE_RESOURCE_BUTTONS` — a fix-round rule (2026-09-13 review) so a
 * venue with many resources of the same kind (menus, capacity sheets) never overflows the
 * heading. Takes an already-placed bucket from `fmt.placeResources` (2026-09-18 review) instead
 * of filtering `venue.resources` by kind itself, so every heading's actions come from the one
 * routing table. */
function resourceButtons(resources: Resource[], collapseLabel: string): ReactNode | undefined {
  if (resources.length === 0) return undefined;
  if (fmt.shouldCollapseResourceButtons(resources.length)) {
    return (
      <ResourceMenuButton
        label={`${collapseLabel} (${resources.length})`}
        icon={<FileText size={13} className="text-rose-400" />}
        items={resources.map((r) => ({ id: r.id, label: r.label, url: r.url }))}
      />
    );
  }
  return (
    <>
      {resources.map((r) => (
        <ResourceButton key={r.id} label={r.label} icon={RESOURCE_ICONS[r.kind]} url={r.url} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VenueDetailsView({ venue, feed, photos, address, lastChangedAt }: VenueDetailsViewProps) {
  const defaultPath: PricingPath | undefined = venue.pricing.paths[0];
  // Every resource on the document, routed once (2026-09-18 review — the old ad-hoc per-section
  // kind filters missed scope, so 18 of 34 resources across the six golden fixtures never
  // reached the DOM). See `fmt.placeResources` for the routing table.
  const placed = fmt.placeResources(venue);
  const singleSpace = venue.spaces.length === 1;
  const wholeVenueFees = fmt.pathWholeVenueFixedFees(defaultPath);
  const visibleVendorLists = fmt.visibleVendorLists(venue);
  const domain = fmt.siteDomain(venue.website_url);

  // Fix round (2026-09-13 review): a single-space venue (or a multi-space one where no space
  // has its own space-scoped fee — e.g. Greenhouse Loft's one flat whole-venue rental) shows the
  // whole-venue fees INSIDE that space's own "Rental rate" grid instead of as a "book both
  // together" line above the grid, which only makes sense once there are 2+ real spaces to book
  // separately or together.
  const anySpaceScoped = fmt.anySpaceHasScopedFees(venue.spaces, defaultPath);
  const wholeVenueFeesBelongInCard = wholeVenueFees.length > 0 && (venue.spaces.length <= 1 || !anySpaceScoped);
  const showBookBothLine = wholeVenueFees.length > 0 && venue.spaces.length >= 2 && anySpaceScoped;

  return (
    <div>
      {/* About — omitted entirely when not stated (the "empty beats wrong" rule; About isn't one
          of the two sections that always render). */}
      {venue.about && (
        <div>
          <SectionHeading title="About" actions={resourceButtons(placed.about, "Brochures")} />
          <p className="text-[15px] leading-[1.65] text-gray-600">
            {venue.about.text} <FactSource source_url={venue.about.evidence.source_url} snapshot_id={venue.about.evidence.snapshot_id} capturedAt={venue.sources.crawled_at} />
          </p>
        </div>
      )}

      {/* Quick facts — always rendered (one of the two sections that never omit). */}
      <div className="mt-4 flex flex-wrap gap-2">
        {quickFacts(venue).map((f) => {
          const Icon = QUICK_FACT_ICONS[f.icon] ?? Sparkles;
          return (
            <span key={f.label} className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-[#fdf8f5] px-3.5 py-2 text-sm text-gray-700">
              <Icon size={14} className="shrink-0 text-rose-400" />
              {f.label}
            </span>
          );
        })}
      </div>

      {/* Wedding stack slot — real IG content, tinted band, no dividers (the band itself is the
          boundary, per golden-set-template.md §1/§2). Lab callers pass nothing. */}
      {feed && <div className="my-6 rounded-2xl bg-[#fdf8f5] px-3 py-3 sm:px-4">{feed}</div>}

      {/* Photos — skipped entirely when the caller has nothing to render here. */}
      {photos && (
        <section id="photos">
          <SectionHeading title="Photos" />
          {photos}
        </section>
      )}

      {/* Unconditional (fix round, 2026-09-18 user review): the quick-facts row always needs a
          divider before whatever comes next, whether or not the feed/photos/differentiator slots
          are present — the old conditional left no gap when none of those three rendered. */}
      <Divider />

      {/* Differentiator spotlight — only when the venue's own site demonstrates something
          genuinely unique (golden-set-template.md §4). Emerald for sustainability, rose
          otherwise — the color is tied to the title since the generic renderer can't hand-pick a
          bespoke motif per venue. */}
      {venue.differentiator && (
        <>
          <DifferentiatorSpotlight differentiator={venue.differentiator} />
          <Divider />
        </>
      )}

      {/* Spaces */}
      {venue.spaces.length > 0 && (
        <>
          <section id="spaces">
            <SectionHeading title={singleSpace ? "The Space" : "Spaces"} actions={resourceButtons(placed.spacesHeading, "Resources")} />
            {showBookBothLine &&
              (() => {
                const groups = fmt.groupWholeVenueFees(wholeVenueFees);
                return (
                  <p className="mb-5 text-sm text-gray-500">
                    Prefer the whole venue? Book both together:{" "}
                    {groups.map((g, gi) => (
                      <span key={g.season}>
                        {gi > 0 ? " / " : ""}
                        {groups.length > 1 ? `${fmt.SEASON_PREFIX_LABEL[g.season]}: ` : ""}
                        {g.parts.map((p, pi) => (
                          <span key={p.label}>
                            {pi > 0 ? " · " : ""}
                            {p.label} {fmt.money(p.amount)}
                            <FactSource quote={p.fee.quote} source_url={p.fee.source_url} snapshot_id={p.fee.snapshot_id} capturedAt={venue.sources.crawled_at} />
                          </span>
                        ))}
                      </span>
                    ))}
                    .
                  </p>
                );
              })()}
            <div className={singleSpace ? "mx-auto max-w-2xl" : "grid gap-5 sm:grid-cols-2"}>
              {venue.spaces.map((space) => (
                <SpaceCard
                  key={space.id}
                  venue={venue}
                  space={space}
                  defaultPath={defaultPath}
                  wholeVenueFeesForCard={wholeVenueFeesBelongInCard ? wholeVenueFees : []}
                  actions={placed.perSpace[space.id] ?? []}
                  single={singleSpace}
                />
              ))}
            </div>
          </section>
          <Divider />
        </>
      )}

      {/* Food & Beverage */}
      <FoodBeverageSection venue={venue} defaultPath={defaultPath} placed={placed} />
      <Divider />

      {/* What's Included */}
      {fmt.showInclusions(venue) && (
        <>
          <WhatsIncludedSection inclusions={venue.inclusions} capturedAt={venue.sources.crawled_at} />
          <Divider />
        </>
      )}

      {/* Pricing — standalone section only when the venue has 2+ genuinely distinct paths.
          Cards render in the document's own path order, which the importer/pipeline puts
          cheap-first (Diamond Garden: Hall-only -> Hall + à la carte -> All-Inclusive). */}
      {fmt.showPricingSection(venue) && (
        <>
          <section id="pricing">
            <SectionHeading title="Pricing" />
            <div className="grid gap-5 sm:grid-cols-2">
              {venue.pricing.paths.map((p) => (
                <PricingPathCard key={p.id} path={p} capturedAt={venue.sources.crawled_at} />
              ))}
            </div>
            {/* Season months are identical across every path on the same venue — stated once
                here rather than repeated per card. */}
            {fmt.seasonsMonthsLine(venue.pricing.seasons) && (
              <p className="mt-4 text-sm text-gray-600">
                <span className="font-medium text-gray-800">Season:</span> {fmt.seasonsMonthsLine(venue.pricing.seasons)}.
              </p>
            )}
          </section>
          <Divider />
        </>
      )}

      {/* Add-ons & extras */}
      {fmt.showAddOns(venue) && (
        <>
          <AddOnsSection venue={venue} actions={resourceButtons(placed.addOns, "Resources")} />
          <Divider />
        </>
      )}

      {/* Cost Estimate — always rendered; handles the no-path case itself. */}
      <section id="calculator">
        <SectionHeading title="Cost Estimate" />
        <CostEstimate venue={venue} />
      </section>
      <Divider />

      {/* Policies — always 13 rows (the other section that never omits). */}
      <section id="policies">
        <SectionHeading title="Policies" actions={resourceButtons(placed.policies, "Documents")} />
        <div className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06]">
          {policyRows(venue).map((p) => {
            const evidence = fmt.policyEvidence(venue, p.key);
            return (
              <div key={p.key} className="flex items-start justify-between gap-4 px-4 py-3">
                <span className={`text-sm ${uiHeadingClassName} text-gray-900`}>{p.label}</span>
                <span className="flex max-w-[60%] flex-col items-end gap-1">
                  <span className="flex items-center gap-1">
                    <span className={fmt.policyPillClassName(p.stated)}>{p.pill}</span>
                    {evidence.kind === "stated" && <FactSource {...evidence.fact} capturedAt={venue.sources.crawled_at} />}
                    {evidence.kind === "conflicting" && <FactSource candidates={evidence.candidates} capturedAt={venue.sources.crawled_at} />}
                  </span>
                  {p.detail ? <span className="text-left text-xs text-gray-500">{p.detail}</span> : null}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <Divider />

      {/* FAQs */}
      <section id="faqs">
        <SectionHeading title="Frequently asked questions" />
        <FaqList standard={deriveStandardFaqs(venue)} venue={venue.faqs.map((f) => ({ question: f.question, answer: f.answer }))} venueName={venue.name} />
      </section>

      {/* Featured Weddings */}
      {fmt.showPressFeatures(venue) && (
        <>
          <Divider />
          <section id="press">
            <SectionHeading title="Featured Weddings" />
            <div className="grid gap-4 sm:grid-cols-2">
              {venue.press_features.map((p) => (
                <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" className="block rounded-2xl border border-black/[0.06] p-4 hover:border-rose-200">
                  <p className={`text-sm text-gray-900 ${uiHeadingClassName}`}>{p.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{p.attribution}</p>
                </a>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Vendors */}
      {visibleVendorLists.length > 0 && (
        <>
          <Divider />
          <section id="vendors">
            <SectionHeading title="Vendors" actions={resourceButtons(placed.vendors, "Resources")} />
            {visibleVendorLists.map((l) => (
              <div key={l.label} className="mb-5 last:mb-0">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <h3 className={`text-base text-gray-900 ${uiHeadingClassName}`}>{l.label}</h3>
                  <span className="inline-flex shrink-0 items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-500">
                    {RELATIONSHIP_LABEL[l.relationship]}
                  </span>
                </div>
                <ul className="flex flex-wrap gap-2 text-sm text-gray-600">
                  {l.entries.map((e) => (
                    <li key={e.name} className="rounded-full border border-black/[0.06] px-3 py-1">
                      {e.url ? (
                        <a href={e.url} target="_blank" rel="noopener noreferrer" className="hover:text-rose-500">
                          {e.name}
                        </a>
                      ) : (
                        e.name
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}

      {/* Location — no address lives on VenueDetailsV3; skipped when the caller doesn't pass one. */}
      {address && (
        <>
          <Divider />
          <section id="location">
            <SectionHeading title="Location" />
            <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
              <iframe
                title={`Map of ${venue.name}`}
                src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed`}
                className="h-52 w-full border-0 sm:h-60"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-start gap-1.5 text-sm text-gray-500">
                <MapPin size={15} className="mt-0.5 shrink-0 text-gray-400" />
                {address}
              </p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-sm font-medium text-rose-500 transition-colors hover:text-rose-600"
              >
                Open in Google Maps →
              </a>
            </div>
          </section>
        </>
      )}

      {/* Grounding footer — three dates when available: last checked (sources.crawled_at), last
          changed (the `lastChangedAt` prop, shown only alongside a real `provenance` — no such
          timestamp lives on VenueDetailsV3.provenance itself, only version_id/version_no/
          correction_ids/human_verified_at/verified_by; the caller threads in a
          `venue_details_versions` row's own `created_at` once that table's read path exists), and
          human verified (provenance.human_verified_at). */}
      <Divider />
      <section className="rounded-2xl bg-gray-50 p-5 text-sm text-gray-500">
        <div className="inline-flex flex-wrap items-center gap-1.5">
          <Sparkles size={14} className="text-rose-400" />
          Sourced from {venue.sources.pages.length} page{venue.sources.pages.length === 1 ? "" : "s"}
          {domain && (
            <>
              {" "}
              on{" "}
              <a href={venue.website_url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-rose-500 hover:text-rose-600">
                {domain}
              </a>
            </>
          )}
          {venue.sources.crawled_at && <> · last checked {venue.sources.crawled_at}</>}
          {venue.provenance && lastChangedAt && <> · last changed {lastChangedAt}</>}
          {venue.provenance?.human_verified_at && <> · human verified {venue.provenance.human_verified_at}</>}
          .
        </div>
        {venue.sources.pages.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-3">
            {venue.sources.pages.map((url) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="underline decoration-gray-300 hover:text-gray-700">
                {url.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Differentiator spotlight
// ---------------------------------------------------------------------------

function DifferentiatorSpotlight({ differentiator }: { differentiator: NonNullable<VenueDetailsV3["differentiator"]> }) {
  const color = fmt.differentiatorColor(differentiator.title);
  const emerald = color === "emerald";
  return (
    <section id="differentiator">
      <SectionHeading
        title={differentiator.title}
        icon={
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${emerald ? "bg-emerald-100" : "bg-rose-100"}`}>
            <Sparkles size={16} className={emerald ? "text-emerald-600" : "text-rose-500"} />
          </span>
        }
      />
      <div className={`rounded-2xl border p-5 ${emerald ? "border-emerald-100 bg-emerald-50/60" : "border-rose-100 bg-rose-50/60"}`}>
        {differentiator.tagline && (
          <span className={`mb-4 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium ring-1 ${emerald ? "text-emerald-700 ring-emerald-200" : "text-rose-600 ring-rose-200"}`}>
            {differentiator.tagline}
          </span>
        )}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {differentiator.groups.map((g) => (
            <div key={g.heading}>
              <p className={`mb-1.5 text-xs font-medium uppercase tracking-wide ${emerald ? "text-emerald-700/70" : "text-rose-600/70"}`}>{g.heading}</p>
              <ul className="space-y-1 text-sm text-gray-700">
                {g.bullets.map((b) => (
                  <li key={b} className="flex gap-1.5">
                    <span className={`shrink-0 ${emerald ? "text-emerald-500" : "text-rose-400"}`}>·</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------------

function SpaceCard({
  venue,
  space,
  defaultPath,
  wholeVenueFeesForCard,
  actions,
  single,
}: {
  venue: VenueDetailsV3;
  space: Space;
  defaultPath: PricingPath | undefined;
  wholeVenueFeesForCard: ReturnType<typeof fmt.pathWholeVenueFixedFees>;
  /** This space's own resources (`fmt.placeResources(venue).perSpace[space.id]`) — floor plans,
   * and/or a virtual tour / video / gallery scoped to this space (Field Museum's per-space video
   * tours). */
  actions: Resource[];
  /** True for a single-space venue — the concept pages use a roomier card (`p-6`, `gap-3` tiles)
   * for the one-space shape than the multi-space grid (`p-5`, `gap-2`). */
  single: boolean;
}) {
  const tiles = fmt.spaceCapacityTiles(venue, space.id);
  const fees = fmt.pathSpaceFixedFees(defaultPath, space.id);
  const floorPlans = actions.filter((r) => r.kind === "floor_plan");
  const otherActions = actions.filter((r) => r.kind !== "floor_plan");
  const sizeLine = fmt.spaceSizeLine(space.sq_ft, space.sq_ft_outdoor, space.structure_label, space.sq_ft_label);
  const ceiling = fmt.ceilingLine(space.ceiling_ft, space.ceiling_label);
  // Fix round: only when this space has no space-scoped fee of its own do the whole-venue fees
  // render here, as a "Rental rate" season x day grid (greenhouse-loft's shape) — never both.
  const rentalGrid = fees.length === 0 && wholeVenueFeesForCard.length > 0 ? fmt.fixedFeeGrid(wholeVenueFeesForCard) : null;

  return (
    <div className={`rounded-2xl border border-black/[0.06] ${single ? "p-6" : "p-5"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{space.name}</h3>
          {sizeLine && <p className="text-sm text-gray-500">{sizeLine}</p>}
        </div>
        {/* Up to 3 buttons (2026-09-18 review): floor plans first — collapsing 2+ into a single
            "Floor plans (N)" menu button instead of a row that can overflow the card (and cause
            horizontal scroll at phone width) — then any other space-scoped resource (virtual
            tour / video / gallery) as its own secondary (grey) button, matching the concept
            pages' primary-tour / secondary-everything-else weighting. */}
        {(floorPlans.length > 0 || otherActions.length > 0) && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {floorPlans.length === 1 && <ResourceButton label={floorPlans[0].label} icon={LayoutGrid} url={floorPlans[0].url} />}
            {fmt.shouldCollapseFloorPlans(floorPlans.length) && (
              <ResourceMenuButton
                label={`Floor plans (${floorPlans.length})`}
                icon={<LayoutGrid size={13} className="text-rose-400" />}
                items={floorPlans.map((r) => ({ id: r.id, label: r.label, url: r.url }))}
              />
            )}
            {otherActions.map((r) => (
              <ResourceButton key={r.id} label={r.label} icon={RESOURCE_ICONS[r.kind]} url={r.url} variant="secondary" />
            ))}
          </div>
        )}
      </div>

      <div className={`mt-4 grid grid-cols-3 ${single ? "gap-3" : "gap-2"} text-center text-sm`}>
        {tiles.map((t) => (
          <div key={t.tile} className={`rounded-xl py-2 ${t.max != null ? "bg-[#fdf8f5]" : "bg-gray-50"}`}>
            <div className={`flex items-center justify-center gap-1 font-semibold ${t.max != null ? "text-gray-900" : "text-gray-300"}`}>
              {t.max ?? "—"}
              {t.max != null && <FactSource quote={t.quote ?? undefined} source_url={t.source_url ?? undefined} snapshot_id={t.snapshot_id} capturedAt={venue.sources.crawled_at} />}
            </div>
            <div className={`text-[11px] leading-tight ${t.max != null ? "text-gray-500" : "text-gray-400"}`}>{t.as_stated_label ?? fmt.TILE_FALLBACK_LABEL[t.tile]}</div>
          </div>
        ))}
      </div>

      {space.description && <p className="mt-3 text-sm leading-[1.6] text-gray-600">{space.description.value}</p>}
      {ceiling && <p className="mt-1.5 text-xs text-gray-400">{ceiling}</p>}

      {fees.length > 0 && (
        <table className="mt-4 w-full text-sm text-gray-600">
          <tbody>
            {fees.map((f) => (
              <tr key={f.key} className="border-t border-black/[0.04]">
                <td className="py-1.5">{fmt.feeRentalLabel(f)}</td>
                <td className="py-1.5 text-right font-medium text-gray-900">
                  {fmt.money(f.amount)}
                  <FactSource quote={f.quote} source_url={f.source_url} snapshot_id={f.snapshot_id} capturedAt={venue.sources.crawled_at} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rentalGrid && (
        <div className="mt-4 rounded-lg bg-[#fdf8f5] p-3 text-sm text-gray-700">
          <p className={`mb-2 font-medium text-gray-900 ${uiHeadingClassName}`}>Rental rate</p>
          <PriceGridTable grid={rentalGrid} />
        </div>
      )}

      {space.includes_summary && (
        <p className="mt-2 text-xs text-gray-500">
          <span className="font-medium text-gray-700">Includes:</span> {space.includes_summary}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Food & Beverage
// ---------------------------------------------------------------------------

function FoodBeverageSection({ venue, defaultPath, placed }: { venue: VenueDetailsV3; defaultPath: PricingPath | undefined; placed: fmt.PlacedResources }) {
  const { food, bar } = fbPills(venue);
  const caption = venue.food_beverage.caption;
  const layout = fmt.fbLayout(venue);
  const shared = layout === "shared";
  // Resources route to the section heading when shared (one row), or beside each side's own
  // micro-header when split — Diamond Garden's three menus under Food, one bar-packages PDF
  // under Bar (2026-09-18 review; see `fmt.placeResources`).
  const sharedActions = resourceButtons(placed.fbShared, "Resources");
  const foodActions = resourceButtons(placed.food, "Menus");
  const barActions = resourceButtons(placed.bar, "Menus");

  // Split layout's "one short prose line" per side (golden-set-template.md §3): any
  // food_beverage.notes attributed to that side by keyword (fmt.fbNoteSide), rendered at the
  // same weight as everywhere else notes read as real facts (text-sm text-gray-600) — an
  // ambiguous note (matches neither/both) is left out rather than guessed onto the wrong side.
  // `caption` stays the narrower, lighter-weight carve-out treatment (text-xs text-gray-400,
  // golden-set-template.md §3's locked LondonHouse caption style) even once attributed to a side.
  const captionSide = caption ? fmt.fbNoteSide(caption.value) : null;
  const foodProse = venue.food_beverage.notes.filter((n) => fmt.fbNoteSide(n.value) === "food").map((n) => n.value);
  const barProse = venue.food_beverage.notes.filter((n) => fmt.fbNoteSide(n.value) === "bar").map((n) => n.value);

  // Fix round: tiers that share a name and differ only by day/season (Diamond Garden's four
  // "All-Inclusive" rows) collapse into one card with a min-max price — the season x day
  // breakdown itself lives in the Pricing section's grid, not repeated as cards here.
  const tiers = fmt.collapseTiersByName(defaultPath?.per_guest_tiers ?? []);
  const rateSentence = fmt.fbRateSentence(venue.pricing.rates);

  return (
    <section id="food-beverage">
      <SectionHeading title="Food & Beverage" actions={shared ? sharedActions : undefined} />

      {shared ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {food.map((p) => (
            <PillSpan key={p}>{fmt.fbPillLabel(p)}</PillSpan>
          ))}
        </div>
      ) : (
        <>
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Food</p>
              {foodActions && <div className="flex flex-wrap justify-end gap-2">{foodActions}</div>}
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              {food.length > 0 ? food.map((p) => <PillSpan key={p}>{fmt.fbPillLabel(p)}</PillSpan>) : <span className="text-xs italic text-gray-400">Not stated</span>}
            </div>
            {foodProse.map((text) => (
              <p key={text} className="text-sm text-gray-600">
                {text}
              </p>
            ))}
            {captionSide === "food" && <p className="mt-1 text-xs text-gray-400">{caption!.value}</p>}
          </div>
          <div>
            <div className="mb-1.5 mt-5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Bar</p>
              {barActions && <div className="flex flex-wrap justify-end gap-2">{barActions}</div>}
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              {bar.length > 0 ? bar.map((p) => <PillSpan key={p}>{fmt.fbPillLabel(p)}</PillSpan>) : <span className="text-xs italic text-gray-400">Not stated</span>}
            </div>
            {barProse.map((text) => (
              <p key={text} className="text-sm text-gray-600">
                {text}
              </p>
            ))}
            {captionSide === "bar" && <p className="mt-1 text-xs text-gray-400">{caption!.value}</p>}
          </div>
        </>
      )}

      {/* `fbLayout` always splits when a caption exists, so this only fires for an ambiguous
          caption `fbNoteSide` couldn't confidently attribute to either side. */}
      {!shared && caption && captionSide == null && <p className="text-xs text-gray-400">{caption.value}</p>}

      {tiers.length > 0 && (
        // A single collapsed tier (Diamond Garden: 8 same-named "All-Inclusive" day/season rows
        // collapse to exactly one card) reads as sparse/orphaned inside a grid meant for several
        // side-by-side tiers (Marchetti's Argento/Oro/Platino) — round-3 fix: one real card gets a
        // plain single-column layout instead of floating alone in a 3-column grid.
        <div className={tiers.length > 1 ? "mt-6 grid gap-5 sm:grid-cols-3" : "mt-6 max-w-sm"}>
          {tiers.map((t) => {
            const rep = t.representative;
            return (
              <div key={t.id} className="rounded-2xl border border-black/[0.06] p-5">
                <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{t.name}</h3>
                <p className="mt-1 text-2xl font-semibold text-gray-900">
                  {fmt.tierPriceLabel(t.minPerGuest, t.maxPerGuest)}
                  <FactSource quote={rep.quote} source_url={rep.source_url} snapshot_id={rep.snapshot_id} capturedAt={venue.sources.crawled_at} />
                </p>
                {rep.bar_tier && (
                  <>
                    <p className="mt-1 text-xs text-gray-500">
                      {rep.bar_tier.name}
                      {rep.bar_tier.hours != null ? ` (${rep.bar_tier.hours}hr)` : ""}
                    </p>
                    {rep.bar_tier.examples.length > 0 && <p className="text-[11px] text-gray-400">{rep.bar_tier.examples.join(", ")}</p>}
                  </>
                )}
                {rep.inherits_from && <p className="mt-3 text-xs font-medium italic text-gray-400">Everything in {rep.inherits_from}, plus:</p>}
                <ul className={`space-y-1.5 text-sm text-gray-600 ${rep.inherits_from ? "mt-1.5" : "mt-3"}`}>
                  {rep.inclusions.map((inc) => (
                    <li key={inc} className="flex gap-2">
                      <span className="text-rose-400">·</span>
                      {inc}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {rateSentence && <p className="mt-3 text-sm text-gray-600">{rateSentence}</p>}

      {venue.food_beverage.menus.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm text-gray-600">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="pb-2 text-left font-normal">Menu</th>
                <th className="pb-2 pr-6 text-left font-normal">Includes</th>
                <th className="pb-2 pr-6 text-left font-normal">Cost</th>
                <th className="pb-2 text-left font-normal">Extras</th>
              </tr>
            </thead>
            <tbody>
              {venue.food_beverage.menus.map((m) => (
                <tr key={m.name} className="border-t border-black/[0.06] align-top">
                  <td className="py-2 pr-3 font-medium text-gray-900">{m.name}</td>
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
      )}

      {venue.food_beverage.bar_ladders.length > 0 && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm text-gray-600">
              <thead>
                <tr className="text-xs text-gray-400">
                  <th className="pb-2 text-left font-normal">Bar package</th>
                  <th className="pb-2 pr-6 text-left font-normal">Includes</th>
                  <th className="pb-2 text-right font-normal">Cost (4 or 5 hours)</th>
                </tr>
              </thead>
              <tbody>
                {venue.food_beverage.bar_ladders.map((b) => (
                  <tr key={b.name} className="border-t border-black/[0.06] align-top">
                    <td className="py-2 pr-3 font-medium text-gray-900">{b.name}</td>
                    <td className="py-2 pr-6 text-xs text-gray-500">
                      {b.includes}
                      {b.note ? <span className="block text-gray-400">{b.note}</span> : null}
                    </td>
                    <td className="py-2 text-right text-xs text-gray-500">{fmt.barLadderPriceLabel(b.prices)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fmt.barMinGuestsLine(venue.food_beverage.bar_min_guests) && (
            <p className="mt-2 text-xs font-medium text-amber-700">{fmt.barMinGuestsLine(venue.food_beverage.bar_min_guests)}</p>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// What's Included
// ---------------------------------------------------------------------------

function InclusionRow({ inc, capturedAt }: { inc: InclusionItem; capturedAt: string | null }) {
  const Icon = INCLUSION_ICONS[inc.label] ?? Sparkles;
  const disp = fmt.inclusionDisplay(inc);
  return (
    <div className="flex items-start gap-2.5 text-sm text-gray-700">
      <Icon size={16} className="mt-0.5 shrink-0 text-rose-400" />
      <span>
        {disp.boldLabel && <span className="font-medium text-gray-900">{disp.boldLabel}: </span>}
        {disp.text}
        <FactSource quote={inc.quote} source_url={inc.source_url} snapshot_id={inc.snapshot_id} capturedAt={capturedAt} />
      </span>
    </div>
  );
}

function WhatsIncludedSection({ inclusions, capturedAt }: { inclusions: InclusionItem[]; capturedAt: string | null }) {
  const groups = fmt.groupInclusions(inclusions);
  return (
    <section id="whats-included">
      <SectionHeading title="What's Included" />
      <div className="rounded-2xl border border-black/[0.06] p-5">
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.category}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">{g.category}</p>
              <div className="space-y-2.5">
                {g.items.map((inc) => (
                  <InclusionRow key={`${inc.label}-${inc.label_raw}`} inc={inc} capturedAt={capturedAt} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pricing (standalone section, 2+ paths)
// ---------------------------------------------------------------------------

function PriceGridTable({ grid, moneySuffix }: { grid: fmt.PriceGrid; moneySuffix?: string }) {
  if (grid.days.length === 0 || grid.seasons.length === 0) return null;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-xs text-gray-600">
        <thead>
          <tr className="text-gray-400">
            <th className="pb-1.5 text-left font-normal">Season</th>
            {grid.days.map((d) => (
              <th key={d} className="pb-1.5 text-right font-normal">
                {fmt.dayLabel(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.seasons.map((s, si) => (
            <tr key={s} className="border-t border-black/[0.05]">
              <td className="py-1">{fmt.seasonLabel(s)}</td>
              {grid.grid[si].map((amount, di) => (
                <td key={di} className="py-1 text-right">
                  {amount != null ? `${fmt.money(amount)}${moneySuffix ?? ""}` : <span className="text-gray-300">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MergedPriceGridTable({ grid, moneySuffix }: { grid: fmt.MergedPriceGrid; moneySuffix?: string }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-xs text-gray-600">
        <thead>
          <tr className="text-gray-400">
            <th className="pb-1.5 text-left font-normal">Season</th>
            {grid.columns.map((c) => (
              <th key={c.label} className="pb-1.5 text-right font-normal">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.seasons.map((s, si) => (
            <tr key={s} className="border-t border-black/[0.05]">
              <td className="py-1">{fmt.seasonLabel(s)}</td>
              {grid.grid[si].map((amount, ci) => (
                <td key={ci} className="py-1 text-right">
                  {amount != null ? `${fmt.money(amount)}${moneySuffix ?? ""}` : <span className="text-gray-300">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PricingPathCard({ path, capturedAt }: { path: PricingPath; capturedAt: string | null }) {
  const feeGrid = fmt.buildMergedPriceGrid(fmt.fixedFeeGrid(path.fixed_fees.filter((f) => f.applies_to === "space" || f.applies_to === "whole_venue")));
  const tierGrid = fmt.buildMergedPriceGrid(fmt.perGuestTierGrid(path.per_guest_tiers));
  const headline = fmt.pricingHeadlineLine(path);
  return (
    <div className="rounded-2xl border border-black/[0.06] p-5">
      <div className="flex items-center gap-1.5">
        <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{path.name}</h3>
        <FactSource quote={path.quote} source_url={path.source_url} snapshot_id={path.snapshot_id} capturedAt={capturedAt} />
      </div>
      {path.description && <p className="mt-1 text-sm text-gray-600">{path.description}</p>}
      {headline && <p className="mt-1 text-2xl font-semibold text-gray-900">{headline}</p>}

      {feeGrid && <MergedPriceGridTable grid={feeGrid} />}
      {tierGrid && <MergedPriceGridTable grid={tierGrid} moneySuffix="/guest" />}

      {path.includes && path.includes.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm text-gray-600">
          {path.includes.map((inc) => (
            <li key={inc} className="flex gap-2">
              <span className="text-rose-400">·</span>
              {inc}
            </li>
          ))}
        </ul>
      )}

      {path.minimums.length > 0 && (
        <div className="mt-3 space-y-1 text-xs text-gray-500">
          {path.minimums.map((m, i) => (
            <p key={i}>
              <span className="font-medium text-gray-700">{m.kind === "fb_minimum" ? "F&B minimum:" : "Guest minimum:"}</span> {fmt.minimumValueLabel(m)}
              {m.day ? ` (${fmt.dayFullLabel(m.day)})` : ""}
              {m.season ? `, ${fmt.seasonLabel(m.season)}` : ""}
            </p>
          ))}
        </div>
      )}

      {path.required_staffing && (
        <p className="mt-2 text-xs text-gray-500">
          <span className="font-medium text-gray-700">Plus required staff:</span> {fmt.money(path.required_staffing.price_per_role)} each for a bartender per{" "}
          {path.required_staffing.bartender_per_guests} guests, {path.required_staffing.other_roles.join(", ").toLowerCase()}
        </p>
      )}

      {path.year_surcharges.length > 0 && (
        <div className="mt-2 space-y-0.5 text-xs text-gray-500">
          {path.year_surcharges.map((y) => (
            <p key={y.year}>
              {y.year} surcharge: {fmt.money(y.amount)}
              {y.unit === "per_guest" ? " /guest" : ""}
            </p>
          ))}
        </div>
      )}

      {path.promotions.length > 0 && (
        <div className="mt-3 space-y-1 text-xs text-gray-500">
          {path.promotions.map((p) => (
            <p key={p.name}>
              <span className="font-medium text-gray-700">{p.name}:</span> {p.detail}
              {p.condition ? ` (${p.condition})` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-ons & extras
// ---------------------------------------------------------------------------

function AddOnCard({ addOn, capturedAt }: { addOn: AddOn; capturedAt: string | null }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-black/[0.06] p-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fdf8f5]">
        <Sparkles size={15} className="text-rose-400" />
      </div>
      <div className="min-w-0 flex-1">
        <h4 className={`text-sm text-gray-900 ${uiHeadingClassName}`}>{addOn.name}</h4>
        <p className="mt-0.5 text-base font-semibold text-gray-900">
          {fmt.addOnPriceString(addOn)}
          <FactSource quote={addOn.quote} source_url={addOn.source_url} snapshot_id={addOn.snapshot_id} capturedAt={capturedAt} />
        </p>
        {addOn.note && <p className="mt-1 text-xs text-gray-500">{addOn.note}</p>}
      </div>
    </div>
  );
}

// Fix round (2026-09-13 review): card-vs-table is decided per add-on GROUP, not once for the
// whole section — Marchetti's fb experiences are genuinely 1-axis (cards) while its rentals are
// genuinely 2-axis (style variant x space, a table), on the same page. `ceremony` add-ons show
// alongside rentals rather than getting a third subheader of their own.
function AddOnsSection({ venue, actions }: { venue: VenueDetailsV3; actions?: ReactNode }) {
  // Round-3: a venue with curated `add_on_categories` (Diamond Garden's 5 blurbed categories)
  // groups by real category instead of the plain fb/rental split every other golden uses — this
  // branch never fires for a venue without `add_on_categories`, so it changes nothing for the
  // other five.
  const categoryGroups = fmt.addOnCategoryGroups(venue);
  if (categoryGroups) {
    return (
      <section id="add-ons">
        <SectionHeading title="Add-ons & extras" actions={actions} />
        {categoryGroups.map((g, i) => (
          <div key={g.category} className={i === 0 ? "" : "mt-6"}>
            <h3 className={`text-sm text-gray-900 ${uiHeadingClassName}`}>{g.category}</h3>
            {g.blurb && <p className="mt-0.5 text-xs text-gray-500">{g.blurb}</p>}
            {g.items.length > 0 ? (
              <div className="mt-3">
                {addOnAxes(g.items) === "table" ? (
                  <AddOnTable table={fmt.buildAddOnTable(g.items, venue.spaces)} />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {g.items.map((a) => (
                      <AddOnCard key={a.id} addOn={a} capturedAt={venue.sources.crawled_at} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              g.examples.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-gray-600">
                  {g.examples.map((ex) => (
                    <li key={ex} className="flex gap-1.5">
                      <span className="text-rose-400">·</span>
                      {ex}
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        ))}
      </section>
    );
  }

  const fbAddOns = venue.pricing.add_ons.filter((a) => a.group === "fb");
  const rentalAddOns = venue.pricing.add_ons.filter((a) => a.group !== "fb");
  const groups = [
    ...(fbAddOns.length > 0 ? [{ label: "Food & beverage", items: fbAddOns }] : []),
    ...(rentalAddOns.length > 0 ? [{ label: "Space & rentals", items: rentalAddOns }] : []),
  ];
  return (
    <section id="add-ons">
      <SectionHeading title="Add-ons & extras" actions={actions} />
      {groups.map((g, i) => (
        <div key={g.label} className={i === 0 ? "" : "mt-6"}>
          {groups.length > 1 && <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">{g.label}</p>}
          {addOnAxes(g.items) === "table" ? (
            <AddOnTable table={fmt.buildAddOnTable(g.items, venue.spaces)} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {g.items.map((a) => (
                <AddOnCard key={a.id} addOn={a} capturedAt={venue.sources.crawled_at} />
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function AddOnTable({ table }: { table: fmt.AddOnTable }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm text-gray-600">
        <thead>
          <tr className="text-xs text-gray-400">
            <th className="pb-2 text-left font-normal">Category</th>
            <th className="pb-2 text-left font-normal">Option</th>
            {table.columnLabels.map((c) => (
              <th key={c} className="pb-2 text-right font-normal">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.flatMap((row) =>
            row.variants.map((v, i) => (
              <tr key={`${row.category}-${v.key}`} className="border-t border-black/[0.05]">
                {i === 0 && (
                  <td className="py-2 align-top font-medium text-gray-800" rowSpan={row.variants.length}>
                    {row.category}
                    {row.note && <div className="mt-0.5 text-xs font-normal text-gray-400">{row.note}</div>}
                  </td>
                )}
                <td className="py-2">{v.name}</td>
                {v.prices.map((price, pi) => (
                  <td key={pi} className="py-2 text-right">
                    {price}
                  </td>
                ))}
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
