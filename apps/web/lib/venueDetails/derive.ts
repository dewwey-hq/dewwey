/**
 * Pure derivation functions over a `VenueDetailsV3` document. No React, no DB, no network — see
 * types.ts's own header. Every function here is deterministic given its inputs so it can be
 * unit-tested with hand-built fixtures (derive.test.ts) and re-run identically by the renderer,
 * the golden scorer, and the funnel report.
 */

import {
  type AddOn,
  type CapacityTuple,
  type Day,
  type EstimateExtra,
  type EstimateInput,
  type FbPill,
  type Layout,
  type PerGuestTier,
  POLICY_ROW_KEYS,
  type PricingPath,
  type Season,
  type VenueDetailsV3,
  type VenueSpine,
  isStated,
} from "./types";

export type { EstimateInput, EstimateExtra };

// ---------------------------------------------------------------------------
// Standard FAQs (5 locked questions, answers derived from the spine only)
// ---------------------------------------------------------------------------

export interface DerivedFaq {
  question: string;
  answer: string;
}

const NOT_STATED_ANSWER = "Not stated on their site. Confirm directly with the venue.";

function conflictingAnswer(labels: string[]): string {
  return `Sources disagree: ${labels.join(" vs. ")}. Confirm which applies.`;
}

const CATERING_LABEL: Record<string, string> = {
  open: "an open list, any caterer",
  preferred_list: "a preferred caterer list",
  exclusive_in_house: "in-house catering only",
  approved_list_only: "an approved caterer list only",
};

const BAR_LABEL: Record<string, string> = {
  in_house: "in-house bar only",
  byob: "BYOB",
  byo_with_corkage: "in-house bar with a BYO corkage option",
  dry: "no alcohol allowed",
};

const COORDINATOR_LABEL: Record<string, string> = {
  included: "a coordinator included",
  required_hire: "your own coordinator required",
  optional: "a coordinator optional",
};

const INSURANCE_LABEL: Record<string, string> = {
  required: "insurance required",
  not_required: "insurance not required",
  venue_covers: "the venue covers it",
};

export function deriveStandardFaqs(d: VenueDetailsV3): DerivedFaq[] {
  const name = d.name;
  const { catering, bar, fb_minimum, day_of_coordinator, event_insurance } = d.spine;

  const cateringAnswer = (() => {
    if (catering.status === "not_stated") return NOT_STATED_ANSWER;
    if (catering.status === "conflicting") return conflictingAnswer(catering.candidates.map((c) => CATERING_LABEL[c.value] ?? String(c.value)));
    switch (catering.value) {
      case "open":
        return `Yes, ${name} allows any caterer.`;
      case "preferred_list":
        return `${name} has a preferred caterer list, but does not require it.`;
      case "approved_list_only":
        return `No, catering must come from ${name}'s approved vendor list.`;
      case "exclusive_in_house":
        return `No, catering is exclusive in-house at ${name}.`;
      default:
        return NOT_STATED_ANSWER;
    }
  })();

  const barAnswer = (() => {
    if (bar.status === "not_stated") return NOT_STATED_ANSWER;
    if (bar.status === "conflicting") return conflictingAnswer(bar.candidates.map((c) => BAR_LABEL[c.value] ?? String(c.value)));
    switch (bar.value) {
      case "byob":
        return `Yes, ${name} is BYOB.`;
      case "byo_with_corkage":
        return `Partially: ${name}'s bar is in-house, but you can also bring your own alcohol for a corkage fee.`;
      case "in_house": {
        // A venue whose bar enum is `in_house` but whose own extracted F&B pills additively
        // include `byo` (Diamond Garden: open bar / cash bar / no-fee BYO) genuinely does allow
        // a couple to bring their own alcohol — bare "in-house only" would be wrong here, and
        // "for a corkage fee" (the byo_with_corkage wording) would invent a fee that isn't real.
        const hasByo = d.food_beverage.bar_pills.some((p) => p.value === "byo");
        return hasByo ? `Partially: ${name}'s bar is in-house, but you can also bring your own alcohol.` : `No, ${name}'s bar is in-house only.`;
      }
      case "dry":
        return `No, ${name} does not allow alcohol.`;
      default:
        return NOT_STATED_ANSWER;
    }
  })();

  const fbMinimumAnswer = (() => {
    if (fb_minimum.status === "not_stated") return NOT_STATED_ANSWER;
    if (fb_minimum.status === "conflicting") {
      return conflictingAnswer(fb_minimum.candidates.map((c) => (c.value.applies ? "a minimum applies" : "no minimum")));
    }
    if (!fb_minimum.value.applies) return "No, there is no food & beverage minimum.";
    return fb_minimum.value.amount_usd != null
      ? `Yes, a food & beverage minimum of $${fb_minimum.value.amount_usd.toLocaleString()} applies.`
      : "Yes, a food & beverage minimum applies (amount not published).";
  })();

  const coordinatorAnswer = (() => {
    if (day_of_coordinator.status === "not_stated") return NOT_STATED_ANSWER;
    if (day_of_coordinator.status === "conflicting") {
      return conflictingAnswer(day_of_coordinator.candidates.map((c) => COORDINATOR_LABEL[c.value] ?? String(c.value)));
    }
    switch (day_of_coordinator.value) {
      case "included":
        return `No, a day-of coordinator is included.`;
      case "required_hire":
        return `Yes, you're required to hire your own day-of coordinator.`;
      case "optional":
        return `No, but you may hire your own if you'd like.`;
      default:
        return NOT_STATED_ANSWER;
    }
  })();

  const insuranceAnswer = (() => {
    if (event_insurance.status === "not_stated") return NOT_STATED_ANSWER;
    if (event_insurance.status === "conflicting") {
      return conflictingAnswer(event_insurance.candidates.map((c) => INSURANCE_LABEL[c.value] ?? String(c.value)));
    }
    switch (event_insurance.value) {
      case "required":
        return `Yes, event insurance is required.`;
      case "not_required":
        return `No, event insurance is not required.`;
      case "venue_covers":
        return `No, ${name} covers event insurance.`;
      default:
        return NOT_STATED_ANSWER;
    }
  })();

  return [
    { question: "Can we bring our own caterer, or does it have to be from an approved list?", answer: cateringAnswer },
    { question: "Can we bring our own alcohol?", answer: barAnswer },
    { question: "Is there a food & beverage minimum?", answer: fbMinimumAnswer },
    { question: "Do we need to hire our own day-of coordinator?", answer: coordinatorAnswer },
    { question: "Is event insurance required?", answer: insuranceAnswer },
  ];
}

// ---------------------------------------------------------------------------
// Headline capacity
// ---------------------------------------------------------------------------

export interface CapacityTile {
  tile: "seated" | "seated_dance" | "cocktail";
  as_stated_label: string | null;
  max: number | null;
}

export interface HeadlineCapacity {
  tiles: CapacityTile[]; // always 3, in order: seated, seated_dance, cocktail
  headline: number | null;
  headline_layout: Layout | null;
  headline_space_id: string | null;
  cocktail_only: boolean;
  guest_range: { min: number | null; max: number | null; max_measures: "seated" | "guests" };
}

function maxBy<T>(items: T[], value: (t: T) => number): T | null {
  if (items.length === 0) return null;
  return items.reduce((a, b) => (value(b) > value(a) ? b : a));
}

export function headlineCapacity(d: VenueDetailsV3): HeadlineCapacity {
  const caps = d.capacities;
  const spaceById = new Map(d.spaces.map((s) => [s.id, s]));

  const isSingleBookable = (c: CapacityTuple) => c.space_id !== "whole_venue" && spaceById.get(c.space_id)?.bookable_separately !== false;

  const tileFor = (tile: "seated" | "seated_dance" | "cocktail"): CapacityTile => {
    const best = maxBy(
      caps.filter((c) => c.tile === tile),
      (c) => c.max,
    );
    return { tile, as_stated_label: best?.as_stated_label ?? null, max: best?.max ?? null };
  };

  const tiles: CapacityTile[] = [tileFor("seated"), tileFor("seated_dance"), tileFor("cocktail")];

  let headline: number | null = null;
  let headline_layout: Layout | null = null;
  let headline_space_id: string | null = null;
  let cocktail_only = false;

  const seatedDinner = maxBy(
    caps.filter((c) => c.layout === "seated_dinner" && isSingleBookable(c)),
    (c) => c.max,
  );
  const seatedDance = maxBy(
    caps.filter((c) => c.layout === "seated_with_dance" && isSingleBookable(c)),
    (c) => c.max,
  );
  const otherSeated = maxBy(
    caps.filter((c) => c.layout === "other" && c.tile === "seated" && isSingleBookable(c)),
    (c) => c.max,
  );
  const cocktailOnly = maxBy(
    caps.filter((c) => c.tile === "cocktail"),
    (c) => c.max,
  );

  if (seatedDinner) {
    headline = seatedDinner.max;
    headline_layout = seatedDinner.layout;
    headline_space_id = seatedDinner.space_id;
  } else if (seatedDance) {
    headline = seatedDance.max;
    headline_layout = seatedDance.layout;
    headline_space_id = seatedDance.space_id;
  } else if (otherSeated) {
    headline = otherSeated.max;
    headline_layout = otherSeated.layout;
    headline_space_id = otherSeated.space_id;
  } else if (cocktailOnly) {
    headline = cocktailOnly.max;
    headline_layout = cocktailOnly.layout;
    headline_space_id = cocktailOnly.space_id;
    cocktail_only = true;
  }

  const max_measures: "seated" | "guests" = cocktail_only ? "guests" : "seated";
  const minCandidates = caps.map((c) => c.min).filter((m): m is number => m != null);
  const guest_range = {
    min: isStated(d.spine.capacity_min_guests) ? d.spine.capacity_min_guests.value : minCandidates.length ? Math.min(...minCandidates) : null,
    max: headline,
    max_measures,
  };

  return { tiles, headline, headline_layout, headline_space_id, cocktail_only, guest_range };
}

// ---------------------------------------------------------------------------
// Cost estimate
// ---------------------------------------------------------------------------

export interface EstimateLine {
  label: string;
  amount: number;
}

export interface EstimateGroup {
  group: "venue" | "fb" | "ceremony" | "add_ons" | "taxes";
  lines: EstimateLine[];
  subtotal: number;
}

export type EstimateWarning =
  | "over_capacity"
  | "under_minimum"
  | "under_fb_minimum"
  | "unpriceable_extra_ignored"
  | "no_path";

export interface CostEstimate {
  groups: EstimateGroup[];
  total: number;
  not_included: string[];
  warnings: EstimateWarning[];
  assumptions: string[];
}

function dayMatches(tierDay: Day | null, inputDay: Day): boolean {
  if (tierDay == null || tierDay === "any") return true;
  if (tierDay === inputDay) return true;
  // "weekday" means Mon-Thu (plan: a Fri/Sun shared price is two explicit rows), so a separate
  // Friday fee never double-counts against a weekday one.
  if (tierDay === "weekday") return ["mon", "tue", "wed", "thu"].includes(inputDay);
  return false;
}

function seasonMatches(tierSeason: Season | null, inputSeason: Season): boolean {
  if (tierSeason == null || tierSeason === "any") return true;
  return tierSeason === inputSeason;
}

function specificity(day: Day | null, season: Season | null): number {
  let s = 0;
  if (day != null && day !== "any") s += day === "weekday" ? 1 : 2;
  if (season != null && season !== "any") s += 1;
  return s;
}

function selectTier(tiers: PerGuestTier[], day: Day, season: Season, tierId?: string): PerGuestTier | null {
  if (tierId) {
    // A pinned tier_id only wins when it actually matches the CURRENT day/season — a leftover
    // selection from a different day/season (or a different path entirely) must not silently
    // override the axes the couple just changed (Diamond Garden round-3 fix: Day/Season pills
    // were inert because a hard-pinned tier_id short-circuited here regardless of day/season).
    const exact = tiers.find((t) => t.id === tierId);
    if (exact && dayMatches(exact.day, day) && seasonMatches(exact.season, season)) return exact;
  }
  const matches = tiers.filter((t) => dayMatches(t.day, day) && seasonMatches(t.season, season));
  if (matches.length === 0) return null;
  matches.sort((a, b) => specificity(b.day, b.season) - specificity(a.day, a.season));
  return matches[0];
}

function selectMinimum(path: PricingPath, kind: "fb_minimum" | "guest_minimum", day: Day, season: Season) {
  const candidates = path.minimums.filter((m) => m.kind === kind && seasonMatches(m.season, season));
  const exact = candidates.find((m) => m.day === day);
  if (exact) return exact;
  return candidates.find((m) => m.day == null || m.day === "any") ?? null;
}

function resolveAddOnAmount(a: AddOn, chosenSpaceId: string | undefined, guests: number, quantity: number): number | null {
  let base: number | null = null;
  if (a.per_space_prices && chosenSpaceId != null && a.per_space_prices[chosenSpaceId] != null) {
    base = a.per_space_prices[chosenSpaceId];
  } else if (a.price != null) {
    base = a.price;
  }
  if (base == null) return null;
  if (a.unit === "per_guest") return base * guests;
  if (a.unit === "per_unit") return base * quantity;
  return base; // flat / per_hour (per_hour resolved by caller when a duration is known)
}

function groupTotal(lines: EstimateLine[]): number {
  return lines.reduce((sum, l) => sum + l.amount, 0);
}

export function estimateCost(d: VenueDetailsV3, input: EstimateInput): CostEstimate {
  const { pricing } = d;
  const warnings: EstimateWarning[] = [];
  const assumptions: string[] = [];
  const not_included: string[] = [];

  for (const rtp of pricing.required_third_party) {
    not_included.push(rtp.estimate_usd != null ? `${rtp.name} (~$${rtp.estimate_usd.toLocaleString()})` : rtp.name);
  }

  if (pricing.paths.length === 0) {
    warnings.push("no_path");
    return { groups: [], total: 0, not_included, warnings, assumptions };
  }

  const path = (input.path_id && pricing.paths.find((p) => p.id === input.path_id)) || pricing.paths[0];
  const guests = input.guests;
  const hc = headlineCapacity(d);
  const chosenSpaceId = input.space_id ?? hc.headline_space_id ?? undefined;

  // --- over_capacity -------------------------------------------------------
  if (chosenSpaceId) {
    const tuple = d.capacities.find((c) => c.space_id === chosenSpaceId && (c.tile === "seated" || c.tile === "seated_dance"));
    if (tuple && guests > tuple.max) warnings.push("over_capacity");
  }

  // --- venue group (fixed fees + required staffing + year surcharges) ------
  const venueLines: EstimateLine[] = [];
  // A whole-venue fee (Marchetti's "book both spaces") is an alternative to a space-scoped fee,
  // not an addition: once the chosen space has its own fee on this path, whole-venue fees are
  // skipped. Single-space venues (all fees whole_venue) are unaffected.
  const chosenSpaceHasOwnFee =
    chosenSpaceId != null &&
    chosenSpaceId !== "whole_venue" &&
    path.fixed_fees.some((f) => f.applies_to === "space" && f.space_id === chosenSpaceId);
  for (const fee of path.fixed_fees) {
    if (fee.applies_to !== "space" && fee.applies_to !== "whole_venue") continue;
    if (fee.applies_to === "whole_venue" && chosenSpaceHasOwnFee) continue;
    if (fee.day && !dayMatches(fee.day, input.day)) continue;
    if (fee.season && !seasonMatches(fee.season, input.season)) continue;
    if (fee.space_id && fee.space_id !== chosenSpaceId) continue;
    const hours = fee.unit === "per_hour" ? (path.rental_hours ?? 0) : 1;
    venueLines.push({ label: fee.label, amount: fee.amount * hours });
  }
  if (path.required_staffing) {
    const rs = path.required_staffing;
    const bartenders = Math.ceil(guests / rs.bartender_per_guests);
    const roleCount = bartenders + rs.other_roles.length;
    const amount = roleCount * rs.price_per_role;
    venueLines.push({
      label: `Required staffing: ${bartenders} bartender${bartenders === 1 ? "" : "s"}, ${rs.other_roles.join(", ")}`,
      amount,
    });
  }
  if (input.event_year != null) {
    for (const ys of path.year_surcharges) {
      if (ys.year !== input.event_year) continue;
      if (ys.unit === "flat") venueLines.push({ label: `${ys.year} surcharge`, amount: ys.amount });
    }
  }

  // --- fb group (per-guest tier) --------------------------------------------
  const fbLines: EstimateLine[] = [];
  const tier = selectTier(path.per_guest_tiers, input.day, input.season, input.tier_id);
  if (tier) {
    fbLines.push({ label: `${tier.name} (${guests} × $${tier.per_guest}/guest)`, amount: guests * tier.per_guest });
    if (input.event_year != null) {
      for (const ys of path.year_surcharges) {
        if (ys.year !== input.event_year || ys.unit !== "per_guest") continue;
        fbLines.push({ label: `${ys.year} surcharge (+$${ys.amount}/guest)`, amount: ys.amount * guests });
      }
    }
  }

  // --- under_minimum / F&B minimum -------------------------------------------
  const guestMin = selectMinimum(path, "guest_minimum", input.day, input.season);
  if (guestMin && guests < guestMin.amount) warnings.push("under_minimum");
  const fbMin = selectMinimum(path, "fb_minimum", input.day, input.season);
  if (fbMin && groupTotal(fbLines) < fbMin.amount) warnings.push("under_fb_minimum");
  const spineFbMin = d.spine.fb_minimum;
  if (!fbMin && isStated(spineFbMin) && spineFbMin.value.applies && spineFbMin.value.amount_usd == null) {
    not_included.push("Food & beverage minimum (amount not published)");
  }

  // --- ceremony group (auto-applied add-ons gated by ceremonyOnSite) --------
  const ceremonyLines: EstimateLine[] = [];
  const ceremonyMeta: { amount: number; override: number | null }[] = [];
  if (input.ceremonyOnSite) {
    for (const a of pricing.add_ons) {
      // The Yes/No ceremony axis auto-applies ONLY the one add-on that IS the on-site ceremony
      // fee (`condition: "ceremony_on_site"`, exactly) — a venue's other ceremony-adjacent
      // upgrades (backdrops, pipe & drape, a premium ceremony pack) are individually selectable
      // extras (`group: "other"`), not auto-applied just because the group happens to be
      // "ceremony" (Diamond Garden round-3 fix: all 5 of its ceremony upgrades used to auto-apply
      // together the moment ceremonyOnSite was set to Yes).
      if (a.group !== "ceremony" || a.condition !== "ceremony_on_site") continue;
      const amount = resolveAddOnAmount(a, chosenSpaceId, guests, 1);
      if (amount == null) {
        warnings.push("unpriceable_extra_ignored");
        continue;
      }
      ceremonyLines.push({ label: a.name, amount });
      ceremonyMeta.push({ amount, override: a.tax_pct_override });
    }
  }

  // --- add_ons group (explicit `extras` selection) --------------------------
  const addOnLines: EstimateLine[] = [];
  const addOnMeta: { amount: number; override: number | null }[] = [];
  for (const extra of input.extras) {
    const a = pricing.add_ons.find((x) => x.id === extra.add_on_id);
    if (!a || a.priceable === false) {
      warnings.push("unpriceable_extra_ignored");
      continue;
    }
    // path_ids scopes an add-on to the path(s) it's actually relevant to (Diamond Garden's food
    // packages/dinnerware/bar tiers only make sense on the à-la-carte-shaped paths, never
    // All-Inclusive, which already bundles the equivalent) — a stale selection left over from
    // switching paths is silently dropped, not priced against the wrong path.
    if (a.path_ids && input.path_id && !a.path_ids.includes(input.path_id)) continue;
    const qty = extra.quantity ?? 1;
    const amount = resolveAddOnAmount(a, chosenSpaceId, guests, qty);
    if (amount == null) {
      warnings.push("unpriceable_extra_ignored");
      continue;
    }
    const label = qty > 1 && a.unit === "per_unit" ? `${a.name} (${qty} × $${a.price})` : a.name;
    addOnLines.push({ label, amount });
    addOnMeta.push({ amount, override: a.tax_pct_override });
  }

  // --- taxes group -----------------------------------------------------------
  const { rates } = pricing;
  const fbBase = groupTotal(fbLines);
  const venueBase = groupTotal(venueLines);
  const ceremonyBase = groupTotal(ceremonyLines);
  const addOnsBase = groupTotal(addOnLines);

  const serviceChargeBase = rates.service_charge_base === "all" ? venueBase + fbBase + ceremonyBase + addOnsBase : fbBase;
  const serviceCharge = rates.service_charge_pct ? Math.round(serviceChargeBase * (rates.service_charge_pct / 100)) : 0;
  const fbSubtotalWithService = fbBase + serviceCharge;

  // Lines with an explicit tax_pct_override get their own row; everything else folds into one
  // general sales-tax line (default base: fb + service charge + non-overridden ceremony/add-on
  // amounts — the flat venue rental fee is always excluded).
  const overriddenTaxLines: { label: string; amount: number; pct: number }[] = [];
  let generalTaxableExtra = 0;
  ceremonyLines.forEach((line, i) => {
    const meta = ceremonyMeta[i];
    if (meta.override != null) overriddenTaxLines.push({ label: `${line.label} tax`, amount: meta.amount, pct: meta.override });
    else generalTaxableExtra += meta.amount;
  });
  addOnLines.forEach((line, i) => {
    const meta = addOnMeta[i];
    if (meta.override != null) overriddenTaxLines.push({ label: `${line.label} tax`, amount: meta.amount, pct: meta.override });
    else generalTaxableExtra += meta.amount;
  });

  const taxLines: EstimateLine[] = [];
  if (serviceCharge) taxLines.push({ label: `Service charge (${rates.service_charge_pct}%)`, amount: serviceCharge });

  let generalTax = 0;
  if (rates.sales_tax_pct != null && rates.sales_tax_source !== "included" && rates.sales_tax_source !== "unknown") {
    // Default base (fb_and_rentals) excludes the flat venue rental; a venue that states tax on
    // everything (`sales_tax_base: "all"`) taxes the rental too.
    const generalBase = fbSubtotalWithService + generalTaxableExtra + (rates.sales_tax_base === "all" ? venueBase : 0);
    generalTax = Math.round(generalBase * (rates.sales_tax_pct / 100));
    if (generalBase > 0) taxLines.push({ label: `Sales tax (${rates.sales_tax_pct}%)`, amount: generalTax });
  }
  let overriddenTaxTotal = 0;
  for (const o of overriddenTaxLines) {
    const amount = Math.round(o.amount * (o.pct / 100));
    overriddenTaxTotal += amount;
    taxLines.push({ label: o.label, amount });
  }

  if (rates.sales_tax_source === "chicago_default") {
    assumptions.push("Sales tax assumed at Chicago's standard rate; not stated on the venue's own site.");
  } else if (rates.sales_tax_source === "unknown") {
    assumptions.push("Taxes are not stated for this venue.");
  }

  const rawChargesTotal = venueBase + fbBase + ceremonyBase + addOnsBase;
  const taxesSoFar = serviceCharge + generalTax + overriddenTaxTotal;
  let ccFee = 0;
  if (input.payment === "credit_card" && rates.cc_fee_pct) {
    ccFee = Math.round((rawChargesTotal + taxesSoFar) * (rates.cc_fee_pct / 100));
    taxLines.push({ label: `Credit card processing (${rates.cc_fee_pct}%)`, amount: ccFee });
  }

  const allGroups: EstimateGroup[] = [
    { group: "venue", lines: venueLines, subtotal: venueBase },
    { group: "fb", lines: fbLines, subtotal: fbBase },
    { group: "ceremony", lines: ceremonyLines, subtotal: ceremonyBase },
    { group: "add_ons", lines: addOnLines, subtotal: addOnsBase },
    { group: "taxes", lines: taxLines, subtotal: groupTotal(taxLines) },
  ];
  const groups = allGroups.filter((g) => g.lines.length > 0);

  const total = rawChargesTotal + taxesSoFar + ccFee;

  return { groups, total, not_included, warnings, assumptions };
}

/** The path's own general (day/season-agnostic) guest minimum, when it states one — Diamond
 * Garden's All-Inclusive path requires 150 guests generally (125 Fridays, 100 Sundays); the
 * general row is what a default guest count should reflect, not a day-specific floor. */
function pathGuestMinimum(path: PricingPath | undefined): number | null {
  if (!path) return null;
  const general = path.minimums.find((m) => m.kind === "guest_minimum" && (m.day == null || m.day === "any"));
  if (general) return general.amount;
  return path.minimums.find((m) => m.kind === "guest_minimum")?.amount ?? null;
}

export function defaultAxes(d: VenueDetailsV3): EstimateInput {
  const pinnedPathId = d.pricing.default_axes?.path_id;
  const firstPath = (pinnedPathId && d.pricing.paths.find((p) => p.id === pinnedPathId)) || d.pricing.paths[0];
  const hc = headlineCapacity(d);
  const defaultSpaceId = hc.headline_space_id ?? d.spaces.find((s) => s.bookable_separately !== false)?.id;
  const base: EstimateInput = {
    guests: pathGuestMinimum(firstPath) ?? 100,
    day: "sat",
    season: "peak",
    path_id: firstPath?.id,
    tier_id: firstPath?.per_guest_tiers[0]?.id,
    space_id: defaultSpaceId,
    ceremonyOnSite: false,
    payment: "cash_check",
    extras: [],
  };
  return { ...base, ...(d.pricing.default_axes ?? {}) };
}

/** Add-ons genuinely offerable on the given path — path_ids null (relevant regardless of path) or
 * containing path_id, excluding auto-applied ceremony fees (those are driven by the ceremony
 * axis, not a selectable extra). Used by the calculator to decide which add-ons/PillGroups to
 * offer once a path is chosen (Diamond Garden: hides food/dinnerware/bar entirely on
 * All-Inclusive, which already bundles them). */
export function selectableAddOns(d: VenueDetailsV3, path_id: string | undefined): AddOn[] {
  return d.pricing.add_ons.filter((a) => {
    if (a.group === "ceremony" && a.condition === "ceremony_on_site") return false;
    if (a.priceable === false) return false;
    if (a.path_ids && path_id && !a.path_ids.includes(path_id)) return false;
    return a.price != null || (a.per_space_prices != null && Object.keys(a.per_space_prices).length > 0);
  });
}

// ---------------------------------------------------------------------------
// Quick facts
// ---------------------------------------------------------------------------

export interface QuickFactPill {
  icon: string;
  label: string;
}

const SETTING_LABEL: Record<string, string> = { indoor: "Indoor", outdoor: "Outdoor", both: "Indoor & outdoor" };

function cateringPillLabel(spine: VenueSpine): string {
  const c = spine.catering;
  if (c.status !== "stated") return "Not stated";
  return { open: "Open, any caterer", preferred_list: "Preferred list", exclusive_in_house: "In-house only", approved_list_only: "Approved list only" }[c.value];
}

function barPillLabel(spine: VenueSpine): string {
  const b = spine.bar;
  if (b.status !== "stated") return "Not stated";
  return { in_house: "In-house", byob: "BYOB", byo_with_corkage: "In-house + BYO", dry: "No alcohol" }[b.value];
}

export function quickFacts(d: VenueDetailsV3): QuickFactPill[] {
  const hc = headlineCapacity(d);
  const pills: QuickFactPill[] = [];

  if (hc.headline != null) {
    const min = hc.guest_range.min;
    pills.push({ icon: "guests", label: min != null ? `${min} – ${hc.headline} guests` : `Up to ${hc.headline} guests` });
  } else {
    pills.push({ icon: "guests", label: "Guest count not stated" });
  }

  pills.push({ icon: "setting", label: isStated(d.spine.setting) ? SETTING_LABEL[d.spine.setting.value] : "Not stated" });
  pills.push({ icon: "catering", label: `Catering: ${cateringPillLabel(d.spine)}` });
  pills.push({ icon: "bar", label: `Bar: ${barPillLabel(d.spine)}` });

  if (d.differentiator?.tagline) {
    pills.push({ icon: "sparkle", label: d.differentiator.tagline });
  }

  return pills;
}

// ---------------------------------------------------------------------------
// Policy rows (13, tri-state rendered)
// ---------------------------------------------------------------------------

export interface PolicyRow {
  key: (typeof POLICY_ROW_KEYS)[number];
  label: string;
  pill: string;
  detail: string | null;
  stated: boolean;
}

const POLICY_LABELS: Record<string, string> = {
  catering: "Catering",
  bar: "Bar",
  rental_charge_type: "Venue rental charge type",
  fb_minimum: "Food & beverage minimum",
  service_charge_pct: "Service charge",
  parking: "Parking",
  day_of_coordinator: "Day-of coordinator",
  payment_schedule: "Payment schedule",
  cancellation: "Cancellation / rescheduling",
  event_insurance: "Event insurance",
  security: "Security",
  vendor_access: "Vendor access (setup/teardown)",
  noise_curfew: "Noise curfew",
};

function describePolicyValue(key: string, value: unknown, ctx?: { barHasByo?: boolean }): string {
  switch (key) {
    case "catering":
      return (
        { open: "Open", preferred_list: "Preferred list", exclusive_in_house: "In-house only", approved_list_only: "Approved list only" }[value as string] ?? String(value)
      );
    case "bar": {
      const label = ({ in_house: "In-house only", byob: "BYOB", byo_with_corkage: "In-house + BYO (corkage)", dry: "Dry" }[value as string] ?? String(value));
      // A venue whose bar enum is genuinely `in_house` (it serves in-house bar packages, not a
      // BYO-with-corkage arrangement) but whose own extracted F&B pills additively include `byo`
      // (Diamond Garden: open bar / cash bar / no-fee BYO) reads wrong as bare "In-house only" —
      // and "In-house + BYO (corkage)" would be actively false, since there's no corkage fee here.
      // `ctx.barHasByo` is threaded in by `policyRows` from `food_beverage.bar_pills` (round-3 fix).
      if (value === "in_house" && ctx?.barHasByo) return "In-house or BYO";
      return label;
    }
    case "rental_charge_type":
      return (
        {
          flat_fee: "Flat fee",
          per_guest_bundled: "Per-guest (bundled)",
          flat_plus_per_guest: "Flat + per-guest",
          inquire_only: "Inquire only",
          none: "None",
        }[value as string] ?? String(value)
      );
    case "fb_minimum": {
      const v = value as { applies: boolean; amount_usd: number | null };
      if (!v.applies) return "None";
      return v.amount_usd != null ? `Applies ($${v.amount_usd.toLocaleString()})` : "Applies (amount not published)";
    }
    case "service_charge_pct":
      return value === 0 ? "None" : `${value}%`;
    case "parking":
      return ({ included: "Included", paid: "Paid", valet_paid: "Valet available (fee)", street: "Street only", none: "Not provided" }[value as string] ?? String(value));
    case "day_of_coordinator":
      return ({ included: "Included", required_hire: "Required (hire your own)", optional: "Optional" }[value as string] ?? String(value));
    case "payment_schedule":
      return (value as { deposit: string }).deposit;
    case "cancellation":
      return (value as { summary: string }).summary;
    case "event_insurance":
      return ({ required: "Required", not_required: "Not required", venue_covers: "Covered by venue" }[value as string] ?? String(value));
    case "security":
      return ({ included: "Included", required_hire: "Required (hire your own)", not_required: "Not required" }[value as string] ?? String(value));
    case "vendor_access":
      return (value as { summary: string }).summary;
    case "noise_curfew":
      return String(value);
    default:
      return String(value);
  }
}

function policyDetail(key: string, value: unknown, quote?: string): string | null {
  switch (key) {
    case "fb_minimum":
      return (value as { detail: string | null }).detail;
    case "parking":
      // ParkingPolicy is a bare enum with nowhere to carry a venue's own concrete texture (Diamond
      // Garden: "2 free lots, 75+ spaces") — the fact's own quote fills that role, same treatment
      // fb_minimum's `detail` field gives a structured value (round-3 fix).
      return quote ?? null;
    case "payment_schedule": {
      const v = value as { deposit: string; balance_due: string | null };
      // De-dupe: a venue whose "balance due" text was authored as a restatement of the deposit
      // line (Diamond Garden's original "$1,000 deposit; balance due..." repeating "$1,000
      // deposit" verbatim) must not show the same sentence twice, once as the pill and once as
      // the detail underneath it.
      if (!v.balance_due || v.balance_due === v.deposit || v.deposit.includes(v.balance_due)) return null;
      return v.balance_due;
    }
    case "cancellation": {
      const v = value as { deposit_refundable: boolean | null };
      if (v.deposit_refundable === true) return "Deposit refundable.";
      if (v.deposit_refundable === false) return "Deposit non-refundable.";
      return null;
    }
    case "vendor_access": {
      const v = value as { summary: string; setup_hours_before: number | null; teardown_hours_after: number | null };
      const parts: string[] = [];
      // De-dupe: only mention a setup/teardown number the summary hasn't already stated (Diamond
      // Garden's summary already says "2 hours before the event for setup").
      if (v.setup_hours_before != null && !v.summary.includes(String(v.setup_hours_before))) parts.push(`Setup ${v.setup_hours_before}h before`);
      if (v.teardown_hours_after != null && !v.summary.includes(String(v.teardown_hours_after))) parts.push(`teardown ${v.teardown_hours_after}h after`);
      return parts.length ? parts.join(", ") : null;
    }
    default:
      return null;
  }
}

export function policyRows(d: VenueDetailsV3): PolicyRow[] {
  const barHasByo = d.food_beverage.bar_pills.some((p) => p.value === "byo");
  return POLICY_ROW_KEYS.map((key) => {
    const tri = d.spine[key];
    const label = POLICY_LABELS[key];
    const ctx = key === "bar" ? { barHasByo } : undefined;
    if (tri.status === "not_stated") {
      return { key, label, pill: "Not stated (please confirm)", detail: null, stated: false };
    }
    if (tri.status === "conflicting") {
      const detail = `${tri.candidates.map((c) => describePolicyValue(key, c.value, ctx)).join(" vs. ")}. Confirm which applies.`;
      return { key, label, pill: "Conflicting sources", detail, stated: false };
    }
    return { key, label, pill: describePolicyValue(key, tri.value, ctx), detail: policyDetail(key, tri.value, tri.quote), stated: true };
  });
}

// ---------------------------------------------------------------------------
// Add-on layout axes
// ---------------------------------------------------------------------------

export function addOnAxes(addOns: AddOn[]): "card" | "table" {
  const byCategory = new Map<string, AddOn[]>();
  for (const a of addOns) {
    if (!byCategory.has(a.category)) byCategory.set(a.category, []);
    byCategory.get(a.category)!.push(a);
  }
  const axes = new Set<string>();
  for (const group of byCategory.values()) {
    if (new Set(group.map((a) => a.variant).filter((v) => v != null)).size > 1) axes.add("variant");
    if (group.some((a) => a.per_space_prices != null && Object.keys(a.per_space_prices).length > 1)) axes.add("per_space_prices");
  }
  return axes.size >= 2 ? "table" : "card";
}

// ---------------------------------------------------------------------------
// Calculator axes
// ---------------------------------------------------------------------------

export type CalculatorAxis = "path" | "space" | "day" | "season" | "tier" | "ceremony" | "payment" | "band";

export function calculatorAxes(d: VenueDetailsV3): CalculatorAxis[] {
  const axes: CalculatorAxis[] = [];

  if (d.pricing.paths.length > 1) axes.push("path");

  // The space axis only appears when something actually prices by space (LondonHouse has two
  // rooms but one space-agnostic package price, so no axis; Marchetti's rooms have their own fees).
  const bookableSpaces = d.spaces.filter((s) => s.bookable_separately !== false);
  const pricesBySpace =
    d.pricing.paths.some((p) => p.fixed_fees.some((f) => f.applies_to === "space")) ||
    d.pricing.add_ons.some((a) => a.per_space_prices != null && Object.keys(a.per_space_prices).length > 1);
  if (bookableSpaces.length > 1 && pricesBySpace) axes.push("space");

  const days = new Set<string>();
  const seasons = new Set<string>();
  const tierNames = new Set<string>();
  for (const p of d.pricing.paths) {
    for (const f of p.fixed_fees) {
      if (f.day) days.add(f.day);
      if (f.season) seasons.add(f.season);
    }
    for (const t of p.per_guest_tiers) {
      if (t.day) days.add(t.day);
      if (t.season) seasons.add(t.season);
      tierNames.add(t.name);
    }
  }
  if (days.size > 1) axes.push("day");
  if (seasons.size > 1) axes.push("season");
  // A "Package tier" picker only earns its own axis when tiers genuinely differ by NAME — a
  // venue whose only real variation is day/season (Diamond Garden's 8 same-named "All-Inclusive"
  // rows) must drive that variation through the Day/Season pills alone, not a redundant picker of
  // identical-looking pills (round-3 fix; `selectTier`'s day/season fallback already handles an
  // unset tier_id correctly).
  if (tierNames.size > 1) axes.push("tier");

  // The ceremony Yes/No axis only earns its place when there's a real, auto-applied on-site
  // ceremony FEE to toggle (`condition: "ceremony_on_site"`) — a venue whose ceremony is simply
  // included at no extra charge (Diamond Garden) has nothing for the toggle to change, so no
  // axis (round-3 fix: `spine.ceremony_on_site` being stated used to be enough on its own).
  const hasCeremonyFee = d.pricing.add_ons.some((a) => a.group === "ceremony" && a.condition === "ceremony_on_site");
  if (hasCeremonyFee) axes.push("ceremony");

  if (d.pricing.rates.cc_fee_pct != null) axes.push("payment");

  const bySpace = new Map<string, Set<string>>();
  for (const c of d.capacities) {
    if (!c.condition) continue;
    if (!bySpace.has(c.space_id)) bySpace.set(c.space_id, new Set());
    bySpace.get(c.space_id)!.add(c.condition);
  }
  if ([...bySpace.values()].some((s) => s.size > 1)) axes.push("band");

  return axes;
}

// ---------------------------------------------------------------------------
// F&B pills (additive: extracted ∪ implied, never reduced)
// ---------------------------------------------------------------------------

export function fbPills(d: VenueDetailsV3): { food: FbPill[]; bar: FbPill[] } {
  const food = new Set<FbPill>(d.food_beverage.food_pills.map((f) => f.value));
  const bar = new Set<FbPill>(d.food_beverage.bar_pills.map((f) => f.value));
  const hasCorkage = d.pricing.add_ons.some((a) => /corkage/i.test(a.name));
  if (hasCorkage) bar.add("byo");
  return { food: [...food], bar: [...bar] };
}
