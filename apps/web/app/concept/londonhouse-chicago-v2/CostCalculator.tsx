"use client";

/**
 * v2: sales tax and service charge moved out of the "Food & beverage" group into their own
 * "Taxes" group header (golden-set-template.md §2's locked rule — give the tax line its own
 * group header row, don't let it trail as the last line item under whatever group happens to
 * render above it). v1 had both lines sitting inside "Food & beverage" with no header of their
 * own. Everything else — guest stepper + range reminder (this calculator's own original
 * pattern, since generalized to the rest of the golden set), package/ceremony PillGroups, the
 * example range below — is unchanged from v1.
 *
 * Feedback pass (2026-08-27):
 * - The old order (Venue, Food & beverage, Taxes, then Ceremony last) put Ceremony's own charge
 *   and tax underneath the general Taxes group, which read as two separate, confusing tax
 *   groups. Reordered so every real charge (Venue, Food & beverage, Ceremony, Add-ons) comes
 *   first, and a single consolidated Taxes group — service charge, F&B sales tax, ceremony tax,
 *   add-on tax — sits right before the total, same shape an invoice would use.
 * - Added a real "Add extras" panel (§2's locked collapsed-by-default shape, Diamond Garden's
 *   pattern): Corkage fee is the only add-on with a real, non-conditional dollar figure
 *   (Pre-reception/Late-night snacks have no published rate, so per §2 they're excluded from
 *   the selectable set — they still show in the static Add-ons & extras list above). Taxed at
 *   the general sales tax rate, same as food & beverage — not the ceremony fee's own 15.75%,
 *   which is a distinct, higher rate specific to that one fee.
 */

import { useMemo, useState } from "react";
import { Minus, Plus, ChevronDown } from "lucide-react";
import { londonhouse } from "./data";

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function PillGroup<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; sublabel?: string }[];
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
              active ? "border-rose-400 bg-rose-400 text-white hover:bg-rose-500 hover:border-rose-500" : "border-black/[0.1] bg-white text-gray-700 hover:border-rose-300"
            }`}
          >
            {opt.label}
            {opt.sublabel ? <span className={`ml-1 ${active ? "text-white/70" : "text-gray-400"}`}>{opt.sublabel}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

const GUEST_MIN = 20;
const GUEST_MAX = 350; // largest applicable capacity (Juliette, cocktail-style)
const TYPICAL_MIN = 60; // Étoile's stated seated minimum
const TYPICAL_MAX = 190; // Juliette's stated seated maximum

// Shared by the interactive total and the range below — food & beverage math only (no
// ceremony), since the range is meant to bound the base cost, not every optional add-on.
function foodAndBeverageTotal(guests: number, perGuest: number) {
  const foodAndBar = guests * perGuest;
  const serviceCharge = Math.round(foodAndBar * (londonhouse.pricing.serviceChargePercent / 100));
  const salesTax = Math.round((foodAndBar + serviceCharge) * (londonhouse.pricing.salesTaxPercent / 100));
  return foodAndBar + serviceCharge + salesTax;
}

export function CostCalculator() {
  const [guests, setGuests] = useState(120);
  const [packageKey, setPackageKey] = useState<(typeof londonhouse.packages)[number]["key"]>("luxury");
  const [ceremonyAtHotel, setCeremonyAtHotel] = useState<"yes" | "no">("yes");
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [corkageBottles, setCorkageBottles] = useState(0);

  const pkg = londonhouse.packages.find((p) => p.key === packageKey)!;

  const { foodAndBar, ceremonyFee, corkageCost, serviceCharge, salesTax, ceremonyTax, corkageTax, total } = useMemo(() => {
    const foodAndBar = guests * pkg.perGuest;
    const ceremonyFee = ceremonyAtHotel === "yes" ? londonhouse.pricing.ceremonyFee : 0;
    const corkageCost = corkageBottles * londonhouse.pricing.corkagePerBottle;

    const serviceCharge = Math.round(foodAndBar * (londonhouse.pricing.serviceChargePercent / 100));
    const salesTax = Math.round((foodAndBar + serviceCharge) * (londonhouse.pricing.salesTaxPercent / 100));
    const ceremonyTax = ceremonyAtHotel === "yes" ? Math.round(ceremonyFee * (londonhouse.pricing.ceremonyFeeTaxPercent / 100)) : 0;
    const corkageTax = corkageBottles > 0 ? Math.round(corkageCost * (londonhouse.pricing.salesTaxPercent / 100)) : 0;
    const taxesTotal = serviceCharge + salesTax + ceremonyTax + corkageTax;

    return {
      foodAndBar,
      ceremonyFee,
      corkageCost,
      serviceCharge,
      salesTax,
      ceremonyTax,
      corkageTax,
      taxesTotal,
      total: foodAndBar + ceremonyFee + corkageCost + taxesTotal,
    };
  }, [guests, pkg, ceremonyAtHotel, corkageBottles]);

  // Floor-to-ceiling range: cheapest realistic booking to priciest. Uses TYPICAL_MIN (Étoile's
  // stated seated minimum), not the slider's technical floor (20) — a 20-guest event isn't a
  // credible booking for this venue, so it made the range read as a stretch, not a real quote.
  const { rangeLow, rangeHigh } = useMemo(() => {
    const cheapest = londonhouse.packages.reduce((a, b) => (a.perGuest < b.perGuest ? a : b));
    const priciest = londonhouse.packages.reduce((a, b) => (a.perGuest > b.perGuest ? a : b));
    return {
      rangeLow: foodAndBeverageTotal(TYPICAL_MIN, cheapest.perGuest),
      rangeHigh: foodAndBeverageTotal(TYPICAL_MAX, priciest.perGuest),
    };
  }, []);

  const step = (delta: number) => setGuests((g) => Math.max(GUEST_MIN, Math.min(GUEST_MAX, g + delta)));
  const setGuestsClamped = (n: number) => {
    if (Number.isNaN(n)) return;
    setGuests(Math.max(GUEST_MIN, Math.min(GUEST_MAX, Math.round(n))));
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
      <div className="p-5">
        <div className="grid grid-cols-1 divide-y divide-black/[0.06] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-2 pb-4 text-center sm:px-4 sm:pb-0">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Guests</p>
            <div className="inline-flex items-center gap-3 rounded-full border border-black/[0.1] px-1.5 py-1">
              <button type="button" onClick={() => step(-10)} className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Fewer guests">
                <Minus size={12} />
              </button>
              <input
                type="number"
                inputMode="numeric"
                value={guests}
                onChange={(e) => setGuestsClamped(e.target.valueAsNumber)}
                className="w-10 border-none bg-transparent text-center text-sm font-semibold tabular-nums text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                aria-label="Number of guests"
              />
              <button type="button" onClick={() => step(10)} className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="More guests">
                <Plus size={12} />
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">
              {TYPICAL_MIN}–{TYPICAL_MAX} seated
            </p>
          </div>
          <div className="px-2 py-4 text-center sm:px-4 sm:py-0">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Package</p>
            <PillGroup value={packageKey} onChange={setPackageKey} options={londonhouse.packages.map((p) => ({ value: p.key, label: p.name, sublabel: `$${p.perGuest}` }))} />
          </div>
          <div className="px-2 pt-4 text-center sm:px-4 sm:pt-0">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Ceremony at hotel?</p>
            <PillGroup
              value={ceremonyAtHotel}
              onChange={setCeremonyAtHotel}
              options={[
                { value: "yes" as const, label: "Yes", sublabel: `+$${londonhouse.pricing.ceremonyFee}` },
                { value: "no" as const, label: "No" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Add extras — §2's locked collapsed-by-default shape (Diamond Garden's pattern).
          Corkage is the only real add-on with a fixed, unconditional dollar figure; the
          snacks add-ons have no published rate, so they stay reference-only in the static
          Add-ons & extras list above and aren't selectable here. */}
      <div className="border-t border-black/[0.06] px-5 py-3">
        <button
          type="button"
          onClick={() => setExtrasOpen((o) => !o)}
          className="flex w-full items-center justify-between text-sm font-medium text-gray-700"
        >
          <span>
            Add extras{corkageBottles > 0 ? ` (${corkageBottles} selected)` : ""}
          </span>
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${extrasOpen ? "rotate-180" : ""}`} />
        </button>
        {extrasOpen && (
          <div className="mt-3 flex items-center justify-between gap-3 text-sm text-gray-700">
            <div>
              <p className="font-medium text-gray-900">Corkage fee</p>
              <p className="text-xs text-gray-500">Bring your own wine or liquor, ${londonhouse.pricing.corkagePerBottle}/bottle.</p>
            </div>
            <div className="flex shrink-0 items-center gap-3 rounded-full border border-black/[0.1] px-1.5 py-1">
              <button
                type="button"
                onClick={() => setCorkageBottles((n) => Math.max(0, n - 1))}
                className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="Fewer bottles"
              >
                <Minus size={12} />
              </button>
              <span className="w-6 text-center text-sm font-semibold tabular-nums text-gray-900">{corkageBottles}</span>
              <button
                type="button"
                onClick={() => setCorkageBottles((n) => Math.min(24, n + 1))}
                className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="More bottles"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-rose-50/60 p-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Estimated cost (illustrative only, not a quote)</p>
        <table className="w-full text-sm text-gray-600">
          <tbody>
            <tr>
              <td className="pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                Venue
              </td>
            </tr>
            <tr className="border-t border-black/[0.06] text-gray-400">
              <td className="py-1.5 pl-1">Venue rental</td>
              <td className="py-1.5 text-right italic">Included in package</td>
            </tr>

            <tr>
              <td className="pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                Food & beverage
              </td>
            </tr>
            <tr className="border-t border-black/[0.06]">
              <td className="py-1.5 pl-1">
                {pkg.name} package ({guests} × ${pkg.perGuest}/guest)
              </td>
              <td className="py-1.5 text-right">{money(foodAndBar)}</td>
            </tr>

            {ceremonyAtHotel === "yes" && (
              <>
                <tr>
                  <td className="pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                    Ceremony
                  </td>
                </tr>
                <tr className="border-t border-black/[0.06]">
                  <td className="py-1.5 pl-1">On-site ceremony fee</td>
                  <td className="py-1.5 text-right">{money(ceremonyFee)}</td>
                </tr>
              </>
            )}

            {corkageBottles > 0 && (
              <>
                <tr>
                  <td className="pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                    Add-ons
                  </td>
                </tr>
                <tr className="border-t border-black/[0.06]">
                  <td className="py-1.5 pl-1">
                    Corkage fee ({corkageBottles} × ${londonhouse.pricing.corkagePerBottle}/bottle)
                  </td>
                  <td className="py-1.5 text-right">{money(corkageCost)}</td>
                </tr>
              </>
            )}

            <tr>
              <td className="pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                Taxes
              </td>
            </tr>
            <tr className="border-t border-black/[0.06]">
              <td className="py-1.5 pl-1">Service charge ({londonhouse.pricing.serviceChargePercent}%, on food & beverage)</td>
              <td className="py-1.5 text-right">{money(serviceCharge)}</td>
            </tr>
            <tr className="border-t border-black/[0.06]">
              <td className="py-1.5 pl-1">Sales tax ({londonhouse.pricing.salesTaxPercent}%, on food & beverage)</td>
              <td className="py-1.5 text-right">{money(salesTax)}</td>
            </tr>
            {ceremonyAtHotel === "yes" && (
              <tr className="border-t border-black/[0.06]">
                <td className="py-1.5 pl-1">Ceremony fee tax ({londonhouse.pricing.ceremonyFeeTaxPercent}%)</td>
                <td className="py-1.5 text-right">{money(ceremonyTax)}</td>
              </tr>
            )}
            {corkageBottles > 0 && (
              <tr className="border-t border-black/[0.06]">
                <td className="py-1.5 pl-1">Corkage sales tax ({londonhouse.pricing.salesTaxPercent}%)</td>
                <td className="py-1.5 text-right">{money(corkageTax)}</td>
              </tr>
            )}
            <tr className="border-t border-black/[0.1] font-medium text-gray-900">
              <td className="py-2">Estimated total (includes tax)</td>
              <td className="py-2 text-right">{money(total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-500">Doesn&apos;t include the food & beverage minimum (amount not published) or add-ons with no published rate (pre-reception/late-night snacks — see Add-ons & extras above).</p>
      </div>

      {/* Floor-to-ceiling range — cheapest realistic booking to priciest, food & beverage
          only (no ceremony fee or add-ons, since those are optional, not baseline). */}
      <div className="border-t border-black/[0.06] p-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Example range ({TYPICAL_MIN}–{TYPICAL_MAX} guests, any package)</p>
        <div className="flex items-baseline justify-between text-sm font-semibold text-gray-900">
          <span>{money(rangeLow)}</span>
          <span>{money(rangeHigh)}</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gradient-to-r from-rose-200 to-rose-400" />
        <div className="mt-1.5 flex items-baseline justify-between text-[11px] text-gray-400">
          <span>{TYPICAL_MIN} guests, Elegance</span>
          <span>{TYPICAL_MAX} guests, Opulence</span>
        </div>
      </div>
    </div>
  );
}
