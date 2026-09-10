/**
 * Pure name-normalization + matching helpers for `--mode venue-calibration` (runExtract.ts) --
 * the gate for extract-v1.2's four new venue-discovery fields (venue_name, venue_handle_guess,
 * location_claim, chicago_metro). That mode hides the anchored venue from the model on posts
 * that are already DOCUMENTED weddings, then asks: could the model have found the right venue
 * on its own, from the caption/credit-stack alone?
 *
 * No DB, no network -- runExtract.ts resolves handles to account ids (account_aliases-aware, via
 * the same loadHandleResolver map the corpus write path already uses) and fetches the actual
 * venue's name variants, then hands the ALREADY-RESOLVED values in here. Kept separate from
 * extractPrompt.ts (the coordinator-owned prompt/schema file) and from the DB-wired script, same
 * "pure logic in its own testable module" split as escalation.ts.
 */

/**
 * Lowercases, strips punctuation to spaces, drops the standalone word "the", and collapses
 * whitespace -- "The Dalcy!" and "Dalcy, The" both normalize to "dalcy". Used for BOTH venue-name
 * comparison and the caption substring check below, so the two sides of a "does this name appear
 * in that text" check are always normalized the same way.
 */
export function normalizeVenueName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((tok) => tok.length > 0 && tok !== "the")
    .join(" ")
    .trim();
}

export type VenueAttributionMatch = "handle_match" | "name_match" | "no_match" | "model_null";

export interface VenueAttributionInput {
  /** The model's raw venue_handle_guess (pre-resolution) -- used only to distinguish "said
   *  nothing" (model_null) from "guessed a handle that didn't resolve to any known account"
   *  (no_match). */
  modelVenueHandleGuess: string | null;
  /** modelVenueHandleGuess resolved (account_aliases-aware) to a canonical account_id by the
   *  caller, or null if it didn't resolve / wasn't given. */
  modelHandleAccountId: number | null;
  modelVenueName: string | null;
  /** The wedding's actual venue account_id (weddings.venue_id) -- always canonical; venue_id
   *  points straight at accounts, never through an alias. */
  actualVenueAccountId: number;
  /** Raw (not yet normalized) name variants for the actual venue: accounts.full_name,
   *  vendors.name, and every location_tag_venue_map tag pinned to this account. */
  actualNameVariants: string[];
}

export interface VenueAttributionResult {
  match: VenueAttributionMatch;
  handleMatched: boolean;
  nameMatched: boolean;
}

/**
 * Compares the model's guess against the actual venue, alias-aware on the handle side (via the
 * caller-resolved account ids) and normalized on the name side. handle_match takes priority over
 * name_match when both are true (the handle is the stronger signal); model_null fires only when
 * the model gave neither field, distinguishing "said nothing" from "guessed wrong."
 */
export function classifyVenueAttribution(input: VenueAttributionInput): VenueAttributionResult {
  const handleMatched = input.modelHandleAccountId != null && input.modelHandleAccountId === input.actualVenueAccountId;

  const modelNameNorm = normalizeVenueName(input.modelVenueName);
  const actualNameNorms = input.actualNameVariants.map(normalizeVenueName).filter((s) => s.length > 0);
  const nameMatched = modelNameNorm.length > 0 && actualNameNorms.includes(modelNameNorm);

  const saidNothing = !input.modelVenueHandleGuess && !input.modelVenueName;

  let match: VenueAttributionMatch;
  if (handleMatched) match = "handle_match";
  else if (nameMatched) match = "name_match";
  else if (saidNothing) match = "model_null";
  else match = "no_match";

  return { match, handleMatched, nameMatched };
}

export type CaptionVenueSignal = "handle" | "name_only" | "neither";

export interface CaptionVenueSignalInput {
  /** Account ids resolved (alias-aware) from this post's raw @mentions -- null entries (a
   *  mention that didn't resolve to a known account) are harmless, just never match. */
  mentionAccountIds: (number | null)[];
  /** Account ids resolved (alias-aware) from the post's role='venue' credit-stack entries --
   *  the ones HIDDEN from the model in this mode. Kept separate from mentionAccountIds so a
   *  caller could tell the two sources apart later; classification here treats them the same. */
  removedVenueStackAccountIds: (number | null)[];
  actualVenueAccountId: number;
  /** normalizeVenueName(caption_raw ?? "") -- computed by the caller so this function stays a
   *  pure comparison, not a second copy of the normalization rule. */
  captionNameNormalized: string;
  actualNameVariants: string[];
}

/**
 * Classifies what signal the ORIGINAL (un-hidden) post actually gave for the venue: an @handle
 * (in prose mentions or the hidden credit-stack line), the venue's bare name in the caption text
 * with no handle, or neither. This is the independent variable for the venue-attribution report's
 * "what can the model do without a handle" split -- computed from the real post, never from
 * anything the model said.
 */
export function classifyCaptionVenueSignal(input: CaptionVenueSignalInput): CaptionVenueSignal {
  const hasHandle =
    input.mentionAccountIds.includes(input.actualVenueAccountId) ||
    input.removedVenueStackAccountIds.includes(input.actualVenueAccountId);
  if (hasHandle) return "handle";

  const nameVariants = input.actualNameVariants.map(normalizeVenueName).filter((s) => s.length > 0);
  const hasName = nameVariants.some((v) => input.captionNameNormalized.includes(v));
  return hasName ? "name_only" : "neither";
}
