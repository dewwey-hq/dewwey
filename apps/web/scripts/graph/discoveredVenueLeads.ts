/**
 * Pure helper functions for resolveDiscoveredVenues.ts, split out so they're importable (e.g.
 * from tests) without triggering that script's top-level main() execution -- same rationale as
 * clusteringUtils.ts. No DB access here; every DB-shaped fact a function below needs (does the
 * handle resolve, is there a name match, etc.) is passed in as a plain argument, resolved by the
 * caller first.
 */

/** Lowercase, strip a leading '@', trim. Instagram handles are case-insensitive and the model's
 * venue_handle_guess sometimes carries a leading '@' copied straight out of the caption. */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "");
}

/** lowercase -> strip punctuation -> drop a leading "the " -> collapse whitespace, in that
 * order (per the resolver's spec). Deliberately simpler than buildLocationTagVenueMap.ts's
 * normalize() -- this one does NOT strip trailing city/venue-type suffixes ("Chicago", "Hotel",
 * "Events"), because an over-eager strip here would silently fold two distinct real venues
 * ("The Grand Chicago" / "The Grand Ballroom") into the same lead bucket. Exact-normalized
 * matching only; near-miss detection (isNearMiss below) is the deliberately separate, never-
 * auto-written escape hatch for the variants this leaves on the table. */
export function normalizeVenueName(raw: string): string {
  let s = raw.toLowerCase();
  // Apostrophes join rather than space ("salvatore's" -> "salvatores", not "salvatore s") --
  // everything else that separates words (comma, dash, ampersand, parens, etc.) becomes a space.
  s = s.replace(/['’]/g, "");
  s = s.replace(/[,."&\-–—()!:;]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s.startsWith("the ")) s = s.slice(4);
  return s.trim();
}

/** Tier A's sanity check: does the caption literally credit '@handle' (word-boundary safe, so
 * '@thevenue' doesn't false-positive match a longer '@thevenuepartners' credit)? Case-
 * insensitive, same normalization as normalizeHandle. */
export function captionContainsHandle(caption: string | null | undefined, handle: string): boolean {
  if (!caption) return false;
  const h = normalizeHandle(handle);
  if (!h) return false;
  const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`@${escaped}(?![a-z0-9._])`, "i");
  return re.test(caption);
}

/** Cheap, dependency-free near-miss check for when pg_trgm isn't available (confirmed not
 * installed on this project's Supabase instance, 2026-09-09): one normalized name is a prefix
 * of, or is fully contained in, the other, and they aren't already an exact match. Deliberately
 * conservative in the OTHER direction from a real trigram score -- it will flag some pairs a
 * human would call unrelated, but it will never silently resolve them (near-misses are print-
 * only, see decideTier). */
export function isNearMiss(normA: string, normB: string): boolean {
  if (!normA || !normB) return false;
  if (normA === normB) return false;
  return normA.startsWith(normB) || normB.startsWith(normA) || normA.includes(normB) || normB.includes(normA);
}

export type Tier = "A" | "B" | "C";

export interface TierInput {
  /** venue_handle_guess normalizes and resolves to an existing accounts row (alias-aware). */
  handleResolved: boolean;
  /** the post's own caption literally contains '@'+handle. Irrelevant when handleResolved is false. */
  handleInCaption: boolean;
  /** venue_name normalizes to an EXISTING, single, eligible venue account (accounts.full_name /
   * vendors.name / location_tag_venue_map.location_tag, exact match after normalization, and
   * the account is vendors.category='venue' OR already has >=1 venue-role wedding). */
  nameResolved: boolean;
  /** name normalizes to more than one distinct eligible venue account -- genuinely ambiguous,
   * never auto-resolved (same conservative philosophy as buildLocationTagVenueMap.ts). */
  nameAmbiguous: boolean;
  /** name doesn't resolve, but is a near-miss (isNearMiss) of at least one existing venue name. */
  nameNearMiss: boolean;
}

export interface TierDecision {
  tier: Tier;
  resolvedBy: "handle" | "name" | null;
  /** true iff resolveDiscoveredVenues.ts should write an extracted_venue_anchors row (under --apply). */
  write: boolean;
  /** true iff this post should be surfaced in the hand-pass near-miss report, not written. */
  nearMiss: boolean;
}

/**
 * Given already-resolved facts about one pool-b extraction row, decide which tier it belongs to.
 * Tier A: handle resolves to an existing account AND the caption sanity-checks it (contains
 *   '@handle'). If the handle resolves but the caption doesn't confirm it, this downgrades to a
 *   Tier B attempt on the venue name instead of trusting the model's handle guess blind.
 * Tier B: venue_name resolves, unambiguously, to an existing eligible venue account -> write.
 *   A near-miss (no exact resolution, but a close normalized match) is reported, never written.
 *   An ambiguous exact match (two+ distinct eligible accounts share the normalized name) is
 *   also never written -- same "don't guess" discipline as a near-miss.
 * Tier C: nothing resolves -> new-venue lead (aggregated by the caller, not written by default).
 */
export function decideTier(input: TierInput): TierDecision {
  if (input.handleResolved && input.handleInCaption) {
    return { tier: "A", resolvedBy: "handle", write: true, nearMiss: false };
  }
  if (input.nameResolved && !input.nameAmbiguous) {
    return { tier: "B", resolvedBy: "name", write: true, nearMiss: false };
  }
  if (input.nameAmbiguous || input.nameNearMiss) {
    return { tier: "B", resolvedBy: "name", write: false, nearMiss: true };
  }
  return { tier: "C", resolvedBy: null, write: false, nearMiss: false };
}
