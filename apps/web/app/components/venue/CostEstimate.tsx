"use client";

/**
 * Generic Cost Estimate calculator (D060 Phase 1b): a 3-column fixed-input grid (Guests always
 * first, then every axis `calculatorAxes` says this venue actually varies by) over a
 * collapsed-by-default "Add extras" panel, then the breakdown table `estimateCost` already
 * groups in the locked order (Venue / Food & beverage / Ceremony / Add-ons, then Taxes, then the
 * total) — golden-set-template.md §2. Illustrative only, never framed as a quote.
 *
 * PUNCH LIST: `event_year` surcharges are unwired (no UI axis names a year to compare).
 */

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import {
  bandCapacityTuple,
  calculatorAxes,
  calculatorRange,
  defaultAxes,
  estimateCost,
  guestRange,
  headlineCapacity,
  selectableAddOns,
  type EstimateInput,
  hasNoPricedPath,
} from "@/lib/venueDetails/derive";
import type { AddOn, Day, EstimateExtra, PricingPath, Season, VenueDetailsV3 } from "@/lib/venueDetails/types";
import * as fmt from "./format";

function PillGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; sublabel?: string | null }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? "border-rose-400 bg-rose-400 text-white hover:bg-rose-500" : "border-black/[0.1] bg-white text-gray-700 hover:border-rose-300"
            }`}
          >
            {opt.label}
            {/* Round 5 rule 8: tier/path/ceremony pills carry their own money ("Elegance
                $220/guest", "Venue only ($2,100+)", "Yes +$750") with no middle-dot separator —
                the money folds directly into the pill's own text. */}
            {opt.sublabel ? <span className={`ml-1 ${active ? "text-white/70" : "text-gray-400"}`}>{opt.sublabel}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function Stepper({ value, onChange, min = 0, max = 999, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-black/[0.1] px-1.5 py-1">
      <button type="button" onClick={() => onChange(Math.max(min, value - step))} className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Decrease">
        <Minus size={12} />
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums text-gray-900">{fmt.int(value)}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + step))} className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Increase">
        <Plus size={12} />
      </button>
    </div>
  );
}

function AxisColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-2 py-2 text-center sm:px-3">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      {children}
    </div>
  );
}

// "taxes" is handled separately below (it's always rendered, per the locked template, even
// when derive.ts's estimateCost filters an empty taxes group out of `estimate.groups`).
const GROUP_LABELS: Record<string, string> = {
  venue: "Venue",
  fb: "Food & beverage",
  ceremony: "Ceremony",
  add_ons: "Add-ons",
};

const WARNING_LABELS: Record<string, string> = {
  over_capacity: "This guest count exceeds the selected space's stated capacity.",
  under_minimum: "This guest count is below the venue's stated minimum.",
  unpriceable_extra_ignored: "An add-on with no published rate was left out of this estimate.",
  no_path: "Pricing on request.",
};

/** Whether the extras panel should start open for a given path: any path with no per-guest
 * tiers (a flat/BYO-shaped booking) that ISN'T the first (cheapest, "bare") path in the venue's
 * own cheap-first ordering — Diamond Garden's "Hall + À La Carte" auto-opens, "Hall Rental Only"
 * (first path) and "All-Inclusive" (has tiers) don't. For every other golden (a single path),
 * this is always false, unchanged from the prior fixed `useState(false)`. Round 4 rule 18: the
 * panel opening does not expand any of its own category accordions — those stay collapsed. */
function pathAutoOpensExtras(venue: VenueDetailsV3, path: PricingPath): boolean {
  return path.per_guest_tiers.length === 0 && venue.pricing.paths[0]?.id !== path.id;
}

/** One individually-toggleable extra's row (round 4 rule 10: notes truncated, full text via
 * `title`). */
function ExtraRow({ a, qty, onQtyChange }: { a: AddOn; qty: number; onQtyChange: (v: number) => void }) {
  const perUnit = a.unit === "per_unit" || a.unit === "per_hour";
  const note = a.note ? fmt.truncateNote(a.note) : null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-gray-700">
      <div className="min-w-0">
        <p className="font-medium text-gray-900">{a.name}</p>
        <p className="text-xs text-gray-500" title={note?.truncated ? note.full : undefined}>
          {fmt.addOnPriceString(a)}
          {note ? ` — ${note.display}` : ""}
        </p>
      </div>
      {perUnit ? (
        <Stepper value={qty} onChange={onQtyChange} max={50} />
      ) : (
        <button
          type="button"
          onClick={() => onQtyChange(qty > 0 ? 0 : 1)}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            qty > 0 ? "border-rose-400 bg-rose-400 text-white" : "border-black/[0.1] bg-white text-gray-700 hover:border-rose-300"
          }`}
        >
          {qty > 0 ? "Added" : "Add"}
        </button>
      )}
    </div>
  );
}

export function CostEstimate({ venue }: { venue: VenueDetailsV3 }) {
  const axes = useMemo(() => calculatorAxes(venue), [venue]);
  const hc = useMemo(() => headlineCapacity(venue), [venue]);
  const gr = useMemo(() => guestRange(venue), [venue]);
  const base = useMemo(() => defaultAxes(venue), [venue]);
  const initialPath = useMemo(() => venue.pricing.paths.find((p) => p.id === base.path_id) ?? venue.pricing.paths[0], [venue, base.path_id]);

  const [guests, setGuests] = useState(base.guests);
  const [pathId, setPathId] = useState<string | undefined>(base.path_id);
  const [spaceId, setSpaceId] = useState<string | undefined>(base.space_id);
  const [day, setDay] = useState<Day>(base.day);
  const [season, setSeason] = useState<Season>(base.season);
  const [tierId, setTierId] = useState<string | undefined>(base.tier_id);
  const [ceremonyOnSite, setCeremonyOnSite] = useState(base.ceremonyOnSite);
  const [band, setBand] = useState<boolean | undefined>(base.band);
  const [payment, setPayment] = useState<"cash_check" | "credit_card">(base.payment ?? "cash_check");
  const [extrasOpen, setExtrasOpen] = useState(() => (initialPath ? pathAutoOpensExtras(venue, initialPath) : false));
  const [extraQuantities, setExtraQuantities] = useState<Record<string, number>>({});
  const [groupSelections, setGroupSelections] = useState<Record<string, string>>({});
  // Round 4 rule 18: the extras panel's own category sub-sections, collapsed by default even
  // once the outer panel auto-opens.
  const [categoryOpen, setCategoryOpen] = useState<Record<string, boolean>>({});

  // Round 4 rule 1: the stepper's own bounds/reminder use the venue's full guest range (any
  // layout's max), not just the seated-dinner compare headline; the technical floor is the
  // venue's own stated minimum, else 10 (matching every concept calculator's own GUEST_MIN).
  const rangeReminder = fmt.guestRangeReminder(gr);
  // Round 5 rule 8: the example-range bar's floor/ceiling — held fixed at whichever path is
  // currently selected. Computed here (before the no-paths early return) so every hook in this
  // component runs unconditionally on every render, matching the pattern above.
  const exampleRange = useMemo(() => calculatorRange(venue, pathId), [venue, pathId]);

  if (hasNoPricedPath(venue)) {
    return (
      <div className="rounded-2xl border border-black/[0.06] bg-gray-50 p-5 text-sm text-gray-500">
        Pricing on request. {venue.name} does not publish fixed pricing anywhere on its site; contact them directly for a quote.
      </div>
    );
  }

  const currentPath = venue.pricing.paths.find((p) => p.id === pathId) ?? venue.pricing.paths[0];
  // path_ids-scoped: a path change hides add-ons that don't apply to it (Diamond Garden's
  // food/dinnerware/bar/coffee/cake add-ons never show once All-Inclusive is selected, since it
  // already bundles the equivalent).
  const scopedAddOns = selectableAddOns(venue, currentPath.id, day, season);
  // Round 5 rules 7/8: the extras panel groups by category_std (same standard headers the Add-ons
  // & extras section itself uses now), each group then split into single-select PillGroups vs
  // individual chips exactly as before.
  const categoryGroups = fmt.groupSelectableAddOnsByCategoryStd(scopedAddOns);
  const dayOptions = fmt.pathDayOptions(currentPath);
  const seasonOptions = fmt.pathSeasonOptions(currentPath, venue.pricing.seasons);
  const tierOptions = fmt.pathTierOptions(currentPath);
  const pathOptions = venue.pricing.paths.map((p) => ({ value: p.id, label: p.name, sublabel: fmt.pathPillSublabel(p) }));
  const ceremonyFeeAmount = fmt.ceremonyFeeAmount(venue.pricing.add_ons, spaceId ?? hc.headline_space_id ?? undefined);

  const groupExtras: EstimateExtra[] = categoryGroups
    .flatMap((c) => c.groups)
    .map((g) => groupSelections[g.key])
    .filter((id): id is string => id != null && id !== "")
    .map((add_on_id) => ({ add_on_id, quantity: 1 }));
  const individualExtras: EstimateExtra[] = categoryGroups
    .flatMap((c) => c.individual)
    .map((a) => ({ add_on_id: a.id, quantity: extraQuantities[a.id] ?? 0 }))
    .filter((e) => e.quantity > 0);
  const extras: EstimateExtra[] = [...groupExtras, ...individualExtras];

  const input: EstimateInput = {
    guests,
    day,
    season,
    path_id: currentPath.id,
    tier_id: tierId,
    space_id: spaceId,
    ceremonyOnSite,
    band,
    payment,
    extras,
  };

  const estimate = estimateCost(venue, input);
  const selectedCount = Object.values(extraQuantities).filter((q) => q > 0).length + Object.values(groupSelections).filter((v) => v).length;

  const handlePathChange = (id: string) => {
    setPathId(id);
    const newPath = venue.pricing.paths.find((p) => p.id === id);
    if (newPath) setExtrasOpen(pathAutoOpensExtras(venue, newPath));
  };

  // Round 4 rule 9: choosing a live band switches the over-capacity check to the band tuple
  // (`estimateCost` already does this via `input.band`) and names the number under the stepper.
  const bandTuple = band === true ? bandCapacityTuple(venue, spaceId ?? hc.headline_space_id ?? undefined, true) : null;

  // Fix round: the template's Taxes group is always present, even when there's genuinely
  // nothing to compute (a 0% service charge and no separate sales-tax line) — the sales-tax
  // *source* is itself a fact worth stating, as a grey row, rather than silently dropping the
  // whole group (derive.ts's `estimateCost` filters a group out entirely once its lines are
  // empty, so this group may not even appear in `estimate.groups`).
  const otherGroups = estimate.groups.filter((g) => g.group !== "taxes" && g.group !== "venue");
  const taxesGroup = estimate.groups.find((g) => g.group === "taxes");
  const hasSalesTaxLine = taxesGroup?.lines.some((l) => l.label.startsWith("Sales tax")) ?? false;
  const salesTaxFallback = hasSalesTaxLine
    ? null
    : venue.pricing.rates.sales_tax_source === "included"
      ? "Taxes & fees: Included in rental rate"
      : venue.pricing.rates.sales_tax_source === "unknown"
        ? "Taxes & fees: Not stated"
        : null;

  // Round 5 rule 8: the breakdown ALWAYS has a Venue line — a path that bundles rental into its
  // per-guest tiers (so `estimateCost` never produces any "venue" lines) still says so plainly,
  // matching the concept calculators' own "Venue rental: Included in package" row.
  const venueGroup = estimate.groups.find((g) => g.group === "venue");
  const venueLines = venueGroup?.lines.length ? venueGroup.lines : null;

  // Round 5 rule 8: the input callout line above the breakdown (the tier name only when the
  // calculator actually shows a tier axis).
  const currentTierName = axes.includes("tier") ? (tierOptions.find((t) => t.value === (tierId ?? tierOptions[0]?.value))?.label ?? null) : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
      <div className="p-5">
        {/* Fix round (2026-09-13 review): columns = 1 (Guests) + however many axes this venue
            actually varies by, never more than 4 per row so a 4th+ axis (e.g. "On-site
            ceremony?") never wraps into an orphan single-column row under Guests. Extra axes
            beyond 4 simply wrap to a second row of the same grid. */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-3 sm:divide-x sm:divide-black/[0.06] lg:grid-cols-4">
          <AxisColumn label="Guests">
            {/* Round 4 rule 1: bounded by the venue's own full guest range, floored at its stated
                minimum (else 10, the concept calculators' own floor) — not the seated-dinner
                compare headline. */}
            <Stepper value={guests} onChange={setGuests} min={gr.min ?? 10} max={gr.max ?? 999} step={10} />
            {rangeReminder && <p className="mt-1.5 text-[11px] text-gray-400">{rangeReminder}</p>}
            {bandTuple && <p className="mt-1 text-[11px] text-gray-400">Seated capacity is {fmt.int(bandTuple.max)} with a live band</p>}
          </AxisColumn>

          {axes.includes("path") && (
            <AxisColumn label="Package">
              <PillGroup value={currentPath.id} onChange={handlePathChange} options={pathOptions} />
            </AxisColumn>
          )}
          {axes.includes("space") && (
            <AxisColumn label="Space">
              <PillGroup
                value={spaceId ?? ""}
                onChange={setSpaceId}
                options={venue.spaces.filter((s) => s.bookable_separately !== false).map((s) => ({ value: s.id, label: s.name }))}
              />
            </AxisColumn>
          )}
          {axes.includes("day") && dayOptions.length > 1 && (
            <AxisColumn label="Day">
              <PillGroup value={day} onChange={setDay} options={dayOptions} />
            </AxisColumn>
          )}
          {axes.includes("season") && seasonOptions.length > 1 && (
            <AxisColumn label="Season">
              <PillGroup value={season} onChange={setSeason} options={seasonOptions} />
            </AxisColumn>
          )}
          {axes.includes("tier") && tierOptions.length > 1 && (
            <AxisColumn label="Package tier">
              <PillGroup value={tierId ?? tierOptions[0]?.value ?? ""} onChange={setTierId} options={tierOptions} />
            </AxisColumn>
          )}
          {axes.includes("ceremony") && (
            <AxisColumn label="On-site ceremony?">
              <PillGroup
                value={ceremonyOnSite ? "yes" : "no"}
                onChange={(v) => setCeremonyOnSite(v === "yes")}
                options={[
                  { value: "yes", label: "Yes", sublabel: ceremonyFeeAmount != null ? `+${fmt.money(ceremonyFeeAmount)}` : null },
                  { value: "no", label: "No" },
                ]}
              />
            </AxisColumn>
          )}
          {/* Round 4 rule 9: "Live band?" only earns its axis when a space's capacity genuinely
              differs by band vs DJ. */}
          {axes.includes("band") && (
            <AxisColumn label="Live band?">
              <PillGroup
                value={band === true ? "yes" : "no"}
                onChange={(v) => setBand(v === "yes")}
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
              />
            </AxisColumn>
          )}
          {axes.includes("payment") && (
            <AxisColumn label="Payment">
              <PillGroup
                value={payment}
                onChange={setPayment}
                options={[
                  { value: "cash_check", label: "Cash / check" },
                  { value: "credit_card", label: "Credit card" },
                ]}
              />
            </AxisColumn>
          )}
        </div>
      </div>

      {categoryGroups.length > 0 && (
        <div className="border-t border-black/[0.06] px-5 py-3">
          <button type="button" onClick={() => setExtrasOpen((o) => !o)} className="flex w-full items-center justify-between text-sm font-medium text-gray-700">
            <span>Add extras{selectedCount > 0 ? ` (${selectedCount} selected)` : ""}</span>
            <ChevronDown size={16} className={`text-gray-400 transition-transform ${extrasOpen ? "rotate-180" : ""}`} />
          </button>
          {extrasOpen && (
            <div className="mt-3 space-y-2">
              {/* Round 4 rule 18: the panel's own top-level items are category headers (same
                  categories as the Add-ons & extras section), each individually expandable and
                  collapsed by default — only the outer panel auto-opens (round 3's à-la-carte
                  behavior), never a category inside it. */}
              {categoryGroups.map((cg) => {
                const selectedInCategory =
                  cg.groups.filter((g) => groupSelections[g.key]).length + cg.individual.filter((a) => (extraQuantities[a.id] ?? 0) > 0).length;
                const open = categoryOpen[cg.category] ?? false;
                return (
                  <div key={cg.category} className="rounded-lg border border-black/[0.06]">
                    <button
                      type="button"
                      onClick={() => setCategoryOpen((s) => ({ ...s, [cg.category]: !open }))}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-gray-700"
                    >
                      <span>
                        {cg.category}
                        {selectedInCategory > 0 ? ` (${selectedInCategory} selected)` : ""}
                      </span>
                      <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                    {open && (
                      <div className="space-y-4 border-t border-black/[0.06] px-3 py-3">
                        {cg.groups.map((g) => (
                          <div key={g.key}>
                            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">{fmt.selectionGroupLabel(g.key)}</p>
                            <PillGroup
                              value={groupSelections[g.key] ?? "none"}
                              onChange={(v) => setGroupSelections((s) => ({ ...s, [g.key]: v === "none" ? "" : v }))}
                              options={[{ value: "none", label: "None" }, ...g.items.map((a) => ({ value: a.id, label: `${a.variant ?? a.name} (${fmt.addOnPriceString(a)})` }))]}
                            />
                          </div>
                        ))}
                        {cg.individual.map((a) => (
                          <ExtraRow key={a.id} a={a} qty={extraQuantities[a.id] ?? 0} onQtyChange={(v) => setExtraQuantities((s) => ({ ...s, [a.id]: v }))} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="bg-rose-50/60 p-5">
        {/* Round 5 rule 8: the input callout line restates the current selection above the
            breakdown ("190 guests · Opulence · Saturday"). */}
        <p className="mb-1 text-xs text-gray-500">{fmt.calculatorInputCallout(guests, currentTierName, day)}</p>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Estimated cost (illustrative only, not a quote)</p>
        <table className="w-full text-sm text-gray-600">
          <tbody>
            <tr>
              <td className="pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                Venue
              </td>
            </tr>
            {venueLines ? (
              venueLines.map((l, i) => (
                <tr key={i} className="border-t border-black/[0.06]">
                  <td className="py-1.5 pl-1">{l.label}</td>
                  <td className="py-1.5 text-right">{fmt.money(l.amount)}</td>
                </tr>
              ))
            ) : (
              <tr className="border-t border-black/[0.06] text-gray-400">
                <td className="py-1.5 pl-1">Venue rental</td>
                <td className="py-1.5 text-right italic">Included in package</td>
              </tr>
            )}
            {otherGroups.map((g) => (
              <Fragment key={g.group}>
                <tr>
                  <td className="pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                    {GROUP_LABELS[g.group]}
                  </td>
                </tr>
                {g.lines.map((l, i) => (
                  <tr key={i} className="border-t border-black/[0.06]">
                    <td className="py-1.5 pl-1">{l.label}</td>
                    <td className="py-1.5 text-right">{fmt.money(l.amount)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr>
              <td className="pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                Taxes
              </td>
            </tr>
            {taxesGroup?.lines.map((l, i) => (
              <tr key={i} className="border-t border-black/[0.06]">
                <td className="py-1.5 pl-1">{l.label}</td>
                <td className="py-1.5 text-right">{fmt.money(l.amount)}</td>
              </tr>
            ))}
            {salesTaxFallback && (
              <tr className="border-t border-black/[0.06]">
                <td className="py-1.5 pl-1 italic text-gray-400" colSpan={2}>
                  {salesTaxFallback}
                </td>
              </tr>
            )}
            <tr className="border-t border-black/[0.1] font-medium text-gray-900">
              {/* Round-3 fix: "(includes tax)" is only true when a real tax is actually being
                  computed — a venue whose tax status is genuinely unknown (Diamond Garden) gets
                  the plain label instead of implying a tax that was never applied. */}
              <td className="py-2">{venue.pricing.rates.sales_tax_source === "unknown" ? "Estimated total" : "Estimated total (includes tax)"}</td>
              <td className="py-2 text-right">{fmt.money(estimate.total)}</td>
            </tr>
          </tbody>
        </table>

        {estimate.not_included.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Not included above</p>
            <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
              {estimate.not_included.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        {estimate.warnings.length > 0 && (
          <div className="mt-3 space-y-0.5 text-xs text-amber-600">
            {estimate.warnings.map((w) => (
              // Round-3 fix: "under_minimum" names the actual day-specific (or general) minimum
              // that was missed, instead of one static sentence for every venue and day.
              <p key={w}>{w === "under_minimum" ? (fmt.underMinimumMessage(currentPath, guests, day, season) ?? WARNING_LABELS[w]) : (WARNING_LABELS[w] ?? w)}</p>
            ))}
          </div>
        )}
        {estimate.assumptions.map((a) => (
          <p key={a} className="mt-1 text-xs text-gray-400">
            {a}
          </p>
        ))}
      </div>

      {/* Round 5 rule 8: the example-range bar, ported from the concept calculators — cheapest vs
          priciest realistic booking on the currently-selected path. */}
      {exampleRange && (
        <div className="border-t border-black/[0.06] p-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Example range (any guest count, day, or package)</p>
          <div className="flex items-baseline justify-between text-sm font-semibold text-gray-900">
            <span>{fmt.money(exampleRange.low)}</span>
            <span>{fmt.money(exampleRange.high)}</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gradient-to-r from-rose-200 to-rose-400" />
          <div className="mt-1.5 flex items-baseline justify-between text-[11px] text-gray-400">
            <span>{fmt.calculatorRangeLabel(exampleRange.lowInput)}</span>
            <span>{fmt.calculatorRangeLabel(exampleRange.highInput)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
