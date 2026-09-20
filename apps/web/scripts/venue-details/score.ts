/**
 * Pure tier-weighted scoring of a candidate `VenueDetailsV3` against its golden fixture. No DB, no
 * network -- `scoreAgainstGolden.ts` is the thin DB/file-reading CLI wrapper around this.
 *
 * Scope filter (plan, "Calibration slate"): scored ONLY on golden fields tagged `eval: extractor`
 * (the fixture's `eval` map, keyed by the same stable field_path grammar as diff.ts/merge.ts) whose
 * `source_url` is in the candidate's crawled set (`sources.pages`) -- unless `--all-fields`/
 * `options.allFields` ignores both filters. `human_only`-tagged fields (an image-PDF menu, a
 * composting caveat) are excluded from every accuracy number; they exist in the fixture only so the
 * renderer has them.
 *
 * Interpretation note (spec is compressed here): "accuracy = matches / golden-stated fields" is
 * read as counting EVERY in-scope golden field in the denominator (not just the ones the golden
 * states a value for), with two explicit match rules layered on top: (1) golden stated vs candidate
 * not_stated is always a miss, (2) golden not_stated vs candidate not_stated is always a match (the
 * plan's explicit final clause). This makes "accuracy" a true per-field accuracy over the whole
 * in-scope set, not a recall-only number that ignores well-handled gaps -- see the docstring below
 * scoreVenue for the exact rule table.
 */
import { defaultAxes, estimateCost, headlineCapacity } from "../../lib/venueDetails/derive";
import { SPINE_KEYS, SPINE_TIERS, type SpineTier, type VenueDetailsV3 } from "../../lib/venueDetails/types";
// Reused as-is for the fuzzy add-on-name match in the `inventory` tier (item 1 of the important-tier
// split plan) -- app/components/venue/format.ts is a pure, React-free module so it imports cleanly
// from a scripts/ context.
import { isNearDuplicateAddOnName } from "../../app/components/venue/format";

// ---------------------------------------------------------------------------
// eval-tag / crawled-set scope filter
// ---------------------------------------------------------------------------

type EvalTag = "extractor" | "human_only";

/** Walks a field_path up to its parent segments looking for an eval tag -- lets a coarse tag
 * (`/food_beverage`, `/pricing/rates`) cover every path underneath it without repeating the tag
 * on every leaf. */
function evalTagFor(golden: VenueDetailsV3, path: string): EvalTag | undefined {
  const evalMap = golden.eval ?? {};
  const parts = path.split("/").filter(Boolean);
  for (let n = parts.length; n >= 1; n--) {
    const candidate = "/" + parts.slice(0, n).join("/");
    if (evalMap[candidate]) return evalMap[candidate];
  }
  return undefined;
}

/** In scope iff `--all-fields`, or the golden field is tagged `extractor` AND (it's `not_stated`,
 * so there's no source_url to check, or its `source_url` is in the CANDIDATE's crawled set --
 * `sources.pages` -- meaning a live run actually had a chance to see that page). */
function passesEvalAndCrawlFilter(golden: VenueDetailsV3, path: string, goldenSourceUrl: string | null, crawledPages: string[], options: { allFields?: boolean }): boolean {
  if (options.allFields) return true;
  const tag = evalTagFor(golden, path);
  if (tag !== "extractor") return false;
  if (goldenSourceUrl == null) return true;
  return crawledPages.includes(goldenSourceUrl);
}

// ---------------------------------------------------------------------------
// Excluded-fact accounting (silent-exclusion fix): every golden fact that fails the scope filter
// above gets a REASON instead of just vanishing from a denominator. `classify` is the same rule as
// `passesEvalAndCrawlFilter`/`evalTagFor` (reused, not reimplemented) but returns why, and doubles
// as the scope filter for every new `important_core`/`inventory` loop below so "in scope" and "why
// excluded" can never drift apart -- every golden item lands in exactly one bucket.
// ---------------------------------------------------------------------------

export type ExclusionReason = "human_only" | "source_not_crawled" | "no_text_layer" | "other";

export interface ExcludedFact {
  path: string;
  reason: ExclusionReason;
  source_url: string | null;
}

/** A golden fact's own `source_url` (a PDF, a page) is "no text layer" rather than plain
 * "not crawled" iff that exact url also appears as a `Resource` entry explicitly checked
 * (`has_text_layer === false`) -- `null` (not yet checked) or no matching resource both fall back
 * to the more conservative `source_not_crawled` reading. */
function resourceTextLayerFor(golden: VenueDetailsV3, url: string): boolean | null {
  const r = golden.resources.find((res) => res.url === url || res.source_url === url);
  return r ? r.has_text_layer : null;
}

/**
 * `mode: "strict"` is exactly `passesEvalAndCrawlFilter`'s rule (untagged = out of scope, bucketed
 * as `other`) -- used for spine/capacities/rates/pricing-path items/add-ons, every one of which the
 * golden fixtures already tag per-field. `mode: "loose"` is for the inventory kinds the fixtures
 * grew after 09-13 (inclusions/faqs/resources/vendor-list entries/add_on_categories/press features)
 * that have NO per-item eval tags anywhere yet (a real fixture-authoring gap, not a deliberate
 * human_only call) -- treating "untagged" as in-scope-by-default there (still respecting an
 * explicit `human_only` tag, and still crawl-gated) is what makes their recall/precision numbers
 * mean anything today instead of reading 0/0 everywhere.
 */
function classify(
  golden: VenueDetailsV3,
  path: string,
  sourceUrl: string | null,
  crawledPages: string[],
  options: { allFields?: boolean },
  mode: "strict" | "loose"
): { inScope: boolean; reason: ExclusionReason | null } {
  if (options.allFields) return { inScope: true, reason: null };
  const tag = evalTagFor(golden, path);
  if (tag === "human_only") return { inScope: false, reason: "human_only" };
  if (tag !== "extractor" && mode === "strict") return { inScope: false, reason: "other" };
  if (sourceUrl == null) return { inScope: true, reason: null };
  if (crawledPages.includes(sourceUrl)) return { inScope: true, reason: null };
  if (resourceTextLayerFor(golden, sourceUrl) === false) return { inScope: false, reason: "no_text_layer" };
  return { inScope: false, reason: "source_not_crawled" };
}

/** Filters `items` down to the in-scope subset by `classify(...)`, pushing every excluded item's
 * reason into `sink` (when given) -- the one place scoring and exclusion-reporting share their
 * scope decision so the two numbers always reconcile (in-scope + excluded === golden total). */
function scopedItems<T>(
  golden: VenueDetailsV3,
  items: T[],
  pathFn: (t: T) => string,
  urlFn: (t: T) => string | null,
  crawledPages: string[],
  options: { allFields?: boolean },
  mode: "strict" | "loose",
  sink?: ExcludedFact[]
): T[] {
  return items.filter((item) => {
    const path = pathFn(item);
    const source_url = urlFn(item);
    const { inScope, reason } = classify(golden, path, source_url, crawledPages, options, mode);
    if (!inScope && sink) sink.push({ path, reason: reason as ExclusionReason, source_url });
    return inScope;
  });
}

export interface ExcludedSummary {
  total: number;
  human_only: number;
  no_text_layer: number;
  other: number;
  source_not_crawled: { total: number; by_url: { url: string; count: number }[] };
  facts: ExcludedFact[];
}

function summarizeExclusions(facts: ExcludedFact[]): ExcludedSummary {
  const byUrl = new Map<string, number>();
  let human_only = 0;
  let no_text_layer = 0;
  let other = 0;
  let sourceNotCrawledTotal = 0;
  for (const f of facts) {
    if (f.reason === "human_only") human_only++;
    else if (f.reason === "no_text_layer") no_text_layer++;
    else if (f.reason === "other") other++;
    else if (f.reason === "source_not_crawled") {
      sourceNotCrawledTotal++;
      const url = f.source_url ?? "(no url)";
      byUrl.set(url, (byUrl.get(url) ?? 0) + 1);
    }
  }
  return {
    total: facts.length,
    human_only,
    no_text_layer,
    other,
    source_not_crawled: {
      total: sourceNotCrawledTotal,
      by_url: [...byUrl.entries()].map(([url, count]) => ({ url, count })).sort((a, b) => b.count - a.count),
    },
    facts,
  };
}

// ---------------------------------------------------------------------------
// Generic tri-state field comparison
// ---------------------------------------------------------------------------

type TriLike = { status: "stated" | "not_stated" | "conflicting"; value?: unknown; candidates?: { value: unknown }[]; source_url?: string };

function triSourceUrl(t: TriLike): string | null {
  if (t.status === "stated") return (t.source_url as string) ?? null;
  if (t.status === "conflicting") return t.candidates?.[0]?.value !== undefined ? null : null; // conflicting facts don't gate on a single url
  return null;
}

function triValues(t: TriLike): unknown[] {
  if (t.status === "stated") return [t.value];
  if (t.status === "conflicting") return (t.candidates ?? []).map((c) => c.value);
  return [];
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Rule table:
 *  - golden stated, candidate stated: match iff values equal.
 *  - golden stated, candidate conflicting: match iff any candidate value equals golden's.
 *  - golden stated, candidate not_stated: miss (unknown beats wrong, but a golden-known fact that
 *    the pipeline missed is still a miss for scoring purposes).
 *  - golden conflicting, candidate (any): match iff candidate's value(s) intersect golden's candidates.
 *  - golden not_stated, candidate not_stated: match (explicit plan rule).
 *  - golden not_stated, candidate stated/conflicting: miss (candidate invented a fact the fixture
 *    doesn't confirm) -- conservative reading; flagged in the module docstring as an interpretation.
 */
function triMatches(golden: TriLike, candidate: TriLike): boolean {
  if (golden.status === "not_stated") return candidate.status === "not_stated";
  const goldenValues = triValues(golden);
  const candidateValues = triValues(candidate);
  if (candidateValues.length === 0) return false;
  return goldenValues.some((gv) => candidateValues.some((cv) => deepEqual(gv, cv)));
}

// ---------------------------------------------------------------------------
// Tier scoring (spine)
// ---------------------------------------------------------------------------

export interface TierScore {
  tier: SpineTier;
  matches: number;
  total: number;
  accuracy: number; // matches/total; 1 when total===0 (nothing in scope, vacuously fine)
  misses: string[]; // field_paths that didn't match, for debugging
}

export function scoreSpineTiers(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean } = {}): Record<SpineTier, TierScore> {
  const result: Record<SpineTier, TierScore> = {
    critical: { tier: "critical", matches: 0, total: 0, accuracy: 1, misses: [] },
    important: { tier: "important", matches: 0, total: 0, accuracy: 1, misses: [] },
    secondary: { tier: "secondary", matches: 0, total: 0, accuracy: 1, misses: [] },
  };

  for (const key of SPINE_KEYS) {
    const path = `/spine/${key}`;
    const g = golden.spine[key] as unknown as TriLike;
    const goldenSourceUrl = triSourceUrl(g);
    if (!passesEvalAndCrawlFilter(golden, path, goldenSourceUrl, candidate.sources.pages, options)) continue;

    const tier = SPINE_TIERS[key];
    const c = candidate.spine[key] as unknown as TriLike;
    const match = triMatches(g, c);
    result[tier].total++;
    if (match) result[tier].matches++;
    else result[tier].misses.push(path);
  }

  for (const tier of Object.keys(result) as SpineTier[]) {
    const t = result[tier];
    t.accuracy = t.total === 0 ? 1 : t.matches / t.total;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Spaces (recall/precision by normalized name -- not eval-tag gated, see module docstring)
// ---------------------------------------------------------------------------

export interface RecallPrecisionScore {
  goldenCount: number;
  candidateCount: number;
  matchedCount: number;
  recall: number;
  precision: number;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function recallPrecision<T>(goldenItems: T[], candidateItems: T[], keyFn: (t: T) => string): RecallPrecisionScore {
  const goldenKeys = new Set(goldenItems.map(keyFn));
  const candidateKeys = new Set(candidateItems.map(keyFn));
  let matched = 0;
  for (const k of goldenKeys) if (candidateKeys.has(k)) matched++;
  return {
    goldenCount: goldenKeys.size,
    candidateCount: candidateKeys.size,
    matchedCount: matched,
    recall: goldenKeys.size === 0 ? 1 : matched / goldenKeys.size,
    precision: candidateKeys.size === 0 ? (goldenKeys.size === 0 ? 1 : 0) : matched / candidateKeys.size,
  };
}

export function scoreSpaces(candidate: VenueDetailsV3, golden: VenueDetailsV3): RecallPrecisionScore {
  return recallPrecision(golden.spaces, candidate.spaces, (s) => normalizeName(s.name));
}

export function scoreAddOns(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean } = {}): RecallPrecisionScore {
  const inScopeGolden = golden.pricing.add_ons.filter((a) => passesEvalAndCrawlFilter(golden, `/pricing/add_ons/${a.id}`, a.source_url, candidate.sources.pages, options));
  return recallPrecision(inScopeGolden, candidate.pricing.add_ons, (a) => `${normalizeName(a.name)}::${a.price ?? "null"}`);
}

// ---------------------------------------------------------------------------
// Capacity: exact (space_id, layout) -> max match; headline exactness.
// ---------------------------------------------------------------------------

export interface CapacityScore {
  matches: number;
  total: number;
  accuracy: number;
  headlineExact: boolean;
  goldenHeadline: number | null;
  candidateHeadline: number | null;
}

export function scoreCapacities(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean } = {}): CapacityScore {
  let matches = 0;
  let total = 0;
  const candidateByKey = new Map(candidate.capacities.map((c) => [`${c.space_id}:${c.layout}`, c]));
  for (const gc of golden.capacities) {
    const key = `${gc.space_id}:${gc.layout}`;
    if (!passesEvalAndCrawlFilter(golden, `/capacities/${key}`, gc.source_url, candidate.sources.pages, options)) continue;
    total++;
    const cc = candidateByKey.get(key);
    if (cc && cc.max === gc.max) matches++;
  }

  const goldenHc = headlineCapacity(golden);
  const candidateHc = headlineCapacity(candidate);

  return {
    matches,
    total,
    accuracy: total === 0 ? 1 : matches / total,
    headlineExact: goldenHc.headline === candidateHc.headline,
    goldenHeadline: goldenHc.headline,
    candidateHeadline: candidateHc.headline,
  };
}

// ---------------------------------------------------------------------------
// Pricing scalars: archetype, rates, minimums by (kind, day, season).
// ---------------------------------------------------------------------------

export interface PricingScalarScore {
  matches: number;
  total: number;
  accuracy: number;
  misses: string[];
}

const RATE_FIELDS = ["service_charge_pct", "service_charge_base", "sales_tax_pct", "sales_tax_base", "sales_tax_source", "cc_fee_pct"] as const;

export function scorePricingScalars(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean } = {}): PricingScalarScore {
  const misses: string[] = [];
  let matches = 0;
  let total = 0;

  // archetype (a spine field, already scored in scoreSpineTiers -- included again here per the
  // plan's explicit "pricing scalars (archetype, rates, minimums...)" listing, since it's the
  // scalar the calculator actually keys off of).
  if (passesEvalAndCrawlFilter(golden, "/spine/pricing_archetype", golden.spine.pricing_archetype.status === "stated" ? golden.spine.pricing_archetype.source_url : null, candidate.sources.pages, options)) {
    total++;
    if (triMatches(golden.spine.pricing_archetype as unknown as TriLike, candidate.spine.pricing_archetype as unknown as TriLike)) matches++;
    else misses.push("/spine/pricing_archetype");
  }

  // rates
  if (passesEvalAndCrawlFilter(golden, "/pricing/rates", golden.pricing.rates.source_url, candidate.sources.pages, options)) {
    for (const field of RATE_FIELDS) {
      total++;
      if (golden.pricing.rates[field] === candidate.pricing.rates[field]) matches++;
      else misses.push(`/pricing/rates/${field}`);
    }
  }

  // minimums, keyed by (kind, day, season), scoped to the golden's default path when present
  const goldenPath = golden.pricing.paths.find((p) => p.id === defaultAxes(golden).path_id) ?? golden.pricing.paths[0];
  const candidatePath = candidate.pricing.paths.find((p) => p.id === goldenPath?.id) ?? candidate.pricing.paths[0];
  if (goldenPath) {
    const candidateMinByKey = new Map((candidatePath?.minimums ?? []).map((m) => [`${m.kind}:${m.day}:${m.season}`, m]));
    for (const m of goldenPath.minimums) {
      const key = `${m.kind}:${m.day}:${m.season}`;
      const path = `/pricing/paths/${goldenPath.id}/minimums/${key}`;
      if (!passesEvalAndCrawlFilter(golden, path, m.source_url, candidate.sources.pages, options)) continue;
      total++;
      const cm = candidateMinByKey.get(key);
      if (cm && cm.amount === m.amount) matches++;
      else misses.push(path);
    }
  }

  // seasons: the venue's own peak/off month wording. No per-field source_url is stored (it's not
  // quote-grounded), so the eval-tag gate runs with a null goldenSourceUrl (same "nothing to check
  // against the crawled set" treatment as a not_stated tri-field).
  if (golden.pricing.seasons && passesEvalAndCrawlFilter(golden, "/pricing/seasons", null, candidate.sources.pages, options)) {
    total++;
    const g = golden.pricing.seasons;
    const c = candidate.pricing.seasons;
    if (c && g.peak === c.peak && g.off === c.off) matches++;
    else misses.push("/pricing/seasons");
  }

  // includes: the golden default path's path-wide inclusions, verbatim-item-set equality.
  if (goldenPath?.includes && goldenPath.includes.length > 0) {
    const includesPath = `/pricing/paths/${goldenPath.id}/includes`;
    if (passesEvalAndCrawlFilter(golden, includesPath, null, candidate.sources.pages, options)) {
      total++;
      const goldenSet = JSON.stringify([...goldenPath.includes].sort());
      const candidateSet = JSON.stringify([...(candidatePath?.includes ?? [])].sort());
      if (goldenSet === candidateSet) matches++;
      else misses.push(includesPath);
    }
  }

  // terms: the golden default path's labeled rental terms, set equality on labels (secondary-tier
  // scalar -- the label is the stable, comparable part; term prose itself isn't scored).
  if (goldenPath?.terms && goldenPath.terms.length > 0) {
    const termsPath = `/pricing/paths/${goldenPath.id}/terms`;
    if (passesEvalAndCrawlFilter(golden, termsPath, null, candidate.sources.pages, options)) {
      total++;
      const goldenLabels = JSON.stringify([...goldenPath.terms.map((t) => t.label)].sort());
      const candidateLabels = JSON.stringify([...(candidatePath?.terms ?? []).map((t) => t.label)].sort());
      if (goldenLabels === candidateLabels) matches++;
      else misses.push(termsPath);
    }
  }

  return { matches, total, accuracy: total === 0 ? 1 : matches / total, misses };
}

// ---------------------------------------------------------------------------
// important_core: the gated important-tier number, split off from the ungated `inventory` line
// items (add-ons/inclusions/FAQs/resources/vendor lists) that were drowning it out. Same shape as
// `TierScore` minus the `tier` discriminator (this isn't one of the three `SpineTier`s, and adding
// a fourth to that production-schema union for a scorer-only report would ripple into
// lib/venueDetails/types.ts and its validate/ consumers -- out of scope here).
//
// Covers, per the plan: the important-tier SPINE fields (same rule as scoreSpineTiers), every
// non-headline capacity tuple (the headline number already has its own EXACT gate --
// `gates.headlineExact` -- so it isn't double-counted here), the global rates block, and --
// genuinely new coverage, not scored anywhere else -- fixed fees / per-guest tiers / minimums /
// required staffing across EVERY pricing path (scorePricingScalars above only ever walked the
// golden's default path's minimums; everything path-shaped that's still "a number a couple
// budgets with" now counts here regardless of which path it's on).
// ---------------------------------------------------------------------------

export interface CoreScore {
  matches: number;
  total: number;
  accuracy: number;
  misses: string[];
}

export function scoreImportantCore(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean } = {}, excluded?: ExcludedFact[]): CoreScore {
  const misses: string[] = [];
  let matches = 0;
  let total = 0;
  const crawled = candidate.sources.pages;

  // Important-tier spine fields -- identical rule to scoreSpineTiers, filtered to just this tier.
  for (const key of SPINE_KEYS) {
    if (SPINE_TIERS[key] !== "important") continue;
    const path = `/spine/${key}`;
    const g = golden.spine[key] as unknown as TriLike;
    const { inScope, reason } = classify(golden, path, triSourceUrl(g), crawled, options, "strict");
    if (!inScope) {
      if (reason && excluded) excluded.push({ path, reason, source_url: triSourceUrl(g) });
      continue;
    }
    total++;
    const c = candidate.spine[key] as unknown as TriLike;
    if (triMatches(g, c)) matches++;
    else misses.push(path);
  }

  // Non-headline capacity tuples (the headline tuple is gated separately via headlineExact).
  const goldenHc = headlineCapacity(golden);
  const headlineKey = goldenHc.headline_space_id != null && goldenHc.headline_layout != null ? `${goldenHc.headline_space_id}:${goldenHc.headline_layout}` : null;
  const candidateByCapKey = new Map(candidate.capacities.map((c) => [`${c.space_id}:${c.layout}`, c]));
  const nonHeadlineCaps = scopedItems(
    golden,
    golden.capacities.filter((gc) => `${gc.space_id}:${gc.layout}` !== headlineKey),
    (gc) => `/capacities/${gc.space_id}:${gc.layout}`,
    (gc) => gc.source_url,
    crawled,
    options,
    "strict",
    excluded
  );
  for (const gc of nonHeadlineCaps) {
    const key = `${gc.space_id}:${gc.layout}`;
    const path = `/capacities/${key}`;
    total++;
    const cc = candidateByCapKey.get(key);
    if (cc && cc.max === gc.max) matches++;
    else misses.push(path);
  }

  // Rates: same single-gate-many-fields shape as scorePricingScalars (reused, not reimplemented).
  {
    const path = "/pricing/rates";
    const { inScope, reason } = classify(golden, path, golden.pricing.rates.source_url, crawled, options, "strict");
    if (!inScope) {
      if (reason && excluded) excluded.push({ path, reason, source_url: golden.pricing.rates.source_url });
    } else {
      for (const field of RATE_FIELDS) {
        total++;
        if (golden.pricing.rates[field] === candidate.pricing.rates[field]) matches++;
        else misses.push(`/pricing/rates/${field}`);
      }
    }
  }

  // Pricing-path numerics, every path (not just the default one).
  for (const gp of golden.pricing.paths) {
    const cp = candidate.pricing.paths.find((p) => p.id === gp.id);

    const fixedFees = scopedItems(golden, gp.fixed_fees, (f) => `/pricing/paths/${gp.id}/fixed_fees/${f.key}`, (f) => f.source_url, crawled, options, "strict", excluded);
    for (const f of fixedFees) {
      const path = `/pricing/paths/${gp.id}/fixed_fees/${f.key}`;
      total++;
      const cf = cp?.fixed_fees.find((x) => x.key === f.key);
      if (cf && cf.amount === f.amount) matches++;
      else misses.push(path);
    }

    const perGuestTiers = scopedItems(golden, gp.per_guest_tiers, (t) => `/pricing/paths/${gp.id}/per_guest_tiers/${t.id}`, (t) => t.source_url, crawled, options, "strict", excluded);
    for (const t of perGuestTiers) {
      const path = `/pricing/paths/${gp.id}/per_guest_tiers/${t.id}`;
      total++;
      const ct = cp?.per_guest_tiers.find((x) => x.id === t.id);
      if (ct && ct.per_guest === t.per_guest) matches++;
      else misses.push(path);
    }

    const minimums = scopedItems(
      golden,
      gp.minimums,
      (m) => `/pricing/paths/${gp.id}/minimums/${m.kind}:${m.day}:${m.season}`,
      (m) => m.source_url,
      crawled,
      options,
      "strict",
      excluded
    );
    for (const m of minimums) {
      const key = `${m.kind}:${m.day}:${m.season}`;
      const path = `/pricing/paths/${gp.id}/minimums/${key}`;
      total++;
      const cm = cp?.minimums.find((x) => `${x.kind}:${x.day}:${x.season}` === key);
      if (cm && cm.amount === m.amount) matches++;
      else misses.push(path);
    }

    if (gp.required_staffing) {
      const path = `/pricing/paths/${gp.id}/required_staffing`;
      const { inScope, reason } = classify(golden, path, gp.required_staffing.source_url, crawled, options, "strict");
      if (!inScope) {
        if (reason && excluded) excluded.push({ path, reason, source_url: gp.required_staffing.source_url });
      } else {
        total++;
        const cs = cp?.required_staffing;
        if (cs && cs.price_per_role === gp.required_staffing.price_per_role && cs.bartender_per_guests === gp.required_staffing.bartender_per_guests) matches++;
        else misses.push(path);
      }
    }
  }

  return { matches, total, accuracy: total === 0 ? 1 : matches / total, misses };
}

// ---------------------------------------------------------------------------
// inventory: line-item recall/precision -- add-ons, inclusions, FAQs, resources, vendor-list
// entries, add_on_categories, press features. Reported (recall AND precision, separately), never
// gated -- this is exactly the stuff that was inflating the old combined "important" number as the
// fixtures grew. Add-ons use a fuzzy name match (`isNearDuplicateAddOnName`) + price within 1%
// (spec: two write-ups of the same add-on shouldn't count as a miss); everything else matches on a
// stable identity field (label / question / url / name), same style as `scoreSpaces`/`scoreAddOns`
// above (recallPrecision), just extended to kinds that never had a scorer at all before this.
// ---------------------------------------------------------------------------

export interface InventoryKindScore {
  golden_items: number;
  extracted_items: number;
  found: number; // golden items matched by >=1 candidate item (recall numerator)
  matched: number; // candidate items matched by >=1 golden item (precision numerator)
  recall: number;
  precision: number;
}

function toInventoryKindScore(rp: RecallPrecisionScore): InventoryKindScore {
  return { golden_items: rp.goldenCount, extracted_items: rp.candidateCount, found: rp.matchedCount, matched: rp.matchedCount, recall: rp.recall, precision: rp.precision };
}

function priceWithin1Pct(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a === b;
  if (a === 0) return b === 0;
  return Math.abs(a - b) / Math.abs(a) <= 0.01;
}

function addOnFuzzyMatch(g: { name: string; price: number | null }, c: { name: string; price: number | null }): boolean {
  return isNearDuplicateAddOnName(g.name, c.name) && priceWithin1Pct(g.price, c.price);
}

function scoreAddOnsInventory(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean }, excluded?: ExcludedFact[]): InventoryKindScore {
  const inScopeGolden = scopedItems(golden, golden.pricing.add_ons, (a) => `/pricing/add_ons/${a.id}`, (a) => a.source_url, candidate.sources.pages, options, "strict", excluded);
  const candidateItems = candidate.pricing.add_ons;
  const found = inScopeGolden.filter((g) => candidateItems.some((c) => addOnFuzzyMatch(g, c))).length;
  const matched = candidateItems.filter((c) => inScopeGolden.some((g) => addOnFuzzyMatch(g, c))).length;
  return {
    golden_items: inScopeGolden.length,
    extracted_items: candidateItems.length,
    found,
    matched,
    recall: inScopeGolden.length === 0 ? 1 : found / inScopeGolden.length,
    precision: candidateItems.length === 0 ? (inScopeGolden.length === 0 ? 1 : 0) : matched / candidateItems.length,
  };
}

function scoreInclusionsInventory(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean }, excluded?: ExcludedFact[]): InventoryKindScore {
  const inScopeGolden = scopedItems(golden, golden.inclusions, (i) => `/inclusions/${i.label}`, (i) => i.source_url, candidate.sources.pages, options, "loose", excluded);
  return toInventoryKindScore(recallPrecision(inScopeGolden, candidate.inclusions, (i) => i.label));
}

function scoreFaqsInventory(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean }, excluded?: ExcludedFact[]): InventoryKindScore {
  const inScopeGolden = golden.faqs
    .map((f, idx) => ({ f, idx }))
    .filter(({ f, idx }) => {
      const { inScope, reason } = classify(golden, `/faqs/${idx}`, f.source_url, candidate.sources.pages, options, "loose");
      if (!inScope && reason && excluded) excluded.push({ path: `/faqs/${idx}`, reason, source_url: f.source_url });
      return inScope;
    })
    .map(({ f }) => f);
  return toInventoryKindScore(recallPrecision(inScopeGolden, candidate.faqs, (f) => normalizeName(f.question)));
}

function scoreResourcesInventory(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean }, excluded?: ExcludedFact[]): InventoryKindScore {
  const inScopeGolden = scopedItems(golden, golden.resources, (r) => `/resources/${r.id}`, (r) => r.source_url, candidate.sources.pages, options, "loose", excluded);
  return toInventoryKindScore(recallPrecision(inScopeGolden, candidate.resources, (r) => r.url));
}

function scoreVendorEntriesInventory(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean }, excluded?: ExcludedFact[]): InventoryKindScore {
  const goldenEntries = golden.vendor_lists.flatMap((list, listIdx) => list.entries.map((e, entryIdx) => ({ e, listIdx, entryIdx, source_url: list.source_url, label: list.label })));
  const inScope = goldenEntries.filter(({ label, entryIdx, source_url }) => {
    const path = `/vendor_lists/${label}/entries/${entryIdx}`;
    const { inScope: ok, reason } = classify(golden, path, source_url, candidate.sources.pages, options, "loose");
    if (!ok && reason && excluded) excluded.push({ path, reason, source_url });
    return ok;
  });
  const candidateEntries = candidate.vendor_lists.flatMap((list) => list.entries);
  return toInventoryKindScore(recallPrecision(inScope.map(({ e }) => e), candidateEntries, (e) => (e.instagram ? e.instagram.toLowerCase() : normalizeName(e.name))));
}

function scoreAddOnCategoriesInventory(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean }, excluded?: ExcludedFact[]): InventoryKindScore {
  const goldenCategories = golden.pricing.add_on_categories ?? [];
  const inScope = goldenCategories.filter((c) => {
    const path = `/pricing/add_on_categories/${c.category}`;
    const { inScope: ok, reason } = classify(golden, path, c.evidence.source_url, candidate.sources.pages, options, "loose");
    if (!ok && reason && excluded) excluded.push({ path, reason, source_url: c.evidence.source_url });
    return ok;
  });
  const candidateCategories = candidate.pricing.add_on_categories ?? [];
  return toInventoryKindScore(recallPrecision(inScope, candidateCategories, (c) => normalizeName(c.category)));
}

function scorePressFeaturesInventory(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean }, excluded?: ExcludedFact[]): InventoryKindScore {
  const inScopeGolden = scopedItems(golden, golden.press_features, (p) => `/press_features/${p.url}`, (p) => p.source_url, candidate.sources.pages, options, "loose", excluded);
  return toInventoryKindScore(recallPrecision(inScopeGolden, candidate.press_features, (p) => p.url));
}

export interface InventoryScore {
  golden_items: number;
  extracted_items: number;
  found: number;
  matched: number;
  recall: number;
  precision: number;
  by_kind: {
    add_ons: InventoryKindScore;
    inclusions: InventoryKindScore;
    faqs: InventoryKindScore;
    resources: InventoryKindScore;
    vendor_entries: InventoryKindScore;
    add_on_categories: InventoryKindScore;
    press_features: InventoryKindScore;
  };
}

export function scoreInventory(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean } = {}, excluded?: ExcludedFact[]): InventoryScore {
  const by_kind = {
    add_ons: scoreAddOnsInventory(candidate, golden, options, excluded),
    inclusions: scoreInclusionsInventory(candidate, golden, options, excluded),
    faqs: scoreFaqsInventory(candidate, golden, options, excluded),
    resources: scoreResourcesInventory(candidate, golden, options, excluded),
    vendor_entries: scoreVendorEntriesInventory(candidate, golden, options, excluded),
    add_on_categories: scoreAddOnCategoriesInventory(candidate, golden, options, excluded),
    press_features: scorePressFeaturesInventory(candidate, golden, options, excluded),
  };
  const kinds = Object.values(by_kind);
  const golden_items = kinds.reduce((s, k) => s + k.golden_items, 0);
  const extracted_items = kinds.reduce((s, k) => s + k.extracted_items, 0);
  const found = kinds.reduce((s, k) => s + k.found, 0);
  const matched = kinds.reduce((s, k) => s + k.matched, 0);
  return {
    golden_items,
    extracted_items,
    found,
    matched,
    recall: golden_items === 0 ? 1 : found / golden_items,
    precision: extracted_items === 0 ? (golden_items === 0 ? 1 : 0) : matched / extracted_items,
    by_kind,
  };
}

// ---------------------------------------------------------------------------
// estimateCost delta (2% gate) -- computed on the GOLDEN's default axes for both documents so
// they're compared apples-to-apples ("the scorer uses the fixture's pins when present").
// ---------------------------------------------------------------------------

export interface CostDeltaScore {
  goldenTotal: number | null; // null when golden has no_path (nothing to compare against)
  candidateTotal: number | null;
  pctDelta: number | null;
  withinGate: boolean; // true when goldenTotal is null (nothing to check) or delta <= 2%
}

const COST_DELTA_GATE = 0.02;

export function scoreCostDelta(candidate: VenueDetailsV3, golden: VenueDetailsV3): CostDeltaScore {
  const axes = defaultAxes(golden);
  const goldenEstimate = estimateCost(golden, axes);
  if (goldenEstimate.warnings.includes("no_path")) {
    return { goldenTotal: null, candidateTotal: null, pctDelta: null, withinGate: true };
  }
  const candidateEstimate = estimateCost(candidate, axes);
  const candidateTotal = candidateEstimate.warnings.includes("no_path") ? null : candidateEstimate.total;
  const pctDelta = candidateTotal == null ? null : Math.abs(candidateTotal - goldenEstimate.total) / (goldenEstimate.total || 1);
  return {
    goldenTotal: goldenEstimate.total,
    candidateTotal,
    pctDelta,
    withinGate: pctDelta != null && pctDelta <= COST_DELTA_GATE,
  };
}

// ---------------------------------------------------------------------------
// Critical numeric grounding rate: stated critical numerics on the CANDIDATE with a non-empty
// quote / all stated critical numerics on the candidate (uses tiers.ts's criticalFieldPaths so the
// "critical" set is defined in exactly one place).
// ---------------------------------------------------------------------------

export interface CriticalGroundingScore {
  statedCriticalNumerics: number;
  withQuote: number;
  rate: number; // 1 when statedCriticalNumerics === 0
}

interface ResolvedFact {
  stated: boolean;
  quote: string | null;
  numeric: boolean;
}

function resolveCriticalPath(d: VenueDetailsV3, path: string): ResolvedFact | null {
  const parts = path.split("/").filter(Boolean);
  const [root, id, sub, subId, subSub] = parts;

  if (root === "spine") {
    const tri = d.spine[id as keyof VenueDetailsV3["spine"]] as unknown as TriLike;
    if (tri.status === "not_stated") return { stated: false, quote: null, numeric: false };
    const value = tri.status === "stated" ? tri.value : tri.candidates?.[0]?.value;
    const numeric = typeof value === "number" || (typeof value === "object" && value !== null && "amount_usd" in (value as Record<string, unknown>));
    const quote = tri.status === "stated" ? ((tri as unknown as { quote?: string }).quote ?? null) : ((tri.candidates?.[0] as unknown as { quote?: string })?.quote ?? null);
    return { stated: true, quote, numeric };
  }
  if (root === "capacities") {
    const cap = d.capacities.find((c) => `${c.space_id}:${c.layout}` === id);
    if (!cap) return null;
    return { stated: true, quote: cap.quote, numeric: true };
  }
  if (root === "pricing" && id === "rates") {
    return { stated: d.pricing.rates.quote != null, quote: d.pricing.rates.quote, numeric: true };
  }
  if (root === "pricing" && id === "paths" && sub === undefined) return null;
  if (root === "pricing" && id === "paths") {
    const path_ = d.pricing.paths.find((p) => p.id === sub);
    if (!path_) return null;
    if (subId === "fixed_fees") {
      const fee = path_.fixed_fees.find((f) => f.key === subSub);
      if (!fee) return null;
      return { stated: true, quote: fee.quote, numeric: true };
    }
    if (subId === "per_guest_tiers") {
      const tier = path_.per_guest_tiers.find((t) => t.id === subSub);
      if (!tier) return null;
      return { stated: true, quote: tier.quote, numeric: true };
    }
    if (subId === "minimums") {
      const min = path_.minimums.find((m) => `${m.kind}:${m.day}:${m.season}` === subSub);
      if (!min) return null;
      return { stated: true, quote: min.quote, numeric: true };
    }
  }
  return null;
}

export function scoreCriticalGrounding(candidate: VenueDetailsV3, criticalFieldPaths: string[]): CriticalGroundingScore {
  let statedCriticalNumerics = 0;
  let withQuote = 0;
  for (const path of criticalFieldPaths) {
    const resolved = resolveCriticalPath(candidate, path);
    if (!resolved || !resolved.stated || !resolved.numeric) continue;
    statedCriticalNumerics++;
    if (resolved.quote && resolved.quote.trim().length > 0) withQuote++;
  }
  return { statedCriticalNumerics, withQuote, rate: statedCriticalNumerics === 0 ? 1 : withQuote / statedCriticalNumerics };
}

// ---------------------------------------------------------------------------
// Gates + top-level scoreVenue
// ---------------------------------------------------------------------------

export interface Gates {
  critical: boolean; // >= 0.95
  important: boolean; // >= 0.85
  secondary: boolean; // >= 0.70
  headlineExact: boolean;
  costDelta: boolean; // <= 2%
  criticalGrounding: boolean; // === 1
  overall: boolean;
}

const GATE_THRESHOLDS: Record<SpineTier, number> = { critical: 0.95, important: 0.85, secondary: 0.7 };
const IMPORTANT_CORE_GATE = 0.85;

/** Records exclusions for the facts important_core/inventory never touch: critical- and
 * secondary-tier spine fields, and the headline capacity tuple (its own EXACT gate covers scoring
 * it; it still deserves a reason when it's out of scope, same as every other fact). Kept separate
 * from scoreImportantCore/scoreInventory so those two stay focused on what they actually score. */
function collectRemainingExclusions(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean }): ExcludedFact[] {
  const excluded: ExcludedFact[] = [];
  const crawled = candidate.sources.pages;

  for (const key of SPINE_KEYS) {
    if (SPINE_TIERS[key] === "important") continue; // covered by scoreImportantCore
    const path = `/spine/${key}`;
    const g = golden.spine[key] as unknown as TriLike;
    const { inScope, reason } = classify(golden, path, triSourceUrl(g), crawled, options, "strict");
    if (!inScope && reason) excluded.push({ path, reason, source_url: triSourceUrl(g) });
  }

  const goldenHc = headlineCapacity(golden);
  if (goldenHc.headline_space_id != null && goldenHc.headline_layout != null) {
    const key = `${goldenHc.headline_space_id}:${goldenHc.headline_layout}`;
    const gc = golden.capacities.find((c) => `${c.space_id}:${c.layout}` === key);
    if (gc) {
      const path = `/capacities/${key}`;
      const { inScope, reason } = classify(golden, path, gc.source_url, crawled, options, "strict");
      if (!inScope && reason) excluded.push({ path, reason, source_url: gc.source_url });
    }
  }

  return excluded;
}

export interface VenueScoreResult {
  /** `tiers.important` is @deprecated: kept for one release as the old spine-only, combined
   * "important" number -- `gates.important` now gates on `important_core` instead (see below).
   * Superseded by `important_core` (spine + capacities + all-path pricing numerics) and
   * `inventory` (line items, ungated) once callers have migrated. `tiers.critical`/`.secondary`
   * are unaffected -- this split only touches the important tier. */
  tiers: Record<SpineTier, TierScore>;
  spaces: RecallPrecisionScore;
  capacities: CapacityScore;
  pricingScalars: PricingScalarScore;
  addOns: RecallPrecisionScore;
  /** The important-tier spine fields + non-headline capacity tuples + all-path pricing numerics
   * (fixed fees / per-guest tiers / minimums / rates / required staffing) -- everything a couple
   * budgets with. This is what `gates.important` gates on now. */
  important_core: CoreScore;
  /** Line-item recall/precision -- add-ons, inclusions, FAQs, resources, vendor-list entries,
   * add_on_categories, press features. Informational only; never gated. */
  inventory: InventoryScore;
  /** Every golden fact NOT scored anywhere above, bucketed by why -- the fix for silent
   * exclusions (a fact whose source_url was never crawled used to just vanish from a denominator). */
  excluded: ExcludedSummary;
  costDelta: CostDeltaScore;
  criticalGrounding: CriticalGroundingScore;
  gates: Gates;
}

export function scoreVenue(candidate: VenueDetailsV3, golden: VenueDetailsV3, criticalFieldPaths: string[], options: { allFields?: boolean } = {}): VenueScoreResult {
  const tiers = scoreSpineTiers(candidate, golden, options);
  const spaces = scoreSpaces(candidate, golden);
  const capacities = scoreCapacities(candidate, golden, options);
  const pricingScalars = scorePricingScalars(candidate, golden, options);
  const addOns = scoreAddOns(candidate, golden, options);
  const costDelta = scoreCostDelta(candidate, golden);
  const criticalGrounding = scoreCriticalGrounding(candidate, criticalFieldPaths);

  const excludedFacts: ExcludedFact[] = [];
  const important_core = scoreImportantCore(candidate, golden, options, excludedFacts);
  const inventory = scoreInventory(candidate, golden, options, excludedFacts);
  excludedFacts.push(...collectRemainingExclusions(candidate, golden, options));
  const excluded = summarizeExclusions(excludedFacts);

  const gates: Gates = {
    critical: tiers.critical.accuracy >= GATE_THRESHOLDS.critical,
    important: important_core.accuracy >= IMPORTANT_CORE_GATE,
    secondary: tiers.secondary.accuracy >= GATE_THRESHOLDS.secondary,
    headlineExact: capacities.headlineExact,
    costDelta: costDelta.withinGate,
    criticalGrounding: criticalGrounding.rate === 1,
    overall: false,
  };
  gates.overall = gates.critical && gates.important && gates.secondary && gates.headlineExact && gates.costDelta && gates.criticalGrounding;

  return { tiers, spaces, capacities, pricingScalars, addOns, important_core, inventory, excluded, costDelta, criticalGrounding, gates };
}
