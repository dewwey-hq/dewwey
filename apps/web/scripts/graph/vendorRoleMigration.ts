/**
 * Pure helpers for migrateVendorRolesV2.ts, split out so they're importable from tests without
 * triggering that script's DB-backed main() -- same rationale/shape as discoveredVenueLeads.ts
 * (resolveDiscoveredVenues.ts) and accountRoleTags.ts (refreshAccountRoleTagsFromWeddings.ts).
 * No DB access here; every DB-shaped fact a function below needs is passed in as a plain
 * argument, resolved by the caller first. See docs/decisions.md D056 and the plan file's
 * "Execution -- Stage 2" / "Stage 2b" / "Protecting venues that are already right" sections.
 */

// ---------------------------------------------------------------------------
// Protected-set predicate (plan: "Protecting venues that are already right", hard stop 1).
// A wedding is protected when ANY of its posts has a human THIS_VENUE verdict, ANY of its posts
// has a human_post_labels row, ANY of its posts is anchored by a jeremy_wedding_candidates row
// whose venue_anchor_source is location_tag/author/extracted, ANY of its posts has an
// extracted_venue_anchors row, its venue account is on either side of an account_aliases pair,
// or its venue account has an account_locations row with source in ('websearch','google_maps').
// A protected wedding may gain credits but never lose/re-role its venue credit or move venue_id
// (except the explicit, separately-gated ceremony+reception case in detectCeremonyReceptionSplit).
// ---------------------------------------------------------------------------

export interface ProtectedWeddingFacts {
  hasHumanThisVenueVerdict: boolean;
  hasHumanPostLabel: boolean;
  hasStructuralVenueAnchor: boolean;
  hasExtractedVenueAnchor: boolean;
  venueIsAliasAccount: boolean;
  venueHasWebVerifiedLocation: boolean;
}

/** Any "human verdict" fact (as opposed to a structural/alias/websearch fact) -- the ceremony/
 * reception venue_id move is refused outright for these (plan: "refuse ... if it would touch a
 * protected wedding whose venue_id came from a human verdict"), not merely logged. */
export function isProtectedByHumanVerdict(facts: ProtectedWeddingFacts): boolean {
  return facts.hasHumanThisVenueVerdict || facts.hasHumanPostLabel;
}

export function isProtectedWedding(facts: ProtectedWeddingFacts): boolean {
  return (
    facts.hasHumanThisVenueVerdict ||
    facts.hasHumanPostLabel ||
    facts.hasStructuralVenueAnchor ||
    facts.hasExtractedVenueAnchor ||
    facts.venueIsAliasAccount ||
    facts.venueHasWebVerifiedLocation
  );
}

// ---------------------------------------------------------------------------
// Hotel rule (plan D, migration step 2d): a `hotel`-role wedding_vendors row becomes `venue`
// when the account IS the wedding's venue_id (the account was BOTH the venue and labeled
// "Hotel:" somewhere -- an all-inclusive hotel-venue), else `accommodations`. `hotel` itself
// stays a venue-category role until this rule runs; it is retired from use afterward, not from
// the enum (D056 decisions: "`hotel` stays in the enum (retired from use, migrated by the rule
// below)").
// ---------------------------------------------------------------------------

export type HotelRuleRole = "venue" | "accommodations";

export function applyHotelRule(accountId: number, weddingVenueId: number | null): HotelRuleRole {
  return accountId === weddingVenueId ? "venue" : "accommodations";
}

// ---------------------------------------------------------------------------
// Ceremony/reception split (plan D/E, migration step 2e): the ONLY case allowed to move
// weddings.venue_id. A wedding's v10 credits contain exactly one `venue @ ceremony` account and
// exactly one, DIFFERENT `venue @ reception` account.
// ---------------------------------------------------------------------------

export interface CreditRoleRow {
  accountId: number;
  role: string; // a D056 VENDOR_ROLES slug
  eventContext: string;
}

export interface CeremonyReceptionSplit {
  ceremonyAccountId: number;
  receptionAccountId: number;
}

export function detectCeremonyReceptionSplit(credits: CreditRoleRow[]): CeremonyReceptionSplit | null {
  const ceremonyVenues = new Set(
    credits.filter((c) => c.role === "venue" && c.eventContext === "ceremony").map((c) => c.accountId)
  );
  const receptionVenues = new Set(
    credits.filter((c) => c.role === "venue" && c.eventContext === "reception").map((c) => c.accountId)
  );
  // Ambiguous (more than one candidate on either side) -- refuse to guess, same discipline as
  // the rest of D052/D055's "never auto-resolve a conflict" rule.
  if (ceremonyVenues.size !== 1 || receptionVenues.size !== 1) return null;
  const [ceremonyAccountId] = ceremonyVenues;
  const [receptionAccountId] = receptionVenues;
  if (ceremonyAccountId === receptionAccountId) return null;
  return { ceremonyAccountId, receptionAccountId };
}

// ---------------------------------------------------------------------------
// Ceremony/reception venue_id move decision (follow-up, coordinator, same day). A protected
// (human-verdict) wedding no longer refuses the whole run: it always gets `ceremony_venue_id`
// set (purely additive), and ONLY an unprotected wedding whose venue_id currently equals the
// ceremony account also moves venue_id to the reception account. A wedding whose venue_id is
// already something other than the ceremony account (the reception account, or a third account
// entirely) needs no move either way -- there was never anything to move.
// ---------------------------------------------------------------------------

export type CeremonyVenueIdDecision = "move" | "protected_ceremony_only" | "no_move_needed";

export function decideCeremonyVenueIdMove(
  venueId: number | null,
  split: CeremonyReceptionSplit,
  protectedByHumanVerdict: boolean
): CeremonyVenueIdDecision {
  if (venueId !== split.ceremonyAccountId) return "no_move_needed";
  return protectedByHumanVerdict ? "protected_ceremony_only" : "move";
}

// ---------------------------------------------------------------------------
// Role-set diff (plan D, migration step 2d): the non-venue-category re-role reconciliation.
// Callers NEVER pass a venue-category role (venue/hotel) through this function -- those are
// handled separately (never touched / the hotel rule above) -- and never call it for an account
// with zero v10 credits on the wedding at all (that bucket is left untouched entirely and
// counted separately -- see migrateVendorRolesV2.ts's header comment for why: the plan's own
// "nothing lost, only relabeled" invariant means an account simply not mentioned by v10 on a
// given wedding is NOT the same claim as v10 actively re-labeling it away from a role).
//
// `unchanged` roles need NO write at all: a plain enum `rename value` (e.g. musician ->
// live_music) changes what an EXISTING row already reads as, with zero data-row churn --
// that's the whole point of doing a rename instead of an UPDATE-every-row pass.
// ---------------------------------------------------------------------------

export interface RoleSetDiff {
  toInsert: string[];
  toDelete: string[];
  unchanged: string[];
}

export function diffRoleSets(existingRoles: string[], creditRoles: string[]): RoleSetDiff {
  const existing = new Set(existingRoles);
  const target = new Set(creditRoles);
  const toInsert = [...target].filter((r) => !existing.has(r));
  const toDelete = [...existing].filter((r) => !target.has(r));
  const unchanged = [...existing].filter((r) => target.has(r));
  return { toInsert, toDelete, unchanged };
}

// ---------------------------------------------------------------------------
// Venue-role evidence anchor bonus (follow-up, coordinator, same day) -- mirrors the identical
// rule the parent added to refreshAccountRoleTagsFromWeddings.ts's `wedding_credit` tag formula:
// for role 'venue' ONLY, evidence_count also counts every wedding the account anchors
// (weddings.venue_id = the account), on top of the ordinary count of weddings crediting it as
// venue. Counted deliberately twice when both are true for the same wedding (a credit AND the
// anchor) -- the point is to keep a real venue's top role from being knocked off by an unrelated
// stray mis-parsed credit (e.g. a "Vanue:" typo landing in `other`), not to produce an exact
// distinct-wedding count.
// ---------------------------------------------------------------------------

export function venueRoleEvidenceCount(role: string, creditWeddingCount: number, anchoredWeddingCount: number): number {
  return role === "venue" ? creditWeddingCount + anchoredWeddingCount : creditWeddingCount;
}
