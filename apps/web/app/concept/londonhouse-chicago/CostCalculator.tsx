"use client";

import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
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

  const pkg = londonhouse.packages.find((p) => p.key === packageKey)!;

  const { foodAndBar, serviceCharge, salesTax, foodAndBarSubtotal, ceremonyFee, ceremonyTax, ceremonySubtotal, total } = useMemo(() => {
    const foodAndBar = guests * pkg.perGuest;
    const serviceCharge = Math.round(foodAndBar * (londonhouse.pricing.serviceChargePercent / 100));
    const salesTax = Math.round((foodAndBar + serviceCharge) * (londonhouse.pricing.salesTaxPercent / 100));
    const foodAndBarSubtotal = foodAndBar + serviceCharge + salesTax;
    const ceremonyFee = ceremonyAtHotel === "yes" ? londonhouse.pricing.ceremonyFee : 0;
    const ceremonyTax = ceremonyAtHotel === "yes" ? Math.round(ceremonyFee * (londonhouse.pricing.ceremonyFeeTaxPercent / 100)) : 0;
    const ceremonySubtotal = ceremonyFee + ceremonyTax;
    return {
      foodAndBar,
      serviceCharge,
      salesTax,
      foodAndBarSubtotal,
      ceremonyFee,
      ceremonyTax,
      ceremonySubtotal,
      total: foodAndBarSubtotal + ceremonySubtotal,
    };
  }, [guests, pkg, ceremonyAtHotel]);

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
            <tr className="border-t border-black/[0.06]">
              <td className="py-1.5 pl-1">Service charge ({londonhouse.pricing.serviceChargePercent}%)</td>
              <td className="py-1.5 text-right">{money(serviceCharge)}</td>
            </tr>
            <tr className="border-t border-black/[0.06]">
              <td className="py-1.5 pl-1">Sales tax ({londonhouse.pricing.salesTaxPercent}%)</td>
              <td className="py-1.5 text-right">{money(salesTax)}</td>
            </tr>
            <tr className="border-t border-black/[0.06] text-gray-500">
              <td className="py-1.5 pl-1">Subtotal</td>
              <td className="py-1.5 text-right">{money(foodAndBarSubtotal)}</td>
            </tr>
            {ceremonyAtHotel === "yes" && (
              <>
                <tr>
                  <td className="pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                    Ceremony
                  </td>
                </tr>
                <tr className="border-t border-black/[0.06]">
                  <td className="py-1.5 pl-1">Ceremony fee</td>
                  <td className="py-1.5 text-right">{money(ceremonyFee)}</td>
                </tr>
                <tr className="border-t border-black/[0.06]">
                  <td className="py-1.5 pl-1">Ceremony tax ({londonhouse.pricing.ceremonyFeeTaxPercent}%)</td>
                  <td className="py-1.5 text-right">{money(ceremonyTax)}</td>
                </tr>
                <tr className="border-t border-black/[0.06] text-gray-500">
                  <td className="py-1.5 pl-1">Subtotal</td>
                  <td className="py-1.5 text-right">{money(ceremonySubtotal)}</td>
                </tr>
              </>
            )}
            <tr className="border-t border-black/[0.1] font-medium text-gray-900">
              <td className="py-2">Estimated total (includes tax)</td>
              <td className="py-2 text-right">{money(total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-500">Doesn&apos;t include the food & beverage minimum (amount not published) or optional add-ons.</p>
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
