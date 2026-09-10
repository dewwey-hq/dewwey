/**
 * Phase 2 reader prompt (D055 "squeeze the 47k", Phase 1 re-plan step 3):
 * asks Haiku 4.5 ONE question per structural-v2 candidate post -- "is this
 * post documenting a real wedding that took place at the candidate's
 * anchored venue?" -- via the same OpenRouter tool-call plumbing as
 * llmClassifier.ts (./openrouter.ts's callTool).
 *
 * This module is pure (prompt building + schema validation + the
 * verdict-write decision) -- no DB, no network -- so it's fully unit
 * testable (extractPrompt.test.ts). runExtract.ts wires it to the DB.
 */

export const EXTRACT_PROMPT_VERSION = "extract-v1.1";

export const EXTRACT_VERDICTS = ["THIS_VENUE", "OTHER_VENUE", "NOT_WEDDING", "UNSURE"] as const;
export type ExtractVerdict = (typeof EXTRACT_VERDICTS)[number];

export const EXTRACT_EVENT_TYPES = [
  "wedding",
  "styled_shoot",
  "marketing",
  "other_event",
  "pre_wedding",
  "unclear",
] as const;
export type ExtractEventType = (typeof EXTRACT_EVENT_TYPES)[number];

export interface StackEntry {
  role_raw: string;
  role: string;
  handle: string;
}

/** Per-post input, built in SQL by runExtract.ts (batched, never the
 * corpus-wide structural_post_vendor_evidence view per post -- see that
 * view's own comment and docs/STATE.md's landmines section). */
export interface ExtractPostContext {
  post_url: string;
  caption_raw: string | null;
  location_tag: string | null;
  owner_username: string | null;
  post_timestamp: string | null;
  candidate_id: number;
  venue_anchor_source: string | null;
  venue_username: string | null;
  venue_full_name: string | null;
  /** Already truncated to 200 chars by the caller's SQL (left(biography,200)). */
  venue_biography: string | null;
  stack: StackEntry[];
  couple_guess: string | null;
  has_non_wedding_event_keyword: boolean;
}

export interface ExtractResult {
  verdict: ExtractVerdict;
  corrected_venue_handle: string | null;
  event_type: ExtractEventType;
  couple_names: string | null;
  event_date_hint: string | null;
  confidence: number; // 0-1
  evidence: string; // <=200 chars, quotes the caption
}

const TOOL_NAME = "submit_extraction";

export const EXTRACT_PARAMETERS = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: EXTRACT_VERDICTS,
      description:
        "THIS_VENUE: the anchored venue is where the RECEPTION happened (a ceremony/church credited " +
        "alongside is fine -- it's still THIS_VENUE). OTHER_VENUE: the anchored venue is only the " +
        "ceremony/getting-ready/rehearsal-dinner/engagement/pre-wedding spot -- the real reception " +
        "venue is a DIFFERENT handle named in the post. NOT_WEDDING: vendor marketing, a venue pitch/" +
        "tour/package/award/giveaway, an industry event/gala/corporate function, a shower/birthday/" +
        "mitzvah, a styled shoot/editorial, a multi-wedding roundup -- anything that isn't a specific " +
        "documented real wedding. UNSURE: the post is generic and the only tie to a wedding at all is " +
        "a photo credit -- not enough to decide.",
    },
    corrected_venue_handle: {
      type: ["string", "null"],
      description:
        "Required (non-null) when verdict=OTHER_VENUE and the post names the real reception venue's " +
        "handle -- the bare @handle or username, no other text. Null otherwise, including OTHER_VENUE " +
        "when no handle is actually named.",
    },
    event_type: {
      type: "string",
      enum: EXTRACT_EVENT_TYPES,
      description:
        "wedding: a real documented wedding (reception or ceremony). styled_shoot: styled/editorial " +
        "content, no real couple (Models: credits, 'styled shoot'). marketing: vendor/venue promo, " +
        "tours, packages, awards, giveaways, generic pitches. other_event: industry event, gala, " +
        "corporate, shower, birthday, mitzvah, or any non-wedding event. pre_wedding: engagement, " +
        "rehearsal dinner, getting-ready content not at the reception venue. unclear: genuinely can't tell.",
    },
    couple_names: {
      type: ["string", "null"],
      description: "The couple's name(s) if the caption names them (e.g. 'Sarah & Mike'), else null.",
    },
    event_date_hint: {
      type: ["string", "null"],
      description:
        "The wedding's OWN date/season ONLY when the caption gives direct textual evidence " +
        "('10.4.24', 'June 2025 wedding'). Never inferred from posted_at. Null otherwise.",
    },
    confidence: { type: "number", description: "0.0-1.0" },
    evidence: {
      type: "string",
      description: "A short quote (<=200 chars) from the caption grounding the verdict. Required, no vague reasoning.",
    },
  },
  required: ["verdict", "corrected_venue_handle", "event_type", "couple_names", "event_date_hint", "confidence", "evidence"],
} as const;

export const EXTRACT_TOOL_NAME = TOOL_NAME;
export const EXTRACT_TOOL_DESCRIPTION = "Submit the structured extraction verdict for this post.";

export const EXTRACT_SYSTEM_PROMPT = `You read a single Instagram post for a Chicago wedding-vendor product. This post has
already been algorithmically ANCHORED to a candidate venue (from a credit-line, the posting
account being a known venue, or the post's IG location tag) -- your ONE job is to decide
whether this post documents a REAL wedding that actually took place at THAT anchored venue.

THE CORE RULE -- reception vs. ceremony:
A wedding is "at" the venue that hosted the RECEPTION, not wherever the ceremony happened. Many
real weddings have a ceremony at a church/temple/mosque/synagogue and a reception at a separate
banquet hall, hotel, or event space -- crediting both is completely normal and does NOT make the
ceremony site "the venue."
- If the anchored venue IS the reception site (explicitly, or it's the only venue mentioned and
  nothing suggests it was ceremony-only), answer THIS_VENUE. A ceremony/church credited ALONGSIDE
  it is still a real wedding at the reception venue -- still THIS_VENUE.
- If the anchored venue is ONLY the ceremony, getting-ready location, rehearsal dinner spot,
  engagement/proposal location, or another pre-wedding site, and a DIFFERENT venue is named as
  where the reception happened, answer OTHER_VENUE and put that other venue's handle in
  corrected_venue_handle (bare handle/username only, no @ needed either way, just the handle
  text). If no other venue handle is actually named in the post (an engagement session here,
  wedding elsewhere or unstated), answer NOT_WEDDING with event_type "pre_wedding" -- do not
  guess a handle that isn't there.
- The anchored account may not be the physical venue at all: an in-house caterer or venue-sales
  team (e.g. a "Venue: @tigerlilyevents" credit for a wedding at Cafe Brauer, "@lmcateringchi"
  for LM Studio), a park district or university account standing in for one of its rooms, a
  hotel group for one property. If the caption, credits, or location tag name the actual venue,
  answer OTHER_VENUE with that venue's handle; if only a name and no handle, OTHER_VENUE with
  corrected_venue_handle null and the name in evidence.

NOT A WEDDING -- answer NOT_WEDDING for any of these, even if wedding-adjacent language appears:
- Vendor marketing: a venue or vendor's own pitch, "now booking," a service description, a
  package/pricing post, an award or "as seen in" post, a giveaway or contest.
- Venue pitches and tours: staged photos of the space, a walkthrough, "imagine your wedding here"
  -- beautiful staging with no evidence anyone actually got married there.
- Industry events, galas, corporate functions, open houses, trade shows, expos, networking events.
- Showers, birthdays, mitzvahs, quinceaneras, graduations, retirements, holiday parties -- any
  non-wedding celebration, even if held at a wedding venue.
- Styled shoots / editorials: staged content with no real couple -- look for "styled shoot,"
  "editorial," "concept shoot," or a bare "Models:" credit (as opposed to "Bride:"/"Groom:"/a
  named couple), which signals stand-ins, not an actual wedding.
- Multi-wedding roundups / "best of" recap posts that aren't about one specific couple's day.

EXCEPTION -- anniversary re-shares ARE still THIS_VENUE: a post marking a first-anniversary (or
any anniversary) that RE-SHARES photos from a specific past wedding at this venue documents that
real wedding -- answer THIS_VENUE (or OTHER_VENUE per the reception rule above), not NOT_WEDDING,
even though the post itself was published long after the wedding.

CHICAGO / MARKET HASHTAGS ARE NOT VENUE EVIDENCE: a vendor's own hashtags naming Chicago
(#chicagowedding, #chicagoweddingphotographer, etc.) describe the VENDOR's market, not where this
specific wedding happened. Never use a hashtag alone to decide THIS_VENUE vs OTHER_VENUE -- use
what the caption actually says about the event and where it took place.

UPCOMING IS NOT DOCUMENTED: a post announcing a wedding that has not happened yet ("can't wait
to celebrate X + Y next weekend", "it's here!", "wedding weekend is finally here", a welcome
party or rehearsal the night before, an engagement session before the wedding) is NOT a
documented wedding at this venue -- answer verdict NOT_WEDDING with event_type "pre_wedding", even
when the couple is named and the venue is credited. (The verdict field only ever takes THIS_VENUE,
OTHER_VENUE, NOT_WEDDING, or UNSURE -- "pre_wedding" is an event_type, never a verdict.)

VENDOR SHOWCASE WITHOUT A COUPLE: a florist/planner/photographer/rental company showing off
their own work ("the tablescape", "bridal beauty, frame one", "a living ceiling") with a full
vendor credit stack but NO couple name and NO narrative of an actual event (no date, no
"their day", no ceremony/reception story) may be a real wedding or a styled shoot -- the
caption cannot tell you which, and only the photos could. Answer THIS_VENUE if the stack and
venue are credited, but cap confidence at 0.7 so a human looks at the photos.

STRONG SIGNAL for THIS_VENUE/OTHER_VENUE: the caption names the couple, or gives a specific
wedding day/date tied to this event, or tells the story of the day. That is real evidence of a
documented wedding. A vendor's recap of a specific past wedding ("beautiful wedding at X, Anna
and Joe", "loved working with this client at X for their summertime wedding") is THIS_VENUE
even when the vendor is promoting themselves -- the promotion does not undo the wedding.

WEAK SIGNAL -- prefer UNSURE: if the post is generic (no couple named, no specific day, no real
description of an event) and the ONLY thing tying it to a wedding at all is a photo credit line
(e.g. "Photography: @studio" with no other wedding context), answer UNSURE rather than guessing
THIS_VENUE. Do not force a confident verdict out of thin evidence.

You are given: the post's caption, IG location tag, posting account, timestamp; the candidate's
anchored venue account (username, name, a short bio excerpt) and how it was anchored
(venue_anchor_source); the post's own parsed vendor-credit stack (role -> handle); a cheap
couple-name regex guess (couple_guess, not authoritative -- verify it against the caption
yourself); and whether the caption contains an obvious non-wedding-event keyword
(has_non_wedding_event_keyword, e.g. "mitzvah," "birthday" -- also not authoritative on its own,
since a venue's marketing copy sometimes lists "weddings, galas, and mitzvahs" together).

Ground every verdict in the evidence field with a short (<=200 char) quote from the caption.
Temperature is 0 -- be decisive and consistent, but genuinely prefer UNSURE over a confident
guess when the caption gives you nothing solid to stand on.`;

export function truncateBio(bio: string | null, max = 200): string | null {
  if (!bio) return null;
  return bio.length > max ? bio.slice(0, max) : bio;
}

export function buildExtractUserPrompt(ctx: ExtractPostContext): string {
  const lines: string[] = [];
  lines.push("POST");
  lines.push(`post_url: ${ctx.post_url}`);
  lines.push(`caption: ${ctx.caption_raw ? JSON.stringify(ctx.caption_raw) : "(none)"}`);
  lines.push(`location_tag (IG geotag on this post): ${ctx.location_tag ?? "(none)"}`);
  lines.push(`owner_username: @${ctx.owner_username ?? "unknown"}`);
  lines.push(`posted_at: ${ctx.post_timestamp ?? "unknown"}`);
  lines.push("");
  lines.push("ANCHORED CANDIDATE VENUE");
  lines.push(`candidate_id: ${ctx.candidate_id}`);
  lines.push(`venue_username: @${ctx.venue_username ?? "unknown"}`);
  lines.push(`venue_full_name: ${ctx.venue_full_name ?? "unknown"}`);
  lines.push(`venue_bio: ${ctx.venue_biography ?? "(none)"}`);
  lines.push(
    `venue_anchor_source (how this candidate was anchored to the venue -- not evidence of correctness, ` +
      `just provenance): ${ctx.venue_anchor_source ?? "unknown"}`
  );
  lines.push("");
  lines.push("PARSED CREDIT STACK (role -> handle, as extracted from this post's own caption)");
  if (ctx.stack.length === 0) {
    lines.push("(no credit stack extracted for this post)");
  } else {
    for (const entry of ctx.stack) {
      lines.push(`  ${entry.role} (${entry.role_raw}): @${entry.handle}`);
    }
  }
  lines.push("");
  lines.push(`couple_guess (cheap regex hint, NOT authoritative -- verify against the caption yourself): ${ctx.couple_guess ?? "(none)"}`);
  lines.push(`has_non_wedding_event_keyword (cheap hint, NOT authoritative on its own): ${ctx.has_non_wedding_event_keyword}`);
  return lines.join("\n");
}

export function validateExtractResult(r: ExtractResult): void {
  if (!(EXTRACT_VERDICTS as readonly string[]).includes(r.verdict)) {
    throw new Error(`bad verdict: ${r.verdict}`);
  }
  if (!(EXTRACT_EVENT_TYPES as readonly string[]).includes(r.event_type)) {
    throw new Error(`bad event_type: ${r.event_type}`);
  }
  if (!(r.confidence >= 0 && r.confidence <= 1)) {
    throw new Error(`confidence out of range: ${r.confidence}`);
  }
  if (typeof r.evidence !== "string") {
    throw new Error("evidence must be a string");
  }
  if (r.corrected_venue_handle != null && typeof r.corrected_venue_handle !== "string") {
    throw new Error("corrected_venue_handle must be a string or null");
  }
}

export interface VerdictWriteDecision {
  shouldWrite: boolean;
  /** Only THIS_VENUE/OTHER_VENUE/NOT_WEDDING are ever written -- UNSURE never is. */
  verdict?: "THIS_VENUE" | "OTHER_VENUE" | "NOT_WEDDING";
  correctedVenueAccountId?: number | null;
  skipReason?: "unsure" | "below_threshold" | "other_venue_no_handle" | "other_venue_unresolved";
}

function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

/**
 * Pure verdict-write decision (no DB) -- runExtract.ts supplies resolveVenueHandle, backed by an
 * account_aliases-aware handle->canonical-account-id map loaded once per run. Rules (per the D055
 * Phase 2 spec): UNSURE is NEVER written; THIS_VENUE/NOT_WEDDING need confidence >= threshold;
 * OTHER_VENUE additionally needs corrected_venue_handle to resolve to a real accounts row (alias-
 * aware) -- otherwise it's left unverdicted rather than guessed.
 */
export function decideVerdictWrite(
  result: ExtractResult,
  threshold: number,
  resolveVenueHandle: (handle: string) => number | null
): VerdictWriteDecision {
  if (result.verdict === "UNSURE") {
    return { shouldWrite: false, skipReason: "unsure" };
  }
  if (result.confidence < threshold) {
    return { shouldWrite: false, skipReason: "below_threshold" };
  }
  if (result.verdict === "THIS_VENUE" || result.verdict === "NOT_WEDDING") {
    return { shouldWrite: true, verdict: result.verdict, correctedVenueAccountId: null };
  }
  // OTHER_VENUE
  if (!result.corrected_venue_handle) {
    return { shouldWrite: false, skipReason: "other_venue_no_handle" };
  }
  const accountId = resolveVenueHandle(normalizeHandle(result.corrected_venue_handle));
  if (accountId == null) {
    return { shouldWrite: false, skipReason: "other_venue_unresolved" };
  }
  return { shouldWrite: true, verdict: "OTHER_VENUE", correctedVenueAccountId: accountId };
}

export { normalizeHandle };
