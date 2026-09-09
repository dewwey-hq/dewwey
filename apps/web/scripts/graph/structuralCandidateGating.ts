/**
 * Pure gating logic for createWeddingsFromJeremyEvidence.ts's `--from-confirmed-candidates`
 * mode (D055 Phase 1 step 9). Split out so it's importable from tests without triggering that
 * script's top-level main() execution — same reasoning as clusteringUtils.ts.
 *
 * Encodes three rules, in order:
 *   1. WRONG_VENUE with no `corrected_venue_account_id` is not creatable — the reviewer said
 *      the venue is wrong but didn't say which, so there's nothing to anchor a wedding to.
 *   2. Nothing to attach: `includedPostUrls` (candidate_review_derived.included_post_urls — the
 *      THIS_VENUE-verdict posts only, never OTHER_VENUE) must be non-empty. A candidate reviewed
 *      as WRONG_VENUE has, by construction of candidate_review_derived's decision CASE, zero
 *      THIS_VENUE posts (that's what makes it WRONG_VENUE and not CONFIRM) — so in practice this
 *      is the reason nearly every WRONG_VENUE candidate skips, even one with a correction named.
 *      That's intentional, not a bug: a correction says "the right venue is X" but names no post
 *      of THIS candidate's own that is actually about X, so there's nothing here to build a
 *      wedding from.
 *   3. A human CONFIRM/WRONG_VENUE means "this is a real wedding [at this venue]" — it says
 *      NOTHING about Chicago relevance. That's a separate fact, resolved the same way the
 *      hardcoded-array mode already resolves it (vendors.city='Chicago' -- only when
 *      discovery_source='google_places', D055 2026-09-08: city defaults to 'Chicago' on every
 *      row, docs/jeremy-ddl.sql -- OR account_locations.in_metro=true), OR trusted outright
 *      when the candidate's own chicago_status is already CHICAGO_CONFIRMED (set by clustering
 *      from human_confirmed_post_geography, independent of this review). Never inferred from
 *      the content label itself.
 *
 * All DB lookups (city/in_metro on the effective venue) happen in the caller; this function
 * only combines already-resolved values, so it's trivially unit-testable.
 */

export type StructuralReviewDecision = "CONFIRM" | "WRONG_VENUE";

export type ChicagoStatus = "CHICAGO_CONFIRMED" | "CHICAGO_NOT_CONFIRMED" | "CHICAGO_AMBIGUOUS" | null;

export interface StructuralCandidateGateInput {
  decision: StructuralReviewDecision;
  /** jeremy_wedding_candidates.venue_account_id for this candidate (nullable in the schema). */
  originalVenueAccountId: number | null;
  /** candidate_review_derived.corrected_venue_account_id — only meaningful for WRONG_VENUE. */
  correctedVenueAccountId: number | null;
  /** jeremy_wedding_candidates.chicago_status. */
  chicagoStatus: ChicagoStatus;
  /**
   * vendors.city = 'Chicago' AND vendors.discovery_source = 'google_places' for the EFFECTIVE
   * (possibly corrected) venue account -- D055 (2026-09-08): city defaults to 'Chicago' on
   * every row (docs/jeremy-ddl.sql), so it's only real geography evidence with a verified
   * Places lookup. Caller's responsibility to apply the discovery_source condition before
   * passing this in -- see createWeddingsFromJeremyEvidence.ts's two call sites.
   */
  venueCityIsChicago: boolean;
  /** account_locations.in_metro = true for the EFFECTIVE (possibly corrected) venue account. */
  venueInMetro: boolean;
  /** candidate_review_derived.included_post_urls — THIS_VENUE-verdict posts only. */
  includedPostUrls: string[] | null;
}

export type StructuralCandidateGateReason =
  | "no_venue_account" // defensive: venue_account_id is nullable in the schema, shouldn't happen for a clustered structural candidate
  | "wrong_venue_no_correction"
  | "no_included_posts"
  | "chicago_unconfirmed";

export type StructuralCandidateGateResult =
  | { action: "CREATE"; venueAccountId: number }
  | { action: "SKIP"; reason: StructuralCandidateGateReason };

export function decideStructuralCandidateCreation(
  input: StructuralCandidateGateInput
): StructuralCandidateGateResult {
  let venueAccountId: number | null;
  if (input.decision === "WRONG_VENUE") {
    if (input.correctedVenueAccountId == null) {
      return { action: "SKIP", reason: "wrong_venue_no_correction" };
    }
    venueAccountId = input.correctedVenueAccountId;
  } else {
    venueAccountId = input.originalVenueAccountId;
  }

  if (venueAccountId == null) {
    return { action: "SKIP", reason: "no_venue_account" };
  }

  if (!input.includedPostUrls || input.includedPostUrls.length === 0) {
    return { action: "SKIP", reason: "no_included_posts" };
  }

  const chicagoConfirmed =
    input.chicagoStatus === "CHICAGO_CONFIRMED" || input.venueCityIsChicago || input.venueInMetro;
  if (!chicagoConfirmed) {
    return { action: "SKIP", reason: "chicago_unconfirmed" };
  }

  return { action: "CREATE", venueAccountId };
}
