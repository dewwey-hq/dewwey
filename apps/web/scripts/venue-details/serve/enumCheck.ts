/**
 * Pure enum-validity check for `addCorrection.ts` -- a correction that sets a spine field to a
 * value outside its closed enum is a data-entry bug, not a new fact, so it's caught before the
 * append-only insert rather than silently corrupting `venue_details_current`.
 */
import {
  BAR_POLICIES,
  CATERING_POLICIES,
  CEREMONY_FEE_POLICIES,
  COAT_CHECK,
  COORDINATOR_POLICIES,
  INSURANCE_POLICIES,
  PARKING_POLICIES,
  PRICING_ARCHETYPES,
  RENTAL_CHARGE_TYPES,
  SECURITY_POLICIES,
  SETTINGS,
  VENDOR_LIST_POLICIES,
  VENUE_KINDS,
} from "../../../lib/venueDetails/types";

/** Spine keys whose stated `value` is a closed enum (the rest are numbers/booleans/strings/objects,
 * which this check doesn't constrain -- `addCorrection.ts` still requires valid JSON for those). */
export const SPINE_ENUM_VALUES: Partial<Record<string, readonly string[]>> = {
  venue_kind: VENUE_KINDS,
  setting: SETTINGS,
  catering: CATERING_POLICIES,
  bar: BAR_POLICIES,
  rental_charge_type: RENTAL_CHARGE_TYPES,
  parking: PARKING_POLICIES,
  day_of_coordinator: COORDINATOR_POLICIES,
  event_insurance: INSURANCE_POLICIES,
  security: SECURITY_POLICIES,
  vendor_list_policy: VENDOR_LIST_POLICIES,
  coat_check: COAT_CHECK,
  ceremony_fee: CEREMONY_FEE_POLICIES,
  pricing_archetype: PRICING_ARCHETYPES,
};

export interface EnumCheckResult {
  ok: boolean;
  reason: string | null;
}

/** `fieldPath` is a stable field_path (`/spine/<key>`, ...); only `/spine/<key>` paths whose key is
 * in `SPINE_ENUM_VALUES` are checked -- everything else passes (out of scope for this check). */
export function checkEnumValidity(fieldPath: string, value: unknown): EnumCheckResult {
  const parts = fieldPath.split("/").filter(Boolean);
  if (parts[0] !== "spine") return { ok: true, reason: null };
  const key = parts[1];
  const allowed = SPINE_ENUM_VALUES[key];
  if (!allowed) return { ok: true, reason: null };
  if (typeof value !== "string" || !allowed.includes(value)) {
    return { ok: false, reason: `"${String(value)}" is not a valid value for /spine/${key} (expected one of: ${allowed.join(", ")})` };
  }
  return { ok: true, reason: null };
}
