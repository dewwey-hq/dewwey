/**
 * Pure helpers for `serveVenueDetails.ts` and `rollbackVenueDetails.ts` -- no DB, no network, so
 * they're unit-testable directly. Kept in `scripts/venue-details/serve/` (not `lib/venueDetails/`,
 * which is off-limits for this task) even though they're pure, per the task brief's "pure parts in
 * lib-free helpers inside scripts/venue-details/serve/*.ts, tested" instruction.
 */
import { headlineCapacity } from "../../../lib/venueDetails/derive";
import { isCompareReady } from "../../../lib/venueDetails/tiers";
import { SPINE_TIERS, type VenueDetailsV3, type VenueSpine } from "../../../lib/venueDetails/types";
import type { Change } from "../../../lib/venueDetails/diff";
import type { RunRow } from "../contract";

// ---------------------------------------------------------------------------
// Run selection: latest run (any stage) for a prompt version whose validation
// passes, preferring a repair child over its parent when both validate.
// ---------------------------------------------------------------------------

export function pickRunToServe(runs: RunRow[], opts: { promptVersion: string; allowNeedsReview: boolean }): RunRow | null {
  const candidates = runs.filter((r) => r.prompt_version === opts.promptVersion && r.validation != null);
  const acceptable = candidates.filter((r) => r.validation!.ok || (opts.allowNeedsReview && r.validation!.needs_review));
  if (acceptable.length === 0) return null;

  // A parent whose repair child is ALSO acceptable is superseded by that child; a parent whose
  // repair child failed validation (and so isn't in `acceptable`) remains a candidate itself.
  const parentIds = new Set(acceptable.filter((r) => r.parent_run_id != null).map((r) => r.parent_run_id as number));
  const leaves = acceptable.filter((r) => !parentIds.has(r.id));
  if (leaves.length === 0) return null;

  leaves.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return leaves[0];
}

// ---------------------------------------------------------------------------
// Versioning + provenance
// ---------------------------------------------------------------------------

export function nextVersionNo(prevVersionNo: number | null): number {
  return (prevVersionNo ?? 0) + 1;
}

export interface ProvenanceCarry {
  humanVerifiedAt: string | null;
  verifiedBy: string | null;
}

export function buildProvenance(opts: {
  versionId: number;
  versionNo: number;
  correctionIds: number[];
  carry: ProvenanceCarry;
}): VenueDetailsV3["provenance"] {
  return {
    version_id: opts.versionId,
    version_no: opts.versionNo,
    correction_ids: [...opts.correctionIds].sort((a, b) => a - b),
    human_verified_at: opts.carry.humanVerifiedAt,
    verified_by: opts.carry.verifiedBy,
  };
}

// ---------------------------------------------------------------------------
// last_changed_at: only bumps on a real change (or the first version ever).
// ---------------------------------------------------------------------------

export function computeLastChangedAt(opts: { changes: Change[]; isFirstVersion: boolean; prevLastChangedAt: string | null; now: string }): string | null {
  if (opts.isFirstVersion) return opts.now;
  if (opts.changes.length > 0) return opts.now;
  return opts.prevLastChangedAt;
}

// ---------------------------------------------------------------------------
// Denormalized `venue_details` columns, computed once per serve/rollback so
// the pointer table never drifts from the document it points at.
// ---------------------------------------------------------------------------

export interface DenormalizedColumns {
  headline_seated: number | null;
  headline_seated_dance: number | null;
  headline_cocktail: number | null;
  headline_layout: string | null;
  headline_space_id: string | null;
  cocktail_only: boolean;
  venue_kind: string | null;
  setting: string | null;
  catering: string | null;
  bar: string | null;
  rental_charge_type: string | null;
  pricing_archetype: string | null;
  price_from_usd: number | null;
  per_guest_from_usd: number | null;
  per_guest_to_usd: number | null;
  service_charge_pct: number | null;
  fb_minimum_applies: boolean | null;
  parking: string | null;
  day_of_coordinator: string | null;
  event_insurance: string | null;
  security: string | null;
  noise_curfew: string | null;
  spine_stated_count: number;
  critical_stated_count: number;
  compare_ready: boolean;
  needs_review: boolean;
  review_reasons: string[];
}

/** Each spine field's Tri<T> has a different T, so this is deliberately loosely typed on input
 * (every call site casts the result to the concrete type it expects) rather than fighting
 * TypeScript's inability to narrow a `Tri<VenueSpine[K]>` union by key. */
function scalarOrNull<T>(tri: { status: string; value?: unknown }): T | null {
  return tri.status === "stated" ? ((tri.value as T) ?? null) : null;
}

/** Counts a spine key as "stated" for the two stated-count columns per the plan ("stated +
 * conflicting") -- a conflicting field is a real, sourced disagreement, not a gap. */
function countStated(spine: VenueSpine, keys: (keyof VenueSpine)[]): number {
  return keys.filter((k) => spine[k].status === "stated" || spine[k].status === "conflicting").length;
}

export interface ComputeDenormalizedInputs {
  criticalGroundingFailures: number;
  needsReview: boolean;
  reviewReasons: string[];
}

export function computeDenormalizedColumns(d: VenueDetailsV3, inputs: ComputeDenormalizedInputs): DenormalizedColumns {
  const hc = headlineCapacity(d);
  const spine = d.spine;
  const allKeys = Object.keys(SPINE_TIERS) as (keyof VenueSpine)[];
  const criticalKeys = allKeys.filter((k) => SPINE_TIERS[k] === "critical");

  const compareReady = isCompareReady(d, { criticalGroundingFailures: inputs.criticalGroundingFailures, needsReview: inputs.needsReview });

  const seatedTile = hc.tiles.find((t) => t.tile === "seated") ?? null;
  const seatedDanceTile = hc.tiles.find((t) => t.tile === "seated_dance") ?? null;
  const cocktailTile = hc.tiles.find((t) => t.tile === "cocktail") ?? null;

  const fbMinimum = scalarOrNull<{ applies: boolean; amount_usd: number | null; detail: string | null }>(spine.fb_minimum);

  return {
    headline_seated: seatedTile?.max ?? null,
    headline_seated_dance: seatedDanceTile?.max ?? null,
    headline_cocktail: cocktailTile?.max ?? null,
    headline_layout: hc.headline_layout,
    headline_space_id: hc.headline_space_id,
    cocktail_only: hc.cocktail_only,
    venue_kind: scalarOrNull(spine.venue_kind),
    setting: scalarOrNull(spine.setting),
    catering: scalarOrNull(spine.catering),
    bar: scalarOrNull(spine.bar),
    rental_charge_type: scalarOrNull(spine.rental_charge_type),
    pricing_archetype: scalarOrNull(spine.pricing_archetype),
    price_from_usd: scalarOrNull(spine.price_from_usd),
    per_guest_from_usd: scalarOrNull(spine.per_guest_from_usd),
    per_guest_to_usd: scalarOrNull(spine.per_guest_to_usd),
    service_charge_pct: scalarOrNull(spine.service_charge_pct),
    fb_minimum_applies: fbMinimum ? fbMinimum.applies : null,
    parking: scalarOrNull(spine.parking),
    day_of_coordinator: scalarOrNull(spine.day_of_coordinator),
    event_insurance: scalarOrNull(spine.event_insurance),
    security: scalarOrNull(spine.security),
    noise_curfew: scalarOrNull(spine.noise_curfew),
    spine_stated_count: countStated(spine, allKeys),
    critical_stated_count: countStated(spine, criticalKeys),
    compare_ready: compareReady,
    needs_review: inputs.needsReview,
    review_reasons: inputs.reviewReasons,
  };
}

// ---------------------------------------------------------------------------
// Diff summary for --dry-run printouts (count by kind + first 10 paths).
// ---------------------------------------------------------------------------

export interface ChangesSummary {
  total: number;
  byKind: Record<Change["kind"], number>;
  firstPaths: string[];
}

export function summarizeChanges(changes: Change[]): ChangesSummary {
  const byKind: Record<Change["kind"], number> = { added: 0, changed: 0, removed: 0 };
  for (const c of changes) byKind[c.kind]++;
  return { total: changes.length, byKind, firstPaths: changes.slice(0, 10).map((c) => c.field_path) };
}
