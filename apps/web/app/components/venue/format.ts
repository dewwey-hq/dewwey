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
  // Whole dollars stay whole ("$6,000"); anything fractional shows cents ("$1.50", "$84.95").
  const fractional = Math.abs(n - Math.round(n)) > 1e-9;
  return `$${n.toLocaleString(undefined, fractional ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })}`;
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

// Matches a short leading label ending in ": " at the very start of a sentence ("Hall Rental
// Only: everything you need…" -> "Hall Rental Only") — bounded so a stray colon deep in a real
// sentence never gets mistaken for one.
const LEADING_TERM_PHRASE = /^([^:]{1,48}):\s+/;

/** The light-gray venue term shown under a Pricing card's title (round 6 rule 3): the venue's own
 * `PricingPath.subtitle` when the importer set one, else the leading "X:" phrase of the path's own
 * `description`, else null. */
export function pathSubtitle(path: PricingPath): string | null {
  if (path.subtitle) return path.subtitle;
  const m = path.description ? LEADING_TERM_PHRASE.exec(path.description) : null;
  return m ? m[1] : null;
}

/** Short season row label for a price grid — "Peak" / "Off" / "Any" (round 6 rule 3: the grid row
 * itself carries no months anymore; see `seasonMonthsLine`). */
const SEASON_SHORT_LABELS: Record<Season, string> = { peak: "Peak", off: "Off", any: "Any" };

export function seasonShortLabel(s: Season): string {
  return SEASON_SHORT_LABELS[s];
}

/** The season-months line, rendered once under a price grid (round 6 rule 3 — replaces the old
 * per-row "Off-season (Jan, Feb, Mar, Nov)" inline months, which crowded a narrow 1/3-width
 * Pricing card): "Peak: Apr–Oct, Dec · Off: Jan, Feb, Mar, Nov", in the same chronological order
 * (`seasonOrderFor`) the grid's own rows already use, so the line above and the summary below it
 * never disagree on which season comes first. Null when the venue states no season months at all. */
export function seasonMonthsLine(seasons: Pricing["seasons"] | undefined): string | null {
  if (!seasons || (!seasons.peak && !seasons.off)) return null;
  const parts = seasonOrderFor(seasons)
    .filter((s): s is "peak" | "off" => s === "peak" || s === "off")
    .map((s) => {
      const months = s === "peak" ? seasons.peak : seasons.off;
      return months ? `${seasonShortLabel(s)}: ${months}` : null;
    })
    .filter((p): p is string => p != null);
  return parts.length > 0 ? parts.join(" · ") : null;
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

export interface AddOnCategoryTableRow {
  key: string;
  itemLabel: string;
  /** The venue's own sub-category, shown as a small caption above the item name — reuses
   * `addOnCardCaption`'s rule, so it's omitted when it would just repeat the name back (round 6
   * rule 1). */
  caption: string | null;
  prices: string[];
  note: string | null;
}

/** Round 6 rule 1: exactly two Add-ons & extras layouts, decided purely by the venue's total
 * add-on count — never mixed within a section. `<= 5` real (non-`selection_group`) add-ons -> a
 * flat, unheaded card grid (the Greenhouse concept's shape, including a couple of items — the old
 * separate "compact rows" mode for 1-2 items is gone). `> 5` -> one table per standard category
 * (`groupAddOnsByCategoryStd`). */
export function addOnsMode(addOns: AddOn[]): "cards" | "tables" {
  const real = addOns.filter((a) => !a.selection_group);
  return real.length <= 5 ? "cards" : "tables";
}

// ---------------------------------------------------------------------------
// Add-ons grouped by category_std (round 5 rule 7, reworked by round 6 rule 1: top-level headers
// are the 8 standard categories, the venue's own `category` becomes a sub-line/caption; every
// category_std with any items renders as ONE table covering all its sub-categories — the old
// per-sub-group cards/table split is gone.)
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
  decor: "Décor",
  lighting_av: "Lighting & A/V",
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
  /** Round 6: a selection group whose items carry `day`/`season` (Diamond Garden's extra-hour
   * rows) is pulled out of the normal per-item table flow entirely — the view renders it as one
   * compact grid instead (`dayPricedGroupGrid`). Empty for every category that has none. */
  dayPricedItems: AddOn[];
}

/** A selection-group item is no longer hidden wholesale from the static Add-ons section (round 6
 * fix — previously EVERY `selection_group` item was dropped here). It's hidden only when the same
 * facts it would show already render elsewhere on the page: an `fb`-category selection group
 * (Diamond Garden's food package / dinnerware / bar tier) duplicates the F&B card's own menus/bar
 * ladders tables once either exists, so it stays hidden; every other selection group (e.g.
 * extra-hour, `category_std: "time"`) now renders. */
function shouldHideSelectionGroup(d: VenueDetailsV3, categoryStd: AddOnCategoryStd): boolean {
  if (categoryStd !== "fb") return false;
  return d.food_beverage.bar_ladders.length > 0 || d.food_beverage.menus.length > 0;
}

/** Groups every add-on first by `category_std` (in the fixed `ADD_ON_CATEGORIES_STD` order), then
 * by the venue's own `category` within each — curated `add_on_categories` blurb/examples attach to
 * the matching sub-group when present. Selection-group items are included per
 * `shouldHideSelectionGroup` above; day/season-priced items are pulled out into `dayPricedItems`
 * instead of a subgroup (round 6). */
export function groupAddOnsByCategoryStd(d: VenueDetailsV3): AddOnStdGroup[] {
  const selectable = d.pricing.add_ons.filter((a) => !a.selection_group || !shouldHideSelectionGroup(d, resolveCategoryStd(a)));
  const byStd = new Map<AddOnCategoryStd, AddOn[]>();
  for (const a of selectable) {
    const std = resolveCategoryStd(a);
    if (!byStd.has(std)) byStd.set(std, []);
    byStd.get(std)!.push(a);
  }
  const curated = new Map((d.pricing.add_on_categories ?? []).map((c) => [c.category, c] as const));
  return ADD_ON_CATEGORIES_STD.filter((std) => byStd.has(std)).map((std) => {
    const allItems = byStd.get(std)!;
    const dayPricedItems = allItems.filter((a) => a.day != null && a.season != null);
    const items = allItems.filter((a) => !(a.day != null && a.season != null));
    const byCategory = new Map<string, AddOn[]>();
    for (const a of items) {
      if (!byCategory.has(a.category)) byCategory.set(a.category, []);
      byCategory.get(a.category)!.push(a);
    }
    const subgroups: AddOnSubgroup[] = [...byCategory.entries()].map(([category, catItems]) => {
      const c = curated.get(category);
      return { category, blurb: c?.blurb ?? null, examples: c?.examples ?? [], items: catItems };
    });
    return { category_std: std, label: ADD_ON_CATEGORY_STD_LABELS[std], subgroups, dayPricedItems };
  });
}

// ---------------------------------------------------------------------------
// Day/season-priced selection group grid (round 6) — Diamond Garden's extra-hour rows: one row
// per distinct `variant` (no servers / with servers), one column per season, with the
// weekday/Friday/Sunday days merged into a single "Weekday–Sun" column whenever every row prices
// them identically, and any other day (Saturday) broken out into its own column. Pure and
// venue-agnostic so it's unit-testable without rendering a component.
// ---------------------------------------------------------------------------

export interface DayPricedGridRow {
  key: string;
  label: string;
  /** Aligned to the grid's `columns`; null when this row has no price for that column. */
  prices: (string | null)[];
}

export interface DayPricedGrid {
  columns: string[];
  rows: DayPricedGridRow[];
}

const SEASON_DISPLAY_ORDER: Season[] = ["off", "peak", "any"];
const SEASON_LABEL: Partial<Record<Season, string>> = { off: "Off-season", peak: "Peak" };
const DAY_LABEL: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun", weekday: "Weekday", any: "Any day" };
/** Days that merge into one "Weekday–Sun" column when their price agrees, per the venue's own
 * real bucketing (a shared weekday/Friday/Sunday rate, Saturday priced separately). */
const MERGEABLE_DAYS: Day[] = ["weekday", "fri", "sun"];

function dayRangeLabel(days: Day[]): string {
  if (days.length === 1) return DAY_LABEL[days[0]];
  return `${DAY_LABEL[days[0]]}–${DAY_LABEL[days[days.length - 1]]}`;
}

/** Row label from an item's `name`/`variant`: "Extra hour" + "no servers" -> "Extra hour, no
 * servers" — strips a redundant "(no servers)" parenthetical already baked into `name` (Diamond
 * Garden's fixture sets both) so the label isn't repeated. */
function dayPricedRowLabel(a: AddOn): string {
  const base = a.name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return a.variant ? `${base}, ${a.variant}` : base;
}

/** Builds a season × day price grid for a set of add-ons that share a `selection_group` and carry
 * `day`/`season` on every item. Venue-agnostic: rows are whatever distinct `variant` values are
 * present (fallback: `name`), columns are whatever seasons are present, and within each season the
 * `MERGEABLE_DAYS` collapse into one "Weekday–Sun" column only when every row prices them
 * identically (checked per row so a genuinely non-uniform sheet still renders correctly, just with
 * more columns). Items without both `day` and `season` set are ignored. */
export function dayPricedGroupGrid(items: AddOn[]): DayPricedGrid {
  const priced = items.filter((a) => a.day != null && a.season != null && a.price != null);
  if (priced.length === 0) return { columns: [], rows: [] };

  const rowKeyOf = (a: AddOn) => a.variant ?? a.name;
  const rowKeys: string[] = [];
  const rowLabelOf = new Map<string, string>();
  for (const a of priced) {
    const key = rowKeyOf(a);
    if (!rowKeys.includes(key)) {
      rowKeys.push(key);
      rowLabelOf.set(key, dayPricedRowLabel(a));
    }
  }

  const seasons = SEASON_DISPLAY_ORDER.filter((s) => priced.some((a) => a.season === s));

  interface ColumnDef {
    label: string;
    season: Season;
    days: Day[];
  }
  const columns: ColumnDef[] = [];
  for (const season of seasons) {
    const seasonItems = priced.filter((a) => a.season === season);
    const daysPresent: Day[] = [];
    for (const a of seasonItems) if (a.day && !daysPresent.includes(a.day)) daysPresent.push(a.day);
    const mergeCandidates = daysPresent.filter((d) => MERGEABLE_DAYS.includes(d));

    const canMerge =
      mergeCandidates.length > 1 &&
      rowKeys.every((key) => {
        const prices = mergeCandidates
          .map((d) => seasonItems.find((a) => rowKeyOf(a) === key && a.day === d)?.price)
          .filter((p): p is number => p != null);
        return prices.length <= 1 || prices.every((p) => p === prices[0]);
      });

    const seasonPrefix = SEASON_LABEL[season] ? `${SEASON_LABEL[season]} ` : "";
    const restDays = canMerge ? daysPresent.filter((d) => !mergeCandidates.includes(d)) : daysPresent;
    if (canMerge) columns.push({ label: `${seasonPrefix}${dayRangeLabel(mergeCandidates)}`, season, days: mergeCandidates });
    for (const d of restDays) columns.push({ label: `${seasonPrefix}${dayRangeLabel([d])}`, season, days: [d] });
  }

  const rows: DayPricedGridRow[] = rowKeys.map((key) => {
    const rowItems = priced.filter((a) => rowKeyOf(a) === key);
    const prices = columns.map((c) => {
      const match = rowItems.find((a) => a.season === c.season && a.day != null && c.days.includes(a.day));
      return match ? money(match.price!) : null;
    });
    return { key, label: rowLabelOf.get(key)!, prices };
  });

  return { columns: columns.map((c) => c.label), rows };
}

/** The venue's own sub-category (`AddOn.category`), shown as a small caption above the item name
 * — omitted when it would just repeat the item's own name back (Marchetti's "Chef Experiences"
 * category on a "Chef Experiences" add-on). Used by both the card grid and, round 6 rule 1, every
 * table row. */
export function addOnCardCaption(a: AddOn): string | null {
  return a.category.trim().toLowerCase() === a.name.trim().toLowerCase() ? null : a.category;
}

/** One Item|Price table for a WHOLE standard category (round 6 rule 1 — replaces the old
 * per-sub-group cards/table split): every sub-category's items share one table, in subgroup
 * order, each row captioned with its own venue sub-category (`addOnCardCaption`). Per-space
 * columns appear as soon as any item carries `per_space_prices`; an item with a flat price instead
 * repeats that price across every space column (Marchetti's Chiavari chairs/Stage rows sit beside
 * its per-space Dance floor rows in the same "Space & rentals" table). */
/** A row caption (the venue's own sub-category) earns its place only when it tells the reader
 * something the card header doesn't: dropped when it restates the standard category label
 * ("Food & beverage add-ons" under "Food & beverage") or when every item in the card shares one
 * sub-category (the header already says it). */
export function captionForCategoryCard(a: AddOn, stdLabel: string, singleSubcategory: boolean): string | null {
  const base = addOnCardCaption(a);
  if (!base) return null;
  if (singleSubcategory) return null;
  const norm = (x: string) =>
    x
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const c = norm(base);
  const l = norm(stdLabel);
  if (c === l || c.startsWith(l) || c.replace(/ add ?ons?$/, "") === l) return null;
  // Self-explanatory sub-categories: any significant word of the caption that shares a 4-letter stem
  // with a word of the card title ("Decoration" ~ "Decor", "Lighting" ~ "lighting") adds nothing.
  const stem = (w: string) => w.slice(0, 4);
  const titleStems = new Set(l.split(" ").filter((w) => w.length >= 4).map(stem));
  const captionWords = c.split(" ").filter((w) => w.length >= 4 && !["add", "ons", "addons", "extras"].includes(w));
  if (captionWords.some((w) => titleStems.has(stem(w)))) return null;
  return base;
}

/** Curated example bullets often duplicate priced rows ("Unlimited ice: $100") or carry priced
 * items the fixture keeps display-only ("Food package (Bronze/Silver/Gold): $15.95–$35/guest").
 * Fold every "Name: $price" example into the table as a row (no calculator effect), drop examples
 * that duplicate an existing row, and return whatever is left as plain bullets. */
const EXAMPLE_STOPWORDS = new Set(["the", "a", "an", "of", "or", "and", "for", "with", "per", "each", "min", "minimum", "package", "add", "ons", "on"]);
function exampleTokens(x: string): Set<string> {
  return new Set(
    x
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length > 1 && !EXAMPLE_STOPWORDS.has(t)),
  );
}
/** Near-duplicate test between an example's name and an existing row label: prefix match on the
 * normalized strings, or ≥ 0.6 token overlap ("Package of 12 uplights + monogram" vs
 * "12 uplights + monogram package"). */
export function isNearDuplicateAddOnName(a: string, b: string): boolean {
  const norm = (x: string) => x.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  const na = norm(a);
  const nb = norm(b);
  if (na === nb || na.startsWith(nb) || nb.startsWith(na)) return true;
  const ta = exampleTokens(a);
  const tb = exampleTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size) >= 0.6;
}
/** "Name: $price" or "Name ($price…)" → {name, price}; anything else → null. */
export function parsePricedExample(ex: string): { name: string; price: string } | null {
  const colon = ex.match(/^(.+?):\s*(\$.+)$/);
  if (colon) return { name: colon[1].trim(), price: colon[2].trim() };
  const paren = ex.match(/^(.+?)\s*\((\$[^)]+)\)\s*$/);
  if (paren) return { name: paren[1].trim(), price: paren[2].trim() };
  return null;
}

/** One table for a standard-category card: rows per venue sub-category in order, each sub-category's
 * priced examples folded in as rows (display only), near-duplicates of existing rows dropped; the
 * remaining unpriced examples come back as bullets. Row captions carry the sub-category (suppressed
 * per `captionForCategoryCard`) so the view can print ONE sub-header per group, not one per row. */
export function buildCategoryCardTable(
  subgroups: AddOnSubgroup[],
  spaces: Space[],
  stdLabel: string,
): { columnLabels: string[]; rows: AddOnCategoryTableRow[]; leftover: string[] } {
  const base = buildAddOnCategoryStdTable(subgroups, spaces, stdLabel);
  const singleSubcategory = new Set(subgroups.map((sg) => sg.category.trim().toLowerCase())).size <= 1;
  const rowsByKey = new Map(base.rows.map((r) => [r.key, r]));
  const rows: AddOnCategoryTableRow[] = [];
  const leftover: string[] = [];
  // Dedupe against the WHOLE card (every priced row, in any sub-category, plus folded examples), not
  // just the rows seen so far: a summary bullet in one sub-category ("Linen: tablecloths, runners &
  // napkins") must not survive when a later sub-category carries the itemized rows.
  const allLabels = () => [...base.rows.map((r) => r.itemLabel), ...rows.filter((r) => r.key.startsWith("ex-")).map((r) => r.itemLabel)];
  const itemizedSubcategories = new Set(subgroups.filter((g) => g.items.length > 0).map((g) => g.category.trim().toLowerCase()));
  subgroups.forEach((sg, si) => {
    for (const a of sg.items) {
      const r = rowsByKey.get(a.id);
      if (r) rows.push(r);
    }
    const caption = sg.items[0] ? captionForCategoryCard(sg.items[0], stdLabel, singleSubcategory) : singleSubcategory ? null : sg.category;
    sg.examples.forEach((ex, i) => {
      const parsed = parsePricedExample(ex);
      const name = parsed ? parsed.name : ex;
      // "Linen: tablecloths, runners & napkins ($1-15 each)" summarizes a sub-category that is itemized
      // elsewhere on the card -> the rows already say it.
      const prefix = name.split(":")[0]?.trim().toLowerCase();
      if (prefix && name.includes(":") && itemizedSubcategories.has(prefix)) return;
      if (allLabels().some((l) => isNearDuplicateAddOnName(l, name))) return;
      if (!parsed) {
        leftover.push(ex);
        return;
      }
      rows.push({ key: `ex-${si}-${i}`, itemLabel: parsed.name, caption, prices: base.columnLabels.map(() => parsed.price), note: null });
    });
  });
  return { columnLabels: base.columnLabels, rows, leftover };
}

/** Consecutive rows sharing a caption form one group; the view prints the caption once as a
 * sub-header when there is more than one distinct caption. */
export function groupRowsByCaption(rows: AddOnCategoryTableRow[]): { caption: string | null; rows: AddOnCategoryTableRow[] }[] {
  const groups: { caption: string | null; rows: AddOnCategoryTableRow[] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.caption === r.caption) last.rows.push(r);
    else groups.push({ caption: r.caption, rows: [r] });
  }
  return groups;
}

export function mergeExamplesIntoTable(
  table: { columnLabels: string[]; rows: AddOnCategoryTableRow[] },
  examples: string[],
): { table: { columnLabels: string[]; rows: AddOnCategoryTableRow[] }; leftover: string[] } {
  const rows = [...table.rows];
  const leftover: string[] = [];
  const isDuplicate = (name: string) => rows.some((r) => isNearDuplicateAddOnName(r.itemLabel, name));
  examples.forEach((ex, i) => {
    const parsed = parsePricedExample(ex);
    const name = parsed ? parsed.name : ex;
    if (isDuplicate(name)) return;
    if (!parsed) {
      leftover.push(ex);
      return;
    }
    rows.push({ key: `ex-${i}`, itemLabel: parsed.name, caption: null, prices: table.columnLabels.map(() => parsed.price), note: null });
  });
  return { table: { columnLabels: table.columnLabels, rows }, leftover };
}

export function buildAddOnCategoryStdTable(subgroups: AddOnSubgroup[], spaces: Space[], stdLabel?: string): { columnLabels: string[]; rows: AddOnCategoryTableRow[] } {
  const items = subgroups.flatMap((sg) => sg.items);
  const singleSubcategory = new Set(items.map((a) => a.category.trim().toLowerCase())).size <= 1;
  const spaceIds = [...new Set(items.flatMap((a) => (a.per_space_prices ? Object.keys(a.per_space_prices) : [])))];
  const spaceName = (id: string) => spaces.find((s) => s.id === id)?.name ?? id;
  const columnLabels = spaceIds.length > 0 ? spaceIds.map(spaceName) : ["Price"];
  const rows: AddOnCategoryTableRow[] = items.map((a) => ({
    key: a.id,
    itemLabel: addOnItemLabel(a),
    caption: stdLabel ? captionForCategoryCard(a, stdLabel, singleSubcategory) : addOnCardCaption(a),
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

/** The F&B section's block shape (round 6 rule 2, supersedes round 5 rule 5's pill-row-only
 * decision): "shared" collapses to one plain pill row with no Food/Bar micro-headers; "split"
 * renders two clearly separated FOOD/BAR blocks, each with its own pills, note and table. A single
 * shared block only when the pill SETS match AND neither side has a note (`fbSideNote`, which
 * already covers both the explicit `food_note`/`bar_note` fields and a `notes[]` entry attributed
 * to that side) AND there's no menus/bar-ladders table on either side — any of those three earns
 * the venue its own two-block layout. */
export function fbBlocks(d: VenueDetailsV3): "shared" | "split" {
  const { food, bar } = fbPills(d);
  const hasNote = fbSideNote(d.food_beverage, "food") != null || fbSideNote(d.food_beverage, "bar") != null;
  const hasTable = d.food_beverage.menus.length > 0 || d.food_beverage.bar_ladders.length > 0;
  return fbSharedRow(food, bar, hasNote || hasTable) ? "shared" : "split";
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
 * Round 6 rule 3: the grid now uses `items-stretch` so every card's border reaches the same row
 * height instead of a short card leaving a visible gap beside a tall sibling; nothing scrolls
 * internally). */
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
