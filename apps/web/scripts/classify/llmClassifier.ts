/**
 * Tier 2/3 — cheap_model and expensive_model, both via OpenRouter. Same
 * prompt and tool schema for both; only the model (and, for the expensive
 * tier, an optional image) differs. Keeping one prompt means a
 * classifier_version bump is a real, comparable policy change instead of
 * two prompts silently drifting apart.
 */
import { callTool } from "./openrouter";
import type { ClassificationResult, Evidence } from "./contract";
import { validateResult } from "./contract";
import type { PostContext } from "./source";

// Verified against the live OpenRouter /models catalog (2026-09-02):
// haiku-4.5 $1/$5 per M tokens, sonnet-5 $2/$10 per M tokens — sonnet-5 is
// actually cheaper than sonnet-4.5 right now, hence the pick for "expensive."
export const MODEL_CHEAP = "anthropic/claude-haiku-4.5";
export const MODEL_EXPENSIVE = "anthropic/claude-sonnet-5";

export const PROMPT_VERSION = "post-classify-v3";

const TOOL_NAME = "submit_classification";

const PARAMETERS = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["INCLUDE", "EXCLUDE", "REVIEW"] },
    confidence: { type: "number", description: "0.0-1.0" },
    is_wedding: { type: ["boolean", "null"] },
    is_real_wedding: { type: ["boolean", "null"] },
    is_chicago: { type: ["boolean", "null"] },
    is_credible_source: { type: ["boolean", "null"] },
    exclusion_reason: {
      type: ["string", "null"],
      description:
        "Required when decision=EXCLUDE. Suggested vocabulary (not exhaustive — use a new short " +
        "snake_case label if none of these truly fit): not_wedding_related, vendor_marketing_generic " +
        "(mentions weddings but names no specific real couple/event — tips, 'now booking,' a portfolio " +
        "recap; this was the single largest bucket after not_wedding_related when the golden set was " +
        "hand-labeled), not_useful_wedding_content (a REAL wedding, but not the useful subject of this " +
        "post — pre-wedding prep away from the venue, or a real wedding where something else is the " +
        "actual point, e.g. a memorial/tribute detail), styled_or_editorial, not_chicago, " +
        "destination_wedding, low_credibility_source, insufficient_evidence, duplicate_post, other.",
    },
    evidence: {
      type: "array",
      description: "Every claim above needs at least one grounded entry here. No vague reasoning.",
      items: {
        type: "object",
        properties: {
          claim: { type: "string", description: "e.g. is_chicago, is_real_wedding, is_credible_source" },
          signal: { type: "string", description: "The actual quote, hashtag, or field value grounding the claim" },
          source_field: {
            type: "string",
            enum: [
              "caption",
              "hashtags",
              "location_tag",
              "mentions",
              "account_bio",
              "account_category",
              "account_rating",
              "image",
              "cross_reference",
            ],
          },
        },
        required: ["claim", "signal", "source_field"],
      },
    },
    event_date: {
      type: ["string", "null"],
      description:
        "The wedding's OWN date, ONLY when the post gives direct textual evidence (e.g. a caption " +
        "literally says '10.4.24' or 'June 5th wedding'). Free text, not a strict date format — use " +
        "whatever precision the evidence actually supports ('Fall 2026', '2027', 'June 2025' are all " +
        "fine; do NOT invent a specific day/month just to force a full date). Leave null otherwise — " +
        "NEVER infer or guess this from posted_at or anything else. Not required for a decision " +
        "either way; most posts won't have it.",
    },
    event_date_confidence: {
      type: ["number", "null"],
      description: "0.0-1.0, only when event_date is set.",
    },
  },
  required: ["decision", "confidence", "is_wedding", "is_real_wedding", "is_chicago", "is_credible_source", "evidence"],
} as const;

const SYSTEM_PROMPT = `You classify a single Instagram post for a Chicago wedding-vendor product.

This product is TEXT/METADATA-ONLY by deliberate design (V1) — you do not see the actual
image or video, only caption, hashtags, mentions, location_tag, and account context. A human
reviewer looking at the real photo would sometimes reach a different, more confident verdict
than you can from text alone (e.g. a single weak-caption photo that visibly shows a bride and
groom). That is expected and fine — do not strain to reproduce a visual judgment you cannot
make. Classify honestly from what you actually have; call REVIEW when the text genuinely
isn't enough, rather than guessing at what an image might show.

Product requirement: only surface posts that are CREDIBLE examples of REAL, USEFUL wedding
content relevant to CHICAGO. We would rather miss some legitimate wedding posts (false
negative) than pollute the product with generic wedding-adjacent content or non-events (false
positive) — precision of INCLUDE matters more than recall. When evidence is genuinely thin,
prefer REVIEW or EXCLUDE over INCLUDE.

Work through these questions using ONLY the evidence given (do not assume facts not present):

1. is_wedding — is this post about a wedding, or about content that counts as wedding content
   because it explicitly references a specific real wedding? Many posts from wedding-vendor
   accounts are NOT about weddings at all (menu items, unrelated services, generic content) —
   those are is_wedding=false. An engagement session or proposal post is ALSO not a wedding on
   its own — UNLESS it explicitly references a specific real upcoming or past wedding (a named
   couple plus a wedding date/reference, not just "getting married" in the abstract), in which
   case is_wedding=true and you should evaluate is_real_wedding normally using that reference
   as evidence. Apply this carve-out HERE, at is_wedding — do not let "these are engagement/
   proposal photos" alone drive is_wedding=false when the caption also names a real upcoming
   wedding; that would skip evidence you already have.

2. is_real_wedding — does the evidence suggest this documents an actual, specific real wedding
   (not styled/editorial/inspiration content, a product ad, generic advice, or a repost with no
   identifiable real event)? There is no fixed checklist of exactly which evidence "counts" —
   strong signals accumulate, and multiple weak signals together can also add up to real
   evidence. Named couple, explicit wedding language, and a multi-vendor stack are STRONG
   signals when present, not the only three acceptable proofs.

   Signals that meaningfully support is_real_wedding=true (weigh together, none is mandatory):
   - a named couple or individuals clearly tied to a wedding
   - an explicit description of a wedding or wedding event ("her wedding day," "tied the knot")
   - specific wedding/event language tied to a particular booking, not generic marketing copy
   - multiple credible wedding vendors credited as having worked the SAME event together
   - a credible wedding photographer/videographer's own account documenting what reads as a
     specific real shoot (not a stock/portfolio compilation)
   - a specific venue combined with wedding-specific context (not the venue name alone)
   - wedding-specific hashtags WHEN paired with at least one other supporting signal above
   - account history (account_archetype_prior) indicating this account consistently documents
     real weddings — a corroborating signal that strengthens other evidence, not a substitute
     for any in-post evidence at all

   Signals that are NOT enough by themselves (they can corroborate the list above, but never
   carry a decision alone): a bare "#wedding"/"#chicagowedding"-style hashtag, a venue name
   with no other context, a generic event-adjacent phrase ("cocktail hour," "reception
   moments," "touch up") with nothing else, generic wedding terminology or advice/inspiration
   copy, a vendor's own "now booking weddings" pitch, a venue shown beautifully staged with no
   evidence anyone actually got married there, or a venue-branded hashtag that merely looks
   like a couple/event name (e.g. "#thedalcy" or "#dalcywedding" is the VENUE's own hashtag,
   not a couple's — verified live case). When ONLY this kind of thin, on-its-own evidence
   exists and nothing from the supporting list above is present, prefer REVIEW
   (exclusion_reason insufficient_evidence) over INCLUDE. This thin-evidence guard is the one
   part of this prompt NOT to loosen — it is what fixed a real false-positive cluster.

3. is_useful_wedding_content — even granting a real wedding, is the wedding actually the
   USEFUL SUBJECT of this specific post, or only incidental to something else? A post can be
   wedding-related, real, credible, and in Chicago, and still not belong in front of users
   because it is: generic education/advice, pure inspiration/styled photography with no real
   couple, engagement/proposal content that doesn't qualify under the is_wedding carve-out,
   pre-wedding activity that isn't the wedding itself (e.g. groomsmen getting ready away from
   the venue), editorial content, generic vendor marketing/promotional graphics, venue
   marketing with no evidence of an actual event, or a real wedding where something else (not
   the wedding) is the actual subject of the post (e.g. a memorial/tribute detail is the point,
   and the wedding is just the backdrop it happened within). When this is the case, decision is
   EXCLUDE with exclusion_reason not_useful_wedding_content, even if is_wedding and
   is_real_wedding are both true.

4. is_credible_source — is the posting account (or the account it credits) a legitimate
   wedding vendor/venue/participant, not a spam/engagement-bait/unrelated account?

5. is_chicago — did this specific wedding happen in the Chicago metro? A vendor being
   Chicago-based is NOT evidence the wedding was in Chicago — vendors travel for destination
   weddings. Look for the wedding's own location signal (location_tag, venue name, city
   mentioned about the EVENT, not the vendor's home base).

If signals conflict — e.g. hashtags claiming both Chicago and a different city, or
"destinationwedding" alongside "chicagowedding" — treat that as unreliable evidence rather
than picking whichever side looks better; this usually means REVIEW, not a confident call
either way.

These questions are a starting hypothesis, not the only things that matter — if the evidence
reveals a different reason a post should be excluded (or included), say so via
exclusion_reason and the evidence array rather than forcing it into one of these boxes.

Require POSITIVE evidence for every claim — a specific quote, hashtag, location tag, or
cross-referenced account, not "this looks like a wedding." If a field is unknown, leave the
corresponding boolean null (not false) — null means "no evidence either way," false means
"evidence against."

Decision rule:
- INCLUDE only when is_wedding, is_real_wedding, is_chicago, and is_credible_source are all
  true with real supporting evidence, the content is useful wedding content (not excluded by
  question 3), AND confidence is genuinely high.
- EXCLUDE when you have positive evidence one of the above is false, or the content fails the
  is_useful_wedding_content check (name it via exclusion_reason).
- REVIEW when evidence is genuinely insufficient to decide either way — do not force a
  guess into INCLUDE or a confident EXCLUDE.

A "known_vendor_mentions" field lists any @mentions in this post that are accounts we've
independently confirmed (via a separate real-wedding graph built from tagged posts) to be
real Chicago wedding vendors — e.g. a confirmed venue. That is strong corroborating
evidence when present, but its absence is NOT evidence against a post (most legitimate
vendors won't be in our graph yet).

posted_at is when this Instagram post was published — it is NOT evidence about credibility
or realness. An old post describing a real Chicago wedding is still a real Chicago wedding;
do not lower confidence or lean toward EXCLUDE/REVIEW just because a post is old. If the
post's own text gives a specific date for the WEDDING ITSELF (distinct from posted_at),
report it via event_date with real evidence in the evidence array — otherwise leave it null.
Never infer event_date from posted_at.`;

function buildUserPrompt(ctx: PostContext): string {
  const lines: string[] = [];
  lines.push(`POST`);
  lines.push(`caption: ${ctx.caption ? JSON.stringify(ctx.caption) : "(none)"}`);
  lines.push(`hashtags: ${JSON.stringify(ctx.hashtags)}`);
  lines.push(`mentions: ${JSON.stringify(ctx.mentions)}`);
  lines.push(`location_tag (IG geotag on this post): ${ctx.location_tag ?? "(none)"}`);
  lines.push(`post_type: ${ctx.post_type ?? "unknown"}`);
  lines.push(`likes_count: ${ctx.likes_count ?? "unknown"}`);
  lines.push(`posted_at: ${ctx.post_timestamp ?? "unknown"}`);
  lines.push("");
  lines.push(`POSTING ACCOUNT`);
  lines.push(`username: @${ctx.owner_username}`);
  lines.push(`is this the vendor's own profile posting (not a repost by someone else): ${ctx.is_own_profile_post}`);
  lines.push(`vendor_name (Google Places business name): ${ctx.vendor_name ?? "unknown"}`);
  lines.push(`vendor_category (Google Places category): ${ctx.vendor_category ?? "unknown"}`);
  lines.push(`vendor_rating: ${ctx.vendor_rating ?? "unknown"} (${ctx.vendor_review_count ?? 0} reviews)`);
  lines.push(`vendor_city (Google Places business address city — this is the VENDOR's home city, not necessarily the wedding's): ${ctx.vendor_city ?? "unknown"}`);
  if (ctx.vendor_ai_summary) lines.push(`vendor_summary: ${ctx.vendor_ai_summary}`);
  if (ctx.account_archetype) {
    lines.push(
      `account_archetype_prior (from a separate account-level classifier, based on this account's ` +
        `own post history — a PRIOR, not a verdict on this specific post): ${ctx.account_archetype} ` +
        `(confidence ${ctx.account_archetype_confidence})`
    );
  }
  lines.push("");
  lines.push(`known_vendor_mentions: ${JSON.stringify(ctx.known_vendor_mentions)}`);
  return lines.join("\n");
}

interface ToolArgs {
  decision: "INCLUDE" | "EXCLUDE" | "REVIEW";
  confidence: number;
  is_wedding: boolean | null;
  is_real_wedding: boolean | null;
  is_chicago: boolean | null;
  is_credible_source: boolean | null;
  exclusion_reason: string | null;
  evidence: Evidence[];
  event_date?: string | null;
  event_date_confidence?: number | null;
}

export async function classify(
  ctx: PostContext,
  opts: { model: string; tier: "cheap_model" | "expensive_model"; classifierVersion: string }
): Promise<ClassificationResult> {
  const { args, model, costUsd, latencyMs } = await callTool<ToolArgs>({
    model: opts.model,
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(ctx),
    toolName: TOOL_NAME,
    toolDescription: "Submit the structured classification for this post.",
    parameters: PARAMETERS,
  });

  const result: ClassificationResult = {
    post_url: ctx.post_url,
    decision: args.decision,
    confidence: args.confidence,
    is_wedding: args.is_wedding,
    is_real_wedding: args.is_real_wedding,
    is_chicago: args.is_chicago,
    is_credible_source: args.is_credible_source,
    exclusion_reason: args.exclusion_reason,
    evidence: args.evidence,
    classifier_version: opts.classifierVersion,
    tier: opts.tier,
    posted_at: ctx.post_timestamp,
    event_date: args.event_date ?? null,
    event_date_confidence: args.event_date_confidence ?? null,
    prompt_version: PROMPT_VERSION,
    model,
    cost_usd: costUsd,
    latency_ms: latencyMs,
  };
  validateResult(result);
  return result;
}
