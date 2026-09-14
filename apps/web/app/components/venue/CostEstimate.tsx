"use client";

/**
 * Generic Cost Estimate calculator (D060 Phase 1b): a 3-column fixed-input grid (Guests always
 * first, then every axis `calculatorAxes` says this venue actually varies by) over a
 * collapsed-by-default "Add extras" panel, then the breakdown table `estimateCost` already
 * groups in the locked order (Venue / Food & beverage / Ceremony / Add-ons, then Taxes, then the
 * total) — golden-set-template.md §2. Illustrative only, never framed as a quote.
 *
 * PUNCH LIST: `calculatorAxes` can return a "band" axis (a capacity constraint like "live band"
 * vs "DJ" — see `CapacityTuple.condition`), but `EstimateInput`/`estimateCost` has no field for
 * it — there's nowhere to plumb a selection through. Not rendered here; flagged rather than
 * silently faked. `event_year` surcharges are also unwired (no UI axis names a year to compare).
 */

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { calculatorAxes, defaultAxes, estimateCost, headlineCapacity, type EstimateInput } from "@/lib/venueDetails/derive";
import type { AddOn, Day, EstimateExtra, Season, VenueDetailsV3 } from "@/lib/venueDetails/types";
import * as fmt from "./format";

function PillGroup<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
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
      <span className="w-8 text-center text-sm font-semibold tabular-nums text-gray-900">{value}</span>
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

function selectableAddOns(addOns: AddOn[]): AddOn[] {
  return addOns.filter((a) => a.group !== "ceremony" && a.priceable !== false && (a.price != null || (a.per_space_prices != null && Object.keys(a.per_space_prices).length > 0)));
}

export function CostEstimate({ venue }: { venue: VenueDetailsV3 }) {
  const axes = useMemo(() => calculatorAxes(venue), [venue]);
  const hc = useMemo(() => headlineCapacity(venue), [venue]);
  const base = useMemo(() => defaultAxes(venue), [venue]);

  const [guests, setGuests] = useState(base.guests);
  const [pathId, setPathId] = useState<string | undefined>(base.path_id);
  const [spaceId, setSpaceId] = useState<string | undefined>(base.space_id);
  const [day, setDay] = useState<Day>(base.day);
  const [season, setSeason] = useState<Season>(base.season);
  const [tierId, setTierId] = useState<string | undefined>(base.tier_id);
  const [ceremonyOnSite, setCeremonyOnSite] = useState(base.ceremonyOnSite);
  const [payment, setPayment] = useState<"cash_check" | "credit_card">(base.payment ?? "cash_check");
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [extraQuantities, setExtraQuantities] = useState<Record<string, number>>({});

  const rangeReminder = fmt.guestRangeReminder(hc.guest_range);

  if (venue.pricing.paths.length === 0) {
    return (
      <div className="rounded-2xl border border-black/[0.06] bg-gray-50 p-5 text-sm text-gray-500">
        Pricing on request. {venue.name} does not publish fixed pricing anywhere on its site; contact them directly for a quote.
      </div>
    );
  }

  const currentPath = venue.pricing.paths.find((p) => p.id === pathId) ?? venue.pricing.paths[0];
  const addOns = selectableAddOns(venue.pricing.add_ons);
  const dayOptions = fmt.pathDayOptions(currentPath);
  const seasonOptions = fmt.pathSeasonOptions(currentPath);
  const tierOptions = fmt.pathTierOptions(currentPath);

  const extras: EstimateExtra[] = addOns.map((a) => ({ add_on_id: a.id, quantity: extraQuantities[a.id] ?? 0 })).filter((e) => e.quantity > 0);

  const input: EstimateInput = {
    guests,
    day,
    season,
    path_id: currentPath.id,
    tier_id: tierId,
    space_id: spaceId,
    ceremonyOnSite,
    payment,
    extras,
  };

  const estimate = estimateCost(venue, input);
  const selectedCount = Object.values(extraQuantities).filter((q) => q > 0).length;

  // Fix round: the template's Taxes group is always present, even when there's genuinely
  // nothing to compute (a 0% service charge and no separate sales-tax line) — the sales-tax
  // *source* is itself a fact worth stating, as a grey row, rather than silently dropping the
  // whole group (derive.ts's `estimateCost` filters a group out entirely once its lines are
  // empty, so this group may not even appear in `estimate.groups`).
  const otherGroups = estimate.groups.filter((g) => g.group !== "taxes");
  const taxesGroup = estimate.groups.find((g) => g.group === "taxes");
  const hasSalesTaxLine = taxesGroup?.lines.some((l) => l.label.startsWith("Sales tax")) ?? false;
  const salesTaxFallback = hasSalesTaxLine
    ? null
    : venue.pricing.rates.sales_tax_source === "included"
      ? "Taxes & fees: Included in rental rate"
      : venue.pricing.rates.sales_tax_source === "unknown"
        ? "Taxes & fees: Not stated"
        : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
      <div className="p-5">
        {/* Fix round (2026-09-13 review): columns = 1 (Guests) + however many axes this venue
            actually varies by, never more than 4 per row so a 4th+ axis (e.g. "On-site
            ceremony?") never wraps into an orphan single-column row under Guests. Extra axes
            beyond 4 simply wrap to a second row of the same grid. */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-3 sm:divide-x sm:divide-black/[0.06] lg:grid-cols-4">
          <AxisColumn label="Guests">
            <Stepper value={guests} onChange={setGuests} min={1} step={10} />
            {rangeReminder && <p className="mt-1.5 text-[11px] text-gray-400">{rangeReminder}</p>}
          </AxisColumn>

          {axes.includes("path") && (
            <AxisColumn label="Package">
              <PillGroup value={currentPath.id} onChange={setPathId} options={venue.pricing.paths.map((p) => ({ value: p.id, label: p.name }))} />
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

      {addOns.length > 0 && (
        <div className="border-t border-black/[0.06] px-5 py-3">
          <button type="button" onClick={() => setExtrasOpen((o) => !o)} className="flex w-full items-center justify-between text-sm font-medium text-gray-700">
            <span>Add extras{selectedCount > 0 ? ` (${selectedCount} selected)` : ""}</span>
            <ChevronDown size={16} className={`text-gray-400 transition-transform ${extrasOpen ? "rotate-180" : ""}`} />
          </button>
          {extrasOpen && (
            <div className="mt-3 space-y-3">
              {addOns.map((a) => {
                const qty = extraQuantities[a.id] ?? 0;
                const perUnit = a.unit === "per_unit" || a.unit === "per_hour";
                return (
                  <div key={a.id} className="flex items-center justify-between gap-3 text-sm text-gray-700">
                    <div>
                      <p className="font-medium text-gray-900">{a.name}</p>
                      <p className="text-xs text-gray-500">
                        {fmt.addOnPriceString(a)}
                        {a.note ? ` — ${a.note}` : ""}
                      </p>
                    </div>
                    {perUnit ? (
                      <Stepper value={qty} onChange={(v) => setExtraQuantities((s) => ({ ...s, [a.id]: v }))} max={50} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setExtraQuantities((s) => ({ ...s, [a.id]: qty > 0 ? 0 : 1 }))}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          qty > 0 ? "border-rose-400 bg-rose-400 text-white" : "border-black/[0.1] bg-white text-gray-700 hover:border-rose-300"
                        }`}
                      >
                        {qty > 0 ? "Added" : "Add"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="bg-rose-50/60 p-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Estimated cost (illustrative only, not a quote)</p>
        <table className="w-full text-sm text-gray-600">
          <tbody>
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
              <td className="py-2">Estimated total (includes tax)</td>
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
              <p key={w}>{WARNING_LABELS[w] ?? w}</p>
            ))}
          </div>
        )}
        {estimate.assumptions.map((a) => (
          <p key={a} className="mt-1 text-xs text-gray-400">
            {a}
          </p>
        ))}
      </div>
    </div>
  );
}
