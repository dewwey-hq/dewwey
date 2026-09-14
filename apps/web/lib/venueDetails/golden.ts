import type { VenueDetailsV3 } from "./types";

/**
 * Golden-set registry (D060 Phase 1a). The six hand-built concept venues converted into
 * VenueDetailsV3 fixtures by `scripts/venue-details/importGoldenSet.ts`, committed as JSON under
 * `scripts/venue-details/golden/<slug>.json`, and statically imported here so `/lab/venue?golden=`
 * works in any environment. They are (a) the eval truth for `scoreAgainstGolden.ts` and (b) the
 * proof that the generic renderer loses no fact vs the hand pages.
 *
 * STUB: the importer replaces `REGISTRY` with static JSON imports once the fixtures exist.
 */
export const GOLDEN_SLUGS = [
  "galleria-marchetti",
  "greenhouse-loft",
  "diamond-garden-banquet-hall",
  "londonhouse-chicago",
  "field-museum",
  "geraghty",
] as const;
export type GoldenSlug = (typeof GOLDEN_SLUGS)[number];

/** Canonical accounts.id per golden venue (verified against the live DB 2026-09-13; the concept
 * files' `vendorId`s point at unrelated re-keyed `vendors` rows and must not be used). */
export const GOLDEN_ACCOUNT_IDS: Record<GoldenSlug, number> = {
  "galleria-marchetti": 31,
  "greenhouse-loft": 477,
  "diamond-garden-banquet-hall": 27389,
  "londonhouse-chicago": 2785,
  "field-museum": 1131,
  geraghty: 507,
};

const REGISTRY: Partial<Record<GoldenSlug, VenueDetailsV3>> = {};

export function isGoldenSlug(s: string): s is GoldenSlug {
  return (GOLDEN_SLUGS as readonly string[]).includes(s);
}

export function getGolden(slug: string): VenueDetailsV3 | null {
  return isGoldenSlug(slug) ? (REGISTRY[slug] ?? null) : null;
}
