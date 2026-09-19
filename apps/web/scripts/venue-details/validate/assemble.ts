/**
 * The assembler: raw two-call tool output -> a validated `VenueDetailsV3` document, per the
 * plan's grounding/tier/must-not rules. Pure -- no DB/network; `validateVenueDetails.ts` supplies
 * the crawled page texts (from the local cache or R2) and calls `assembleDocument` directly.
 *
 * Pipeline (see the plan's "Evidence rules" and "Spine tiers" sections): normalize the raw
 * tri-state shape (stated-without-quote -> not_stated, single-candidate conflicting -> stated) ->
 * ground every Fact against the crawled pages (drop/demote on failure, tier-aware consequences) ->
 * structural sanity (spaces.ts, pricing.ts) -> FAQ off-topic gate -> resource/vendor-list hygiene
 * -> about/differentiator numeric hygiene -> corkage-implies-byo cross-field fixup -> `repairs[]`
 * for every fixable critical/important issue.
 */
import {
  NOT_STATED,
  SPINE_KEYS,
  SPINE_TIERS,
  VENUE_DETAILS_SCHEMA_VERSION,
  type AddOn,
  type BarPolicy,
  type CapacityTuple,
  type Day,
  type Fact,
  type Faq,
  type FbPill,
  type FixedFee,
  type FoodBeverage,
  type InclusionItem,
  type Layout,
  type Minimum,
  type PerGuestTier,
  type PressFeature,
  type Pricing,
  type PricingPath,
  type Rates,
  type RequiredThirdPartyCost,
  type Resource,
  type Season,
  type Setting,
  type Space,
  type SpineTier,
  type Tri,
  type VendorList,
  type VenueDetailsV3,
  type VenueSpine,
} from "../../../lib/venueDetails/types";
import type { Issue, RawCapacityTuple, RawFaq, RawPricingResult, RawResource, RawSpace, RawSpineResult, RawTriField, RawVendorList, Repair } from "../contract";
import { checkGrounding, normalizeUrl, type GroundingPage } from "./grounding";
import { sanitizeSpacesAndCapacities } from "./spaces";
import {
  checkCorkageImpliesByo,
  checkMinimumKindSanity,
  normalizeConflictingSingleCandidate,
  normalizeSelectionGroupSlug,
  normalizeStatedWithoutQuote,
  sanitizeAddOns,
  sanitizeFixedFees,
  sanitizeRates,
} from "./pricing";
import { checkEnums } from "./enums";

// ---------------------------------------------------------------------------
// Input/output shapes
// ---------------------------------------------------------------------------

export interface AssemblePage {
  url: string;
  text: string;
  snapshot_id: number | null;
}

export interface AssembleInput {
  accountId: number;
  name: string;
  websiteUrl: string | null;
  runId: number | null;
  promptVersion: string;
  model: string;
  extractedAt: string;
  spineRaw: RawSpineResult;
  pricingRaw: RawPricingResult | null;
  pages: AssemblePage[];
  /** URLs seen in the ASSET CANDIDATES block or a PAGE header -- resources[] may only cite these. */
  assetCandidateUrls: string[];
}

export interface AssembleOutput {
  document: VenueDetailsV3;
  issues: Issue[];
  repairs: Repair[];
  grounding: { checked: number; passed: number; failed: number; min_coverage: number | null };
  spineStatedCount: number;
  criticalFailures: number;
  needsReview: boolean;
  reviewReasons: string[];
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Shared grounding bookkeeping
// ---------------------------------------------------------------------------

interface GroundStats {
  checked: number;
  passed: number;
  failed: number;
  coverages: number[];
}

interface GroundResult {
  keep: boolean;
  weak: boolean;
  elsewhere: boolean;
  sourceUrl: string;
  snapshotId: number | null;
}

function ground(quote: string, sourceUrl: string, pages: Map<string, GroundingPage>, stats: GroundStats): GroundResult {
  const outcome = checkGrounding(quote, sourceUrl, pages);
  stats.checked++;
  stats.coverages.push(outcome.coverage);
  if (outcome.status === "pass" || outcome.status === "weak_quote" || outcome.status === "grounded_elsewhere") {
    stats.passed++;
    return {
      keep: true,
      weak: outcome.status === "weak_quote",
      elsewhere: outcome.status === "grounded_elsewhere",
      sourceUrl: outcome.matchedUrl ?? normalizeUrl(sourceUrl),
      snapshotId: outcome.snapshotId ?? null,
    };
  }
  stats.failed++;
  return { keep: false, weak: false, elsewhere: false, sourceUrl: normalizeUrl(sourceUrl), snapshotId: null };
}

function weakOrElsewhereIssue(g: GroundResult, path: string, tier: SpineTier | null): Issue | null {
  if (g.weak) return { code: "weak_quote", path, severity: "warning", tier, message: "Quote coverage was weak but plausibly the right page -- kept." };
  if (g.elsewhere) return { code: "grounded_elsewhere", path, severity: "warning", tier, message: `Quote actually grounds on ${g.sourceUrl}, not the stated source_url -- rewritten.` };
  return null;
}

/** Keeps only the items that appear verbatim (case-insensitive) somewhere in `pageText` --
 * numeric-hygiene-style substring check (no per-item quote/source_url is collected for these, so
 * this substitutes for a full grounding check) for short venue-stated strings like
 * `PricingPath.includes[]` and `Pricing.seasons`. Every dropped item gets its own issue. */
function filterVerbatimItems(items: string[], pageText: string | undefined, path: string, code: string, issues: Issue[]): string[] {
  const lowerPage = pageText?.toLowerCase();
  const kept: string[] = [];
  for (const item of items) {
    if (lowerPage && lowerPage.includes(item.toLowerCase())) {
      kept.push(item);
    } else {
      issues.push({ code, path, severity: "warning", tier: null, message: `Dropped "${item}" -- not found verbatim in the cited page.` });
    }
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Capacity tile derivation
// ---------------------------------------------------------------------------

export function tileFor(layout: Layout, asStatedLabel: string): CapacityTuple["tile"] {
  if (layout === "seated_dinner") return "seated";
  if (layout === "seated_with_dance") return "seated_dance";
  if (layout === "cocktail_standing") return "cocktail";
  if (layout === "other") {
    const label = asStatedLabel.toLowerCase();
    if (/dance/.test(label)) return "seated_dance";
    if (/cocktail|standing|reception/.test(label)) return "cocktail";
    if (/seat/.test(label)) return "seated";
  }
  return null;
}

// ---------------------------------------------------------------------------
// sales_tax_source derivation (spec resolution: stated | chicago_default | included | unknown)
// ---------------------------------------------------------------------------

export function computeSalesTaxSource(rates: { sales_tax_pct: number | null; quote: string | null; taxes_included_in_rental: boolean | null }, hasPerGuestTiers: boolean): Rates["sales_tax_source"] {
  if (rates.sales_tax_pct != null && rates.quote) return "stated";
  if (rates.taxes_included_in_rental === true) return "included";
  if (rates.sales_tax_pct == null && hasPerGuestTiers) return "chicago_default";
  return "unknown";
}

// ---------------------------------------------------------------------------
// FAQ off-topic gate (hotel-guest FAQs)
// ---------------------------------------------------------------------------

export const HOTEL_GUEST_FAQ_RE =
  /check-?in|check-?out|guest ?room|loyalty|reward points|gift card|wifi (price|cost|fee)|fitness center|pool hours|room service|breakfast hours|pet fee|self-?park(ing)? rate/i;

// ---------------------------------------------------------------------------
// Junk-asset / junk-vendor regexes (legacy extract.js constants, carried forward)
// ---------------------------------------------------------------------------

const JUNK_ASSET_RE = /privacy( policy)?|code of conduct|modern slavery|investor relations|annual report/i;
const JUNK_VENDOR_NAME_RE =
  /the knot|wedding\s*wire|yelp|zola|follow us|follow @|download your|view on instagram|google maps|all rights reserved|copyright|linkedin|^\s*careers\s*$|^\s*events\s*$/i;
const SLUGGY_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+){2,}$/i;

// ---------------------------------------------------------------------------
// Repair generation
// ---------------------------------------------------------------------------

const ALWAYS_REPAIRABLE_CODES = new Set(["capacity_gt_1000"]);
const TIERED_REPAIRABLE_CODES = new Set(["ungrounded_spine", "ungrounded_item", "enum_invalid", "stated_without_quote", "corkage_implies_byo"]);

function isRepairable(issue: Issue): boolean {
  if (ALWAYS_REPAIRABLE_CODES.has(issue.code)) return true;
  if (!TIERED_REPAIRABLE_CODES.has(issue.code)) return false;
  return issue.tier === "critical" || issue.tier === "important";
}

const KEYWORD_MAP: [needle: string, keywords: string[]][] = [
  ["fb_minimum", ["minimum", "spend"]],
  ["service_charge", ["service charge", "production fee", "gratuity", "administrative"]],
  ["capacities", ["seated", "guests", "capacity", "reception"]],
  ["parking", ["parking", "valet"]],
];

function keywordsForPath(path: string): string[] {
  for (const [needle, kws] of KEYWORD_MAP) {
    if (path.includes(needle)) return kws;
  }
  const last = path.split("/").filter(Boolean).pop() ?? "";
  const word = last.split(":")[0].replace(/_/g, " ").trim();
  return word ? [word] : [];
}

function instructionFor(issue: Issue): string {
  switch (issue.code) {
    case "ungrounded_spine":
    case "ungrounded_item":
      return "The previously stated value could not be grounded. Re-read the linked pages; if genuinely stated, quote it verbatim and cite the exact page. Otherwise return not_stated.";
    case "enum_invalid":
      return `Resubmit with a value from the allowed enum. ${issue.message}`;
    case "stated_without_quote":
      return "A stated value needs a verbatim quote. Provide one or return not_stated.";
    case "corkage_implies_byo":
      return "A corkage fee was found -- bar should be byo_with_corkage, not in_house.";
    case "capacity_gt_1000":
      return "This capacity figure exceeds 1000 guests -- confirm it is a real per-space number, not a combined/whole-venue total.";
    default:
      return issue.message;
  }
}

function buildRepairFor(issue: Issue, pages: AssemblePage[]): Repair {
  const keywords = keywordsForPath(issue.path);
  const snapshotIds: number[] = [];
  const keywordHits: string[] = [];
  for (const p of pages) {
    if (p.snapshot_id == null) continue;
    const lower = p.text.toLowerCase();
    const hits = keywords.filter((k) => lower.includes(k.toLowerCase()));
    if (hits.length > 0) {
      snapshotIds.push(p.snapshot_id);
      for (const h of hits) if (!keywordHits.includes(h)) keywordHits.push(h);
    }
  }
  return { field_path: issue.path, issue_code: issue.code, tier: issue.tier, instruction: instructionFor(issue), evidence_hint: { snapshot_ids: snapshotIds, keyword_hits: keywordHits } };
}

// ---------------------------------------------------------------------------
// Main assembler
// ---------------------------------------------------------------------------

export function assembleDocument(input: AssembleInput): AssembleOutput {
  const pagesMap = new Map<string, GroundingPage>();
  for (const p of input.pages) pagesMap.set(normalizeUrl(p.url), { text: p.text, snapshotId: p.snapshot_id });

  const issues: Issue[] = [];
  const reviewReasons: string[] = [];
  const stats: GroundStats = { checked: 0, passed: 0, failed: 0, coverages: [] };
  let criticalFailures = 0;

  // Enum-invalid is a hard fail regardless of grounding -- checked up front.
  issues.push(...checkEnums(input.spineRaw, input.pricingRaw));

  // --- spine -----------------------------------------------------------------
  const spine: Record<string, Tri<unknown>> = {};
  let spineStatedRaw = 0;
  let spineDemoted = 0;

  for (const key of SPINE_KEYS) {
    const tier = SPINE_TIERS[key];
    let field: RawTriField = input.spineRaw.spine[key] ?? { status: "not_stated" };
    field = normalizeConflictingSingleCandidate(normalizeStatedWithoutQuote(field));

    if (field.status === "not_stated") {
      spine[key] = NOT_STATED;
      continue;
    }

    if (field.status === "stated") {
      spineStatedRaw++;
      const g = ground(field.quote ?? "", field.source_url ?? "", pagesMap, stats);
      if (g.keep) {
        spine[key] = { status: "stated", value: field.value, quote: field.quote ?? "", source_url: g.sourceUrl, snapshot_id: g.snapshotId };
        const extra = weakOrElsewhereIssue(g, `/spine/${key}`, tier);
        if (extra) issues.push(extra);
      } else {
        spineDemoted++;
        spine[key] = NOT_STATED;
        issues.push({ code: "ungrounded_spine", path: `/spine/${key}`, severity: "error", tier, message: "Stated value failed grounding -- demoted to not_stated." });
        if (tier === "critical") {
          criticalFailures++;
          reviewReasons.push(`ungrounded_spine:${key}`);
        }
      }
      continue;
    }

    // conflicting -- every candidate must pass.
    spineStatedRaw++;
    const candidates = field.candidates ?? [];
    const groundedCandidates: Fact<unknown>[] = [];
    let allPass = true;
    for (const c of candidates) {
      const g = ground(c.quote, c.source_url, pagesMap, stats);
      if (g.keep) groundedCandidates.push({ value: c.value, quote: c.quote, source_url: g.sourceUrl, snapshot_id: g.snapshotId });
      else allPass = false;
    }
    if (allPass && groundedCandidates.length >= 2) {
      spine[key] = { status: "conflicting", candidates: groundedCandidates };
    } else {
      spineDemoted++;
      spine[key] = NOT_STATED;
      issues.push({ code: "ungrounded_spine", path: `/spine/${key}`, severity: "error", tier, message: "A conflicting candidate failed grounding -- demoted to not_stated." });
      if (tier === "critical") {
        criticalFailures++;
        reviewReasons.push(`ungrounded_spine:${key}`);
      }
    }
  }

  const gt30pct = spineStatedRaw > 0 && spineDemoted / spineStatedRaw > 0.3;
  if (gt30pct) reviewReasons.push("gt_30pct_spine_grounding_failure");

  // --- spaces / capacities -----------------------------------------------------
  const rawSpaces: RawSpace[] = input.spineRaw.spaces ?? [];
  const groundedSpaces: Space[] = [];
  for (const s of rawSpaces) {
    const norm = normalizeUrl(s.source_url);
    const page = pagesMap.get(norm);
    if (!page) {
      issues.push({ code: "space_source_not_crawled", path: `/spaces/${s.id}`, severity: "warning", tier: null, message: `space source_url ${s.source_url} is not a crawled page -- dropped` });
      continue;
    }
    let description: Fact<string> | null = null;
    if (s.description) {
      const g = ground(s.description.quote, s.description.source_url, pagesMap, stats);
      if (g.keep) description = { value: s.description.text, quote: s.description.quote, source_url: g.sourceUrl, snapshot_id: g.snapshotId };
      else issues.push({ code: "ungrounded_item", path: `/spaces/${s.id}/description`, severity: "warning", tier: "secondary", message: "Space description failed grounding -- dropped." });
    }
    groundedSpaces.push({
      id: s.id,
      name: s.name,
      structure_label: s.structure_label,
      sq_ft: s.sq_ft,
      sq_ft_label: s.sq_ft_label,
      sq_ft_outdoor: s.sq_ft_outdoor,
      ceiling_ft: s.ceiling_ft,
      ceiling_label: s.ceiling_label,
      setting: (s.setting as Setting | null) ?? null,
      bookable_separately: s.bookable_separately,
      description,
      includes_summary: s.includes_summary,
      evidence: { source_url: norm, snapshot_id: page.snapshotId },
    });
  }

  const rawCapacities: RawCapacityTuple[] = input.spineRaw.capacities ?? [];
  const groundedCapacities: CapacityTuple[] = [];
  let capacityDroppedByGrounding = false;
  for (const c of rawCapacities) {
    const g = ground(c.quote, c.source_url, pagesMap, stats);
    if (!g.keep) {
      capacityDroppedByGrounding = true;
      issues.push({ code: "ungrounded_item", path: `/capacities/${c.space_id}:${c.layout}`, severity: "warning", tier: null, message: "Capacity tuple failed grounding -- dropped." });
      continue;
    }
    const extra = weakOrElsewhereIssue(g, `/capacities/${c.space_id}:${c.layout}`, null);
    if (extra) issues.push(extra);
    groundedCapacities.push({
      space_id: c.space_id,
      layout: c.layout as Layout,
      min: c.min,
      max: c.max,
      as_stated_label: c.as_stated_label,
      tile: tileFor(c.layout as Layout, c.as_stated_label),
      condition: c.condition,
      quote: c.quote,
      source_url: g.sourceUrl,
      snapshot_id: g.snapshotId,
    });
  }

  const { spaces, capacities, issues: structuralIssues } = sanitizeSpacesAndCapacities(groundedSpaces, groundedCapacities);
  issues.push(...structuralIssues);
  for (const issue of structuralIssues) {
    if (issue.code === "capacity_gt_1000") reviewReasons.push(issue.code);
  }
  if (capacities.length === 0 && capacityDroppedByGrounding) {
    criticalFailures++;
    reviewReasons.push("ungrounded_headline_capacity");
  }

  // Digit-sequence hygiene, shared by about/differentiator (below) and food_beverage.food_note /
  // bar_note (in the pricing block): every digit sequence in the candidate text must appear
  // somewhere in the crawled pages, substituting for a full quote-grounding check on prose the
  // model may have lightly trimmed from the venue's own wording.
  const allPageText = input.pages.map((p) => p.text).join(" ");
  const allDigitSequences = new Set((allPageText.match(/\d+/g) ?? []).map((d) => d.replace(/^0+(?=\d)/, "")));

  function digitSequenceMissing(text: string): boolean {
    const seqs = text.match(/\d+/g) ?? [];
    return seqs.some((s) => !allDigitSequences.has(s.replace(/^0+(?=\d)/, "")));
  }

  // --- pricing -----------------------------------------------------------------
  const pricingRaw = input.pricingRaw;
  const paths: PricingPath[] = [];
  const addOns: AddOn[] = [];
  let rates: Rates = { service_charge_pct: null, service_charge_base: null, sales_tax_pct: null, sales_tax_base: null, sales_tax_source: "unknown", cc_fee_pct: null, quote: null, source_url: null, snapshot_id: null };
  const requiredThirdParty: RequiredThirdPartyCost[] = [];
  let foodBeverage: FoodBeverage = { food_pills: [], bar_pills: [], caption: null, food_note: null, bar_note: null, menus: [], bar_ladders: [], bar_min_guests: null, notes: [] };
  const faqs: Faq[] = [];
  const pricingArchetype = pricingRaw?.archetype ?? null;
  const addOnCategories: NonNullable<Pricing["add_on_categories"]> = [];
  let seasons: Pricing["seasons"] = undefined;

  if (pricingRaw) {
    pricingRaw.paths.forEach((rawPath, pathIndex) => {
      const isDefaultPath = pathIndex === 0;
      const pathTier: SpineTier | null = isDefaultPath ? "critical" : null;

      const fixedFees: FixedFee[] = [];
      for (const f of rawPath.fixed_fees) {
        const g = ground(f.quote, f.source_url, pagesMap, stats);
        if (!g.keep) {
          issues.push({ code: "ungrounded_item", path: `/pricing/paths/${rawPath.id}/fixed_fees/${f.key}`, severity: "warning", tier: pathTier, message: "Fixed fee failed grounding -- dropped." });
          if (isDefaultPath) criticalFailures++;
          continue;
        }
        fixedFees.push({ ...f, day: f.day as Day | null, season: f.season as Season | null, unit: f.unit as FixedFee["unit"], applies_to: f.applies_to as FixedFee["applies_to"], source_url: g.sourceUrl, snapshot_id: g.snapshotId });
      }
      const { fees: sanitizedFees, issues: feeIssues } = sanitizeFixedFees(fixedFees, rawPath.id);
      issues.push(...feeIssues);

      const perGuestTiers: PerGuestTier[] = [];
      for (const t of rawPath.per_guest_tiers) {
        const g = ground(t.quote, t.source_url, pagesMap, stats);
        if (!g.keep) {
          issues.push({ code: "ungrounded_item", path: `/pricing/paths/${rawPath.id}/per_guest_tiers/${t.id}`, severity: "warning", tier: pathTier, message: "Per-guest tier failed grounding -- dropped." });
          if (isDefaultPath) criticalFailures++;
          continue;
        }
        perGuestTiers.push({ ...t, day: t.day as Day | null, season: t.season as Season | null, source_url: g.sourceUrl, snapshot_id: g.snapshotId });
      }

      const minimums: Minimum[] = [];
      for (const m of rawPath.minimums) {
        const g = ground(m.quote, m.source_url, pagesMap, stats);
        if (!g.keep) {
          issues.push({ code: "ungrounded_item", path: `/pricing/paths/${rawPath.id}/minimums/${m.kind}:${m.day}:${m.season}`, severity: "warning", tier: pathTier, message: "Minimum failed grounding -- dropped." });
          if (isDefaultPath) criticalFailures++;
          continue;
        }
        minimums.push({ ...m, day: m.day as Day | null, season: m.season as Season | null, source_url: g.sourceUrl, snapshot_id: g.snapshotId });
      }
      issues.push(...checkMinimumKindSanity(minimums, rawPath.id));

      let requiredStaffing = null;
      if (rawPath.required_staffing) {
        const rs = rawPath.required_staffing;
        const g = ground(rs.quote, rs.source_url, pagesMap, stats);
        if (g.keep) requiredStaffing = { ...rs, source_url: g.sourceUrl, snapshot_id: g.snapshotId };
        else issues.push({ code: "ungrounded_item", path: `/pricing/paths/${rawPath.id}/required_staffing`, severity: "warning", tier: null, message: "Required staffing failed grounding -- dropped." });
      }

      const pathGround = ground(rawPath.quote, rawPath.source_url, pagesMap, stats);
      const pathPageText = pagesMap.get(normalizeUrl(rawPath.source_url))?.text;
      const groundedIncludes =
        rawPath.includes.length > 0 ? filterVerbatimItems(rawPath.includes, pathPageText, `/pricing/paths/${rawPath.id}/includes`, "unsupported_includes_item", issues) : [];

      const groundedTerms: NonNullable<PricingPath["terms"]> = [];
      for (const term of rawPath.terms) {
        const sourceNorm = normalizeUrl(term.source_url);
        const page = pagesMap.get(sourceNorm);
        const lowerPage = page?.text.toLowerCase();
        if (lowerPage && lowerPage.includes(term.text.toLowerCase())) {
          groundedTerms.push({ label: term.label, text: term.text, evidence: { source_url: sourceNorm, snapshot_id: page!.snapshotId } });
        } else {
          issues.push({
            code: "unsupported_term_text",
            path: `/pricing/paths/${rawPath.id}/terms`,
            severity: "warning",
            tier: null,
            message: `Dropped term "${term.label}: ${term.text}" -- not found verbatim in the cited page.`,
          });
        }
      }

      paths.push({
        id: rawPath.id,
        name: rawPath.name,
        description: rawPath.description,
        applies_to_spaces: rawPath.applies_to_spaces,
        fixed_fees: sanitizedFees,
        per_guest_tiers: perGuestTiers,
        minimums,
        required_staffing: requiredStaffing,
        rental_hours: rawPath.rental_hours,
        year_surcharges: rawPath.year_surcharges,
        promotions: rawPath.promotions,
        ...(groundedIncludes.length > 0 ? { includes: groundedIncludes } : {}),
        ...(groundedTerms.length > 0 ? { terms: groundedTerms } : {}),
        quote: rawPath.quote,
        source_url: pathGround.keep ? pathGround.sourceUrl : normalizeUrl(rawPath.source_url),
        snapshot_id: pathGround.keep ? pathGround.snapshotId : null,
      });
    });

    // rates: one shared quote for the whole object.
    const rawRates = pricingRaw.rates;
    if (rawRates.quote) {
      const g = ground(rawRates.quote, rawRates.source_url ?? "", pagesMap, stats);
      if (g.keep) {
        rates = { ...rates, service_charge_pct: rawRates.service_charge_pct, service_charge_base: rawRates.service_charge_base, sales_tax_pct: rawRates.sales_tax_pct, sales_tax_base: rawRates.sales_tax_base, cc_fee_pct: rawRates.cc_fee_pct, quote: rawRates.quote, source_url: g.sourceUrl, snapshot_id: g.snapshotId };
      } else {
        issues.push({ code: "ungrounded_item", path: "/pricing/rates", severity: "warning", tier: "critical", message: "Rates failed grounding -- cleared." });
        criticalFailures++;
      }
    }
    const taxesIncluded = rawRates.taxes_included_in_rental;
    const { rates: sanitizedRates, issues: rateIssues } = sanitizeRates(rates);
    rates = sanitizedRates;
    issues.push(...rateIssues);

    for (const a0 of pricingRaw.add_ons) {
      const a = { ...a0, selection_group: normalizeSelectionGroupSlug(a0.selection_group) };
      const g = ground(a.quote, a.source_url, pagesMap, stats);
      if (g.keep) {
        addOns.push({ ...a, unit: a.unit as AddOn["unit"], group: a.group as AddOn["group"], source_url: g.sourceUrl, snapshot_id: g.snapshotId });
        continue;
      }
      const nameGrounded = [...pagesMap.values()].some((p) => p.text.toLowerCase().includes(a.name.toLowerCase()));
      if (nameGrounded) {
        issues.push({ code: "ungrounded_item", path: `/pricing/add_ons/${a.id}`, severity: "warning", tier: "important", message: "Add-on price failed grounding; name is grounded -- kept as priceable:false." });
        addOns.push({ ...a, price: null, price_max: null, priceable: false, as_stated_price: "No published rate", source_url: normalizeUrl(a.source_url), snapshot_id: null } as unknown as AddOn);
      } else {
        issues.push({ code: "ungrounded_item", path: `/pricing/add_ons/${a.id}`, severity: "warning", tier: "important", message: "Add-on failed grounding entirely -- dropped." });
      }
    }
    const { addOns: sanitizedAddOns, issues: addOnIssues } = sanitizeAddOns(addOns);
    addOns.length = 0;
    addOns.push(...sanitizedAddOns);
    issues.push(...addOnIssues);

    // add_on_categories: kept only when >=1 add-on (post-sanitization) references the category.
    for (const c of pricingRaw.add_on_categories) {
      if (!addOns.some((a) => a.category === c.category)) {
        issues.push({ code: "add_on_category_unreferenced", path: `/pricing/add_on_categories/${c.category}`, severity: "warning", tier: null, message: `Dropped add-on category "${c.category}" -- no add-on references it.` });
        continue;
      }
      const sourceNorm = normalizeUrl(c.source_url);
      const page = pagesMap.get(sourceNorm);
      if (!page) {
        issues.push({ code: "add_on_category_not_crawled", path: `/pricing/add_on_categories/${c.category}`, severity: "warning", tier: null, message: `add_on_categories source_url ${c.source_url} not crawled -- dropped.` });
        continue;
      }
      addOnCategories.push({ category: c.category, blurb: c.blurb, examples: c.examples, evidence: { source_url: sourceNorm, snapshot_id: page.snapshotId } });
    }

    // seasons: the venue's own peak/off month wording, numeric-hygiene-checked against the cited page.
    if (pricingRaw.seasons) {
      const s = pricingRaw.seasons;
      const sourceNorm = normalizeUrl(s.source_url);
      const page = pagesMap.get(sourceNorm);
      const pageText = page?.text;
      let peak = s.peak;
      let off = s.off;
      if (peak != null && !(pageText && pageText.toLowerCase().includes(peak.toLowerCase()))) {
        issues.push({ code: "unsupported_season_text", path: "/pricing/seasons/peak", severity: "warning", tier: null, message: `Dropped peak season text "${peak}" -- not found verbatim in the cited page.` });
        peak = null;
      }
      if (off != null && !(pageText && pageText.toLowerCase().includes(off.toLowerCase()))) {
        issues.push({ code: "unsupported_season_text", path: "/pricing/seasons/off", severity: "warning", tier: null, message: `Dropped off season text "${off}" -- not found verbatim in the cited page.` });
        off = null;
      }
      if (peak != null || off != null) seasons = { peak, off };
    }

    for (const rtp of pricingRaw.required_third_party) {
      const g = ground(rtp.quote, rtp.source_url, pagesMap, stats);
      if (g.keep) requiredThirdParty.push({ ...rtp, source_url: g.sourceUrl, snapshot_id: g.snapshotId });
      else issues.push({ code: "ungrounded_item", path: `/pricing/required_third_party`, severity: "warning", tier: null, message: `Required third-party cost "${rtp.name}" failed grounding -- dropped.` });
    }

    // food_beverage
    const foodPills: Fact<FbPill>[] = [];
    for (const p of pricingRaw.food_beverage.food_pills) {
      const g = ground(p.quote, p.source_url, pagesMap, stats);
      if (g.keep) foodPills.push({ value: p.value, quote: p.quote, source_url: g.sourceUrl, snapshot_id: g.snapshotId });
    }
    const barPills: Fact<FbPill>[] = [];
    for (const p of pricingRaw.food_beverage.bar_pills) {
      const g = ground(p.quote, p.source_url, pagesMap, stats);
      if (g.keep) barPills.push({ value: p.value, quote: p.quote, source_url: g.sourceUrl, snapshot_id: g.snapshotId });
    }
    let caption: Fact<string> | null = null;
    if (pricingRaw.food_beverage.caption) {
      const c = pricingRaw.food_beverage.caption;
      const g = ground(c.quote, c.source_url, pagesMap, stats);
      if (g.keep) caption = { value: c.value, quote: c.quote, source_url: g.sourceUrl, snapshot_id: g.snapshotId };
    }

    // food_note / bar_note: numeric hygiene only (like about/differentiator above) -- the model may
    // lightly trim the venue's own wording, so a full quote-grounding check would be too strict.
    function assembleFbNote(raw: { text: string; quote: string; source_url: string } | null, path: string): Fact<string> | null {
      if (!raw) return null;
      const sourceNorm = normalizeUrl(raw.source_url);
      const page = pagesMap.get(sourceNorm);
      if (!page) {
        issues.push({ code: "note_numeric_hygiene", path, severity: "warning", tier: null, message: `${path} source_url ${raw.source_url} not crawled -- dropped.` });
        return null;
      }
      if (digitSequenceMissing(raw.text)) {
        issues.push({ code: "note_numeric_hygiene", path, severity: "warning", tier: null, message: `Dropped ${path} -- contains an unsupported number: "${raw.text}"` });
        return null;
      }
      return { value: raw.text, quote: raw.quote, source_url: sourceNorm, snapshot_id: page.snapshotId };
    }
    const foodNote = assembleFbNote(pricingRaw.food_beverage.food_note, "/food_beverage/food_note");
    const barNote = assembleFbNote(pricingRaw.food_beverage.bar_note, "/food_beverage/bar_note");

    const menus = pricingRaw.food_beverage.menus
      .filter((m) => pagesMap.has(normalizeUrl(m.source_url)))
      .map((m) => ({ name: m.name, cuisine: m.cuisine, includes: m.includes, cost: m.cost, extras: m.extras, evidence: { source_url: normalizeUrl(m.source_url), snapshot_id: pagesMap.get(normalizeUrl(m.source_url))!.snapshotId } }));
    const barLadders = pricingRaw.food_beverage.bar_ladders
      .filter((b) => pagesMap.has(normalizeUrl(b.source_url)))
      .map((b) => ({ name: b.name, includes: b.includes, prices: b.prices, note: b.note, evidence: { source_url: normalizeUrl(b.source_url), snapshot_id: pagesMap.get(normalizeUrl(b.source_url))!.snapshotId } }));
    const fbNotes: Fact<string>[] = [];
    for (const n of pricingRaw.food_beverage.notes) {
      const g = ground(n.quote, n.source_url, pagesMap, stats);
      if (g.keep) fbNotes.push({ value: n.value, quote: n.quote, source_url: g.sourceUrl, snapshot_id: g.snapshotId });
    }
    foodBeverage = { food_pills: foodPills, bar_pills: barPills, caption, food_note: foodNote, bar_note: barNote, menus, bar_ladders: barLadders, bar_min_guests: pricingRaw.food_beverage.bar_min_guests, notes: fbNotes };

    // faqs (verbatim; answer is the quote) + hotel-guest off-topic gate.
    const groundedFaqs: Faq[] = [];
    for (const f of pricingRaw.faqs) {
      const g = ground(f.answer, f.source_url, pagesMap, stats);
      if (g.keep) groundedFaqs.push({ question: f.question, answer: f.answer, source_url: g.sourceUrl, snapshot_id: g.snapshotId });
      else issues.push({ code: "ungrounded_item", path: `/faqs`, severity: "warning", tier: null, message: `FAQ "${f.question}" failed grounding -- dropped.` });
    }
    const beforeOffTopic = groundedFaqs.length;
    const onTopic = groundedFaqs.filter((f) => !HOTEL_GUEST_FAQ_RE.test(f.question) && !HOTEL_GUEST_FAQ_RE.test(f.answer));
    const droppedOffTopic = beforeOffTopic - onTopic.length;
    if (droppedOffTopic > 0) {
      issues.push({ code: "faq_off_topic", path: "/faqs", severity: "warning", tier: null, message: `Dropped ${droppedOffTopic} hotel-guest FAQ(s).` });
    }
    if (beforeOffTopic > 0 && droppedOffTopic / beforeOffTopic > 0.5) {
      reviewReasons.push("hotel_faq_contamination");
    }
    faqs.push(...onTopic);

    // corkage_implies_byo
    const barField = spine.bar as Tri<BarPolicy>;
    if (barField.status === "stated") {
      const { bar: barOverride, issue: corkageIssue } = checkCorkageImpliesByo(barField.value, addOns);
      if (corkageIssue) {
        spine.bar = { ...barField, value: barOverride! };
        issues.push(corkageIssue);
      }
    }
    // Additive pill augmentation: a corkage add-on implies BYO on the bar, even if the pricing
    // call never emitted the pill itself. Never removes a grounded pill (only ever adds).
    const hasCorkageAddOn = addOns.some((a) => /corkage/i.test(a.name));
    if (hasCorkageAddOn && !barPills.some((p) => p.value === "byo")) {
      const corkageAddOn = addOns.find((a) => /corkage/i.test(a.name))!;
      barPills.push({ value: "byo", quote: corkageAddOn.quote, source_url: corkageAddOn.source_url, snapshot_id: corkageAddOn.snapshot_id });
    }

    rates.sales_tax_source = computeSalesTaxSource({ sales_tax_pct: rates.sales_tax_pct, quote: rates.quote, taxes_included_in_rental: taxesIncluded ?? null }, paths.some((p) => p.per_guest_tiers.length > 0));
    if (rates.sales_tax_source === "chicago_default") {
      rates.sales_tax_pct = 11.75;
      rates.sales_tax_base = "fb_and_rentals";
    }
  }

  // --- resources -----------------------------------------------------------------
  const rawResources: RawResource[] = input.spineRaw.resources ?? [];
  const crawledAndAssetUrls = new Set<string>([...pagesMap.keys(), ...input.assetCandidateUrls.map(normalizeUrl)]);
  const resources: Resource[] = [];
  for (const r of rawResources) {
    if (JUNK_ASSET_RE.test(r.label) || JUNK_ASSET_RE.test(r.url)) {
      issues.push({ code: "junk_resource", path: `/resources`, severity: "warning", tier: null, message: `Dropped junk resource "${r.label}"` });
      continue;
    }
    const normUrl = normalizeUrl(r.url);
    if (!crawledAndAssetUrls.has(normUrl)) {
      issues.push({ code: "resource_not_crawled", path: `/resources`, severity: "warning", tier: null, message: `Resource URL ${r.url} not in the crawl/asset candidates -- dropped.` });
      continue;
    }
    const sourceNorm = normalizeUrl(r.source_url);
    const page = pagesMap.get(sourceNorm);
    resources.push({
      id: `${r.kind}-${resources.length}`,
      kind: r.kind as Resource["kind"],
      label: r.label,
      url: r.url,
      scope: r.scope as Resource["scope"],
      embeddable: null,
      has_text_layer: null,
      checked_at: null,
      source_url: sourceNorm,
      snapshot_id: page?.snapshotId ?? null,
    });
    if (resources.length >= 15) break;
  }

  // --- vendor lists -----------------------------------------------------------------
  const rawVendorLists: RawVendorList[] = input.spineRaw.vendor_lists ?? [];
  const vendorLists: VendorList[] = [];
  for (const v of rawVendorLists) {
    const cleanEntries = v.entries.filter((e) => !JUNK_VENDOR_NAME_RE.test(e.name));
    if (cleanEntries.length < 2) continue;
    for (const e of cleanEntries) {
      if (SLUGGY_NAME_RE.test(e.name)) {
        issues.push({ code: "sluggy_vendor_name", path: `/vendor_lists`, severity: "warning", tier: null, message: `Sluggy-looking vendor name "${e.name}"` });
      }
    }
    const sourceNorm = normalizeUrl(v.source_url);
    const page = pagesMap.get(sourceNorm);
    vendorLists.push({ label: v.label, category: v.category, relationship: v.relationship as VendorList["relationship"], entries: cleanEntries, source_url: sourceNorm, snapshot_id: page?.snapshotId ?? null });
  }

  // --- press features -----------------------------------------------------------------
  const pressFeatures: PressFeature[] = [];
  for (const pf of input.spineRaw.press_features ?? []) {
    const sourceNorm = normalizeUrl(pf.source_url);
    const page = pagesMap.get(sourceNorm);
    if (!page) {
      issues.push({ code: "press_feature_not_crawled", path: "/press_features", severity: "warning", tier: null, message: `Press feature source ${pf.source_url} not crawled -- dropped.` });
      continue;
    }
    pressFeatures.push({ title: pf.title, attribution: pf.attribution, url: pf.url, source_url: sourceNorm, snapshot_id: page.snapshotId });
  }

  // --- inclusions -----------------------------------------------------------------
  const inclusions: InclusionItem[] = [];
  for (const inc of input.spineRaw.inclusions ?? []) {
    const g = ground(inc.quote, inc.source_url, pagesMap, stats);
    if (!g.keep) {
      issues.push({ code: "ungrounded_item", path: `/inclusions`, severity: "warning", tier: "secondary", message: `Inclusion "${inc.label_raw}" failed grounding -- dropped.` });
      continue;
    }
    inclusions.push({ label: inc.label as InclusionItem["label"], label_raw: inc.label_raw, detail: inc.detail, category: inc.category as InclusionItem["category"], quote: inc.quote, source_url: g.sourceUrl, snapshot_id: g.snapshotId });
  }

  // --- about / differentiator (Sourced + numeric hygiene) -----------------------------
  let about: VenueDetailsV3["about"] = null;
  if (input.spineRaw.about) {
    const a = input.spineRaw.about;
    const sourceNorm = normalizeUrl(a.source_url);
    const page = pagesMap.get(sourceNorm);
    if (!page) {
      issues.push({ code: "about_source_not_crawled", path: "/about", severity: "warning", tier: null, message: `about source_url ${a.source_url} not crawled -- dropped.` });
    } else {
      const sentences = a.text.split(/(?<=[.!?])\s+/).filter(Boolean);
      const kept = sentences.filter((s) => {
        if (digitSequenceMissing(s)) {
          issues.push({ code: "about_numeric_hygiene", path: "/about", severity: "warning", tier: null, message: `Stripped an unsupported number from "about": "${s}"` });
          return false;
        }
        return true;
      });
      const finalText = kept.join(" ").slice(0, 600);
      if (finalText.trim().length > 0) about = { text: finalText, evidence: { source_url: sourceNorm, snapshot_id: page.snapshotId } };
    }
  }

  let differentiator: VenueDetailsV3["differentiator"] = null;
  if (input.spineRaw.differentiator) {
    const d = input.spineRaw.differentiator;
    const sourceNorm = normalizeUrl(d.source_url);
    const page = pagesMap.get(sourceNorm);
    const allText = [d.title, d.tagline ?? "", ...d.groups.flatMap((g) => [g.heading, ...g.bullets])].join(" ");
    if (!page) {
      issues.push({ code: "differentiator_source_not_crawled", path: "/differentiator", severity: "warning", tier: null, message: `differentiator source_url ${d.source_url} not crawled -- dropped.` });
    } else if (digitSequenceMissing(allText)) {
      issues.push({ code: "about_numeric_hygiene", path: "/differentiator", severity: "warning", tier: null, message: "Dropped differentiator -- contains an unsupported number." });
    } else {
      differentiator = { title: d.title, tagline: d.tagline, groups: d.groups, evidence: { source_url: sourceNorm, snapshot_id: page.snapshotId } };
    }
  }

  // --- final counts / gates -----------------------------------------------------------
  let spineStatedCount = 0;
  for (const key of SPINE_KEYS) {
    const s = spine[key] as Tri<unknown>;
    if (s.status === "stated" || s.status === "conflicting") spineStatedCount++;
  }

  const needsReview = criticalFailures > 0 || gt30pct || reviewReasons.length > 0;
  const ok = criticalFailures === 0 && !gt30pct;

  const repairs: Repair[] = issues.filter(isRepairable).map((issue) => buildRepairFor(issue, input.pages));

  const document: VenueDetailsV3 = {
    schema_version: VENUE_DETAILS_SCHEMA_VERSION,
    account_id: input.accountId,
    name: input.name,
    website_url: input.websiteUrl,
    spine: spine as unknown as VenueSpine,
    about,
    differentiator,
    spaces,
    capacities,
    pricing: {
      archetype: pricingArchetype as Pricing["archetype"],
      paths,
      rates,
      add_ons: addOns,
      required_third_party: requiredThirdParty,
      notes: [],
      ...(addOnCategories.length > 0 ? { add_on_categories: addOnCategories } : {}),
      ...(seasons ? { seasons } : {}),
    },
    food_beverage: foodBeverage,
    inclusions,
    faqs,
    resources,
    vendor_lists: vendorLists,
    press_features: pressFeatures,
    sources: {
      snapshot_ids: [...new Set(input.pages.map((p) => p.snapshot_id).filter((id): id is number => id != null))],
      pages: input.pages.map((p) => p.url),
      crawled_at: input.extractedAt,
    },
    extraction: input.runId != null ? { run_id: input.runId, prompt_version: input.promptVersion, model: input.model, extracted_at: input.extractedAt } : null,
    provenance: null,
  };

  return {
    document,
    issues,
    repairs,
    grounding: { checked: stats.checked, passed: stats.passed, failed: stats.failed, min_coverage: stats.coverages.length ? Math.min(...stats.coverages) : null },
    spineStatedCount,
    criticalFailures,
    needsReview,
    reviewReasons,
    ok,
  };
}
