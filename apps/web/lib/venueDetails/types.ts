/**
 * VenueDetailsV3 — the comparison spine (tri-state, same keys on every venue) + a venue-shaped
 * detail layer, with provenance on every stated fact. See
 * docs/engineering/venue-enrichment/ and the approved plan
 * (hello-alright-want-to-quizzical-sparrow.md) for the product reasoning. Pure types only: no
 * React, no DB, no network — this file (and the rest of lib/venueDetails/) is inside the
 * production tsconfig and must stay importable from both `lib/server/*` and `scripts/` contexts
 * one day, but scripts/ itself is excluded from this tsconfig, so nothing here may import from
 * scripts/.
 */

// ---------------------------------------------------------------------------
// Evidence wrappers
// ---------------------------------------------------------------------------

/** A single stated value with direct, grounded evidence: a verbatim quote from a crawled page. */
export interface Fact<T> {
  value: T;
  /** Verbatim (or answer-is-the-quote, for FAQs) text the value must be grounded against. */
  quote: string;
  source_url: string;
  /** Null for golden fixtures (`origin: 'golden'` facts have no real crawl snapshot). */
  snapshot_id: number | null;
}

/** Evidence for prose/link facts that aren't quote-grounded (about, differentiator, resources,
 * vendor lists, press features): the source page must exist in the crawl, no quote required. */
export interface Sourced {
  source_url: string;
  snapshot_id: number | null;
}

/** Tri-state wrapper used on every comparison-spine field: stated (with evidence), not_stated
 * (no evidence found — "unknown beats wrong"), or conflicting (two+ sources disagree). */
export type Tri<T> =
  | ({ status: "stated" } & Fact<T>)
  | { status: "not_stated" }
  | { status: "conflicting"; candidates: Fact<T>[] };

/** Reusable not_stated value. Safe to assign to any `Tri<T>` — the not_stated member never
 * depends on T. */
export const NOT_STATED: { status: "not_stated" } = { status: "not_stated" };

export function isStated<T>(t: Tri<T>): t is { status: "stated" } & Fact<T> {
  return t.status === "stated";
}

export function stated<T>(value: T, quote: string, source_url: string, snapshot_id: number | null = null): Tri<T> {
  return { status: "stated", value, quote, source_url, snapshot_id };
}

// ---------------------------------------------------------------------------
// Enums (const arrays + derived unions)
// ---------------------------------------------------------------------------

export const VENUE_KINDS = [
  "event_space",
  "banquet_hall",
  "hotel",
  "museum",
  "restaurant",
  "loft",
  "garden_outdoor",
  "country_club",
  "historic_estate",
  "house_of_worship",
  "other",
] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];

export const SETTINGS = ["indoor", "outdoor", "both"] as const;
export type Setting = (typeof SETTINGS)[number];

export const CATERING_POLICIES = ["open", "preferred_list", "exclusive_in_house", "approved_list_only"] as const;
export type CateringPolicy = (typeof CATERING_POLICIES)[number];

export const BAR_POLICIES = ["in_house", "byob", "byo_with_corkage", "dry"] as const;
export type BarPolicy = (typeof BAR_POLICIES)[number];

export const RENTAL_CHARGE_TYPES = ["flat_fee", "per_guest_bundled", "flat_plus_per_guest", "inquire_only", "none"] as const;
export type RentalChargeType = (typeof RENTAL_CHARGE_TYPES)[number];

export const PARKING_POLICIES = ["included", "paid", "valet_paid", "street", "none"] as const;
export type ParkingPolicy = (typeof PARKING_POLICIES)[number];

export const COORDINATOR_POLICIES = ["included", "required_hire", "optional"] as const;
export type CoordinatorPolicy = (typeof COORDINATOR_POLICIES)[number];

export const INSURANCE_POLICIES = ["required", "not_required", "venue_covers"] as const;
export type InsurancePolicy = (typeof INSURANCE_POLICIES)[number];

export const SECURITY_POLICIES = ["included", "required_hire", "not_required"] as const;
export type SecurityPolicy = (typeof SECURITY_POLICIES)[number];

export const COAT_CHECK = ["included", "available_fee", "none"] as const;
export type CoatCheck = (typeof COAT_CHECK)[number];

export const CEREMONY_FEE_POLICIES = ["included", "extra_fee", "not_offered"] as const;
export type CeremonyFeePolicy = (typeof CEREMONY_FEE_POLICIES)[number];

export const VENDOR_LIST_POLICIES = ["open", "preferred_list", "required_list"] as const;
export type VendorListPolicy = (typeof VENDOR_LIST_POLICIES)[number];

export const PRICING_ARCHETYPES = [
  "all_inclusive_per_guest",
  "rental_plus_fb_minimum",
  "rental_plus_per_guest_packages",
  "raw_space_byo",
  "hotel_package",
  "inquire_only",
  "mixed",
] as const;
export type PricingArchetype = (typeof PRICING_ARCHETYPES)[number];

export const LAYOUTS = ["ceremony_seated", "seated_dinner", "seated_with_dance", "cocktail_standing", "theater", "other"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun", "weekday", "any"] as const;
export type Day = (typeof DAYS)[number];

export const SEASONS = ["peak", "off", "any"] as const;
export type Season = (typeof SEASONS)[number];

export const RESOURCE_KINDS = [
  "brochure",
  "menu",
  "bar_menu",
  "capacity_sheet",
  "floor_plan",
  "contract",
  "catering_guidelines",
  "video",
  "virtual_tour",
  "gallery",
  "vendor_list",
  "other",
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** Canonical cross-venue inclusion labels — extraction must map a venue's own wording onto one
 * of these (raw wording is kept in `InclusionItem.label_raw`) so inclusions compare across venues. */
export const INCLUSION_LABELS = [
  "Exclusively yours",
  "Bridal suite",
  "Bar space",
  "Parking",
  "Coat check",
  "Accessibility",
  "Heating & A/C",
  "Restrooms",
  "Green Room",
  "Tables",
  "Chairs",
  "Linens",
  "Dance floor",
  "Stage",
  "Lounge",
  "Bars",
  "DJ",
  "Sound & AV",
  "Lighting",
  "Photobooth",
  "Videography",
  "Coordinator",
  "Security",
  "Banquet Captain",
  "Sales Manager",
  "Wedding cake",
  "Candle treatment",
  "Décor",
  "Drape",
  "Complimentary suite",
  "Parent upgrades",
  "Room block",
  "Ceremony",
  "Centerpieces",
  "Kitchen",
  "Wifi",
  "other",
] as const;
export type InclusionLabel = (typeof INCLUSION_LABELS)[number];

export const INCLUSION_CATEGORIES = ["Space", "Furniture", "Entertainment", "Services", "Ambiance", "Catering", "Lodging", "Other"] as const;
export type InclusionCategory = (typeof INCLUSION_CATEGORIES)[number];

export const FB_PILLS = ["byo", "a_la_carte", "all_inclusive"] as const;
export type FbPill = (typeof FB_PILLS)[number];

// ---------------------------------------------------------------------------
// Spine value shapes (for the tri-state fields whose stated value isn't a plain scalar)
// ---------------------------------------------------------------------------

export interface FbMinimum {
  applies: boolean;
  amount_usd: number | null;
  detail: string | null;
}

export interface PaymentSchedule {
  deposit: string;
  balance_due: string | null;
}

export interface Cancellation {
  summary: string;
  deposit_refundable: boolean | null;
}

export interface VendorAccess {
  summary: string;
  setup_hours_before: number | null;
  teardown_hours_after: number | null;
}

// ---------------------------------------------------------------------------
// VenueSpine — every field tri-state; comparison/filter/budget reads live here.
// ---------------------------------------------------------------------------

export interface VenueSpine {
  venue_kind: Tri<VenueKind>;
  setting: Tri<Setting>;
  one_event_per_day: Tri<boolean>;
  space_count_bookable: Tri<number>;
  capacity_min_guests: Tri<number>;
  /** The venue's OWN stated guest maximum (any layout) when it publishes one ("25–200 guests");
   * drives the quick-fact pill and calculator range. Compare still uses the seated headline. Round 5. */
  capacity_max_guests: Tri<number>;
  ceremony_on_site: Tri<boolean>;
  ceremony_fee: Tri<CeremonyFeePolicy>;
  rental_hours_included: Tri<number>;
  weekday_events: Tri<boolean>;

  // The 13 template Policies rows, in the template's locked order.
  catering: Tri<CateringPolicy>;
  bar: Tri<BarPolicy>;
  rental_charge_type: Tri<RentalChargeType>;
  fb_minimum: Tri<FbMinimum>;
  service_charge_pct: Tri<number>; // 0 = explicitly none, not "not stated"
  parking: Tri<ParkingPolicy>;
  day_of_coordinator: Tri<CoordinatorPolicy>;
  payment_schedule: Tri<PaymentSchedule>;
  cancellation: Tri<Cancellation>;
  event_insurance: Tri<InsurancePolicy>;
  security: Tri<SecurityPolicy>;
  vendor_access: Tri<VendorAccess>;
  noise_curfew: Tri<string>; // "HH:MM", 24h

  sales_tax_pct: Tri<number>;
  cc_fee_pct: Tri<number>;
  taxes_included_in_rental: Tri<boolean>;
  vendor_list_policy: Tri<VendorListPolicy>;
  pets_allowed: Tri<boolean>;

  hvac: Tri<boolean>;
  ada_accessible: Tri<boolean>;
  bridal_suite: Tri<boolean>;
  tables_chairs_included: Tri<boolean>;
  linens_included: Tri<boolean>;
  dance_floor_included: Tri<boolean>;
  coat_check: Tri<CoatCheck>;

  pricing_archetype: Tri<PricingArchetype>;
  price_from_usd: Tri<number>;
  per_guest_from_usd: Tri<number>;
  per_guest_to_usd: Tri<number>;
}

/** Ordered spine field list — the canonical iteration order for rendering/diffing/tiering. */
export const SPINE_KEYS = [
  "venue_kind",
  "setting",
  "one_event_per_day",
  "space_count_bookable",
  "capacity_min_guests",
  "capacity_max_guests",
  "ceremony_on_site",
  "ceremony_fee",
  "rental_hours_included",
  "weekday_events",
  "catering",
  "bar",
  "rental_charge_type",
  "fb_minimum",
  "service_charge_pct",
  "parking",
  "day_of_coordinator",
  "payment_schedule",
  "cancellation",
  "event_insurance",
  "security",
  "vendor_access",
  "noise_curfew",
  "sales_tax_pct",
  "cc_fee_pct",
  "taxes_included_in_rental",
  "vendor_list_policy",
  "pets_allowed",
  "hvac",
  "ada_accessible",
  "bridal_suite",
  "tables_chairs_included",
  "linens_included",
  "dance_floor_included",
  "coat_check",
  "pricing_archetype",
  "price_from_usd",
  "per_guest_from_usd",
  "per_guest_to_usd",
] as const satisfies readonly (keyof VenueSpine)[];

/** The 13 template Policies rows, in the template's locked order (a subset of SPINE_KEYS). */
export const POLICY_ROW_KEYS = [
  "catering",
  "bar",
  "rental_charge_type",
  "fb_minimum",
  "service_charge_pct",
  "parking",
  "day_of_coordinator",
  "payment_schedule",
  "cancellation",
  "event_insurance",
  "security",
  "vendor_access",
  "noise_curfew",
] as const satisfies readonly (keyof VenueSpine)[];

export type SpineTier = "critical" | "important" | "secondary";

/** Criticality-weighted gates (plan §"Spine tiers, compare_ready, and quality gates"). */
export const SPINE_TIERS: Record<keyof VenueSpine, SpineTier> = {
  catering: "critical",
  bar: "critical",
  rental_charge_type: "critical",
  fb_minimum: "critical",
  service_charge_pct: "critical",
  pricing_archetype: "critical",
  price_from_usd: "critical",
  per_guest_from_usd: "critical",
  per_guest_to_usd: "critical",
  ceremony_on_site: "critical",
  ceremony_fee: "critical",
  vendor_list_policy: "critical",
  setting: "critical",
  venue_kind: "critical",

  event_insurance: "important",
  day_of_coordinator: "important",
  security: "important",
  parking: "important",
  noise_curfew: "important",
  payment_schedule: "important",
  cancellation: "important",
  sales_tax_pct: "important",
  taxes_included_in_rental: "important",
  one_event_per_day: "important",
  capacity_min_guests: "important",
  capacity_max_guests: "important",
  rental_hours_included: "important",

  coat_check: "secondary",
  hvac: "secondary",
  ada_accessible: "secondary",
  bridal_suite: "secondary",
  tables_chairs_included: "secondary",
  linens_included: "secondary",
  dance_floor_included: "secondary",
  pets_allowed: "secondary",
  weekday_events: "secondary",
  space_count_bookable: "secondary",
  cc_fee_pct: "secondary",
  vendor_access: "secondary",
};

// ---------------------------------------------------------------------------
// Detail layer — venue-shaped, evidence-carrying.
// ---------------------------------------------------------------------------

export interface Space {
  /** Stable slug, used everywhere as the join key (capacities, add-on per_space_prices, fixed
   * fees, correction field_paths) instead of an array index. */
  id: string;
  name: string;
  structure_label: string | null;
  sq_ft: number | null;
  /** Verbatim size wording when the venue states it as a string, not a single number
   * ("~21,000 (main floor)", "11,376–35,997") — `sq_ft` still carries the first integer found in
   * it so numeric code (headline capacity, sorting) keeps working; the renderer prefers this label
   * verbatim when present. Optional: only fixtures/venues that need it (Field Museum) set it. */
  sq_ft_label?: string | null;
  sq_ft_outdoor: number | null;
  ceiling_ft: number | null;
  /** Same verbatim-string treatment as `sq_ft_label`, for ceiling height ("8–14 ft"). Optional. */
  ceiling_label?: string | null;
  setting: Setting | null;
  /** False for a sub-room that only exists as part of a larger rental (e.g. a whole-venue-only
   * booking) — excluded from the headline-capacity computation. */
  bookable_separately: boolean;
  description: Fact<string> | null;
  includes_summary: string | null;
  evidence: Sourced;
}

export interface CapacityTuple {
  space_id: string | "whole_venue";
  layout: Layout;
  min: number | null;
  max: number;
  /** The venue's own vocabulary for this number (e.g. "Seated (w/ dance floor)"). */
  as_stated_label: string;
  /** Which of the 3 headline tiles this tuple's number should populate, if any. */
  tile: "seated" | "seated_dance" | "cocktail" | null;
  /** A real constraint tied to this number, e.g. "live band" / "DJ" (Greenhouse Loft's band
   * cap) — a capacity constraint, not a fee. Powers the `band` calculator axis. */
  condition: string | null;
  quote: string;
  source_url: string;
  snapshot_id: number | null;
}

// --- Pricing --------------------------------------------------------------

export interface FixedFee {
  applies_to: "space" | "whole_venue" | "ceremony" | "other";
  space_id: string | null;
  day: Day | null;
  season: Season | null;
  amount: number;
  unit: "flat" | "per_hour";
  label: string;
  includes: string[];
  /** Stable id for diffing/corrections — never an array index. */
  key: string;
  quote: string;
  source_url: string;
  snapshot_id: number | null;
}

export interface BarTier {
  name: string;
  hours: number | null;
  examples: string[];
}

export interface PerGuestTier {
  id: string;
  name: string;
  per_guest: number;
  day: Day | null;
  season: Season | null;
  inherits_from: string | null;
  inclusions: string[];
  bar_tier: BarTier | null;
  min_guests: number | null;
  quote: string;
  source_url: string;
  snapshot_id: number | null;
}

export interface Minimum {
  kind: "fb_minimum" | "guest_minimum";
  day: Day | null;
  season: Season | null;
  amount: number;
  quote: string;
  source_url: string;
  snapshot_id: number | null;
}

export interface RequiredStaffing {
  price_per_role: number;
  bartender_per_guests: number;
  other_roles: string[];
  quote: string;
  source_url: string;
  snapshot_id: number | null;
}

export interface YearSurcharge {
  year: number;
  amount: number;
  unit: "per_guest" | "flat";
}

/** Display-only — not applied by `estimateCost`. */
export interface Promotion {
  name: string;
  detail: string;
  condition: string | null;
}

export interface PricingPath {
  id: string;
  name: string;
  description: string | null;
  applies_to_spaces: string[] | "all";
  fixed_fees: FixedFee[];
  per_guest_tiers: PerGuestTier[];
  minimums: Minimum[];
  required_staffing: RequiredStaffing | null;
  rental_hours: number | null;
  year_surcharges: YearSurcharge[];
  promotions: Promotion[];
  quote: string;
  source_url: string;
  snapshot_id: number | null;
  /** Path-level inclusions (Diamond Garden's Hall Rental Only tables/kitchen) — distinct from a
   * space's own `includes_summary` (Marchetti's per-space inclusions). Optional: only paths that
   * carry a real, path-wide inclusion list set this. */
  includes?: string[];
  /** Short labeled rental terms the venue states next to its rates, in the venue's own labels
   * ("Access", "Event hours", "Holiday rates", "Overtime"). Rendered as `Label: text` under the
   * rate grid (round 4). */
  terms?: { label: string; text: string; evidence: Sourced }[];
  /** The venue's own name for this path, shown light-grey under our standardized title ("Hall Rental
   * Only" under "Venue only"). Round 6. */
  subtitle?: string | null;
}

export interface Rates {
  service_charge_pct: number | null;
  service_charge_base: "fb" | "all" | null;
  sales_tax_pct: number | null;
  sales_tax_base: "fb_and_rentals" | "all" | "included" | null;
  /** `stated`: the venue's own number. `chicago_default`: inferred, flagged as an assumption.
   * `included`: taxes already folded into quoted prices (no separate tax line).
   * `unknown`: genuinely not stated — no sales tax line is shown. */
  sales_tax_source: "stated" | "chicago_default" | "included" | "unknown";
  cc_fee_pct: number | null;
  quote: string | null;
  source_url: string | null;
  snapshot_id: number | null;
}

export const ADD_ON_CATEGORIES_STD = ["fb","space_rentals","decor","lighting_av","entertainment","services_staffing","ceremony","time","other"] as const;
export type AddOnCategoryStd = (typeof ADD_ON_CATEGORIES_STD)[number];

export interface AddOn {
  id: string;
  name: string;
  category: string;
  /** Standard grouping shared by the Add-ons section and the Cost Estimate (round 5); the venue's own
   * `category` stays as the sub-label. */
  category_std?: AddOnCategoryStd;
  /** e.g. "7 swags" vs "13 swags" — two variants of the same category with their own prices. */
  variant: string | null;
  group: "fb" | "rental" | "service" | "ceremony" | "other";
  price: number | null;
  price_max: number | null;
  unit: "flat" | "per_guest" | "per_unit" | "per_hour";
  per_space_prices: Record<string, number> | null;
  applies_to: string[] | "all" | null;
  /** Which pricing path(s) this add-on is relevant to; null = relevant regardless of path. */
  path_ids: string[] | null;
  /** e.g. "ceremony_on_site" — gates whether this add-on auto-applies given an EstimateInput
   * flag, distinct from `extras`-driven optional selection. */
  condition: string | null;
  /** Some add-ons are priced by day and/or season (extra hours, overtime, rehearsal time). When set,
   * the calculator keeps only the rows matching the chosen day/season and the static table shows a
   * small season × day grid for the group. Null = same price any day. Round 6. */
  day?: Day | null;
  season?: Season | null;
  priceable: boolean;
  /** Set even when numerically equal to `Rates.sales_tax_pct`, whenever the venue's own page
   * breaks this add-on's tax out as its own separately-computed line (see derive.ts). */
  tax_pct_override: number | null;
  min_guests: number | null;
  as_stated_price: string | null;
  note: string | null;
  quote: string;
  source_url: string;
  snapshot_id: number | null;
  /** Items sharing a group are single-select in the calculator (Diamond Garden's food package,
   * dinnerware, bar tier, and extra-hour choices) — rendered as one PillGroup, "None" first,
   * instead of independent toggle chips. Optional: only venues with a real single-select choice
   * set this; everything else stays an independently toggleable extra. */
  selection_group?: string | null;
}

export interface RequiredThirdPartyCost {
  name: string;
  estimate_usd: number | null;
  required: boolean;
  quote: string;
  source_url: string;
  snapshot_id: number | null;
}

/** Axes `estimateCost`/`defaultAxes` accept and pin. Declared here (not derive.ts) so
 * `Pricing.default_axes` can reference it without a derive.ts -> types.ts -> derive.ts cycle;
 * derive.ts re-exports this type for callers. */
export interface EstimateExtra {
  add_on_id: string;
  quantity?: number;
}

export interface EstimateInput {
  guests: number;
  day: Day;
  season: Season;
  event_year?: number;
  path_id?: string;
  tier_id?: string;
  space_id?: string;
  ceremonyOnSite: boolean;
  /** Live band vs DJ, when capacity tuples for the chosen space differ by `condition`; switches the
   * over-capacity check to the band tuple. Round 4. */
  band?: boolean;
  payment?: "cash_check" | "credit_card";
  extras: EstimateExtra[];
}

export interface Pricing {
  archetype: PricingArchetype | null;
  paths: PricingPath[];
  rates: Rates;
  add_ons: AddOn[];
  required_third_party: RequiredThirdPartyCost[];
  notes: Fact<string>[];
  /** Golden fixtures may pin their own default calculator axes. */
  default_axes?: Partial<EstimateInput>;
  /** Category-level copy for the Add-ons & extras section's curated cards (Diamond Garden's 5
   * categories: blurb + curated example bullets) — `AddOn.category` is the join key back to the
   * granular per-item list used by the calculator. Optional: only venues whose add-ons page has
   * real category-level framing set this; everything else keeps the plain per-item grouping. */
  add_on_categories?: { category: string; blurb: string | null; examples: string[]; evidence: Sourced }[];
  /** Month definitions for "peak"/"off" season, rendered once under any season-keyed pricing grid
   * (Diamond Garden: "off-season is Jan, Feb, Mar, Nov; peak season is Apr–Oct, Dec"). Optional:
   * only venues whose pricing actually varies by season set this. */
  seasons?: { peak: string | null; off: string | null };
}

// --- Food & beverage (its own object, not a pricing side effect) ----------

export interface FoodBeverage {
  food_pills: Fact<FbPill>[];
  bar_pills: Fact<FbPill>[];
  /** A narrow exception caption, e.g. a corkage carve-out. */
  caption: Fact<string> | null;
  /** One or two sentences the venue states about how food works here (explicitly sided, unlike
   * `notes[]`, which is routed by keyword). Round 4. */
  food_note?: Fact<string> | null;
  /** Same for the bar side. */
  bar_note?: Fact<string> | null;
  menus: {
    name: string;
    cuisine: string | null;
    includes: string;
    cost: string;
    extras: { label: string; value: string }[];
    evidence: Sourced;
  }[];
  bar_ladders: {
    name: string;
    includes: string;
    prices: Record<string, number>;
    note: string | null;
    evidence: Sourced;
  }[];
  bar_min_guests: number | null;
  notes: Fact<string>[];
}

export interface InclusionItem {
  label: InclusionLabel;
  /** The venue's own wording, kept for display alongside the canonical label. */
  label_raw: string;
  detail: string | null;
  category: InclusionCategory;
  quote: string;
  source_url: string;
  snapshot_id: number | null;
}

/** Verbatim FAQs (exception to data-plane.md, D060) — the answer text is itself the quote. */
export interface Faq {
  question: string;
  answer: string;
  source_url: string;
  snapshot_id: number | null;
}

export interface Resource {
  id: string;
  kind: ResourceKind;
  label: string;
  url: string;
  scope: "venue" | `space:${string}`;
  /** Null until `checkResourceEmbeddability.ts` (Phase 5) has checked; renders as a new-tab link
   * until then. */
  embeddable: boolean | null;
  has_text_layer: boolean | null;
  checked_at: string | null;
  source_url: string;
  snapshot_id: number | null;
}

export interface VendorList {
  label: string;
  category: string;
  relationship: "preferred" | "approved_required" | "in_house_partner" | "recommended";
  entries: { name: string; url: string | null; instagram: string | null }[];
  source_url: string;
  snapshot_id: number | null;
}

export interface Differentiator {
  title: string;
  /** Feeds the optional 5th quick-fact pill — never free-form model text otherwise. */
  tagline: string | null;
  groups: { heading: string; bullets: string[] }[];
  evidence: Sourced;
}

export interface PressFeature {
  title: string;
  attribution: string;
  url: string;
  source_url: string;
  snapshot_id: number | null;
}

// ---------------------------------------------------------------------------
// Top-level document
// ---------------------------------------------------------------------------

export const VENUE_DETAILS_SCHEMA_VERSION = 3 as const;

export interface VenueDetailsV3 {
  schema_version: 3;
  /** Keyed on accounts.id (D060), not vendors.id. */
  account_id: number;
  name: string;
  website_url: string | null;
  spine: VenueSpine;
  /** `Sourced`, not quote-grounded — hand abouts are paraphrases; numeric hygiene (every digit
   * sequence must appear in the crawled pages) substitutes for a quote check. */
  about: { text: string; evidence: Sourced } | null;
  differentiator: Differentiator | null;
  spaces: Space[];
  capacities: CapacityTuple[];
  pricing: Pricing;
  food_beverage: FoodBeverage;
  inclusions: InclusionItem[];
  faqs: Faq[];
  resources: Resource[];
  vendor_lists: VendorList[];
  press_features: PressFeature[];
  sources: {
    snapshot_ids: number[];
    pages: string[];
    crawled_at: string | null;
  };
  /** Null for golden fixtures / human-authored corrections that never went through the pipeline. */
  extraction: {
    run_id: number;
    prompt_version: string;
    model: string;
    extracted_at: string;
  } | null;
  /** Null until the document has been served at least once. */
  provenance: {
    version_id: number;
    version_no: number;
    correction_ids: number[];
    human_verified_at: string | null;
    verified_by: string | null;
  } | null;
  /** Golden fixtures only: tags a stable field path as scored against a live crawl
   * (`extractor`) or kept for the renderer only (`human_only`, e.g. an image-PDF menu). */
  eval?: Record<string, "extractor" | "human_only">;
}
