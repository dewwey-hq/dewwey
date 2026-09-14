/**
 * Shared DB-writing core for `serveVenueDetails.ts` and `rollbackVenueDetails.ts`: insert one
 * `venue_details_versions` row and upsert the `venue_details` pointer + denormalized columns from
 * it. Both callers compute their own `details`/`changes`/`reason` first (a fresh extraction vs a
 * copy of a prior version) and then share this one write path so the pointer table can never drift
 * out of sync between the two entry points. Not itself unit-tested (DB-touching); the pure pieces
 * it calls (`computeDenormalizedColumns`, `buildProvenance`) are tested in `computeServeRow.test.ts`.
 */
import type { PoolClient } from "pg";
import type { VenueDetailsV3 } from "../../../lib/venueDetails/types";
import type { Change } from "../../../lib/venueDetails/diff";
import { buildProvenance, computeDenormalizedColumns, type ProvenanceCarry } from "./computeServeRow";

export type VersionReason = "extract" | "repair" | "correction" | "rollback" | "prompt_bump" | "legacy_import";

export interface PersistVersionInput {
  accountId: number;
  versionNo: number;
  details: VenueDetailsV3; // pre-correction-merge document (provenance overwritten below)
  runId: number | null;
  correctionIds: number[];
  changes: Change[];
  reason: VersionReason;
  batchId: string;
  createdBy: string;
  rollbackOfVersionId: number | null;
  promptVersion: string | null;
  criticalGroundingFailures: number;
  needsReview: boolean;
  reviewReasons: string[];
  provenanceCarry: ProvenanceCarry;
  humanVerifiedAt: string | null;
  verifiedVersionId: number | null;
  lastCheckedAt: string;
  lastChangedAt: string | null;
  websiteUrl: string | null;
}

export async function persistVersion(client: PoolClient, input: PersistVersionInput): Promise<{ versionId: number }> {
  const denorm = computeDenormalizedColumns(input.details, {
    criticalGroundingFailures: input.criticalGroundingFailures,
    needsReview: input.needsReview,
    reviewReasons: input.reviewReasons,
  });

  const { rows: versionRows } = await client.query<{ id: number }>(
    `insert into venue_details_versions (account_id, version_no, details, run_id, correction_ids, changes, reason, rollback_of_version_id, batch_id, created_by)
     values ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7, $8, $9, $10)
     returning id`,
    [
      input.accountId,
      input.versionNo,
      JSON.stringify(input.details),
      input.runId,
      input.correctionIds,
      JSON.stringify(input.changes),
      input.reason,
      input.rollbackOfVersionId,
      input.batchId,
      input.createdBy,
    ]
  );
  const versionId = versionRows[0].id;

  const provenance = buildProvenance({ versionId, versionNo: input.versionNo, correctionIds: input.correctionIds, carry: input.provenanceCarry });
  await client.query(`update venue_details_versions set details = jsonb_set(details, '{provenance}', $2::jsonb) where id = $1`, [
    versionId,
    JSON.stringify(provenance),
  ]);

  await client.query(
    `insert into venue_details (
       account_id, current_version_id, schema_version, prompt_version,
       headline_seated, headline_seated_dance, headline_cocktail, headline_layout, headline_space_id, cocktail_only,
       venue_kind, setting, catering, bar, rental_charge_type, pricing_archetype,
       price_from_usd, per_guest_from_usd, per_guest_to_usd, service_charge_pct, fb_minimum_applies,
       parking, day_of_coordinator, event_insurance, security, noise_curfew,
       spine_stated_count, critical_stated_count, compare_ready, needs_review, review_reasons,
       human_verified_at, verified_version_id, last_checked_at, last_changed_at, website_url, batch_id, served_at
     ) values (
       $1,$2,3,$3,
       $4,$5,$6,$7,$8,$9,
       $10,$11,$12,$13,$14,$15,
       $16,$17,$18,$19,$20,
       $21,$22,$23,$24,$25,
       $26,$27,$28,$29,$30,
       $31,$32,$33,$34,$35,$36,now()
     )
     on conflict (account_id) do update set
       current_version_id = excluded.current_version_id,
       prompt_version = excluded.prompt_version,
       headline_seated = excluded.headline_seated,
       headline_seated_dance = excluded.headline_seated_dance,
       headline_cocktail = excluded.headline_cocktail,
       headline_layout = excluded.headline_layout,
       headline_space_id = excluded.headline_space_id,
       cocktail_only = excluded.cocktail_only,
       venue_kind = excluded.venue_kind,
       setting = excluded.setting,
       catering = excluded.catering,
       bar = excluded.bar,
       rental_charge_type = excluded.rental_charge_type,
       pricing_archetype = excluded.pricing_archetype,
       price_from_usd = excluded.price_from_usd,
       per_guest_from_usd = excluded.per_guest_from_usd,
       per_guest_to_usd = excluded.per_guest_to_usd,
       service_charge_pct = excluded.service_charge_pct,
       fb_minimum_applies = excluded.fb_minimum_applies,
       parking = excluded.parking,
       day_of_coordinator = excluded.day_of_coordinator,
       event_insurance = excluded.event_insurance,
       security = excluded.security,
       noise_curfew = excluded.noise_curfew,
       spine_stated_count = excluded.spine_stated_count,
       critical_stated_count = excluded.critical_stated_count,
       compare_ready = excluded.compare_ready,
       needs_review = excluded.needs_review,
       review_reasons = excluded.review_reasons,
       human_verified_at = excluded.human_verified_at,
       verified_version_id = excluded.verified_version_id,
       last_checked_at = excluded.last_checked_at,
       last_changed_at = excluded.last_changed_at,
       website_url = excluded.website_url,
       batch_id = excluded.batch_id,
       served_at = now()`,
    [
      input.accountId,
      versionId,
      input.promptVersion,
      denorm.headline_seated,
      denorm.headline_seated_dance,
      denorm.headline_cocktail,
      denorm.headline_layout,
      denorm.headline_space_id,
      denorm.cocktail_only,
      denorm.venue_kind,
      denorm.setting,
      denorm.catering,
      denorm.bar,
      denorm.rental_charge_type,
      denorm.pricing_archetype,
      denorm.price_from_usd,
      denorm.per_guest_from_usd,
      denorm.per_guest_to_usd,
      denorm.service_charge_pct,
      denorm.fb_minimum_applies,
      denorm.parking,
      denorm.day_of_coordinator,
      denorm.event_insurance,
      denorm.security,
      denorm.noise_curfew,
      denorm.spine_stated_count,
      denorm.critical_stated_count,
      denorm.compare_ready,
      denorm.needs_review,
      denorm.review_reasons,
      input.humanVerifiedAt,
      input.verifiedVersionId,
      input.lastCheckedAt,
      input.lastChangedAt,
      input.websiteUrl,
      input.batchId,
    ]
  );

  return { versionId };
}
