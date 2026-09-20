/**
 * The rubric's 15-venue must-not floor as assertion fixtures (plan, "Calibration slate" + task
 * brief deliverable 5). These are NOT V3 goldens -- no hand-authored VenueDetailsV3 document, just
 * the set of must-not assertions each venue is known to implicate, resolved against the LIVE
 * document at score time by `scoreAgainstGolden.ts --mustnot` (a thin/empty crawl passes trivially).
 *
 * `vendor_id_legacy` is `docs/engineering/venue-enrichment/quality-rubric.md`'s eval-slate id (the
 * OLD `venue_enrichment`/legacy vendor numbering, not `accounts.id`) -- resolved to a real
 * `accounts.id` at runtime by `resolveMustNotAccountIds` (by `vendors.id` match, falling back to a
 * name ILIKE, with `--account-map <csv>` as a manual override for anything that doesn't resolve
 * cleanly).
 */
import type { MustNotAssertion } from "./check";

export interface MustNotFixture {
  account_hint: string; // a human-readable handle/name hint for the CSV override + logs
  vendor_id_legacy: number;
  assertions: MustNotAssertion[];
}

// Universal assertions every one of the 15 gets (plan: "the subset the rubric's failure-mode table
// actually implicates plus the universal ones: generic-label, duplicate, summed rooms, ADR, junk
// vendors"). Exported so `mustnot/checkUniversal.ts` can run this same six-assertion floor against
// arbitrary fill-loop venues that have no must-not fixture of their own.
export const UNIVERSAL: MustNotAssertion[] = [
  { kind: "no_generic_label_space" },
  { kind: "no_duplicate_space" },
  { kind: "no_summed_rooms" },
  { kind: "no_adr_price" },
  { kind: "no_junk_vendor_names" },
  { kind: "capacity_headline_not_null_if_site_states" },
];

export const MUST_NOT_ASSERTIONS: Record<string, MustNotFixture> = {
  "galleria-marchetti": {
    account_hint: "galleriamarchetti",
    vendor_id_legacy: 7,
    // Multi-space loft + fee schedule -- gold spaces/fee_schedule pattern, no known extra failure mode.
    assertions: [...UNIVERSAL, { kind: "no_amalgam_capacity_range" }],
  },
  geraghty: {
    account_hint: "thegeraghty",
    vendor_id_legacy: 16,
    // Confirmed pattern: multi-event-type page confusion (gala floor plan surfacing over wedding ones).
    assertions: [...UNIVERSAL, { kind: "no_gala_floor_plan_when_wedding_exists" }, { kind: "no_amalgam_capacity_range" }],
  },
  chez: {
    account_hint: "chezweddingvenue",
    vendor_id_legacy: 11,
    // Huge preferred-vendor list -- the vendor-precision stress test (31% sluggy-name baseline).
    assertions: [...UNIVERSAL],
  },
  "the-joinery": {
    account_hint: "thejoinery",
    vendor_id_legacy: 99,
    assertions: [...UNIVERSAL, { kind: "no_amalgam_capacity_range" }],
  },
  "the-drake-hotel": {
    account_hint: "thedrakehotel",
    vendor_id_legacy: 478,
    // Hotel capacity tables + guest-room ADR contamination risk.
    assertions: [...UNIVERSAL, { kind: "no_hotel_faq_majority" }, { kind: "no_amalgam_capacity_range" }],
  },
  adler: {
    account_hint: "adlerplanetarium",
    vendor_id_legacy: 480,
    // Museum + many spaces; confirmed junk-vendor pattern (filming/TV credits) already fixed but
    // regression-checked here.
    assertions: [...UNIVERSAL],
  },
  "chicago-botanic-garden": {
    account_hint: "chicagobotanicgarden",
    vendor_id_legacy: 481,
    assertions: [...UNIVERSAL, { kind: "no_amalgam_capacity_range" }],
  },
  langham: {
    account_hint: "thelanghamchicago",
    vendor_id_legacy: 483,
    // Confirmed generic-label fake space ("Wedding Venues" as if a room) + hotel SPA thin-crawl edge.
    assertions: [...UNIVERSAL, { kind: "no_hotel_faq_majority" }],
  },
  peninsula: {
    account_hint: "thepeninsulachicago",
    vendor_id_legacy: 484,
    // Landmark-named-room false-positive risk lives in the renderer/manual-review, not an
    // automated assertion here -- still gets the hotel-FAQ check as a luxury hotel.
    assertions: [...UNIVERSAL, { kind: "no_hotel_faq_majority" }],
  },
  "chicago-athletic-association": {
    account_hint: "chicagoathleticassociation",
    vendor_id_legacy: 492,
    // THE confirmed hotel-FAQ-contamination archetype (100% generic hotel-guest FAQs, sampled).
    assertions: [...UNIVERSAL, { kind: "no_hotel_faq_majority" }],
  },
  "four-seasons": {
    account_hint: "fourseasonschicago",
    vendor_id_legacy: 494,
    // Confirmed cross-page duplicate space ("Delaware" + "Delaware Room", 7/104 corpus rate).
    assertions: [...UNIVERSAL, { kind: "no_hotel_faq_majority" }],
  },
  londonhouse: {
    account_hint: "lhchicago",
    vendor_id_legacy: 506,
    assertions: [...UNIVERSAL, { kind: "no_hotel_faq_majority" }],
  },
  wrigley: {
    account_hint: "wrigleyfield",
    vendor_id_legacy: 519,
    // Known-bad-amenities + junk-vendor regression case (kept deliberately as a regression fixture).
    assertions: [...UNIVERSAL],
  },
  "river-roast": {
    account_hint: "riverroast",
    vendor_id_legacy: 525,
    // PDF-only capacity/pricing archetype -- amalgam-range risk when a real per-room table only
    // exists in a linked PDF and prose gets used instead.
    assertions: [...UNIVERSAL, { kind: "no_amalgam_capacity_range" }],
  },
  "greenhouse-loft": {
    account_hint: "greenhouseloft",
    vendor_id_legacy: 1,
    // The one-area-as-two-spaces pattern: Loft/Skygarden/Art Gallery must be ONE bookable space.
    assertions: [...UNIVERSAL, { kind: "no_split_single_area", areaNames: ["Loft", "Skygarden", "Art Gallery"] }],
  },
};

export const MUST_NOT_SLUGS = Object.keys(MUST_NOT_ASSERTIONS);
