"use client";

/**
 * Restructured (feedback 2026-08-25) to follow LondonHouse's calculator pattern for the fixed
 * inputs and category-grouped breakdown, plus Diamond Garden's collapsible "Add extras" panel
 * (chevron toggle) for the two real optional add-ons (parking, rehearsal) instead of always-
 * visible chips. "Band" now has its own labeled Yes/No input, same visual language as Day/Season,
 * instead of an unlabeled checkbox. Payment method is its own fixed input, not an "extra" —
 * feedback 2026-08-25: "I don't think paying by credit card is an extra... pull that out as a
 * cost input." "Taxes & fees" is shown explicitly as an "included" line, the same way LondonHouse
 * shows its service charge and sales tax explicitly — the real difference here is that Greenhouse
 * Loft's own FAQ states taxes are already built into the rental rate, so there's nothing to add on
 * top, and the line makes that a stated fact instead of a silent omission. Required event
 * insurance is its own "Not included above" table row with a real estimate, not summed into the
 * total since it's paid to a third party, not to Greenhouse Loft.
 *
 * 2026-08-26 (feedback): guest range reminder added under the stepper, same spot as LondonHouse's
 * "60-190 seated" note, so a couple knows where they sit against this venue's real min/max before
 * dragging the slider. Peak season now listed before off-season (matches the pricing table's own
 * Off-season-then-Peak *row* order being read the other way at a glance — peak is what most
 * couples actually pick first) and Band's Yes now precedes No, both to read left-to-right the way
 * a person would say the answer, not alphabetically/negatively-first.
 */

import { useMemo, useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { greenhouseLoft } from "./data";

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function PillGroup<T extends string>({
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

function Chip({ label, sublabel, active, onClick }: { label: string; sublabel: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors ${
        active ? "border-rose-400 bg-rose-400 text-white hover:bg-rose-500 hover:border-rose-500" : "border-black/[0.1] bg-white text-gray-700 hover:border-rose-300"
      }`}
    >
      {label}
      <span className={`ml-1 ${active ? "text-white/70" : "text-gray-400"}`}>{sublabel}</span>
    </button>
  );
}

const GUEST_MIN = 25;
const GUEST_MAX = 200;
const BAND_GUEST_CAP = 125;

type Day = "friday" | "saturday" | "sunday";
type Season = "offSeason" | "peakSeason";
type Payment = "other" | "creditCard";

const DAY_OPTIONS: { value: Day; label: string }[] = [
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

export function CostCalculator() {
  const { pricing, calculatorAddOns } = greenhouseLoft;

  const [guests, setGuests] = useState(150);
  const [day, setDay] = useState<Day>("saturday");
  const [season, setSeason] = useState<Season>("peakSeason");
  const [wantsBand, setWantsBand] = useState(false);
  const [payment, setPayment] = useState<Payment>("other");

  const [showAddOns, setShowAddOns] = useState(false);
  const [extraParking, setExtraParking] = useState(false);
  const [rehearsalHours, setRehearsalHours] = useState(0);

  const step = (delta: number) => setGuests((g) => Math.max(GUEST_MIN, Math.min(GUEST_MAX, g + delta)));
  const setGuestsClamped = (n: number) => {
    if (Number.isNaN(n)) return;
    setGuests(Math.max(GUEST_MIN, Math.min(GUEST_MAX, Math.round(n))));
  };

  const extrasSelectedCount = (extraParking ? 1 : 0) + (rehearsalHours > 0 ? 1 : 0);

  const { rentalFee, addOnLines, addOnsSubtotal, ccFee, total } = useMemo(() => {
    const rentalFee = pricing[season][day];

    const addOnLines: { label: string; amount: number }[] = [];
    if (extraParking) addOnLines.push({ label: "75 additional indoor parking spaces", amount: calculatorAddOns.extraParking.price });
    if (rehearsalHours > 0) addOnLines.push({ label: `Rehearsal (${rehearsalHours} hr × ${money(calculatorAddOns.rehearsal.pricePerHour)})`, amount: rehearsalHours * calculatorAddOns.rehearsal.pricePerHour });
    const addOnsSubtotal = addOnLines.reduce((sum, l) => sum + l.amount, 0);

    const ccFee = payment === "creditCard" ? (rentalFee + addOnsSubtotal) * calculatorAddOns.ccFeeRate : 0;

    return { rentalFee, addOnLines, addOnsSubtotal, ccFee, total: rentalFee + addOnsSubtotal + ccFee };
  }, [day, season, extraParking, rehearsalHours, payment, pricing, calculatorAddOns]);

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
      <div className="p-5">
        <div className="grid grid-cols-1 divide-y divide-black/[0.06] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-2 pb-4 text-center sm:px-4 sm:pb-0">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Guests</p>
            <div className="inline-flex items-center gap-3 rounded-full border border-black/[0.1] px-1.5 py-1">
              <button type="button" onClick={() => step(-5)} className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Fewer guests">
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
              <button type="button" onClick={() => step(5)} className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="More guests">
                <Plus size={12} />
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">
              {GUEST_MIN}–{GUEST_MAX} guests
            </p>
          </div>
          <div className="px-2 py-4 text-center sm:px-4 sm:py-0">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Day</p>
            <PillGroup value={day} onChange={setDay} options={DAY_OPTIONS} />
          </div>
          <div className="px-2 pt-4 text-center sm:px-4 sm:pt-0">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Season</p>
            <PillGroup
              value={season}
              onChange={setSeason}
              options={[
                { value: "peakSeason", label: "Peak season" },
                { value: "offSeason", label: "Off-season" },
              ]}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 divide-y divide-black/[0.06] border-t border-black/[0.06] pt-4 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="px-2 pb-4 text-center sm:px-4 sm:pb-0">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Band</p>
            <PillGroup
              value={wantsBand ? "yes" : "no"}
              onChange={(v) => setWantsBand(v === "yes")}
              options={[
                { value: "yes" as const, label: "Yes" },
                { value: "no" as const, label: "No" },
              ]}
            />
            {wantsBand && guests > BAND_GUEST_CAP && (
              <p className="mt-2 text-xs font-medium text-amber-700">
                Recommended max with a band is {BAND_GUEST_CAP} guests. See the floor plans for details.
              </p>
            )}
          </div>
          <div className="px-2 pt-4 text-center sm:px-4 sm:pt-0">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Payment method</p>
            <PillGroup
              value={payment}
              onChange={setPayment}
              options={[
                { value: "other" as const, label: "Cash / check" },
                { value: "creditCard" as const, label: "Credit card", sublabel: `+${(calculatorAddOns.ccFeeRate * 100).toFixed(1)}%` },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Add extras — collapsed by default, same pattern as Diamond Garden's calculator (chevron
          toggle, count badge) instead of always-visible chips. */}
      <div className="border-t border-black/[0.06] px-5 py-3">
        <button type="button" onClick={() => setShowAddOns((s) => !s)} className="flex w-full items-center justify-between text-sm font-medium text-gray-700">
          <span>
            Add extras {extrasSelectedCount > 0 && <span className="text-gray-400">({extrasSelectedCount} selected)</span>}
          </span>
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${showAddOns ? "rotate-180" : ""}`} />
        </button>
        {showAddOns && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Chip label="75 extra indoor parking spaces" sublabel={money(calculatorAddOns.extraParking.price)} active={extraParking} onClick={() => setExtraParking((v) => !v)} />
            </div>
            <div className="flex items-center gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Rehearsal hours</p>
              <div className="inline-flex items-center gap-2 rounded-full border border-black/[0.1] px-1.5 py-1">
                <button type="button" onClick={() => setRehearsalHours((h) => Math.max(0, h - 1))} className="flex h-5 w-5 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Fewer rehearsal hours">
                  <Minus size={10} />
                </button>
                <span className="w-5 text-center text-xs font-semibold tabular-nums text-gray-900">{rehearsalHours}</span>
                <button type="button" onClick={() => setRehearsalHours((h) => Math.min(8, h + 1))} className="flex h-5 w-5 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="More rehearsal hours">
                  <Plus size={10} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-rose-50/60 p-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Estimated cost (illustrative only, not a quote)</p>
        <table className="w-full text-sm text-gray-600">
          <tbody>
            <tr>
              <td className="pb-1 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                Venue
              </td>
            </tr>
            <tr className="border-t border-black/[0.06]">
              <td className="py-1.5 pl-1">
                Venue rental ({day[0].toUpperCase()}
                {day.slice(1)}, {season === "peakSeason" ? "peak" : "off"} season)
              </td>
              <td className="py-1.5 text-right">{money(rentalFee)}</td>
            </tr>
            <tr className="border-t border-black/[0.06] text-gray-400">
              <td className="py-1.5 pl-1">Taxes &amp; fees</td>
              <td className="py-1.5 text-right italic">Included in rental rate</td>
            </tr>

            {addOnLines.length > 0 && (
              <>
                <tr>
                  <td className="pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                    Add-ons
                  </td>
                </tr>
                {addOnLines.map((row) => (
                  <tr key={row.label} className="border-t border-black/[0.06]">
                    <td className="py-1.5 pl-1">{row.label}</td>
                    <td className="py-1.5 text-right">{money(row.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-black/[0.06] text-gray-500">
                  <td className="py-1.5 pl-1">Subtotal</td>
                  <td className="py-1.5 text-right">{money(addOnsSubtotal)}</td>
                </tr>
              </>
            )}

            {ccFee > 0 && (
              <>
                <tr>
                  <td className="pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                    Fees
                  </td>
                </tr>
                <tr className="border-t border-black/[0.06]">
                  <td className="py-1.5 pl-1">Credit card processing ({(calculatorAddOns.ccFeeRate * 100).toFixed(1)}%)</td>
                  <td className="py-1.5 text-right">{money(ccFee)}</td>
                </tr>
              </>
            )}

            <tr className="border-t border-black/[0.1] font-medium text-gray-900">
              <td className="py-2">Estimated total (includes tax)</td>
              <td className="py-2 text-right">{money(total)}</td>
            </tr>

            <tr>
              <td className="pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                Not included above
              </td>
            </tr>
            <tr className="border-t border-black/[0.06] text-gray-400">
              <td className="py-1.5 pl-1">Event insurance (required, paid to a third party)</td>
              <td className="py-1.5 text-right italic">~{money(calculatorAddOns.insuranceEstimate)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
