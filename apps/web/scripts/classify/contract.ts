/**
 * The classification contract — the structured output every tier must
 * produce for every post. See docs/engineering/post-classification/README.md
 * for the why; this module is the single source of truth for the shape.
 *
 * INCLUDE/EXCLUDE/REVIEW and the four cost tiers are the fixed contract.
 * EXCLUSION_REASONS and ACCOUNT_ARCHETYPES are living vocabularies, not a
 * locked taxonomy — evaluation is expected to surface reasons/archetypes not
 * listed here. Add one when error analysis finds a real recurring pattern
 * these don't name; don't force-fit a new failure mode into an old bucket
 * just to dodge a vocabulary change (exclusion_reason is `text` in the DB
 * for exactly this reason — see pipeline/schema.sql).
 */
import { createHash } from "crypto";

export const DECISIONS = ["INCLUDE", "EXCLUDE", "REVIEW"] as const;
export type Decision = (typeof DECISIONS)[number];

export const TIERS = ["deterministic", "cheap_model", "expensive_model", "human"] as const;
export type Tier = (typeof TIERS)[number];

// Starting hypothesis (the mission's four questions), not immutable. Kept
// short on purpose — a long enum invites a model to pick the
// closest-sounding bucket instead of the true one.
export const EXCLUSION_REASONS = [
  "not_wedding_related", // no wedding at all — menu item, unrelated business post
  "vendor_marketing_generic", // ADDED after hand-labeling the bootstrap golden set (see data/golden_set_v0.json):
  // this turned out to be the single largest bucket after not_wedding_related (20% of the 120-post sample) —
  // a vendor's post that mentions weddings in general (tips, "now booking," a philosophy statement, a
  // portfolio recap) but names no specific real couple/event. The original four-question hypothesis had no
  // slot for this; it isn't "not a wedding" (it's wedding-adjacent) and isn't "styled/editorial" (nothing was
  // staged, there's just no real event described). Exactly the kind of failure mode the mission expects
  // evaluation to surface — don't force it back into not_wedding_related just to avoid growing this list.
  "styled_or_editorial", // styled shoot / no real couple / pure inspiration content (e.g. a flatlay of invitations)
  "not_chicago", // real wedding, confidently not in the Chicago metro
  "destination_wedding", // Chicago vendor, wedding elsewhere — kept distinct from not_chicago
  // because the fix differs: this is "don't trust the vendor's home city," not "bad geo signal"
  "low_credibility_source", // account isn't a legitimate wedding vendor/venue/participant
  "insufficient_evidence", // can't tell either way — usually pairs with REVIEW, not a confident EXCLUDE
  "duplicate_post", // same wedding already confirmed via another post
  "not_useful_wedding_content", // ADDED after a 25-post human manual audit of v2 (2026-09-02, see
  // docs/engineering/post-classification/audits/v2-manual-audit.md): a genuinely real, credible, Chicago
  // wedding post that still isn't something the product should surface — e.g. pre-wedding prep candids
  // (groomsmen playing pool, not the ceremony/reception) or content centered on something other than the
  // wedding itself (memorial seating for deceased loved ones, captured within otherwise-real aisle-walk
  // footage). This is orthogonal to is_wedding/is_real_wedding/is_chicago/is_credible_source entirely — the
  // post can be TRUE on all four and still not belong in front of users. NOT YET added to the live LLM
  // prompt (llmClassifier.ts) — that's a separate decision (a new evaluation axis, not just a vocabulary
  // entry) flagged for the user rather than implemented unilaterally.
  "other",
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number] | (string & {});

export const ACCOUNT_ARCHETYPES = [
  "wedding_venue",
  "wedding_photographer",
  "wedding_videographer",
  "wedding_planner",
  "wedding_florist",
  "wedding_other_vendor", // dj, catering, hmu, attire, stationery, etc.
  "wedding_inspiration_publication", // magazine/blog/curation — reposts, isn't the primary source
  "bridal_fashion",
  "venue_non_wedding_primary", // e.g. a restaurant/hotel that occasionally hosts weddings
  "generic_lifestyle",
  "couple_personal", // a couple's own account, not a vendor
  "other",
] as const;
export type AccountArchetype = (typeof ACCOUNT_ARCHETYPES)[number] | (string & {});

export const SOURCE_FIELDS = [
  "caption",
  "hashtags",
  "location_tag",
  "mentions",
  "account_bio",
  "account_category",
  "account_rating",
  "image",
  "cross_reference",
] as const;
export type SourceField = (typeof SOURCE_FIELDS)[number];

export interface Evidence {
  claim: string; // what this supports, e.g. "is_chicago" or "is_credible_source"
  signal: string; // the actual quote / hashtag / field value grounding the claim
  source_field: SourceField | string;
}

export interface ClassificationResult {
  post_url: string;
  decision: Decision;
  confidence: number; // 0-1
  is_wedding: boolean | null;
  is_real_wedding: boolean | null;
  is_chicago: boolean | null;
  is_credible_source: boolean | null;
  exclusion_reason: ExclusionReason | null;
  evidence: Evidence[];
  classifier_version: string;
  tier: Tier;
  // When the IG post was published (posts.posted_at / staging's post_timestamp
  // is the source of truth; this is a snapshot for classification-history
  // traceability once staging is dropped). Post age is NEVER evidence of
  // credibility — see the note in llmClassifier.ts's system prompt.
  posted_at: Date | string | null;
  // The wedding's OWN date — only set when a post gives direct textual
  // evidence (e.g. "10.4.24", "June 5th wedding"). Never inferred from
  // posted_at, never guessed. Optional; most posts won't have this evidence.
  event_date?: string | null;
  event_date_confidence?: number | null;
  prompt_version?: string | null;
  model?: string | null;
  cost_usd?: number | null;
  latency_ms?: number | null;
}

export function validateResult(r: ClassificationResult) {
  if (!DECISIONS.includes(r.decision)) throw new Error(`bad decision ${r.decision}`);
  if (!TIERS.includes(r.tier)) throw new Error(`bad tier ${r.tier}`);
  if (!(r.confidence >= 0 && r.confidence <= 1)) throw new Error(`confidence out of range: ${r.confidence}`);
  // A false positive is worse than a false negative (mission's core tenet)
  // — an EXCLUDE with no reason is not actionable for a reviewer, so it's
  // required just like a positive INCLUDE claim needs evidence.
  if (r.decision === "EXCLUDE" && !r.exclusion_reason) {
    throw new Error("EXCLUDE requires exclusion_reason");
  }
  if (r.event_date_confidence != null && !(r.event_date_confidence >= 0 && r.event_date_confidence <= 1)) {
    throw new Error(`event_date_confidence out of range: ${r.event_date_confidence}`);
  }
  if (r.event_date_confidence != null && !r.event_date) {
    throw new Error("event_date_confidence set without event_date");
  }
}

export function inputHash(fields: {
  caption?: string | null;
  hashtags?: string[] | null;
  mentions?: string[] | null;
  location_tag?: string | null;
  account: unknown;
}): string {
  const payload = JSON.stringify({
    caption: fields.caption || "",
    hashtags: fields.hashtags || [],
    mentions: fields.mentions || [],
    location_tag: fields.location_tag || "",
    account: fields.account || {},
  });
  return createHash("sha256").update(payload).digest("hex");
}
