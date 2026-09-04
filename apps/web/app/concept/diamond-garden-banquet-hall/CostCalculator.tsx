"use client";

/**
 * Fully interactive (feedback 2026-08-16/17: "improve the cost estimate to fully/exhaustively
 * reflect the users options"). Follows Marchetti-v3's pattern: a PillGroup for single-select
 * choices, a Chip for multi-select toggle add-ons (grouped by category, collapsed by default),
 * and an adjustable-quantity control for the one item (uplights) with a real stated per-unit
 * price. Booking type now matches the Pricing section's own 3 real cards exactly (feedback
 * 2026-08-17): Venue-only, Venue + à la carte, All-Inclusive — "à la carte" is genuinely the
 * same base price as Venue-only, just with the Add Extras panel proactively opened, since
 * picking that option is the whole point of choosing it over Venue-only. Extras are hidden
 * entirely for Venue-only (nothing to add by definition), and All-Inclusive only shows the
 * extras genuinely still relevant on top of it (decoration, lighting, cleaning, extra hours) —
 * food packages, dinnerware-only, bar tiers, and food/drink extras are hidden there since
 * they're already bundled into what All-Inclusive includes. Estimated cost breakdown grouped by
 * the same 5 real categories as the static Add-ons & extras section (Food & beverage,
 * Decoration, Lighting & video, Staffing & service, Extra hours), not one flat "Extras" list.
 */

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { diamondGarden } from "./data";

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
const GUEST_MAX = 268;

type Day = "weekday" | "friday" | "saturday" | "sunday";
type Season = "offSeason" | "peakSeason";
type PathKey = "venueOnly" | "aLaCarte" | "complete";
type FoodPkgKey = "none" | "bronze" | "silver" | "gold";
type DinnerwareKey = "none" | "buffet" | "plated" | "family";
type ExtraHourKey = "none" | "noServers" | "withServers";

const DAY_OPTIONS: { value: Day; label: string }[] = [
  { value: "weekday", label: "Weekday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

// Matches the static Add-ons & extras section's 5 real categories exactly, so the breakdown
// below uses the same nomenclature as the rest of the page instead of its own naming.
const CATEGORY_ORDER = ["Food & beverage add-ons", "Decoration add-ons", "Lighting & video add-ons", "Staffing & service add-ons", "Extra hours"] as const;
type Category = (typeof CATEGORY_ORDER)[number];

type AddOnOption = {
  id: string;
  category: Category;
  label: string;
  sublabel: string;
  price: number;
  // "hallOnly" items don't apply once All-Inclusive already bundles the equivalent (bartending,
  // coffee/tea, cake); "both" items are real additions regardless of booking type.
  forPath: "hallOnly" | "both";
  adjustable?: { unitPrice: number; quantity: number };
};

export function CostCalculator() {
  const { hallOnly, complete } = diamondGarden.packages;
  const addOns = diamondGarden.calculatorAddOns;

  const [guests, setGuests] = useState(150);
  const [day, setDay] = useState<Day>("saturday");
  const [season, setSeason] = useState<Season>("peakSeason");
  const [path, setPath] = useState<PathKey>("venueOnly");
  const [showAddOns, setShowAddOns] = useState(false);

  const [foodPkg, setFoodPkg] = useState<FoodPkgKey>("none");
  const [dinnerware, setDinnerware] = useState<DinnerwareKey>("none");
  const [bar, setBar] = useState<string>("none");
  const [extraHour, setExtraHour] = useState<ExtraHourKey>("none");
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const [uplightQty, setUplightQty] = useState(8);

  // Switching to Venue-only clears every add-on, since that path's whole point is nothing added.
  // Switching to Venue + à la carte opens the Add extras panel automatically — picking that
  // option over Venue-only *is* the request to see what can be added.
  const setPathAndAdjust = (p: PathKey) => {
    setPath(p);
    if (p === "venueOnly") {
      setFoodPkg("none");
      setDinnerware("none");
      setBar("none");
      setExtraHour("none");
      setSelectedChips(new Set());
      setShowAddOns(false);
    } else if (p === "aLaCarte") {
      setShowAddOns(true);
    } else {
      setFoodPkg("none");
      setDinnerware("none");
      setBar("none");
    }
  };

  const toggleChip = (id: string) => {
    setSelectedChips((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const step = (delta: number) => setGuests((g) => Math.max(GUEST_MIN, Math.min(GUEST_MAX, g + delta)));
  const setGuestsClamped = (n: number) => {
    if (Number.isNaN(n)) return;
    setGuests(Math.max(GUEST_MIN, Math.min(GUEST_MAX, Math.round(n))));
  };

  const extraHourBucket = addOns.extraHour[season];
  const extraHourNoServers = day === "saturday" ? extraHourBucket.saturday : extraHourBucket.weekday;
  const extraHourWithServers = day === "saturday" ? extraHourBucket.saturdayWithServers : extraHourBucket.weekdayWithServers;

  // Normalized into one flat, uniformly-shaped list (same pattern as Marchetti's calculator) so
  // the category chip sections render generically instead of one bespoke block per category.
  const addOnOptions: AddOnOption[] = useMemo(() => {
    const opts: AddOnOption[] = [];
    for (const c of addOns.ceremonyUpgrades) {
      opts.push({ id: c.id, category: "Decoration add-ons", label: c.label, sublabel: money(c.price), price: c.price, forPath: "both" });
    }
    for (const d of addOns.decor) {
      const isPerGuest = "perGuest" in d;
      const price = isPerGuest ? d.perGuest! * guests : d.price!;
      opts.push({
        id: d.id,
        category: "Decoration add-ons",
        label: d.label,
        sublabel: isPerGuest ? `${money(d.perGuest!)} × ${guests}` : money(d.price!),
        price,
        forPath: "both",
      });
    }
    for (const l of addOns.lighting) {
      if (l.adjustable) {
        const qty = uplightQty;
        opts.push({
          id: l.id,
          category: "Lighting & video add-ons",
          label: l.label,
          sublabel: `${money(l.price)} × ${qty}`,
          price: l.price * qty,
          forPath: "both",
          adjustable: { unitPrice: l.price, quantity: qty },
        });
      } else {
        opts.push({ id: l.id, category: "Lighting & video add-ons", label: l.label, sublabel: money(l.price), price: l.price, forPath: "both" });
      }
    }
    for (const s of addOns.staffing) {
      opts.push({ id: s.id, category: "Staffing & service add-ons", label: s.label, sublabel: money(s.price), price: s.price, forPath: s.hallRentalOnlyOnly ? "hallOnly" : "both" });
    }
    for (const f of addOns.foodDrinkExtras) {
      const isPerGuest = "perGuest" in f;
      const price = isPerGuest ? f.perGuest! * guests : f.price!;
      opts.push({
        id: f.id,
        category: "Food & beverage add-ons",
        label: f.label,
        sublabel: isPerGuest ? `${money(f.perGuest!)} × ${guests}` : money(f.price!),
        price,
        forPath: "hallOnly",
      });
    }
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guests, uplightQty]);

  // "hallOnly" in AddOnOption.forPath means the underlying booking type (both Venue-only and
  // Venue + à la carte share the same base), not the calculator's 3-way selection — so both of
  // those map to it here, while All-Inclusive only sees the "both" items.
  const underlyingPath = path === "complete" ? "complete" : "hallOnly";
  const visibleAddOnOptions = addOnOptions.filter((o) => o.forPath === "both" || o.forPath === underlyingPath);

  const { total, baseBreakdown, groupedExtras, minGuests, underMinimum } = useMemo(() => {
    const baseBreakdown: { label: string; amount: number }[] = [];

    if (path !== "complete") {
      const bucket = hallOnly.pricing[season];
      const flatFee = day === "weekday" ? bucket.weekday : day === "saturday" ? bucket.saturday : bucket.fridaySunday;
      baseBreakdown.push({ label: "Hall rental (flat fee)", amount: flatFee });

      const bartenders = Math.ceil(guests / hallOnly.requiredAddOns.bartenderPerGuests);
      const roleCount = bartenders + hallOnly.requiredAddOns.otherRoles.length;
      const staffTotal = roleCount * hallOnly.requiredAddOns.pricePerRole;
      baseBreakdown.push({
        label: `Required staff: ${bartenders} bartender${bartenders === 1 ? "" : "s"}, door usher, maintenance, manager (${roleCount} × ${money(hallOnly.requiredAddOns.pricePerRole)})`,
        amount: staffTotal,
      });
    } else {
      const bucket = complete.pricing[season];
      const perGuest = day === "saturday" ? bucket.saturday : bucket.weekdayFriSun;
      baseBreakdown.push({ label: `${guests} guests × ${money(perGuest)}/guest`, amount: guests * perGuest });
    }

    // Every add-on line gets tagged with one of the 5 real categories, then grouped for display
    // — same nomenclature as the static Add-ons & extras section below.
    const linesByCategory = new Map<Category, { label: string; amount: number }[]>();
    const addLine = (category: Category, label: string, amount: number) => {
      if (!linesByCategory.has(category)) linesByCategory.set(category, []);
      linesByCategory.get(category)!.push({ label, amount });
    };

    if (path !== "complete") {
      if (foodPkg !== "none") {
        const pkg = addOns.foodPackages.find((p) => p.key === foodPkg)!;
        addLine("Food & beverage add-ons", `Food package: ${pkg.name} (${guests} × ${money(pkg.perGuest)}/guest)`, guests * pkg.perGuest);
      }
      if (dinnerware !== "none") {
        const d = addOns.dinnerwareOnly.find((d) => d.key === dinnerware)!;
        addLine("Food & beverage add-ons", `Dinnerware only: ${d.name} (${guests} × ${money(d.perGuest)}/guest)`, guests * d.perGuest);
      }
      if (bar !== "none") {
        const b = diamondGarden.barPackages.find((b) => b.name === bar)!;
        addLine("Food & beverage add-ons", `Bar: ${b.name} (${guests} × ${money(b.price5hr)}/guest)`, guests * b.price5hr);
      }
    }

    if (extraHour !== "none") {
      const price = extraHour === "withServers" ? extraHourWithServers : extraHourNoServers;
      addLine("Extra hours", `Extra hour${extraHour === "withServers" ? " (with servers)" : ""}`, price);
    }

    for (const o of visibleAddOnOptions) {
      if (!selectedChips.has(o.id)) continue;
      addLine(o.category, o.label, o.price);
    }

    const groupedExtras = CATEGORY_ORDER.map((category) => ({ category, lines: linesByCategory.get(category) ?? [] })).filter((g) => g.lines.length > 0);

    const baseTotal = baseBreakdown.reduce((sum, l) => sum + l.amount, 0);
    const extrasTotal = groupedExtras.reduce((sum, g) => sum + g.lines.reduce((s, l) => s + l.amount, 0), 0);

    const minGuests = path === "complete" ? (day === "friday" ? complete.minGuests.friday : day === "sunday" ? complete.minGuests.sunday : complete.minGuests.general) : null;

    return {
      total: baseTotal + extrasTotal,
      baseBreakdown,
      groupedExtras,
      minGuests,
      underMinimum: minGuests !== null && guests < minGuests,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, day, season, guests, foodPkg, dinnerware, bar, extraHour, selectedChips, visibleAddOnOptions]);

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
      <div className="p-5">
        <p className="mb-1.5 text-center text-xs font-medium uppercase tracking-wide text-gray-400">Booking type</p>
        <PillGroup
          value={path}
          onChange={setPathAndAdjust}
          options={[
            { value: "venueOnly", label: "Venue-only" },
            { value: "aLaCarte", label: "Venue + à la carte" },
            { value: "complete", label: "All-Inclusive" },
          ]}
        />

        <div className="mt-4 border-t border-black/[0.06] pt-4 text-center">
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
        </div>

        <div className="mt-4 grid grid-cols-2 divide-x divide-black/[0.06] border-t border-black/[0.06] pt-4">
          <div className="px-2 text-center sm:px-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Day</p>
            <PillGroup value={day} onChange={setDay} options={DAY_OPTIONS} />
          </div>
          <div className="px-2 text-center sm:px-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Season</p>
            <PillGroup
              value={season}
              onChange={setSeason}
              options={[
                { value: "offSeason", label: "Off-season" },
                { value: "peakSeason", label: "Peak season" },
              ]}
            />
          </div>
        </div>

        {path === "complete" && underMinimum && (
          <p className="mt-3 text-center text-xs font-medium text-amber-700">
            {guests} guests is below the All-Inclusive package&apos;s {minGuests}-guest minimum for {day === "friday" ? "Fridays" : day === "sunday" ? "Sundays" : "this day"}. Estimate assumes it&apos;s bookable anyway.
          </p>
        )}
      </div>

      {/* Add extras — hidden entirely for Venue-only (nothing to add by definition), open by
          default for Venue + à la carte (see setPathAndAdjust above), collapsed by default for
          All-Inclusive since fewer of these still apply there. */}
      {path !== "venueOnly" && (
        <div className="border-t border-black/[0.06] px-5 py-3">
          <button type="button" onClick={() => setShowAddOns((s) => !s)} className="flex w-full items-center justify-between text-sm font-medium text-gray-700">
            <span>
              Add extras{" "}
              {(foodPkg !== "none" || dinnerware !== "none" || bar !== "none" || extraHour !== "none" || selectedChips.size > 0) && (
                <span className="text-gray-400">
                  ({[foodPkg !== "none", dinnerware !== "none", bar !== "none", extraHour !== "none"].filter(Boolean).length + selectedChips.size} selected)
                </span>
              )}
            </span>
            <ChevronDown size={16} className={`text-gray-400 transition-transform ${showAddOns ? "rotate-180" : ""}`} />
          </button>
          {showAddOns && (
            <div className="mt-3 space-y-4">
              {path === "aLaCarte" && (
                <>
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Food package</p>
                    <PillGroup
                      value={foodPkg}
                      onChange={setFoodPkg}
                      options={[
                        { value: "none" as const, label: "None (BYO caterer)" },
                        ...addOns.foodPackages.map((p) => ({ value: p.key as FoodPkgKey, label: p.name, sublabel: `${money(p.perGuest)}/guest` })),
                      ]}
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Dinnerware only</p>
                    <PillGroup
                      value={dinnerware}
                      onChange={setDinnerware}
                      options={[
                        { value: "none" as const, label: "None" },
                        ...addOns.dinnerwareOnly.map((d) => ({ value: d.key as DinnerwareKey, label: d.name, sublabel: `${money(d.perGuest)}/guest` })),
                      ]}
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Bar</p>
                    <PillGroup
                      value={bar}
                      onChange={setBar}
                      options={[
                        { value: "none", label: "None (BYO alcohol)" },
                        ...diamondGarden.barPackages.map((b) => ({ value: b.name, label: b.name, sublabel: `${money(b.price5hr)}/guest` })),
                      ]}
                    />
                  </div>
                </>
              )}

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Extra hour</p>
                <PillGroup
                  value={extraHour}
                  onChange={setExtraHour}
                  options={[
                    { value: "none" as const, label: "None" },
                    { value: "noServers" as const, label: "Without servers", sublabel: money(extraHourNoServers) },
                    { value: "withServers" as const, label: "With servers", sublabel: money(extraHourWithServers) },
                  ]}
                />
              </div>

              {CATEGORY_ORDER.filter((c) => c !== "Extra hours").map((category) => {
                const items = visibleAddOnOptions.filter((o) => o.category === category);
                if (items.length === 0) return null;
                return (
                  <div key={category}>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">{category}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((o) => {
                        const isSelected = selectedChips.has(o.id);
                        return (
                          <div key={o.id} className="inline-flex items-center gap-1.5">
                            <Chip label={o.label} sublabel={o.sublabel} active={isSelected} onClick={() => toggleChip(o.id)} />
                            {o.adjustable && isSelected && (
                              <div className="inline-flex items-center gap-1 rounded-full border border-black/[0.1] px-1 py-0.5">
                                <button
                                  type="button"
                                  onClick={() => setUplightQty((q) => Math.max(1, q - 1))}
                                  className="flex h-5 w-5 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
                                  aria-label="Fewer uplights"
                                >
                                  <Minus size={10} />
                                </button>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  value={uplightQty}
                                  onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && setUplightQty(Math.max(1, Math.round(e.target.valueAsNumber)))}
                                  className="w-8 border-none bg-transparent text-center text-xs font-semibold tabular-nums text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  aria-label="Number of uplights"
                                />
                                <button
                                  type="button"
                                  onClick={() => setUplightQty((q) => q + 1)}
                                  className="flex h-5 w-5 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
                                  aria-label="More uplights"
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
            <tr>
              <td className="pb-1 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                Venue
              </td>
            </tr>
            {baseBreakdown.map((row) => (
              <tr key={row.label} className="border-t border-black/[0.06]">
                <td className="py-1.5 pl-1">{row.label}</td>
                <td className="py-1.5 text-right">{money(row.amount)}</td>
              </tr>
            ))}
            {groupedExtras.map((group) => (
              <Fragment key={group.category}>
                <tr>
                  <td className="pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400" colSpan={2}>
                    {group.category}
                  </td>
                </tr>
                {group.lines.map((row, i) => (
                  <tr key={`${group.category}-${i}`} className="border-t border-black/[0.06]">
                    <td className="py-1.5 pl-1">{row.label}</td>
                    <td className="py-1.5 text-right">{money(row.amount)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr className="border-t border-black/[0.1] font-medium text-gray-900">
              <td className="py-2">Estimated total</td>
              <td className="py-2 text-right">{money(total)}</td>
            </tr>
          </tbody>
        </table>
        {path === "complete" && (
          <p className="mt-2 text-xs text-gray-500">
            Early Bird Special: {money(complete.earlyBird.price)}/guest ({complete.earlyBird.detail}). Not reflected above.
          </p>
        )}
      </div>
    </div>
  );
}
