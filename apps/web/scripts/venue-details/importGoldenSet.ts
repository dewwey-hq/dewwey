#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/no-explicit-any -- one-off importer over six hand-typed
   concept objects (`typeof marchetti` etc.) whose loose literal shapes are the input, not a
   contract; the OUTPUT is validated against VenueDetailsV3 by golden.test.ts. */
/**
 * Converts the six hand-built `/concept` golden venues into `VenueDetailsV3` JSON fixtures
 * (plan `hello-alright-want-to-quizzical-sparrow.md`, "Golden fixtures" / Phase 1a). Bespoke
 * per-venue adapter functions, on top of a couple of tiny shared helpers — this runs once, by
 * hand, and is hand-checked against the concept pages afterward, not a generic extractor.
 *
 * Sourcing note: none of the six `/concept/*\/data.ts` modules import React (they're plain
 * exported objects), so they're imported directly below — no dynamic import / object-copy
 * isolation was needed.
 *
 * Usage (from apps/web):
 *   bun run scripts/venue-details/importGoldenSet.ts               # writes all six fixtures
 *   bun run scripts/venue-details/importGoldenSet.ts --slug geraghty
 *   bun run scripts/venue-details/importGoldenSet.ts --out-dir scripts/venue-details/golden
 *   bun run scripts/venue-details/importGoldenSet.ts --check       # re-derive + diff, no writes
 *
 * No DB access — pure transform of the concept modules into JSON.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  NOT_STATED,
  VENUE_DETAILS_SCHEMA_VERSION,
  stated,
  type AddOn,
  type CapacityTuple,
  type Fact,
  type FixedFee,
  type PerGuestTier,
  type Pricing,
  type PricingPath,
  type Resource,
  type VenueDetailsV3,
  type VenueSpine,
} from "../../lib/venueDetails/types";
import { GOLDEN_ACCOUNT_IDS, type GoldenSlug } from "../../lib/venueDetails/golden";

import { marchetti } from "../../app/concept/galleria-marchetti-v4/data";
import { greenhouseLoft } from "../../app/concept/greenhouse-loft/data";
import { diamondGarden } from "../../app/concept/diamond-garden-banquet-hall/data";
import { londonhouse } from "../../app/concept/londonhouse-chicago-v2/data";
import { fieldMuseum } from "../../app/concept/field-museum/data";
import { geraghty } from "../../app/concept/geraghty/data";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Every one of the 38 spine keys, unstated. Per-venue builders override what's real. */
function emptySpine(): VenueSpine {
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

function spine(overrides: Partial<VenueSpine>): VenueSpine {
  return { ...emptySpine(), ...overrides };
}

/** Golden facts carry no real snapshot — `stated()` already defaults `snapshot_id` to null. */
const f = stated;

function fact<T>(value: T, quote: string, source_url: string): Fact<T> {
  return { value, quote, source_url, snapshot_id: null };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

let resourceCounter = 0;
function resource(r: Omit<Resource, "id" | "snapshot_id" | "checked_at"> & { id?: string }): Resource {
  return {
    id: r.id ?? `res-${++resourceCounter}`,
    kind: r.kind,
    label: r.label,
    url: r.url,
    scope: r.scope,
    embeddable: r.embeddable,
    has_text_layer: r.has_text_layer,
    checked_at: null,
    source_url: r.source_url,
    snapshot_id: null,
  };
}

function emptyPricing(overrides: Partial<Pricing> = {}): Pricing {
  return {
    archetype: null,
    paths: [],
    rates: {
      service_charge_pct: null,
      service_charge_base: null,
      sales_tax_pct: null,
      sales_tax_base: null,
      sales_tax_source: "unknown",
      cc_fee_pct: null,
      quote: null,
      source_url: null,
      snapshot_id: null,
    },
    add_ons: [],
    required_third_party: [],
    notes: [],
    ...overrides,
  };
}

function baseDoc(slug: GoldenSlug, name: string, website_url: string | null): VenueDetailsV3 {
  return {
    schema_version: VENUE_DETAILS_SCHEMA_VERSION,
    account_id: GOLDEN_ACCOUNT_IDS[slug],
    name,
    website_url,
    spine: emptySpine(),
    about: null,
    differentiator: null,
    spaces: [],
    capacities: [],
    pricing: emptyPricing(),
    food_beverage: { food_pills: [], bar_pills: [], caption: null, menus: [], bar_ladders: [], bar_min_guests: null, notes: [] },
    inclusions: [],
    faqs: [],
    resources: [],
    vendor_lists: [],
    press_features: [],
    sources: { snapshot_ids: [], pages: [], crawled_at: null },
    extraction: null,
    provenance: null,
    eval: {},
  };
}

/** Sets `eval[path] = tag`, in one place so every builder call is a one-liner. */
function tag(doc: VenueDetailsV3, path: string, kind: "extractor" | "human_only" = "extractor") {
  doc.eval![path] = kind;
}

/** Tags every stated spine key at once (the common case: extractor unless overridden after). */
function tagStatedSpine(doc: VenueDetailsV3, kind: "extractor" | "human_only" = "extractor") {
  for (const key of Object.keys(doc.spine) as (keyof VenueSpine)[]) {
    if (doc.spine[key].status !== "not_stated") tag(doc, `/spine/${key}`, kind);
  }
}

function tagCapacities(doc: VenueDetailsV3, kind: "extractor" | "human_only" = "extractor") {
  for (const c of doc.capacities) tag(doc, `/capacities/${c.space_id}:${c.layout}`, kind);
}

function tagPath(doc: VenueDetailsV3, path: PricingPath, kind: "extractor" | "human_only" = "extractor") {
  for (const fee of path.fixed_fees) tag(doc, `/pricing/paths/${path.id}/fixed_fees/${fee.key}`, kind);
  for (const t of path.per_guest_tiers) tag(doc, `/pricing/paths/${path.id}/per_guest_tiers/${t.id}`, kind);
  for (const m of path.minimums) tag(doc, `/pricing/paths/${path.id}/minimums/${m.kind}:${m.day}:${m.season}`, kind);
}

function tagAddOns(doc: VenueDetailsV3, kind: "extractor" | "human_only" = "extractor") {
  for (const a of doc.pricing.add_ons) tag(doc, `/pricing/add_ons/${a.id}`, kind);
}

// ===========================================================================
// Galleria Marchetti — account_id 31
// ===========================================================================

function buildMarchetti(): VenueDetailsV3 {
  const m = marchetti;
  const doc = baseDoc("galleria-marchetti", m.name, m.website);
  const site = m.website;
  const brochure = m.brochureUrl;
  const thePavilionUrl = "https://www.galleriamarchetti.com/thepavilion";
  const termsUrl = "https://www.galleriamarchetti.com/legal/terms-conditions";
  const aboutUrl = "https://www.galleriamarchetti.com/about-us";

  doc.spine = spine({
    venue_kind: f("event_space", m.categoryLabel, site),
    setting: f("both", m.quickFacts[1].note!, site),
    space_count_bookable: f(2, "With two distinct event spaces", site),
    ceremony_on_site: f(true, m.enhancements[0].note!, brochure),
    ceremony_fee: f("extra_fee", m.enhancements[0].note!, brochure),
    weekday_events: f(true, m.faqs[3].answer, site),
    catering: f("exclusive_in_house", m.policies[0].value, site),
    bar: f("in_house", m.policies[1].value, site),
    rental_charge_type: f("flat_fee", m.policies[2].detail!, site),
    fb_minimum: f({ applies: true, amount_usd: null, detail: m.policies[3].detail! }, m.policies[3].detail!, brochure),
    service_charge_pct: f(25, m.policies[4].detail!, site),
    parking: f("valet_paid", m.policies[5].detail!, termsUrl),
    day_of_coordinator: f("included", m.policies[6].detail!, brochure),
    // Real conflict between two of the venue's own documents — kept as `conflicting`, not
    // silently picked (mapping rule: Marchetti's two documents disagree on payment timing).
    payment_schedule: {
      status: "conflicting",
      candidates: [
        fact(
          { deposit: "Non-refundable retainer at booking, then an installment 180 days before the event", balance_due: "Remaining balance due 10 business days before the event" },
          "A non-refundable retainer is due at booking, then an installment 180 days before the event... the terms page says 10 business days.",
          termsUrl,
        ),
        fact(
          { deposit: "Non-refundable retainer at booking, then an installment 180 days before the event", balance_due: "Remaining balance due 15 business days before the event (matches the final guest-count deadline)" },
          "The brochure says 15 business days before the event, matching its final guest-count guarantee deadline.",
          brochure,
        ),
      ],
    },
    vendor_access: f({ summary: m.policies[10].detail!, setup_hours_before: null, teardown_hours_after: null }, m.policies[10].detail!, brochure),
    vendor_list_policy: f("preferred_list", m.faqs[5].answer, site),
    hvac: f(true, m.sharedIncludes[0].detail, site),
    bridal_suite: f(true, m.sharedIncludes[2].detail, brochure),
    linens_included: f(true, m.sharedIncludes[1].detail, site),
    coat_check: f("available_fee", m.enhancements[5].variants[0].pergola, brochure),
    // sales_tax_pct stays not_stated per the mapping spec: 11.75% is an inferred Chicago
    // default (see pricing.rates.sales_tax_source below), not a number the venue states itself.
    taxes_included_in_rental: f(false, "sales tax will be added to all taxable charges", site),
    pricing_archetype: f("rental_plus_per_guest_packages", "Venue rental fee (see Spaces) plus per-guest Wedding Experience packages (Argento/Oro/Platino)", site),
    price_from_usd: f(1000, "La Pergola, Sunday: $1,000", thePavilionUrl),
    per_guest_from_usd: f(190, "$190/guest (Argento)", site),
    per_guest_to_usd: f(280, "$280/guest (Platino)", site),
  });
  tagStatedSpine(doc);
  tag(doc, "/spine/ceremony_on_site", "extractor"); // text-layer PDF on framerusercontent.com
  tag(doc, "/spine/ceremony_fee", "extractor");
  tag(doc, "/spine/fb_minimum", "extractor");
  tag(doc, "/spine/day_of_coordinator", "extractor");
  tag(doc, "/spine/vendor_access", "extractor");
  tag(doc, "/spine/bridal_suite", "extractor");
  tag(doc, "/spine/coat_check", "extractor");

  doc.about = { text: m.about, evidence: { source_url: aboutUrl, snapshot_id: null } };

  doc.spaces = [
    {
      id: "the-pavilion",
      name: m.spaces[0].name,
      structure_label: m.spaces[0].structureLabel,
      sq_ft: m.spaces[0].sqFt,
      sq_ft_outdoor: null,
      ceiling_ft: null,
      setting: "both",
      bookable_separately: true,
      description: fact(m.spaces[0].description, m.spaces[0].description, thePavilionUrl),
      includes_summary: m.spaces[0].includesSummary,
      evidence: { source_url: m.spaces[0].sourceUrl, snapshot_id: null },
    },
    {
      id: "la-pergola",
      name: m.spaces[1].name,
      structure_label: m.spaces[1].structureLabel,
      sq_ft: m.spaces[1].sqFt,
      sq_ft_outdoor: null,
      ceiling_ft: null,
      setting: "both",
      bookable_separately: true,
      description: fact(m.spaces[1].description, m.spaces[1].description, thePavilionUrl),
      includes_summary: m.spaces[1].includesSummary,
      evidence: { source_url: m.spaces[1].sourceUrl, snapshot_id: null },
    },
  ];

  const capTuple = (spaceId: string, layout: CapacityTuple["layout"], tile: CapacityTuple["tile"], max: number, label: string, quote: string): CapacityTuple => ({
    space_id: spaceId,
    layout,
    min: null,
    max,
    as_stated_label: label,
    tile,
    condition: null,
    quote,
    source_url: thePavilionUrl,
    snapshot_id: null,
  });
  doc.capacities = [
    capTuple("the-pavilion", "seated_dinner", "seated", 425, m.capacityLabels.seatedDining, 'Seated Reception: up to 425 (The Pavilion)'),
    capTuple("the-pavilion", "seated_with_dance", "seated_dance", 375, m.capacityLabels.seatedWithDance, "Seated Reception + Dance Floor: up to 375 (The Pavilion)"),
    capTuple("the-pavilion", "cocktail_standing", "cocktail", 900, m.capacityLabels.standingReception, "The Pavilion cocktail capacity: 900"),
    capTuple("la-pergola", "seated_dinner", "seated", 180, m.capacityLabels.seatedDining, "La Pergola seated: 180"),
    capTuple("la-pergola", "seated_with_dance", "seated_dance", 150, m.capacityLabels.seatedWithDance, "La Pergola seated w/ dance floor: 150"),
    capTuple("la-pergola", "cocktail_standing", "cocktail", 250, m.capacityLabels.standingReception, "La Pergola cocktail: 250"),
  ];
  tagCapacities(doc);

  const tierBarExamples = (s: string) => s.split(", ");
  const perGuestTier = (key: string, name: string, perGuest: number, bar: string, barExamples: string, inheritsFrom: string | null, inclusions: string[]): PerGuestTier => ({
    id: key,
    name,
    per_guest: perGuest,
    day: null,
    season: null,
    inherits_from: inheritsFrom,
    inclusions,
    bar_tier: { name: bar.replace(/\s*\(.*\)$/, ""), hours: 5, examples: tierBarExamples(barExamples) },
    min_guests: null,
    quote: `$${perGuest}/guest`,
    source_url: brochure,
    snapshot_id: null,
  });
  const tiers = m.packages.map((p) => perGuestTier(p.key, p.name, p.perGuest, p.bar, p.barExamples, p.inheritsFrom, p.inclusions));

  const spaceFee = (spaceId: string, day: FixedFee["day"], amount: number, label: string): FixedFee => ({
    applies_to: "space",
    space_id: spaceId,
    day,
    season: null,
    amount,
    unit: "flat",
    label,
    includes: [],
    key: `${spaceId}-${day}`,
    quote: `$${amount.toLocaleString()}`,
    source_url: thePavilionUrl,
    snapshot_id: null,
  });
  const wholeVenueFee = (day: FixedFee["day"], amount: number): FixedFee => ({
    applies_to: "whole_venue",
    space_id: null,
    day,
    season: null,
    amount,
    unit: "flat",
    label: `Venue rental: entire venue, ${day}`,
    includes: [],
    key: `whole-venue-${day}`,
    quote: `$${amount.toLocaleString()}`,
    source_url: thePavilionUrl,
    snapshot_id: null,
  });

  // ONE real pricing path (template §4: a standalone Pricing section only exists for a venue
  // with multiple real paths, and Marchetti doesn't have one). Per-space fees and the "book both
  // spaces together" whole-venue fees live on the SAME path; `estimateCost` (derive.ts) skips a
  // `whole_venue` fee whenever the chosen space already has its own space-scoped fee on that
  // path, so choosing a single space (the pinned Pavilion/Saturday scenario) never double-counts
  // against the entire-venue rate, and the renderer's "Prefer the whole venue?" line reads the
  // same three whole-venue fees directly.
  const defaultPath: PricingPath = {
    id: "default",
    name: "Wedding Experience Packages",
    description: "Rent The Pavilion or La Pergola individually, or the entire venue together.",
    applies_to_spaces: "all",
    fixed_fees: [
      spaceFee("the-pavilion", "fri", 4000, "Venue rental: The Pavilion, Friday"),
      spaceFee("the-pavilion", "sat", 6000, "Venue rental: The Pavilion, Saturday"),
      spaceFee("the-pavilion", "sun", 2000, "Venue rental: The Pavilion, Sunday"),
      spaceFee("la-pergola", "fri", 2000, "Venue rental: La Pergola, Friday"),
      spaceFee("la-pergola", "sat", 3000, "Venue rental: La Pergola, Saturday"),
      spaceFee("la-pergola", "sun", 1000, "Venue rental: La Pergola, Sunday"),
      wholeVenueFee("fri", 6000),
      wholeVenueFee("sat", 9000),
      wholeVenueFee("sun", 3000),
    ],
    per_guest_tiers: tiers,
    minimums: [],
    required_staffing: null,
    rental_hours: null,
    year_surcharges: [],
    promotions: [],
    quote: "",
    source_url: site,
    snapshot_id: null,
  };

  const ceremonyAddOn: AddOn = {
    id: "ceremony-onsite",
    name: "On-site ceremony",
    category: "Ceremony fee",
    variant: null,
    group: "ceremony",
    price: null,
    price_max: null,
    unit: "flat",
    per_space_prices: { "the-pavilion": 2000, "la-pergola": 1000 },
    applies_to: ["the-pavilion", "la-pergola"],
    path_ids: null,
    condition: "ceremony_on_site",
    priceable: true,
    tax_pct_override: null,
    min_guests: null,
    as_stated_price: "$1,000 (La Pergola) / $2,000 (The Pavilion)",
    note: m.enhancements[0].note!,
    quote: "$1,000 (La Pergola) / $2,000 (The Pavilion)",
    source_url: brochure,
    snapshot_id: null,
  };
  const rentalAddOn = (id: string, category: string, variant: string | null, pergola: number, pavilion: number, note: string | null = null): AddOn => ({
    id,
    name: variant ? `${category}: ${variant}` : category,
    category,
    variant,
    group: "rental",
    price: null,
    price_max: null,
    unit: "flat",
    per_space_prices: { "the-pavilion": pavilion, "la-pergola": pergola },
    applies_to: ["the-pavilion", "la-pergola"],
    path_ids: null,
    condition: null,
    priceable: true,
    tax_pct_override: null,
    min_guests: null,
    as_stated_price: `$${pergola} (La Pergola) / $${pavilion} (The Pavilion)`,
    note,
    quote: `$${pergola}` ,
    source_url: site,
    snapshot_id: null,
  });
  const experienceAddOn = (id: string, name: string, price: number, priceMax: number | null, note: string): AddOn => ({
    id,
    name,
    category: name,
    variant: null,
    group: "fb",
    price,
    price_max: priceMax,
    unit: "per_guest",
    per_space_prices: null,
    applies_to: "all",
    path_ids: null,
    condition: null,
    priceable: true,
    tax_pct_override: null,
    min_guests: null,
    as_stated_price: priceMax ? `$${price}–${priceMax}/guest` : `$${price}/guest`,
    note,
    quote: priceMax ? `$${price}–${priceMax}/guest` : `$${price}/guest`,
    source_url: site,
    snapshot_id: null,
  });

  doc.pricing = emptyPricing({
    archetype: "rental_plus_per_guest_packages",
    default_axes: { path_id: "default", space_id: "the-pavilion", day: "sat", season: "peak", tier_id: "oro", ceremonyOnSite: false },
    paths: [defaultPath],
    rates: {
      service_charge_pct: 25,
      service_charge_base: "fb",
      sales_tax_pct: 11.75,
      sales_tax_base: "fb_and_rentals",
      sales_tax_source: "chicago_default",
      cc_fee_pct: null,
      quote: "This is Chicago's standard restaurant/prepared-food tax rate, used here so users always see a full, tax-inclusive number; flagged as inferred, not confirmed for this venue.",
      source_url: site,
      snapshot_id: null,
    },
    add_ons: [
      ceremonyAddOn,
      rentalAddOn("dance-floor-white", "Dance floor", "White", 625, 1725, "Pavilion 13-swag-style upgrade not modeled; see the enhancements table."),
      rentalAddOn("dance-floor-bw", "Dance floor", "Black & white", 1000, 2500),
      rentalAddOn("bistro-lights-standard", "Bistro lights", "Standard", 1250, 1400, "Pavilion price shown is the 7-swag option; 13 swags is $2,200 (not modeled as a separate variant)."),
      rentalAddOn("bistro-lights-greenery", "Bistro lights", "With faux greenery", 2250, 2500, "Pavilion price shown is the 7-swag option; 13 swags is $4,400 (not modeled as a separate variant)."),
      {
        id: "chiavari-chairs",
        name: "Chiavari chairs",
        category: "Chiavari chairs",
        variant: null,
        group: "rental",
        price: 10,
        price_max: null,
        unit: "per_unit",
        per_space_prices: null,
        applies_to: "all",
        path_ids: null,
        condition: null,
        priceable: true,
        tax_pct_override: null,
        min_guests: null,
        as_stated_price: "$10 each",
        note: null,
        quote: "$10 each",
        source_url: site,
        snapshot_id: null,
      },
      {
        id: "stage",
        name: "Stage",
        category: "Stage",
        variant: null,
        group: "rental",
        price: 175,
        price_max: null,
        unit: "per_unit",
        per_space_prices: null,
        applies_to: "all",
        path_ids: null,
        condition: null,
        priceable: true,
        tax_pct_override: null,
        min_guests: null,
        as_stated_price: "$175 / 4×8 section",
        note: "Includes black skirting and stairs.",
        quote: "$175 / 4×8 section",
        source_url: site,
        snapshot_id: null,
      },
      {
        id: "coat-check",
        name: "Coat check",
        category: "Coat check",
        variant: null,
        group: "service",
        price: null,
        price_max: null,
        unit: "flat",
        per_space_prices: null,
        applies_to: "all",
        path_ids: null,
        condition: null,
        priceable: false,
        tax_pct_override: null,
        min_guests: null,
        as_stated_price: "Available (fee varies)",
        note: "Coat check service may be arranged in advance. Additional charges apply based on staffing requirements.",
        quote: "Coat check service may be arranged in advance. Additional charges apply based on staffing requirements.",
        source_url: brochure,
        snapshot_id: null,
      },
      experienceAddOn("aperitivo-hour", "Garden Aperitivo Hour", 12, 20, "Signature Moments ($12/guest): Aperol Spritz Bar, Limoncello Spritz Bar. Signature Experiences ($20/guest): Antipasti Station, Live Fire Skewer Station."),
      experienceAddOn("chef-experiences", "Chef Experiences", 40, null, "Coastal Crudo & Sushi Experience, Wood-Fired Beef Tagliata Station."),
      experienceAddOn("late-night", "Late Night Experiences", 12, 20, "Signature Moments ($12/guest): Italian Gelato Cart, S'mores Station. Signature Experiences ($20/guest): Neapolitan Pizza Station, Chicago Station."),
    ],
    required_third_party: [],
    notes: [fact(m.barCollectionsNote, m.barCollectionsNote, brochure)],
  });
  tagPath(doc, defaultPath);
  tagAddOns(doc);
  tag(doc, "/pricing/rates");

  doc.food_beverage = {
    food_pills: [fact("all_inclusive", "No outside caterer option. Food comes from the venue's own kitchen.", site)],
    bar_pills: [fact("all_inclusive", "Bar in-house", site)],
    caption: null,
    menus: [],
    bar_ladders: [],
    bar_min_guests: null,
    notes: [fact(m.barCollectionsNote, m.barCollectionsNote, brochure)],
  };

  doc.inclusions = m.sharedIncludes.map((item) => ({
    label: (item.label as any) === "Heating & A/C" ? "Heating & A/C" : (item.label as any),
    label_raw: item.label,
    detail: item.detail,
    category: item.label === "Linens" ? "Furniture" : "Space",
    quote: item.detail,
    source_url: item.label === "Bridal suite" ? brochure : site,
    snapshot_id: null,
  }));

  doc.faqs = m.faqs.map((q) => ({ question: q.question, answer: q.answer, source_url: site, snapshot_id: null }));

  doc.resources = [
    resource({ kind: "brochure", label: "Wedding Brochure", url: brochure, scope: "venue", embeddable: false, has_text_layer: true, source_url: brochure }),
    ...m.spaces[0].floorPlans.map((fp, i) => resource({ kind: "floor_plan", label: fp.label, url: fp.imageUrl, scope: "space:the-pavilion", embeddable: null, has_text_layer: null, source_url: thePavilionUrl, id: `floorplan-pavilion-${i + 1}` })),
    ...m.spaces[1].floorPlans.map((fp, i) => resource({ kind: "floor_plan", label: fp.label, url: fp.imageUrl, scope: "space:la-pergola", embeddable: null, has_text_layer: null, source_url: thePavilionUrl, id: `floorplan-la-pergola-${i + 1}` })),
  ];

  doc.sources = { snapshot_ids: [], pages: m.sourcePages, crawled_at: m.lastVerified };
  return doc;
}

// ===========================================================================
// Greenhouse Loft — account_id 477
// ===========================================================================

function buildGreenhouseLoft(): VenueDetailsV3 {
  const g = greenhouseLoft;
  const doc = baseDoc("greenhouse-loft", g.name, g.website);
  const site = g.website;
  const faqUrl = "https://www.greenhouseloft.com/faq";
  const cateringPdf = g.cateringGuidelinesUrl;
  const serviceAgreementPdf = g.serviceAgreementUrl;

  doc.spine = spine({
    venue_kind: f("loft", g.categoryLabel, site),
    setting: f("both", g.quickFacts[1].note!, site),
    space_count_bookable: f(1, "Use of our entire loft space + adjacent outdoor garden + art gallery space", site),
    capacity_min_guests: f(25, g.quickFacts[0].note!, faqUrl),
    ceremony_on_site: f(true, "We have a large private space available right outside of the garden ceremony area.", faqUrl),
    weekday_events: f(false, "Weekday rentals are on a case-by-case basis.", faqUrl),
    rental_hours_included: f(7, "You can host an event up to seven hours on Saturdays and Sundays", faqUrl),
    one_event_per_day: f(true, "How many events per day do you hold? One. Yours.", faqUrl),
    catering: f("open", g.policies[0].detail!, cateringPdf),
    bar: f("byob", g.policies[1].detail!, faqUrl),
    rental_charge_type: f("flat_fee", g.policies[2].value, site),
    fb_minimum: f({ applies: false, amount_usd: null, detail: null }, g.policies[3].value, faqUrl),
    service_charge_pct: f(0, g.policies[4].detail!, faqUrl),
    taxes_included_in_rental: f(true, g.policies[4].detail!, faqUrl),
    parking: f("included", g.policies[5].detail!, faqUrl),
    day_of_coordinator: f("included", g.policies[6].detail!, faqUrl),
    payment_schedule: f({ deposit: "50% deposit (non-refundable)", balance_due: "Homepage: 10 days before the event. FAQ separately says about a month out — worth confirming." }, g.policies[7].detail!, faqUrl),
    // Cancellation schedule + noise-curfew overstay rule come from the real (2021) service
    // agreement PDF, which was image-based / no text layer — human_only, not a crawl test.
    cancellation: f({ summary: g.policies[8].value, deposit_refundable: false }, g.policies[8].detail!, serviceAgreementPdf),
    event_insurance: f("required", g.policies[9].detail!, faqUrl),
    security: f("included", g.policies[10].value, site),
    vendor_access: f({ summary: g.policies[11].value, setup_hours_before: null, teardown_hours_after: null }, g.policies[11].detail!, faqUrl),
    noise_curfew: f(g.policies[12].value, g.policies[12].detail!, serviceAgreementPdf),
    cc_fee_pct: f(3.5, "Credit card payments carry a 3.5% fee.", g.policies[7].detail!),
    vendor_list_policy: f("open", "Do you take commissions from other vendors? Absolutely not.", faqUrl),
    pets_allowed: f(true, "Yes, we are pet friendly. You may bring your dog to the ceremony.", faqUrl),
    hvac: f(true, "High tech! It cools quickly in the summer and is nice and toasty in the winter.", faqUrl),
    ada_accessible: f(true, "Absolutely. The building is ADA accessible, with an elevator just off the main entrance.", faqUrl),
    bridal_suite: f(true, "A private bridal suite / green room", faqUrl),
    coat_check: f("included", "Yes, there are multiple coat racks in our welcome area.", faqUrl),
    pricing_archetype: f("raw_space_byo", "One flat-fee rental covers the entire space; catering and bar are both bring-your-own.", site),
    price_from_usd: f(5000, "Off-season Sunday: $5,000", site),
    per_guest_from_usd: NOT_STATED,
    per_guest_to_usd: NOT_STATED,
  });
  tagStatedSpine(doc);
  tag(doc, "/spine/cancellation", "human_only");
  tag(doc, "/spine/noise_curfew", "human_only");

  doc.about = { text: g.about, evidence: { source_url: site, snapshot_id: null } };
  doc.differentiator = {
    title: g.differentiator.title,
    tagline: "Chicago's most sustainable event venue",
    groups: [
      { heading: "Highlights", bullets: g.differentiator.highlights },
      { heading: "Reduce", bullets: g.differentiator.reduce },
      { heading: "Reuse", bullets: g.differentiator.reuse },
      { heading: "Recycle", bullets: g.differentiator.recycle },
    ],
    evidence: { source_url: "https://www.greenhouseloft.com/sustainability-1", snapshot_id: null },
  };

  doc.spaces = [
    {
      id: "loft",
      name: g.space.name,
      structure_label: null,
      sq_ft: g.space.sqFtIndoor,
      sq_ft_outdoor: g.space.sqFtOutdoor,
      ceiling_ft: 16,
      setting: "both",
      bookable_separately: true,
      description: fact(g.space.description, g.space.description, site),
      includes_summary: g.space.areas.map((a) => a.note ? `${a.name} (${a.note})` : a.name).join(", "),
      evidence: { source_url: g.space.sourceUrl, snapshot_id: null },
    },
  ];

  doc.capacities = [
    { space_id: "loft", layout: "seated_with_dance", min: null, max: g.space.capacity.seatedDj, as_stated_label: g.capacityLabels.seatedDj, tile: "seated", condition: "DJ", quote: g.quickFacts[0].note!, source_url: faqUrl, snapshot_id: null },
    { space_id: "loft", layout: "seated_with_dance", min: null, max: g.space.capacity.seatedBand, as_stated_label: g.capacityLabels.seatedBand, tile: "seated_dance", condition: "live band", quote: "The recommended max guest count with a band is 125... [tile capacity per the venue's own stat: 150]", source_url: faqUrl, snapshot_id: null },
    { space_id: "loft", layout: "cocktail_standing", min: null, max: g.space.capacity.cocktail, as_stated_label: g.capacityLabels.cocktail, tile: "cocktail", condition: null, quote: g.quickFacts[0].note!, source_url: faqUrl, snapshot_id: null },
  ];
  tagCapacities(doc);

  const seasonFees = (season: "peak" | "off", bucket: { friday: number; saturday: number; sunday: number }): FixedFee[] =>
    (["fri", "sat", "sun"] as const).map((day) => ({
      applies_to: "whole_venue",
      space_id: null,
      day,
      season,
      amount: day === "fri" ? bucket.friday : day === "sat" ? bucket.saturday : bucket.sunday,
      unit: "flat",
      label: `Venue rental (${season === "peak" ? "peak" : "off"} season, ${day})`,
      includes: [],
      key: `${season}-${day}`,
      quote: `$${(day === "fri" ? bucket.friday : day === "sat" ? bucket.saturday : bucket.sunday).toLocaleString()}`,
      source_url: site,
      snapshot_id: null,
    }));

  const defaultPath: PricingPath = {
    id: "default",
    name: "Default",
    description: "Flat per-event rental; the venue's only real pricing path.",
    applies_to_spaces: "all",
    fixed_fees: [...seasonFees("off", g.pricing.offSeason), ...seasonFees("peak", g.pricing.peakSeason)],
    per_guest_tiers: [],
    minimums: [],
    required_staffing: null,
    rental_hours: 7,
    year_surcharges: [],
    promotions: [],
    quote: "",
    source_url: site,
    snapshot_id: null,
  };

  doc.pricing = emptyPricing({
    archetype: "raw_space_byo",
    default_axes: { path_id: "default", day: "sat", season: "peak", ceremonyOnSite: false },
    paths: [defaultPath],
    rates: {
      service_charge_pct: 0,
      service_charge_base: null,
      sales_tax_pct: null,
      sales_tax_base: "included",
      sales_tax_source: "included",
      cc_fee_pct: 3.5,
      quote: "All applicable state and federal taxes are built in to the rental rate and there are no additional or hidden fees.",
      source_url: faqUrl,
      snapshot_id: null,
    },
    add_ons: [
      {
        id: "extra-parking",
        name: "Additional Parking",
        category: "Parking",
        variant: null,
        group: "rental",
        price: g.calculatorAddOns.extraParking.price,
        price_max: null,
        unit: "flat",
        per_space_prices: null,
        applies_to: "all",
        path_ids: null,
        condition: null,
        priceable: true,
        tax_pct_override: null,
        min_guests: null,
        as_stated_price: "$500 flat",
        note: g.addOns[0].blurb,
        quote: "$500 flat",
        source_url: site,
        snapshot_id: null,
      },
      {
        id: "rehearsal",
        name: "Rehearsal",
        category: "Rehearsal",
        variant: null,
        group: "rental",
        price: g.calculatorAddOns.rehearsal.pricePerHour,
        price_max: null,
        unit: "per_hour",
        per_space_prices: null,
        applies_to: "all",
        path_ids: null,
        condition: null,
        priceable: true,
        tax_pct_override: null,
        min_guests: null,
        as_stated_price: "$250/hr",
        note: g.addOns[1].blurb,
        quote: "$250/hr",
        source_url: site,
        snapshot_id: null,
      },
      {
        id: "cleaning-fee",
        name: "Cleaning Fee",
        category: "Cleaning",
        variant: null,
        group: "service",
        price: 500,
        price_max: null,
        unit: "flat",
        per_space_prices: null,
        applies_to: "all",
        path_ids: null,
        condition: "if_not_broom_clean",
        priceable: true,
        tax_pct_override: null,
        min_guests: null,
        as_stated_price: "If not left broom-clean",
        note: g.addOns[2].blurb,
        quote: g.addOns[2].blurb,
        source_url: serviceAgreementPdf,
        snapshot_id: null,
      },
    ],
    required_third_party: [{ name: "Event insurance", estimate_usd: g.calculatorAddOns.insuranceEstimate, required: true, quote: "It is required that you purchase insurance, which should only be about $175 from sites like www.wedsure.com and www.wedsafe.com.", source_url: faqUrl, snapshot_id: null }],
    notes: [],
  });
  tagPath(doc, defaultPath);
  tagAddOns(doc);
  tag(doc, "/pricing/add_ons/cleaning-fee", "human_only");
  tag(doc, "/pricing/rates");

  doc.food_beverage = {
    food_pills: [fact("byo", g.quickFacts[2].note!, faqUrl)],
    bar_pills: [fact("byo", g.quickFacts[3].note!, faqUrl)],
    caption: null,
    menus: [],
    bar_ladders: [],
    bar_min_guests: null,
    notes: [
      fact(
        "LEED Platinum certified building: mandatory recycling + composting at every event, no plastic disposables, and caterer load-in/out via a west-side freight entrance.",
        "Our building is Certified Platinum LEED... mandatory recycling/composting at every event, no plastic disposables.",
        cateringPdf,
      ),
    ],
  };
  tag(doc, "/food_beverage", "human_only");

  const categoryFor: Record<string, string> = { Space: "Space", Furniture: "Furniture", Entertainment: "Entertainment", Services: "Services", Ambiance: "Ambiance" };
  doc.inclusions = g.sharedIncludes.flatMap((group) =>
    group.items.map((item) => ({
      label: (item.label as any),
      label_raw: item.label,
      detail: item.detail,
      category: (categoryFor[group.category] ?? "Other") as any,
      quote: item.detail,
      source_url: item.label === "Videography" ? serviceAgreementPdf : site,
      snapshot_id: null,
    })),
  );

  doc.faqs = g.faqs.map((q) => ({ question: q.question, answer: q.answer, source_url: faqUrl, snapshot_id: null }));

  doc.resources = [
    resource({ kind: "catering_guidelines", label: "Catering & Composting Guidelines", url: cateringPdf, scope: "venue", embeddable: null, has_text_layer: false, source_url: cateringPdf }),
    resource({ kind: "contract", label: "GHL Service Agreement (2021 template)", url: serviceAgreementPdf, scope: "venue", embeddable: null, has_text_layer: false, source_url: serviceAgreementPdf }),
    resource({ kind: "virtual_tour", label: "Virtual tour", url: g.space.tourUrl, scope: "venue", embeddable: true, has_text_layer: null, source_url: g.space.tourUrl }),
    resource({ kind: "gallery", label: "Event gallery", url: g.space.galleryUrl, scope: "venue", embeddable: true, has_text_layer: null, source_url: g.space.galleryUrl }),
    ...g.floorPlanResources.map((fp, i) => resource({ kind: "floor_plan", label: fp.label, url: fp.url, scope: "venue", embeddable: null, has_text_layer: null, source_url: fp.url, id: `floorplan-${i + 1}` })),
  ];

  doc.sources = { snapshot_ids: [], pages: g.sourcePages, crawled_at: g.lastVerified };
  return doc;
}

// ===========================================================================
// Diamond Garden Banquet Hall — account_id 27389
// ===========================================================================

function buildDiamondGarden(): VenueDetailsV3 {
  const d = diamondGarden;
  const doc = baseDoc("diamond-garden-banquet-hall", d.name, d.website);
  const site = d.website;
  const packagesUrl = "https://www.diamondgardenhall.com/build-your-own-package";
  const faqUrl = "https://www.diamondgardenhall.com/questions-and-answers";

  doc.spine = spine({
    venue_kind: f("banquet_hall", d.categoryLabel, site),
    setting: f("indoor", d.quickFacts[1].note!, site),
    one_event_per_day: f(false, "We can accommodate 2 events per day, one in the morning and one in the evening.", faqUrl),
    space_count_bookable: f(1, "Yes, we only have one room.", faqUrl),
    ceremony_on_site: f(true, "Ceremony at no extra charge (within your rental hours)", site),
    ceremony_fee: f("included", "Ceremony at no extra charge (within your rental hours)", site),
    rental_hours_included: f(6, "6 hours (1am latest)", packagesUrl),
    catering: f("open", d.quickFacts[2].note!, faqUrl),
    bar: f("byo_with_corkage", d.quickFacts[3].note!, faqUrl),
    rental_charge_type: f("flat_plus_per_guest", d.policies[2].value, packagesUrl),
    fb_minimum: f({ applies: true, amount_usd: null, detail: d.policies[3].value }, d.policies[3].value, packagesUrl),
    parking: f("included", d.policies[5].value, faqUrl),
    payment_schedule: f({ deposit: "$1,000 deposit; monthly payments available", balance_due: d.policies[7].value }, d.faqs[9].answer, faqUrl),
    vendor_access: f({ summary: d.policies[11].value, setup_hours_before: 2, teardown_hours_after: null }, "5 hours + 2 hours before for setup (1am latest)", packagesUrl),
    noise_curfew: f(d.policies[12].value, "What is the latest time the event can go until? 1am.", faqUrl),
    vendor_list_policy: f("open", d.quickFacts[2].note!, faqUrl),
    ada_accessible: f(true, "Is the site handicap accessible? Yes.", faqUrl),
    bridal_suite: f(true, "Is there a private room for the bride, bridesmaids, or quinceañera? Yes, a spacious private dressing room including a vanity and toilet.", faqUrl),
    dance_floor_included: f(true, "Spacious dance floor", site),
    coat_check: f("available_fee", "Yes, it comes with the complete package or on the rental when you have 2 security guards.", faqUrl),
    pricing_archetype: f("mixed", "Two real pricing paths: All-Inclusive (per-guest) and Hall Rental Only (flat fee).", packagesUrl),
    price_from_usd: f(2100, "Hall Rental Only, off-season weekday: $2,100", packagesUrl),
    per_guest_from_usd: f(68.95, "$68.95/guest (All-Inclusive, off-season weekday/Fri/Sun)", packagesUrl),
    per_guest_to_usd: f(84.95, "$84.95/guest (All-Inclusive, peak season Saturday)", packagesUrl),
  });
  tagStatedSpine(doc);

  doc.about = { text: d.about, evidence: { source_url: "https://www.diamondgardenhall.com/about-us", snapshot_id: null } };

  doc.spaces = [
    {
      id: "main-hall",
      name: d.space.name,
      structure_label: null,
      sq_ft: d.space.sqFt,
      sq_ft_outdoor: null,
      ceiling_ft: null,
      setting: "indoor",
      bookable_separately: true,
      description: fact(d.space.description, d.space.description, site),
      includes_summary: null,
      evidence: { source_url: d.space.sourceUrl, snapshot_id: null },
    },
  ];

  doc.capacities = [
    { space_id: "main-hall", layout: "seated_with_dance", min: null, max: d.space.capacity.seatedWithDance!, as_stated_label: d.capacityLabels.seatedWithDance, tile: "seated_dance", condition: null, quote: d.quickFacts[0].note!, source_url: site, snapshot_id: null },
  ];
  tagCapacities(doc);

  const dayFee = (day: FixedFee["day"], amount: number, season: "off" | "peak", label: string, key: string): FixedFee => ({
    applies_to: "whole_venue",
    space_id: null,
    day,
    season: season === "off" ? "off" : "peak",
    amount,
    unit: "flat",
    label,
    includes: [],
    key,
    quote: `$${amount.toLocaleString()}`,
    source_url: packagesUrl,
    snapshot_id: null,
  });
  // Real 3-bucket day pricing (weekday / Friday+Sunday / Saturday) -- one fee per bucket, per
  // season. `dayMatches("weekday")` now means Mon-Thu only (derive.ts), so a "weekday" fee never
  // overlaps a separate Friday/Sunday-specific fee.
  const hallFeesForSeason = (season: "off" | "peak"): FixedFee[] => {
    const bucket = season === "off" ? d.packages.hallOnly.pricing.offSeason : d.packages.hallOnly.pricing.peakSeason;
    const seasonLabel = season === "off" ? "off-season" : "peak season";
    return [
      dayFee("weekday", bucket.weekday, season, `Hall rental (${seasonLabel}, weekday)`, `${season}-weekday`),
      dayFee("fri", bucket.fridaySunday, season, `Hall rental (${seasonLabel}, Friday/Sunday)`, `${season}-fri`),
      dayFee("sun", bucket.fridaySunday, season, `Hall rental (${seasonLabel}, Friday/Sunday)`, `${season}-sun`),
      dayFee("sat", bucket.saturday, season, `Hall rental (${seasonLabel}, Saturday)`, `${season}-sat`),
    ];
  };

  const hallOnlyPath: PricingPath = {
    id: "hall-rental-only",
    name: d.packages.hallOnly.name,
    description: "Flat fee, bring-your-own-everything, plus required staffing.",
    applies_to_spaces: "all",
    fixed_fees: [...hallFeesForSeason("off"), ...hallFeesForSeason("peak")],
    per_guest_tiers: [],
    minimums: [],
    required_staffing: {
      price_per_role: d.packages.hallOnly.requiredAddOns.pricePerRole,
      bartender_per_guests: d.packages.hallOnly.requiredAddOns.bartenderPerGuests,
      other_roles: d.packages.hallOnly.requiredAddOns.otherRoles,
      quote: "we require 1 bartender every 150 guests",
      source_url: faqUrl,
      snapshot_id: null,
    },
    rental_hours: null,
    year_surcharges: [
      { year: 2027, amount: d.packages.hallOnly.futureYearSurchargeFlat[2027], unit: "flat" },
      { year: 2028, amount: d.packages.hallOnly.futureYearSurchargeFlat[2028], unit: "flat" },
    ],
    promotions: [],
    quote: "",
    source_url: packagesUrl,
    snapshot_id: null,
  };

  // Every tier shares the same name ("All-Inclusive") and the same real inclusion list (food +
  // bar + setup, from the venue's own package page) -- the tiers differ ONLY by day/season
  // price, so the renderer collapses them into one card with a price range instead of 8 empty
  // near-duplicate cards.
  const allInclusiveInclusions = [...d.packages.complete.inclusionGroups.food, ...d.packages.complete.inclusionGroups.bar, ...d.packages.complete.inclusionGroups.setup];
  const perGuestTier = (id: string, perGuest: number, day: PerGuestTier["day"], season: PerGuestTier["season"]): PerGuestTier => ({
    id,
    name: d.packages.complete.name,
    per_guest: perGuest,
    day,
    season,
    inherits_from: null,
    inclusions: allInclusiveInclusions,
    bar_tier: { name: "Standard Bar", hours: 4.5, examples: ["Well liquors", "Domestic beer", "House wine"] },
    min_guests: null,
    quote: `$${perGuest}/guest`,
    source_url: packagesUrl,
    snapshot_id: null,
  });
  const allInclusivePath: PricingPath = {
    id: "all-inclusive",
    name: d.packages.complete.name,
    description: "Per-guest, all-inclusive: catering, bar, cake, rentals, staff.",
    applies_to_spaces: "all",
    fixed_fees: [],
    // Real 3-bucket day pricing (weekday / Friday / Sunday all share one price; Saturday is its
    // own), per season -- one tier per real (day, season) combination so the season x day grid
    // shows real day labels instead of "Any day". `dayMatches("weekday")` is Mon-Thu only, so it
    // never collides with the separate Friday/Sunday tiers.
    per_guest_tiers: [
      perGuestTier("peak-weekday", d.packages.complete.pricing.peakSeason.weekdayFriSun, "weekday", "peak"),
      perGuestTier("peak-fri", d.packages.complete.pricing.peakSeason.weekdayFriSun, "fri", "peak"),
      perGuestTier("peak-sun", d.packages.complete.pricing.peakSeason.weekdayFriSun, "sun", "peak"),
      perGuestTier("peak-sat", d.packages.complete.pricing.peakSeason.saturday, "sat", "peak"),
      perGuestTier("off-weekday", d.packages.complete.pricing.offSeason.weekdayFriSun, "weekday", "off"),
      perGuestTier("off-fri", d.packages.complete.pricing.offSeason.weekdayFriSun, "fri", "off"),
      perGuestTier("off-sun", d.packages.complete.pricing.offSeason.weekdayFriSun, "sun", "off"),
      perGuestTier("off-sat", d.packages.complete.pricing.offSeason.saturday, "sat", "off"),
    ],
    minimums: [
      { kind: "guest_minimum", day: null, season: null, amount: d.packages.complete.minGuests.general, quote: "150 guests general minimum", source_url: packagesUrl, snapshot_id: null },
      { kind: "guest_minimum", day: "fri", season: null, amount: d.packages.complete.minGuests.friday, quote: "125 guests on Fridays", source_url: packagesUrl, snapshot_id: null },
      { kind: "guest_minimum", day: "sun", season: null, amount: d.packages.complete.minGuests.sunday, quote: "100 guests on Sundays", source_url: packagesUrl, snapshot_id: null },
    ],
    required_staffing: null,
    rental_hours: 6,
    year_surcharges: [
      { year: 2027, amount: d.packages.complete.futureYearSurchargePerGuest[2027], unit: "per_guest" },
      { year: 2028, amount: d.packages.complete.futureYearSurchargePerGuest[2028], unit: "per_guest" },
    ],
    promotions: [{ name: "Early Bird Special", detail: `$${d.packages.complete.earlyBird.price}/guest (${d.packages.complete.earlyBird.detail})`, condition: null }],
    quote: "",
    source_url: packagesUrl,
    snapshot_id: null,
  };

  const ceremonyAddOns: AddOn[] = d.calculatorAddOns.ceremonyUpgrades.map((c) => ({
    id: c.id,
    name: c.label,
    category: "Decoration",
    variant: null,
    group: "ceremony",
    price: c.price,
    price_max: null,
    unit: "flat",
    per_space_prices: null,
    applies_to: "all",
    path_ids: null,
    condition: null,
    priceable: true,
    tax_pct_override: null,
    min_guests: null,
    as_stated_price: `$${c.price}`,
    note: null,
    quote: `$${c.price}`,
    source_url: d.addOnsResources[0].url,
    snapshot_id: null,
  }));
  const decorAddOns: AddOn[] = d.calculatorAddOns.decor.map((item) => ({
    id: item.id,
    name: item.label,
    category: "Decoration",
    variant: null,
    group: "other",
    price: "price" in item ? (item as any).price : null,
    price_max: null,
    unit: "perGuest" in item ? "per_guest" : "flat",
    per_space_prices: null,
    applies_to: "all",
    path_ids: null,
    condition: null,
    priceable: true,
    tax_pct_override: null,
    min_guests: item.id === "decorationPackage" ? 100 : null,
    as_stated_price: "perGuest" in item ? `$${(item as any).perGuest}/guest` : `$${(item as any).price}`,
    note: null,
    quote: "perGuest" in item ? `$${(item as any).perGuest}/guest` : `$${(item as any).price}`,
    source_url: d.addOnsResources[0].url,
    snapshot_id: null,
  }));
  const lightingAddOns: AddOn[] = d.calculatorAddOns.lighting.map((l) => ({
    id: l.id,
    name: l.label,
    category: "Lighting & video",
    variant: null,
    group: "other",
    price: l.price,
    price_max: null,
    unit: (l as any).adjustable ? "per_unit" : "flat",
    per_space_prices: null,
    applies_to: "all",
    path_ids: null,
    condition: null,
    priceable: true,
    tax_pct_override: null,
    min_guests: (l as any).adjustable ? 8 : null,
    as_stated_price: `$${l.price}${(l as any).adjustable ? " each (8 minimum)" : ""}`,
    note: null,
    quote: `$${l.price}`,
    source_url: d.addOnsResources[0].url,
    snapshot_id: null,
  }));
  const staffingAddOns: AddOn[] = d.calculatorAddOns.staffing.map((s) => ({
    id: s.id,
    name: s.label,
    category: "Staffing & service",
    variant: null,
    group: "service",
    price: s.price,
    price_max: null,
    unit: "flat",
    per_space_prices: null,
    applies_to: "all",
    path_ids: s.hallRentalOnlyOnly ? ["hall-rental-only"] : null,
    condition: null,
    priceable: true,
    tax_pct_override: null,
    min_guests: null,
    as_stated_price: `$${s.price}`,
    note: null,
    quote: `$${s.price}`,
    source_url: d.addOnsResources[0].url,
    snapshot_id: null,
  }));
  const foodDrinkExtraAddOns: AddOn[] = d.calculatorAddOns.foodDrinkExtras.map((it) => ({
    id: it.id,
    name: it.label,
    category: "Food & beverage add-ons",
    variant: null,
    group: "fb",
    price: "price" in it ? (it as any).price : null,
    price_max: null,
    unit: "perGuest" in it ? "per_guest" : "flat",
    per_space_prices: null,
    applies_to: "all",
    path_ids: ["hall-rental-only"],
    condition: null,
    priceable: true,
    tax_pct_override: null,
    min_guests: it.id === "coffeeTea" ? 150 : it.id === "cakeTable" ? 125 : null,
    as_stated_price: "perGuest" in it ? `$${(it as any).perGuest}/guest` : `$${(it as any).price}`,
    note: null,
    quote: "perGuest" in it ? `$${(it as any).perGuest}/guest` : `$${(it as any).price}`,
    source_url: d.addOnsResources[0].url,
    snapshot_id: null,
  }));
  const foodPackageAddOns: AddOn[] = d.calculatorAddOns.foodPackages.map((p) => ({
    id: `food-package-${p.key}`,
    name: `Food package: ${p.name}`,
    category: "Food & beverage add-ons",
    variant: p.name,
    group: "fb",
    price: p.perGuest,
    price_max: null,
    unit: "per_guest",
    per_space_prices: null,
    applies_to: "all",
    path_ids: ["hall-rental-only"],
    condition: null,
    priceable: true,
    tax_pct_override: null,
    min_guests: 100,
    as_stated_price: `$${p.perGuest}/guest`,
    note: "Only Gold includes real silverware, china & glassware; Bronze and Silver use plasticware.",
    quote: `$${p.perGuest}/guest`,
    source_url: d.addOnsResources[0].url,
    snapshot_id: null,
  }));
  const dinnerwareAddOns: AddOn[] = d.calculatorAddOns.dinnerwareOnly.map((dw) => ({
    id: `dinnerware-${dw.key}`,
    name: `Dinnerware only: ${dw.name}`,
    category: "Food & beverage add-ons",
    variant: dw.name,
    group: "fb",
    price: dw.perGuest,
    price_max: null,
    unit: "per_guest",
    per_space_prices: null,
    applies_to: "all",
    path_ids: ["hall-rental-only"],
    condition: null,
    priceable: true,
    tax_pct_override: null,
    min_guests: null,
    as_stated_price: `$${dw.perGuest}/guest`,
    note: null,
    quote: `$${dw.perGuest}/guest`,
    source_url: d.addOnsResources[0].url,
    snapshot_id: null,
  }));
  const barAddOns: AddOn[] = d.barPackages.map((b) => ({
    id: `bar-${slugify(b.name)}`,
    name: `Bar: ${b.name}`,
    category: "Food & beverage add-ons",
    variant: b.name,
    group: "fb",
    price: b.price5hr,
    price_max: null,
    unit: "per_guest",
    per_space_prices: null,
    applies_to: "all",
    path_ids: ["hall-rental-only"],
    condition: null,
    priceable: true,
    tax_pct_override: null,
    min_guests: d.barPackagesMinGuests,
    as_stated_price: `$${b.price4hr}/guest (4hr) or $${b.price5hr}/guest (5hr)`,
    note: b.note,
    quote: b.includes,
    source_url: d.menuResources.find((m) => m.type === "beverage")!.url,
    snapshot_id: null,
  }));
  // Extra hour: modeled at Saturday's own rate (the default/most common wedding day); the
  // cheaper weekday rate for the same off/peak+servers combination is real but not modeled as
  // its own priced variant here -- see the punch list.
  const extraHourAddOns: AddOn[] = [
    { key: "off-no-servers", price: d.calculatorAddOns.extraHour.offSeason.saturday, label: "Extra hour (off-season, no servers)" },
    { key: "off-with-servers", price: d.calculatorAddOns.extraHour.offSeason.saturdayWithServers, label: "Extra hour (off-season, with servers)" },
    { key: "peak-no-servers", price: d.calculatorAddOns.extraHour.peakSeason.saturday, label: "Extra hour (peak season, no servers)" },
    { key: "peak-with-servers", price: d.calculatorAddOns.extraHour.peakSeason.saturdayWithServers, label: "Extra hour (peak season, with servers)" },
  ].map((e) => ({
    id: `extra-hour-${e.key}`,
    name: e.label,
    category: "Extra hours",
    variant: null,
    group: "other",
    price: e.price,
    price_max: null,
    unit: "flat" as const,
    per_space_prices: null,
    applies_to: "all" as const,
    path_ids: null,
    condition: null,
    priceable: true,
    tax_pct_override: null,
    min_guests: null,
    as_stated_price: `$${e.price}`,
    note: "Weekday rate is lower and not modeled as a separate variant.",
    quote: `$${e.price}`,
    source_url: d.addOnsResources[0].url,
    snapshot_id: null,
  }));

  doc.pricing = emptyPricing({
    archetype: "mixed",
    default_axes: { path_id: "all-inclusive", day: "sat", season: "peak", tier_id: "peak-sat", ceremonyOnSite: false },
    paths: [allInclusivePath, hallOnlyPath],
    rates: { service_charge_pct: null, service_charge_base: null, sales_tax_pct: null, sales_tax_base: null, sales_tax_source: "unknown", cc_fee_pct: null, quote: null, source_url: null, snapshot_id: null },
    add_ons: [...ceremonyAddOns, ...decorAddOns, ...lightingAddOns, ...staffingAddOns, ...foodDrinkExtraAddOns, ...foodPackageAddOns, ...dinnerwareAddOns, ...barAddOns, ...extraHourAddOns],
    required_third_party: [],
    notes: [],
  });
  tagPath(doc, allInclusivePath);
  tagPath(doc, hallOnlyPath);
  tagAddOns(doc);
  tag(doc, "/pricing/rates");

  doc.food_beverage = {
    food_pills: [fact("all_inclusive", "Buffet or plated service", packagesUrl), fact("byo", "you can bring the food of your choice and we'll take care of everything else", faqUrl), fact("a_la_carte", "Food package (Bronze/Silver/Gold)", d.addOnsResources[0].url)],
    bar_pills: [fact("all_inclusive", "Open bar for 4.5 hours", packagesUrl), fact("a_la_carte", "Open Bar, Cash Bar", faqUrl), fact("byo", "you can also bring in your own alcohol", faqUrl)],
    caption: null,
    menus: d.foodMenus.map((menu, i) => ({
      name: menu.cuisine,
      cuisine: menu.cuisine,
      includes: menu.includes,
      cost: menu.cost,
      extras: menu.extras,
      evidence: { source_url: d.menuResources.filter((m) => m.type === "food")[i]?.url ?? site, snapshot_id: null },
    })),
    bar_ladders: d.barPackages.map((b) => ({
      name: b.name,
      includes: b.includes,
      prices: { "4hr": b.price4hr, "5hr": b.price5hr },
      note: b.note,
      evidence: { source_url: d.menuResources.find((m) => m.type === "beverage")!.url, snapshot_id: null },
    })),
    bar_min_guests: d.barPackagesMinGuests,
    notes: [fact(d.barPackagesNote, d.barPackagesNote, d.menuResources.find((m) => m.type === "beverage")!.url)],
  };
  tag(doc, "/food_beverage", "human_only");

  const inclusionMap: { raw: string; label: any; category: any }[] = [
    { raw: "Private bridal suite", label: "Bridal suite", category: "Space" },
    { raw: "Ceremony at no extra charge (within your rental hours)", label: "Ceremony", category: "Space" },
    { raw: "New silver Chiavari chairs", label: "Chairs", category: "Furniture" },
    { raw: "Spacious dance floor", label: "Dance floor", category: "Furniture" },
    { raw: "2 parking lots, 75+ spaces", label: "Parking", category: "Space" },
    { raw: "Handicap accessible", label: "Accessibility", category: "Space" },
  ];
  doc.inclusions = inclusionMap.map((item) => ({ label: item.label, label_raw: item.raw, detail: null, category: item.category, quote: item.raw, source_url: site, snapshot_id: null }));

  doc.faqs = d.faqs.map((q) => ({ question: q.question, answer: q.answer, source_url: faqUrl, snapshot_id: null }));

  doc.resources = [
    ...d.menuResources.map((m, i) => resource({ kind: m.type === "food" ? "menu" : "bar_menu", label: m.label, url: m.url, scope: "venue", embeddable: null, has_text_layer: null, source_url: m.url, id: `menu-${i + 1}` })),
    resource({ kind: "other", label: d.addOnsResources[0].label, url: d.addOnsResources[0].url, scope: "venue", embeddable: null, has_text_layer: null, source_url: d.addOnsResources[0].url }),
    resource({ kind: "virtual_tour", label: "360° Tour", url: d.space.tourUrl, scope: "venue", embeddable: false, has_text_layer: null, source_url: d.space.tourUrl }),
    resource({ kind: "video", label: "Videos", url: d.space.videosUrl, scope: "venue", embeddable: false, has_text_layer: null, source_url: d.space.videosUrl }),
  ];
  for (const a of barAddOns) tag(doc, `/pricing/add_ons/${a.id}`, "human_only"); // sourced from the Bar Packages PDF

  doc.sources = { snapshot_ids: [], pages: d.sourcePages, crawled_at: d.lastVerified };
  return doc;
}

// ===========================================================================
// LondonHouse Chicago — account_id 2785
// ===========================================================================

const CORKAGE_NOTE_LH = "LondonHouse's own bar service is included in every package. Beyond that, you can bring your own wine or liquor for a $50/bottle corkage fee.";

function buildLondonHouse(): VenueDetailsV3 {
  const l = londonhouse;
  const doc = baseDoc("londonhouse-chicago", l.name, l.website);
  const site = l.website;
  const weddingsUrl = "https://londonhousechicago.com/weddings";
  const amenitiesUrl = "https://londonhousechicago.com/amenities";

  doc.spine = spine({
    venue_kind: f("hotel", l.categoryLabel, site),
    setting: f("indoor", l.quickFacts[1].label, amenitiesUrl),
    space_count_bookable: f(2, "Juliette Grand Ballroom and Étoile", weddingsUrl),
    ceremony_on_site: f(true, l.pricing.ceremonyFeeNote, weddingsUrl),
    ceremony_fee: f("extra_fee", l.pricing.ceremonyFeeNote, l.weddingMenuUrl),
    catering: f("exclusive_in_house", l.policies[0].value, weddingsUrl),
    bar: f("byo_with_corkage", CORKAGE_NOTE_LH, site),
    rental_charge_type: f("per_guest_bundled", l.policies[2].detail!, weddingsUrl),
    fb_minimum: f({ applies: true, amount_usd: null, detail: l.policies[3].detail! }, l.pricing.fbMinimum, weddingsUrl),
    service_charge_pct: f(l.pricing.serviceChargePercent, l.policies[4].detail!, weddingsUrl),
    parking: f("valet_paid", l.policies[5].detail!, amenitiesUrl),
    day_of_coordinator: f("included", l.policies[6].detail!, weddingsUrl),
    sales_tax_pct: f(l.pricing.salesTaxPercent, "Wedding packages range from $220 to $300 per person, plus tax and service charge.", weddingsUrl),
    taxes_included_in_rental: f(false, "Wedding packages range from $220 to $300 per person, plus tax and service charge.", weddingsUrl),
    vendor_list_policy: f("preferred_list", l.preferredVendors.requirementNote, weddingsUrl),
    tables_chairs_included: f(true, "Tables: Included for your reception; Chairs: Hotel chairs, included", weddingsUrl),
    linens_included: f(true, "BBJ linen, your choice of 30 colors", weddingsUrl),
    dance_floor_included: f(true, "Dance floor: Included", weddingsUrl),
    pricing_archetype: f("hotel_package", "Wedding packages range from $220 to $300 per person, plus tax and service charge.", weddingsUrl),
    per_guest_from_usd: f(220, "$220 to $300 per person", weddingsUrl),
    per_guest_to_usd: f(300, "$220 to $300 per person", weddingsUrl),
  });
  tagStatedSpine(doc);
  tag(doc, "/spine/ceremony_fee", "human_only"); // the 14 MB wedding-menu PDF, over the crawler's size limit

  doc.about = { text: l.about, evidence: { source_url: weddingsUrl, snapshot_id: null } };

  doc.spaces = [
    {
      id: "juliette",
      name: l.spaces[0].name,
      structure_label: l.spaces[0].level,
      sq_ft: l.spaces[0].sqFt,
      sq_ft_outdoor: null,
      ceiling_ft: null,
      setting: "indoor",
      bookable_separately: true,
      description: fact(l.spaces[0].description, l.spaces[0].description, weddingsUrl),
      includes_summary: l.spaces[0].includesSummary,
      evidence: { source_url: weddingsUrl, snapshot_id: null },
    },
    {
      id: "etoile",
      name: l.spaces[1].name,
      structure_label: l.spaces[1].level,
      sq_ft: l.spaces[1].sqFt,
      sq_ft_outdoor: null,
      ceiling_ft: null,
      setting: "indoor",
      bookable_separately: true,
      description: fact(l.spaces[1].description, l.spaces[1].description, weddingsUrl),
      includes_summary: l.spaces[1].includesSummary,
      evidence: { source_url: weddingsUrl, snapshot_id: null },
    },
  ];

  doc.capacities = [
    { space_id: "juliette", layout: "seated_dinner", min: null, max: l.spaces[0].capacity.seatedDining, as_stated_label: l.capacityLabels.seatedDining, tile: "seated", condition: null, quote: l.spaces[0].capacitySourceNote, source_url: weddingsUrl, snapshot_id: null },
    { space_id: "juliette", layout: "cocktail_standing", min: null, max: l.spaces[0].capacity.standingReception!, as_stated_label: l.capacityLabels.standingReception, tile: "cocktail", condition: null, quote: l.spaces[0].capacitySourceNote, source_url: l.capacityChartUrl, snapshot_id: null },
    { space_id: "etoile", layout: "seated_dinner", min: null, max: l.spaces[1].capacity.seatedDining, as_stated_label: l.capacityLabels.seatedDining, tile: "seated", condition: null, quote: l.spaces[1].capacitySourceNote, source_url: weddingsUrl, snapshot_id: null },
    { space_id: "etoile", layout: "cocktail_standing", min: null, max: l.spaces[1].capacity.standingReception!, as_stated_label: l.capacityLabels.standingReception, tile: "cocktail", condition: null, quote: l.spaces[1].capacitySourceNote, source_url: l.capacityChartUrl, snapshot_id: null },
  ];
  tagCapacities(doc);

  const tier = (p: (typeof l.packages)[number]): PerGuestTier => ({
    id: p.key,
    name: p.name,
    per_guest: p.perGuest,
    day: null,
    season: null,
    inherits_from: p.inclusions[0]?.startsWith("Everything in") ? p.inclusions[0].replace("Everything in ", "") : null,
    inclusions: p.inclusions.filter((i) => !i.startsWith("Everything in")),
    bar_tier: { name: p.bar, hours: p.bar.includes("Four") ? 4 : 5, examples: [] },
    min_guests: null,
    quote: `$${p.perGuest}/guest`,
    source_url: weddingsUrl,
    snapshot_id: null,
  });
  const defaultPath: PricingPath = {
    id: "default",
    name: "Default",
    description: "No separate venue-rental fee; everything is bundled into the per-guest package.",
    applies_to_spaces: "all",
    fixed_fees: [],
    per_guest_tiers: l.packages.map(tier),
    minimums: [],
    required_staffing: null,
    rental_hours: null,
    year_surcharges: [],
    promotions: [],
    quote: "",
    source_url: weddingsUrl,
    snapshot_id: null,
  };

  doc.pricing = emptyPricing({
    archetype: "hotel_package",
    default_axes: { path_id: "default", tier_id: "luxury", ceremonyOnSite: false },
    paths: [defaultPath],
    rates: {
      service_charge_pct: l.pricing.serviceChargePercent,
      service_charge_base: "fb",
      sales_tax_pct: l.pricing.salesTaxPercent,
      sales_tax_base: "fb_and_rentals",
      sales_tax_source: "stated",
      cc_fee_pct: null,
      quote: "Wedding packages range from $220 to $300 per person, plus tax and service charge.",
      source_url: weddingsUrl,
      snapshot_id: null,
    },
    add_ons: [
      { id: "pre-reception-snacks", name: "Pre-reception snacks", category: "Food & beverage", variant: null, group: "fb", price: null, price_max: null, unit: "flat", per_space_prices: null, applies_to: "all", path_ids: null, condition: null, priceable: false, tax_pct_override: null, min_guests: null, as_stated_price: "No published rate", note: l.addOns[0].blurb, quote: l.addOns[0].blurb, source_url: weddingsUrl, snapshot_id: null },
      { id: "late-night-snacks", name: "Late-night snacks", category: "Food & beverage", variant: null, group: "fb", price: null, price_max: null, unit: "flat", per_space_prices: null, applies_to: "all", path_ids: null, condition: null, priceable: false, tax_pct_override: null, min_guests: null, as_stated_price: "No published rate", note: l.addOns[1].blurb, quote: l.addOns[1].blurb, source_url: weddingsUrl, snapshot_id: null },
      { id: "corkage", name: "Corkage fee", category: "Bar", variant: null, group: "fb", price: l.pricing.corkagePerBottle, price_max: null, unit: "per_unit", per_space_prices: null, applies_to: "all", path_ids: null, condition: null, priceable: true, tax_pct_override: l.pricing.salesTaxPercent, min_guests: null, as_stated_price: "$50/bottle", note: l.addOns[2].blurb, quote: l.addOns[2].blurb, source_url: site, snapshot_id: null },
      { id: "ceremony", name: "On-site ceremony fee", category: "Ceremony", variant: null, group: "ceremony", price: l.pricing.ceremonyFee, price_max: null, unit: "flat", per_space_prices: null, applies_to: "all", path_ids: null, condition: "ceremony_on_site", priceable: true, tax_pct_override: l.pricing.ceremonyFeeTaxPercent, min_guests: null, as_stated_price: "$750", note: l.addOns[3].blurb, quote: l.addOns[3].blurb, source_url: l.weddingMenuUrl, snapshot_id: null },
    ],
    required_third_party: [],
    notes: [],
  });
  tagPath(doc, defaultPath);
  tagAddOns(doc);
  tag(doc, "/pricing/add_ons/ceremony", "human_only");
  tag(doc, "/pricing/rates");

  doc.food_beverage = {
    food_pills: [fact("all_inclusive", "In-house only. LondonHouse's own catering team handles all food & beverage.", weddingsUrl)],
    // "byo" is NOT stored here directly -- the corkage add-on above implies it additively via
    // `fbPills()` (derive.ts), same mechanism the plan calls "the LondonHouse fix".
    bar_pills: [fact("all_inclusive", "LondonHouse's own bar service is included in every package.", site)],
    caption: fact(CORKAGE_NOTE_LH, CORKAGE_NOTE_LH, site),
    menus: [],
    bar_ladders: [],
    bar_min_guests: null,
    notes: [fact(l.horsDoeuvresNote, l.horsDoeuvresNote, l.weddingMenuUrl)],
  };
  tag(doc, "/food_beverage/notes/0", "human_only");

  const inclusionCategoryOf: Record<string, any> = { Furniture: "Furniture", Catering: "Catering", Services: "Services", Lodging: "Lodging" };
  doc.inclusions = l.sharedIncludes.flatMap((group) =>
    group.items.map((item) => ({ label: item.label as any, label_raw: item.label, detail: item.detail, category: inclusionCategoryOf[group.category] ?? "Other", quote: item.detail, source_url: weddingsUrl, snapshot_id: null })),
  );

  doc.faqs = l.faqs.map((q) => ({ question: q.question, answer: q.answer, source_url: weddingsUrl, snapshot_id: null }));

  doc.resources = [
    resource({ kind: "brochure", label: "Wedding Brochure", url: l.brochureUrl, scope: "venue", embeddable: true, has_text_layer: true, source_url: l.brochureUrl }),
    resource({ kind: "menu", label: "Wedding Menu", url: l.weddingMenuUrl, scope: "venue", embeddable: true, has_text_layer: null, source_url: l.weddingMenuUrl }),
    resource({ kind: "capacity_sheet", label: "Capacity Chart", url: l.capacityChartUrl, scope: "venue", embeddable: true, has_text_layer: null, source_url: l.capacityChartUrl }),
    resource({ kind: "video", label: "LondonHouse Wedding", url: l.youtubeUrl, scope: "venue", embeddable: true, has_text_layer: null, source_url: l.youtubeUrl }),
  ];

  // preferredVendors correctly omitted as a VendorList: only 1 real name (Bittersweet Bakery)
  // across 4 categories, below the >=2-real-names bar -- the one real relationship is carried
  // instead via `inclusions` (Wedding cake). See the punch list.
  doc.vendor_lists = [];

  doc.sources = { snapshot_ids: [], pages: l.sourcePages, crawled_at: l.lastVerified };
  return doc;
}

// ===========================================================================
// Field Museum — account_id 1131
// ===========================================================================

function buildFieldMuseum(): VenueDetailsV3 {
  const fm = fieldMuseum;
  const doc = baseDoc("field-museum", fm.name, fm.website);
  const site = fm.website;
  const rentalsUrl = "https://www.fieldmuseum.org/landing/venue-rentals";
  const vendorsUrl = "https://www.fieldmuseum.org/plan-your-special-event/approved-vendors";

  doc.spine = spine({
    venue_kind: f("museum", fm.categoryLabel, site),
    setting: f("both", fm.quickFacts[1].note!, site),
    space_count_bookable: f(4, "Stanley Field Hall & Balcony, Outdoor Terraces, East Atrium & Pavilion, Rice Gallery", site),
    // Real, unresolved discrepancy between two of the venue's own pages -- kept `conflicting`,
    // not silently picked (same treatment as Marchetti's payment schedule).
    capacity_min_guests: {
      status: "conflicting",
      candidates: [
        fact(10, "as few as 10 and up to more than 1,000", site),
        fact(20, "from intimate gatherings of 20 to galas of more than 1,000", rentalsUrl),
      ],
    },
    ceremony_on_site: f(true, "We welcome you to host your ceremony and/or cocktail reception outside on our picturesque terrace space.", site),
    catering: f("approved_list_only", fm.quickFacts[2].note!, vendorsUrl),
    bar: f("in_house", fm.quickFacts[3].note!, site),
    rental_charge_type: f("inquire_only", fm.policies[2].value, site),
    parking: f("paid", fm.policies[5].value, vendorsUrl),
    // "Not required; on-site Account Manager provided" -- closest of the 3 real enum values:
    // a form of built-in support is provided, just not a traditional wedding coordinator.
    day_of_coordinator: f("included", fm.faqs[0].answer, site),
    // Judgment call (see report): CATERING_POLICIES has no closed-list value shared with
    // VENDOR_LIST_POLICIES; the venue's own "choose from our approved vendors" wording with no
    // opt-out anywhere is a de facto closed list, so mapped to `required_list` even though the
    // venue never uses the word "required" (matches the concept file's own judgment call).
    vendor_list_policy: f("required_list", fm.vendorsNote, vendorsUrl),
    pricing_archetype: f("inquire_only", "\"Request a Proposal\" is the only path -- the venue publishes zero pricing anywhere.", site),
  });
  tagStatedSpine(doc);

  doc.about = { text: fm.about, evidence: { source_url: site, snapshot_id: null } };

  const parseSqFt = (s: string): number | null => {
    const m = s.match(/^~?([\d,]+)$/);
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
  };
  const parseCeiling = (s: string | null): number | null => {
    if (!s) return null;
    const m = s.match(/^(\d+)\s*ft$/);
    return m ? parseInt(m[1], 10) : null;
  };
  doc.spaces = fm.spaces.map((s) => ({
    id: slugify(s.name),
    name: s.name,
    structure_label: null,
    sq_ft: parseSqFt(s.sqFt),
    sq_ft_outdoor: null,
    ceiling_ft: parseCeiling(s.ceilingHeight),
    setting: s.name === "Outdoor Terraces" ? "outdoor" : "indoor",
    bookable_separately: true,
    description: fact(s.description, s.description, s.sourceUrl),
    includes_summary: null,
    evidence: { source_url: s.sourceUrl, snapshot_id: null },
  }));

  doc.capacities = fm.spaces.flatMap((s) => {
    const id = slugify(s.name);
    const tuples: CapacityTuple[] = [];
    if (s.capacity.seated != null) {
      tuples.push({ space_id: id, layout: "seated_dinner", min: null, max: s.capacity.seated, as_stated_label: fm.capacityLabels.seated, tile: "seated", condition: null, quote: s.description, source_url: s.sourceUrl, snapshot_id: null });
    }
    if (s.capacity.reception != null) {
      tuples.push({ space_id: id, layout: "cocktail_standing", min: null, max: s.capacity.reception, as_stated_label: fm.capacityLabels.reception, tile: "cocktail", condition: null, quote: s.description, source_url: s.sourceUrl, snapshot_id: null });
    }
    return tuples;
  });
  tagCapacities(doc);

  doc.pricing = emptyPricing({
    archetype: "inquire_only",
    paths: [],
    rates: { service_charge_pct: null, service_charge_base: null, sales_tax_pct: null, sales_tax_base: null, sales_tax_source: "unknown", cc_fee_pct: null, quote: null, source_url: null, snapshot_id: null },
    add_ons: [
      { id: "photo-session-daytime", name: "In-museum photography session (daytime)", category: "Photography", variant: "Daytime", group: "other", price: 900, price_max: null, unit: "flat", per_space_prices: null, applies_to: "all", path_ids: null, condition: null, priceable: true, tax_pct_override: null, min_guests: null, as_stated_price: "$900 daytime", note: fm.addOns[0].blurb, quote: fm.addOns[0].price, source_url: site, snapshot_id: null },
      { id: "photo-session-evening", name: "In-museum photography session (evening)", category: "Photography", variant: "Evening", group: "other", price: 1200, price_max: null, unit: "flat", per_space_prices: null, applies_to: "all", path_ids: null, condition: null, priceable: true, tax_pct_override: null, min_guests: null, as_stated_price: "$1,200 evening", note: fm.addOns[0].blurb, quote: fm.addOns[0].price, source_url: site, snapshot_id: null },
    ],
    required_third_party: [],
    notes: [],
  });
  tagAddOns(doc);

  doc.food_beverage = {
    food_pills: [fact("a_la_carte", fm.foodAndBeverage.food, vendorsUrl)],
    bar_pills: [fact("all_inclusive", fm.foodAndBeverage.beverage, site)],
    caption: null,
    menus: [],
    bar_ladders: [],
    bar_min_guests: null,
    notes: [],
  };

  doc.faqs = fm.faqs.map((q) => ({ question: q.question, answer: q.answer, source_url: site, snapshot_id: null }));

  doc.resources = [
    ...fm.foodAndBeverage.beverageResources.map((r, i) => resource({ kind: "bar_menu", label: r.label, url: r.url, scope: "venue", embeddable: null, has_text_layer: null, source_url: r.url, id: `bev-${i + 1}` })),
    ...fm.spaces.map((s) => resource({ kind: "video", label: `${s.name} Video Tour`, url: s.videoUrl, scope: `space:${slugify(s.name)}`, embeddable: null, has_text_layer: null, source_url: s.sourceUrl, id: `video-${slugify(s.name)}` })),
  ];

  doc.vendor_lists = Array.from(new Set(fm.approvedVendors.map((v) => v.category))).map((category) => ({
    label: category,
    category,
    relationship: "approved_required" as const,
    entries: fm.approvedVendors.filter((v) => v.category === category).map((v) => ({ name: v.name, url: v.url, instagram: null })),
    source_url: vendorsUrl,
    snapshot_id: null,
  }));

  doc.press_features = fm.featuredWeddings.map((w) => ({ title: w.title, attribution: w.attribution, url: w.url, source_url: site, snapshot_id: null }));

  doc.sources = { snapshot_ids: [], pages: fm.sourcePages, crawled_at: fm.lastVerified };
  return doc;
}

// ===========================================================================
// The Geraghty — account_id 507
// ===========================================================================

function buildGeraghty(): VenueDetailsV3 {
  const g = geraghty;
  const doc = baseDoc("geraghty", g.name, g.website);
  const site = g.website;
  const faqUrl = "https://thegeraghty.com/faq/";
  const amenitiesUrl = "https://thegeraghty.com/features-amenities/";
  const floorPlansUrl = "https://thegeraghty.com/floor-plans/";

  doc.spine = spine({
    venue_kind: f("event_space", g.categoryLabel, site),
    setting: f("indoor", g.quickFacts[1].note!, site),
    space_count_bookable: f(1, "One open, 25,000 sq ft room... fully reconfigurable for ceremony, reception, and afterparty in the same space.", floorPlansUrl),
    ceremony_on_site: f(true, g.space.description, floorPlansUrl),
    catering: f("preferred_list", g.quickFacts[2].note!, faqUrl),
    bar: f("in_house", g.quickFacts[3].note!, faqUrl),
    rental_charge_type: f("inquire_only", g.policies[2].value, faqUrl),
    parking: f("included", g.policies[5].detail!, faqUrl),
    day_of_coordinator: f("required_hire", g.policies[6].detail!, faqUrl),
    payment_schedule: f({ deposit: "50% deposit of the estimated event total, non-refundable, due with a signed contract to secure the date", balance_due: null }, g.faqs[7].answer, faqUrl),
    event_insurance: f("required", g.policies[9].detail!, faqUrl),
    noise_curfew: f(g.policies[12].value, g.faqs[14].answer, faqUrl),
    vendor_list_policy: f("preferred_list", "Kehoe Designs and BlackOak are exclusive event/production partners; catering is a preferred (not required) list; every other category is fully open.", faqUrl),
    tables_chairs_included: f(true, '(45) 72" round dining tables (linen not included) and (400) lucite chairs', amenitiesUrl),
    linens_included: f(false, "(linen not included)", amenitiesUrl),
    coat_check: f("included", "Coat check included", amenitiesUrl),
    pricing_archetype: f("inquire_only", "Rental prices are quoted upon request.", faqUrl),
  });
  tagStatedSpine(doc);

  doc.about = { text: g.about, evidence: { source_url: "https://thegeraghty.com/about/", snapshot_id: null } };

  doc.spaces = [
    {
      id: "the-geraghty",
      name: g.space.name,
      structure_label: null,
      sq_ft: g.space.sqFt,
      sq_ft_outdoor: null,
      ceiling_ft: 22,
      setting: "indoor",
      bookable_separately: true,
      description: fact(g.space.description, g.space.description, floorPlansUrl),
      includes_summary: null,
      evidence: { source_url: g.space.sourceUrl, snapshot_id: null },
    },
  ];

  doc.capacities = [
    { space_id: "the-geraghty", layout: "seated_with_dance", min: null, max: g.space.capacity.receptionAfterparty!, as_stated_label: g.capacityLabels.receptionAfterparty, tile: "seated_dance", condition: null, quote: g.quickFacts[0].note!, source_url: floorPlansUrl, snapshot_id: null },
  ];
  tagCapacities(doc);

  doc.pricing = emptyPricing({
    archetype: "inquire_only",
    paths: [],
    rates: { service_charge_pct: null, service_charge_base: null, sales_tax_pct: null, sales_tax_base: null, sales_tax_source: "unknown", cc_fee_pct: null, quote: null, source_url: null, snapshot_id: null },
    add_ons: [
      {
        id: "nonprofit-alcohol-donation",
        name: "Nonprofit alcohol donation fee",
        category: "Bar",
        variant: null,
        group: "fb",
        price: 10,
        price_max: null,
        unit: "per_guest",
        per_space_prices: null,
        applies_to: "all",
        path_ids: null,
        condition: "nonprofit_501c3_donated_alcohol",
        priceable: true,
        tax_pct_override: null,
        min_guests: null,
        as_stated_price: "$10/person (or beverage minimum, whichever is greater)",
        note: "501(c)(3)/(4) nonprofits only, donating alcohol for their own event.",
        quote: "The corkage fee is $10 per person or beverage minimum (whichever is greater).",
        source_url: faqUrl,
        snapshot_id: null,
      },
    ],
    required_third_party: [],
    notes: [],
  });
  tagAddOns(doc);

  doc.food_beverage = {
    food_pills: [fact("a_la_carte", g.foodAndBeverage.food, "https://thegeraghty.com/caterers-partners/")],
    bar_pills: [fact("all_inclusive", g.foodAndBeverage.beverage, faqUrl)],
    caption: null,
    menus: [],
    bar_ladders: [],
    bar_min_guests: null,
    notes: [],
  };

  const inclusionCategoryOf: Record<string, any> = { Space: "Space", Furniture: "Furniture", "Entertainment & AV": "Entertainment", Services: "Services", Ambiance: "Ambiance" };
  const canonicalLabel: Record<string, string> = { Sound: "Sound & AV", Staging: "Stage" };
  doc.inclusions = g.sharedIncludes.flatMap((group) =>
    group.items.map((item) => ({
      label: (canonicalLabel[item.label] ?? item.label) as any,
      label_raw: item.label,
      detail: item.detail,
      category: inclusionCategoryOf[group.category] ?? "Other",
      quote: item.detail,
      source_url: amenitiesUrl,
      snapshot_id: null,
    })),
  );

  doc.faqs = g.faqs.map((q) => ({ question: q.question, answer: q.answer, source_url: faqUrl, snapshot_id: null }));

  doc.resources = [
    ...g.space.floorPlans.map((fp, i) => resource({ kind: "floor_plan", label: fp.label, url: fp.imageUrl, scope: "venue", embeddable: null, has_text_layer: null, source_url: floorPlansUrl, id: `floorplan-${i + 1}` })),
    resource({ kind: "virtual_tour", label: "Virtual tour", url: g.space.tourUrl, scope: "venue", embeddable: null, has_text_layer: null, source_url: g.space.tourUrl }),
  ];

  doc.vendor_lists = [
    {
      label: "Built-in Partners",
      category: "Décor & Production",
      relationship: "in_house_partner",
      entries: g.builtInPartners.map((p) => ({ name: p.name, url: p.url, instagram: null })),
      source_url: faqUrl,
      snapshot_id: null,
    },
    {
      label: "Preferred Caterers",
      category: "Catering",
      relationship: "preferred",
      entries: g.preferredCaterers.map((c) => ({ name: c.name, url: c.url, instagram: null })),
      source_url: "https://thegeraghty.com/caterers-partners/",
      snapshot_id: null,
    },
  ];

  doc.sources = { snapshot_ids: [], pages: g.sourcePages, crawled_at: g.lastVerified };
  return doc;
}

// ===========================================================================
// Registry + CLI
// ===========================================================================

const BUILDERS: Record<GoldenSlug, () => VenueDetailsV3> = {
  "galleria-marchetti": buildMarchetti,
  "greenhouse-loft": buildGreenhouseLoft,
  "diamond-garden-banquet-hall": buildDiamondGarden,
  "londonhouse-chicago": buildLondonHouse,
  "field-museum": buildFieldMuseum,
  geraghty: buildGeraghty,
};

const ALL_SLUGS = Object.keys(BUILDERS) as GoldenSlug[];

function parseArgs(argv: string[]) {
  let slug: GoldenSlug | null = null;
  let outDir = "scripts/venue-details/golden";
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--slug") {
      const v = argv[++i];
      if (!ALL_SLUGS.includes(v as GoldenSlug)) throw new Error(`Unknown --slug ${v}. Expected one of: ${ALL_SLUGS.join(", ")}`);
      slug = v as GoldenSlug;
    } else if (arg === "--out-dir") {
      outDir = argv[++i];
    } else if (arg === "--check") {
      check = true;
    } else {
      throw new Error(`Unrecognized argument: ${arg}`);
    }
  }
  return { slug, outDir, check };
}

/** Stable, pretty-printed JSON — object key order is whatever order each builder assigned
 * fields in (insertion order), which is fixed and identical on every run. */
function stringify(doc: VenueDetailsV3): string {
  return JSON.stringify(doc, null, 2) + "\n";
}

function deepDiff(a: unknown, b: unknown, path: string, out: string[]): void {
  if (a === b) return;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
    out.push(`${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    const aArr = Array.isArray(a) ? a : [];
    const bArr = Array.isArray(b) ? b : [];
    if (aArr.length !== bArr.length) out.push(`${path}: length ${aArr.length} !== ${bArr.length}`);
    const len = Math.max(aArr.length, bArr.length);
    for (let i = 0; i < len; i++) deepDiff(aArr[i], bArr[i], `${path}[${i}]`, out);
    return;
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
  for (const key of keys) deepDiff(aObj[key], bObj[key], path ? `${path}.${key}` : key, out);
}

async function main() {
  const { slug, outDir, check } = parseArgs(process.argv.slice(2));
  const slugs = slug ? [slug] : ALL_SLUGS;

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(scriptDir, "..", ".."); // apps/web
  const resolvedOutDir = outDir.startsWith("/") ? outDir : join(repoRoot, outDir);

  let driftFound = false;

  for (const s of slugs) {
    const doc = BUILDERS[s]();
    const json = stringify(doc);
    const filePath = join(resolvedOutDir, `${s}.json`);

    if (check) {
      if (!existsSync(filePath)) {
        console.error(`[MISSING] ${filePath} does not exist — run without --check first.`);
        driftFound = true;
        continue;
      }
      const onDisk = readFileSync(filePath, "utf8");
      if (onDisk === json) {
        console.log(`[OK] ${s}`);
      } else {
        driftFound = true;
        console.error(`[DRIFT] ${s} differs from ${filePath}:`);
        let onDiskParsed: unknown;
        try {
          onDiskParsed = JSON.parse(onDisk);
        } catch {
          onDiskParsed = null;
        }
        const diffs: string[] = [];
        deepDiff(onDiskParsed, doc, "", diffs);
        for (const d of diffs.slice(0, 50)) console.error(`  ${d}`);
        if (diffs.length > 50) console.error(`  ...and ${diffs.length - 50} more`);
      }
    } else {
      mkdirSync(resolvedOutDir, { recursive: true });
      writeFileSync(filePath, json, "utf8");
      console.log(`[WROTE] ${filePath}`);
    }
  }

  if (check && driftFound) process.exit(1);
}

main();
