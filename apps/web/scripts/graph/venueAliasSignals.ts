/**
 * Pure helper functions for findVenueAliasCandidates.ts -- normalization, distance, phrase
 * classification, exclusion checks, and tier decision. No DB access here (same split rationale
 * as discoveredVenueLeads.ts / clusteringUtils.ts): every DB-shaped fact a function below needs
 * is passed in as a plain argument, resolved by the caller first. This is what
 * venueAliasSignals.test.ts exercises without touching the database.
 */

// ============================================================
// S1 / S1b -- handle normalization
// ============================================================

/** Tokens that get stripped wholesale (no word-boundary anchoring -- IG handles are single
 * concatenated words with no separators, so a \b-anchored regex would almost never match
 * mid-string; a plain global replace is what actually collapses "thearbory" and "the.arbory"
 * to the same stem, which is the whole point of this signal). "chicago" is listed before "chi"
 * so the longer, more specific token wins when both would match at the same position. */
const STRIP_TOKENS_RE =
  /(chicago|chi|events?|weddings?|venue|banquets?|official|il|the|and|at)/g;

/** S1: lowercase -> strip the marketing/geo/role tokens -> strip everything non-alphanumeric.
 * Caller applies the `stem.length >= minStemLen` filter (default 4) before treating two accounts
 * as a match -- a short/empty stem is not returned specially here, just left short, so tests can
 * assert the raw value. */
export function computeStem(handleOrName: string): string {
  const lowered = handleOrName.toLowerCase();
  const stripped = lowered.replace(STRIP_TOKENS_RE, "");
  return stripped.replace(/[^a-z0-9]/g, "");
}

/** S1b helper: drop every '.' and '_' (covers the "trailing '.'" case too -- Instagram usernames
 * can't end in '.', so a trailing dot is always a scrape/parse artifact, not a real character). */
export function stripPunctuationVariant(username: string): string {
  return username.toLowerCase().replace(/[._]/g, "");
}

/** S1b: two distinct handles that become identical once '.'/'_' are removed -- a scrape/parse
 * artifact, not a real second account. */
export function isPunctuationVariant(usernameA: string, usernameB: string): boolean {
  if (usernameA.toLowerCase() === usernameB.toLowerCase()) return false;
  const a = stripPunctuationVariant(usernameA);
  const b = stripPunctuationVariant(usernameB);
  return a.length > 0 && a === b;
}

// ============================================================
// S3 -- external_url normalization
// ============================================================

/** S3: lowercase, strip scheme + "www.", drop utm_* query params, strip a trailing slash.
 * Returns null for an empty/missing url. Falls back to a lowercased/trimmed passthrough if the
 * value doesn't parse as a URL at all (a bare domain-looking string still normalizes fine via
 * the http:// prefix added below; this fallback only fires on genuinely malformed input). */
export function normalizeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  let candidate = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `http://${candidate}`;
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const params = new URLSearchParams(url.search);
    for (const key of [...params.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) params.delete(key);
    }
    const path = url.pathname.replace(/\/+$/, "");
    const qs = params.toString();
    const normalized = `${host}${path}${qs ? `?${qs}` : ""}`;
    return normalized || null;
  } catch {
    return raw.trim().toLowerCase().replace(/\/+$/, "") || null;
  }
}

// ============================================================
// S4 -- bio @mention snippet + phrase classification
// ============================================================

/** Finds the first `@handle` mention in `biography` and returns ~40 chars of context around it
 * (20 before, 20 after, clamped to the string). Null if the handle isn't mentioned. Mirrors
 * discoveredVenueLeads.ts's captionContainsHandle word-boundary discipline so "@thevenue" doesn't
 * false-positive match a longer "@thevenuepartners" credit. */
export function extractBioMentionSnippet(
  biography: string | null | undefined,
  handle: string
): string | null {
  if (!biography) return null;
  const h = handle.trim().toLowerCase().replace(/^@/, "");
  if (!h) return null;
  const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`@${escaped}(?![a-z0-9._])`, "i");
  const m = re.exec(biography);
  if (!m) return null;
  const start = Math.max(0, m.index - 20);
  const end = Math.min(biography.length, m.index + m[0].length + 20);
  return biography.slice(start, end).trim();
}

export type BioMentionPhrase = "alias_like" | "related_not_alias" | null;

/** T1-eligible: the bio names the mentioned handle as ITS OWN dedicated events/booking presence
 * ("Weddings Account @x", "book at @x"). */
const ALIAS_LIKE_RE = /events? account|weddings? account|special events|our events|book(?:ing)? (?:at|via)/i;

/** Related but NOT the same venue: the mention names a third-party operator, sister brand, or
 * management relationship ("Venue Management for @x", "Catering by @x") -- "management" is
 * included alongside "managed by" so a bare "Venue Management" caption still classifies. */
const RELATED_NOT_ALIAS_RE = /by @|managed? by|management|caterer at|in-house|hospitality|\bgroup\b|part of|sister/i;

/** S4: classify the ~40-char snippet around a bio @mention. Checked alias_like first so a
 * snippet that (rarely) matches both patterns still resolves to the more specific, T1-eligible
 * class rather than being demoted. */
export function classifyBioMentionPhrase(snippet: string): BioMentionPhrase {
  if (ALIAS_LIKE_RE.test(snippet)) return "alias_like";
  if (RELATED_NOT_ALIAS_RE.test(snippet)) return "related_not_alias";
  return null;
}

// ============================================================
// S6 -- mis-capture (Levenshtein distance)
// ============================================================

/** Standard iterative edit-distance DP (fuzzystrmatch isn't installed on this project's Supabase
 * instance -- see reportDefaultCityVenueGeography.ts's sibling scripts for the same "implement
 * in TS, don't assume a Postgres extension" discipline). O(len(a) * len(b)) time, O(min) space. */
export function levenshtein(a: string, b: string): number {
  let s = a;
  let t = b;
  if (s.length > t.length) [s, t] = [t, s];
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  let prev = new Array(m + 1);
  let curr = new Array(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;
  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    const tChar = t.charCodeAt(j - 1);
    for (let i = 1; i <= m; i++) {
      const cost = s.charCodeAt(i - 1) === tChar ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1, // deletion
        curr[i - 1] + 1, // insertion
        prev[i - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

// ============================================================
// Exclusions
// ============================================================

const CHURCH_RE = /\b(church|parish|cathedral|chapel|temple|synagogue|mosque|basilica)\b/i;
/** Same word list, no \b anchors -- for username, which is a single concatenated string with no
 * space/punctuation between words ("saintclementparish"), so a \b-anchored regex can only ever
 * match at the very start/end of the whole string, never at an embedded word boundary. Same
 * "concatenated handle needs non-boundary matching" reasoning as computeStem's token strip. */
const CHURCH_SUBSTRING_RE = /church|parish|cathedral|chapel|temple|synagogue|mosque|basilica/i;

const NON_VENUE_BIO_RE =
  /\b(cater|catering|management|hospitality|restaurant group|planner|planning|photograph|floral|florist)\b/i;

export function isChurchLike(text: string | null | undefined): boolean {
  return !!text && CHURCH_RE.test(text);
}

/** Username variant of isChurchLike -- see CHURCH_SUBSTRING_RE above for why this needs a plain
 * substring test instead of \b word-boundary anchoring. */
export function isChurchLikeUsername(username: string | null | undefined): boolean {
  return !!username && CHURCH_SUBSTRING_RE.test(username);
}

export function isNonVenueBio(text: string | null | undefined): boolean {
  return !!text && NON_VENUE_BIO_RE.test(text);
}

/** Round-3 tail-end-coverage false positives (docs/decisions.md, applyAccountAliasesSchema.ts's
 * own comment) -- each pair independently investigated and found NOT to be the same venue.
 * Never propose these again on username-similarity grounds alone. */
const ROUND3_FALSE_POSITIVE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["thedrakeoakbrook", "thedrake"],
  ["ravenswoodloftchicago", "ftchicago"],
  ["riverroastchi", "riverroastchicago"],
  ["gooseislandchicago", "gooseisland"],
  ["swissotelchi", "swissotel"],
  ["chicagofirehouserestaurant", "chicagofire"],
  ["rpmeventschicago", "rpmevents"],
  ["cafebrauer", "patioatcafebrauer"],
  ["artinstitutechi", "artinstitutechicago"],
];

/** Known multi-property groups/brands whose bare or corporate handle is a genericity risk (same
 * reasoning as "thedrake"/"rpmevents" bare above) -- a match here is never venue identity. */
const DENY_LIST_USERNAMES = new Set([
  "lettuceentertainyou",
  "venuelogic",
  "episcope.hospitality",
  "theovationgroupchicago",
  "dineamic",
  "gooseisland",
  "swissotel",
  "thedrake",
  "rpmevents",
]);

/** True if this exact pair (in either order) is a known false positive or hits the deny-list --
 * moves the pair to "related, not the same venue" regardless of what else fired. */
export function isExcludedPair(usernameA: string, usernameB: string): boolean {
  const a = usernameA.toLowerCase();
  const b = usernameB.toLowerCase();
  if (DENY_LIST_USERNAMES.has(a) || DENY_LIST_USERNAMES.has(b)) return true;
  return ROUND3_FALSE_POSITIVE_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

// ============================================================
// Tier decision
// ============================================================

export type SignalCode = "S1" | "S1b" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7";
export type Tier = "T1" | "T2" | "T3";

export interface TierInput {
  /** distinct signal codes that fired for this pair (each counted once even if it fired
   * multiple times, e.g. two separate co-credited posts are still just "S5" once here). */
  signalCodes: SignalCode[];
  /** S1b (punctuation-only variant) fired. */
  s1bFired: boolean;
  /** S2 fired AND both sides have vendors.category = 'venue'. */
  s2BothVenueCategory: boolean;
  /** S4 fired with at least one alias_like-classified mention. */
  s4AliasLikeFired: boolean;
  /** highest distinct-post count across S5 co-credit evidence for this pair (0 if S5 didn't fire). */
  s5MaxPostCount: number;
  /** S6 (mis-capture) fired. */
  s6Fired: boolean;
  /** highest distinct-post count across S7 reader-disagreement evidence for this pair (0 if S7
   * didn't fire). */
  s7MaxPostCount: number;
}

/** T1 auto-safe = S1b, or S2 where both are venue-category, or S4 alias_like phrase.
 * T2 verify = any pair with >=2 distinct signals, or S5 with >=5 posts, or S6, or S7 with
 * >=3 posts. T3 = everything else that fired at least one signal. */
export function decideTier(input: TierInput): Tier {
  if (input.s1bFired || input.s2BothVenueCategory || input.s4AliasLikeFired) return "T1";
  const distinctSignalCount = new Set(input.signalCodes).size;
  if (
    distinctSignalCount >= 2 ||
    input.s5MaxPostCount >= 5 ||
    input.s6Fired ||
    input.s7MaxPostCount >= 3
  ) {
    return "T2";
  }
  return "T3";
}

// ============================================================
// Suggested direction
// ============================================================

export interface AccountDirectionFacts {
  username: string;
  hasScrapedProfile: boolean;
  hasFullName: boolean;
  followers: number | null;
}

export interface DirectionSuggestion {
  canonicalUsername: string;
  aliasUsername: string;
  reason: string;
}

/** canonical = the side with a scraped profile/full_name/more followers (in that priority
 * order); alias = the other. A full tie falls back to an arbitrary alphabetical pick, flagged
 * in the reason so a reviewer knows to check by hand. */
export function suggestDirection(
  a: AccountDirectionFacts,
  b: AccountDirectionFacts
): DirectionSuggestion {
  if (a.hasScrapedProfile !== b.hasScrapedProfile) {
    const [canon, alias] = a.hasScrapedProfile ? [a, b] : [b, a];
    return {
      canonicalUsername: canon.username,
      aliasUsername: alias.username,
      reason: `@${canon.username} has a scraped profile, @${alias.username} does not`,
    };
  }
  if (a.hasFullName !== b.hasFullName) {
    const [canon, alias] = a.hasFullName ? [a, b] : [b, a];
    return {
      canonicalUsername: canon.username,
      aliasUsername: alias.username,
      reason: `@${canon.username} has a full_name on record, @${alias.username} does not`,
    };
  }
  const fa = a.followers ?? -1;
  const fb = b.followers ?? -1;
  if (fa !== fb) {
    const [canon, alias] = fa > fb ? [a, b] : [b, a];
    return {
      canonicalUsername: canon.username,
      aliasUsername: alias.username,
      reason: `@${canon.username} has more followers (${Math.max(fa, fb)} vs ${Math.min(fa, fb)})`,
    };
  }
  const [canon, alias] = a.username.toLowerCase() <= b.username.toLowerCase() ? [a, b] : [b, a];
  return {
    canonicalUsername: canon.username,
    aliasUsername: alias.username,
    reason: "tie on profile/full_name/followers -- arbitrary alphabetical pick, verify by hand",
  };
}
