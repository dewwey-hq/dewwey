/**
 * Pure helpers for the D056 wedding-maintenance trio (reanchorWeddings.ts,
 * mergeDuplicateWeddings.ts, seedVenueTypes.ts), split out so they're importable from tests
 * without triggering any of those scripts' DB-backed main() -- same rationale/shape as
 * vendorRoleMigration.ts (migrateVendorRolesV2.ts) and discoveredVenueLeads.ts
 * (resolveDiscoveredVenues.ts). No DB access here; every DB-shaped fact a function below needs
 * is passed in as a plain argument, resolved by the caller first.
 */

// ---------------------------------------------------------------------------
// Couple-name normalization (mergeDuplicateWeddings.ts, match reason "couple_name").
//
// Normalizes a raw `post_extraction_runs.result->>'couple_names'` string (e.g. "Natalie &
// Paul", "Kelley and Corwin", "@mjoy4mn & @mfolson2") into an order-insensitive key built from
// the two people's first names, or null if the string doesn't look like a two-person pairing.
//
// Design: lowercase, then strip every character that isn't a letter, whitespace, '&', or '+'
// (digits/@/punctuation drop out in place -- no character is replaced with a space, so
// "@mjoy4mn" collapses to "mjoymn" as one token, not two). The separator ('&', '+', or the
// word "and") is then required to have whitespace on BOTH sides -- this is what makes
// "caterer+reception" (a mis-extracted vendor-role label, not a couple pairing) fail to
// normalize: there's no space around its '+'. Every real couple_names sample seen in the data
// ("Melissa & Matthew", "Preethi and Madhu", "@mjoy4mn & @mfolson2") already has spaces around
// the separator, so this costs nothing on real data. A string with zero, or more than one,
// separator match is rejected outright (not "ambiguous-but-try-anyway") -- same "never guess"
// discipline as the rest of D052+.
//
// Each side's "first name" is its first whitespace-delimited token; both must be >=3 letters
// after stripping, or the pair is rejected (kills single-initial noise and near-empty tokens).
// The two first names are sorted before joining so "Natalie & Paul" and "Paul + Natalie" (or
// "paul + natalie") produce the identical key.
// ---------------------------------------------------------------------------

const COUPLE_NAME_SEPARATOR_RE = /\s+(?:&|\+|and)\s+/i;
const COUPLE_NAME_STRIP_RE = /[^a-z\s&+]/g;

/** Returns an order-insensitive "first|first" key, or null if `raw` doesn't normalize to a
 * two-person pairing (no unambiguous separator, or either side's first name is <3 letters). */
export function normalizeCoupleNamePair(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.toLowerCase().replace(COUPLE_NAME_STRIP_RE, "");
  const parts = cleaned
    .split(COUPLE_NAME_SEPARATOR_RE)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length !== 2) return null;
  const firstNames = parts.map((p) => p.split(/\s+/)[0] ?? "");
  if (firstNames.some((n) => n.length < 3)) return null;
  return [...firstNames].sort().join("|");
}

/** True iff both raw strings normalize to a couple pairing AND that pairing is the same
 * (order-insensitive). False (not throw) if either fails to normalize. */
export function coupleNamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCoupleNamePair(a);
  const nb = normalizeCoupleNamePair(b);
  return na !== null && na === nb;
}

/** Whole-day difference between two `event_date_est` values (accepts Date or a `YYYY-MM-DD`
 * string as pg's date type comes back as either depending on driver config), used for the
 * mergeDuplicateWeddings.ts 400-day window. Always non-negative. */
export function daysBetween(a: string | Date, b: string | Date): number {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.abs(Math.round((da.getTime() - db.getTime()) / msPerDay));
}

// ---------------------------------------------------------------------------
// venue_type keyword classifier (seedVenueTypes.ts). Ordered categories, first match wins;
// within a category, keywords are tried in the given order too, so the report can say which
// specific keyword fired. Keyword strings are regex source (already written with `\b`/escapes
// where the spec needs a word boundary, e.g. "inn\\b", "\\bcc\\b") -- compiled case-insensitive
// since the caller is expected to pass already-lowercased text, but case-insensitive costs
// nothing extra and protects against a caller that forgets to lowercase.
// ---------------------------------------------------------------------------

export interface VenueTypeMatch {
  type: string;
  matchedKeyword: string | null; // null only for the "other" fallback
}

interface KeywordRule {
  keyword: string;
  regex: RegExp;
  /** Same keyword, spaces/underscores/dots stripped, compiled separately -- tested against a
   * similarly-stripped haystack so a multi-word phrase keyword ("country club", "history
   * center") still fires against a run-together compound username/name ("thegrovecountryclub")
   * that never had a delimiter for the plain `regex` to find. See `squash` below and D056
   * follow-up 2 (coordinator, 2026-09-10): thegrovecountryclub was falling through to
   * event_space's generic "club" keyword because country_club's own "country club" keyword
   * (which requires a literal space) never matched first. */
  squashedRegex: RegExp;
}

/** Strips whitespace, underscores, and dots -- the punctuation Instagram usernames use in place
 * of a space -- so "silverlake.cc" and "the.grove.country.club"-shaped names normalize the same
 * as their squashed-together sibling "thegrovecountryclub". Deliberately narrow (not a general
 * "strip all punctuation") so a `\b`-anchored keyword like "inn\\b" keeps meaning boundaries;
 * squashing never ADDS a boundary, it only ever removes the delimiters that already existed. */
function squash(s: string): string {
  return s.replace(/[\s_.]+/g, "");
}

function keywordRules(keywords: string[]): KeywordRule[] {
  return keywords.map((keyword) => ({
    keyword,
    regex: new RegExp(keyword, "i"),
    squashedRegex: new RegExp(squash(keyword), "i"),
  }));
}

const VENUE_TYPE_CATEGORIES: { type: string; rules: KeywordRule[] }[] = [
  {
    type: "house_of_worship",
    rules: keywordRules(["church", "parish", "cathedral", "chapel", "temple", "synagogue", "mosque", "basilica"]),
  },
  {
    type: "hotel",
    rules: keywordRules([
      "hotel",
      "inn\\b",
      "resort",
      "suites",
      "marriott",
      "hilton",
      "hyatt",
      "westin",
      "sheraton",
      "ritz",
      "four seasons",
      "waldorf",
      "langham",
      "peninsula",
      "sofitel",
      "intercontinental",
      "kimpton",
      // D056 follow-up 2 (coordinator, 2026-09-10) -- crowneplaza was falling through to
      // "other" (zero-metadata account, username-only text) with no brand keyword to catch it.
      "plaza",
      "crowne",
      "hyatt centric",
      "omni",
      "swissotel",
      "loews",
      "w chicago",
      "thompson",
      "viceroy",
      "pendry",
    ]),
  },
  {
    type: "country_club",
    rules: keywordRules([
      "country club",
      "golf",
      "\\bcc\\b",
      "athletic club",
      // D056 follow-up 2 (coordinator, 2026-09-10) -- explicit run-together forms as a
      // belt-and-suspenders alongside the squash mechanism below.
      "golfclub|countryclub|golf club",
      // Judgment-call addition beyond the coordinator's literal list: needed for
      // saddleandcycleclub (zero metadata beyond username) to land in country_club rather than
      // event_space's generic "club" -- "cycleclub" is a literal substring of that username, and
      // "cycle club" (Saddle and Cycle Club, Chicago's oldest athletic/social club) is the same
      // member-club category as "athletic club" already on this list. Flagged to the coordinator
      // in the session report rather than added silently.
      "cycle club",
    ]),
  },
  {
    type: "museum",
    rules: keywordRules([
      "museum",
      "conservatory",
      "planetarium",
      "aquarium",
      "library",
      "institute",
      "history center",
      "cultural center",
    ]),
  },
  {
    type: "park_outdoor",
    rules: keywordRules(["park\\b", "garden", "arboretum", "botanic", "zoo", "beach", "pier", "forest preserve", "nature"]),
  },
  {
    type: "farm_estate",
    rules: keywordRules(["farm", "barn", "estate", "mansion", "manor", "vineyard", "winery", "orchard", "ranch", "homestead"]),
  },
  {
    type: "restaurant",
    rules: keywordRules([
      "restaurant",
      "bistro",
      "steakhouse",
      "trattoria",
      "cafe",
      "kitchen",
      "tavern",
      "brewery",
      "distillery",
      "pizzeria",
      "osteria",
      "grill",
      "eatery",
      "bar & ",
      // D056 follow-up 2 (coordinator, 2026-09-10): "if needed" -- added for general coverage,
      // though NOTE it does not reclassify the motivating example (harrycarays): that account
      // has zero full_name/biography/category (username-only), and "harrycarays" itself
      // contains none of "steak"/"tavern"/"bar" as a substring, squashed or not. Left in "other"
      // rather than adding a name-specific ("carays") hack, which wouldn't generalize.
      "steak",
      "tavern",
      "bar$",
    ]),
  },
  {
    type: "event_space",
    rules: keywordRules([
      "loft",
      "hall",
      "ballroom",
      "venue",
      "events",
      "gallery",
      "studio",
      "rooftop",
      "space",
      "warehouse",
      "banquet",
      "center",
      "club",
      "room",
      "house",
    ]),
  },
];

/** Classifies `text` (caller builds it as `lower(username || ' ' || full_name || ' ' ||
 * biography || ' ' || vendors.category)`) against the ordered keyword rules. First category
 * whose first-matching keyword fires wins; `other` with a null keyword if nothing matches.
 *
 * Each keyword is tried against BOTH the plain lowercased text AND a squashed copy (spaces/
 * underscores/dots removed) tested with a squashed copy of the keyword -- tried together,
 * category by category, rather than as two separate full passes. That ordering matters:
 * "thegrovecountryclub" contains the plain substring "club" (event_space) but not "country
 * club" (needs a space) -- if every category's PLAIN test ran before any category's SQUASHED
 * test, event_space's plain "club" hit would win before country_club ever got its squashed
 * "countryclub" chance. Interleaving means country_club (checked first, per category order)
 * gets to try both its plain AND squashed forms before event_space is even considered. */
export function classifyVenueType(text: string): VenueTypeMatch {
  const lower = text.toLowerCase();
  const squashed = squash(lower);
  for (const category of VENUE_TYPE_CATEGORIES) {
    for (const rule of category.rules) {
      if (rule.regex.test(lower) || rule.squashedRegex.test(squashed)) {
        return { type: category.type, matchedKeyword: rule.keyword };
      }
    }
  }
  return { type: "other", matchedKeyword: null };
}

// ---------------------------------------------------------------------------
// Reanchor rule chooser (reanchorWeddings.ts). Pure decision given pre-fetched per-wedding
// facts -- the caller does every DB read (other venue-role wedding_vendors credits, the
// location_tag_venue_map resolution, each candidate account's v_account_role top role, and the
// protected-wedding check) and passes the results in.
//
// D056 follow-up 1 (coordinator, 2026-09-10, reviewing the first dry-run): bucket (ii)
// (anchor has no wedding_vendors row on this wedding at all) was being treated identically to
// bucket (i) (anchor's top role is wrong) -- but most of bucket (ii)'s 105 weddings are anchored
// on a perfectly real venue (adlerplanet: 191 venue credits elsewhere, chicagowinery: 163,
// artifacteventschicago: 137, cityhallchicagoevents: 49, rpmprivateevents: 44, chicagoparks: 12)
// that simply never got its OWN wedding_vendors row on this particular wedding, while a stray
// vendor (eleganteventlighting, orsosrestaurant, rojogusano -- decor/catering/lighting
// companies, not venues) happened to pick up a mis-tagged role='venue' credit on the same
// wedding. Rule (a) as originally written would have "moved" venue_id OFF the real venue and
// ONTO the stray vendor -- exactly backwards. Wedding 2135 (chicagoparks anchor,
// theblackstonehotel carrying the sole other venue-role credit) is the sharpest example: this
// script now DELIBERATELY prefers trusting an already-good anchor over a single competing
// credit, landing on `insert_credit` (chicagoparks stays venue_id, backfilled with its own
// credit row) rather than `moved` (which is what it did on the FIRST dry-run, before this
// fix).
//
// Priority order, evaluated in this sequence:
//   0. protected -> unchanged, as before.
//   1. `currentAnchorIsVenueCategory` (the CURRENT venue_id account's v_account_role top role is
//      venue/accommodations/venue_management) -> `insert_credit`, full stop. This takes
//      priority over rule (a)/(b) entirely -- an already-legitimate venue anchor is never
//      second-guessed by a single stray credit elsewhere on the same wedding.
//   2. Only when the CURRENT anchor is NOT venue-category (bucket (i)'s actual bug shape --
//      lmcateringchi, entertaining_co, revel_decor, lettuceentertainyou -- a caterer/decor/
//      florist company wrongly anchoring a wedding) do rule (a)/(b) get a chance to move
//      venue_id -- and only onto a TARGET whose own top role is ALSO venue-category. A rule-(a)
//      candidate that's the wedding's only other venue-role credit but ISN'T itself
//      venue-category (the rojogusano/eleganteventlighting shape) is refused outright --
//      human_queue, not a fallback to rule (b) -- rather than silently anchoring onto another
//      wrong account. The same venue-category requirement is applied to rule (b)'s target too,
//      for the same reason, even though the coordinator's note only called out rule (a)
//      explicitly: the invariant this fix exists to protect ("never point venue_id at a
//      non-venue account") shouldn't depend on which rule produced the candidate.
//   3. Otherwise: human_queue, reason names which of (a)/(b) was tried and why it didn't
//      resolve.
// ---------------------------------------------------------------------------

export type ReanchorRule = "other_venue_credit" | "location_tag";

export type ReanchorOutcome =
  | { kind: "protected" }
  | { kind: "moved"; rule: ReanchorRule; newVenueAccountId: number }
  | { kind: "insert_credit" }
  | { kind: "human_queue"; reason: string };

export interface ReanchorInputs {
  isProtected: boolean;
  currentVenueAccountId: number;
  /** True iff the CURRENT venue_id account's v_account_role top role is venue, accommodations,
   * or venue_management -- deliberately NOT the same 3-role set reanchorWeddings.ts's bucket
   * (i)/(ii) candidate queries use (venue/hotel/accommodations): `hotel` was retired from live
   * use by the D056 vendor-taxonomy migration (rows already re-roled to venue/accommodations),
   * and `venue_management` (the venuelogic shape) is included here per the coordinator's
   * explicit direction -- a management company anchoring its own managed wedding is treated as
   * trustworthy enough not to second-guess. */
  currentAnchorIsVenueCategory: boolean;
  /** Distinct accounts with a role='venue' wedding_vendors row on this wedding OTHER than the
   * current venue_id. May include the current venue_id itself if the caller didn't pre-filter
   * -- filtered again here defensively. */
  otherVenueCreditAccountIds: number[];
  /** Distinct venue accounts this wedding's posts' location_tag resolves to via
   * location_tag_venue_map, excluding the current venue_id. Filtered again here defensively. */
  locationTagVenueAccountIds: number[];
  /** Account ids whose v_account_role top role is venue/accommodations/venue_management -- used
   * to gate BOTH rule (a) and rule (b) targets (see header). Membership only matters for ids
   * that also appear in otherVenueCreditAccountIds/locationTagVenueAccountIds. */
  venueCategoryAccountIds: ReadonlySet<number>;
}

export function chooseReanchorTarget(input: ReanchorInputs): ReanchorOutcome {
  if (input.isProtected) return { kind: "protected" };

  if (input.currentAnchorIsVenueCategory) {
    return { kind: "insert_credit" };
  }

  const others = [...new Set(input.otherVenueCreditAccountIds)].filter(
    (id) => id !== input.currentVenueAccountId
  );
  if (others.length === 1) {
    const candidate = others[0];
    if (input.venueCategoryAccountIds.has(candidate)) {
      return { kind: "moved", rule: "other_venue_credit", newVenueAccountId: candidate };
    }
    return {
      kind: "human_queue",
      reason: `rule (a): sole other venue-role credit (account ${candidate}) is not itself venue-category -- refusing to anchor onto a non-venue account`,
    };
  }

  const tagResolved = [...new Set(input.locationTagVenueAccountIds)].filter(
    (id) => id !== input.currentVenueAccountId
  );
  if (tagResolved.length === 1) {
    const candidate = tagResolved[0];
    if (input.venueCategoryAccountIds.has(candidate)) {
      return { kind: "moved", rule: "location_tag", newVenueAccountId: candidate };
    }
    return {
      kind: "human_queue",
      reason: `rule (b): sole location-tag-resolved venue account (account ${candidate}) is not itself venue-category -- refusing to anchor onto a non-venue account`,
    };
  }

  const ruleAReason =
    others.length === 0
      ? "rule (a): no other venue-role credit on this wedding"
      : `rule (a): ${others.length} other venue-role credits, ambiguous`;
  const ruleBReason =
    tagResolved.length === 0
      ? "rule (b): no location-tag resolution"
      : `rule (b): ${tagResolved.length} location-tag-resolved venue accounts, ambiguous`;
  return { kind: "human_queue", reason: `${ruleAReason}; ${ruleBReason}` };
}
