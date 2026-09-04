/**
 * Deterministic candidate-generation score (candidate-score-v1). NOT part of
 * V3 or any classifier tier — this runs BEFORE classification, to shrink the
 * 47,623-post corpus down to a high-signal pool worth spending LLM money on.
 * See docs/engineering/post-classification/candidate-generation-analysis.md
 * for the methodology and the evidence behind these exact weights — do not
 * change them here without updating that doc first.
 *
 * Reuses existing signals wherever they exist:
 *   - vendor role mentions: ctx.known_vendor_mentions, the SAME graph join
 *     (accounts + v_account_role) already used by prefilter.ts/llmClassifier.ts
 *   - wedding keyword / Chicago hint: the exact regexes from prefilter.ts
 * Three signals (styled/editorial, promo, engagement language) are new —
 * constructed for the candidate-generation analysis, not previously used
 * anywhere in V3. They are NOT part of the frozen V3 prompt/rubric.
 */
import { WEDDING_KEYWORDS, CHICAGO_HINT } from "./prefilter";
import type { PostContext } from "./source";

export const CANDIDATE_SCORE_VERSION = "candidate-score-v1";

const STYLED_EDITORIAL_LANGUAGE =
  /(styled shoot|editorial shoot|styled editorial|creative team|for this (styled|editorial)|submission|feature[d]? on|as seen on|publication|collaborat(ive|ion))/i;

const PROMO_LANGUAGE =
  /(now booking|booking (now|\d+)|link in bio|dm (us|me) to book|inquire (now|today)|now accepting|book your (date|wedding)|now scheduling|limited dates|availability for)/i;

const ENGAGEMENT_LANGUAGE =
  /(she said yes|he said yes|the (proposal|question)|surprise proposal|just got engaged|newly engaged|our engagement|proposed)/i;

export interface CandidateScoreResult {
  post_url: string;
  score: number;
  candidate_generation_version: string;
  vendor_role_count: number;
  vendor_roles: string[];
  has_photographer: boolean;
  has_venue: boolean;
  has_planner: boolean;
  has_wedding_keyword: boolean;
  has_chicago_hint: boolean;
  has_styled_editorial_language: boolean;
  has_promo_language: boolean;
  has_engagement_language: boolean;
}

export function scoreCandidate(ctx: PostContext): CandidateScoreResult {
  const vendorRoles = Array.from(
    new Set(ctx.known_vendor_mentions.map((m) => m.role).filter((r): r is string => Boolean(r)))
  );
  const vendorRoleCount = vendorRoles.length;
  const hasPhotographer = vendorRoles.includes("photographer");
  const hasVenue = vendorRoles.includes("venue");
  const hasPlanner = vendorRoles.includes("planner");

  const hasWeddingKeyword =
    Boolean(ctx.caption && WEDDING_KEYWORDS.test(ctx.caption)) || ctx.hashtags.some((h) => WEDDING_KEYWORDS.test(h));

  const hasChicagoHint =
    Boolean(ctx.caption && CHICAGO_HINT.test(ctx.caption)) ||
    Boolean(ctx.location_tag && CHICAGO_HINT.test(ctx.location_tag)) ||
    ctx.hashtags.some((h) => CHICAGO_HINT.test(h));

  const hasStyledEditorial = Boolean(ctx.caption && STYLED_EDITORIAL_LANGUAGE.test(ctx.caption));
  const hasPromo = Boolean(ctx.caption && PROMO_LANGUAGE.test(ctx.caption));
  const hasEngagement = Boolean(ctx.caption && ENGAGEMENT_LANGUAGE.test(ctx.caption));

  const score =
    2 * Math.min(vendorRoleCount, 5) +
    3 * (hasPhotographer && hasVenue ? 1 : 0) +
    2 * (hasPlanner && hasPhotographer ? 1 : 0) +
    1 * (hasWeddingKeyword ? 1 : 0) +
    2 * (hasChicagoHint ? 1 : 0) -
    4 * (hasStyledEditorial ? 1 : 0) -
    3 * (hasPromo ? 1 : 0) -
    2 * (hasEngagement ? 1 : 0);

  return {
    post_url: ctx.post_url,
    score,
    candidate_generation_version: CANDIDATE_SCORE_VERSION,
    vendor_role_count: vendorRoleCount,
    vendor_roles: vendorRoles,
    has_photographer: hasPhotographer,
    has_venue: hasVenue,
    has_planner: hasPlanner,
    has_wedding_keyword: hasWeddingKeyword,
    has_chicago_hint: hasChicagoHint,
    has_styled_editorial_language: hasStyledEditorial,
    has_promo_language: hasPromo,
    has_engagement_language: hasEngagement,
  };
}
