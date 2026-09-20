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
  FileText,
  Images,
  LayoutGrid,
  MapPin,
  Rotate3d,
  Sparkles,
  Users,
  UtensilsCrossed,
  Video,
  Wine,
  House,
  type LucideIcon,
} from "lucide-react";
import { uiHeadingClassName } from "@/lib/typography";
import { deriveStandardFaqs, fbPills, policyRows, quickFacts } from "@/lib/venueDetails/derive";
import type {
  AddOn,
  InclusionItem,
  Pricing,
  PricingPath,
  Resource,
  ResourceKind,
  Space,
  VenueDetailsV3,
} from "@/lib/venueDetails/types";
import * as fmt from "./format";
import { ADD_ON_CATEGORY_ICONS, INCLUSION_ICONS } from "./icons";
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
      {actions ? <div className="flex min-w-0 flex-wrap justify-end gap-2">{actions}</div> : null}
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
        items={resources.map((r) => ({ id: r.id, label: fmt.resourceLabel(r, resources), url: r.url }))}
      />
    );
  }
  return (
    <>
      {resources.map((r) => (
        <ResourceButton key={r.id} label={fmt.resourceLabel(r, resources)} icon={RESOURCE_ICONS[r.kind]} url={r.url} />
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

  // Round 4 rule 5: a single-space venue shows every space-level resource — the ones that would
  // otherwise sit on the Spaces heading (a capacity sheet, a venue-scoped tour/video/gallery) AND
  // this one space's own per-space bucket — inside the one card's own header, ordered Floor
  // plan(s), Virtual tour, Video, Gallery. Multi-space venues keep the heading-vs-card split.
  const singleSpaceCardActions = singleSpace && venue.spaces[0] ? fmt.orderSpaceCardResources([...placed.spacesHeading, ...(placed.perSpace[venue.spaces[0].id] ?? [])]) : null;

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
            <SectionHeading title={singleSpace ? "The Space" : "Spaces"} actions={singleSpace ? undefined : resourceButtons(placed.spacesHeading, "Resources")} />
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
                  actions={singleSpace ? (singleSpaceCardActions ?? []) : (placed.perSpace[space.id] ?? [])}
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
            {/* Grid class is purely by path count (fixed round 2026-09-19: the old full-width
                fallback for tall/bulleted cards turned Diamond Garden's three cards into one per
                row). `items-stretch` (round 6 rule 3) so every card's border reaches the same row
                height — each card is a flex column itself, so nothing is force-centered or
                spacer-padded, it just naturally has room at the bottom when a sibling is taller. */}
            <div className={`${fmt.pricingGridClass(venue.pricing.paths.length)} items-stretch`}>
              {venue.pricing.paths.map((p, i) => (
                <PricingPathCard key={p.id} path={p} paths={venue.pricing.paths} index={i} seasons={venue.pricing.seasons} capturedAt={venue.sources.crawled_at} />
              ))}
            </div>
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
                {/* Round 4: a not_stated row's label reads lighter too, not just its grey pill. */}
                <span className={`text-sm ${uiHeadingClassName} ${p.stated ? "text-gray-900" : "text-gray-500"}`}>{p.label}</span>
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
            {/* Round 4 rule 11: grouped by relationship, plain-language header + one explanatory
                sentence, instead of a bare enum pill per list — a venue can have several lists
                sharing one relationship (Geraghty's décor + A/V in-house partners). */}
            {fmt.groupVendorListsByRelationship(visibleVendorLists).map((g) => (
              <div key={g.relationship} className="mb-6 last:mb-0">
                <h3 className={`text-base text-gray-900 ${uiHeadingClassName}`}>{g.header}</h3>
                <p className="mt-0.5 text-xs text-gray-500">{g.sentence}</p>
                <div className="mt-3 space-y-3">
                  {g.lists.map((l) => (
                    <div key={l.label}>
                      {g.lists.length > 1 && <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">{l.label}</p>}
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
                </div>
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
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="break-all underline decoration-gray-300 hover:text-gray-700">
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

/** A space card's own resource actions, in round 5 rule 3's fixed slot order — Virtual tour,
 * Gallery, Floor plan(s) (incl. capacity_sheet), Video — 2+ of the same kind in one slot collapse
 * to a single menu button. The first populated slot gets the primary (rose) treatment, matching
 * the concept pages' own weighting (Diamond Garden's primary "Virtual tour" next to its secondary
 * "Wedding videos"); every other slot is secondary (grey). */
function SpaceCardActions({ actions }: { actions: Resource[] }) {
  const ordered = fmt.orderSpaceCardResources(actions);
  const slots: { key: string; menuLabel: string; icon: LucideIcon; resources: Resource[] }[] = [
    { key: "virtual_tour", menuLabel: "Virtual tours", icon: Rotate3d, resources: ordered.filter((r) => r.kind === "virtual_tour") },
    { key: "gallery", menuLabel: "Galleries", icon: Images, resources: ordered.filter((r) => r.kind === "gallery") },
    { key: "floor_plan", menuLabel: "Floor plans", icon: LayoutGrid, resources: ordered.filter((r) => r.kind === "floor_plan" || r.kind === "capacity_sheet") },
    { key: "video", menuLabel: "Videos", icon: Video, resources: ordered.filter((r) => r.kind === "video") },
  ].filter((s) => s.resources.length > 0);

  if (slots.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-2">
      {slots.map((slot, i) => {
        const variant: "primary" | "secondary" = i === 0 ? "primary" : "secondary";
        const Icon = slot.icon;
        if (slot.resources.length === 1) {
          const r = slot.resources[0];
          return <ResourceButton key={r.id} label={fmt.resourceLabel(r, slot.resources)} icon={RESOURCE_ICONS[r.kind]} url={r.url} variant={variant} />;
        }
        return (
          <ResourceMenuButton
            key={slot.key}
            label={`${slot.menuLabel} (${slot.resources.length})`}
            icon={<Icon size={13} className={variant === "primary" ? "text-rose-400" : "text-gray-400"} />}
            items={slot.resources.map((r) => ({ id: r.id, label: fmt.resourceLabel(r, slot.resources), url: r.url }))}
            variant={variant}
          />
        );
      })}
    </div>
  );
}

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
  const sizeLine = fmt.spaceSizeLine(space.sq_ft, space.sq_ft_outdoor, space.structure_label, space.sq_ft_label);
  const hasOtherSizeFacts = space.sq_ft != null || space.sq_ft_outdoor != null;
  const ceiling = fmt.ceilingLine(space.ceiling_ft, space.ceiling_label, hasOtherSizeFacts);
  // Round 4 rule 6 (regression fix): `spaceRentalLine` is the single source of truth for which
  // shape this card shows — fee rows, the in-card grid, a one-line summary pointing at the
  // standalone Pricing section, "included in the per-guest package price", or "on request". The
  // grid itself is built ONLY when the line's own kind says "grid", so the two can never disagree
  // (the prior bug: a separate `showSpaceRentalGrid` call and a boolean-only `spaceRentalLine`
  // could fall out of sync once a Pricing section existed, dropping the card to "on request").
  const rentalLine = fmt.spaceRentalLine(fees.length, wholeVenueFeesForCard, venue.pricing.paths.length, defaultPath);
  const rentalGridSource = rentalLine.kind === "grid" ? fmt.fixedFeeGrid(wholeVenueFeesForCard, venue.pricing.seasons) : null;
  const rentalGrid = rentalGridSource ? fmt.buildMergedPriceGrid(rentalGridSource) : null;
  // Round 4 rule 3 / round 5 rule 4: the venue's own labeled rate terms live INSIDE the same tinted
  // "Rental rate" box as whichever grid/fee table this card shows, never as a separate line below it.
  const terms = defaultPath?.terms ?? [];
  const showRentalBox = fees.length > 0 || rentalGrid != null;

  return (
    <div className={`rounded-2xl border border-black/[0.06] ${single ? "p-6" : "p-5"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{space.name}</h3>
          <p className={`text-sm ${sizeLine.stated ? "text-gray-500" : "italic text-gray-400"}`}>{sizeLine.text}</p>
        </div>
        <SpaceCardActions actions={actions} />
      </div>

      <div className={`mt-4 grid grid-cols-3 ${single ? "gap-3" : "gap-2"} text-center text-sm`}>
        {tiles.map((t) => (
          <div key={t.tile} className={`rounded-xl py-2 ${t.max != null ? "bg-[#fdf8f5]" : "bg-gray-50"}`}>
            <div className={`flex items-center justify-center gap-1 font-semibold ${t.max != null ? "text-gray-900" : "text-gray-300"}`}>
              {t.max != null ? fmt.int(t.max) : "—"}
              {t.max != null && <FactSource quote={t.quote ?? undefined} source_url={t.source_url ?? undefined} snapshot_id={t.snapshot_id} capturedAt={venue.sources.crawled_at} />}
            </div>
            <div className={`text-[11px] leading-tight ${t.max != null ? "text-gray-500" : "text-gray-400"}`}>{t.as_stated_label ?? fmt.TILE_FALLBACK_LABEL[t.tile]}</div>
          </div>
        ))}
      </div>

      {space.description && <p className="mt-3 text-sm leading-[1.6] text-gray-600">{space.description.value}</p>}
      {ceiling && <p className="mt-1.5 text-xs text-gray-400">{ceiling}</p>}

      {/* Round 5 rule 4: everything rate-related — the grid or fee table, then the venue's own
          rental terms — lives inside ONE tinted box. */}
      {showRentalBox && (
        <div className="mt-4 rounded-lg bg-[#fdf8f5] p-3 text-sm text-gray-700">
          {rentalGrid ? (
            <>
              <p className={`mb-2 font-medium text-gray-900 ${uiHeadingClassName}`}>Rental rate</p>
              <MergedPriceGridTable grid={rentalGrid} seasons={venue.pricing.seasons} />
            </>
          ) : (
            <table className="w-full text-sm text-gray-600">
              <tbody>
                {fees.map((f) => (
                  <tr key={f.key} className="border-t border-black/[0.04] first:border-t-0">
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
          {terms.length > 0 && (
            <div className="mt-2.5 space-y-1 text-xs text-gray-500">
              {terms.map((t) => (
                <p key={t.label}>
                  <span className="font-medium text-gray-700">{t.label}:</span> {t.text}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Round 4 rule 6: every card names its rental shape, even when there's no fee table/grid
          to show — a one-line summary pointing at the standalone Pricing section (never a second
          copy of the grid), bundled into a per-guest price, or genuinely priced on request. */}
      {rentalLine.kind === "summary" && (
        <div className="mt-4 rounded-lg bg-[#fdf8f5] px-3 py-2 text-sm text-gray-700">
          <span className="font-medium text-gray-900">Venue rental:</span> {rentalLine.line}
        </div>
      )}
      {rentalLine.kind === "bundled" && (
        <div className="mt-4 rounded-lg bg-[#fdf8f5] px-3 py-2 text-sm text-gray-700">
          <span className="font-medium text-gray-900">Venue rental:</span> included in the per-guest package price
          {rentalLine.sameRateAnyRoom ? ", same rate regardless of room" : ""}
        </div>
      )}
      {rentalLine.kind === "on_request" && (
        <div className="mt-4 rounded-xl bg-gray-50 p-3.5">
          <p className="text-sm text-gray-600">Pricing: on request.</p>
          {venue.website_url && (
            <a
              href={venue.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50"
            >
              Ask about pricing
            </a>
          )}
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

/** The menus table (round 4 rule 14: sits inside the FOOD column when the section is split, else
 * shared below both columns/pills). */
function FbMenusTable({ menus, className = "mt-4" }: { menus: VenueDetailsV3["food_beverage"]["menus"]; className?: string }) {
  return (
    <div className={`${className} overflow-x-auto`}>
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
          {menus.map((m) => (
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
  );
}

/** The bar-ladder table + bar minimum line (round 4 rule 14: sits inside the BAR column when
 * split, else shared below). */
function FbBarLaddersTable({ barLadders, barMinGuests, className = "mt-4" }: { barLadders: VenueDetailsV3["food_beverage"]["bar_ladders"]; barMinGuests: number | null; className?: string }) {
  return (
    <>
      <div className={`${className} overflow-x-auto`}>
        <table className="w-full text-sm text-gray-600">
          <thead>
            <tr className="text-xs text-gray-400">
              <th className="pb-2 text-left font-normal">Bar package</th>
              <th className="pb-2 pr-6 text-left font-normal">Includes</th>
              <th className="pb-2 text-right font-normal">Cost (4 or 5 hours)</th>
            </tr>
          </thead>
          <tbody>
            {barLadders.map((b) => (
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
      {fmt.barMinGuestsLine(barMinGuests) && <p className="mt-2 text-xs font-medium text-amber-700">{fmt.barMinGuestsLine(barMinGuests)}</p>}
    </>
  );
}

/** One uniform `Label: text` callout line (round 5 rule 5), evidence-linked when a Fact backs it. */
function FbCalloutLine({ label, text, fact, capturedAt }: { label: string; text: string; fact?: { quote: string; source_url: string; snapshot_id: number | null } | null; capturedAt: string | null }) {
  return (
    <p className="text-sm text-gray-700">
      <span className="font-medium text-gray-900">{label}:</span> {text}
      {fact && <FactSource quote={fact.quote} source_url={fact.source_url} snapshot_id={fact.snapshot_id} capturedAt={capturedAt} />}
    </p>
  );
}

/** Round 6 rule 2: Food & Beverage is one column, in two clearly separated FOOD/BAR blocks —
 * resource buttons in the heading, then package-level tier cards, then the two blocks (each its
 * own micro-header, pills, note and side-specific table), then the shared callout lines that apply
 * regardless of side. A single shared pill row (no micro-headers) replaces the two blocks only
 * when the pills match and neither side has a note or a table (`fmt.fbBlocks`). */
function FoodBeverageSection({ venue, defaultPath, placed }: { venue: VenueDetailsV3; defaultPath: PricingPath | undefined; placed: fmt.PlacedResources }) {
  const { food, bar } = fbPills(venue); // round 4 rule 13: already BYO -> à la carte -> All-Inclusive order
  const blocks = fmt.fbBlocks(venue);

  const foodNote = fmt.fbSideNote(venue.food_beverage, "food");
  const barNote = fmt.fbSideNote(venue.food_beverage, "bar");
  const barByo = venue.food_beverage.caption;
  const notIncluded = fmt.notIncludedLine(venue.food_beverage);
  const chargesTax = fmt.fbRateSentence(venue.pricing.rates);
  const fbMinimum = fmt.fbMinimumLine(venue.spine.fb_minimum);

  // Fix round: tiers that share a name and differ only by day/season (Diamond Garden's four
  // "All-Inclusive" rows) collapse into one card with a min-max price — the season x day
  // breakdown itself lives in the Pricing section's grid, not repeated as cards here.
  const tiers = fmt.collapseTiersByName(defaultPath?.per_guest_tiers ?? []);

  return (
    <section id="food-beverage">
      <SectionHeading title="Food & Beverage" actions={resourceButtons(placed.fbShared, "Menus")} />

      {/* Round 6 rule 2: tier cards are package-level, so they sit above the FOOD/BAR blocks. */}
      {tiers.length > 0 && (
        // A single collapsed tier (Diamond Garden: 8 same-named "All-Inclusive" day/season rows
        // collapse to exactly one card) reads as sparse/orphaned inside a grid meant for several
        // side-by-side tiers (Marchetti's Argento/Oro/Platino) — round-3 fix: one real card gets a
        // plain single-column layout instead of floating alone in a 3-column grid.
        <div className={tiers.length > 1 ? "grid gap-5 sm:grid-cols-3" : "max-w-sm"}>
          {tiers.map((t) => {
            const rep = t.representative;
            const priceParts = fmt.tierPriceParts(t.minPerGuest, t.maxPerGuest);
            return (
              <div key={t.id} className="rounded-2xl border border-black/[0.06] p-5">
                <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{t.name}</h3>
                {/* Round 4 rule 8: price large/bold, unit small/grey. */}
                <p className="mt-1 text-2xl font-semibold text-gray-900">
                  {priceParts.main}
                  {priceParts.unit && <span className="text-sm font-normal text-gray-500"> {priceParts.unit}</span>}
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

      {/* Round 6 rule 2: a single shared pill row (rare — matching pills, no note, no table on
          either side) vs. two clearly separated FOOD/BAR blocks, each mt-8, tables mt-4 with a
          max-w-3xl cap so a wide table never stretches the whole single-column section. */}
      {blocks === "shared" ? (
        <div className={tiers.length > 0 ? "mt-8 flex flex-wrap gap-2" : "flex flex-wrap gap-2"}>
          {food.length > 0 ? food.map((p) => <PillSpan key={p}>{fmt.fbPillLabel(p)}</PillSpan>) : <span className="text-xs italic text-gray-400">Not stated</span>}
        </div>
      ) : (
        <>
          <div className={tiers.length > 0 ? "mt-8" : ""}>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Food</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {food.length > 0 ? food.map((p) => <PillSpan key={p}>{fmt.fbPillLabel(p)}</PillSpan>) : <span className="text-xs italic text-gray-400">Not stated</span>}
            </div>
            {foodNote && (
              <p className="mt-2 text-sm text-gray-700">
                {foodNote.value}
                <FactSource quote={foodNote.quote} source_url={foodNote.source_url} snapshot_id={foodNote.snapshot_id} capturedAt={venue.sources.crawled_at} />
              </p>
            )}
            {venue.food_beverage.menus.length > 0 && <FbMenusTable menus={venue.food_beverage.menus} className="mt-4 max-w-3xl" />}
          </div>
          <div className="mt-8">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Bar</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {bar.length > 0 ? bar.map((p) => <PillSpan key={p}>{fmt.fbPillLabel(p)}</PillSpan>) : <span className="text-xs italic text-gray-400">Not stated</span>}
            </div>
            {barNote && (
              <p className="mt-2 text-sm text-gray-700">
                {barNote.value}
                <FactSource quote={barNote.quote} source_url={barNote.source_url} snapshot_id={barNote.snapshot_id} capturedAt={venue.sources.crawled_at} />
              </p>
            )}
            {venue.food_beverage.bar_ladders.length > 0 && (
              <FbBarLaddersTable barLadders={venue.food_beverage.bar_ladders} barMinGuests={venue.food_beverage.bar_min_guests} className="mt-4 max-w-3xl" />
            )}
          </div>
        </>
      )}

      {/* Round 6 rule 2: the shared lines that apply after both blocks regardless of side —
          food_note/bar_note moved into their own blocks above, so this list is shorter than
          round 5's. */}
      <div className="mt-4 space-y-1.5">
        {barByo && <FbCalloutLine label="Bar BYO option" text={barByo.value} fact={barByo} capturedAt={venue.sources.crawled_at} />}
        {fbMinimum && <FbCalloutLine label="Food & beverage minimum" text={fbMinimum} capturedAt={venue.sources.crawled_at} />}
        {chargesTax && <FbCalloutLine label="Charges & tax" text={chargesTax} capturedAt={venue.sources.crawled_at} />}
        {notIncluded && <FbCalloutLine label="Not included in package price" text={notIncluded} capturedAt={venue.sources.crawled_at} />}
      </div>
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
        {/* Round 4 rule 15: every row is uniformly Label: detail — no row without the bold label. */}
        <span className="font-medium text-gray-900">{disp.boldLabel}: </span>
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

/** Round 6 rule 3: no `min-w` — with short season row labels and calendar day columns already
 * ≤ 4, this table fits a 1/3-width Pricing card at normal widths without scrolling. `overflow-x-auto`
 * stays on the table's own wrapper (not the months line below it) purely as a local containment
 * fallback at very narrow widths: with no `min-w` forcing it, the table only ever scrolls instead
 * of forcing the whole card — and the page — wider than the viewport. The per-guest tier grid's
 * unit used to repeat "/guest" in all 8 cells, which alone was wide enough to force a horizontal
 * scroll inside a 1/3-width Pricing card even with the fixes above — it now states the unit once,
 * beside the months line, matching the "Cost (4 or 5 hours)"-in-the-header idiom the bar-ladder
 * table already uses instead of repeating a unit per row. */
function MergedPriceGridTable({ grid, moneySuffix, seasons }: { grid: fmt.MergedPriceGrid; moneySuffix?: string; seasons?: Pricing["seasons"] }) {
  const monthsLine = fmt.seasonMonthsLine(seasons);
  return (
    <div className="mt-3 min-w-0">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-gray-600">
          <thead>
            <tr className="text-gray-400">
              <th className="pb-1.5 text-left font-normal">Season</th>
              {grid.columns.map((c) => (
                <th key={c.label} className="pb-1.5 pl-2 text-right font-normal">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.seasons.map((s, si) => (
              <tr key={s} className="border-t border-black/[0.05]">
                <td className="py-1 align-top">{fmt.seasonShortLabel(s)}</td>
                {grid.grid[si].map((amount, ci) => (
                  <td key={ci} className="py-1 pl-2 text-right text-xs">
                    {amount != null ? fmt.money(amount) : <span className="text-gray-300">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(moneySuffix || monthsLine) && (
        <div className="mt-2 space-y-0.5 text-[11px] text-gray-400">
          {moneySuffix && <p>Prices shown are {moneySuffix.replace(/^\//, "per ")}.</p>}
          {monthsLine && <p>{monthsLine}</p>}
        </div>
      )}
    </div>
  );
}

function PricingPathCard({
  path,
  paths,
  index,
  seasons,
  capturedAt,
}: {
  path: PricingPath;
  /** All of this venue's paths, in document order — used to find an earlier path with the
   * identical fee shape (round 4 rule 16's "Same rental rates as X, plus …"). */
  paths: PricingPath[];
  index: number;
  seasons: Pricing["seasons"];
  capturedAt: string | null;
}) {
  // Round 4 rule 16: a path built on top of an earlier one's rental rate (Diamond Garden's "Hall
  // + à la carte" reusing "Hall Rental Only"'s grid) says so in one sentence instead of repeating
  // the grid.
  const sameAs = fmt.samePricingAsEarlierPath(paths, index);
  // Round 6 rule 3: the venue's own light-gray term under the title — `path.subtitle` when the
  // importer set one, else the leading "X:" phrase of `path.description`.
  const subtitle = fmt.pathSubtitle(path);

  // Fix round (2026-09-19 review), reordered by round 6 rule 3: the fees are identical to `sameAs`
  // by definition, so the price line, includes/tier bullets, grid, and staffing/surcharge/promotion
  // notes below would just be exact repeats — the card renders only its title, subtitle, the "Same
  // rental rates" sentence, and its own description, in that order.
  if (sameAs) {
    return (
      <div className="flex min-w-0 flex-col rounded-2xl border border-black/[0.06] p-5">
        <div className="flex items-center gap-1.5">
          <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{path.name}</h3>
          <FactSource quote={path.quote} source_url={path.source_url} snapshot_id={path.snapshot_id} capturedAt={capturedAt} />
        </div>
        {subtitle && <p className="mt-0.5 text-sm text-gray-400">{subtitle}</p>}
        <p className="mt-2 text-sm text-gray-600">{fmt.sameRentalRatesLine(sameAs.name)}</p>
        {path.description && <p className="mt-1 text-sm text-gray-600">{path.description}</p>}
      </div>
    );
  }

  const feeGrid = fmt.buildMergedPriceGrid(fmt.fixedFeeGrid(path.fixed_fees.filter((f) => f.applies_to === "space" || f.applies_to === "whole_venue"), seasons));
  const tierGrid = fmt.buildMergedPriceGrid(fmt.perGuestTierGrid(path.per_guest_tiers, seasons));
  const priceParts = fmt.pricingHeadlineParts(path);
  // The representative per-guest tier's own inclusions (round 4 rule 16) — `collapseTiersByName`
  // already picks the first-seen entry per unique package name, the same de-dup this path's own
  // day/season variants need.
  const representativeTier = fmt.collapseTiersByName(path.per_guest_tiers)[0]?.representative;
  const tierInclusionGroups = representativeTier ? fmt.groupTierInclusionBullets(representativeTier.inclusions) : [];
  const guestMinLine = fmt.collapsedGuestMinimumLine(path.minimums);
  const fbMins = path.minimums.filter((m) => m.kind === "fb_minimum");

  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-black/[0.06] p-5">
      {/* Round 6 rule 3: header -> subtitle -> price -> description -> includes/tier bullets ->
          grid -> notes. */}
      <div className="flex items-center gap-1.5">
        <h3 className={`text-lg text-gray-900 ${uiHeadingClassName}`}>{path.name}</h3>
        <FactSource quote={path.quote} source_url={path.source_url} snapshot_id={path.snapshot_id} capturedAt={capturedAt} />
      </div>

      {subtitle && <p className="mt-0.5 text-sm text-gray-400">{subtitle}</p>}

      {/* Round 5 rule 6 / rule 8: price bold, unit small grey — same typography as the F&B tier
          cards' headline price. */}
      {priceParts && (
        <p className="mt-2 text-2xl font-semibold text-gray-900">
          {priceParts.main}
          {priceParts.unit && <span className="text-sm font-normal text-gray-500"> {priceParts.unit}</span>}
        </p>
      )}

      {/* Round 6 rule 3: the description sentence sits after the price, before the bullets. */}
      {path.description && <p className="mt-2 text-sm text-gray-600">{path.description}</p>}

      {/* Includes / tier-inclusion bullets, both above the grid. */}
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
      {tierInclusionGroups.length > 0 && (
        <div className={path.includes && path.includes.length > 0 ? "mt-3 space-y-2.5" : "space-y-2.5"}>
          {tierInclusionGroups.map((g) => (
            <div key={g.header ?? "flat"}>
              {g.header && <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{g.header}</p>}
              <ul className={`space-y-1.5 text-sm text-gray-600 ${g.header ? "mt-1" : ""}`}>
                {g.items.map((inc) => (
                  <li key={inc} className="flex gap-2">
                    <span className="text-rose-400">·</span>
                    {inc}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Round 5 rule 4: the grid, then the venue's own rental terms, inside ONE tinted box. */}
      {(feeGrid || tierGrid) && (
        <div className="mt-4 rounded-lg bg-[#fdf8f5] p-3 text-sm text-gray-700">
          {feeGrid && <MergedPriceGridTable grid={feeGrid} seasons={seasons} />}
          {tierGrid && <MergedPriceGridTable grid={tierGrid} moneySuffix="/guest" seasons={seasons} />}
          {path.terms && path.terms.length > 0 && (
            <div className="mt-2.5 space-y-1 text-xs text-gray-500">
              {path.terms.map((t) => (
                <p key={t.label}>
                  <span className="font-medium text-gray-700">{t.label}:</span> {t.text}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notes: minimums (one line each), staffing, surcharges, promotions. */}
      {fbMins.length > 0 && (
        <div className="mt-3 space-y-1 text-xs text-gray-500">
          {fbMins.map((m, i) => (
            <p key={i}>
              <span className="font-medium text-gray-700">F&amp;B minimum:</span> {fmt.minimumValueLabel(m)}
              {m.day ? ` (${fmt.dayFullLabel(m.day)})` : ""}
              {m.season ? `, ${fmt.seasonLabel(m.season)}` : ""}
            </p>
          ))}
        </div>
      )}
      {/* Round 4 rule 16: every guest minimum collapsed into ONE line — general first, day-specific
          ones named in parens — instead of a row per day-specific minimum. */}
      {guestMinLine && (
        <p className="mt-1 text-xs text-gray-500">
          <span className="font-medium text-gray-700">Guest minimum:</span> {guestMinLine}
        </p>
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
  // Round 6 fix (2026-09-19): notes render in full in cards — truncation stays inside table cells
  // only, where a fixed column width actually needs it.
  // Round 5 rule 9: the same category_std icon map the Add-ons section groups under.
  const Icon = ADD_ON_CATEGORY_ICONS[fmt.resolveCategoryStd(addOn)] ?? Sparkles;
  const caption = fmt.addOnCardCaption(addOn);
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-black/[0.06] p-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fdf8f5]">
        <Icon size={15} className="text-rose-400" />
      </div>
      <div className="min-w-0 flex-1">
        {caption && <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{caption}</p>}
        <h4 className={`break-words text-sm text-gray-900 ${uiHeadingClassName}`}>{addOn.name}</h4>
        <p className="mt-0.5 text-base font-semibold text-gray-900">
          {fmt.addOnPriceString(addOn)}
          <FactSource quote={addOn.quote} source_url={addOn.source_url} snapshot_id={addOn.snapshot_id} capturedAt={capturedAt} />
        </p>
        {addOn.note && <p className="mt-1 break-words text-xs text-gray-500">{addOn.note}</p>}
      </div>
    </div>
  );
}

/** An Item|Price table for one whole standard category, built from `fmt.buildAddOnCategoryStdTable`
 * — variant/condition already folded into the item label; a small caption line above the label
 * shows the venue's own sub-category when it differs from the item's name (round 6 rule 1). Only
 * needs columnLabels/rows: the caller renders the category heading/blurb/examples. */
function AddOnCategoryTableView({ table }: { table: { columnLabels: string[]; rows: fmt.AddOnCategoryTableRow[] } }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-gray-600">
        <thead>
          <tr className="text-xs text-gray-400">
            <th className="pb-2 text-left font-normal">Item</th>
            {table.columnLabels.map((c) => (
              <th key={c} className="pb-2 text-right font-normal">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => {
            const note = row.note ? fmt.truncateNote(row.note) : null;
            return (
              <tr key={row.key} className="border-t border-black/[0.05] align-top">
                <td className="py-2">
                  {row.caption && <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{row.caption}</div>}
                  {row.itemLabel}
                  {note && (
                    <div className="mt-0.5 text-xs text-gray-400" title={note.truncated ? note.full : undefined}>
                      {note.display}
                    </div>
                  )}
                </td>
                {row.prices.map((price, pi) => (
                  <td key={pi} className="py-2 text-right">
                    {price}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Round 6 rule 1: exactly two modes, decided ONLY by the venue's total add-on count, never mixed
 * within a section — the old "compact rows" mode and per-sub-group cards/table hybrid are both
 * gone. `<= 5` -> a flat, unheaded card grid (the Greenhouse concept's shape). `> 5` -> one table
 * per standard category (`fmt.groupAddOnsByCategoryStd`'s fixed order), covering every venue
 * sub-category under that header, with the curated blurb(s) above and example bullets below. */
function AddOnsSection({ venue, actions }: { venue: VenueDetailsV3; actions?: ReactNode }) {
  const items = venue.pricing.add_ons.filter((a) => !a.selection_group);

  if (fmt.addOnsMode(items) === "cards") {
    return (
      <section id="add-ons">
        <SectionHeading title="Add-ons & extras" actions={actions} />
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((a) => (
            <AddOnCard key={a.id} addOn={a} capturedAt={venue.sources.crawled_at} />
          ))}
        </div>
      </section>
    );
  }

  const groups = fmt.groupAddOnsByCategoryStd(venue);
  return (
    <section id="add-ons">
      <SectionHeading title="Add-ons & extras" actions={actions} />
      {/* Many items: one CARD per standard category (the Diamond Garden concept shape) — title, the
          venue's own blurb(s), the item table, example bullets — in a two-column grid. */}
      <div className="grid gap-4 sm:grid-cols-2">
      {groups.map((g) => {
        const blurbSubgroups = g.subgroups.filter((sg) => sg.blurb);
        const examples = [...new Set(g.subgroups.flatMap((sg) => sg.examples))];
        const table = fmt.buildAddOnCategoryStdTable(g.subgroups, venue.spaces);
        return (
          <div key={g.category_std} className="min-w-0 rounded-2xl border border-black/[0.06] p-5">
            <h3 className={`text-base text-gray-900 ${uiHeadingClassName}`}>{g.label}</h3>
            {blurbSubgroups.length > 0 && (
              <div className="mt-2 space-y-1">
                {blurbSubgroups.map((sg) => (
                  <p key={sg.category} className="text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{sg.category}</span>: {sg.blurb}
                  </p>
                ))}
              </div>
            )}
            <div className="mt-3">
              <AddOnCategoryTableView table={table} />
            </div>
            {examples.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-gray-600">
                {examples.map((ex) => (
                  <li key={ex} className="flex gap-1.5">
                    <span className="text-rose-400">·</span>
                    {ex}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      </div>
    </section>
  );
}
