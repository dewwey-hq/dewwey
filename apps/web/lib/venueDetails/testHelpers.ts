/**
 * Test-only helpers for building small, hand-made `VenueDetailsV3` fixtures. Not a test file
 * itself (vitest only picks up `*.test.ts`), imported by every test in this directory so each one
 * doesn't have to redeclare a 38-field empty spine.
 */

import { type Fact, NOT_STATED, type Rates, VENUE_DETAILS_SCHEMA_VERSION, type VenueDetailsV3, type VenueSpine } from "./types";

export function emptySpine(): VenueSpine {
  return {
    venue_kind: NOT_STATED,
    setting: NOT_STATED,
    one_event_per_day: NOT_STATED,
    space_count_bookable: NOT_STATED,
    capacity_min_guests: NOT_STATED,
    ceremony_on_site: NOT_STATED,
    ceremony_fee: NOT_STATED,
    rental_hours_included: NOT_STATED,
    weekday_events: NOT_STATED,
    catering: NOT_STATED,
    bar: NOT_STATED,
    rental_charge_type: NOT_STATED,
    fb_minimum: NOT_STATED,
    service_charge_pct: NOT_STATED,
    parking: NOT_STATED,
    day_of_coordinator: NOT_STATED,
    payment_schedule: NOT_STATED,
    cancellation: NOT_STATED,
    event_insurance: NOT_STATED,
    security: NOT_STATED,
    vendor_access: NOT_STATED,
    noise_curfew: NOT_STATED,
    sales_tax_pct: NOT_STATED,
    cc_fee_pct: NOT_STATED,
    taxes_included_in_rental: NOT_STATED,
    vendor_list_policy: NOT_STATED,
    pets_allowed: NOT_STATED,
    hvac: NOT_STATED,
    ada_accessible: NOT_STATED,
    bridal_suite: NOT_STATED,
    tables_chairs_included: NOT_STATED,
    linens_included: NOT_STATED,
    dance_floor_included: NOT_STATED,
    coat_check: NOT_STATED,
    pricing_archetype: NOT_STATED,
    price_from_usd: NOT_STATED,
    per_guest_from_usd: NOT_STATED,
    per_guest_to_usd: NOT_STATED,
  };
}

export function spineWith(overrides: Partial<VenueSpine>): VenueSpine {
  return { ...emptySpine(), ...overrides };
}

export function emptyRates(overrides: Partial<Rates> = {}): Rates {
  return {
    service_charge_pct: null,
    service_charge_base: null,
    sales_tax_pct: null,
    sales_tax_base: null,
    sales_tax_source: "unknown",
    cc_fee_pct: null,
    quote: null,
    source_url: null,
    snapshot_id: null,
    ...overrides,
  };
}

export function fact<T>(value: T, quote = "quote", source_url = "https://example.com", snapshot_id: number | null = 1): Fact<T> & { status: "stated" } {
  return { status: "stated", value, quote, source_url, snapshot_id };
}

export function makeVenue(overrides: Partial<VenueDetailsV3> = {}): VenueDetailsV3 {
  return {
    schema_version: VENUE_DETAILS_SCHEMA_VERSION,
    account_id: 1,
    name: "Test Venue",
    website_url: "https://example.com",
    spine: emptySpine(),
    about: null,
    differentiator: null,
    spaces: [],
    capacities: [],
    pricing: { archetype: null, paths: [], rates: emptyRates(), add_ons: [], required_third_party: [], notes: [] },
    food_beverage: { food_pills: [], bar_pills: [], caption: null, menus: [], bar_ladders: [], bar_min_guests: null, notes: [] },
    inclusions: [],
    faqs: [],
    resources: [],
    vendor_lists: [],
    press_features: [],
    sources: { snapshot_ids: [], pages: [], crawled_at: null },
    extraction: null,
    provenance: null,
    ...overrides,
  };
}
