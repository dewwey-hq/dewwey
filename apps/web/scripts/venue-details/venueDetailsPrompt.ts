/**
 * VenueDetails v3 extraction prompt module (D060 Phase 2, part A). Pure — no DB, no network — so
 * it is fully unit-testable (venueDetailsPrompt.test.ts). `extractVenueDetails.ts` wires this to
 * OpenRouter via `../classify/openrouter.ts`'s `callTool`.
 *
 * Two forced-tool-use calls per venue: SPINE_TOOL (comparison spine + detail layer) and
 * PRICING_TOOL (the normalized cost model), sharing the same house style as
 * `../classify/extractPrompt.ts` (hand-written JSON-schema `parameters`, enum descriptions
 * written for a model, a `PROMPT_VERSION` constant). Every enum in these schemas is drawn
 * straight from `lib/venueDetails/types.ts`'s const arrays (never redeclared) so the two can
 * never drift apart.
 */

import {
  BAR_POLICIES,
  CATERING_POLICIES,
  CEREMONY_FEE_POLICIES,
  COAT_CHECK,
  COORDINATOR_POLICIES,
  DAYS,
  FB_PILLS,
  INCLUSION_CATEGORIES,
  INCLUSION_LABELS,
  INSURANCE_POLICIES,
  LAYOUTS,
  PARKING_POLICIES,
  PRICING_ARCHETYPES,
  RENTAL_CHARGE_TYPES,
  RESOURCE_KINDS,
  SECURITY_POLICIES,
  SEASONS,
  SETTINGS,
  SPINE_KEYS,
  VENDOR_LIST_POLICIES,
  VENUE_KINDS,
  type VenueSpine,
} from "../../lib/venueDetails/types";
import type { Repair } from "./contract";

export { VENUE_DETAILS_PROMPT_VERSION } from "./contract";

// ---------------------------------------------------------------------------
// JSON-schema helpers (house style: hand-written `parameters`, no ajv/zod)
// ---------------------------------------------------------------------------

export type JsonSchema = Record<string, unknown>;

/** Every object schema in this file is "strict": `required` always lists every property. This is
 * the invariant venueDetailsPrompt.test.ts walks the whole schema tree to check. */
function strictObject(properties: Record<string, JsonSchema>, description?: string): JsonSchema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
    ...(description ? { description } : {}),
  };
}

function strictArray(items: JsonSchema, description?: string): JsonSchema {
  return { type: "array", items, ...(description ? { description } : {}) };
}

function nullable(schema: JsonSchema): JsonSchema {
  const type = schema.type;
  const nullableType = Array.isArray(type) ? [...type, "null"] : [type, "null"];
  return { ...schema, type: nullableType };
}

function enumSchema(values: readonly string[], description?: string): JsonSchema {
  return { type: "string", enum: [...values], ...(description ? { description } : {}) };
}

function strOrAllOrNull(description: string): JsonSchema {
  return {
    description,
    anyOf: [{ type: "array", items: { type: "string" } }, { type: "string", enum: ["all"] }, { type: "null" }],
  };
}

// ---------------------------------------------------------------------------
// Tri-state field schema (spine)
// ---------------------------------------------------------------------------

// Kept terse deliberately: this wrapper text is repeated once per SPINE_KEYS entry (38x), so a
// few extra words here costs ~150 tokens across the whole tool schema. The one full explanation
// of stated/not_stated/conflicting lives in SYSTEM_PROMPT_SPINE instead.
function candidateSchema(valueSchema: JsonSchema): JsonSchema {
  return strictObject({
    value: valueSchema,
    quote: { type: "string" },
    source_url: { type: "string" },
  });
}

function triFieldSchema(valueSchema: JsonSchema, description: string): JsonSchema {
  return strictObject(
    {
      status: enumSchema(["stated", "not_stated", "conflicting"], "never guess -- not_stated when unclear; conflicting when the venue's own docs disagree (fill candidates)."),
      value: nullable(valueSchema),
      quote: nullable({ type: "string", description: "Verbatim proof; required if stated." }),
      source_url: nullable({ type: "string", description: "Page the quote is from; required if stated." }),
      candidates: strictArray(candidateSchema(valueSchema), ">=2 entries if conflicting, else empty."),
    },
    description
  );
}

// ---------------------------------------------------------------------------
// Spine field configuration -- one entry per SPINE_KEYS member
// ---------------------------------------------------------------------------

interface SpineFieldConfig {
  valueSchema: JsonSchema;
  description: string;
}

const FB_MINIMUM_VALUE_SCHEMA = strictObject({
  applies: { type: "boolean" },
  amount_usd: nullable({ type: "number" }),
  detail: nullable({ type: "string" }),
});

const PAYMENT_SCHEDULE_VALUE_SCHEMA = strictObject({
  deposit: { type: "string", description: "The deposit as stated (amount or percent, and when due)." },
  balance_due: nullable({ type: "string", description: "When the remaining balance is due, if stated." }),
});

const CANCELLATION_VALUE_SCHEMA = strictObject({
  summary: { type: "string", description: "The cancellation/rescheduling policy in the venue's own words." },
  deposit_refundable: nullable({ type: "boolean" }),
});

const VENDOR_ACCESS_VALUE_SCHEMA = strictObject({
  summary: { type: "string" },
  setup_hours_before: nullable({ type: "number" }),
  teardown_hours_after: nullable({ type: "number" }),
});

const SPINE_FIELD_CONFIG: Record<(typeof SPINE_KEYS)[number], SpineFieldConfig> = {
  venue_kind: {
    valueSchema: enumSchema(VENUE_KINDS),
    description: "What kind of venue this is, from the venue's own framing.",
  },
  setting: {
    valueSchema: enumSchema(SETTINGS),
    description: "Whether events happen indoor, outdoor, or both, based on the spaces actually described.",
  },
  one_event_per_day: {
    valueSchema: { type: "boolean" },
    description: "True only when the site states one wedding/event per day (exclusive use). Never assume this from being a single-space venue.",
  },
  space_count_bookable: {
    valueSchema: { type: "number" },
    description: "Count of separately bookable spaces (bookable_separately=true rows in spaces[]), as stated or clearly countable -- not your own tally of every room mentioned.",
  },
  capacity_min_guests: {
    valueSchema: { type: "number" },
    description: "A minimum guest count the venue states applies to booking at all -- not a per-tier minimum (those live in the pricing call's minimums[]).",
  },
  ceremony_on_site: {
    valueSchema: { type: "boolean" },
    description: "True when the site says ceremonies can happen on-site, even if for an extra fee.",
  },
  ceremony_fee: {
    valueSchema: enumSchema(CEREMONY_FEE_POLICIES),
    description:
      "included: ceremony is part of the base rental. extra_fee: ceremony costs more, separate from the reception rental. not_offered: the site says it does not host ceremonies on-site.",
  },
  rental_hours_included: {
    valueSchema: { type: "number" },
    description: "Hours of rental time included in the base package/fee, as stated (e.g. a '5-hour reception').",
  },
  weekday_events: {
    valueSchema: { type: "boolean" },
    description: "True when the site explicitly allows/prices weekday (Mon-Thu) events, not just Fri/Sat/Sun.",
  },
  catering: {
    valueSchema: enumSchema(CATERING_POLICIES),
    description: "open: any caterer allowed. preferred_list: suggested list, outside ok. exclusive_in_house: venue's kitchen only. approved_list_only: must use the required list.",
  },
  bar: {
    valueSchema: enumSchema(BAR_POLICIES),
    description:
      "in_house: only venue bar pours. byob: bring your own, no in-house bar needed. byo_with_corkage: in-house bar + outside alcohol allowed for a corkage fee " +
      "(ANY corkage fee mentioned anywhere means this). dry: no alcohol.",
  },
  rental_charge_type: {
    valueSchema: enumSchema(RENTAL_CHARGE_TYPES),
    description:
      "flat_fee: one flat amount regardless of guest count. per_guest_bundled: entirely per-person. flat_plus_per_guest: flat fee PLUS separate per-guest food charge. " +
      "inquire_only: no pricing structure published -- honest, comparable info, not missing data. none: rental is free.",
  },
  fb_minimum: {
    valueSchema: FB_MINIMUM_VALUE_SCHEMA,
    description: "Whether a food & beverage spending minimum applies. applies=true, amount_usd=null if a minimum exists but the number isn't published -- don't guess it.",
  },
  service_charge_pct: {
    valueSchema: { type: "number" },
    description: "Mandatory service charge / 'production fee' %. Use 0 only if explicitly none; unmentioned = not_stated.",
  },
  parking: {
    valueSchema: enumSchema(PARKING_POLICIES),
    description: "included: free. paid: self-park fee. valet_paid: valet only, paid. street: street only. none: no parking available.",
  },
  day_of_coordinator: {
    valueSchema: enumSchema(COORDINATOR_POLICIES),
    description: "included: provided in package. required_hire: couple MUST hire their own. optional: neither required nor provided.",
  },
  payment_schedule: {
    valueSchema: PAYMENT_SCHEDULE_VALUE_SCHEMA,
    description: "Deposit as stated, and when the balance is due if stated.",
  },
  cancellation: {
    valueSchema: CANCELLATION_VALUE_SCHEMA,
    description: "Cancellation/rescheduling policy, plus deposit refundability if stated.",
  },
  event_insurance: {
    valueSchema: enumSchema(INSURANCE_POLICIES),
    description: "required: couple/vendors must carry it. not_required: explicitly not needed. venue_covers: venue's own policy covers it.",
  },
  security: {
    valueSchema: enumSchema(SECURITY_POLICIES),
    description: "included: venue provides it. required_hire: couple must hire their own. not_required: no requirement stated.",
  },
  vendor_access: {
    valueSchema: VENDOR_ACCESS_VALUE_SCHEMA,
    description: "Vendor/couple setup and teardown access windows, as stated.",
  },
  noise_curfew: {
    valueSchema: { type: "string" },
    description: "End-of-music curfew, 24h HH:MM (e.g. '11pm' -> '23:00').",
  },
  sales_tax_pct: {
    valueSchema: { type: "number" },
    description: "Sales tax % the site itself states. Never a generic/assumed rate -- leave not_stated if unprinted.",
  },
  cc_fee_pct: {
    valueSchema: { type: "number" },
    description: "Credit-card surcharge %, only if stated separately from sales/service tax.",
  },
  taxes_included_in_rental: {
    valueSchema: { type: "boolean" },
    description: "True only if the site explicitly says quoted prices already include tax.",
  },
  vendor_list_policy: {
    valueSchema: enumSchema(VENDOR_LIST_POLICIES),
    description: "open: any vendor. preferred_list: suggested, not mandatory. required_list: some/all categories MUST come from the venue's list.",
  },
  pets_allowed: {
    valueSchema: { type: "boolean" },
    description: "Whether pets (e.g. the couple's dog) are explicitly allowed at the event.",
  },
  hvac: {
    valueSchema: { type: "boolean" },
    description: "Heating/air-conditioning explicitly mentioned as present.",
  },
  ada_accessible: {
    valueSchema: { type: "boolean" },
    description: "ADA/wheelchair accessibility explicitly stated.",
  },
  bridal_suite: {
    valueSchema: { type: "boolean" },
    description: "A dedicated bridal suite / getting-ready room is explicitly mentioned.",
  },
  tables_chairs_included: {
    valueSchema: { type: "boolean" },
    description: "Tables and chairs are included in the rental, as stated.",
  },
  linens_included: {
    valueSchema: { type: "boolean" },
    description: "Linens/table cloths are included in the rental, as stated.",
  },
  dance_floor_included: {
    valueSchema: { type: "boolean" },
    description: "A dance floor is included in the rental, as stated.",
  },
  coat_check: {
    valueSchema: enumSchema(COAT_CHECK),
    description: "included: part of rental. available_fee: exists but costs extra / is a hired add-on. none: not mentioned/offered.",
  },
  pricing_archetype: {
    valueSchema: enumSchema(PRICING_ARCHETYPES),
    description:
      "all_inclusive_per_guest: one all-in per-person price. rental_plus_fb_minimum: rental fee + separate F&B minimum. rental_plus_per_guest_packages: rental fee + named per-guest tiers. " +
      "raw_space_byo: bare space, BYO everything. hotel_package: bundles room block + event space + F&B. inquire_only: no pricing published. mixed: genuinely combines more than one.",
  },
  price_from_usd: {
    valueSchema: { type: "number" },
    description:
      "The lowest total starting price the site publishes for booking the venue at all (a flat rental fee, or the lowest all-inclusive per-guest price) -- never a hotel guest-room/nightly rate.",
  },
  per_guest_from_usd: {
    valueSchema: { type: "number" },
    description: "The lowest published per-guest price across packages/tiers, when pricing has a per-guest component.",
  },
  per_guest_to_usd: {
    valueSchema: { type: "number" },
    description: "The highest published per-guest price across packages/tiers, when pricing has a per-guest component.",
  },
};

const SPINE_PROPERTIES: Record<string, JsonSchema> = {};
for (const key of SPINE_KEYS) {
  const cfg = SPINE_FIELD_CONFIG[key];
  SPINE_PROPERTIES[key] = triFieldSchema(cfg.valueSchema, cfg.description);
}

const SPINE_SCHEMA = strictObject(SPINE_PROPERTIES, "Every comparison-spine field, tri-state. Never guess -- not_stated if unclear.");

// ---------------------------------------------------------------------------
// Spine detail-layer schemas
// ---------------------------------------------------------------------------

const ABOUT_SCHEMA = nullable(
  strictObject(
    { text: { type: "string", description: "<= 600 chars, no em dashes." }, source_url: { type: "string" } },
    "Short venue description, Sourced not quote-grounded: page must be in the crawl, every digit sequence must appear on it. Null if nothing usable."
  )
);

const DIFFERENTIATOR_SCHEMA = nullable(
  strictObject(
    {
      title: { type: "string" },
      tagline: nullable({ type: "string", description: "<= 40 chars, feeds the 5th quick-fact pill." }),
      groups: strictArray(strictObject({ heading: { type: "string" }, bullets: { type: "array", items: { type: "string" } } })),
      source_url: { type: "string" },
    },
    "ONLY when genuinely unique with real specifics. Most venues: null. Never from generic marketing adjectives."
  )
);

const SPACE_SCHEMA = strictObject(
  {
    id: { type: "string", description: "Stable slug -- the join key for this call and the pricing call." },
    name: { type: "string" },
    structure_label: nullable({ type: "string", description: "e.g. 'Ballroom', 'Loft'." }),
    sq_ft: nullable({ type: "number" }),
    sq_ft_label: nullable({ type: "string" }),
    sq_ft_outdoor: nullable({ type: "number" }),
    ceiling_ft: nullable({ type: "number" }),
    ceiling_label: nullable({ type: "string" }),
    setting: nullable(enumSchema(SETTINGS)),
    bookable_separately: { type: "boolean", description: "False if only bookable as part of a larger whole-venue booking." },
    description: nullable(strictObject({ text: { type: "string" }, quote: { type: "string" }, source_url: { type: "string" } }, "Only if verbatim-quotable.")),
    includes_summary: nullable({ type: "string" }),
    source_url: { type: "string" },
  },
  "Wedding/event rooms only (hotels: rooms under Weddings only). Same area on two pages = ONE space; never amalgamate unless priced as its own combo. " +
    "One undifferentiated space = one entry named after the venue."
);

const CAPACITY_SCHEMA = strictObject(
  {
    space_id: { type: "string", description: "A space.id from spaces[], or 'whole_venue'." },
    layout: enumSchema(LAYOUTS, "Match the venue's own labeled style -- never invent one."),
    min: nullable({ type: "number" }),
    max: { type: "number", description: "> 0. A range's high end -- never a sum across rooms." },
    as_stated_label: { type: "string", description: "The venue's own wording, e.g. 'Seated (w/ dance floor)'." },
    condition: nullable({ type: "string", description: "e.g. 'live band'/'DJ' -- a capacity constraint, not a fee." }),
    quote: { type: "string" },
    source_url: { type: "string" },
  },
  "One row per labeled capacity style per space. Never sum rooms. Ignore contact-form guest-count dropdowns."
);

const INCLUSION_SCHEMA = strictObject(
  {
    label: enumSchema(INCLUSION_LABELS, "Closest canonical label; 'other' only if nothing fits."),
    label_raw: { type: "string", description: "The venue's own wording, verbatim." },
    detail: nullable({ type: "string" }),
    category: enumSchema(INCLUSION_CATEGORIES),
    quote: { type: "string" },
    source_url: { type: "string" },
  },
  "Provisions the venue GIVES you (tables, linens, HVAC, ADA access) -- not permissions/policies (those live in the spine)."
);

const RESOURCE_SCHEMA = strictObject(
  {
    kind: enumSchema(RESOURCE_KINDS),
    label: { type: "string" },
    url: { type: "string", description: "From the ASSET CANDIDATES block or a PAGE header only -- never invented." },
    scope: { type: "string", description: "'venue' or 'space:<space_id>'." },
    source_url: { type: "string" },
  },
  "Cap 15. Prefer one consolidated wedding brochure over many thin resources."
);

const VENDOR_LIST_ENTRY_SCHEMA = strictObject({
  name: { type: "string" },
  url: nullable({ type: "string" }),
  instagram: nullable({ type: "string" }),
});

const VENDOR_LIST_SCHEMA = strictObject(
  {
    label: { type: "string" },
    category: { type: "string", description: "e.g. 'catering', 'florals'." },
    relationship: enumSchema(["preferred", "approved_required", "in_house_partner", "recommended"]),
    entries: strictArray(VENDOR_LIST_ENTRY_SCHEMA),
    source_url: { type: "string" },
  },
  ">= 2 real business names required, else omit the whole list."
);

const PRESS_FEATURE_SCHEMA = strictObject(
  {
    title: { type: "string" },
    attribution: { type: "string", description: "Outlet name, e.g. 'The Knot'." },
    url: { type: "string" },
    source_url: { type: "string" },
  },
  "A press mention / 'as featured in' credit."
);

const TOP_LEVEL_SCHEMAS = {
  about: ABOUT_SCHEMA,
  differentiator: DIFFERENTIATOR_SCHEMA,
  spaces: strictArray(SPACE_SCHEMA),
  capacities: strictArray(CAPACITY_SCHEMA),
  inclusions: strictArray(INCLUSION_SCHEMA),
  resources: strictArray(RESOURCE_SCHEMA),
  vendor_lists: strictArray(VENDOR_LIST_SCHEMA),
  press_features: strictArray(PRESS_FEATURE_SCHEMA),
} as const;

export const SPINE_TOOL = {
  name: "submit_venue_spine",
  description: "Submit the venue's comparison spine + detail layer extracted from the provided document.",
  parameters: strictObject({
    spine: SPINE_SCHEMA,
    about: TOP_LEVEL_SCHEMAS.about,
    differentiator: TOP_LEVEL_SCHEMAS.differentiator,
    spaces: TOP_LEVEL_SCHEMAS.spaces,
    capacities: TOP_LEVEL_SCHEMAS.capacities,
    inclusions: TOP_LEVEL_SCHEMAS.inclusions,
    resources: TOP_LEVEL_SCHEMAS.resources,
    vendor_lists: TOP_LEVEL_SCHEMAS.vendor_lists,
    press_features: TOP_LEVEL_SCHEMAS.press_features,
    notes: nullable({ type: "string" }),
  }),
};

// ---------------------------------------------------------------------------
// Pricing tool schemas
// ---------------------------------------------------------------------------

const FIXED_FEE_SCHEMA = strictObject({
  applies_to: enumSchema(["space", "whole_venue", "ceremony", "other"]),
  space_id: nullable({ type: "string" }),
  day: nullable(
    enumSchema(DAYS, "weekday = Mon-Thu. A Friday/Sunday shared price is TWO explicit rows (day='fri' and day='sun'), never a single 'weekday' row stretched to cover them.")
  ),
  season: nullable(enumSchema(SEASONS)),
  amount: { type: "number" },
  unit: enumSchema(["flat", "per_hour"]),
  label: { type: "string" },
  includes: { type: "array", items: { type: "string" } },
  key: { type: "string", description: "Stable slug for this fee, unique within its path -- used for diffing/corrections, never an array index." },
  quote: { type: "string" },
  source_url: { type: "string" },
});

const PER_GUEST_TIER_SCHEMA = strictObject({
  id: { type: "string", description: "Stable slug, unique within the path." },
  name: { type: "string" },
  per_guest: { type: "number" },
  day: nullable(enumSchema(DAYS)),
  season: nullable(enumSchema(SEASONS)),
  inherits_from: nullable({ type: "string", description: "Another tier's id in this SAME path when the site says e.g. 'Everything in Argento, plus...' -- names that tier's id." }),
  inclusions: { type: "array", items: { type: "string" } },
  bar_tier: nullable(strictObject({ name: { type: "string" }, hours: nullable({ type: "number" }), examples: { type: "array", items: { type: "string" } } })),
  min_guests: nullable({ type: "number" }),
  quote: { type: "string" },
  source_url: { type: "string" },
});

const MINIMUM_SCHEMA = strictObject({
  kind: enumSchema(["fb_minimum", "guest_minimum"]),
  day: nullable(enumSchema(DAYS)),
  season: nullable(enumSchema(SEASONS)),
  amount: { type: "number" },
  quote: { type: "string" },
  source_url: { type: "string" },
});

const REQUIRED_STAFFING_SCHEMA = nullable(
  strictObject({
    price_per_role: { type: "number" },
    bartender_per_guests: { type: "number" },
    other_roles: { type: "array", items: { type: "string" } },
    quote: { type: "string" },
    source_url: { type: "string" },
  })
);

const YEAR_SURCHARGE_SCHEMA = strictObject({
  year: { type: "number" },
  amount: { type: "number" },
  unit: enumSchema(["per_guest", "flat"]),
});

const PROMOTION_SCHEMA = strictObject(
  { name: { type: "string" }, detail: { type: "string" }, condition: nullable({ type: "string" }) },
  "Display-only -- never applied automatically by the calculator."
);

const PATH_SCHEMA = strictObject(
  {
    id: { type: "string", description: "Stable slug; you assign this (the assembler does not renumber it)." },
    name: { type: "string" },
    description: nullable({ type: "string" }),
    applies_to_spaces: strOrAllOrNull("A list of space ids this path applies to, or 'all'."),
    fixed_fees: strictArray(FIXED_FEE_SCHEMA),
    per_guest_tiers: strictArray(PER_GUEST_TIER_SCHEMA),
    minimums: strictArray(MINIMUM_SCHEMA),
    required_staffing: REQUIRED_STAFFING_SCHEMA,
    rental_hours: nullable({ type: "number" }),
    year_surcharges: strictArray(YEAR_SURCHARGE_SCHEMA),
    promotions: strictArray(PROMOTION_SCHEMA),
    includes: strictArray({ type: "string" }, "What the base rental of THIS path bundles, verbatim short items -- distinct from a space's own includes_summary. Empty array if not stated."),
    quote: { type: "string" },
    source_url: { type: "string" },
  },
  "One row per distinct pricing structure/track the venue actually offers (e.g. separate named tracks with entirely different fee shapes) -- most venues have exactly one."
);

const RATES_SCHEMA = strictObject(
  {
    service_charge_pct: nullable({ type: "number" }),
    service_charge_base: nullable(enumSchema(["fb", "all"])),
    sales_tax_pct: nullable({ type: "number" }),
    sales_tax_base: nullable(enumSchema(["fb_and_rentals", "all", "included"])),
    taxes_included_in_rental: nullable({ type: "boolean" }),
    cc_fee_pct: nullable({ type: "number" }),
    quote: nullable({ type: "string" }),
    source_url: nullable({ type: "string" }),
  },
  "Only rates the site itself prints -- NEVER Chicago's default sales tax rate. Leave fields null when the site doesn't say."
);

const ADD_ON_SCHEMA = strictObject(
  {
    id: { type: "string" },
    name: { type: "string" },
    category: { type: "string" },
    variant: nullable({ type: "string", description: "e.g. '7 swags' vs '13 swags' are two variants of the same category, each its own add-on row." }),
    group: enumSchema(["fb", "rental", "service", "ceremony", "other"]),
    price: nullable({ type: "number" }),
    price_max: nullable({ type: "number" }),
    unit: enumSchema(["flat", "per_guest", "per_unit", "per_hour"]),
    per_space_prices: nullable({ type: "object", description: "space_id -> price, when this add-on's price varies by space.", additionalProperties: { type: "number" } }),
    applies_to: strOrAllOrNull("Space ids this add-on applies to, 'all', or null."),
    path_ids: nullable({ type: "array", items: { type: "string" }, description: "Which pricing path(s) this add-on is relevant to; null = relevant regardless of path." }),
    condition: nullable({ type: "string", description: "e.g. 'ceremony_on_site' -- names the trigger for a conditional fee." }),
    priceable: { type: "boolean", description: "False when no number is published at all -- pair with as_stated_price, never fabricate a number." },
    tax_pct_override: nullable({
      type: "number",
      description: "Only when the venue's own page breaks this add-on's tax out as its own separately-computed line, even if numerically equal to the general sales tax.",
    }),
    min_guests: nullable({ type: "number" }),
    as_stated_price: nullable({ type: "string", description: "The venue's own price wording when priceable=false or the number is qualitative." }),
    note: nullable({ type: "string" }),
    selection_group: nullable({
      type: "string",
      description: "Set the same short slug on items a couple picks ONE of (e.g. food package tiers, bar tiers, dinnerware, extra hour); null for independent extras.",
    }),
    quote: { type: "string" },
    source_url: { type: "string" },
  },
  "Purchasable extras only -- never insurance, never the credit-card surcharge (that's rates.cc_fee_pct)."
);

const ADD_ON_CATEGORY_SCHEMA = strictObject(
  {
    category: { type: "string", description: "Must match the `category` on at least one add_ons[] entry." },
    blurb: nullable({ type: "string", description: "The category's own intro sentence, verbatim or close to it." }),
    examples: { type: "array", items: { type: "string" }, description: "Example items the venue calls out under this category, verbatim short items." },
    source_url: { type: "string" },
  },
  "The venue's own grouping of purchasable extras with its intro sentence and example items -- only when the site presents add-ons by category. Omit entirely when it doesn't."
);

const SEASONS_SCHEMA = nullable(
  strictObject(
    {
      peak: nullable({ type: "string", description: "The venue's own definition of peak-season months, verbatim (e.g. 'Apr-Oct, Dec')." }),
      off: nullable({ type: "string", description: "The venue's own definition of off-season months, verbatim (e.g. 'Jan, Feb, Mar, Nov')." }),
      source_url: { type: "string" },
    },
    "The venue's own peak/off-season month definitions, verbatim. Null when not stated -- never inferred."
  )
);

const FB_PILL_SCHEMA = strictObject({ value: enumSchema(FB_PILLS), quote: { type: "string" }, source_url: { type: "string" } });

const MENU_SCHEMA = strictObject({
  name: { type: "string" },
  cuisine: nullable({ type: "string" }),
  includes: { type: "string" },
  cost: { type: "string" },
  extras: strictArray(strictObject({ label: { type: "string" }, value: { type: "string" } })),
  source_url: { type: "string" },
});

const BAR_LADDER_SCHEMA = strictObject({
  name: { type: "string" },
  includes: { type: "string" },
  prices: { type: "object", description: "label (e.g. '4hr', '5hr') -> price.", additionalProperties: { type: "number" } },
  note: nullable({ type: "string" }),
  source_url: { type: "string" },
});

const FOOD_BEVERAGE_SCHEMA = strictObject({
  food_pills: strictArray(
    FB_PILL_SCHEMA,
    "Check for all of byo / a_la_carte / all_inclusive against the FAQ + packages -- include EVERY one that is genuinely true (additive, not exclusive)."
  ),
  bar_pills: strictArray(FB_PILL_SCHEMA),
  caption: nullable(
    strictObject({ value: { type: "string" }, quote: { type: "string" }, source_url: { type: "string" } }, "A narrow exception caption, e.g. a corkage carve-out.")
  ),
  menus: strictArray(MENU_SCHEMA),
  bar_ladders: strictArray(BAR_LADDER_SCHEMA),
  bar_min_guests: nullable({ type: "number" }),
  notes: strictArray(strictObject({ value: { type: "string" }, quote: { type: "string" }, source_url: { type: "string" } })),
});

const REQUIRED_THIRD_PARTY_SCHEMA = strictObject({
  name: { type: "string" },
  estimate_usd: nullable({ type: "number" }),
  required: { type: "boolean" },
  quote: { type: "string" },
  source_url: { type: "string" },
});

const FAQ_SCHEMA = strictObject(
  { question: { type: "string" }, answer: { type: "string", description: "Verbatim -- the answer text IS the quote." }, source_url: { type: "string" } },
  "The venue's OWN wedding/event Q&A, deduped. EXCLUDE hotel-guest FAQs: check-in/out, guest-room parking rates, loyalty points, gift cards, wifi price, fitness/pool hours -- those describe lodging, not this venue's event product."
);

const PRICING_SUB_SCHEMAS = {
  archetype: nullable(enumSchema(PRICING_ARCHETYPES)),
  paths: strictArray(PATH_SCHEMA),
  rates: RATES_SCHEMA,
  add_ons: strictArray(ADD_ON_SCHEMA),
  add_on_categories: strictArray(ADD_ON_CATEGORY_SCHEMA),
  food_beverage: FOOD_BEVERAGE_SCHEMA,
  required_third_party: strictArray(REQUIRED_THIRD_PARTY_SCHEMA),
  seasons: SEASONS_SCHEMA,
} as const;

/** Declared once, before PRICING_TOOL, so both PRICING_TOOL.parameters.faqs and
 * buildRepairTool's top-level root map ("faqs") reference the identical schema object. */
const FAQS_SCHEMA = strictArray(FAQ_SCHEMA);

export const PRICING_TOOL = {
  name: "submit_venue_pricing",
  description: "Submit the venue's normalized cost model extracted from the provided document, using the spine summary's space ids.",
  parameters: strictObject({
    archetype: PRICING_SUB_SCHEMAS.archetype,
    paths: PRICING_SUB_SCHEMAS.paths,
    rates: PRICING_SUB_SCHEMAS.rates,
    add_ons: PRICING_SUB_SCHEMAS.add_ons,
    add_on_categories: PRICING_SUB_SCHEMAS.add_on_categories,
    food_beverage: PRICING_SUB_SCHEMAS.food_beverage,
    required_third_party: PRICING_SUB_SCHEMAS.required_third_party,
    faqs: FAQS_SCHEMA,
    seasons: PRICING_SUB_SCHEMAS.seasons,
    notes: nullable({ type: "string" }),
  }),
};

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT_SPINE = `You extract a wedding venue's comparison SPINE and detail layer from its own website text for a wedding-planning product.

Use ONLY the provided document. Each section starts with "--- PAGE: <url> ---". A trailing "--- ASSET CANDIDATES ---" block (if present) lists real PDF/asset URLs you may cite in resources[] -- never invent a URL that isn't in that block or in a PAGE header.

RULES THAT APPLY EVERYWHERE:
- Never guess. If a field is not clearly stated, its spine status is not_stated. Unknown beats wrong.
- Every stated value MUST carry a verbatim quote and the source_url it came from. The quote must actually appear on that page.
- When two of the venue's OWN documents genuinely disagree on the same fact, use status=conflicting and give a candidate (value+quote+source_url) for EACH disagreeing value -- do not silently pick one.
- Prefer wedding/private-event pages over hotel lodging/guest-room pages. Prefer WEDDING figures over gala/corporate figures when both exist.
- A corkage fee mentioned ANYWHERE on the site means bar = byo_with_corkage, even if the main bar page doesn't say so.
- A "production fee" or "facility fee" stated as a percentage is the venue's service charge under a different name -- never treat it as separate from service_charge_pct.
- Capacity: one row per labeled style per space in capacities[] (never invented, never summed across rooms). Ignore contact-form guest-count dropdowns entirely.
- Spaces: wedding/event rooms only. Hotels: only rooms listed under Weddings. Never amalgamate two named rooms into one space unless the site itself sells that combination as its own product. The same physical area described on two different pages is ONE space. A venue with exactly one undifferentiated space gets exactly one space entry, named after the venue.
- differentiator is null for most venues -- only fill it when the site demonstrates something genuinely unique with real specifics, never from generic marketing adjectives ("stunning", "unforgettable").
- about is Sourced (not quote-grounded): keep it under 600 chars, no em dashes, and never state a number that doesn't appear somewhere in the crawled pages.
- resources[] URLs must come from the ASSET CANDIDATES block or a PAGE header -- cap at 15; a single consolidated wedding brochure beats many thin resources.
- vendor_lists[] needs >= 2 real business names or should be omitted entirely.
- spaces[].sq_ft_label/ceiling_label: only set when the site states size as a range or approximate string rather than a plain number; sq_ft/ceiling_ft still carry the first integer found in it.

Work only from the text given. Temperature is 0 -- be decisive, but genuinely prefer not_stated over a confident guess when the document gives you nothing solid.`;

export const SYSTEM_PROMPT_PRICING = `You extract a wedding venue's normalized COST MODEL from its own website text, using the SPINE SUMMARY (space ids + names + archetype hint) given at the top of the user message so your paths/fees/add-ons reference the SAME space ids the spine call used.

Use ONLY the provided document, same PAGE / ASSET CANDIDATES format as the spine call.

RULES:
- Never guess. not_stated (a null/empty field) beats a fabricated number.
- Every stated number MUST carry a verbatim quote and source_url; the quote must actually contain the number, not just describe it.
- NEVER report a hotel guest-room/nightly rate as venue pricing (reject "$163/night", "rooms from $289", ADR language entirely) -- only event/rental pricing belongs here.
- A Friday/Sunday shared price is TWO explicit rows (day='fri' and day='sun'), never a single day='weekday' row stretched to cover them; weekday itself means Mon-Thu only.
- fixed_fees / per_guest_tiers: one row per day x season x package combination the site actually prices -- never sum rooms into a whole-venue total.
- inherits_from on a per-guest tier names another tier's id in the SAME path when the site says "Everything in <Tier>, plus..." -- never re-list the inherited items yourself.
- rates: only rates the site itself prints. Leave sales_tax_pct null when the site doesn't state one (a downstream step applies Chicago's default and marks it as an assumption -- you never do that here).
- add_ons: purchasable extras only -- never insurance, never the credit-card processing surcharge (that's rates.cc_fee_pct). No published number means priceable=false with as_stated_price capturing whatever the site DOES say (or null). A conditional fee names its trigger in condition. "7 swags" vs "13 swags" are two separate add-on rows via variant, each with its own price.
- tax_pct_override is set ONLY when the venue's own page breaks that specific add-on's tax out as its own separately-computed line, even if the percentage happens to match the general sales tax.
- food_beverage: research food_pills/bar_pills against BOTH the FAQ and the packages -- check for byo / a_la_carte / all_inclusive and include EVERY one that is genuinely true (they are additive, not exclusive).
- faqs: the venue's OWN wedding/event Q&A, verbatim (the answer text IS the quote), deduped. EXCLUDE hotel-guest FAQs entirely: check-in/out, guest-room parking rates, loyalty points, gift cards, wifi price, fitness/pool hours, breakfast times -- those describe lodging, not this venue's event product.
- paths[].includes lists what the base rental of THAT path bundles, verbatim short items -- leave it empty when the site doesn't state path-wide inclusions.
- add_on_categories is filled ONLY when the site presents add-ons by category (its own intro sentence + example items); most venues: empty array. Every category named here must also appear on at least one add_ons[] entry.
- seasons is the venue's own verbatim peak/off-season month definitions, only when pricing actually varies by season -- null/empty when not stated, never inferred from typical wedding-industry seasonality.
- add_ons[].selection_group: set the same short slug on items a couple picks ONE of (food package tiers, bar tiers, dinnerware, an extra hour) so they render as one choice group; leave null for independent extras.

Temperature is 0 -- be decisive, but genuinely prefer leaving a field not stated / null over inventing a plausible-sounding number.`;

// ---------------------------------------------------------------------------
// buildDocument -- deterministic page assembly
// ---------------------------------------------------------------------------

export interface DocPage {
  url: string;
  text: string;
  score: number;
  kind: "html" | "pdf";
}

export interface AssetCandidate {
  url: string;
  anchorText: string;
}

export interface BuiltDocument {
  text: string;
  pagesUsed: string[];
  charsUsed: number;
}

function formatPage(p: DocPage): string {
  return `--- PAGE: ${p.url} ---\n${p.text}`;
}

const PAGE_SEPARATOR = "\n\n";

/** Order by score desc then URL asc; truncate at page boundaries, dropping the lowest-score page
 * first, never cutting a page's text mid-stream unless exactly one page remains and it alone
 * exceeds maxChars. Deterministic and stable under input reordering (the explicit sort is the
 * only thing that determines order). */
export function buildDocument(pages: DocPage[], maxChars: number, assetCandidates: AssetCandidate[] = []): BuiltDocument {
  const sorted = [...pages].sort((a, b) => (b.score !== a.score ? b.score - a.score : a.url.localeCompare(b.url)));
  const kept = [...sorted];

  const totalLen = (list: DocPage[]) => list.map(formatPage).join(PAGE_SEPARATOR).length;

  while (kept.length > 1 && totalLen(kept) > maxChars) {
    let dropIdx = 0;
    for (let i = 1; i < kept.length; i++) {
      const cur = kept[i];
      const worst = kept[dropIdx];
      if (cur.score < worst.score || (cur.score === worst.score && cur.url > worst.url)) dropIdx = i;
    }
    kept.splice(dropIdx, 1);
  }

  let body = kept.map(formatPage).join(PAGE_SEPARATOR);
  if (body.length > maxChars && kept.length === 1) {
    const header = `--- PAGE: ${kept[0].url} ---\n`;
    const budget = Math.max(0, maxChars - header.length);
    body = `${header}${kept[0].text.slice(0, budget)}`;
  }

  let full = body;
  if (assetCandidates.length > 0) {
    const block = `\n\n--- ASSET CANDIDATES ---\n${assetCandidates.map((c) => `${c.url} :: ${c.anchorText || "(no anchor text)"}`).join("\n")}`;
    full += block;
  }

  return { text: full, pagesUsed: kept.map((p) => p.url), charsUsed: full.length };
}

// ---------------------------------------------------------------------------
// User messages
// ---------------------------------------------------------------------------

export interface SpineUserMessageCtx {
  name: string;
  websiteUrl: string | null;
  documentText: string;
}

export function buildSpineUserMessage(ctx: SpineUserMessageCtx): string {
  return `VENUE: ${ctx.name}\nWEBSITE: ${ctx.websiteUrl ?? "(unknown)"}\n\n${ctx.documentText}`;
}

export interface SpineSummarySpace {
  id: string;
  name: string;
}

export interface PricingSpineSummary {
  spaces: SpineSummarySpace[];
  archetypeHint: string | null;
}

export function buildPricingUserMessage(ctx: SpineUserMessageCtx, spineSummary: PricingSpineSummary): string {
  const spacesLine = spineSummary.spaces.length ? spineSummary.spaces.map((s) => `${s.id} = "${s.name}"`).join("; ") : "(no spaces identified)";
  const header =
    `SPINE SUMMARY (use these exact space ids in fixed_fees.space_id / per_space_prices)\n` +
    `Spaces: ${spacesLine}\nPricing archetype hint (from the spine call, not authoritative): ${spineSummary.archetypeHint ?? "(none)"}\n\n`;
  return `${header}VENUE: ${ctx.name}\nWEBSITE: ${ctx.websiteUrl ?? "(unknown)"}\n\n${ctx.documentText}`;
}

// ---------------------------------------------------------------------------
// buildRepairTool / buildRepairUserMessage
// ---------------------------------------------------------------------------

const TOP_LEVEL_ROOT_KEYS = [...Object.keys(TOP_LEVEL_SCHEMAS), "faqs"] as const;
const TOP_LEVEL_ROOTS = new Set<string>(TOP_LEVEL_ROOT_KEYS);
const PRICING_SUB_ROOTS = new Set<string>(Object.keys(PRICING_SUB_SCHEMAS));

function topLevelSchema(root: string): JsonSchema {
  if (root === "faqs") return FAQS_SCHEMA;
  return (TOP_LEVEL_SCHEMAS as Record<string, JsonSchema>)[root];
}

function pricingSubSchema(sub: string): JsonSchema {
  return (PRICING_SUB_SCHEMAS as Record<string, JsonSchema>)[sub];
}

/** A valid subset tool schema containing only the named field-path roots (spine key,
 * `/pricing/add_ons`, `/capacities`, etc.) -- field-path isolation: the merge only ever applies
 * the listed paths, so the repair tool itself only ever *asks* for those paths. Throws on an
 * unrecognized root so a typo'd correction field_path fails loudly instead of silently widening
 * what a repair call can touch. */
export function buildRepairTool(fieldPaths: string[]): { name: string; description: string; parameters: JsonSchema } {
  if (fieldPaths.length === 0) throw new Error("buildRepairTool: fieldPaths must be non-empty");

  const spineKeys = new Set<string>();
  const pricingSubs = new Set<string>();
  const topLevel = new Set<string>();

  for (const fp of fieldPaths) {
    const segments = fp.split("/").filter(Boolean);
    const root = segments[0];
    if (root === "spine") {
      const key = segments[1];
      if (!key || !(SPINE_KEYS as readonly string[]).includes(key)) {
        throw new Error(`buildRepairTool: unknown field_path "${fp}" (no such spine key "${key ?? ""}")`);
      }
      spineKeys.add(key);
    } else if (root === "pricing") {
      const sub = segments[1];
      if (!sub || !PRICING_SUB_ROOTS.has(sub)) {
        throw new Error(`buildRepairTool: unknown field_path "${fp}" (no such pricing field "${sub ?? ""}")`);
      }
      pricingSubs.add(sub);
    } else if (TOP_LEVEL_ROOTS.has(root)) {
      topLevel.add(root);
    } else {
      throw new Error(`buildRepairTool: unknown field_path root "${root}" in "${fp}"`);
    }
  }

  const properties: Record<string, JsonSchema> = {};
  if (spineKeys.size > 0) {
    const spineProps: Record<string, JsonSchema> = {};
    for (const key of spineKeys) spineProps[key] = SPINE_PROPERTIES[key];
    properties.spine = strictObject(spineProps, "Only the listed spine fields -- resubmit exactly these.");
  }
  if (pricingSubs.size > 0) {
    const pricingProps: Record<string, JsonSchema> = {};
    for (const sub of pricingSubs) pricingProps[sub] = pricingSubSchema(sub);
    properties.pricing = strictObject(pricingProps, "Only the listed pricing fields -- resubmit exactly these.");
  }
  for (const root of topLevel) {
    properties[root] = topLevelSchema(root);
  }

  return {
    name: "submit_venue_repairs",
    description:
      "Resubmit ONLY the fields named in this schema's properties. Any other key you include is dropped by the merge (field-path isolation) -- not_stated/conflicting are acceptable answers when the evidence still doesn't support a value.",
    parameters: strictObject(properties),
  };
}

export function buildRepairUserMessage(items: Repair[], excerpts: { url: string; text: string }[]): string {
  const lines: string[] = [];
  lines.push("REPAIR REQUEST -- resubmit ONLY the fields listed below via the tool. Any other key you include is ignored.");
  lines.push("");
  for (const item of items) {
    lines.push(`- field_path: ${item.field_path}`);
    lines.push(`  issue: ${item.issue_code}${item.tier ? ` (${item.tier})` : ""}`);
    lines.push(`  instruction: ${item.instruction}`);
    lines.push("");
  }
  lines.push("EXCERPTS (page slices around the relevant keywords -- the number you need may sit in a table cell, not the label's own sentence):");
  for (const ex of excerpts) {
    lines.push(`\n--- PAGE: ${ex.url} ---\n${ex.text}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// validateShape -- enum-violation retry instruction
// ---------------------------------------------------------------------------

function enumOf(schema: JsonSchema): readonly string[] | null {
  return Array.isArray(schema.enum) ? (schema.enum as string[]) : null;
}

/** Names every out-of-enum value found in a raw tool-call reply, in the shape
 * `"<path>: "<bad value>" is not one of [a, b, c]"` -- fed back to the model as the enum-retry
 * instruction (`extractVenueDetails.ts`'s callExtractWithRetry, same pattern as
 * `../classify/runExtract.ts`'s BAD_VERDICT_RETRY_INSTRUCTION). Duck-types spine vs. pricing
 * shape by which top-level keys are present so one function covers both tool replies. */
export function validateShape(raw: unknown): string[] {
  const violations: string[] = [];
  if (raw == null || typeof raw !== "object") return violations;
  const obj = raw as Record<string, unknown>;

  const checkEnum = (path: string, value: unknown, allowed: readonly string[]) => {
    if (value == null) return;
    if (typeof value !== "string" || !allowed.includes(value)) {
      violations.push(`${path}: "${String(value)}" is not one of [${allowed.join(", ")}]`);
    }
  };

  if (obj.spine && typeof obj.spine === "object") {
    const spine = obj.spine as Record<string, unknown>;
    for (const key of SPINE_KEYS) {
      const field = spine[key] as Record<string, unknown> | undefined;
      if (!field) continue;
      checkEnum(`spine.${key}.status`, field.status, ["stated", "not_stated", "conflicting"]);
      const enumValues = enumOf(SPINE_FIELD_CONFIG[key].valueSchema);
      if (enumValues) {
        if (field.value != null) checkEnum(`spine.${key}.value`, field.value, enumValues);
        const candidates = Array.isArray(field.candidates) ? field.candidates : [];
        candidates.forEach((c, i) => {
          const cand = c as Record<string, unknown>;
          if (cand?.value != null) checkEnum(`spine.${key}.candidates[${i}].value`, cand.value, enumValues);
        });
      }
    }
    const capacities = Array.isArray(obj.capacities) ? obj.capacities : [];
    capacities.forEach((c, i) => checkEnum(`capacities[${i}].layout`, (c as Record<string, unknown>)?.layout, LAYOUTS));
    const resources = Array.isArray(obj.resources) ? obj.resources : [];
    resources.forEach((r, i) => checkEnum(`resources[${i}].kind`, (r as Record<string, unknown>)?.kind, RESOURCE_KINDS));
    const inclusions = Array.isArray(obj.inclusions) ? obj.inclusions : [];
    inclusions.forEach((inc, i) => {
      const rec = inc as Record<string, unknown>;
      checkEnum(`inclusions[${i}].label`, rec?.label, INCLUSION_LABELS);
      checkEnum(`inclusions[${i}].category`, rec?.category, INCLUSION_CATEGORIES);
    });
  }

  const looksLikePricing = "rates" in obj || "add_ons" in obj || "paths" in obj || "food_beverage" in obj;
  if (looksLikePricing) {
    checkEnum("archetype", obj.archetype, PRICING_ARCHETYPES);
    const rates = obj.rates as Record<string, unknown> | undefined;
    if (rates) {
      checkEnum("rates.service_charge_base", rates.service_charge_base, ["fb", "all"]);
      checkEnum("rates.sales_tax_base", rates.sales_tax_base, ["fb_and_rentals", "all", "included"]);
    }
    const paths = Array.isArray(obj.paths) ? obj.paths : [];
    paths.forEach((p, i) => {
      const path = p as Record<string, unknown>;
      const fixedFees = Array.isArray(path.fixed_fees) ? path.fixed_fees : [];
      fixedFees.forEach((f, j) => {
        const fee = f as Record<string, unknown>;
        checkEnum(`paths[${i}].fixed_fees[${j}].day`, fee.day, DAYS);
        checkEnum(`paths[${i}].fixed_fees[${j}].season`, fee.season, SEASONS);
        checkEnum(`paths[${i}].fixed_fees[${j}].unit`, fee.unit, ["flat", "per_hour"]);
        checkEnum(`paths[${i}].fixed_fees[${j}].applies_to`, fee.applies_to, ["space", "whole_venue", "ceremony", "other"]);
      });
      const tiers = Array.isArray(path.per_guest_tiers) ? path.per_guest_tiers : [];
      tiers.forEach((t, j) => {
        const tier = t as Record<string, unknown>;
        checkEnum(`paths[${i}].per_guest_tiers[${j}].day`, tier.day, DAYS);
        checkEnum(`paths[${i}].per_guest_tiers[${j}].season`, tier.season, SEASONS);
      });
      const minimums = Array.isArray(path.minimums) ? path.minimums : [];
      minimums.forEach((m, j) => {
        const min = m as Record<string, unknown>;
        checkEnum(`paths[${i}].minimums[${j}].kind`, min.kind, ["fb_minimum", "guest_minimum"]);
        checkEnum(`paths[${i}].minimums[${j}].day`, min.day, DAYS);
        checkEnum(`paths[${i}].minimums[${j}].season`, min.season, SEASONS);
      });
    });
    const addOns = Array.isArray(obj.add_ons) ? obj.add_ons : [];
    addOns.forEach((a, i) => {
      const addOn = a as Record<string, unknown>;
      checkEnum(`add_ons[${i}].unit`, addOn.unit, ["flat", "per_guest", "per_unit", "per_hour"]);
      checkEnum(`add_ons[${i}].group`, addOn.group, ["fb", "rental", "service", "ceremony", "other"]);
    });
    const fb = obj.food_beverage as Record<string, unknown> | undefined;
    if (fb) {
      const foodPills = Array.isArray(fb.food_pills) ? fb.food_pills : [];
      foodPills.forEach((p, i) => checkEnum(`food_beverage.food_pills[${i}].value`, (p as Record<string, unknown>)?.value, FB_PILLS));
      const barPills = Array.isArray(fb.bar_pills) ? fb.bar_pills : [];
      barPills.forEach((p, i) => checkEnum(`food_beverage.bar_pills[${i}].value`, (p as Record<string, unknown>)?.value, FB_PILLS));
    }
  }

  return violations;
}

// Re-exported for tests / callers that want the raw per-key config (e.g. a schema-size probe per
// field) without reaching into module-private state.
export const __TEST_ONLY__ = { SPINE_FIELD_CONFIG, SPINE_PROPERTIES, TOP_LEVEL_SCHEMAS, PRICING_SUB_SCHEMAS, FAQS_SCHEMA };

export type { VenueSpine };
