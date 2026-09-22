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

/** D062 (2026-09-20): facility nouns stripped ONLY as a trailing suffix, never globally.
 *
 * The gap this closes: `navypierchicago` stemmed to "navypier" but `navypiereventcenter` stemmed
 * to "navypiercenter" -- STRIP_TOKENS_RE removes "event" but left "center" -- so the venue's own
 * event arm never paired with its brand handle. Same shape for any "<venue>eventcenter" /
 * "<venue>pavilion" / "<venue>rooftop" handle.
 *
 * Why suffix-anchored and not added to STRIP_TOKENS_RE: a global strip of facility words is
 * actively destructive. "greenhouseloft" (34 weddings) would lose both "house" and "loft" and
 * stem to "green", a 5-char stem that then pairs with anything else ending up there. Anchoring to
 * the end keeps the venue's actual name intact -- Dunham Woods Riding *Club*, Greenhouse *Loft* --
 * while still collapsing the trailing facility descriptor that marketing handles append.
 *
 * Deliberately NOT included: house, club, hall, estate, mansion, gardens, loft, studio, room.
 * Each of those is routinely part of the venue's real name rather than a descriptor, so stripping
 * them merges genuinely different venues. */
const FACILITY_SUFFIX_RE =
  /(conferencecenter|eventcenter|eventspace|banquetcenter|center|centre|pavilion|ballroom|rooftop|terrace)$/;

/** S1: lowercase -> strip the marketing/geo/role tokens -> strip everything non-alphanumeric ->
 * strip one trailing facility noun. Caller applies the `stem.length >= minStemLen` filter
 * (default 4) before treating two accounts as a match -- a short/empty stem is not returned
 * specially here, just left short, so tests can assert the raw value.
 *
 * ORDER MATTERS, and not in the obvious way: the facility strip runs BEFORE the token strip, on
 * the raw alphanumeric handle. STRIP_TOKENS_RE contains "il" (for Illinois), which chews the
 * middle out of "pavilion" -> "pavion" and "ballroom" is untouched but "terrace" survives only by
 * luck. Running the facility strip second would mean matching against those mangled forms. Run it
 * first and each facility noun is still intact:
 *   navypiereventcenter -> [facility] navypier      -> [tokens] navypier
 *   navypierchicago     -> [facility] (no match)    -> [tokens] navypier
 *   theramovapavilion   -> [facility] theramova     -> [tokens] ramova
 *
 * Applied once, not to a fixed point -- a handle ending in two stacked facility nouns is not a
 * pattern we have seen, and repeated stripping would eat real names faster than it helps. */
export function computeStem(handleOrName: string): string {
  const alnum = handleOrName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const deFacilitied = alnum.replace(FACILITY_SUFFIX_RE, "");
  // Never let the facility strip empty a stem out entirely ("pavilion" -> ""): if it would, keep
  // the pre-strip value so the caller's min-stem-len filter sees something honest.
  const base = deFacilitied.length > 0 ? deFacilitied : alnum;
  return base.replace(STRIP_TOKENS_RE, "");
}

/** S1b helper: drop every '.' and '_' (covers the "trailing '.'" case too -- Instagram usernames
 * can't end in '.', so a trailing dot is always a scrape/parse artifact, not a real character). */
export function stripPunctuationVariant(username: string): string {
  return username.toLowerCase().replace(/[._]/g, "");
}

/** S1b: two distinct handles that become identical once '.'/'_' are removed.
 *
 * NARROWED 2026-09-21 (D066) after it produced a wrong merge. It used to claim any such pair was
 * "a scrape/parse artifact, not a real second account". That reasoning is sound for a TRAILING dot
 * (Instagram handles cannot end in '.', so one is definitionally an artifact) and for a pair where
 * one side has no punctuation at all. It is NOT sound for an interior '.'<->'_' SWAP: both
 * characters are legal inside a handle, so `@silverlake.cc` and `@silverlake_cc` are two real,
 * separately registered accounts — Silver Lake Country Club in Orland Park IL and Silver Lake
 * Country Club in Stow OHIO. They were merged on this signal in "round 7a", which attributed an
 * Ohio wedding to a Chicago venue and made the Ohio club a paid crawl target. The user caught it by
 * reading the served post.
 *
 * So this now returns true only for the artifact-shaped cases, and interior swaps are routed to
 * `isInteriorPunctuationSwap` below as a WEAK signal that must be corroborated. */
export function isPunctuationVariant(usernameA: string, usernameB: string): boolean {
  if (usernameA.toLowerCase() === usernameB.toLowerCase()) return false;
  const a = stripPunctuationVariant(usernameA);
  const b = stripPunctuationVariant(usernameB);
  if (a.length === 0 || a !== b) return false;
  const lowerA = usernameA.toLowerCase();
  const lowerB = usernameB.toLowerCase();
  // A trailing '.' is impossible in a real handle, so that pair is always an artifact.
  if (lowerA.endsWith(".") || lowerB.endsWith(".")) return true;
  // One side carrying no punctuation at all is the "someone dropped the separator" shape.
  const puncA = (lowerA.match(/[._]/g) ?? []).length;
  const puncB = (lowerB.match(/[._]/g) ?? []).length;
  return puncA === 0 || puncB === 0;
}

/** D066: two handles identical apart from swapping '.' for '_' INSIDE the handle. Both characters
 * are legal, so this is a weak "might be the same business" hint, never an artifact claim — it must
 * be corroborated by geography or another signal before any merge. `@silverlake.cc` vs
 * `@silverlake_cc` is the case that proves the point: same name, different states. */
export function isInteriorPunctuationSwap(usernameA: string, usernameB: string): boolean {
  if (usernameA.toLowerCase() === usernameB.toLowerCase()) return false;
  if (isPunctuationVariant(usernameA, usernameB)) return false;
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
// S3b -- registrable-host grouping (D062, 2026-09-20)
// ============================================================

/** Hosts that many unrelated businesses share, so two accounts pointing at one prove nothing.
 *
 * This deny-list is not defensive coding -- it is the whole reason S3b is safe. Measured on the
 * live `accounts` table 2026-09-20, grouping external_url by host with no deny-list:
 *   linkin.bio   -> 21 accounts (Chicago Winery + Chicago History Museum + Ralph Lauren + ...)
 *   sprout.link  -> 15 (incl. both navypierchicago AND navypiereventcenter, but also Loyola
 *                       and Choose Chicago -- a right answer for the wrong reason)
 *   lnk.bio      -> 10 (Morton Arboretum + Chicago Botanic + Boka)
 *   campsite.bio -> 5
 * Un-denied, S3b would propose merging those into single venues.
 *
 * Two classes are listed: link-in-bio aggregators, and booking/reservation/social platforms that
 * venues link to instead of their own site (OpenTable, Tock, Eventbrite, Resy, Vimeo, and the
 * social networks themselves). `invitedclubs.com` is a third kind -- a club-management group whose
 * member clubs each link to it; see the management-company rule in isExcludedPair. */
const AGGREGATOR_HOSTS = new Set([
  // link-in-bio
  "linkin.bio",
  "sprout.link",
  "lnk.bio",
  "campsite.bio",
  "linktr.ee",
  "hopp.bio",
  "visitstore.bio",
  "link.me",
  "beacons.ai",
  "bio.site",
  "tap.bio",
  "milkshake.app",
  "shorby.com",
  "woobox.com",
  "later.com",
  "withkoji.com",
  // booking / reservation / ticketing
  "opentable.com",
  "exploretock.com",
  "resy.com",
  "eventbrite.com",
  "sevenrooms.com",
  "tripleseat.com",
  // social / media platforms
  "instagram.com",
  "facebook.com",
  "youtube.com",
  "vimeo.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "pinterest.com",
  "google.com",
  "goo.gl",
  "bit.ly",
  "linktw.in",
  // management groups whose member venues all link to the parent
  "invitedclubs.com",
  // D062 round 2, surfaced by the 2026-09-20 profile-enrichment scrape: HOTEL CHAIN BOOKING
  // DOMAINS. Every property of a chain links to the chain's reservation site, so the host groups
  // unrelated hotels -- and not merely across brands but across continents. Measured pairs from
  // that run: @westinchicagons ~ @stregiskanairesort and @renchicagonorth ~ @marriott.chicago.nw
  // all on "marriott.com"; @hyattregencyschaumburg ~ @hyattregencyorlando on "hyatt.com". This is
  // the same chain-contamination class that makes Jeremy's social links a candidate feed rather
  // than an authority (JW Marriott Chicago -> @marriottbonvoy).
  "marriott.com",
  "hyatt.com",
  "hilton.com",
  "ihg.com",
  "accor.com",
  "choicehotels.com",
  "wyndhamhotels.com",
  "radissonhotels.com",
  "bestwestern.com",
  "loewshotels.com",
  "omnihotels.com",
  "fourseasons.com",
  "ritzcarlton.com",
  "marriottbonvoy.com",
  // more link-in-bio / shortener hosts the same run exposed
  "likeshop.me",
  "youtu.be",
  "youtube.com",
  "lnk.to",
  "linkpop.com",
  "pxlme.me",
  "shor.by",
]);

/** S3b: the registrable-ish host of a url -- scheme, "www.", path, query, fragment and port all
 * dropped. Deliberately NOT normalizeExternalUrl, which keeps the path: `navypier.org` and
 * `navypier.org/host-an-event` are the same venue but different S3 keys, which is exactly why S3
 * never paired a venue with its own events arm.
 *
 * "Registrable-ish", not registrable: this does not consult a public-suffix list, so a
 * `foo.co.uk`-style host keeps its full name. That is fine for the signal's purpose (equality
 * between two of our own rows) and avoids a new dependency; it would matter only if we tried to
 * compare across different subdomains of a public suffix, which we do not. Subdomains are kept
 * (`events.venue.com` != `venue.com`) -- intentional, since a shared parent domain with different
 * subdomains is weaker evidence than an exact host and would widen the signal past what the
 * measured wins need. */
export function registrableHost(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  let candidate = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `http://${candidate}`;
  try {
    const host = new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    const fallback = raw
      .trim()
      .toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[/:?#].*$/, "");
    return fallback || null;
  }
}

/** Link-in-bio services live almost exclusively on these TLDs, and they mint host variants faster
 * than a deny-list can track. The first S3b run caught @uchicago and @hilton sharing
 * "clicklinkin.bio" -- a variant of linkin.bio that matched neither the exact entry nor the
 * subdomain check, because it ends with "linkin.bio" without a dot separator. Rather than chase
 * spellings, treat the whole TLD family as aggregator space: nothing in this dataset publishes a
 * real venue website on a .bio or .link domain. */
const AGGREGATOR_TLD_RE = /\.(bio|link)$/;

/** True when a host is shared by unrelated businesses and therefore proves no relationship.
 * Matches the host itself, any subdomain of it (`chicagowinery.linkin.bio`), any host ending in a
 * denied name (`clicklinkin.bio`), and the .bio/.link aggregator TLDs. */
export function isAggregatorHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^www\./, "");
  if (AGGREGATOR_HOSTS.has(h)) return true;
  if (AGGREGATOR_TLD_RE.test(h)) return true;
  for (const denied of AGGREGATOR_HOSTS) {
    if (h.endsWith(`.${denied}`) || h.endsWith(denied)) return true;
  }
  return false;
}

/** S3b pair test: both sides resolve to the same non-aggregator host. */
export function sharesRegistrableHost(
  urlA: string | null | undefined,
  urlB: string | null | undefined
): boolean {
  const a = registrableHost(urlA);
  const b = registrableHost(urlB);
  if (!a || !b || a !== b) return false;
  return !isAggregatorHost(a);
}

/** D062: is an S6 Levenshtein hit trustworthy on its own?
 *
 * S6 exists to catch typo shells minted from a credit line, which by definition have no bio, no
 * website and no other signal -- so demanding external corroboration would defeat it. The real
 * discriminator is not the raw edit distance but *what fraction of the distinguishing part of the
 * handle* differs. Measured on the 2026-09-20 run:
 *
 *   BAD  @ihchicago / @fschicago     stems "ih" / "fs"   -> distance 2 on a 2-char stem: the
 *                                     entire distinguishing portion differs. "chicago" is 7 of
 *                                     the 9 characters, so edit distance 2 means nothing. This
 *                                     shape paired @ihchicago with five different Chicago hotels.
 *   BAD  @msichicago / @mcachicago   stems "msi" / "mca" -> 2 of 3.
 *   BAD  @thegagechicago / @thewadechicago  stems "gage" / "wade" -> 2 of 4.
 *   GOOD @catignypark / @cantignypark       stems differ by 1 of 12.
 *   GOOD @tigerlillyevents / @tigerlilyevents  stems differ by 1 of 10.
 *
 * So: the STEMS must be long enough to carry information (>= 4 chars) and differ by at most one
 * edit. A pair that fails this still appears in the T3 listing for a human -- it is demoted, not
 * discarded. Known false negative accepted: @cogweddingsandevents / @cbgweddingsandevents stems
 * to "cog" / "cbg", too short to trust, even though it is a real pair; it stays in T3. */
export function isS6Trustworthy(usernameA: string, usernameB: string): boolean {
  const stemA = computeStem(usernameA);
  const stemB = computeStem(usernameB);
  if (stemA.length < 4 || stemB.length < 4) return false;
  return levenshtein(stemA, stemB) <= 1;
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

/** D062 (2026-09-20): a venue that describes its own amenities is not a catering company.
 *
 * The bug this fixes, found while applying alias round 9: @victoriainthepark's bio reads
 * "All-inclusive venue (catering, bar) for any event!" -- NON_VENUE_BIO_RE matched the bare word
 * "catering" and pushed the pair vicloriainthepark -> victoriainthepark into "Related, not the
 * same venue / never propose", even though the canonical holds 15 weddings and calls itself a
 * "Wedding & Event Venue near Chicago, Illinois". Every all-inclusive venue that mentions catering
 * was unaliasable. The pair had to be overridden by hand.
 *
 * The rule the exclusion actually wants is "this account IS a caterer / planner / management
 * company", not "this text contains the word catering". A bio that self-identifies as a venue
 * settles that question, so it wins over the keyword. */
const VENUE_SELF_DESCRIPTION_RE =
  /\b(venue|event space|event centre|event center|banquet hall|ballroom|our space|host your|book your (?:wedding|event)|weddings? (?:and|&) events?)\b/i;

/** D062: a handle that names its own non-venue trade. The username variant of isNonVenueBio,
 * needed because S3b reaches outside the venue-ish universe and therefore meets accounts with no
 * bio, no vendors.category and no venue credit -- nothing for the existing exclusions to read.
 *
 * The first widened S3b run surfaced this class: @hannahschweissphotography shares thestudiochi.com
 * with @thestudiochicago, @chicagoweddingphotography shares thelytlehouse.com with @thelytlehouse,
 * @brittanieahrens shares hmrdesigns.com with @hmrdesigns. A vendor hosting its site on a venue's
 * domain (or a venue's in-house photographer) is a real relationship but NOT the same business, so
 * these belong in the listing tier, not the verify tier. Same substring reasoning as
 * CHURCH_SUBSTRING_RE -- handles are concatenated words with no boundaries to anchor on. */
const NON_VENUE_USERNAME_RE =
  /photograph|photog|films?|cinema|videograph|floral|florist|planner|planning|makeup|beauty|hairby|djs?by|catering|caterer/i;

export function isNonVenueUsername(username: string | null | undefined): boolean {
  return !!username && NON_VENUE_USERNAME_RE.test(username);
}

/** D062: a handle that names an UMBRELLA rather than a single bookable venue -- a hotel chain, a
 * club group, a university's conference office, a multi-venue operator.
 *
 * This is the third false-positive class S3b surfaced, and the subtlest, because the shared domain
 * is completely genuine. Measured cases:
 *   @luc_conferences ~ @loyola_cuneomansion   both on luc.edu -- but Loyola Conference Services
 *     books three campuses and Cuneo Mansion is one property, 40 miles north in Vernon Hills.
 *   @venuelogic ~ @amazingspacechicago        management company and a venue it operates.
 *   @victoriavenues ~ @victoriainthepark      operator and property.
 * Jeremy's Places social links carry the same shape from the other direction: JW Marriott Chicago
 * mapped to @marriottbonvoy, Four Seasons Hotel Chicago to @fourseasons.
 *
 * A couple books the property, not the umbrella, so these must never merge -- merging would hide
 * the venue behind its operator. Plural nouns are the tell: "hotels", "venues", "clubs". */
const UMBRELLA_BRAND_RE =
  /(hotels|resorts|clubs|venues|properties|collection|hospitality|\bgroup\b|conferences?|bonvoy|management|portfolio|destinations)/i;

export function isUmbrellaBrandUsername(username: string | null | undefined): boolean {
  return !!username && UMBRELLA_BRAND_RE.test(username);
}

export function isNonVenueBio(text: string | null | undefined): boolean {
  if (!text) return false;
  if (!NON_VENUE_BIO_RE.test(text)) return false;
  // Self-identifies as a venue -> the catering/planning word is describing an amenity it offers,
  // not the business it is.
  return !VENUE_SELF_DESCRIPTION_RE.test(text);
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

export type SignalCode = "S1" | "S1b" | "S2" | "S3" | "S3b" | "S4" | "S5" | "S6" | "S7";
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
  /** D062: S6 is corroborated by a shared stem or a shared non-aggregator host. Edit distance
   * alone on 8-10 char handles is not evidence -- see decideTier's comment. */
  s6Corroborated?: boolean;
  /** D062: S3b (same non-aggregator registrable host) fired. */
  s3bFired?: boolean;
  /** highest distinct-post count across S7 reader-disagreement evidence for this pair (0 if S7
   * didn't fire). */
  s7MaxPostCount: number;
}

/** T1 auto-safe = S1b, or S2 where both are venue-category, or S4 alias_like phrase, or S3b
 * (shared non-aggregator host) backed by any second signal.
 * T2 verify = any pair with >=2 distinct signals, or S3b alone, or S5 with >=5 posts, or a
 * CORROBORATED S6, or S7 with >=3 posts. T3 = everything else that fired at least one signal.
 *
 * D062 (2026-09-20), two changes:
 *
 * - S3b enters at T2 on its own. Two accounts publishing the same non-aggregator host is strong,
 *   venue-specific evidence (salvageone.com -> salvageone + salvageoneevents; venutis.com ->
 *   venutis.banquets + venutisrestaurant). It reaches T1 only with corroboration, because a
 *   domain can also be shared by a management company and the venues it operates -- the
 *   venuelogicchicago.com case, already on DENY_LIST_USERNAMES.
 *
 * - S6 no longer reaches T2 unaided. Bare Levenshtein <= 2 on 8-10 character handles is not
 *   evidence: the 2026-09-20 run paired @ihchicago against @fschicago, @lhchicago, @wachicago,
 *   @uchicago and @iahcchicago -- five genuinely different Chicago hotels -- and every one of
 *   them landed in T2 for a human to read. Requiring a shared stem or shared host keeps the real
 *   typo captures (rockwellontherive -> rockwellontheriver, catignypark -> cantignypark) and
 *   drops the alphabet soup to T3. */
export function decideTier(input: TierInput): Tier {
  const distinctSignalCount = new Set(input.signalCodes).size;
  if (
    input.s1bFired ||
    input.s2BothVenueCategory ||
    input.s4AliasLikeFired ||
    (input.s3bFired === true && distinctSignalCount >= 2)
  ) {
    return "T1";
  }
  if (
    distinctSignalCount >= 2 ||
    input.s3bFired === true ||
    input.s5MaxPostCount >= 5 ||
    (input.s6Fired && input.s6Corroborated === true) ||
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
