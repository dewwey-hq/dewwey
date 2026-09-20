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
import {
  SPINE_KEYS,
  SPINE_TIERS,
  type Cancellation,
  type EstimateInput,
  type FbMinimum,
  type FixedFee,
  type Minimum,
  type PaymentSchedule,
  type PerGuestTier,
  type PricingPath,
  type Season,
  type Space,
  type SpineTier,
  type VenueDetailsV3,
  type VenueSpine,
} from "../../lib/venueDetails/types";
// Reused as-is for the fuzzy add-on-name match in the `inventory` tier (item 1 of the important-tier
// split plan) -- app/components/venue/format.ts is a pure, React-free module so it imports cleanly
// from a scripts/ context.
import { isNearDuplicateAddOnName } from "../../app/components/venue/format";
// Same URL normalization the validator's grounding check uses (scheme/www/trailing-slash/hash) --
// reused, not reimplemented, so "was this page crawled?" never drifts between validation and
// scoring (tick c3 evidence: LondonHouse's golden cites ".../weddings", the crawl stored
// ".../weddings/", and raw string comparison called all 46 facts on that page source_not_crawled).
import { normalizeUrl } from "./validate/grounding";
import { canonicalVideoUrl } from "./crawl/htmlText";

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

/** Is `url` in the crawled set, comparing NORMALIZED forms (`normalizeUrl` -- scheme, `www.`,
 * trailing slash, hash all fall away) -- the same rule `validate/grounding.ts`'s `checkGrounding`
 * uses to decide a page was crawled. A golden fact citing ".../weddings" must count as crawled
 * when the crawl stored ".../weddings/" (tick c3, LondonHouse evidence: 46 facts wrongly landed in
 * `source_not_crawled` over exactly this trailing slash). */
function crawledSetHas(crawledPages: string[], url: string | null): boolean {
  if (url == null) return false;
  const norm = normalizeUrl(url);
  return crawledPages.some((p) => normalizeUrl(p) === norm);
}

/** In scope iff `--all-fields`, or the golden field is tagged `extractor` AND (it's `not_stated`,
 * so there's no source_url to check, or its `source_url` is in the CANDIDATE's crawled set --
 * `sources.pages` -- meaning a live run actually had a chance to see that page). */
function passesEvalAndCrawlFilter(golden: VenueDetailsV3, path: string, goldenSourceUrl: string | null, crawledPages: string[], options: { allFields?: boolean }): boolean {
  if (options.allFields) return true;
  const tag = evalTagFor(golden, path);
  if (tag !== "extractor") return false;
  if (goldenSourceUrl == null) return true;
  return crawledSetHas(crawledPages, goldenSourceUrl);
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
  const norm = normalizeUrl(url);
  const r = golden.resources.find((res) => normalizeUrl(res.url) === norm || normalizeUrl(res.source_url) === norm);
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
  if (crawledSetHas(crawledPages, sourceUrl)) return { inScope: true, reason: null };
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
// Misses carry values (tick c2 calibration fix): every miss entry below is `{path, golden,
// candidate, note}` -- a short, JSON-safe snapshot of what each side actually said, not just the
// field_path -- so a scorecard reader (human or the calibration loop) can tell a real extraction
// error from a scorer artifact without re-running anything. `golden`/`candidate` are deliberately
// loose (`unknown`): every call site passes whatever small JSON-safe value it already has in hand
// (a tri-state's resolved value, a fee amount, a capacity max, a golden/candidate value for a text
// field) -- never the full nested Fact/Tri wrapper.
// ---------------------------------------------------------------------------

export interface Miss {
  path: string;
  golden: unknown;
  candidate: unknown;
  note: string;
}

function mkMiss(path: string, golden: unknown, candidate: unknown, note: string = ""): Miss {
  return { path, golden, candidate, note };
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

/** Short JSON-safe summary of a tri-state field's current value, for miss reporting -- `not_stated`
 * collapses to the string `"not_stated"` (never confused with a real value), `conflicting` reports
 * every candidate value (an array), `stated` reports the bare value. */
function triSummary(t: TriLike): unknown {
  if (t.status === "not_stated") return "not_stated";
  if (t.status === "conflicting") return (t.candidates ?? []).map((c) => c.value);
  return t.value;
}

function missNoteFor(golden: TriLike, candidate: TriLike): string {
  if (golden.status === "not_stated") return "candidate stated a value the golden fixture doesn't confirm";
  if (candidate.status === "not_stated") return "candidate missing";
  if (golden.status === "conflicting") return "candidate didn't match any of the golden's conflicting values";
  return "value mismatch";
}

// ---------------------------------------------------------------------------
// Semantic value comparison for a handful of structured/text spine fields (tick c2 calibration
// fix, evidence from runs 16-19): these fields carry the SAME fact in genuinely different wording
// between the golden fixture and a live model run (a paraphrase, a reordered JSON object, a
// "2:00 am" vs "02:00" time format) -- scoring them with plain `deepEqual` was counting real
// matches as misses. Only wired into the STATED-vs-STATED branch of `triMatches` below; the
// not_stated/conflicting branches keep the existing generic rule table untouched, so a golden
// `conflicting` fact (e.g. Marchetti's `payment_schedule`) still scores a stated candidate as a
// miss unless it happens to deep-equal one of the conflicting candidates verbatim -- deliberately
// conservative, per the plan's explicit "conflicting golden vs stated candidate stays a miss".
// ---------------------------------------------------------------------------

/** Numeric/percent tokens in a piece of prose ("50% deposit" -> ["50%"], "10 days" -> ["10"]),
 * compared as a set (order-independent) -- two write-ups of the same fact should carry the same
 * numbers even when everything around them is paraphrased. */
function numericTokens(s: string): Set<string> {
  return new Set(s.match(/\d+(?:\.\d+)?%?/g) ?? []);
}

function numericTokenSetsMatch(a: string, b: string): boolean {
  const ta = numericTokens(a);
  const tb = numericTokens(b);
  if (ta.size !== tb.size) return false;
  for (const t of ta) if (!tb.has(t)) return false;
  return true;
}

/** "2:00 am" / "2am" / "02:00" -> "02:00" (24h `HH:MM`); `null` when the string doesn't parse as a
 * time at all (e.g. a golden fixture's prose "Midnight") -- callers fall back to exact string
 * comparison in that case rather than silently treating an unparseable value as a match. */
export function normalizeTime(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  let m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m) {
    const hh = Number(m[1]);
    if (hh >= 0 && hh <= 23) return `${String(hh).padStart(2, "0")}:${m[2]}`;
  }
  m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(s);
  if (m) {
    let hh = Number(m[1]) % 12;
    if (m[3] === "pm") hh += 12;
    return `${String(hh).padStart(2, "0")}:${m[2] ?? "00"}`;
  }
  return null;
}

function noiseCurfewMatches(a: string, b: string): boolean {
  const na = normalizeTime(a);
  const nb = normalizeTime(b);
  return na != null && nb != null ? na === nb : a === b;
}

/** Deposit numeric tokens must agree, and both sides must have/lack `balance_due` -- comparing its
 * numeric tokens too when both state one. */
function paymentScheduleMatches(g: PaymentSchedule, c: PaymentSchedule): boolean {
  if (!numericTokenSetsMatch(g.deposit, c.deposit)) return false;
  const gHas = !!g.balance_due?.trim();
  const cHas = !!c.balance_due?.trim();
  if (gHas !== cHas) return false;
  return !gHas || numericTokenSetsMatch(g.balance_due as string, c.balance_due as string);
}

function cancellationMatches(g: Cancellation, c: Cancellation): boolean {
  if ((g.deposit_refundable ?? null) !== (c.deposit_refundable ?? null)) return false;
  return numericTokenSetsMatch(g.summary, c.summary);
}

/** `applies` + `amount_usd` only -- `detail` is prose (two honest write-ups of the same
 * yes/no-and-amount fact needn't share a single word of it). */
function fbMinimumMatches(g: FbMinimum, c: FbMinimum): boolean {
  return g.applies === c.applies && g.amount_usd === c.amount_usd;
}

const SEMANTIC_SPINE_COMPARATORS: Partial<Record<keyof VenueSpine, (g: unknown, c: unknown) => boolean>> = {
  payment_schedule: (g, c) => paymentScheduleMatches(g as PaymentSchedule, c as PaymentSchedule),
  cancellation: (g, c) => cancellationMatches(g as Cancellation, c as Cancellation),
  noise_curfew: (g, c) => noiseCurfewMatches(g as string, c as string),
  fb_minimum: (g, c) => fbMinimumMatches(g as FbMinimum, c as FbMinimum),
};

/** Rule table:
 *  - golden stated, candidate stated: match iff values equal -- `key`, when given and one of the
 *    fields above, dispatches to the semantic comparator instead of plain `deepEqual` (enum/numeric
 *    scalar fields have no entry, so they keep exact equality -- "enum fields stay exact").
 *  - golden stated, candidate conflicting: match iff any candidate value equals golden's.
 *  - golden stated, candidate not_stated: miss (unknown beats wrong, but a golden-known fact that
 *    the pipeline missed is still a miss for scoring purposes).
 *  - golden conflicting, candidate (any): match iff candidate's value(s) intersect golden's candidates.
 *  - golden not_stated, candidate not_stated: match (explicit plan rule).
 *  - golden not_stated, candidate stated/conflicting: miss (candidate invented a fact the fixture
 *    doesn't confirm) -- conservative reading; flagged in the module docstring as an interpretation.
 */
function triMatches(golden: TriLike, candidate: TriLike, key?: keyof VenueSpine): boolean {
  if (golden.status === "not_stated") return candidate.status === "not_stated";
  if (golden.status === "stated" && candidate.status === "stated" && key) {
    const cmp = SEMANTIC_SPINE_COMPARATORS[key];
    if (cmp) return cmp(golden.value, candidate.value);
  }
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
  misses: Miss[];
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
    const match = triMatches(g, c, key);
    result[tier].total++;
    if (match) result[tier].matches++;
    else result[tier].misses.push(mkMiss(path, triSummary(g), triSummary(c), missNoteFor(g, c)));
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
// Space alignment (tick c2 calibration fix, evidence from runs 16-19): a live model run invents
// its OWN space ids ("the_pavilion", "greenhouse_loft", "whole_venue") that never match a golden
// fixture's hand-authored slugs ("the-pavilion", "loft") even when every capacity/fee number
// underneath is identical -- scoreCapacities/scoreImportantCore used to key off the raw id and
// score every one of those facts as a miss. `alignSpaces` builds a candidateId -> goldenId map so
// every space-keyed comparison below (capacities, fixed fees, per-guest tiers) compares on the
// SAME space instead of the same spelling.
// ---------------------------------------------------------------------------

function normalizeSpaceId(id: string): string {
  const base = id.toLowerCase().trim().replace(/[_\s]+/g, "-");
  return base.startsWith("the-") ? base.slice(4) : base;
}

function nameTokens(s: string): Set<string> {
  return new Set(normalizeName(s).split(" ").filter(Boolean));
}

function nameTokenJaccard(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * candidateId -> goldenId, by (1) normalized id equality (lowercase, `_`/space -> `-`, strip a
 * leading `the-`), (2) normalized name token Jaccard >= 0.5 (greedy, highest score first, each
 * golden space used at most once), (3) the single-space rule: when the golden has exactly one
 * space, EVERY remaining candidate space aligns to it -- including the literal pseudo-id
 * `"whole_venue"`, which never needs to appear in `candidate` at all (a `CapacityTuple`/`FixedFee`
 * can reference it directly with no matching `Space` entry).
 */
export function alignSpaces(golden: Space[], candidate: Space[]): Map<string, string> {
  const map = new Map<string, string>();
  const usedGolden = new Set<string>();

  for (const c of candidate) {
    const normC = normalizeSpaceId(c.id);
    const g = golden.find((gs) => !usedGolden.has(gs.id) && normalizeSpaceId(gs.id) === normC);
    if (g) {
      map.set(c.id, g.id);
      usedGolden.add(g.id);
    }
  }

  const scored: { c: Space; g: Space; score: number }[] = [];
  for (const c of candidate) {
    if (map.has(c.id)) continue;
    for (const g of golden) {
      if (usedGolden.has(g.id)) continue;
      const score = nameTokenJaccard(c.name, g.name);
      if (score >= 0.5) scored.push({ c, g, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  for (const { c, g } of scored) {
    if (map.has(c.id) || usedGolden.has(g.id)) continue;
    map.set(c.id, g.id);
    usedGolden.add(g.id);
  }

  if (golden.length === 1) {
    const gId = golden[0].id;
    if (candidate.length === 1 && !map.has(candidate[0].id)) map.set(candidate[0].id, gId);
    if (!map.has("whole_venue")) map.set("whole_venue", gId);
  }

  return map;
}

interface SpaceAlignmentContext {
  spaceMap: Map<string, string>; // candidateId -> goldenId
  goldenSpaceIds: Set<string>;
}

function buildSpaceAlignmentContext(golden: VenueDetailsV3, candidate: VenueDetailsV3): SpaceAlignmentContext {
  return { spaceMap: alignSpaces(golden.spaces, candidate.spaces), goldenSpaceIds: new Set(golden.spaces.map((s) => s.id)) };
}

/** A capacity/fee's space reference (a real space id, `null`, or the literal `"whole_venue"`
 * pseudo-id) resolved onto the GOLDEN's own space id whenever alignment found one -- `null` and
 * `"whole_venue"` both mean "the whole venue", which `alignSpaces` already collapsed onto the
 * golden's single space id when the golden itself has exactly one (Greenhouse's whole-venue fees
 * vs. the candidate's own `greenhouse_loft`-keyed ones). An id that resolves to nothing is returned
 * unchanged, so it only ever self-matches an equally-unresolved id -- conservative, never a false
 * positive. */
function canonicalSpaceKey(rawId: string | null, ctx: SpaceAlignmentContext): string {
  const id = rawId ?? "whole_venue";
  if (ctx.goldenSpaceIds.has(id)) return id;
  return ctx.spaceMap.get(id) ?? id;
}

const seasonKey = (s: Season | null | undefined): Season => s ?? "any";

/** A fixed fee's effective space key -- `applies_to === "whole_venue"` always resolves through the
 * `null`/whole-venue path regardless of whatever `space_id` a model happened to also set. */
function feeSpaceKey(f: { applies_to: string; space_id: string | null }, ctx: SpaceAlignmentContext): string {
  return canonicalSpaceKey(f.applies_to === "whole_venue" ? null : f.space_id, ctx);
}

/** Semantic fixed-fee match (tick c2): aligned space, exact day, season-or-`any`, amount within 1%
 * -- not the old literal `key` string equality, which broke the instant a model chose its own key
 * spelling even when every underlying number was identical (Marchetti/Greenhouse evidence). */
function fixedFeesMatch(g: FixedFee, c: FixedFee, ctx: SpaceAlignmentContext): boolean {
  if (feeSpaceKey(g, ctx) !== feeSpaceKey(c, ctx)) return false;
  if ((g.day ?? null) !== (c.day ?? null)) return false;
  if (seasonKey(g.season) !== seasonKey(c.season)) return false;
  return priceWithin1Pct(g.amount, c.amount);
}

/** The candidate fee sharing the golden's (space, day, season) regardless of amount -- so a miss
 * can report what the candidate actually said instead of just "nothing matched". */
function findAlignedFee(g: FixedFee, candidateFees: FixedFee[], ctx: SpaceAlignmentContext): FixedFee | undefined {
  return candidateFees.find((c) => feeSpaceKey(g, ctx) === feeSpaceKey(c, ctx) && (g.day ?? null) === (c.day ?? null) && seasonKey(g.season) === seasonKey(c.season));
}

/** Per-guest tier match: normalized name OR normalized id, price within 1% -- no space dimension
 * (per-guest tiers aren't space-scoped in this schema). */
function tiersMatch(g: PerGuestTier, c: PerGuestTier): boolean {
  const idOrNameMatch = normalizeName(g.id) === normalizeName(c.id) || normalizeName(g.name) === normalizeName(c.name);
  return idOrNameMatch && priceWithin1Pct(g.per_guest, c.per_guest);
}

function findAlignedTier(g: PerGuestTier, candidateTiers: PerGuestTier[]): PerGuestTier | undefined {
  return candidateTiers.find((c) => normalizeName(g.id) === normalizeName(c.id) || normalizeName(g.name) === normalizeName(c.name));
}

function minimumsMatch(g: Minimum, c: Minimum): boolean {
  return g.kind === c.kind && (g.day ?? null) === (c.day ?? null) && seasonKey(g.season) === seasonKey(c.season) && g.amount === c.amount;
}

function findAlignedMinimum(g: Minimum, candidateMins: Minimum[]): Minimum | undefined {
  return candidateMins.find((c) => g.kind === c.kind && (g.day ?? null) === (c.day ?? null) && seasonKey(g.season) === seasonKey(c.season));
}

// ---------------------------------------------------------------------------
// Multi-path name alignment (tick c4, Diamond Garden v3.3 evidence): when both documents have
// MORE than one pricing path and no id lines up, a model's own path names ("Hall Rental Only
// (DIY)") still overlap a golden path's id+name ("hall-rental-only" / "Venue only") on the
// meaningful words even though the exact phrasing never will -- a small synonym map folds
// near-synonymous words ("hall"/"rental"/"venue"/"only"/"space", "inclusive"/"complete"/
// "package"/"all", "carte"/"plus"/"add"/"ons") onto the same bucket before the Jaccard check, the
// same >= 0.5 threshold `alignSpaces` already uses for space names.
// ---------------------------------------------------------------------------

const PATH_SYNONYM_GROUPS: string[][] = [
  ["rental", "hall", "venue", "only", "space"],
  ["inclusive", "complete", "package", "all"],
  ["carte", "plus", "add", "ons"],
];

function canonicalPathToken(token: string): string {
  for (let i = 0; i < PATH_SYNONYM_GROUPS.length; i++) {
    if (PATH_SYNONYM_GROUPS[i].includes(token)) return `syn:${i}`;
  }
  return token;
}

/** Combined id+name tokens (normalized, short/noise tokens like "a"/"la" dropped, each word
 * folded onto its synonym bucket when it has one) -- the unit `pathTokenJaccard` compares. */
function pathNameTokens(p: PricingPath): Set<string> {
  const raw = [...normalizeName(p.id).split(" "), ...normalizeName(p.name).split(" ")].filter((t) => t.length >= 3);
  return new Set(raw.map(canonicalPathToken));
}

function pathTokenJaccard(a: PricingPath, b: PricingPath): number {
  const ta = pathNameTokens(a);
  const tb = pathNameTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function bestPathByNameTokens(gp: PricingPath, candidatePaths: PricingPath[]): PricingPath | undefined {
  let best: { p: PricingPath; score: number } | null = null;
  for (const p of candidatePaths) {
    const score = pathTokenJaccard(gp, p);
    if (score >= 0.5 && (!best || score > best.score)) best = { p, score };
  }
  return best?.p;
}

/** Resolves the candidate pricing path a golden path should compare against:
 * 1. exact id match.
 * 2. (tick c2, evidence from run 16/17) the candidate's own single path when BOTH documents have
 *    exactly one: a model invents its own path id/name ("wedding_experiences") that has no reason
 *    to match a golden fixture's ("default") even though it's clearly the same one path -- the
 *    same fallback `scorePricingScalars` already uses for its own (single) default-path lookup.
 * 3. (tick c4) when BOTH documents have more than one path, the candidate path whose id+name
 *    tokens overlap this golden path's by >= 0.5 under the synonym map above.
 * 4. (tick c4) last resort, only for the golden's own pinned DEFAULT path when it carries fixed
 *    fees and no tiers (a fees-shaped path, not a per-guest-tier one): the candidate's fee-bearing
 *    path, but only when there's exactly one -- an unambiguous structural pairing when even
 *    synonym matching found nothing (Diamond Garden's "Hall Rental Only (DIY)" already resolves at
 *    step 3; this exists for a wording that drifts further still).
 * A pairing that satisfies none of these is left unresolved -- conservative, no attempt to guess
 * which candidate path corresponds to which golden path beyond what's actually evidenced. */
function resolveCandidatePath(gp: PricingPath, golden: VenueDetailsV3, candidate: VenueDetailsV3): PricingPath | undefined {
  const exact = candidate.pricing.paths.find((p) => p.id === gp.id);
  if (exact) return exact;

  if (golden.pricing.paths.length === 1 && candidate.pricing.paths.length === 1) {
    return candidate.pricing.paths[0];
  }

  if (golden.pricing.paths.length > 1 && candidate.pricing.paths.length > 1) {
    const byName = bestPathByNameTokens(gp, candidate.pricing.paths);
    if (byName) return byName;

    if (gp.id === defaultAxes(golden).path_id && gp.fixed_fees.length > 0 && gp.per_guest_tiers.length === 0) {
      const feePaths = candidate.pricing.paths.filter((p) => p.fixed_fees.length > 0);
      if (feePaths.length === 1) return feePaths[0];
    }
  }

  return undefined;
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
  misses: Miss[];
}

export function scoreCapacities(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean } = {}): CapacityScore {
  let matches = 0;
  let total = 0;
  const misses: Miss[] = [];
  const ctx = buildSpaceAlignmentContext(golden, candidate);
  // Keyed on the CANONICAL (aligned-to-golden) space id -- a candidate's own spelling
  // ("the_pavilion", "whole_venue") never has to match the golden's ("the-pavilion") verbatim.
  const candidateByKey = new Map(candidate.capacities.map((c) => [`${canonicalSpaceKey(c.space_id, ctx)}:${c.layout}`, c]));
  for (const gc of golden.capacities) {
    const rawKey = `${gc.space_id}:${gc.layout}`;
    if (!passesEvalAndCrawlFilter(golden, `/capacities/${rawKey}`, gc.source_url, candidate.sources.pages, options)) continue;
    total++;
    const alignedKey = `${canonicalSpaceKey(gc.space_id, ctx)}:${gc.layout}`;
    const cc = candidateByKey.get(alignedKey);
    if (cc && cc.max === gc.max) matches++;
    else misses.push(mkMiss(`/capacities/${rawKey}`, gc.max, cc?.max ?? null, cc ? "max differs" : "no aligned candidate capacity for this space/layout"));
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
    misses,
  };
}

// ---------------------------------------------------------------------------
// Pricing scalars: archetype, rates, minimums by (kind, day, season).
// ---------------------------------------------------------------------------

export interface PricingScalarScore {
  matches: number;
  total: number;
  accuracy: number;
  misses: Miss[];
}

const RATE_FIELDS = ["service_charge_pct", "service_charge_base", "sales_tax_pct", "sales_tax_base", "sales_tax_source", "cc_fee_pct"] as const;

export function scorePricingScalars(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean } = {}): PricingScalarScore {
  const misses: Miss[] = [];
  let matches = 0;
  let total = 0;

  // archetype (a spine field, already scored in scoreSpineTiers -- included again here per the
  // plan's explicit "pricing scalars (archetype, rates, minimums...)" listing, since it's the
  // scalar the calculator actually keys off of).
  if (passesEvalAndCrawlFilter(golden, "/spine/pricing_archetype", golden.spine.pricing_archetype.status === "stated" ? golden.spine.pricing_archetype.source_url : null, candidate.sources.pages, options)) {
    total++;
    const g = golden.spine.pricing_archetype as unknown as TriLike;
    const c = candidate.spine.pricing_archetype as unknown as TriLike;
    if (triMatches(g, c)) matches++;
    else misses.push(mkMiss("/spine/pricing_archetype", triSummary(g), triSummary(c), missNoteFor(g, c)));
  }

  // rates
  if (passesEvalAndCrawlFilter(golden, "/pricing/rates", golden.pricing.rates.source_url, candidate.sources.pages, options)) {
    for (const field of RATE_FIELDS) {
      total++;
      if (golden.pricing.rates[field] === candidate.pricing.rates[field]) matches++;
      else misses.push(mkMiss(`/pricing/rates/${field}`, golden.pricing.rates[field], candidate.pricing.rates[field]));
    }
  }

  // minimums, keyed by (kind, day, season-or-any) semantics -- not literal key equality (tick c2) --
  // scoped to the golden's default path when present.
  const goldenPath = golden.pricing.paths.find((p) => p.id === defaultAxes(golden).path_id) ?? golden.pricing.paths[0];
  const candidatePath = candidate.pricing.paths.find((p) => p.id === goldenPath?.id) ?? candidate.pricing.paths[0];
  if (goldenPath) {
    for (const m of goldenPath.minimums) {
      const key = `${m.kind}:${m.day}:${m.season}`;
      const path = `/pricing/paths/${goldenPath.id}/minimums/${key}`;
      if (!passesEvalAndCrawlFilter(golden, path, m.source_url, candidate.sources.pages, options)) continue;
      total++;
      const aligned = findAlignedMinimum(m, candidatePath?.minimums ?? []);
      if (aligned && minimumsMatch(m, aligned)) matches++;
      else misses.push(mkMiss(path, m.amount, aligned?.amount ?? null, aligned ? "amount differs" : "no matching candidate minimum (kind/day/season)"));
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
    else misses.push(mkMiss("/pricing/seasons", g, c ?? null));
  }

  // includes: the golden default path's path-wide inclusions, verbatim-item-set equality.
  if (goldenPath?.includes && goldenPath.includes.length > 0) {
    const includesPath = `/pricing/paths/${goldenPath.id}/includes`;
    if (passesEvalAndCrawlFilter(golden, includesPath, null, candidate.sources.pages, options)) {
      total++;
      const goldenSorted = [...goldenPath.includes].sort();
      const candidateSorted = [...(candidatePath?.includes ?? [])].sort();
      if (JSON.stringify(goldenSorted) === JSON.stringify(candidateSorted)) matches++;
      else misses.push(mkMiss(includesPath, goldenSorted, candidateSorted));
    }
  }

  // terms: the golden default path's labeled rental terms, set equality on labels (secondary-tier
  // scalar -- the label is the stable, comparable part; term prose itself isn't scored).
  if (goldenPath?.terms && goldenPath.terms.length > 0) {
    const termsPath = `/pricing/paths/${goldenPath.id}/terms`;
    if (passesEvalAndCrawlFilter(golden, termsPath, null, candidate.sources.pages, options)) {
      total++;
      const goldenLabels = [...goldenPath.terms.map((t) => t.label)].sort();
      const candidateLabels = [...(candidatePath?.terms ?? []).map((t) => t.label)].sort();
      if (JSON.stringify(goldenLabels) === JSON.stringify(candidateLabels)) matches++;
      else misses.push(mkMiss(termsPath, goldenLabels, candidateLabels));
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
  misses: Miss[];
}

export function scoreImportantCore(candidate: VenueDetailsV3, golden: VenueDetailsV3, options: { allFields?: boolean } = {}, excluded?: ExcludedFact[]): CoreScore {
  const misses: Miss[] = [];
  let matches = 0;
  let total = 0;
  const crawled = candidate.sources.pages;
  const ctx = buildSpaceAlignmentContext(golden, candidate);

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
    if (triMatches(g, c, key)) matches++;
    else misses.push(mkMiss(path, triSummary(g), triSummary(c), missNoteFor(g, c)));
  }

  // Non-headline capacity tuples (the headline tuple is gated separately via headlineExact).
  const goldenHc = headlineCapacity(golden);
  const headlineKey = goldenHc.headline_space_id != null && goldenHc.headline_layout != null ? `${goldenHc.headline_space_id}:${goldenHc.headline_layout}` : null;
  // Keyed on the CANONICAL (aligned-to-golden) space id -- see scoreCapacities.
  const candidateByCapKey = new Map(candidate.capacities.map((c) => [`${canonicalSpaceKey(c.space_id, ctx)}:${c.layout}`, c]));
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
    const rawKey = `${gc.space_id}:${gc.layout}`;
    const path = `/capacities/${rawKey}`;
    total++;
    const alignedKey = `${canonicalSpaceKey(gc.space_id, ctx)}:${gc.layout}`;
    const cc = candidateByCapKey.get(alignedKey);
    if (cc && cc.max === gc.max) matches++;
    else misses.push(mkMiss(path, gc.max, cc?.max ?? null, cc ? "max differs" : "no aligned candidate capacity for this space/layout"));
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
        else misses.push(mkMiss(`/pricing/rates/${field}`, golden.pricing.rates[field], candidate.pricing.rates[field]));
      }
    }
  }

  // Pricing-path numerics, every path (not just the default one) -- fee/tier/minimum matching is
  // semantic (aligned space, day, season-or-any, amount within 1%), not literal key equality
  // (tick c2: a model's own key spelling never has to match the golden's).
  for (const gp of golden.pricing.paths) {
    const cp = resolveCandidatePath(gp, golden, candidate);

    const fixedFees = scopedItems(golden, gp.fixed_fees, (f) => `/pricing/paths/${gp.id}/fixed_fees/${f.key}`, (f) => f.source_url, crawled, options, "strict", excluded);
    for (const f of fixedFees) {
      const path = `/pricing/paths/${gp.id}/fixed_fees/${f.key}`;
      total++;
      const aligned = findAlignedFee(f, cp?.fixed_fees ?? [], ctx);
      if (aligned && fixedFeesMatch(f, aligned, ctx)) matches++;
      else misses.push(mkMiss(path, f.amount, aligned?.amount ?? null, aligned ? "amount differs" : "no matching candidate fee (space/day/season)"));
    }

    const perGuestTiers = scopedItems(golden, gp.per_guest_tiers, (t) => `/pricing/paths/${gp.id}/per_guest_tiers/${t.id}`, (t) => t.source_url, crawled, options, "strict", excluded);
    for (const t of perGuestTiers) {
      const path = `/pricing/paths/${gp.id}/per_guest_tiers/${t.id}`;
      total++;
      const aligned = findAlignedTier(t, cp?.per_guest_tiers ?? []);
      if (aligned && tiersMatch(t, aligned)) matches++;
      else misses.push(mkMiss(path, t.per_guest, aligned?.per_guest ?? null, aligned ? "per_guest differs" : "no matching candidate tier (name/id)"));
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
      const aligned = findAlignedMinimum(m, cp?.minimums ?? []);
      if (aligned && minimumsMatch(m, aligned)) matches++;
      else misses.push(mkMiss(path, m.amount, aligned?.amount ?? null, aligned ? "amount differs" : "no matching candidate minimum (kind/day/season)"));
    }

    if (gp.required_staffing) {
      const path = `/pricing/paths/${gp.id}/required_staffing`;
      const { inScope, reason } = classify(golden, path, gp.required_staffing.source_url, crawled, options, "strict");
      if (!inScope) {
        if (reason && excluded) excluded.push({ path, reason, source_url: gp.required_staffing.source_url });
      } else {
        total++;
        const cs = cp?.required_staffing;
        const gs = { price_per_role: gp.required_staffing.price_per_role, bartender_per_guests: gp.required_staffing.bartender_per_guests };
        if (cs && cs.price_per_role === gp.required_staffing.price_per_role && cs.bartender_per_guests === gp.required_staffing.bartender_per_guests) matches++;
        else misses.push(mkMiss(path, gs, cs ? { price_per_role: cs.price_per_role, bartender_per_guests: cs.bartender_per_guests } : null));
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
  // Same video cited as /embed/<id> and /watch?v=<id> (or vimeo with tracking params) is one resource.
  // Image renditions (?width=792&height=612) are the same floor plan; videos cited as embed/watch are the same video.
  // Image renditions: framer `?width=792&height=612` params and WordPress `-960x720` size suffixes name the same file.
  const resourceKey = (url: string) => { const v = canonicalVideoUrl(url); return normalizeUrl(/\.(jpe?g|png|webp|gif)(\?|$)/i.test(v) ? v.replace(/\?.*$/, "").replace(/-\d{2,4}x\d{2,4}(\.(jpe?g|png|webp|gif))$/i, "$1") : v); };
  return toInventoryKindScore(recallPrecision(inScopeGolden, candidate.resources, (r) => resourceKey(r.url)));
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

/**
 * Remaps the golden's pinned default axes (`space_id`/`path_id`/`tier_id`) onto the CANDIDATE's
 * own ids before `estimateCost` runs on it (tick c3 evidence): `estimateCost` keys its fee/tier
 * lookups off these raw ids, so pinning the golden's own spelling ("the-pavilion", "default") on
 * the candidate silently drops every space-scoped fee that doesn't happen to share it --
 * Greenhouse's candidateTotal came back 0, Marchetti's was missing its Pavilion Saturday fee.
 * Reuses the exact alignment machinery `scoreCapacities`/`scoreImportantCore` already use for
 * space/path/tier -- never a second notion of "the same space/path/tier". `guests`/`day`/`season`/
 * etc. are left untouched -- only the id-shaped axes need remapping. */
function mapAxesToCandidate(axes: EstimateInput, golden: VenueDetailsV3, candidate: VenueDetailsV3): EstimateInput {
  const mapped: EstimateInput = { ...axes };

  if (axes.space_id != null) {
    const spaceMap = alignSpaces(golden.spaces, candidate.spaces);
    const reverse = new Map<string, string>();
    for (const [cId, gId] of spaceMap) if (!reverse.has(gId)) reverse.set(gId, cId);
    const candidateSpaceId = reverse.get(axes.space_id);
    if (candidateSpaceId != null) mapped.space_id = candidateSpaceId;
  }

  const goldenPath = axes.path_id != null ? golden.pricing.paths.find((p) => p.id === axes.path_id) : undefined;
  const candidatePath = goldenPath ? resolveCandidatePath(goldenPath, golden, candidate) : undefined;
  if (candidatePath) mapped.path_id = candidatePath.id;

  if (axes.tier_id != null && goldenPath) {
    const goldenTier = goldenPath.per_guest_tiers.find((t) => t.id === axes.tier_id);
    const candidateTier = goldenTier ? findAlignedTier(goldenTier, candidatePath?.per_guest_tiers ?? []) : undefined;
    if (candidateTier) mapped.tier_id = candidateTier.id;
  }

  return mapped;
}

export function scoreCostDelta(candidate: VenueDetailsV3, golden: VenueDetailsV3): CostDeltaScore {
  const axes = defaultAxes(golden);
  const goldenEstimate = estimateCost(golden, axes);
  if (goldenEstimate.warnings.includes("no_path")) {
    return { goldenTotal: null, candidateTotal: null, pctDelta: null, withinGate: true };
  }
  const candidateEstimate = estimateCost(candidate, mapAxesToCandidate(axes, golden, candidate));
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
  /** Golden resources (brochure, menus, floor plans, tours, videos) found: >= 80%. The user's
   * call (2026-09-20): a page that lost the add-ons PDF or the 3D tour is not calibrated. */
  resourcesRecall: boolean;
  overall: boolean;
}

const GATE_THRESHOLDS: Record<SpineTier, number> = { critical: 0.95, important: 0.85, secondary: 0.7 };
const IMPORTANT_CORE_GATE = 0.85;
export const RESOURCES_RECALL_GATE = 0.8;

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
    resourcesRecall: (() => {
      const r = inventory.by_kind.resources;
      return r.golden_items === 0 ? true : r.found / r.golden_items >= RESOURCES_RECALL_GATE;
    })(),
    overall: false,
  };
  // Secondary is informational (plan: "missing is fine"); it is reported, never gated.
  gates.overall = gates.critical && gates.important && gates.headlineExact && gates.costDelta && gates.criticalGrounding && gates.resourcesRecall;

  return { tiers, spaces, capacities, pricingScalars, addOns, important_core, inventory, excluded, costDelta, criticalGrounding, gates };
}
