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
  ADD_ON_CATEGORIES_STD,
  type AddOn,
  type AddOnCategoryStd,
  type CapacityTuple,
  type Day,
  type Fact,
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
  type VenueSpine,
  isStated,
} from "../../../lib/venueDetails/types";

// ---------------------------------------------------------------------------
// Money / units
// ---------------------------------------------------------------------------

export function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** Thousands separators for a plain (non-money) count — guest numbers, capacities, etc. Round 4
 * rule 1: every number that renders anywhere on the page goes through this (or `money`), not a
 * bare template-literal interpolation. */
export function int(n: number): string {
  return n.toLocaleString();
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

export interface SpaceSizeLine {
  text: string;
  /** False for the honest "— sq ft (not stated)" placeholder (round 5 rule 2) — the caller renders
   * it grey/italic instead of the normal size-line color. */
  stated: boolean;
}

/** Space header size line (fix round, 2026-09-13 review): "X sq ft indoor · Y sq ft outdoor"
 * when both indoor and outdoor square footage are stated; otherwise the plain sq-ft/structure
 * line. Round 5 rule 2 (supersedes the 2026-09-13 review's "omit entirely" call): when `sqFt`
 * itself isn't stated, the line always renders as the honest grey "— sq ft (not stated)"
 * placeholder (Diamond Garden's own concept page precedent) instead of disappearing.
 *
 * `sqFtLabelRaw` (2026-09-18 review, Field Museum): when the venue states its size as a string
 * rather than a clean number ("~21,000 (main floor)", "11,376–35,997"), `sq_ft` still carries the
 * first integer found in it (for numeric code), but the line itself shows the venue's own wording
 * verbatim instead of the reduced-to-one-number version. */
export function spaceSizeLine(sqFt: number | null, sqFtOutdoor: number | null, structureLabel: string | null, sqFtLabelRaw?: string | null): SpaceSizeLine {
  if (sqFt == null) return { text: "— sq ft (not stated)", stated: false };
  const primary = sqFtLabelRaw ? `${sqFtLabelRaw} sq ft` : `${sqFt.toLocaleString()} sq ft`;
  if (sqFtOutdoor != null) {
    const parts = [sqFtLabelRaw ? primary : `${sqFt.toLocaleString()} sq ft indoor`, `${sqFtOutdoor.toLocaleString()} sq ft outdoor`];
    if (structureLabel) parts.push(structureLabel);
    return { text: parts.join(" · "), stated: true };
  }
  const parts = [primary];
  if (structureLabel) parts.push(structureLabel);
  return { text: parts.join(" · "), stated: true };
}

/** "Ceiling height: 8–14 ft" (venue's own wording) or "Ceiling height: 22 ft" (formatted number)
 * — same verbatim-label-else-formatted-number rule as `spaceSizeLine`'s `sqFtLabelRaw`. Round 5
 * rule 2: when neither is stated, renders the honest "Ceiling height: not stated" gap ONLY when
 * the space has some other stated size fact (`hasOtherSizeFacts`, default false — a space with no
 * size facts at all doesn't get a lone ceiling gap line); null (omit) otherwise. */
export function ceilingLine(ceilingFt: number | null, ceilingLabel?: string | null, hasOtherSizeFacts: boolean = false): string | null {
  if (ceilingLabel) return `Ceiling height: ${ceilingLabel}`;
  if (ceilingFt != null) return `Ceiling height: ${ceilingFt} ft`;
  return hasOtherSizeFacts ? "Ceiling height: not stated" : null;
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
 * twice. Superseded as the card's OWN branching logic by `spaceRentalLine` below (round 4
 * regression fix — the two used to disagree, leaving the card with nothing to show once a
 * standalone Pricing section existed); kept and still tested since `spaceRentalLine` mirrors this
 * exact condition for its own "grid" branch. */
export function showSpaceRentalGrid(spaceFeesCount: number, wholeVenueFeesCount: number, pricingPathsCount: number): boolean {
  return spaceFeesCount === 0 && wholeVenueFeesCount > 0 && pricingPathsCount < 2;
}

/** "$2,100 – $6,595 flat" over a set of whole-venue fees — the min–max range `spaceRentalLine`'s
 * "summary" branch quotes when a standalone Pricing section already shows the full grid. */
function wholeVenueFeeSummaryLine(fees: FixedFee[]): string | null {
  if (fees.length === 0) return null;
  const amounts = fees.map((f) => f.amount);
  return `${moneyRange(Math.min(...amounts), Math.max(...amounts))} flat`;
}

export type SpaceRentalLine =
  | { kind: "fees" }
  | { kind: "grid" }
  | { kind: "summary"; line: string }
  | { kind: "bundled"; sameRateAnyRoom: boolean }
  | { kind: "on_request" };

/** Every space card gets a "Venue rental" line (round 4 rule 6), in this precedence — regression
 * fix: the card used to fall all the way to "Pricing: on request" once a standalone Pricing
 * section existed, because the old two-boolean signature couldn't tell "no grid because there's a
 * Pricing section instead" apart from "no grid because there's really nothing to show".
 *
 * 1. `spaceFeesCount > 0` -> this space's own fee rows (rendered by the caller, unchanged).
 * 2. `wholeVenueFees.length > 0` -> the default path prices the whole venue:
 *    - no standalone Pricing section (`pricingPathsCount < 2`) -> the grid, in this card.
 *    - a Pricing section exists -> one summary line ("$2,100 – $6,595 flat · see Pricing below"),
 *      never a second copy of the grid.
 * 3. the default path bundles rental into per-guest tiers -> "included in the per-guest package
 *    price" (+ "same rate regardless of room" when `applies_to_spaces` is "all").
 * 4. otherwise (no paths at all) -> "Pricing: on request." */
export function spaceRentalLine(spaceFeesCount: number, wholeVenueFees: FixedFee[], pricingPathsCount: number, path: PricingPath | undefined): SpaceRentalLine {
  if (spaceFeesCount > 0) return { kind: "fees" };
  if (wholeVenueFees.length > 0) {
    if (pricingPathsCount < 2) return { kind: "grid" };
    const summary = wholeVenueFeeSummaryLine(wholeVenueFees);
    return summary ? { kind: "summary", line: `${summary} · see Pricing below` } : { kind: "grid" };
  }
  if (path && path.per_guest_tiers.length > 0) return { kind: "bundled", sameRateAnyRoom: path.applies_to_spaces === "all" };
  return { kind: "on_request" };
}

export interface WholeVenueFeeGroup {
  season: Season;
  parts: { label: string; amount: number; fee: FixedFee }[];
}

/** Calendar day order — Weekday (Mon–Thu), Fri, Sat, Sun — used by every price grid and
 * calculator PillGroup (round 4 rule 2; replaces the old affirmative/Saturday-first order those
 * used before). Not used by the "book both together" whole-venue sentence below, which keeps its
 * own Fri → Sat → Sun-first phrasing (a written sentence, not a grid/PillGroup). */
export const DAY_ORDER: Day[] = ["weekday", "mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** Day order for the "book both together" whole-venue line specifically — Fri → Sat → Sun (then
 * everything else), the order a couple actually compares wedding days in. */
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

/** First month mentioned in a venue's own season-definition string ("Apr–Oct, Dec" -> 4, "Jan,
 * Feb, Mar, Nov" -> 1) — round 4 rule 2. Null when the text doesn't start with a recognizable
 * month name/abbreviation. */
const MONTH_INDEX: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function parseFirstMonth(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = /^[a-z]{3}/i.exec(text.trim());
  if (!m) return null;
  return MONTH_INDEX[m[0].toLowerCase()] ?? null;
}

/** Chronological season order from the venue's own month definitions (round 4 rule 2): whichever
 * season starts earlier in the calendar year comes first (Greenhouse's off-season, Jan–Mar, before
 * its Apr–Dec peak). Falls back to off-first when months can't be parsed or aren't stated at all —
 * a deliberate reversal of the old hardcoded peak-first default. `any` always sorts last. */
export function seasonOrderFor(seasons: Pricing["seasons"] | undefined): Season[] {
  const peakMonth = parseFirstMonth(seasons?.peak);
  const offMonth = parseFirstMonth(seasons?.off);
  if (peakMonth != null && offMonth != null && peakMonth !== offMonth) {
    return peakMonth < offMonth ? ["peak", "off", "any"] : ["off", "peak", "any"];
  }
  return ["off", "peak", "any"];
}

export function buildPriceGrid<T>(
  items: T[],
  dayOf: (t: T) => Day | null,
  seasonOf: (t: T) => Season | null,
  amountOf: (t: T) => number,
  seasons?: Pricing["seasons"],
): PriceGrid {
  const seasonOrder = seasonOrderFor(seasons);
  const dayOrder: Day[] = [...DAY_ORDER, "any"];
  const seasonsSeen = new Set(items.map((i) => seasonOf(i) ?? "any"));
  const daysSeen = new Set(items.map((i) => dayOf(i) ?? "any"));
  const seasonsOut = seasonOrder.filter((s) => seasonsSeen.has(s));
  const days = dayOrder.filter((d) => daysSeen.has(d));
  const grid = seasonsOut.map((season) =>
    days.map((day) => {
      const match = items.find((i) => (seasonOf(i) ?? "any") === season && (dayOf(i) ?? "any") === day);
      return match ? amountOf(match) : null;
    }),
  );
  return { seasons: seasonsOut, days, grid };
}

export function fixedFeeGrid(fees: FixedFee[], seasons?: Pricing["seasons"]): PriceGrid {
  return buildPriceGrid(
    fees,
    (f) => f.day,
    (f) => f.season,
    (f) => f.amount,
    seasons,
  );
}

export function perGuestTierGrid(tiers: PerGuestTier[], seasons?: Pricing["seasons"]): PriceGrid {
  return buildPriceGrid(
    tiers,
    (t) => t.day,
    (t) => t.season,
    (t) => t.per_guest,
    seasons,
  );
}

// ---------------------------------------------------------------------------
// "Merged" price grid — round 4 rule 2 drops the old identical-price day-merging (Diamond
// Garden's Fri/Sun no longer collapse into one column): every day the venue's own fees/tiers
// actually use gets its own labeled column, in calendar order (Weekday, Fri, Sat, Sun — already
// the order `buildPriceGrid` pivoted `grid.days` into). The "Merged"/"buildMergedPriceGrid" names
// are kept so call sites don't churn; nothing merges anymore.
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

/** One column per day (no merging), in the order `grid.days` already carries. Returns null when
 * there's nothing to show. */
export function buildMergedPriceGrid(grid: PriceGrid): MergedPriceGrid | null {
  if (grid.days.length === 0 || grid.seasons.length === 0) return null;
  const columns: PriceGridColumn[] = grid.days.map((d) => ({ days: [d], label: dayLabel(d) }));
  return { seasons: grid.seasons, columns, grid: grid.grid };
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
  const parts = pricingHeadlineParts(path);
  return parts ? `${parts.main} ${parts.unit}` : null;
}

/** Same numbers as `pricingHeadlineLine`, split so the Pricing card can render the price large/bold
 * and the "flat"/"/guest" unit small/grey (round 5 rule 6, rule 8's typography applied to the
 * headline price line too) instead of one plain string. */
export function pricingHeadlineParts(path: PricingPath): PriceWithUnit | null {
  if (path.per_guest_tiers.length > 0) {
    const amounts = path.per_guest_tiers.map((t) => t.per_guest);
    return { main: moneyRange(Math.min(...amounts), Math.max(...amounts)), unit: "/guest" };
  }
  const fees = path.fixed_fees.filter((f) => f.applies_to === "space" || f.applies_to === "whole_venue");
  if (fees.length > 0) {
    const amounts = fees.map((f) => f.amount);
    return { main: moneyRange(Math.min(...amounts), Math.max(...amounts)), unit: "flat" };
  }
  return null;
}

/** All of a path's guest minimums collapsed into one line — "150 guests (125 Friday, 100 Sunday)":
 * the general (day-less) minimum first, any day-specific ones named in parentheses (round 4 rule
 * 16; replaces printing one row per day-specific minimum). Null when the path states none. */
export function collapsedGuestMinimumLine(minimums: Minimum[]): string | null {
  const guestMins = minimums.filter((m) => m.kind === "guest_minimum");
  if (guestMins.length === 0) return null;
  const general = guestMins.find((m) => m.day == null || m.day === "any") ?? null;
  const specific = guestMins.filter((m) => m !== general && m.day != null && m.day !== "any");
  const generalText = general ? `${general.amount.toLocaleString()} guests` : null;
  const specificText = specific.map((m) => `${m.amount.toLocaleString()} ${dayFullLabel(m.day!)}`).join(", ");
  if (generalText && specificText) return `${generalText} (${specificText})`;
  return generalText ?? (specificText || null);
}

export interface TierInclusionBulletGroup {
  /** "Food" / "Bar" / "Setup", or null for a flat, ungrouped list. */
  header: string | null;
  items: string[];
}

const TIER_INCLUSION_PREFIX = /^(Food|Bar|Setup):\s*/;

/** A Pricing card's own inclusions bullets from its representative per-guest tier — grouped under
 * "Food:"/"Bar:"/"Setup:" sub-headers when the tier's own inclusion strings carry that prefix, else
 * one flat list (round 4 rule 16). Empty array when the tier has no inclusions. */
export function groupTierInclusionBullets(inclusions: string[]): TierInclusionBulletGroup[] {
  if (inclusions.length === 0) return [];
  if (!inclusions.some((i) => TIER_INCLUSION_PREFIX.test(i))) return [{ header: null, items: inclusions }];
  const byHeader = new Map<string, string[]>();
  for (const inc of inclusions) {
    const m = TIER_INCLUSION_PREFIX.exec(inc);
    const header = m ? m[1] : "Other";
    const text = m ? inc.slice(m[0].length) : inc;
    if (!byHeader.has(header)) byHeader.set(header, []);
    byHeader.get(header)!.push(text);
  }
  return [...byHeader.entries()].map(([header, items]) => ({ header, items }));
}

/** Fee-shape signature (day/season/amount, order-independent) used to detect a later path whose
 * rental fees are identical to an earlier one's. */
function feesSignature(fees: FixedFee[]): string {
  return fees
    .filter((f) => f.applies_to === "space" || f.applies_to === "whole_venue")
    .map((f) => `${f.day ?? "any"}|${f.season ?? "any"}|${f.amount}`)
    .sort()
    .join(";");
}

/** The earliest path (by document order) whose fixed fees are identical to `paths[index]`'s own —
 * round 4 rule 16: a later path built ON TOP of an earlier one's rental rate (Diamond Garden's
 * "Hall + à la carte" reusing "Hall Rental Only"'s grid) says "Same rental rates as {name}, plus
 * …" instead of repeating the grid. Null when the path has no fees to compare, or no earlier path
 * shares them. */
export function samePricingAsEarlierPath(paths: PricingPath[], index: number): PricingPath | null {
  const current = paths[index];
  if (!current) return null;
  const sig = feesSignature(current.fixed_fees);
  if (!sig) return null;
  for (let i = 0; i < index; i++) {
    if (feesSignature(paths[i].fixed_fees) === sig) return paths[i];
  }
  return null;
}

/** The standalone "Same rental rates as {name}." sentence a `samePricingAsEarlierPath` card shows
 * (fix round, 2026-09-19 review): kept as ITS OWN sentence, never concatenated with the path's own
 * `description` — the price line, includes/tier bullets, grid, and staffing/surcharge notes are all
 * identical to the earlier path by definition, so the card renders only its title, description, and
 * this one line. */
export function sameRentalRatesLine(earlierPathName: string): string {
  return `Same rental rates as ${earlierPathName}.`;
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

/** A season row's own label with its months folded in — "Off-season (Jan, Feb, Mar, Nov)" /
 * "Peak season (Apr–Oct, Dec)" — round 4 rule 16's Pricing-card grid rows. Falls back to the plain
 * `seasonLabel` when the venue doesn't state months for that season (or at all). */
export function seasonLabelWithMonths(s: Season, seasons: Pricing["seasons"] | undefined): string {
  const base = seasonLabel(s);
  const months = s === "peak" ? seasons?.peak : s === "off" ? seasons?.off : null;
  return months ? `${base} (${months})` : base;
}

/** Just the months half of `seasonLabelWithMonths`, for callers that want to render the season
 * name and its months as two separate lines (a Pricing card's grid row, round 4 follow-up: the
 * inline "(Jan, Feb, Mar, Nov)" form crowded a 3-column card) — null when the venue doesn't state
 * months for that season. */
export function seasonMonthsOnly(s: Season, seasons: Pricing["seasons"] | undefined): string | null {
  return (s === "peak" ? seasons?.peak : s === "off" ? seasons?.off : null) ?? null;
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

export interface PriceWithUnit {
  /** The bold, large part — a plain number or "from X to Y". */
  main: string;
  /** The small, grey unit suffix ("/guest"), or null for a flat one-time price with no unit. */
  unit: string | null;
}

/** Same numbers as `tierPriceLabel`, split so the renderer can show the price large/bold and the
 * "/guest" unit small/grey (round 4 rule 8) instead of one plain string. */
export function tierPriceParts(min: number, max: number): PriceWithUnit {
  return { main: min === max ? money(min) : `from ${money(min)} to ${money(max)}`, unit: "/guest" };
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
// Calculator axis options (day/season/tier pills)
// ---------------------------------------------------------------------------

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

/** Calendar order (Weekday, Fri, Sat, Sun — round 4 rule 2), replacing the old affirmative/
 * Saturday-first PillGroup order. */
export function pathDayOptions(path: PricingPath, order: Day[] = [...DAY_ORDER, "any"]): { value: Day; label: string }[] {
  const days = new Set(pathDays(path));
  return order.filter((d) => days.has(d)).map((d) => ({ value: d, label: dayLabel(d) }));
}

/** Chronological order from the venue's own season-month definitions when given, else the
 * off-first fallback (round 4 rule 2). */
export function pathSeasonOptions(path: PricingPath, seasons?: Pricing["seasons"], order: Season[] = seasonOrderFor(seasons)): { value: Season; label: string }[] {
  const seasonsSeen = new Set(pathSeasons(path));
  return order.filter((s) => seasonsSeen.has(s)).map((s) => ({ value: s, label: seasonLabel(s) }));
}

/** Tier PillGroup options, each carrying its own per-guest price as a `sublabel` — "Elegance ·
 * $220/guest" (round 4 rule 9), not a bare name. */
export function pathTierOptions(path: PricingPath): { value: string; label: string; sublabel: string }[] {
  const seen = new Set<string>();
  const options: { value: string; label: string; sublabel: string }[] = [];
  for (const t of path.per_guest_tiers) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    options.push({ value: t.id, label: t.name, sublabel: `${money(t.per_guest)}/guest` });
  }
  return options;
}

/** "($2,100+)" / "($68.95+/guest)" (round 5 rule 8, supersedes round 4 rule 9's "· from $2,100"
 * middle-dot sublabel): folds directly into the pill's own label with no separator — "Venue only
 * ($2,100+)". Null for a path with nothing fixed to quote (an inquire-only or add-on-only path). */
export function pathPillSublabel(path: PricingPath): string | null {
  if (path.per_guest_tiers.length > 0) {
    return `(${money(Math.min(...path.per_guest_tiers.map((t) => t.per_guest)))}+/guest)`;
  }
  const fees = path.fixed_fees.filter((f) => f.applies_to === "space" || f.applies_to === "whole_venue");
  if (fees.length > 0) return `(${money(Math.min(...fees.map((f) => f.amount)))}+)`;
  return null;
}

/** The on-site ceremony add-on's amount for the chosen space — "+$750" on the ceremony axis's
 * "Yes" pill (round 4 rule 9). Null when there's no real ceremony fee, or it has no priced amount
 * for this space. */
export function ceremonyFeeAmount(addOns: AddOn[], spaceId: string | undefined): number | null {
  const fee = addOns.find((a) => a.group === "ceremony" && a.condition === "ceremony_on_site");
  if (!fee) return null;
  if (fee.per_space_prices && spaceId && fee.per_space_prices[spaceId] != null) return fee.per_space_prices[spaceId];
  return fee.price;
}

export function guestRangeReminder(range: { min: number | null; max: number | null; max_measures: "seated" | "guests" }): string {
  if (range.max == null) return "";
  if (range.min != null) return `${int(range.min)}–${int(range.max)} ${range.max_measures}`;
  return `Up to ${int(range.max)} ${range.max_measures}`;
}

/** "190 guests · Opulence · Saturday" — the input callout line shown above the Cost Estimate
 * breakdown (round 5 rule 8), restating the current selection in plain words: guests always
 * first, then the chosen tier/package name (only when the calculator actually shows a tier axis),
 * then the day, spelled out in full. */
export function calculatorInputCallout(guests: number, tierName: string | null, day: Day): string {
  const parts = [`${int(guests)} guests`];
  if (tierName) parts.push(tierName);
  parts.push(dayFullLabel(day));
  return parts.join(" · ");
}

/** "150 guests, Argento, Sun" — the small caption under each end of the example-range bar (round 5
 * rule 8, ported from the concept calculators, which use commas here, not the "·" of
 * `calculatorInputCallout`). Day is short-form (`dayLabel`) and omitted entirely when the range
 * didn't vary by day at all. */
export function calculatorRangeLabel(input: { guests: number; day: Day | null; tierName: string | null }): string {
  const parts = [`${int(input.guests)} guests`];
  if (input.tierName) parts.push(input.tierName);
  if (input.day) parts.push(dayLabel(input.day));
  return parts.join(", ");
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

export interface CalculatorCategoryGroup {
  category: string;
  /** Single-select groups (round 3) whose members belong to this category. */
  groups: SelectionGroup[];
  /** Independently toggleable items in this category. */
  individual: AddOn[];
}

/** The "Add extras" panel's own grouping (round 4 rule 18): every selectable add-on organized by
 * `category` first (the same categories the Add-ons & extras section itself uses), each category
 * then split into single-select PillGroups vs individual chips exactly as `splitAddOnsBySelection`
 * already did. */
export function groupSelectableAddOnsByCategory(addOns: AddOn[]): CalculatorCategoryGroup[] {
  const byCategory = new Map<string, AddOn[]>();
  for (const a of addOns) {
    if (!byCategory.has(a.category)) byCategory.set(a.category, []);
    byCategory.get(a.category)!.push(a);
  }
  return [...byCategory.entries()].map(([category, items]) => {
    const { groups, individual } = splitAddOnsBySelection(items);
    return { category, groups, individual };
  });
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

export const ADD_ON_NOTE_MAX = 140;

export interface TruncatedNote {
  /** What renders inline in the table/card. */
  display: string;
  /** The untruncated text — goes in a `title` attribute (or a FactSource popover) so nothing is
   * actually lost. */
  full: string;
  truncated: boolean;
}

/** Add-on notes stay short in tables/cards (round 4 rule 10): truncated at 140 chars with an
 * ellipsis, full text always available via `full` (a `title` attribute is fine when there's no
 * FactSource popover in reach). */
export function truncateNote(note: string, max: number = ADD_ON_NOTE_MAX): TruncatedNote {
  if (note.length <= max) return { display: note, full: note, truncated: false };
  return { display: `${note.slice(0, max - 1).trimEnd()}…`, full: note, truncated: true };
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
  /** Round 4 rule 10: named in plain words, not the bare enum-cased fallback. */
  not_in_house_bar_or_catering: "If you're not using the venue's own bar or catering",
};

function humanizeCondition(condition: string): string {
  return CONDITION_LABELS[condition] ?? condition.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The Option-column label for one add-on row: its own `variant` when it has one, else its
 * condition named as the trigger (round 4 rule 10 broadens this from ceremony-only add-ons to any
 * conditional one — a real yes/no decision names itself instead of a bare "Flat rate"), else the
 * "Flat rate" fallback for a genuinely unconditional single-price add-on. */
function addOnVariantLabel(a: AddOn): string {
  if (a.variant) return a.variant;
  if (a.condition) return humanizeCondition(a.condition);
  return "Flat rate";
}

/** Item-column label folding variant/condition into the add-on's own name — "Uplighting (On-site
 * ceremony)" — round 4 rule 17's Item column. Returns just the plain name when neither applies. */
function addOnItemLabel(a: AddOn): string {
  const variantPart = a.variant ?? (a.condition ? humanizeCondition(a.condition) : null);
  // Skip the redundant "(X)" when the venue's own `name` already says X (Marchetti's "Dance
  // floor: White" + variant "White"; a `condition`-derived name like "On-site ceremony" whose
  // add-on is ALSO just named "On-site ceremony").
  if (!variantPart || a.name.toLowerCase().includes(variantPart.toLowerCase())) return a.name;
  return `${a.name} (${variantPart})`;
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

/** `addOnCategoryGroups` when the venue has curated categories, else the same shape built from
 * plain distinct `category` values — every venue's add-ons land in SOME category group (round 4
 * rule 17), curated or not. */
export function resolvedAddOnCategoryGroups(d: VenueDetailsV3): AddOnCategoryGroup[] {
  const curated = addOnCategoryGroups(d);
  if (curated) return curated;
  const byCategory = new Map<string, AddOn[]>();
  for (const a of d.pricing.add_ons) {
    if (a.selection_group) continue;
    if (!byCategory.has(a.category)) byCategory.set(a.category, []);
    byCategory.get(a.category)!.push(a);
  }
  return [...byCategory.entries()].map(([category, items]) => ({ category, blurb: null, examples: [], items }));
}

export interface AddOnCategoryTableRow {
  key: string;
  itemLabel: string;
  prices: string[];
  note: string | null;
}

export interface AddOnCategoryTable {
  category: string;
  blurb: string | null;
  examples: string[];
  columnLabels: string[];
  rows: AddOnCategoryTableRow[];
}

/** One Item|Price table per category (round 4 rule 17) — variant/condition folded into the item
 * label (`addOnItemLabel`), per-space columns when the category's items carry `per_space_prices`. */
export function buildAddOnCategoryTables(d: VenueDetailsV3): AddOnCategoryTable[] {
  return resolvedAddOnCategoryGroups(d).map((g) => {
    const spaceIds = [...new Set(g.items.flatMap((a) => (a.per_space_prices ? Object.keys(a.per_space_prices) : [])))];
    const spaceName = (id: string) => d.spaces.find((s) => s.id === id)?.name ?? id;
    const columnLabels = spaceIds.length > 0 ? spaceIds.map(spaceName) : ["Price"];
    const rows: AddOnCategoryTableRow[] = g.items.map((a) => ({
      key: a.id,
      itemLabel: addOnItemLabel(a),
      prices: spaceIds.length > 0 ? spaceIds.map((sid) => (a.per_space_prices?.[sid] != null ? money(a.per_space_prices[sid]) : addOnPriceString(a))) : [addOnPriceString(a)],
      note: a.note,
    }));
    return { category: g.category, blurb: g.blurb, examples: g.examples, columnLabels, rows };
  });
}

/** Round 4 rule 12: 2 or fewer real add-ons and no curated categories at all -> compact rows
 * instead of cards/tables (Field Museum's two photo sessions). `selection_group` items are
 * calculator-only options, not counted here. */
export function isCompactAddOnsLayout(d: VenueDetailsV3): boolean {
  const real = d.pricing.add_ons.filter((a) => !a.selection_group);
  return !d.pricing.add_on_categories?.length && real.length <= 2;
}

export type AddOnsLayout = "compact" | "cards" | "tables";

/** The Add-ons & extras section's overall shape (round 4 rules 12 + 17): compact rows for a
 * couple of items and no categories; a plain card grid for a genuinely single, uncategorized flat
 * list; grouped category tables otherwise (curated `add_on_categories`, or 2+ distinct `category`
 * values). */
export function addOnsLayout(d: VenueDetailsV3): AddOnsLayout {
  if (isCompactAddOnsLayout(d)) return "compact";
  const hasCurated = !!d.pricing.add_on_categories?.length;
  const groups = resolvedAddOnCategoryGroups(d);
  if (!hasCurated && groups.length <= 1) return "cards";
  return "tables";
}

// ---------------------------------------------------------------------------
// Add-ons grouped by category_std (round 5 rule 7 — restores the round-3 card look under round-4's
// grouping: top-level headers are the 8 standard categories, the venue's own `category` becomes a
// sub-line, and a table only earns its place per SUB-group, not per section.)
// ---------------------------------------------------------------------------

const CATEGORY_STD_DEFAULT_FROM_GROUP: Record<AddOn["group"], AddOnCategoryStd> = {
  fb: "fb",
  ceremony: "ceremony",
  service: "services_staffing",
  rental: "space_rentals",
  other: "space_rentals",
};

/** `AddOn.category_std` when the venue/importer set one, else derived from the coarser `group`
 * (round 5: "derive category_std from group when missing" so the lab renders correctly even
 * before every fixture/extractor carries the new field). */
export function resolveCategoryStd(a: AddOn): AddOnCategoryStd {
  return a.category_std ?? CATEGORY_STD_DEFAULT_FROM_GROUP[a.group];
}

export const ADD_ON_CATEGORY_STD_LABELS: Record<AddOnCategoryStd, string> = {
  fb: "Food & beverage",
  space_rentals: "Space & rentals",
  decor_lighting: "Décor & lighting",
  entertainment: "Entertainment",
  services_staffing: "Services & staffing",
  ceremony: "Ceremony",
  time: "Extra time",
  other: "Other",
};

export interface AddOnSubgroup {
  /** The venue's own, granular category (Diamond Garden's "Chargers", "Ceremony Décor", …) — shown
   * as a sub-line under the std header. */
  category: string;
  blurb: string | null;
  examples: string[];
  items: AddOn[];
}

export interface AddOnStdGroup {
  category_std: AddOnCategoryStd;
  label: string;
  subgroups: AddOnSubgroup[];
}

/** Groups every non-selection-group add-on first by `category_std` (in the fixed
 * `ADD_ON_CATEGORIES_STD` order), then by the venue's own `category` within each — curated
 * `add_on_categories` blurb/examples attach to the matching sub-group when present. */
export function groupAddOnsByCategoryStd(d: VenueDetailsV3): AddOnStdGroup[] {
  const selectable = d.pricing.add_ons.filter((a) => !a.selection_group);
  const byStd = new Map<AddOnCategoryStd, AddOn[]>();
  for (const a of selectable) {
    const std = resolveCategoryStd(a);
    if (!byStd.has(std)) byStd.set(std, []);
    byStd.get(std)!.push(a);
  }
  const curated = new Map((d.pricing.add_on_categories ?? []).map((c) => [c.category, c] as const));
  return ADD_ON_CATEGORIES_STD.filter((std) => byStd.has(std)).map((std) => {
    const items = byStd.get(std)!;
    const byCategory = new Map<string, AddOn[]>();
    for (const a of items) {
      if (!byCategory.has(a.category)) byCategory.set(a.category, []);
      byCategory.get(a.category)!.push(a);
    }
    const subgroups: AddOnSubgroup[] = [...byCategory.entries()].map(([category, catItems]) => {
      const c = curated.get(category);
      return { category, blurb: c?.blurb ?? null, examples: c?.examples ?? [], items: catItems };
    });
    return { category_std: std, label: ADD_ON_CATEGORY_STD_LABELS[std], subgroups };
  });
}

function sameColumnShape(items: AddOn[]): boolean {
  const shapes = new Set(items.map((a) => (a.per_space_prices ? [...Object.keys(a.per_space_prices)].sort().join(",") : "")));
  return shapes.size <= 1;
}

/** Round 5 rule 7: a sub-group renders as a table only when it has 2 genuine pricing axes
 * (variant × per-space) or ≥ 6 priced rows sharing the same columns; cards otherwise (the round-3
 * look). */
export function addOnSubgroupLayout(items: AddOn[]): "cards" | "table" {
  const hasVariantAxis = new Set(items.map((a) => a.variant).filter((v) => v != null)).size > 1;
  const hasSpaceAxis = items.some((a) => a.per_space_prices != null && Object.keys(a.per_space_prices).length > 1);
  if (hasVariantAxis && hasSpaceAxis) return "table";
  const pricedRows = items.filter((a) => a.price != null || (a.per_space_prices != null && Object.keys(a.per_space_prices).length > 0));
  if (pricedRows.length >= 6 && sameColumnShape(pricedRows)) return "table";
  return "cards";
}

/** Round 6 fix (2026-09-19): the venue's own sub-category (`AddOn.category`), shown as a small
 * caption inside the merged card grid instead of a separate sub-header — omitted when it would
 * just repeat the item's own name back (Marchetti's "Chef Experiences" category on a "Chef
 * Experiences" add-on). */
export function addOnCardCaption(a: AddOn): string | null {
  return a.category.trim().toLowerCase() === a.name.trim().toLowerCase() ? null : a.category;
}

export interface AddOnCategoryPartition {
  /** Every item from a "cards"-layout sub-group, flattened in subgroup order — these all flow
   * into ONE shared grid per standard category, fixing the bug where a single-item sub-category
   * used to get its own one-card row at a third of the grid's width. */
  cards: AddOn[];
  /** Sub-groups whose own items force a table (`addOnSubgroupLayout(sg.items) === "table"`) —
   * kept as whole subgroups (not flattened) so the caller can render each one as its own
   * full-width table block, named by its own sub-category, after the shared card grid. */
  tables: AddOnSubgroup[];
}

/** Splits one standard category's sub-groups into the shared card grid vs. the sub-groups that
 * must render as their own table (round 6 fix, 2026-09-19) — replaces rendering one card grid
 * PER sub-group, which orphaned single-item sub-categories onto their own fragmented row. */
export function partitionCategoryItems(subgroups: AddOnSubgroup[]): AddOnCategoryPartition {
  const cards: AddOn[] = [];
  const tables: AddOnSubgroup[] = [];
  for (const sg of subgroups) {
    if (addOnSubgroupLayout(sg.items) === "table") tables.push(sg);
    else cards.push(...sg.items);
  }
  return { cards, tables };
}

/** Item|Price table for ONE sub-group (round 5 rule 7) — same shape `buildAddOnCategoryTables`
 * builds per venue-category, just scoped to a single already-resolved item list. */
export function buildAddOnSubgroupTable(items: AddOn[], spaces: Space[]): { columnLabels: string[]; rows: AddOnCategoryTableRow[] } {
  const spaceIds = [...new Set(items.flatMap((a) => (a.per_space_prices ? Object.keys(a.per_space_prices) : [])))];
  const spaceName = (id: string) => spaces.find((s) => s.id === id)?.name ?? id;
  const columnLabels = spaceIds.length > 0 ? spaceIds.map(spaceName) : ["Price"];
  const rows: AddOnCategoryTableRow[] = items.map((a) => ({
    key: a.id,
    itemLabel: addOnItemLabel(a),
    prices: spaceIds.length > 0 ? spaceIds.map((sid) => (a.per_space_prices?.[sid] != null ? money(a.per_space_prices[sid]) : addOnPriceString(a))) : [addOnPriceString(a)],
    note: a.note,
  }));
  return { columnLabels, rows };
}

/** The Cost Estimate's "Add extras" panel, grouped by `category_std` instead of the venue's own
 * granular `category` (round 5 rules 7/8 — same headers as the Add-ons & extras section). */
export function groupSelectableAddOnsByCategoryStd(addOns: AddOn[]): CalculatorCategoryGroup[] {
  const byStd = new Map<AddOnCategoryStd, AddOn[]>();
  for (const a of addOns) {
    const std = resolveCategoryStd(a);
    if (!byStd.has(std)) byStd.set(std, []);
    byStd.get(std)!.push(a);
  }
  return ADD_ON_CATEGORIES_STD.filter((std) => byStd.has(std)).map((std) => {
    const { groups, individual } = splitAddOnsBySelection(byStd.get(std)!);
    return { category: ADD_ON_CATEGORY_STD_LABELS[std], groups, individual };
  });
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

/** "shared" | "split" pill-row layout (round 5 rule 5, supersedes round 4 rule 7: the F&B section
 * itself is single-column now, so resource placement and the food_note/bar_note/caption callout
 * lines no longer depend on this at all — they always render). Purely whether the Food and Bar
 * pill SETS match: one shared pill row when they do, two labeled Food/Bar pill rows when they
 * genuinely differ. */
export function fbLayout(d: VenueDetailsV3): "shared" | "split" {
  const { food, bar } = fbPills(d);
  return fbSharedRow(food, bar, false) ? "shared" : "split";
}

// ---------------------------------------------------------------------------
// F&B labeled callout lines (round 5 rule 5) — Food:/Bar:/Bar BYO option:/Food & beverage
// minimum:/Charges & tax:/Not included in package price:, one uniform `Label: text` format,
// always rendered regardless of the pill-row layout above.
// ---------------------------------------------------------------------------

const NOT_INCLUDED_PREFIX = /^not included in package price:?\s*/i;

/** True when `fb.bar_note` itself IS the "Not included in package price" sentence (Diamond
 * Garden's bar-packages carve-out) — the caller skips the plain "Bar:" callout in that case so the
 * same sentence never renders twice under two different labels. */
export function barNoteIsNotIncluded(fb: VenueDetailsV3["food_beverage"]): boolean {
  return fb.bar_note != null && NOT_INCLUDED_PREFIX.test(fb.bar_note.value);
}

/** "Not included in package price:" callout text (phrase stripped) — checked on `bar_note` first,
 * else the first `notes[]` entry that starts with the phrase. Null when nothing matches. */
export function notIncludedLine(fb: VenueDetailsV3["food_beverage"]): string | null {
  if (barNoteIsNotIncluded(fb)) return fb.bar_note!.value.replace(NOT_INCLUDED_PREFIX, "").trim();
  const note = fb.notes.find((n) => NOT_INCLUDED_PREFIX.test(n.value));
  return note ? note.value.replace(NOT_INCLUDED_PREFIX, "").trim() : null;
}

/** The Food/Bar side note actually shown as the "Food:"/"Bar:" callout (round 5 rule 5): the
 * explicit `food_note`/`bar_note` when present, else the first `notes[]` entry `fbNoteSide`
 * attributes to that side (Greenhouse's composting note, which has no dedicated `food_note` field
 * of its own) — excluding whichever note `notIncludedLine` already claimed, and never surfacing a
 * `bar_note` that IS the "not included" sentence a second time under "Bar:". */
export function fbSideNote(fb: VenueDetailsV3["food_beverage"], side: "food" | "bar"): Fact<string> | null {
  const explicit = side === "food" ? fb.food_note : fb.bar_note;
  if (explicit) return side === "bar" && barNoteIsNotIncluded(fb) ? null : explicit;
  const claimedByNotIncluded = fb.notes.find((n) => NOT_INCLUDED_PREFIX.test(n.value));
  return fb.notes.find((n) => n !== claimedByNotIncluded && fbNoteSide(n.value) === side) ?? null;
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

/** "Food & beverage minimum: $3,000" / "...: amount not published" (round 4 rule 7) — the value
 * half only; the caller supplies the bold "Food & beverage minimum:" label. Uses the spine's own
 * `detail` text when the venue states one, else the plain amount, else the honest "amount not
 * published" gap. Null when no minimum applies (or the field isn't stated/is conflicting) — the
 * line is omitted entirely rather than printing a false negative. */
export function fbMinimumLine(fbMinimum: VenueSpine["fb_minimum"]): string | null {
  if (!isStated(fbMinimum) || !fbMinimum.value.applies) return null;
  const { amount_usd, detail } = fbMinimum.value;
  if (detail) return detail;
  if (amount_usd != null) return money(amount_usd);
  return "Amount not published";
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
  /** Always present (round 4 rule 15: "no row without the bold label"). */
  boldLabel: string;
  text: string;
}

/** Strips one occurrence of `label` (case-insensitive) out of `raw`, collapses the resulting
 * double space, and returns null when nothing meaningful is left (raw was just the label itself,
 * or the label doesn't occur in it at all AND removing it would leave nothing). */
function stripLabelPhrase(raw: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stripped = raw
    .replace(new RegExp(escaped, "i"), "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return stripped.length > 0 ? stripped : null;
}

function capitalizeFirst(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Every row is uniformly `Label: detail` (round 4 rule 15 — no row without the bold label).
 * Detail = a real structured `detail` when present ("F&B minimum: $3,000"); else `label_raw` with
 * the label phrase stripped out and capitalized ("Private bridal suite" -> "Bridal suite:
 * Private", "New silver Chiavari chairs" -> "Chairs: New silver Chiavari", "Handicap accessible"
 * -> "Accessibility: Handicap accessible" — the label word doesn't even occur in that last one, so
 * nothing is stripped); else, when label_raw IS the label with nothing left over, "Included". */
export function inclusionDisplay(inc: InclusionItem): InclusionDisplay {
  if (inc.detail) return { boldLabel: inc.label, text: inc.detail };
  const stripped = stripLabelPhrase(inc.label_raw, inc.label);
  return { boldLabel: inc.label, text: stripped ? capitalizeFirst(stripped) : "Included" };
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
 * third card onto its own row) for exactly 3, and back to 2 (wrapping 2x2) for 4+ — round-3 fix.
 * Purely a function of path count (the round 5 rule 6 full-width fallback for tall/bulleted cards
 * is removed — a fixed 2026-09-19 review: it turned Diamond Garden's three cards into one per row.
 * Cards may be tall; the grid uses `items-start` so a short card doesn't stretch, and nothing
 * scrolls internally). */
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

export interface VendorRelationshipGroup {
  relationship: VendorList["relationship"];
  /** Plain-language header replacing the bare enum pill (round 4 rule 11). */
  header: string;
  /** One explanatory sentence — what this relationship actually means for the couple. */
  sentence: string;
  lists: VendorList[];
}

const VENDOR_RELATIONSHIP_COPY: Record<VendorList["relationship"], { header: string; sentence: string }> = {
  in_house_partner: { header: "Required (in-house partners)", sentence: "You'll work with these vendors; they're part of the venue." },
  preferred: { header: "Preferred", sentence: "The venue recommends these; confirm whether outside caterers are allowed." },
  approved_required: { header: "Approved list only", sentence: "Catering must come from this list." },
  recommended: { header: "Recommended", sentence: "The venue suggests these; you're not required to use them." },
};

const VENDOR_RELATIONSHIP_ORDER: VendorList["relationship"][] = ["in_house_partner", "approved_required", "preferred", "recommended"];

/** Groups the venue's visible vendor lists by relationship, each with a plain-language header +
 * sentence instead of the bare enum pill (round 4 rule 11) — a venue can have several lists
 * (Geraghty's in-house décor/AV partners AND a preferred caterer list) sharing one relationship
 * group. */
export function groupVendorListsByRelationship(lists: VendorList[]): VendorRelationshipGroup[] {
  const byRelationship = new Map<VendorList["relationship"], VendorList[]>();
  for (const l of lists) {
    if (!byRelationship.has(l.relationship)) byRelationship.set(l.relationship, []);
    byRelationship.get(l.relationship)!.push(l);
  }
  return VENDOR_RELATIONSHIP_ORDER.filter((r) => byRelationship.has(r)).map((r) => ({
    relationship: r,
    ...VENDOR_RELATIONSHIP_COPY[r],
    lists: byRelationship.get(r)!,
  }));
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

// ---------------------------------------------------------------------------
// Resource button labels (round 4 rule 4)
// ---------------------------------------------------------------------------

const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  brochure: "Brochure",
  floor_plan: "Floor plan",
  capacity_sheet: "Floor plan",
  virtual_tour: "Virtual tour",
  video: "Video",
  gallery: "Gallery",
  menu: "Menu",
  bar_menu: "Bar menu",
  catering_guidelines: "Catering guidelines",
  contract: "Service agreement",
  vendor_list: "Vendor list",
  other: "Resource",
};

/** Standard button label for a resource kind (round 4 rule 4). The venue's own `label` is used
 * ONLY to disambiguate two-or-more resources of the SAME kind in the same slot (Diamond Garden's
 * three cuisine menus keep their own names, with a trailing " menu"/" Menu" stripped since the
 * standard label already says "Menu"); the venue's own name is never repeated in a button
 * otherwise. A space-scoped `video` reads "Video tour". */
export function resourceLabel(resource: Resource, siblingsOfSameKindInSlot: Resource[]): string {
  const standard = resource.kind === "video" && resource.scope.startsWith("space:") ? "Video tour" : RESOURCE_KIND_LABELS[resource.kind];
  const sameKindCount = siblingsOfSameKindInSlot.filter((r) => r.kind === resource.kind).length;
  if (sameKindCount <= 1) return standard;
  const ownName = resource.label.replace(/\s+menu$/i, "").trim();
  return ownName || standard;
}

/** Virtual tour, Gallery, Floor plan(s), Video — the fixed order space-level resources render in
 * (round 5 rule 3, supersedes round 4 rule 5's Floor plan(s)-first order), whether inside one card
 * (a single-space venue's merged heading+per-space list) or a multi-space card's own per-space
 * bucket. `capacity_sheet` sorts with `floor_plan` (round 4 rule 4: "it is one"). */
const SPACE_CARD_ORDER: ResourceKind[] = ["virtual_tour", "gallery", "floor_plan", "capacity_sheet", "video"];

export function orderSpaceCardResources(resources: Resource[]): Resource[] {
  return [...resources].sort((a, b) => SPACE_CARD_ORDER.indexOf(a.kind) - SPACE_CARD_ORDER.indexOf(b.kind));
}

export interface PlacedResources {
  about: Resource[];
  /** Venue-scoped capacity_sheet/floor_plan/virtual_tour/video/gallery — the Spaces (or, for a
   * single-space venue, "The Space") section heading's own actions row, e.g. LondonHouse's
   * capacity chart + wedding video. */
  spacesHeading: Resource[];
  /** The same five kinds, but space-scoped (`scope: "space:<id>"`) — that one space card's own
   * header row instead of the section heading. Keyed by space id. */
  perSpace: Record<string, Resource[]>;
  /** `menu` / `catering_guidelines` / `bar_menu` — Food & Beverage's own single heading actions row
   * (round 5 rule 5: the section is single-column now, so every F&B resource lands here regardless
   * of whether the Food/Bar pills happen to match). */
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
    fbShared: [],
    addOns: [],
    policies: [],
    vendors: [],
    unplaced: [],
  };

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
    } else if (r.kind === "menu" || r.kind === "catering_guidelines" || r.kind === "bar_menu") {
      // Round 5 rule 5: the F&B section is single-column now — every one of its resources lands
      // in the section's own single heading actions row, never split by side.
      placed.fbShared.push(r);
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
