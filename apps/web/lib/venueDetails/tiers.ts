/**
 * The two named bars (`compare_ready` and `excellent`, plan §"Spine tiers...") plus the critical
 * field-path list the golden scorer and validator weight most heavily.
 */

import { defaultAxes, estimateCost, headlineCapacity } from "./derive";
import { SPINE_TIERS, type VenueDetailsV3, isStated } from "./types";

export interface CompareReadyInputs {
  criticalGroundingFailures: number;
  needsReview: boolean;
}

/** Safe to put next to another venue on the checklist: headline seated capacity stated AND
 * catering AND bar AND pricing_archetype stated (`inquire_only` counts — "they don't publish a
 * number" is itself a comparable fact) AND zero critical grounding failures AND not needs_review.
 * Important/secondary gaps never block. */
export function isCompareReady(d: VenueDetailsV3, inputs: CompareReadyInputs): boolean {
  if (inputs.needsReview) return false;
  if (inputs.criticalGroundingFailures > 0) return false;
  if (headlineCapacity(d).headline == null) return false;
  if (!isStated(d.spine.catering)) return false;
  if (!isStated(d.spine.bar)) return false;
  if (!isStated(d.spine.pricing_archetype)) return false;
  return true;
}

export interface ExcellentInputs {
  compareReady: boolean;
  humanVerified: boolean;
}

/** `compare_ready` AND (human_verified_at OR a filled cost path: at least one pricing path, and
 * `estimateCost` on the default axes returns a total, not `no_path`). */
export function isExcellent(d: VenueDetailsV3, inputs: ExcellentInputs): boolean {
  if (!inputs.compareReady) return false;
  if (inputs.humanVerified) return true;
  if (d.pricing.paths.length < 1) return false;
  const estimate = estimateCost(d, defaultAxes(d));
  return !estimate.warnings.includes("no_path");
}

/** Critical spine keys + the headline capacity tuple(s) + the numbers that feed `estimateCost`
 * on the default path/axes (its fixed fees, per-guest tiers, minimums, and rates) — the field
 * paths the validator/scorer weight at the "100% grounded or not_stated" bar. */
export function criticalFieldPaths(d: VenueDetailsV3): string[] {
  const paths: string[] = [];

  for (const key of Object.keys(SPINE_TIERS) as (keyof typeof SPINE_TIERS)[]) {
    if (SPINE_TIERS[key] === "critical") paths.push(`/spine/${key}`);
  }

  const hc = headlineCapacity(d);
  if (hc.headline_space_id != null && hc.headline_layout != null) {
    paths.push(`/capacities/${hc.headline_space_id}:${hc.headline_layout}`);
  }

  const axes = defaultAxes(d);
  const path = d.pricing.paths.find((p) => p.id === axes.path_id) ?? d.pricing.paths[0];
  if (path) {
    for (const f of path.fixed_fees) paths.push(`/pricing/paths/${path.id}/fixed_fees/${f.key}`);
    for (const t of path.per_guest_tiers) paths.push(`/pricing/paths/${path.id}/per_guest_tiers/${t.id}`);
    for (const m of path.minimums) paths.push(`/pricing/paths/${path.id}/minimums/${m.kind}:${m.day}:${m.season}`);
  }
  paths.push("/pricing/rates");

  return paths;
}
