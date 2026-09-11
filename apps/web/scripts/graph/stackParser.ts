/**
 * Faithful TypeScript port of Ben's stack parser (`pipeline/pipeline.py`'s
 * `LINE`/`HANDLE`/`ROLE_MAP`/`norm`/`parse_caption`) — ported, not
 * reinvented, because the sandbox has no Python/psycopg2 (see the
 * [[sandbox-no-python-packages]] memory) and this task needs to run it
 * against Jeremy's corpus, which only exists in this Supabase DB.
 *
 * This is a READ-ONLY extraction function — caption text in, structured
 * stack entries out. It does not write to accounts/post_mentions/weddings/
 * wedding_vendors. Whether/how extracted entries become graph rows is a
 * separate, later decision (per the graph-strengthening task's phased loop —
 * baseline first, no production writes yet).
 *
 * Deliberately NOT reused from prefilter.ts's CREDIT_LINE/WEDDING_ROLE_WORD:
 * that pair is a stricter, different-purpose tool (a boolean "does this post
 * have ANY wedding-role credit line" gate for the deterministic classifier
 * tier — a label must match a wedding-role word or it's ignored entirely).
 * Ben's actual parser is more permissive: every "Label: @handle" line is
 * extracted regardless of what the label says, and an unrecognized label
 * normalizes to the 'other' role rather than being dropped. Those are
 * different semantics for different jobs — this file matches pipeline.py's
 * actual behavior, not prefilter.ts's.
 */
import { classifyLabel, type EventContext, type ParticipantRole } from "./vendorRoleRules";

// v4 (D047 follow-on, 2026-09-06): "Venue Partners:"/"Preferred Venues:"/"Featured Venues:"
// boilerplate lines no longer classify as role=venue -- see normRole()'s VENUE_LIST_MARKER
// comment for the exact contamination this fixes.
// v5 (D049 follow-on, 2026-09-07): "Getting Ready Venue:"/"Rehearsal Dinner Venue:"/"Sangeet
// Venue:" and similar secondary-event-location labels no longer classify as role=venue -- see
// normRole()'s SECONDARY_EVENT_VENUE_MARKER comment for the confirmed wrong-venue-anchor bug
// this fixes.
// v6 (D050 double-venue-tag audit, 2026-09-07): tried classifying "Venue + Hotel:"/"Hotel +
// Venue:" combined labels as role=hotel instead of venue -- REVERTED in v7, see normRole()'s
// comment for why (every real-world instance is the sole venue signal on a genuinely real
// wedding; demoting would have stripped it). v7 is behaviorally identical to v5.
// v8 (D055, 2026-09-08): two additive venue-credit patterns the "Label: @handle"-shaped
// credit-line regexes (LINE/NOCOLON_LINE) structurally can't see, because they're not a labeled
// line at all -- they're a venue named in caption PROSE ("...tied the knot at @thedalcy!") or via
// a branded hashtag ("#thedalcywedding"). WHY now: a SQL approximation of both shapes, run before
// touching this file, found 637 wedding-keyword posts corpus-wide with the untouched "at @handle"
// shape and 247 with a known-venue hashtag -- both currently produce ZERO venue credit under v7.
// Each new pattern is stamped with its own `source` (`inline_at`/`venue_hashtag`, vs. the existing
// lines' `credit_line`) so precision can be measured PER PATTERN against real posts before
// runJeremyWeddingClustering.ts (or anything downstream) is trusted to treat them the same as a
// labeled credit line -- same "measure before you trust a new signal" discipline as every other
// addition to this file. See the INLINE_AT / buildVenueHashtagRegex comments below for the two
// patterns and their shared duplicate/non-venue-line guards.
// v9 (D055, 2026-09-08): fixes a structural bug in LINE itself, found by hand (user-caught, not
// mined) in the caption line "Venue: @thegraychi - Photo: @_teresawilliams - Planner:
// @fivegrainevents" -- ONE line, three separate credits. LINE matches the line's LEADING label
// ("Venue") and then its greedy `(.*@.*)$` rest-of-line capture swallows every `@handle` for the
// REST of the line, so the photographer and planner handles were both misattributed to
// role='venue' too -- and on the reverse case (a non-venue label leading), the real venue handle
// got misattributed to whatever label came first. Sized before this fix: 292 posts (343 lines)
// corpus-wide have 2+ "Label: @handle" credits on one physical line, separated by " - "/" | "/
// " • "/" · "/" // "/" / "/";" or similar; 21 of those lines start with a venue label; 6 structural
// candidates got a wrong venue anchor from this; all 292 posts' non-venue roles were also wrong.
// Fix: split a multi-credit line into per-credit SEGMENTS before LINE/NOCOLON_LINE ever see it --
// see splitCreditSegments() below. A line with only one "Label: @handle" credit is completely
// unaffected (same LINE/NOCOLON_LINE match as v1-v8).
export const STACK_PARSER_VERSION = "stack-parser-ts-v9";

// Identical to pipeline.py's LINE/HANDLE regexes (character-for-character).
const LINE = /^\s*[•\-*]?\s*([A-Za-z][A-Za-z &+/'’]{1,35}?)\s*[:|\-–—/]+\s*(.*@.*)$/;
const HANDLE = /@([A-Za-z0-9._]{2,30})/g;

// v3 (2026-09-04): fallback for the no-colon "Role @handle" format — the
// single biggest recall gap, confirmed independently by all 4 eval
// labelers (real examples pulled and read before writing this, not
// guessed — e.g. "Venue @chicagoilluminatingcompany", "Planner
// @ohanaeventsinc @jenna_rainey", "Menu Cards@ericksondesignchicago" with
// zero space). Only tried when LINE (the proven, colon/pipe/dash-separator
// pattern) doesn't match — purely additive, doesn't change any existing
// colon-based behavior. Deliberately stricter than LINE where LINE relies
// on the colon itself for structural signal: requires an uppercase first
// letter (every real example is Title Case; LINE allows either case
// because the colon already disambiguates it from prose) and requires the
// ENTIRE remainder of the line to be just handle(s) — no interspersed
// prose words — where LINE's `(.*@.*)$` is deliberately looser. This is a
// real, evaluated precision/recall trade: a stray "Follow us @handle"-
// shaped line could false-trigger; the golden-set re-run after this change
// is what decided keep/revert, not this comment.
const NOCOLON_LINE = /^\s*[•\-*]?\s*([A-Z][A-Za-z &+/'’]{0,34})\s*((?:@[A-Za-z0-9._]{2,30}[\s/,&]*)+)$/;

// v2 (2026-09-03): a bundle of additive ROLE_MAP fixes, chosen from the
// 134-post vendor_extraction_golden_set eval (role accuracy was 80.7% on
// v1) — each addition below is cited by its measured mismatch count there,
// not guessed. Deliberately NOT included this round (see
// docs/engineering/post-classification/candidate-generation-analysis.md's
// sibling doc for the graph-strengthening writeup): the `hair` keyword's
// over-broad match (caught "Chairs" twice in eval — needs its own fix, not
// a quick add), `Bridesmaids`/`groom` -> attire (genuinely ambiguous — no.
// 4/16 of the "other->attire" bucket, sometimes a real attire-vendor credit
// like "Bridesmaids: @bhldn", sometimes a wedding-party non-vendor label),
// and the combined-line structural bugs (Photo/Video, Venue/Catering,
// pipe-delimited multi-credit lines) — those change the LINE-matching logic
// itself, not just ROLE_MAP, and belong in their own iteration.
const ROLE_MAP: Array<[string, string[]]> = [
  ["photo_booth", ["photo booth", "photobooth"]],
  // "band"/"content_creator" are real vendor_role enum values v1 never
  // targeted at all (verified: 0 posts mapped to either across the whole
  // corpus) — 35 + 3 (dj->band) + 10 (videographer->content_creator)
  // measured mismatches in the eval set. Placed before their old
  // substring-collision homes (musician's "band", videographer's
  // "content") so they win first-match. Does NOT fix the separate
  // "Wedding Bands" (= rings, a jeweler credit) collision found in eval —
  // that's a harder, lower-count, genuinely ambiguous case deferred to a
  // later iteration.
  ["band", ["band"]],
  ["content_creator", ["content creator"]],
  // 27/31 of the "other->venue" mismatches were Reception/Ceremony/Church/
  // Parish credits — genuinely venue credits (the ceremony/reception
  // location), just phrased by event-phase instead of the word "venue".
  // NOT added as plain substrings here (unlike every other ROLE_MAP entry)
  // — first attempt did that and the eval regression-test caught 3 new
  // wrong classifications: "Ceremony Musicians", "Reception Dress", "Korean
  // Tea Ceremony" all false-triggered venue, because ceremony/reception are
  // common MODIFIERS on other roles, not just venue labels on their own.
  // EVENT_PHASE_VENUE_WORDS below requires the label to be (close to) just
  // that word, not a compound label — see isEventPhaseVenueLabel.
  ["venue", ["venue"]],
  ["hotel", ["hotel"]],
  // "coordinat" (Coordinator/Coordination) was 17 "other"-bucket
  // mismatches, the single largest safe planner fix in eval.
  ["planner", ["plann", "coordinat"]],
  ["photographer", ["photo"]],
  ["videographer", ["video", "film", "content"]],
  ["hair", ["hair"]],
  ["makeup", ["makeup"]],
  // "mua" (Makeup Artist(s), a common industry abbreviation) seen in eval.
  ["beauty_services", ["hmu", "beauty", "mua"]],
  // "flow" (bare "Flowers", missing the existing "flor"/"bloom" keywords by
  // one letter) — 9 eval mismatches.
  ["florist", ["flor", "bloom", "flow"]],
  ["dj", ["dj", "entertainment"]],
  ["live_music", ["music", "sax", "strings"]],
  // shoe/outfit/menswear/alteration: attire-adjacent labels seen in eval
  // that aren't the ambiguous Bridesmaids/groom cases (see note above).
  ["attire", ["dress", "gown", "suit", "tux", "attire", "bridal", "shoe", "outfit", "menswear", "alteration"]],
  // "stationary" is a common misspelling of "stationery" seen twice in eval
  // (95 + 46 raw-label occurrences corpus-wide, per the baseline).
  ["stationery", ["stationery", "stationary", "invitation", "paper"]],
  // "bakery" seen in eval, mapping to the same cake role.
  ["cake", ["cake", "dessert", "bakery"]],
  ["catering", ["cater", "dinner", "drinks", "food"]],
  ["rentals", ["rental", "linen", "decor"]],
  ["transportation", ["transport", "limo"]],
  ["officiant", ["officiant"]],
  ["jewelry", ["ring", "jewel"]],
];

// Whitelist, not a substring/fuzzy check on purpose — see the comment on
// the `venue` ROLE_MAP entry above for why. Only fires when the label is
// (close to) just the event phase itself, not a compound label naming a
// different role that happens to occur at that phase.
const EVENT_PHASE_VENUE_LABELS = new Set([
  "reception",
  "ceremony",
  "church",
  "parish",
  "reception venue",
  "ceremony venue",
  "reception location",
  "ceremony location",
  "ceremony & reception",
  "reception & ceremony",
  "ceremony and reception",
]);

// D047 follow-on (2026-09-06): found live, by hand-reading a suspicious 4-way "double-venue-tag"
// cluster during the ambiguity-backlog cleanup -- a planner's boilerplate signature block reads
// "Venue: @artinstitutechi" (the real, singular location claim) followed by "Venue Partners:
// @thedrakechicago @artinstitutespecialevents @revelspace" (a cross-promo list of OTHER venues
// the planner works with, pasted into every post regardless of where that wedding actually was).
// The plain substring match on "venue" classified BOTH lines as role='venue', silently
// contaminating the double-venue-tag-ambiguity backlog with false ambiguity for every post using
// this common marketing pattern. A genuine single-venue credit is never phrased as a list
// ("Partners", "Preferred", "Featured") -- those words specifically signal "other venues we
// cross-promote," not "this wedding's location."
const VENUE_LIST_MARKER = /\b(partner|preferred|featured)/;

// D049 follow-on (2026-09-07): found live during a coverage-gap investigation -- a caption
// crediting BOTH the real venue ("Venue: @thedalcy") and a secondary, adjacent-event location
// ("Getting Ready Venue: @nobuchicago") got both lines classified role='venue', and
// runJeremyWeddingClustering.ts's venue-anchor resolution has no tiebreak beyond "whichever
// comes first" -- confirmed live, this produced 5 real weddings anchored to the getting-ready
// location instead of the actual venue. These labels always name a DIFFERENT place from where
// the wedding itself happened (prep, rehearsal, a pre-wedding cultural event), never the venue
// itself -- same "whitelist, not substring, because a real venue credit is never phrased this
// way" reasoning as VENUE_LIST_MARKER above. Sized live: 36 posts corpus-wide, every one of
// which also carries a separate, legitimate venue credit -- this reclassification is lossless.
const SECONDARY_EVENT_VENUE_MARKER = /(getting ready|rehearsal dinner|sangeet|welcome party|mehndi|haldi|bridal shower)/;

// Tried and REVERTED (2026-09-07, double-venue-tag audit): the working theory was that
// ROLE_MAP's `venue` entry being checked before `hotel` meant a combined "Venue + Hotel"/"Hotel +
// Venue" label should demote to the more specific `hotel` role. Shipped as v6, then checked
// against every real-world instance before trusting it: all 5 corpus-wide posts using this exact
// combined label have ZERO other venue-shaped credit on the same post -- every one is the SOLE
// venue signal for a genuinely real, well-documented wedding (Whitney & Corey, Alex & John, Allie
// + Vig, ...). Demoting it to `hotel` would have stripped the only venue evidence from future
// posts shaped exactly like these, the opposite of the intended fix. Reverted in v7 -- a combined
// "Venue + Hotel" label goes back to classifying as `venue`, same as a bare "Venue" label. The
// underlying concern (a hotel credited as venue when it was really just accommodation) is real
// and still open -- it needs per-post context (is there a SEPARATE, more specific venue credit
// elsewhere on the post) that a single-line classifier like normRole() can't see, not a
// role_raw-text heuristic. Left as a hand-verification question for the audit itself, not a
// parser fix.

export function normRole(roleRaw: string): string {
  const r = roleRaw.toLowerCase();
  if (EVENT_PHASE_VENUE_LABELS.has(r.trim())) return "venue";
  if (r.includes("venue") && VENUE_LIST_MARKER.test(r)) return "other";
  if (r.includes("venue") && SECONDARY_EVENT_VENUE_MARKER.test(r)) return "other";
  for (const [role, keys] of ROLE_MAP) {
    if (keys.some((k) => r.includes(k))) return role;
  }
  return "other";
}

// v8 (D055): where a stack entry came from -- 'credit_line' is the original, LINE/NOCOLON_LINE-
// matched "Label: @handle" behavior (v1-v7, unchanged); 'inline_at'/'venue_hashtag' are the two
// new patterns below. Kept as a real field (not inferred later from role_raw) so a downstream
// precision measurement can group by it without re-parsing role_raw text.
export type StackEntrySource = "credit_line" | "inline_at" | "venue_hashtag";

export interface StackEntry {
  role_raw: string;
  role: string;
  handle: string;
  line_no: number;
  source: StackEntrySource;
}

export interface ParsedStack {
  stack: StackEntry[];
  has_stack: boolean; // >=3 DISTINCT normalized roles, matching pipeline.py exactly
}

// v8 (D055): "at @handle" / "at the @handle" / "@ @handle" -- a venue named in caption PROSE, not
// a structured credit line. Matched against the WHOLE caption (not per-line, unlike LINE/
// NOCOLON_LINE above) because this shape is embedded mid-sentence, never its own line. See the
// STACK_PARSER_VERSION v8 comment above for the measured sizing (637 posts).
const INLINE_AT = /\b(?:at|@)\s+(?:the\s+)?@([A-Za-z0-9._]{2,30})\b/gi;
// Containing-line context that means the "at @handle" is NOT the wedding venue (see the guard in
// parseCaption). Secondary wedding events + hospitality/stay language + non-wedding gatherings.
const INLINE_AT_SECONDARY_CONTEXT =
  /\b(getting ready|got ready|rehearsal|after[- ]?party|welcome party|brunch|bachelor(ette)?|first look|stay(ed|ing)?|night stay|hotel room|suite|room block|happy hour|drinks at|dinner at|lunch at|sangeet|mehndi|haldi|bridal shower|baby shower)\b/i;

// v8 (D055): "#<venuehandle>wedding"/"...weddings"/"...bride"/"...brides"/"...couple"/
// "...couples"/"...event(s)" -- a venue named only via its own branded hashtag. Unlike INLINE_AT,
// there's no structural way to tell a venue hashtag from any other hashtag ("#chicagowedding" is
// not a venue), so this pattern REQUIRES a caller-supplied lookup list of known venue usernames
// (parseCaption's `opts.venueHandles`, lowercased) and does nothing without one. The regex itself
// is built from that set (one alternation, longest-first so a short handle that's a prefix of a
// longer one can't shadow it, each username escaped) and cached per-Set via the WeakMap below so
// the runner's one-time `venueHandles` build (see runStackParserBaseline.ts) only compiles the
// regex once, not once per caption. See the STACK_PARSER_VERSION v8 comment above for the
// measured sizing (247 posts).
const venueHashtagRegexCache = new WeakMap<Set<string>, RegExp>();
function buildVenueHashtagRegex(venueHandles: Set<string>): RegExp {
  const cached = venueHashtagRegexCache.get(venueHandles);
  if (cached) return cached;
  const handles = Array.from(venueHandles)
    .filter((h) => h.length > 0)
    .sort((a, b) => b.length - a.length)
    .map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re =
    handles.length === 0
      ? /(?!)/g // never matches -- empty venue-handle set
      : new RegExp(`#(${handles.join("|")})(?:wedding|weddings|bride|brides|couple|couples|events?)`, "gi");
  venueHashtagRegexCache.set(venueHandles, re);
  return re;
}

// v9 (D055): detects "<label>: @" / "<label>| @" occurring 2+ times on one physical line -- the
// structural signal that the line is actually multiple credits jammed together, not one label
// with a multi-handle list (e.g. "Venue: @x @y" has exactly ONE such occurrence -- it must NOT
// split, see the test for it). Same label character class as LINE's capture group
// ([A-Za-z &+/'’]) so this agrees with what LINE itself would call a "label".
const LABEL_AT_COUNT = /[A-Za-z][A-Za-z &+/'’]{0,35}?\s*[:|]\s*@/g;

// v9 (D055): the delimiter itself, but ONLY when what follows it is another "label: @handle" --
// enforced with a lookahead so a bare dash/slash/pipe inside a handle list or inside prose never
// splits ("never split inside a handle list like `@a @b`"). `\s*` after the delimiter (consumed,
// not part of the lookahead) absorbs any whitespace before the next label -- the space-padded
// delimiters (" - ", " | ", ...) already include it, and the bare ";" delimiter (spec'd without
// surrounding spaces, since it appears both padded and unpadded in the corpus) needs it. Longest
// alternatives first (" // " before " / ") so the shorter one can never shadow the longer one.
const SEGMENT_SEPARATOR =
  /(?: - | – | — | \| | • | · | \/\/ | \/ |;)\s*(?=[A-Za-z][A-Za-z &+/'’]{0,35}?\s*[:|]\s*@)/g;

// v9 (D055): split ONE caption line into its per-credit segments when (and only when) it's
// structurally carrying 2+ "Label: @handle" credits -- see the STACK_PARSER_VERSION v9 comment
// above for the bug this fixes and its sizing. A line with a single label (including a single
// label crediting multiple handles, e.g. "Venue: @x @y") is returned unchanged as a 1-element
// array -- LINE/NOCOLON_LINE then see exactly what they always saw pre-v9.
function splitCreditSegments(line: string): string[] {
  const count = (line.match(LABEL_AT_COUNT) ?? []).length;
  if (count < 2) return [line];
  return line
    .split(SEGMENT_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseCaption(caption: string | null, opts?: { venueHandles?: Set<string> }): ParsedStack {
  const text = caption ?? "";
  const stack: StackEntry[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const segments = splitCreditSegments(line);
    for (const segment of segments) {
      const m = LINE.exec(segment) ?? NOCOLON_LINE.exec(segment);
      if (!m) continue;
      const roleRaw = m[1].trim();
      const rest = m[2];
      for (const hm of rest.matchAll(HANDLE)) {
        stack.push({ role_raw: roleRaw, role: normRole(roleRaw), handle: hm[1].toLowerCase(), line_no: i, source: "credit_line" });
      }
    }
  }

  // v8 (D055): the two additive patterns below never override a labeled credit -- a "Label:
  // @handle" line always wins, on ANY role, not just venue (e.g. a "Photographer: @studio" line
  // means @studio should not also show up as an inline/hashtag venue guess).
  const creditedHandles = new Set(stack.map((s) => s.handle));
  const lineNoAt = (idx: number): number => (text.slice(0, idx).match(/\n/g) ?? []).length;
  // True when the match's containing line is itself a LINE-shaped credit line for a DIFFERENT,
  // non-venue role (e.g. "Photo at @studio") -- rare (NOCOLON_LINE usually catches these first,
  // which the creditedHandles check above already handles), but guards the case where the
  // containing line has its own colon-shaped label that disagrees with "venue".
  const lineHasNonVenueLabel = (lineIdx: number): boolean => {
    const lm = LINE.exec((lines[lineIdx] ?? "").trim());
    return lm ? normRole(lm[1].trim()) !== "venue" : false;
  };

  for (const hm of text.matchAll(INLINE_AT)) {
    const handle = hm[1].toLowerCase();
    if (creditedHandles.has(handle)) continue;
    const lineIdx = lineNoAt(hm.index ?? 0);
    if (lineHasNonVenueLabel(lineIdx)) continue;
    // Sized before the first real v8 run (D055): 268 of 1,844 inline "at @handle" lines (15%) sit
    // in a secondary-event or hospitality context -- "getting ready at @hotel", "afterparty at
    // @bar", "2-Night Stay at @hotel", "the Royal Suite at @..." -- which is exactly the
    // wrong-venue-anchor trap SECONDARY_EVENT_VENUE_MARKER guards for labeled lines (D051).
    // Prose has no label to inspect, so the guard here is the containing line's own words:
    // demote to 'other' (kept, source-tagged, so precision can still be measured), never 'venue'.
    const lineText = lines[lineIdx] ?? "";
    const secondaryContext = INLINE_AT_SECONDARY_CONTEXT.test(lineText);
    stack.push({
      role_raw: secondaryContext ? "at @ (secondary/stay)" : "at @",
      role: secondaryContext ? "other" : "venue",
      handle,
      line_no: lineIdx,
      source: "inline_at",
    });
  }

  if (opts?.venueHandles && opts.venueHandles.size > 0) {
    const venueHashtag = buildVenueHashtagRegex(opts.venueHandles);
    for (const hm of text.matchAll(venueHashtag)) {
      const handle = hm[1].toLowerCase();
      if (creditedHandles.has(handle)) continue;
      const lineIdx = lineNoAt(hm.index ?? 0);
      if (lineHasNonVenueLabel(lineIdx)) continue;
      stack.push({ role_raw: "#hashtag", role: "venue", handle, line_no: lineIdx, source: "venue_hashtag" });
    }
  }

  const distinctRoles = new Set(stack.map((s) => s.role));
  return { stack, has_stack: distinctRoles.size >= 3 };
}

// ---------------------------------------------------------------------------
// v10 (D056 stage 1, 2026-09-10): parseCaptionV2 -- richer nomenclature on
// top of the SAME line-detection/segment-splitting machinery as v9 above
// (LINE, NOCOLON_LINE, splitCreditSegments, INLINE_AT, buildVenueHashtagRegex,
// SECONDARY_EVENT_VENUE_MARKER). v9's normRole() (a flat 23-value substring
// map) is NOT reused here -- classifyLabel() (scripts/graph/vendorRoleRules.ts,
// D056 stage 0) is, unmodified, for every "Label: @handle" credit. v9 itself
// is untouched: this is a parallel, additive export, a new parser_version
// (STACK_PARSER_V2_VERSION), writing to NEW tables
// (stack_extraction_entries_v2/stack_extraction_runs_v2), never
// stack_extraction_entries/_runs. See docs/decisions.md D056 "Next" and the
// D056 plan file's "Stage 1 parser v10" note for what's bundled here: emoji-
// keyed credit lines (backlog #1) and the non-wedding-event-title rule
// (backlog #2), both sized/approved before this file existed.
export const STACK_PARSER_V2_VERSION = "stack-parser-ts-v10";

export type CreditV2Source = "credit_line" | "inline_at" | "venue_hashtag" | "emoji_line";

export interface CreditV2 {
  label_raw: string;
  handle: string;
  role: string; // a VENDOR_ROLES slug (vendorRoleRules.ts) -- 'other'/'noise'/'press_feature' included
  event_context: EventContext;
  line_no: number;
  source: CreditV2Source;
  rule_id: string;
}

export interface ParticipantV2 {
  label_raw: string;
  handle: string;
  participant: ParticipantRole;
  line_no: number;
  source: CreditV2Source;
}

export interface ParsedStackV2 {
  credits: CreditV2[];
  participants: ParticipantV2[];
  nonWeddingEventTitle: string | null;
  hasStack: boolean;
}

// Backlog #1 (D056 Next): a credit line keyed by a leading emoji instead of a text label --
// "💐 @villageflowershopplainfield" -- never matched by LINE/NOCOLON_LINE (both require an
// A-Za-z label). Tried only as a fallback, after LINE/NOCOLON_LINE both fail on a segment. The
// leading-emoji capture group allows a modifier sequence (skin tone, ZWJ + variation selector,
// e.g. "💇🏻‍♀️") up to 7 extra code points so a single compound emoji doesn't get truncated:
// verified live against the LaPapa post (DBsBZcev0Bh) fixture below, whose "👰🏻‍♀️"/"💇🏻‍♀️" lines
// would otherwise fail to match at all. Requires the ENTIRE rest of the line to be @handle(s) --
// same "no interspersed prose" discipline as NOCOLON_LINE -- so it never false-triggers on a
// caption sentence that merely contains an emoji.
const EMOJI_LINE =
  /^\s*(\p{Extended_Pictographic}[\p{Extended_Pictographic}‍️\p{Emoji_Modifier}]{0,7})\s*[:|\-–—]?\s*((?:@[A-Za-z0-9._]{2,30}[\s/,&]*)+)$/u;

// Backlog #1: first-match-wins groups, in the order the user specified. 🏨 is carved out of the
// general venue glyph set into its own, earlier-tested group so "🏨 @somehotel" resolves to
// accommodations, not venue -- mirrors the labeled-line "Hotel:" -> accommodations rule.
// null = role 'other' (🥂🎉✨🥳 -- toast/celebration glyphs, not a vendor category) and is also
// the fallback for any leading emoji this table doesn't recognize at all.
const EMOJI_ROLE_GROUPS: Array<{ chars: string[]; role: string | null }> = [
  { chars: ["📸", "📷"], role: "photographer" },
  { chars: ["🎥", "📽", "🎞️", "🎬"], role: "videographer" },
  { chars: ["💐", "🌸", "🌷", "🌹"], role: "florist" },
  { chars: ["💄"], role: "makeup" },
  { chars: ["💇"], role: "hair" },
  { chars: ["📋", "🗓️", "📝", "📅"], role: "planner" },
  { chars: ["🎧", "💽"], role: "dj" },
  { chars: ["🎻", "🎷", "🎺", "🎸", "🎹"], role: "live_music" },
  { chars: ["🎤", "🎶", "🎵"], role: "band" },
  { chars: ["🍽️", "🍴", "🥗", "🍸", "🍹"], role: "catering" },
  { chars: ["🍰", "🎂", "🧁"], role: "cake" },
  { chars: ["👗", "👰", "🤵", "👔"], role: "attire" },
  { chars: ["💍"], role: "jewelry" },
  { chars: ["💌", "✉️"], role: "stationery" },
  { chars: ["🪑", "🎀", "🧺"], role: "rentals" },
  { chars: ["💡"], role: "lighting_production" },
  { chars: ["🚌", "🚎", "🚐", "🚗"], role: "transportation" },
  { chars: ["🏨"], role: "accommodations" },
  { chars: ["💒", "⛪", "🏡", "🏛️", "🏰", "📍"], role: "venue" },
  { chars: ["🥂", "🎉", "✨", "🥳"], role: null },
];

function classifyEmojiRun(run: string): string | null {
  for (const group of EMOJI_ROLE_GROUPS) {
    if (group.chars.some((c) => run.includes(c))) return group.role;
  }
  return null;
}

// Backlog #2 (D056 Next): a non-wedding event (baby/bridal shower, birthday, quinceañera, ...)
// posted by a wedding-adjacent vendor, using the SAME "Label: @handle" stack shape -- the credits
// are real, but the post itself isn't a wedding and shouldn't seed/confirm one downstream. Flagged
// (not dropped) so a later stage decides; gated on a wedding-recap signal so a caption that
// mentions "baby shower" in passing on an otherwise-clearly-a-wedding post isn't misflagged.
const NON_WEDDING_EVENT_TITLE_RX =
  /(baby|bridal|wedding) shower|birthday|quincea|sweet 16|corporate|gala|retirement|anniversary party|bar mitzvah|bat mitzvah|graduation|prom|networking|holiday party/i;
const WEDDING_RECAP_SIGNAL_RX =
  /wedding day|newlyweds|mr\.? (&|and) mrs|just married|tied the knot|said i do|our wedding|their wedding/i;

function findNonWeddingEventTitle(text: string, lines: string[]): string | null {
  if (WEDDING_RECAP_SIGNAL_RX.test(text)) return null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.length > 60 || line.includes("@")) continue;
    if (NON_WEDDING_EVENT_TITLE_RX.test(line)) return line;
  }
  return null;
}

/** classifyLabel() applied once per label, fanned out to one row per (role, handle) pair --
 * a compound label ("Hair & Makeup") yields one credit row per role for EACH handle on the line,
 * a participant label yields a participant row per handle instead (roles is always [] there). */
function creditsFromLabelLine(
  labelRaw: string,
  rest: string,
  lineNo: number,
  source: CreditV2Source
): { credits: CreditV2[]; participants: ParticipantV2[] } {
  const cls = classifyLabel(labelRaw);
  const credits: CreditV2[] = [];
  const participants: ParticipantV2[] = [];
  for (const hm of rest.matchAll(HANDLE)) {
    const handle = hm[1].toLowerCase();
    if (cls.participant) {
      participants.push({ label_raw: labelRaw, handle, participant: cls.participant, line_no: lineNo, source });
    } else {
      for (const role of cls.roles) {
        credits.push({ label_raw: labelRaw, handle, role, event_context: cls.eventContext, line_no: lineNo, source, rule_id: cls.ruleId });
      }
    }
  }
  return { credits, participants };
}

/** Same SECONDARY_EVENT_VENUE_MARKER phrases v9 uses to demote a labeled secondary-event venue
 * line to 'other' -- here they instead pick a specific EventContext, since v2 has a real place to
 * put it. Anything outside that named set but still inside v9's broader
 * INLINE_AT_SECONDARY_CONTEXT (afterparty, brunch, a hotel stay, ...) keeps v9's proven demotion
 * to role='other' rather than guessing a context v9 never validated for this pattern. */
function classifyInlineAtWindow(lineText: string): { role: string; eventContext: EventContext; labelRaw: string } {
  if (/\brehearsal( dinner)?\b/i.test(lineText)) return { role: "venue", eventContext: "rehearsal_dinner", labelRaw: "at @" };
  if (/\bwelcome party\b/i.test(lineText)) return { role: "venue", eventContext: "welcome_party", labelRaw: "at @" };
  if (/\b(sangeet|mehndi|mehendi|haldi)\b/i.test(lineText)) return { role: "venue", eventContext: "sangeet_mehndi", labelRaw: "at @" };
  if (/\b(getting ready|got ready)\b/i.test(lineText)) {
    return { role: /\bhotel\b/i.test(lineText) ? "accommodations" : "venue", eventContext: "getting_ready", labelRaw: "at @" };
  }
  if (/\b(bridal shower|baby shower)\b/i.test(lineText)) return { role: "venue", eventContext: "shower", labelRaw: "at @" };
  if (INLINE_AT_SECONDARY_CONTEXT.test(lineText)) return { role: "other", eventContext: "wedding_day", labelRaw: "at @ (secondary/stay)" };
  return { role: "venue", eventContext: "wedding_day", labelRaw: "at @" };
}

export function parseCaptionV2(caption: string | null, opts?: { venueHandles?: Set<string> }): ParsedStackV2 {
  const text = caption ?? "";
  const credits: CreditV2[] = [];
  const participants: ParticipantV2[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const segments = splitCreditSegments(line);
    for (const segment of segments) {
      const m = LINE.exec(segment) ?? NOCOLON_LINE.exec(segment);
      if (m) {
        const { credits: c, participants: p } = creditsFromLabelLine(m[1].trim(), m[2], i, "credit_line");
        credits.push(...c);
        participants.push(...p);
        continue;
      }
      const em = EMOJI_LINE.exec(segment);
      if (!em) continue;
      const emojiRun = em[1];
      const role = classifyEmojiRun(emojiRun) ?? "other";
      for (const hm of em[2].matchAll(HANDLE)) {
        credits.push({
          label_raw: emojiRun,
          handle: hm[1].toLowerCase(),
          role,
          event_context: "wedding_day",
          line_no: i,
          source: "emoji_line",
          rule_id: "emoji",
        });
      }
    }
  }

  // Same "a labeled/emoji credit always wins" discipline as v9's inline_at/venue_hashtag guards.
  const creditedHandles = new Set<string>([...credits.map((c) => c.handle), ...participants.map((p) => p.handle)]);
  const lineNoAt = (idx: number): number => (text.slice(0, idx).match(/\n/g) ?? []).length;
  const lineHasNonVenueLabel = (lineIdx: number): boolean => {
    const lm = LINE.exec((lines[lineIdx] ?? "").trim());
    if (!lm) return false;
    return !classifyLabel(lm[1].trim()).roles.includes("venue");
  };

  for (const hm of text.matchAll(INLINE_AT)) {
    const handle = hm[1].toLowerCase();
    if (creditedHandles.has(handle)) continue;
    const lineIdx = lineNoAt(hm.index ?? 0);
    if (lineHasNonVenueLabel(lineIdx)) continue;
    const { role, eventContext, labelRaw } = classifyInlineAtWindow(lines[lineIdx] ?? "");
    credits.push({ label_raw: labelRaw, handle, role, event_context: eventContext, line_no: lineIdx, source: "inline_at", rule_id: "inline_at" });
  }

  if (opts?.venueHandles && opts.venueHandles.size > 0) {
    const venueHashtag = buildVenueHashtagRegex(opts.venueHandles);
    for (const hm of text.matchAll(venueHashtag)) {
      const handle = hm[1].toLowerCase();
      if (creditedHandles.has(handle)) continue;
      const lineIdx = lineNoAt(hm.index ?? 0);
      if (lineHasNonVenueLabel(lineIdx)) continue;
      credits.push({
        label_raw: "#hashtag",
        handle,
        role: "venue",
        event_context: "wedding_day",
        line_no: lineIdx,
        source: "venue_hashtag",
        rule_id: "venue_hashtag",
      });
    }
  }

  return {
    credits,
    participants,
    nonWeddingEventTitle: findNonWeddingEventTitle(text, lines),
    hasStack: credits.length > 0 || participants.length > 0,
  };
}
