/**
 * VenueDetails v3 extraction contract (D060 Phase 2, plan
 * hello-alright-want-to-quizzical-sparrow.md, "Shared contract"). Part B
 * (serveVenueDetails.ts, rollbackVenueDetails.ts, addCorrection.ts,
 * scoreAgainstGolden.ts, reportVenueDetailsFunnel.ts, mustnot/*) imports these
 * shapes verbatim -- keep them exact. Pure types only: no DB, no network.
 *
 * `venue_details_runs.result` = `{ spine_call, pricing_call, document_chars, pages }` (raw tool
 * outputs, pre-validation -- venueDetailsPrompt.ts's SPINE_TOOL/PRICING_TOOL shapes, essentially
 * verbatim). `venue_details_runs.validation` = the `Validation` object below, whose `document` is
 * the ASSEMBLED, validated `VenueDetailsV3` -- part B serves `validation.document`.
 */

import type { SpineTier, VenueDetailsV3 } from "../../lib/venueDetails/types";

export const VENUE_DETAILS_PROMPT_VERSION = "venue-details-v3.0";

// ---------------------------------------------------------------------------
// Raw tool-call output shapes (pre-validation; SPINE_TOOL / PRICING_TOOL args)
// ---------------------------------------------------------------------------

export type RawTriStatus = "stated" | "not_stated" | "conflicting";

/** One candidate inside a `conflicting` tri-state field, or the sole value of a `stated` one. */
export interface RawFactCandidate {
  value: unknown;
  quote: string;
  source_url: string;
}

/** Raw (pre-validated) tri-state spine field as the model returns it -- `assemble.ts` resolves
 * `source_url` to a `snapshot_id` and casts `value` to the field's real type once grounding has
 * run. `value`/`quote`/`source_url` are present when `status === "stated"`; `candidates` is
 * present (length >= 2) when `status === "conflicting"`; both are absent/empty for `not_stated`. */
export interface RawTriField {
  status: RawTriStatus;
  value?: unknown;
  quote?: string | null;
  source_url?: string | null;
  candidates?: RawFactCandidate[];
}

export interface RawAbout {
  text: string;
  source_url: string;
}

export interface RawDifferentiator {
  title: string;
  tagline: string | null;
  groups: { heading: string; bullets: string[] }[];
  source_url: string;
}

export interface RawSpaceDescription {
  text: string;
  quote: string;
  source_url: string;
}

export interface RawSpace {
  id: string;
  name: string;
  structure_label: string | null;
  sq_ft: number | null;
  /** The venue's own wording when size is a range or approximate ("~21,000 (main floor)",
   * "11,376-35,997"); `sq_ft` still carries the first integer found in it. Null when the venue
   * states a plain single number (or nothing). */
  sq_ft_label: string | null;
  sq_ft_outdoor: number | null;
  ceiling_ft: number | null;
  /** Same verbatim-string treatment as `sq_ft_label`, for ceiling height ("8-14 ft"). */
  ceiling_label: string | null;
  setting: string | null;
  bookable_separately: boolean;
  description: RawSpaceDescription | null;
  includes_summary: string | null;
  source_url: string;
}

export interface RawCapacityTuple {
  space_id: string;
  layout: string;
  min: number | null;
  max: number;
  as_stated_label: string;
  condition: string | null;
  quote: string;
  source_url: string;
}

export interface RawInclusion {
  label: string;
  label_raw: string;
  detail: string | null;
  category: string;
  quote: string;
  source_url: string;
}

export interface RawResource {
  kind: string;
  label: string;
  url: string;
  scope: string;
  source_url: string;
}

export interface RawVendorListEntry {
  name: string;
  url: string | null;
  instagram: string | null;
}

export interface RawVendorList {
  label: string;
  category: string;
  relationship: string;
  entries: RawVendorListEntry[];
  source_url: string;
}

export interface RawPressFeature {
  title: string;
  attribution: string;
  url: string;
  source_url: string;
}

/** `submit_venue_spine` tool-call args, exactly. */
export interface RawSpineResult {
  /** Keyed by `keyof VenueSpine` (types.ts `SPINE_KEYS`) -- round 5 adds `capacity_max_guests`
   * to that list; this dictionary shape doesn't need its own change to carry it. */
  spine: Record<string, RawTriField>;
  about: RawAbout | null;
  differentiator: RawDifferentiator | null;
  spaces: RawSpace[];
  capacities: RawCapacityTuple[];
  inclusions: RawInclusion[];
  resources: RawResource[];
  vendor_lists: RawVendorList[];
  press_features: RawPressFeature[];
  notes: string | null;
}

export interface RawFixedFee {
  applies_to: string;
  space_id: string | null;
  day: string | null;
  season: string | null;
  amount: number;
  unit: string;
  label: string;
  includes: string[];
  key: string;
  quote: string;
  source_url: string;
}

export interface RawBarTier {
  name: string;
  hours: number | null;
  examples: string[];
}

export interface RawPerGuestTier {
  id: string;
  name: string;
  per_guest: number;
  day: string | null;
  season: string | null;
  inherits_from: string | null;
  inclusions: string[];
  bar_tier: RawBarTier | null;
  min_guests: number | null;
  quote: string;
  source_url: string;
}

export interface RawMinimum {
  kind: "fb_minimum" | "guest_minimum";
  day: string | null;
  season: string | null;
  amount: number;
  quote: string;
  source_url: string;
}

export interface RawRequiredStaffing {
  price_per_role: number;
  bartender_per_guests: number;
  other_roles: string[];
  quote: string;
  source_url: string;
}

export interface RawYearSurcharge {
  year: number;
  amount: number;
  unit: "per_guest" | "flat";
}

export interface RawPromotion {
  name: string;
  detail: string;
  condition: string | null;
}

export interface RawPricingPath {
  id: string;
  name: string;
  description: string | null;
  applies_to_spaces: string[] | "all";
  fixed_fees: RawFixedFee[];
  per_guest_tiers: RawPerGuestTier[];
  minimums: RawMinimum[];
  required_staffing: RawRequiredStaffing | null;
  rental_hours: number | null;
  year_surcharges: RawYearSurcharge[];
  promotions: RawPromotion[];
  /** What the base rental of THIS path bundles, verbatim short items -- distinct from a space's
   * own includes_summary. Empty when the site doesn't state path-wide inclusions. */
  includes: string[];
  /** Short labeled rental terms the venue states next to its rates (access window, event hours by
   * day, holiday pricing, overtime), label in the venue's own words. Empty when the site doesn't
   * state any. */
  terms: RawPathTerm[];
  quote: string;
  source_url: string;
}

/** One labeled rental term on a `RawPricingPath` (e.g. "Access" -> "Access begins at 10am"). */
export interface RawPathTerm {
  label: string;
  text: string;
  quote: string;
  source_url: string;
}

/** Rates the site actually prints -- `sales_tax_source` is NOT part of the raw call; `assemble.ts`
 * derives it (stated / chicago_default / included / unknown, see plan spec resolutions). */
export interface RawRates {
  service_charge_pct: number | null;
  service_charge_base: "fb" | "all" | null;
  sales_tax_pct: number | null;
  sales_tax_base: "fb_and_rentals" | "all" | "included" | null;
  taxes_included_in_rental: boolean | null;
  cc_fee_pct: number | null;
  quote: string | null;
  source_url: string | null;
}

export interface RawAddOn {
  id: string;
  name: string;
  category: string;
  /** Standard cross-venue grouping (round 5) -- `enums.ts` validates against
   * `ADD_ON_CATEGORIES_STD`; `assemble.ts` defaults it from `group` when the model omits it.
   * Optional (not just nullable) so existing RawAddOn literals elsewhere in the tree don't need
   * updating just to keep compiling. */
  category_std?: string | null;
  variant: string | null;
  group: "fb" | "rental" | "service" | "ceremony" | "other";
  price: number | null;
  price_max: number | null;
  unit: "flat" | "per_guest" | "per_unit" | "per_hour";
  per_space_prices: Record<string, number> | null;
  applies_to: string[] | "all" | null;
  path_ids: string[] | null;
  condition: string | null;
  priceable: boolean;
  tax_pct_override: number | null;
  min_guests: number | null;
  as_stated_price: string | null;
  note: string | null;
  /** Set the same short slug on items a couple picks ONE of (e.g. food package tiers, bar tiers,
   * dinnerware, extra hour); null for independent extras. */
  selection_group: string | null;
  quote: string;
  source_url: string;
}

export interface RawFbPill {
  value: "byo" | "a_la_carte" | "all_inclusive";
  quote: string;
  source_url: string;
}

export interface RawMenu {
  name: string;
  cuisine: string | null;
  includes: string;
  cost: string;
  extras: { label: string; value: string }[];
  source_url: string;
}

export interface RawBarLadder {
  name: string;
  includes: string;
  prices: Record<string, number>;
  note: string | null;
  source_url: string;
}

export interface RawFoodBeverage {
  food_pills: RawFbPill[];
  bar_pills: RawFbPill[];
  caption: { value: string; quote: string; source_url: string } | null;
  /** One or two sentences the venue itself states about how food works here, verbatim or lightly
   * trimmed. Null if the site says nothing specific. */
  food_note: { text: string; quote: string; source_url: string } | null;
  /** Same for the bar side. */
  bar_note: { text: string; quote: string; source_url: string } | null;
  menus: RawMenu[];
  bar_ladders: RawBarLadder[];
  bar_min_guests: number | null;
  notes: { value: string; quote: string; source_url: string }[];
}

export interface RawRequiredThirdParty {
  name: string;
  estimate_usd: number | null;
  required: boolean;
  quote: string;
  source_url: string;
}

export interface RawFaq {
  question: string;
  answer: string;
  source_url: string;
}

/** The venue's own grouping of purchasable extras with its intro sentence and example items --
 * only when the site presents add-ons by category. */
export interface RawAddOnCategory {
  category: string;
  blurb: string | null;
  examples: string[];
  source_url: string;
}

/** The venue's own definition of peak/off-season months, verbatim. Either half may be null when
 * only one side is stated. */
export interface RawSeasons {
  peak: string | null;
  off: string | null;
  source_url: string;
}

/** `submit_venue_pricing` tool-call args, exactly. */
export interface RawPricingResult {
  archetype: string | null;
  paths: RawPricingPath[];
  rates: RawRates;
  add_ons: RawAddOn[];
  add_on_categories: RawAddOnCategory[];
  food_beverage: RawFoodBeverage;
  required_third_party: RawRequiredThirdParty[];
  faqs: RawFaq[];
  seasons: RawSeasons | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// venue_details_runs.result / .validation
// ---------------------------------------------------------------------------

export interface VenueDetailsRunResult {
  spine_call: RawSpineResult;
  pricing_call: RawPricingResult | null;
  document_chars: number;
  pages: string[];
}

export interface Issue {
  code: string;
  path: string;
  severity: "error" | "warning";
  tier: SpineTier | null;
  message: string;
}

export interface Repair {
  field_path: string;
  issue_code: string;
  tier: SpineTier | null;
  instruction: string;
  evidence_hint: { snapshot_ids: number[]; keyword_hits: string[] };
}

export interface Validation {
  ok: boolean;
  needs_review: boolean;
  review_reasons: string[];
  issues: Issue[];
  repairs: Repair[];
  grounding: {
    checked: number;
    passed: number;
    failed: number;
    min_coverage: number | null;
  };
  spine_stated_count: number;
  critical_failures: number;
  document: VenueDetailsV3;
}

// ---------------------------------------------------------------------------
// Shared with the serving side (serve/rollback/score/funnel) -- folded in from the
// interim contractB.ts when parts A and B were reconciled (2026-09-14).
// ---------------------------------------------------------------------------

export type IssueSeverity = Issue["severity"];
export type IssueTier = Issue["tier"];

/** Alias kept for the serving scripts' `--prompt-version` defaults. */
export const DEFAULT_PROMPT_VERSION = VENUE_DETAILS_PROMPT_VERSION;

export type RunStage = "extract" | "repair";

/** Row shape of `venue_details_runs` as the serving scripts read it (jsonb parsed by pg). */
export interface RunRow {
  id: number;
  account_id: number;
  prompt_version: string;
  schema_version: number;
  model: string | null;
  stage: RunStage;
  parent_run_id: number | null;
  input_hash: string;
  snapshot_ids: number[];
  website_url: string | null;
  validation: Validation | null;
  spine_stated_count: number | null;
  critical_failures: number | null;
  cost_usd: string | number | null;
  created_at: string;
}
