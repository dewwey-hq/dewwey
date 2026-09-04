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

export const STACK_PARSER_VERSION = "stack-parser-ts-v3";

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
  ["photobooth", ["photo booth", "photobooth"]],
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
  ["beauty_other", ["hmu", "beauty", "mua"]],
  // "flow" (bare "Flowers", missing the existing "flor"/"bloom" keywords by
  // one letter) — 9 eval mismatches.
  ["florist", ["flor", "bloom", "flow"]],
  ["dj", ["dj", "entertainment"]],
  ["musician", ["music", "sax", "strings"]],
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
  ["jeweler", ["ring", "jewel"]],
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

export function normRole(roleRaw: string): string {
  const r = roleRaw.toLowerCase();
  if (EVENT_PHASE_VENUE_LABELS.has(r.trim())) return "venue";
  for (const [role, keys] of ROLE_MAP) {
    if (keys.some((k) => r.includes(k))) return role;
  }
  return "other";
}

export interface StackEntry {
  role_raw: string;
  role: string;
  handle: string;
  line_no: number;
}

export interface ParsedStack {
  stack: StackEntry[];
  has_stack: boolean; // >=3 DISTINCT normalized roles, matching pipeline.py exactly
}

export function parseCaption(caption: string | null): ParsedStack {
  const stack: StackEntry[] = [];
  const lines = (caption ?? "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const m = LINE.exec(line) ?? NOCOLON_LINE.exec(line);
    if (!m) continue;
    const roleRaw = m[1].trim();
    const rest = m[2];
    for (const hm of rest.matchAll(HANDLE)) {
      stack.push({ role_raw: roleRaw, role: normRole(roleRaw), handle: hm[1].toLowerCase(), line_no: i });
    }
  }
  const distinctRoles = new Set(stack.map((s) => s.role));
  return { stack, has_stack: distinctRoles.size >= 3 };
}
