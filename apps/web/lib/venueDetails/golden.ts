import type { VenueDetailsV3 } from "./types";

import galleriaMarchettiJson from "../../scripts/venue-details/golden/galleria-marchetti.json";
import greenhouseLoftJson from "../../scripts/venue-details/golden/greenhouse-loft.json";
import diamondGardenBanquetHallJson from "../../scripts/venue-details/golden/diamond-garden-banquet-hall.json";
import londonhouseChicagoJson from "../../scripts/venue-details/golden/londonhouse-chicago.json";
import fieldMuseumJson from "../../scripts/venue-details/golden/field-museum.json";
import geraghtyJson from "../../scripts/venue-details/golden/geraghty.json";

/**
 * Golden-set registry (D060 Phase 1a). The six hand-built concept venues converted into
 * VenueDetailsV3 fixtures by `scripts/venue-details/importGoldenSet.ts`, committed as JSON under
 * `scripts/venue-details/golden/<slug>.json`, and statically imported here so `/lab/venue?golden=`
 * works in any environment. They are (a) the eval truth for `scoreAgainstGolden.ts` and (b) the
 * proof that the generic renderer loses no fact vs the hand pages.
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

const REGISTRY: Record<GoldenSlug, VenueDetailsV3> = {
  "galleria-marchetti": galleriaMarchettiJson as unknown as VenueDetailsV3,
  "greenhouse-loft": greenhouseLoftJson as unknown as VenueDetailsV3,
  "diamond-garden-banquet-hall": diamondGardenBanquetHallJson as unknown as VenueDetailsV3,
  "londonhouse-chicago": londonhouseChicagoJson as unknown as VenueDetailsV3,
  "field-museum": fieldMuseumJson as unknown as VenueDetailsV3,
  geraghty: geraghtyJson as unknown as VenueDetailsV3,
};

export function isGoldenSlug(s: string): s is GoldenSlug {
  return (GOLDEN_SLUGS as readonly string[]).includes(s);
}

export function getGolden(slug: string): VenueDetailsV3 | null {
  return isGoldenSlug(slug) ? (REGISTRY[slug] ?? null) : null;
}
