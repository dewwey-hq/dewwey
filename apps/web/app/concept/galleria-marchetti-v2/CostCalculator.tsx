"use client";

import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { marchetti } from "./data";

function money(n: number): string {
  return `$${n.toLocaleString()}`;
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

export function CostCalculator() {
  const [guests, setGuests] = useState(150);
  const [spaceIndex, setSpaceIndex] = useState(1); // La Pergola default — fits 150 well
  const [day, setDay] = useState<"Friday" | "Saturday" | "Sunday">("Saturday");
  const [packageKey, setPackageKey] = useState<"argento" | "oro" | "platino">("oro");

  const space = marchetti.spaces[spaceIndex];
  const pkg = marchetti.packages.find((p) => p.key === packageKey)!;

  const { venueFee, foodAndBar, productionFee, total, overCapacity } = useMemo(() => {
    const venueFee = space.fees.find((f) => f.day === day)?.amount ?? 0;
    const foodAndBar = guests * pkg.perGuest;
    const productionFee = Math.round(foodAndBar * (marchetti.additionalCosts.productionFeePercent / 100));
    return {
      venueFee,
      foodAndBar,
      productionFee,
      total: venueFee + foodAndBar + productionFee,
      overCapacity: guests > space.capacity.seatedDining,
    };
  }, [space, day, guests, pkg]);

  const step = (delta: number) => setGuests((g) => Math.max(10, Math.min(900, g + delta)));

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
      {/* Inputs — one compact row, divided into even columns with rule lines between them
          instead of relying on grid gap (which read as uneven spacing before). */}
      <div className="p-5">
        <div className="grid grid-cols-2 divide-x divide-black/[0.06] sm:grid-cols-4">
          <div className="px-2 text-center first:pl-0 sm:px-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Guests</p>
            <div className="inline-flex items-center gap-3 rounded-full border border-black/[0.1] px-1.5 py-1">
              <button type="button" onClick={() => step(-10)} className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Fewer guests">
                <Minus size={12} />
              </button>
              <span className="w-8 text-center text-sm font-semibold tabular-nums text-gray-900">{guests}</span>
              <button type="button" onClick={() => step(10)} className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="More guests">
                <Plus size={12} />
              </button>
            </div>
          </div>
          <div className="px-2 text-center sm:px-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Space</p>
            <PillGroup value={spaceIndex} onChange={setSpaceIndex} options={marchetti.spaces.map((s, i) => ({ value: i, label: s.name }))} />
          </div>
          <div className="px-2 text-center sm:px-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Day</p>
            <PillGroup value={day} onChange={setDay} options={(["Friday", "Saturday", "Sunday"] as const).map((d) => ({ value: d, label: d }))} />
          </div>
          <div className="px-2 text-center sm:px-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Package</p>
            <PillGroup value={packageKey} onChange={setPackageKey} options={marchetti.packages.map((p) => ({ value: p.key as typeof packageKey, label: p.name }))} />
          </div>
        </div>
        {overCapacity && (
          <p className="mt-3 text-center text-xs font-medium text-amber-700">
            {guests} guests is above {space.name}&apos;s seated capacity ({space.capacity.seatedDining}). Estimate assumes it fits anyway.
          </p>
        )}
      </div>

      {/* Financials — visually separated from the inputs above */}
      <div className="bg-rose-50/60 p-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Estimated cost (illustrative only, not a quote)</p>
        <table className="w-full text-sm text-gray-600">
          <tbody>
            <tr>
              <td className="py-1.5">
                Venue rental: {space.name}, {day}
              </td>
              <td className="py-1.5 text-right">{money(venueFee)}</td>
            </tr>
            <tr className="border-t border-black/[0.06]">
              <td className="py-1.5">
                {pkg.name} package ({guests} × ${pkg.perGuest}/guest)
              </td>
              <td className="py-1.5 text-right">{money(foodAndBar)}</td>
            </tr>
            <tr className="border-t border-black/[0.06]">
              <td className="py-1.5">Production fee ({marchetti.additionalCosts.productionFeePercent}% of food & bar)</td>
              <td className="py-1.5 text-right">{money(productionFee)}</td>
            </tr>
            <tr className="border-t border-black/[0.1] font-medium text-gray-900">
              <td className="py-2">Estimated total (before tax)</td>
              <td className="py-2 text-right">{money(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
