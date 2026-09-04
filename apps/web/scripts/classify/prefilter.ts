/**
 * Tier 0 — deterministic, free. Only ever returns a confident EXCLUDE, or
 * null to defer to the next tier. Never a confident INCLUDE: the mission's
 * core tenet is that a false positive (an untrustworthy/non-real/non-Chicago
 * post reaching users) is worse than a false negative, so the cheap tier is
 * only trusted to say "definitely no," never "definitely yes." Two rules,
 * each independently high-precision (verified against a live sample — see
 * docs/engineering/post-classification/README.md):
 *
 * 1. Zero wedding-signal anywhere (caption, hashtags, a wedding-role
 *    credit-stack line, or a mention of an account already known to have a
 *    role in our own graph) -> not_wedding_related. Catches things like a
 *    steakhouse's menu post swept in because Google Places categorized it
 *    'venue' (Fioretta Steak, verified in staging.vendors — 17.2% of the
 *    47,623 staged posts have zero wedding keyword in caption+hashtags).
 * 2. location_tag positively names a well-known non-Chicago-metro place,
 *    with no Chicago counter-signal in caption/hashtags -> not_chicago /
 *    destination_wedding. Also catches Chicago-vendor destination weddings
 *    (verified live: a Chicago vendor's post geotagged "Santorini, Greece")
 *    — a Chicago-based vendor is not evidence the EVENT was in Chicago.
 *
 * WEDDING_KEYWORDS/NON_CHICAGO_DESTINATIONS are starting lists, not closed
 * enums — expand them from error analysis (errorAnalysis.ts), don't
 * hand-tune blindly.
 *
 * v2/v3 (2026-09-02, evidence from a 431-post adversarial hand-labeled
 * sample — see docs/engineering/post-classification/README.md): v2 tried
 * two fixes for a reason-attribution bug (decision was still correct EXCLUDE
 * in both live cases, but the wedding-signal gate had over-matched for the
 * wrong reason) — dropping `known_vendor_mentions` as a standalone signal
 * (a Chicago Symphony Orchestra tour-concert post false-triggered via a
 * mentioned account's unrelated wedding-vendor role), and requiring an
 * actual wedding-vendor role word in credit-stack lines, not just any
 * "Word: @handle" (a styled/editorial Tuscany feature false-triggered on a
 * "Model: @handle" credit block). Regression-testing v2 against the golden
 * dev set caught a real problem with the first change: dropping
 * known_vendor_mentions turned 2 confirmed real weddings into wrong
 * EXCLUDEs, because their only wedding evidence was an emoji-prefixed
 * credit line ("📸 @handle") that the text-based CREDIT_LINE regex never
 * matches — known_vendor_mentions was the only signal left standing for
 * them. v3 reverts that change (keeps it as a signal — the false-trigger
 * risk it carries only ever produces a wrong REASON, never a wrong
 * DECISION, since a false-triggered post either still hits the correct
 * EXCLUDE via the location check or defers to the LLM, which treats this
 * same signal as a prior, not proof) and keeps the credit-line role-word
 * tightening, which caused zero regressions in the same test.
 */
import type { ClassificationResult } from "./contract";
import type { PostContext } from "./source";

// Exported so candidateScore.ts (candidate-generation, not part of V3 itself)
// can reuse the exact same signal instead of duplicating it. Visibility-only
// change — no behavior change to classify() below.
export const WEDDING_KEYWORDS =
  /(wedding|bride|groom|bridal|engage(?:ment|d)?|fianc|nuptial|newlywed|getting married|ceremon|reception|elope|walked? down the aisle|married|honeymoon)/i;

// Credit-stack line pattern, reused from pipeline.py's LINE regex: "Role: @handle".
const CREDIT_LINE = /^\s*[•\-*]?\s*([A-Za-z][A-Za-z &+/'’]{1,35}?)\s*[:|\-–—/]+\s*(.*@.*)$/;

// The label portion of a credit line must name an actual wedding-vendor role
// (pipeline.py's ROLE_MAP vocabulary) — otherwise "Model:", "Host:",
// "Stylist:" etc. from non-wedding editorial credit blocks false-trigger.
const WEDDING_ROLE_WORD =
  /(photo|video|film|content creator|hair|makeup|hmu|florist|floral|bloom|flower|\bdj\b|\bband\b|musician|music|plan|venue|hotel|cater|cake|dessert|rental|decor|officiant|stationery|invitation|transport|limo|photobooth|jewel|\bring\b|dress|gown|\btux|bridal|attire|coordinat|design)/i;

const NON_CHICAGO_DESTINATIONS =
  /(santorini|greece|italy|tuscany|paris|france|mexico|cancun|tulum|riviera maya|jamaica|bahamas|dominican|hawaii|maui|kauai|oahu|napa|sonoma|miami|florida|new york city|\bnyc\b|manhattan|los angeles|california\b|malibu|colorado|aspen|vail|nashville|tennessee|charleston, south carolina|savannah, georgia|las vegas|denver|portugal|spain|bali|indonesia|thailand|dubai|morocco|scotland|ireland,|england,|london,(?!.*chicago)|costa rica|puerto rico)/i;

export const CHICAGO_HINT = /chicago|chi[- ]?town|windy city|illinois\b|, il\b|\bil,/i;

export const PREFILTER_VERSION = "prefilter-v3";

function hasWeddingCreditLine(caption: string | null): boolean {
  if (!caption) return false;
  for (const line of caption.split("\n")) {
    const m = CREDIT_LINE.exec(line.trim());
    if (m && WEDDING_ROLE_WORD.test(m[1])) return true;
  }
  return false;
}

function hasWeddingSignal(ctx: PostContext): boolean {
  if (ctx.caption && WEDDING_KEYWORDS.test(ctx.caption)) return true;
  if (ctx.hashtags.some((h) => WEDDING_KEYWORDS.test(h))) return true;
  if (hasWeddingCreditLine(ctx.caption)) return true;
  // Restored in v3 after v2 regression-tested worse on the dev set: removing
  // this dropped 2 confirmed real weddings (golden dev set) whose ONLY
  // wedding evidence was an emoji-prefixed credit line ("📸 @handle") that
  // CREDIT_LINE never matches (it requires a text role word, not an emoji) —
  // known_vendor_mentions was the only signal left standing for them. It did
  // cause one wrong REASON label (a Chicago Symphony post got tagged
  // destination_wedding instead of not_wedding_related — still a correct
  // EXCLUDE overall, since Santa Barbara isn't Chicago either way) across
  // ~550 hand-labeled posts, but zero wrong DECISIONS. Net: keep it — a
  // wrong reason label is a rounding error, a missed real wedding isn't.
  if (ctx.known_vendor_mentions.some((m) => m.role)) return true;
  return false;
}

export function classify(ctx: PostContext): ClassificationResult | null {
  if (!hasWeddingSignal(ctx)) {
    return {
      post_url: ctx.post_url,
      decision: "EXCLUDE",
      confidence: 0.9,
      is_wedding: false,
      is_real_wedding: null,
      is_chicago: null,
      is_credible_source: null,
      exclusion_reason: "not_wedding_related",
      evidence: [
        {
          claim: "is_wedding",
          signal: "no wedding keyword, hashtag, wedding-role credit-stack line, or known-vendor mention found",
          source_field: "caption",
        },
      ],
      classifier_version: PREFILTER_VERSION,
      tier: "deterministic",
      posted_at: ctx.post_timestamp,
    };
  }

  const loc = ctx.location_tag || "";
  if (NON_CHICAGO_DESTINATIONS.test(loc) && !CHICAGO_HINT.test(loc)) {
    const captionHasChicago = Boolean(ctx.caption && CHICAGO_HINT.test(ctx.caption));
    const hashtagHasChicago = ctx.hashtags.some((h) => CHICAGO_HINT.test(h));
    if (!captionHasChicago && !hashtagHasChicago) {
      const reason = ctx.is_own_profile_post ? "destination_wedding" : "not_chicago";
      return {
        post_url: ctx.post_url,
        decision: "EXCLUDE",
        confidence: 0.9,
        is_wedding: null,
        is_real_wedding: null,
        is_chicago: false,
        is_credible_source: null,
        exclusion_reason: reason,
        evidence: [{ claim: "is_chicago", signal: loc, source_field: "location_tag" }],
        classifier_version: PREFILTER_VERSION,
        tier: "deterministic",
        posted_at: ctx.post_timestamp,
      };
    }
  }

  return null;
}
