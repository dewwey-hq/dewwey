"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { marchetti } from "./data";

function money(n: number): string {
  return `$${n.toLocaleString()}`;
}

// Every price string on this page ("$12/guest", "$1,400 (7 swags) / $2,200 (13 swags)",
// "$175 / 4×8 section") starts with the number that matters for a running total — the
// swag-count/section detail is real but not independently selectable here, kept simple on
// purpose (see AddOnOption comment below).
function parseDollarAmount(s: string): number {
  const match = s.match(/\$([\d,]+)/);
  return match ? parseInt(match[1].replace(/,/g, ""), 10) : 0;
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

// Multi-select toggle chip — same visual language as PillGroup's active/inactive states, just
// checkbox behavior instead of single-select.
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

const GUEST_MIN = 10;
const GUEST_MAX = 900;
// Distinct from the slider's technical floor above — a 10-guest event isn't a credible
// booking to anchor a "range" on, so the range itself starts higher (see rangeLow below).
const RANGE_MIN = 50;

function total(guests: number, perGuest: number, venueFee: number) {
  const foodAndBar = guests * perGuest;
  const serviceCharge = Math.round(foodAndBar * (marchetti.additionalCosts.productionFeePercent / 100));
  const salesTax = Math.round((foodAndBar + serviceCharge) * (marchetti.additionalCosts.salesTaxPercent / 100));
  return venueFee + foodAndBar + serviceCharge + salesTax;
}

type AddOnOption = {
  id: string;
  category: string;
  label: string;
  // Chip shows just `label` since its category header supplies context; the cost table shows
  // selected items standalone (no adjacent category header), so it needs the full name.
  fullLabel: string;
  sublabel: string;
  price: number;
  group: "Food & beverage" | "Space & rentals";
  // Chiavari chairs ("$10 each") and Stage ("$175 per 4×8 section") have no stated
  // relationship to guest count — unlike the experiences above, whose per-guest pricing is
  // the venue's own. Defaulting these to guest count (chairs) or 1 section (stage) is a
  // guess, so they get an adjustable quantity instead of a silent assumption.
  adjustable?: { unitPrice: number; quantity: number };
};

// Categories with no stated per-guest or per-unit relationship in the source pricing.
const QUANTITY_ADJUSTABLE = new Set(["Chiavari chairs", "Stage"]);

export function CostCalculator() {
  const [guests, setGuests] = useState(150);
  const [spaceIndex, setSpaceIndex] = useState(1); // La Pergola default — fits 150 well
  const [day, setDay] = useState<"Friday" | "Saturday" | "Sunday">("Saturday");
  const [packageKey, setPackageKey] = useState<"argento" | "oro" | "platino">("oro");
  const [showAddOns, setShowAddOns] = useState(false);
  const [selectedAddOns, setSelectedAddOns] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const space = marchetti.spaces[spaceIndex];
  const pkg = marchetti.packages.find((p) => p.key === packageKey)!;

  // Experiences are priced per guest (the venue's own real pricing, not an assumption).
  // Enhancements are flat per space, except Chiavari chairs and Stage — see
  // QUANTITY_ADJUSTABLE above for why those two get a real quantity control instead.
  const addOnOptions: AddOnOption[] = useMemo(() => {
    const experienceOptions = marchetti.experiences.flatMap((exp) =>
      exp.tiers.map((t) => ({
        id: `exp-${exp.category}-${t.name}`,
        category: exp.category,
        label: t.name,
        fullLabel: `${exp.category}: ${t.name}`,
        sublabel: `${t.price} × ${guests}`,
        price: parseDollarAmount(t.price) * guests,
        group: "Food & beverage" as const,
      })),
    );
    const rentalOptions = marchetti.enhancements.flatMap((e) =>
      e.variants.map((v) => {
        const raw = space.name === "La Pergola" ? v.pergola : v.pavilion;
        const unitPrice = parseDollarAmount(raw);
        const id = `enh-${e.category}-${v.name ?? "flat"}`;
        if (QUANTITY_ADJUSTABLE.has(e.category)) {
          const defaultQty = e.category === "Chiavari chairs" ? guests : 1;
          const quantity = quantities[id] ?? defaultQty;
          return {
            id,
            category: e.category,
            label: v.name ?? "Add",
            fullLabel: v.name ? `${e.category}: ${v.name}` : e.category,
            sublabel: `${raw} × ${quantity}`,
            price: unitPrice * quantity,
            group: "Space & rentals" as const,
            adjustable: { unitPrice, quantity },
          };
        }
        return {
          id,
          category: e.category,
          label: v.name ?? "Add",
          fullLabel: v.name ? `${e.category}: ${v.name}` : e.category,
          sublabel: raw,
          price: unitPrice,
          group: "Space & rentals" as const,
        };
      }),
    );
    return [...experienceOptions, ...rentalOptions];
  }, [guests, space, quantities]);

  const toggleAddOn = (id: string) => {
    setSelectedAddOns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setQuantity = (id: string, n: number) => {
    setQuantities((prev) => ({ ...prev, [id]: Math.max(0, n) }));
  };

  const selected = addOnOptions.filter((o) => selectedAddOns.has(o.id));
  const selectedFoodAndBeverage = selected.filter((o) => o.group === "Food & beverage");
  const selectedRentals = selected.filter((o) => o.group === "Space & rentals");

  const { venueFee, foodAndBar, serviceCharge, rentalsTotal, salesTax, foodAndBarSubtotal, grandTotal, overCapacity } = useMemo(() => {
    const venueFee = space.fees.find((f) => f.day === day)?.amount ?? 0;
    const foodAndBar = guests * pkg.perGuest;
    const addOnsFoodAndBeverage = selectedFoodAndBeverage.reduce((sum, o) => sum + o.price, 0);
    const serviceChargeBase = foodAndBar + addOnsFoodAndBeverage;
    const serviceCharge = Math.round(serviceChargeBase * (marchetti.additionalCosts.productionFeePercent / 100));
    const rentalsTotal = selectedRentals.reduce((sum, o) => sum + o.price, 0);
    const foodAndBarSubtotal = serviceChargeBase + serviceCharge;
    const salesTax = Math.round((foodAndBarSubtotal + rentalsTotal) * (marchetti.additionalCosts.salesTaxPercent / 100));
    return {
      venueFee,
      foodAndBar,
      serviceCharge,
      rentalsTotal,
      salesTax,
      foodAndBarSubtotal,
      grandTotal: venueFee + foodAndBarSubtotal + rentalsTotal + salesTax,
      overCapacity: guests > space.capacity.seatedDining,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space, day, guests, pkg, selectedAddOns]);

  // Floor-to-ceiling range: cheapest realistic booking (RANGE_MIN guests, Argento, cheapest
  // day/space) to priciest (max seated capacity across both spaces, Platino, priciest
  // day/space). No add-ons — this bounds the base cost, not every optional extra a user might
  // pick above, which is the whole point of a floor-to-ceiling range rather than a moving target.
  const { rangeLow, rangeHigh, maxSeated } = useMemo(() => {
    const cheapestPkg = marchetti.packages.reduce((a, b) => (a.perGuest < b.perGuest ? a : b));
    const priciestPkg = marchetti.packages.reduce((a, b) => (a.perGuest > b.perGuest ? a : b));
    const allFees = marchetti.spaces.flatMap((s) => s.fees.map((f) => f.amount));
    const cheapestVenueFee = Math.min(...allFees);
    const priciestVenueFee = Math.max(...allFees);
    const maxSeated = Math.max(...marchetti.spaces.map((s) => s.capacity.seatedDining));
    return {
      rangeLow: total(RANGE_MIN, cheapestPkg.perGuest, cheapestVenueFee),
      rangeHigh: total(maxSeated, priciestPkg.perGuest, priciestVenueFee),
      maxSeated,
    };
  }, []);

  const step = (delta: number) => setGuests((g) => Math.max(GUEST_MIN, Math.min(GUEST_MAX, g + delta)));
  const setGuestsClamped = (n: number) => {
    if (Number.isNaN(n)) return;
    setGuests(Math.max(GUEST_MIN, Math.min(GUEST_MAX, Math.round(n))));
  };

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
            {/* Max only, not a min-max range like LondonHouse's "60-190 seated" — Marchetti
                has no published guest minimum (see quickFacts note: "No minimum guest count
                published"), so there's no real low end to anchor a range on. maxSeated is the
                real seated capacity across both spaces (same value the range chart below uses),
                not a separate invented number. */}
            <p className="mt-1.5 text-[11px] text-gray-400">Up to {maxSeated} seated</p>
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
            <PillGroup value={packageKey} onChange={setPackageKey} options={marchetti.packages.map((p) => ({ value: p.key as typeof packageKey, label: p.name, sublabel: `$${p.perGuest}` }))} />
          </div>
        </div>
        {overCapacity && (
          <p className="mt-3 text-center text-xs font-medium text-amber-700">
            {guests} guests is above {space.name}&apos;s seated capacity ({space.capacity.seatedDining}). Estimate assumes it fits anyway.
          </p>
        )}
      </div>

      {/* Add extras — collapsed by default so the base calculator doesn't get crowded by
          Marchetti's long experiences/rentals menu. Oro and Platino already include some of
          these (see package inclusions above); selecting one here adds an extra, on top of
          what's included. */}
      <div className="border-t border-black/[0.06] px-5 py-3">
        <button
          type="button"
          onClick={() => setShowAddOns((s) => !s)}
          className="flex w-full items-center justify-between text-sm font-medium text-gray-700"
        >
          <span>
            Add extras {selected.length > 0 && <span className="text-gray-400">({selected.length} selected)</span>}
          </span>
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${showAddOns ? "rotate-180" : ""}`} />
        </button>
        {showAddOns && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-gray-400">Oro and Platino already include some experiences, chairs, or a dance floor — this adds an extra on top of what&apos;s included.</p>
            {(["Food & beverage", "Space & rentals"] as const).map((group) => (
              <div key={group}>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">{group}</p>
                <div className="space-y-2">
                  {Array.from(new Set(addOnOptions.filter((o) => o.group === group).map((o) => o.category))).map((category) => (
                    <div key={category}>
                      <p className="mb-1 text-xs text-gray-500">{category}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {addOnOptions
                          .filter((o) => o.group === group && o.category === category)
                          .map((o) => {
                            const isSelected = selectedAddOns.has(o.id);
                            return (
                              <div key={o.id} className="inline-flex items-center gap-1.5">
                                <Chip label={o.label} sublabel={o.sublabel} active={isSelected} onClick={() => toggleAddOn(o.id)} />
                                {o.adjustable && isSelected && (
                                  <div className="inline-flex items-center gap-1 rounded-full border border-black/[0.1] px-1 py-0.5">
                                    <button
                                      type="button"
                                      onClick={() => setQuantity(o.id, o.adjustable!.quantity - 1)}
                                      className="flex h-5 w-5 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
                                      aria-label={`Fewer ${o.category}`}
                                    >
                                      <Minus size={10} />
                                    </button>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      value={o.adjustable.quantity}
                                      onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && setQuantity(o.id, Math.round(e.target.valueAsNumber))}
                                      className="w-8 border-none bg-transparent text-center text-xs font-semibold tabular-nums text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                      aria-label={`Number of ${o.category}`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setQuantity(o.id, o.adjustable!.quantity + 1)}
                                      className="flex h-5 w-5 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
                                      aria-label={`More ${o.category}`}
                                    >
                                      <Plus size={10} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Financials — grouped into Venue and Food & Beverage subtotals, matching LondonHouse's
          Cost Estimate pattern, so the same "what am I actually paying for" categories read
          consistently across venues even though Marchetti has a distinct venue-rental fee and
          LondonHouse doesn't. Selected rentals get their own group since they're taxed but not
          service-charged (the 25% only applies to food & beverage), which is why sales tax
          moved to its own line at the end rather than nesting inside Food & beverage. */}
      <div className="bg-rose-50/60 p-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Estimated cost (illustrative only, not a quote)</p>
        <table className="w-full text-sm text-gray-600">
          <tbody>
            <tr>
              <td className="pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                Venue
              </td>
            </tr>
            <tr className="border-t border-black/[0.06]">
              <td className="py-1.5 pl-1">
                Venue rental: {space.name}, {day}
              </td>
              <td className="py-1.5 text-right">{money(venueFee)}</td>
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
            {selectedFoodAndBeverage.map((o) => (
              <tr key={o.id} className="border-t border-black/[0.06]">
                <td className="py-1.5 pl-1">{o.fullLabel}</td>
                <td className="py-1.5 text-right">{money(o.price)}</td>
              </tr>
            ))}
            <tr className="border-t border-black/[0.06]">
              <td className="py-1.5 pl-1">Service charge ({marchetti.additionalCosts.productionFeePercent}%)</td>
              <td className="py-1.5 text-right">{money(serviceCharge)}</td>
            </tr>
            <tr className="border-t border-black/[0.06] text-gray-500">
              <td className="py-1.5 pl-1">Subtotal</td>
              <td className="py-1.5 text-right">{money(foodAndBarSubtotal)}</td>
            </tr>

            {selectedRentals.length > 0 && (
              <>
                <tr>
                  <td className="pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                    Space & rentals
                  </td>
                </tr>
                {selectedRentals.map((o) => (
                  <tr key={o.id} className="border-t border-black/[0.06]">
                    <td className="py-1.5 pl-1">{o.fullLabel}</td>
                    <td className="py-1.5 text-right">{money(o.price)}</td>
                  </tr>
                ))}
                <tr className="border-t border-black/[0.06] text-gray-500">
                  <td className="py-1.5 pl-1">Subtotal</td>
                  <td className="py-1.5 text-right">{money(rentalsTotal)}</td>
                </tr>
              </>
            )}

            <tr className="border-t border-black/[0.06]">
              <td className="py-1.5 pl-1">Sales tax ({marchetti.additionalCosts.salesTaxPercent}%)</td>
              <td className="py-1.5 text-right">{money(salesTax)}</td>
            </tr>

            <tr className="border-t border-black/[0.1] font-medium text-gray-900">
              <td className="py-2">Estimated total (includes tax)</td>
              <td className="py-2 text-right">{money(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Floor-to-ceiling range — cheapest realistic booking to priciest, venue + food &
          beverage only (no add-ons, since those are optional, not baseline). */}
      <div className="border-t border-black/[0.06] p-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Example range (any guest count, space, day, or package)</p>
        <div className="flex items-baseline justify-between text-sm font-semibold text-gray-900">
          <span>{money(rangeLow)}</span>
          <span>{money(rangeHigh)}</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gradient-to-r from-rose-200 to-rose-400" />
        <div className="mt-1.5 flex items-baseline justify-between text-[11px] text-gray-400">
          <span>{RANGE_MIN} guests, Argento, Sun</span>
          <span>{maxSeated} guests, Platino, Sat</span>
        </div>
      </div>
    </div>
  );
}
