/**
 * Pricing sanity for the assembled `Pricing` object (post-grounding): ADR (hotel nightly-rate)
 * rejection, plausibility ranges, `corkage_implies_byo`, `fb_min_vs_guest_min` cross-ref,
 * `stated_without_quote` / `conflicting_single_candidate` normalization for the raw tri-state
 * shape (applied earlier, in `assemble.ts`, before a spine field is even considered "stated").
 * Pure -- no DB/network.
 */
import type { AddOn, BarPolicy, FixedFee, Minimum, Rates } from "../../../lib/venueDetails/types";
import type { Issue } from "../contract";
import type { RawTriField } from "../contract";

// ---------------------------------------------------------------------------
// ADR (hotel guest-room / nightly-rate) rejection
// ---------------------------------------------------------------------------

export const ADR_RE = /\bnights?\b|per night|room rate|guest ?rooms?|\bADR\b/i;

export function isAdrQuote(quote: string): boolean {
  return ADR_RE.test(quote);
}

// ---------------------------------------------------------------------------
// Plausibility ranges
// ---------------------------------------------------------------------------

export interface Range {
  min: number;
  max: number;
}

export const PER_GUEST_RANGE: Range = { min: 20, max: 1000 };
export const FLAT_RANGE: Range = { min: 100, max: 100_000 };
export const SERVICE_CHARGE_RANGE: Range = { min: 0, max: 35 };
export const SALES_TAX_RANGE: Range = { min: 0, max: 20 };
export const CC_FEE_RANGE: Range = { min: 0, max: 6 };

export function inRange(value: number, range: Range): boolean {
  return value >= range.min && value <= range.max;
}

// ---------------------------------------------------------------------------
// Raw tri-state normalization (applied before grounding even runs)
// ---------------------------------------------------------------------------

/** A `stated` field with no quote (or an empty one) can't be grounded at all -- treat it as
 * `not_stated` immediately, before spending a grounding check on it. */
export function normalizeStatedWithoutQuote(field: RawTriField): RawTriField {
  if (field.status === "stated" && (!field.quote || field.quote.trim().length === 0)) {
    return { status: "not_stated" };
  }
  return field;
}

/** A `conflicting` field with only one (or zero) candidates isn't actually a conflict --
 * collapse it to `stated` (or `not_stated` if the candidate list is empty). */
export function normalizeConflictingSingleCandidate(field: RawTriField): RawTriField {
  if (field.status === "conflicting") {
    const candidates = field.candidates ?? [];
    if (candidates.length === 0) return { status: "not_stated" };
    if (candidates.length === 1) {
      const c = candidates[0];
      return { status: "stated", value: c.value, quote: c.quote, source_url: c.source_url };
    }
  }
  return field;
}

// ---------------------------------------------------------------------------
// selection_group slug normalization
// ---------------------------------------------------------------------------

/** Normalizes an add-on's `selection_group` to a stable slug (lowercased, non-alnum runs
 * collapsed to a single underscore, trimmed) so two venues' equivalent groups (or a model's own
 * inconsistent casing/spacing across add-ons in the same group) compare equal. Null/empty stays
 * null -- independent extras are never assigned a group. */
export function normalizeSelectionGroupSlug(group: string | null | undefined): string | null {
  if (!group) return null;
  const slug = group
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.length > 0 ? slug : null;
}

// ---------------------------------------------------------------------------
// corkage_implies_byo
// ---------------------------------------------------------------------------

export interface CorkageCheckResult {
  bar: BarPolicy | null;
  issue: Issue | null;
}

/** A corkage add-on plus a bar policy of `in_house` is inconsistent -- corkage IS the BYO carve-
 * out, so the real policy is `byo_with_corkage` (the LondonHouse fix). */
export function checkCorkageImpliesByo(bar: BarPolicy | null, addOns: AddOn[]): CorkageCheckResult {
  const hasCorkage = addOns.some((a) => /corkage/i.test(a.name));
  if (hasCorkage && bar === "in_house") {
    return {
      bar: "byo_with_corkage",
      issue: {
        code: "corkage_implies_byo",
        path: "/spine/bar",
        severity: "warning",
        tier: "critical",
        message: "A corkage add-on implies bar=byo_with_corkage, not in_house.",
      },
    };
  }
  return { bar, issue: null };
}

// ---------------------------------------------------------------------------
// fb_min_vs_guest_min cross-ref
// ---------------------------------------------------------------------------

/** A `guest_minimum` that looks like a dollar figure (implausibly large headcount) or a
 * `fb_minimum` that looks like a guest count (implausibly small dollar amount) usually means the
 * model mislabeled which minimum it read. */
export function checkMinimumKindSanity(minimums: Minimum[], pathId: string): Issue[] {
  const issues: Issue[] = [];
  for (const m of minimums) {
    if (m.kind === "guest_minimum" && m.amount > 1000) {
      issues.push({
        code: "fb_min_vs_guest_min",
        path: `/pricing/paths/${pathId}/minimums/${m.kind}:${m.day}:${m.season}`,
        severity: "warning",
        tier: "important",
        message: `guest_minimum amount ${m.amount} looks like a dollar figure, not a guest count.`,
      });
    }
    if (m.kind === "fb_minimum" && m.amount < 50) {
      issues.push({
        code: "fb_min_vs_guest_min",
        path: `/pricing/paths/${pathId}/minimums/${m.kind}:${m.day}:${m.season}`,
        severity: "warning",
        tier: "important",
        message: `fb_minimum amount ${m.amount} looks like a guest count, not a dollar figure.`,
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Fixed-fee / add-on / rates sanity (ADR + ranges)
// ---------------------------------------------------------------------------

export function sanitizeFixedFees(fees: FixedFee[], pathId: string): { fees: FixedFee[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const kept = fees.filter((f) => {
    if (isAdrQuote(f.quote)) {
      issues.push({ code: "adr_rejected", path: `/pricing/paths/${pathId}/fixed_fees/${f.key}`, severity: "warning", tier: null, message: `Rejected ADR-shaped fee "${f.quote}"` });
      return false;
    }
    if (!inRange(f.amount, FLAT_RANGE)) {
      issues.push({ code: "amount_out_of_range", path: `/pricing/paths/${pathId}/fixed_fees/${f.key}`, severity: "warning", tier: null, message: `Fee amount ${f.amount} outside plausible range` });
      return false;
    }
    return true;
  });
  return { fees: kept, issues };
}

export function sanitizeAddOns(addOns: AddOn[]): { addOns: AddOn[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const kept = addOns.filter((a) => {
    if (isAdrQuote(a.quote)) {
      issues.push({ code: "adr_rejected", path: `/pricing/add_ons/${a.id}`, severity: "warning", tier: "important", message: `Rejected ADR-shaped add-on "${a.quote}"` });
      return false;
    }
    if (a.price != null && a.unit === "per_guest" && !inRange(a.price, PER_GUEST_RANGE)) {
      issues.push({ code: "amount_out_of_range", path: `/pricing/add_ons/${a.id}`, severity: "warning", tier: "important", message: `Add-on per-guest price ${a.price} outside plausible range` });
      return false;
    }
    if (a.price != null && a.unit !== "per_guest" && !inRange(a.price, FLAT_RANGE)) {
      issues.push({ code: "amount_out_of_range", path: `/pricing/add_ons/${a.id}`, severity: "warning", tier: "important", message: `Add-on price ${a.price} outside plausible range` });
      return false;
    }
    return true;
  });
  return { addOns: kept, issues };
}

export function sanitizeRates(rates: Rates): { rates: Rates; issues: Issue[] } {
  const issues: Issue[] = [];
  let next = { ...rates };
  if (next.service_charge_pct != null && !inRange(next.service_charge_pct, SERVICE_CHARGE_RANGE)) {
    issues.push({ code: "amount_out_of_range", path: "/pricing/rates/service_charge_pct", severity: "warning", tier: "critical", message: `service_charge_pct ${next.service_charge_pct} outside plausible range` });
    next = { ...next, service_charge_pct: null };
  }
  if (next.sales_tax_pct != null && !inRange(next.sales_tax_pct, SALES_TAX_RANGE)) {
    issues.push({ code: "amount_out_of_range", path: "/pricing/rates/sales_tax_pct", severity: "warning", tier: "important", message: `sales_tax_pct ${next.sales_tax_pct} outside plausible range` });
    next = { ...next, sales_tax_pct: null };
  }
  if (next.cc_fee_pct != null && !inRange(next.cc_fee_pct, CC_FEE_RANGE)) {
    issues.push({ code: "amount_out_of_range", path: "/pricing/rates/cc_fee_pct", severity: "warning", tier: "secondary", message: `cc_fee_pct ${next.cc_fee_pct} outside plausible range` });
    next = { ...next, cc_fee_pct: null };
  }
  return { rates: next, issues };
}
