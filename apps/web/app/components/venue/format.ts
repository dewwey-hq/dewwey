/**
 * Pure formatting/decision helpers for the generic VenueDetailsView renderer (D060 Phase 1b).
 * No React, no DB — every non-trivial rendering decision (money/sq-ft strings, per-space tile
 * values, section visibility, card-vs-table pivots) lives here so it's covered by
 * `format.test.ts` instead of buried in JSX. Mirrors the style of `lib/venueDetails/derive.ts`
 * (which this file imports from, but never duplicates — `addOnAxes`, `calculatorAxes`,
 * `headlineCapacity`, `policyRows`, `quickFacts`, `fbPills` stay in derive.ts).
 */

import { fbPills } from "../../../lib/venueDetails/derive";
import {
  type AddOn,
  type CapacityTuple,
  type Day,
  type FbPill,
  type FixedFee,
  type InclusionItem,
  INCLUSION_CATEGORIES,
  type Minimum,
  type PerGuestTier,
  type Pricing,
  POLICY_ROW_KEYS,
  type PricingPath,
  type Rates,
  type Resource,
  type ResourceKind,
  type Season,
  type Space,
  type VendorList,
  type VenueDetailsV3,
} from "../../../lib/venueDetails/types";

// ---------------------------------------------------------------------------
// Money / units
// ---------------------------------------------------------------------------

export function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function moneyRange(low: number, high: number): string {
  return low === high ? money(low) : `${money(low)}–${money(high)}`;
}

export function sqFtLabel(sqFt: number | null, structureLabel: string | null): string {
  const parts: string[] = [];
  if (sqFt != null) parts.push(`${sqFt.toLocaleString()} sq ft`);
  if (structureLabel) parts.push(structureLabel);
  return parts.join(" · ");
}

/** Space header size line (fix round, 2026-09-13 review): "X sq ft indoor · Y sq ft outdoor"
 * when both indoor and outdoor square footage are stated; otherwise the plain sq-ft/structure
 * line. Returns null (omit the line entirely, no "Size not stated" placeholder) when `sqFt`
 * itself isn't stated — reviewed as looking worse than just not showing a size line at all.
 *
 * `sqFtLabelRaw` (2026-09-18 review, Field Museum): when the venue states its size as a string
 * rather than a clean number ("~21,000 (main floor)", "11,376–35,997"), `sq_ft` still carries the
 * first integer found in it (for numeric code), but the line itself shows the venue's own wording
 * verbatim instead of the reduced-to-one-number version. */
export function spaceSizeLine(sqFt: number | null, sqFtOutdoor: number | null, structureLabel: string | null, sqFtLabelRaw?: string | null): string | null {
  if (sqFt == null) return null;
  const primary = sqFtLabelRaw ? `${sqFtLabelRaw} sq ft` : `${sqFt.toLocaleString()} sq ft`;
  if (sqFtOutdoor != null) {
    const parts = [sqFtLabelRaw ? primary : `${sqFt.toLocaleString()} sq ft indoor`, `${sqFtOutdoor.toLocaleString()} sq ft outdoor`];
    if (structureLabel) parts.push(structureLabel);
    return parts.join(" · ");
  }
  const parts = [primary];
  if (structureLabel) parts.push(structureLabel);
  return parts.join(" · ");
}

/** "Ceiling height: 8–14 ft" (venue's own wording) or "Ceiling height: 22 ft" (formatted number)
 * — same verbatim-label-else-formatted-number rule as `spaceSizeLine`'s `sqFtLabelRaw`. Null (omit
 * the line) when neither is stated. */
export function ceilingLine(ceilingFt: number | null, ceilingLabel?: string | null): string | null {
  if (ceilingLabel) return `Ceiling height: ${ceilingLabel}`;
  if (ceilingFt != null) return `Ceiling height: ${ceilingFt} ft`;
  return null;
}

const DAY_LABELS: Record<Day, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
  weekday: "Weekday",
  any: "Any day",
};

const DAY_FULL_LABELS: Record<Day, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
  weekday: "Weekday",
  any: "Any day",
};

export function dayLabel(d: Day): string {
  return DAY_LABELS[d];
}

export function dayFullLabel(d: Day): string {
  return DAY_FULL_LABELS[d];
}

const SEASON_LABELS: Record<Season, string> = {
  peak: "Peak season",
  off: "Off-season",
  any: "Any season",
};

export function seasonLabel(s: Season): string {
  return SEASON_LABELS[s];
}

/** "{Day} rental" row label for a space/whole-venue fixed fee (golden-set-template.md §2's
 * per-space fee table). Falls back to the fee's own label when it isn't day-keyed. */
export function feeRentalLabel(f: FixedFee): string {
  if (f.day) return `${dayFullLabel(f.day)} rental`;
  return f.label || "Rental";
}

// ---------------------------------------------------------------------------
// Capacity tiles (per space — distinct from derive.ts's venue-wide `headlineCapacity`)
// ---------------------------------------------------------------------------

export interface SpaceCapacityTile {
  tile: "seated" | "seated_dance" | "cocktail";
  as_stated_label: string | null;
  max: number | null;
  quote: string | null;
  source_url: string | null;
  snapshot_id: number | null;
}

const TILE_ORDER: SpaceCapacityTile["tile"][] = ["seated", "seated_dance", "cocktail"];

export const TILE_FALLBACK_LABEL: Record<SpaceCapacityTile["tile"], string> = {
  seated: "Seated",
  seated_dance: "Seated w/ dance",
  cocktail: "Cocktail",
};

/** Always exactly 3 tiles for a given space, in tile order, grey `null` for anything unstated —
 * golden-set-template.md §2's "always render all 3 tiles" rule, applied per-space instead of
 * venue-wide. */
export function spaceCapacityTiles(d: VenueDetailsV3, spaceId: string): SpaceCapacityTile[] {
  const caps = d.capacities.filter((c) => c.space_id === spaceId);
  return TILE_ORDER.map((tile) => {
    const matches = caps.filter((c) => c.tile === tile);
    if (matches.length === 0) return { tile, as_stated_label: null, max: null, quote: null, source_url: null, snapshot_id: null };
    const best = matches.reduce((a: CapacityTuple, b: CapacityTuple) => (b.max > a.max ? b : a));
    return { tile, as_stated_label: best.as_stated_label, max: best.max, quote: best.quote, source_url: best.source_url, snapshot_id: best.snapshot_id };
  });
}

// ---------------------------------------------------------------------------
// Per-space / whole-venue fixed fees (default pricing path)
// ---------------------------------------------------------------------------

export function pathSpaceFixedFees(path: PricingPath | undefined, spaceId: string): FixedFee[] {
  if (!path) return [];
  return path.fixed_fees.filter((f) => f.applies_to === "space" && f.space_id === spaceId);
}

export function pathWholeVenueFixedFees(path: PricingPath | undefined): FixedFee[] {
  if (!path) return [];
  return path.fixed_fees.filter((f) => f.applies_to === "whole_venue");
}

/** True when at least one of the venue's spaces has its own space-scoped fee on the default
 * path — used to decide whether whole-venue fees belong inside the (single) space card's own
 * "Rental rate" grid, or as the multi-space "book both together" line above the grid (fix
 * round, 2026-09-13 review). */
export function anySpaceHasScopedFees(spaces: Space[], path: PricingPath | undefined): boolean {
  return spaces.some((s) => pathSpaceFixedFees(path, s.id).length > 0);
}

/** The single-space card's own "Rental rate" season x day grid only renders when this space has
 * no space-scoped fee of its own (`spaceFeesCount === 0`), there are whole-venue fees to show
 * (`wholeVenueFeesCount > 0`), AND there's no standalone Pricing section already showing those
 * same fees per path (`pricingPathsCount < 2`, `showPricingSection`'s own threshold) —
 * duplicate-rate-grid fix, 2026-09-18 review: a venue with 2+ pricing paths already gets a
 * per-path grid in the Pricing section, so the card would otherwise print the same numbers
 * twice. */
export function showSpaceRentalGrid(spaceFeesCount: number, wholeVenueFeesCount: number, pricingPathsCount: number): boolean {
  return spaceFeesCount === 0 && wholeVenueFeesCount > 0 && pricingPathsCount < 2;
}

export interface WholeVenueFeeGroup {
  season: Season;
  parts: { label: string; amount: number; fee: FixedFee }[];
}

/** Day order for the "book both together" whole-venue line specifically — Fri → Sat → Sun (then
 * everything else), the order a couple actually compares wedding days in, distinct from the
 * affirmative/Saturday-first order used everywhere else (`DEFAULT_DAY_ORDER`, `buildPriceGrid`'s
 * own dayOrder) which optimizes for "what's the default/most-asked-about day" instead. */
const WHOLE_VENUE_DAY_ORDER: Day[] = ["fri", "sat", "sun", "weekday", "mon", "tue", "wed", "thu", "any"];

const SEASON_ORDER: Season[] = ["peak", "off", "any"];

/** Short season prefix for the "book both together" line ("Peak: ... / Off-season: ..."),
 * distinct from `seasonLabel`'s fuller "Peak season" wording used elsewhere. */
export const SEASON_PREFIX_LABEL: Record<Season, string> = { peak: "Peak", off: "Off-season", any: "Any season" };

/** Groups the "book both together" whole-venue fees by season so a venue with both off-season
 * and peak-season rows doesn't print six flat, undifferentiated "{Day} rental $N" entries with
 * no way to tell which season each belongs to. */
export function groupWholeVenueFees(fees: FixedFee[]): WholeVenueFeeGroup[] {
  const dayRank = (f: FixedFee) => {
    const i = WHOLE_VENUE_DAY_ORDER.indexOf(f.day ?? "any");
    return i === -1 ? WHOLE_VENUE_DAY_ORDER.length : i;
  };
  const seasons = SEASON_ORDER.filter((s) => fees.some((f) => (f.season ?? "any") === s));
  return seasons.map((season) => ({
    season,
    parts: fees
      .filter((f) => (f.season ?? "any") === season)
      .sort((a, b) => dayRank(a) - dayRank(b))
      .map((f) => ({ label: feeRentalLabel(f), amount: f.amount, fee: f })),
  }));
}

/** Plain-text rendering of the "book both together" line's fees: "Fri $X · Sat $Y · Sun $Z", or,
 * when the venue's fees actually differ by season, "Peak: Fri $X · Sat $Y / Off-season: Fri $A ·
 * Sat $B" — built on `groupWholeVenueFees` so the day/season ordering never drifts between the
 * two. */
export function formatWholeVenueFees(fees: FixedFee[]): string {
  const groups = groupWholeVenueFees(fees);
  return groups
    .map((g) => {
      const parts = g.parts.map((p) => `${dayLabel(p.fee.day ?? "any")} ${money(p.amount)}`).join(" · ");
      return groups.length > 1 ? `${SEASON_PREFIX_LABEL[g.season]}: ${parts}` : parts;
    })
    .join(" / ");
}

// ---------------------------------------------------------------------------
// Price grids (fixed fees or per-guest tiers, pivoted season x day)
// ---------------------------------------------------------------------------

export interface PriceGrid {
  seasons: Season[];
  days: Day[];
  /** grid[seasonIndex][dayIndex] — null when no item matches that cell. */
  grid: (number | null)[][];
}

export function buildPriceGrid<T>(items: T[], dayOf: (t: T) => Day | null, seasonOf: (t: T) => Season | null, amountOf: (t: T) => number): PriceGrid {
  const seasonOrder: Season[] = ["peak", "off", "any"];
  const dayOrder: Day[] = ["sat", "fri", "sun", "weekday", "mon", "tue", "wed", "thu", "any"];
  const seasonsSeen = new Set(items.map((i) => seasonOf(i) ?? "any"));
  const daysSeen = new Set(items.map((i) => dayOf(i) ?? "any"));
  const seasons = seasonOrder.filter((s) => seasonsSeen.has(s));
  const days = dayOrder.filter((d) => daysSeen.has(d));
  const grid = seasons.map((season) =>
    days.map((day) => {
      const match = items.find((i) => (seasonOf(i) ?? "any") === season && (dayOf(i) ?? "any") === day);
      return match ? amountOf(match) : null;
    }),
  );
  return { seasons, days, grid };
}

export function fixedFeeGrid(fees: FixedFee[]): PriceGrid {
  return buildPriceGrid(
    fees,
    (f) => f.day,
    (f) => f.season,
    (f) => f.amount,
  );
}

export function perGuestTierGrid(tiers: PerGuestTier[]): PriceGrid {
  return buildPriceGrid(
    tiers,
    (t) => t.day,
    (t) => t.season,
    (t) => t.per_guest,
  );
}

// ---------------------------------------------------------------------------
// Merged price grid — cheap-to-expensive day columns (Weekday / Fri / Sun / Sat), collapsing
// adjacent days whose price is identical across every season into one combined column (Diamond
// Garden's Hall Rental Only: Fri and Sunday are the same real number, so "Fri/Sun" is one column,
// not two identical ones; All-Inclusive's weekday/Fri/Sunday share one number too, collapsing to
// "Weekday/Fri/Sun").
// ---------------------------------------------------------------------------

export interface PriceGridColumn {
  label: string;
  days: Day[];
}

export interface MergedPriceGrid {
  seasons: Season[];
  columns: PriceGridColumn[];
  /** grid[seasonIndex][columnIndex] */
  grid: (number | null)[][];
}

const MERGED_GRID_DAY_ORDER: Day[] = ["weekday", "mon", "tue", "wed", "thu", "fri", "sun", "sat", "any"];

/** Builds the merged, cheap-first column layout from a `PriceGrid` (`fixedFeeGrid`/
 * `perGuestTierGrid`'s own season x day pivot). Returns null when there's nothing to show. */
export function buildMergedPriceGrid(grid: PriceGrid): MergedPriceGrid | null {
  if (grid.days.length === 0 || grid.seasons.length === 0) return null;
  const orderedDays = MERGED_GRID_DAY_ORDER.filter((d) => grid.days.includes(d));
  const valuesForDay = (day: Day): (number | null)[] => {
    const di = grid.days.indexOf(day);
    return grid.seasons.map((_, si) => grid.grid[si][di]);
  };
  const groups: Day[][] = [];
  for (const day of orderedDays) {
    const values = valuesForDay(day);
    const lastGroup = groups[groups.length - 1];
    const lastValues = lastGroup ? valuesForDay(lastGroup[lastGroup.length - 1]) : null;
    if (lastValues && values.every((v, i) => v === lastValues[i])) {
      lastGroup.push(day);
    } else {
      groups.push([day]);
    }
  }
  const columns: PriceGridColumn[] = groups.map((days) => ({ days, label: days.map(dayLabel).join("/") }));
  const mergedGrid = grid.seasons.map((_, si) => columns.map((col) => grid.grid[si][grid.days.indexOf(col.days[0])]));
  return { seasons: grid.seasons, columns, grid: mergedGrid };
}

/** "150 guests" for a guest minimum, plain money for an F&B minimum — round-3 fix: a guest
 * count is a headcount, not a dollar figure ("Guest minimum: $150" was printing a guest COUNT
 * through the money formatter). */
export function minimumValueLabel(m: Minimum): string {
  return m.kind === "guest_minimum" ? `${m.amount.toLocaleString()} guests` : money(m.amount);
}

/** The Pricing card's headline min–max line: "$2,100 – $6,595 flat" for a fixed-fee path,
 * "$68.95 – $84.95 /guest" for a per-guest path. Null when the path has neither (an inquire-only
 * or add-on-only path with nothing fixed to show a range for). */
export function pricingHeadlineLine(path: PricingPath): string | null {
  if (path.per_guest_tiers.length > 0) {
    const amounts = path.per_guest_tiers.map((t) => t.per_guest);
    return `${moneyRange(Math.min(...amounts), Math.max(...amounts))} /guest`;
  }
  const fees = path.fixed_fees.filter((f) => f.applies_to === "space" || f.applies_to === "whole_venue");
  if (fees.length > 0) {
    const amounts = fees.map((f) => f.amount);
    return `${moneyRange(Math.min(...amounts), Math.max(...amounts))} flat`;
  }
  return null;
}

/** The season-months line, rendered once under the Pricing section's whole card grid (not
 * per-card, since the two definitions are always identical across every path on the same
 * venue): "off-season is Jan, Feb, Mar, Nov; peak season is Apr–Oct, Dec". Null when a venue
 * doesn't state season months at all. */
export function seasonsMonthsLine(seasons: Pricing["seasons"]): string | null {
  if (!seasons || (!seasons.peak && !seasons.off)) return null;
  const parts: string[] = [];
  if (seasons.off) parts.push(`off-season is ${seasons.off}`);
  if (seasons.peak) parts.push(`peak season is ${seasons.peak}`);
  return parts.join("; ");
}

export interface CollapsedTier {
  /** First-seen entry's id — used only as a React key / FactSource anchor. */
  id: string;
  name: string;
  /** First-seen entry, used for inclusions/bar_tier/inherits_from — the day/season variants of
   * the same named package are assumed to share these (a real day/season difference in the
   * *inclusions* themselves, not just price, would need its own package name). */
  representative: PerGuestTier;
  minPerGuest: number;
  maxPerGuest: number;
}

/** Collapses per-guest tiers that share a `name` and differ only by day/season (Diamond Garden's
 * four same-named "All-Inclusive" rows) into one card per name, so the F&B section shows one
 * package card with a min-max price instead of a card per day/season combination — the
 * season x day breakdown itself belongs in the Pricing section's grid, not repeated as cards. */
export function collapseTiersByName(tiers: PerGuestTier[]): CollapsedTier[] {
  const byName = new Map<string, PerGuestTier[]>();
  for (const t of tiers) {
    if (!byName.has(t.name)) byName.set(t.name, []);
    byName.get(t.name)!.push(t);
  }
  return [...byName.entries()].map(([name, group]) => {
    const amounts = group.map((t) => t.per_guest);
    return {
      id: group[0].id,
      name,
      representative: group[0],
      minPerGuest: Math.min(...amounts),
      maxPerGuest: Math.max(...amounts),
    };
  });
}

/** "$68.95 /guest", or "from $68.95 to $84.95 /guest" when a collapsed tier's price actually
 * varies by day/season. */
export function tierPriceLabel(min: number, max: number): string {
  return min === max ? `${money(min)} /guest` : `from ${money(min)} to ${money(max)} /guest`;
}

/** A bar ladder's per-guest price range across its duration options ("$3.95 – $4.95 /guest" for
 * Diamond Garden's `{"4hr": 3.95, "5hr": 4.95}`), for the F&B bar table's "Cost (4 or 5 hours)"
 * column — round-3 fix: the old rendering dropped the "/guest" unit entirely. */
export function barLadderPriceLabel(prices: Record<string, number>): string {
  const amounts = Object.values(prices);
  if (amounts.length === 0) return "";
  return `${moneyRange(Math.min(...amounts), Math.max(...amounts))} /guest`;
}

/** The bar section's own guest minimum, called out on its own line (round-3 fix: a 50-guest
 * minimum on bar packages never rendered anywhere). Null when the venue doesn't state one. */
export function barMinGuestsLine(minGuests: number | null): string | null {
  return minGuests != null ? `Bar packages require ${minGuests.toLocaleString()}+ guests.` : null;
}

// ---------------------------------------------------------------------------
// Calculator axis options (day/season/tier pills, ordered affirmative-first)
// ---------------------------------------------------------------------------

const DEFAULT_DAY_ORDER: Day[] = ["sat", "fri", "sun", "weekday", "mon", "tue", "wed", "thu", "any"];
const DEFAULT_SEASON_ORDER: Season[] = ["peak", "off", "any"];

export function pathDays(path: PricingPath): Day[] {
  const s = new Set<Day>();
  for (const f of path.fixed_fees) if (f.day) s.add(f.day);
  for (const t of path.per_guest_tiers) if (t.day) s.add(t.day);
  return [...s];
}

export function pathSeasons(path: PricingPath): Season[] {
  const s = new Set<Season>();
  for (const f of path.fixed_fees) if (f.season) s.add(f.season);
  for (const t of path.per_guest_tiers) if (t.season) s.add(t.season);
  return [...s];
}

export function pathDayOptions(path: PricingPath, order: Day[] = DEFAULT_DAY_ORDER): { value: Day; label: string }[] {
  const days = new Set(pathDays(path));
  return order.filter((d) => days.has(d)).map((d) => ({ value: d, label: dayLabel(d) }));
}

export function pathSeasonOptions(path: PricingPath, order: Season[] = DEFAULT_SEASON_ORDER): { value: Season; label: string }[] {
  const seasons = new Set(pathSeasons(path));
  return order.filter((s) => seasons.has(s)).map((s) => ({ value: s, label: seasonLabel(s) }));
}

export function pathTierOptions(path: PricingPath): { value: string; label: string }[] {
  const seen = new Set<string>();
  const options: { value: string; label: string }[] = [];
  for (const t of path.per_guest_tiers) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    options.push({ value: t.id, label: t.name });
  }
  return options;
}

export function guestRangeReminder(range: { min: number | null; max: number | null; max_measures: "seated" | "guests" }): string {
  if (range.max == null) return "";
  if (range.min != null) return `${range.min}–${range.max} ${range.max_measures}`;
  return `Up to ${range.max} ${range.max_measures}`;
}

export interface SelectionGroup {
  key: string;
  items: AddOn[];
}

export interface SplitAddOns {
  /** Items sharing a `selection_group` (Diamond Garden's food package / dinnerware / bar tier /
   * extra hour) — one PillGroup per key, "None" first, single-select. */
  groups: SelectionGroup[];
  /** Everything else — independently toggleable chips, same as every other golden. */
  individual: AddOn[];
}

/** Splits a path-scoped add-on list into single-select groups vs individually toggleable items
 * (round-3 addition) — used by the calculator's "Add extras" panel. Pure so it's unit-testable
 * without rendering `CostEstimate`. */
export function splitAddOnsBySelection(addOns: AddOn[]): SplitAddOns {
  const byGroup = new Map<string, AddOn[]>();
  for (const a of addOns) {
    if (!a.selection_group) continue;
    if (!byGroup.has(a.selection_group)) byGroup.set(a.selection_group, []);
    byGroup.get(a.selection_group)!.push(a);
  }
  return { groups: [...byGroup.entries()].map(([key, items]) => ({ key, items })), individual: addOns.filter((a) => !a.selection_group) };
}

const SELECTION_GROUP_LABELS: Record<string, string> = {
  "food-package": "Food package",
  dinnerware: "Dinnerware",
  bar: "Bar tier",
  "extra-hour": "Extra hour",
};

/** Humanized column/group heading for an `AddOn.selection_group` key (Diamond Garden's food
 * package / dinnerware / bar tier / extra hour single-select groups). Falls back to
 * title-casing the raw key for a group this table doesn't already know about. */
export function selectionGroupLabel(key: string): string {
  return SELECTION_GROUP_LABELS[key] ?? key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Calculator "under_minimum" copy that names the actual day-specific (or general) minimum that
 * was missed, instead of one generic sentence for every venue/day (round-3 fix, matching the
 * concept calculator's own day-aware message). Null when the path states no guest minimum at all. */
export function underMinimumMessage(path: PricingPath, guests: number, day: Day, season: Season): string | null {
  const candidates = path.minimums.filter((m) => m.kind === "guest_minimum" && (m.season == null || m.season === "any" || m.season === season));
  const m = candidates.find((c) => c.day === day) ?? candidates.find((c) => c.day == null || c.day === "any");
  if (!m) return null;
  const dayText = m.day && m.day !== "any" ? ` for ${dayFullLabel(m.day)}s` : "";
  return `${guests.toLocaleString()} guests is below the ${m.amount.toLocaleString()}-guest minimum${dayText}.`;
}

// ---------------------------------------------------------------------------
// Add-ons
// ---------------------------------------------------------------------------

const ADD_ON_UNIT_SUFFIX: Record<AddOn["unit"], string> = {
  flat: "",
  per_guest: " /guest",
  per_unit: " /unit",
  per_hour: " /hour",
};

/** "$X /guest" etc, or the honest gaps from golden-set-template.md §2: "No published rate" for a
 * real add-on with no number. Prefers the venue's own `as_stated_price` wording when present. */
export function addOnPriceString(a: AddOn): string {
  if (a.as_stated_price) return a.as_stated_price;
  if (a.price == null) return "No published rate";
  const base = a.price_max != null && a.price_max !== a.price ? moneyRange(a.price, a.price_max) : money(a.price);
  return `${base}${ADD_ON_UNIT_SUFFIX[a.unit]}`;
}

export interface AddOnTableRow {
  category: string;
  note: string | null;
  variants: { key: string; name: string; prices: string[] }[];
}

export interface AddOnTable {
  columnLabels: string[];
  rows: AddOnTableRow[];
}

/** Known `AddOn.condition` values, humanized for display — golden-set-template.md §2's "name the
 * trigger" rule: a conditional fee (only charged if a real yes/no decision goes one way) shows
 * that condition as its own option label instead of a bare, unlabeled "Flat rate". */
const CONDITION_LABELS: Partial<Record<string, string>> = {
  ceremony_on_site: "On-site ceremony",
};

function humanizeCondition(condition: string): string {
  return CONDITION_LABELS[condition] ?? condition.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The Option-column label for one add-on row: its own `variant` when it has one, else its
 * condition named as the trigger (a `group: "ceremony"` add-on's `condition` — "On-site
 * ceremony" rather than "Flat rate", Marchetti's fix), else the "Flat rate" fallback for a
 * genuinely unconditional single-price add-on. */
function addOnVariantLabel(a: AddOn): string {
  if (a.variant) return a.variant;
  if (a.group === "ceremony" && a.condition) return humanizeCondition(a.condition);
  return "Flat rate";
}

/** Category-rows x variant/space-columns table (golden-set-template.md §2's "genuinely 2-axis"
 * shape, Marchetti's Space & rentals table). One row per category, one sub-row per variant. */
export function buildAddOnTable(addOns: AddOn[], spaces: Space[]): AddOnTable {
  const spaceIds = [...new Set(addOns.flatMap((a) => (a.per_space_prices ? Object.keys(a.per_space_prices) : [])))];
  const spaceName = (id: string) => spaces.find((s) => s.id === id)?.name ?? id;
  const columnLabels = spaceIds.length > 0 ? spaceIds.map(spaceName) : ["Price"];

  const byCategory = new Map<string, AddOn[]>();
  for (const a of addOns) {
    if (!byCategory.has(a.category)) byCategory.set(a.category, []);
    byCategory.get(a.category)!.push(a);
  }

  const rows: AddOnTableRow[] = [...byCategory.entries()].map(([category, items]) => ({
    category,
    note: items[0]?.note ?? null,
    variants: items.map((a) => ({
      key: a.id,
      name: addOnVariantLabel(a),
      prices: spaceIds.length > 0 ? spaceIds.map((sid) => (a.per_space_prices?.[sid] != null ? money(a.per_space_prices[sid]) : addOnPriceString(a))) : [addOnPriceString(a)],
    })),
  }));

  return { columnLabels, rows };
}

export interface AddOnCategoryGroup {
  category: string;
  blurb: string | null;
  /** Curated example bullets (`Pricing.add_on_categories[].examples`) — always shown; the section
   * falls back to these when `items` is empty (a category whose real add-ons are all single-select
   * calculator PillGroup options, so there's nothing left to show as an independent card/table). */
  examples: string[];
  /** Independently-selectable add-ons in this category (excludes anything with a
   * `selection_group` — those are single-select calculator options already fully described by
   * `examples`, and would otherwise show as a duplicate, individually-toggleable card). */
  items: AddOn[];
}

/** Category-level grouping for the Add-ons & extras section, built from `Pricing.add_on_categories`
 * (round-3 addition) — null when a venue doesn't carry curated categories, so the renderer falls
 * back to the plain fb/rental split every other golden fixture already uses (this never changes
 * rendering for a venue without `add_on_categories`). */
export function addOnCategoryGroups(d: VenueDetailsV3): AddOnCategoryGroup[] | null {
  const categories = d.pricing.add_on_categories;
  if (!categories || categories.length === 0) return null;
  const itemsFor = (category: string) => d.pricing.add_ons.filter((a) => a.category === category && !a.selection_group);
  const groups: AddOnCategoryGroup[] = categories.map((c) => ({ category: c.category, blurb: c.blurb, examples: c.examples, items: itemsFor(c.category) }));
  // Any add-on in a category the curated list doesn't name (Diamond Garden's "Ceremony" upgrades)
  // still needs a home — appended as its own uncurated group rather than silently dropped.
  const known = new Set(categories.map((c) => c.category));
  const leftover = [...new Set(d.pricing.add_ons.filter((a) => !known.has(a.category) && !a.selection_group).map((a) => a.category))];
  for (const category of leftover) groups.push({ category, blurb: null, examples: [], items: itemsFor(category) });
  return groups;
}

// ---------------------------------------------------------------------------
// Food & beverage pills
// ---------------------------------------------------------------------------

const FB_PILL_LABELS: Record<FbPill, string> = {
  byo: "Bring Your Own (BYO)",
  a_la_carte: "À la carte",
  all_inclusive: "All-Inclusive",
};

export function fbPillLabel(p: FbPill): string {
  return FB_PILL_LABELS[p];
}

function sameFbSet(a: FbPill[], b: FbPill[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

/** One shared pill row (vs. labeled Food/Bar sub-rows) only when both sides say the same thing
 * and there's no caption needing its own explanation — golden-set-template.md §3. */
export function fbSharedRow(food: FbPill[], bar: FbPill[], hasCaption: boolean): boolean {
  return !hasCaption && sameFbSet(food, bar);
}

/** "shared" | "split" — the full trigger set for golden-set-template.md §3's "two shapes, picked
 * by whether Food and Bar have anything different to say" rule: identical pills (`fbSharedRow`)
 * PLUS whether there's real side-tied reference material — a `caption` (a narrow policy
 * exception worth calling out, LondonHouse's corkage carve-out) or a `catering_guidelines` /
 * `bar_menu` resource (Greenhouse Loft's composting-guidelines PDF). A bare `food_beverage.notes`
 * entry with no such resource is NOT on its own enough to force a split — Marchetti's "Villa,
 * Tenuta, Riserva Bar Collections" note is real, but it's fully restated by the per-guest tier
 * cards' own `bar_tier` info rendered right below, which is exactly the redundant-subsection
 * shape the template's own Marchetti fix reverted (§3). */
export function fbLayout(d: VenueDetailsV3): "shared" | "split" {
  const { food, bar } = fbPills(d);
  const hasCaption = d.food_beverage.caption != null;
  const hasSideResource = d.resources.some((r) => r.kind === "catering_guidelines" || r.kind === "bar_menu");
  return fbSharedRow(food, bar, hasCaption) && !hasSideResource ? "shared" : "split";
}

const FOOD_NOTE_PATTERN = /cater|compost|kitchen|\bmenu\b|\bfood\b/i;
const BAR_NOTE_PATTERN = /\bbar\b|alcohol|cocktail|\bwine\b|\bbeer\b|spirit|liquor|corkage|byob/i;

/** Attributes a free-text F&B note/caption to a side by keyword, for placement under the FOOD or
 * BAR sub-row in split layout. Null (not rendered under either side) when the text matches both
 * or neither — an ambiguous note is safer omitted than guessed onto the wrong side. */
export function fbNoteSide(text: string): "food" | "bar" | null {
  const food = FOOD_NOTE_PATTERN.test(text);
  const bar = BAR_NOTE_PATTERN.test(text);
  if (food && !bar) return "food";
  if (bar && !food) return "bar";
  return null;
}

/** The "Plus X% service charge, plus Y% sales tax" sentence under the F&B tier cards — fix
 * round, 2026-09-13 review: a real, explicitly-zero service charge must read "No service
 * charge," never "Plus 0% service charge"; when there's also nothing to say about tax (taxes
 * already folded into the rental rate), the whole sentence is dropped rather than printing a
 * sentence that only says "no service charge" and nothing else useful. */
export function fbRateSentence(rates: Rates): string | null {
  const taxIncluded = rates.sales_tax_source === "included";
  if (rates.service_charge_pct === 0 && taxIncluded) return null;

  const taxParts: string[] = [];
  if (rates.sales_tax_pct != null && rates.sales_tax_source !== "unknown" && !taxIncluded) {
    const assumed = rates.sales_tax_source === "chicago_default" ? " (assumed)" : "";
    taxParts.push(`${rates.sales_tax_pct}% sales tax${assumed}`);
  } else if (taxIncluded) {
    taxParts.push("taxes included in the rental rate");
  }

  if (rates.service_charge_pct === 0) {
    if (taxParts.length === 0) return "No service charge.";
    return `No service charge, plus ${taxParts.join(", plus ")}.`;
  }

  const parts: string[] = [];
  if (rates.service_charge_pct != null) parts.push(`${rates.service_charge_pct}% service charge on food & beverage`);
  parts.push(...taxParts);
  return parts.length > 0 ? `Plus ${parts.join(", plus ")}.` : null;
}

// ---------------------------------------------------------------------------
// Inclusions
// ---------------------------------------------------------------------------

export interface InclusionGroup {
  category: string;
  items: InclusionItem[];
}

/** Always grouped by category, in the pinned `INCLUSION_CATEGORIES` order (round-3 fix: the old
 * "flat under 7 items" threshold left Diamond Garden's 6-item, 2-category list unheaded, and a
 * couple can't tell "Chairs"/"Dance floor" (Furniture) apart from the rest at a glance without
 * the header). A single-category list still gets one header — that's honest, not noise. */
export function groupInclusions(items: InclusionItem[]): InclusionGroup[] {
  const byCategory = new Map<string, InclusionItem[]>();
  for (const it of items) {
    if (!byCategory.has(it.category)) byCategory.set(it.category, []);
    byCategory.get(it.category)!.push(it);
  }
  return INCLUSION_CATEGORIES.filter((category) => byCategory.has(category)).map((category) => ({ category, items: byCategory.get(category)! }));
}

export interface InclusionDisplay {
  /** Bold-weight label prefix, or null when `text` already reads as a complete phrase on its
   * own (no "Label: Label" or "Label: Private label" redundancy). */
  boldLabel: string | null;
  text: string;
}

/** `label_raw` is shown only when it adds information beyond the canonical `label` (round-3
 * fix). Three cases: a real structured `detail` always wins ("F&B minimum: $3,000"); a raw
 * wording that's just `label` with an affix ("Private bridal suite" for "Bridal suite", "New
 * silver Chiavari chairs" for "Chairs") reads fine alone, no redundant "Label: " prefix; anything
 * else (raw wording that's a genuinely separate fact, "2 parking lots, 75+ spaces" for "Parking")
 * keeps the "Label: raw" form so the canonical label still anchors the sentence. */
export function inclusionDisplay(inc: InclusionItem): InclusionDisplay {
  if (inc.detail) return { boldLabel: inc.label, text: inc.detail };
  const rawLower = inc.label_raw.toLowerCase();
  const labelLower = inc.label.toLowerCase();
  if (rawLower === labelLower) return { boldLabel: null, text: inc.label };
  if (rawLower.startsWith(labelLower) || rawLower.endsWith(labelLower)) return { boldLabel: null, text: inc.label_raw };
  return { boldLabel: inc.label, text: inc.label_raw };
}

/** Locked Policies pill treatment (golden-set-template.md §2, Greenhouse Loft's fix): a real
 * answer gets the tinted pill; "not stated" is grey and italic. */
export function policyPillClassName(stated: boolean): string {
  return `inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${stated ? "bg-[#fdf8f5] text-gray-700" : "bg-gray-100 italic text-gray-400"}`;
}

// ---------------------------------------------------------------------------
// Section visibility predicates
// ---------------------------------------------------------------------------

export function showPricingSection(d: VenueDetailsV3): boolean {
  return d.pricing.paths.length >= 2;
}

/** Pricing section grid class: 2 columns for 2 paths, 3 columns (never 2, which orphans the
 * third card onto its own row) for exactly 3, and back to 2 (wrapping 2x2) for 4+ — round-3 fix. */
export function pricingGridClass(pathCount: number): string {
  return `grid gap-5 sm:grid-cols-2${pathCount === 3 ? " lg:grid-cols-3" : ""}`;
}

export function showInclusions(d: VenueDetailsV3): boolean {
  return d.inclusions.length > 0;
}

export function showAddOns(d: VenueDetailsV3): boolean {
  return d.pricing.add_ons.length > 0;
}

export function showPressFeatures(d: VenueDetailsV3): boolean {
  return d.press_features.length > 0;
}

/** A vendor list only earns its section when it has >= 2 real entries — same bar as
 * `quality-rubric.md`'s extraction standard (a single name after filtering junk isn't a list). */
export function visibleVendorLists(d: VenueDetailsV3): VendorList[] {
  return d.vendor_lists.filter((l) => l.entries.length >= 2);
}

export function showVendorLists(d: VenueDetailsV3): boolean {
  return visibleVendorLists(d).length > 0;
}

/** Sustainability differentiators get the emerald treatment; everything else is rose
 * (golden-set-template.md §4 — "a color/motif genuinely tied to that venue's real
 * differentiator", generalized since the generic renderer can't hand-pick a bespoke color). */
export function differentiatorColor(title: string): "emerald" | "rose" {
  return /sustainab/i.test(title) ? "emerald" : "rose";
}

// ---------------------------------------------------------------------------
// Policy row evidence (for FactSource — policyRows() itself only returns display strings)
// ---------------------------------------------------------------------------

export interface FactEvidence {
  quote: string;
  source_url: string;
  snapshot_id: number | null;
}

export type PolicyEvidence = { kind: "none" } | { kind: "stated"; fact: FactEvidence } | { kind: "conflicting"; candidates: FactEvidence[] };

export function policyEvidence(d: VenueDetailsV3, key: (typeof POLICY_ROW_KEYS)[number]): PolicyEvidence {
  const tri = d.spine[key];
  if (tri.status === "not_stated") return { kind: "none" };
  if (tri.status === "conflicting") {
    return { kind: "conflicting", candidates: tri.candidates.map((c) => ({ quote: c.quote, source_url: c.source_url, snapshot_id: c.snapshot_id })) };
  }
  return { kind: "stated", fact: { quote: tri.quote, source_url: tri.source_url, snapshot_id: tri.snapshot_id } };
}

// ---------------------------------------------------------------------------
// Resource button collapsing (fix round, 2026-09-13 review: a row of 7+ inline buttons
// overflowed a space card header and caused horizontal scroll at phone width)
// ---------------------------------------------------------------------------

/** More than this many resource buttons in one heading's actions slot collapses to a single
 * "Resources (N)" / "Floor plans (N)" menu button instead of one button per resource. */
export const MAX_INLINE_RESOURCE_BUTTONS = 3;

export function shouldCollapseResourceButtons(count: number): boolean {
  return count > MAX_INLINE_RESOURCE_BUTTONS;
}

/** A space card header never shows more than one resource button — 2+ floor plans collapse to a
 * single "Floor plans (N)" menu button (stricter than the general 3-button rule above, since a
 * space card is a much smaller, denser layout than a full section heading). */
export function shouldCollapseFloorPlans(count: number): boolean {
  return count > 1;
}

// ---------------------------------------------------------------------------
// Grounding footer
// ---------------------------------------------------------------------------

export function siteDomain(websiteUrl: string | null): string | null {
  if (!websiteUrl) return null;
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./, "");
  } catch {
    return websiteUrl;
  }
}

// ---------------------------------------------------------------------------
// Resource placement (fix round, 2026-09-18 user review of the goldens): the old renderer only
// ever looked for `kind: "floor_plan"` scoped to a space, or a hand-picked kind list per section
// heading — 18 of the 34 resources across the six fixtures never reached the DOM (a Greenhouse
// floor plan/tour/gallery mis-scoped `venue` instead of `space:loft`, a Diamond Garden add-ons PDF
// hard-indexed to `[0]`, LondonHouse's capacity chart + video never routed anywhere). One routing
// table instead: every `Resource` on a document lands in exactly one bucket below; `unplaced`
// should always be empty (see the placement invariant test in format.test.ts, over all six golden
// fixtures) — a resource kind this function doesn't recognize is a bug to surface, not to drop.
// ---------------------------------------------------------------------------

export interface PlacedResources {
  about: Resource[];
  /** Venue-scoped capacity_sheet/floor_plan/virtual_tour/video/gallery — the Spaces (or, for a
   * single-space venue, "The Space") section heading's own actions row, e.g. LondonHouse's
   * capacity chart + wedding video. */
  spacesHeading: Resource[];
  /** The same five kinds, but space-scoped (`scope: "space:<id>"`) — that one space card's own
   * header row instead of the section heading. Keyed by space id. */
  perSpace: Record<string, Resource[]>;
  /** Food & Beverage's Food side (`menu`, `catering_guidelines`) when the section is split. */
  food: Resource[];
  /** Food & Beverage's Bar side (`bar_menu`) when the section is split. */
  bar: Resource[];
  /** Food & Beverage's own section-heading actions when the section is shared (one row, not
   * split into Food/Bar sides). */
  fbShared: Resource[];
  /** `other` — Add-ons & extras' own heading actions (Diamond Garden's add-ons PDF). */
  addOns: Resource[];
  /** `contract` — Policies' own heading actions (`catering_guidelines` no longer lands here; it
   * belongs to Food & Beverage and was a duplicate, Greenhouse's fix). */
  policies: Resource[];
  /** `vendor_list` — Vendors' own heading actions. */
  vendors: Resource[];
  /** Should always be empty for a real document; a non-empty list means this function's routing
   * table missed a kind/scope combination. */
  unplaced: Resource[];
}

/** Venue-scoped resources of these kinds render as Spaces-heading actions (LondonHouse's capacity
 * chart + video shape on the concept page). `capacity_sheet` is deliberately absent from
 * `SPACE_CARD_KINDS` below — a capacity sheet is always venue-level, never per-room. */
const SPACES_HEADING_KINDS: ResourceKind[] = ["floor_plan", "capacity_sheet", "virtual_tour", "video", "gallery"];

/** The same kinds, minus `capacity_sheet`, render in a specific space's own card header when
 * scoped to that space (Field Museum's four per-space video tours; Marchetti/Greenhouse/Geraghty's
 * per-space or single-space floor plans). */
const SPACE_CARD_KINDS: ResourceKind[] = ["floor_plan", "virtual_tour", "video", "gallery"];

export function placeResources(venue: VenueDetailsV3): PlacedResources {
  const placed: PlacedResources = {
    about: [],
    spacesHeading: [],
    perSpace: {},
    food: [],
    bar: [],
    fbShared: [],
    addOns: [],
    policies: [],
    vendors: [],
    unplaced: [],
  };
  // Whenever the F&B section is split into Food/Bar sub-headers, its resources go beside the
  // matching side; otherwise they collect into one shared action row (fbLayout already forces
  // "split" whenever a catering_guidelines or bar_menu resource exists — see fbLayout above — so
  // this never silently strands a real resource in the shared bucket instead of a side).
  const split = fbLayout(venue) === "split";

  for (const r of venue.resources) {
    if (r.kind === "brochure") {
      placed.about.push(r);
      continue;
    }
    if (r.scope !== "venue") {
      if (SPACE_CARD_KINDS.includes(r.kind)) {
        const spaceId = r.scope.slice("space:".length);
        (placed.perSpace[spaceId] ??= []).push(r);
      } else {
        placed.unplaced.push(r);
      }
      continue;
    }
    if (SPACES_HEADING_KINDS.includes(r.kind)) {
      placed.spacesHeading.push(r);
    } else if (r.kind === "menu" || r.kind === "catering_guidelines") {
      (split ? placed.food : placed.fbShared).push(r);
    } else if (r.kind === "bar_menu") {
      (split ? placed.bar : placed.fbShared).push(r);
    } else if (r.kind === "contract") {
      placed.policies.push(r);
    } else if (r.kind === "other") {
      placed.addOns.push(r);
    } else if (r.kind === "vendor_list") {
      placed.vendors.push(r);
    } else {
      placed.unplaced.push(r);
    }
  }

  return placed;
}
